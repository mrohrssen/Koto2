# Balanced Room Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `encounter`/`support` room roll with lazy weighted room finalization that preserves roguelike variance and only offers campfire when the current ingredient bag can cook a real authored recipe with at least 2 ingredients.

**Architecture:** Area generation keeps fixed `npcBattle` and `boss` milestones but creates unresolved `randomRoom` slots for all other rooms. When the player enters a random slot, `src/game/rooms.js` finalizes it into a concrete room using current run state, weighted pacing modifiers, and recipe eligibility from `src/game/services/cooking-service.js`. Existing `support` resolution remains only for saved-run compatibility.

**Tech Stack:** Node.js ES modules, `node:test`, Express game services, existing Koto room generation and cooking service modules.

---

## File Structure

- Modify `src/game/services/cooking-service.js`: add `hasCookableRecipe()` that reuses `getCookableRecipeHints()` and filters to real recipes with `totalQuantity >= 2`.
- Modify `src/game/rooms.js`: add `ROOM_TYPES.randomRoom`, weighted picker helpers, campfire eligibility filtering, and `finalizeRandomRoom()`.
- Modify `src/game/services/exploration-service.js`: finalize random rooms when entering the first room and when proceeding to later rooms.
- Modify `tests/unit/game/cooking-service.test.js`: cover the real recipe eligibility helper and fallback exclusion.
- Modify `tests/unit/game/rooms-koto2.test.js`: cover picker helpers, unresolved random slots, lazy finalization, milestones, and spacing.
- Modify `tests/unit/game/cooking-rooms.test.js`: keep saved `support` compatibility tests but remove assumptions that new generation creates `support`.
- Modify `tests/unit/game/exploration-service-room-heal.test.js`: cover first-room finalization through the real exploration service.

No frontend or campfire rest route changes are part of this plan.

---

### Task 1: Add Real Recipe Eligibility Helper

**Files:**
- Modify: `src/game/services/cooking-service.js`
- Modify: `tests/unit/game/cooking-service.test.js`
- Test: `tests/unit/game/cooking-service.test.js`

- [ ] **Step 1: Add failing tests for recipe eligibility**

In `tests/unit/game/cooking-service.test.js`, extend the existing import from `../../../src/game/services/cooking-service.js` to include `hasCookableRecipe`.

Add these tests inside the existing cooking-service `describe(...)` block:

```js
  it('detects cookable authored recipes with at least two ingredients', () => {
    const recipes = [
      {
        id: 'single-water',
        rarity: 'common',
        ingredients: [{ id: 'mizu', quantity: 1 }]
      },
      {
        id: 'miso-soup',
        rarity: 'common',
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }]
      }
    ];

    assert.equal(hasCookableRecipe({ mizu: 1 }, { recipes, minTotalQuantity: 2 }), false);
    assert.equal(hasCookableRecipe({ mizu: 1, miso: 1 }, { recipes, minTotalQuantity: 2 }), true);
  });

  it('does not treat fallback single-ingredient cooking as a cookable recipe', () => {
    assert.equal(hasCookableRecipe({ mizu: 1 }, { recipes: [], minTotalQuantity: 2 }), false);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails for missing export**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/cooking-service.test.js
```

Expected: FAIL with an import/export error for `hasCookableRecipe`.

- [ ] **Step 3: Implement `hasCookableRecipe()`**

In `src/game/services/cooking-service.js`, add this export after `getCookableRecipeHints()`:

```js
export function hasCookableRecipe(bag = {}, { recipes = COOKING_RECIPES, minTotalQuantity = 2 } = {}) {
  return getCookableRecipeHints(bag, recipes)
    .some(recipe => recipe.totalQuantity >= minTotalQuantity);
}
```

- [ ] **Step 4: Run the focused test and syntax check**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/cooking-service.test.js
node --check src/game/services/cooking-service.js
```

Expected: PASS for the test and no syntax errors.

- [ ] **Step 5: Commit the eligibility helper**

```bash
/usr/bin/git add src/game/services/cooking-service.js tests/unit/game/cooking-service.test.js
/usr/bin/git commit -m "feat: add cookable recipe eligibility helper"
```

---

### Task 2: Add Weighted Picker Helpers With Campfire Eligibility

**Files:**
- Modify: `src/game/rooms.js`
- Modify: `tests/unit/game/rooms-koto2.test.js`
- Test: `tests/unit/game/rooms-koto2.test.js`

- [ ] **Step 1: Extend room test imports**

Replace the import at the top of `tests/unit/game/rooms-koto2.test.js` with:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRoomEligibilityFilters,
  applyRoomPacingModifiers,
  finalizeRandomRoom,
  generateAreaRooms,
  getAreaById,
  getAreaSelectionOptions,
  getRandomRoomBaseWeights,
  pickWeightedRoomType,
  ROOM_TYPES
} from '../../../src/game/rooms.js';
```

