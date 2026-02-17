# Area Loop System Design

**Date:** 2026-02-18
**Status:** Approved
**Replaces:** Ward system, floor progression, boss encounters

## Summary

Replace the Tokyo ward graph (nerima → nakano → shinjuku → palace) and 7-floor dungeon structure with a simple area loop. Areas are loaded from `data/new-areas-staging.json`. Each area has 8–12 mixed rooms (encounters, shrines, quizzes, dealers, word discovery — no boss). After clearing an area, the player picks 1 of 2 randomly offered areas (never the current one). Beat 10 areas to win. Areas recycle when the pool is exhausted.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Area count to win | 10 | Matches request. Enough to feel like a full run. |
| Area pool exhaustion | Recycle (exclude current) | Only 5 areas exist now; more will be forged later. |
| Enemy spawns | Area-only creatures | Each area's `creatures` array restricts the spawn pool. |
| Room types | Mixed (existing system) | Keep shrines, quizzes, dealers, word discovery. Branching doors + Chippy hints still work. |
| Rooms per area | Random 8–12 | Slight variance for replay variety. |
| Boss encounters | Removed | No boss at end of area. Last room is a normal room. |
| Enemy scaling | Level-match only | Enemies match highest robot level ±1. No area tier bonus. |
| Backgrounds | `{areaId}.webp` | Fallback to existing floor backgrounds until area-specific assets are generated. |
| Win condition | `areasCompleted >= 10` | Triggers existing `RUN_COMPLETE` phase and victory UI. |

## Data Model

### Area Data (loaded from `new-areas-staging.json`)

Each area has: `id`, `name`, `nameEn`, `reading`, `theme`, `creatures` (array of creature IDs), `description`, `tags`.

### Run State (`state.js` — `createNewRun()`)

**Remove:** `floor`, `maxFloors`, `currentWard`, `wardPath`, `wardSelectionRequired`, `bossDefeated`

**Add:**
```js
currentArea: null,           // full area object from staging JSON
areasCompleted: 0,           // number of areas cleared
areasToWin: 10,              // win condition threshold
areaPath: [],                // array of area IDs visited (for history)
areaSelectionRequired: true, // true at start and after each area
areaCleared: false,          // true when all rooms in current area are done
```

**Keep unchanged:** `rooms`, `currentRoom`, `roomsExplored`, `pendingBranch`, `selectedRooms`, `encountersCompleted`, `encountersNeeded`, `robotParty`, `itemBuffs`, `stats`, `runStats`, `eventLog`, `player`

## Architecture Changes

### 1. `rooms.js` — Area Data Layer

**Remove:** `WARD_INFO`, `WARD_PATHS`, `STARTING_WARDS`, `FLOOR_NAMES`, `getStartingWardOptions()`, `getNextWardOptions()`, `getWardTier()`, `getWardInfo()`

**Add:**
- `AREAS` — loaded from `data/new-areas-staging.json` at module init
- `getAreaSelectionOptions(excludeAreaId)` — pick 2 random areas from AREAS, excluding the one with `excludeAreaId`
- `getAreaById(areaId)` — lookup helper

**Modify `generateFloorRooms()`:**
- Remove boss room generation (no `createRoom(ROOM_TYPES.boss, ...)` at the end)
- Accept `roomCount` parameter (8–12) instead of `encountersNeeded`
- First room: single (auto-entered). Remaining rooms: branch pairs. No boss.

### 2. `state.js` — State Factories

- `createNewRun()`: Use new run state fields (see above)
- `generateEncounterCount()`: Change range from 7–10 to 8–12 (now represents total rooms per area)
- `calculateEssenceReward()`: Replace `floor * 10` with `areasCompleted * 10`
- Remove floor-7 victory bonus, add areas-completed bonus

### 3. `phase-machine.js` — Phase Machine

**Rename:** `WARD_SELECTION` → `AREA_SELECTION`
**Add:** `AREA_COMPLETE` — shown when `areaCleared` is true and `areasCompleted < areasToWin`
**Remove:** `BOSS_READY`, `BOSS_DEFEATED`, `FLOOR_COMPLETE` (or alias them for safety)

