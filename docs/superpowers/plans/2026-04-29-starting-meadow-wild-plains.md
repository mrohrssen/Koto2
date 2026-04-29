# Starting Meadow + Wild Plains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Starting Meadow a 10-room first area and add Wild Plains as the unlocked 30-room meadow that preserves today's meadow structure.

**Architecture:** Keep area progression data-driven. `data/areas.json` owns per-area `roomCount`; `src/game/rooms.js` reads that metadata and derives fixed room positions from the resulting total. Existing unlock behavior remains array-order based through `meta.levels.highestUnlocked`.

**Tech Stack:** Node.js ES modules, `node:test`, JSON area metadata.

---

## File Map

- Modify: `tests/unit/game/rooms-koto2.test.js` — express expected 10-room Starting Meadow and 30-room Wild Plains behavior.
- Modify: `tests/unit/game/tutorial-service.test.js` — keep tutorial room-generation expectations aligned with 10-room Starting Meadow.
- Modify: `data/areas.json` — add `roomCount` to Starting Meadow and insert Wild Plains after it.
- Modify: `src/game/rooms.js` — derive total room count from area metadata and place fixed rooms for 10-room and 30-room layouts.

The full `npm test` baseline currently fails on live `origin/dev` due unrelated Pixi, sprite dependency, and dialogue tokenization failures. Use focused verification for this plan, and document the pre-existing full-suite failures in the final report.

---

### Task 1: Add Failing Room Layout Tests

**Files:**
- Modify: `tests/unit/game/rooms-koto2.test.js`

- [ ] **Step 1: Replace the current 30-room-only tests with area-specific tests**

Use this structure:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateAreaRooms, getAreaSelectionOptions, ROOM_TYPES } from '../../../src/game/rooms.js';

function assertOnlyEnabledRoomTypes(rooms, fixedIndices) {
  const allowedTypes = new Set(['encounter', 'friendlyNpc', 'whackAMole']);
  const otherRooms = rooms.filter((_, i) => !fixedIndices.has(i));
  for (const room of otherRooms) {
    assert.ok(
      allowedTypes.has(room.type),
      `Unexpected room type: ${room.type} at room ${room.roomNumber}`
    );
  }
}

function assertFriendlyNpcOfferCategories(rooms) {
  const friendlyRooms = rooms.filter(r => r.type === 'friendlyNpc');
  for (const room of friendlyRooms) {
    assert.ok(
      room.friendlyNpc?.offerCategory === 'food' || room.friendlyNpc?.offerCategory === 'equipment',
      `friendlyNpc room missing valid offerCategory`
    );
  }
}

function assertNoDisabledRoomTypes(rooms) {
  const disabledTypes = ['shrine', 'quiz', 'wordDiscovery', 'dealer', 'speedReviewRoom'];
  for (const room of rooms) {
    assert.ok(!disabledTypes.includes(room.type), `Disabled room type found: ${room.type}`);
  }
}

