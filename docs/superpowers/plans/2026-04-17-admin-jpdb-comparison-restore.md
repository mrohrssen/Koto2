# Admin JPDB Comparison Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the JPDB-vs-Sudachi comparison view (Words tab + Frames tab) on the admin word exposure dashboard, rebuilt on top of the surviving `scripts/lib/jpdb-helpers.mjs` dev helper.

**Architecture:** Three pure helpers (`buildJpdbComparison`, `buildFrameComparison`, cache I/O) ported verbatim from git history (commit `b505f74^`). One thin `parseOne` adapter over `parseBatch` from `jpdb-helpers.mjs` — normalizes return shape and bundles `meanings` into the same call. Three new admin endpoints (`GET /frames`, `POST /word-exposures/jpdb-compare`, `POST /word-exposures/frame-compare`). Frontend UI reverted from commit `3b38eb6` diff. Disk cache files gitignored.

**Tech Stack:** Node.js `node:test` + `node:assert/strict`, Express, vanilla JS frontend, `scripts/lib/jpdb-helpers.mjs` (dev helper), JPDB REST API v1 (`parse` + `lookup-vocabulary`).

**Spec:** `docs/superpowers/specs/2026-04-17-admin-jpdb-comparison-restore-design.md`

---

## File Structure

| File | Responsibility | Status |
|------|---------------|--------|
| `src/routes/admin-word-exposures.js` | Aggregation (existing) + pure helpers + cache I/O + `parseOne` adapter + 3 endpoints | Modify (currently 93 lines, will grow to ~320) |
| `tests/unit/admin-word-exposures.test.js` | Unit tests for all pure helpers | Create (253 lines) |
| `public/admin-word-exposures.html` | Add back JPDB columns, progress indicator, diff filter, Phase 2 progressive loader | Modify (currently 374 lines, grows to ~547) |
| `data/jpdb-tokenization-cache.json` | Word-level comparison cache (gitignored) | Create empty `{}` |
| `data/jpdb-frame-compare-cache.json` | Frame-level comparison cache (gitignored) | Create empty `{}` |

The `.gitignore` already has entries for both cache files (from commit `aceee60`). Verify during Chunk 4.

---

## Chunk 1: Pure Helpers (TDD)

Testable logic lives in `src/routes/admin-word-exposures.js` as named exports. Tests drive implementation.

### Task 1: Create test file scaffold

**Files:**
- Create: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Create test file with imports and empty describe blocks**

Create `tests/unit/admin-word-exposures.test.js`:

```javascript
// tests/unit/admin-word-exposures.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let aggregateWordExposures, buildJpdbComparison, buildFrameComparison, loadJpdbCache, saveJpdbCache;

before(async () => {
  const mod = await import('../../src/routes/admin-word-exposures.js');
  aggregateWordExposures = mod.aggregateWordExposures;
  buildJpdbComparison = mod.buildJpdbComparison;
  buildFrameComparison = mod.buildFrameComparison;
  loadJpdbCache = mod.loadJpdbCache;
  saveJpdbCache = mod.saveJpdbCache;
});
```

- [ ] **Step 2: Verify test file parses**

Run: `node --check tests/unit/admin-word-exposures.test.js`
Expected: exits 0 (no output on success).

---

### Task 2: Tests for `aggregateWordExposures` (already-implemented regression guard)

`aggregateWordExposures` already exists in the route file. These tests guard it against regressions when we extend the module.

**Files:**
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Add aggregateWordExposures tests**

Append to `tests/unit/admin-word-exposures.test.js`:

```javascript
describe('aggregateWordExposures', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'word-exp-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('aggregates exposures across multiple user files', () => {
    writeFileSync(join(tempDir, 'word-knowledge-user1.json'), JSON.stringify({
      userId: 'user1',
      seen: {
        '木': { exposures: 10, firstSeen: '2026-01-01T00:00:00Z' },
        '水': { exposures: 5, firstSeen: '2026-01-01T00:00:00Z' },
      },
    }));
    writeFileSync(join(tempDir, 'word-knowledge-user2.json'), JSON.stringify({
      userId: 'user2',
      seen: {
        '木': { exposures: 20, firstSeen: '2026-01-02T00:00:00Z' },
        '火': { exposures: 3, firstSeen: '2026-01-02T00:00:00Z' },
      },
    }));

    const dictionary = new Map();
    dictionary.set('木', { reading: 'き', definitions: [{ en: 'tree', primary: true }] });
    dictionary.set('水', { reading: 'みず', definitions: [{ en: 'water', primary: true }] });

    const result = aggregateWordExposures(tempDir, dictionary);

    assert.equal(result.totalUsers, 2);
    assert.equal(result.totalUniqueWords, 3);
    assert.equal(result.words[0].word, '木');
    assert.equal(result.words[0].totalExposures, 30);
    assert.equal(result.words[0].userCount, 2);
    assert.equal(result.words[0].reading, 'き');
    assert.equal(result.words[0].definition, 'tree');
    assert.equal(result.words[2].word, '火');
    assert.equal(result.words[2].reading, null);
    assert.equal(result.words[2].definition, null);
  });

  it('returns empty result when no files exist', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'word-exp-empty-'));
    try {
      const result = aggregateWordExposures(emptyDir, new Map());
      assert.equal(result.totalUsers, 0);
      assert.equal(result.totalUniqueWords, 0);
      assert.deepEqual(result.words, []);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('handles malformed JSON files gracefully', () => {
    const mixedDir = mkdtempSync(join(tmpdir(), 'word-exp-mixed-'));
    try {
      writeFileSync(join(mixedDir, 'word-knowledge-bad.json'), 'NOT JSON{{{');
      writeFileSync(join(mixedDir, 'word-knowledge-good.json'), JSON.stringify({
        userId: 'good',
        seen: { '山': { exposures: 7 } },
      }));
      const result = aggregateWordExposures(mixedDir, new Map());
      assert.equal(result.totalUsers, 1);
      assert.equal(result.totalUniqueWords, 1);
      assert.equal(result.words[0].word, '山');
      assert.equal(result.words[0].totalExposures, 7);
    } finally {
      rmSync(mixedDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run these tests — expect PASS (function already exists)**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: `aggregateWordExposures` describe block passes (3/3). Other suites have no tests yet.

---

### Task 3: Write tests for `buildJpdbComparison`

**Files:**
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Append buildJpdbComparison tests**

Append to `tests/unit/admin-word-exposures.test.js`:

```javascript
describe('buildJpdbComparison', () => {
  it('returns isDifferent: false when single token matches our word', () => {
    const result = buildJpdbComparison('食べる', {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', 123, 456]],
    });
    assert.equal(result.isDifferent, false);
    assert.equal(result.jpdbSpelling, '食べる');
    assert.equal(result.jpdbReading, 'たべる');
  });

  it('returns isDifferent: true when headword differs', () => {
    const result = buildJpdbComparison('いらっしゃいませ', {
      tokens: [[0, 0, 27]],
      vocabulary: [['いらっしゃる', 'いらっしゃる', 100, 200]],
    });
    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, 'いらっしゃる');
  });

  it('returns isDifferent: true with joined spelling for multi-token split', () => {
    const result = buildJpdbComparison('食べ物', {
      tokens: [[0, 0, 9], [1, 9, 3]],
      vocabulary: [['食べる', 'たべる', 1, 1], ['物', 'もの', 2, 2]],
    });
    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, '食べる+物');
  });

  it('returns isDifferent: true with null spelling for empty response', () => {
    const result = buildJpdbComparison('テスト', {
      tokens: [],
      vocabulary: [],
    });
    assert.equal(result.isDifferent, true);
    assert.equal(result.jpdbSpelling, null);
    assert.equal(result.jpdbReading, null);
    assert.equal(result.jpdbDefinition, null);
  });

  it('extracts definition from meanings field (string array shape)', () => {
    const result = buildJpdbComparison('食べる', {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', ['to eat', 'to consume']]],
    });
    assert.equal(result.jpdbDefinition, 'to eat');
  });

  it('extracts definition from meanings field (object array shape with glosses)', () => {
    const result = buildJpdbComparison('食べる', {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', [{ glosses: ['to eat', 'to consume'] }]]],
    });
    assert.equal(result.jpdbDefinition, 'to eat, to consume');
  });
});
```

- [ ] **Step 2: Run — expect buildJpdbComparison suite to FAIL**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: test runs report "Cannot read properties of undefined" from `before` hook loading the module (buildJpdbComparison not yet exported).

---

### Task 4: Implement `buildJpdbComparison`

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Add `buildJpdbComparison` after `aggregateWordExposures`**

Insert in `src/routes/admin-word-exposures.js` just before `// --- Route factory ---`:

```javascript
/**
 * Compare our Sudachi base form against a JPDB parse response for a single word.
 *
 * Reads definition from vocabulary[2][0] (the `meanings` field, first entry)
 * when we requested vocabularyFields: ['spelling', 'reading', 'meanings'].
 */
export function buildJpdbComparison(ourWord, jpdbResponse) {
  const { tokens, vocabulary } = jpdbResponse;

  if (!tokens || tokens.length === 0) {
    return { jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true };
  }

  if (tokens.length === 1) {
    const vocabIdx = tokens[0][0];
    const vocab = vocabulary[vocabIdx];
    const spelling = vocab[0];
    const reading = vocab[1];
    const meanings = vocab[2];
    const definition = Array.isArray(meanings) && meanings.length > 0
      ? (typeof meanings[0] === 'string' ? meanings[0] : (meanings[0].glosses || []).join(', '))
      : null;
    const isDifferent = spelling !== ourWord;
    return { jpdbSpelling: spelling, jpdbReading: reading, jpdbDefinition: definition, isDifferent };
  }

  const spellings = tokens.map(t => vocabulary[t[0]][0]);
  const readings = tokens.map(t => vocabulary[t[0]][1]);
  return {
    jpdbSpelling: spellings.join('+'),
    jpdbReading: readings.join('+'),
    jpdbDefinition: null,
    isDifferent: true,
  };
}
```

- [ ] **Step 2: Run — expect buildJpdbComparison tests to PASS**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: `aggregateWordExposures` + `buildJpdbComparison` suites both green (3 + 6 = 9 tests pass).

---

### Task 5: Write tests for `buildFrameComparison`

**Files:**
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Append buildFrameComparison tests**

Append to `tests/unit/admin-word-exposures.test.js`:

```javascript
describe('buildFrameComparison', () => {
  it('detects spelling difference between Sudachi and JPDB tokens', () => {
    const frame = {
      raw: 'テスト',
      tokens: [{ surface: 'すみません', base: 'すみません', reading: 'すみません' }],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 15]],
      vocabulary: [['済みません', 'すみません', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, true);
    assert.ok(result.diffs.length > 0);
    assert.equal(result.diffs[0].type, 'spelling');
  });

  it('returns no diffs when tokens match', () => {
    const frame = {
      raw: 'テスト',
      tokens: [{ surface: '食べる', base: '食べる', reading: 'たべる' }],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べる', 'たべる', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, false);
    assert.equal(result.diffs.length, 0);
  });

  it('detects merge diff when Sudachi has more content tokens than JPDB', () => {
    const frame = {
      raw: 'テスト',
      tokens: [
        { surface: '食べ', base: '食べる', reading: 'たべ' },
        { surface: '物', base: '物', reading: 'もの' },
      ],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 9]],
      vocabulary: [['食べ物', 'たべもの', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, true);
    const mergeDiffs = result.diffs.filter(d => d.type === 'merge');
    assert.ok(mergeDiffs.length > 0, 'Should have at least one merge diff');
  });

  it('skips slot tokens in comparison', () => {
    const frame = {
      raw: '{item}をください',
      tokens: [
        { slot: 'item' },
        { surface: 'を' },
        { surface: 'ください', base: 'くださる', reading: 'ください' },
      ],
    };
    const jpdbResponse = {
      tokens: [[0, 0, 21]],
      vocabulary: [['くださる', 'くださる', 1, 1]],
    };
    const result = buildFrameComparison(frame, jpdbResponse);
    assert.equal(result.isDifferent, false);
    assert.equal(result.diffs.length, 0);
  });
});
```

- [ ] **Step 2: Run — expect buildFrameComparison suite to FAIL**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: `buildFrameComparison` tests error because the function is undefined in the `before` hook.

---

### Task 6: Implement `buildFrameComparison`

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Add `buildFrameComparison` after `buildJpdbComparison`**

Append (before `// --- Route factory ---`):

```javascript
/**
 * Compare a dialogue frame's Sudachi tokens against JPDB's sentence-level parse.
 * Greedy alignment with 3-token lookahead classifies diffs as merge, split, or spelling.
 */
export function buildFrameComparison(frame, jpdbResponse) {
  const sudachiTokens = frame.tokens
    .filter(t => t.base && !t.slot)
    .map(t => ({ base: t.base, surface: t.surface }));

  const jpdbTokens = (jpdbResponse.tokens || []).map(t => {
    const vocab = jpdbResponse.vocabulary[t[0]];
    return { spelling: vocab[0], reading: vocab[1] };
  });

  const diffs = [];
  let si = 0;
  let ji = 0;

  while (si < sudachiTokens.length && ji < jpdbTokens.length) {
    const sToken = sudachiTokens[si];
    const jToken = jpdbTokens[ji];

    if (sToken.base === jToken.spelling) {
      si++;
      ji++;
      continue;
    }

    let foundInJpdb = -1;
    let foundInSudachi = -1;

    for (let look = 1; look <= 3 && ji + look < jpdbTokens.length; look++) {
      if (sudachiTokens[si].base === jpdbTokens[ji + look].spelling) {
        foundInJpdb = ji + look;
        break;
      }
    }

    for (let look = 1; look <= 3 && si + look < sudachiTokens.length; look++) {
      if (sudachiTokens[si + look].base === jpdbTokens[ji].spelling) {
        foundInSudachi = si + look;
        break;
      }
    }

    if (foundInJpdb >= 0 && (foundInSudachi < 0 || (foundInJpdb - ji) <= (foundInSudachi - si))) {
      const extraJpdb = jpdbTokens.slice(ji, foundInJpdb);
      diffs.push({
        type: 'split',
        sudachi: sToken.base,
        jpdb: extraJpdb.map(t => t.spelling),
      });
      ji = foundInJpdb;
    } else if (foundInSudachi >= 0) {
      const extraSudachi = sudachiTokens.slice(si, foundInSudachi);
      diffs.push({
        type: 'merge',
        sudachi: extraSudachi.map(t => t.base),
        jpdb: jToken.spelling,
      });
      si = foundInSudachi;
    } else {
      diffs.push({
        type: 'spelling',
        sudachi: sToken.base,
        jpdb: jToken.spelling,
      });
      si++;
      ji++;
    }
  }

  if (si < sudachiTokens.length) {
    diffs.push({ type: 'merge', sudachi: sudachiTokens.slice(si).map(t => t.base), jpdb: null });
  }
  if (ji < jpdbTokens.length) {
    diffs.push({ type: 'split', sudachi: null, jpdb: jpdbTokens.slice(ji).map(t => t.spelling) });
  }

  return {
    raw: frame.raw,
    sudachiTokens,
    jpdbTokens,
    isDifferent: diffs.length > 0,
    diffs,
  };
}
```

- [ ] **Step 2: Run — expect buildFrameComparison suite to PASS**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: 13 tests pass (3 + 6 + 4).

---

### Task 7: Write tests for cache I/O

**Files:**
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Append JPDB cache tests**

```javascript
describe('JPDB cache', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jpdb-cache-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty object for missing cache file', () => {
    const result = loadJpdbCache(join(tempDir, 'nonexistent.json'));
    assert.deepEqual(result, {});
  });

  it('round-trips write then read', () => {
    const cachePath = join(tempDir, 'test-cache.json');
    const data = { 'word1': { spelling: 'a' }, 'word2': { spelling: 'b' } };
    saveJpdbCache(cachePath, data);
    const loaded = loadJpdbCache(cachePath);
    assert.deepEqual(loaded, data);
  });
});
```

