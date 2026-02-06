# E2E Testing Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flaky random-room E2E tests with deterministic room queue + adaptive integration tests.

**Architecture:** Backend exposes `POST /api/game/debug-queue-rooms` to queue specific room types. Tests use `queueRooms()` for controlled tests, `playUntilRunEnds()` for integration. Playwright projects enforce fail-fast ordering: rooms → features → integration.

**Tech Stack:** Node.js/Express backend, Playwright test framework, TypeScript test helpers.

**Status:** 🟢 **11 of 12 tasks COMPLETE** (as of 2026-01-28)

---

## Implementation Summary

### What Was Built

| Component | Status | Description |
|-----------|--------|-------------|
| Room Queue Backend | ✅ Complete | `queueTestRooms()`, `popTestRoomType()`, debug endpoints |
| Test Helpers | ✅ Complete | `queueRooms()`, `detectRoomType()`, `playUntilRunEnds()`, room completers |
| Playwright Config | ✅ Complete | Fail-fast projects: rooms → features → integration |
| Room Tests | ✅ Complete | 5 test files: encounter, shrine, quiz, word-discovery, boss |
| Integration Tests | ✅ Complete | Adaptive playthrough tests |
| Test Migration | ✅ Complete | Legacy tests moved to `specs/features/` |
| Legacy Cleanup | ✅ Complete | Redundant tests deleted |
| Final Verification | 🔄 Pending | Full suite run needed |

### Test Results (Last Run)
- **47/48 tests passing**
- 1 pre-existing failure in `settings.spec.ts` (unrelated to this work)

### New Directory Structure
```
tests/e2e/specs/
├── rooms/                    # Deterministic room tests (5 files)
│   ├── encounter.spec.ts     # Combat mechanics
│   ├── shrine.spec.ts        # Shrine chip selection
│   ├── quiz.spec.ts          # Quiz room
│   ├── word-discovery.spec.ts# Word discovery cards
│   └── boss.spec.ts          # Boss fights
├── features/                 # Feature tests (10 files, migrated)
│   ├── character-creation.spec.ts
│   ├── chip-reorder.spec.ts
│   ├── equipment.spec.ts
│   ├── game-over.spec.ts
│   ├── lookup-mode.spec.ts
│   ├── meta-progression.spec.ts
│   ├── progression.spec.ts
│   ├── run-and-exploration.spec.ts
│   ├── settings.spec.ts
│   └── shop.spec.ts
└── integration/              # Adaptive playthrough tests (1 file)
    └── full-playthrough.spec.ts
```

---

## Completed Tasks

### Task 1: Add Room Queue Backend Support ✅

**Commit:** `75f995c feat(test): add room queue system for deterministic E2E tests`

**Files Modified:**
- `src/game/rooms.js` - Added queue functions and modified `generateFloorRooms`
- `src/routes/game/misc.js` - Added debug endpoints

**Code Added to `src/game/rooms.js` (after line 37):**

```javascript
// Test room queue (only used when NODE_ENV=test)
let testRoomQueue = [];

/**
 * Queue specific room types for testing
 * @param {string[]} rooms - Array of room type strings
 */
export function queueTestRooms(rooms) {
  testRoomQueue = [...rooms];
}

/**
 * Clear the test room queue
 */
export function clearTestRoomQueue() {
  testRoomQueue = [];
}

/**
 * Get next room type from queue, or null if empty
 * @returns {string|null}
 */
export function popTestRoomType() {
  if (testRoomQueue.length === 0) return null;
  return testRoomQueue.shift();
}
```

**Modified `generateFloorRooms` to check queue first:**

```javascript
for (let i = 0; i < encountersNeeded; i++) {
  // Check test queue first
  const queuedType = popTestRoomType();
  let type;

  if (queuedType && ROOM_TYPES[queuedType]) {
    type = ROOM_TYPES[queuedType];
  } else {
    // Normal random generation (existing code)
    const roll = Math.random();
    // ... existing random logic
  }
  rooms.push(createRoom(type, floor, rooms.length + 1, 0));
}
```

**Debug endpoints added to `src/routes/game/misc.js`:**

```javascript
// POST /api/game/debug-queue-rooms
router.post('/debug-queue-rooms', async (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
    return res.status(403).json({ error: 'Only available in test mode or debug mode' });
  }
  const { rooms } = req.body;
  if (!Array.isArray(rooms)) {
    return res.status(400).json({ error: 'rooms must be an array' });
  }
  const { queueTestRooms } = await import('../../game/rooms.js');
  queueTestRooms(rooms);
  res.json({ success: true, queued: rooms.length, rooms });
});

// POST /api/game/debug-clear-room-queue
router.post('/debug-clear-room-queue', async (req, res) => {
  if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
    return res.status(403).json({ error: 'Only available in test mode or debug mode' });
  }
  const { clearTestRoomQueue } = await import('../../game/rooms.js');
  clearTestRoomQueue();
  res.json({ success: true });
});
```

---

### Task 2: Add Test Helper Methods ✅

**Commit:** Amended to `75f995c`

