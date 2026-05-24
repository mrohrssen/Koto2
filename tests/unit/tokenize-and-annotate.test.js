import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeAndAnnotate } from '../../src/game/grammar/tokenize-and-annotate.js';

describe('tokenizeAndAnnotate', () => {
  it('returns render tokens, words, and raw tokens with grammar hints', () => {
    const result = tokenizeAndAnnotate('本を読んでいる。', {
      mergeDictionary: new Map(),
    });
    assert.ok(Array.isArray(result.rawTokens));
    assert.ok(Array.isArray(result.tokens));
    assert.ok(Array.isArray(result.words));
    assert.ok(result.tokens.some(t => Array.isArray(t.grammarHints)));
    assert.ok(result.words.includes('本'));
    assert.ok(result.words.includes('読む'));
    assert.ok(!result.words.includes('を'), 'grammar particle must not become vocab word');
  });
});