- [ ] **Step 2: Run — expect cache tests to FAIL**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: cache tests error on undefined `loadJpdbCache` / `saveJpdbCache`.

---

### Task 8: Implement `loadJpdbCache` + `saveJpdbCache`

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Extend fs import**

Change line 2 of `src/routes/admin-word-exposures.js` from:
```javascript
import { readdirSync, readFileSync } from 'fs';
```
to:
```javascript
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
```

- [ ] **Step 2: Add cache helpers before `// --- Route factory ---`**

```javascript
export function loadJpdbCache(cachePath) {
  try {
    if (!existsSync(cachePath)) return {};
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveJpdbCache(cachePath, cache) {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}
```

- [ ] **Step 3: Run — expect all tests to PASS**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: 15 tests pass total (3 + 6 + 4 + 2).

- [ ] **Step 4: Commit Chunk 1**

```bash
git add src/routes/admin-word-exposures.js tests/unit/admin-word-exposures.test.js
git commit -m "$(cat <<'EOF'
feat(admin): restore JPDB comparison pure helpers

Port buildJpdbComparison, buildFrameComparison, loadJpdbCache, and
saveJpdbCache from the pre-JPDB-removal version of the admin route
(commit b505f74^). Add unit tests covering word-level comparison,
frame-level alignment (merge/split/spelling), slot filtering, and
cache round-trips. No route wiring yet.
EOF
)"
```

---

## Chunk 2: Adapter + Endpoints

### Task 9: Add `parseOne` adapter and `stripSlots` helper

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Add jpdb-helpers import**

Add import near the top of `src/routes/admin-word-exposures.js`:

```javascript
import { parseBatch } from '../../scripts/lib/jpdb-helpers.mjs';
```

- [ ] **Step 2: Add adapter and stripSlots near the cache helpers**

Insert before `// --- Route factory ---`:

```javascript
async function parseOne(text, apiKey) {
  const result = await parseBatch([text], apiKey, {
    vocabularyFields: ['spelling', 'reading', 'meanings'],
    batchSize: 1,
  });
  // parseBatch returns { vocabulary, tokens } where tokens is an array of
  // sentence-token-arrays. For a single input we want the first sentence.
  // Normalize bare-number tokens to [idx] array form — jpdb-helpers returns
  // bare numbers when tokenFields has one entry (the default).
  const rawTokens = result.tokens[0] || [];
  const tokens = rawTokens.map(t => Array.isArray(t) ? t : [t]);
  return { tokens, vocabulary: result.vocabulary };
}

function stripSlots(text) {
  return text.replace(/\{[^}]+\}/g, '');
}
```

- [ ] **Step 3: Run syntax check**

Run: `node --check src/routes/admin-word-exposures.js && echo OK`
Expected: `OK`

---

### Task 10: Restore `GET /frames` endpoint and wire `framesPath`

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Update the route factory signature and add paths**

Change the current `createWordExposureRoutes` definition in `src/routes/admin-word-exposures.js` from:
```javascript
export default function createWordExposureRoutes({ dataDir }) {
  const router = Router();
  router.use(adminAuth);

  let dictionary = null;
  function getDictionary() {
    if (!dictionary) dictionary = loadWordDictionary(dataDir);
    return dictionary;
  }

  // GET /word-exposures
  router.get('/word-exposures', (req, res) => {
    try {
      res.json(aggregateWordExposures(dataDir, getDictionary()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```
