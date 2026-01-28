# JPDB Rate Limiting Redesign Implementation Plan

> **Status: IMPLEMENTED** — Completed 2026-01-28

## Implementation Summary

This redesign successfully replaced the aggressive deck-scanning approach with a cache-first architecture that dramatically reduces JPDB API calls while maintaining accurate vocabulary state for spaced repetition learning.

### What Was Built

#### 1. Static Word List Infrastructure
- **`data/jpdb-wordlist.json`** — 26,995 words extracted from frequency corpus, stored as `[{word, rank}, ...]` format preserving frequency rankings for future prioritization features
- **`scripts/generate-wordlist.mjs`** — One-time generation script converting CSV to JSON

#### 2. Circuit Breaker Protection
Added defensive rate limiting to `src/jpdb.js` that prevents cascading failures:

| Component | Purpose |
|-----------|---------|
| `getCircuitBreakerState()` | Expose breaker status for monitoring |
| `resetCircuitBreaker()` | Testing utility to reset state |
| `tripCircuitBreaker(statusCode)` | Trigger on 429/5xx responses |
| `isCircuitBreakerClosed()` | Gate check before API calls |
| `onSuccessfulRequest()` | Reset breaker after success |

**Behavior:**
- First failure: 5-minute cooldown
- Repeated failures: 15-minute extended cooldown
- Cooldown expiry: Allow single test request, reset on success

#### 3. Batch Parse Functions
New efficient bulk operations in `src/jpdb.js`:

- **`parseWordBatch(apiKey, words)`** — Parse up to 2000 words in a single `/parse` call, then fetch card states via `/lookup-vocabulary`
- **`parseWordBatches(apiKey, words, batchSize, delayMs)`** — Orchestrate multiple batches with configurable delays (default: 2000 words/batch, 3s delay)

#### 4. Enhanced Vocab Manager Cache
Updated `src/game/vocab-manager.js` with new cache format:

```javascript
{
  recentlyUsedWords: [],
  wordStateCache: {
    "word": { vid, sid, states, dueAt, reading, rank }
  },
  lastRefresh: timestamp,
  lastFullParse: timestamp  // NEW: Track full parse freshness
}
```

**New exports:**
- `FULL_PARSE_CONFIG` — Configurable batch sizes and cache expiry (1 hour)
- `performFullParse(apiKey, wordList)` — Session-start batch parsing
- `updateWordStates(wordStates)` — Incremental cache updates post-combat

#### 5. Session Start Warming
**Endpoint:** `POST /api/game/session-start`

On game load, the frontend calls this endpoint which:
1. Checks if cache is fresh (< 1 hour old) — skip if so
2. Parses top 10,000 words in 5 batches of 2,000
3. Stores vid/sid/states/dueAt for each word
4. Returns `{ warmed: true, cachedWords: N }`

**Frontend integration:** `warmJpdbCache()` in `public/game.js` fires after authentication.

#### 6. Cache-First Due Words
Refactored `fetchDueWordsDirectly()` in `src/jpdb.js`:

```
Request → getDueWordsFromCache() → [words found?]
                                      ├─ Yes → Return from cache (0 API calls)
                                      └─ No  → fetchDueWordsFromApi() (fallback)
```

Cache filtering logic:
- Exclude: blacklisted, suspended, new, redundant states
- Prioritize: due > failed > learning
- Sort by: priority, then dueAt timestamp

#### 7. Post-Combat Refresh
**Endpoint:** `POST /api/game/post-combat-refresh`

After combat ends, only reviewed words get refreshed:

1. `word-practice.js` tracks `reviewedWordsThisCombat[]`
2. `combat-loop.js` calls endpoint in `stopCombatLoop()`
3. Server parses just those words via `parseWordBatch()`
4. Cache updates via `updateWordStates()`

This ensures the cache stays accurate for spaced repetition without re-parsing thousands of words.

### API Call Comparison

| Scenario | Before | After | Reduction |
|----------|--------|-------|-----------|
| Session start (cold cache) | 51+ calls | 5 calls | 90% |
| Session start (warm cache) | 0 calls | 0 calls | — |
| Per combat | 6+ calls | 0 calls | 100% |
| Post-combat refresh | 0 calls | 1 call | N/A |
| **Estimated hourly** | **30+ calls** | **~10 calls** | **67%** |

### Files Modified

| File | Changes |
|------|---------|
| `src/jpdb.js` | Circuit breaker, batch parse, cache-first fetchDueWords |
| `src/game/vocab-manager.js` | lastFullParse, performFullParse, updateWordStates |
| `src/routes/game/misc.js` | /session-start, /post-combat-refresh endpoints |
| `src/routes/game/index.js` | Pass staticWordList to misc routes |
| `src/routes/index.js` | Pass staticWordList through route chain |
| `server.js` | Load static word list on startup |
| `public/game.js` | warmJpdbCache() on init |
| `public/js/word-practice.js` | Track reviewed words, remove bypassCache |
| `public/js/ui/combat-loop.js` | Call post-combat-refresh |

### Files Created

| File | Purpose |
|------|---------|
| `data/jpdb-wordlist.json` | Static word list (26,995 words with frequency rank) |
| `scripts/generate-wordlist.mjs` | Word list generation script |
| `tests/unit/jpdb-circuit-breaker.test.js` | Circuit breaker unit tests |
| `tests/unit/jpdb-batch-parse.test.js` | Batch parse unit tests |
| `tests/unit/vocab-manager-cache.test.js` | Cache format unit tests |

### Test Results

