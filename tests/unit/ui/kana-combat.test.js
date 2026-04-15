import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../public/js/api.js', {
  namedExports: { getAuthHeaders: () => ({}) }
});
await mock.module('../../../public/js/platform.js', {
  namedExports: { PLATFORM: { apiBase: '' } }
});

const { pickCheapestMove, isRoundInProgress, handleSwipe } = await import('../../../public/js/ui/kana-combat.js');

describe('kana-combat', () => {
  describe('pickCheapestMove', () => {
    it('picks the lowest MP cost single-enemy move', () => {
      const creature = {
        mp: 10,
        moves: [
          { id: 'a', target: 'single_enemy', mpCost: 5 },
          { id: 'b', target: 'single_enemy', mpCost: 2 },
          { id: 'c', target: 'all_enemies', mpCost: 1 },
        ],
      };
      const move = pickCheapestMove(creature);
      assert.equal(move.id, 'b');
    });

    it('skips moves creature cannot afford', () => {
      const creature = {
        mp: 3,
        moves: [
          { id: 'a', target: 'single_enemy', mpCost: 5 },
          { id: 'b', target: 'single_enemy', mpCost: 4 },
        ],
      };
      assert.equal(pickCheapestMove(creature), null);
    });

    it('returns null when creature has no moves', () => {
      assert.equal(pickCheapestMove({ mp: 10, moves: [] }), null);
      assert.equal(pickCheapestMove({ mp: 10 }), null);
    });
  });

  describe('isRoundInProgress', () => {
    it('returns false when no swipe is pending', () => {
      assert.equal(isRoundInProgress(), false);
    });
  });

  describe('handleSwipe', () => {
    it('does not throw when no round is in progress', () => {
      assert.doesNotThrow(() => handleSwipe('right'));
    });
  });
});
