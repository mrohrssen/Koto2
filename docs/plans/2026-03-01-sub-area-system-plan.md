# Sub-Area System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add named sub-areas to each area so rooms display Japanese location names (modifier + noun) instead of "エリア3/10", with per-sub-area background images.

**Architecture:** Each area in `data/new-areas-staging.json` gets a `subAreas` array of 6 named locations. During room generation, each room is assigned a sub-area from the pool. The sub-area name replaces "エリアN/M" in narration, and its background replaces the random background selection. No gameplay logic changes — room types, creature spawns, and branching are unaffected.

**Tech Stack:** Node.js ES modules, Express, Node.js native test runner + c8 coverage, vanilla JS frontend

**Design doc:** `docs/plans/2026-03-01-sub-area-system-design.md`

---

## Task 1: Sub-Area Assignment in Room Generation

Modify `generateFloorRooms()` to assign a sub-area from the area's pool to each generated room.

**Files:**
- Test: `tests/unit/game/sub-areas.test.js`
- Modify: `src/game/rooms.js:184-202`

**Step 1: Write failing tests for sub-area assignment**

Create `tests/unit/game/sub-areas.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateFloorRooms, getAreaById } from '../../../src/game/rooms.js';

describe('Sub-area assignment', () => {
  it('assigns sub-areas to rooms when area has subAreas', () => {
    const area = getAreaById('okunomori');
    if (!area?.subAreas?.length) {
      // Skip if sub-area data not yet added — tested after Task 3
      return;
    }
    const rooms = generateFloorRooms('okunomori', 6);
    // First room is single
    assert.ok(rooms[0].subArea, 'first room should have a subArea');
    assert.ok(rooms[0].subArea.name, 'subArea should have a name');
    assert.ok(rooms[0].subArea.nameEn, 'subArea should have nameEn');
    assert.ok(rooms[0].subArea.background, 'subArea should have background');
    // Branch pair rooms should both have the same sub-area
    const pair = rooms[1];
    assert.ok(Array.isArray(pair), 'room 2+ should be a branch pair');
    assert.ok(pair[0].subArea, 'branch room 0 should have subArea');
    assert.ok(pair[1].subArea, 'branch room 1 should have subArea');
    assert.strictEqual(pair[0].subArea.id, pair[1].subArea.id, 'both doors share same sub-area');
  });

  it('cycles through sub-areas when more rooms than sub-areas', () => {
    const area = getAreaById('okunomori');
    if (!area?.subAreas?.length) return;
    const rooms = generateFloorRooms('okunomori', 10);
    // With 6 sub-areas and 10 rooms, room 7 (index 6) should wrap to sub-area 0
    const getSubArea = (room) => Array.isArray(room) ? room[0].subArea : room.subArea;
    assert.strictEqual(getSubArea(rooms[6]).id, getSubArea(rooms[0]).id, 'should cycle back');
  });

  it('works gracefully when area has no subAreas', () => {
    // generateFloorRooms should not crash if area lacks subAreas
    const rooms = generateFloorRooms('nonexistent-area', 4);
    assert.ok(rooms.length > 0, 'should still generate rooms');
    assert.strictEqual(rooms[0].subArea, undefined, 'no subArea when area has none');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/game/sub-areas.test.js`
Expected: Tests pass vacuously (skip conditions) or fail on sub-area field — depends on whether data exists yet. The "no subAreas" test should pass since rooms currently don't set `.subArea`.

**Step 3: Implement sub-area assignment in generateFloorRooms**

Modify `src/game/rooms.js` at line 184. The current function:

```javascript
export function generateFloorRooms(areaId, roomCount = 10, lastSpecialType = null, encountersOnly = false, forceRoomType = null) {
  const rooms = [];
  const totalSlots = roomCount;
  let prevSpecialType = lastSpecialType;

  for (let i = 0; i < roomCount; i++) {
    const roomNumber = i + 1;

    if (i === 0) {
      const room = generateSingleRoom(areaId, roomNumber, totalSlots, prevSpecialType, !forceRoomType, forceRoomType);
      rooms.push(room);
    } else {
      const pair = generateBranchPair(areaId, roomNumber, totalSlots, prevSpecialType, encountersOnly, forceRoomType);
      rooms.push(pair);
    }
  }

  return rooms;
}
```

Replace with:

```javascript
export function generateFloorRooms(areaId, roomCount = 10, lastSpecialType = null, encountersOnly = false, forceRoomType = null) {
  const rooms = [];
  const totalSlots = roomCount;
  let prevSpecialType = lastSpecialType;

  // Look up sub-areas for this area
  const area = getAreaById(areaId);
  const subAreas = area?.subAreas || [];

  for (let i = 0; i < roomCount; i++) {
    const roomNumber = i + 1;

    if (i === 0) {
      const room = generateSingleRoom(areaId, roomNumber, totalSlots, prevSpecialType, !forceRoomType, forceRoomType);
      if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];
      rooms.push(room);
    } else {
      const pair = generateBranchPair(areaId, roomNumber, totalSlots, prevSpecialType, encountersOnly, forceRoomType);
      if (subAreas.length > 0) {
        const sa = subAreas[i % subAreas.length];
        pair[0].subArea = sa;
        pair[1].subArea = sa;
      }
      rooms.push(pair);
    }
  }

  return rooms;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/game/sub-areas.test.js`
Expected: The "no subAreas" test passes. The other tests skip until data is added in Task 3.

**Step 5: Run full test suite to verify no regressions**

Run: `npm test`
Expected: All existing tests still pass.

**Step 6: Commit**

```bash
git add src/game/rooms.js tests/unit/game/sub-areas.test.js
git commit -m "feat: assign sub-areas to rooms during generation"
```

---

## Task 2: Room Narration Uses Sub-Area Name

Update `getRoomEntryNarration()` to display the sub-area Japanese name instead of "エリアN/M".

**Files:**
- Test: `tests/unit/game/sub-areas.test.js` (append)
- Modify: `src/game/rooms.js:255-274`

**Step 1: Write failing tests for narration**

Append to `tests/unit/game/sub-areas.test.js`:

```javascript
import { getRoomEntryNarration, createRoom } from '../../../src/game/rooms.js';

describe('Sub-area narration', () => {
  it('uses sub-area name in narration when present', () => {
    const room = createRoom('encounter', 'okunomori', 3, 10);
    room.subArea = { id: 'okunomori-pond', name: '小さな池', nameEn: 'Small Pond' };
    const narration = getRoomEntryNarration(room);
    assert.ok(narration.includes('小さな池'), 'narration should contain sub-area name');
    assert.ok(narration.includes('3/10'), 'narration should contain room number');
    assert.ok(!narration.includes('エリア'), 'narration should NOT contain エリア');
  });

  it('falls back to エリア format when no sub-area', () => {
    const room = createRoom('encounter', 'okunomori', 3, 10);
    const narration = getRoomEntryNarration(room);
    assert.ok(narration.includes('エリア3/10'), 'should fall back to エリア format');
  });

  it('works for all room types with sub-area', () => {
    const types = ['encounter', 'shrine', 'quiz', 'wordDiscovery', 'dealer', 'whackAMole'];
    for (const type of types) {
      const room = createRoom(type, 'okunomori', 2, 8);
      room.subArea = { id: 'test', name: '古い橋', nameEn: 'Old Bridge' };
      const narration = getRoomEntryNarration(room);
      assert.ok(narration.includes('古い橋'), `${type} narration should use sub-area name`);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/game/sub-areas.test.js`
Expected: FAIL — narration still uses エリア format

**Step 3: Update getRoomEntryNarration**

Replace lines 255-274 in `src/game/rooms.js`:

```javascript
export function getRoomEntryNarration(room) {
  const locationLabel = room.subArea
    ? `${room.subArea.name} — ${room.roomNumber}/${room.totalRooms}`
    : `エリア${room.roomNumber}/${room.totalRooms}`;

  switch (room.type) {
    case ROOM_TYPES.encounter:
      return `${locationLabel}に入った。SYSTEM接続された市民がいる！`;
    case ROOM_TYPES.shrine:
      return `${locationLabel}に入った。狐の祠がある。神秘的な力が感じられる...`;
    case ROOM_TYPES.quiz:
      return `${locationLabel}に入った。不思議な老人がいる...「質問に答えよ」`;
    case ROOM_TYPES.wordDiscovery:
      return `${locationLabel}に入った。知識の泉がある...新しい言葉を発見できそうだ。`;
    case ROOM_TYPES.dealer:
      return `${locationLabel}に入った。旅の行商人がいる...「珍しいモンスターがいるよ」`;
    case ROOM_TYPES.whackAMole:
      return `${locationLabel}に入った。不思議なゲーム機がある...`;
    default:
      return `${locationLabel}に入った。`;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/game/sub-areas.test.js`
Expected: All narration tests PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass. Check that `tests/unit/game/branching-rooms.test.js` and `tests/unit/game/rooms-word-discovery.test.js` still pass (they test room generation and narration).

**Step 6: Commit**

```bash
git add src/game/rooms.js tests/unit/game/sub-areas.test.js
git commit -m "feat: room narration uses sub-area Japanese name"
```

---

## Task 3: Sub-Area Data for All 5 Areas

