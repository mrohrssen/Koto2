# Speed Review Refresh Fix

## Problem

Reviewed words keep reappearing in the speed review queue because `getDueWordsWithMeanings()` never fetches fresh card states from JPDB. It reads stale local cache and fetches meanings (which aren't even cached), but never updates the card states.

Example: User reviews 駄目, JPDB marks it as "known", but local cache still has `states: ["locked", "due"]`. On queue refresh, the word reappears.

## Solution

When refreshing the queue, fetch fresh states from JPDB for the words that were just reviewed, update the local cache, then rebuild the queue.

## Implementation

### 1. Client - api.js

Change `getDueWords()` from GET to POST, accept reviewed words:

```javascript
export async function getDueWords(reviewedWords = []) {
  const response = await fetch('/api/vocab/due-words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ reviewedWords })
  });
  return await response.json();
}
```

### 2. Client - speed-review.js

Update `triggerBatchRefresh()` to pass reviewed words:

```javascript
async function triggerBatchRefresh() {
  if (!state.callbacks?.refreshQueue) return;

  const reviewedVids = state.reviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
  state.reviewedBatch = []; // Clear before async call

  const freshWords = await state.callbacks.refreshQueue(reviewedVids);
  // ... rest of queue update logic
}
```

### 3. Client - game.js

Update `refreshQueue` callback to accept and pass reviewed words:

```javascript
refreshQueue: async (reviewedWords = []) => {
  const result = await apiGetDueWords(reviewedWords);
  return result?.words || [];
}
```

Update combat batch tracking similarly.

### 4. Server - vocab.js

Change route from GET to POST:

```javascript
router.post('/vocab/due-words', requireAuth, attachUserKeys, async (req, res) => {
  const { reviewedWords = [] } = req.body;
  // ... pass reviewedWords to getDueWordsWithMeanings
});
```

### 5. Server - jpdb.js `getDueWordsWithMeanings()`

Add fresh state fetching at the start:

```javascript
export async function getDueWordsWithMeanings(apiKey, limit, excludeVids, userId, reviewedWords = []) {
  // 1. If reviewedWords provided, fetch fresh states from JPDB
  if (reviewedWords.length > 0) {
    const response = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        list: reviewedWords.map(w => [w.vid, w.sid]),
        fields: ['spelling', 'card_state', 'due_at']
      })
    });

    // 2. Update local cache with fresh states
    const data = await response.json();
    for (const [spelling, cardState, dueAt] of data.vocabulary_info) {
      const cached = wordStateCache[spelling];
      if (cached) {
        cached.states = cardState || [];
        cached.dueAt = dueAt;
      }
    }

    // 3. Save updated cache to disk
    writeFileSync(userCacheFile, JSON.stringify({ wordStateCache, ... }));
  }

  // 4. Continue with existing queue rebuild logic (now uses fresh states)
  // ...
}
```

## Refresh Triggers

All of these pass `reviewedBatch` to the refresh:

1. **Every 10 cards** - speed-review.js `triggerBatchRefresh()`
2. **30s inactivity** - speed-review.js `handleInactivityTimeout()`
3. **Close modal** - speed-review.js `handleExit()`
4. **Combat victory** - game.js `showVictoryModal()`
5. **Combat game over** - game.js `showGameOverModal()`

## Testing

1. Review a word in speed review
2. Wait for batch refresh (or close modal)
3. Re-enter speed review
4. Word should NOT reappear (verify on JPDB it's marked known)