- [ ] **Step 2: Add picker tests before `describe('Koto2 area room generation', ...)`**

Insert this block after `assertNoDisabledRoomTypes()`:

```js
describe('weighted room picker helpers', () => {
  it('defines base weights for every random room candidate', () => {
    assert.deepEqual(getRandomRoomBaseWeights(), {
      encounter: 45,
      friendlyNpc: 18,
      whackAMole: 14,
      shrine: 10,
      campfire: 13
    });
  });

  it('selects room types from the weighted range', () => {
    const weights = getRandomRoomBaseWeights();

    assert.equal(pickWeightedRoomType(weights, () => 0.44), ROOM_TYPES.encounter);
    assert.equal(pickWeightedRoomType(weights, () => 0.46), ROOM_TYPES.friendlyNpc);
    assert.equal(pickWeightedRoomType(weights, () => 0.65), ROOM_TYPES.whackAMole);
    assert.equal(pickWeightedRoomType(weights, () => 0.80), ROOM_TYPES.shrine);
    assert.equal(pickWeightedRoomType(weights, () => 0.95), ROOM_TYPES.campfire);
  });

  it('removes campfire from the roll when no real two-plus ingredient recipe is cookable', () => {
    const weights = applyRoomEligibilityFilters(getRandomRoomBaseWeights(), {
      cooking: { ingredients: { mizu: 1 } }
    });

    assert.equal(weights.campfire, 0);
    assert.equal(weights.shrine, 10);
    assert.equal(weights.whackAMole, 14);
  });

  it('keeps campfire eligible when a real two-plus ingredient recipe is cookable', () => {
    const weights = applyRoomEligibilityFilters(getRandomRoomBaseWeights(), {
      cooking: { ingredients: { mizu: 1, miso: 1 } }
    });

    assert.equal(weights.campfire, 13);
  });

  it('applies support cooldowns without blocking encounters', () => {
    const base = getRandomRoomBaseWeights();
    const afterShrine = applyRoomPacingModifiers(base, [
      { type: ROOM_TYPES.shrine, random: true }
    ]);
    const shrineTwoRandomSlotsAgo = applyRoomPacingModifiers(base, [
      { type: ROOM_TYPES.shrine, random: true },
      { type: ROOM_TYPES.encounter, random: true }
    ]);

    assert.equal(afterShrine.shrine, 0);
    assert.equal(shrineTwoRandomSlotsAgo.shrine, 3.5);
    assert.equal(afterShrine.encounter, 45);
  });

  it('boosts encounter after a support-room streak', () => {
    const weights = applyRoomPacingModifiers(getRandomRoomBaseWeights(), [
      { type: ROOM_TYPES.friendlyNpc, random: true },
      { type: ROOM_TYPES.shrine, random: true },
      { type: ROOM_TYPES.campfire, random: true }
    ]);

    assert.equal(weights.encounter, 112.5);
  });

  it('boosts support rooms after a combat-like streak that includes npcBattle', () => {
    const weights = applyRoomPacingModifiers(getRandomRoomBaseWeights(), [
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.npcBattle, random: false },
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.encounter, random: true }
    ]);

    assert.equal(weights.friendlyNpc, 31.5);
    assert.equal(weights.whackAMole, 24.5);
    assert.equal(weights.shrine, 17.5);
    assert.equal(weights.campfire, 22.75);
  });

  it('pity-boosts long-unseen room types without forcing fixed counts', () => {
    const afterSix = applyRoomPacingModifiers(getRandomRoomBaseWeights(), [
      { type: ROOM_TYPES.friendlyNpc, random: true },
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.whackAMole, random: true },
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.campfire, random: true },
      { type: ROOM_TYPES.encounter, random: true }
    ]);

    assert.equal(afterSix.shrine, 15);
  });
});
```