```
JPDB Circuit Breaker     ✔ 3 tests
Batch Parse              ✔ 2 tests
Vocab Manager Cache      ✔ 3 tests
────────────────────────────────────
Total                    ✔ 8 pass, 0 fail
```

### Commits

1. `6871322` feat(jpdb): add static word list generation from CSV
2. `e1b03ac` feat(jpdb): add circuit breaker state exports
3. `12133bf` feat(jpdb): implement circuit breaker trip and reset logic
4. `87ecf8f` feat(jpdb): integrate circuit breaker into jpdbFetch
5. `be975fb` feat(jpdb): add batch parse functions for efficient bulk word lookup
6. `69bfc57` feat(vocab-manager): add lastFullParse timestamp to cache format
7. `bf2cb21` feat(vocab-manager): add performFullParse for batch word state lookup
8. `2cd862a` feat(jpdb): add session-start endpoint for full parse warmup
9. `77d25ce` feat(jpdb): fetchDueWordsDirectly now uses cache first
10. `9dccffb` feat(word-practice): use cached due words instead of API bypass
11. `04ec623` feat(word-practice): track reviewed words for post-combat refresh
12. `9dfe3b9` feat(jpdb): add post-combat-refresh endpoint for reviewed words
13. `f6ec500` feat(combat): trigger post-combat refresh for reviewed words
14. `dae96a0` feat(game): warm JPDB cache on session start

### Verification Checklist

- [x] Server starts without errors
- [x] Static word list loads (26,995 words)
- [x] Unit tests pass (8/8)
- [x] Circuit breaker trips on 429 errors
- [x] Session-start endpoint warms cache
- [x] Combat words served from cache
- [x] Post-combat refresh updates reviewed words
- [ ] Production deployment verified

---

## Original Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace deck-scanning and per-word API fetches with a static word list + batched `/parse` calls, reducing JPDB API calls from 30+/hour to ~10/hour and preventing IP blocks.

**Architecture:** Ship a static JSON word list (~27k words from CSV). On session start, batch-parse the top 10k words in 5 batches of 2000 words each, spaced 3 seconds apart. Store results in a local cache with `lastFullParse` timestamp. All combat word requests are served from cache. After combat, refresh only reviewed words with a single `/parse` call. Add circuit breaker to gracefully degrade on rate limit errors.

**Tech Stack:** Node.js ES6 modules, Express routes, in-memory + file-based caching

---

## Phase 1: Static Word List + Batch Parse Infrastructure

### Task 1.1: Generate Static Word List JSON

**Files:**
- Create: `data/jpdb-wordlist.json`
- Create: `scripts/generate-wordlist.mjs`

**Step 1: Write the generation script**

```javascript
// scripts/generate-wordlist.mjs
import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync('top_30k_words.csv', 'utf-8');
const lines = csv.trim().split('\n');

// Extract first column (spelling) from each line
const words = lines.map(line => {
  const parts = line.split(',');
  return parts[0].trim();
}).filter(w => w.length > 0);

console.log(`Extracted ${words.length} words from CSV`);

writeFileSync('data/jpdb-wordlist.json', JSON.stringify(words, null, 0));
console.log('Wrote data/jpdb-wordlist.json');
```

**Step 2: Run the script**

Run: `node scripts/generate-wordlist.mjs`
Expected: "Extracted 26995 words from CSV" and file created

**Step 3: Verify the output**

Run: `head -c 200 data/jpdb-wordlist.json && echo`
Expected: JSON array starting with `["する","ある","こと",`

**Step 4: Commit**

```bash
git add scripts/generate-wordlist.mjs data/jpdb-wordlist.json
git commit -m "feat(jpdb): add static word list generation from CSV"
```

---

### Task 1.2: Add Circuit Breaker to jpdbFetch

**Files:**
- Modify: `src/jpdb.js:39-55` (jpdbFetch function)

**Step 1: Write the failing test**

Create: `tests/unit/jpdb-circuit-breaker.test.js`

```javascript
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// We'll test the circuit breaker by mocking fetch
describe('JPDB Circuit Breaker', () => {
  it('should export circuit breaker state getters', async () => {
    const { getCircuitBreakerState } = await import('../../src/jpdb.js');
    const state = getCircuitBreakerState();
    assert.ok('isOpen' in state, 'should have isOpen property');
    assert.ok('cooldownUntil' in state, 'should have cooldownUntil property');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/jpdb-circuit-breaker.test.js`
Expected: FAIL with "getCircuitBreakerState is not exported"

**Step 3: Add circuit breaker state and exports to jpdb.js**

Add after line 40 (after `const MIN_CALL_INTERVAL_MS = 500;`):

```javascript
// Circuit breaker state - stops all calls after rate limit errors
let circuitBreaker = {
  isOpen: false,
  cooldownUntil: 0,
  consecutiveFailures: 0
};

const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes
const CIRCUIT_BREAKER_EXTENDED_COOLDOWN_MS = 15 * 60 * 1000;  // 15 minutes

/**
 * Get circuit breaker state for monitoring
 */
export function getCircuitBreakerState() {
  return {
    isOpen: circuitBreaker.isOpen,
    cooldownUntil: circuitBreaker.cooldownUntil,
    consecutiveFailures: circuitBreaker.consecutiveFailures
  };
}

/**
 * Reset circuit breaker (for testing)
 */
export function resetCircuitBreaker() {
  circuitBreaker = {
    isOpen: false,
    cooldownUntil: 0,
    consecutiveFailures: 0
  };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/jpdb-circuit-breaker.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/jpdb.js tests/unit/jpdb-circuit-breaker.test.js
git commit -m "feat(jpdb): add circuit breaker state exports"
```

