import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCurriculum, getPrologueWords, getRunWords, getWordInfo } from '../../../src/game/bootstrap-curriculum.js';

describe('Bootstrap Curriculum', () => {
  it('loads curriculum with words array', () => {
    const curriculum = getCurriculum();
    assert.ok(Array.isArray(curriculum));
    assert.ok(curriculum.length >= 20, 'curriculum should have at least 20 words');
  });

  it('each word has required fields', () => {
    const curriculum = getCurriculum();
    for (const word of curriculum) {
      assert.ok(word.kanji, `word missing kanji: ${JSON.stringify(word)}`);
      assert.ok(word.hiragana, `word missing hiragana: ${JSON.stringify(word)}`);
      assert.ok(word.english, `word missing english: ${JSON.stringify(word)}`);
      assert.ok(word.romaji, `word missing romaji: ${JSON.stringify(word)}`);
      assert.ok(word.introducedIn, `word missing introducedIn: ${JSON.stringify(word)}`);
    }
  });

  it('getPrologueWords returns only prologue words', () => {
    const words = getPrologueWords();
    assert.ok(words.length >= 15);
    for (const w of words) {
      assert.strictEqual(w.introducedIn, 'prologue');
    }
  });

  it('getRunWords returns words for a specific run', () => {
    const words = getRunWords(1);
    for (const w of words) {
      assert.strictEqual(w.introducedIn, 'run-1');
    }
  });

  it('getWordInfo looks up by kanji', () => {
    const info = getWordInfo('水');
    assert.ok(info);
    assert.strictEqual(info.english, 'water');
  });

  it('getWordInfo returns null for unknown word', () => {
    assert.strictEqual(getWordInfo('鬱'), null);
  });
});