- [ ] **Step 3: Run the focused test and verify it fails for missing exports**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/rooms-koto2.test.js
```

Expected: FAIL with an ES module import error for the new helper exports.

- [ ] **Step 4: Add imports and room type**

In `src/game/rooms.js`, add this import near the top:

```js
import { hasCookableRecipe } from './services/cooking-service.js';
```

Add `randomRoom` to `ROOM_TYPES`:

```js
  randomRoom: 'randomRoom',
```

Add a `createRoom()` case:

```js
    case ROOM_TYPES.randomRoom:
      room.randomRoom = { resolvedType: null };
      break;
```

- [ ] **Step 5: Add picker helpers**

In `src/game/rooms.js`, insert this block after `STARTING_MEADOW_TUTORIAL_SEQUENCE`:

```js
const RANDOM_ROOM_BASE_WEIGHTS = Object.freeze({
  [ROOM_TYPES.encounter]: 45,
  [ROOM_TYPES.friendlyNpc]: 18,
  [ROOM_TYPES.whackAMole]: 14,
  [ROOM_TYPES.shrine]: 10,
  [ROOM_TYPES.campfire]: 13
});

const RANDOM_ROOM_TYPES = Object.freeze(Object.keys(RANDOM_ROOM_BASE_WEIGHTS));
const SUPPORT_RANDOM_ROOM_TYPES = new Set([
  ROOM_TYPES.friendlyNpc,
  ROOM_TYPES.whackAMole,
  ROOM_TYPES.shrine,
  ROOM_TYPES.campfire
]);
const COMBAT_LIKE_ROOM_TYPES = new Set([
  ROOM_TYPES.encounter,
  ROOM_TYPES.npcBattle
]);

export function getRandomRoomBaseWeights() {
  return { ...RANDOM_ROOM_BASE_WEIGHTS };
}

function isRandomRoomType(type) {
  return RANDOM_ROOM_TYPES.includes(type);
}

function normalizeGenerationHistory(history = []) {
  return history.map(entry => {
    if (typeof entry === 'string') {
      return { type: entry, random: isRandomRoomType(entry) };
    }
    return {
      type: entry?.type,
      random: entry?.random === true
    };
  });
}

export function getRoomGenerationHistory(rooms = [], beforeRoomNumber = Infinity) {
  return rooms
    .filter(room => room?.roomNumber < beforeRoomNumber)
    .filter(room => room?.type !== ROOM_TYPES.randomRoom)
    .map(room => ({
      type: room?.type,
      random: room?.randomRoomResolved === true
    }));
}

function randomSlotsSinceSeen(randomHistory, type) {
  let slots = 0;
  for (let i = randomHistory.length - 1; i >= 0; i--) {
    if (randomHistory[i].type === type) return slots;
    slots++;
  }
  return slots;
}

function applyPityMultiplier(weight, slotsSinceSeen) {
  if (slotsSinceSeen >= 9) return weight * 2.25;
  if (slotsSinceSeen >= 6) return weight * 1.5;
  return weight;
}

export function applyRoomPacingModifiers(baseWeights, history = []) {
  const weights = { ...baseWeights };
  const normalizedHistory = normalizeGenerationHistory(history);
  const randomHistory = normalizedHistory.filter(entry => entry.random && isRandomRoomType(entry.type));

  const previousRandomType = randomHistory[randomHistory.length - 1]?.type || null;
  const twoRandomSlotsAgoType = randomHistory[randomHistory.length - 2]?.type || null;

  for (const type of SUPPORT_RANDOM_ROOM_TYPES) {
    if (previousRandomType === type) weights[type] = 0;
    else if (twoRandomSlotsAgoType === type) weights[type] *= 0.35;
  }

  const lastThreeRandomTypes = randomHistory.slice(-3).map(entry => entry.type);
  if (
    lastThreeRandomTypes.length === 3 &&
    lastThreeRandomTypes.every(type => SUPPORT_RANDOM_ROOM_TYPES.has(type))
  ) {
    weights[ROOM_TYPES.encounter] *= 2.5;
  }

  const lastFourGeneratedTypes = normalizedHistory.slice(-4).map(entry => entry.type);
  if (
    lastFourGeneratedTypes.length === 4 &&
    lastFourGeneratedTypes.every(type => COMBAT_LIKE_ROOM_TYPES.has(type))
  ) {
    for (const type of SUPPORT_RANDOM_ROOM_TYPES) {
      weights[type] *= 1.75;
    }
  }

  for (const type of RANDOM_ROOM_TYPES) {
    const slotsSinceSeen = randomSlotsSinceSeen(randomHistory, type);
    weights[type] = applyPityMultiplier(weights[type], slotsSinceSeen);
  }

  return weights;
}

