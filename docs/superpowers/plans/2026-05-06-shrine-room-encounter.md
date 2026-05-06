# Shrine Room Encounter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild shrine rooms as modern PixiJS parallax support encounters with a 5% room-generation chance, one i+1 greeting, and three reward options.

**Architecture:** Keep `shrine` as the room phase for save compatibility, but replace the old single-target shrine UI with a friendly NPC-style flow. Server-side reward logic lives in `ExplorationService`; shrine greeting selection lives in `run.js` through the static frame pipeline; the frontend `renderShrine()` mirrors `renderFriendlyNpc()` with scene-owned Pixi NPC sprites and `renderChoices()` cards.

**Tech Stack:** Node.js ES modules, Express routes, static dialogue frames, PixiJS scene ownership, native `node:test`, c8, Vite.

---

## File Structure

- Modify `src/game/rooms.js`: add a 5% generated shrine branch, modern shrine state, and completed-state actions.
- Modify `src/game/phase-machine.js`: treat `shrine.completed` and legacy `shrine.used` as complete.
- Modify `src/game/services/exploration-service.js`: implement `useShrineReward()` for all three shrine rewards and keep `useShrine()` as a level-up compatibility wrapper.
- Modify `src/game/loop.js`: expose `useShrineReward()` from `GameManager`.
- Modify `src/game/dialogue-loader.js`: load and export `shrineGreeting` frames.
- Modify `data/dialogue/frame-sources.json`: add shrine greeting source frames.
- Regenerate `data/dialogue/frames.json`: generated output from `node scripts/tokenize-static.js`.
- Modify `src/routes/game/run.js`: add `/shrine-offers` and `/shrine-choose`; keep `/shrine-upgrade` as compatibility.
- Modify `public/js/api.js`: add `getShrineOffers()` and `chooseShrineReward()`.
- Modify `public/js/ui/exploration.js`: replace old `renderShrine()` with an encounter-style renderer.
- Modify `public/js/ui/room-transition.js`: slide in `shrine_fox.webp` for shrine rooms.
- Modify `public/game.js`: pass shrine APIs to exploration UI and remove old shrine background handling.
- Create `tests/unit/game/shrine-room.test.js`: room generation, phase, and reward service tests.
- Create `tests/unit/routes/shrine-room-routes.test.js`: shrine route tests.
- Create `tests/unit/ui/exploration-shrine.test.js`: frontend renderer tests.
- Modify `tests/unit/game/rooms-koto2.test.js`: allow generated shrine as an enabled room type.
- Modify `docs/playtest-guide.md`: document shrine room manual checks.

---

### Task 1: Room Generation And Phase State

**Files:**
- Modify: `tests/unit/game/rooms-koto2.test.js`
- Create: `tests/unit/game/shrine-room.test.js`
- Modify: `src/game/rooms.js`
- Modify: `src/game/phase-machine.js`

- [ ] **Step 1: Update enabled room type tests**

In `tests/unit/game/rooms-koto2.test.js`, update the helpers:

```js
function assertOnlyEnabledRoomTypes(rooms, fixedIndices) {
  const allowedTypes = new Set(['encounter', 'friendlyNpc', 'whackAMole', 'shrine']);
  const otherRooms = rooms.filter((_, i) => !fixedIndices.has(i));
  for (const room of otherRooms) {
    assert.ok(
      allowedTypes.has(room.type),
      `Unexpected room type: ${room.type} at room ${room.roomNumber}`
    );
  }
}

function assertNoDisabledRoomTypes(rooms) {
  const disabledTypes = ['quiz', 'wordDiscovery', 'dealer', 'speedReviewRoom'];
  for (const room of rooms) {
    assert.ok(!disabledTypes.includes(room.type), `Disabled room type found: ${room.type}`);
  }
}
```

Then add this helper:

```js
function assertShrineRoomState(rooms) {
  for (const room of rooms.filter(r => r.type === 'shrine')) {
    assert.deepEqual(room.shrine, {
      used: false,
      completed: false,
      chosenReward: null,
      greeting: null
    });
  }
}
```

Add one assertion in each area block:

```js
it('shrine rooms have modern shrine state when generated', () => {
  assertShrineRoomState(generateAreaRooms('hajimari-no-hiroba'));
});
```

For Wild Plains, use:

```js
it('shrine rooms have modern shrine state when generated', () => {
  assertShrineRoomState(generateAreaRooms('wild-plains'));
});
```

- [ ] **Step 2: Add dedicated shrine room tests**

Create `tests/unit/game/shrine-room.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TYPES, createRoom, generateAreaRooms, getRoomActions } from '../../../src/game/rooms.js';
import { derivePhase } from '../../../src/game/phase-machine.js';

describe('Shrine Room', () => {
  it('createRoom creates modern shrine state', () => {
    const room = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 3, 10);

    assert.equal(room.type, ROOM_TYPES.shrine);
    assert.deepEqual(room.shrine, {
      used: false,
      completed: false,
      chosenReward: null,
      greeting: null
    });
  });

  it('uses the 5% shrine branch without replacing fixed npcBattle or boss slots', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.01;
    try {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[5].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[11].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[17].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[23].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[29].type, ROOM_TYPES.boss);

      const fixed = new Set([5, 11, 17, 23, 29]);
      const generatedRooms = rooms.filter((_, index) => !fixed.has(index));
      assert.ok(generatedRooms.every(room => room.type === ROOM_TYPES.shrine));
    } finally {
      Math.random = originalRandom;
    }
  });

  it('shows shrine action before completion and proceed after completion', () => {
    const active = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 10);
    assert.ok(getRoomActions(active).find(action => action.id === 'shrine_reward'));
    assert.equal(getRoomActions(active).find(action => action.id === 'proceed'), undefined);

    const complete = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 10);
    complete.interacted = true;
    complete.shrine.completed = true;
    complete.shrine.used = true;
    assert.ok(getRoomActions(complete).find(action => action.id === 'proceed'));
    assert.equal(getRoomActions(complete).find(action => action.id === 'shrine_reward'), undefined);
  });

  it('derives shrine phase only while the shrine is unfinished', () => {
    assert.equal(derivePhase({
      run: {
        currentRoom: 0,
        rooms: [{ type: ROOM_TYPES.shrine, interacted: false, shrine: { completed: false, used: false } }]
      }
    }), 'shrine');

    assert.equal(derivePhase({
      run: {
        currentRoom: 0,
        rooms: [{ type: ROOM_TYPES.shrine, interacted: true, shrine: { completed: true, used: true } }]
      }
    }), 'room');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- --test-name-pattern "Koto2 area room generation|Shrine Room"
```

