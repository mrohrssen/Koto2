# Admin Word Exposure Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin dashboard that aggregates word exposures across all users and compares our Sudachi tokenization against JPDB's, surfacing discrepancies in tokenization, base forms, and definitions.

**Architecture:** Express API endpoints behind admin auth serve aggregated data + JPDB comparison results. A standalone HTML page consumes the API with two tabs (Word Exposures, Frame Comparison). JPDB results are cached to files so the expensive API calls only happen once per word.

**Tech Stack:** Express routes, vanilla JS frontend, JPDB REST API (`/api/v1/parse` + `/api/v1/lookup-vocabulary`), JSON file caching.

**Spec:** `docs/superpowers/specs/2026-04-10-admin-word-exposure-dashboard-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/routes/admin-word-exposures.js` | All 4 API endpoints + JPDB comparison + cache helpers |
| `public/admin-word-exposures.html` | Dashboard UI (both tabs, filters, progressive JPDB loading) |
| `tests/unit/admin-word-exposures.test.js` | Unit tests for aggregation + comparison logic |
| `src/routes/admin.js` | Export `adminAuth` middleware (currently private) |
| `server.js` | Mount new routes at `/api/admin` |
| `.gitignore` | Add cache file entries |

---

## Chunk 1: Backend Core

### Task 1: Export adminAuth middleware

The `adminAuth` function in `src/routes/admin.js` (line 63) is currently a private function. Export it so the new route file can reuse it.

**Files:**
- Modify: `src/routes/admin.js:63`

- [ ] **Step 1: Export adminAuth**

In `src/routes/admin.js`, change line 63 from:
```javascript
function adminAuth(req, res, next) {
```
to:
```javascript
export function adminAuth(req, res, next) {
```

No other changes needed — the function is already used via `router.use(adminAuth)` on line 82, which still works with a named export.

- [ ] **Step 2: Verify existing tests still pass**

Run: `node --test --test-name-pattern="shiftFsrs" tests/unit/admin-routes.test.js`
Expected: All 3 tests pass (the import `await import('../../src/routes/admin.js')` still works).

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.js
git commit -m "refactor: export adminAuth middleware for reuse"
```

---

### Task 2: Word exposure aggregation function + tests

Pure function that reads all `word-knowledge-*.json` files, sums exposure counts, enriches with dictionary definitions.

**Files:**
- Create: `src/routes/admin-word-exposures.js`
- Create: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Write the failing test for aggregateWordExposures**

Create `tests/unit/admin-word-exposures.test.js`:

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('aggregateWordExposures', () => {
  let tempDir;
  let aggregateWordExposures;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'word-exp-test-'));
    const mod = await import('../../src/routes/admin-word-exposures.js');
    aggregateWordExposures = mod.aggregateWordExposures;
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('aggregates exposures across multiple user files', () => {
    // User 1: saw 火 3 times, 水 2 times
    writeFileSync(join(tempDir, 'word-knowledge-user1.json'), JSON.stringify({
      userId: 'user1',
      seen: {
        '火': { exposures: 3, firstSeen: '2026-01-01T00:00:00.000Z' },
        '水': { exposures: 2, firstSeen: '2026-01-01T00:00:00.000Z' }
      },
      known: {}
    }));

    // User 2: saw 火 5 times, 木 1 time
    writeFileSync(join(tempDir, 'word-knowledge-user2.json'), JSON.stringify({
      userId: 'user2',
      seen: {
        '火': { exposures: 5, firstSeen: '2026-01-02T00:00:00.000Z' },
        '木': { exposures: 1, firstSeen: '2026-01-02T00:00:00.000Z' }
      },
      known: {}
    }));

    // Minimal dictionary
    const dictionary = new Map([
      ['火', { reading: 'ひ', definitions: [{ en: 'fire', primary: true }] }],
      ['水', { reading: 'みず', definitions: [{ en: 'water', primary: true }] }],
    ]);

    const result = aggregateWordExposures(tempDir, dictionary);

    assert.equal(result.totalUsers, 2);
    assert.equal(result.totalUniqueWords, 3);

    // Sorted descending by totalExposures
    assert.equal(result.words[0].word, '火');
    assert.equal(result.words[0].totalExposures, 8); // 3 + 5
    assert.equal(result.words[0].userCount, 2);
    assert.equal(result.words[0].reading, 'ひ');
    assert.equal(result.words[0].definition, 'fire');

    assert.equal(result.words[1].word, '水');
    assert.equal(result.words[1].totalExposures, 2);
    assert.equal(result.words[1].userCount, 1);

    assert.equal(result.words[2].word, '木');
    assert.equal(result.words[2].totalExposures, 1);
    assert.equal(result.words[2].definition, null); // Not in dictionary
  });

  it('returns empty result when no word-knowledge files exist', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'word-exp-empty-'));
    const dictionary = new Map();
    const result = aggregateWordExposures(emptyDir, dictionary);

    assert.equal(result.totalUsers, 0);
    assert.equal(result.totalUniqueWords, 0);
    assert.deepEqual(result.words, []);

    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('handles malformed word-knowledge files gracefully', () => {
    const badDir = mkdtempSync(join(tmpdir(), 'word-exp-bad-'));
    writeFileSync(join(badDir, 'word-knowledge-bad.json'), 'not json');
    writeFileSync(join(badDir, 'word-knowledge-good.json'), JSON.stringify({
      userId: 'good',
      seen: { '火': { exposures: 1, firstSeen: '2026-01-01T00:00:00.000Z' } },
      known: {}
    }));

    const dictionary = new Map();
    const result = aggregateWordExposures(badDir, dictionary);

    // Should still process the good file
    assert.equal(result.totalUsers, 1);
    assert.equal(result.words.length, 1);

    rmSync(badDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement aggregateWordExposures**

Create `src/routes/admin-word-exposures.js`:

```javascript
/**
 * @fileoverview Admin API routes for word exposure tracking and JPDB comparison.
 *
 * API ENDPOINTS:
 *   GET  /word-exposures              - Aggregated word exposure data across all users
 *   POST /word-exposures/jpdb-compare - Compare words against JPDB tokenization
 *   GET  /frames                      - List all dialogue frames
 *   POST /word-exposures/frame-compare - Compare frame tokenization against JPDB
 */