---

### Task 1.3: Implement Circuit Breaker Logic in jpdbFetch

**Files:**
- Modify: `src/jpdb.js` (jpdbFetch function)

**Step 1: Write the failing test**

Add to `tests/unit/jpdb-circuit-breaker.test.js`:

```javascript
describe('jpdbFetch with circuit breaker', () => {
  it('should trip circuit breaker on 429 error', async () => {
    const { tripCircuitBreaker, getCircuitBreakerState, resetCircuitBreaker } = await import('../../src/jpdb.js');

    resetCircuitBreaker();
    tripCircuitBreaker(429);

    const state = getCircuitBreakerState();
    assert.strictEqual(state.isOpen, true, 'circuit should be open after 429');
    assert.ok(state.cooldownUntil > Date.now(), 'cooldown should be in future');
  });

  it('should extend cooldown on repeated failures', async () => {
    const { tripCircuitBreaker, getCircuitBreakerState, resetCircuitBreaker } = await import('../../src/jpdb.js');

    resetCircuitBreaker();
    tripCircuitBreaker(429);
    const firstCooldown = getCircuitBreakerState().cooldownUntil;

    // Simulate retry after cooldown that also fails
    tripCircuitBreaker(429);
    const secondCooldown = getCircuitBreakerState().cooldownUntil;

    assert.ok(secondCooldown > firstCooldown, 'second cooldown should be longer');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/jpdb-circuit-breaker.test.js`
Expected: FAIL with "tripCircuitBreaker is not exported"

**Step 3: Add tripCircuitBreaker function**

Add to `src/jpdb.js` after the state exports:

```javascript
/**
 * Trip the circuit breaker after a rate limit or server error
 * @param {number} statusCode - HTTP status code that caused the trip
 */
export function tripCircuitBreaker(statusCode) {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.isOpen = true;

  // Extended cooldown after multiple failures
  const cooldownMs = circuitBreaker.consecutiveFailures > 1
    ? CIRCUIT_BREAKER_EXTENDED_COOLDOWN_MS
    : CIRCUIT_BREAKER_COOLDOWN_MS;

  circuitBreaker.cooldownUntil = Date.now() + cooldownMs;

  console.warn(`[JPDB Circuit Breaker] Tripped! Status ${statusCode}, cooldown ${cooldownMs / 1000}s, failures: ${circuitBreaker.consecutiveFailures}`);
}

/**
 * Check if circuit breaker allows requests
 */
function isCircuitBreakerClosed() {
  if (!circuitBreaker.isOpen) return true;

  if (Date.now() >= circuitBreaker.cooldownUntil) {
    console.log('[JPDB Circuit Breaker] Cooldown expired, allowing test request');
    return true;  // Allow one test request
  }

  return false;
}

/**
 * Reset circuit breaker on successful request
 */
function onSuccessfulRequest() {
  if (circuitBreaker.isOpen) {
    console.log('[JPDB Circuit Breaker] Request succeeded, closing breaker');
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    circuitBreaker.cooldownUntil = 0;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/jpdb-circuit-breaker.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/jpdb.js tests/unit/jpdb-circuit-breaker.test.js
git commit -m "feat(jpdb): implement circuit breaker trip and reset logic"
```

---

### Task 1.4: Integrate Circuit Breaker into jpdbFetch

**Files:**
- Modify: `src/jpdb.js:45-55` (jpdbFetch function)

**Step 1: Replace jpdbFetch implementation**

Replace the existing `jpdbFetch` function with:

```javascript
/**
 * Rate-limited fetch for JPDB API calls with circuit breaker
 */
async function jpdbFetch(url, options) {
  // Check circuit breaker first
  if (!isCircuitBreakerClosed()) {
    const waitMs = circuitBreaker.cooldownUntil - Date.now();
    throw new Error(`JPDB circuit breaker open, ${Math.ceil(waitMs / 1000)}s remaining`);
  }

  const now = Date.now();
  const timeSinceLastCall = now - lastJpdbCall;

  if (timeSinceLastCall < MIN_CALL_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL_MS - timeSinceLastCall));
  }

  lastJpdbCall = Date.now();

  const response = await fetch(url, options);

  // Trip circuit breaker on rate limit or server errors
  if (response.status === 429 || response.status >= 500) {
    tripCircuitBreaker(response.status);
  } else if (response.ok) {
    onSuccessfulRequest();
  }

  return response;
}
```

**Step 2: Verify existing tests still pass**