Expected: FAIL because `createRoom()` still returns old shrine state, generated Koto2 rooms exclude shrine, `shrine_reward` does not exist, and phase derivation ignores `shrine.completed`.

- [ ] **Step 4: Implement modern shrine room generation**

In `src/game/rooms.js`, update the Koto2 random branch:

```js
      const roll = Math.random();
      if (roll < 0.05) {
        type = ROOM_TYPES.shrine;
      } else if (roll < 0.15) {
        type = ROOM_TYPES.whackAMole;
      } else if (roll < 0.60) {
        type = ROOM_TYPES.encounter;
      } else {
        type = ROOM_TYPES.friendlyNpc;
      }
```

Update the shrine case in `createRoom()`:

```js
    case ROOM_TYPES.shrine:
      room.shrine = { used: false, completed: false, chosenReward: null, greeting: null };
      break;
```

In `getRoomActions()`, add:

```js
  const isUnfinishedShrine = room.type === ROOM_TYPES.shrine
    && !room.interacted
    && room.shrine?.completed !== true
    && room.shrine?.used !== true;
```

Include `isUnfinishedShrine` in the proceed guard:

```js
  if (!isUnfinishedEncounter && !isUnfinishedShrine && !isUnfinishedWordDiscovery && !isUnfinishedDealer && !isUnfinishedSkillMaster && !isUnfinishedWhackAMole && !isUnfinishedSpeedReviewRoom && !isUnfinishedBoss && !isUnfinishedFriendlyNpc && !isUnfinishedNpcBattle) {
    actions.push({ id: 'proceed', name: '進む', description: '次のエリアへ進む' });
  }
```

Replace the shrine action case:

```js
    case ROOM_TYPES.shrine:
      if (isUnfinishedShrine) {
        actions.push({ id: 'shrine_reward', name: '祈る', description: '狐の祠に祈る' });
      }
      break;
```

In `src/game/phase-machine.js`, update shrine derivation:

```js
    if (currentRoom.type === 'shrine'
      && !currentRoom.interacted
      && currentRoom.shrine?.completed !== true
      && currentRoom.shrine?.used !== true) return 'shrine';
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- --test-name-pattern "Koto2 area room generation|Shrine Room"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/rooms.js src/game/phase-machine.js tests/unit/game/rooms-koto2.test.js tests/unit/game/shrine-room.test.js
git commit -m "feat: add shrine support room generation"
```

---

### Task 2: Shrine Reward Service

**Files:**
- Modify: `tests/unit/game/shrine-room.test.js`
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/game/loop.js`

- [ ] **Step 1: Add reward service tests**

In `tests/unit/game/shrine-room.test.js`, update the import block to include `ExplorationService`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TYPES, createRoom, generateAreaRooms, getRoomActions } from '../../../src/game/rooms.js';
import { derivePhase } from '../../../src/game/phase-machine.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
```

Append this helper and test block after the existing `describe('Shrine Room', ...)` block:

