# E2E Testing Redesign

**Date:** 2026-01-28
**Status:** Design

---

## Problem

Current E2E tests are flaky and unreliable:

1. **Random room generation** - Tests use `proceedToEncounter(50)` hoping to find an enemy. With variable room distribution, tests fail from bad luck.

2. **Fighting randomness** - Tests try to control randomness instead of either embracing it (adaptive) or bypassing it (direct control).

3. **No clear test phases** - Feature tests and integration tests are mixed, so a broken room type wastes time on unrelated tests.

---

## Goals

1. **Deterministic feature tests** - Each room type and feature tested with controlled room generation
2. **Integration confidence** - Full playthroughs verify the game works end-to-end
3. **Fail-fast** - If a room type breaks, stop before running integration tests
4. **Maintainable** - Adding new features = adding tests to the relevant file

---

## Solution

### Two-Phase Test Strategy

**Phase 1: Room & Feature Tests (Controlled)**
- Use room queue to specify exactly which rooms appear
- Each test controls its environment precisely
- Fast, deterministic, easy to debug

**Phase 2: Integration Tests (Adaptive)**
- Play through the game naturally, adapting to whatever rooms appear
- Only runs if Phase 1 passes
- Catches integration bugs and unexpected room transitions

---

### 1. Room Queue System

Add a debug endpoint that queues specific room types. Tests specify what they need, backend serves those rooms in order.

**Backend endpoint:**

```javascript
// POST /api/game/debug-queue-rooms
// Body: { rooms: ["encounter", "shrine", "encounter", "boss"] }

let roomQueue = [];

export function queueRooms(rooms) {
  roomQueue = [...rooms];
}

export function getNextRoom() {
  if (roomQueue.length > 0) {
    return roomQueue.shift();
  }
  return generateRandomRoom(); // fallback to normal generation
}
```

**Test helper:**

```typescript
// fixtures/game-helpers.ts
async queueRooms(rooms: RoomType[]): Promise<void> {
  await this.page.request.post('/api/game/debug-queue-rooms', {
    data: { rooms }
  });
}
```

---

### 2. Adaptive Playthrough Helper

For integration tests, detect room type and execute appropriate actions.

```typescript
// fixtures/game-helpers.ts
async detectRoomType(): Promise<RoomType> {
  // Check UI elements or game state to determine current room
  if (await this.page.locator('.combat-ui').isVisible()) return 'encounter';
  if (await this.page.locator('.shrine-ui').isVisible()) return 'shrine';
  if (await this.page.locator('.quiz-ui').isVisible()) return 'quiz';
  if (await this.page.locator('.word-discovery-ui').isVisible()) return 'wordDiscovery';
  if (await this.page.locator('.boss-ui').isVisible()) return 'boss';
  if (await this.page.locator('.hub-ui').isVisible()) return 'hub';
  if (await this.page.locator('.game-over-ui').isVisible()) return 'gameOver';
  throw new Error('Unknown room type');
}

async completeCurrentRoom(): Promise<void> {
  const roomType = await this.detectRoomType();

  switch (roomType) {
    case 'encounter':
    case 'boss':
      await this.completeCombat();
      break;
    case 'shrine':
      await this.pickShrineReward();
      break;
    case 'quiz':
      await this.answerQuiz();
      break;
    case 'wordDiscovery':
      await this.completeWordDiscovery();
      break;
  }
}

async playUntilRunEnds(): Promise<'victory' | 'death' | 'hub'> {
  const maxRooms = 50; // safety limit

  for (let i = 0; i < maxRooms; i++) {
    const roomType = await this.detectRoomType();

    if (roomType === 'hub') return 'hub';
    if (roomType === 'gameOver') return 'death';

    await this.completeCurrentRoom();

    // Check if we won (returned to hub after boss)
    if (roomType === 'boss') {
      await this.page.waitForSelector('.hub-ui, .game-over-ui');
      return await this.detectRoomType() === 'hub' ? 'victory' : 'death';
    }
  }

  throw new Error('Run did not end within max rooms');
}
```

---

### 3. Test Structure

```
tests/e2e/specs/
├── rooms/                    # Phase 1: Room-specific tests
│   ├── encounter.spec.ts     # Combat mechanics
│   ├── shrine.spec.ts        # Shrine rewards
│   ├── quiz.spec.ts          # Quiz room
│   ├── word-discovery.spec.ts# Word discovery room
│   └── boss.spec.ts          # Boss fights
├── features/                 # Phase 1: Feature tests
│   ├── shop.spec.ts          # Post-combat shop
│   ├── chip-management.spec.ts
│   ├── game-over.spec.ts
│   ├── lookup-mode.spec.ts
│   ├── settings.spec.ts
│   └── character-creation.spec.ts
└── integration/              # Phase 2: Full playthroughs
    └── full-playthrough.spec.ts
```

---

### 4. Example Tests

**Room test (controlled):**