import { Router } from 'express';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { adminAuth } from './admin.js';
import { loadWordDictionary } from '../game/word-dictionary.js';

/**
 * Aggregate word exposures across all user word-knowledge files.
 * Exported for unit testing.
 *
 * @param {string} dataDir - Path to data directory
 * @param {Map} dictionary - Word dictionary Map<baseForm, { reading, definitions }>
 * @returns {{ words: Array, totalUniqueWords: number, totalUsers: number }}
 */
export function aggregateWordExposures(dataDir, dictionary) {
  const wordMap = new Map(); // word -> { totalExposures, users: Set }
  let totalUsers = 0;

  let files;
  try {
    files = readdirSync(dataDir).filter(f => f.startsWith('word-knowledge-') && f.endsWith('.json'));
  } catch {
    files = [];
  }

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
      if (!raw.seen) continue;
      totalUsers++;

      for (const [word, data] of Object.entries(raw.seen)) {
        const existing = wordMap.get(word);
        if (existing) {
          existing.totalExposures += data.exposures || 0;
          existing.users.add(raw.userId || file);
        } else {
          wordMap.set(word, {
            totalExposures: data.exposures || 0,
            users: new Set([raw.userId || file])
          });
        }
      }
    } catch {
      // Skip malformed files
    }
  }

  const words = [];
  for (const [word, data] of wordMap) {
    const entry = dictionary.get(word);
    const primaryDef = entry?.definitions?.find(d => d.primary) || entry?.definitions?.[0];
    words.push({
      word,
      reading: entry?.reading || null,
      definition: primaryDef?.en || null,
      totalExposures: data.totalExposures,
      userCount: data.users.size
    });
  }

  words.sort((a, b) => b.totalExposures - a.totalExposures);

  return { words, totalUniqueWords: words.length, totalUsers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: All 3 tests PASS

- [ ] **Step 5: Syntax check**

Run: `node --check src/routes/admin-word-exposures.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin-word-exposures.js tests/unit/admin-word-exposures.test.js
git commit -m "feat: word exposure aggregation function with tests"
```

---

### Task 3: JPDB word comparison logic + cache

Compares individual words against JPDB's tokenization. Calls JPDB parse API directly (not through `parseText` — that function loses the vocabulary headword). Caches results to disk.

**Important context:** The existing `parseText` in `src/jpdb.js` returns surface forms as `spelling`, losing the JPDB vocabulary headword. For comparison, we need the headword (e.g., JPDB maps いらっしゃいませ → headword いらっしゃる). So this function calls the JPDB API directly.

**Files:**
- Modify: `src/routes/admin-word-exposures.js`
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Write failing tests for JPDB comparison helpers**

Add to `tests/unit/admin-word-exposures.test.js`:

```javascript
describe('buildJpdbComparison', () => {
  let buildJpdbComparison;

  before(async () => {
    const mod = await import('../../src/routes/admin-word-exposures.js');
    buildJpdbComparison = mod.buildJpdbComparison;
  });

  it('marks matching word as not different', () => {
    // Simulates JPDB parse response for "火"
    const jpdbResponse = {
      tokens: [[0, 0, 3]],
      vocabulary: [['火', 'ひ', 1234, 5678]]
    };
    const result = buildJpdbComparison('火', jpdbResponse);

    assert.equal(result.isDifferent, false);
    assert.equal(result.jpdbSpelling, '火');
    assert.equal(result.jpdbReading, 'ひ');
  });

  it('marks different headword as different', () => {
    // JPDB normalizes いらっしゃいませ → いらっしゃる
    const jpdbResponse = {
      tokens: [[0, 0, 24]],
      vocabulary: [['いらっしゃる', 'いらっしゃる', 1000940, 277275651]]
    };
    const result = buildJpdbComparison('いらっしゃいませ', jpdbResponse);

    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, 'いらっしゃる');
  });

  it('marks multi-token result as different (JPDB split the word)', () => {
    // JPDB splits a word into 2 tokens
    const jpdbResponse = {
      tokens: [[0, 0, 6], [1, 6, 6]],
      vocabulary: [['食', 'しょく', 100, 200], ['べる', 'べる', 300, 400]]
    };
    const result = buildJpdbComparison('食べる', jpdbResponse);

    assert.equal(result.isDifferent, true);
    // jpdbSpelling should show the split
    assert.ok(result.jpdbSpelling.includes('+'));
  });

  it('handles empty JPDB response', () => {
    const jpdbResponse = { tokens: [], vocabulary: [] };
    const result = buildJpdbComparison('テスト', jpdbResponse);

    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, null);
  });
});

describe('loadJpdbCache / saveJpdbCache', () => {
  let loadJpdbCache, saveJpdbCache;
  let tempDir;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'jpdb-cache-test-'));
    const mod = await import('../../src/routes/admin-word-exposures.js');
    loadJpdbCache = mod.loadJpdbCache;
    saveJpdbCache = mod.saveJpdbCache;
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty object for missing cache file', () => {
    const cache = loadJpdbCache(join(tempDir, 'nonexistent.json'));
    assert.deepEqual(cache, {});
  });

  it('round-trips cache data', () => {
    const cachePath = join(tempDir, 'test-cache.json');
    const data = { '火': { jpdbSpelling: '火', jpdbReading: 'ひ', isDifferent: false } };

    saveJpdbCache(cachePath, data);
    const loaded = loadJpdbCache(cachePath);

    assert.deepEqual(loaded, data);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: FAIL — `buildJpdbComparison` not exported

- [ ] **Step 3: Implement buildJpdbComparison + cache helpers**

Add to `src/routes/admin-word-exposures.js`:

```javascript
/**
 * Build comparison result from a JPDB parse API response for a single word.
 * JPDB response format: { tokens: [[vocabIdx, bytePos, byteLen], ...], vocabulary: [[spelling, reading, vid, sid], ...] }
 *
 * @param {string} ourWord - Our Sudachi base form
 * @param {{ tokens: Array, vocabulary: Array }} jpdbResponse - Raw JPDB parse response
 * @returns {{ jpdbSpelling: string|null, jpdbReading: string|null, jpdbDefinition: string|null, isDifferent: boolean }}
 */
export function buildJpdbComparison(ourWord, jpdbResponse) {
  const { tokens, vocabulary } = jpdbResponse;

  if (!tokens || tokens.length === 0 || !vocabulary || vocabulary.length === 0) {
    return { jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true };
  }

  // Filter to word tokens only (vocabIndex !== null)
  const wordTokens = tokens.filter(t => t[0] !== null && vocabulary[t[0]]);

  if (wordTokens.length === 0) {
    return { jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true };
  }

  if (wordTokens.length === 1) {
    const vocab = vocabulary[wordTokens[0][0]];
    const jpdbSpelling = vocab[0];
    const jpdbReading = vocab[1];
    return {
      jpdbSpelling,
      jpdbReading,
      jpdbDefinition: null, // Filled in by lookup-vocabulary call
      isDifferent: jpdbSpelling !== ourWord
    };
  }

  // Multiple word tokens — JPDB split what we treat as one word
  const spellings = wordTokens.map(t => vocabulary[t[0]][0]);
  return {
    jpdbSpelling: spellings.join('+'),
    jpdbReading: wordTokens.map(t => vocabulary[t[0]][1]).join('+'),
    jpdbDefinition: null,
    isDifferent: true
  };
}

/**
 * Load JPDB comparison cache from disk.
 * @param {string} cachePath
 * @returns {Object}
 */
export function loadJpdbCache(cachePath) {
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'));
    }
  } catch { /* corrupted cache, start fresh */ }
  return {};
}