export function applyRoomEligibilityFilters(weights, run) {
  const filtered = { ...weights };
  if (!hasCookableRecipe(run?.cooking?.ingredients || {}, { minTotalQuantity: 2 })) {
    filtered[ROOM_TYPES.campfire] = 0;
  }
  return filtered;
}

export function pickWeightedRoomType(weights, rng = Math.random) {
  const entries = RANDOM_ROOM_TYPES
    .map(type => [type, Math.max(0, weights[type] || 0)])
    .filter(([, weight]) => weight > 0);

  if (entries.length === 0) return ROOM_TYPES.encounter;

  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * totalWeight;

  for (const [type, weight] of entries) {
    if (roll < weight) return type;
    roll -= weight;
  }

  return entries[entries.length - 1][0];
}

function pickRandomRoomType(run, room, rng = Math.random) {
  const history = getRoomGenerationHistory(run?.rooms || [], room?.roomNumber || Infinity);
  const paced = applyRoomPacingModifiers(getRandomRoomBaseWeights(), history);
  const eligible = applyRoomEligibilityFilters(paced, run);
  return pickWeightedRoomType(eligible, rng);
}
```

- [ ] **Step 6: Run picker tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/rooms-koto2.test.js
```

Expected: the helper tests PASS. Existing area generation tests may still fail until lazy generation is implemented.

- [ ] **Step 7: Commit picker helpers**

```bash
/usr/bin/git add src/game/rooms.js tests/unit/game/rooms-koto2.test.js
/usr/bin/git commit -m "feat: add eligible weighted room picker"
```

---

### Task 3: Generate Unresolved Random Slots And Finalize Lazily

**Files:**
- Modify: `src/game/rooms.js`
- Modify: `tests/unit/game/rooms-koto2.test.js`
- Modify: `tests/unit/game/cooking-rooms.test.js`
- Test: `tests/unit/game/rooms-koto2.test.js`
- Test: `tests/unit/game/cooking-rooms.test.js`

- [ ] **Step 1: Update allowed generated room types**

In `tests/unit/game/rooms-koto2.test.js`, replace `assertOnlyEnabledRoomTypes()` with:

```js
function assertOnlyEnabledRoomTypes(rooms, fixedIndices) {
  const allowedTypes = new Set(['randomRoom']);
  const otherRooms = rooms.filter((_, i) => !fixedIndices.has(i));
  for (const room of otherRooms) {
    assert.ok(
      allowedTypes.has(room.type),
      `Unexpected room type: ${room.type} at room ${room.roomNumber}`
    );
  }
}
```

- [ ] **Step 2: Add lazy generation tests**

Inside `describe('Wild Plains', ...)`, add:

```js
    it('creates unresolved random slots instead of support placeholders', () => {
      const rooms = generateAreaRooms('wild-plains');

      assert.equal(rooms.some(room => room.type === ROOM_TYPES.support), false);
      assert.equal(rooms[0].type, ROOM_TYPES.randomRoom);
      assert.equal(rooms[1].type, ROOM_TYPES.randomRoom);
      assert.equal(rooms[5].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[29].type, ROOM_TYPES.boss);
    });

    it('finalizes random slots using current cooking eligibility', () => {
      const rooms = generateAreaRooms('wild-plains');
      const room = rooms[0];
      const runWithoutRecipe = { rooms, cooking: { ingredients: { mizu: 1 } } };
      const finalizedWithoutRecipe = finalizeRandomRoom(room, runWithoutRecipe, () => 0.99);

      assert.strictEqual(finalizedWithoutRecipe, room);
      assert.notEqual(room.type, ROOM_TYPES.campfire);

      const eligibleRooms = generateAreaRooms('wild-plains');
      const eligibleRoom = eligibleRooms[0];
      const runWithRecipe = { rooms: eligibleRooms, cooking: { ingredients: { mizu: 1, miso: 1 } } };
      finalizeRandomRoom(eligibleRoom, runWithRecipe, () => 0.99);

      assert.equal(eligibleRoom.type, ROOM_TYPES.campfire);
      assert.equal(eligibleRoom.randomRoomResolved, true);
    });
```

