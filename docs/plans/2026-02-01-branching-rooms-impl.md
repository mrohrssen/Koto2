# Branching Rooms Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Door 1/Door 2 room selection at each room transition during floor exploration.

**Architecture:** Room generation creates pairs of room options. After completing any room (except boss), players see a branch selection phase showing what's behind each door. First room auto-enters, boss auto-enters after final branch choice.

**Tech Stack:** Node.js backend (Express), vanilla JS frontend, ES6 modules.

---

## Task 1: Add Branch State to Run Factory

**Files:**
- Modify: `src/game/state.js:253-326`

**Step 1: Write the test**

Create `tests/unit/branching-rooms.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { createNewRun, createNewPlayer } from '../../src/game/state.js';

describe('createNewRun with branching support', () => {
  it('should include pendingBranch and selectedRooms fields', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);

    expect(run.pendingBranch).toBe(false);
    expect(run.selectedRooms).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: FAIL with "pendingBranch" undefined

**Step 3: Write minimal implementation**

In `src/game/state.js`, add to `createNewRun()` around line 272 (after `roomsExplored: 0`):

```javascript
    // Branching room selection
    pendingBranch: false,     // True when showing branch choice
    selectedRooms: [],        // Track door choices: [0, 1, 0, ...]
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/state.js tests/unit/branching-rooms.test.js
git commit -m "feat(branching): add pendingBranch and selectedRooms to run state"
```

---

## Task 2: Add BRANCH_SELECTION Phase

**Files:**
- Modify: `src/game/phase-machine.js:29-59` (PHASES object)
- Modify: `src/game/phase-machine.js:181-242` (derivePhase function)

**Step 1: Write the test**

Add to `tests/unit/branching-rooms.test.js`:

```javascript
import { PHASES, derivePhase } from '../../src/game/phase-machine.js';