```js
function makeShrineService(creatureParty) {
  const room = createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 10);
  const gm = {
    run: {
      currentRoom: 0,
      rooms: [room],
      creatureParty,
      itemBuffs: {}
    },
    narrate: () => {},
    emitState: () => {}
  };
  return { room, service: new ExplorationService(gm) };
}

describe('Shrine Reward Service', () => {
  it('heal_all heals active and reserve living creatures by 50% without reviving fainted creatures', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, attack: 5 };
    const reserve = { id: 'mizu', uid: 'reserve-mizu', nameEn: 'Mizu', hp: 5, maxHp: 30, mp: 2, maxMp: 10, level: 2, attack: 4 };
    const fainted = { id: 'ki', uid: 'reserve-ki', nameEn: 'Ki', hp: 0, maxHp: 50, mp: 0, maxMp: 12, level: 2, attack: 4 };
    const { room, service } = makeShrineService({ active: [active], reserves: [reserve, fainted] });

    const result = service.useShrineReward('heal_all');

    assert.equal(active.hp, 30);
    assert.equal(reserve.hp, 20);
    assert.equal(fainted.hp, 0);
    assert.equal(room.interacted, true);
    assert.equal(room.shrine.completed, true);
    assert.equal(room.shrine.used, true);
    assert.equal(room.shrine.chosenReward, 'heal_all');
    assert.deepEqual(result.affectedCreatures.map(c => c.creatureKey), ['active-hi', 'reserve-mizu']);
  });

  it('restore_mp_all restores active and reserve living creatures to max MP only', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, attack: 5 };
    const reserve = { id: 'mizu', uid: 'reserve-mizu', nameEn: 'Mizu', hp: 5, maxHp: 30, mp: 2, maxMp: 18, level: 2, attack: 4 };
    const fainted = { id: 'ki', uid: 'reserve-ki', nameEn: 'Ki', hp: 0, maxHp: 50, mp: 0, maxMp: 12, level: 2, attack: 4 };
    const { service } = makeShrineService({ active: [active], reserves: [reserve, fainted] });

    service.useShrineReward('restore_mp_all');

    assert.equal(active.mp, 10);
    assert.equal(reserve.mp, 18);
    assert.equal(fainted.mp, 0);
  });

  it('level_up levels one living active or reserve creature by key', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, xp: 0, attack: 5 };
    const reserve = { id: 'mizu', uid: 'reserve-mizu', nameEn: 'Mizu', hp: 5, maxHp: 30, mp: 2, maxMp: 18, level: 4, xp: 0, attack: 4 };
    const { service } = makeShrineService({ active: [active], reserves: [reserve] });

    const result = service.useShrineReward('level_up', 'reserve-mizu');

    assert.equal(active.level, 2);
    assert.equal(reserve.level, 5);
    assert.equal(result.levelUp.creatureKey, 'reserve-mizu');
    assert.equal(result.levelUp.oldLevel, 4);
    assert.equal(result.levelUp.newLevel, 5);
  });

  it('rejects level_up for fainted creatures and does not complete the shrine', () => {
    const fainted = { id: 'ki', uid: 'reserve-ki', nameEn: 'Ki', hp: 0, maxHp: 50, mp: 0, maxMp: 12, level: 2, xp: 0, attack: 4 };
    const { room, service } = makeShrineService({ active: [], reserves: [fainted] });

    assert.throws(() => service.useShrineReward('level_up', 'reserve-ki'), /Cannot use shrine on a fainted creature/);
    assert.equal(room.interacted, false);
    assert.equal(room.shrine.completed, false);
  });

  it('prevents claiming the same shrine twice', () => {
    const active = { id: 'hi', uid: 'active-hi', nameEn: 'Hi', hp: 10, maxHp: 40, mp: 1, maxMp: 10, level: 2, attack: 5 };
    const { service } = makeShrineService({ active: [active], reserves: [] });

    service.useShrineReward('heal_all');
    assert.throws(() => service.useShrineReward('restore_mp_all'), /Shrine already used/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- --test-name-pattern "Shrine Reward Service"
```

Expected: FAIL because `useShrineReward()` does not exist.

- [ ] **Step 3: Implement reward helpers**

In `src/game/services/exploration-service.js`, add near `ROOM_HEAL_PERCENT`:

```js
const SHRINE_REWARDS = Object.freeze({
  HEAL_ALL: 'heal_all',
  RESTORE_MP_ALL: 'restore_mp_all',
  LEVEL_UP: 'level_up'
});

function ensureShrineState(room) {
  if (!room.shrine) room.shrine = {};
  room.shrine.used = room.shrine.used === true;
  room.shrine.completed = room.shrine.completed === true || room.shrine.used === true;
  if (!Object.prototype.hasOwnProperty.call(room.shrine, 'chosenReward')) room.shrine.chosenReward = null;
  if (!Object.prototype.hasOwnProperty.call(room.shrine, 'greeting')) room.shrine.greeting = null;
  return room.shrine;
}

function getCreatureKey(creature) {
  return creature?.uid || creature?.instanceId || creature?.id || '';
}

function getAllPartyCreatures(creatureParty) {
  return [
    ...(creatureParty?.active || []),
    ...(creatureParty?.reserves || [])
  ].filter(Boolean);
}
```

- [ ] **Step 4: Replace old shrine method with multi-reward service**

Replace `useShrine(creatureId)` in `src/game/services/exploration-service.js` with:

```js
  useShrine(creatureId) {
    return this.useShrineReward(SHRINE_REWARDS.LEVEL_UP, creatureId);
  }

  useShrineReward(rewardType, creatureKey = null) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    const shrine = ensureShrineState(room);
    if (shrine.completed || shrine.used) {
      throw new Error('Shrine already used');
    }

    const allCreatures = getAllPartyCreatures(this.gm.run?.creatureParty);
    let result;

    switch (rewardType) {
      case SHRINE_REWARDS.HEAL_ALL:
        result = this._applyShrineHealAll(allCreatures);
        break;
      case SHRINE_REWARDS.RESTORE_MP_ALL:
        result = this._applyShrineRestoreMpAll(allCreatures);
        break;
      case SHRINE_REWARDS.LEVEL_UP:
        result = this._applyShrineLevelUp(allCreatures, creatureKey);
        break;
      default:
        throw new Error('Invalid shrine reward');
    }

    shrine.used = true;
    shrine.completed = true;
    shrine.chosenReward = rewardType;
    room.interacted = true;

    logger.info('[Shrine] Reward claimed:', {
      rewardType,
      affected: result.affectedCreatures?.length || (result.levelUp ? 1 : 0)
    });

    this.gm.narrate('The shrine glow fades.');
    this.gm.emitState();

    return {
      type: 'shrine_reward',
      rewardType,
      affectedCreatures: result.affectedCreatures || [],
      levelUp: result.levelUp || null
    };
  }
```

Add these class methods below `useShrineReward()`:

```js
  _applyShrineHealAll(allCreatures) {
    const affectedCreatures = [];
    for (const creature of allCreatures) {
      if ((creature.hp || 0) <= 0) continue;
      const maxHp = Math.max(0, Math.floor(Number(creature.maxHp) || 0));
      const beforeHp = Math.max(0, Math.floor(Number(creature.hp) || 0));
      const healAmount = Math.floor(maxHp * 0.5);
      creature.hp = Math.min(maxHp, beforeHp + healAmount);
      affectedCreatures.push({
        creatureKey: getCreatureKey(creature),
        creatureName: creature.nameEn || creature.name || creature.id,
        oldHp: beforeHp,
        newHp: creature.hp
      });
    }
    return { affectedCreatures };
  }

  _applyShrineRestoreMpAll(allCreatures) {
    const affectedCreatures = [];
    for (const creature of allCreatures) {
      if ((creature.hp || 0) <= 0) continue;
      const maxMp = Math.max(0, Math.floor(Number(creature.maxMp) || 0));
      const beforeMp = Math.max(0, Math.floor(Number(creature.mp) || 0));
      creature.mp = maxMp;
      affectedCreatures.push({
        creatureKey: getCreatureKey(creature),
        creatureName: creature.nameEn || creature.name || creature.id,
        oldMp: beforeMp,
        newMp: creature.mp
      });
    }
    return { affectedCreatures };
  }

  _applyShrineLevelUp(allCreatures, creatureKey) {
    if (!creatureKey) throw new Error('creatureKey required for level up reward');
    const creature = allCreatures.find(candidate =>
      getCreatureKey(candidate) === creatureKey || candidate.id === creatureKey
    );
    if (!creature) throw new Error('Creature not in party');
    if ((creature.hp || 0) <= 0) throw new Error('Cannot use shrine on a fainted creature');

    const prevLevel = creature.level;
    const prevMaxHp = creature.maxHp;
    const prevAttack = creature.attack;

    addXpToCreature(creature, xpToNextLevel(creature.level), null, this.gm.run?.itemBuffs);

    return {
      levelUp: {
        creatureKey: getCreatureKey(creature),
        creatureId: creature.id,
        creatureName: creature.nameEn || creature.name || creature.id,
        oldLevel: prevLevel,
        newLevel: creature.level,
        maxHp: creature.maxHp,
        attack: creature.attack,
        hpGain: creature.maxHp - prevMaxHp,
        attackGain: creature.attack - prevAttack
      }
    };
  }
```

In `src/game/loop.js`, add beside `useShrine()`:

```js
  useShrineReward(rewardType, creatureKey) {
    return this.explorationService.useShrineReward(rewardType, creatureKey);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm run test:unit -- --test-name-pattern "Shrine Reward Service"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/services/exploration-service.js src/game/loop.js tests/unit/game/shrine-room.test.js
git commit -m "feat: add shrine reward service"
```

---

### Task 3: Shrine Dialogue And API Routes

**Files:**
- Modify: `data/dialogue/frame-sources.json`
- Regenerate: `data/dialogue/frames.json`
- Modify: `src/game/dialogue-loader.js`
- Create: `tests/unit/routes/shrine-room-routes.test.js`
- Modify: `src/routes/game/run.js`

- [ ] **Step 1: Add route tests**

Create `tests/unit/routes/shrine-room-routes.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import createRunRoutes from '../../../src/routes/game/run.js';

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeLayer = layer.route.stack.find(s => s.method === method);
      if (routeLayer) return routeLayer.handle;
    }
  }
  return null;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
}

describe('Shrine room routes', () => {
  let router;

  beforeEach(() => {
    router = createRunRoutes({
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: async () => [],
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] })
    });
  });

  it('POST /shrine-offers returns reward options and greeting field', async () => {
    const room = { type: 'shrine', interacted: false, shrine: { used: false, completed: false, chosenReward: null, greeting: null } };
    const handler = getHandler(router, 'post', '/shrine-offers');
    const req = {
      user: { id: 'shrine-route-user' },
      gameManager: { getCurrentRoom: () => room },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'shrine' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.rewards.map(reward => reward.id), ['heal_all', 'restore_mp_all', 'level_up']);
    assert.ok('greeting' in res.body);
    assert.deepEqual(res.body.state, { phase: 'shrine' });
  });

  it('POST /shrine-offers rejects non-shrine rooms', async () => {
    const handler = getHandler(router, 'post', '/shrine-offers');
    const req = {
      user: { id: 'shrine-route-user' },
      gameManager: { getCurrentRoom: () => ({ type: 'friendlyNpc' }) },
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Not in a shrine room');
  });

  it('POST /shrine-choose applies selected reward and saves', async () => {
    const handler = getHandler(router, 'post', '/shrine-choose');
    let saved = false;
    const req = {
      body: { rewardType: 'level_up', creatureKey: 'reserve-mizu' },
      gameManager: {
        useShrineReward: (rewardType, creatureKey) => ({
          type: 'shrine_reward',
          rewardType,
          affectedCreatures: [],
          levelUp: { creatureKey }
        })
      },
      saveGame: () => { saved = true; },
      getEnrichedGameState: () => ({ phase: 'room' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.rewardType, 'level_up');
    assert.equal(res.body.levelUp.creatureKey, 'reserve-mizu');
    assert.deepEqual(res.body.state, { phase: 'room' });
    assert.equal(saved, true);
  });
});
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
npm run test:unit -- --test-name-pattern "Shrine room routes"
```

Expected: FAIL because `/shrine-offers` and `/shrine-choose` do not exist.

- [ ] **Step 3: Add shrine greeting frames**

In `data/dialogue/frame-sources.json`, add these source frames near `shopGreeting_*` entries:

```json
  {
    "id": "shrineGreeting_hello",
    "category": "shrineGreeting",
    "raw": "こんにちは！",
    "slots": []
  },
  {
    "id": "shrineGreeting_energy",
    "category": "shrineGreeting",
    "raw": "元気ですか？",
    "slots": []
  },
  {
    "id": "shrineGreeting_good_day",
    "category": "shrineGreeting",
    "raw": "いい日ですね！",
    "slots": []
  },
  {
    "id": "shrineGreeting_rest",
    "category": "shrineGreeting",
    "raw": "少し休みますか？",
    "slots": []
  },
```

