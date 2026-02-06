# Word Discovery Bug Investigation

**Date:** 2026-01-29
**Status:** FIXED

---

## Bug Reports from Production

Three reports from `/api/bug-reports`:

| Time | Note | inCombat | Phase |
|------|------|----------|-------|
| 23:30 | "Stuck again at word discovery" | true | wordDiscovery |
| 23:12 | "Nothing happened I'm just stuck here" | true | wordDiscovery |
| 21:58 | "I choose a chip to upgrade and then the next thing I knew I saw the quiz master sprite and it wouldn't let me progress. No action buttons load" | false | wordDiscovery |

Screenshots show: Quiz Master sprite visible, combat chip bar visible, **empty action panel** (no buttons).

---

## Previous Fix Attempts (Failed)

1. **Commit a96783e** - "Clear action panel before wordDiscovery async operations"
   - Added `actions.setContent('')` at start of `renderWordDiscovery()`
   - Did not fix the root cause

2. **Commit 82af787** - "Persist room completion state on server"
   - Added `completeWordDiscovery()` server endpoint
   - Client calls server to persist `room.interacted` and `room.wordDiscovery.completed`
   - Did not fix the root cause

---

## Root Cause #1: Wrong Data Access (FIXED)

**Location:** `public/js/ui/exploration.js:500`

**Problem:**
```js
const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
```

The server does NOT serialize `run.rooms` to the client. The rooms array is kept server-side only. Instead, the server sends the current room as a top-level `gameState.room` field.

**Evidence:**
- `src/game/loop.js:getState()` sends `room: currentRoom` (line 392) but NOT `run.rooms`
- `run.totalRooms` is sent (line 336) but not the array itself
- Only `renderWordDiscovery()` in the entire codebase accesses `gameState.run.rooms`

**Fix Applied:**
```js
const room = gameState.room;
```

**Commit:** 1a0b7e8

---

## Root Cause #2: Client-Side State Lost on gameState Update (NOT YET FIXED)

**Location:** `public/js/ui/exploration.js` - word discovery state tracking

**Problem:**
The function uses client-side properties on the room object:
- `room._discoveryFetched` - prevents re-fetching words
- `room._discoveryWords` - stores fetched word data
- `discovery.wordsLearned` - tracks progress (via `room.wordDiscovery`)

When `updateGameState(newState)` is called, the entire `gameState` object is replaced:
```js
function updateGameState(newState) {
  gameState = newState;  // Complete replacement
  window.gameState = gameState;
  store.set('gameState', gameState);
}
```

The server's response doesn't include client-side properties (`_discoveryFetched`, `_discoveryWords`), so they are lost.

**Reproduction Flow:**
1. `renderWordDiscovery()` sets `room._discoveryFetched = true`
2. Shows intro narration "新しい言葉を発見しよう！"
3. User clicks to dismiss
4. Fetches words via API - if no words available:
5. Shows "no new words" narration
6. Calls `apiCompleteDiscovery()` → `updateGameState(result.state)`
7. **`gameState.room` is now a fresh object from server - `_discoveryFetched` is gone**
8. Calls `apiProceed()` → `updateGameState(result.state)` → `updateUI()`
9. `updateUI()` calls `renderWordDiscovery()` again
10. `room._discoveryFetched` is undefined, so shows intro narration again
11. **Infinite loop of intro narration**

**E2E Test Evidence:**
```
[Test] Attempt 1: phase=wordDiscovery
[Test] Clicking narration box
[Test] Attempt 2: phase=wordDiscovery
[Test] Clicking narration box
... (repeats 25 times)
Note: wordDiscovery phase did not transition
```

The test clicks the narration box 25 times because it keeps reappearing.

---

## Proposed Fix for Root Cause #2

Use module-level state (like `shrineInProgress`) instead of client-side room modifications:

```js
// Module-level state for word discovery (persists across gameState updates)
let discoveryState = {
  fetched: false,
  words: [],
  wordsLearned: 0,
  roomId: null  // Reset when room changes
};
```

This pattern is already used successfully for shrine:
```js
// Module-level guard to prevent multiple shrine clicks across re-renders
let shrineInProgress = false;
```

**Implementation completed successfully.**

---

## Final Fix Applied

### Code Changes (exploration.js)

1. **Added module-level `discoveryState`** (lines 42-48):
```js
let discoveryState = {
  fetched: false,
  words: [],
  wordsLearned: 0,
  roomId: null  // Reset when room changes
};
```

2. **Updated `renderWordDiscovery()`** to use module-level state:
   - Reset `discoveryState` when entering a new room (compare `roomId`)
   - Use `discoveryState.fetched` instead of `room._discoveryFetched`
   - Use `discoveryState.words` instead of `room._discoveryWords`
   - Use `discoveryState.wordsLearned++` in swipe handler

### Test Fix (word-discovery.spec.ts)

The test was also broken - it checked for narration BEFORE flash cards. Since persistent narration ("1/2: スワイプして覚えよう") coexists with flash cards, the test would click the persistent narration (which does nothing) and never reach the swipe code.

**Fixed by reordering checks**: flash card → proceed button → narration

---

## Other Observations

### `inCombat: true` in Bug Reports

Bug reports show `inCombat: true` even though phase is `wordDiscovery`. This is because:

1. Bug report calculates: `inCombat: !!gameState.combat`
2. Combat ends by setting `combat.active = false` but NOT `combat = null`
3. So `gameState.combat` object exists (truthy) even after combat ends

This is cosmetic for the bug report - not the actual cause of the stuck state. The phase machine correctly checks `combat?.active` not just `combat`.

### Test Expectation Fix

Also fixed test at `tests/e2e/specs/rooms/word-discovery.spec.ts:184`:
- Test expected grade 5 for right swipe
- Word discovery uses grade 1 for ALL swipes (learning mode, not recall)
- Changed expectation to grade 1

---

## Files Modified

| File | Change |
|------|--------|
| `public/js/ui/exploration.js:500` | Changed `gameState.run?.rooms?.[...]` to `gameState.room` |
| `public/js/ui/exploration.js:42-48` | Added `discoveryState` module-level variable |
| `public/js/ui/exploration.js:506-580` | Updated `renderWordDiscovery()` to use `discoveryState` |
| `tests/e2e/specs/rooms/word-discovery.spec.ts:83-118` | Fixed test order: check flash card before narration |

---

## Commits

| Hash | Description | Status |
|------|-------------|--------|
| 1a0b7e8 | fix(wordDiscovery): use gameState.room instead of non-existent run.rooms | Pushed to prod |

---

## Next Steps

All steps completed:

1. ✅ Complete the module-level state refactor for `renderWordDiscovery()`
2. ✅ Update swipe handler to use `discoveryState.wordsLearned++`
3. ✅ Reset `discoveryState` when room changes or discovery completes
4. ✅ Re-run E2E tests to verify fix (5/5 passing)
5. ⏳ Deploy to production and verify fix works for users

---

## Test Commands

```bash
# Run word discovery tests
./scripts/e2e-test.sh specs/rooms/word-discovery

# Run single test with verbose output
./scripts/e2e-test.sh specs/rooms/word-discovery.spec.ts:72

# Syntax check
node --check public/js/ui/exploration.js
```
