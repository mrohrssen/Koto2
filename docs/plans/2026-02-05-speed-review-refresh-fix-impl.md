# Speed Review Refresh Fix - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the bug where reviewed words reappear in the speed review queue by fetching fresh card states from JPDB during refresh.

**Architecture:** Pass reviewed vid/sids from client to server during refresh. Server fetches fresh states from JPDB for those specific words, updates local cache, then rebuilds queue from updated cache.

**Tech Stack:** Express.js server, vanilla JS client, JPDB API

---

## Task 1: Update Client API - getDueWords()

**Files:**
- Modify: `public/js/api.js:553-564`

**Step 1: Update getDueWords to accept and POST reviewedWords**

Change the function from GET to POST and accept a reviewedWords parameter:

```javascript
/**
 * Get due words for speed review
 * @param {Array} reviewedWords - Array of { vid, sid } objects for words just reviewed
 * @returns {Promise<Object>} { words: Array, error?: string }
 */
export async function getDueWords(reviewedWords = []) {
  try {
    const response = await fetch('/api/vocab/due-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ reviewedWords })
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get due words:', error);
    return { words: [], error: error.message };
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/api.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat(api): getDueWords accepts reviewedWords for refresh"
```

---

## Task 2: Update Speed Review - triggerBatchRefresh()

**Files:**
- Modify: `public/js/ui/speed-review.js:530-555`

**Step 1: Update triggerBatchRefresh to pass reviewed words**

Capture the batch BEFORE clearing, then pass to refreshQueue:

```javascript
async function triggerBatchRefresh() {
  if (!state.callbacks?.refreshQueue) return;

  console.log('[SpeedReview] Triggering batch refresh...');

  // Capture reviewed words BEFORE clearing
  const reviewedWords = state.reviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
  state.reviewedBatch = [];

  try {
    const freshWords = await state.callbacks.refreshQueue(reviewedWords);
    if (freshWords && freshWords.length > 0) {
      // Filter out words currently displayed
      const displayedVids = new Set(
        state.activeCards.filter(c => c).map(c => c.vid)
      );
      const newWords = freshWords.filter(w => !displayedVids.has(w.vid));

      // Replace queue with fresh words (respects JPDB priority)
      state.queue = newWords;
      console.log(`[SpeedReview] Refreshed queue: ${newWords.length} words`);

      // Prefetch TTS for the new words
      prefetchQueueAudio(PREFETCH_AHEAD);
    }
  } catch (e) {
    console.warn('[SpeedReview] Batch refresh failed:', e);
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/speed-review.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat(speed-review): pass reviewed words to refresh callback"
```

---

## Task 3: Update game.js - refreshQueue callback and combat batching

**Files:**
- Modify: `public/game.js:816-819` (refreshQueue callback)
- Modify: `public/game.js:482-484` (showVictoryModal)
- Modify: `public/game.js:497-499` (showGameOverModal)
- Modify: `public/game.js:857-864` (cardSwipe combat batch refresh)

**Step 1: Update refreshQueue callback to accept reviewedWords**

```javascript
    refreshQueue: async (reviewedWords = []) => {
      const result = await apiGetDueWords(reviewedWords);
      return result?.words || [];
    }
```

**Step 2: Update showVictoryModal to pass combat batch**

```javascript
  // Trigger batch refresh on combat end if any pending reviews
  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }
```

**Step 3: Update showGameOverModal to pass combat batch**

```javascript
  // Trigger batch refresh on combat end if any pending reviews
  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }
```

**Step 4: Update cardSwipe combat batch refresh (every 50 reviews)**

```javascript
        // Check for batch refresh (every 50 reviews)
        if (combatReviewedBatch.length >= 50) {
          // Fire and forget - refresh queue in background
          const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
          combatReviewedBatch = [];
          apiGetDueWords(reviewedWords).then(result => {
            if (result?.words) {
              console.log('[Combat] Batch refresh: got', result.words.length, 'fresh words');
            }
          }).catch(e => console.warn('[Combat] Batch refresh failed:', e));
        }
```

**Step 5: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add public/game.js
git commit -m "feat(game): pass reviewed words to all refresh triggers"
```

---

## Task 4: Update Server Route - vocab.js

**Files:**
- Modify: `src/routes/vocab.js:55-70`

**Step 1: Change route from GET to POST and extract reviewedWords**

```javascript
  /**
   * POST /api/vocab/due-words
   * Fetch due/failed words for speed review
   * Body: { reviewedWords: [{ vid, sid }, ...] }
   */
  router.post('/vocab/due-words', requireAuth, attachUserKeys, async (req, res) => {
    const jpdbApiKey = req.userKeys?.jpdbApiKey;
    const { reviewedWords = [] } = req.body || {};

    if (!jpdbApiKey) {
      return res.json({ words: [], error: 'JPDB API key not configured' });
    }

    try {
      const { getDueWordsWithMeanings } = await import('../jpdb.js');
      const result = await getDueWordsWithMeanings(jpdbApiKey, 1000, [], req.user.id, reviewedWords);
      res.json(result);
    } catch (error) {
      console.error('[vocab/due-words] Error:', error);
      res.json({ words: [], error: error.message });
    }
  });
