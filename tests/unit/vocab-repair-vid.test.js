import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceVocabLimit, checkSentenceViolations } from '../../src/game/vocab-repair.js';

describe('enforceVocabLimit with vidSet', () => {
  it('accepts vidSet parameter without error', async () => {
    const result = await enforceVocabLimit(
      'テスト。',
      ['テスト'],
      null,
      async () => '',
      1,
      [],
      new Set([1001])
    );

    assert.strictEqual(result.narration, 'テスト。');
    assert.deepStrictEqual(result.repairs, []);
  });
});

describe('checkSentenceViolations with vid matching', () => {
  it('accepts vidSet parameter without error', async () => {
    const vidSet = new Set([1001, 1002]);
    const vocabSet = new Set(['学ぶ']);

    const result = await checkSentenceViolations(
      '学びました。',
      vocabSet,
      null,
      null,
      vidSet
    );

    assert.strictEqual(result.count, 0);
  });
});
