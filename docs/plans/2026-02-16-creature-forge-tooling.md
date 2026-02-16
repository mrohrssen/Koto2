# Creature Forge Tooling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the creature forge skill's inline Python/HTML/curl templates with permanent, tested Node.js scripts that Claude invokes instead of rewriting from scratch each session.

**Architecture:** Three new files — a Gemini image generation CLI script, an HTML preview + HTTP server CLI script, and a JPDB helper module. The creature forge skill (SKILL.md) is updated to reference these scripts instead of embedding raw code templates. The project already has `@google/generative-ai` (v0.21.0) installed; we use it for Gemini calls instead of raw fetch.

**Tech Stack:** Node.js ESM, `@google/generative-ai` SDK, `node:http`, `node:net`, `node:fs/promises`

---

### Task 1: Create `scripts/lib/` directory and JPDB helpers — pure utilities

**Files:**
- Create: `scripts/lib/jpdb-helpers.mjs`
- Test: `tests/unit/jpdb-helpers.test.js`

**Step 1: Write the failing test for `tierFromRank` and `sleep`**

These are pure functions with no API calls — easy to test first.

```js
// tests/unit/jpdb-helpers.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tierFromRank, sleep } from '../../scripts/lib/jpdb-helpers.mjs';

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
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/jpdb-helpers.test.js`
Expected: FAIL — module `../../scripts/lib/jpdb-helpers.mjs` not found

**Step 3: Implement `tierFromRank` and `sleep`**

```js
// scripts/lib/jpdb-helpers.mjs
// JPDB API helper functions for creature forge and other vocabulary workflows.
// Provides rate-limited, batch-aware API wrappers and pure utility functions.

const JPDB_API = 'https://jpdb.io/api/v1';

const TIERS = [
  { name: 'common', min: 1, max: 3000 },
  { name: 'uncommon', min: 3001, max: 6000 },
  { name: 'rare', min: 6001, max: 12000 },
  { name: 'epic', min: 12001, max: 20000 },
  { name: 'legendary', min: 20001, max: 30000 },
];

export function tierFromRank(rank) {
  if (rank == null) return 'rejected';
  const tier = TIERS.find(t => rank >= t.min && rank <= t.max);
  return tier ? tier.name : 'rejected';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/jpdb-helpers.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/lib/jpdb-helpers.mjs tests/unit/jpdb-helpers.test.js
git commit -m "feat: add JPDB helpers — tierFromRank and sleep utilities"
```

---

### Task 2: JPDB helpers — `parseBatch` and `lookupVocab` API wrappers

**Files:**
- Modify: `scripts/lib/jpdb-helpers.mjs`
- Test: `tests/unit/jpdb-helpers.test.js` (add tests)

**Step 1: Write failing tests for `parseBatch` and `lookupVocab`**

These call the JPDB API, so we mock `fetch`. Test the batching, rate-limit detection, and response parsing.

```js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatch, lookupVocab } from '../../scripts/lib/jpdb-helpers.mjs';

describe('parseBatch', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends a single parse request for small batches', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          vocabulary: [['犬', 'いぬ', 100, 200, ['dog']]],
          tokens: [[{ vocabulary_index: 0 }]],
        }),
      };
    };

    const result = await parseBatch(
      ['犬'],
      'test-key',
      { tokenFields: ['vocabulary_index'], vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'] }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.text, '犬');
    assert.ok(result.vocabulary);
  });

  it('splits into multiple batches when exceeding batchSize', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ vocabulary: [], tokens: [] }),
      };
    };

    // 5 words with batchSize 2 = 3 batches (2, 2, 1)
    await parseBatch(
      ['一', '二', '三', '四', '五'],
      'test-key',
      { batchSize: 2 }
    );

    assert.equal(calls.length, 3);
  });

  it('retries on 429 with 60s wait', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 429, text: async () => 'rate limited' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ vocabulary: [], tokens: [] }),
      };
    };

    // Use a short sleep override for testing — parseBatch accepts sleepFn in options
    const result = await parseBatch(['犬'], 'test-key', { rateLimitWaitMs: 50, interBatchDelayMs: 0 });
    assert.equal(callCount, 2);
  });
});

describe('lookupVocab', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends lookup request with vid/sid pairs', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          vocabulary_info: [['犬', 'いぬ', 1200, ['dog'], []]],
        }),
      };
    };

    const result = await lookupVocab(
      [[100, 200]],
      'test-key',
      ['spelling', 'reading', 'frequency_rank', 'meanings', 'alt_spellings']
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].list, [[100, 200]]);
    assert.ok(result.vocabulary_info);
  });

  it('splits batches at 500', async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ vocabulary_info: [] }),
      };
    };

    const pairs = Array.from({ length: 501 }, (_, i) => [i, i]);
    await lookupVocab(pairs, 'test-key', ['spelling'], { interBatchDelayMs: 0 });
    assert.equal(calls.length, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/jpdb-helpers.test.js`
Expected: FAIL — `parseBatch` and `lookupVocab` not exported

**Step 3: Implement `parseBatch` and `lookupVocab`**

Add to `scripts/lib/jpdb-helpers.mjs`:

```js
// Internal: make a single JPDB API call with 429 retry
async function jpdbCall(endpoint, body, apiKey, { rateLimitWaitMs = 60000 } = {}) {
  const res = await fetch(`${JPDB_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    console.error(`JPDB 429 rate limited — waiting ${rateLimitWaitMs / 1000}s...`);
    await sleep(rateLimitWaitMs);
    // Retry once
    const retry = await fetch(`${JPDB_API}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!retry.ok) throw new Error(`JPDB ${endpoint}: ${retry.status} ${await retry.text()}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`JPDB ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Parse Japanese text to get vocabulary entries (vid, sid, spelling, reading, etc.)
 * Automatically batches if input exceeds batchSize.
 *
 * @param {string[]} texts - Array of Japanese strings to parse
 * @param {string} apiKey - JPDB API key
 * @param {object} [options]
 * @param {string[]} [options.tokenFields=['vocabulary_index']]
 * @param {string[]} [options.vocabularyFields=['spelling','reading','vid','sid','meanings']]
 * @param {number} [options.batchSize=30] - Max words per parse call
 * @param {number} [options.interBatchDelayMs=1000] - Delay between batches
 * @param {number} [options.rateLimitWaitMs=60000] - Wait time on 429
 * @returns {object} Merged parse result with vocabulary and tokens arrays
 */
export async function parseBatch(texts, apiKey, options = {}) {
  const {
    tokenFields = ['vocabulary_index'],
    vocabularyFields = ['spelling', 'reading', 'vid', 'sid', 'meanings'],
    batchSize = 30,
    interBatchDelayMs = 1000,
    rateLimitWaitMs = 60000,
  } = options;

  const allVocabulary = [];
  const allTokens = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    if (i > 0) await sleep(interBatchDelayMs);

    const batch = texts.slice(i, i + batchSize);
    const text = batch.join(' ');

    const result = await jpdbCall('parse', {
      text,
      token_fields: tokenFields,
      vocabulary_fields: vocabularyFields,
    }, apiKey, { rateLimitWaitMs });

    // Merge results — offset vocabulary indices in tokens
    const vocabOffset = allVocabulary.length;
    allVocabulary.push(...(result.vocabulary || []));

    for (const token of (result.tokens || [])) {
      // Each token is an array of field values; first field is vocabulary_index
      if (token[0] != null && typeof token[0] === 'number') {
        allTokens.push([token[0] + vocabOffset, ...token.slice(1)]);
      } else {
        allTokens.push(token);
      }
    }
  }

  return { vocabulary: allVocabulary, tokens: allTokens };
}

/**
 * Lookup vocabulary info by vid/sid pairs.
 * Automatically batches if input exceeds 500 pairs.
 *
 * @param {number[][]} vidSidPairs - Array of [vid, sid] pairs
 * @param {string} apiKey - JPDB API key
 * @param {string[]} fields - Fields to request (spelling, reading, frequency_rank, meanings, alt_spellings, etc.)
 * @param {object} [options]
 * @param {number} [options.batchSize=500]
 * @param {number} [options.interBatchDelayMs=1000]
 * @param {number} [options.rateLimitWaitMs=60000]
 * @returns {object} Merged lookup result with vocabulary_info array
 */
export async function lookupVocab(vidSidPairs, apiKey, fields, options = {}) {
  const {
    batchSize = 500,
    interBatchDelayMs = 1000,
    rateLimitWaitMs = 60000,
  } = options;

  const allInfo = [];

  for (let i = 0; i < vidSidPairs.length; i += batchSize) {
    if (i > 0) await sleep(interBatchDelayMs);

    const batch = vidSidPairs.slice(i, i + batchSize);
    const result = await jpdbCall('lookup-vocabulary', {
      list: batch,
      fields,
    }, apiKey, { rateLimitWaitMs });

    allInfo.push(...(result.vocabulary_info || []));
  }

  return { vocabulary_info: allInfo };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/jpdb-helpers.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/lib/jpdb-helpers.mjs tests/unit/jpdb-helpers.test.js
git commit -m "feat: add parseBatch and lookupVocab JPDB API wrappers"
```

---

### Task 3: JPDB helpers — `vidVerify` and `resolveCommonForms`

**Files:**
- Modify: `scripts/lib/jpdb-helpers.mjs`
- Modify: `tests/unit/jpdb-helpers.test.js`

**Step 1: Write failing tests for `vidVerify` and `resolveCommonForms`**

```js
describe('vidVerify', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns true when parsed vid matches expected', async () => {
    globalThis.fetch = async (url, opts) => ({
      ok: true,
      status: 200,
      json: async () => ({
        vocabulary: [['リス', 'りす', 1246890, 1191465283]],
        tokens: [[0]],
      }),
    });

    const result = await vidVerify('リス', 1246890, 'test-key', { interBatchDelayMs: 0 });
    assert.equal(result, true);
  });

  it('returns false when parsed vid does not match', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        vocabulary: [['か', 'か', 999, 888]],
        tokens: [[0]],
      }),
    });

    const result = await vidVerify('か', 1246890, 'test-key', { interBatchDelayMs: 0 });
    assert.equal(result, false);
  });
});

describe('resolveCommonForms', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('resolves a word to its most common spelling form', async () => {
    let callNum = 0;
    globalThis.fetch = async (url, opts) => {
      callNum++;
      const body = JSON.parse(opts.body);

      if (body.text && callNum === 1) {
        // Step 1: parse initial words
        return {
          ok: true, status: 200,
          json: async () => ({
            vocabulary: [['栗鼠', 'りす', 1246890, 1191465283, ['squirrel']]],
            tokens: [[0]],
          }),
        };
      }
      if (body.list && body.fields && callNum === 2) {
        // Step 2: lookup vocab with alt_spellings
        return {
          ok: true, status: 200,
          json: async () => ({
            vocabulary_info: [['栗鼠', 'りす', 48900, ['squirrel'], ['りす', 'リス']]],
          }),
        };
      }
      if (body.text && callNum === 3) {
        // Step 3: parse alt spellings
        return {
          ok: true, status: 200,
          json: async () => ({
            vocabulary: [
              ['りす', 'りす', 1246890, 1191465284],
              ['リス', 'りす', 1246890, 1191465285],
            ],
            tokens: [[0], [1]],
          }),
        };
      }
      if (body.list && callNum === 4) {
        // Step 4: lookup alt frequencies
        return {
          ok: true, status: 200,
          json: async () => ({
            vocabulary_info: [
              ['りす', 'りす', 39800],
              ['リス', 'りす', 13600],
            ],
          }),
        };
      }
      throw new Error(`Unexpected call #${callNum}`);
    };

    const results = await resolveCommonForms(['栗鼠'], 'test-key', { interBatchDelayMs: 0, rateLimitWaitMs: 50 });

    assert.equal(results.length, 1);
    assert.equal(results[0].bestForm, 'リス');
    assert.equal(results[0].rank, 13600);
    assert.equal(results[0].reading, 'りす');
    assert.ok(results[0].allForms.length >= 2);
    assert.deepEqual(results[0].meanings, ['squirrel']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/jpdb-helpers.test.js`
Expected: FAIL — `vidVerify` and `resolveCommonForms` not exported

**Step 3: Implement `vidVerify` and `resolveCommonForms`**

Add to `scripts/lib/jpdb-helpers.mjs`:

```js
/**
 * Verify that a spelling resolves to the expected vid when parsed.
 * Short/ambiguous spellings often parse as particles or common verbs.
 *
 * @param {string} spelling - The spelling to verify
 * @param {number} expectedVid - The expected vid
 * @param {string} apiKey
 * @param {object} [options] - Passed through to parseBatch
 * @returns {boolean}
 */
export async function vidVerify(spelling, expectedVid, apiKey, options = {}) {
  const result = await parseBatch([spelling], apiKey, {
    vocabularyFields: ['spelling', 'reading', 'vid', 'sid'],
    batchSize: 1,
    ...options,
  });

  for (const entry of result.vocabulary || []) {
    // entry: [spelling, reading, vid, sid]
    if (entry[2] === expectedVid) return true;
  }
  return false;
}

/**
 * Resolve words to their most common spelling forms.
 * Full 3-step pipeline: parse → lookup alt_spellings → vid-verify → pick lowest rank.
 *
 * @param {string[]} words - Japanese words to resolve (use unambiguous forms: kanji/katakana)
 * @param {string} apiKey
 * @param {object} [options] - Rate limit overrides (interBatchDelayMs, rateLimitWaitMs)
 * @returns {Array<{word: string, bestForm: string, reading: string, rank: number|null, allForms: Array<{spelling: string, rank: number|null}>, meanings: string[]}>}
 */
export async function resolveCommonForms(words, apiKey, options = {}) {
  const opts = { interBatchDelayMs: 1000, rateLimitWaitMs: 60000, ...options };

  // Step 1: Parse all words to get vid/sid
  const parseResult = await parseBatch(words, apiKey, {
    vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
    ...opts,
  });

  // Map input words to their parsed entries
  const parsed = [];
  const vocabBySpelling = new Map();
  for (const entry of parseResult.vocabulary || []) {
    vocabBySpelling.set(entry[0], entry); // [spelling, reading, vid, sid, meanings]
  }

  for (const word of words) {
    const entry = vocabBySpelling.get(word);
    if (entry) {
      parsed.push({ word, spelling: entry[0], reading: entry[1], vid: entry[2], sid: entry[3], meanings: entry[4] || [] });
    } else {
      // Try matching by reading
      let found = null;
      for (const entry of parseResult.vocabulary || []) {
        if (entry[1] === word || word.includes(entry[0])) {
          found = entry;
          break;
        }
      }
      if (found) {
        parsed.push({ word, spelling: found[0], reading: found[1], vid: found[2], sid: found[3], meanings: found[4] || [] });
      } else {
        parsed.push({ word, spelling: word, reading: '', vid: null, sid: null, meanings: [] });
      }
    }
  }

  // Step 2: Lookup alt_spellings + frequency for all parsed words
  const validParsed = parsed.filter(p => p.vid != null);
  let altSpellingsMap = new Map(); // word -> { initialRank, altSpellings }

  if (validParsed.length > 0) {
    await sleep(opts.interBatchDelayMs);
    const lookupResult = await lookupVocab(
      validParsed.map(p => [p.vid, p.sid]),
      apiKey,
      ['spelling', 'reading', 'frequency_rank', 'meanings', 'alt_spellings'],
      opts
    );

    for (let i = 0; i < validParsed.length; i++) {
      const info = lookupResult.vocabulary_info[i];
      // info: [spelling, reading, frequency_rank, meanings, alt_spellings]
      altSpellingsMap.set(validParsed[i].word, {
        initialSpelling: info[0],
        initialReading: info[1],
        initialRank: info[2],
        meanings: info[3] || validParsed[i].meanings,
        altSpellings: info[4] || [],
        vid: validParsed[i].vid,
      });
    }
  }

  // Step 3: Parse + vid-verify alt spellings, then lookup their frequencies
  const altsToParse = [];
  for (const [word, info] of altSpellingsMap) {
    for (const alt of info.altSpellings) {
      altsToParse.push({ word, altSpelling: alt, expectedVid: info.vid });
    }
  }

  const verifiedAlts = []; // { word, altSpelling, vid, sid }
  if (altsToParse.length > 0) {
    await sleep(opts.interBatchDelayMs);
    const altParseResult = await parseBatch(
      altsToParse.map(a => a.altSpelling),
      apiKey,
      { vocabularyFields: ['spelling', 'reading', 'vid', 'sid'], ...opts }
    );

    const altVocabBySpelling = new Map();
    for (const entry of altParseResult.vocabulary || []) {
      altVocabBySpelling.set(entry[0], entry);
    }

    for (const { word, altSpelling, expectedVid } of altsToParse) {
      const entry = altVocabBySpelling.get(altSpelling);
      if (entry && entry[2] === expectedVid) {
        verifiedAlts.push({ word, altSpelling, vid: entry[2], sid: entry[3] });
      }
    }
  }

  // Lookup frequencies for verified alts
  let altFreqs = new Map(); // "word|altSpelling" -> rank
  if (verifiedAlts.length > 0) {
    await sleep(opts.interBatchDelayMs);
    const altFreqResult = await lookupVocab(
      verifiedAlts.map(a => [a.vid, a.sid]),
      apiKey,
      ['spelling', 'reading', 'frequency_rank'],
      opts
    );

    for (let i = 0; i < verifiedAlts.length; i++) {
      const info = altFreqResult.vocabulary_info[i];
      altFreqs.set(`${verifiedAlts[i].word}|${verifiedAlts[i].altSpelling}`, {
        spelling: info[0],
        reading: info[1],
        rank: info[2],
      });
    }
  }

  // Build final results: for each word, pick the form with the lowest rank
  const results = [];
  for (const p of parsed) {
    if (p.vid == null) {
      results.push({ word: p.word, bestForm: p.word, reading: '', rank: null, allForms: [], meanings: [] });
      continue;
    }

    const info = altSpellingsMap.get(p.word);
    const allForms = [{ spelling: info.initialSpelling, rank: info.initialRank }];

    for (const { word, altSpelling } of verifiedAlts.filter(a => a.word === p.word)) {
      const freq = altFreqs.get(`${word}|${altSpelling}`);
      if (freq) {
        allForms.push({ spelling: freq.spelling, rank: freq.rank });
      }
    }

    // Sort by rank ascending (null = infinity)
    allForms.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const best = allForms[0];

    results.push({
      word: p.word,
      bestForm: best.spelling,
      reading: info.initialReading,
      rank: best.rank,
      allForms,
      meanings: info.meanings,
    });
  }

  return results;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/jpdb-helpers.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add scripts/lib/jpdb-helpers.mjs tests/unit/jpdb-helpers.test.js
git commit -m "feat: add vidVerify and resolveCommonForms JPDB helpers"
```

---

### Task 4: Create Gemini image generation script

**Files:**
- Create: `scripts/creature-gemini-gen.mjs`

This script uses `@google/generative-ai` (already in `package.json` as `^0.21.0`) instead of raw curl/fetch.

**Step 1: Write the script**

```js
#!/usr/bin/env node
// Generate 3 creature concept art images via Gemini Flash.
//
// Usage:
//   node scripts/creature-gemini-gen.mjs \
//     --id kamedor \
//     --visual-tier rare \
//     --descriptions /tmp/creature-descriptions.json
//
// Input JSON: { "a": "Description A...", "b": "Description B...", "c": "Description C..." }
// Output JSON to stdout: { "a": { "status": "ok", "bytes": 123456 }, ... }
// Images written to: /tmp/creature-forge-{id}-{a|b|c}.png

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TIER_DIRECTIVES = {
  common: 'Cute mascot creature — round, simple, big eyes, soft colors, huggable, like a Bangboo or Mini Seelie. Minimal detail, maximum charm.',
  uncommon: 'Companion creature — balanced proportions, moderate detail, developing elemental identity. Approachable but with personality.',
  rare: 'Impressive creature — striking design, complex details, strong elemental effects, commanding presence. Noble or fierce.',
  epic: 'Powerful creature — grand proportions, dramatic effects, elaborate armor or energy. Imposing boss-tier presence.',
  legendary: 'Mythical creature — otherworldly, cosmic grandeur, maximum visual complexity, flowing energy, divine or primordial aura.',
};

function buildPrompt(description, metadata) {
  const tierDirective = TIER_DIRECTIVES[metadata.visualTier] || TIER_DIRECTIVES.common;
  return `Game-ready creature sprite, single character on a solid magenta (#FF00FF) background.
The background MUST be perfectly flat, uniform magenta with NO gradients, shadows, or ground.
Full body, front-facing idle pose. Anime creature collector style
(Pokemon meets Genshin Impact) — cel-shaded lighting, expressive eyes.
NOT chibi — proper proportions but still stylized.
No text, no UI, no humans. The creature must not contain any magenta (#FF00FF) in its own design.

CRITICAL — This is for a language learning game. The creature represents the word "${metadata.baseMeaning}".
Looking at this creature, a viewer must immediately think "${metadata.baseMeaning}" — not any other noun.
The creature should visually BE ${metadata.baseMeaning}, not be a different animal/object that relates to it.
Do NOT draw a real-world animal or object unless the base word IS that animal/object.

Rarity: ${metadata.visualTier} — ${tierDirective}
Creature: ${metadata.name} the ${metadata.modifier} ${metadata.baseMeaning}
Element: ${metadata.element}
Archetype: ${metadata.archetype}
Moves: ${metadata.attack} / ${metadata.ultimate}

Visual description: ${description}`;
}

async function generateImage(model, prompt, outPath) {
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['image', 'text'] },
    });

    const parts = result.response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const imgBytes = Buffer.from(part.inlineData.data, 'base64');
        await writeFile(outPath, imgBytes);
        return { status: 'ok', bytes: imgBytes.length };
      }
    }
    return { status: 'failed', error: 'no inlineData in response' };
  } catch (err) {
    // Retry once on network errors (not content policy)
    if (err.message?.includes('fetch') || err.message?.includes('ECONNRESET') || err.message?.includes('ETIMEDOUT')) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['image', 'text'] },
        });
        const parts = result.response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            const imgBytes = Buffer.from(part.inlineData.data, 'base64');
            await writeFile(outPath, imgBytes);
            return { status: 'ok', bytes: imgBytes.length };
          }
        }
        return { status: 'failed', error: 'no inlineData on retry' };
      } catch (retryErr) {
        return { status: 'failed', error: retryErr.message };
      }
    }
    return { status: 'failed', error: err.message };
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      'visual-tier': { type: 'string' },
      descriptions: { type: 'string' },
    },
  });

  if (!values.id || !values['visual-tier'] || !values.descriptions) {
    console.error('Usage: node scripts/creature-gemini-gen.mjs --id <id> --visual-tier <tier> --descriptions <path.json>');
    process.exit(1);
  }

  // Read API key
  const projectRoot = new URL('..', import.meta.url).pathname;
  const keyPath = `${projectRoot}data/.creature-forge-gemini-key`;
  let apiKey;
  try {
    apiKey = (await readFile(keyPath, 'utf8')).trim();
  } catch {
    console.error(JSON.stringify({ error: `No API key found at ${keyPath}` }));
    process.exit(1);
  }

  // Read descriptions
  const descriptions = JSON.parse(await readFile(values.descriptions, 'utf8'));
  if (!descriptions.a || !descriptions.b || !descriptions.c) {
    console.error(JSON.stringify({ error: 'Descriptions JSON must have keys a, b, c' }));
    process.exit(1);
  }

  // Read metadata (descriptions file may also contain metadata, or we take it from args)
  const metadata = {
    name: descriptions.name || values.id,
    modifier: descriptions.modifier || '',
    baseMeaning: descriptions.baseMeaning || '',
    element: descriptions.element || '',
    archetype: descriptions.archetype || '',
    attack: descriptions.attack || '',
    ultimate: descriptions.ultimate || '',
    visualTier: values['visual-tier'],
  };

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-image-generation' });

  // Generate all 3 concurrently
  const variants = ['a', 'b', 'c'];
  const results = {};

  const promises = variants.map(async (v) => {
    const prompt = buildPrompt(descriptions[v], metadata);
    const outPath = `/tmp/creature-forge-${values.id}-${v}.png`;
    results[v] = await generateImage(model, prompt, outPath);
  });

  await Promise.allSettled(promises);

  // Output results as JSON to stdout
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
```

**Step 2: Syntax check**

Run: `node --check scripts/creature-gemini-gen.mjs && echo "OK"`
Expected: OK

**Step 3: Test with `--help` style usage error**

Run: `node scripts/creature-gemini-gen.mjs 2>&1 | head -1`
Expected: `Usage: node scripts/creature-gemini-gen.mjs --id <id> --visual-tier <tier> --descriptions <path.json>`

**Step 4: Commit**

```bash
git add scripts/creature-gemini-gen.mjs
git commit -m "feat: add Gemini image generation CLI script for creature forge"
```

---

### Task 5: Create HTML preview + HTTP server script

**Files:**
- Create: `scripts/creature-preview.mjs`

**Step 1: Write the script**

The HTML template is extracted from the current SKILL.md (lines 512-592). The script generates it from JSON metadata and serves it.

```js
#!/usr/bin/env node
// Generate creature concept art preview HTML and serve it via HTTP.
//
// Usage:
//   node scripts/creature-preview.mjs --id kamedor --metadata /tmp/creature-metadata.json
//   node scripts/creature-preview.mjs --cleanup --pid 12345
//
// Metadata JSON: { name, modifier, baseMeaning, element, archetype, visualTier, attack, ultimate, descriptions: {a, b, c} }
// Output JSON to stdout: { "url": "http://localhost:PORT/creature-forge-ID-preview.html", "pid": 12345 }

