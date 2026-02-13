import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabSection, isVocabStale } from '../../../src/narration-engine/vocab-constraints.js';

describe('vocab-constraints', () => {
  describe('buildVocabSection', () => {
    it('returns formatted vocab constraint text', () => {
      const result = buildVocabSection(['食べる', '飲む', '走る'], 'N4');
      assert.ok(result.includes('食べる'));
      assert.ok(result.includes('飲む'));
      assert.ok(result.includes('N4'));
    });

    it('caps at 8000 words', () => {
      const bigList = Array.from({ length: 10000 }, (_, i) => `word${i}`);
      const result = buildVocabSection(bigList, 'N3');
      const wordCount = (result.match(/word/g) || []).length;
      assert.ok(wordCount <= 8000);
    });

    it('includes particle allowance', () => {
      const result = buildVocabSection(['食べる'], 'N5');
      assert.ok(result.includes('助詞'));
    });

    it('handles empty word list', () => {
      const result = buildVocabSection([], 'N5');
      assert.ok(result.includes('基本的な言葉'));
    });
  });

  describe('isVocabStale', () => {
    it('returns false when vocab unchanged', () => {
      assert.strictEqual(isVocabStale(100, 100), false);
    });

    it('returns true when vocab grew past threshold', () => {
      assert.strictEqual(isVocabStale(100, 111), true);
    });

    it('uses minimum threshold of 10', () => {
      assert.strictEqual(isVocabStale(20, 25), false);
      assert.strictEqual(isVocabStale(20, 31), true);
    });

    it('uses 3% for large vocab', () => {
      assert.strictEqual(isVocabStale(2000, 2050), false);
      assert.strictEqual(isVocabStale(2000, 2061), true);
    });

    it('returns false when vocab shrinks', () => {
      assert.strictEqual(isVocabStale(100, 90), false);
    });
  });
});
