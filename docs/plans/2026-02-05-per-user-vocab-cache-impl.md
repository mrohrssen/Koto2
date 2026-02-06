# Per-User Vocab Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Isolate vocab cache files per user so each user's JPDB word states don't leak to other users.

**Architecture:** Replace single shared cache file with per-user files (`vocab-cache-{userId}.json`). Thread `userId` through all cache operations. Keep in-memory state simple - one state object that switches based on current user context (since requests are sequential within a user session).

**Tech Stack:** Node.js, Express middleware, file-based JSON storage.

---

## Task 1: Update vocab-manager.js to Use Per-User Cache Files

**Files:**
- Modify: `src/game/vocab-manager.js`

### Step 1: Write failing test for per-user cache isolation

Create test file at `tests/unit/vocab-manager-per-user.test.js`:

```javascript
/**
 * Tests for per-user vocab cache isolation
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import * as vm from '../../src/game/vocab-manager.js';

const TEST_CACHE_DIR = '/tmp/test-vocab-cache/';

describe('Per-user vocab cache', () => {
  before(() => {
    // Clean up and create test directory
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}
  });

  after(() => {
    // Clean up test files
    ['user1', 'user2'].forEach(userId => {
      const file = `${TEST_CACHE_DIR}vocab-cache-${userId}.json`;
      if (existsSync(file)) unlinkSync(file);
    });
  });

  it('should create separate cache files for different users', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    // Add different words for each user
    vm.addUsedWords(['word1', 'word2'], 'user1');
    vm.addUsedWords(['word3', 'word4'], 'user2');

    // Verify separate files
    const user1File = `${TEST_CACHE_DIR}vocab-cache-user1.json`;
    const user2File = `${TEST_CACHE_DIR}vocab-cache-user2.json`;

    assert.ok(existsSync(user1File), 'User 1 cache file should exist');
    assert.ok(existsSync(user2File), 'User 2 cache file should exist');

    // Verify isolation
    const user1Data = JSON.parse(readFileSync(user1File, 'utf-8'));
    const user2Data = JSON.parse(readFileSync(user2File, 'utf-8'));

    assert.ok(user1Data.recentlyUsedWords.includes('word1'));
    assert.ok(!user1Data.recentlyUsedWords.includes('word3'));
    assert.ok(user2Data.recentlyUsedWords.includes('word3'));
    assert.ok(!user2Data.recentlyUsedWords.includes('word1'));
  });

  it('should throw error when userId is missing', () => {
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });

    assert.throws(() => {
      vm.addUsedWords(['word'], undefined);
    }, /userId is required/);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm run test:unit -- tests/unit/vocab-manager-per-user.test.js`
Expected: FAIL - `configureVocabManager` doesn't accept `cacheDir`, functions don't accept `userId`

### Step 3: Update configureVocabManager to accept cacheDir

In `src/game/vocab-manager.js`, change:

```javascript
// OLD (lines 11-12):
// Cache file path - configured via configureVocabManager()
let cacheFile = null;

// NEW:
// Cache directory - configured via configureVocabManager()
let cacheDir = null;

// Helper to get user-specific cache file path
function getUserCacheFile(userId) {
  if (!cacheDir) return null;
  if (!userId) throw new Error('userId is required for cache operations');
  return `${cacheDir}vocab-cache-${userId}.json`;
}
```

### Step 4: Update state management to be per-user

Replace the single `state` object with a Map and helper:

```javascript
// OLD (lines 32-40):
// In-memory state
let state = {
  recentlyUsedWords: [],
  wordStateCache: {},
  lastRefresh: null,
  lastFullParse: null,
  initialized: false,
  checkedThisSession: false
};

// NEW:
// Per-user in-memory state
const userStates = new Map();

// Get or create state for a user
function getOrCreateUserState(userId) {
  if (!userId) throw new Error('userId is required for cache operations');
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      recentlyUsedWords: [],
      wordStateCache: {},
      lastRefresh: null,
      lastFullParse: null,
      initialized: false,
      checkedThisSession: false
    });
  }
  return userStates.get(userId);
}
```

### Step 5: Update configureVocabManager function

