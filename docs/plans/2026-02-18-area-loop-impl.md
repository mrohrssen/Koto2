# Area Loop System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the ward/floor/boss progression with a simple area loop: pick 1 of 2 random areas, clear 8-12 mixed rooms, repeat 10 times to win.

**Architecture:** Thin adapter approach — swap ward data sources with area JSON, reuse existing room generation and branching. Remove boss rooms. Area-restricted creature spawns. New phases: AREA_SELECTION and AREA_COMPLETE.

**Tech Stack:** Node.js ES modules, Express routes, vanilla JS frontend

**Design doc:** `docs/plans/2026-02-18-area-loop-system-design.md`

---

### Task 1: Update rooms.js — Replace ward system with area data

**Files:**
- Modify: `src/game/rooms.js`

**Step 1: Replace ward exports with area data**

Replace everything from line 64 (`FLOOR_NAMES`) through line 243 (end of `getWardInfo`) with:

```js
// ============ AREA SYSTEM ============

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __rooms_dirname = dirname(fileURLToPath(import.meta.url));
export const AREAS = JSON.parse(
  readFileSync(join(__rooms_dirname, '../../data/new-areas-staging.json'), 'utf8')
);

const AREAS_BY_ID = {};
for (const area of AREAS) {
  AREAS_BY_ID[area.id] = area;
}

/**
 * Get 2 random area options, excluding the current area
 * @param {string|null} excludeAreaId - Area ID to exclude
 * @returns {Array} Array of 2 area objects
 */
export function getAreaSelectionOptions(excludeAreaId = null) {
  const pool = AREAS.filter(a => a.id !== excludeAreaId);
  // Shuffle and pick 2
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

/**
 * Get area by ID
 * @param {string} areaId - Area ID
 * @returns {object|null} Area object or null
 */
export function getAreaById(areaId) {
  return AREAS_BY_ID[areaId] || null;
}
```

Also add the `fs`/`path` imports at the very top of the file (lines 1-3 area). Note: `rooms.js` is a server-side module so Node imports are fine.

**Step 2: Remove boss from ROOM_TYPES and room generation**

In `ROOM_TYPES` (around line 246), remove the `boss` entry:

```js
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  wordDiscovery: 'wordDiscovery',
  dealer: 'dealer'
};
```

In `generateFloorRooms()` (around line 351):
- Rename parameter `encountersNeeded` to `roomCount`
- Remove the `+1 for boss` from `totalSlots` — set `totalSlots = roomCount`
- Remove the boss room push at the end (line 375: `rooms.push(createRoom(ROOM_TYPES.boss, ...))`)
- Pass `areaId` instead of `floor` to `createRoom` (change param name)

Replace the function:

```js
/**
 * Generate rooms for an area with branching
 * Structure: single first room + branch pairs (no boss)
 * @param {string} areaId - Area identifier for room IDs
 * @param {number} roomCount - Number of rooms (8-12)
 * @param {string|null} lastSpecialType - Last special room type completed
 * @param {boolean} encountersOnly - If true, all rooms are encounters
 * @returns {Array} Array of room objects (singles) or pairs (arrays of 2)
 */
export function generateFloorRooms(areaId, roomCount = 10, lastSpecialType = null, encountersOnly = false) {
  const rooms = [];
  const totalSlots = roomCount;
  let prevSpecialType = lastSpecialType;

  for (let i = 0; i < roomCount; i++) {
    const roomNumber = i + 1;

    if (i === 0) {
      const room = generateSingleRoom(areaId, roomNumber, totalSlots, prevSpecialType, encountersOnly);
      if (isSpecialType(room.type)) {
        prevSpecialType = room.type;
      }
      rooms.push(room);
    } else {
      const pair = generateBranchPair(areaId, roomNumber, totalSlots, prevSpecialType, encountersOnly);
      rooms.push(pair);
    }
  }

  return rooms;
}
```

Update `generateSingleRoom` and `generateBranchPair` to accept `areaId` instead of `floor`:
- Change first param from `floor` to `areaId` in both functions
- Pass `areaId` through to `createRoom`

Update `createRoom`:
- Change `floor` param to `areaId`
- Change room ID from `floor${floor}_room${roomNumber}` to `${areaId}_room${roomNumber}`
- Remove `floor` property from room object, add `areaId`
- Remove `case ROOM_TYPES.boss:` block

```js
function createRoom(type, areaId, roomNumber, totalRooms) {
  const room = {
    id: `${areaId}_room${roomNumber}`,
    type,
    roomNumber,
    totalRooms,
    areaId,
    explored: false,
    interacted: false
  };

  switch (type) {
    case ROOM_TYPES.shrine:
      room.shrine = { used: false };
      break;
    case ROOM_TYPES.quiz:
      room.quiz = { answered: false, rewarded: false };
      break;
    case ROOM_TYPES.wordDiscovery:
      room.wordDiscovery = {
        wordsToLearn: WORDS_PER_DISCOVERY,
        wordsLearned: 0,
        wordIds: [],
        completed: false
      };
      break;
    case ROOM_TYPES.dealer: {
      room.dealer = {
        visited: false,
        offeredRobots: [],
        soldRobots: [],
        purchasedRobot: null
      };
      break;
    }
  }

  return room;
}
```

