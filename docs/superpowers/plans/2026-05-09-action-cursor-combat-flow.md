# Action Cursor Combat Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change PvE and PvP creature combat from full-round move batches to immediate one-primary-action-at-a-time resolution with actor-scoped mini-round ticks.

**Architecture:** Add a shared action cursor and action segment contract in the server combat layer, then route PvE and PvP through it. PvE auto-resolves enemy-owned cursor actions until the next player-owned actor, while PvP uses a simultaneous opening exchange and then validates one owner-submitted action per cursor. Frontends consume ordered action segments and show one primary action animation before the next prompt.

**Tech Stack:** Node.js ES modules, Express routes, Socket.IO PvP, vanilla browser JS UI, `node:test` unit and integration tests.

---

## Source Spec

Read this first:

- `docs/superpowers/specs/2026-05-09-action-cursor-combat-flow-design.md`

## File Structure

- Create: `src/game/combat/action-cursor.js`
  - Owns initiative sorting, highest-dex actor selection, cursor initialization, cursor advancement, and side/index validation helpers.
- Create: `tests/unit/combat/action-cursor.test.js`
  - Unit coverage for cursor initialization and advancement without involving damage.
- Modify: `src/game/services/creature-combat-service.js`
  - Add single-actor primary action resolution, actor-only mini-round ticking, enemy single-action choice resolution, and action segment shaping.
- Modify: `tests/unit/combat/creature-combat-service.test.js`
  - Add actor-only status and MP regen tests, and preserve old primitive behavior until call sites migrate.
- Modify: `src/game/state.js`
  - Extend `createCombatState()` with `actionCursor`, `actionCount`, `cycleCount`, and opening metadata.
- Modify: `src/game/services/combat-cycle-service.js`
  - Initialize PvE cursor at encounter start; replace full-round attack handling with action-cursor handling; keep victory, befriend quiz, XP, KO swap, NPC skill, and reward behavior.
- Modify: `src/routes/game/combat.js`
  - Keep `/api/game/creature-combat-cycle`, but document and accept single-action payloads.
- Modify: `tests/integration/flows/combat.test.js`
  - Change flow tests from full-party `moveChoices` to single-action requests.
- Modify: `src/pvp/pvp-combat.js`
  - Add PvP opening and sequential single-action resolvers that reuse the same shared action segment semantics.
- Modify: `src/pvp/match-manager.js`
  - Replace `movesSubmitted` round batches with opening submissions and active-cursor submissions.
- Modify: `src/pvp/socket-handler.js`
  - Emit opening wait, action result, active cursor, and wrong-owner errors.
- Modify: `tests/unit/pvp/pvp-combat.test.js`
  - Add opening exchange and sequential single-action resolver tests.
- Modify: `tests/unit/pvp/match-manager.test.js`
  - Add protocol tests for opening, owner validation, stale cursor rejection, and match end.
- Modify: `public/js/ui/combat-loop.js`
  - Submit one PvE action for the current player-owned cursor and play returned action segments one at a time.
- Modify: `public/js/ui/pvp-battle.js`
  - Replace full-team move selection with opening action selection, active-owner selection, waiting state, and one-segment playback.
- Modify: `public/js/pvp-socket.js`
  - Add client wrappers and event handlers for single-action PvP submissions.
- Test: `node --check` on touched JS files, targeted unit tests, targeted integration tests, then `npm test`.

> Commit note: This repo's active agent policy says not to commit unless the user explicitly asks. Treat each "Checkpoint" step below as a place to inspect `git diff` and optionally commit only after explicit permission.

---

## Task 1: Shared Action Cursor Helpers

**Files:**
- Create: `src/game/combat/action-cursor.js`
- Create: `tests/unit/combat/action-cursor.test.js`

- [ ] **Step 1: Write failing cursor unit tests**

Create `tests/unit/combat/action-cursor.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionOrder,
  createPveOpeningCursor,
  createPvpOpeningCursors,
  getNextActionCursor,
  isCursorActorAlive
} from '../../../src/game/combat/action-cursor.js';

function creature(id, overrides = {}) {
  return {
    id,
    hp: 100,
    maxHp: 100,
    level: 5,
    dex: 10,
    statStages: { atk: 0, def: 0, dex: 0 },
    moves: [{ id: 'hit', category: 'damage', target: 'single_enemy', mpCost: 0 }],
    ...overrides
  };
}

describe('action cursor helpers', () => {
  it('sorts eligible actors by effective dex then level', () => {
    const allies = [
      creature('slow-high-level', { level: 99, dex: 5 }),
      creature('fast-low-level', { level: 5, dex: 30 })
    ];
    const enemies = [creature('middle', { level: 5, dex: 20 })];

    const order = buildActionOrder({ allies, enemies });

    assert.deepEqual(order.map(a => `${a.side}:${a.index}`), [
      'ally:1',
      'enemy:0',
      'ally:0'
    ]);
  });

  it('creates PvE opening cursor for highest-dex ally even when enemy is faster', () => {
    const allies = [creature('ally-a', { dex: 8 }), creature('ally-b', { dex: 12 })];
    const enemies = [creature('enemy-a', { dex: 50 })];

    assert.deepEqual(createPveOpeningCursor({ allies, enemies }), {
      side: 'ally',
      index: 1,
      opening: true
    });
  });

  it('creates one PvP opening cursor per side using each side highest-dex creature', () => {
    const sideA = [creature('a0', { dex: 20 }), creature('a1', { dex: 10 })];
    const sideB = [creature('b0', { dex: 7 }), creature('b1', { dex: 30 })];

    assert.deepEqual(createPvpOpeningCursors({ sideA, sideB }), {
      sideA: { side: 'sideA', index: 0, opening: true },
      sideB: { side: 'sideB', index: 1, opening: true }
    });
  });

  it('advances to next living eligible actor after current actor', () => {
    const allies = [creature('ally-a', { dex: 30 }), creature('ally-b', { dex: 10 })];
    const enemies = [creature('enemy-a', { dex: 20 })];

    const next = getNextActionCursor({
      allies,
      enemies,
      previousCursor: { side: 'ally', index: 0, opening: false }
    });

    assert.deepEqual(next, { side: 'enemy', index: 0, opening: false });
  });

  it('reports dead cursor actor as not alive', () => {
    const allies = [creature('ally-a', { hp: 0 })];
    const enemies = [creature('enemy-a')];

    assert.equal(
      isCursorActorAlive({ allies, enemies, cursor: { side: 'ally', index: 0 } }),
      false
    );
  });
});
```

- [ ] **Step 2: Run cursor tests and verify they fail**

Run:

```bash
node --test tests/unit/combat/action-cursor.test.js
```

Expected: fails because `src/game/combat/action-cursor.js` does not exist.

- [ ] **Step 3: Implement action cursor helpers**

Create `src/game/combat/action-cursor.js`:

```js
import { getEffectiveDex } from './effects.js';

const PVE_SIDE_KEYS = new Set(['ally', 'enemy']);
const PVP_SIDE_KEYS = new Set(['sideA', 'sideB']);

function sideArrays({ allies, enemies, sideA, sideB }) {
  return {
    ally: allies || [],
    enemy: enemies || [],
    sideA: sideA || [],
    sideB: sideB || []
  };
}

function actorEntry(side, index, creature) {
  return {
    side,
    index,
    level: creature.level || 1,
    dex: getEffectiveDex(creature),
    creature
  };
}

export function compareActionActors(a, b) {
  const dexDiff = (b.dex || 1) - (a.dex || 1);
  if (dexDiff !== 0) return dexDiff;
  const levelDiff = (b.level || 1) - (a.level || 1);
  if (levelDiff !== 0) return levelDiff;
  return Math.random() - 0.5;
}

export function buildActionOrder(context) {
  const arrays = sideArrays(context);
  const sides = context.sideA || context.sideB ? ['sideA', 'sideB'] : ['ally', 'enemy'];
  const entries = [];

  for (const side of sides) {
    const list = arrays[side] || [];
    for (let index = 0; index < list.length; index++) {
      const creature = list[index];
      if (!creature || creature.hp <= 0 || creature.befriended) continue;
      entries.push(actorEntry(side, index, creature));
    }
  }

  return entries.sort(compareActionActors);
}

export function createPveOpeningCursor({ allies, enemies }) {
  const order = buildActionOrder({ allies, enemies }).filter(entry => entry.side === 'ally');
  if (order.length === 0) return null;
  return { side: 'ally', index: order[0].index, opening: true };
}

export function createPvpOpeningCursors({ sideA, sideB }) {
  const pick = side => {
    const order = buildActionOrder({ sideA, sideB }).filter(entry => entry.side === side);
    return order.length > 0 ? { side, index: order[0].index, opening: true } : null;
  };
  return { sideA: pick('sideA'), sideB: pick('sideB') };
}

export function getActor(context, cursor) {
  if (!cursor) return null;
  const arrays = sideArrays(context);
  return arrays[cursor.side]?.[cursor.index] || null;
}

export function isCursorActorAlive(context) {
  const actor = getActor(context, context.cursor);
  return !!actor && actor.hp > 0 && !actor.befriended;
}

export function getNextActionCursor({ allies, enemies, sideA, sideB, previousCursor }) {
  const context = sideA || sideB ? { sideA, sideB } : { allies, enemies };
  const order = buildActionOrder(context);
  if (order.length === 0) return null;

  const previousKey = previousCursor ? `${previousCursor.side}:${previousCursor.index}` : null;
  const previousPosition = order.findIndex(entry => `${entry.side}:${entry.index}` === previousKey);
  const nextEntry = previousPosition >= 0
    ? order[(previousPosition + 1) % order.length]
    : order[0];

  return { side: nextEntry.side, index: nextEntry.index, opening: false };
}

export function cursorMatchesChoice(cursor, choice) {
  return !!cursor && !!choice && cursor.index === choice.creatureIndex;
}

export function isPveCursor(cursor) {
  return !!cursor && PVE_SIDE_KEYS.has(cursor.side);
}

export function isPvpCursor(cursor) {
  return !!cursor && PVP_SIDE_KEYS.has(cursor.side);
}
```

- [ ] **Step 4: Run cursor tests and syntax check**

Run:

```bash
node --check src/game/combat/action-cursor.js
node --test tests/unit/combat/action-cursor.test.js
```

Expected: both pass.

- [ ] **Checkpoint**

Run:

```bash
git diff -- src/game/combat/action-cursor.js tests/unit/combat/action-cursor.test.js
```

Expected: only the new cursor helper and test are changed.

---

## Task 2: Actor-Scoped Mini-Round Primitive

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `tests/unit/combat/creature-combat-service.test.js`

- [ ] **Step 1: Write failing actor mini-round tests**

Append to `tests/unit/combat/creature-combat-service.test.js`:

```js
describe('Creature Combat - Actor Mini Round', () => {
  it('ticks poison only on the acting creature after its action', () => {
    const actor = instantiateCreature('mizu');
    const bystander = instantiateCreature('ki');
    actor.activeEffects = [{ type: 'poison', damagePerTurn: 7, remainingTurns: 2, sourceId: 'enemy' }];
    bystander.activeEffects = [{ type: 'poison', damagePerTurn: 7, remainingTurns: 2, sourceId: 'enemy' }];
    const actorHp = actor.hp;
    const bystanderHp = bystander.hp;

    const result = resolveActorMiniRound(actor, { side: 'ally', index: 0 });

    assert.equal(actor.hp, actorHp - 7);
    assert.equal(actor.activeEffects[0].remainingTurns, 1);
    assert.equal(bystander.hp, bystanderHp);
    assert.equal(bystander.activeEffects[0].remainingTurns, 2);
    assert.equal(result.effectEvents.length, 1);
    assert.equal(result.effectEvents[0].targetSide, 'ally');
    assert.equal(result.effectEvents[0].targetIndex, 0);
  });

  it('regenerates MP only on the acting ally', () => {
    const actor = instantiateCreature('mizu');
    const bystander = instantiateCreature('ki');
    actor.mp = 0;
    bystander.mp = 0;

    const result = resolveActorMiniRound(actor, { side: 'ally', index: 0 });

    assert.equal(actor.mp, Math.floor(actor.maxMp * 0.05));
    assert.equal(bystander.mp, 0);
    assert.deepEqual(result.mpRegens, [{
      creatureId: actor.id,
      mp: actor.mp,
      maxMp: actor.maxMp,
      regen: Math.floor(actor.maxMp * 0.05),
      side: 'ally',
      index: 0
    }]);
  });

  it('uses enemy MP regen rate for acting enemy', () => {
    const enemy = instantiateCreature('hi');
    enemy.mp = 0;

    const result = resolveActorMiniRound(enemy, { side: 'enemy', index: 0 });

    assert.equal(enemy.mp, Math.floor(enemy.maxMp * 0.12));
    assert.equal(result.mpRegens[0].side, 'enemy');
  });
});
```

Also add `resolveActorMiniRound` to the import list at the top of the file.

- [ ] **Step 2: Run mini-round tests and verify they fail**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js --test-name-pattern "Actor Mini Round"
```

Expected: fails because `resolveActorMiniRound` is not exported.

- [ ] **Step 3: Implement `resolveActorMiniRound`**

In `src/game/services/creature-combat-service.js`, add this exported helper near `tickAllEffects` or before `processInterleavedPvERound()`:

```js
export function resolveActorMiniRound(actor, cursor) {
  if (!actor) {
    return { effectEvents: [], mpRegens: [] };
  }

  const effectEvents = tickEffects(actor).map(event => ({
    ...event,
    targetSide: cursor.side,
    targetIndex: cursor.index
  }));

  const maxMp = actor.maxMp || 0;
  const regenRate = cursor.side === 'enemy' || cursor.side === 'sideB' ? 0.12 : 0.05;
  const regen = actor.hp > 0 ? Math.floor(maxMp * regenRate) : 0;
  if (regen > 0) {
    actor.mp = Math.min(maxMp, (actor.mp || 0) + regen);
  }

  const mpRegens = actor.hp > 0
    ? [{
        creatureId: actor.id,
        mp: actor.mp || 0,
        maxMp,
        regen,
        side: cursor.side,
        index: cursor.index
      }]
    : [];

  return { effectEvents, mpRegens };
}
```

- [ ] **Step 4: Run mini-round tests**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js --test-name-pattern "Actor Mini Round"
```

Expected: all actor mini-round tests pass.

- [ ] **Checkpoint**

Run:

```bash
node --check src/game/services/creature-combat-service.js
git diff -- src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
```

Expected: helper export plus focused tests only.

---

## Task 3: Shared Single-Actor Action Resolution

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `tests/unit/combat/creature-combat-service.test.js`

- [ ] **Step 1: Write failing tests for one primary actor**

Append to `tests/unit/combat/creature-combat-service.test.js`:

```js
describe('Creature Combat - Single Actor Action', () => {
  it('resolves only the selected ally primary action and returns one action segment', () => {
    const allies = [instantiateCreature('mizu'), instantiateCreature('ki')];
    const enemies = [instantiateCreature('hi')];
    const startHp = enemies[0].hp;

    const result = resolveSingleActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies,
      enemies,
      choices: [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }]
    });

    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].actor.side, 'ally');
    assert.equal(result.actionSegments[0].actor.index, 0);
    assert.ok(enemies[0].hp < startHp);
    assert.equal(allies[1].mp, allies[1].maxMp, 'bystander ally should not spend or regen MP');
  });

  it('does not let an inline counter create a mini-round tick for the countering ally', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('hi')];
    allies[0].activeEffects = [{ type: 'poison', damagePerTurn: 4, remainingTurns: 2, sourceId: 'hi' }];
    enemies[0].moves = [{
      id: 'enemy-hit', name: '打つ', nameEn: 'Hit', reading: 'うつ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 30, mpCost: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = resolveSingleActorAction({
        actorSide: 'enemy',
        actorIndex: 0,
        allies,
        enemies,
        choices: [{ creatureIndex: 0, moveId: 'enemy-hit', targetIndex: 0 }],
        runPartySkills: ['retaliationStrike'],
        combat: {}
      });

      assert.equal(result.actionSegments.length, 1);
      assert.ok(result.actionSegments[0].counterAttacks.length > 0, 'retaliationStrike should counter');
      assert.equal(allies[0].activeEffects[0].remainingTurns, 2, 'countering ally poison should not tick');
    } finally {
      Math.random = origRandom;
    }
  });
});
```

Add `resolveSingleActorAction` to the import list.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js --test-name-pattern "Single Actor Action"
```

Expected: fails because `resolveSingleActorAction` is not exported.

- [ ] **Step 3: Export enemy choice helpers**

In `src/game/services/creature-combat-service.js`, find `pickEnemyMoveChoice` and `pickEnemyTarget`. Export them if they are currently local:

```js
export function pickEnemyMoveChoice(enemy, allies, enemies) {
  // keep existing body unchanged
}

export function pickEnemyTarget(enemy, move, mode, allies, enemies) {
  // keep existing body unchanged
}
```

- [ ] **Step 4: Implement `resolveSingleActorAction`**

Add this helper in `src/game/services/creature-combat-service.js` near `processInterleavedPvERound()`:

```js
export function resolveSingleActorAction({
  actorSide,
  actorIndex,
  allies,
  enemies,
  choices = [],
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  runPartySkills = null,
  combat = null,
  playbackStart = 0
}) {
  const isAlly = actorSide === 'ally' || actorSide === 'sideA';
  const actorList = isAlly ? allies : enemies;
  const defenderList = isAlly ? enemies : allies;
  const actor = actorList[actorIndex];
  const inlineCounters = [];
  let playbackIndex = playbackStart;

  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: false
  };

  if (!actor || actor.hp <= 0) {
    segment.skipped = true;
    return { actionSegments: [segment], inlineCounters, xpEvents: [], playbackNext: playbackIndex };
  }

  if (combat && runPartySkills) {
    combat.chainHitsThisTurn = 0;
    combat.chainSurgeTriggeredThisTurn = false;
  }

  const slotResult = executeSlotMoveTurn(actorList, defenderList, actorIndex, choices, {
    itemBuffs: isAlly ? itemBuffs : null,
    creatureParty: isAlly ? creatureParty : null,
    metaMults: isAlly ? metaMults : null,
    defenderItemBuffs: isAlly ? null : itemBuffs,
    defeatedIndices: new Set(),
    onAttack(atk) {
      atk.playbackIndex = playbackIndex++;
      atk.combatSide = isAlly ? 'player' : 'enemy';
      segment.attacks.push(atk);

      if (!isAlly && runPartySkills && combat) {
        const counter = computeInlineCounter(atk, allies, enemies, runPartySkills, combat);
        if (counter) {
          counter.playbackIndex = playbackIndex++;
          counter.combatSide = 'player';
          segment.counterAttacks.push(counter);
          inlineCounters.push(counter);
        }
      }

      return actorList[actorIndex]?.hp > 0;
    }
  });

  segment.xpEvents.push(...(slotResult.xpEvents || []));

  if (isAlly && runPartySkills && combat && slotResult.attacks.length > 0) {
    applyPartySkillsAfterPlayerAttacks({
      attacks: slotResult.attacks,
      allies,
      enemies,
      runPartySkills,
      combat,
      resetTurnCounters: false
    });
  }

  const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
  segment.effectEvents.push(...miniRound.effectEvents);
  segment.mpRegens.push(...miniRound.mpRegens);

  return {
    actionSegments: [segment],
    attacks: segment.attacks,
    counterAttacks: segment.counterAttacks,
    inlineCounters,
    xpEvents: segment.xpEvents,
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackIndex
  };
}
```

- [ ] **Step 5: Run single-actor tests**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js --test-name-pattern "Single Actor Action"
```

Expected: pass.

- [ ] **Step 6: Run full creature combat service tests**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js
```

Expected: pass. If old tests assert full-round MP regen, keep old helpers unchanged and only use the new single-action helper in new call sites.

- [ ] **Checkpoint**

Run:

```bash
node --check src/game/services/creature-combat-service.js
git diff -- src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
```

Expected: new helper exports and tests. Existing full-round helpers still exist for compatibility until subsequent tasks remove or stop using them.

---

## Task 4: Combat State Initialization

**Files:**
- Modify: `src/game/state.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Create: `tests/unit/game/combat-action-state.test.js`

- [ ] **Step 1: Write failing combat state tests**

Create `tests/unit/game/combat-action-state.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatState } from '../../../src/game/state.js';

describe('combat action state', () => {
  it('initializes action cursor fields', () => {
    const combat = createCombatState({ id: 'enemy', hp: 10, maxHp: 10 });

    assert.equal(combat.actionCursor, null);
    assert.equal(combat.actionCount, 0);
    assert.equal(combat.cycleCount, 0);
    assert.equal(combat.openingResolved, false);
  });
});
```

- [ ] **Step 2: Run state test and verify failure**

Run:

```bash
node --test tests/unit/game/combat-action-state.test.js
```

Expected: fails because the fields are missing.

- [ ] **Step 3: Add fields to `createCombatState()`**

In `src/game/state.js`, find `createCombatState()` and include:

```js
actionCursor: null,
actionCount: 0,
cycleCount: 0,
openingResolved: false,
openingCursors: null,
pendingOpeningActions: null,
actionSegments: []
```

Keep existing fields such as `turnCount` intact.

- [ ] **Step 4: Initialize PvE cursor when encounter starts**

In `src/game/services/combat-cycle-service.js`, import:

```js
import { createPveOpeningCursor } from '../combat/action-cursor.js';
```

After `this.gm.combat.allies` and `this.gm.combat.enemies` are set in `startCreatureEncounter()`, add:

```js
this.gm.combat.actionCursor = createPveOpeningCursor({
  allies: this.gm.combat.allies,
  enemies: this.gm.combat.enemies
});
this.gm.combat.actionCount = 0;
this.gm.combat.cycleCount = 0;
this.gm.combat.openingResolved = false;
```

- [ ] **Step 5: Run state and syntax checks**

Run:

```bash
node --test tests/unit/game/combat-action-state.test.js
node --check src/game/state.js
node --check src/game/services/combat-cycle-service.js
```

Expected: pass.

- [ ] **Checkpoint**

Run:

```bash
git diff -- src/game/state.js src/game/services/combat-cycle-service.js tests/unit/game/combat-action-state.test.js
```

Expected: only combat state initialization and tests.

---

## Task 5: PvE Action-Cursor Combat Cycle

**Files:**
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/routes/game/combat.js`
- Modify: `tests/integration/flows/combat.test.js`

- [ ] **Step 1: Write failing integration test for one submitted ally action**

In `tests/integration/flows/combat.test.js`, replace `buildAttackChoices(combat)` use in the first combat test with a single current-cursor choice:

```js
function buildCursorAttackChoice(combat) {
  const cursor = combat.actionCursor;
  assert.ok(cursor, 'combat should expose actionCursor');
  assert.equal(cursor.side, 'ally', 'test expects player-owned cursor');
  const actor = combat.allies[cursor.index];
  assert.ok(actor, 'cursor actor should exist');
  const livingEnemyIndex = combat.enemies.findIndex(e => e && e.hp > 0);
  assert.ok(livingEnemyIndex >= 0, 'should have a living enemy');
  const move = actor.moves?.find(m => m.category === 'damage' || m.category === 'drain') || actor.moves?.[0];
  assert.ok(move, 'cursor actor should have a move');
  return { creatureIndex: cursor.index, moveId: move.id, targetIndex: livingEnemyIndex };
}
```

Add a new test:

```js
it('submits one cursor action and returns ordered action segments', async () => {
  const state = await startCombatRun(client, tmpDir);
  const choice = buildCursorAttackChoice(state.combat);

  const turn = await client.post('/api/game/creature-combat-cycle', {
    actionType: 'attack',
    moveChoices: [choice]
  });

  assert.equal(turn.status, 200, `combat cycle failed: ${JSON.stringify(turn.body)}`);
  assert.ok(Array.isArray(turn.body.actionSegments), 'response should include actionSegments');
  assert.ok(turn.body.actionSegments.length >= 1, 'should animate at least the submitted action');
  assert.equal(turn.body.actionSegments[0].actor.side, 'ally');
  assert.equal(turn.body.actionSegments[0].actor.index, choice.creatureIndex);
  assert.ok(turn.body.state.combat.actionCount >= 1, 'actionCount should advance');
});
```

- [ ] **Step 2: Run integration test and verify failure**

Run:

```bash
node --test tests/integration/flows/combat.test.js --test-name-pattern "one cursor action"
```

Expected: fails because `actionSegments` and action-cursor resolution are not wired.

- [ ] **Step 3: Add a private PvE single-action handler**

In `src/game/services/combat-cycle-service.js`, import:

```js
import {
  resolveSingleActorAction,
  pickEnemyMoveChoice,
  pickEnemyTarget
} from './creature-combat-service.js';
import {
  getActor,
  getNextActionCursor,
  cursorMatchesChoice
} from '../combat/action-cursor.js';
```

Add a private helper in `CombatCycleService`:

```js
_resolveCurrentPveCursor(moveChoice = null, playbackStart = 0) {
  const cursor = this.gm.combat.actionCursor;
  if (!cursor) throw new Error('No active action cursor');

  const actor = getActor({
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies
  }, cursor);
  if (!actor) throw new Error('Action cursor actor not found');

  let choices = [];
  if (cursor.side === 'ally') {
    if (!cursorMatchesChoice(cursor, moveChoice)) {
      throw new Error('Submitted move does not match current action cursor');
    }
    choices = [moveChoice];
  } else {
    const choice = pickEnemyMoveChoice(actor, this.gm.combat.allies, this.gm.combat.enemies);
    if (choice) {
      const { move, mode } = choice;
      const targeting = pickEnemyTarget(actor, move, mode, this.gm.combat.allies, this.gm.combat.enemies);
      if (targeting) {
        const targetIndex = targeting.targetSide === 'player'
          ? this.gm.combat.allies.indexOf(targeting.target)
          : this.gm.combat.enemies.indexOf(targeting.target);
        choices = [{ creatureIndex: cursor.index, moveId: move.id, targetIndex }];
      }
    }
  }

  const result = resolveSingleActorAction({
    actorSide: cursor.side,
    actorIndex: cursor.index,
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies,
    choices,
    itemBuffs: this.gm.run?.itemBuffs || null,
    creatureParty: this.gm.run?.creatureParty || null,
    metaMults: this.gm.meta?.combatMultipliers || null,
    runPartySkills: this.gm.run?.partySkills || null,
    combat: this.gm.combat,
    playbackStart
  });

  this.gm.combat.actionCount = (this.gm.combat.actionCount || 0) + 1;
  this.gm.combat.turnCount = this.gm.combat.actionCount;
  this.gm.combat.openingResolved = this.gm.combat.openingResolved || cursor.opening === true;
  this.gm.combat.actionCursor = getNextActionCursor({
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies,
    previousCursor: cursor
  });

  return result;
}
```

- [ ] **Step 4: Replace PvE attack branch with cursor loop**

Inside `creatureCombatCycle(actionType, moveChoices)`, for `actionType === 'attack'`, route to a new `_handleCreatureActionCursorTurn(moveChoices)` before the existing full-round path. Keep the old full-round function available until tests are fully migrated.

Implement `_handleCreatureActionCursorTurn(moveChoices)`:

```js
_handleCreatureActionCursorTurn(moveChoices = []) {
  const submittedChoice = moveChoices[0] || null;
  const actionSegments = [];
  let playbackStart = 0;
  let firstResult = this._resolveCurrentPveCursor(submittedChoice, playbackStart);
  actionSegments.push(...firstResult.actionSegments);
  playbackStart = firstResult.playbackNext || actionSegments.length;

  while (
    this.gm.combat.active &&
    this.gm.combat.actionCursor?.side === 'enemy' &&
    !checkAllDefeated(this.gm.combat.enemies) &&
    !checkAllDefeated(this.gm.combat.allies)
  ) {
    const enemyResult = this._resolveCurrentPveCursor(null, playbackStart);
    actionSegments.push(...enemyResult.actionSegments);
    playbackStart = enemyResult.playbackNext || playbackStart + enemyResult.actionSegments.length;
  }

  const flatPlayerAttacks = actionSegments.flatMap(segment =>
    segment.actor.side === 'ally' ? segment.attacks : segment.counterAttacks || []
  );
  const flatEnemyAttacks = actionSegments.flatMap(segment =>
    segment.actor.side === 'enemy' ? segment.attacks : []
  );
  const effectEvents = actionSegments.flatMap(segment => segment.effectEvents || []);
  const mpRegens = actionSegments.flatMap(segment => segment.mpRegens || []);
  const xpEvents = actionSegments.flatMap(segment => segment.xpEvents || []);
  const counterAttacks = actionSegments.flatMap(segment => segment.counterAttacks || []);

  const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(
    this.gm.combat.allies,
    this.gm.run.creatureParty
  );
  const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
  const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
  this.gm.combat.allies = this.gm.run.creatureParty.active;

  const allEnemiesDown = checkAllDefeated(this.gm.combat.enemies);
  const allAlliesDown = checkAllDefeated(this.gm.combat.allies);

  if (allEnemiesDown) {
    const newCollectionAdditions = this._flushPendingCaptures();
    collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
    finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
    const tutorialRewards = this._collectTutorialRewards();
    this.gm.emitState();
    return {
      actionType: 'attack',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      counterAttacks,
      xpEvents,
      mpRegens,
      effectEvents,
      koSwaps,
      koRemovals,
      combatEnded: true,
      victory: true,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty,
      newCollectionAdditions,
      tutorialRewards,
      elementDropsCollected: getElementDropList(this.gm.combat.enemies)
    };
  }

  if (allAlliesDown) {
    resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
    this.gm.emitState();
    return {
      actionType: 'attack',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      counterAttacks,
      xpEvents,
      mpRegens,
      effectEvents,
      koSwaps,
      koRemovals,
      combatEnded: true,
      victory: false,
      turnCount: this.gm.combat.turnCount,
      creatureParty: this.gm.run.creatureParty
    };
  }

  this.gm.combat.swapPhase = true;
  this.gm.emitState();
  return {
    actionType: 'attack',
    actionSegments,
    playerAttacks: flatPlayerAttacks,
    enemyAttacks: flatEnemyAttacks,
    counterAttacks,
    xpEvents,
    mpRegens,
    effectEvents,
    koSwaps,
    koRemovals,
    combatEnded: false,
    turnCount: this.gm.combat.turnCount,
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies,
    creatureParty: this.gm.run.creatureParty
  };
}
```

- [ ] **Step 5: Update route comments**

In `src/routes/game/combat.js`, change the endpoint comment:

```js
// Attack: { actionType: 'attack', moveChoices: [{ creatureIndex, moveId, targetIndex }] }
// The attack payload contains exactly one player-owned cursor action.
```

- [ ] **Step 6: Run targeted integration**

Run:

```bash
node --test tests/integration/flows/combat.test.js --test-name-pattern "one cursor action"
```

Expected: pass.

- [ ] **Step 7: Run full combat integration file**

Run:

```bash
node --test tests/integration/flows/combat.test.js
```

Expected: pass after updating any remaining full-party move submissions to use `buildCursorAttackChoice()`.

- [ ] **Checkpoint**

Run:

```bash
node --check src/game/services/combat-cycle-service.js
node --check src/routes/game/combat.js
git diff -- src/game/services/combat-cycle-service.js src/routes/game/combat.js tests/integration/flows/combat.test.js
```

Expected: PvE route now uses one submitted cursor action and returns `actionSegments`.

---

## Task 6: PvE Frontend One-Action Playback

**Files:**
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Update local move-selection state**

Replace the batching variables:

```js
let moveChoices = [];
let currentCreatureIndex = 0;
```

with:

```js
let currentCreatureIndex = 0;
let actionPlaybackActive = false;
```

Keep `pendingMove`.

- [ ] **Step 2: Prompt from server cursor**

Update `startMoveSelection()`:

```js
export function startMoveSelection() {
  const state = getGameState();
  const cursor = state.combat?.actionCursor;
  if (!cursor || cursor.side !== 'ally') {
    clearMoveSelect();
    clearTargetSelect();
    return;
  }
  currentCreatureIndex = cursor.index;
  promptNextCreature();
}
```

Update `promptNextCreature()` so it no longer scans slot order. It should read `state.combat.actionCursor`, verify `side === 'ally'`, then show moves for `allies[cursor.index]`.

- [ ] **Step 3: Submit immediately after move and target selection**

Add:

```js
function submitCursorAction(choice) {
  clearActiveGlowForScene(getSceneManager().currentScene);
  executeCreatureMovesTurn([choice]);
}
```

Change rest, auto-target, AoE, and `handleTargetSelected()` paths so they call `submitCursorAction(choice)` instead of pushing into `moveChoices` and calling `promptNextCreature()`.

- [ ] **Step 4: Play action segments one at a time**

Add:

```js
async function playActionSegments(result) {
  const segments = result.actionSegments?.length
    ? result.actionSegments
    : [{
        actor: { side: 'ally', index: 0 },
        attacks: result.playerAttacks || [],
        counterAttacks: result.counterAttacks || [],
        effectEvents: result.effectEvents || [],
        mpRegens: result.mpRegens || [],
        xpEvents: result.xpEvents || []
      }];

  for (const segment of segments) {
    if (segment.actor?.side === 'enemy') {
      for (const atk of segment.attacks || []) {
        await playOneEnemyAttackInMoveTurn(result, atk);
      }
    } else {
      const enemyHpMap = buildEnemyHpMapForPlayback(result);
      const killedEnemies = new Set();
      const pendingMoveLearn = [];
      for (const atk of segment.attacks || []) {
        await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, pendingMoveLearn);
      }
      if (pendingMoveLearn.length) await processPendingMoveLearn(pendingMoveLearn);
    }

    await playMiniRoundEvents(segment);
  }
}
```

Add `playMiniRoundEvents(segment)` in `public/js/ui/combat-loop.js`. It should loop over `segment.effectEvents` and call the same poison popup path used by current round playback, then loop over `segment.mpRegens` and update the matching formation MP bar by `side` and `index`.

- [ ] **Step 5: Update `executeCreatureMovesTurn()`**

Keep the fetch endpoint, but ensure:

```js
if (actionPlaybackActive) return;
actionPlaybackActive = true;
clearMoveSelect();
clearTargetSelect();
```

After successful response:

```js
await playActionSegments(result);
syncFinalState(result);
if (result.combatEnded) {
  stopCombatLoop(result);
  return;
}
actionPlaybackActive = false;
startMoveSelection();
```

In `finally`, reset `actionPlaybackActive = false` only if combat did not end.

- [ ] **Step 6: Update first-combat tutorial check**

In `getFirstCombatMoveTutorialOpts()`, replace the `turnCount` and `currentCreatureIndex` assumptions with:

```js
const cursor = state?.combat?.actionCursor;
if ((state?.combat?.actionCount ?? 0) !== 0) return {};
if (cursor?.side !== 'ally') return {};
if (cursor?.index !== currentCreatureIndex) return {};
```

Keep the starter creature and move checks unchanged.

- [ ] **Step 7: Syntax check**

Run:

```bash
node --check public/js/ui/combat-loop.js
```

Expected: pass.

- [ ] **Checkpoint**

Run:

```bash
git diff -- public/js/ui/combat-loop.js
```

Expected: no allied move batching remains; each selected move submits immediately.

---

## Task 7: PvP Single-Action Engine

**Files:**
- Modify: `src/pvp/pvp-combat.js`
- Modify: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Write failing PvP resolver tests**

Append to `tests/unit/pvp/pvp-combat.test.js`:

```js
describe('PvP action cursor resolution', () => {
  it('resolves opening actions by dex and stops if first action wins', () => {
    const sideA = [makeCreature({ id: 'a-fast', dex: 50, attack: 999 })];
    const sideB = [makeCreature({ id: 'b-slow', dex: 5, hp: 1, maxHp: 1 })];

    const result = resolveOpeningActions({
      sideA,
      sideB,
      actionA: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 },
      actionB: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }
    });

    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.winner, 'sideA');
  });

  it('resolves one sequential PvP action and advances cursor', () => {
    const sideA = [makeCreature({ id: 'a', dex: 20 })];
    const sideB = [makeCreature({ id: 'b', dex: 10 })];

    const result = resolvePvpCursorAction({
      sideA,
      sideB,
      cursor: { side: 'sideA', index: 0, opening: false },
      action: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }
    });

    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].actor.side, 'sideA');
    assert.deepEqual(result.nextCursor, { side: 'sideB', index: 0, opening: false });
  });

  it('ticks actor poison only after that actor action', () => {
    const sideA = [makeCreature({
      id: 'a',
      activeEffects: [{ type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'b' }]
    })];
    const sideB = [makeCreature({
      id: 'b',
      activeEffects: [{ type: 'poison', damagePerTurn: 5, remainingTurns: 2, sourceId: 'a' }]
    })];

    const result = resolvePvpCursorAction({
      sideA,
      sideB,
      cursor: { side: 'sideA', index: 0, opening: false },
      action: { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }
    });

    assert.equal(sideA[0].activeEffects[0].remainingTurns, 1);
    assert.equal(sideB[0].activeEffects[0].remainingTurns, 2);
    assert.equal(result.effectEvents.length, 1);
  });
});
```

Add `resolveOpeningActions` and `resolvePvpCursorAction` to the import list.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/unit/pvp/pvp-combat.test.js --test-name-pattern "PvP action cursor"
```