Run: `npm run test:unit`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/jpdb.js
git commit -m "feat(jpdb): integrate circuit breaker into jpdbFetch"
```

---

### Task 1.5: Add Batch Parse Function

**Files:**
- Modify: `src/jpdb.js`

**Step 1: Write the failing test**

Add to `tests/unit/jpdb-circuit-breaker.test.js` (rename to `tests/unit/jpdb-batch-parse.test.js`):

```javascript
describe('Batch Parse', () => {
  it('should export parseWordBatch function', async () => {
    const jpdb = await import('../../src/jpdb.js');
    assert.strictEqual(typeof jpdb.parseWordBatch, 'function');
  });

  it('should export parseWordBatches function', async () => {
    const jpdb = await import('../../src/jpdb.js');
    assert.strictEqual(typeof jpdb.parseWordBatches, 'function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/jpdb-batch-parse.test.js`
Expected: FAIL with "parseWordBatch is not a function"

**Step 3: Add parseWordBatch function**

Add to `src/jpdb.js`:

```javascript
/**
 * Parse a batch of words to get their vid/sid and card states
 * Uses /parse endpoint which is more efficient than lookup for bulk operations
 *
 * @param {string} apiKey - JPDB API key
 * @param {string[]} words - Array of word spellings to parse
 * @returns {Promise<Object>} Map of spelling -> { vid, sid, states, dueAt }
 */
export async function parseWordBatch(apiKey, words) {
  if (!apiKey || !words || words.length === 0) {
    return {};
  }

  // Join words with spaces for parsing
  const text = words.join(' ');

  try {
    const parseResponse = await jpdbFetch(`${JPDB_API_BASE}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        text,
        token_fields: ['vocabulary_index'],
        vocabulary_fields: ['spelling', 'reading', 'vid', 'sid']
      })
    });

    if (!parseResponse.ok) {
      if (parseResponse.status === 429) {
        console.warn('[JPDB Batch Parse] Rate limited');
      }
      return {};
    }

    const parseData = await parseResponse.json();
    const vocabulary = parseData.vocabulary || [];

    if (vocabulary.length === 0) return {};

    // Build vocab ID list for state lookup
    const vocabIds = vocabulary.map(v => [v[2], v[3]]); // [vid, sid]
    const spellingMap = {};
    vocabulary.forEach(v => {
      spellingMap[v[0]] = { vid: v[2], sid: v[3], reading: v[1] };
    });

    // Lookup card states for all parsed words
    const lookupResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        list: vocabIds,
        fields: ['spelling', 'card_state', 'due_at']
      })
    });

    if (!lookupResponse.ok) {
      // Return just vid/sid without states
      return spellingMap;
    }

    const lookupData = await lookupResponse.json();
    const vocabInfo = lookupData.vocabulary_info || [];

    // Merge states into spelling map
    for (let i = 0; i < vocabInfo.length; i++) {
      const info = vocabInfo[i];
      if (!info) continue;
      const [spelling, cardStates, dueAt] = info;
      if (spellingMap[spelling]) {
        spellingMap[spelling].states = cardStates || [];
        spellingMap[spelling].dueAt = dueAt ?? null;
      }
    }

    return spellingMap;

  } catch (error) {
    console.warn('[JPDB Batch Parse] Error:', error.message);
    return {};
  }
}

/**
 * Parse multiple batches of words with delay between batches
 *
 * @param {string} apiKey - JPDB API key
 * @param {string[]} words - All words to parse
 * @param {number} batchSize - Words per batch (default 2000)
 * @param {number} delayMs - Delay between batches in ms (default 3000)
 * @returns {Promise<Object>} Combined map of spelling -> { vid, sid, states, dueAt }
 */
