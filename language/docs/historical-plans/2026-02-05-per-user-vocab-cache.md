# Per-User Vocab Cache

## Problem

The vocab suggestions cache (`data/.jrpg-vocab-suggestions.json`) stores JPDB word states (due, learning, new, etc.) in a single file shared by all users. This causes:

1. User A sees words that are "due" for User B but "new" for themselves
2. Review invalidations affect all users, not just the reviewer
3. Word states from different JPDB accounts get mixed together

## Solution

Store per-user cache files at `data/vocab-cache-{userId}.json`. Each user's JPDB word states are isolated.

## Scope

**In scope**:
- Thread `userId` through all cache read/write operations
- Modify `jpdb.js` config to accept userId dynamically
- Modify `vocab-manager.js` to maintain per-user in-memory state
- Update route handlers to pass `req.user.id`
- Delete existing shared cache on deploy

**Out of scope**:
- Changing the cache data structure itself
- Adding cache expiration/cleanup (future concern)
- Database migration (file-based is sufficient for now)

## Success Criteria

- Each user only sees words matching their own JPDB account state
- Reviews only invalidate the reviewer's cache
- No cross-user data leakage

## Architecture

### Current Flow (Broken)

```
server.js startup → configureJpdb({ vocabSuggestionsFile: SINGLE_FILE })
                  → configureVocabManager({ cacheFile: SINGLE_FILE })

Request → route handler → jpdb.js/vocab-manager.js → reads/writes SINGLE_FILE
```

### New Flow

```
server.js startup → configureJpdb({ vocabCacheDir: 'data/' })
                  → configureVocabManager({ cacheDir: 'data/' })

Request → route handler → passes userId → jpdb.js/vocab-manager.js
        → reads/writes data/vocab-cache-{userId}.json
```

### Key Changes

1. **Config becomes directory-based**: Instead of `vocabSuggestionsFile: 'path/to/file.json'`, use `vocabCacheDir: 'data/'` and construct filenames dynamically.

2. **All cache functions gain `userId` parameter**: Functions like `getDueWordsWithMeanings(apiKey)` become `getDueWordsWithMeanings(apiKey, userId)`.

3. **In-memory state becomes a Map**: `vocab-manager.js` changes from:
   ```js
   let state = { wordStateCache: {}, ... }
   ```
   to:
   ```js
   let userStates = new Map(); // userId → { wordStateCache: {}, ... }
   ```

4. **File naming**: `data/vocab-cache-{userId}.json` where userId is the authenticated user's ID from the database.

## File Changes

### server.js

- Remove `VOCAB_SUGGESTIONS_FILE` constant
- Change `configureJpdb()` to pass `vocabCacheDir` instead of `vocabSuggestionsFile`
- Change `configureVocabManager()` to pass `cacheDir` instead of `cacheFile`

### src/jpdb.js

- Change `config.vocabSuggestionsFile` to `config.vocabCacheDir`
- Add helper: `getUserCacheFile(userId)` → returns `{cacheDir}/vocab-cache-{userId}.json`
- Update these functions to accept `userId` parameter:
  - `getDueWordsWithMeanings(apiKey, userId, limit, excludeVids)`
  - `invalidateWordStateCache(vid, userId)`
  - `getDueWordsFromCache(limit, excludeVids, userId)`
  - `fetchDueWordsDirectly(apiKey, limit, excludeVids, userId)`

### src/game/vocab-manager.js

- Change `config.cacheFile` to `config.cacheDir`
- Replace `let state = {...}` with `let userStates = new Map()`
- Add `getOrCreateUserState(userId)` helper
- Update all functions to accept `userId` and use `getOrCreateUserState(userId)` instead of global `state`
- Key functions: `initVocabManager`, `saveCache`, `loadCache`, `invalidateWordByVid`, `performFullParse`, `getWordSuggestions`

### src/routes/vocab.js (and other route files)

- Pass `req.user.id` to all cache-related function calls

## Error Handling

**Missing userId**:
- Throw error rather than falling back to shared cache
- All cache operations require authentication

**Cache file doesn't exist**:
- Return empty state, user's cache builds on first JPDB parse
- Log: `[VocabManager] Creating new cache for user {userId}`

**Corrupted cache file**:
- Catch JSON parse errors, reset to empty state
- Log warning but don't crash

**User deleted from database**:
- Orphaned cache files are harmless
- Future: add cleanup script if needed

**Concurrent requests from same user**:
- In-memory Map handles this - same user state object
- File writes are infrequent, race condition risk is low

## Migration

1. Delete existing `data/.jrpg-vocab-suggestions.json` on deploy
2. All users start fresh
3. First speed review triggers JPDB parse to rebuild their cache

## Testing

**Manual verification**:
1. Delete shared cache file on dev
2. Log in as User A → start speed review → verify cache file created as `vocab-cache-{userA-id}.json`
3. Log in as User B → start speed review → verify separate cache file created
4. Review a word as User A → verify only User A's cache is invalidated
5. Check User B still sees the word as "due" (if it was due for them)

**Existing E2E tests**:
- Should continue to pass (single test user)
- No new E2E tests needed

**Smoke test on production**:
- Deploy to dev environment first
- Verify account gets isolated cache
- Check speed review shows only words matching actual JPDB state