Expected: fails because new exports do not exist.

- [ ] **Step 3: Implement PvP single-action exports**

In `src/pvp/pvp-combat.js`, import:

```js
import {
  createPvpOpeningCursors,
  getNextActionCursor,
  compareActionActors
} from '../game/combat/action-cursor.js';
import { resolveSingleActorAction } from '../game/services/creature-combat-service.js';
```

Add:

```js
function winnerForSides(sideA, sideB) {
  const aDown = checkAllDefeated(sideA);
  const bDown = checkAllDefeated(sideB);
  if (aDown && bDown) return 'draw';
  if (aDown) return 'sideB';
  if (bDown) return 'sideA';
  return null;
}

function flattenSegments(segments) {
  return {
    attacks: segments.flatMap(segment => [
      ...(segment.attacks || []),
      ...(segment.counterAttacks || [])
    ]),
    effectEvents: segments.flatMap(segment => segment.effectEvents || []),
    mpRegens: segments.flatMap(segment => segment.mpRegens || []),
    xpEvents: segments.flatMap(segment => segment.xpEvents || [])
  };
}

export function resolvePvpCursorAction({
  sideA,
  sideB,
  cursor,
  action,
  partyA = null,
  partyB = null,
  partySkillsA = null,
  partySkillsB = null,
  combatA = null,
  combatB = null,
  playbackStart = 0
}) {
  if (!cursor) throw new Error('No active PvP cursor');
  if (!action || action.creatureIndex !== cursor.index) {
    throw new Error('Submitted action does not match active PvP cursor');
  }

  const isA = cursor.side === 'sideA';
  const result = resolveSingleActorAction({
    actorSide: cursor.side,
    actorIndex: cursor.index,
    allies: isA ? sideA : sideB,
    enemies: isA ? sideB : sideA,
    choices: [action],
    creatureParty: isA ? partyA : partyB,
    runPartySkills: isA ? partySkillsA : partySkillsB,
    combat: isA ? combatA : combatB,
    playbackStart
  });

  const winner = winnerForSides(sideA, sideB);
  const nextCursor = winner ? null : getNextActionCursor({ sideA, sideB, previousCursor: cursor });
  const flat = flattenSegments(result.actionSegments);

  return {
    ...flat,
    actionSegments: result.actionSegments,
    sideA,
    sideB,
    winner,
    nextCursor,
    playbackNext: result.playbackNext
  };
}

export function resolveOpeningActions({ sideA, sideB, actionA, actionB, options = {} }) {
  const opening = createPvpOpeningCursors({ sideA, sideB });
  const entries = [
    opening.sideA && { ...opening.sideA, creature: sideA[opening.sideA.index] },
    opening.sideB && { ...opening.sideB, creature: sideB[opening.sideB.index] }
  ].filter(Boolean).map(entry => ({
    ...entry,
    dex: getEffectiveDex(entry.creature),
    level: entry.creature.level || 1
  })).sort(compareActionActors);

  const segments = [];
  let playbackStart = 0;
  let winner = null;

  for (const cursor of entries) {
    const action = cursor.side === 'sideA' ? actionA : actionB;
    const result = resolvePvpCursorAction({
      sideA,
      sideB,
      cursor,
      action,
      ...options,
      playbackStart
    });
    segments.push(...result.actionSegments);
    playbackStart = result.playbackNext || playbackStart + result.actionSegments.length;
    winner = result.winner;
    if (winner) break;
  }

  const nextCursor = winner ? null : getNextActionCursor({ sideA, sideB, previousCursor: entries.at(-1) });
  const flat = flattenSegments(segments);
  return {
    ...flat,
    actionSegments: segments,
    sideA,
    sideB,
    winner,
    nextCursor,
    openingResolved: true
  };
}
```

