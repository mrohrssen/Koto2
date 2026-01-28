# Word Discovery Room Design

> **For Claude:** Use superpowers:writing-plans to create the implementation plan from this spec.

**Goal:** Add a new room type where players "discover" new vocabulary words. This teaches JPDB that these words are no longer "new" by submitting a grade 1 review, moving them into the active learning queue.

---

## Overview

When a player enters a word discovery room:
1. Quizmaster appears with greeting
2. Two flash cards shown back-to-back (highest frequency "new" words)
3. Player swipes either direction to confirm learning (both = grade 1)
4. Words move from "new" to "failed/due" status in JPDB
5. Cache refreshes, room completes

---

## Room System

### Constants

```javascript
// In src/game/rooms.js
const WORDS_PER_DISCOVERY = 2;
```

### Room Type

Add `wordDiscovery` to `ROOM_TYPES` constant.

### Generation Probability

Each non-boss room slot rolls independently:
- 20% shrine
- 20% quiz
- 20% wordDiscovery
- 40% encounter (remaining)

### Room State Structure

```javascript
{
  type: 'wordDiscovery',
  wordDiscovery: {
    wordsToLearn: 2,      // From WORDS_PER_DISCOVERY constant
    wordsLearned: 0,      // Progress tracker
    wordIds: [],          // [vid, sid] pairs, populated on room entry
    completed: false
  }
}
```

### Narration

- **Entry (persistent):** Quizmaster greeting about learning new words
- **Completion (click-to-continue):** Quizmaster congratulates, proceed to next room
- **No words available (click-to-continue):** Graceful message, room completes immediately

### Actions

`getRoomActions()` returns empty array - no action button needed, flash cards appear immediately.

---

## Backend API

### New Endpoint: `GET /api/game/discovery-words`

**Location:** `src/routes/game/run.js`

**Logic:**
1. Read vocab-manager cache (already in memory from session start)
2. Filter words where `states` array includes `'new'`
3. Cross-reference with `staticWordList` to get rank (already loaded at server start)
4. Sort by rank ascending (lower rank = higher frequency = prioritized)
5. Return top N words based on request limit

**Request:**
```javascript
{ limit: 2 }  // Optional, defaults to WORDS_PER_DISCOVERY
```

**Response (success):**
```javascript
{
  words: [
    { word: "食べる", reading: "たべる", meanings: [...], vid: 123, sid: 0, rank: 45 },
    { word: "飲む", reading: "のむ", meanings: [...], vid: 456, sid: 0, rank: 67 }
  ],
  available: true
}
```

**Response (no new words):**
```javascript
{ words: [], available: false }
```

### Review Submission

Reuse existing `/api/game/swipe-word` endpoint:
- Send `{ vid, sid, grade: 1 }` for each discovered word
- Existing logic handles JPDB review and cache invalidation

### Post-Discovery Refresh

After all words reviewed, call `/api/game/post-combat-refresh` with the discovered words to update cache with fresh states.

---

## Frontend UI Flow

### Room Entry

1. Set background to `quiz_master_background.png`
2. Show quizmaster sprite
3. Display persistent narration: "Hey! It's time to learn some new words"
4. Call `GET /api/game/discovery-words?limit=2`
5. Store returned words in room state

### No Words Available Path

If `available: false`:
1. Show click-to-continue narration: "No new words to discover right now. Keep exploring!"
2. Mark room complete
3. Advance to next room

### Flash Card Display

1. Use existing `showFlashCard()` from `actions.js`
2. **Change helper text** to "swipe either direction to learn" for this room type
3. Card front: word
4. Card back (after tap): reading + meanings

### Swipe Handling

1. Either swipe direction (left or right) triggers:
   - Send grade 1 review via `/api/game/swipe-word`
   - Increment `room.wordDiscovery.wordsLearned`
2. If `wordsLearned < wordsToLearn`: show next card
3. If all words done: proceed to completion

### Completion

1. Hide flash card UI
2. Show click-to-continue narration: "Great job! Let's keep exploring"
3. Fire-and-forget: call post-discovery refresh for reviewed words
4. Mark `room.wordDiscovery.completed = true`
5. Advance to next room

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/game/rooms.js` | Add room type, constant, generation logic, narration, actions |
| `src/routes/game/run.js` | Add `/discovery-words` endpoint |
| `src/game/vocab-manager.js` | Add `getNewWordsForDiscovery()` helper (filter + sort logic) |
| `public/js/ui/exploration.js` | Handle wordDiscovery room entry and flow |
| `public/js/ui/actions.js` | Support alternate helper text for discovery mode |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No "new" words in cache | Show message, complete room immediately |
| Cache not warmed yet | Same as no new words (graceful degradation) |
| JPDB review fails | Log warning, continue to next card (don't block) |
| Only 1 new word available | Show that 1 word, complete after it |
| User refreshes mid-discovery | Room state preserved, resume where left off |

---

## Future Considerations

- Adjust `WORDS_PER_DISCOVERY` based on floor difficulty
- Add visual flair for "word learned" animation
- Track total words discovered in meta-progression stats
- Consider deck-specific discovery (learn words from specific JPDB deck)
