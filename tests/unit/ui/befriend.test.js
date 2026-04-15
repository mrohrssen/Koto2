import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock browser-dependent modules before importing befriend.js
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} }
});
await mock.module('../../../public/js/api.js', {
  namedExports: { getAuthHeaders: () => ({}) }
});
await mock.module('../../../public/js/platform.js', {
  namedExports: { PLATFORM: { apiBase: '' } }
});
await mock.module('../../../public/js/logger.js', {
  namedExports: { logger: { error: () => {}, warn: () => {} } }
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', renderEnFirst: (s) => s, getKnownWords: () => new Set(), entityToToken: () => ({}) }
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' '), tPlain: (...a) => a.join(' ') }
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: { burstParticles: () => {}, ELEMENT_COLORS: {} }
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: { getCreatureSprite: () => null, showActiveGlow: () => {}, showNpcSprite: () => {}, hideNpcSprite: () => {} }
});
await mock.module('../../../public/js/pixi/text.js', {
  namedExports: { popupBuff: () => {} }
});
await mock.module('../../../public/js/ui/scene.js', {
  namedExports: { showNpcInDisplay: () => {}, hideEnemy: () => {}, showFormation: () => {} }
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: { SPRITE_VERSION: '0', replaceWithTextSprite: () => {}, creatureSpriteHtml: () => '', creatureStaticPath: () => '' }
});
await mock.module('../../../public/js/ui/romaji.js', {
  namedExports: { toRomaji: (s) => s }
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: { renderButtonsAsync: () => Promise.resolve(0) }
});
await mock.module('../../../public/js/tts.js', {
  namedExports: { playDialogueAudio: () => {}, prefetchWord: () => {}, playWordPair: () => {} }
});
await mock.module('../../../public/js/ui/move-select.js', {
  namedExports: { init: () => {}, showMoves: () => {}, clear: () => {}, setActiveLabel: () => {} }
});
await mock.module('../../../public/js/ui/target-select.js', {
  namedExports: { init: () => {}, showEnemies: () => {}, showAllies: () => {}, clear: () => {} }
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: { getTutorialNarration: () => [], getBefriendWrongNarration: () => '' }
});
await mock.module('../../../public/js/ui/befriend-quiz-state.js', {
  namedExports: { restoreBefriendQuizEnemyUi: () => {} }
});

const {
  isBefriendSlotBlocked,
  isBefriendAvailableForSlot,
  getMoveSelectBefriendOpts,
} = await import('../../../public/js/ui/befriend.js');

describe('befriend eligibility', () => {
  describe('isBefriendSlotBlocked', () => {
    it('returns true when slot is recorded in befriendAttemptedSlots', () => {
      const state = { combat: { befriendAttemptedSlots: { 0: true } } };
      assert.equal(isBefriendSlotBlocked(state, 0), true);
    });

    it('returns false when slot is not in befriendAttemptedSlots', () => {
      const state = { combat: { befriendAttemptedSlots: { 1: true } } };
      assert.equal(isBefriendSlotBlocked(state, 0), false);
    });

    it('returns false when befriendAttemptedSlots is missing', () => {
      const state = { combat: {} };
      assert.equal(isBefriendSlotBlocked(state, 0), false);
    });

    it('returns false when combat is missing', () => {
      const state = {};
      assert.equal(isBefriendSlotBlocked(state, 0), false);
    });
  });

  describe('isBefriendAvailableForSlot', () => {
    it('returns true when one living enemy is below 50% HP', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), true);
    });

    it('returns false for NPC combat', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: 'some-npc',
          befriendAttemptedSlots: {},
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when not creature combat', () => {
      const state = {
        combat: {
          isCreatureCombat: false,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when slot already attempted', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: { 0: true },
          enemies: [{ hp: 4, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when enemy HP is above 50%', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 6, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns false when multiple enemies are alive', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [
            { hp: 4, maxHp: 10, befriended: false },
            { hp: 8, maxHp: 10, befriended: false },
          ],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), false);
    });

    it('returns true at exactly 50% HP', () => {
      const state = {
        combat: {
          isCreatureCombat: true,
          npcId: null,
          befriendAttemptedSlots: {},
          enemies: [{ hp: 5, maxHp: 10, befriended: false }],
        },
      };
      assert.equal(isBefriendAvailableForSlot(state, 0), true);
    });
  });

  describe('getMoveSelectBefriendOpts', () => {
    it('returns disabled befriend options (feature gated)', () => {
      const opts = getMoveSelectBefriendOpts(0);
      assert.equal(opts.befriendAvailable, false);
      assert.equal(opts.onBefriend, undefined);
    });
  });
});