- [ ] **Step 4: Run PvP resolver tests**

Run:

```bash
node --test tests/unit/pvp/pvp-combat.test.js --test-name-pattern "PvP action cursor"
```

Expected: pass.

- [ ] **Step 5: Run full PvP combat tests**

Run:

```bash
node --test tests/unit/pvp/pvp-combat.test.js
```

Expected: pass. Keep `resolveRound()` until `MatchManager` is migrated.

- [ ] **Checkpoint**

Run:

```bash
node --check src/pvp/pvp-combat.js
git diff -- src/pvp/pvp-combat.js tests/unit/pvp/pvp-combat.test.js
```

Expected: PvP has new single-action exports and existing round tests remain green.

---

## Task 8: PvP Match Manager Protocol

**Files:**
- Modify: `src/pvp/match-manager.js`
- Modify: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Write failing match manager tests**

In `tests/unit/pvp/match-manager.test.js`, add tests that use a fake resolver:

```js
it('waits for both opening actions before resolving opening exchange', () => {
  const mm = new MatchManager({
    resolveOpeningActionsFn: ({ actionA, actionB }) => ({
      actionSegments: [
        { actor: { side: 'sideA', index: actionA.creatureIndex }, attacks: [] },
        { actor: { side: 'sideB', index: actionB.creatureIndex }, attacks: [] }
      ],
      sideA: [{ id: 'a', hp: 10 }],
      sideB: [{ id: 'b', hp: 10 }],
      winner: null,
      nextCursor: { side: 'sideA', index: 0, opening: false },
      openingResolved: true
    }),
    resolveCursorActionFn: null
  });
  const code = setupReadyMatch(mm);
  const match = mm.getMatch(code);

  const first = mm.submitAction(code, match.player1.userId, { creatureIndex: 0, moveId: 'slash', targetIndex: 0 });
  assert.equal(first, null);

  const second = mm.submitAction(code, match.player2.userId, { creatureIndex: 0, moveId: 'slash', targetIndex: 0 });
  assert.ok(second);
  assert.equal(match.combat.openingResolved, true);
  assert.deepEqual(match.combat.actionCursor, { side: 'sideA', index: 0, opening: false });
});

it('rejects sequential action from non-owner', () => {
  const mm = new MatchManager({
    resolveCursorActionFn: () => ({ sideA: [], sideB: [], winner: null, nextCursor: null, actionSegments: [] })
  });
  const code = setupReadyMatch(mm);
  const match = mm.getMatch(code);
  match.combat.openingResolved = true;
  match.combat.actionCursor = { side: 'sideA', index: 0, opening: false };

  assert.throws(
    () => mm.submitAction(code, match.player2.userId, { creatureIndex: 0, moveId: 'slash', targetIndex: 0 }),
    /not the active player/
  );
});
```