- [ ] **Step 3: Run room tests and verify lazy tests fail**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/rooms-koto2.test.js
```

Expected: FAIL because `generateAreaRooms()` still creates `support` and `finalizeRandomRoom()` does not exist yet.

- [ ] **Step 4: Update `generateAreaRooms()`**

In `src/game/rooms.js`, update the JSDoc line for remaining slots to:

```js
 * Boss is always the final room. Remaining slots are unresolved random slots finalized on entry.
```

Replace the random branch inside the non-tutorial generation loop with:

```js
    } else {
      type = ROOM_TYPES.randomRoom;
    }
```

Do not add a seventh RNG argument to `generateAreaRooms()`. Randomness now happens at finalization time.

- [ ] **Step 5: Add `finalizeRandomRoom()`**

In `src/game/rooms.js`, add this export after `resolveSupportRoom()`:

```js
export function finalizeRandomRoom(room, run, rng = Math.random) {
  if (!room || room.type !== ROOM_TYPES.randomRoom) return room;

  const resolvedType = room.randomRoom?.resolvedType || pickRandomRoomType(run, room, rng);
  const resolved = createRoom(resolvedType, room.areaId, room.roomNumber, room.totalRooms);
  resolved.id = room.id;
  resolved.explored = room.explored;
  resolved.interacted = room.interacted;
  resolved.randomRoomResolved = true;
  if (room.subArea) resolved.subArea = room.subArea;

  Object.keys(room).forEach(key => delete room[key]);
  Object.assign(room, resolved);
  return room;
}
```

- [ ] **Step 6: Update cooking room compatibility tests**

In `tests/unit/game/cooking-rooms.test.js`, update the import to include `generateAreaRooms`:

```js
import {
  createRoom,
  generateAreaRooms,
  getRoomActions,
  resolveSupportRoom,
  resolveSupportRoomType,
  ROOM_TYPES,
} from '../../../src/game/rooms.js';
```

Replace the `new area generation does not create support rooms that need delayed resolution` test, or add it if missing:

```js
  it('new area generation creates random slots instead of saved-run support rooms', () => {
    const rooms = generateAreaRooms('wild-plains');

    assert.equal(rooms.some(room => room.type === ROOM_TYPES.support), false);
    assert.ok(rooms.some(room => room.type === ROOM_TYPES.randomRoom));
  });
```

Keep the old `resolveSupportRoom()` tests so existing saved support rooms remain compatible.

- [ ] **Step 7: Run focused room tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/rooms-koto2.test.js tests/unit/game/cooking-rooms.test.js
node --check src/game/rooms.js
```

Expected: PASS and no syntax errors.

- [ ] **Step 8: Commit lazy room slots**

```bash
/usr/bin/git add src/game/rooms.js tests/unit/game/rooms-koto2.test.js tests/unit/game/cooking-rooms.test.js
/usr/bin/git commit -m "feat: lazily finalize random room slots"
```

---

### Task 4: Wire Lazy Finalization Into Room Entry

**Files:**
- Modify: `src/game/services/exploration-service.js`
- Modify: `tests/unit/game/exploration-service-room-heal.test.js`
- Test: `tests/unit/game/exploration-service-room-heal.test.js`

- [ ] **Step 1: Import `finalizeRandomRoom()`**

In `src/game/services/exploration-service.js`, update the `../rooms.js` import:

```js
  popTestRoomType,
  resolveSupportRoom,
  finalizeRandomRoom
} from '../rooms.js';
```

- [ ] **Step 2: Finalize the first room on area entry**

In `enterArea()`, immediately after:

```js
    this.gm.run.rooms = generateAreaRooms(areaId, undefined, undefined, undefined, undefined, tutorialMode);
```

add:

```js
    if (this.gm.run.rooms[0]) {
      finalizeRandomRoom(this.gm.run.rooms[0], this.gm.run);
    }
```

This must happen before `firstRoom` is read for background selection and before the first state emit.

- [ ] **Step 3: Finalize later rooms on proceed**

In `proceedToNextRoom()`, after the test queue and force-room replacement blocks, replace:

```js
    let room = this.gm.run.rooms[this.gm.run.currentRoom]; // re-read after possible replacement
    resolveSupportRoom(room, this.gm.run);
    room = this.gm.run.rooms[this.gm.run.currentRoom];
```