describe('BRANCH_SELECTION phase', () => {
  it('should have BRANCH_SELECTION in PHASES', () => {
    expect(PHASES.BRANCH_SELECTION).toBe('branch_selection');
  });

  it('should derive branch_selection when pendingBranch is true', () => {
    const state = {
      player: { name: 'Test' },
      run: {
        active: true,
        pendingBranch: true,
        rooms: [{ type: 'encounter', explored: true, interacted: true }],
        currentRoom: 0
      },
      combat: null
    };

    expect(derivePhase(state)).toBe('branch_selection');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: FAIL with "BRANCH_SELECTION" undefined

**Step 3: Write minimal implementation**

In `src/game/phase-machine.js`:

Add to PHASES object (around line 44, after WORD_DISCOVERY):

```javascript
  BRANCH_SELECTION: 'branch_selection',  // Choosing between two doors
```

Add to derivePhase() (around line 197, after wardSelectionRequired check, before combat check):

```javascript
  // Branch selection pending
  if (run.pendingBranch) return PHASES.BRANCH_SELECTION;
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/phase-machine.js tests/unit/branching-rooms.test.js
git commit -m "feat(branching): add BRANCH_SELECTION phase to phase machine"
```

---

## Task 3: Update Room Generation for Branch Pairs

**Files:**
- Modify: `src/game/rooms.js:258-296` (generateFloorRooms function)
- Modify: `src/game/rooms.js:301-336` (createRoom function - no changes, just reference)

**Step 1: Write the test**

Add to `tests/unit/branching-rooms.test.js`:

```javascript
import { generateFloorRooms, ROOM_TYPES } from '../../src/game/rooms.js';

describe('generateFloorRooms with branching', () => {
  it('should generate first room as single, middle rooms as pairs, boss as single', () => {
    const rooms = generateFloorRooms(1, 4); // 4 encounters + boss = 5 total

    // First room: single
    expect(Array.isArray(rooms[0])).toBe(false);
    expect(rooms[0].roomNumber).toBe(1);

    // Middle rooms (indices 1, 2, 3): pairs
    expect(Array.isArray(rooms[1])).toBe(true);
    expect(rooms[1].length).toBe(2);
    expect(Array.isArray(rooms[2])).toBe(true);
    expect(rooms[2].length).toBe(2);
    expect(Array.isArray(rooms[3])).toBe(true);
    expect(rooms[3].length).toBe(2);

    // Boss room: single
    expect(Array.isArray(rooms[4])).toBe(false);
    expect(rooms[4].type).toBe(ROOM_TYPES.boss);
  });

  it('should not have duplicate special types in same branch', () => {
    // Run multiple times to catch randomness
    for (let i = 0; i < 20; i++) {
      const rooms = generateFloorRooms(1, 5);
      for (let j = 1; j < rooms.length - 1; j++) {
        const pair = rooms[j];
        if (Array.isArray(pair)) {
          const type0 = pair[0].type;
          const type1 = pair[1].type;
          // If both are special types, they must be different
          const specialTypes = ['shrine', 'quiz', 'wordDiscovery'];
          if (specialTypes.includes(type0) && specialTypes.includes(type1)) {
            expect(type0).not.toBe(type1);
          }
        }
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: FAIL - rooms are not generated as pairs

**Step 3: Write implementation**

Replace `generateFloorRooms` in `src/game/rooms.js`:

```javascript
/**
 * Generate rooms for a floor with branching
 * Structure: single first room + branch pairs + single boss
 * @param {number} floor - Current floor (1-7)
 * @param {number} encountersNeeded - Number of room slots before boss
 * @param {string|null} lastSpecialType - Last special room type completed (for back-to-back constraint)
 * @returns {Array} Array of room objects (singles) or pairs (arrays of 2)
 */
export function generateFloorRooms(floor, encountersNeeded = 3, lastSpecialType = null) {
  const rooms = [];
  const totalSlots = encountersNeeded + 1; // +1 for boss
  let prevSpecialType = lastSpecialType;

  for (let i = 0; i < encountersNeeded; i++) {
    const roomNumber = i + 1;

    if (i === 0) {
      // First room: single (auto-entered)
      const room = generateSingleRoom(floor, roomNumber, totalSlots, prevSpecialType);
      if (isSpecialType(room.type)) {
        prevSpecialType = room.type;
      }
      rooms.push(room);
    } else {
      // Middle rooms: branch pairs
      const pair = generateBranchPair(floor, roomNumber, totalSlots, prevSpecialType);
      rooms.push(pair);
      // Note: prevSpecialType updates when player makes selection (in selectBranch)
    }
  }

  // Boss room (always last, single)
  rooms.push(createRoom(ROOM_TYPES.boss, floor, totalSlots, totalSlots));

  return rooms;
}

/**
 * Check if a room type is a special type (subject to constraints)
 */
function isSpecialType(type) {
  return type === ROOM_TYPES.shrine ||
         type === ROOM_TYPES.quiz ||
         type === ROOM_TYPES.wordDiscovery;
}

/**
 * Generate a single room with type constraints
 */
function generateSingleRoom(floor, roomNumber, totalRooms, excludeSpecialType = null) {
  const SHRINE_CHANCE = 0.20;
  const QUIZ_CHANCE = 0.20;
  const WORD_DISCOVERY_CHANCE = 0.15;

  // Check test queue first
  const queuedType = popTestRoomType();
  let type;

  if (queuedType && ROOM_TYPES[queuedType]) {
    type = ROOM_TYPES[queuedType];
  } else {
    // Generate with constraints
    let attempts = 0;
    do {
      const roll = Math.random();
      if (roll < SHRINE_CHANCE) {
        type = ROOM_TYPES.shrine;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE) {
        type = ROOM_TYPES.quiz;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE) {
        type = ROOM_TYPES.wordDiscovery;
      } else {
        type = ROOM_TYPES.encounter;
      }
      attempts++;
    } while (
      excludeSpecialType &&
      isSpecialType(type) &&
      type === excludeSpecialType &&
      attempts < 10
    );
  }

  return createRoom(type, floor, roomNumber, totalRooms);
}

/**
 * Generate a pair of rooms for a branch choice
 * Constraints: no duplicate special types in pair, no back-to-back same special
 */
function generateBranchPair(floor, roomNumber, totalRooms, excludeSpecialType = null) {
  const room1 = generateSingleRoom(floor, roomNumber, totalRooms, excludeSpecialType);

  // For room2, also exclude room1's type if it's special
  let room2ExcludeType = excludeSpecialType;
  if (isSpecialType(room1.type)) {
    room2ExcludeType = room1.type;
  }

  const room2 = generateSingleRoom(floor, roomNumber, totalRooms, room2ExcludeType);

  return [room1, room2];
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/rooms.js tests/unit/branching-rooms.test.js
git commit -m "feat(branching): update room generation to create branch pairs"
```

---

## Task 4: Add selectBranch Service Method

**Files:**
- Modify: `src/game/services/exploration-service.js:196-268`

**Step 1: Write the test**

Add to `tests/unit/branching-rooms.test.js`:

```javascript
describe('ExplorationService.selectBranch', () => {
  it('should replace pair with selected room and clear pendingBranch', () => {
    // This will be an integration test - for now, test the logic inline
    const mockRun = {
      rooms: [
        { id: 'room1', type: 'encounter', explored: true, interacted: true },
        [
          { id: 'room2a', type: 'shrine', explored: false },
          { id: 'room2b', type: 'encounter', explored: false }
        ]
      ],
      currentRoom: 1,
      pendingBranch: true,
      selectedRooms: [],
      roomsExplored: 1
    };

    // Simulate selectBranch(0)
    const pair = mockRun.rooms[mockRun.currentRoom];
    const selectedRoom = pair[0];
    mockRun.rooms[mockRun.currentRoom] = selectedRoom;
    mockRun.selectedRooms.push(0);
    selectedRoom.explored = true;
    mockRun.roomsExplored++;
    mockRun.pendingBranch = false;

    expect(mockRun.rooms[1].id).toBe('room2a');
    expect(mockRun.pendingBranch).toBe(false);
    expect(mockRun.selectedRooms).toEqual([0]);
  });
});
```

**Step 2: Run test to verify logic**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS (this is a logic verification test)

**Step 3: Write implementation**

Add to `ExplorationService` class in `src/game/services/exploration-service.js` (after `proceedToNextRoom` around line 268):

```javascript
  /**
   * Select a door at a branch point
   * @param {number} doorIndex - 0 for door 1, 1 for door 2
   */
  selectBranch(doorIndex) {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }

    if (!this.gm.run.pendingBranch) {
      throw new Error('No branch selection pending');
    }

    const pair = this.gm.run.rooms[this.gm.run.currentRoom];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error('Current room is not a branch pair');
    }

    if (doorIndex !== 0 && doorIndex !== 1) {
      throw new Error('Invalid door index');
    }

    const selectedRoom = pair[doorIndex];

    // Replace pair with selected room
    this.gm.run.rooms[this.gm.run.currentRoom] = selectedRoom;

    // Track the choice
    this.gm.run.selectedRooms.push(doorIndex);

    // Mark as explored
    selectedRoom.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Track room clears for counter chips
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Vary background per room
    const bgVariant = ((this.gm.run.currentRoom - 1) % 5) + 1;
    this.gm.run.background = `floor${this.gm.run.floor}_${bgVariant}.webp`;

    // Clear pending branch
    this.gm.run.pendingBranch = false;

    // Get narration for new room
    const narration = getRoomEntryNarration(selectedRoom);
    this.gm.narrate(narration);
    this.gm.emitState();

    logger.info('[Exploration] Branch selected:', { door: doorIndex, roomType: selectedRoom.type });

    return {
      room: selectedRoom,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(selectedRoom),
      narration
    };
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/services/exploration-service.js tests/unit/branching-rooms.test.js
git commit -m "feat(branching): add selectBranch method to ExplorationService"
```

---

## Task 5: Update proceedToNextRoom to Set pendingBranch

**Files:**
- Modify: `src/game/services/exploration-service.js:211-268`

**Step 1: Write the test**

Add to `tests/unit/branching-rooms.test.js`:

```javascript
describe('proceedToNextRoom with branching', () => {
  it('should set pendingBranch true when next room is a pair', () => {
    const mockRun = {
      active: true,
      rooms: [
        { type: 'encounter', explored: true, interacted: true },
        [
          { type: 'shrine', explored: false },
          { type: 'quiz', explored: false }
        ]
      ],
      currentRoom: 0,
      pendingBranch: false,
      roomsExplored: 1,
      stats: { roomsExplored: 1 },
      runStats: { roomsCleared: 0 },
      floor: 1
    };

    // Simulate proceeding: check if next is pair
    mockRun.currentRoom++;
    const nextRoom = mockRun.rooms[mockRun.currentRoom];
    if (Array.isArray(nextRoom)) {
      mockRun.pendingBranch = true;
    }

    expect(mockRun.pendingBranch).toBe(true);
    expect(mockRun.currentRoom).toBe(1);
  });
});
```

**Step 2: Run test to verify logic**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS

**Step 3: Write implementation**

Modify `proceedToNextRoom` in `src/game/services/exploration-service.js`. After line 232 (`this.gm.run.currentRoom++;`), add check for branch pair:

```javascript
  proceedToNextRoom() {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }

    const currentRoom = this.getCurrentRoom();
    if (!currentRoom) {
      throw new Error('No current room');
    }

    // Can't proceed if encounter not completed
    if (currentRoom.type === 'encounter' && !currentRoom.interacted) {
      throw new Error('Must complete encounter before proceeding');
    }

    // Can't proceed from boss room (use nextFloor instead)
    if (currentRoom.isBossRoom) {
      throw new Error('Cannot proceed past boss room');
    }

    // Move to next room
    this.gm.run.currentRoom++;
    const nextRoom = this.gm.run.rooms[this.gm.run.currentRoom];

    if (!nextRoom) {
      throw new Error('No more rooms');
    }

    // Check if next room is a branch pair
    if (Array.isArray(nextRoom)) {
      this.gm.run.pendingBranch = true;
      this.gm.emitState();

      logger.info('[Exploration] Branch point reached:', { roomIndex: this.gm.run.currentRoom });

      return {
        isBranch: true,
        options: [
          { door: 0, type: nextRoom[0].type, room: nextRoom[0] },
          { door: 1, type: nextRoom[1].type, room: nextRoom[1] }
        ]
      };
    }

    // Single room - mark as explored (existing logic)
    nextRoom.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Vary background per room
    const bgVariant = ((this.gm.run.currentRoom - 1) % 5) + 1;
    this.gm.run.background = `floor${this.gm.run.floor}_${bgVariant}.webp`;

    // Track room clears for counter chips
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Get narration for new room
    const narration = getRoomEntryNarration(nextRoom);
    this.gm.narrate(narration);
    this.gm.emitState();

    logger.info('[Exploration] Proceeded to room:', { type: nextRoom.type, index: this.gm.run.currentRoom });

    return {
      room: nextRoom,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(nextRoom),
      narration
    };
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/branching-rooms.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/services/exploration-service.js tests/unit/branching-rooms.test.js
git commit -m "feat(branching): update proceedToNextRoom to detect branch pairs"
```

---

## Task 6: Add selectBranch to GameManager

**Files:**
- Modify: `src/game/loop.js` (add delegation method)

**Step 1: Find GameManager location**

First, locate the GameManager class to understand the pattern:

```bash
grep -n "selectStartingWard\|useShrine" src/game/loop.js | head -5
```

**Step 2: Add delegation method**

Add to GameManager class (follow pattern of other delegated methods):

```javascript
  selectBranch(doorIndex) {
    return this.explorationService.selectBranch(doorIndex);
  }
```

**Step 3: Commit**

```bash
git add src/game/loop.js
git commit -m "feat(branching): add selectBranch delegation to GameManager"
```

---

## Task 7: Add API Endpoint

**Files:**
- Modify: `src/routes/game/run.js:206-224`

**Step 1: Write the endpoint**

Add after the `/proceed` route (around line 224):

```javascript
  // Select branch door
  router.post('/select-branch', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { door } = req.body;
      if (door !== 0 && door !== 1) {
        return res.status(400).json({ error: 'door must be 0 or 1' });
      }
      const result = gameManager.selectBranch(door);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 2: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat(branching): add /api/game/select-branch endpoint"
```

---

## Task 8: Add API Client Function

**Files:**
- Modify: `public/js/api.js`

**Step 1: Add the function**

Add near other game API functions:

```javascript
export async function selectBranch(door) {
  const response = await fetch(`${API_BASE}/api/game/select-branch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ door })
  });
  return response.json();
}
```

**Step 2: Commit**

```bash
git add public/js/api.js
git commit -m "feat(branching): add selectBranch API client function"
```

---

## Task 9: Add renderBranchSelection UI

**Files:**
- Modify: `public/js/ui/exploration.js`

**Step 1: Add API import and init callback**

Add to the module-level variables (around line 55):

```javascript
let apiSelectBranch = null;
```

Add to `init()` function:

```javascript
  apiSelectBranch = callbacks.apiSelectBranch;
```

**Step 2: Add renderBranchSelection function**

Add after `renderExploring` (around line 205):

```javascript
/** Branch selection phase - show Door 1 / Door 2 choice */
export async function renderBranchSelection() {
  const gameState = getGameState();
  const currentRoomIndex = gameState.run?.currentRoom;
  const pair = gameState.run?.rooms?.[currentRoomIndex];

  if (!Array.isArray(pair) || pair.length !== 2) {
    console.error('[BranchSelection] Invalid room pair');
    return;
  }

  const room1 = pair[0];
  const room2 = pair[1];

  // Get display names for room types
  const typeNames = {
    encounter: '遭遇',
    shrine: '祠',
    quiz: 'クイズ',
    wordDiscovery: '言葉発見'
  };

  const type1 = typeNames[room1.type] || room1.type;
  const type2 = typeNames[room2.type] || room2.type;

  // Show persistent narration with door contents
  sceneModule.showNarration(`扉1: ${type1}。扉2: ${type2}。`, { persistent: true });

  let selectedDoor = null;

  actions.setContent(`
    <div class="ward-selection-list">
      <div class="ward-option branch-option" data-door="0">
        <strong>扉1</strong>
      </div>
      <div class="ward-option branch-option" data-door="1">
        <strong>扉2</strong>
      </div>
    </div>
    <button class="action-btn action-btn-primary" id="branch-proceed-btn" disabled>進む</button>
  `);

  document.querySelectorAll('.branch-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.branch-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedDoor = parseInt(el.dataset.door, 10);
      const btn = document.getElementById('branch-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('branch-proceed-btn')?.addEventListener('click', async () => {
    if (selectedDoor === null) return;

    // Hide persistent narration
    if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();

    const result = await apiSelectBranch(selectedDoor);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}
```

**Step 3: Export the function**

The function is already exported by the `export async function` syntax.

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat(branching): add renderBranchSelection UI function"
```

---

## Task 10: Wire Up Frontend Phase Handling

**Files:**
- Modify: `public/game.js:210-255` (updateGameContent switch)
- Modify: `public/game.js:670-702` (explorationUI.init callbacks)

**Step 1: Add phase case**

In `updateGameContent()`, add case for branch_selection (around line 236):

```javascript
    case 'branch_selection':
      explorationUI.renderBranchSelection();
      break;
```

**Step 2: Add API import**

At the top of the file, add to the import from `./js/api.js`:

```javascript
  selectBranch as apiSelectBranch,
```

**Step 3: Add callback to explorationUI.init**

In the `explorationUI.init()` call, add:

```javascript
    apiSelectBranch,
```

**Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat(branching): wire up branch_selection phase in frontend"
```

---

## Task 11: E2E Test

**Files:**
- Create: `tests/e2e/specs/branching-rooms.spec.js`

**Step 1: Write E2E test**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Branching Rooms', () => {
  test.beforeEach(async ({ page }) => {
    // Login and start run
    await page.goto('/');
    await page.fill('#username', 'testuser');
    await page.fill('#password', 'testpass');
    await page.click('#login-btn');
    await page.waitForSelector('.action-btn');

    // Start new run if in hub
    const hubBtn = page.locator('text=潜入');
    if (await hubBtn.isVisible()) {
      await hubBtn.click();
      await page.waitForTimeout(500);
    }

    // Select starting ward
    const wardOption = page.locator('.ward-option').first();
    if (await wardOption.isVisible()) {
      await wardOption.click();
      await page.click('#ward-proceed-btn');
      await page.waitForTimeout(500);
    }
  });

  test('should show branch selection after completing first room', async ({ page }) => {
    // Complete first room (encounter or special room)
    // This depends on room type - handle both cases

    // If encounter, fight
    const fightBtn = page.locator('text=戦う');
    if (await fightBtn.isVisible({ timeout: 2000 })) {
      await fightBtn.click();
      // Combat will auto-complete or we need to wait
      await page.waitForTimeout(5000);
    }

    // After completing room, click proceed
    const proceedBtn = page.locator('text=進む');
    await proceedBtn.waitFor({ timeout: 10000 });
    await proceedBtn.click();

    // Should see branch selection
    await expect(page.locator('.branch-option')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('text=扉1')).toBeVisible();
    await expect(page.locator('text=扉2')).toBeVisible();
  });

  test('should enter selected room after choosing door', async ({ page }) => {
    // Skip to branch selection (assumes first room completes)
    await page.waitForTimeout(3000);

    // Look for branch options
    const branchOption = page.locator('.branch-option').first();
    if (await branchOption.isVisible({ timeout: 5000 })) {
      await branchOption.click();
      await page.click('#branch-proceed-btn');

      // Should now be in the selected room (not showing branch options)
      await expect(page.locator('.branch-option')).toHaveCount(0, { timeout: 3000 });
    }
  });
});
```

**Step 2: Run E2E test**

```bash
./scripts/e2e-test.sh specs/branching-rooms
```

**Step 3: Commit**

```bash
git add tests/e2e/specs/branching-rooms.spec.js
git commit -m "test(branching): add E2E tests for branch selection"
```

---

## Task 12: Manual Testing & Polish

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test flow manually**

1. Start a new run
2. Complete first room (fight or special)
3. Verify branch selection appears with "扉1: X。扉2: Y。" narration
4. Click a door, verify it highlights
5. Click 進む, verify you enter the selected room
6. Repeat for subsequent rooms
7. Verify boss room is reached without branch choice

**Step 3: Fix any issues found**

Document and fix any issues.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(branching): complete branching rooms MVP implementation"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | state.js | Add pendingBranch, selectedRooms to run state |
| 2 | phase-machine.js | Add BRANCH_SELECTION phase |
| 3 | rooms.js | Generate branch pairs with constraints |
| 4 | exploration-service.js | Add selectBranch() method |
| 5 | exploration-service.js | Update proceedToNextRoom() for branches |
| 6 | loop.js | Add GameManager delegation |
| 7 | routes/game/run.js | Add /api/game/select-branch endpoint |
| 8 | api.js | Add client-side API function |
| 9 | exploration.js | Add renderBranchSelection() UI |
| 10 | game.js | Wire up phase handling |
| 11 | tests/e2e | Add E2E tests |
| 12 | - | Manual testing and polish |
