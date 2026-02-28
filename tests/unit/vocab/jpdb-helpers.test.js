import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tierFromRank, sleep, parseBatch, lookupVocab, vidVerify, resolveCommonForms } from '../../../scripts/lib/jpdb-helpers.mjs';

describe('tierFromRank', () => {
  it('returns common for rank 1-3000', () => {
    assert.equal(tierFromRank(1), 'common');
    assert.equal(tierFromRank(1500), 'common');
    assert.equal(tierFromRank(3000), 'common');
  });
  it('returns uncommon for rank 3001-6000', () => {
    assert.equal(tierFromRank(3001), 'uncommon');
    assert.equal(tierFromRank(6000), 'uncommon');
  });
  it('returns rare for rank 6001-12000', () => {
    assert.equal(tierFromRank(6001), 'rare');
    assert.equal(tierFromRank(12000), 'rare');
  });
  it('returns epic for rank 12001-20000', () => {
    assert.equal(tierFromRank(12001), 'epic');
    assert.equal(tierFromRank(20000), 'epic');
  });
  it('returns legendary for rank 20001-30000', () => {
    assert.equal(tierFromRank(20001), 'legendary');
    assert.equal(tierFromRank(30000), 'legendary');
  });
  it('returns rejected for rank 30001+', () => {
    assert.equal(tierFromRank(30001), 'rejected');
    assert.equal(tierFromRank(99999), 'rejected');
  });
  it('returns rejected for null/undefined', () => {
    assert.equal(tierFromRank(null), 'rejected');
    assert.equal(tierFromRank(undefined), 'rejected');
  });
});

describe('sleep', () => {
  it('resolves after specified ms', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40, `Expected >= 40ms, got ${elapsed}ms`);
  });
});

// ── parseBatch & lookupVocab tests ──────────────────────────────────

describe('parseBatch', () => {
  let originalFetch;
  let fetchCalls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends a single request for a small batch', async () => {
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({
          vocabulary: [['猫', 'ねこ', 1, 2, ['cat']]],
          tokens: [[[0]]]
        })
      };
    };

    const result = await parseBatch(['猫'], 'test-key', {
      interBatchDelayMs: 0
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://jpdb.io/api/v1/parse');
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.equal(body.text, '猫');
    assert.equal(fetchCalls[0].opts.headers['Authorization'], 'Bearer test-key');
    assert.deepEqual(result.vocabulary, [['猫', 'ねこ', 1, 2, ['cat']]]);
    assert.deepEqual(result.tokens, [[[0]]]);
  });

  it('splits into multiple batches when texts exceed batchSize', async () => {
    let callCount = 0;
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      callCount++;
      const body = JSON.parse(opts.body);
      const words = body.text.split(' ');
      return {
        ok: true,
        json: async () => ({
          vocabulary: words.map((w, i) => [w, w, i, i, [`meaning-${callCount}-${i}`]]),
          tokens: [words.map((_, i) => [i])]
        })
      };
    };

    const texts = ['a', 'b', 'c', 'd', 'e'];
    const result = await parseBatch(texts, 'test-key', {
      batchSize: 2,
      interBatchDelayMs: 0
    });

    // 5 texts / batchSize 2 = 3 batches (2, 2, 1)
    assert.equal(fetchCalls.length, 3);

    // Verify batch contents
    const batch1Body = JSON.parse(fetchCalls[0].opts.body);
    assert.equal(batch1Body.text, 'a b');
    const batch2Body = JSON.parse(fetchCalls[1].opts.body);
    assert.equal(batch2Body.text, 'c d');
    const batch3Body = JSON.parse(fetchCalls[2].opts.body);
    assert.equal(batch3Body.text, 'e');

    // Vocabulary from all batches is merged
    assert.equal(result.vocabulary.length, 2 + 2 + 1);

    // Token indices in later batches must be offset
    // Batch 1 tokens: [[0], [1]]  (no offset)
    // Batch 2 tokens: [[2], [3]]  (offset by 2)
    // Batch 3 tokens: [[4]]       (offset by 4)
    const allTokenIndices = result.tokens.flat().map(t => t[0]);
    assert.deepEqual(allTokenIndices, [0, 1, 2, 3, 4]);
  });

  it('retries once on 429', async () => {
    let callNum = 0;
    globalThis.fetch = async (url, opts) => {
      callNum++;
      fetchCalls.push({ url, opts });
      if (callNum === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => 'Rate limited'
        };
      }
      return {
        ok: true,
        json: async () => ({
          vocabulary: [['水', 'みず', 3, 4, ['water']]],
          tokens: [[[0]]]
        })
      };
    };

    const result = await parseBatch(['水'], 'test-key', {
      interBatchDelayMs: 0,
      rateLimitWaitMs: 50
    });

    assert.equal(fetchCalls.length, 2);
    assert.deepEqual(result.vocabulary, [['水', 'みず', 3, 4, ['water']]]);
  });
});

