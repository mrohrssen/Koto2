# loop.js Breakup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break up the 2,026-line `GameManager` god class into shared combat resolution helpers + a `CombatCycleService`, reducing it to a thin coordinator. The combat extraction does the real work; an optional follow-up cleanup can push the file closer to ~470 lines.

**Architecture:** Phase 1 extracts duplicated combat resolution patterns (element drops, KO handling, victory/defeat cleanup) into `src/game/combat/resolution.js` — pure functions consumed by both PvE and PvP. Phase 2 moves combat methods into `src/game/services/combat-cycle-service.js` using the same delegation pattern as `ExplorationService`, while keeping temporary `GameManager` delegators so the tree never goes red mid-refactor. Phase 3 is optional follow-up cleanup: remove exploration pass-throughs and direct callers only if the extra churn is worth the additional line-count reduction.

**Tech Stack:** ES6 modules, Node.js `node:test` runner, `node:assert/strict`, `c8` coverage

**Spec:** `docs/superpowers/specs/2026-04-15-loop-js-breakup-design.md`

**Line-number note:** Function names are the source of truth. The line numbers below are from the 2026-04-15 snapshot and must be re-verified before each move.

---

## File Map

```
src/game/combat/
  resolution.js              ← NEW: shared resolution helpers (PvE + PvP)
  effects.js                 ← EXISTS: status effects (unchanged)
  party-skill-engine.js      ← EXISTS: party skill engine (unchanged)

src/game/services/
  combat-cycle-service.js    ← NEW: owns combat turn loop, befriend, swaps
  exploration-service.js     ← EXISTS: unchanged
  index.js                   ← MODIFY: re-export CombatCycleService

src/game/
  loop.js                    ← MODIFY: remove ~1,550 lines, delegate to services

src/pvp/
  pvp-combat.js              ← MODIFY: use shared resolution helpers

src/routes/game/
  combat.js                  ← MODIFY: route through services, absorb befriend-talk inline logic
  run.js                     ← MODIFY: call explorationService directly
  economy.js                 ← MODIFY: call explorationService directly
  misc.js                    ← MODIFY: call explorationService directly, remove dead route

tests/integration/flows/
  combat.test.js             ← MODIFY: regression coverage for route-level combat fixes

tests/unit/combat/
  resolution.test.js         ← NEW: unit tests for resolution helpers

tests/unit/game/
  speed-review-room.test.js  ← MODIFY IF Chunk 3 executes: direct GameManager caller migration
  whack-a-mole.test.js       ← MODIFY IF Chunk 3 executes: direct GameManager caller migration

tests/unit/pvp/
  pvp-combat.test.js         ← MODIFY: parity coverage for KO removal + winner detection
```

## Intentional Behavior Changes

This refactor is not purely mechanical — several inconsistencies in the original code are fixed:

1. **Boss dialogue on all victory paths.** `finalizeCombatVictory` always checks for boss defeat dialogue. Previously, only the attack-turn victory path triggered boss dialogue; befriend/quiz/fight victories silently skipped it. This is a bug fix.
2. **Null compaction in `handleBefriendQuizAnswer` wrong-answer path.** The original code at line 1843-1853 did not compact null slots or track `koRemovals`. Using `processKOSwaps` here adds both. This is a consistency fix.
3. **Defeat handling in `befriend-talk` rejection.** The original inline code at `combat.js:352-356` did not save pending captures or call `_onRunDefeat()` on defeat. Using `resolveDefeat` here adds both. This aligns it with all other defeat paths.
4. **NPC skill KO defeat path.** The NPC skill KO at `loop.js:1008-1013` did not save pending captures. Using `resolveDefeat` here fixes this.

**Key existing files referenced:**
- `src/game/loop.js` — the file being broken up (GameManager class)
- `src/pvp/pvp-combat.js:254-296` — PvP KO handling + win check to replace
- `src/routes/game/combat.js:330-370` — inline KO handling in befriend-talk to absorb
- `src/game/services/creature-combat-service.js` — low-level combat functions (unchanged, consumed by both services)

## Shipping Constraints

1. **Do not create intentionally broken commits.** No task in this plan is allowed to land with `npm test` red just because the next task will fix it. If methods move before callers move, keep temporary one-line `GameManager` delegators until the caller migration is complete, then delete them in a later passing commit.
2. **Treat direct test callers as real callers.** `tests/unit/game/speed-review-room.test.js` and `tests/unit/game/whack-a-mole.test.js` call `GameManager` exploration pass-throughs directly today. If Chunk 3 removes those pass-throughs, those tests must be migrated in the same chunk or the pass-throughs must stay.
3. **`skipShop()` stays on `GameManager`.** It is a 6-line coordinator method, already isolated, and not worth moving just to keep all shop-related code together. This matches the spec and avoids gratuitous route churn.
4. **Chunk 3 is optional.** After Chunk 2, stop and assess the diff. If the combat breakup already delivered the maintainability win, ship it and spin exploration pass-through cleanup into a separate plan.

## Required Regression Coverage

These behavior fixes are part of the refactor and are not complete until they are covered by tests:

- `tests/integration/flows/combat.test.js`
  - Add a regression that proves route-driven combat still works after the `CombatCycleService` extraction.
  - Add a focused regression for the befriend-talk rejection path: if the rejection enemy turn wipes the party, the response reports `combatEnded: true` and the saved state shows the run/combat ended cleanly.
- `tests/unit/pvp/pvp-combat.test.js`
  - Add a no-reserves KO case that verifies `koRemovals` is populated and the side array compacts before winner calculation.
- `tests/unit/game/combat-breakup-regressions.test.js` (NEW)
  - Add a regression for the NPC-skill KO defeat path proving pending captures are flushed to collection before defeat cleanup completes.
  - Add a regression for the befriend quiz wrong-answer path proving null slots are compacted and `koRemovals` is surfaced when no reserve exists.
- `tests/unit/combat/resolution.test.js`
  - Keep helper-unit coverage, but do not rely on helper-unit coverage alone for the four intentional behavior fixes above.

---

## Chunk 1: Extract shared resolution helpers