```javascript
// OLD (lines 50-52):
export function configureVocabManager({ cacheFile: file }) {
  cacheFile = file;
}

// NEW:
export function configureVocabManager({ cacheDir: dir, cacheFile: file }) {
  // Support both old single-file config (for tests) and new directory config
  if (dir) {
    cacheDir = dir.endsWith('/') ? dir : dir + '/';
  } else if (file) {
    // Legacy: extract directory from file path
    const lastSlash = file.lastIndexOf('/');
    cacheDir = lastSlash > 0 ? file.substring(0, lastSlash + 1) : './';
    console.warn('[VocabManager] Using legacy cacheFile config - migrate to cacheDir');
  }
}
```

### Step 6: Update initVocabManager to accept userId

```javascript
// OLD (lines 57-80):
export function initVocabManager() {
  if (state.initialized) return;
  // ... reads from cacheFile

// NEW:
export function initVocabManager(userId) {
  const state = getOrCreateUserState(userId);
  if (state.initialized) return;

  const userCacheFile = getUserCacheFile(userId);
  if (!userCacheFile) {
    console.warn('[VocabManager] Not configured - call configureVocabManager first');
    state.initialized = true;
    return;
  }

  try {
    if (existsSync(userCacheFile)) {
      const data = JSON.parse(readFileSync(userCacheFile, 'utf-8'));
      state.recentlyUsedWords = data.recentlyUsedWords || [];
      state.wordStateCache = data.wordStateCache || {};
      state.lastRefresh = data.lastRefresh || null;
      state.lastFullParse = data.lastFullParse || null;
      console.log(`[VocabManager] Loaded cache for user ${userId}: ${Object.keys(state.wordStateCache).length} words`);
    }
  } catch (e) {
    console.warn(`[VocabManager] Failed to load cache for user ${userId}:`, e.message);
  }

  state.initialized = true;
}
```

### Step 7: Update saveCache to accept userId

```javascript
// OLD (lines 85-104):
function saveCache() {
  if (!cacheFile) { ... }
  // writes to single cacheFile

// NEW:
function saveCache(userId) {
  const userCacheFile = getUserCacheFile(userId);
  if (!userCacheFile) {
    console.log('[VocabManager] saveCache: No cacheDir configured');
    return;
  }

  const state = getOrCreateUserState(userId);

  try {
    const cacheSize = Object.keys(state.wordStateCache).length;
    console.log(`[VocabManager] saveCache: Writing ${cacheSize} words for user ${userId}`);
    writeFileSync(userCacheFile, JSON.stringify({
      recentlyUsedWords: state.recentlyUsedWords,
      wordStateCache: state.wordStateCache,
      lastRefresh: state.lastRefresh,
      lastFullParse: state.lastFullParse
    }, null, 2));
  } catch (e) {
    console.warn(`[VocabManager] saveCache failed for user ${userId}:`, e.message);
  }
}
```

### Step 8: Update addUsedWords to accept userId

```javascript
// OLD (lines 110-133):
export function addUsedWords(words) {
  if (!words || words.length === 0) return;
  initVocabManager();
  // ... modifies state
  saveCache();
}

// NEW:
export function addUsedWords(words, userId) {
  if (!words || words.length === 0) return;
  if (!userId) throw new Error('userId is required for addUsedWords');

  initVocabManager(userId);
  const state = getOrCreateUserState(userId);

  for (const word of words) {
    if (word && typeof word === 'string' && word.length > 0) {
      const existingIndex = state.recentlyUsedWords.indexOf(word);
      if (existingIndex !== -1) {
        state.recentlyUsedWords.splice(existingIndex, 1);
      }
      state.recentlyUsedWords.push(word);
    }
  }

  if (state.recentlyUsedWords.length > CONFIG.recentWordsLimit) {
    state.recentlyUsedWords = state.recentlyUsedWords.slice(-CONFIG.recentWordsLimit);
  }

  saveCache(userId);
}
```

### Step 9: Update remaining exported functions with userId parameter

Update each of these functions to accept `userId` and use `getOrCreateUserState(userId)`:

- `getRecentlyUsedWords(userId)` - line 139
- `refreshWordStateCache(apiKey, vocabulary, force, userId)` - line 154
- `getSuggestionsForNarration(apiKey, vocabulary, userId)` - line 352
- `clearVocabManagerCache(userId)` - line 374
- `invalidateWordStateCache(userId)` - line 389
- `invalidateWordByVid(vid, userId)` - line 400
- `performFullParse(apiKey, wordList, userId)` - line 430
- `updateWordStates(wordStates, userId)` - line 499
- `getVocabManagerStats(userId)` - line 527
- `getNewWordsForDiscovery(limit, userId)` - line 543
- `setTestCache(cache, userId)` - line 594

Each follows the same pattern:
1. Add `userId` parameter
2. Call `initVocabManager(userId)` instead of `initVocabManager()`
3. Use `getOrCreateUserState(userId)` instead of bare `state`
4. Call `saveCache(userId)` instead of `saveCache()`

### Step 10: Run test to verify it passes

Run: `npm run test:unit -- tests/unit/vocab-manager-per-user.test.js`
Expected: PASS

### Step 11: Commit

```bash
git add tests/unit/vocab-manager-per-user.test.js src/game/vocab-manager.js
git commit -m "$(cat <<'EOF'
feat(vocab-manager): add per-user cache isolation

- Change configureVocabManager to accept cacheDir instead of cacheFile
- Store state in Map keyed by userId
- All cache functions now require userId parameter
- Each user gets separate cache file: vocab-cache-{userId}.json

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update jpdb.js to Use Per-User Cache Files

**Files:**
- Modify: `src/jpdb.js`

### Step 1: Write failing test for jpdb per-user cache

Add to `tests/unit/vocab-manager-per-user.test.js`:

```javascript
import * as jpdb from '../../src/jpdb.js';

