import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMetaProgression } from '../../../src/game/state.js';
import {
  getTutorialStep,
  advanceTutorial,
  isTutorialActive,
  shouldOverrideSkillOffers,
  shouldProtectBefriend,
  shouldFixRoomSequence,
  resetTutorial,
  ensureTutorialFusionState,
  hasTutorialFusionData,
  unlockTutorialFusionData,
  canUseFusionLab,
  awardTutorialFusionCore,
  markTutorialFusionComplete,
  shouldForceStartingMeadowCatEncounter,
  shouldShowStartingMeadowHinekoIntro,
  collectStartingMeadowHinekoVictoryReward
} from '../../../src/game/services/tutorial-service.js';

describe('tutorial state', () => {
  it('new meta has tutorialStep 0 and tutorialFireDropsGifted false', () => {
    const meta = createMetaProgression();
    assert.equal(meta.tutorialStep, 0);
    assert.equal(meta.tutorialFireDropsGifted, false);
  });

  it('existing saves without tutorialStep get migrated to 6', () => {
    const oldMeta = { prologueComplete: true, lifetimeStats: { totalRuns: 5 } };
    if (oldMeta.tutorialStep === undefined) {
      oldMeta.tutorialStep = 6;
      oldMeta.tutorialFireDropsGifted = false;
    }
    assert.equal(oldMeta.tutorialStep, 6);
    assert.equal(oldMeta.tutorialFireDropsGifted, false);
  });
});