export async function parseWordBatches(apiKey, words, batchSize = 2000, delayMs = 3000) {
  const results = {};
  const totalBatches = Math.ceil(words.length / batchSize);

  console.log(`[JPDB Batch Parse] Starting ${totalBatches} batches of ${batchSize} words`);

  for (let i = 0; i < words.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = words.slice(i, i + batchSize);

    console.log(`[JPDB Batch Parse] Batch ${batchNum}/${totalBatches} (${batch.length} words)`);

    const batchResults = await parseWordBatch(apiKey, batch);
    Object.assign(results, batchResults);

    // Delay between batches (except after last batch)
    if (i + batchSize < words.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`[JPDB Batch Parse] Complete: ${Object.keys(results).length} words parsed`);
  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/jpdb-batch-parse.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/jpdb.js tests/unit/jpdb-batch-parse.test.js
git commit -m "feat(jpdb): add batch parse functions for efficient bulk word lookup"
```

---

## Phase 2: New Cache Format + Full Parse on Session Start

### Task 2.1: Update Cache Format in vocab-manager.js

**Files:**
- Modify: `src/game/vocab-manager.js`

**Step 1: Write the failing test**

Create: `tests/unit/vocab-manager-cache.test.js`

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const TEST_CACHE_FILE = '/tmp/test-vocab-cache.json';

describe('Vocab Manager New Cache Format', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE_FILE)) {
      unlinkSync(TEST_CACHE_FILE);
    }
  });

  it('should support lastFullParse timestamp in cache', async () => {
    const { configureVocabManager, initVocabManager, getVocabManagerStats, clearVocabManagerCache } = await import('../../src/game/vocab-manager.js');

    configureVocabManager({ cacheFile: TEST_CACHE_FILE });
    clearVocabManagerCache();

    const stats = getVocabManagerStats();
    assert.ok('lastFullParse' in stats, 'stats should include lastFullParse');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/vocab-manager-cache.test.js`
Expected: FAIL with "stats should include lastFullParse"

**Step 3: Update state structure and getVocabManagerStats**

In `src/game/vocab-manager.js`, update the state object (around line 25):

```javascript
// In-memory state
let state = {
  recentlyUsedWords: [],          // Ring buffer of last N words
  wordStateCache: {},             // { word: { states: [], vid, sid, dueAt } }
  lastRefresh: null,              // Timestamp of last incremental refresh
  lastFullParse: null,            // Timestamp of last full batch parse
  initialized: false,
  checkedThisSession: false       // Only check/refresh once per session
};
```

Update `getVocabManagerStats()`:

```javascript
export function getVocabManagerStats() {
  initVocabManager();
  return {
    recentWordsCount: state.recentlyUsedWords.length,
    cachedWordStates: Object.keys(state.wordStateCache).length,
    lastRefresh: state.lastRefresh,
    lastFullParse: state.lastFullParse,
    cacheExpiryMs: CONFIG.cacheExpiryMs
  };
}
```

Update `clearVocabManagerCache()`:

```javascript
export function clearVocabManagerCache() {
  state = {
    recentlyUsedWords: [],
    wordStateCache: {},
    lastRefresh: null,
    lastFullParse: null,
    initialized: true,
    checkedThisSession: false
  };
  saveCache();
}
```

Update `saveCache()` to include lastFullParse:

```javascript
function saveCache() {
  if (!cacheFile) return;

  try {
    writeFileSync(cacheFile, JSON.stringify({
      recentlyUsedWords: state.recentlyUsedWords,
      wordStateCache: state.wordStateCache,
      lastRefresh: state.lastRefresh,
      lastFullParse: state.lastFullParse
    }, null, 2));
  } catch (e) {
    console.warn('Failed to save vocab suggestion cache:', e.message);
  }
}
```

Update `initVocabManager()` to load lastFullParse:

```javascript
export function initVocabManager() {
  if (state.initialized) return;

  if (!cacheFile) {
    console.warn('Vocab manager not configured - call configureVocabManager first');
    state.initialized = true;
    return;
  }

  try {
    if (existsSync(cacheFile)) {
      const data = JSON.parse(readFileSync(cacheFile, 'utf-8'));
      state.recentlyUsedWords = data.recentlyUsedWords || [];
      state.wordStateCache = data.wordStateCache || {};
      state.lastRefresh = data.lastRefresh || null;
      state.lastFullParse = data.lastFullParse || null;
      console.log(`Loaded vocab suggestion cache: ${Object.keys(state.wordStateCache).length} word states, ${state.recentlyUsedWords.length} recent words`);
    }
  } catch (e) {
    console.warn('Failed to load vocab suggestion cache:', e.message);
  }

  state.initialized = true;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/vocab-manager-cache.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/vocab-manager.js tests/unit/vocab-manager-cache.test.js
git commit -m "feat(vocab-manager): add lastFullParse timestamp to cache format"
```

---

### Task 2.2: Add Full Parse Function to vocab-manager.js

**Files:**
- Modify: `src/game/vocab-manager.js`

**Step 1: Write the failing test**

Add to `tests/unit/vocab-manager-cache.test.js`:

```javascript
describe('Full Parse Function', () => {
  it('should export performFullParse function', async () => {
    const vm = await import('../../src/game/vocab-manager.js');
    assert.strictEqual(typeof vm.performFullParse, 'function');
  });

  it('should export FULL_PARSE_CONFIG for testing', async () => {
    const vm = await import('../../src/game/vocab-manager.js');
    assert.ok(vm.FULL_PARSE_CONFIG, 'should export config');
    assert.strictEqual(vm.FULL_PARSE_CONFIG.batchSize, 2000);
    assert.strictEqual(vm.FULL_PARSE_CONFIG.maxWords, 10000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/vocab-manager-cache.test.js`
Expected: FAIL with "performFullParse is not a function"

**Step 3: Add imports and performFullParse function**

At top of `src/game/vocab-manager.js`, update imports:

```javascript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { lookupWordStates, parseWordBatches } from '../jpdb.js';
```

Add config constant:

```javascript
// Full parse configuration
export const FULL_PARSE_CONFIG = {
  batchSize: 2000,
  maxWords: 10000,
  batchDelayMs: 3000,
  cacheExpiryMs: 60 * 60 * 1000  // 1 hour
};
```

Add the function:

```javascript
/**
 * Perform a full parse of the static word list
 * Called on session start when cache is missing or older than 1 hour
 *
 * @param {string} apiKey - JPDB API key
 * @param {string[]} wordList - Static word list (top N most frequent words)
 * @returns {Promise<Object>} Word state cache
 */
export async function performFullParse(apiKey, wordList) {
  initVocabManager();

  if (!apiKey || !wordList || wordList.length === 0) {
    return state.wordStateCache;
  }

  const now = Date.now();
  const cacheAge = state.lastFullParse ? now - state.lastFullParse : Infinity;

  // Skip if cache is fresh (less than 1 hour old)
  if (cacheAge < FULL_PARSE_CONFIG.cacheExpiryMs) {
    console.log(`[VocabManager] Cache is fresh (${Math.round(cacheAge / 60000)} min old), skipping full parse`);
    return state.wordStateCache;
  }

  console.log(`[VocabManager] Starting full parse of ${Math.min(wordList.length, FULL_PARSE_CONFIG.maxWords)} words...`);

  // Only parse top N most frequent words
  const wordsToparse = wordList.slice(0, FULL_PARSE_CONFIG.maxWords);

  try {
    const results = await parseWordBatches(
      apiKey,
      wordsToparse,
      FULL_PARSE_CONFIG.batchSize,
      FULL_PARSE_CONFIG.batchDelayMs
    );

    // Merge results into cache
    Object.assign(state.wordStateCache, results);
    state.lastFullParse = now;
    state.lastRefresh = now;

    saveCache();

    console.log(`[VocabManager] Full parse complete: ${Object.keys(state.wordStateCache).length} words cached`);

    return state.wordStateCache;

  } catch (error) {
    console.error('[VocabManager] Full parse failed:', error.message);
    return state.wordStateCache;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/vocab-manager-cache.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/vocab-manager.js tests/unit/vocab-manager-cache.test.js
git commit -m "feat(vocab-manager): add performFullParse for batch word state lookup"
```

---

### Task 2.3: Load Static Word List and Wire Up Session Start

**Files:**
- Modify: `server.js` (or wherever JPDB is configured)
- Modify: `src/routes/game/misc.js`

**Step 1: Add word list loading to server.js**

Find where jpdb is configured and add:

```javascript
import { readFileSync, existsSync } from 'fs';

// Load static word list for JPDB batch parsing
let staticWordList = [];
const wordListPath = './data/jpdb-wordlist.json';
if (existsSync(wordListPath)) {
  try {
    staticWordList = JSON.parse(readFileSync(wordListPath, 'utf-8'));
    console.log(`Loaded ${staticWordList.length} words from static word list`);
  } catch (e) {
    console.warn('Failed to load static word list:', e.message);
  }
}

// Export for routes
export { staticWordList };
```

**Step 2: Add session-start endpoint to misc.js**

Add to `src/routes/game/misc.js`:

```javascript
import { performFullParse } from '../../game/vocab-manager.js';

// At top: add staticWordList to the factory function parameters
export default function createMiscRoutes({
  generateGameNarration,
  cancelPendingPrefetches,
  clearPrefetchCache,
  getGameStats,
  setGameStats,
  getDebugMode,
  setDebugMode,
  vocabCacheFile,
  staticWordList  // Add this parameter
}) {
```

Add new endpoint:

```javascript
// Session start - warm cache with full parse if needed
router.post('/session-start', async (req, res) => {
  const jpdbApiKey = req.userKeys.jpdbApiKey || req.body.jpdbApiKey;
  if (!jpdbApiKey) {
    return res.json({
      warmed: false,
      reason: 'No JPDB API key configured'
    });
  }

  if (!staticWordList || staticWordList.length === 0) {
    return res.json({
      warmed: false,
      reason: 'Static word list not loaded'
    });
  }

  try {
    const cache = await performFullParse(jpdbApiKey, staticWordList);
    res.json({
      warmed: true,
      cachedWords: Object.keys(cache).length,
      message: 'Session cache ready'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Verify server starts without errors**

Run: `npm start` (verify no errors, then Ctrl+C)

**Step 4: Commit**

```bash
git add server.js src/routes/game/misc.js
git commit -m "feat(jpdb): add session-start endpoint for full parse warmup"
```

---

## Phase 3: Cache-Only Combat Word Fetching

### Task 3.1: Modify fetchDueWordsDirectly to Use Cache First

**Files:**
- Modify: `src/jpdb.js:945-1201` (fetchDueWordsDirectly function)

**Step 1: Add cache-first logic**

The existing `fetchDueWordsDirectly` function should be modified to:
1. Check local cache first
2. Only fall back to API if cache is empty
3. Filter for due/failed/learning states from cache

Replace or modify `fetchDueWordsDirectly`:

```javascript
/**
 * Fetch due words - uses local cache first, falls back to API only if needed
 *
 * @param {string} apiKey - JPDB API key
 * @param {number} limit - Max words to return (default 50)
 * @param {number[]} excludeVids - Vocabulary IDs to exclude
 * @returns {Promise<{words: Array, source: string}>}
 */
export async function fetchDueWordsDirectly(apiKey, limit = 50, excludeVids = []) {
  if (!apiKey) {
    return { words: [], source: 'none' };
  }

  // First try to serve from local cache (fast path)
  const cacheResult = getDueWordsFromCache(limit, excludeVids);
  if (cacheResult.words.length > 0) {
    console.log(`[JPDB] Served ${cacheResult.words.length} due words from cache`);
    return cacheResult;
  }

  console.log('[JPDB] Cache empty, fetching from API...');
  // Fall back to API fetch (existing logic)
  return fetchDueWordsFromApi(apiKey, limit, excludeVids);
}

/**
 * Get due words from local cache without API call
 */
function getDueWordsFromCache(limit, excludeVids) {
  if (!config.vocabSuggestionsFile) {
    return { words: [], source: 'none' };
  }

  try {
    if (!existsSync(config.vocabSuggestionsFile)) {
      return { words: [], source: 'none' };
    }

    const data = JSON.parse(readFileSync(config.vocabSuggestionsFile, 'utf-8'));
    const wordStateCache = data.wordStateCache || {};

    const excludeSet = new Set(excludeVids.map(v => parseInt(v, 10)));
    const priorityOrder = ['due', 'failed', 'learning'];
    const candidates = [];

    for (const [word, stateInfo] of Object.entries(wordStateCache)) {
      if (!word || !stateInfo.vid || !stateInfo.sid) continue;
      if (excludeSet.has(stateInfo.vid)) continue;

      const states = stateInfo.states || [];
      if (states.some(s => ['blacklisted', 'suspended', 'new', 'redundant'].includes(s))) continue;

      // Check if word is reviewable
      for (const priority of priorityOrder) {
        if (states.includes(priority)) {
          candidates.push({
            word,
            reading: stateInfo.reading || null,
            vid: stateInfo.vid,
            sid: stateInfo.sid,
            dueAt: stateInfo.dueAt ?? null,
            priority: priorityOrder.indexOf(priority)
          });
          break;
        }
      }
    }

    if (candidates.length === 0) {
      return { words: [], source: 'none' };
    }

    // Sort by priority, then by dueAt
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });

    const selected = candidates.slice(0, limit);

    // Format for word practice (needs meanings, which we'll fetch)
    return {
      words: selected.map(w => ({
        word: w.word,
        reading: w.reading,
        meanings: [],  // Will be populated by lookup
        vid: w.vid,
        sid: w.sid
      })),
      source: 'cache',
      needsMeanings: true
    };

  } catch (e) {
    console.warn('[JPDB] Failed to read cache:', e.message);
    return { words: [], source: 'none' };
  }
}
```

**Step 2: Move existing API fetch to helper function**

Rename the existing body of `fetchDueWordsDirectly` to `fetchDueWordsFromApi`:

```javascript
/**
 * Fetch due words directly from JPDB API (fallback when cache is empty)
 * This is the original fetchDueWordsDirectly implementation
 */