Keep JSON comma placement valid for the surrounding array. Do not modify `data/dictionary.json`. If validation reports a missing dictionary entry, replace only the failing shrine source with `どうぞ！` from the existing validated shop greeting pool and rerun the tokenizer.

- [ ] **Step 4: Add shrine greeting loader**

In `src/game/dialogue-loader.js`, add:

```js
let _shrineGreetingFrames = [];
```

Inside `loadDialoguePools()`, after `_shopGreetingFrames`:

```js
  _shrineGreetingFrames = _frames.filter(f => f.category === 'shrineGreeting');
```

At the exports:

```js
export function getShrineGreetingFrames() { return _shrineGreetingFrames; }
```

- [ ] **Step 5: Regenerate and validate frames**

Run:

```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
```

Expected: both commands exit 0.

- [ ] **Step 6: Add shrine route imports and constants**

In `src/routes/game/run.js`, update the dialogue-loader import:

```js
import { getShopPurchaseFrames, getShopGreetingFrames, getShrineGreetingFrames, getGameMasterAskFrames, getGameMasterFinishFrames, getGameMasterYesFrame, getGameMasterNoFrame, getSkillSelectFrame } from '../../game/dialogue-loader.js';
```

Add near the top-level constants:

```js
const SHRINE_REWARDS = [
  {
    id: 'heal_all',
    title: 'Heal all creatures',
    description: 'Restore 50% HP to living active and reserve creatures.'
  },
  {
    id: 'restore_mp_all',
    title: 'Restore MP',
    description: 'Restore MP for all creatures to full.'
  },
  {
    id: 'level_up',
    title: 'Level up one creature',
    description: 'Choose one living creature to gain one level.'
  }
];
```

- [ ] **Step 7: Add shrine routes**

In `src/routes/game/run.js`, replace the existing `/shrine-upgrade` block with:

```js
  router.post('/shrine-offers', async (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'shrine') {
        return res.status(400).json({ error: 'Not in a shrine room' });
      }

      if (!room.shrine) room.shrine = { used: false, completed: false, chosenReward: null, greeting: null };
      if (!room.shrine.greeting) {
        const knownWords = getKnownWordsFromFsrs(req.user.id);
        const knownSet = new Set(knownWords);
        const greetingFrames = getShrineGreetingFrames();
        const greetingCandidates = greetingFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
        room.shrine.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });
        req.saveGame();
      }

      res.json({
        rewards: SHRINE_REWARDS,
        greeting: room.shrine.greeting || null,
        completed: room.shrine.completed === true || room.shrine.used === true,
        state: req.getEnrichedGameState()
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/shrine-choose', async (req, res) => {
    try {
      const { rewardType, creatureKey, creatureId } = req.body || {};
      if (!rewardType) {
        return res.status(400).json({ error: 'rewardType required' });
      }
      const result = req.gameManager.useShrineReward(rewardType, creatureKey || creatureId || null);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/shrine-upgrade', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { creatureId } = req.body;
      if (!creatureId) {
        return res.status(400).json({ error: 'creatureId required' });
      }
      const result = gameManager.useShrineReward('level_up', creatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

- [ ] **Step 8: Run route and dialogue checks**

Run:

```bash
npm run test:unit -- --test-name-pattern "Shrine room routes"
node --input-type=module -e "import { loadDialoguePools, getShrineGreetingFrames } from './src/game/dialogue-loader.js'; loadDialoguePools('./data'); if (getShrineGreetingFrames().length < 4) throw new Error('missing shrine greetings'); console.log('OK')"
```

Expected: tests pass and the loader smoke command prints `OK`.

- [ ] **Step 9: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json src/game/dialogue-loader.js src/routes/game/run.js tests/unit/routes/shrine-room-routes.test.js
git commit -m "feat: add shrine room routes and greetings"
```

---

### Task 4: Frontend Shrine Encounter

**Files:**
- Create: `tests/unit/ui/exploration-shrine.test.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/game.js`

- [ ] **Step 1: Add frontend shrine renderer tests**

Create `tests/unit/ui/exploration-shrine.test.js` with this preamble:

```js
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedChoices = null;
let dialogueCards = [];

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});
await mock.module('../../../public/js/ui/speed-review.js', { namedExports: {} });
await mock.module('../../../public/js/ui/whack-a-mole.js', {
  namedExports: { WhackAMoleGame: class {} },
});
await mock.module('../../../public/js/audio.js', { namedExports: { playSFX: () => {} } });
await mock.module('../../../public/js/native/index.js', { namedExports: { hapticLight: () => {} } });
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureBgUrl: () => '',
    itemSpriteHtml: () => '',
    creatureStaticPath: id => `/assets/sprites/creatures/${id}.webp`,
    SPRITE_VERSION: 'test',
  },
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideEnemy: () => {}, showFormation: () => {}, hideFormation: () => {} },
});
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: { showNpcInDisplay: () => {} },
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' '), isJapanified: () => false },
});
await mock.module('../../../public/js/ui/chests.js', { namedExports: {} });
await mock.module('../../../public/js/ui/crests-equip.js', { namedExports: {} });
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: { playRoomTransition: async () => {} },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderButtons: () => {},
    renderChoices: choices => { renderedChoices = choices; },
  },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCards.push(options); },
  },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: { buff: () => {}, itemGained: () => {} },
});
await mock.module('../../../public/js/ui/dom-effects.js', {
  namedExports: { pop: () => {}, flashElement: () => {} },
});
await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: { showWordLevelUp: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: tokens => tokens.map(t => t.text || t.base || '').join(''),
    getKnownWords: () => new Set(),
  },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: () => [],
    getFormationNarration: () => '',
    getPostHinekoReviewNarration: () => [],
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const { init, renderShrine } = await import('../../../public/js/ui/exploration.js');
```