describe('tutorial-service', () => {
  describe('getTutorialStep', () => {
    it('returns tutorialStep from meta', () => {
      assert.equal(getTutorialStep({ tutorialStep: 3 }), 3);
    });
    it('returns 6 if missing', () => {
      assert.equal(getTutorialStep({}), 6);
    });
  });

  describe('advanceTutorial', () => {
    it('increments tutorialStep by 1', () => {
      const meta = { tutorialStep: 0 };
      assert.equal(advanceTutorial(meta), 1);
      assert.equal(meta.tutorialStep, 1);
    });
    it('does not go past 6', () => {
      const meta = { tutorialStep: 6 };
      assert.equal(advanceTutorial(meta), 6);
    });
  });

  describe('isTutorialActive', () => {
    it('true when step < 6', () => {
      assert.equal(isTutorialActive({ tutorialStep: 0 }), true);
      assert.equal(isTutorialActive({ tutorialStep: 5 }), true);
    });
    it('false when step >= 6', () => {
      assert.equal(isTutorialActive({ tutorialStep: 6 }), false);
    });
  });

  describe('condition helpers', () => {
    it('shouldOverrideSkillOffers at step 0 only', () => {
      assert.equal(shouldOverrideSkillOffers({ tutorialStep: 0 }), true);
      assert.equal(shouldOverrideSkillOffers({ tutorialStep: 1 }), false);
    });
    it('shouldProtectBefriend at step 1 only', () => {
      assert.equal(shouldProtectBefriend({ tutorialStep: 1 }), true);
      assert.equal(shouldProtectBefriend({ tutorialStep: 2 }), false);
    });
    it('shouldFixRoomSequence when step < 3', () => {
      assert.equal(shouldFixRoomSequence({ tutorialStep: 0 }), true);
      assert.equal(shouldFixRoomSequence({ tutorialStep: 2 }), true);
      assert.equal(shouldFixRoomSequence({ tutorialStep: 3 }), false);
    });
  });

  describe('resetTutorial', () => {
    it('resets tutorialStep to 0 and tutorialFireDropsGifted to false', () => {
      const meta = createMetaProgression();
      meta.tutorialStep = 5;
      meta.tutorialFireDropsGifted = true;
      resetTutorial(meta);
      assert.equal(meta.tutorialStep, 0);
      assert.equal(meta.tutorialFireDropsGifted, false);
    });

    it('preserves other meta fields', () => {
      const meta = createMetaProgression();
      meta.tutorialStep = 6;
      meta.prologueComplete = true;
      meta.lifetimeStats = { totalRuns: 5 };
      resetTutorial(meta);
      assert.equal(meta.prologueComplete, true);
      assert.deepEqual(meta.lifetimeStats, { totalRuns: 5 });
    });
  });

  describe('tutorial fusion helpers', () => {
    it('new meta starts with empty tutorial fusion state', () => {
      const meta = createMetaProgression();
      assert.deepEqual(meta.tutorialFusionDataUnlocked, []);
      assert.equal(meta.tutorialFusionCoreAwarded, false);
      assert.equal(meta.tutorialFusionComplete, false);
    });

    it('ensureTutorialFusionState migrates missing fields', () => {
      const meta = {};
      ensureTutorialFusionState(meta);
      assert.deepEqual(meta.tutorialFusionDataUnlocked, []);
      assert.equal(meta.tutorialFusionCoreAwarded, false);
      assert.equal(meta.tutorialFusionComplete, false);
    });

    it('unlockTutorialFusionData records Hineko once', () => {
      const meta = createMetaProgression();
      const first = unlockTutorialFusionData(meta, 'hineko');
      const second = unlockTutorialFusionData(meta, 'hineko');
      assert.equal(first.unlocked, true);
      assert.equal(second.unlocked, false);
      assert.deepEqual(meta.tutorialFusionDataUnlocked, ['hineko']);
      assert.equal(hasTutorialFusionData(meta, 'hineko'), true);
    });

    it('canUseFusionLab requires Hineko data', () => {
      const meta = createMetaProgression();
      assert.equal(canUseFusionLab(meta), false);
      unlockTutorialFusionData(meta, 'hineko');
      assert.equal(canUseFusionLab(meta), true);
    });

    it('awardTutorialFusionCore grants exactly one core', () => {
      const meta = createMetaProgression();
      unlockTutorialFusionData(meta, 'hineko');
      const first = awardTutorialFusionCore(meta);
      const second = awardTutorialFusionCore(meta);
      assert.equal(first.awarded, true);
      assert.equal(first.fusionCores, 1);
      assert.equal(second.awarded, false);
      assert.equal(second.fusionCores, 1);
      assert.equal(meta.fusionCores, 1);
      assert.equal(meta.tutorialFusionCoreAwarded, true);
    });

    it('awardTutorialFusionCore refuses before Hineko data', () => {
      const meta = createMetaProgression();
      assert.throws(
        () => awardTutorialFusionCore(meta),
        /Hineko fusion data is required/
      );
      assert.equal(meta.fusionCores, 0);
    });

    it('markTutorialFusionComplete completes tutorial fusion and tutorial step', () => {
      const meta = createMetaProgression();
      markTutorialFusionComplete(meta);
      assert.equal(meta.tutorialFusionComplete, true);
      assert.equal(meta.tutorialStep, 6);
    });
  });

  describe('Starting Meadow Cat encounter', () => {
    it('forces Cat only for first Starting Meadow encounter before Hineko data', () => {
      const meta = createMetaProgression();
      const run = {
        currentArea: { id: 'hajimari-no-hiroba' },
        currentRoom: 0,
        currentAreaEncounters: 0,
        rooms: [{ type: 'encounter' }]
      };
      assert.equal(shouldForceStartingMeadowCatEncounter(meta, run), true);
      run.currentRoom = 1;
      assert.equal(shouldForceStartingMeadowCatEncounter(meta, run), false);
    });

    it('does not force Cat in Wild Plains', () => {
      const meta = createMetaProgression();
      const run = {
        currentArea: { id: 'wild-plains' },
        currentRoom: 0,
        currentAreaEncounters: 0,
        rooms: [{ type: 'encounter' }]
      };
      assert.equal(shouldForceStartingMeadowCatEncounter(meta, run), false);
    });
  });

  describe('Starting Meadow Hineko boss tutorial', () => {
    function makeBossRun(areaId = 'hajimari-no-hiroba') {
      return {
        currentArea: { id: areaId },
        currentRoom: 9,
        rooms: [
          null, null, null, null, null, null, null, null, null,
          { type: 'boss', boss: { creatureId: 'hineko' } }
        ]
      };
    }

    it('shows boss intro only for Starting Meadow Hineko without data', () => {
      const meta = createMetaProgression();
      assert.equal(shouldShowStartingMeadowHinekoIntro(meta, makeBossRun()), true);
      assert.equal(shouldShowStartingMeadowHinekoIntro(meta, makeBossRun('wild-plains')), false);
      unlockTutorialFusionData(meta, 'hineko');
      assert.equal(shouldShowStartingMeadowHinekoIntro(meta, makeBossRun()), false);
    });

    it('collects Hineko fusion data only for Starting Meadow Hineko victory', () => {
      const meta = createMetaProgression();
      const combat = { isBoss: true, enemies: [{ id: 'hineko', hp: 0 }] };
      const reward = collectStartingMeadowHinekoVictoryReward(meta, makeBossRun(), combat);
      assert.deepEqual(meta.tutorialFusionDataUnlocked, ['hineko']);
      assert.equal(reward?.type, 'fusionData');
      assert.equal(reward?.message, 'Obtained Hineko Fusion Data!');

      const wildMeta = createMetaProgression();
      const wildReward = collectStartingMeadowHinekoVictoryReward(wildMeta, makeBossRun('wild-plains'), combat);
      assert.equal(wildReward, null);
      assert.deepEqual(wildMeta.tutorialFusionDataUnlocked, []);
    });
  });
});

