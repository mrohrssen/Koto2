# Flashcard Prefetch Design

## Problem

Flashcards take 5-10 seconds to load at combat start on Railway (3-5 seconds locally). This delay occurs because `initCombatWords()` fetches 50 words from JPDB API synchronously when combat begins.

## Solution

Prefetch words before they're needed:
1. Fetch at run start (before first combat)
2. Refresh after combat ends (while player views rewards)

## Implementation

### 1. Add prefetchCombatWords() to word-practice.js

```javascript
export function prefetchCombatWords() {
  if (jpdbWordsCache && jpdbWordsCache.length > 0) return;
  if (jpdbWordsFetching) return;

  fetchJpdbDueWords().then(words => {
    console.log(`[WordPractice] Prefetched ${words?.length || 0} words`);
  }).catch(err => {
    console.warn('[WordPractice] Prefetch failed:', err);
  });
}
```

### 2. Trigger prefetch at run start (game.js)

In `startNewRun()`, after `updateUI()`:
```javascript
wordPractice.prefetchCombatWords();
```

### 3. Trigger prefetch after combat (combat-loop.js)

In `stopCombatLoop()`, after `showVictoryModal()`:
```javascript
wordPractice.prefetchCombatWords();
```

### 4. Modify initCombatWords() to use cached data

```javascript
export async function initCombatWords() {
  if (!jpdbWordsCache || jpdbWordsCache.length === 0) {
    clearWordCache();
  }
  let wordData = await fetchJpdbDueWords();
  // ... rest unchanged
}
```

## Behavior

| Scenario | Result |
|----------|--------|
| Prefetch succeeded | Combat words load instantly |
| Prefetch in progress | Waits for existing fetch |
| Prefetch failed | Falls back to synchronous fetch |
| Words reviewed during combat | Removed from cache; post-combat prefetch refreshes |

## Files Changed

- `public/js/word-practice.js` - Add prefetch function, modify initCombatWords
- `public/game.js` - Call prefetch at run start
- `public/js/ui/combat-loop.js` - Call prefetch after victory