Then add this test body:

```js
describe('renderShrine encounter flow', () => {
  beforeEach(() => {
    renderedChoices = null;
    dialogueCards = [];
    sceneManagerState.currentScene = null;
    sceneManagerState.transitioning = false;
  });

  function initShrine(overrides = {}) {
    init({
      getGameState: () => ({
        phase: 'shrine',
        room: {
          id: overrides.roomId || 'shrine-test-room',
          type: 'shrine',
          interacted: false,
          shrine: { completed: false, used: false }
        },
        run: {
          creatureParty: {
            active: [
              { id: 'hi', uid: 'active-hi', name: '火', nameEn: 'Hi', level: 2, hp: 10, maxHp: 20, mp: 1, maxMp: 10 }
            ],
            reserves: [
              { id: 'mizu', uid: 'reserve-mizu', name: '水', nameEn: 'Mizu', level: 3, hp: 12, maxHp: 30, mp: 2, maxMp: 15 },
              { id: 'ki', uid: 'reserve-ki', name: '木', nameEn: 'Ki', level: 4, hp: 0, maxHp: 40, mp: 0, maxMp: 20 }
            ]
          }
        }
      }),
      updateGameState: overrides.updateGameState || (() => {}),
      updateUI: overrides.updateUI || (() => {}),
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetShrineOffers: overrides.apiGetShrineOffers || (async () => ({
        greeting: { tokens: [{ text: 'こんにちは！' }], overrides: {} },
        rewards: [
          { id: 'heal_all', title: 'Heal all creatures', description: 'Restore 50% HP.' },
          { id: 'restore_mp_all', title: 'Restore MP', description: 'Restore MP for all creatures to full.' },
          { id: 'level_up', title: 'Level up one creature', description: 'Choose one creature.' }
        ]
      })),
      apiChooseShrineReward: overrides.apiChooseShrineReward || (async () => ({ state: { updated: true } })),
    });
  }

  it('shows shrine greeting before the three reward choices', async () => {
    initShrine();
    await renderShrine();

    assert.equal(dialogueCards[0].speaker, 'Shrine Fox');
    assert.deepEqual(dialogueCards[0].tokens, [{ text: 'こんにちは！' }]);
    assert.equal(renderedChoices.heading, 'Choose shrine blessing');
    assert.deepEqual(renderedChoices.cards.map(card => card.title), [
      'Heal all creatures',
      'Restore MP',
      'Level up one creature'
    ]);
  });

  it('spawns shrine fox sprite in the active scene', async () => {
    const events = [];
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite(spritePath) {
        events.push(spritePath);
        this.npcSprite = { spritePath };
      }
    };
    initShrine();
    await renderShrine();

    assert.match(events[0], /\/assets\/sprites\/shrine_fox\.webp\?v=test/);
  });

  it('chooses party-wide rewards without target selection', async () => {
    let chosen = null;
    initShrine({
      apiChooseShrineReward: async (rewardType, creatureKey) => {
        chosen = { rewardType, creatureKey };
        return { state: { updated: true } };
      }
    });

    await renderShrine();
    await renderedChoices.onSelect(0);

    assert.deepEqual(chosen, { rewardType: 'heal_all', creatureKey: null });
  });

  it('renders living active and reserve targets for level-up and omits fainted creatures', async () => {
    let chosen = null;
    initShrine({
      apiChooseShrineReward: async (rewardType, creatureKey) => {
        chosen = { rewardType, creatureKey };
        return { state: { updated: true } };
      }
    });

    await renderShrine();
    await renderedChoices.onSelect(2);

    assert.equal(renderedChoices.heading, 'Choose creature to level up');
    assert.deepEqual(renderedChoices.cards.map(card => card.title), ['Hi Lv.2 -> Lv.3', 'Mizu Lv.3 -> Lv.4']);

    await renderedChoices.onSelect(1);
    assert.deepEqual(chosen, { rewardType: 'level_up', creatureKey: 'reserve-mizu' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- --test-name-pattern "renderShrine encounter flow"
```

Expected: FAIL because the modern shrine renderer and API callbacks are missing.

- [ ] **Step 3: Add frontend API functions**

In `public/js/api.js`, replace the old shrine API block with:

```js
/** Get shrine greeting and reward options */
async function getShrineOffers() {
  return apiCall('/shrine-offers', 'POST');
}

/** Choose one shrine reward */
async function chooseShrineReward(rewardType, creatureKey = null) {
  const body = { rewardType };
  if (creatureKey !== null) body.creatureKey = creatureKey;
  return apiCall('/shrine-choose', 'POST', body);
}

/** Backwards-compatible level-up call for old callers */
async function shrineUpgrade(creatureId) {
  return chooseShrineReward('level_up', creatureId);
}
```

Export all three:

```js
  getShrineOffers,
  chooseShrineReward,
  shrineUpgrade,
```

- [ ] **Step 4: Pass callbacks through game bootstrap**

In `public/game.js`, update the API imports:

```js
  getShrineOffers as apiGetShrineOffers,
  chooseShrineReward as apiChooseShrineReward,
  shrineUpgrade as apiShrineUpgrade,
```

In `explorationUI.init({ ... })`, add:

```js
    apiGetShrineOffers,
    apiChooseShrineReward,
```

- [ ] **Step 5: Add shrine state and helpers**

In `public/js/ui/exploration.js`, add API variables near the friendly NPC API variables:

```js
let apiGetShrineOffers = null;
let apiChooseShrineReward = null;
```