import { processBefriendQuizAnswer } from '../../../src/game/services/creature-combat-service.js';

describe('tutorial befriend protection', () => {
  function makeQuizCombat() {
    return {
      befriendQuiz: {
        creatureId: 'test-creature',
        creatureName: 'TestCreature',
        targetIndex: 0,
        options: [
          { id: 'correct', name: 'TestCreature', correct: true },
          { id: 'wrong1', name: 'WrongA', correct: false },
          { id: 'wrong2', name: 'WrongB', correct: false }
        ]
      },
      enemies: [{ id: 'test-creature', hp: 1, maxHp: 10, mp: 5, maxMp: 5, element: 'fire', moves: [{ id: 'm1', name: 'Hit', nameEn: 'Hit', element: 'fire', power: 10 }], nameEn: 'TestCreature' }],
      allies: [{ id: 'ally1', hp: 50, maxHp: 50, mp: 10, maxMp: 10, element: 'water', nameEn: 'Ally' }]
    };
  }

  it('wrong answer with tutorialProtect keeps quiz alive and deals no damage', () => {
    const combat = makeQuizCombat();
    const party = { active: combat.allies, reserves: [] };
    const result = processBefriendQuizAnswer('wrong1', combat, party, { tutorialProtect: true });
    assert.equal(result.correct, false);
    assert.equal(result.tutorialRetry, true);
    assert.ok(combat.befriendQuiz !== null, 'quiz should remain active');
    assert.equal(combat.allies[0].hp, 50);
  });

  it('correct answer still works with tutorialProtect', () => {
    const combat = makeQuizCombat();
    const party = { active: combat.allies, reserves: [], pendingCaptures: [] };
    const result = processBefriendQuizAnswer('correct', combat, party, { tutorialProtect: true });
    assert.equal(result.correct, true);
    assert.equal(result.befriended, true);
  });
});

import { generateAreaRooms } from '../../../src/game/rooms.js';

describe('tutorial room generation', () => {
  it('tutorialMode forces room 0 to encounter and room 1 to friendlyNpc', () => {
    const rooms = generateAreaRooms('hajimari-no-hiroba', undefined, undefined, undefined, undefined, true);
    assert.equal(rooms[0].type, 'encounter');
    assert.equal(rooms[1].type, 'friendlyNpc');
    assert.equal(rooms.length, 10);
    assert.equal(rooms[9].type, 'boss');
    assert.equal(rooms[9].boss.creatureId, 'hineko');
  });

  it('without tutorialMode rooms are not forced', () => {
    // Run 50 times — at least one should NOT have encounter+friendlyNpc in slots 0,1
    let allMatch = true;
    for (let i = 0; i < 50; i++) {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      if (rooms[0].type !== 'encounter' || rooms[1].type !== 'friendlyNpc') {
        allMatch = false;
        break;
      }
    }
    assert.equal(allMatch, false, 'Without tutorialMode, rooms should be randomized');
  });
});