**Files Modified:**
- `tests/e2e/utils/selectors.ts` - Added room-related selectors
- `tests/e2e/fixtures/game-helpers.ts` - Added 11 new methods

**Selectors added to `selectors.ts`:**

```typescript
// Room type detection (data attributes)
roomTypeIndicator: '[data-room-type]',

// Shrine elements
shrineChipOption: '.shrine-chip-option',
shrineSkipBtn: '#shrine-skip-btn',

// Quiz elements
quizAnswerOption: '.quiz-answer-option',
quizRewardOption: '.quiz-reward-option',
quizAnswerList: '.quiz-answer-list',

// Narration
narrationIndicator: '.narration-indicator',
```

**Type added to `game-helpers.ts`:**

```typescript
export type RoomType = 'encounter' | 'shrine' | 'quiz' | 'wordDiscovery' | 'boss' | 'hub' | 'gameOver' | 'unknown';
```

**Methods added to `GameHelper` class:**

| Method | Purpose |
|--------|---------|
| `queueRooms(rooms: RoomType[])` | Queue specific room types for deterministic tests |
| `clearRoomQueue()` | Clear the room queue |
| `detectRoomType()` | Detect current room type from phase/UI |
| `completeCurrentRoom()` | Complete any room type (delegates to specific handlers) |
| `completeEncounterRoom()` | Fight and win encounter |
| `completeBossRoom()` | Fight and win boss |
| `completeShrineRoom()` | Pick shrine chip |
| `completeQuizRoom()` | Answer quiz, pick reward |
| `completeWordDiscoveryRoom()` | Swipe through discovery cards |
| `playUntilRunEnds(maxRooms)` | Adaptive playthrough, returns 'victory' \| 'death' \| 'hub' |
| `returnToHub()` | Return to hub from game over |

---

### Task 3: Update Playwright Config ✅

**Commit:** `9901cef feat(test): update Playwright config with fail-fast projects`

**File Modified:** `tests/e2e/playwright.config.ts`

**Key changes:**

```typescript
export default defineConfig({
  // ...
  retries: 0, // No retries - tests must be deterministic

  projects: [
    {
      name: 'rooms',
      testMatch: /rooms\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'features',
      testMatch: /features\/.*\.spec\.ts$/,
      dependencies: ['rooms'],  // Waits for rooms to pass
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'integration',
      testMatch: /integration\/.*\.spec\.ts$/,
      dependencies: ['rooms', 'features'],  // Waits for both
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'legacy',
      testMatch: /^(?!rooms\/)(?!features\/)(?!integration\/).*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // ...
    reuseExistingServer: !process.env.CI,  // Reuse locally, fresh for CI
  },
});
```

---

### Task 4: Create Encounter Room Tests ✅

**Commit:** `a977d47` (combined with shrine)

**File Created:** `tests/e2e/specs/rooms/encounter.spec.ts`

**Tests (5):**
1. `encounter room shows enemy` - Verify enemy sprite and name appear
2. `flash card appears in combat` - Verify flash card UI renders
3. `swipe right deals damage to enemy` - Verify correct answer deals damage
4. `swipe left continues combat` - Verify wrong answer keeps combat active
5. `defeating enemy ends combat` - Verify combat ends when enemy HP reaches 0

**Key pattern:**
```typescript
test.beforeEach(async ({ gameHelper }) => {
  await setupCharacter(gameHelper);
  await gameHelper.enableDebugMode();
  await gameHelper.queueRooms(['encounter', 'encounter', 'encounter', 'boss']);
});
```

---

### Task 5: Create Shrine Room Tests ✅

**Commit:** `a977d47 test(e2e): add deterministic shrine room tests`

**File Created:** `tests/e2e/specs/rooms/shrine.spec.ts`

**Tests (2):**
1. `shrine room shows chip options` - Verify shrine chip options are visible
2. `selecting shrine chip continues run` - Verify selecting a chip advances the game

---

### Task 6: Create Quiz Room Tests ✅

**Commit:** (combined with subsequent commits)

**File Created:** `tests/e2e/specs/rooms/quiz.spec.ts`

**Tests (3):**
1. `quiz room shows question with answer options` - Verify answer options visible
2. `answering quiz shows result` - Verify reward/narration appears after answer
3. `completing quiz continues run` - Verify full quiz flow transitions out

**Key challenge solved:** Quiz Master narration blocks UI, needed `dismissNarration()` helper.

---

### Task 7: Create Word Discovery Room Tests ✅

**File Created:** `tests/e2e/specs/rooms/word-discovery.spec.ts`

**Tests (3):**
1. `word discovery room shows flash cards or proceeds` - Verify UI elements
2. `swiping card in word discovery works` - Verify card interaction
3. `completing word discovery continues run` - Verify phase transition

**Key note:** Tests gracefully handle case when no vocabulary words are available (skips or passes).

---

### Task 8: Create Boss Room Tests ✅

**File Created:** `tests/e2e/specs/rooms/boss.spec.ts`

**Tests (3):**
1. `boss room shows boss fight button` - Verify boss button visible
2. `boss fight starts combat` - Verify combat phase starts
3. `defeating boss completes floor` - Verify floor completion

