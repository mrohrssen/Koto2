import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock parseText before importing vocab-repair
const mockParseResults = [];
await mock.module('../../../src/jpdb.js', {
  namedExports: {
    parseText: async (_apiKey, _text) => mockParseResults.shift() || []
  }
});

const { enforceVocabLimit, checkSentenceViolations } = await import('../../../src/game/vocab-repair.js');

describe('Vid-based matching integration', () => {
  it('accepts conjugated form when vid matches known vocabulary', async () => {
    mockParseResults.push([
      { spelling: '学びました', reading: 'まなびました', vid: 1001, sid: 0, isWord: true }
    ]);

    const vidSet = new Set([1001]);
    const vocabSet = new Set(['学ぶ']);

    const result = await checkSentenceViolations(
      '学びました。',
      vocabSet,
      'fake-api-key',
      null,
      vidSet
    );

    assert.strictEqual(result.count, 0, 'Conjugated form should match via vid');
  });

  it('flags word as unknown when vid is absent from vidSet', async () => {
    mockParseResults.push([
      { spelling: '走って', reading: 'はしって', vid: 2001, sid: 0, isWord: true }
    ]);

    const vidSet = new Set([1001]);
    const vocabSet = new Set();

    const result = await checkSentenceViolations(
      '走って。',
      vocabSet,
      'fake-api-key',
      null,
      vidSet
    );

    assert.strictEqual(result.count, 1);
    assert.deepStrictEqual(result.unknownWords, ['走って']);
  });

  it('deduplicates by vid so same lemma counted once', async () => {
    mockParseResults.push([
      { spelling: '学んで', reading: 'まなんで', vid: 1001, sid: 0, isWord: true },
      { spelling: '学びました', reading: 'まなびました', vid: 1001, sid: 0, isWord: true }
    ]);

    const vidSet = new Set();
    const vocabSet = new Set();

    const result = await checkSentenceViolations(
      '学んで学びました。',
      vocabSet,
      'fake-api-key',
      null,
      vidSet
    );

    assert.strictEqual(result.count, 1, 'Same vid should be counted only once');
  });

  it('falls back to string matching when vidSet is null', async () => {
    mockParseResults.push([
      { spelling: '学ぶ', reading: 'まなぶ', vid: 1001, sid: 0, isWord: true }
    ]);

    const vocabSet = new Set(['学ぶ']);

    const result = await checkSentenceViolations(
      '学ぶ。',
      vocabSet,
      'fake-api-key',
      null,
      null
    );

    assert.strictEqual(result.count, 0, 'String match should work as fallback');
  });

  it('skips non-word tokens (punctuation)', async () => {
    mockParseResults.push([
      { spelling: '。', reading: null, vid: null, sid: null, isWord: false },
      { spelling: '！', reading: null, vid: null, sid: null, isWord: false }
    ]);

    const result = await checkSentenceViolations(
      '。！',
      new Set(),
      'fake-api-key',
      null,
      new Set()
    );

    assert.strictEqual(result.count, 0);
  });

  it('full pipeline: enforceVocabLimit with vidSet passes sentences with known conjugations', async () => {
    mockParseResults.push([
      { spelling: '食べた', reading: 'たべた', vid: 3001, sid: 0, isWord: true }
    ]);

    const result = await enforceVocabLimit(
      '食べた。',
      ['食べる'],
      'fake-api-key',
      async () => '',
      1,
      [],
      new Set([3001])
    );

    assert.strictEqual(result.narration, '食べた。');
    assert.strictEqual(result.repairs.length, 0);
    assert.strictEqual(result.failures.length, 0);
  });
});