**Step 3: Update narration to remove boss and floor references**

In `getRoomEntryNarration`:
- Remove the `FLOOR_NAMES` lookup (line 436)
- Remove the `boss` case
- Keep the room number display

```js
export function getRoomEntryNarration(room) {
  const roomNum = `エリア${room.roomNumber}/${room.totalRooms}`;

  switch (room.type) {
    case ROOM_TYPES.encounter:
      return `${roomNum}に入った。SYSTEM接続された市民がいる！`;
    case ROOM_TYPES.shrine:
      return `${roomNum}に入った。狐の祠がある。神秘的な力が感じられる...`;
    case ROOM_TYPES.quiz:
      return `${roomNum}に入った。不思議な老人がいる...「質問に答えよ」`;
    case ROOM_TYPES.wordDiscovery:
      return `${roomNum}に入った。知識の泉がある...新しい言葉を発見できそうだ。`;
    case ROOM_TYPES.dealer:
      return `${roomNum}に入った。怪しいロボット商人がいる...「良いボットがあるよ」`;
    default:
      return `${roomNum}に入った。`;
  }
}
```

In `getRoomActions`: remove the `case ROOM_TYPES.boss:` block and the `isBossRoom` check.

```js
export function getRoomActions(room) {
  const actions = [];

  const isUnfinishedEncounter = room.type === 'encounter' && !room.interacted;
  const isUnfinishedWordDiscovery = room.type === 'wordDiscovery' && !room.interacted;
  const isUnfinishedDealer = room.type === 'dealer' && !room.interacted;
  if (!isUnfinishedEncounter && !isUnfinishedWordDiscovery && !isUnfinishedDealer) {
    actions.push({ id: 'proceed', name: '進む', description: '次のエリアへ進む' });
  }

  switch (room.type) {
    case ROOM_TYPES.shrine:
      if (!room.shrine.used) {
        actions.push({ id: 'shrine_upgrade', name: '祈る', description: '狐の祠に祈る' });
      }
      break;
    case ROOM_TYPES.quiz:
      if (!room.quiz.rewarded) {
        actions.push({ id: 'quiz_answer', name: '答える', description: 'クイズに答える' });
      }
      break;
    case ROOM_TYPES.encounter:
      if (!room.interacted) {
        actions.push({ id: 'fight', name: '解放', description: '市民を解放する' });
      }
      break;
    case ROOM_TYPES.wordDiscovery:
      break;
    case ROOM_TYPES.dealer:
      if (!room.dealer?.visited) {
        actions.push({ id: 'dealer_trade', name: '取引', description: 'ロボット商人と取引する' });
      }
      break;
  }

  return actions;
}
```

**Step 4: Syntax check**

Run: `node --check src/game/rooms.js`
Expected: no output (success)

**Step 5: Commit**

```bash
git add src/game/rooms.js
git commit -m "refactor: replace ward system with area data in rooms.js"
```

---

### Task 2: Update state.js — New run state and encounter count

**Files:**
- Modify: `src/game/state.js`

**Step 1: Update createNewRun()**

Replace the run state object in `createNewRun()` (lines 263-353). Remove `floor`, `maxFloors`, `currentWard`, `wardPath`, `wardSelectionRequired`, `bossDefeated`. Add `currentArea`, `areasCompleted`, `areasToWin`, `areaPath`, `areaSelectionRequired`, `areaCleared`:

```js
export function createNewRun(player) {
  const run = {
    active: true,
    levelId: null,

    // Area loop system
    currentArea: null,           // full area object from staging JSON
    areasCompleted: 0,           // number of areas cleared
    areasToWin: 10,              // win condition threshold
    areaPath: [],                // array of area IDs visited (for history)
    areaSelectionRequired: true, // true at start and after each area
    areaCleared: false,          // true when all rooms in current area are done

    // Room-based exploration (per-area, reset each area)
    rooms: [],
    currentRoom: 0,
    roomsExplored: 0,

    // Branching room selection
    pendingBranch: false,
    selectedRooms: [],

    // Current area progress
    encountersCompleted: 0,
    encountersNeeded: 0,

    // Player state for this run (copy so we can reset)
    player: JSON.parse(JSON.stringify(player)),

    // Current encounter
    encounter: null,

    // Robot party (run-scoped)
    robotParty: {
      active: [],
      reserves: [],
      maxTotal: 6
    },

    // Item buff stacking (run-scoped)
    itemBuffs: {
      attackMult: 1.0,
      hpMult: 1.0,
      autoPowerMult: 1.0,
      ultimatePowerMult: 1.0,
      elementEdge: 0,
      flatDamageReduction: 0
    },

    // Run history for DM context
    eventLog: [],

    // Run statistics
    stats: {
      enemiesDefeated: 0,
      bossesDefeated: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsUsed: 0,
      creditsEarned: 0,
      areasCleared: 0,
      roomsExplored: 0,
      trapsDisarmed: 0,
      treasuresOpened: 0,
      startTime: Date.now(),
      endTime: null
    },

    // Per-run tracking stats
    runStats: {
      kills: 0,
      critsLanded: 0,
      dodges: 0,
      roomsCleared: 0,
      damageDealt: 0,
      damageHealed: 0,
      statusesApplied: {
        defrag: 0, lag: 0, bufferOverflow: 0, corrupted: 0,
        exposed: 0, glitched: 0, overheated: 0, debug: 0
      }
    }
  };

  return run;
}
```