to:
```javascript
export default function createWordExposureRoutes({ dataDir, framesPath }) {
  const router = Router();
  router.use(adminAuth);

  let dictionary = null;
  function getDictionary() {
    if (!dictionary) dictionary = loadWordDictionary(dataDir);
    return dictionary;
  }

  const jpdbCachePath = join(dataDir, 'jpdb-tokenization-cache.json');
  const frameCachePath = join(dataDir, 'jpdb-frame-compare-cache.json');

  // GET /word-exposures
  router.get('/word-exposures', (req, res) => {
    try {
      res.json(aggregateWordExposures(dataDir, getDictionary()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /frames
  router.get('/frames', (req, res) => {
    try {
      const frames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      res.json({ frames: frames.map(f => ({ id: f.id, category: f.category, raw: f.raw })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

(`server.js` already passes `framesPath` — no change needed there.)

- [ ] **Step 2: Manual verify**

In one terminal: `npm run dev`
In another:
```bash
SECRET=$(grep -E '^ADMIN_SECRET=' .env | cut -d= -f2)
curl -s -H "X-Admin-Secret: $SECRET" http://localhost:5173/api/admin/frames | head -c 300
```
Expected: JSON `{ "frames": [ { "id": "...", "category": "...", "raw": "..." }, ... ] }`. If the URL 404s via Vite proxy, try port 3000.

---

### Task 11: Add `POST /word-exposures/jpdb-compare` endpoint

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Add the endpoint inside `createWordExposureRoutes`, after `GET /frames`**

```javascript
  // POST /word-exposures/jpdb-compare
  router.post('/word-exposures/jpdb-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'JPDB_API_KEY not configured' });

    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words (string[]) required' });
    }

    try {
      const cache = loadJpdbCache(jpdbCachePath);
      const results = {};
      let cached = 0, fetched = 0;

      for (const word of words) {
        if (cache[word]) {
          results[word] = cache[word];
          cached++;
          continue;
        }
        try {
          const jpdbResp = await parseOne(word, apiKey);
          const comparison = buildJpdbComparison(word, jpdbResp);
          cache[word] = comparison;
          results[word] = comparison;
          fetched++;
        } catch (err) {
          results[word] = {
            jpdbSpelling: null,
            jpdbReading: null,
            jpdbDefinition: null,
            isDifferent: true,
            error: err.message,
          };
        }
      }

      if (fetched > 0) saveJpdbCache(jpdbCachePath, cache);
      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/routes/admin-word-exposures.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Manual smoke test (requires live JPDB_API_KEY in .env)**

Restart dev server (`npm run dev`). Then:
```bash
SECRET=$(grep -E '^ADMIN_SECRET=' .env | cut -d= -f2)
curl -s -X POST -H "X-Admin-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"words":["食べる","いらっしゃいませ"]}' \
  http://localhost:5173/api/admin/word-exposures/jpdb-compare | head -c 400
```
Expected: JSON `{ results: { "食べる": { jpdbSpelling, jpdbReading, jpdbDefinition, isDifferent: false }, "いらっしゃいませ": { ..., isDifferent: true } }, cached: 0, fetched: 2 }`.
Then re-run the same curl: `cached: 2, fetched: 0` (disk cache hit).

If the server can't find `JPDB_API_KEY`, confirm it's in `.env`; the JPDB runtime removal dropped it from `.env.example` but the key in `.env` is still honored.

---

### Task 12: Add `POST /word-exposures/frame-compare` endpoint

**Files:**
- Modify: `src/routes/admin-word-exposures.js`

- [ ] **Step 1: Add the endpoint after the word-compare endpoint**

```javascript
  // POST /word-exposures/frame-compare
  router.post('/word-exposures/frame-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'JPDB_API_KEY not configured' });

    const { frameIds } = req.body;
    if (!Array.isArray(frameIds) || frameIds.length === 0) {
      return res.status(400).json({ error: 'frameIds (string[]) required' });
    }

    try {
      const allFrames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      const frameMap = new Map(allFrames.map(f => [f.id, f]));
      const cache = loadJpdbCache(frameCachePath);
      const results = {};
      let cached = 0, fetched = 0;

      for (const frameId of frameIds) {
        const frame = frameMap.get(frameId);
        if (!frame) {
          results[frameId] = { error: 'frame not found' };
          continue;
        }
        if (cache[frameId]) {
          results[frameId] = cache[frameId];
          cached++;
          continue;
        }
        try {
          const textForJpdb = stripSlots(frame.raw);
          if (!textForJpdb.trim()) continue;
          const jpdbResp = await parseOne(textForJpdb, apiKey);
          const comparison = buildFrameComparison(frame, jpdbResp);
          cache[frameId] = comparison;
          results[frameId] = comparison;
          fetched++;
        } catch (err) {
          results[frameId] = {
            raw: frame.raw,
            sudachiTokens: [],
            jpdbTokens: [],
            isDifferent: true,
            diffs: [],
            error: err.message,
          };
        }
      }

      if (fetched > 0) saveJpdbCache(frameCachePath, cache);
      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/routes/admin-word-exposures.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Manual smoke test**

Pick a real frame ID from `data/dialogue/frames.json`:
```bash
FRAME_ID=$(node -e "const f=JSON.parse(require('fs').readFileSync('data/dialogue/frames.json')); console.log(f[0].id)")
SECRET=$(grep -E '^ADMIN_SECRET=' .env | cut -d= -f2)
curl -s -X POST -H "X-Admin-Secret: $SECRET" -H "Content-Type: application/json" \
  -d "{\"frameIds\":[\"$FRAME_ID\"]}" \
  http://localhost:5173/api/admin/word-exposures/frame-compare | head -c 600
```
Expected: JSON `{ results: { "<id>": { raw, sudachiTokens, jpdbTokens, isDifferent, diffs } }, cached: 0, fetched: 1 }`.

- [ ] **Step 4: Run full unit test file again**

Run: `node --test tests/unit/admin-word-exposures.test.js`
Expected: 15 tests still pass.

- [ ] **Step 5: Commit Chunk 2**

```bash
git add src/routes/admin-word-exposures.js
git commit -m "$(cat <<'EOF'
feat(admin): restore JPDB comparison endpoints and frames list

Add parseOne adapter over scripts/lib/jpdb-helpers.mjs parseBatch,
stripSlots helper, GET /api/admin/frames, POST
/api/admin/word-exposures/jpdb-compare, and POST
/api/admin/word-exposures/frame-compare. Per-batch disk cache
writes use existing jpdb-tokenization-cache.json and
jpdb-frame-compare-cache.json paths (gitignored).
EOF
)"
```

---

## Chunk 3: Frontend Restore

The frontend diff is a near-verbatim revert of commit `3b38eb6`. Apply in three logical slices so each slice can be viewed in isolation.

### Task 13: Restore CSS for diff styling + controls

**Files:**
- Modify: `public/admin-word-exposures.html`

- [ ] **Step 1: Add back removed styles**

In `public/admin-word-exposures.html`, inside the `<style>` block, add these rules after the `button:disabled` rule (around line 62):

```css
  .controls .checkbox-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .controls .checkbox-wrap input { cursor: pointer; }
  .controls .checkbox-wrap label { cursor: pointer; }
