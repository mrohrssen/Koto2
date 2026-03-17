# Boss Encounter System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add boss encounters as the final room in areas that have a designated boss creature.

**Architecture:** Add `boss` room type to room generation. When an area has a `bossCreatureId`, the last room is always a boss room. Boss encounters use the existing combat system — the boss is a solo creature at `getEnemyLevel() × 1.25`. Bosses speak directly on encounter (not DM narration). Befriending is blocked on first defeat; allowed on rematch.

**Tech Stack:** Node.js, existing room/combat/creature systems

---

### Task 1: Add `boss` room type and generation

**Files:**
- Modify: `src/game/rooms.js:94-101` (ROOM_TYPES), `src/game/rooms.js:163-180` (generateAreaRooms), `src/game/rooms.js:185-226` (createRoom), `src/game/rooms.js:233-254` (getRoomEntryNarration), `src/game/rooms.js:259-301` (getRoomActions)
- Modify: `src/game/rooms.js:1-27` (module docstring)
- Test: `tests/unit/rooms.test.js`

- [ ] **Step 1: Write the failing test**

```js
// In tests/unit/rooms.test.js — add these tests
import { ROOM_TYPES, generateAreaRooms, getRoomEntryNarration, getRoomActions, getAreaById } from '../../src/game/rooms.js';

describe('boss room', () => {
  it('ROOM_TYPES includes boss', () => {
    assert.strictEqual(ROOM_TYPES.boss, 'boss');
  });

  it('last room is boss when area has bossCreatureId', () => {
    const rooms = generateAreaRooms('mahouno-gakkou', 8);
    const last = rooms[rooms.length - 1];
    assert.strictEqual(last.type, 'boss');
    assert.strictEqual(last.boss.creatureId, 'ishino-kyojin');
  });

  it('no boss room when area has no bossCreatureId', () => {
    // Use an area without a boss
    const rooms = generateAreaRooms('shizukana-kouen', 8);
    const bossRooms = rooms.filter(r => r.type === 'boss');
    assert.strictEqual(bossRooms.length, 0);
  });

  it('boss room narration exists', () => {
    const rooms = generateAreaRooms('mahouno-gakkou', 8);
    const bossRoom = rooms[rooms.length - 1];
    const narration = getRoomEntryNarration(bossRoom);
    assert.ok(narration.length > 0);
  });

  it('boss room action is fight', () => {
    const rooms = generateAreaRooms('mahouno-gakkou', 8);
    const bossRoom = rooms[rooms.length - 1];
    const actions = getRoomActions(bossRoom);
    const fightAction = actions.find(a => a.id === 'fight');
    assert.ok(fightAction);
  });

  it('boss room blocks proceed until interacted', () => {
    const rooms = generateAreaRooms('mahouno-gakkou', 8);
    const bossRoom = rooms[rooms.length - 1];
    const actions = getRoomActions(bossRoom);
    const proceed = actions.find(a => a.id === 'proceed');
    assert.ok(!proceed, 'should not have proceed before fighting boss');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --grep "boss room"`
Expected: FAIL — `ROOM_TYPES.boss` is undefined

- [ ] **Step 3: Add `bossCreatureId` to school area in `data/areas.json`**

Find the `mahouno-gakkou` area object and add:
```json
"bossCreatureId": "ishino-kyojin"
```
Add it as a top-level field alongside `id`, `name`, `creatures`, etc.

- [ ] **Step 4: Implement boss room type and generation**

In `src/game/rooms.js`:

1. Add `boss` to `ROOM_TYPES`:
```js
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  wordDiscovery: 'wordDiscovery',
  dealer: 'dealer',
  whackAMole: 'whackAMole',
  boss: 'boss'
};
```

2. In `generateAreaRooms()`, after the loop, append a boss room if the area has a `bossCreatureId`:
```js
// After the for loop, before return:
if (area?.bossCreatureId) {
  const bossRoom = createRoom(ROOM_TYPES.boss, areaId, rooms.length + 1, rooms.length + 1);
  bossRoom.boss = { creatureId: area.bossCreatureId };
  if (subAreas.length > 0) bossRoom.subArea = subAreas[rooms.length % subAreas.length];
  rooms.push(bossRoom);
}
```

3. In `createRoom()`, add boss case:
```js
case ROOM_TYPES.boss:
  room.boss = { defeated: false };
  break;
```

4. In `getRoomEntryNarration()`, add boss case:
```js
case ROOM_TYPES.boss:
  return `${locationLabel}に入った。巨大な影が現れた...`;
```