**Step 2: Update generateEncounterCount()**

Change range from 7-10 to 8-12:

```js
export function generateEncounterCount() {
  const min = 8;
  const max = 12;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

Remove the `floor` parameter since it's no longer needed.

**Step 3: Update calculateEssenceReward()**

Replace floor-based calculation with area-based:

```js
export function calculateEssenceReward(runStats, areasCompleted, isVictory) {
  let essence = 0;

  // Base reward per area completed
  essence += areasCompleted * 10;

  // Bonus for full clear (10 areas)
  if (isVictory) {
    essence += 100;
  }

  // Bonus per 10 enemies
  essence += Math.floor((runStats?.enemiesDefeated || 0) / 10) * 5;

  return essence;
}
```

**Step 4: Update achievement for completion**

In `ACHIEVEMENTS.dungeonMaster`, change description from "Clear all 7 floors" to "Clear 10 areas". The check stays the same (`stats.runsCompleted >= 1`). In `ACHIEVEMENTS.perfectRun`, change `runStats?.floorsCleared === 7` to `runStats?.areasCleared >= 10`.

Also rename `lifetimeStats.highestFloor` to `lifetimeStats.highestAreasCleared` in `createMetaProgression()`.

**Step 5: Syntax check**

Run: `node --check src/game/state.js`

**Step 6: Commit**

```bash
git add src/game/state.js
git commit -m "refactor: replace floor/ward run state with area loop state"
```

---

### Task 3: Update phase-machine.js — New phases

**Files:**
- Modify: `src/game/phase-machine.js`

**Step 1: Update PHASES**

Replace `WARD_SELECTION` with `AREA_SELECTION`. Add `AREA_COMPLETE`. Remove `BOSS_READY`, `BOSS_DEFEATED`, `FLOOR_COMPLETE`:

```js
export const PHASES = {
  NO_SAVE: 'no_save',
  HUB: 'hub',
  LEVEL_SELECT: 'level_select',
  RUN_ENDED: 'run_ended',

  AREA_SELECTION: 'area_selection',   // Choosing starting/next area
  AREA_COMPLETE: 'area_complete',     // Area cleared, pick next
  EXPLORING: 'exploring',

  ROOM: 'room',
  ROOM_ENCOUNTER: 'room_encounter',
  WORD_DISCOVERY: 'wordDiscovery',
  DEALER: 'dealer',
  BRANCH_SELECTION: 'branch_selection',

  COMBAT: 'combat',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  NPC_DIALOGUE: 'npc_dialogue',

  SHOP: 'shop',
  BLACKSMITH: 'blacksmith',
  POST_COMBAT_SHOP: 'post_combat_shop',

  RUN_COMPLETE: 'run_complete'
};
```

**Step 2: Update VALID_TRANSITIONS**

Replace ward/boss transitions with area transitions:

- `PHASES.HUB` → change `PHASES.WARD_SELECTION` to `PHASES.AREA_SELECTION`
- `PHASES.LEVEL_SELECT` → change `PHASES.WARD_SELECTION` to `PHASES.AREA_SELECTION`
- Replace `PHASES.WARD_SELECTION` key with `PHASES.AREA_SELECTION` (same transitions: EXPLORING, ROOM)
- Remove `PHASES.BOSS_READY`, `PHASES.FLOOR_COMPLETE`, `PHASES.BOSS_DEFEATED` entries
- Add `PHASES.AREA_COMPLETE` key with transitions to `[PHASES.AREA_SELECTION, PHASES.RUN_COMPLETE]`
- In `PHASES.EXPLORING`, remove `PHASES.BOSS_READY`
- In `PHASES.ROOM`, remove `PHASES.BOSS_READY`

**Step 3: Update derivePhase()**

```js
export function derivePhase(state) {
  const { player, run, combat } = state;

  if (!player) return PHASES.NO_SAVE;
  if (!run) return PHASES.HUB;
  if (!run.active) return PHASES.RUN_ENDED;

  // Area selection required at start or between areas
  if (run.areaSelectionRequired) return PHASES.AREA_SELECTION;

  // Branch selection pending
  if (run.pendingBranch) return PHASES.BRANCH_SELECTION;

  // In active combat
  if (combat?.active) return PHASES.COMBAT;

  // NPC dialogue pending after victory
  if (run.npcDialogue?.active) return PHASES.NPC_DIALOGUE;

  // Post-combat shop active
  if (run.postCombatShop?.active) return PHASES.POST_COMBAT_SHOP;

  // Game victory pending
  if (run.gameVictoryPending) return PHASES.RUN_COMPLETE;

  // Area cleared — show area complete or run complete
  if (run.areaCleared) {
    if (run.areasCompleted >= run.areasToWin) return PHASES.RUN_COMPLETE;
    return PHASES.AREA_COMPLETE;
  }

  // Room-based phases
  const currentRoom = run.rooms?.[run.currentRoom];
  if (currentRoom) {
    if (currentRoom.type === 'shrine' && !currentRoom.interacted) return 'shrine';
    if (currentRoom.type === 'quiz' && !currentRoom.interacted) return 'quiz';
    if (currentRoom.type === 'wordDiscovery' && !currentRoom.interacted) return PHASES.WORD_DISCOVERY;
    if (currentRoom.type === 'dealer' && !currentRoom.interacted) return 'dealer';
    if (currentRoom.type === 'encounter' && !currentRoom.interacted) return PHASES.ROOM_ENCOUNTER;
    return PHASES.ROOM;
  }

  return PHASES.EXPLORING;
}
```

**Step 4: Update getPhaseName()**

Replace boss/floor phase names with area phase names.

**Step 5: Syntax check**

Run: `node --check src/game/phase-machine.js`

**Step 6: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "refactor: replace ward/boss phases with area_selection and area_complete"
```