```typescript
// specs/rooms/shrine.spec.ts
test('shrine offers 3 chip choices', async ({ gameHelper }) => {
  await gameHelper.queueRooms(['shrine']);
  await gameHelper.startRun();

  await expect(page.locator('.shrine-choice')).toHaveCount(3);
});

test('selecting shrine chip adds to loadout', async ({ gameHelper }) => {
  await gameHelper.queueRooms(['shrine']);
  await gameHelper.startRun();

  const initialChips = await gameHelper.getChipCount();
  await page.locator('.shrine-choice').first().click();

  expect(await gameHelper.getChipCount()).toBe(initialChips + 1);
});
```

**Feature test (controlled):**

```typescript
// specs/features/game-over.spec.ts
test('player death shows game over screen', async ({ gameHelper }) => {
  await gameHelper.queueRooms(['encounter']);
  await gameHelper.startRun();

  await gameHelper.loseIntentionally();

  await expect(page.locator('.game-over-ui')).toBeVisible();
});
```

**Integration test (adaptive):**

```typescript
// specs/integration/full-playthrough.spec.ts
test('can complete 3 full runs', async ({ gameHelper }) => {
  for (let run = 1; run <= 3; run++) {
    await gameHelper.startRun();
    const result = await gameHelper.playUntilRunEnds();

    expect(['victory', 'death']).toContain(result);

    if (result === 'death') {
      await gameHelper.returnToHub();
    }
  }
});
```

---

### 5. Playwright Config

```typescript
// tests/e2e/playwright.config.ts
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,

  projects: [
    {
      name: 'rooms',
      testMatch: /rooms\/.*\.spec\.ts$/,
    },
    {
      name: 'features',
      testMatch: /features\/.*\.spec\.ts$/,
      dependencies: ['rooms'],
    },
    {
      name: 'integration',
      testMatch: /integration\/.*\.spec\.ts$/,
      dependencies: ['rooms', 'features'],
    },
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

**Execution order:**
1. All room tests run first
2. If any room test fails → stop, don't run features or integration
3. Feature tests run second
4. If any feature test fails → stop, don't run integration
5. Integration tests run last (only if everything else passed)

---

## Migration Plan

### Phase 1: Infrastructure
- [ ] Add `POST /api/game/debug-queue-rooms` endpoint
- [ ] Add `queueRooms()` to game-helpers.ts
- [ ] Add `detectRoomType()` to game-helpers.ts
- [ ] Add `playUntilRunEnds()` to game-helpers.ts
- [ ] Update playwright.config.ts with project dependencies

### Phase 2: Migrate Room Tests
- [ ] Create `specs/rooms/` directory
- [ ] Migrate encounter tests → `rooms/encounter.spec.ts`
- [ ] Migrate shrine tests → `rooms/shrine.spec.ts`
- [ ] Migrate quiz tests → `rooms/quiz.spec.ts`
- [ ] Migrate word discovery tests → `rooms/word-discovery.spec.ts`
- [ ] Migrate boss tests → `rooms/boss.spec.ts`

### Phase 3: Migrate Feature Tests
- [ ] Create `specs/features/` directory
- [ ] Migrate remaining tests to appropriate feature files
- [ ] Remove `proceedToEncounter()` calls, use `queueRooms()` instead

### Phase 4: Add Integration Tests
- [ ] Create `specs/integration/full-playthrough.spec.ts`
- [ ] Implement adaptive playthrough logic
- [ ] Verify 3 consecutive runs complete

### Phase 5: Cleanup
- [ ] Remove old spec files
- [ ] Remove `proceedToEncounter()` helper
- [ ] Update CLAUDE.md test documentation

---

## Files to Modify

### Backend
| File | Changes |
|------|---------|
| `src/game/rooms.js` | Add `queueRooms()`, `getNextRoom()` with queue support |
| `server.js` or routes | Add `POST /api/game/debug-queue-rooms` endpoint |

### Tests
| File | Changes |
|------|---------|
| `playwright.config.ts` | Add project dependencies for fail-fast |
| `fixtures/game-helpers.ts` | Add `queueRooms()`, `detectRoomType()`, `playUntilRunEnds()` |
| `specs/rooms/*.spec.ts` | New room-specific test files |
| `specs/features/*.spec.ts` | Migrated feature tests |
| `specs/integration/*.spec.ts` | New adaptive playthrough tests |

---

## Success Criteria

- [ ] All room tests pass deterministically (10 consecutive runs, 0 failures)
- [ ] All feature tests pass deterministically
- [ ] Integration test completes 3 full runs
- [ ] Total test time under 3 minutes
- [ ] No `proceedToEncounter()` calls remain
- [ ] Adding a new room type = add one new test file

---

## Risks

1. **Room detection fragility** - `detectRoomType()` relies on UI selectors. Mitigation: Use data attributes (`data-room-type`) for reliable detection.

2. **Adaptive test flakiness** - Integration tests might still be flaky if room completion logic has bugs. Mitigation: Phase 1 tests catch room bugs first.

3. **Queue endpoint in production** - Debug endpoint shouldn't be exposed. Mitigation: Only register route when `NODE_ENV=test`.