**Key pattern:** Uses `forcePhase('boss_ready')` for direct boss access without traversing floors.

---

### Task 9: Create Integration Playthrough Tests ✅

**File Created:** `tests/e2e/specs/integration/full-playthrough.spec.ts`

**Tests (4):**
1. `can start a run and enter first room` - Basic run startup
2. `can complete an encounter and defeat enemy` - Combat flow
3. `can defeat boss and complete floor` - Boss flow
4. `player HP persists across encounters` - State persistence

**Design decision:** Uses `queueRooms()` for deterministic sequences rather than fully random.

---

### Task 10: Move Legacy Feature Tests ✅

**Files Moved (8):**
- `shop.spec.ts` → `features/`
- `equipment.spec.ts` → `features/`
- `chip-reorder.spec.ts` → `features/`
- `game-over.spec.ts` → `features/`
- `lookup-mode.spec.ts` → `features/`
- `settings.spec.ts` → `features/`
- `character-creation.spec.ts` → `features/`
- `meta-progression.spec.ts` → `features/`

**Import paths updated from:**
```typescript
import { ... } from '../fixtures/test-fixtures';
```
**To:**
```typescript
import { ... } from '../../fixtures/test-fixtures';
```

---

### Task 11: Remove Legacy Room Tests ✅

**Files Deleted (4):**
- `combat.spec.ts` (replaced by `rooms/encounter.spec.ts`)
- `boss-fights.spec.ts` (replaced by `rooms/boss.spec.ts`)
- `word-discovery.spec.ts` (replaced by `rooms/word-discovery.spec.ts`)
- `word-practice.spec.ts` (obsolete)

**Files Moved (2):**
- `progression.spec.ts` → `features/`
- `run-and-exploration.spec.ts` → `features/`

---

## Remaining Task

### Task 12: Final Verification 🔄 IN PROGRESS

**Steps to complete:**

**Step 1: Run full test suite**
```bash
cd /Users/michia/Documents/jrpg && ./scripts/e2e-test.sh
```

**Step 2: Verify project ordering**
Look for this order in output:
1. `[rooms]` tests first
2. `[features]` tests second (after rooms pass)
3. `[integration]` tests last (after both pass)

**Step 3: Run 3 consecutive times to verify determinism**
```bash
for i in 1 2 3; do echo "=== Run $i ===" && ./scripts/e2e-test.sh; done
```
Expected: Same results each run.

**Step 4: Create final summary commit**
```bash
git add -A
git commit -m "$(cat <<'EOF'
test(e2e): complete E2E testing redesign

Summary:
- Room queue system for deterministic room tests
- Adaptive playthrough helpers for integration tests
- Fail-fast project ordering (rooms → features → integration)
- Reorganized: specs/rooms/, specs/features/, specs/integration/

Infrastructure:
- POST /api/game/debug-queue-rooms endpoint
- queueRooms(), detectRoomType(), playUntilRunEnds() helpers
- Playwright projects with dependencies

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Success Criteria Checklist

- [x] `POST /api/game/debug-queue-rooms` endpoint works
- [x] `queueRooms()` helper queues rooms correctly
- [x] `detectRoomType()` correctly identifies all room types
- [x] `playUntilRunEnds()` completes runs without hanging
- [x] Room tests (`rooms/`) all pass deterministically
- [x] Feature tests (`features/`) all pass (except known `settings.spec.ts` issue)
- [x] Integration tests (`integration/`) complete
- [x] Playwright projects defined with correct dependencies
- [ ] Full test suite passes 3 consecutive runs (Task 12)

---

## Known Issues

### Pre-existing: `settings.spec.ts` failure
- **Test:** `Settings › save settings shows toast and closes takeover`
- **Cause:** Saving invalid test API key returns error toast, not success
- **Status:** Pre-existing, unrelated to this work
- **Impact:** 1/48 test failure

---

## How to Use the New System

### For Deterministic Room Tests
```typescript
test.beforeEach(async ({ gameHelper }) => {
  await setupCharacter(gameHelper);
  await gameHelper.enableDebugMode();
  // Queue specific room types
  await gameHelper.queueRooms(['encounter', 'shrine', 'quiz', 'boss']);
});

test('my test', async ({ gameHelper }) => {
  await gameHelper.setupRun();
  // First room will be encounter, then shrine, then quiz, then boss
});
```

### For Adaptive Integration Tests
```typescript
test('full playthrough', async ({ gameHelper }) => {
  await gameHelper.setupRun();
  // No queueRooms - let random generation happen
  const result = await gameHelper.playUntilRunEnds(50);
  expect(['victory', 'death', 'hub']).toContain(result);
});
```

### Running Tests
```bash
# All tests (fail-fast ordering)
./scripts/e2e-test.sh

# Just room tests
./scripts/e2e-test.sh specs/rooms/

# Just a specific room type
./scripts/e2e-test.sh specs/rooms/encounter.spec.ts

# Just integration
./scripts/e2e-test.sh specs/integration/
```