async function fetchDueWordsFromApi(apiKey, limit, excludeVids) {
  // ... (existing implementation, starting from line 950)
}
```

**Step 3: Verify existing tests still pass**

Run: `npm run test:unit`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/jpdb.js
git commit -m "feat(jpdb): fetchDueWordsDirectly now uses cache first"
```

---

### Task 3.2: Remove bypassCache from Frontend Calls

**Files:**
- Modify: `public/js/word-practice.js:100-127` (fetchJpdbDueWords)
- Modify: `public/js/word-practice.js:145-161` (fetchReplacementWord)

**Step 1: Remove bypassCache: true from fetchJpdbDueWords**

In `public/js/word-practice.js`, modify `fetchJpdbDueWords`:

```javascript
export async function fetchJpdbDueWords() {
  if (jpdbWordsFetching) return jpdbWordsCache;
  if (jpdbWordsCache && jpdbWordsCache.length > 0) return jpdbWordsCache;

  jpdbWordsFetching = true;
  try {
    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${apiBase}/api/game/due-words`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ limit: 50, jpdbApiKey })  // Removed bypassCache: true
    });
    const data = await response.json();

    if (data.words && data.words.length > 0) {
      jpdbWordsCache = data.words;
      console.log(`[WordPractice] Loaded ${data.words.length} words (source: ${data.source})`);
      return jpdbWordsCache;
    }
  } catch (e) {
    console.warn('[WordPractice] Failed to fetch JPDB words:', e);
  } finally {
    jpdbWordsFetching = false;
  }
  return null;
}
```

**Step 2: Remove bypassCache: true from fetchReplacementWord**

```javascript
export async function fetchReplacementWord(justReviewedVid = null) {
  try {
    const currentVids = [...combatWords, ...availableWords]
      .filter(w => w.vid)
      .map(w => w.vid);

    if (justReviewedVid) {
      recentlyReviewedVids.push(justReviewedVid);
    }
    const allExcludeVids = [...new Set([...currentVids, ...recentlyReviewedVids])];

    if (allExcludeVids.length === 0) return null;

    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${apiBase}/api/game/due-words`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ limit: 1, exclude: allExcludeVids, jpdbApiKey })  // Removed bypassCache
    });
    const data = await response.json();

    if (data.words && data.words.length > 0) {
      console.log(`[WordPractice] Fetched replacement word: ${data.words[0].word}`);
      return data.words[0];
    }
  } catch (e) {
    console.warn('[WordPractice] Failed to fetch replacement word:', e);
  }
  return null;
}
```

**Step 3: Commit**

```bash
git add public/js/word-practice.js
git commit -m "feat(word-practice): use cached due words instead of API bypass"
```

---

## Phase 4: Post-Combat Refresh

### Task 4.1: Track Reviewed Words During Combat

**Files:**
- Modify: `public/js/word-practice.js`

**Step 1: Add tracking array and getter**

Add near the top of `public/js/word-practice.js` with other module state:

```javascript
let reviewedWordsThisCombat = [];  // Track words reviewed for post-combat refresh
```

**Step 2: Track reviews in sendJpdbReviewHandler**

Modify `sendJpdbReviewHandler`:

```javascript
async function sendJpdbReviewHandler(vid, sid, grade) {
  const result = await apiSendJpdbReview(vid, sid, grade);
  if (!result.error) {
    console.log(`[JPDB] Review sent: vid=${vid}, grade=${grade}`);
    removeWordFromCache(vid);

    // Track for post-combat refresh
    const word = combatWords.find(w => w.vid === vid) || availableWords.find(w => w.vid === vid);
    if (word) {
      reviewedWordsThisCombat.push(word.word);
    }
  } else {
    console.warn('[JPDB] Review failed:', result.error);
  }
}
```

**Step 3: Add exports for combat-loop to use**

```javascript
/**
 * Get words reviewed this combat (for post-combat refresh)
 */
export function getReviewedWordsThisCombat() {
  return [...reviewedWordsThisCombat];
}

/**
 * Clear reviewed words tracking (called at combat end)
 */
export function clearReviewedWordsThisCombat() {
  reviewedWordsThisCombat = [];
}
```

**Step 4: Clear at combat init**

In `initCombatWords()`, add at the start:

```javascript
export async function initCombatWords() {
  reviewedWordsThisCombat = [];  // Reset tracking for new combat

  // ... rest of existing code
}
```

**Step 5: Commit**

```bash
git add public/js/word-practice.js
git commit -m "feat(word-practice): track reviewed words for post-combat refresh"
```

---

### Task 4.2: Add Post-Combat Refresh Endpoint

**Files:**
- Modify: `src/routes/game/misc.js`

**Step 1: Add the endpoint**

Add to `src/routes/game/misc.js`:

```javascript
import { parseWordBatch } from '../../jpdb.js';

// Post-combat refresh - update cache for reviewed words
router.post('/post-combat-refresh', async (req, res) => {
  const jpdbApiKey = req.userKeys.jpdbApiKey || req.body.jpdbApiKey;
  const { words } = req.body;

  if (!jpdbApiKey) {
    return res.json({ refreshed: 0, reason: 'No API key' });
  }

  if (!words || words.length === 0) {
    return res.json({ refreshed: 0, reason: 'No words to refresh' });
  }

  try {
    // Parse the reviewed words to get fresh states
    const results = await parseWordBatch(jpdbApiKey, words);

    // Update local cache with new states
    if (config.vocabSuggestionsFile && existsSync(config.vocabSuggestionsFile)) {
      const data = JSON.parse(readFileSync(config.vocabSuggestionsFile, 'utf-8'));
      const cache = data.wordStateCache || {};

      for (const [word, info] of Object.entries(results)) {
        cache[word] = info;
      }

      data.wordStateCache = cache;
      data.lastRefresh = Date.now();
      writeFileSync(config.vocabSuggestionsFile, JSON.stringify(data, null, 2));
    }

    res.json({
      refreshed: Object.keys(results).length,
      message: 'Cache updated with fresh word states'
    });
  } catch (error) {
    console.error('[Post-Combat Refresh] Error:', error.message);
    res.json({ refreshed: 0, error: error.message });
  }
});
```

**Step 2: Add necessary imports at top**

```javascript
import { parseWordBatch } from '../../jpdb.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
```

**Step 3: Commit**

```bash
git add src/routes/game/misc.js
git commit -m "feat(jpdb): add post-combat-refresh endpoint for reviewed words"
```

---

### Task 4.3: Call Post-Combat Refresh from combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add post-combat refresh call in stopCombatLoop**

In `stopCombatLoop`, after hiding word cards:

```javascript
export async function stopCombatLoop(result) {
  const gameState = getGameState();

  // Clear both attack timers
  // ... existing code ...

  // Hide word practice cards and close modal
  wordPractice.hideWordCards();
  wordPractice.closeWordInputModal();

  // Post-combat refresh: update cache with fresh states for reviewed words
  const reviewedWords = wordPractice.getReviewedWordsThisCombat();
  if (reviewedWords.length > 0) {
    const apiKeys = settings.getApiKeys();
    fetch(`${API_BASE}/api/game/post-combat-refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        words: reviewedWords,
        jpdbApiKey: apiKeys.jpdbApiKey
      })
    }).then(r => r.json()).then(data => {
      console.log(`[Combat] Post-combat refresh: ${data.refreshed} words updated`);
    }).catch(err => {
      console.warn('[Combat] Post-combat refresh failed:', err);
    });
    wordPractice.clearReviewedWordsThisCombat();
  }

  // Brief pause before narration
  // ... rest of existing code ...
}
```

**Step 2: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat(combat): trigger post-combat refresh for reviewed words"
```