describe('JPDB per-user cache', () => {
  it('should invalidate only the specified user cache', () => {
    // Configure with directory
    jpdb.configure({ vocabCacheDir: TEST_CACHE_DIR });
    vm.configureVocabManager({ cacheDir: TEST_CACHE_DIR });

    // Set up test data for two users
    vm.clearVocabManagerCache('user1');
    vm.clearVocabManagerCache('user2');

    // Manually set word state cache with 'due' state
    vm.setTestCache({
      'テスト': { vid: 123, sid: 1, states: ['due'], dueAt: Date.now() }
    }, 'user1');
    vm.setTestCache({
      'テスト': { vid: 123, sid: 1, states: ['due'], dueAt: Date.now() }
    }, 'user2');

    // Invalidate for user1 only
    jpdb.invalidateWordStateCache(123, 'user1');

    // Check user1's cache is invalidated
    const user1Stats = vm.getVocabManagerStats('user1');
    // The word should still exist but without 'due' state
    // (This is tested by checking the file directly)

    // Check user2's cache is untouched - word still has 'due'
    const user2File = `${TEST_CACHE_DIR}vocab-cache-user2.json`;
    const user2Data = JSON.parse(readFileSync(user2File, 'utf-8'));
    assert.ok(user2Data.wordStateCache['テスト'].states.includes('due'));
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm run test:unit -- tests/unit/vocab-manager-per-user.test.js`
Expected: FAIL - `invalidateWordStateCache` doesn't accept userId

### Step 3: Update jpdb.js configure function

```javascript
// OLD (lines 19-38):
let config = {
  vocabCacheFile: null,
  vocabSuggestionsFile: null
};

export function configure(options) {
  if (options.vocabCacheFile) {
    config.vocabCacheFile = options.vocabCacheFile;
  }
  if (options.vocabSuggestionsFile) {
    config.vocabSuggestionsFile = options.vocabSuggestionsFile;
  }
}

// NEW:
let config = {
  vocabCacheFile: null,
  vocabCacheDir: null
};

export function configure(options) {
  if (options.vocabCacheFile) {
    config.vocabCacheFile = options.vocabCacheFile;
  }
  if (options.vocabCacheDir) {
    config.vocabCacheDir = options.vocabCacheDir.endsWith('/')
      ? options.vocabCacheDir
      : options.vocabCacheDir + '/';
  }
  // Legacy support: extract dir from vocabSuggestionsFile
  if (options.vocabSuggestionsFile && !options.vocabCacheDir) {
    const lastSlash = options.vocabSuggestionsFile.lastIndexOf('/');
    config.vocabCacheDir = lastSlash > 0
      ? options.vocabSuggestionsFile.substring(0, lastSlash + 1)
      : './';
  }
}

// Helper to get user-specific cache file
function getUserCacheFile(userId) {
  if (!config.vocabCacheDir) return null;
  if (!userId) throw new Error('userId is required for cache operations');
  return `${config.vocabCacheDir}vocab-cache-${userId}.json`;
}
```

### Step 4: Update invalidateWordStateCache to accept userId

```javascript
// OLD (lines 843-889):
export function invalidateWordStateCache(vid) {
  // ... uses config.vocabSuggestionsFile

// NEW:
export function invalidateWordStateCache(vid, userId) {
  if (!userId) throw new Error('userId is required for invalidateWordStateCache');

  // Update in-memory cache first
  try {
    invalidateWordByVid(vid, userId);
  } catch (e) {
    console.log(`[JPDB Cache] Could not update in-memory cache: ${e.message}`);
  }

  const userCacheFile = getUserCacheFile(userId);
  if (!userCacheFile) {
    return false;
  }

  try {
    if (!existsSync(userCacheFile)) {
      return false;
    }

    const data = JSON.parse(readFileSync(userCacheFile, 'utf-8'));
    const wordStateCache = data.wordStateCache || {};

    for (const [word, stateInfo] of Object.entries(wordStateCache)) {
      if (stateInfo.vid === vid) {
        const states = stateInfo.states || [];
        const dueIndex = states.indexOf('due');
        if (dueIndex !== -1) {
          states.splice(dueIndex, 1);
          stateInfo.states = states;
          stateInfo.dueAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
          console.log(`[JPDB Cache] Invalidated "${word}" (vid=${vid}) for user ${userId}`);
        }
        break;
      }
    }

    writeFileSync(userCacheFile, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.warn('[JPDB Cache] Failed to invalidate:', e.message);
    return false;
  }
}
```

### Step 5: Update getDueWordsWithMeanings to accept userId

```javascript
// OLD (line 645):
export async function getDueWordsWithMeanings(apiKey, limit = 1000, excludeVids = []) {

// NEW (add userId parameter):
export async function getDueWordsWithMeanings(apiKey, limit = 1000, excludeVids = [], userId) {
  console.log('[getDueWordsWithMeanings] Called with limit:', limit, 'userId:', userId);
  if (!apiKey) {
    console.log('[getDueWordsWithMeanings] No API key');
    return { words: [], source: 'none' };
  }
  if (!userId) {
    console.log('[getDueWordsWithMeanings] No userId - returning empty');
    return { words: [], source: 'none' };
  }

  let wordStateCache = {};
  const userCacheFile = getUserCacheFile(userId);

  console.log('[getDueWordsWithMeanings] userCacheFile:', userCacheFile || 'NOT SET');
  if (userCacheFile) {
    try {
      const fileExists = existsSync(userCacheFile);
      console.log('[getDueWordsWithMeanings] File exists:', fileExists);
      if (fileExists) {
        const data = JSON.parse(readFileSync(userCacheFile, 'utf-8'));
        wordStateCache = data.wordStateCache || {};
        console.log('[getDueWordsWithMeanings] Loaded cache with', Object.keys(wordStateCache).length, 'words');
      }
    } catch (e) {
      console.warn('Failed to load vocab cache:', e.message);
    }
  }
  // ... rest of function unchanged
```

### Step 6: Update getDueWordsFromCache to accept userId

```javascript
// OLD (line 938):
function getDueWordsFromCache(limit, excludeVids) {

// NEW:
function getDueWordsFromCache(limit, excludeVids, userId) {
  if (!userId) {
    return { words: [], source: 'none' };
  }

  const userCacheFile = getUserCacheFile(userId);
  if (!userCacheFile) {
    return { words: [], source: 'none' };
  }
  // ... rest uses userCacheFile instead of config.vocabSuggestionsFile
```

### Step 7: Update fetchDueWordsDirectly and fetchDueWordsFromApi to accept userId

```javascript
// OLD (line 1020):
export async function fetchDueWordsDirectly(apiKey, limit = 1000, excludeVids = []) {

// NEW:
export async function fetchDueWordsDirectly(apiKey, limit = 1000, excludeVids = [], userId) {
  if (!apiKey) {
    return { words: [], source: 'none' };
  }

  // First try to serve from local cache
  const cacheResult = getDueWordsFromCache(limit, excludeVids, userId);
  // ...

// Also update fetchDueWordsFromApi:
async function fetchDueWordsFromApi(apiKey, limit = 1000, excludeVids = [], userId) {
  // ... when reading vocab IDs from cache, use getUserCacheFile(userId)
```

### Step 8: Run test to verify it passes

Run: `npm run test:unit -- tests/unit/vocab-manager-per-user.test.js`
Expected: PASS

### Step 9: Commit

```bash
git add src/jpdb.js tests/unit/vocab-manager-per-user.test.js
git commit -m "$(cat <<'EOF'
feat(jpdb): add per-user cache support

- Add vocabCacheDir config option
- Add userId parameter to invalidateWordStateCache
- Add userId parameter to getDueWordsWithMeanings
- Add userId parameter to fetchDueWordsDirectly

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update server.js Configuration

**Files:**
- Modify: `server.js`

### Step 1: Update configuration calls

```javascript
// OLD (lines 145-155):
const VOCAB_SUGGESTIONS_FILE = dataPath('.jrpg-vocab-suggestions.json');

configureJpdb({
  vocabCacheFile: VOCAB_CACHE_FILE,
  vocabSuggestionsFile: VOCAB_SUGGESTIONS_FILE
});
initializeJpdb();

configureVocabManager({ cacheFile: VOCAB_SUGGESTIONS_FILE });

// NEW:
const VOCAB_CACHE_DIR = dataPath('');  // Just the data directory

configureJpdb({
  vocabCacheFile: VOCAB_CACHE_FILE,
  vocabCacheDir: VOCAB_CACHE_DIR
});
initializeJpdb();

configureVocabManager({ cacheDir: VOCAB_CACHE_DIR });
```

### Step 2: Remove VOCAB_SUGGESTIONS_FILE constant

Delete the line defining `VOCAB_SUGGESTIONS_FILE` (no longer needed).

### Step 3: Commit

```bash
git add server.js
git commit -m "$(cat <<'EOF'
refactor(server): configure vocab cache with directory

Switch from single vocabSuggestionsFile to vocabCacheDir for
per-user cache file support.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update Route Handlers to Pass userId

**Files:**
- Modify: `src/routes/vocab.js`
- Modify: `src/routes/game/misc.js`

### Step 1: Update vocab.js routes

```javascript
// In /api/vocab/due-words handler (line 64):
// OLD:
const result = await getDueWordsWithMeanings(jpdbApiKey);

// NEW:
const result = await getDueWordsWithMeanings(jpdbApiKey, 1000, [], req.user.id);

// In /api/jpdb/review handler (line 118):
// OLD:
invalidateWordStateCache(parseInt(vid, 10));

// NEW:
invalidateWordStateCache(parseInt(vid, 10), req.user.id);
```

### Step 2: Update game/misc.js routes

```javascript
// In /api/game/session-start handler (line 412):
// OLD:
const cache = await performFullParse(jpdbApiKey, staticWordList);

// NEW:
const cache = await performFullParse(jpdbApiKey, staticWordList, req.user.id);

// In /api/game/due-words handler (lines 474-476):
// OLD:
result = await fetchDueWordsDirectly(jpdbApiKey, limit, excludeVids);
result = await getDueWordsWithMeanings(jpdbApiKey, limit, excludeVids);

// NEW:
result = await fetchDueWordsDirectly(jpdbApiKey, limit, excludeVids, req.user.id);
result = await getDueWordsWithMeanings(jpdbApiKey, limit, excludeVids, req.user.id);

// In /api/game/refresh-word-states handler (line 499-500):
// OLD:
const states = await refreshWordStateCache(jpdbApiKey, vocabResult.words);
invalidateVocabManagerCache();

// NEW:
const states = await refreshWordStateCache(jpdbApiKey, vocabResult.words, false, req.user.id);
invalidateVocabManagerCache(req.user.id);

// In /api/game/post-combat-refresh handler (line 443):
// OLD:
const refreshed = updateWordStates(results);

// NEW:
const refreshed = updateWordStates(results, req.user.id);
```

### Step 3: Update reset handler to use userId for cache deletion

```javascript
// In /api/game/reset handler (lines 66-68):
// OLD:
if (existsSync(vocabCacheFile)) {
  unlinkSync(vocabCacheFile);
}

// NEW:
const userVocabCacheFile = `${vocabCacheFile.replace(/[^/]+$/, '')}vocab-cache-${req.user.id}.json`;
if (existsSync(userVocabCacheFile)) {
  unlinkSync(userVocabCacheFile);
}
```

### Step 4: Commit

```bash
git add src/routes/vocab.js src/routes/game/misc.js
git commit -m "$(cat <<'EOF'
feat(routes): pass userId to all cache operations

All route handlers now pass req.user.id to vocab cache functions
to ensure per-user isolation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update DM Narration to Pass userId

**Files:**
- Modify: `src/game/dm.js` (if it uses addUsedWords)
- Modify: Any file calling `addUsedWords` or `getSuggestionsForNarration`

### Step 1: Search for addUsedWords and getSuggestionsForNarration callers

Run: `grep -rn "addUsedWords\|getSuggestionsForNarration" src/`

### Step 2: Update each caller to pass userId

For each call site found, add the `userId` parameter. The userId should come from:
- Route handlers: `req.user.id`
- Game manager context: passed through from route

### Step 3: Commit

```bash
git add <modified files>
git commit -m "$(cat <<'EOF'
feat: pass userId through narration pipeline

Ensures word suggestions and usage tracking are per-user.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Fix Existing Tests

**Files:**
- Modify: `tests/unit/vocab-manager-cache.test.js`
- Modify: `tests/unit/vocab-manager-new-words.test.js`
- Modify: `tests/integration/discovery-words.test.js`

### Step 1: Update tests to pass userId

All existing tests that call vocab-manager functions need to pass a test userId:

```javascript
// Example pattern for all test files:
const TEST_USER_ID = 'test-user';

// OLD:
vm.configureVocabManager({ cacheFile: TEST_CACHE_FILE });
vm.addUsedWords(['word1']);

// NEW:
vm.configureVocabManager({ cacheDir: '/tmp/' });
vm.addUsedWords(['word1'], TEST_USER_ID);
```

### Step 2: Run all unit tests

Run: `npm run test:unit`
Expected: PASS (or identify additional changes needed)

### Step 3: Commit

```bash
git add tests/
git commit -m "$(cat <<'EOF'
test: update vocab tests for per-user cache

All tests now pass TEST_USER_ID to cache functions.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Delete Shared Cache on Deploy

**Files:**
- Create: Migration note or deploy script

### Step 1: Add migration note to deployment

The old shared cache file (`data/.jrpg-vocab-suggestions.json`) should be deleted on first deploy. This can be done manually or via a deploy hook.

For Railway, add to deploy:
```bash
rm -f data/.jrpg-vocab-suggestions.json 2>/dev/null || true
```

### Step 2: Document in CLAUDE.md

Add note about the migration:

```markdown
## Migration Notes

### 2026-02-05: Per-User Vocab Cache
- Old shared cache `data/.jrpg-vocab-suggestions.json` is deprecated
- New per-user caches: `data/vocab-cache-{userId}.json`
- Delete old cache on deploy: `rm -f data/.jrpg-vocab-suggestions.json`
```

### Step 3: Commit

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: add per-user vocab cache migration note

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: E2E Test Verification

### Step 1: Run E2E tests

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 tests pass

### Step 2: If tests fail, debug and fix

Common issues:
- Routes missing userId
- Test user not having expected ID
- Cache file path mismatches

### Step 3: Final commit if changes needed

```bash
git add <any fixes>
git commit -m "$(cat <<'EOF'
fix: resolve e2e test failures from per-user cache

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Simplifications from Original Spec

The implementation above simplifies several aspects of the original spec:

1. **Removed "loadCache" function** - `initVocabManager` already loads from file, no separate function needed.

2. **Kept in-memory Map simple** - Rather than complex per-user state management, each user's state is lazily loaded when needed.

3. **No getWordSuggestions** - The original spec mentioned this function but it doesn't exist. The actual function is `getSuggestionsForNarration`.

4. **Legacy compatibility** - Added fallback support for old `cacheFile` config to avoid breaking existing tests during migration.

5. **No complex vocabSuggestionsFile handling** - Unified on `vocabCacheDir` with a helper function for user-specific file paths.
