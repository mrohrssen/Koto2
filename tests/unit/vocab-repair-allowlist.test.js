import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock the Sudachi bridge before importing the module under test.
const tok = (surface, baseForm, pos) => ({ surface, baseForm, pos });
let currentTokens = [];
mock.module('../../src/tokenizer.js', {
  namedExports: { tokenize: () => currentTokens }
});

const { checkSentenceViolations } = await import('../../src/game/vocab-repair.js');

describe('checkSentenceViolations with shared allowlist', () => {
  it('skips honorific suffixes (接尾辞) — new POS skip', () => {
    currentTokens = [
      tok('ミチア', 'ミチア', '名詞'),
      tok('さん', 'さん', '接尾辞')
    ];
    const result = checkSentenceViolations('ミチアさん', new Set(['ミチア']), new Set());
    assert.deepEqual(result.unknownWords, []);
  });

  it('skips kana auxiliaries by base form (てみる)', () => {
    currentTokens = [
      tok('見', '見る', '動詞'),
      tok('て', 'て', '助詞'),
      tok('みて', 'みる', '動詞')
    ];
    const result = checkSentenceViolations('見てみて', new Set(['見る']), new Set());
    assert.deepEqual(result.unknownWords, []);
  });

  it('counts question words as vocabulary now (何 no longer free)', () => {
    currentTokens = [tok('何', '何', '代名詞')];
    const unknown = checkSentenceViolations('何', new Set(), new Set());
    assert.deepEqual(unknown.unknownWords, ['何']);
    const known = checkSentenceViolations('何', new Set(['何']), new Set());
    assert.deepEqual(known.unknownWords, []);
  });

  it('skips noise interjections but counts teachable exclamations', () => {
    currentTokens = [tok('ああ', 'ああ', '感動詞'), tok('ごめん', 'ごめん', '感動詞')];
    const result = checkSentenceViolations('ああ、ごめん', new Set(), new Set());
    assert.deepEqual(result.unknownWords, ['ごめん']);
  });

  it('still skips ください via base form くださる', () => {
    currentTokens = [tok('ください', 'くださる', '動詞')];
    const result = checkSentenceViolations('ください', new Set(), new Set());
    assert.deepEqual(result.unknownWords, []);
  });
});