```

Update the `.stats` rule from:
```css
  .stats {
    color: #7fdbca;
    font-size: 13px;
    margin-bottom: 10px;
  }
```
to:
```css
  .stats {
    color: #7fdbca;
    font-size: 13px;
    margin-bottom: 4px;
  }
  .progress {
    font-size: 12px;
    color: #f0a500;
    margin-bottom: 10px;
    min-height: 16px;
  }
  .progress span { margin-right: 16px; }
```

After the `tbody tr:hover` rule, add:

```css
  tbody tr.different { background: #2a1a1a; }
  tbody tr.different:hover { background: #3a2020; }
  .diff-yes {
    background: #a83232;
    color: #fff;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: bold;
  }
  .diff-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    margin: 1px 2px;
    white-space: nowrap;
  }
  .diff-merge { background: #a86b32; color: #fff; }
  .diff-split { background: #3264a8; color: #fff; }
  .diff-spelling { background: #a83264; color: #fff; }
```

---

### Task 14: Restore HTML controls + table columns

**Files:**
- Modify: `public/admin-word-exposures.html`

- [ ] **Step 1: Add "Show only differences" checkbox inside `.controls`**

After the `<button id="loadBtn" onclick="load()">Reload</button>` line, insert:

```html
  <div class="checkbox-wrap">
    <input type="checkbox" id="diffOnly" onchange="renderAll()">
    <label for="diffOnly">Show only differences</label>
  </div>
```

- [ ] **Step 2: Add progress div after `<div class="stats" id="stats"></div>`**

```html
<div class="progress">
  <span id="wordProgress"></span>
  <span id="frameProgress"></span>
</div>
```

- [ ] **Step 3: Add JPDB columns to Words table header**

Inside `<table id="words-table">` → `<thead>` → `<tr>`, after the existing `<th>Users</th>`, add:

```html
        <th>JPDB Spelling</th>
        <th>JPDB Reading</th>
        <th>JPDB Definition</th>
        <th>Different?</th>
```

- [ ] **Step 4: Add JPDB columns to Frames table header**

Inside `<table id="frames-table">` → `<thead>` → `<tr>`, after the existing `<th>Sudachi Tokens</th>`, add:

```html
        <th>JPDB Tokens</th>
        <th>Diffs</th>
```

---

### Task 15: Restore state maps, formatDiffPart, and updated renderers

**Files:**
- Modify: `public/admin-word-exposures.html`

- [ ] **Step 1: Add state maps near existing state**

Change the state block from:
```javascript
let wordsData = [];
let framesData = [];
let sortCol = 'totalExposures';
let sortDir = -1; // -1 = desc
let activeTab = 'words';
```
to:
```javascript
let wordsData = [];
let framesData = [];
let jpdbWordResults = {};
let jpdbFrameResults = {};
let sortCol = 'totalExposures';
let sortDir = -1; // -1 = desc
let activeTab = 'words';
```

- [ ] **Step 2: Replace `renderWords` with JPDB-aware version**

Replace the existing `renderWords()` function with:

```javascript
function renderWords() {
  const tbody = document.getElementById('words-body');
  const diffOnly = document.getElementById('diffOnly').checked;
  const search = document.getElementById('search').value.toLowerCase().trim();
  const sorted = getSortedWords();

  let html = '';
  let idx = 0;
  for (const w of sorted) {
    const jpdb = jpdbWordResults[w.word];
    const isDiff = jpdb ? jpdb.isDifferent : null;

    if (diffOnly && jpdb != null && !isDiff) continue;
    if (search) {
      const hay = [w.word, w.reading, w.definition].join(' ').toLowerCase();
      if (!hay.includes(search)) continue;
    }

    idx++;
    const rowClass = isDiff ? ' class="different"' : '';
    const jpdbSpelling = jpdb ? esc(jpdb.jpdbSpelling) : '<span class="loading">...</span>';
    const jpdbReading = jpdb ? esc(jpdb.jpdbReading) : '<span class="loading">...</span>';
    const jpdbDef = jpdb ? esc(jpdb.jpdbDefinition) : '<span class="loading">...</span>';
    let diffCell = '<span class="loading">...</span>';
    if (jpdb != null) {
      diffCell = isDiff ? '<span class="diff-yes">YES</span>' : 'no';
    }

    html += '<tr' + rowClass + '>'
      + '<td>' + idx + '</td>'
      + '<td>' + esc(w.word) + '</td>'
      + '<td>' + esc(w.reading) + '</td>'
      + '<td>' + esc(w.definition) + '</td>'
      + '<td>' + w.totalExposures + '</td>'
      + '<td>' + w.userCount + '</td>'
      + '<td>' + jpdbSpelling + '</td>'
      + '<td>' + jpdbReading + '</td>'
      + '<td>' + jpdbDef + '</td>'
      + '<td>' + diffCell + '</td>'
      + '</tr>';
  }

  tbody.innerHTML = html;
  document.getElementById('words-table').style.display = wordsData.length ? '' : 'none';
  document.getElementById('words-empty').style.display = wordsData.length ? 'none' : '';
}
```

- [ ] **Step 3: Replace `renderFrames` with JPDB-aware version**

Replace the existing `renderFrames()` function with:

```javascript
function renderFrames() {
  const tbody = document.getElementById('frames-body');
  const diffOnly = document.getElementById('diffOnly').checked;
  const search = document.getElementById('search').value.toLowerCase().trim();
  const catFilter = document.getElementById('categoryFilter').value;

  let html = '';
  for (const f of framesData) {
    const cmp = jpdbFrameResults[f.id];
    const isDiff = cmp ? cmp.isDifferent : null;

    if (diffOnly && cmp != null && !isDiff) continue;
    if (catFilter && f.category !== catFilter) continue;
    if (search) {
      const hay = [f.id, f.category, f.raw].join(' ').toLowerCase();
      if (!hay.includes(search)) continue;
    }

    const rowClass = isDiff ? ' class="different"' : '';

    let sudachiCol = '<span class="loading">...</span>';
    let jpdbCol = '<span class="loading">...</span>';
    let diffCol = '<span class="loading">...</span>';

    if (cmp) {
      sudachiCol = esc((cmp.sudachiTokens || []).map(t => t.base || t.surface).join('\u00B7'));
      jpdbCol = esc((cmp.jpdbTokens || []).map(t => t.spelling).join('\u00B7'));
      if (cmp.diffs && cmp.diffs.length > 0) {
        diffCol = cmp.diffs.map(d => {
          const cls = 'diff-badge diff-' + (d.type || 'spelling');
          const sud = formatDiffPart(d.sudachi);
          const jpd = formatDiffPart(d.jpdb);
          return '<span class="' + cls + '">' + esc(d.type) + ': ' + esc(sud) + ' \u2192 ' + esc(jpd) + '</span>';
        }).join(' ');
      } else {
        diffCol = isDiff ? '<span class="diff-yes">differs</span>' : '';
      }
    } else {
      // No JPDB data yet — fall back to showing Sudachi tokens without waiting
      sudachiCol = f.tokens
        ? esc(f.tokens.map(t => t.base || t.surface).join('\u00B7'))
        : '';
    }

    html += '<tr' + rowClass + '>'
      + '<td>' + esc(f.id) + '</td>'
      + '<td>' + esc(f.category) + '</td>'
      + '<td>' + esc(f.raw) + '</td>'
      + '<td>' + sudachiCol + '</td>'
      + '<td>' + jpdbCol + '</td>'
      + '<td>' + diffCol + '</td>'
      + '</tr>';
  }

  tbody.innerHTML = html;
  document.getElementById('frames-table').style.display = framesData.length ? '' : 'none';
  document.getElementById('frames-empty').style.display = framesData.length ? 'none' : '';
}

function formatDiffPart(val) {
  if (val == null) return '\u2205';
  if (Array.isArray(val)) return val.join('+');
  return String(val);
}
```

---

### Task 16: Wire Phase 2 progressive loaders

**Files:**
- Modify: `public/admin-word-exposures.html`

- [ ] **Step 1: Update `load()` to reset state maps and kick off Phase 2**

Change the body of `load()` after `renderAll()` — replace the existing try block's middle section. The full replacement `load()`:

```javascript
async function load() {
  const btn = document.getElementById('loadBtn');
  btn.textContent = 'Loading...';
  btn.disabled = true;

  try {
    // Phase 1: fetch word-exposures and frames in parallel
    const [wordsRes, framesRes] = await Promise.all([
      fetch('/api/admin/word-exposures', { headers: headers() }).then(r => r.json()),
      fetch('/api/admin/frames', { headers: headers() }).then(r => r.json())
    ]);

    wordsData = wordsRes.words || [];
    window._totalUsers = wordsRes.totalUsers;
    framesData = framesRes.frames || [];

    jpdbWordResults = {};
    jpdbFrameResults = {};

    updateStats();
    populateCategories();
    renderAll();

    // Phase 2: JPDB comparisons in batches (concurrent)
    fetchJpdbWordBatches();
    fetchJpdbFrameBatches();
  } catch (err) {
    alert('Error loading data: ' + err.message);
  } finally {
    btn.textContent = 'Load';
    btn.disabled = false;
  }
}
```

- [ ] **Step 2: Add the two batch loaders after `load()`**

```javascript
async function fetchJpdbWordBatches() {
  const BATCH = 50;
  const allWords = wordsData.map(w => w.word);
  const total = allWords.length;

  for (let i = 0; i < total; i += BATCH) {
    const batch = allWords.slice(i, i + BATCH);
    document.getElementById('wordProgress').textContent =
      'Words: comparing ' + Math.min(i + BATCH, total) + '/' + total + '...';

    try {
      const res = await fetch('/api/admin/word-exposures/jpdb-compare', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ words: batch })
      });
      if (res.status === 503) {
        document.getElementById('wordProgress').textContent = 'Words: JPDB unavailable';
        return;
      }
      const data = await res.json();
      Object.assign(jpdbWordResults, data.results || {});
      renderWords();
    } catch (err) {
      console.error('JPDB word batch error:', err);
    }
  }

  document.getElementById('wordProgress').textContent =
    'Words: ' + total + '/' + total + ' compared';
}

async function fetchJpdbFrameBatches() {
  const BATCH = 30;
  const allIds = framesData.map(f => f.id);
  const total = allIds.length;

  for (let i = 0; i < total; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    document.getElementById('frameProgress').textContent =
      'Frames: comparing ' + Math.min(i + BATCH, total) + '/' + total + '...';

    try {
      const res = await fetch('/api/admin/word-exposures/frame-compare', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ frameIds: batch })
      });
      if (res.status === 503) {
        document.getElementById('frameProgress').textContent = 'Frames: JPDB unavailable';
        return;
      }
      const data = await res.json();
      Object.assign(jpdbFrameResults, data.results || {});
      renderFrames();
    } catch (err) {
      console.error('JPDB frame batch error:', err);
    }
  }

  document.getElementById('frameProgress').textContent =
    'Frames: ' + total + '/' + total + ' compared';
}
```

(The 503 fast-path is new — gracefully degrades if `JPDB_API_KEY` is missing instead of hammering the endpoint.)

- [ ] **Step 3: Syntax check**

Run: `node --check public/admin-word-exposures.html` — skip, not JS-only. Instead:
```bash
node -e "const h=require('fs').readFileSync('public/admin-word-exposures.html','utf-8'); const m=h.match(/<script>([\s\S]*?)<\/script>/); new Function(m[1]); console.log('OK')"
```
Expected: `OK`.

---

### Task 17: Browser smoke test

**Files:** none (manual verification)

- [ ] **Step 1: Start dev server if not running**

Run: `npm run dev` — wait 5s, then confirm reachable:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: `200`.

- [ ] **Step 2: Load dashboard and verify Phase 1**

Ask the user before launching Playwright (CLAUDE.md rule). If approved:
```javascript
await page.goto('http://localhost:5173/admin-word-exposures.html');
await page.waitForSelector('#words-table', { state: 'visible' });
```
Expected: words table renders with 6 visible columns populated, JPDB columns show `...`. Stats show "N unique words | M users | K frames". Progress row shows "Words: comparing ...".

- [ ] **Step 3: Verify Phase 2 populates progressively**

Wait for progress span to reach "Words: N/N compared" (may take ~30s for first run against live JPDB, fast if cache warm).
Expected: JPDB Spelling/Reading/Definition/Different? columns populate. Some rows get `class="different"` (red tint) with a `YES` badge.

- [ ] **Step 4: Verify "Show only differences" filter**

Click the checkbox. Expected: only rows with `Different? = YES` remain visible. Uncheck: all rows return.

- [ ] **Step 5: Switch to Frames tab**

Click "Frame Comparison". Expected: frames table populates. JPDB Tokens column fills in during Phase 2. Diffs column shows `merge:...` / `split:...` / `spelling:...` badges for differing frames.

- [ ] **Step 6: Screenshot and clean up**

Take a screenshot of each tab's populated state to confirm to the user, then `rm` the screenshots (CLAUDE.md session-cleanup rule).

- [ ] **Step 7: Commit Chunk 3**

```bash
git add public/admin-word-exposures.html
git commit -m "$(cat <<'EOF'
feat(admin): restore JPDB comparison UI on word exposure dashboard