---

### Task 4: Update robots.js — Area-restricted enemy spawns

**Files:**
- Modify: `src/game/robots.js`

**Step 1: Add creaturePool param to generateEnemyRobot**

Change `generateEnemyRobot(highestAllyLevel = 1)` to `generateEnemyRobot(highestAllyLevel = 1, creaturePool = null)`.

When `creaturePool` is provided, filter candidates from that pool instead of random element/rarity:

```js
export function generateEnemyRobot(highestAllyLevel = 1, creaturePool = null) {
  let group;

  if (creaturePool && creaturePool.length > 0) {
    // Filter ROBOT_DATA to only creatures in the area pool
    group = ROBOT_DATA.filter(r => creaturePool.includes(r.id));
    if (group.length === 0) {
      // Fallback to all creatures if pool has no matches
      group = ROBOT_DATA;
    }
  } else {
    // Original random element/rarity logic
    const elements = ['wood', 'fire', 'earth', 'metal', 'water'];
    for (let attempts = 0; attempts < 20; attempts++) {
      const rarity = rollRarity();
      const element = elements[Math.floor(Math.random() * elements.length)];
      group = ROBOTS_BY_ELEMENT_RARITY[`${element}-${rarity}`];
      if (group && group.length > 0) break;
    }
    if (!group || group.length === 0) {
      group = ROBOT_DATA;
    }
  }

  const template = group[Math.floor(Math.random() * group.length)];
  const robot = instantiateRobot(template.id);

  const levelVariance = Math.floor(Math.random() * 3) - 1;
  const targetLevel = Math.max(1, highestAllyLevel + levelVariance);
  while (robot.level < targetLevel) {
    addXpToRobot(robot, XP_PER_LEVEL);
  }

  return robot;
}
```

**Step 2: Add creaturePool param to generateEnemyRobots**

Change signature to `generateEnemyRobots(highestAllyLevel = 1, { maxEnemies, creaturePool } = {})` and pass `creaturePool` through:

```js
export function generateEnemyRobots(highestAllyLevel = 1, { maxEnemies, creaturePool } = {}) {
  const totalWeight = ENEMY_COUNT_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let enemyCount = 1;
  for (const { count, weight } of ENEMY_COUNT_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) { enemyCount = count; break; }
  }
  if (maxEnemies) enemyCount = Math.min(enemyCount, maxEnemies);

  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push(generateEnemyRobot(highestAllyLevel, creaturePool));
  }
  return enemies;
}
```

**Step 3: Syntax check**

Run: `node --check src/game/robots.js`

**Step 4: Commit**

```bash
git add src/game/robots.js
git commit -m "feat: add creaturePool param for area-restricted enemy spawns"
```

---

### Task 5: Update exploration-service.js — Area selection and completion

**Files:**
- Modify: `src/game/services/exploration-service.js`

**Step 1: Update imports**

Replace ward imports with area imports:

```js
import {
  generateFloorRooms,
  getRoomEntryNarration,
  getRoomActions,
  AREAS,
  getAreaSelectionOptions,
  getAreaById
} from '../rooms.js';
```

Remove `STARTING_WARDS`, `getStartingWardOptions`, `getNextWardOptions`, `getWardInfo` imports.

**Step 2: Replace ward methods with area methods**

Replace `getStartingWardOptions()`, `selectStartingWard()`, `getNextWardOptions()`, `selectNextWard()` with a single unified `selectArea()`:

```js
  // ============ AREA SELECTION ============

  /**
   * Get area options for selection
   * @returns {Array} 2 random area options
   */
  getAreaOptions() {
    const excludeId = this.gm.run?.currentArea?.id || null;
    return getAreaSelectionOptions(excludeId);
  }

  /**
   * Select an area (works for both start and between areas)
   * @param {string} areaId - Area ID to select
   */
  selectArea(areaId) {
    if (!this.gm.run) {
      throw new Error('No active run');
    }

    const area = getAreaById(areaId);
    if (!area) {
      throw new Error(`Invalid area: ${areaId}`);
    }

    this.gm.run.currentArea = area;
    this.gm.run.areaPath.push(areaId);
    this.gm.run.areaSelectionRequired = false;
    this.gm.run.areaCleared = false;

    // Enter the area
    this.enterArea();

    logger.info('[Exploration] Area selected:', { area: areaId, areasCompleted: this.gm.run.areasCompleted });

    return {
      success: true,
      area,
      areasCompleted: this.gm.run.areasCompleted
    };
  }
```

**Step 3: Replace enterFloor() with enterArea()**

```js
  /**
   * Enter an area — generate rooms, set background, reset per-area state
   */
  enterArea() {
    if (!this.gm.run) {
      throw new Error('No active run');
    }

    const areaId = this.gm.run.currentArea?.id || 'unknown';

    // Reset per-area state
    this.gm.run.encountersCompleted = 0;
    this.gm.run.encountersNeeded = generateEncounterCount();
    this.gm.run.areaCleared = false;

    // Generate rooms for this area (no boss)
    this.gm.run.rooms = generateFloorRooms(areaId, this.gm.run.encountersNeeded, null, false);
    this.gm.run.currentRoom = 0;
    this.gm.run.roomsExplored = 0;
    this.gm.run.pendingBranch = false;
    this.gm.run.selectedRooms = [];

    // Set background: area-specific or fallback to floor1
    this.gm.run.background = `${areaId}.webp`;

    // Mark first room as explored
    if (this.gm.run.rooms.length > 0) {
      this.gm.run.rooms[0].explored = true;
      this.gm.run.roomsExplored = 1;
    }

    const areaName = this.gm.run.currentArea?.nameEn || areaId;
    this.gm.narrate(`${areaName}に到着した。探索を開始する...`);

    logger.info('[Exploration] Entered area:', { areaId, rooms: this.gm.run.rooms?.length });

    this.gm.emitState();

    return {
      areaId,
      totalRooms: this.gm.run.rooms.length,
      encountersNeeded: this.gm.run.encountersNeeded,
      firstRoom: this.gm.run.rooms[0]
    };
  }
```

**Step 4: Remove nextFloor() and continueEndless()**

Delete both methods entirely.

**Step 5: Update proceedToNextRoom() — area completion detection**

In `proceedToNextRoom()`, replace the boss room check (lines 250-253) with area completion detection. After `this.gm.run.currentRoom++`, before checking `nextRoom`, add:

```js
    // Check if we've run out of rooms (area complete)
    if (this.gm.run.currentRoom >= this.gm.run.rooms.length) {
      this.gm.run.areaCleared = true;
      this.gm.run.areasCompleted++;
      this.gm.run.stats.areasCleared = this.gm.run.areasCompleted;
      this.gm.run.areaSelectionRequired = true;

      // Check win condition
      if (this.gm.run.areasCompleted >= this.gm.run.areasToWin) {
        this.gm.run.gameVictoryPending = true;
      }

      const areaName = this.gm.run.currentArea?.nameEn || 'Unknown';
      this.gm.narrate(`${areaName}を制覇した！`);
      this.gm.emitState();

      logger.info('[Exploration] Area cleared:', { areasCompleted: this.gm.run.areasCompleted });

      return {
        areaCleared: true,
        areasCompleted: this.gm.run.areasCompleted,
        areasToWin: this.gm.run.areasToWin,
        gameVictory: this.gm.run.areasCompleted >= this.gm.run.areasToWin
      };
    }
```

Remove the old "Can't proceed from boss room" check.

Also update the background variant logic. Replace:
```js
    if (this.gm.run.floor > 7) {
      this.gm.run.background = `outskirts_${bgVariant}.webp`;
    } else {
      this.gm.run.background = `floor${this.gm.run.floor}_${bgVariant}.webp`;
    }
```
With:
```js
    const areaId = this.gm.run.currentArea?.id || 'floor1';
    this.gm.run.background = `${areaId}_${bgVariant}.webp`;
```

Do the same in `selectBranch()`.

**Step 6: Update quiz reward credits**

In `useQuizReward()`, replace `const floor = this.gm.run.floor || 1;` with `const areaNum = (this.gm.run.areasCompleted || 0) + 1;` and use `areaNum` instead of `floor`.

In `completeWordDiscovery()`, replace `this.gm.run.floor` with `(this.gm.run.areasCompleted || 0) + 1` for credit calculation.

**Step 7: Syntax check**

Run: `node --check src/game/services/exploration-service.js`

**Step 8: Commit**