If `setupReadyMatch()` does not exist, add a local helper that creates a match, joins player two, assigns one-creature teams, and calls `setReady()` for both users.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/unit/pvp/match-manager.test.js --test-name-pattern "opening actions|non-owner"
```

Expected: fails because `submitAction()` and injected resolvers do not exist.

- [ ] **Step 3: Update constructor injections**

In `src/pvp/match-manager.js`, change imports:

```js
import { resolveRound, resolveOpeningActions, resolvePvpCursorAction } from './pvp-combat.js';
```

In constructor:

```js
this._resolveRound = options.resolveRoundFn || resolveRound;
this._resolveOpeningActions = options.resolveOpeningActionsFn || resolveOpeningActions;
this._resolveCursorAction = options.resolveCursorActionFn || resolvePvpCursorAction;
```

- [ ] **Step 4: Initialize PvP opening state**

In `_startBattle(match)`, after `combat.sideA` and `combat.sideB` are created, add:

```js
combat.openingResolved = false;
combat.openingActions = { sideA: null, sideB: null };
combat.actionCursor = null;
combat.actionCount = 0;
```

- [ ] **Step 5: Add owner and side helpers**

Add private methods:

```js
_sideForPlayer(match, userId) {
  if (match.player1?.userId === userId) return 'sideA';
  if (match.player2?.userId === userId) return 'sideB';
  return null;
}

_playerOwnsCursor(match, userId, cursor) {
  return this._sideForPlayer(match, userId) === cursor?.side;
}
```

- [ ] **Step 6: Add `submitAction()`**

Add:

```js
submitAction(code, userId, action) {
  const match = this.matches.get(code);
  if (!match || !match.combat || match.phase !== 'battle') return null;

  const side = this._sideForPlayer(match, userId);
  if (!side) return null;

  const { combat } = match;

  if (!combat.openingResolved) {
    combat.openingActions ||= { sideA: null, sideB: null };
    combat.openingActions[side] = action;
    if (!combat.openingActions.sideA || !combat.openingActions.sideB) return null;

    const result = this._resolveOpeningActions({
      sideA: combat.sideA,
      sideB: combat.sideB,
      actionA: combat.openingActions.sideA,
      actionB: combat.openingActions.sideB,
      options: {
        partyA: combat.partyA,
        partyB: combat.partyB,
        partySkillsA: combat.partySkillsA,
        partySkillsB: combat.partySkillsB,
        combatA: combat.combatA,
        combatB: combat.combatB
      }
    });
    combat.openingResolved = true;
    combat.openingActions = { sideA: null, sideB: null };
    combat.actionCursor = result.nextCursor;
    combat.actionCount = (combat.actionCount || 0) + (result.actionSegments?.length || 0);
    this._applyPvpResult(match, result);
    return result;
  }

  if (!this._playerOwnsCursor(match, userId, combat.actionCursor)) {
    throw new Error('User is not the active player');
  }

  const result = this._resolveCursorAction({
    sideA: combat.sideA,
    sideB: combat.sideB,
    cursor: combat.actionCursor,
    action,
    partyA: combat.partyA,
    partyB: combat.partyB,
    partySkillsA: combat.partySkillsA,
    partySkillsB: combat.partySkillsB,
    combatA: combat.combatA,
    combatB: combat.combatB
  });
  combat.actionCursor = result.nextCursor;
  combat.actionCount = (combat.actionCount || 0) + 1;
  this._applyPvpResult(match, result);
  return result;
}
```

Add `_applyPvpResult(match, result)` by moving winner assignment from `submitMoves()` into a shared helper:

```js
_applyPvpResult(match, result) {
  if (!result?.winner) return;
  match.phase = 'finished';
  if (result.winner === 'sideA') {
    match.winnerId = match.player1.userId;
  } else if (result.winner === 'sideB') {
    match.winnerId = match.player2.userId;
  } else {
    match.winnerId = 'draw';
  }
}
```

Keep `submitMoves()` temporarily for compatibility until the socket and UI are migrated.

- [ ] **Step 7: Run match manager tests**

Run:

```bash
node --test tests/unit/pvp/match-manager.test.js --test-name-pattern "opening actions|non-owner"
```

Expected: pass.

- [ ] **Step 8: Run full match manager tests**

Run:

```bash
node --test tests/unit/pvp/match-manager.test.js
```

Expected: pass.

- [ ] **Checkpoint**

Run:

```bash
node --check src/pvp/match-manager.js
git diff -- src/pvp/match-manager.js tests/unit/pvp/match-manager.test.js
```

Expected: protocol supports `submitAction()` without removing existing socket behavior yet.

---

## Task 9: PvP Socket Events

**Files:**
- Modify: `src/pvp/socket-handler.js`
- Modify: `public/js/pvp-socket.js`

- [ ] **Step 1: Add client socket wrapper**

In `public/js/pvp-socket.js`, add:

```js
export function submitAction(action) {
  if (!socket) return;
  socket.emit('pvp:submit-action', { action });
}
```

Keep `submitMoves()` until `pvp-battle.js` is migrated.

- [ ] **Step 2: Include cursor in match-start payload**

In `src/pvp/socket-handler.js`, add `actionCursor` and `openingResolved` to both `pvp:match-start` payloads:

```js
actionCursor: match.combat.actionCursor,
openingResolved: match.combat.openingResolved
```

- [ ] **Step 3: Add `pvp:submit-action` handler**

In `src/pvp/socket-handler.js`, add a new socket listener after `pvp:submit-moves`:

```js
socket.on('pvp:submit-action', ({ action } = {}) => {
  const found = mm.findMatchBySocket(socket.id);
  if (!found) return;

  try {
    const result = mm.submitAction(found.code, socket.userId, action);
    const match = mm.getMatch(found.code);
    if (!match) return;

    if (result === null) {
      const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
      const otherPlayer = match[otherPlayerKey];
      const otherSocket = otherPlayer ? io.sockets.sockets.get(otherPlayer.socketId) : null;
      if (otherSocket) otherSocket.emit('pvp:opening-action-submitted');
      return;
    }

    const p1Socket = io.sockets.sockets.get(match.player1.socketId);
    const p2Socket = io.sockets.sockets.get(match.player2.socketId);
    const base = {
      actionSegments: result.actionSegments,
      attacks: result.attacks,
      winner: result.winner,
      actionCursor: match.combat.actionCursor,
      openingResolved: match.combat.openingResolved
    };

    if (p1Socket) {
      p1Socket.emit('pvp:action-result', {
        ...base,
        allies: result.sideA,
        enemies: result.sideB
      });
    }
    if (p2Socket) {
      p2Socket.emit('pvp:action-result', {
        ...base,
        allies: result.sideB,
        enemies: result.sideA
      });
    }

    mm.saveMatch(found.code);

    if (result.winner) {
      const winnerId = match.winnerId;
      const winnerName = winnerId === match.player1.userId
        ? match.player1.username
        : winnerId === match.player2?.userId
          ? match.player2.username
          : null;
      io.to(found.code).emit('pvp:match-end', { winnerId, winnerName });
    }
  } catch (error) {
    socket.emit('pvp:error', { message: error.message });
  }
});
```

- [ ] **Step 4: Syntax check**

Run:

```bash
node --check src/pvp/socket-handler.js
node --check public/js/pvp-socket.js
```

Expected: pass.

- [ ] **Checkpoint**

Run:

```bash
git diff -- src/pvp/socket-handler.js public/js/pvp-socket.js
```

Expected: new action event exists alongside old move batch event.

---

## Task 10: PvP Frontend Sequential UI

**Files:**
- Modify: `public/js/ui/pvp-battle.js`

- [ ] **Step 1: Replace PvP batch state**

In `startPvpBattle()`, replace:

```js
moveChoices: [],
currentCreatureIdx: 0,
waitingForOpponent: false,
roundNumber: 1
```

with:

```js
actionCursor: data.actionCursor || null,
openingResolved: data.openingResolved === true,
waitingForOpponent: false,
actionPlaybackActive: false
```

- [ ] **Step 2: Register new socket events**

Replace the `pvp:opponent-submitted` and `pvp:round-result` UI flow with:

```js
pvpSocket.on('pvp:opening-action-submitted', () => {
  showWaitingForOpponent('Opponent chose their opening move. Waiting for your opening move...');
});