**Updated `derivePhase()`:**
```
if (run.areaSelectionRequired) → AREA_SELECTION
if (run.areaCleared && areasCompleted >= areasToWin) → RUN_COMPLETE
if (run.areaCleared) → AREA_COMPLETE
// Remove: boss room check, bossDefeated check
```

### 4. `exploration-service.js` — Exploration Logic

**Replace ward methods:**
- `selectStartingWard(wardId)` → `selectArea(areaId)` — works for both game start and between areas
- `enterFloor()` → `enterArea()` — generates rooms, sets background, resets per-area state
- `nextFloor()` → removed
- `continueEndless()` → removed

**Area completion detection:**
- In `proceedToNextRoom()`: after clearing the last room, if no more rooms remain, set `areaCleared = true`, increment `areasCompleted`, set `areaSelectionRequired = true`
- If `areasCompleted >= areasToWin`, set `run.gameVictoryPending = true`

### 5. `robots.js` — Area-Restricted Enemy Spawns

- `generateEnemyRobot(highestAllyLevel, creaturePool = null)` — new optional param
- When `creaturePool` is provided (array of creature IDs), filter `ROBOT_DATA` to only those IDs before picking
- Fallback: if pool produces no valid candidates, use full pool

### 6. `loop.js` — GameManager

- `startRun()`: Set `areaSelectionRequired = true`, return area options instead of ward options
- `selectStartingWard()` → `selectArea()`
- `selectNextWard()` → reuse `selectArea()`
- `startRobotEncounter()`: Pass `run.currentArea.creatures` to `generateEnemyRobots()`
- Remove: `nextFloor()`, `continueEndless()`, `returnToHubFromVictory()` (simplified)
- Win handling: when `areasCompleted >= 10`, trigger `_handleGameVictory()`

### 7. Server Routes (`src/routes/game/run.js`)

- `/api/game/starting-wards` → `/api/game/area-options`
- `/api/game/select-starting-ward` → `/api/game/select-area`
- `/api/game/next-ward-options` → reuse `/api/game/area-options`
- `/api/game/select-next-ward` → reuse `/api/game/select-area`

### 8. Frontend (`public/js/`)

**`api.js`:**
- `getStartingWards()` → `getAreaOptions()`
- `selectStartingWard()` → `selectArea()`
- `getNextWardOptions()` → reuse `getAreaOptions()`
- `selectNextWard()` → reuse `selectArea()`

**`ui/exploration.js`:**
- `renderWardSelection()` → `renderAreaSelection()` — show area name, nameEn, theme
- Handle `AREA_COMPLETE` phase: brief "area cleared" message, then show area selection
- Remove boss-related rendering (`BOSS_READY`, `FLOOR_COMPLETE` boss references)
- Background: use `{areaId}.webp`, fall back to existing floor backgrounds

### 9. Backgrounds

- Each area expects `public/assets/backgrounds/{areaId}.webp` (e.g., `okunomori.webp`)
- Room variants: `{areaId}_{1-5}.webp` (same pattern as current `floor1_1.webp`)
- Fallback: if area background doesn't exist, use `floor1.webp` (or cycle existing backgrounds)
- User will generate these with existing background generation script when PC is available

## Win Condition Flow

1. Player completes area 10's last room
2. `areasCompleted` increments to 10 (= `areasToWin`)
3. `run.gameVictoryPending = true`
4. Phase → `RUN_COMPLETE`
5. Existing victory UI displays
6. Player returns to hub

## Files Modified

| File | Change |
|------|--------|
| `src/game/rooms.js` | Replace ward system with area functions, remove boss from room gen |
| `src/game/state.js` | New run state fields, update encounter count range |
| `src/game/phase-machine.js` | New phases (AREA_SELECTION, AREA_COMPLETE), remove boss phases |
| `src/game/services/exploration-service.js` | Area selection/entry, area completion detection |
| `src/game/loop.js` | Wire up area methods, pass creature pool to combat |
| `src/game/robots.js` | Add creature pool filter to enemy generation |
| `src/routes/game/run.js` | New API endpoints for area selection |
| `public/js/api.js` | New API calls for areas |
| `public/js/ui/exploration.js` | Area selection UI, area complete handling |
| `public/js/game.js` | Update phase routing if needed |
| `data/new-areas-staging.json` | No changes (read-only data source) |