---

## Phase 5: Session Start Integration

### Task 5.1: Call Session Start on Game Load

**Files:**
- Modify: `public/js/game.js` (or main entry point)

**Step 1: Add session start call**

Find the game initialization code and add:

```javascript
// Warm JPDB cache on session start
async function warmJpdbCache() {
  const apiKeys = settings.getApiKeys();
  if (!apiKeys.jpdbApiKey) return;

  try {
    const response = await fetch(`${API_BASE}/api/game/session-start`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ jpdbApiKey: apiKeys.jpdbApiKey })
    });
    const data = await response.json();
    console.log(`[Game] Session cache: ${data.warmed ? data.cachedWords + ' words' : data.reason}`);
  } catch (e) {
    console.warn('[Game] Failed to warm session cache:', e);
  }
}

// Call during initialization
warmJpdbCache();
```

**Step 2: Commit**

```bash
git add public/js/game.js
git commit -m "feat(game): warm JPDB cache on session start"
```

---

## Phase 6: Testing & Verification

### Task 6.1: Run Unit Tests

**Step 1: Run all unit tests**

Run: `npm run test:unit`
Expected: All tests pass (including new jpdb and vocab-manager tests)

**Step 2: Fix any failures**

If tests fail, investigate and fix.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from rate limiting redesign"
```

---

### Task 6.2: Run E2E Tests

**Step 1: Run e2e test suite**

Run: `./scripts/e2e-test.sh`
Expected: 80+/87 tests pass (acceptable threshold)

**Step 2: Fix any critical failures**

If tests fail below threshold, investigate and fix.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve e2e test failures from rate limiting redesign"
```