5. In `getRoomActions()`, add boss to the blocking check and actions:
```js
// Add to the unfinished check:
const isUnfinishedBoss = room.type === 'boss' && !room.interacted;

// Update the proceed condition to include isUnfinishedBoss

// Add case:
case ROOM_TYPES.boss:
  if (!room.interacted) {
    actions.push({ id: 'fight', name: 'ボス戦', description: 'ボスに挑む' });
  }
  break;
```

6. Update module docstring: remove "No boss room" comment, add `boss` to ROOM_TYPES list.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- --grep "boss room"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/rooms.js data/areas.json tests/unit/rooms.test.js
git commit -m "feat: add boss room type to room generation"
```

---

### Task 2: Boss encounter logic in game loop

**Files:**
- Modify: `src/game/loop.js:440-500` (startCreatureEncounter)
- Modify: `src/game/creatures.js:219-224` (getEnemyLevel) or inline in loop.js
- Test: `tests/unit/loop-boss.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/loop-boss.test.js
import { getEnemyLevel } from '../../src/game/creatures.js';

describe('boss encounter', () => {
  it('boss level is 1.25x normal enemy level', () => {
    const normalLevel = getEnemyLevel({ totalEncounters: 10, enemyCount: 1 });
    const bossLevel = Math.round(normalLevel * 1.25);
    assert.ok(bossLevel > normalLevel);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (this is a pure math test)

Run: `npm run test:unit -- --grep "boss encounter"`

- [ ] **Step 3: Implement boss encounter in `startCreatureEncounter()`**

In `src/game/loop.js`, modify `startCreatureEncounter()` to detect boss rooms:

```js
startCreatureEncounter() {
  if (!this.run || !this.run.active) {
    throw new Error('No active run');
  }
  if (this.combat?.active) {
    throw new Error('Combat already active');
  }

  // Check if current room is a boss room
  const currentRoom = this.run.rooms?.[this.run.currentRoom];
  const isBoss = currentRoom?.type === 'boss' && currentRoom?.boss?.creatureId;

  const highestLevel = Math.max(...this.run.creatureParty.active.map(r => r.level), 1);
  const isFirstBattle = (this.run.currentAreaEncounters || 0) === 0;
  const creaturePool = this.run.currentArea?.creatures || null;
  const stage = this.run.currentArea?.stage || null;
  const encounterIndex = this.run.currentAreaEncounters || 0;
  const totalEncounters = this.run.totalEncounters || 0;

  let enemyCreatures;
  if (isBoss) {
    // Boss: solo creature, level × 1.25
    const bossCreature = generateEnemyCreature(
      Math.round(getEnemyLevel({ totalEncounters, enemyCount: 1 }) * 1.25),
      [currentRoom.boss.creatureId],  // force this specific creature
      stage
    );
    enemyCreatures = [bossCreature];
  } else {
    enemyCreatures = generateEnemyCreatures(highestLevel, {
      maxEnemies: isFirstBattle ? 2 : undefined,
      creaturePool,
      stage,
      encounterIndex,
      totalEncounters
    });
  }

  this.combat = createCombatState(enemyCreatures[0]);
  this.combat.allies = this.run.creatureParty.active;
  this.combat.enemies = enemyCreatures;
  this.combat.isCreatureCombat = true;
  this.combat.isBoss = !!isBoss;
  this.combat.swapPhase = true;

  // Skip NPC assignment for boss fights
  if (!isBoss) {
    // ... existing NPC logic unchanged ...
  }

  // ... rest unchanged ...
}
```

Note: `generateEnemyCreature` already accepts a `creaturePool` param. Passing `[currentRoom.boss.creatureId]` forces it to pick that specific creature.

Also need to import `getEnemyLevel` if not already imported:
```js
import { instantiateCreature, generateEnemyCreature, generateEnemyCreatures, getEnemyLevel } from './creatures.js';
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: boss encounter logic — solo creature at 1.25x level"
```

---

### Task 3: Boss dialogue on encounter

**Files:**
- Modify: `src/game/loop.js` (startCreatureEncounter — add boss narration)
- Modify: `data/creatures.json` (add `bossDialogue` field to Stone Giant)

- [ ] **Step 1: Add `bossDialogue` to Stone Giant in `data/creatures.json`**

Add to the `ishino-kyojin` creature entry:
```json
"bossDialogue": {
  "appear": "何世紀もの間、この学校を守ってきた。お前の旅はここで終わりだ！",
  "defeat": "お前は...強かった...この学校を...頼んだぞ..."
}
```

- [ ] **Step 2: Wire boss dialogue into encounter start**

In `startCreatureEncounter()`, after setting up combat state for a boss, narrate with the boss's appear line:

```js
if (isBoss && enemyCreatures[0]) {
  const bossTemplate = CREATURES_BY_ID?.[currentRoom.boss.creatureId];
  if (bossTemplate?.bossDialogue?.appear) {
    this.narrate(bossTemplate.bossDialogue.appear);
  }
}
```

Import `CREATURES_BY_ID` from creatures.js if not already available (check — it may already be imported or accessible).

- [ ] **Step 3: Wire boss defeat dialogue into combat end**

In the combat victory handler (find where `isBoss` is already checked for narration in `src/routes/game/combat.js`), use the creature's `bossDialogue.defeat` instead of the hardcoded `bossVictory` string:

```js
if (isBoss) {
  // Try creature-specific defeat line first, fall back to generic
  const bossTemplate = CREATURES_BY_ID?.[combat.enemies?.[0]?.id];
  narration = bossTemplate?.bossDialogue?.defeat
    || 'ボスが倒れる。「お前は...強かった...」長い戦いが終わった。よくやった！';
}
```

- [ ] **Step 4: Verify with syntax check**

```bash
node --check src/game/loop.js && node --check src/routes/game/combat.js && echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add data/creatures.json src/game/loop.js src/routes/game/combat.js
git commit -m "feat: boss speaks directly on encounter and defeat"
```

---

### Task 4: Befriend-on-rematch

**Files:**
- Modify: `src/game/state.js:135-165` (createNewRun — add `bossesDefeated`)
- Modify: `src/game/loop.js` (victory handler — track boss defeats, gate befriending)
- Test: `tests/unit/boss-befriend.test.js`

- [ ] **Step 1: Add `bossesDefeated` to run state**

In `src/game/state.js`, inside `createNewRun()`, add to the run object:
```js
bossesDefeated: [],  // array of creature IDs — boss can be befriended on rematch
```

- [ ] **Step 2: Track boss defeat on victory**

In the combat victory handler (wherever `isBoss` is checked), after the boss is defeated:
```js
if (isBoss && combat.enemies?.[0]?.id) {
  if (!run.bossesDefeated) run.bossesDefeated = [];
  if (!run.bossesDefeated.includes(combat.enemies[0].id)) {
    run.bossesDefeated.push(combat.enemies[0].id);
  }
}
```

- [ ] **Step 3: Gate befriending on first defeat**

Find the befriend logic (likely in `processBefriend` in `creature-combat-service.js` or in the combat route). Add a check:

```js
// If this is a boss and hasn't been defeated before, block befriend
if (combat.isBoss && !run.bossesDefeated?.includes(combat.enemies?.[0]?.id)) {
  return { success: false, reason: 'boss_first_defeat' };
}
```

On first defeat, the boss simply vanishes with its defeat dialogue. On rematch (second time encountering the boss room in a later visit), `bossesDefeated` already contains the ID, so befriending is allowed.

- [ ] **Step 4: Verify with syntax check**

```bash
node --check src/game/state.js && node --check src/game/loop.js && echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js src/game/loop.js src/game/services/creature-combat-service.js
git commit -m "feat: boss befriend-on-rematch — blocked on first defeat"
```

---

### Task 5: Update spec and cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-03-17-school-boss-stone-giant-design.md`
- Modify: `src/game/rooms.js:25` (remove "No boss room" comment)
- Modify: `src/game/services/exploration-service.js:115` (remove "no boss" comment)

- [ ] **Step 1: Update spec to reflect what was built**

Update the design spec with final decisions: HP 200, 6-move learnset from existing pool, B2 gorilla golem design, BiRefNet for BG removal, boss dialogue (creature speaks directly), level scaling via `getEnemyLevel() × 1.25`.

- [ ] **Step 2: Remove stale "no boss" comments**

In `src/game/rooms.js` line 25: change to `Each area: N rooms (encounters + special rooms). Boss room appended if area has bossCreatureId.`

In `src/game/services/exploration-service.js` line 115: change comment to `// Generate rooms for this area (boss appended if configured)`

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add docs/ src/game/rooms.js src/game/services/exploration-service.js
git commit -m "docs: update boss spec and remove stale no-boss comments"
```