describe('lookupVocab', () => {
  let originalFetch;
  let fetchCalls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends request with vid/sid pairs', async () => {
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({
          vocabulary_info: [['猫', 'ねこ', 500, ['cat']]]
        })
      };
    };

    const result = await lookupVocab([[1, 2]], 'test-key', ['spelling', 'reading', 'frequency_rank', 'meanings'], {
      interBatchDelayMs: 0
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://jpdb.io/api/v1/lookup-vocabulary');
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.deepEqual(body.list, [[1, 2]]);
    assert.deepEqual(body.fields, ['spelling', 'reading', 'frequency_rank', 'meanings']);
    assert.equal(fetchCalls[0].opts.headers['Authorization'], 'Bearer test-key');
    assert.deepEqual(result.vocabulary_info, [['猫', 'ねこ', 500, ['cat']]]);
  });

  it('splits batches at batchSize boundary', async () => {
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      const body = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          vocabulary_info: body.list.map((pair, i) => [`word-${pair[0]}`, `read-${pair[0]}`, pair[0]])
        })
      };
    };

    // Create 501 pairs to trigger a split at default batchSize=500
    const pairs = Array.from({ length: 501 }, (_, i) => [i, i + 1000]);
    const result = await lookupVocab(pairs, 'test-key', ['spelling'], {
      batchSize: 500,
      interBatchDelayMs: 0
    });

    assert.equal(fetchCalls.length, 2);
    // First batch should have 500 pairs
    const batch1Body = JSON.parse(fetchCalls[0].opts.body);
    assert.equal(batch1Body.list.length, 500);
    // Second batch should have 1 pair
    const batch2Body = JSON.parse(fetchCalls[1].opts.body);
    assert.equal(batch2Body.list.length, 1);
    // Merged result should have all 501 entries
    assert.equal(result.vocabulary_info.length, 501);
  });
});

// ── vidVerify tests ────────────────────────────────────────────────

describe('vidVerify', () => {
  let originalFetch;
  let fetchCalls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns true when parsed vid matches expected vid', async () => {
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({
          vocabulary: [['猫', 'ねこ', 1234, 5678]],
          tokens: [[[0]]]
        })
      };
    };

    const result = await vidVerify('猫', 1234, 'test-key', {
      interBatchDelayMs: 0,
      rateLimitWaitMs: 50
    });

    assert.equal(result, true);
    assert.equal(fetchCalls.length, 1);
  });

  it('returns false when parsed vid does not match expected vid', async () => {
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({
          // 'か' parses as particle with vid=9999, not the expected vid=5555
          vocabulary: [['か', 'か', 9999, 1111]],
          tokens: [[[0]]]
        })
      };
    };

    const result = await vidVerify('か', 5555, 'test-key', {
      interBatchDelayMs: 0,
      rateLimitWaitMs: 50
    });

    assert.equal(result, false);
    assert.equal(fetchCalls.length, 1);
  });
});

// ── resolveCommonForms tests ───────────────────────────────────────

describe('resolveCommonForms', () => {
  let originalFetch;
  let fetchCallNum;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCallNum = 0;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('full pipeline: 栗鼠 resolves to リス at rank 13600', async () => {
    globalThis.fetch = async (url, opts) => {
      fetchCallNum++;
      const body = JSON.parse(opts.body);

      // Call 1: parseBatch on input words ['栗鼠']
      if (fetchCallNum === 1) {
        assert.ok(url.endsWith('/parse'), `Call 1 should be parse, got ${url}`);
        assert.equal(body.text, '栗鼠');
        return {
          ok: true,
          json: async () => ({
            vocabulary: [['栗鼠', 'りす', 1246890, 1191465283, ['squirrel']]],
            tokens: [[[0]]]
          })
        };
      }

      // Call 2: lookupVocab for parsed words — get rank + alt_spellings
      if (fetchCallNum === 2) {
        assert.ok(url.endsWith('/lookup-vocabulary'), `Call 2 should be lookup-vocabulary, got ${url}`);
        assert.deepEqual(body.list, [[1246890, 1191465283]]);
        return {
          ok: true,
          json: async () => ({
            vocabulary_info: [['栗鼠', 'りす', 48900, ['squirrel'], ['りす', 'リス']]]
          })
        };
      }

      // Call 3: parseBatch on alt spellings ['りす', 'リス']
      if (fetchCallNum === 3) {
        assert.ok(url.endsWith('/parse'), `Call 3 should be parse, got ${url}`);
        // Both alts joined with space
        assert.equal(body.text, 'りす リス');
        return {
          ok: true,
          json: async () => ({
            vocabulary: [
              ['りす', 'りす', 1246890, 1191465283],
              ['リス', 'りす', 1246890, 1191465283]
            ],
            tokens: [[[0], [1]]]
          })
        };
      }

      // Call 4: lookupVocab on verified alts — get their frequencies
      if (fetchCallNum === 4) {
        assert.ok(url.endsWith('/lookup-vocabulary'), `Call 4 should be lookup-vocabulary, got ${url}`);
        assert.deepEqual(body.list, [[1246890, 1191465283], [1246890, 1191465283]]);
        return {
          ok: true,
          json: async () => ({
            vocabulary_info: [
              ['りす', 'りす', 39800],
              ['リス', 'りす', 13600]
            ]
          })
        };
      }

      throw new Error(`Unexpected fetch call #${fetchCallNum}: ${url}`);
    };

    const results = await resolveCommonForms(['栗鼠'], 'test-key', {
      interBatchDelayMs: 0,
      rateLimitWaitMs: 50
    });

    assert.equal(results.length, 1);
    const r = results[0];

    assert.equal(r.word, '栗鼠');
    assert.equal(r.bestForm, 'リス');
    assert.equal(r.reading, 'りす');
    assert.equal(r.rank, 13600);
    assert.deepEqual(r.meanings, ['squirrel']);

    // allForms should include all 3 spellings
    assert.equal(r.allForms.length, 3);
    const formMap = Object.fromEntries(r.allForms.map(f => [f.spelling, f.rank]));
    assert.equal(formMap['栗鼠'], 48900);
    assert.equal(formMap['りす'], 39800);
    assert.equal(formMap['リス'], 13600);

    // Should have made exactly 4 fetch calls
    assert.equal(fetchCallNum, 4);
  });
});