Add back "Show only differences" filter, progress indicator, four
JPDB columns on the Words tab (Spelling / Reading / Definition /
Different?), two JPDB columns on the Frames tab (JPDB Tokens /
Diffs) with merge/split/spelling diff badges, and Phase 2
progressive batch loaders (50 words / 30 frames per call). Gracefully
degrades with "JPDB unavailable" if the endpoint returns 503.
EOF
)"
```

---

## Chunk 4: Cache Init + Final Verification

### Task 18: Verify gitignore + initialize empty cache files

**Files:**
- Verify: `.gitignore`
- Create: `data/jpdb-tokenization-cache.json`
- Create: `data/jpdb-frame-compare-cache.json`

- [ ] **Step 1: Confirm gitignore entries exist**

Run:
```bash
grep -E 'jpdb-tokenization-cache|jpdb-frame-compare-cache' .gitignore
```
Expected: both file names print. If either is missing, add the missing line(s) and `git add .gitignore` / commit separately with message `chore: gitignore admin JPDB comparison caches`.

- [ ] **Step 2: Initialize empty cache files (only if they don't already exist after browser smoke test)**

```bash
[ -f data/jpdb-tokenization-cache.json ] || echo '{}' > data/jpdb-tokenization-cache.json
[ -f data/jpdb-frame-compare-cache.json ] || echo '{}' > data/jpdb-frame-compare-cache.json
```

(These should NOT be staged — they're gitignored. Verify with `git status`; the files must not appear.)

---

### Task 19: Full test suite + commit + summary

**Files:** none (run full gate)

- [ ] **Step 1: Run Tier 1 + Tier 2**

Run: `npm test`
Expected: existing passing count + 15 new tests from `admin-word-exposures.test.js`, still all green. Coverage floor unchanged.

- [ ] **Step 2: Verify git state is clean**

Run: `git status`
Expected: no modified or untracked files tracked by git (cache files gitignored). Recent commits listed:
- `feat(admin): restore JPDB comparison pure helpers` (Chunk 1)
- `feat(admin): restore JPDB comparison endpoints and frames list` (Chunk 2)
- `feat(admin): restore JPDB comparison UI on word exposure dashboard` (Chunk 3)

- [ ] **Step 3: Summary to user**

Report: all 15 unit tests pass; 3 new endpoints (`GET /frames`, `POST /word-exposures/jpdb-compare`, `POST /word-exposures/frame-compare`); frontend columns and Phase 2 progressive loader restored; caches gitignored and initialized; browser smoke test confirmed rendering on both tabs.
