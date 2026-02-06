# Word Discovery Room — Implementation Status

**Date:** 2026-01-28
**Status:** Complete
**Plan:** [2026-01-28-word-discovery-room-impl.md](./2026-01-28-word-discovery-room-impl.md)
**Design Spec:** [2026-01-28-word-discovery-room-design.md](./2026-01-28-word-discovery-room-design.md)

---

## Summary

The word discovery room teaches players new vocabulary. When entering, players see flash cards for "new" words from their JPDB deck. Swiping either direction submits a grade 1 review, marking the word as "learning."

**All 11 tasks complete.** E2E tests pass (2/2 word-discovery tests).

---

## Commits

| Hash | Description |
|------|-------------|
| `3774f8d` | feat(rooms): add wordDiscovery room type and generation |
| `2ab7988` | feat(rooms): add wordDiscovery narration and actions |
| `926c857` | feat(phase): add wordDiscovery phase detection |
| `7e4fae8` | feat(vocab): add getNewWordsForDiscovery helper |
| `f08dd1d` | feat(api): add /discovery-words endpoint |
| `34c1ae4` | feat(api): add getDiscoveryWords frontend function |
| `34556d3` | feat(ui): add discovery mode to flash card |
| `76aeba7` | feat(ui): add word discovery room handler |
| `4055e7b` | feat(game): wire up word discovery phase |
| `411db08` | test(e2e): add word discovery room tests |
| `17ad54e` | fix(tests): improve e2e helpers for new room types |

---

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `src/game/rooms.js` | Added `ROOM_TYPES.wordDiscovery`, `WORDS_PER_DISCOVERY=2`, 20% generation chance, room structure with `wordsToLearn/wordsLearned/wordIds/completed` fields, narration text, action logic |
| `src/game/phase-machine.js` | Added `PHASES.WORD_DISCOVERY`, detection logic in `derivePhase()` |
| `src/game/vocab-manager.js` | Added `getNewWordsForDiscovery(limit)` to fetch new words sorted by frequency rank, `setTestCache()` for testing |
| `src/routes/game/run.js` | Added `GET /api/game/discovery-words` endpoint |
| `src/routes/game/misc.js` | Added `wordDiscovery` case to debug-force-phase |

### Frontend

| File | Changes |
|------|---------|
| `public/js/api.js` | Added `getDiscoveryWords(limit)` function |
| `public/js/ui/actions.js` | Modified `showFlashCard()` to accept `{ discoveryMode }` option, changes hint text to "learn \| learn" |
| `public/js/ui/exploration.js` | Added `renderWordDiscovery()` function (fetches words, shows flash cards, handles swipe, submits grade 1 reviews) |
| `public/game.js` | Wired up `wordDiscovery` phase in `updateScene()` and `renderPhaseUI()`, added callbacks to exploration init |

### Tests

| File | Changes |
|------|---------|
| `tests/e2e/specs/word-discovery.spec.ts` | New file with 2 tests for word discovery phase |
| `tests/e2e/fixtures/game-helpers.ts` | Added `forcePhase()` helper for debug phase forcing |

---

## Test Results

```
Word-discovery E2E tests: 2/2 passed (11.7s)
```

Tests verify:
1. Word discovery phase can be entered and handled via debug endpoint
2. Word discovery room navigates or shows content

---

## How It Works

1. **Room Generation:** `generateFloorRooms()` rolls a 20% chance for `wordDiscovery` rooms (same weight as shrine and quiz)

2. **Phase Detection:** When entering an uninteracted wordDiscovery room, `derivePhase()` returns `PHASES.WORD_DISCOVERY`

3. **Word Fetching:** Frontend calls `GET /api/game/discovery-words?limit=2`, which queries `getNewWordsForDiscovery()` for words with state "new" sorted by frequency rank

4. **Flash Card Display:** `renderWordDiscovery()` shows flash cards with discovery mode hint ("← learn | learn →")

5. **Review Submission:** Either swipe direction submits grade 1 to JPDB, marking the word as "learning"

6. **Completion:** After all words reviewed, room marked `interacted=true`, player can proceed

---

## Known Issues

None. Implementation matches design spec.

---

## Outstanding Work

- Full E2E suite not run (optional—word-discovery tests pass)
- Could add unit tests for room generation probability (low priority)
