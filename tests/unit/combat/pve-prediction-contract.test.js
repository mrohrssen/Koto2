import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasPveServerOnlyFeedback } from '../../../src/shared/combat/pve-prediction-contract.js';

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