Hand-curate 6 sub-areas per area (30 total) with JPDB-accurate Japanese vocabulary. Each sub-area needs a modifier + location noun, thematically appropriate for its parent area.

**Files:**
- Modify: `data/new-areas-staging.json`

**Step 1: Research vocabulary**

Use JPDB frequency data and the existing `language/dictionaries/jpdb-wordlist.csv` to select location nouns and modifiers. Prioritize:
- High-frequency words (rank < 4000) for Stage 1
- Thematic fit with parent area
- Dictionary-accurate English meanings (per CLAUDE.md rules — no embellishment)
- Mix of i-adjectives, na-adjectives, and verb-derived modifiers

**Step 2: Add subAreas to each area in data/new-areas-staging.json**

Add a `subAreas` array to each of the 5 area objects. Each sub-area needs:
- `id`: `{areaId}-{english-slug}`
- `name`: Japanese modifier + location noun
- `reading`: full hiragana
- `nameEn`: accurate English translation
- `modifier`: `{ word, reading, meaning, rank }`
- `location`: `{ word, reading, meaning, rank }`
- `background`: specific variant from `areas/{areaId}/{areaId}_NN.webp` (pick 01-20, spread across variants)

Example for okunomori (Deep Forest):

```json
"subAreas": [
  {
    "id": "okunomori-pond",
    "name": "小さな池",
    "reading": "ちいさないけ",
    "nameEn": "Small Pond",
    "modifier": { "word": "小さな", "reading": "ちいさな", "meaning": "small", "rank": 890 },
    "location": { "word": "池", "reading": "いけ", "meaning": "pond", "rank": 2100 },
    "background": "areas/okunomori/okunomori_02.webp"
  },
  {
    "id": "okunomori-hut",
    "name": "古い小屋",
    "reading": "ふるいこや",
    "nameEn": "Old Hut",
    "modifier": { "word": "古い", "reading": "ふるい", "meaning": "old", "rank": 970 },
    "location": { "word": "小屋", "reading": "こや", "meaning": "hut / shed", "rank": 3200 },
    "background": "areas/okunomori/okunomori_05.webp"
  }
]
```

Repeat for all 5 areas (shizukana-kouen, himitsuno-toshokan, kakureta-hama, mahouno-gakkou). Choose words thematically — the library gets corridor/shelf/window, the beach gets cove/rock/shore, etc.

**Step 3: Validate the data**

Run: `node -e "import('./src/game/rooms.js').then(m => { const areas = m.AREAS; for (const a of areas) { console.log(a.id, a.subAreas?.length || 0, 'sub-areas'); if (a.subAreas) a.subAreas.forEach(sa => console.log('  ', sa.name, sa.nameEn, sa.background)); } })"`

Expected: Each area shows 6 sub-areas with Japanese names and backgrounds.

**Step 4: Run the sub-area assignment tests from Task 1**

Run: `node --test tests/unit/game/sub-areas.test.js`
Expected: All tests now pass (including the ones that previously skipped due to missing data).

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add data/new-areas-staging.json
git commit -m "feat: add 30 sub-areas across 5 areas with Japanese vocabulary"
```

---

## Task 4: Background Selection Uses Sub-Area

Replace `randomAreaBg()` calls in `exploration-service.js` with sub-area-specific background selection.

**Files:**
- Modify: `src/game/services/exploration-service.js:115,238,308`

**Step 1: Write failing test**

Append to `tests/unit/game/sub-areas.test.js`:

```javascript
describe('Sub-area background helper', () => {
  it('getSubAreaBackground returns sub-area bg when present', () => {
    // Import will be added in Step 3
    const { getSubAreaBackground } = await import('../../../src/game/services/exploration-service.js').catch(() => ({}));
    if (!getSubAreaBackground) return; // skip until implemented

    const room = { subArea: { background: 'areas/okunomori/okunomori_03.webp' } };
    assert.strictEqual(getSubAreaBackground(room), 'areas/okunomori/okunomori_03.webp');
  });

  it('getSubAreaBackground falls back for rooms without sub-area', () => {
    const { getSubAreaBackground } = await import('../../../src/game/services/exploration-service.js').catch(() => ({}));
    if (!getSubAreaBackground) return;

    const room = {};
    const bg = getSubAreaBackground(room, 'okunomori');
    assert.ok(bg.startsWith('areas/okunomori/'), 'should fall back to random area bg');
  });
});
```

**Step 2: Update exploration-service.js**

Add a helper function near `randomAreaBg()` (after line 37):

```javascript
/**
 * Get background for a room — uses sub-area background if available, otherwise random
 */