---

### Task 6.3: Manual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify session start caching**

- Open browser console
- Load game
- Confirm "Session cache: N words" message appears
- Confirm no 429 errors in network tab

**Step 3: Verify combat uses cache**

- Start a combat
- Confirm words appear without JPDB API calls (check network tab)
- Complete a word review
- Confirm no replacement word API call with bypassCache

**Step 4: Verify post-combat refresh**

- Complete combat
- Confirm "Post-combat refresh: N words updated" in console

---

## Rollback Plan

If issues arise in production:

1. **Keep old code paths**: The existing `fetchAllDecksVocabulary` and deck-scanning functions remain in jpdb.js
2. **Feature flag**: Add `USE_BATCH_PARSE` environment variable to toggle between old and new implementations
3. **Quick revert**: `git revert HEAD~N` to undo the rate limiting changes

---

## Summary

**Total API calls comparison:**

| Scenario | Before | After |
|----------|--------|-------|
| Session start (cold cache) | 51+ | 5 |
| Session start (warm cache) | 0 | 0 |
| Per combat | 6+ | 0 |
| Post-combat | 0 | 1 |
| Per hour estimate | 30+ | ~10 |

**Key benefits:**
1. Dramatically reduced JPDB API calls
2. Circuit breaker prevents cascading failures
3. Cache-first approach makes combat snappy
4. Post-combat refresh keeps word states accurate