pvpSocket.on('pvp:action-result', (result) => {
  handleActionResult(result);
});
```

Keep `pvp:round-result` only as a temporary fallback if needed by old matches.

- [ ] **Step 3: Show only the active owned creature**

Replace `showMoveSelection()` with:

```js
function showMoveSelection() {
  if (!pvpState || pvpState.actionPlaybackActive) return;

  const cursor = pvpState.actionCursor;
  const needsOpening = !pvpState.openingResolved;
  const creatureIndex = needsOpening
    ? findHighestDexLivingIndex(pvpState.allies)
    : cursor?.side === pvpState.mySide
      ? cursor.index
      : null;

  if (creatureIndex === null || creatureIndex === undefined) {
    showWaitingForOpponent(needsOpening
      ? 'Waiting for both opening moves...'
      : 'Waiting for opponent action...');
    return;
  }

  const creature = pvpState.allies[creatureIndex];
  showMoves(creature, creatureIndex, {
    includeItems: false,
    onMoveSelect: (move, selectedIndex) => {
      playSFX('button-tap');
      handleMoveSelected(creature, selectedIndex, move);
    }
  });
  setActiveLabel(creature);
}
```

Add:

```js
function findHighestDexLivingIndex(creatures) {
  let bestIndex = null;
  let bestDex = -Infinity;
  let bestLevel = -Infinity;
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (!c || c.hp <= 0) continue;
    const dex = c.dex || 1;
    const level = c.level || 1;
    if (dex > bestDex || (dex === bestDex && level > bestLevel)) {
      bestIndex = i;
      bestDex = dex;
      bestLevel = level;
    }
  }
  return bestIndex;
}
```

- [ ] **Step 4: Submit one action**

Update `addMoveChoice()`:

```js
function addMoveChoice(creatureIndex, moveId, targetIndex) {
  if (!pvpState) return;
  pvpState.waitingForOpponent = true;
  pvpSocket.submitAction({ creatureIndex, moveId, targetIndex });
  showWaitingForOpponent(pvpState.openingResolved ? 'Action submitted...' : 'Opening move submitted...');
}
```

Rest moves should call:

```js
pvpSocket.submitAction({ creatureIndex, action: 'rest' });
```

- [ ] **Step 5: Handle one action result**

Add:

```js
async function handleActionResult(result) {
  if (!pvpState) return;
  pvpState.actionPlaybackActive = true;
  pvpState.waitingForOpponent = false;

  await showActionSegments(result.actionSegments || [{
    actor: { side: pvpState.mySide, index: 0 },
    attacks: result.attacks || []
  }]);

  pvpState.allies = result.allies;
  pvpState.enemies = result.enemies;
  pvpState.actionCursor = result.actionCursor;
  pvpState.openingResolved = result.openingResolved === true;

  if (sceneModule?.showFormation) {
    sceneModule.showFormation('player', pvpState.allies);
    sceneModule.showFormation('enemy', pvpState.enemies);
  }
  syncPvpBattleScene();
  syncAllStatusLabels();

  pvpState.actionPlaybackActive = false;

  if (!result.winner) {
    showMoveSelection();
  }
}
```

Implement `showActionSegments(segments)` by adapting `showAttackSummary(attacks)` so it loops segment by segment, calls `showAttackDisplay()` for each attack, and waits for each card tap before continuing.

- [ ] **Step 6: Syntax check**

Run:

```bash
node --check public/js/ui/pvp-battle.js
```

Expected: pass.

- [ ] **Checkpoint**

Run:

```bash
git diff -- public/js/ui/pvp-battle.js
```

Expected: PvP no longer accumulates `moveChoices` for all living allies.

---

## Task 11: Cleanup Old Batch Assumptions

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/pvp/pvp-combat.js`
- Modify: `src/pvp/match-manager.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/pvp-battle.js`
- Modify: tests touched earlier

- [ ] **Step 1: Search for stale batch language**

Run:

```bash
rg "All creatures have chosen|movesSubmitted|submitMoves|round-result|moveChoices = \\[\\]|currentCreatureIdx|collects MP regens from both sides|ticks status effects at start of round" src public tests
```

Expected: only compatibility wrappers or tests intentionally covering legacy helpers remain.

- [ ] **Step 2: Remove unused full-round PvP client path**

After PvP UI uses `submitAction()`, remove `submitMoves()` usage from `public/js/ui/pvp-battle.js`. Keep `pvpSocket.submitMoves()` only if another file still imports it.

- [ ] **Step 3: Rename or adjust tests that assert old round semantics**

In `tests/unit/pvp/pvp-combat.test.js`, old tests for `resolveRound()` may remain if the function remains exported. Add new assertions that production `MatchManager.submitAction()` does not call `resolveRound()`.

- [ ] **Step 4: Run search again**

Run:

```bash
rg "All creatures have chosen|movesSubmitted|submitMoves|collects MP regens from both sides|ticks status effects at start of round" src public tests
```

Expected: no stale production path remains. Test references are allowed only when explicitly testing legacy exported helpers.

- [ ] **Checkpoint**

Run:

```bash
git diff --stat
```

Expected: all changes map to action-cursor flow.

---

## Task 12: Verification

**Files:**
- All touched files

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check src/game/combat/action-cursor.js
node --check src/game/services/creature-combat-service.js
node --check src/game/services/combat-cycle-service.js
node --check src/routes/game/combat.js
node --check src/pvp/pvp-combat.js
node --check src/pvp/match-manager.js
node --check src/pvp/socket-handler.js
node --check public/js/ui/combat-loop.js
node --check public/js/ui/pvp-battle.js
node --check public/js/pvp-socket.js
```

Expected: all print no syntax errors.

- [ ] **Step 2: Run targeted unit tests**

Run:

```bash
node --test tests/unit/combat/action-cursor.test.js
node --test tests/unit/combat/creature-combat-service.test.js
node --test tests/unit/game/combat-action-state.test.js
node --test tests/unit/pvp/pvp-combat.test.js
node --test tests/unit/pvp/match-manager.test.js
```

Expected: all pass.

- [ ] **Step 3: Run targeted integration tests**

Run:

```bash
node --test tests/integration/flows/combat.test.js
```

Expected: pass.

- [ ] **Step 4: Run full merge gate**

Run:

```bash
npm test
```

Expected: Tier 1 and Tier 2 tests pass.

- [ ] **Step 5: Manual visual verification**

Because this changes combat UI flow and animation timing, ask the user before launching Playwright. If approved, run:

```bash
npm run dev
```

Verify `http://localhost:5173` returns HTTP 200, then use Playwright to enter combat and capture evidence that:

- One player move is selected.
- That one move animates immediately.
- If an enemy is next, one enemy action animates before the next player prompt.
- The next player prompt appears only after prior action playback completes.

Delete any screenshots immediately after they have been shown.

- [ ] **Step 6: Final diff review**

Run:

```bash
git status --short
git diff --stat
git diff -- docs/superpowers/specs/2026-05-09-action-cursor-combat-flow-design.md docs/superpowers/plans/2026-05-09-action-cursor-combat-flow.md
```

Expected: design and plan are present, and code changes are limited to the planned combat files.