function getBackgroundForRoom(room, areaId) {
  const activeRoom = Array.isArray(room) ? room[0] : room;
  return activeRoom?.subArea?.background || randomAreaBg(areaId);
}
```

Then replace the 3 `randomAreaBg()` calls:

**Line 115** (in `enterArea()`):
```javascript
// Before:
this.gm.run.background = randomAreaBg(areaId);
// After:
const firstRoom = this.gm.run.rooms[0];
this.gm.run.background = getBackgroundForRoom(firstRoom, areaId);
```

**Line 238** (in `proceedToNextRoom()`):
```javascript
// Before:
this.gm.run.background = randomAreaBg(areaId);
// After:
this.gm.run.background = getBackgroundForRoom(room, areaId);
```

**Line 308** (in `selectBranch()`):
```javascript
// Before:
this.gm.run.background = randomAreaBg(areaId);
// After:
this.gm.run.background = getBackgroundForRoom(selectedRoom, areaId);
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/game/services/exploration-service.js tests/unit/game/sub-areas.test.js
git commit -m "feat: background selection uses sub-area-specific backgrounds"
```

---

## Task 5: Frontend Displays Sub-Area Name

Update the exploration UI to show the sub-area name. Currently room numbers aren't prominently displayed in the frontend (the narration handles it), but ensure the state includes sub-area data for any UI that references rooms.

**Files:**
- Modify: `public/js/ui/exploration.js` (if room labels are displayed)
- Modify: `public/js/game.js` (status bar)

**Step 1: Check current frontend display**

The frontend exploration UI (`public/js/ui/exploration.js`) currently displays:
- Line 434: `Area ${areasCompleted + 1} / ${areasToWin}` (area selection screen — keep as-is)
- Line 614: `Area ${areasCompleted} / ${areasToWin} cleared!` (area complete — keep as-is)
- Line 234 (game.js): `F${floor}` in status bar

The room narration text (which now includes sub-area names from Task 2) is displayed via the narration box, which already handles this.

**Step 2: Update status bar to show sub-area name**

In `public/js/game.js`, update `updateStatusBar()` at line 232-235:

```javascript
function updateStatusBar() {
  const run = gameState.run;
  if (run) {
    const currentRoomIdx = run.currentRoom || 0;
    const currentRoom = run.rooms?.[currentRoomIdx];
    const activeRoom = Array.isArray(currentRoom) ? currentRoom[0] : currentRoom;
    const subAreaName = activeRoom?.subArea?.nameEn;
    dom.floorIndicator.textContent = subAreaName || `Area ${(run.areasCompleted || 0) + 1}`;
  } else {
    dom.floorIndicator.textContent = 'Hub';
  }
  dom.essenceDisplay.textContent = gameState.meta?.essence || gameState.player?.essence || 0;
}
```

**Step 3: Syntax check**

Run: `node --check public/js/game.js && echo "OK"`
Expected: "OK"

**Step 4: Commit**

```bash
git add public/js/game.js
git commit -m "feat: status bar shows sub-area name during exploration"
```

---

## Task 6: Run Full Test Suite + Verify

Final validation that everything works together.

**Step 1: Run all tests**

Run: `npm test`
Expected: All unit + integration tests pass with no regressions.

**Step 2: Syntax check all modified files**

```bash
node --check src/game/rooms.js && \
node --check src/game/services/exploration-service.js && \
node --check public/js/game.js && \
echo "All OK"
```

Expected: "All OK"

**Step 3: Verify data loads correctly**

Run: `node -e "import('./src/game/rooms.js').then(m => { const areas = m.AREAS; let total = 0; for (const a of areas) { const count = a.subAreas?.length || 0; total += count; console.log(a.id + ': ' + count + ' sub-areas'); } console.log('Total: ' + total); })"`

Expected:
```
okunomori: 6 sub-areas
shizukana-kouen: 6 sub-areas
himitsuno-toshokan: 6 sub-areas
kakureta-hama: 6 sub-areas
mahouno-gakkou: 6 sub-areas
Total: 30
```

**Step 4: Verify room generation includes sub-areas**

Run: `node -e "import('./src/game/rooms.js').then(m => { const rooms = m.generateFloorRooms('okunomori', 8); rooms.forEach((r, i) => { const room = Array.isArray(r) ? r[0] : r; console.log('Room ' + (i+1) + ':', room.subArea?.name || 'no subArea', room.subArea?.nameEn || '', '-', room.type); }); })"`

Expected: Each room shows a Japanese sub-area name cycling through the 6 sub-areas.

**Step 5: Commit final state**

If any fixes were needed, commit them. Otherwise this task is just validation.

```bash
git add -A
git commit -m "chore: verify sub-area system integration"
```
