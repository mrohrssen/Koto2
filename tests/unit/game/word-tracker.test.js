import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWordTracker,
  recordExposure,
  recordExposures,
  getWordStage,
  getPhase,
  getKnownWords,
  getWordsAtStage
} from '../../../src/game/word-tracker.js';
import { SCAFFOLD_STAGES, PHASES } from '../../helpers/word-tracker-fixtures.js';

describe('Word Tracker - createWordTracker', () => {
  it('creates empty tracker for new user', () => {
    const tracker = createWordTracker('user-1');
    assert.strictEqual(tracker.userId, 'user-1');
    assert.deepStrictEqual(tracker.words, {});
    assert.strictEqual(tracker.totalWordsIntroduced, 0);
    assert.strictEqual(tracker.phase, PHASES.BOOTSTRAP);
  });
});

describe('Word Tracker - recordExposure', () => {
  let tracker;

  beforeEach(() => {
    tracker = createWordTracker('user-1');
  });

  it('creates new word entry on first exposure', () => {
    recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].exposures, 1);
    assert.strictEqual(tracker.words['水'].stage, SCAFFOLD_STAGES.FULL);
    assert.strictEqual(tracker.totalWordsIntroduced, 1);
  });

  it('increments exposure count on repeated exposure', () => {
    recordExposure(tracker, '水');
    recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].exposures, 2);
    assert.strictEqual(tracker.totalWordsIntroduced, 1);
  });

  it('transitions from stage 1 to stage 2 at 4 exposures', () => {
    for (let i = 0; i < 4; i++) recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].stage, SCAFFOLD_STAGES.NO_ROMAJI);
  });

  it('transitions from stage 2 to stage 3 at 10 exposures', () => {
    for (let i = 0; i < 10; i++) recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].stage, SCAFFOLD_STAGES.FURIGANA);
  });

  it('accepts multiplier for combat exposures (2x)', () => {
    recordExposure(tracker, '水', 2);
    assert.strictEqual(tracker.words['水'].exposures, 2);
  });
});

describe('Word Tracker - recordExposures (batch)', () => {
  it('records multiple words from a narration', () => {
    const tracker = createWordTracker('user-1');
    recordExposures(tracker, ['水', '火', '水']);
    assert.strictEqual(tracker.words['水'].exposures, 2);
    assert.strictEqual(tracker.words['火'].exposures, 1);
    assert.strictEqual(tracker.totalWordsIntroduced, 2);
  });
});

describe('Word Tracker - getWordStage', () => {
  it('returns stage for tracked word', () => {
    const tracker = createWordTracker('user-1');
    for (let i = 0; i < 5; i++) recordExposure(tracker, '森');
    assert.strictEqual(getWordStage(tracker, '森'), SCAFFOLD_STAGES.NO_ROMAJI);
  });

  it('returns null for unknown word', () => {
    const tracker = createWordTracker('user-1');
    assert.strictEqual(getWordStage(tracker, '森'), null);
  });
});

describe('Word Tracker - getPhase', () => {
  it('returns bootstrap when few words learned', () => {
    const tracker = createWordTracker('user-1');
    recordExposure(tracker, '水');
    assert.strictEqual(getPhase(tracker), PHASES.BOOTSTRAP);
  });

  it('returns transition at 100 words at stage 2+', () => {
    const tracker = createWordTracker('user-1');
    for (let i = 0; i < 100; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    assert.strictEqual(getPhase(tracker), PHASES.TRANSITION);
  });

  it('returns full-japanese at 250 words at stage 2+', () => {
    const tracker = createWordTracker('user-1');
    for (let i = 0; i < 250; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    assert.strictEqual(getPhase(tracker), PHASES.FULL_JAPANESE);
  });
});

describe('Word Tracker - getKnownWords', () => {
  it('returns array of all tracked words', () => {
    const tracker = createWordTracker('user-1');
    recordExposure(tracker, '水');
    recordExposure(tracker, '火');
    const known = getKnownWords(tracker);
    assert.deepStrictEqual(known.sort(), ['水', '火'].sort());
  });
});

describe('Word Tracker - getWordsAtStage', () => {
  it('filters words by stage', () => {
    const tracker = createWordTracker('user-1');
    recordExposure(tracker, '水'); // stage 1
    for (let i = 0; i < 5; i++) recordExposure(tracker, '火'); // stage 2
    const stage2 = getWordsAtStage(tracker, SCAFFOLD_STAGES.NO_ROMAJI);
    assert.deepStrictEqual(stage2, ['火']);
  });
});
