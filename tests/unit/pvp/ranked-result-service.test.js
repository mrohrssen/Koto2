import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultRankedState } from '../../../src/pvp/ranked-rating.js';
import { applyRankedMatchResult } from '../../../src/pvp/ranked-result-service.js';

function manager(name, ranked = createDefaultRankedState()) {
  return {
    player: { name },
    meta: { pvpRanked: ranked },
    getMeta() {
      return this.meta;
    }
  };
}

describe('applyRankedMatchResult', () => {
  it('updates both players when a ranked match has a winner', () => {
    const managers = new Map([
      ['winner', manager('WinnerName')],
      ['loser', manager('IllegalIcarus')]
    ]);
    const saveManager = mock.fn();
    const result = applyRankedMatchResult({
      match: {
        ranked: true,
        player1: { userId: 'winner', username: 'WinnerName' },
        player2: { userId: 'loser', username: 'IllegalIcarus' },
        rankedRatingBefore: {
          winner: { rating: createDefaultRankedState().rating },
          loser: { rating: createDefaultRankedState().rating }
        }
      },
      winnerId: 'winner',
      getManager: (userId) => managers.get(userId),
      saveManager,
      finishedAt: '2026-05-22T04:00:00.000Z'
    });

    assert.strictEqual(result.winner.userId, 'winner');
    assert.strictEqual(result.loser.userId, 'loser');
    assert.strictEqual(managers.get('winner').meta.pvpRanked.wins, 1);
    assert.strictEqual(managers.get('loser').meta.pvpRanked.losses, 1);
    assert.strictEqual(saveManager.mock.callCount(), 2);
    assert.deepStrictEqual(saveManager.mock.calls.map(c => c.arguments[0]).sort(), ['loser', 'winner']);
  });

  it('returns null for casual matches', () => {
    const saveManager = mock.fn();
    const result = applyRankedMatchResult({
      match: { ranked: false },
      winnerId: 'winner',
      getManager: () => manager('Any'),
      saveManager
    });
    assert.strictEqual(result, null);
    assert.strictEqual(saveManager.mock.callCount(), 0);
  });
});
