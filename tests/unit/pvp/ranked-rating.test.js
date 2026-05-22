import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultRankedState,
  getDisplayRating,
  normalizeRankedState,
  toPublicRankedSummary,
  updateRankedAfterMatch
} from '../../../src/pvp/ranked-rating.js';

describe('ranked-rating', () => {
  it('creates a default ranked state that displays as 1200', () => {
    const ranked = createDefaultRankedState();
    assert.deepStrictEqual(ranked.rating, { mu: 25, sigma: 25 / 3 });
    assert.strictEqual(getDisplayRating(ranked.rating), 1200);
    assert.strictEqual(ranked.wins, 0);
    assert.strictEqual(ranked.losses, 0);
    assert.strictEqual(ranked.matchesPlayed, 0);
    assert.strictEqual(ranked.lastMatch, null);
  });

  it('normalizes missing or partial ranked state', () => {
    const ranked = normalizeRankedState({ wins: 2 });
    assert.strictEqual(getDisplayRating(ranked.rating), 1200);
    assert.strictEqual(ranked.wins, 2);
    assert.strictEqual(ranked.losses, 0);
    assert.strictEqual(ranked.matchesPlayed, 0);
    assert.strictEqual(ranked.lastMatch, null);
  });

  it('returns a public ranked summary', () => {
    const summary = toPublicRankedSummary({
      rating: { mu: 26, sigma: 7 },
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
      lastMatch: { result: 'win' }
    });
    assert.strictEqual(summary.rating, 1240);
    assert.strictEqual(summary.wins, 3);
    assert.strictEqual(summary.losses, 1);
    assert.strictEqual(summary.matchesPlayed, 4);
    assert.deepStrictEqual(summary.lastMatch, { result: 'win' });
  });

  it('updates winner and loser ratings and stores perspective-specific last matches', () => {
    const beforeWinner = createDefaultRankedState();
    const beforeLoser = createDefaultRankedState();
    const result = updateRankedAfterMatch({
      winnerRanked: beforeWinner,
      loserRanked: beforeLoser,
      winnerName: 'WinnerName',
      loserName: 'IllegalIcarus',
      finishedAt: '2026-05-22T04:00:00.000Z'
    });

    const winnerBeforeDisplay = getDisplayRating(beforeWinner.rating);
    const loserBeforeDisplay = getDisplayRating(beforeLoser.rating);
    const winnerAfterDisplay = getDisplayRating(result.winner.ranked.rating);
    const loserAfterDisplay = getDisplayRating(result.loser.ranked.rating);

    assert.ok(winnerAfterDisplay > winnerBeforeDisplay);
    assert.ok(loserAfterDisplay < loserBeforeDisplay);
    assert.strictEqual(result.winner.ranked.wins, 1);
    assert.strictEqual(result.winner.ranked.losses, 0);
    assert.strictEqual(result.loser.ranked.wins, 0);
    assert.strictEqual(result.loser.ranked.losses, 1);
    assert.strictEqual(result.winner.ranked.matchesPlayed, 1);
    assert.strictEqual(result.loser.ranked.matchesPlayed, 1);
    assert.deepStrictEqual(result.winner.ranked.lastMatch, {
      result: 'win',
      opponentName: 'IllegalIcarus',
      opponentRatingBefore: loserBeforeDisplay,
      ratingBefore: winnerBeforeDisplay,
      ratingAfter: winnerAfterDisplay,
      finishedAt: '2026-05-22T04:00:00.000Z'
    });
    assert.deepStrictEqual(result.loser.ranked.lastMatch, {
      result: 'loss',
      opponentName: 'WinnerName',
      opponentRatingBefore: winnerBeforeDisplay,
      ratingBefore: loserBeforeDisplay,
      ratingAfter: loserAfterDisplay,
      finishedAt: '2026-05-22T04:00:00.000Z'
    });
  });
});