In `init(callbacks)`, add:

```js
  apiGetShrineOffers = callbacks.apiGetShrineOffers;
  apiChooseShrineReward = callbacks.apiChooseShrineReward;
```

Replace the old `renderShrine()` helper area with:

```js
let shrineState = {
  roomId: null,
  fetched: false,
  rewards: null,
  greeting: null,
  choosing: false,
  greetingShown: false,
};

function shrineCreatureKey(creature) {
  return creature?.uid || creature?.instanceId || creature?.id || '';
}

function shrineCreatures(creatureParty) {
  return [
    ...(creatureParty?.active || []),
    ...(creatureParty?.reserves || [])
  ].filter(Boolean);
}

async function showShrineSprite() {
  const spritePath = `/assets/sprites/shrine_fox.webp?v=${SPRITE_VERSION}`;
  showNpcInDisplay('Shrine Fox', spritePath, { skipPixi: true });
  const scene = await waitForSceneWithNpcs();
  if (scene) await scene.showNpcSprite(spritePath, { slideIn: true });
}
```

- [ ] **Step 6: Replace `renderShrine()`**

Replace the old `renderShrine()` function in `public/js/ui/exploration.js` with:

```js
export async function renderShrine() {
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const roomId = room?.id || room?.type || 'unknown';

  if (shrineState.roomId !== roomId) {
    shrineState = {
      roomId,
      fetched: false,
      rewards: null,
      greeting: null,
      choosing: false,
      greetingShown: false,
    };
  }

  if (room?.interacted || room?.shrine?.completed || room?.shrine?.used) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;">Shrine blessing received.</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">The path opens ahead.</div>
      </div>
    `);
    return;
  }

  actions.setContent('<div class="prologue-continue-hint">Click to continue!</div>');

  if (!shrineState.fetched) {
    shrineState.fetched = true;
    const fetchRoomId = roomId;
    try {
      const resp = await apiGetShrineOffers?.();
      if (shrineState.roomId !== fetchRoomId) return;
      shrineState.rewards = Array.isArray(resp?.rewards) ? resp.rewards : [
        { id: 'heal_all', title: 'Heal all creatures', description: 'Restore 50% HP to living creatures.' },
        { id: 'restore_mp_all', title: 'Restore MP', description: 'Restore MP for all creatures to full.' },
        { id: 'level_up', title: 'Level up one creature', description: 'Choose one living creature.' }
      ];
      shrineState.greeting = resp?.greeting || null;
      if (resp?.state) updateGameState(resp.state);
    } catch {
      shrineState.fetched = false;
      shrineState.rewards = null;
      shrineState.greeting = null;
      shrineState.greetingShown = false;
      actions.setContent('');
      renderButtons([
        { label: 'Retry', onClick: () => { shrineState.fetched = false; renderShrine(); }, primary: true },
      ]);
      return;
    }
  }

  if (!shrineState.greetingShown) {
    shrineState.greetingShown = true;
    await showShrineSprite();
    const greetingTokens = shrineState.greeting?.tokens;
    await showNpcDialogueCard({
      speaker: 'Shrine Fox',
      ...(greetingTokens?.length
        ? {
            tokens: greetingTokens,
            overrides: shrineState.greeting?.overrides || {},
            useKanji: false,
          }
        : { text: 'こんにちは！' }),
    });
  }

  const rewards = shrineState.rewards || [];
  renderChoices({
    heading: 'Choose shrine blessing',
    cards: rewards.map(reward => ({
      title: reward.title,
      subtitle: reward.description,
    })),
    onSelect: async (index) => {
      if (shrineState.choosing) return;
      const reward = rewards[index];
      if (!reward) return;
      if (reward.id === 'level_up') {
        renderShrineLevelTargets(reward.id);
        return;
      }
      await chooseShrineReward(reward.id, null);
    },
  });
}
```

Add below it:

```js
function renderShrineLevelTargets(rewardType) {
  const gameState = getGameState();
  const livingCreatures = shrineCreatures(gameState.run?.creatureParty)
    .filter(creature => (creature.hp || 0) > 0);

  if (livingCreatures.length === 0) {
    sceneModule?.showNarration?.('No living creatures can receive this blessing.', { autoDismiss: 2200 });
    renderShrine();
    return;
  }

  renderChoices({
    heading: 'Choose creature to level up',
    cards: livingCreatures.map(creature => ({
      sprite: `<img src="${creatureStaticPath(creature.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`,
      title: `${creature.nameEn || creature.name || creature.id} Lv.${creature.level} -> Lv.${creature.level + 1}`,
      subtitle: `HP: ${creature.hp}/${creature.maxHp} · MP: ${creature.mp || 0}/${creature.maxMp || 0}`,
    })),
    onSelect: async (index) => {
      const creature = livingCreatures[index];
      if (creature) await chooseShrineReward(rewardType, shrineCreatureKey(creature));
    },
  });
}