describe('Koto2 area room generation', () => {
  it('should have npcBattle and friendlyNpc room types', () => {
    assert.ok(ROOM_TYPES.npcBattle);
    assert.ok(ROOM_TYPES.friendlyNpc);
  });

  describe('Starting Meadow', () => {
    it('generates exactly 10 rooms', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assert.equal(rooms.length, 10);
    });

    it('places npcBattle at room 6 and boss at room 10', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assert.equal(rooms[5].type, 'npcBattle');
      assert.equal(rooms[9].type, 'boss');
    });

    it('fills remaining rooms with encounter, friendlyNpc, or whackAMole', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assertOnlyEnabledRoomTypes(rooms, new Set([5, 9]));
    });

    it('does not generate disabled room types', () => {
      assertNoDisabledRoomTypes(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('friendlyNpc rooms should have offerCategory set to food or equipment', () => {
      assertFriendlyNpcOfferCategories(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('tutorial mode keeps first two tutorial rooms in the short layout', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba', undefined, undefined, undefined, undefined, true);
      assert.equal(rooms.length, 10);
      assert.equal(rooms[0].type, 'encounter');
      assert.equal(rooms[1].type, 'friendlyNpc');
      assert.equal(rooms[9].type, 'boss');
    });
  });

  describe('Wild Plains', () => {
    it('generates exactly 30 rooms', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms.length, 30);
    });

    it('keeps npcBattle at rooms 6, 12, 18, 24', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[5].type, 'npcBattle');
      assert.equal(rooms[11].type, 'npcBattle');
      assert.equal(rooms[17].type, 'npcBattle');
      assert.equal(rooms[23].type, 'npcBattle');
    });

    it('keeps boss at room 30', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[29].type, 'boss');
    });

    it('fills remaining rooms with encounter, friendlyNpc, or whackAMole', () => {
      const rooms = generateAreaRooms('wild-plains');
      assertOnlyEnabledRoomTypes(rooms, new Set([5, 11, 17, 23, 29]));
    });

    it('does not generate disabled room types', () => {
      assertNoDisabledRoomTypes(generateAreaRooms('wild-plains'));
    });

    it('friendlyNpc rooms should have offerCategory set to food or equipment', () => {
      assertFriendlyNpcOfferCategories(generateAreaRooms('wild-plains'));
    });
  });

  describe('area unlock ordering', () => {
    it('offers only Starting Meadow before the first clear', () => {
      const options = getAreaSelectionOptions(null, 1);
      assert.deepEqual(options.map(area => area.id), ['hajimari-no-hiroba']);
    });

    it('offers Starting Meadow and Wild Plains after the first clear', () => {
      const options = getAreaSelectionOptions(null, 2);
      assert.deepEqual(options.map(area => area.id), ['hajimari-no-hiroba', 'wild-plains']);
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/unit/game/rooms-koto2.test.js
```

Expected: FAIL because `hajimari-no-hiroba` still generates 30 rooms and `wild-plains` does not exist.

---

### Task 2: Add Area Metadata

**Files:**
- Modify: `data/areas.json`

- [ ] **Step 1: Add `roomCount: 10` to Starting Meadow**

Add the field near existing area metadata:

```json
"bossCreatureId": "hineko",
"roomCount": 10,
"description": "A peaceful meadow at the edge of town, where creatures roam freely.",
```

- [ ] **Step 2: Insert Wild Plains immediately after Starting Meadow**

Use the same creature pool and boss. Insert this object before the existing `school` object:

```json
{
  "id": "wild-plains",
  "name": "野原",
  "nameEn": "Wild Plains",
  "reading": "のはら",
  "rank": 2600,
  "particle": "",
  "parallaxId": "starter_meadow",
  "modifierWord": "",
  "modifierReading": "",
  "modifierMeaning": "",
  "modifierRank": null,
  "locationWord": "野原",
  "locationReading": "のはら",
  "locationMeaning": "field / plain",
  "locationRank": 2600,
  "theme": "A bright, open plain where creatures roam freely beyond the starting meadow.",
  "creatures": [
    "hi",
    "mizu",
    "ki",
    "ishi",
    "tetsu",
    "kaze",
    "mushi",
    "hana",
    "tori",
    "sakana",
    "neko",
    "inu"
  ],
  "bossCreatureId": "hineko",
  "roomCount": 30,
  "description": "A wide meadow-like plain where familiar creatures roam in longer routes.",
  "tags": [
    "meadow",
    "plains",
    "open"
  ],
  "subAreas": [],
  "background": "areas/hajimari-no-hiroba/hajimari-no-hiroba_01.webp",
  "stage": 1,
  "createdAt": "2026-04-29"
}
```

- [ ] **Step 3: Run JSON parse check**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('data/areas.json', 'utf8')); console.log('areas json ok')"
```

Expected: prints `areas json ok`.

---

### Task 3: Make Room Generation Data-Driven

**Files:**
- Modify: `src/game/rooms.js`

- [ ] **Step 1: Replace hardcoded room constants**

Change `generateAreaRooms` so it reads the area before constants and derives the fixed positions:

```js
export function generateAreaRooms(areaId, _roomCount, _lastSpecialType, _encountersOnly, _forceRoomType, tutorialMode = false) {
  // Look up sub-areas for this area
  const area = getAreaById(areaId);
  const subAreas = area?.subAreas || [];
  const totalRooms = area?.roomCount || 30;
  const npcBattleIndices = totalRooms <= 10
    ? new Set([5])
    : new Set([5, 11, 17, 23]);
  const bossIndex = totalRooms - 1;

  const rooms = [];

  for (let i = 0; i < totalRooms; i++) {
    let type;

    if (npcBattleIndices.has(i)) {
      type = ROOM_TYPES.npcBattle;
    } else if (i === bossIndex) {
      type = ROOM_TYPES.boss;
    } else {
      const roll = Math.random();
      if (roll < 0.10) {
        type = ROOM_TYPES.whackAMole;
      } else if (roll < 0.55) {
        type = ROOM_TYPES.encounter;
      } else {
        type = ROOM_TYPES.friendlyNpc;
      }
    }

    const room = createRoom(type, areaId, i + 1, totalRooms);

    if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];

    rooms.push(room);
  }
```

Do not change the tutorial override block except for variable casing needed by the new constants.

- [ ] **Step 2: Attach boss using `bossIndex`**

Replace:

```js
rooms[BOSS_INDEX].boss = { creatureId: area.bossCreatureId, defeated: false };
```

with:

```js
rooms[bossIndex].boss = { creatureId: area.bossCreatureId, defeated: false };
```

- [ ] **Step 3: Update stale comments**

Change comments that say room generation is always fixed at 30 rooms so they describe `area.roomCount || 30`.

- [ ] **Step 4: Run syntax check**

Run:

```bash
node --check src/game/rooms.js
```

Expected: no output and exit code 0.

---

### Task 4: Verify Focused Behavior

**Files:**
- Test: `tests/unit/game/rooms-koto2.test.js`

- [ ] **Step 1: Run focused room generation tests**

Run:

```bash
node --test tests/unit/game/rooms-koto2.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run targeted integration around area options if available**

Run:

```bash
node --test tests/integration/flows/meta-progression.test.js
```

Expected: pass or fail only for pre-existing unrelated reasons. If it fails due this change, fix before proceeding.

- [ ] **Step 3: Run full suite for documentation**

Run:

```bash
npm test
```

Expected: may still fail with the known live-code failures:

- `tests/unit/pixi/formation-npc-scene.test.js` scene disposal mock issue.
- `tests/unit/sprites/gate1.test.js` missing Python `numpy`.
- `tests/unit/tokenize-static.test.js` generated frame-count expectation mismatches.

Do not fix these unrelated failures in this plan.
