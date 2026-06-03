import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPvePredictionBlockers,
  hasPveServerOnlyFeedback,
} from '../../../src/shared/combat/pve-prediction-contract.js';

describe('PvE prediction contract', () => {
  it('treats party-skill terminal summaries as server-only feedback', () => {
    const transcript = {
      attacks: [{
        damage: 5,
        partySkillProcs: [{ skillId: 'arcStrike', type: 'chainHit', targetIndex: 1, damage: 3 }],
      }],
      allEnemiesDefeated: true,
      stateSummary: {
        enemies: [{ id: 'a', hp: 0 }, { id: 'b', hp: 0 }],
        allies: [{ id: 'hi', hp: 10 }],
      },
    };

    assert.equal(hasPveServerOnlyFeedback(transcript), true);
  });

  it('treats nested proc defeats as server-only feedback', () => {
    const transcript = {
      attacks: [{
        damage: 1,
        partySkillProcs: [{ skillId: 'afflictionBurst', targetDefeated: true }],
      }],
      stateSummary: {
        enemies: [{ id: 'a', hp: 4 }, { id: 'b', hp: 0 }],
        allies: [{ id: 'hi', hp: 10 }],
      },
    };

    assert.equal(hasPveServerOnlyFeedback(transcript), true);
  });
});

describe('PvE prediction blocker classification', () => {
  it('allows KO visual markers when safe visual KO prediction is enabled', () => {
    const transcript = {
      playerAttacks: [{ damage: 50, targetDefeated: true, targetIndex: 0 }],
      stateSummary: { enemies: [{ hp: 0, maxHp: 50 }], allies: [{ hp: 20, maxHp: 20 }] },
    };

    assert.deepEqual(getPvePredictionBlockers(transcript, { allowVisualKoPrediction: true }), []);
    assert.equal(hasPveServerOnlyFeedback(transcript, { allowVisualKoPrediction: true }), false);
  });

  it('still blocks KO visual markers by default for backwards compatibility', () => {
    const transcript = {
      playerAttacks: [{ damage: 50, targetDefeated: true, targetIndex: 0 }],
    };

    assert.deepEqual(getPvePredictionBlockers(transcript), ['defeatVisuals']);
    assert.equal(hasPveServerOnlyFeedback(transcript), true);
  });

  it('allows a combat-end shell only when explicitly requested', () => {
    const transcript = { combatEnded: true, victory: true };

    assert.deepEqual(getPvePredictionBlockers(transcript), ['combatEnd']);
    assert.deepEqual(
      getPvePredictionBlockers(transcript, { allowPendingCombatEndShell: true }),
      [],
    );
  });

  it('keeps persistent progression feedback server-confirmed', () => {
    const transcript = {
      combatEnded: true,
      victory: true,
      xpEvents: [{ enemyIndex: 0, xp: 10 }],
    };

    assert.deepEqual(
      getPvePredictionBlockers(transcript, {
        allowVisualKoPrediction: true,
        allowPendingCombatEndShell: true,
      }),
      ['xpEvents'],
    );
  });

  it('keeps collection, tutorial, and element-drop rewards server-confirmed', () => {
    const transcript = {
      combatEnded: true,
      victory: true,
      newCollectionAdditions: [{ id: 'creature-a' }],
      tutorialRewards: [{ type: 'fusionCore', amount: 1 }],
      elementDropsCollected: [{ element: 'fire', amount: 1 }],
    };

    assert.deepEqual(
      getPvePredictionBlockers(transcript, {
        allowVisualKoPrediction: true,
        allowPendingCombatEndShell: true,
      }),
      ['newCollectionAdditions', 'tutorialRewards', 'elementDropsCollected'],
    );
  });

  it('keeps reward, shop, and move-learn payloads server-confirmed', () => {
    const transcript = {
      combatEnded: true,
      victory: true,
      reward: { itemId: 'potion' },
      rewards: [{ itemId: 'potion' }],
      postCombatShop: { active: true },
      pendingMoveLearn: [{ creatureId: 'hi', moveId: 'flare' }],
      moveLearnPrompts: [{ creatureId: 'hi', moveId: 'flare' }],
    };

    assert.deepEqual(
      getPvePredictionBlockers(transcript, {
        allowVisualKoPrediction: true,
        allowPendingCombatEndShell: true,
      }),
      ['reward', 'rewards', 'postCombatShop', 'pendingMoveLearn', 'moveLearnPrompts'],
    );
  });

  it('allows terminal side flags as a pending shell only when no server-owned rewards are present', () => {
    assert.deepEqual(
      getPvePredictionBlockers({ allEnemiesDefeated: true }, { allowPendingCombatEndShell: true }),
      [],
    );
    assert.deepEqual(
      getPvePredictionBlockers({ allAlliesDefeated: true }, { allowPendingCombatEndShell: true }),
      [],
    );
    assert.deepEqual(
      getPvePredictionBlockers(
        { allEnemiesDefeated: true, elementDropsCollected: [{ element: 'water', amount: 1 }] },
        { allowPendingCombatEndShell: true },
      ),
      ['elementDropsCollected'],
    );
  });

  it('keeps befriend quiz and next wave server-confirmed', () => {
    assert.deepEqual(
      getPvePredictionBlockers({ befriendQuizTriggered: true }, {
        allowVisualKoPrediction: true,
        allowPendingCombatEndShell: true,
      }),
      ['befriendQuizTriggered'],
    );
    assert.deepEqual(
      getPvePredictionBlockers({ nextWave: true }, {
        allowVisualKoPrediction: true,
        allowPendingCombatEndShell: true,
      }),
      ['nextWave'],
    );
  });
});