```

**Step 2: Verify syntax**

Run: `node --check src/routes/vocab.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/routes/vocab.js
git commit -m "feat(vocab): POST /due-words accepts reviewedWords"
```

---

## Task 5: Update Server - getDueWordsWithMeanings() in jpdb.js

**Files:**
- Modify: `src/jpdb.js:670-820` (getDueWordsWithMeanings function)

**Step 1: Add reviewedWords parameter and fresh state fetching**

Update the function signature and add state refresh logic at the start:

```javascript
export async function getDueWordsWithMeanings(apiKey, limit = 1000, excludeVids = [], userId, reviewedWords = []) {
  console.log('[getDueWordsWithMeanings] Called with limit:', limit, 'userId:', userId, 'reviewedWords:', reviewedWords.length);
  if (!apiKey) {
    console.log('[getDueWordsWithMeanings] No API key');
    return { words: [], source: 'none' };
  }

  if (!userId) {
    console.log('[getDueWordsWithMeanings] No userId provided');
    return { words: [], source: 'none' };
  }

  let wordStateCache = {};
  let recentlyUsedWords = [];
  let lastRefresh = null;
  let lastFullParse = null;

  // Read from per-user cache file
  const userCacheFile = getUserCacheFile(userId);
  console.log('[getDueWordsWithMeanings] userCacheFile:', userCacheFile || 'NOT SET');
  if (userCacheFile) {
    try {
      const fileExists = existsSync(userCacheFile);
      console.log('[getDueWordsWithMeanings] File exists:', fileExists);
      if (fileExists) {
        const data = JSON.parse(readFileSync(userCacheFile, 'utf-8'));
        wordStateCache = data.wordStateCache || {};
        recentlyUsedWords = data.recentlyUsedWords || [];
        lastRefresh = data.lastRefresh || null;
        lastFullParse = data.lastFullParse || null;
        console.log('[getDueWordsWithMeanings] Loaded cache with', Object.keys(wordStateCache).length, 'words');
      }
    } catch (e) {
      console.warn('Failed to load vocab suggestions cache:', e.message);
    }
  }

  // FRESH STATE FETCH: If we have reviewed words, fetch their current states from JPDB
  if (reviewedWords.length > 0 && userCacheFile) {
    console.log('[getDueWordsWithMeanings] Fetching fresh states for', reviewedWords.length, 'reviewed words');
    try {
      const lookupResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          list: reviewedWords.map(w => [w.vid, w.sid]),
          fields: ['spelling', 'card_state', 'due_at']
        })
      });

      if (lookupResponse.ok) {
        const lookupData = await lookupResponse.json();
        const vocabInfo = lookupData.vocabulary_info || [];

        let updatedCount = 0;
        for (let i = 0; i < vocabInfo.length; i++) {
          const info = vocabInfo[i];
          if (!info) continue;

          const [spelling, cardState, dueAt] = info;

          // Find and update the cached entry
          if (wordStateCache[spelling]) {
            const oldStates = wordStateCache[spelling].states;
            wordStateCache[spelling].states = cardState || [];
            wordStateCache[spelling].dueAt = dueAt ?? null;
            updatedCount++;
            console.log(`[getDueWordsWithMeanings] Updated "${spelling}": ${JSON.stringify(oldStates)} -> ${JSON.stringify(cardState)}`);
          }
        }

        // Save updated cache to disk
        if (updatedCount > 0) {
          writeFileSync(userCacheFile, JSON.stringify({
            recentlyUsedWords,
            wordStateCache,
            lastRefresh,
            lastFullParse
          }, null, 2));
          console.log('[getDueWordsWithMeanings] Saved updated cache with', updatedCount, 'refreshed states');
        }
      } else if (lookupResponse.status === 429) {
        console.warn('[getDueWordsWithMeanings] Rate limited fetching fresh states');
      }
    } catch (e) {
      console.warn('[getDueWordsWithMeanings] Failed to fetch fresh states:', e.message);
    }
  }

  if (Object.keys(wordStateCache).length === 0) {
    console.log('[getDueWordsWithMeanings] Cache is empty, returning no words');
    return { words: [], source: 'none' };
  }

  // Rest of function continues unchanged...
```

**Step 2: Verify syntax**

Run: `node --check src/jpdb.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/jpdb.js
git commit -m "feat(jpdb): refresh card states from JPDB before rebuilding queue"
```

---

## Task 6: Manual Testing

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test the fix**

1. Open the game in browser
2. Enter Speed Review mode
3. Note the first word shown
4. Review it (swipe right = knew it)
5. Review 9 more words to trigger batch refresh
6. Close Speed Review
7. Re-enter Speed Review
8. **Verify:** The first word should NOT reappear (check JPDB to confirm it's now "known")

**Step 3: Check server logs**

Look for:
- `[getDueWordsWithMeanings] Fetching fresh states for X reviewed words`
- `[getDueWordsWithMeanings] Updated "word": ["due"] -> ["known"]`
- `[getDueWordsWithMeanings] Saved updated cache with X refreshed states`

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: refresh card states from JPDB during speed review queue refresh

Reviewed words were reappearing because getDueWordsWithMeanings() never
fetched fresh card states from JPDB. Now when refreshing:
1. Client passes reviewed vid/sids to server
2. Server fetches fresh states from JPDB for those words
3. Server updates local cache with new states
4. Server rebuilds queue from updated cache

Fixes the bug where 駄目 kept reappearing after being marked known.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | File | Change |
|------|------|--------|
| 1 | `public/js/api.js` | getDueWords() accepts reviewedWords, POSTs to server |
| 2 | `public/js/ui/speed-review.js` | triggerBatchRefresh() passes reviewed words |
| 3 | `public/game.js` | All refresh triggers pass reviewed words |
| 4 | `src/routes/vocab.js` | POST route extracts reviewedWords |
| 5 | `src/jpdb.js` | Fetch fresh states from JPDB, update cache |
| 6 | Manual | Test the fix works |