```bash
git add src/game/services/exploration-service.js
git commit -m "refactor: replace ward/floor exploration with area loop in exploration service"
```

---

### Task 6: Update loop.js — GameManager area wiring

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Update imports**

Replace `getStartingWardOptions` with `getAreaSelectionOptions`:

```js
import { getRoomActions, getAreaSelectionOptions } from './rooms.js';
```

**Step 2: Update startRun()**

Replace `wardSelectionRequired` with `areaSelectionRequired`. Replace `getStartingWardOptions()` with `getAreaSelectionOptions()`:

```js
  startRun(levelId = null, starterId = null, starterIds = null) {
    // ... (keep existing checks and player init)

    // Area selection is required at start
    this.run.areaSelectionRequired = true;

    // ... (keep robot init)

    this.emitState();

    return {
      run: this.run,
      areaSelectionRequired: true,
      areaOptions: getAreaSelectionOptions()
    };
  }
```

**Step 3: Replace ward methods with area methods**

Replace the ward methods section:

```js
  // ============ AREA SELECTION ============

  getAreaOptions() {
    return this.explorationService.getAreaOptions();
  }

  selectArea(areaId) {
    return this.explorationService.selectArea(areaId);
  }
```

Remove: `getStartingWardOptions()`, `selectStartingWard()`, `getNextWardOptions()`, `selectNextWard()`, `enterFloor()`.

**Step 4: Remove floor progression methods**

Remove `nextFloor()`, `continueEndless()`, and `returnToHubFromVictory()`.

**Step 5: Update startRobotEncounter() — pass creature pool**

In `startRobotEncounter()` (around line 695), pass the current area's creatures:

```js
    const creaturePool = this.run.currentArea?.creatures || null;
    const enemyRobots = generateEnemyRobots(highestLevel, {
      maxEnemies: isFirstBattle ? 2 : undefined,
      creaturePool
    });
```

**Step 6: Update getState()**

Replace ward fields with area fields in the run state output:

```js
      run: this.run ? {
        // Area system
        currentArea: this.run.currentArea,
        areasCompleted: this.run.areasCompleted,
        areasToWin: this.run.areasToWin,
        areaPath: this.run.areaPath,
        areaSelectionRequired: this.run.areaSelectionRequired,
        areaCleared: this.run.areaCleared,
        background: this.run.background || 'floor1.webp',
        // Room state
        currentRoom: this.run.currentRoom,
        totalRooms: this.run.rooms?.length || 0,
        roomsExplored: this.run.roomsExplored,
        encountersCompleted: this.run.encountersCompleted,
        encountersNeeded: this.run.encountersNeeded,
        active: this.run.active,
        levelId: this.run.levelId,
        stats: this.run.stats,
        pendingBranch: this.run.pendingBranch,
        selectedRooms: this.run.selectedRooms,
        rooms: this.run.rooms,
        runStats: this.run.runStats,
        robotParty: this.run.robotParty,
        itemBuffs: this.run.itemBuffs || null,
        npcDialogue: this.run?.npcDialogue || null,
        postCombatShop: null,
        startingChipShop: null
      } : null,
```

Remove `floor`, `maxFloors`, `currentWard`, `wardPath`, `wardSelectionRequired`, `bossDefeated`.

**Step 7: Update awardRunEssence()**

Pass `areasCompleted` instead of `floor`:

```js
    const essence = calculateEssenceReward(
      this.run.stats,
      this.run.areasCompleted || 0,
      isVictory
    );
```

**Step 8: Update updateLifetimeStats()**

Replace `this.run.floor > stats.highestFloor` with area tracking:

```js
    const areasCleared = this.run.areasCompleted || 0;
    if (areasCleared > (stats.highestAreasCleared || 0)) {
      stats.highestAreasCleared = areasCleared;
    }
```

**Step 9: Update forfeitRun() log**

Replace `floor` reference with `areasCompleted`.

**Step 10: Syntax check**

Run: `node --check src/game/loop.js`

**Step 11: Commit**

```bash
git add src/game/loop.js
git commit -m "refactor: wire area loop system into GameManager"
```

---

### Task 7: Update combat-service.js — Remove boss/floor progression

**Files:**
- Modify: `src/game/services/combat-service.js`

**Step 1: Update handleVictory()**

In `handleVictory()`, remove the boss floor progression logic (the block that checks `isBoss`, sets `wardSelectionRequired`, checks `floor === 7`, etc.). Since there are no bosses, the `isBoss` flag from rooms is always false. Simplify:

- Remove `getNextWardOptions` import if used
- Remove the `if (isBoss)` block that handles floor complete / game victory / ward selection
- Keep `this.gm.combat.active = false` and normal victory logic

**Step 2: Update handleGameVictory()**

Change `this.gm.run.stats.floorsCleared = 7` to `this.gm.run.stats.areasCleared = this.gm.run.areasCompleted || 0`.

**Step 3: Update handleDefeat()**

Replace `floor` in logger with `areasCompleted`.

**Step 4: Syntax check**

Run: `node --check src/game/services/combat-service.js`