with:

```js
    let room = this.gm.run.rooms[this.gm.run.currentRoom]; // re-read after possible replacement
    resolveSupportRoom(room, this.gm.run);
    finalizeRandomRoom(room, this.gm.run);
    room = this.gm.run.rooms[this.gm.run.currentRoom];
```

Keep `resolveSupportRoom()` first so old saved support rooms still resolve.

- [ ] **Step 4: Add an exploration-service test for first-room finalization**

Add this test to `tests/unit/game/exploration-service-room-heal.test.js`:

```js
it('finalizes the first random room before emitting area entry state', () => {
  const gm = getManager('lazy-room-test-user');
  gm.player = createNewPlayer();
  gm.initMeta();
  gm.run = createNewRun(gm.player);
  gm.run.currentArea = getAreaById('wild-plains');
  gm.run.creatureParty.active = [];

  gm.explorationService.enterArea();

  assert.notEqual(gm.run.rooms[0].type, ROOM_TYPES.randomRoom);
});
```

If `getManager`, `createNewPlayer`, `createNewRun`, `getAreaById`, or `ROOM_TYPES` are not imported in that file, add them from the same modules used by nearby tests.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/rooms-koto2.test.js tests/unit/game/cooking-rooms.test.js tests/unit/game/exploration-service-room-heal.test.js
node --check src/game/services/exploration-service.js
```

Expected: PASS and no syntax errors.

- [ ] **Step 6: Commit room entry finalization**

```bash
/usr/bin/git add src/game/services/exploration-service.js tests/unit/game/exploration-service-room-heal.test.js
/usr/bin/git commit -m "feat: finalize random rooms on entry"
```

---

### Task 5: Final Verification And Review

**Files:**
- Verify: `src/game/services/cooking-service.js`
- Verify: `src/game/rooms.js`
- Verify: `src/game/services/exploration-service.js`
- Verify: `tests/unit/game/cooking-service.test.js`
- Verify: `tests/unit/game/rooms-koto2.test.js`
- Verify: `tests/unit/game/cooking-rooms.test.js`
- Verify: `tests/unit/game/exploration-service-room-heal.test.js`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/game/cooking-service.test.js tests/unit/game/rooms-koto2.test.js tests/unit/game/cooking-rooms.test.js tests/unit/game/exploration-service-room-heal.test.js
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check src/game/services/cooking-service.js && node --check src/game/rooms.js && node --check src/game/services/exploration-service.js
```

Expected: all commands exit with code 0 and print no syntax errors.

- [ ] **Step 3: Run unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run full merge-gate tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
/usr/bin/git status --short
/usr/bin/git diff --stat HEAD
/usr/bin/git diff HEAD -- src/game/services/cooking-service.js src/game/rooms.js src/game/services/exploration-service.js tests/unit/game/cooking-service.test.js tests/unit/game/rooms-koto2.test.js tests/unit/game/cooking-rooms.test.js tests/unit/game/exploration-service-room-heal.test.js
```

Expected: diff only contains lazy room finalization, recipe eligibility filtering, and related tests.

- [ ] **Step 6: Request code review**

Use the code-reviewer subagent with this prompt:

```text
Review the balanced room generation implementation against docs/superpowers/specs/2026-05-10-balanced-room-generation-design.md and docs/superpowers/plans/2026-05-10-balanced-room-generation.md. Focus on lazy room finalization, campfire recipe eligibility, saved-run support compatibility, milestone preservation, and test coverage. Return findings ordered by severity with file references.
```

- [ ] **Step 7: Address review findings or document why no code change is needed**

For each review finding:

1. Reproduce or inspect the referenced code.
2. If valid, add or adjust a focused test first.
3. Implement the smallest fix.
4. Run the focused test.
5. Re-run `npm run test:unit`.

- [ ] **Step 8: Commit final review fixes**

If review fixes changed files:

```bash
/usr/bin/git add src/game/services/cooking-service.js src/game/rooms.js src/game/services/exploration-service.js tests/unit/game/cooking-service.test.js tests/unit/game/rooms-koto2.test.js tests/unit/game/cooking-rooms.test.js tests/unit/game/exploration-service-room-heal.test.js
/usr/bin/git commit -m "fix: address lazy room generation review"
```

If review found no issues, do not create an empty commit.