async function chooseShrineReward(rewardType, creatureKey) {
  if (shrineState.choosing) return;
  shrineState.choosing = true;
  try {
    playSFX('creature-equip');
    const result = await apiChooseShrineReward?.(rewardType, creatureKey);
    if (result?.state) {
      updateGameState(result.state);
      actions.clear();
      updateUI();
    } else {
      shrineState.choosing = false;
      sceneModule?.showNarration?.('Could not apply shrine blessing. Tap to try again.', { autoDismiss: 2200 });
      renderShrine();
    }
  } catch {
    shrineState.choosing = false;
    actions.clear();
    sceneModule?.showNarration?.('Failed to choose shrine blessing.', { autoDismiss: 1800 });
    renderShrine();
  }
}
```

- [ ] **Step 7: Run frontend tests and syntax checks**

Run:

```bash
npm run test:unit -- --test-name-pattern "renderShrine encounter flow|renderFriendlyNpc item prompt"
node --check public/js/api.js
node --check public/js/ui/exploration.js
node --check public/game.js
```

Expected: PASS and every syntax check exits 0.

- [ ] **Step 8: Commit**

```bash
git add public/js/api.js public/js/ui/exploration.js public/game.js tests/unit/ui/exploration-shrine.test.js
git commit -m "feat: render shrine as npc encounter"
```

---

### Task 5: Parallax Transition, Old Background Removal, And Docs

**Files:**
- Modify: `public/js/ui/room-transition.js`
- Modify: `public/game.js`
- Modify: `docs/playtest-guide.md`

- [ ] **Step 1: Add shrine room transition sprite**

In `public/js/ui/room-transition.js`, add a shrine branch after the friendly NPC branch:

```js
  } else if (roomType === 'shrine') {
    const spritePath = `/assets/sprites/shrine_fox.webp?v=${SPRITE_VERSION}`;
    showNpcInDisplay('Shrine Fox', spritePath, { skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(spritePath, { slideIn: true });
  } else if (roomType === 'whackAMole') {
```

- [ ] **Step 2: Remove old shrine display behavior without falling through to `hideEnemies()`**

In `public/game.js`, replace the old shrine display branch:

```js
  } else if (gameState.phase === 'shrine') {
    scene.showShrineFox();
```

With this no-op branch:

```js
  } else if (gameState.phase === 'shrine') {
    // Shrine transition/renderShrine own the fox sprite; keep the parallax scene intact.
```

This prevents the final `else { scene.hideEnemies(); }` branch from clearing the shrine NPC during update.

- [ ] **Step 3: Remove old shrine background override**

In `public/game.js`, remove:

```js
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.webp');
  } else if (gameState.phase === 'quiz') {
```

Make quiz the first branch:

```js
  if (gameState.phase === 'quiz') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.webp');
  } else if (gameState.phase === 'wordDiscovery' || gameState.phase === 'speedReviewRoom') {
```

Shrine then follows the existing `gameState.run?.background` branch, which clears the DOM background so Pixi parallax remains visible.

- [ ] **Step 4: Add playtest guide section**

In `docs/playtest-guide.md`, add:

```md
### Shrine Room

**Trigger:** Run enters phase `shrine`.

**Expected screen:**
- Current area parallax background remains visible.
- Shrine Fox sprite slides into the NPC layer.
- A short Japanese greeting appears in the NPC dialogue card.
- The action area shows three shrine blessing choices: heal all creatures, restore MP for all creatures to full, and level up one creature.

**Interactions:**
- Choose heal or MP to apply the party-wide reward immediately.
- Choose level-up to open a second target list containing living active and reserve creatures only.

**What could go wrong:**
- Old shrine background appears instead of parallax.
- Fainted creatures appear in the level-up target list.
- Refreshing the room allows a second shrine reward.
```

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check public/js/ui/room-transition.js
node --check public/game.js
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/room-transition.js public/game.js docs/playtest-guide.md
git commit -m "fix: keep shrine rooms in parallax flow"
```

---

### Task 6: Full Verification And Visual Check

**Files:**
- No source edits expected unless verification reveals a scoped defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:unit -- --test-name-pattern "Shrine Room|Shrine Reward Service|Shrine room routes|renderShrine encounter flow|Koto2 area room generation"
```

Expected: PASS.

- [ ] **Step 2: Run dialogue pipeline**

Run:

```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
```

Expected: both commands exit 0.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check src/game/rooms.js
node --check src/game/phase-machine.js
node --check src/game/services/exploration-service.js
node --check src/game/loop.js
node --check src/game/dialogue-loader.js
node --check src/routes/game/run.js
node --check public/js/api.js
node --check public/js/ui/exploration.js
node --check public/js/ui/room-transition.js
node --check public/game.js
```

Expected: every command exits 0.

- [ ] **Step 4: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Ask before browser verification**

Ask the user:

```text
This includes Pixi/visual changes. May I open the Playwright browser to verify the shrine encounter visually?
```

Proceed only after the user approves.

- [ ] **Step 6: Start or reuse dev server**

First inspect terminal state to avoid duplicate dev servers. If none is suitable, run:

```bash
npm run dev
```

Then verify Vite:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 7: Browser visual verification**

Navigate to `http://localhost:5173`, force or queue a shrine room through existing debug controls, and verify:

- The current area parallax background remains visible.
- The shrine fox appears as a Pixi NPC sprite.
- The dialogue card shows a shrine greeting.
- The action area shows the three reward choices.
- Level-up target selection includes living active and reserve creatures and excludes fainted creatures.

Delete any screenshot files created during verification in the same work session.

- [ ] **Step 8: Final test gate**

Run:

```bash
npm test
```

Expected: PASS for unit and integration tiers.

---

## Completion Criteria

- Shrine rooms appear in generated non-scripted support slots at 5% probability.
- Scripted NPC battle and boss slots remain fixed.
- Shrine rooms preserve PixiJS parallax walking visuals.
- `public/assets/sprites/shrine_fox.webp` slides in through the scene-owned NPC layer.
- Shrine greetings come from `shrineGreeting` static frames selected through the i+1 pipeline.
- The player gets exactly three choices: heal all living creatures by 50%, restore living creatures' MP to full, or level one living creature.
- Active party and reserves are included in reward scope.
- Fainted creatures are not revived and are not level-up targets.
- Completed shrine rooms cannot be claimed again after refresh or re-render.
- Focused tests, dialogue validation, full unit tests, full test suite, and visual verification pass.
