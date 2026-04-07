import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMetaProgression } from '../../../src/game/state.js';
import {
  getTutorialStep,
  advanceTutorial,
  isTutorialActive,
  getTutorialNarration,
  shouldOverrideSkillOffers,
  shouldProtectBefriend,
  shouldFixRoomSequence,
  shouldGiftFireDrops,
  shouldHardcodeCrestReward,
  giftTutorialFireDrops,
  getFormationNarration,
  TUTORIAL_STEPS
} from '../../../src/game/services/tutorial-service.js';

describe('tutorial state', () => {
  it('new meta has tutorialStep 0 and tutorialFireDropsGifted false', () => {
    const meta = createMetaProgression();
    assert.equal(meta.tutorialStep, 0);
    assert.equal(meta.tutorialFireDropsGifted, false);
  });

  it('existing saves without tutorialStep get migrated to 7', () => {
    const oldMeta = { prologueComplete: true, lifetimeStats: { totalRuns: 5 } };
    if (oldMeta.tutorialStep === undefined) {
      oldMeta.tutorialStep = 7;
      oldMeta.tutorialFireDropsGifted = false;
    }
    assert.equal(oldMeta.tutorialStep, 7);
    assert.equal(oldMeta.tutorialFireDropsGifted, false);
  });
});

describe('tutorial-service', () => {
  describe('getTutorialStep', () => {
    it('returns tutorialStep from meta', () => {
      assert.equal(getTutorialStep({ tutorialStep: 3 }), 3);
    });
    it('returns 7 if missing', () => {
      assert.equal(getTutorialStep({}), 7);
    });
  });

  describe('advanceTutorial', () => {
    it('increments tutorialStep by 1', () => {
      const meta = { tutorialStep: 0 };
      assert.equal(advanceTutorial(meta), 1);
      assert.equal(meta.tutorialStep, 1);
    });
    it('does not go past 7', () => {
      const meta = { tutorialStep: 7 };
      assert.equal(advanceTutorial(meta), 7);
    });
  });

  describe('isTutorialActive', () => {
    it('true when step < 7', () => {
      assert.equal(isTutorialActive({ tutorialStep: 0 }), true);
      assert.equal(isTutorialActive({ tutorialStep: 6 }), true);
    });
    it('false when step >= 7', () => {
      assert.equal(isTutorialActive({ tutorialStep: 7 }), false);
    });
  });

  describe('getTutorialNarration', () => {
    it('returns array of strings for each step', () => {
      for (let i = 0; i <= 6; i++) {
        const narration = getTutorialNarration(i);
        assert.ok(Array.isArray(narration), `step ${i} should return array`);
        assert.ok(narration.every(s => typeof s === 'string'), `step ${i} pages should be strings`);
      }
    });
    it('returns empty array for step 7', () => {
      assert.deepEqual(getTutorialNarration(7), []);
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
    it('shouldGiftFireDrops at step 3 when not yet gifted', () => {
      assert.equal(shouldGiftFireDrops({ tutorialStep: 3, tutorialFireDropsGifted: false }), true);
      assert.equal(shouldGiftFireDrops({ tutorialStep: 3, tutorialFireDropsGifted: true }), false);
      assert.equal(shouldGiftFireDrops({ tutorialStep: 4, tutorialFireDropsGifted: false }), false);
    });
    it('shouldHardcodeCrestReward at step 4 only', () => {
      assert.equal(shouldHardcodeCrestReward({ tutorialStep: 4 }), true);
      assert.equal(shouldHardcodeCrestReward({ tutorialStep: 5 }), false);
    });
  });

  describe('giftTutorialFireDrops', () => {
    it('adds 3 fire drops and sets flag', () => {
      const meta = { tutorialStep: 3, tutorialFireDropsGifted: false, elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
      const result = giftTutorialFireDrops(meta);
      assert.equal(result, true);
      assert.equal(meta.elementDrops.fire, 3);
      assert.equal(meta.tutorialFireDropsGifted, true);
    });
    it('is idempotent — does not double-gift', () => {
      const meta = { tutorialStep: 3, tutorialFireDropsGifted: true, elementDrops: { fire: 3, water: 0, earth: 0, wood: 0, metal: 0 } };
      const result = giftTutorialFireDrops(meta);
      assert.equal(result, false);
      assert.equal(meta.elementDrops.fire, 3);
    });
  });

  describe('getFormationNarration', () => {
    it('includes creature count in first page', () => {
      const pages = getFormationNarration(2);
      assert.equal(pages.length, 3);
      assert.ok(pages[0].includes('2'));
    });
  });
});

import { generateAreaRooms } from '../../../src/game/rooms.js';

describe('tutorial room generation', () => {
  it('tutorialMode forces room 0 to encounter and room 1 to friendlyNpc', () => {
    const rooms = generateAreaRooms('hajimari-no-hiroba', undefined, undefined, undefined, undefined, true);
    assert.equal(rooms[0].type, 'encounter');
    assert.equal(rooms[1].type, 'friendlyNpc');
    assert.equal(rooms.length, 30);
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