### Task 1: Create `resolution.js` with `checkAllDefeated`

**Files:**
- Create: `src/game/combat/resolution.js`
- Create: `tests/unit/combat/resolution.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/combat/resolution.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAllDefeated } from '../../../src/game/combat/resolution.js';

describe('checkAllDefeated', () => {
  it('returns true for empty array', () => {
    assert.equal(checkAllDefeated([]), true);
  });

  it('returns true when all hp <= 0', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: -5, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });

  it('returns false when any creature alive', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: 10, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), false);
  });

  it('returns true when all null', () => {
    assert.equal(checkAllDefeated([null, null]), true);
  });

  it('treats befriended enemies as defeated', () => {
    const creatures = [
      { hp: 30, maxHp: 50, befriended: true },
      { hp: 0, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/game/combat/resolution.js

/**
 * Check if all creatures on a side are defeated (hp <= 0, null, or befriended).
 * @param {object[]} creatures
 * @returns {boolean}
 */
export function checkAllDefeated(creatures) {
  if (creatures.length === 0) return true;
  return creatures.every(c => !c || c.hp <= 0 || c.befriended);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/resolution.js tests/unit/combat/resolution.test.js
git commit -m "feat: add checkAllDefeated helper to combat resolution module"
```

---

### Task 2: Add `processKOSwaps` to resolution.js

**Files:**
- Modify: `src/game/combat/resolution.js`
- Modify: `tests/unit/combat/resolution.test.js`

The function needs `handleCreatureKO` from creature-combat-service. It returns raw `{ index, replacement, name }` data — callers format for their response shape.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/combat/resolution.test.js`:

```js
import { processKOSwaps } from '../../../src/game/combat/resolution.js';