**Step 5: Commit**

```bash
git add src/game/services/combat-service.js
git commit -m "refactor: remove boss/floor progression from combat service"
```

---

### Task 8: Update server routes — Area API endpoints

**Files:**
- Modify: `src/routes/game/run.js`

**Step 1: Replace ward routes with area routes**

Replace the four ward routes (`/starting-wards`, `/select-starting-ward`, `/next-ward-options`, `/select-next-ward`) with two area routes:

```js
  // Area selection
  router.get('/area-options', (req, res) => {
    try {
      const options = req.gameManager.getAreaOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-area', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { areaId } = req.body;
      const result = gameManager.selectArea(areaId);
      req.saveGame();
      res.json({
        ...result,
        state: req.getEnrichedGameState()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 2: Remove floor routes**

Remove `/next-floor` and `/continue-endless` routes. Remove or update `/enter-floor` route.

**Step 3: Syntax check**

Run: `node --check src/routes/game/run.js`

**Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "refactor: replace ward API routes with area-options and select-area"
```

---

### Task 9: Update frontend api.js — Area API calls

**Files:**
- Modify: `public/js/api.js`

**Step 1: Replace ward API functions with area functions**

Replace `getStartingWards()`, `selectStartingWard()`, `getNextWardOptions()`, `selectNextWard()` with:

```js
/**
 * Get area options for selection
 * @returns {Promise<Array>} Array of area options
 */
async function getAreaOptions() {
  try {
    const response = await fetch('/api/game/area-options', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch area options:', error.message);
    return [];
  }
}

/**
 * Select an area
 * @param {string} areaId - Area identifier
 * @returns {Promise<object>} Result with state
 */
async function selectArea(areaId) {
  try {
    const response = await fetch('/api/game/select-area', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ areaId })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to select area:', error.message);
    return { error: 'Network error' };
  }
}
```

**Step 2: Remove floor API functions**

Remove `nextFloor()`, `continueEndless()`, `returnToHubFromVictory()`.

**Step 3: Update exports**

Replace the old exports with new ones:

```js
  getAreaOptions,
  selectArea,
```

Remove: `getStartingWards`, `selectStartingWard`, `getNextWardOptions`, `selectNextWard`, `nextFloor`, `continueEndless`, `returnToHubFromVictory`.

**Step 4: Syntax check**

Run: `node --check public/js/api.js`

**Step 5: Commit**

```bash
git add public/js/api.js
git commit -m "refactor: replace ward API calls with area-options and select-area"
```

---

### Task 10: Update frontend game.js — Phase routing and callbacks

**Files:**
- Modify: `public/game.js`

**Step 1: Update imports**

Replace ward API imports with area imports:

```js
  getAreaOptions as apiGetAreaOptions,
  selectArea as apiSelectArea,
```

Remove: `getStartingWards as apiGetStartingWards`, `selectStartingWard as apiSelectStartingWard`, `getNextWardOptions as apiGetNextWardOptions`, `selectNextWard as apiSelectNextWard`, `nextFloor as apiNextFloor`, `continueEndless as apiContinueEndless`, `returnToHubFromVictory as apiReturnToHubFromVictory`.

**Step 2: Remove floor helper functions**

Delete `nextFloor()`, `continueEndless()`, `returnToHubFromVictory()` wrapper functions (around lines 651-673).

**Step 3: Update phase routing in updateGameContent()**

Replace `'ward_selection'` with `'area_selection'`:

```js
    case 'area_selection':
      explorationUI.renderAreaSelection();
      break;
```

Replace `'floor_complete'` with `'area_complete'`:

```js
    case 'area_complete':
      explorationUI.renderAreaComplete();
      break;
```

Remove `'boss_ready'` case.

Keep `'run_complete'` case as-is.

**Step 4: Update phase checks**

Replace `gameState.phase === 'ward_selection'` with `gameState.phase === 'area_selection'` in `updateChipRow()` and `updatePlayerHP()`.

**Step 5: Update explorationUI.init() callbacks**

Replace ward callbacks with area callbacks:

```js
    apiGetAreaOptions,
    apiSelectArea,
```

Remove: `nextFloor`, `continueEndless`, `returnToHubFromVictory`, `apiGetStartingWards`, `apiSelectStartingWard`, `apiGetNextWardOptions`, `apiSelectNextWard`.

Add: `apiReturnToHub: returnToHub`.

**Step 6: Syntax check**

Run: `node --check public/game.js`

**Step 7: Commit**

```bash
git add public/game.js
git commit -m "refactor: update game.js phase routing for area system"
```

---

### Task 11: Update frontend exploration.js — Area UI

**Files:**
- Modify: `public/js/ui/exploration.js`

**Step 1: Update callback variables**

Replace ward callback variables at module top:

Remove: `nextFloor`, `continueEndless`, `returnToHubFromVictory`, `apiGetStartingWards`, `apiSelectStartingWard`, `apiGetNextWardOptions`, `apiSelectNextWard`

Add: `apiGetAreaOptions`, `apiSelectArea`, `apiReturnToHub`

