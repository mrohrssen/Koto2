import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPrologueScene, getPrologueSceneCount } from '../../../src/game/bootstrap-narrations.js';
import { extractTaggedWords } from '../../../src/game/bootstrap-parser.js';
import { getPrologueWords } from '../../../src/game/bootstrap-curriculum.js';

describe('Bootstrap Narrations - Prologue', () => {
  it('loads prologue scenes', () => {
    const count = getPrologueSceneCount();
    assert.ok(count >= 3, 'prologue should have at least 3 scenes');
  });

  it('each scene has required fields', () => {
    const count = getPrologueSceneCount();
    for (let i = 0; i < count; i++) {
      const scene = getPrologueScene(i);
      assert.ok(scene.id, `scene ${i} missing id`);
      assert.ok(scene.narration, `scene ${i} missing narration`);
      assert.ok(typeof scene.narration === 'string');
    }
  });

  it('prologue scenes only use curriculum words', () => {
    const prologueWords = new Set(getPrologueWords().map(w => w.kanji));
    const count = getPrologueSceneCount();
    for (let i = 0; i < count; i++) {
      const scene = getPrologueScene(i);
      const taggedWords = extractTaggedWords(scene.narration);
      for (const word of taggedWords) {
        assert.ok(
          prologueWords.has(word),
          `scene ${scene.id} uses word "${word}" not in prologue curriculum`
        );
      }
    }
  });

  it('each scene introduces at most 5 new words', () => {
    const seenWords = new Set();
    const count = getPrologueSceneCount();
    for (let i = 0; i < count; i++) {
      const scene = getPrologueScene(i);
      const taggedWords = extractTaggedWords(scene.narration);
      const newWords = taggedWords.filter(w => !seenWords.has(w));
      assert.ok(
        newWords.length <= 5,
        `scene ${scene.id} introduces ${newWords.length} new words (max 5)`
      );
      taggedWords.forEach(w => seenWords.add(w));
    }
  });

  it('returns null for out-of-range scene index', () => {
    assert.strictEqual(getPrologueScene(999), null);
  });
});