/**
 * Save JPDB comparison cache to disk.
 * @param {string} cachePath
 * @param {Object} cache
 */
export function saveJpdbCache(cachePath, cache) {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin-word-exposures.js tests/unit/admin-word-exposures.test.js
git commit -m "feat: JPDB word comparison logic and cache helpers"
```

---

### Task 4: Frame comparison logic + tests

Compares frame-level tokenization. Aligns Sudachi content tokens against JPDB vocabulary tokens to detect merge/split/spelling diffs.

**Files:**
- Modify: `src/routes/admin-word-exposures.js`
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Write failing tests for buildFrameComparison**

Add to `tests/unit/admin-word-exposures.test.js`:

```javascript
describe('buildFrameComparison', () => {
  let buildFrameComparison;

  before(async () => {
    const mod = await import('../../src/routes/admin-word-exposures.js');
    buildFrameComparison = mod.buildFrameComparison;
  });

  it('detects spelling difference in frame tokens', () => {
    const frame = {
      id: 'test_frame',
      category: 'greeting',
      raw: 'いらっしゃいませ',
      tokens: [
        { surface: 'いらっしゃいませ', base: 'いらっしゃいませ', reading: 'いらっしゃいませ', meaning: 'welcome' }
      ],
      words: ['いらっしゃいませ']
    };

    // JPDB normalizes to いらっしゃる
    const jpdbResponse = {
      tokens: [[0, 0, 24]],
      vocabulary: [['いらっしゃる', 'いらっしゃる', 1000940, 277275651]]
    };

    const result = buildFrameComparison(frame, jpdbResponse);

    assert.equal(result.isDifferent, true);
    assert.equal(result.diffs.length, 1);
    assert.equal(result.diffs[0].type, 'spelling');
    assert.equal(result.diffs[0].sudachi, 'いらっしゃいませ');
    assert.equal(result.diffs[0].jpdb, 'いらっしゃる');
  });

  it('returns no diffs when tokens match', () => {
    const frame = {
      id: 'test_match',
      category: 'greeting',
      raw: 'こんにちは',
      tokens: [
        { surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello' }
      ],
      words: ['こんにちは']
    };

    const jpdbResponse = {
      tokens: [[0, 0, 15]],
      vocabulary: [['こんにちは', 'こんにちは', 1289400, 3640431021]]
    };

    const result = buildFrameComparison(frame, jpdbResponse);

    assert.equal(result.isDifferent, false);
    assert.deepEqual(result.diffs, []);
  });

  it('detects merge diff (JPDB keeps one token where Sudachi has two)', () => {
    const frame = {
      id: 'test_merge',
      category: 'shop',
      raw: 'すみません',
      tokens: [
        // Hypothetical: Sudachi split into すみ + ません
        { surface: 'すみ', base: 'すみ', reading: 'すみ', meaning: 'corner' },
        { surface: 'ません', base: 'ません' }
      ],
      words: ['すみ']
    };

    // JPDB keeps as one word
    const jpdbResponse = {
      tokens: [[0, 0, 15]],
      vocabulary: [['すみません', 'すみません', 1295060, 2037307996]]
    };

    const result = buildFrameComparison(frame, jpdbResponse);

    assert.equal(result.isDifferent, true);
    assert.ok(result.diffs.some(d => d.type === 'merge'));
  });

  it('skips slot tokens in comparison', () => {
    const frame = {
      id: 'test_slot',
      category: 'shop',
      raw: '{item}をください',
      tokens: [
        { slot: 'item' },
        { surface: 'を' },
        { surface: 'ください', base: 'くださる', reading: 'ください', meaning: 'to give' }
      ],
      words: ['くださる']
    };

    // JPDB parses "をください" (slot stripped)
    const jpdbResponse = {
      tokens: [[0, 0, 3], [1, 3, 12]],
      vocabulary: [['を', 'を', 2029010, 2204186150], ['ください', 'ください', 1184270, 1444587179]]
    };

    const result = buildFrameComparison(frame, jpdbResponse);

    assert.equal(result.isDifferent, true);
    assert.ok(result.diffs.some(d => d.sudachi === 'くださる' && d.jpdb === 'ください'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: FAIL — `buildFrameComparison` not exported

- [ ] **Step 3: Implement buildFrameComparison**

Add to `src/routes/admin-word-exposures.js`:

```javascript
/**
 * Build comparison between a frame's Sudachi tokens and JPDB's parse result.
 *
 * Strategy: Extract content tokens from both sides (skip particles, punctuation, slots),
 * then compare the ordered lists. Detects spelling, merge, and split differences.
 *
 * @param {Object} frame - Frame from frames.json with tokens array
 * @param {{ tokens: Array, vocabulary: Array }} jpdbResponse - Raw JPDB parse response
 * @returns {{ raw: string, sudachiTokens: Array, jpdbTokens: Array, isDifferent: boolean, diffs: Array }}
 */
export function buildFrameComparison(frame, jpdbResponse) {
  const { tokens: jpdbTokenIdxs, vocabulary } = jpdbResponse;

  // Extract Sudachi content tokens (have a base form, skip slots and particles)
  const sudachiContent = frame.tokens
    .filter(t => t.base && !t.slot)
    .map(t => ({ base: t.base, surface: t.surface }));

  // Extract JPDB content tokens (word tokens only)
  const jpdbContent = (jpdbTokenIdxs || [])
    .filter(t => t[0] !== null && vocabulary[t[0]])
    .map(t => ({
      spelling: vocabulary[t[0]][0],
      reading: vocabulary[t[0]][1]
    }));

  // Build diffs using LCS-based alignment.
  // First find longest common subsequence of matching tokens, then classify gaps.
  const n = sudachiContent.length;
  const m = jpdbContent.length;

  // Build match matrix: which Sudachi tokens match which JPDB tokens by spelling
  // Use simple greedy alignment: walk both lists, advance through matches
  const diffs = [];
  let si = 0, ji = 0;

  while (si < n && ji < m) {
    if (sudachiContent[si].base === jpdbContent[ji].spelling) {
      // Match — advance both
      si++;
      ji++;
      continue;
    }

    // Look ahead in JPDB for current Sudachi token (merge detection)
    let foundInJpdb = -1;
    for (let jj = ji + 1; jj < Math.min(ji + 4, m); jj++) {
      if (sudachiContent[si].base === jpdbContent[jj].spelling) { foundInJpdb = jj; break; }
    }

    // Look ahead in Sudachi for current JPDB token (split detection)
    let foundInSud = -1;
    for (let ss = si + 1; ss < Math.min(si + 4, n); ss++) {
      if (sudachiContent[ss].base === jpdbContent[ji].spelling) { foundInSud = ss; break; }
    }

    if (foundInJpdb >= 0 && (foundInSud < 0 || (foundInJpdb - ji) <= (foundInSud - si))) {
      // JPDB has extra tokens before the match — split (JPDB broke our word apart)
      while (ji < foundInJpdb) {
        diffs.push({ type: 'split', sudachi: null, jpdb: jpdbContent[ji].spelling });
        ji++;
      }
    } else if (foundInSud >= 0) {
      // Sudachi has extra tokens before the match — merge (JPDB combined them)
      while (si < foundInSud) {
        diffs.push({ type: 'merge', sudachi: sudachiContent[si].base, jpdb: null });
        si++;
      }
    } else {
      // No lookahead match — spelling difference at same position
      diffs.push({ type: 'spelling', sudachi: sudachiContent[si].base, jpdb: jpdbContent[ji].spelling });
      si++;
      ji++;
    }
  }

  // Remaining Sudachi tokens (JPDB merged them into earlier tokens)
  while (si < n) {
    diffs.push({ type: 'merge', sudachi: sudachiContent[si].base, jpdb: null });
    si++;
  }
  // Remaining JPDB tokens (JPDB split something we didn't)
  while (ji < m) {
    diffs.push({ type: 'split', sudachi: null, jpdb: jpdbContent[ji].spelling });
    ji++;
  }

  return {
    raw: frame.raw,
    sudachiTokens: sudachiContent,
    jpdbTokens: jpdbContent.map(t => ({ spelling: t.spelling, reading: t.reading, definition: null })),
    isDifferent: diffs.length > 0,
    diffs
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin-word-exposures.js tests/unit/admin-word-exposures.test.js
git commit -m "feat: frame comparison logic for JPDB tokenization diff"
```

---

### Task 5: Wire up API endpoints + mount in server.js

Create the Express route factory that wires up all 4 endpoints, then mount it in server.js.

**Files:**
- Modify: `src/routes/admin-word-exposures.js`
- Modify: `server.js`

- [ ] **Step 1: Add the route factory and all endpoint handlers**

Add to the bottom of `src/routes/admin-word-exposures.js`:

```javascript
const JPDB_API_BASE = 'https://jpdb.io/api/v1';

/**
 * Call JPDB parse API for a single text string.
 * Returns raw response { tokens, vocabulary }.
 */
async function jpdbParse(apiKey, text) {
  const response = await fetch(`${JPDB_API_BASE}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      text,
      token_fields: ['vocabulary_index', 'position', 'length'],
      vocabulary_fields: ['spelling', 'reading', 'vid', 'sid']
    })
  });
  if (!response.ok) {
    throw new Error(`JPDB parse failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Call JPDB lookup-vocabulary API for definitions.
 * @param {string} apiKey
 * @param {Array<[number, number]>} vidSidPairs - [[vid, sid], ...]
 * @returns {Object} Map of "vid:sid" -> definition string
 */
async function jpdbLookupDefinitions(apiKey, vidSidPairs) {
  if (vidSidPairs.length === 0) return {};

  const response = await fetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      list: vidSidPairs,
      fields: ['spelling', 'reading', 'meanings']
    })
  });
  if (!response.ok) return {};

  const data = await response.json();
  const defMap = {};
  for (let i = 0; i < (data.vocabulary_info || []).length; i++) {
    const info = data.vocabulary_info[i];
    if (!info) continue;
    const [spelling, reading, meanings] = info;
    // meanings can be an array of strings or an array of objects with glosses
    let defStr;
    if (Array.isArray(meanings) && meanings.length > 0) {
      if (typeof meanings[0] === 'string') {
        defStr = meanings.join('; ');
      } else {
        defStr = meanings.map(m => (m.glosses || []).join(', ')).join('; ');
      }
    }
    const [vid, sid] = vidSidPairs[i];
    defMap[`${vid}:${sid}`] = defStr || null;
  }
  return defMap;
}

/**
 * Sleep for ms milliseconds (for JPDB rate limiting).
 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Strip {slot} markers from frame raw text for JPDB parsing.
 * E.g., "{item}をください" → "をください"
 */
function stripSlots(text) {
  return text.replace(/\{[^}]+\}/g, '');
}

/**
 * Create admin word exposure routes.
 *
 * @param {{ dataDir: string, framesPath: string }} options
 * @returns {Router}
 */
export default function createWordExposureRoutes({ dataDir, framesPath }) {
  const router = Router();
  router.use(adminAuth);

  // Lazy-load dictionary on first request (same pattern as known-words.js)
  let dictionary = null;
  function getDictionary() {
    if (!dictionary) dictionary = loadWordDictionary(dataDir);
    return dictionary;
  }

  const jpdbCachePath = join(dataDir, 'jpdb-tokenization-cache.json');
  const frameCachePath = join(dataDir, 'jpdb-frame-compare-cache.json');

  // GET /word-exposures — aggregated exposure data
  router.get('/word-exposures', (req, res) => {
    try {
      const result = aggregateWordExposures(dataDir, getDictionary());
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /word-exposures/jpdb-compare — compare words against JPDB
  router.post('/word-exposures/jpdb-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'JPDB API key not configured' });
    }

    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words (string[]) required' });
    }

    try {
      const cache = loadJpdbCache(jpdbCachePath);
      const results = {};
      let cached = 0;
      let fetched = 0;

      for (const word of words) {
        if (cache[word]) {
          results[word] = cache[word];
          cached++;
          continue;
        }

        try {
          const jpdbResponse = await jpdbParse(apiKey, word);
          const comparison = buildJpdbComparison(word, jpdbResponse);

          // Fetch definition for single-token results
          if (comparison.jpdbSpelling && !comparison.jpdbSpelling.includes('+')) {
            const wordTokens = jpdbResponse.tokens.filter(t => t[0] !== null && jpdbResponse.vocabulary[t[0]]);
            if (wordTokens.length === 1) {
              const vocab = jpdbResponse.vocabulary[wordTokens[0][0]];
              await sleep(500); // Rate limit between parse and lookup calls
              const defMap = await jpdbLookupDefinitions(apiKey, [[vocab[2], vocab[3]]]);
              comparison.jpdbDefinition = defMap[`${vocab[2]}:${vocab[3]}`] || null;
            }
          }

          cache[word] = comparison;
          results[word] = comparison;
          fetched++;
          await sleep(500); // Rate limit before next word's parse call
        } catch (err) {
          // JPDB error for this word — skip, return partial results
          results[word] = { jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true, error: err.message };
        }
      }

      // Save updated cache
      if (fetched > 0) {
        saveJpdbCache(jpdbCachePath, cache);
      }

      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /frames — list all dialogue frames
  router.get('/frames', (req, res) => {
    try {
      const frames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      res.json({
        frames: frames.map(f => ({ id: f.id, category: f.category, raw: f.raw }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /word-exposures/frame-compare — compare frames against JPDB
  router.post('/word-exposures/frame-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'JPDB API key not configured' });
    }

    const { frameIds } = req.body;
    if (!Array.isArray(frameIds) || frameIds.length === 0) {
      return res.status(400).json({ error: 'frameIds (string[]) required' });
    }

    try {
      const allFrames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      const frameMap = new Map(allFrames.map(f => [f.id, f]));
      const cache = loadJpdbCache(frameCachePath);
      const results = {};
      let cached = 0;
      let fetched = 0;

      for (const frameId of frameIds) {
        const frame = frameMap.get(frameId);
        if (!frame) continue;

        if (cache[frameId]) {
          results[frameId] = cache[frameId];
          cached++;
          continue;
        }

        try {
          const textForJpdb = stripSlots(frame.raw);
          if (!textForJpdb.trim()) {
            // Frame is only slots, skip
            continue;
          }
          const jpdbResponse = await jpdbParse(apiKey, textForJpdb);
          const comparison = buildFrameComparison(frame, jpdbResponse);

          // Fetch definitions for JPDB tokens
          const wordTokens = (jpdbResponse.tokens || []).filter(t => t[0] !== null && jpdbResponse.vocabulary[t[0]]);
          const vidSidPairs = wordTokens.map(t => {
            const v = jpdbResponse.vocabulary[t[0]];
            return [v[2], v[3]];
          });
          if (vidSidPairs.length > 0) {
            const defMap = await jpdbLookupDefinitions(apiKey, vidSidPairs);
            for (const jt of comparison.jpdbTokens) {
              // Match by spelling to fill in definitions
              const matchingToken = wordTokens.find(t => jpdbResponse.vocabulary[t[0]][0] === jt.spelling);
              if (matchingToken) {
                const v = jpdbResponse.vocabulary[matchingToken[0]];
                jt.definition = defMap[`${v[2]}:${v[3]}`] || null;
              }
            }
            await sleep(500);
          }

          cache[frameId] = comparison;
          results[frameId] = comparison;
          fetched++;
          await sleep(500);
        } catch (err) {
          results[frameId] = { raw: frame.raw, isDifferent: true, diffs: [], error: err.message };
        }
      }

      if (fetched > 0) {
        saveJpdbCache(frameCachePath, cache);
      }

      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.js**

In `server.js`, add the import near the other admin import (around line 134):

```javascript
import createWordExposureRoutes from './src/routes/admin-word-exposures.js';
```

Then near line 595 where admin routes are mounted, add:

```javascript
app.use('/api/admin', createWordExposureRoutes({
  dataDir: dataPath(''),
  framesPath: dataPath('dialogue/frames.json')
}));
```

Note: The dictionary is loaded lazily inside the route file (same pattern as `known-words.js`), so no dictionary parameter is needed from server.js.

- [ ] **Step 3: Syntax check both files**

Run: `node --check src/routes/admin-word-exposures.js && node --check server.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Run all existing tests to make sure nothing broke**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin-word-exposures.js server.js
git commit -m "feat: wire up word exposure API endpoints in server"
```

---

## Chunk 2: Frontend + Polish

### Task 6: Update .gitignore for cache files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add cache file entries to .gitignore**

Add these lines in the `data/` section of `.gitignore` **AFTER** the `!data/*.json` un-ignore line (line 16). Place them near the other runtime cache patterns like `data/vocab-cache-*.json` (around line 26). Order matters — git processes gitignore rules sequentially, so these must come after `!data/*.json` to re-ignore them:

```
data/jpdb-tokenization-cache.json
data/jpdb-frame-compare-cache.json
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore JPDB comparison cache files"
```

---

### Task 7: Frontend dashboard HTML page

Single HTML file with inline CSS and JS. Two tabs, progressive JPDB loading, filters.

**Files:**
- Create: `public/admin-word-exposures.html`

- [ ] **Step 1: Create the dashboard page**

Create `public/admin-word-exposures.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Word Exposure Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a1a2e; color: #e0e0e0; font-family: 'Courier New', monospace;
      padding: 20px; font-size: 14px;
    }
    h1 { color: #7fdbca; margin-bottom: 10px; font-size: 20px; }
    .controls {
      display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
      margin-bottom: 16px; padding: 12px; background: #16213e; border-radius: 6px;
    }
    .controls label { color: #a0a0c0; font-size: 12px; }
    .controls input[type="text"], .controls input[type="password"] {
      background: #0f3460; border: 1px solid #333; color: #e0e0e0;
      padding: 6px 10px; border-radius: 4px; font-family: inherit; font-size: 13px;
    }
    .controls input[type="text"] { width: 200px; }
    .controls input[type="password"] { width: 260px; }
    .controls button {
      background: #0f3460; border: 1px solid #7fdbca; color: #7fdbca;
      padding: 6px 14px; border-radius: 4px; cursor: pointer; font-family: inherit;
    }
    .controls button:hover { background: #1a4a7a; }
    .controls button.active { background: #7fdbca; color: #1a1a2e; }
    .stats { color: #a0a0c0; font-size: 12px; margin-bottom: 8px; }
    .progress { color: #f0a500; font-size: 12px; margin-bottom: 8px; }
    .tabs { display: flex; gap: 2px; margin-bottom: 0; }
    .tab {
      padding: 8px 16px; background: #16213e; color: #a0a0c0;
      border: 1px solid #333; border-bottom: none; border-radius: 6px 6px 0 0;
      cursor: pointer; font-family: inherit; font-size: 13px;
    }
    .tab.active { background: #0f3460; color: #7fdbca; border-color: #7fdbca; }
    .tab-content {
      border: 1px solid #333; border-radius: 0 6px 6px 6px; padding: 0;
      background: #0f3460; display: none; overflow-x: auto;
    }
    .tab-content.active { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      background: #16213e; color: #7fdbca; padding: 8px 10px;
      text-align: left; position: sticky; top: 0; border-bottom: 2px solid #333;
      cursor: pointer; user-select: none; white-space: nowrap;
    }
    th:hover { color: #f0a500; }
    td { padding: 6px 10px; border-bottom: 1px solid #222; vertical-align: top; }
    tr.different { background: #2a1a1a; }
    tr.different td:nth-child(n+7) { color: #f0a500; }
    .diff-badge {
      display: inline-block; padding: 2px 6px; border-radius: 3px;
      font-size: 11px; font-weight: bold;
    }
    .diff-yes { background: #a83232; color: #fff; }
    .diff-no { color: #555; }
    .diff-type { font-size: 11px; padding: 1px 5px; border-radius: 3px; }
    .diff-merge { background: #a86b32; color: #fff; }
    .diff-split { background: #3264a8; color: #fff; }
    .diff-spelling { background: #a83264; color: #fff; }
    .loading { color: #555; font-style: italic; }
    .error { color: #a83232; }
    .search-highlight { background: #7fdbca33; }
    .category-filter { background: #0f3460; border: 1px solid #333; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; font-family: inherit; }
  </style>
</head>
<body>
  <h1>Word Exposure Dashboard</h1>

  <div class="controls">
    <label>Admin Secret:
      <input type="password" id="adminSecret" placeholder="X-Admin-Secret">
    </label>
    <button id="loadBtn" onclick="loadData()">Load</button>
    <span style="color:#333">|</span>
    <label><input type="checkbox" id="diffOnly" onchange="applyFilters()"> Show only differences</label>
    <label>Search:
      <input type="text" id="searchBox" placeholder="Filter words..." oninput="applyFilters()">
    </label>
    <label id="categoryFilterContainer" style="display:none">Category:
      <select id="categoryFilter" class="category-filter" onchange="applyFilters()">
        <option value="">All</option>
      </select>
    </label>
  </div>

  <div class="stats" id="stats"></div>
  <div class="progress"><span id="wordProgress"></span> <span id="frameProgress"></span></div>

  <div class="tabs">
    <div class="tab active" onclick="switchTab('words')">Word Exposures</div>
    <div class="tab" onclick="switchTab('frames')">Frame Comparison</div>
  </div>

  <div class="tab-content active" id="wordsTab">
    <table>
      <thead>
        <tr>
          <th onclick="sortTable('words','rank')">#</th>
          <th onclick="sortTable('words','word')">Word</th>
          <th onclick="sortTable('words','reading')">Reading</th>
          <th onclick="sortTable('words','definition')">Our Definition</th>
          <th onclick="sortTable('words','totalExposures')">Exposures</th>
          <th onclick="sortTable('words','userCount')">Users</th>
          <th onclick="sortTable('words','jpdbSpelling')">JPDB Spelling</th>
          <th onclick="sortTable('words','jpdbReading')">JPDB Reading</th>
          <th onclick="sortTable('words','jpdbDefinition')">JPDB Definition</th>
          <th onclick="sortTable('words','isDifferent')">Different?</th>
        </tr>
      </thead>
      <tbody id="wordsBody"></tbody>
    </table>
  </div>

  <div class="tab-content" id="framesTab">
    <table>
      <thead>
        <tr>
          <th>Frame ID</th>
          <th>Category</th>
          <th>Raw Text</th>
          <th>Sudachi Tokens</th>
          <th>JPDB Tokens</th>
          <th>Diffs</th>
        </tr>
      </thead>
      <tbody id="framesBody"></tbody>
    </table>
  </div>

  <script>
    let wordData = [];
    let frameList = [];
    let jpdbWordResults = {};
    let jpdbFrameResults = {};
    let currentTab = 'words';

    // Restore admin secret from sessionStorage
    const savedSecret = sessionStorage.getItem('adminSecret');
    if (savedSecret) document.getElementById('adminSecret').value = savedSecret;

    function getHeaders() {
      const secret = document.getElementById('adminSecret').value;
      sessionStorage.setItem('adminSecret', secret);
      return { 'X-Admin-Secret': secret, 'Content-Type': 'application/json' };
    }

    async function loadData() {
      document.getElementById('loadBtn').textContent = 'Loading...';
      try {
        // Phase 1: Load word exposures + frame list in parallel
        const [wordRes, frameRes] = await Promise.all([
          fetch('/api/admin/word-exposures', { headers: getHeaders() }),
          fetch('/api/admin/frames', { headers: getHeaders() })
        ]);

        if (!wordRes.ok) throw new Error(`Word exposures: ${wordRes.status}`);
        if (!frameRes.ok) throw new Error(`Frames: ${frameRes.status}`);

        const wordJson = await wordRes.json();
        const frameJson = await frameRes.json();

        wordData = wordJson.words;
        frameList = frameJson.frames;

        document.getElementById('stats').textContent =
          `${wordJson.totalUniqueWords} unique words | ${wordJson.totalUsers} users | ${frameList.length} frames`;

        // Populate category filter
        const categories = [...new Set(frameList.map(f => f.category))].sort();
        const catSelect = document.getElementById('categoryFilter');
        catSelect.innerHTML = '<option value="">All</option>' +
          categories.map(c => `<option value="${c}">${c}</option>`).join('');

        renderWords();
        renderFrames();

        // Phase 2: Progressive JPDB comparison
        loadJpdbWordComparisons();
        loadJpdbFrameComparisons();
      } catch (err) {
        document.getElementById('stats').innerHTML = `<span class="error">${err.message}</span>`;
      } finally {
        document.getElementById('loadBtn').textContent = 'Load';
      }
    }

    async function loadJpdbWordComparisons() {
      const batchSize = 50;
      const allWords = wordData.map(w => w.word);

      for (let i = 0; i < allWords.length; i += batchSize) {
        const batch = allWords.slice(i, i + batchSize);
        document.getElementById('wordProgress').textContent =
          `Words: ${Math.min(i + batchSize, allWords.length)}/${allWords.length}`;

        try {
          const res = await fetch('/api/admin/word-exposures/jpdb-compare', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ words: batch })
          });
          if (res.ok) {
            const data = await res.json();
            Object.assign(jpdbWordResults, data.results);
            renderWords();
          }
        } catch (err) {
          console.error('JPDB word comparison error:', err);
        }
      }
      document.getElementById('wordProgress').textContent = 'Words: done.';
    }

    async function loadJpdbFrameComparisons() {
      const batchSize = 30;
      const allIds = frameList.map(f => f.id);

      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        document.getElementById('frameProgress').textContent =
          `| Frames: ${Math.min(i + batchSize, allIds.length)}/${allIds.length}`;

        try {
          const res = await fetch('/api/admin/word-exposures/frame-compare', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ frameIds: batch })
          });
          if (res.ok) {
            const data = await res.json();
            Object.assign(jpdbFrameResults, data.results);
            renderFrames();
          }
        } catch (err) {
          console.error('JPDB frame comparison error:', err);
        }
      }
      document.getElementById('frameProgress').textContent = '| Frames: done.';
    }

    function renderWords() {
      const search = document.getElementById('searchBox').value.toLowerCase();
      const diffOnly = document.getElementById('diffOnly').checked;
      const tbody = document.getElementById('wordsBody');

      const rows = wordData.map((w, i) => {
        const jpdb = jpdbWordResults[w.word];
        const isDiff = jpdb?.isDifferent;

        // Filter: diff only (skip filter for words not yet compared)
        if (diffOnly && jpdb != null && !isDiff) return '';

        // Filter: search
        if (search) {
          const haystack = `${w.word} ${w.reading || ''} ${w.definition || ''} ${jpdb?.jpdbSpelling || ''} ${jpdb?.jpdbDefinition || ''}`.toLowerCase();
          if (!haystack.includes(search)) return '';
        }

        const diffBadge = jpdb == null
          ? '<span class="loading">...</span>'
          : isDiff
            ? '<span class="diff-badge diff-yes">YES</span>'
            : '<span class="diff-badge diff-no">—</span>';

        return `<tr class="${isDiff ? 'different' : ''}">
          <td>${i + 1}</td>
          <td>${esc(w.word)}</td>
          <td>${esc(w.reading || '')}</td>
          <td>${esc(w.definition || '')}</td>
          <td>${w.totalExposures}</td>
          <td>${w.userCount}</td>
          <td>${jpdb ? esc(jpdb.jpdbSpelling || '—') : '<span class="loading">...</span>'}</td>
          <td>${jpdb ? esc(jpdb.jpdbReading || '—') : '<span class="loading">...</span>'}</td>
          <td>${jpdb ? esc(jpdb.jpdbDefinition || '—') : '<span class="loading">...</span>'}</td>
          <td>${diffBadge}</td>
        </tr>`;
      });

      tbody.innerHTML = rows.join('');
    }

    function renderFrames() {
      const search = document.getElementById('searchBox').value.toLowerCase();
      const diffOnly = document.getElementById('diffOnly').checked;
      const category = document.getElementById('categoryFilter').value;
      const tbody = document.getElementById('framesBody');

      const rows = frameList.map(f => {
        const result = jpdbFrameResults[f.id];
        const isDiff = result?.isDifferent;

        if (diffOnly && result != null && !isDiff) return '';
        if (category && f.category !== category) return '';
        if (search && !`${f.id} ${f.raw} ${f.category}`.toLowerCase().includes(search)) return '';

        const sudTokens = result?.sudachiTokens?.map(t => t.base).join(' · ') || '<span class="loading">...</span>';
        const jpdbTokens = result?.jpdbTokens?.map(t => t.spelling).join(' · ') || '<span class="loading">...</span>';

        const diffs = (result?.diffs || []).map(d => {
          const cls = `diff-type diff-${d.type}`;
          return `<span class="${cls}">${d.type}: ${esc(d.sudachi || '∅')} → ${esc(d.jpdb || '∅')}</span>`;
        }).join('<br>') || (result ? '<span class="diff-badge diff-no">—</span>' : '<span class="loading">...</span>');

        return `<tr class="${isDiff ? 'different' : ''}">
          <td>${esc(f.id)}</td>
          <td>${esc(f.category)}</td>
          <td>${esc(f.raw)}</td>
          <td>${sudTokens}</td>
          <td>${jpdbTokens}</td>
          <td>${diffs}</td>
        </tr>`;
      });

      tbody.innerHTML = rows.join('');
    }

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

      if (tab === 'words') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('wordsTab').classList.add('active');
        document.getElementById('categoryFilterContainer').style.display = 'none';
      } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('framesTab').classList.add('active');
        document.getElementById('categoryFilterContainer').style.display = '';
      }
      applyFilters();
    }

    function applyFilters() {
      if (currentTab === 'words') renderWords();
      else renderFrames();
    }

    function sortTable(tab, key) {
      // Simple toggle sort for the active dataset
      if (tab === 'words') {
        wordData.sort((a, b) => {
          const aVal = key === 'isDifferent' ? (jpdbWordResults[a.word]?.isDifferent ? 1 : 0) :
                       key === 'jpdbSpelling' ? (jpdbWordResults[a.word]?.jpdbSpelling || '') :
                       key === 'rank' ? 0 : (a[key] ?? '');
          const bVal = key === 'isDifferent' ? (jpdbWordResults[b.word]?.isDifferent ? 1 : 0) :
                       key === 'jpdbSpelling' ? (jpdbWordResults[b.word]?.jpdbSpelling || '') :
                       key === 'rank' ? 0 : (b[key] ?? '');
          if (typeof aVal === 'number') return bVal - aVal;
          return String(aVal).localeCompare(String(bVal));
        });
        renderWords();
      }
    }

    function esc(str) {
      if (str == null) return '';
      const d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/admin-word-exposures.html 2>&1; echo "HTML created — syntax check N/A for HTML"`

Check manually that the file was created:
Run: `ls -la public/admin-word-exposures.html`

- [ ] **Step 3: Commit**

```bash
git add public/admin-word-exposures.html
git commit -m "feat: admin word exposure dashboard frontend"
```

---

### Task 8: Manual verification

Start the dev server and verify the dashboard loads.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Wait a few seconds for the server to start.

- [ ] **Step 2: Test the word exposures endpoint**

Run (replace `YOUR_ADMIN_SECRET` with the actual value from `.env`):
```bash
ADMIN_SECRET=$(grep ADMIN_SECRET .env | cut -d= -f2-)
curl -s -H "X-Admin-Secret: $ADMIN_SECRET" http://localhost:3000/api/admin/word-exposures | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Users: {d[\"totalUsers\"]}, Words: {d[\"totalUniqueWords\"]}'); [print(f'  {w[\"word\"]} ({w[\"reading\"]}) = {w[\"definition\"]} [{w[\"totalExposures\"]}x]') for w in d['words'][:10]]"
```

Expected: Word list with exposure counts

- [ ] **Step 3: Test JPDB comparison with a small batch**

```bash
ADMIN_SECRET=$(grep ADMIN_SECRET .env | cut -d= -f2-)
curl -s -X POST -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"words":["いらっしゃいませ","火","くださる"]}' \
  http://localhost:3000/api/admin/word-exposures/jpdb-compare | python3 -m json.tool
```

Expected: JSON with `results` showing at least いらっしゃいませ as `isDifferent: true`

- [ ] **Step 4: Test the frames endpoint**

```bash
ADMIN_SECRET=$(grep ADMIN_SECRET .env | cut -d= -f2-)
curl -s -H "X-Admin-Secret: $ADMIN_SECRET" http://localhost:3000/api/admin/frames | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"frames\"])} frames'); [print(f'  {f[\"id\"]} [{f[\"category\"]}]: {f[\"raw\"]}') for f in d['frames'][:5]]"
```

- [ ] **Step 5: Test frame comparison**

```bash
ADMIN_SECRET=$(grep ADMIN_SECRET .env | cut -d= -f2-)
curl -s -X POST -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"frameIds":["greet_welcome_browse","buy_polite"]}' \
  http://localhost:3000/api/admin/word-exposures/frame-compare | python3 -m json.tool
```

Expected: Frame comparison results with diffs

- [ ] **Step 6: Verify the HTML page loads**

Navigate to `http://localhost:3000/admin-word-exposures.html` in a browser (or curl):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin-word-exposures.html
```

Expected: 200

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Final commit if any fixes needed**

If any issues found during verification, fix and commit:
```bash
git add -A && git commit -m "fix: address issues found during dashboard verification"
```