describe('processKOSwaps', () => {
  function makeParty(active, reserves = []) {
    return { active, reserves };
  }

  it('returns empty arrays when no allies are KO', () => {
    const allies = [{ hp: 50, maxHp: 50, nameEn: 'A' }];
    const party = makeParty(allies);
    const result = processKOSwaps(allies, party);
    assert.deepEqual(result.koSwaps, []);
    assert.deepEqual(result.koRemovals, []);
  });

  it('swaps KO creature with reserve', () => {
    const reserve = { hp: 40, maxHp: 40, nameEn: 'Reserve', name: 'リザーブ' };
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = makeParty(allies, [reserve]);
    const result = processKOSwaps(allies, party);

    assert.equal(result.koSwaps.length, 1);
    assert.equal(result.koSwaps[0].index, 0);
    assert.ok(result.koSwaps[0].replacement); // creature object
    assert.equal(result.koRemovals.length, 0);
  });

  it('records removal when no reserves available', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' }
    ];
    const party = makeParty(allies, []);
    const result = processKOSwaps(allies, party);

    assert.equal(result.koSwaps.length, 0);
    assert.equal(result.koRemovals.length, 1);
    assert.equal(result.koRemovals[0].index, 0);
    assert.equal(result.koRemovals[0].name, 'Dead');
  });

  it('compacts null slots from active array in-place', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = makeParty(allies, []);
    processKOSwaps(allies, party);
    // Compaction mutates the SAME array (important for PvP aliasing)
    assert.equal(allies.length, 1);
    assert.equal(allies[0].nameEn, 'Alive');
    assert.strictEqual(party.active, allies); // same reference preserved
  });

  it('resetStatStages is called on replacement creature', () => {
    const reserve = { hp: 40, maxHp: 40, nameEn: 'R', name: 'リ', statStages: { atk: 3, def: -2 } };
    const allies = [{ hp: 0, maxHp: 50, nameEn: 'D', name: 'デ' }];
    const party = makeParty(allies, [reserve]);
    processKOSwaps(allies, party);
    // handleCreatureKO calls resetStatStages on the replacement
    assert.deepEqual(reserve.statStages, { atk: 0, def: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: FAIL — `processKOSwaps` not exported

- [ ] **Step 3: Write implementation**

Add to `src/game/combat/resolution.js`:

```js
import { handleCreatureKO } from '../services/creature-combat-service.js';
import { logger } from '../../logger.js';

/**
 * Process KO'd creatures — swap reserves in or permanently remove.
 * Returns raw data; callers format for their response shape.
 *
 * Compacts nulls IN-PLACE via backward splice (preserves array reference).
 * This is critical for PvP where sideA/sideB are aliased to party.active.
 *
 * @param {object[]} allies - Active creature array (mutated in-place)
 * @param {object} party - creatureParty with active/reserves
 * @returns {{ koSwaps: Array<{index: number, replacement: object}>, koRemovals: Array<{index: number, name: string}> }}
 */
export function processKOSwaps(allies, party) {
  const koSwaps = [];
  const koRemovals = [];

  for (let i = 0; i < allies.length; i++) {
    if (allies[i] && allies[i].hp <= 0) {
      const deadName = allies[i].nameEn || allies[i].name;
      const replacement = handleCreatureKO(party, i);
      if (replacement) {
        koSwaps.push({ index: i, replacement });
        logger.info('[Combat] KO swap: slot', i, '→', replacement.nameEn);
      } else {
        koRemovals.push({ index: i, name: deadName });
        logger.info('[Combat] KO removed: slot', i, deadName, '(no reserves)');
      }
    }
  }

  // Compact nulls in-place via backward splice (preserves array reference)
  for (let i = allies.length - 1; i >= 0; i--) {
    if (allies[i] === null) allies.splice(i, 1);
  }

  return { koSwaps, koRemovals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/resolution.js tests/unit/combat/resolution.test.js
git commit -m "feat: add processKOSwaps to shared combat resolution helpers"
```

---

### Task 3: Add `collectElementDrops` and `getElementDropList`

**Files:**
- Modify: `src/game/combat/resolution.js`
- Modify: `tests/unit/combat/resolution.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/combat/resolution.test.js`:

```js
import { collectElementDrops, getElementDropList } from '../../../src/game/combat/resolution.js';

describe('collectElementDrops', () => {
  it('increments element counts for defeated non-neutral enemies', () => {
    const meta = { elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
    const enemies = [
      { hp: 0, maxHp: 50, element: 'fire' },
      { hp: 0, maxHp: 50, element: 'water' },
      { hp: 30, maxHp: 50, element: 'earth' } // alive, skip
    ];
    collectElementDrops(meta, enemies, null);
    assert.equal(meta.elementDrops.fire, 1);
    assert.equal(meta.elementDrops.water, 1);
    assert.equal(meta.elementDrops.earth, 0);
  });

  it('skips neutral elements', () => {
    const meta = { elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
    const enemies = [{ hp: 0, maxHp: 50, element: 'neutral' }];
    collectElementDrops(meta, enemies, null);
    assert.deepEqual(meta.elementDrops, { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 });
  });

  it('initializes elementDrops if missing', () => {
    const meta = {};
    const enemies = [{ hp: 0, maxHp: 50, element: 'fire' }];
    collectElementDrops(meta, enemies, null);
    assert.equal(meta.elementDrops.fire, 1);
  });

  it('no-ops when meta is null', () => {
    // Should not throw
    collectElementDrops(null, [{ hp: 0, element: 'fire' }], null);
  });

  it('updates runSummary when provided', () => {
    const meta = { elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
    const summary = { creaturesDefeated: 0, elementsCollected: {} };
    const enemies = [{ hp: 0, maxHp: 50, element: 'fire' }];
    collectElementDrops(meta, enemies, summary);
    assert.equal(summary.creaturesDefeated, 1);
    assert.equal(summary.elementsCollected.fire, 1);
  });
});

describe('getElementDropList', () => {
  it('returns element names of defeated non-neutral enemies', () => {
    const enemies = [
      { hp: 0, element: 'fire' },
      { hp: 30, element: 'water' }, // alive
      { hp: 0, element: 'neutral' }, // neutral
      { hp: 0, element: 'earth' }
    ];
    const result = getElementDropList(enemies);
    assert.deepEqual(result, ['fire', 'earth']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: FAIL — `collectElementDrops` / `getElementDropList` not exported

- [ ] **Step 3: Write implementation**

Add to `src/game/combat/resolution.js`:

```js
/**
 * Collect element drops from defeated enemies into meta-progression and run summary.
 * No-op if meta is null.
 * @param {object|null} meta
 * @param {object[]} enemies
 * @param {object|null} runSummary
 */
export function collectElementDrops(meta, enemies, runSummary) {
  if (!meta) return;
  if (!meta.elementDrops) {
    meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
  }
  for (const enemy of enemies) {
    if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
      meta.elementDrops[enemy.element] = (meta.elementDrops[enemy.element] || 0) + 1;
    }
    if (enemy.hp <= 0 && runSummary) {
      runSummary.creaturesDefeated = (runSummary.creaturesDefeated || 0) + 1;
      if (enemy.element && enemy.element !== 'neutral') {
        if (!runSummary.elementsCollected) runSummary.elementsCollected = {};
        runSummary.elementsCollected[enemy.element] =
          (runSummary.elementsCollected[enemy.element] || 0) + 1;
      }
    }
  }
}

/**
 * Build the elementDropsCollected array for combat result payloads.
 * @param {object[]} enemies
 * @returns {string[]}
 */
export function getElementDropList(enemies) {
  return (enemies || [])
    .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
    .map(e => e.element);
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/resolution.js tests/unit/combat/resolution.test.js
git commit -m "feat: add collectElementDrops and getElementDropList to resolution helpers"
```

---

### Task 4: Add `finalizeCombatVictory` and `resolveDefeat`

**Files:**
- Modify: `src/game/combat/resolution.js`
- Modify: `tests/unit/combat/resolution.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/combat/resolution.test.js`:

```js
import { finalizeCombatVictory, resolveDefeat } from '../../../src/game/combat/resolution.js';

describe('finalizeCombatVictory', () => {
  it('marks room as interacted and increments encounters', () => {
    const rooms = [{ type: 'encounter', interacted: false }];
    const combat = { active: true, isBoss: false, enemies: [] };
    const run = { currentRoom: 0, rooms, currentAreaEncounters: 2 };
    finalizeCombatVictory(combat, run);
    assert.equal(combat.active, false);
    assert.equal(run.currentAreaEncounters, 3);
    assert.equal(rooms[0].interacted, true);
  });

  it('tracks boss defeat in run.bossesDefeated', () => {
    const combat = { active: true, isBoss: true, enemies: [{ id: 'boss1' }] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0, bossesDefeated: [] };
    finalizeCombatVictory(combat, run);
    assert.ok(run.bossesDefeated.includes('boss1'));
  });

  it('initializes bossesDefeated if missing', () => {
    const combat = { active: true, isBoss: true, enemies: [{ id: 'b1' }] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0 };
    finalizeCombatVictory(combat, run);
    assert.deepEqual(run.bossesDefeated, ['b1']);
  });

  it('calls narrate with boss defeat dialogue when template exists', () => {
    // Use a real creature ID from creatures.json that has bossDialogue
    // If none exists, this test verifies the narrate callback wiring
    const narrated = [];
    const combat = { active: true, isBoss: true, enemies: [{ id: 'fake_boss' }] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0, bossesDefeated: [] };
    finalizeCombatVictory(combat, run, { narrate: (t) => narrated.push(t) });
    // fake_boss won't exist in CREATURES_BY_ID, so narrate should NOT be called
    assert.equal(narrated.length, 0);
    // Boss is still tracked even without dialogue
    assert.ok(run.bossesDefeated.includes('fake_boss'));
  });
});

describe('resolveDefeat', () => {
  it('saves pending captures to collection and ends run', () => {
    const captured = { id: 'cap1', temporary: false };
    const combat = { active: true };
    const run = {
      active: true,
      creatureParty: { pendingCaptures: [captured] }
    };
    const meta = { creatureCollection: [] };
    const onDefeatCalled = [];
    resolveDefeat(combat, run, meta, { onDefeat: () => onDefeatCalled.push(true) });
    assert.equal(combat.active, false);
    assert.equal(run.active, false);
    assert.equal(run.creatureParty.pendingCaptures.length, 0);
    assert.equal(onDefeatCalled.length, 1);
  });

  it('skips collection for temporary creatures', () => {
    const captured = { id: 'temp1', temporary: true };
    const combat = { active: true };
    const run = {
      active: true,
      creatureParty: { pendingCaptures: [captured] }
    };
    const meta = { creatureCollection: [] };
    resolveDefeat(combat, run, meta);
    assert.ok(!meta.creatureCollection.includes('temp1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: FAIL

- [ ] **Step 3: Write implementation**

Add to `src/game/combat/resolution.js`:

```js
import { addToCollection } from '../services/creature-collection-service.js';
import { CREATURES_BY_ID } from '../creatures.js';

/**
 * End-of-combat victory cleanup.
 * Marks room interacted, increments encounters, tracks boss defeat.
 * @param {object} combat
 * @param {object} run
 * @param {object} [opts]
 * @param {Function} [opts.narrate] - Narration callback for boss defeat dialogue
 */
export function finalizeCombatVictory(combat, run, opts = {}) {
  combat.active = false;
  run.currentAreaEncounters = (run.currentAreaEncounters || 0) + 1;

  const currentRoom = run.rooms?.[run.currentRoom];
  if (currentRoom) {
    currentRoom.interacted = true;
  }

  // Boss defeat tracking
  if (combat.isBoss && combat.enemies?.[0]?.id) {
    const bossId = combat.enemies[0].id;
    const bossTemplate = CREATURES_BY_ID[bossId];
    if (bossTemplate?.bossDialogue?.defeat && opts.narrate) {
      opts.narrate(bossTemplate.bossDialogue.defeat);
    }
    if (!run.bossesDefeated) run.bossesDefeated = [];
    if (!run.bossesDefeated.includes(bossId)) {
      run.bossesDefeated.push(bossId);
    }
  }
}

/**
 * Save pending captures to collection and end the run on defeat.
 * @param {object} combat
 * @param {object} run
 * @param {object|null} meta
 * @param {object} [opts]
 * @param {Function} [opts.onDefeat] - Called after marking run inactive
 */
export function resolveDefeat(combat, run, meta, opts = {}) {
  const pending = run.creatureParty?.pendingCaptures || [];
  for (const creature of pending) {
    if (meta && !creature.temporary) {
      const result = addToCollection(meta.creatureCollection || [], creature.id);
      if (result.added) {
        meta.creatureCollection = result.collection;
      }
    }
  }
  if (run.creatureParty) {
    run.creatureParty.pendingCaptures = [];
  }

  combat.active = false;
  run.active = false;
  if (opts.onDefeat) opts.onDefeat();
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/combat/resolution.test.js`
Expected: all PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: all existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/game/combat/resolution.js tests/unit/combat/resolution.test.js
git commit -m "feat: add finalizeCombatVictory and resolveDefeat to resolution helpers"
```

---

### Task 4A: Add regression coverage for intentional behavior fixes

**Files:**
- Create: `tests/unit/game/combat-breakup-regressions.test.js`
- Modify: `tests/integration/flows/combat.test.js`
- Modify: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Add the failing regressions**

Add targeted tests for the behavior changes called out earlier:

- `tests/unit/game/combat-breakup-regressions.test.js`
  - NPC skill KO defeat preserves pending captures in `meta.creatureCollection`
  - Befriend quiz wrong-answer path emits `koRemovals` and compacts `run.creatureParty.active`
- `tests/unit/pvp/pvp-combat.test.js`
  - No-reserve KO produces `koRemovals` and correct `winner`
- `tests/integration/flows/combat.test.js`
  - Route-level combat still completes normally after service extraction

- [ ] **Step 2: Run only the new/updated regressions**

Run:

```bash
node --test tests/unit/game/combat-breakup-regressions.test.js tests/unit/pvp/pvp-combat.test.js tests/integration/flows/combat.test.js
```

Expected: FAIL — assertions expose the pre-refactor inconsistencies

- [ ] **Step 3: Keep these regressions green as the mechanical refactor proceeds**

Do not delete or weaken these tests during extraction. They are the guardrails for the intentional behavior changes in this plan.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/game/combat-breakup-regressions.test.js tests/unit/pvp/pvp-combat.test.js tests/integration/flows/combat.test.js
git commit -m "test: lock regression coverage for loop.js breakup behavior fixes"
```

---

### Task 5: Wire PvE `loop.js` to use resolution helpers

**Files:**
- Modify: `src/game/loop.js`

This is the biggest single step. Replace all 6 element-drop blocks, 4 KO-swap loops, 3 defeat blocks, and victory cleanup blocks with calls to the shared helpers. The turn methods should each shrink dramatically.

- [ ] **Step 1: Add imports to `loop.js`**

Add at the top of `src/game/loop.js`, after the existing imports:

```js
import {
  checkAllDefeated,
  processKOSwaps,
  collectElementDrops,
  getElementDropList,
  finalizeCombatVictory,
  resolveDefeat
} from './combat/resolution.js';
```

- [ ] **Step 2: Replace KO handling in `_handleCreatureAttackTurn`**

Find the block at lines ~1045-1062 (starting with `// Handle KO'd allies`). Replace with:

```js
    const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(this.combat.allies, this.run.creatureParty);
    const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
    this.combat.allies = this.run.creatureParty.active;
```

- [ ] **Step 3: Replace element-drop collection in `_handleCreatureAttackTurn`**

Replace the two element-drop blocks (lines ~912-930 and ~1069-1087) with:

```js
    collectElementDrops(this.meta, this.combat.enemies, this.run?.runSummary);
```

And replace the `elementDropsCollected` lines in the return objects with:

```js
    elementDropsCollected: getElementDropList(this.combat.enemies)
```

- [ ] **Step 4: Replace victory cleanup in `_handleCreatureAttackTurn`**

Replace lines ~932-950 (combat.active = false, increment encounters, room interacted, boss tracking) with:

```js
    finalizeCombatVictory(this.combat, this.run, { narrate: (t) => this.narrate(t) });
```

- [ ] **Step 5: Replace defeat handling in `_handleCreatureAttackTurn`**

Replace lines ~1120-1137 (`allAlliesKO` check + pending captures + combat/run deactivation) with:

```js
    if (checkAllDefeated(this.combat.allies)) {
      resolveDefeat(this.combat, this.run, this.meta, { onDefeat: () => this._onRunDefeat() });
      this.emitState();
      return { /* defeat result */ };
    }
```

Preserve the existing return object shape — only change the setup code.

- [ ] **Step 6: Replace NPC skill KO defeat path in `_handleCreatureAttackTurn`**

The NPC skill KO check at lines ~1008-1013 uses inline defeat handling that does NOT save pending captures. Replace with `resolveDefeat` for consistency (this is an intentional behavior fix — see "Intentional Behavior Changes" section):

```js
    if (allAlliesKOAfterNpc) {
      resolveDefeat(this.combat, this.run, this.meta, { onDefeat: () => this._onRunDefeat() });
      this.emitState();
      return { /* same return shape as before */ };
    }
```

- [ ] **Step 7: Apply to `_handleCreatureDefendTurn`**

Replace these blocks:
- KO handling (lines ~1218-1235): Replace full loop with `processKOSwaps` + map to `{ slot, replacement: nameEn }` format
- Add `this.combat.allies = this.run.creatureParty.active;` after (array ref changed by splice)
- Defeat check (lines ~1237-1271): Replace `allAlliesKO` + pending-captures-save + deactivation with `checkAllDefeated` + `resolveDefeat`

Note: this path has no element drops or victory — it's defend-only.

- [ ] **Step 8: Apply to `_handleCreatureBefriendTurn`**

Replace these blocks:
- Element drops on befriend victory (lines ~1343-1361) → `collectElementDrops(this.meta, this.combat.enemies, this.run?.runSummary)`
- Victory cleanup (lines ~1363-1368) → `finalizeCombatVictory(this.combat, this.run, { narrate: (t) => this.narrate(t) })`
- Return object `elementDropsCollected` → `getElementDropList(this.combat.enemies)`
- KO handling (lines ~1398-1415) → `processKOSwaps` + map + reassign `this.combat.allies`
- Defeat (lines ~1417-1451) → `checkAllDefeated` + `resolveDefeat`

- [ ] **Step 9: Apply to `befriendReplace`**

Replace element-drop block (lines ~1719-1737) → `collectElementDrops`
Replace victory cleanup (lines ~1739-1745) → `finalizeCombatVictory`
Replace `elementDropsCollected` → `getElementDropList`

- [ ] **Step 10: Apply to `handleBefriendQuizAnswer`**

Replace element-drop block (lines ~1804-1822) → `collectElementDrops` + `finalizeCombatVictory`
Replace KO handling (lines ~1843-1853) → `processKOSwaps` + map

**Behavior change:** This path previously did NOT track `koRemovals` or compact nulls. Using `processKOSwaps` adds both. This is an intentional consistency fix.

- [ ] **Step 11: Apply to `handleBefriendFight`**

Replace element-drop block (lines ~1900-1918) → `collectElementDrops` + `finalizeCombatVictory`
Replace `elementDropsCollected` → `getElementDropList`

- [ ] **Step 12: Apply to `swapCreature`**

Replace the simplified KO loop (lines ~1560-1564) with `processKOSwaps`. The `swapCreature` return object doesn't include `koSwaps`/`koRemovals`, so discard the helper's return value — we just need the compaction side effect.

- [ ] **Step 12: Remove now-unused imports from `loop.js`**

`addToCollection` is no longer directly needed (used by `resolveDefeat` internally). `CREATURES_BY_ID` may no longer be needed if boss dialogue moved to `finalizeCombatVictory`. Check and remove.

- [ ] **Step 13: Run full test suite**

Run: `npm test`
Expected: all pass — the behavior is identical, just extracted

- [ ] **Step 14: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 15: Commit**

```bash
git add src/game/loop.js
git commit -m "refactor: wire loop.js to use shared combat resolution helpers"
```

---

### Task 6: Wire PvP `pvp-combat.js` to use shared helpers

**Files:**
- Modify: `src/pvp/pvp-combat.js`

- [ ] **Step 1: Add import**

Add to the imports in `pvp-combat.js`:

```js
import { processKOSwaps, checkAllDefeated } from '../game/combat/resolution.js';
```

- [ ] **Step 2: Replace KO handling for sideA (lines ~256-272)**

Replace:
```js
  if (partyA) {
    for (let i = 0; i < sideA.length; i++) {
      if (sideA[i] && sideA[i].hp <= 0) {
        const deadName = sideA[i].nameEn || sideA[i].name;
        const replacement = handleCreatureKO(partyA, i);
        if (replacement) {
          koSwaps.push({ side: 'sideA', index: i, replacement });
        } else {
          koRemovals.push({ side: 'sideA', index: i, name: deadName });
        }
      }
    }
    for (let i = sideA.length - 1; i >= 0; i--) {
      if (sideA[i] === null) sideA.splice(i, 1);
    }
  }
```

With:
```js
  if (partyA) {
    const resultA = processKOSwaps(sideA, partyA);
    koSwaps.push(...resultA.koSwaps.map(s => ({ side: 'sideA', index: s.index, replacement: s.replacement })));
    koRemovals.push(...resultA.koRemovals.map(r => ({ side: 'sideA', index: r.index, name: r.name })));
  }
```

- [ ] **Step 3: Replace KO handling for sideB (lines ~273-289)**

Same pattern, with `'sideB'` and `partyB`.

- [ ] **Step 4: Replace win condition check (lines ~291-296)**

Replace:
```js
  const allADead = sideA.length === 0 || sideA.every(c => !c || c.hp <= 0);
  const allBDead = sideB.length === 0 || sideB.every(c => !c || c.hp <= 0);
```

With:
```js
  const allADead = checkAllDefeated(sideA);
  const allBDead = checkAllDefeated(sideB);
```

- [ ] **Step 5: Remove now-unused `handleCreatureKO` import**

Remove `handleCreatureKO` from the creature-combat-service import line.

- [ ] **Step 6: Run PvP tests**

Run: `node --test tests/unit/pvp/pvp-combat.test.js`
Expected: all PASS

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add src/pvp/pvp-combat.js
git commit -m "refactor: PvP uses shared processKOSwaps and checkAllDefeated from resolution.js"
```

---

## Chunk 2: Extract CombatCycleService

### Task 7: Create `CombatCycleService` with combat methods — pure move plus temporary delegators

**Files:**
- Create: `src/game/services/combat-cycle-service.js`
- Modify: `src/game/services/index.js`
- Modify: `src/game/loop.js`

This is a pure mechanical move. All combat methods leave `GameManager` and land in `CombatCycleService`. References to `this.X` become `this.gm.X`. Public `GameManager` entrypoints remain as temporary one-line delegators in this task so routes and tests keep passing while caller migration catches up.

- [ ] **Step 1: Create `combat-cycle-service.js` with all moved methods**

Create `src/game/services/combat-cycle-service.js`. Move these methods from `GameManager`:

- `startCreatureEncounter` (loop.js:537)
- `creatureCombatCycle` (loop.js:704)
- `_handleCreatureAttackTurn` (loop.js:730)
- `_handleCreatureDefendTurn` (loop.js:1193)
- `_handleCreatureBefriendTurn` (loop.js:1304)
- `swapCreature` (loop.js:1532)
- `rearrangeCreatures` (loop.js:1607)
- `swapCreatureOutOfCombat` (loop.js:1636)
- `befriendReplace` (loop.js:1660)
- `getBefriendQuiz` (loop.js:1771)
- `handleBefriendQuizAnswer` (loop.js:1786)
- `handleBefriendFight` (loop.js:1884)
- `_flushPendingCaptures` (loop.js:668)
- `rollPostCombatShop` (loop.js:1483)
- `selectShopItem` (loop.js:1497)

The class shape:

```js
export class CombatCycleService {
  constructor(gm) {
    this.gm = gm;
  }

  // All methods from above, with:
  // - this.combat → this.gm.combat
  // - this.run → this.gm.run
  // - this.meta → this.gm.meta
  // - this.userId → this.gm.userId
  // - this.emitState() → this.gm.emitState()
  // - this.narrate() → this.gm.narrate()
  // - this.exposeWords() → this.gm.exposeWords()
  // - this._onRunDefeat() → this.gm._onRunDefeat()
  // - this._debugSuperAttack → this.gm._debugSuperAttack
}
```

Move imports from `loop.js` that are only used by the moved methods into `combat-cycle-service.js` instead.

- [ ] **Step 2: Update `index.js` to export**

```js
// src/game/services/index.js
export { ExplorationService } from './exploration-service.js';
export { CombatCycleService } from './combat-cycle-service.js';
```

- [ ] **Step 3: Wire GameManager to use CombatCycleService**

In `src/game/loop.js`, add to constructor:

```js
import { CombatCycleService } from './services/combat-cycle-service.js';

// In constructor:
this.combatCycleService = new CombatCycleService(this);
```

Move the implementation bodies out of `GameManager`, but keep temporary public delegators on `GameManager` for anything still called outside the class:

```js
startCreatureEncounter() {
  return this.combatCycleService.startCreatureEncounter();
}

creatureCombatCycle(actionType = 'attack', moveChoices = []) {
  return this.combatCycleService.creatureCombatCycle(actionType, moveChoices);
}
```

Do the same for the other public combat entrypoints still called by routes/tests:
- `rollPostCombatShop`
- `selectShopItem`
- `swapCreature`
- `rearrangeCreatures`
- `swapCreatureOutOfCombat`
- `befriendReplace`
- `getBefriendQuiz`
- `handleBefriendFight`
- `handleBefriendQuizAnswer`

Remove only private helpers that no longer need to live on `GameManager`, plus the dead `completeNpcDialogue` method.

- [ ] **Step 4: Syntax check both files**

Run: `node --check src/game/loop.js && node --check src/game/services/combat-cycle-service.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all PASS — temporary `GameManager` delegators keep routes/tests green while the caller migration happens

- [ ] **Step 6: Commit**

```bash
git add src/game/loop.js src/game/services/combat-cycle-service.js src/game/services/index.js
git commit -m "refactor: extract CombatCycleService from GameManager with temporary delegators"
```

---

### Task 8: Update combat routes to call CombatCycleService

**Files:**
- Modify: `src/routes/game/combat.js`

- [ ] **Step 1: Update all combat method calls**

Replace `gameManager.X()` and `gm.X()` with `gameManager.combatCycleService.X()` / `gm.combatCycleService.X()` for these call sites:

| Line | Old call | New call |
|------|----------|----------|
| 59 | `gameManager.startCreatureEncounter()` | `gameManager.combatCycleService.startCreatureEncounter()` |
| 126 | `gameManager.creatureCombatCycle(...)` | `gameManager.combatCycleService.creatureCombatCycle(...)` |
| 178 | `gameManager.rollPostCombatShop()` | `gameManager.combatCycleService.rollPostCombatShop()` |
| 190 | `gameManager.selectShopItem(...)` | `gameManager.combatCycleService.selectShopItem(...)` |
| 203 | `gameManager.swapCreature(...)` | `gameManager.combatCycleService.swapCreature(...)` |
| 216 | `gameManager.rearrangeCreatures(...)` | `gameManager.combatCycleService.rearrangeCreatures(...)` |
| 229 | `gameManager.swapCreatureOutOfCombat(...)` | `gameManager.combatCycleService.swapCreatureOutOfCombat(...)` |
| 242 | `gameManager.befriendReplace(...)` | `gameManager.combatCycleService.befriendReplace(...)` |
| 255 | `gm.getBefriendQuiz()` | `gm.combatCycleService.getBefriendQuiz()` |
| 268 | `gm.handleBefriendFight()` | `gm.combatCycleService.handleBefriendFight()` |
| 280 | `gm.handleBefriendQuizAnswer(...)` | `gm.combatCycleService.handleBefriendQuizAnswer(...)` |

- [ ] **Step 2: Absorb inline KO handling from befriend-talk (lines 330-370)**

Replace the inline `processEnemyTurn` + KO loop + defeat check block (lines ~330-370) with a call to a new `CombatCycleService` method:

Add to `CombatCycleService`:
```js
  handleBefriendTalkRejection() {
    const combat = this.gm.combat;
    const run = this.gm.run;
    const enemyResult = processEnemyTurn(combat.enemies, combat.allies, false, run?.itemBuffs);
    const { koSwaps: rawSwaps, koRemovals: rawRemovals } = processKOSwaps(combat.allies, run.creatureParty);
    const koSwaps = rawSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawRemovals.map(r => ({ slot: r.index, name: r.name }));
    combat.allies = run.creatureParty.active;

    let combatEnded = false;
    if (checkAllDefeated(combat.allies)) {
      resolveDefeat(combat, run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      combatEnded = true;
    }

    return {
      enemyAttacks: enemyResult.attacks || [],
      koSwaps,
      koRemovals,
      combatEnded,
      allies: combat.allies,
      enemies: combat.enemies
    };
  }
```

Then in `combat.js` line ~330, replace the inline block with:
```js
    if (!accepted) {
      const rejection = gameManager.combatCycleService.handleBefriendTalkRejection();
      req.saveGame();
      return res.json({
        accepted: false,
        chance,
        ...rejection,
        befriendAttemptedSlots: { ...combat.befriendAttemptedSlots }
      });
    }
```

Keep the temporary `GameManager` delegators from Task 7 for now. Delete them only after every route/test caller has moved or after you explicitly decide to keep them as stable facade methods.

- [ ] **Step 3: Remove now-unused imports from `combat.js`**

Remove `processEnemyTurn` and `handleCreatureKO` from the import at line 1.

- [ ] **Step 4: Syntax check**

Run: `node --check src/routes/game/combat.js && node --check src/game/services/combat-cycle-service.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/game/combat.js src/game/services/combat-cycle-service.js
git commit -m "refactor: combat routes delegate to CombatCycleService, absorb inline KO logic"
```

---

## Optional Chunk 3: Remove exploration pass-throughs and cleanup

Stop after Chunk 2 and assess the diff before doing this chunk. If the combat breakup already made `loop.js` understandable again, defer this chunk to a separate follow-up plan.

### Task 9: Remove exploration pass-throughs, update routes

**Files:**
- Modify: `src/game/loop.js`
- Modify: `src/routes/game/run.js`
- Modify: `src/routes/game/economy.js`
- Modify: `src/routes/game/combat.js`
- Modify: `src/routes/game/misc.js`
- Modify: `tests/unit/game/speed-review-room.test.js`
- Modify: `tests/unit/game/whack-a-mole.test.js`

- [ ] **Step 1: Update `run.js` route calls**

Replace all `gameManager.explorationMethod()` and `gm.explorationMethod()` calls with `gameManager.explorationService.method()` / `gm.explorationService.method()`:

| Line | Method |
|------|--------|
| 156 | `getAreaOptions()` |
| 167 | `selectArea(...)` |
| 209 | `proceedToNextRoom(...)` |
| 250 | `getCurrentRoom()` |
| 285 | `getCurrentRoom()` |
| 325 | `startRoomEncounter()` |
| 341 | `useShrine(...)` |
| 356 | `useQuizReward(...)` |
| 526 | `completeWordDiscovery()` |
| 543 | `startSpeedReviewRoom(...)` |
| 573 | `recordSpeedReviewRoomCommit(...)` |
| 590 | `completeSpeedReviewRoom(...)` |
| 680 | `completeWhackAMole(...)` |
| 708 | `skipWhackAMole()` |
| 720 | `getCurrentRoom()` |
| 788 | `getCurrentRoom()` |

Note: lines 223 and 238 already use `explorationService` directly — no change needed.

- [ ] **Step 2: Update `economy.js` calls**

| Line | Method | Target service |
|------|--------|----------------|
| 22 | `getDealerState()` | `explorationService` |
| 34 | `dealerSell(...)` | `explorationService` |
| 47 | `dealerBuy(...)` | `explorationService` |
| 59 | `leaveDealer()` | `explorationService` |

- [ ] **Step 3: Leave `shop-skip` alone**

Do not move `economy.js:10` off `gameManager.skipShop()`. `skipShop()` stays on `GameManager`.

- [ ] **Step 4: Update `combat.js:563`**

Change `gameManager.getCurrentRoom()` → `gameManager.explorationService.getCurrentRoom()`.

- [ ] **Step 5: Update `misc.js` selectArea calls**

Change lines 81, 94, 106, 137: `gameManager.selectArea(...)` → `gameManager.explorationService.selectArea(...)`.

- [ ] **Step 6: Update direct GameManager test callers**

If you remove exploration pass-throughs from `GameManager`, update the existing direct test callers in:

- `tests/unit/game/speed-review-room.test.js`
  - `gm.selectArea(...)` → `gm.explorationService.selectArea(...)`
  - `gm.proceedToNextRoom()` → `gm.explorationService.proceedToNextRoom()`
  - `gm.startSpeedReviewRoom(...)` → `gm.explorationService.startSpeedReviewRoom(...)`
  - `gm.recordSpeedReviewRoomCommit(...)` → `gm.explorationService.recordSpeedReviewRoomCommit(...)`
  - `gm.completeSpeedReviewRoom(...)` → `gm.explorationService.completeSpeedReviewRoom(...)`
- `tests/unit/game/whack-a-mole.test.js`
  - `gm.completeWhackAMole(...)` → `gm.explorationService.completeWhackAMole(...)`
  - `gm.skipWhackAMole()` → `gm.explorationService.skipWhackAMole()`

If that migration feels too noisy relative to the payoff, stop and keep the pass-throughs.

- [ ] **Step 7: Remove dead `debugForceCombat` route in `misc.js:47`**

This calls a nonexistent `gameManager.debugForceCombat()`. Remove the entire dead route handler.

- [ ] **Step 8: Remove exploration pass-throughs from `loop.js`**

Delete the following methods from `GameManager` (lines ~410-528):
- `getAreaOptions`, `selectArea`
- `getCurrentRoom`, `proceedToNextRoom`
- `buyFromPostCombatShop`, `refreshPostCombatShop`
- `useShrine`, `useQuizReward`, `completeWordDiscovery`
- `startSpeedReviewRoom`, `recordSpeedReviewRoomCommit`, `completeSpeedReviewRoom`, `settleSpeedReviewRoomPendingRewards`
- `completeWhackAMole`, `skipWhackAMole`
- `getDealerState`, `dealerSell`, `dealerBuy`, `leaveDealer`
- `startRoomEncounter`

- [ ] **Step 9: Update `getState()` internal call**

In `getState()` at line ~213, change:
```js
this.settleSpeedReviewRoomPendingRewards();
```
to:
```js
this.explorationService.settleSpeedReviewRoomPendingRewards();
```

- [ ] **Step 10: Syntax check all modified files**

Run: `node --check src/game/loop.js && node --check src/routes/game/run.js && node --check src/routes/game/economy.js && node --check src/routes/game/combat.js && node --check src/routes/game/misc.js && echo "OK"`
Expected: OK

- [ ] **Step 11: Run full test suite**

Run: `npm test`
Expected: all PASS

- [ ] **Step 12: Commit**

```bash
git add src/game/loop.js src/routes/game/run.js src/routes/game/economy.js src/routes/game/combat.js src/routes/game/misc.js tests/unit/game/speed-review-room.test.js tests/unit/game/whack-a-mole.test.js
git commit -m "refactor: remove exploration pass-throughs, routes call services directly"
```

---

### Task 10: Final cleanup — verify line count and remove dead imports

**Files:**
- Modify: `src/game/loop.js`

- [ ] **Step 1: Check final line count**

Run: `wc -l src/game/loop.js`
Expected:
- If Chunk 3 was skipped: roughly `580-650` lines is fine
- If Chunk 3 landed too: ~`470` lines (±30)

- [ ] **Step 2: Remove unused imports**

Check which imports in `loop.js` are no longer used after extraction. The combat-specific imports that moved to `combat-cycle-service.js` should already be gone, but verify:

Run: `node --check src/game/loop.js && echo "OK"`

**Import migration table — what stays on `loop.js` vs. moves to `combat-cycle-service.js`:**

| Import | Source | Stays on loop.js? | Why |
|--------|--------|:--:|------|
| `createNewPlayer`, `createNewRun`, `createCombatState`, `createMetaProgression`, `ACHIEVEMENTS`, `BASE_STARTING_CREDITS` | `state.js` | Yes | Used by lifecycle methods |
| `getRoomActions`, `getAreaSelectionOptions`, `ROOM_TYPES`, `AREAS` | `rooms.js` | Yes | Used by `getState`, `startRun` |
| `derivePhase` | `phase-machine.js` | Yes | Used by `getPhase` |
| `logger` | `logger.js` | Yes | Used by multiple |
| `instantiateCreature` | `creatures.js` | Yes | Used by `startRun`, `confirmCreatures` |
| `syncPartyCreatureDefense`, `syncCreatureDefense` | `creatures.js` | Yes | Used by `getState` |
| `generateEnemyCreature`, `generateEnemyCreatures`, `getEnemyLevel`, `CREATURES_BY_ID` | `creatures.js` | **Move** | Only used by combat methods |
| `processInterleavedPvERound`, `processDefendTurn`, `processEnemyTurn`, `processBefriend`, `awardBattleXp`, `tickAllEffects`, `executeNpcSkill`, `CREDITS_PER_KILL`, `applyPartySkillsAfterPlayerAttacks`, `applyAfterEnemyAttacks`, `applyRoundStartSkills`, `shouldTriggerBefriendQuiz`, `generateBefriendQuiz`, `processBefriendQuizAnswer`, `resolveBefriendFight` | `creature-combat-service.js` | **Move** | Only used by combat methods |
| `handleCreatureKO` | `creature-combat-service.js` | **Move** | Now in `resolution.js`, used by service |
| `resetStatStages` | `combat/effects.js` | **Move** | Only used by `startCreatureEncounter` |
| `buildRunSummary` | `adventure-report.js` | Yes | Used by `forfeitRun` |
| `rollShopItems`, `applyItem` | `item-service.js` | **Move** | Only used by shop methods |
| `createItemBuffs` | `item-service.js` | Yes | Used by `applyDebugSuperAttack` |
| `addToCollection` | `creature-collection-service.js` | **Move** | Now in `resolution.js` |
| `selectNpcForEncounter`, `updateBond`, `recordEncounter`, `loadNpcs`, `rollNpcSkill`, `getNpcSkillsForNpc` | `npc-service.js` | **Move** | Only used by combat methods |
| `getCrestMultipliers`, `applyCrestBonuses` | `crest-service.js` | Yes | Used by `startRun`, `confirmCreatures` |
| `advanceTutorialStep` | `tutorial-service.js` | **Move** | Only used by `handleBefriendQuizAnswer` |
| `getTutorialStep` | `tutorial-service.js` | Yes | Used by `_onRunDefeat` |
| `shouldProtectBefriend` | `tutorial-service.js` | **Move** | Only used by combat methods |
| `exposeWords_fn` | `word-knowledge.js` | Yes | Used by `exposeWords` |
| `getKnownWordsFromFsrs` | `word-knowledge.js` | **Move** | Only used by combat bark/befriend logic |
| `selectBark` | `dialogue-filter.js` | **Move** | Only used by attack turn |
| `getBarkPool`, `getBefriendFrames` | `dialogue-loader.js` | **Move** | Only used by combat methods |
| `selectBestFrame` | `token-format.js` | **Move** | Only used by befriend quiz prompt selection |

Split shared imports (e.g., `creatures.js`, `tutorial-service.js`, `word-knowledge.js`) — keep the staying imports on `loop.js`, add the moving imports to `combat-cycle-service.js`.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all PASS

- [ ] **Step 4: Final commit**

```bash
git add src/game/loop.js
git commit -m "chore: clean up unused imports after loop.js breakup"
```
