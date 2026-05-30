import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummary } from '../../../src/game/adventure-report.js';

describe('Kanji Kombat report summary', () => {
  it('returns Kanji Kombat report when run mode is kanjiKombat', () => {
    const run = {
      mode: 'kanjiKombat',
      kanjiKombat: {
        finalReport: {
          wavesCleared: 4,
          highestStreak: 8,
          correctAnswers: 12,
          wrongAnswers: 3,
          accuracy: 80,
          newCardsIntroduced: 5,
          cardsReviewed: 15,
          scriptDeck: 'hiragana',
          minibossesDefeated: 0,
          temporaryLevels: [{ id: 'hi', nameEn: 'Hi', level: 3 }],
        },
      },
    };
    const summary = buildRunSummary(run, {});
    assert.equal(summary.mode, 'kanjiKombat');
    assert.equal(summary.kanjiKombat.wavesCleared, 4);
    assert.equal(summary.kanjiKombat.accuracy, 80);
  });
});