**Step 2: Update init()**

Update callback assignments:

```js
  apiGetAreaOptions = callbacks.apiGetAreaOptions;
  apiSelectArea = callbacks.apiSelectArea;
  apiReturnToHub = callbacks.apiReturnToHub;
```

Remove old ward callback assignments.

**Step 3: Replace renderWardSelection() with renderAreaSelection()**

```js
/** Area selection — show area cards, proceed button */
export async function renderAreaSelection() {
  const gameState = getGameState();

  if (gameState.run?.startingChipShop?.active) {
    return;
  }

  const areas = await apiGetAreaOptions();

  if (!areas || !areas.length) {
    actions.setContent('<p style="text-align:center">No areas available</p>');
    return;
  }

  let selectedAreaId = null;

  const areaHtml = areas.map(a => `
    <div class="ward-option" data-area-id="${a.id}">
      <strong>${a.nameEn || a.name}</strong>
      <small>${a.theme || ''}</small>
    </div>
  `).join('');

  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Area ${areasCompleted + 1} / ${areasToWin}
    </p>
    <div class="ward-selection-list">${areaHtml}</div>
    <button class="action-btn action-btn-primary" id="area-proceed-btn" disabled>進む</button>
  `);

  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedAreaId = el.dataset.areaId;
      const btn = document.getElementById('area-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('area-proceed-btn')?.addEventListener('click', async () => {
    if (!selectedAreaId) return;
    const result = await apiSelectArea(selectedAreaId);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}
```

**Step 4: Replace renderFloorComplete() with renderAreaComplete()**

```js
/** Area complete — proceed to area selection */
export function renderAreaComplete() {
  const gameState = getGameState();
  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      Area ${areasCompleted} / ${areasToWin} cleared!
    </p>
    <button class="action-btn action-btn-primary" id="next-area-btn">次のエリアへ</button>
  `);

  document.getElementById('next-area-btn')?.addEventListener('click', () => {
    // Transition to area selection by setting the flag
    // The server already set areaSelectionRequired = true
    updateUI();
  });
}
```

**Step 5: Update renderRunComplete()**

Replace endless mode option with just return to hub:

```js
export function renderRunComplete() {
  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      ゲームクリア！おめでとう！
    </p>
    <button class="action-btn action-btn-primary" id="victory-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('victory-hub-btn')?.addEventListener('click', () => {
    apiReturnToHub();
  });
}
```

**Step 6: Remove renderBossReady()**

Delete the entire function — bosses are gone.

**Step 7: Syntax check**

Run: `node --check public/js/ui/exploration.js`

**Step 8: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "refactor: replace ward/boss UI with area selection and area complete"
```

---

### Task 12: Cleanup and integration test

**Step 1: Run unit tests**

Run: `npm run test:unit`

Check for failures related to ward/floor/boss references in tests. Fix any broken imports.

**Step 2: Syntax-check all modified files**

```bash
node --check src/game/rooms.js && \
node --check src/game/state.js && \
node --check src/game/phase-machine.js && \
node --check src/game/robots.js && \
node --check src/game/services/exploration-service.js && \
node --check src/game/loop.js && \
node --check src/game/services/combat-service.js && \
node --check src/routes/game/run.js && \
echo "All syntax checks passed"
```

**Step 3: Start server and verify**

```bash
npm start &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`

**Step 4: Fix any remaining references**

Search for remaining ward/floor references that need updating:

```bash
grep -rn "wardSelection\|currentWard\|wardPath\|WARD_INFO\|WARD_PATHS\|STARTING_WARDS\|getWardTier\|getWardInfo\|bossDefeated\|isBossRoom\|boss_ready\|floor_complete\|BOSS_READY\|FLOOR_COMPLETE\|BOSS_DEFEATED" src/ public/js/ --include="*.js"
```

Fix any remaining references found.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: clean up remaining ward/floor references across codebase"
```

---

### Task 13: Update NPC service floor reference

**Files:**
- Modify: `src/game/services/npc-service.js` (if it uses `floor`)

**Step 1: Check and update**

The `selectNpcForEncounter(this.run.floor, usedNpcIds)` call in `loop.js` passes `floor`. Since floor no longer exists, pass `areasCompleted + 1` instead.

In `loop.js` `startRobotEncounter()`:
```js
    const npc = selectNpcForEncounter(this.run.areasCompleted + 1, usedNpcIds);
```

**Step 2: Commit**

```bash
git add src/game/loop.js
git commit -m "fix: pass areasCompleted to NPC service instead of floor"
```

---

### Task 14: Final verification commit

**Step 1: Run all tests**

```bash
npm run test:unit
```

**Step 2: Make final commit**

```bash
git add -A
git commit -m "feat: area loop system — replace wards with area-based progression

Areas loaded from data/new-areas-staging.json. Each area has 8-12 mixed
rooms (no boss). After clearing an area, pick 1 of 2 random areas.
Beat 10 areas to win. Enemy spawns restricted to area creature list."
```