import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { parseArgs } from 'node:util';
import { join, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const MIME_TYPES = {
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

function generateHTML(id, meta) {
  const tierClass = `rarity-${meta.visualTier || 'common'}`;
  const variants = ['a', 'b', 'c'];
  const labels = ['A', 'B', 'C'];

  const cards = variants.map((v, i) => `
    <div class="card">
      <div class="card-header">
        <span class="card-label">${labels[i]}</span>
        <span class="card-provider">Gemini Flash</span>
      </div>
      <img src="creature-forge-${id}-${v}.png" alt="Variant ${labels[i]}">
      <div class="card-body">
        <p>${escapeHtml(meta.descriptions[v] || '')}</p>
        <div class="moves">\u2694 ${escapeHtml(meta.attack || '')} \u00b7 \u2726 ${escapeHtml(meta.ultimate || '')}</div>
      </div>
    </div>`).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.name)} the ${escapeHtml(meta.modifier)} ${escapeHtml(meta.baseMeaning)} \u2014 Concept Art</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }
  .subtitle { text-align: center; font-size: 0.9rem; color: #888; margin-bottom: 8px; }
  .info-note { text-align: center; font-size: 0.8rem; color: #666; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; margin: 0 4px; }
  .badge.element { background: #1a3a5c; color: #5ba8f5; }
  .badge.archetype { background: #3a1a3c; color: #c77dff; }
  .badge.rarity-common { background: #2a3a2a; color: #8bc34a; }
  .badge.rarity-uncommon { background: #1a3a3a; color: #4dd0e1; }
  .badge.rarity-rare { background: #1a2a4a; color: #5c6bc0; }
  .badge.rarity-epic { background: #3a1a4a; color: #ab47bc; }
  .badge.rarity-legendary { background: #3a2a0a; color: #ffd54f; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 1400px; margin: 0 auto; }
  .card { background: #14141f; border: 1px solid #2a2a3a; border-radius: 12px; overflow: hidden; }
  .card-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px 0; }
  .card-label { font-size: 1.6rem; font-weight: bold; color: #5ba8f5; }
  .card-provider { font-size: 0.7rem; padding: 2px 8px; border-radius: 8px; background: #1a2a3a; color: #4fc3f7; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
  .card-body { padding: 10px 14px 14px; }
  .card-body p { font-size: 0.8rem; line-height: 1.45; color: #bbb; }
  .moves { margin-top: 6px; font-size: 0.75rem; color: #888; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; max-width: 500px; } }
</style>
</head>
<body>
  <h1>${escapeHtml(meta.name)} the ${escapeHtml(meta.modifier)} ${escapeHtml(meta.baseMeaning)}</h1>
  <div class="subtitle">
    <span class="badge ${tierClass}">${escapeHtml(meta.visualTier || 'common')}</span>
    <span class="badge element">${escapeHtml(meta.element || '')}</span>
    <span class="badge archetype">${escapeHtml(meta.archetype || '')}</span>
  </div>
  <div class="info-note">Gemini Flash &nbsp;|&nbsp; Magenta BG for chroma-key</div>

  <div class="grid">
${cards}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      metadata: { type: 'string' },
      cleanup: { type: 'boolean', default: false },
      pid: { type: 'string' },
    },
  });

  // Cleanup mode: kill a previous server by PID
  if (values.cleanup) {
    if (!values.pid) {
      console.error('Usage: node scripts/creature-preview.mjs --cleanup --pid <pid>');
      process.exit(1);
    }
    try {
      process.kill(parseInt(values.pid), 'SIGTERM');
      console.log(JSON.stringify({ status: 'killed', pid: parseInt(values.pid) }));
    } catch (err) {
      console.log(JSON.stringify({ status: 'not_found', pid: parseInt(values.pid), error: err.message }));
    }
    return;
  }

  if (!values.id || !values.metadata) {
    console.error('Usage: node scripts/creature-preview.mjs --id <id> --metadata <path.json>');
    process.exit(1);
  }

  // Read metadata
  const meta = JSON.parse(await readFile(values.metadata, 'utf8'));

  // Generate HTML
  const html = generateHTML(values.id, meta);
  const htmlFilename = `creature-forge-${values.id}-preview.html`;
  const htmlPath = join('/tmp', htmlFilename);
  await writeFile(htmlPath, html);

  // Find free port and start server
  const port = await findFreePort();

  const server = createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const filename = urlPath === '/' ? htmlFilename : urlPath.slice(1);
    const filePath = join('/tmp', filename);

    try {
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end('Server error');
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}/${htmlFilename}`;
    // Output JSON so Claude can parse the URL and PID
    console.log(JSON.stringify({ url, pid: process.pid }));
  });

  // Keep server running until killed
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
```

**Step 2: Syntax check**

Run: `node --check scripts/creature-preview.mjs && echo "OK"`
Expected: OK

**Step 3: Test with usage error**

Run: `node scripts/creature-preview.mjs 2>&1 | head -1`
Expected: `Usage: node scripts/creature-preview.mjs --id <id> --metadata <path.json>`

**Step 4: Commit**

```bash
git add scripts/creature-preview.mjs
git commit -m "feat: add creature preview HTML generator + HTTP server script"
```

---

### Task 6: Update SKILL.md to use new scripts

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/SKILL.md`

This is the largest task — replacing inline code templates with script invocations.

**Step 1: Fix the Gemini model reference**

On line 391, change `gemini-2.0-flash-preview-image-generation` to `gemini-2.5-flash-preview-image-generation`.

Also change the model reference on line 475 (inside the Python script template that will be replaced).

**Step 2: Replace JPDB curl examples (lines 174-245) with helper module guidance**

Replace the "JPDB API Integration" section. Keep the conceptual explanation (what Step 1/2/3 do and why) but replace the curl examples with guidance to use the helper module:

```markdown
## JPDB API Integration

**Use the helper module at `scripts/lib/jpdb-helpers.mjs`** instead of writing raw curl commands. The module handles batching, rate limiting (1s between calls), 429 retry (60s wait), vid verification, and batch splitting automatically.

### Read API Key

```bash
JPDB_KEY=$(cat /Users/michia/Documents/jrpg/data/.creature-forge-jpdb-key)
```

### Quick lookup (most sessions)

Write a small script that imports the helpers. Example for looking up a creature's base word + skill candidates:

```js
#!/usr/bin/env node
import { resolveCommonForms, tierFromRank } from './scripts/lib/jpdb-helpers.mjs';
import { readFile } from 'fs/promises';

const words = ['鋏', '切る', '挟む', '研ぐ', '裂く', '折る'];
const apiKey = (await readFile('data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);

for (const r of results) {
  console.log(`${r.bestForm} (${r.reading}) — rank ${r.rank} [${tierFromRank(r.rank)}]`);
  console.log(`  meanings: ${JSON.stringify(r.meanings)}`);
  console.log(`  all forms: ${r.allForms.map(f => `${f.spelling}(${f.rank})`).join(', ')}`);
}
```

### Advanced usage (compound verbs, custom batching)

For unusual patterns (compound verb stripping, katakana-only resolution, etc.), import the low-level primitives directly:

```js
import { parseBatch, lookupVocab, vidVerify, sleep } from './scripts/lib/jpdb-helpers.mjs';
```

- `parseBatch(texts, apiKey, options)` — parse Japanese text, get vid/sid/spelling/reading
- `lookupVocab(vidSidPairs, apiKey, fields, options)` — lookup frequency, meanings, alt_spellings
- `vidVerify(spelling, expectedVid, apiKey)` — check if a spelling resolves to the expected word
- `sleep(ms)` — rate-limit delay

All functions handle batching and 429 retry internally. See `scripts/lib/jpdb-helpers.mjs` for full JSDoc.
```

Keep the existing rules section (lines 237-245) about batching, frequency gates, compound verb retry, rate limits, and showing raw JPDB definitions — those are conceptual rules the agent needs to follow regardless of implementation.

**Step 3: Replace Section 9 inline code (lines 383-633) with script invocations**

Replace the Python script template, HTML template, and server setup with:

```markdown
### 9 — Concept Art Preview

Generate concept art images for all 3 descriptions from Section 8 using **Gemini Flash**, then display them in a browser so the user can compare visually.

**IMPORTANT: Gemini Flash is the ONLY image generation provider. Do NOT use DALL-E, Stable Diffusion, Midjourney, OpenAI, or any other image API. The total output is exactly 3 images (A, B, C). No exceptions.**

**Step 1 — Write descriptions JSON:**

Write a JSON file to `/tmp/creature-descriptions.json` with descriptions and metadata:

```json
{
  "a": "Description A full text...",
  "b": "Description B full text...",
  "c": "Description C full text...",
  "name": "Kamedor",
  "modifier": "Ancient",
  "baseMeaning": "Turtle",
  "element": "water",
  "archetype": "Tank/Healer",
  "attack": "Bite",
  "ultimate": "Harden"
}
```

**Step 2 — Generate images:**

```bash
node scripts/creature-gemini-gen.mjs --id ${ID} --visual-tier ${VISUAL_TIER} --descriptions /tmp/creature-descriptions.json
```

This outputs JSON to stdout reporting success/failure for each variant. Images are written to `/tmp/creature-forge-{id}-a.png`, `-b.png`, `-c.png`.

If the key file `data/.creature-forge-gemini-key` doesn't exist, the script exits with an error. In that case, skip image generation: "No API key found — pick your description (A/B/C) based on the text above."

**Step 3 — Write metadata JSON and serve preview:**

Write `/tmp/creature-metadata.json`:

```json
{
  "name": "Kamedor",
  "modifier": "Ancient",
  "baseMeaning": "Turtle",
  "element": "water",
  "archetype": "Tank/Healer",
  "visualTier": "rare",
  "attack": "Bite",
  "ultimate": "Harden",
  "descriptions": {
    "a": "Description A...",
    "b": "Description B...",
    "c": "Description C..."
  }
}
```

Then serve it:

```bash
node scripts/creature-preview.mjs --id ${ID} --metadata /tmp/creature-metadata.json &
```

The script outputs JSON with `url` and `pid`. Parse the URL and navigate Playwright to it.

**Playwright tab handling:**
- If the browser already has content from another session, use `browser_tabs` with action `new` to open a new tab, then `browser_navigate` to the URL.
- If the browser is fresh, just use `browser_navigate` directly.

Then take a screenshot with `browser_take_screenshot` (full page) so the user can see the images inline.

**After viewing, ask:**

> Which visual direction do you prefer? **(A / B / C)** — or tell me what to change.

**Save selected image to staging:**

When the user picks a variant (A/B/C), copy the chosen image:

```bash
mkdir -p /Users/michia/Documents/jrpg/data/creature-staging-images
cp /tmp/creature-forge-${ID}-${VARIANT}.png /Users/michia/Documents/jrpg/data/creature-staging-images/${ID}.png
```

Confirm: **"Saved concept art to `data/creature-staging-images/[id].png` (magenta BG, ready for background removal)."**

**Cleanup:** Kill the preview server when done:

```bash
node scripts/creature-preview.mjs --cleanup --pid ${PID}
```

**Error handling:**
- If any image generation failed (check the gen script's JSON output), show whichever images succeeded. Failed variants appear as broken images in the preview — note this to the user.
- If ALL images failed, fall back to text-only: "Image generation failed — pick based on descriptions above."
```

**Step 4: Verify SKILL.md syntax**

Read through the modified file to ensure markdown formatting is correct and all section references are consistent.

**Step 5: Commit**

```bash
git add .claude/skills/creature-forge/SKILL.md
git commit -m "refactor: update creature forge skill to use hardened scripts"
```

---

### Task 7: End-to-end smoke test

**Files:** None (manual verification)

**Step 1: Verify JPDB helpers work with real API (if key available)**

Write a tiny test script and run it:

```bash
echo 'import { resolveCommonForms, tierFromRank } from "./scripts/lib/jpdb-helpers.mjs";
import { readFile } from "fs/promises";
const apiKey = (await readFile("data/.creature-forge-jpdb-key", "utf8")).trim();
const results = await resolveCommonForms(["犬", "鋏"], apiKey, { interBatchDelayMs: 1000 });
for (const r of results) console.log(`${r.bestForm} rank=${r.rank} tier=${tierFromRank(r.rank)} forms=${r.allForms.map(f=>f.spelling+"("+f.rank+")").join(",")}`);' > /tmp/test-jpdb-helpers.mjs

node /tmp/test-jpdb-helpers.mjs
```

Expected: Output showing 犬 with rank ~1200 (common) and ハサミ/鋏 with best form rank.

**Step 2: Verify Gemini gen script works (if key available)**

```bash
echo '{"a":"A cute golden puppy creature with big expressive eyes and floppy ears, sitting in an alert pose. Soft fur with warm amber highlights.","b":"A sleek silver wolf-pup creature with crystalline ice patterns on its fur. Cool blue eyes and a playful stance.","c":"A fluffy brown bear-cub-like creature with mossy green patches. Round body, stubby legs, gentle expression.","name":"Inumon","modifier":"Playful","baseMeaning":"Dog","element":"earth","archetype":"Fighter","attack":"Bite","ultimate":"Howl"}' > /tmp/creature-descriptions.json

node scripts/creature-gemini-gen.mjs --id test-dog --visual-tier common --descriptions /tmp/creature-descriptions.json
```

Expected: JSON output with status for each variant. Check `/tmp/creature-forge-test-dog-a.png` exists and is a valid PNG.

**Step 3: Verify preview script works**

```bash
echo '{"name":"Inumon","modifier":"Playful","baseMeaning":"Dog","element":"earth","archetype":"Fighter","visualTier":"common","attack":"Bite","ultimate":"Howl","descriptions":{"a":"Description A","b":"Description B","c":"Description C"}}' > /tmp/creature-metadata.json

node scripts/creature-preview.mjs --id test-dog --metadata /tmp/creature-metadata.json &
# Parse output for URL, navigate Playwright to it, verify 3-column layout renders
```

Expected: JSON with url and pid. Navigate Playwright to URL, see 3 cards.

**Step 4: Cleanup**

```bash
node scripts/creature-preview.mjs --cleanup --pid <PID>
rm /tmp/creature-forge-test-dog-*.png /tmp/creature-descriptions.json /tmp/creature-metadata.json /tmp/creature-forge-test-dog-preview.html /tmp/test-jpdb-helpers.mjs
```

**Step 5: Commit (if any fixes were needed)**

```bash
git add -A && git commit -m "fix: smoke test corrections for creature forge tooling"
```

Only commit if changes were made during smoke testing.
