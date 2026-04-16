# Inline Counter Attacks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make counter attacks fire as immediate interrupts after the triggering enemy attack instead of batching at end of turn.

**Architecture:** Extract per-attack counter logic from `applyAfterEnemyAttacks` into `computeInlineCounter`. Call it inside the initiative loops in both PvE (`processInterleavedPvERound`) and PvP (`resolveRound`). Frontend playback loop checks `atk.type === 'counter'` to render counter animation inline.

**Tech Stack:** Node.js, ES6 modules, `node:test` for testing

**Spec:** `docs/superpowers/specs/2026-04-07-inline-counter-attacks-design.md`

---

## Chunk 1: Server-Side — Extract and Integrate `computeInlineCounter`

### Task 1: Extract `computeInlineCounter` from party-skill-engine

**Files:**
- Modify: `src/game/combat/party-skill-engine.js:368-462`
- Test: `tests/unit/game/party-skill-engine-counter.test.js` (create)

- [ ] **Step 1: Write failing test for `computeInlineCounter`**

Create `tests/unit/game/party-skill-engine-counter.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeInlineCounter, checkAfflictionBurstCounter } from '../../../src/game/combat/party-skill-engine.js';

function makeAlly(overrides = {}) {
  return {
    id: 'ally-1', name: 'テスト', nameEn: 'TestAlly',
    element: 'fire', level: 5,
    hp: 80, maxHp: 100, mp: 20, maxMp: 20,
    attack: 20, defense: 5,
    activeEffects: [], statStages: { atk: 0, def: 0 },
    ...overrides
  };
}

function makeEnemy(overrides = {}) {
  return {
    id: 'enemy-1', name: 'スライム', nameEn: 'Slime',
    element: 'neutral', level: 3,
    hp: 50, maxHp: 50, mp: 10, maxMp: 10,
    attack: 10, defense: 3,
    activeEffects: [], statStages: { atk: 0, def: 0 },
    ...overrides
  };
}

function makeEnemyAttackRecord(overrides = {}) {
  return {
    attackerIndex: 0, attackerId: 'enemy-1',
    targetIndex: 0, damage: 15,
    ...overrides
  };
}

describe('computeInlineCounter', () => {
  let allies, enemies, combat;

  beforeEach(() => {
    allies = [makeAlly()];
    enemies = [makeEnemy()];
    combat = {};
  });

  it('returns null when no retaliationStrike skill active', () => {
    const record = makeEnemyAttackRecord();
    const result = computeInlineCounter(record, allies, enemies, [], combat);
    assert.strictEqual(result, null);
  });

  it('returns null when defender is KO', () => {
    allies[0].hp = 0;
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1; // force proc
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result, null);
    } finally {
      Math.random = origRandom;
    }
  });

  it('returns null when enemy attack did zero damage', () => {
    const record = makeEnemyAttackRecord({ damage: 0 });
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result, null);
    } finally {
      Math.random = origRandom;
    }
  });

  it('returns counter record when proc succeeds (Math.random < 0.5)', () => {
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1; // below 0.5 → proc
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result.type, 'counter');
      assert.strictEqual(result.defenderIndex, 0);
      assert.strictEqual(result.targetIndex, 0);
      assert.ok(result.damage > 0);
      assert.ok(enemies[0].hp < 50, 'enemy hp should be reduced');
    } finally {
      Math.random = origRandom;
    }
  });

  it('returns null when proc fails (Math.random >= 0.5)', () => {
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.9; // above 0.5 → no proc
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result, null);
    } finally {
      Math.random = origRandom;
    }
  });

  it('applies Fury Counter stacks', () => {
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const r1 = computeInlineCounter(record, allies, enemies, ['retaliationStrike', 'furyCounter'], combat);
      assert.strictEqual(r1.furyStacks, 1);
      // Second counter on same defender accumulates
      enemies[0].hp = 50; // reset
      const r2 = computeInlineCounter(record, allies, enemies, ['retaliationStrike', 'furyCounter'], combat);
      assert.strictEqual(r2.furyStacks, 2);
      assert.ok(r2.damage > r1.damage, 'second counter should deal more damage');
    } finally {
      Math.random = origRandom;
    }
  });

  it('sets targetDefeated when counter kills enemy', () => {
    enemies[0].hp = 1;
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result.targetDefeated, true);
      assert.strictEqual(enemies[0].hp, 0);
    } finally {
      Math.random = origRandom;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/party-skill-engine-counter.test.js`
Expected: FAIL — `computeInlineCounter` is not exported

- [ ] **Step 3: Extract `computeInlineCounter` from `applyAfterEnemyAttacks`**

In `src/game/combat/party-skill-engine.js`, add this new exported function **before** `applyAfterEnemyAttacks` (around line 365):

```js
/**
 * Evaluate a single enemy attack for a counter response.
 * Returns a counter record or null. Applies damage to the enemy immediately.
 */
export function computeInlineCounter(record, allies, enemies, runPartySkills, combat) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size || !active.has('retaliationStrike')) return null;

  if (typeof record.targetIndex !== 'number') return null;
  const defender = allies?.[record.targetIndex];
  if (!defender || defender.hp <= 0) return null;
  if (typeof record.damage !== 'number' || record.damage <= 0) return null;

  if (!rollProc(0.50)) return null;

  const enemyIdx = record.attackerIndex;
  const enemy = enemies?.[enemyIdx];
  if (!enemy || enemy.hp <= 0) return null;

  if (!combat.counterCounts) combat.counterCounts = {};

  // Base counter damage: 25% of defender's attack stat
  let counterDmg = Math.floor((defender.attack || 10) * 0.25);

  // Hardened Riposte: +50% if shielded or def stage > 0
  if (active.has('hardenedRiposte')) {
    initStatStages(defender);
    const hasShield = getDamageReduction(defender) > 0;
    const hasDefStage = (defender.statStages?.def || 0) > 0;
    if (hasShield || hasDefStage) {
      counterDmg = Math.floor(counterDmg * 1.5);
    }
  }

  // Fury Counter: +10% per stack
  if (active.has('furyCounter')) {
    const key = String(record.targetIndex);
    if (!combat.counterCounts[key]) combat.counterCounts[key] = 0;
    combat.counterCounts[key] = Math.min(combat.counterCounts[key] + 1, 10);
    counterDmg = Math.floor(counterDmg * (1 + combat.counterCounts[key] * 0.10));
  }

  // Last Stand: below 30% HP → double damage
  if (active.has('lastStand') && defender.hp < defender.maxHp * 0.30) {
    counterDmg = Math.floor(counterDmg * 2);
  }

  // Apply counter damage to enemy
  const actualDmg = Math.min(counterDmg, enemy.hp);
  enemy.hp -= actualDmg;

  const counterRecord = {
    type: 'counter',
    defenderIndex: record.targetIndex,
    defenderName: defender.nameEn,
    defenderElement: defender.element,
    targetIndex: enemyIdx,
    targetName: enemy.nameEn,
    damage: actualDmg,
    targetDefeated: enemy.hp <= 0,
    furyStacks: combat.counterCounts?.[String(record.targetIndex)] || 0,
    isLastStand: active.has('lastStand') && defender.hp < defender.maxHp * 0.30,
    procs: []
  };

  // Vengeful Mark: atk -1 stage on countered enemy
  if (active.has('vengefulMark') && enemy.hp > 0) {
    initStatStages(enemy);
    const delta = applyStatChange(enemy, 'atk', -1);
    if (delta !== 0) {
      counterRecord.procs.push({
        skillId: 'vengefulMark', skillName: 'Vengeful Mark',
        type: 'stageChange', targetIndex: enemyIdx, targetSide: 'enemy', stat: 'atk', delta
      });
      tryContagionFromCounter(active, enemies, enemyIdx, 'atk', -1, counterRecord, combat);
    }
  }

  // Pandemic on counter kill
  if (active.has('pandemic') && enemy.hp <= 0) {
    triggerPandemicCounter(enemy, enemies, counterRecord, combat);
  }

  return counterRecord;
}
```

Then refactor `applyAfterEnemyAttacks` to use `computeInlineCounter`:

```js
export function applyAfterEnemyAttacks({ enemyAttacks, allies, enemies, runPartySkills, combat }) {
  const active = toActivePartySkillIdSet(runPartySkills);
  if (!active.size || !active.has('retaliationStrike')) return [];
  if (!Array.isArray(enemyAttacks) || enemyAttacks.length === 0) return [];

  const counterAttacks = [];
  for (const record of enemyAttacks) {
    const counter = computeInlineCounter(record, allies, enemies, runPartySkills, combat);
    if (counter) counterAttacks.push(counter);
  }

  if (active.has('afflictionBurst') && counterAttacks.length > 0) {
    checkAfflictionBurstCounter(enemies, combat, counterAttacks);
  }

  return counterAttacks;
}
```

Also export `checkAfflictionBurstCounter` (currently not exported — needed by initiative loop callers):

Change `function checkAfflictionBurstCounter(` to `export function checkAfflictionBurstCounter(`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/party-skill-engine-counter.test.js`
Expected: All tests PASS

- [ ] **Step 5: Run existing tests to confirm no regression**

Run: `npm test`
Expected: All existing tests PASS (applyAfterEnemyAttacks still works via computeInlineCounter internally)

- [ ] **Step 6: Commit**

```bash
git add src/game/combat/party-skill-engine.js tests/unit/game/party-skill-engine-counter.test.js
git commit -m "refactor: extract computeInlineCounter from applyAfterEnemyAttacks"
```

---

### Task 2: Integrate inline counters into PvE initiative loop

**Files:**
- Modify: `src/game/services/creature-combat-service.js:833-906`
- Modify: `src/game/loop.js:1010-1017`

- [ ] **Step 1: Write failing test for counter-kills-prevent-subsequent-attacks**

Add to `tests/unit/game/party-skill-engine-counter.test.js`:

```js
import { processInterleavedPvERound } from '../../../src/game/services/creature-combat-service.js';

describe('processInterleavedPvERound inline counters', () => {
  it('counter records appear in playerAttacks with playbackIndex', () => {
    const allies = [makeAlly({ level: 1, attack: 40 })];
    const enemies = [makeEnemy({ level: 10, hp: 500, maxHp: 500 })]; // high level → enemy goes first
    enemies[0].moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    allies[0].moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1; // force all procs + initiative tie-break
    try {
      const result = processInterleavedPvERound(
        allies, enemies, moveChoices, null, null, null
      );

      const counters = result.playerAttacks.filter(a => a.type === 'counter');
      assert.ok(counters.length > 0, 'should have inline counter in playerAttacks');
      assert.ok(typeof counters[0].playbackIndex === 'number', 'counter should have playbackIndex');

      // Counter should appear right after the enemy attack it responds to
      const enemyAtk = result.enemyAttacks.find(a => a.attackerIndex === 0);
      if (enemyAtk && counters[0]) {
        assert.strictEqual(counters[0].playbackIndex, enemyAtk.playbackIndex + 1,
          'counter playbackIndex should be right after triggering enemy attack');
      }
    } finally {
      Math.random = origRandom;
    }
  });

  it('counter kill prevents subsequent enemy attacks', () => {
    const allies = [makeAlly({ level: 1, attack: 200 })]; // very high attack for lethal counter
    const enemies = [makeEnemy({ level: 10, hp: 5, maxHp: 5 })]; // low hp, will die to counter
    enemies[0].moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    // Give enemy haste so it would attack twice
    enemies[0].activeEffects = [{ type: 'haste', duration: 1 }];

    const moveChoices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    allies[0].moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = processInterleavedPvERound(
        allies, enemies, moveChoices, null, null, null
      );

      // Enemy should only get 1 attack (counter kills it before 2nd hit)
      const enemyAtks = result.enemyAttacks.filter(a => a.attackerIndex === 0);
      assert.ok(enemyAtks.length <= 1, 'enemy should not get second attack after being killed by counter');
      assert.strictEqual(enemies[0].hp, 0, 'enemy should be dead');
    } finally {
      Math.random = origRandom;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/party-skill-engine-counter.test.js`
Expected: FAIL — counters not yet in playerAttacks

- [ ] **Step 3: Add inline counter calls to `processInterleavedPvERound`**

In `src/game/services/creature-combat-service.js`, add import at the top (line 26-29):

```js
import {
  applyAfterPlayerAttacks as _applyAfterPlayerAttacks,
  applyAfterEnemyAttacks,
  applyRoundStartSkills,
  computeInlineCounter,
  checkAfflictionBurstCounter
} from '../combat/party-skill-engine.js';
```

Also add the new exports (line 30):

```js
export { applyAfterEnemyAttacks, applyRoundStartSkills, computeInlineCounter, checkAfflictionBurstCounter } from '../combat/party-skill-engine.js';
```

In `processInterleavedPvERound`, the function accepts `allies, enemies, moveChoices, itemBuffs, creatureParty, metaMults`. We need to add an optional `options` parameter for party skills. But wait — `processInterleavedPvERound` doesn't currently receive party skills; `loop.js` calls `applyAfterEnemyAttacks` separately. We need to thread party skills in.

Add an `options` parameter (keeping backward compat):

Change the function signature from:
```js
export function processInterleavedPvERound(
  allies,
  enemies,
  moveChoices,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null
)
```

To:
```js
export function processInterleavedPvERound(
  allies,
  enemies,
  moveChoices,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  options = {}
)
```

Then inside the `runEnemyTurn` closure (line ~833-857), after each enemy attack record is pushed, compute inline counter. Replace the inner loop:

```js
  const runEnemyTurn = enemyIndex => {
    const enemy = enemies[enemyIndex];
    if (!enemy || enemy.hp <= 0 || isIncapacitated(enemy)) return;
    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) return;

    const choice = pickEnemyMoveChoice(enemy, allies, enemies);
    if (!choice) return;
    const { move, mode } = choice;

    const attackCount = hasHaste(enemy) ? 2 : 1;
    if (hasHaste(enemy)) consumeHaste(enemy);

    for (let strike = 0; strike < attackCount; strike++) {
      if (enemy.hp <= 0) break;
      if (allies.filter(a => a.hp > 0).length === 0) break;
      const targeting = pickEnemyTarget(enemy, move, mode, allies, enemies);
      if (!targeting) break;
      const rec = buildEnemyActionRecord(enemy, enemyIndex, move, targeting.target, targeting.targetSide, allies, enemies, false, itemBuffs);
      if (rec) {
        tagPlayback(rec, 'enemy');
        enemyAttacks.push(rec);

        // Inline counter: check immediately after enemy attack
        if (options.runPartySkills && options.combat) {
          const counter = computeInlineCounter(rec, allies, enemies, options.runPartySkills, options.combat);
          if (counter) {
            tagPlayback(counter, 'player');
            playerAttacks.push(counter);
            inlineCounters.push(counter);
          }
        }
      }
    }
  };
```

Add `const inlineCounters = [];` at the top of the function (near `const playerAttacks = [];`).

After the initiative loop, add Affliction Burst check for inline counters:

```js
  // Affliction Burst check for inline counters
  if (options.runPartySkills && options.combat && inlineCounters.length > 0) {
    const active = toActivePartySkillIdSet(options.runPartySkills);
    if (active.has('afflictionBurst')) {
      checkAfflictionBurstCounter(enemies, options.combat, inlineCounters);
    }
  }
```

Add this right before the `const mpRegens = [];` line (~886).

Add `inlineCounters` to the return value:

```js
  return {
    attacks: playerAttacks,
    playerAttacks,
    enemyAttacks,
    inlineCounters,
    allEnemiesDefeated: enemies.every(e => !e || e.hp <= 0),
    xpEvents,
    mpRegens
  };
```

Also import `toActivePartySkillIdSet` at the top of the file. Add it to the existing import from `party-skill-engine.js`:

```js
import {
  applyAfterPlayerAttacks as _applyAfterPlayerAttacks,
  applyAfterEnemyAttacks,
  applyRoundStartSkills,
  computeInlineCounter,
  checkAfflictionBurstCounter,
  toActivePartySkillIdSet
} from '../combat/party-skill-engine.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/party-skill-engine-counter.test.js`
Expected: The inline counter tests PASS. Note: the tests pass party skills via the new options parameter — if failing, check that the test calls `processInterleavedPvERound(allies, enemies, moveChoices, null, null, null, { runPartySkills: ['retaliationStrike'], combat: {} })`.

Update the test calls from Step 1 to pass party skills:

```js
      const result = processInterleavedPvERound(
        allies, enemies, moveChoices, null, null, null,
        { runPartySkills: ['retaliationStrike'], combat: {} }
      );
```

- [ ] **Step 5: Update `loop.js` move-turn path to use inline counters**

In `src/game/loop.js`, find the move-turn call to `processInterleavedPvERound` (line 734). It currently looks like:

```js
const playerResult = processInterleavedPvERound(...);
```

Add party skills to the call by passing options:

```js
const playerResult = processInterleavedPvERound(
  this.combat.allies,
  this.combat.enemies,
  moveChoices,
  this.run.itemBuffs,
  this.run.creatureParty,
  metaMults,
  { runPartySkills: this.run.partySkills, combat: this.combat }
);
```

Then replace the `applyAfterEnemyAttacks` call (lines 1010-1017):

```js
    // Party skills: counter attacks (now computed inline in processInterleavedPvERound)
    const counterAttacks = playerResult.inlineCounters || [];
```

This removes the double-computation. The `counterAttacks` variable is still used in the response payload below — it now comes from the inline results.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/game/services/creature-combat-service.js src/game/loop.js tests/unit/game/party-skill-engine-counter.test.js
git commit -m "feat: inline counter attacks into PvE initiative loop"
```

---

### Task 3: Integrate inline counters into PvP initiative loop

**Files:**
- Modify: `src/pvp/pvp-combat.js:171-256`
- Modify: `tests/unit/pvp/pvp-combat.test.js:257-281`

- [ ] **Step 1: Update PvP test expectations**

In `tests/unit/pvp/pvp-combat.test.js`, update the Retaliation Strike test (line ~257):

Change:
```js
      const sideACounters = result.counterAttacks.filter(c => c.pvpSide === 'sideA');
      assert.ok(sideACounters.length > 0, 'Side A should have counter attacks from retaliation');
      assert.strictEqual(sideACounters[0].type, 'counter');
```

To:
```js
      // Counters are now inline in orderedAttacks with side matching the defending side
      const sideACounters = result.attacks.filter(a => a.type === 'counter' && a.side === 'sideA');
      assert.ok(sideACounters.length > 0, 'Side A should have inline counter attacks');
      assert.ok(typeof sideACounters[0].playbackIndex === 'number', 'counter should have playbackIndex');
```

Also update the test that checks `counterAttacks` array exists (line ~205-209):

Change:
```js
    assert.ok(Array.isArray(result.counterAttacks), 'counterAttacks should be an array');
```

To:
```js
    assert.ok(Array.isArray(result.counterAttacks), 'counterAttacks should be an array (empty for backward compat)');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/pvp/pvp-combat.test.js`
Expected: FAIL — counters still in `result.counterAttacks`, not in `result.attacks`

- [ ] **Step 3: Add inline counters to `resolveRound` in pvp-combat.js**

In `src/pvp/pvp-combat.js`, add imports (line ~10-16):

```js
import {
  tickAllEffects,
  handleCreatureKO,
  applyPartySkillsAfterPlayerAttacks,
  applyRoundStartSkills,
  applyAfterEnemyAttacks,
  executeSlotMoveTurn,
  computeInlineCounter,
  checkAfflictionBurstCounter
} from '../game/services/creature-combat-service.js';
```

Also import `toActivePartySkillIdSet`:

```js
import { toActivePartySkillIdSet } from '../game/combat/party-skill-engine.js';
```

Inside `resolveRound`, after the existing `let playbackCounter = 0;` (line ~169), add:

```js
  const inlineCountersA = [];
  const inlineCountersB = [];
```

Inside the initiative loop (line ~171), after each side's attack records are pushed, add inline counter computation. The key change is in the loop body:

For sideA attacks (which hit sideB creatures), sideB may counter:
```js
    if (slot.side === 'sideA') {
      // ... existing executeSlotMoveTurn code ...
      for (const atk of slotAttacks) {
        atk.playbackIndex = playbackCounter++;
        atk.side = 'sideA';
        orderedAttacks.push(atk);
        resultA.attacks.push(atk);

        // Side B counters side A's attacks
        if (partySkillsB && combatB) {
          const counter = computeInlineCounter(atk, sideB, sideA, partySkillsB, combatB);
          if (counter) {
            counter.playbackIndex = playbackCounter++;
            counter.side = 'sideB';
            orderedAttacks.push(counter);
            inlineCountersB.push(counter);
          }
        }
      }
    }
```

For sideB attacks (which hit sideA creatures), sideA may counter:
```js
    } else {
      // ... existing executeSlotMoveTurn code ...
      for (const atk of slotAttacks) {
        atk.playbackIndex = playbackCounter++;
        atk.side = 'sideB';
        orderedAttacks.push(atk);
        resultB.attacks.push(atk);

        // Side A counters side B's attacks
        if (partySkillsA && combatA) {
          const counter = computeInlineCounter(atk, sideA, sideB, partySkillsA, combatA);
          if (counter) {
            counter.playbackIndex = playbackCounter++;
            counter.side = 'sideA';
            orderedAttacks.push(counter);
            inlineCountersA.push(counter);
          }
        }
      }
    }
```

After the initiative loop, replace the old batch counter computation (lines ~232-256):

```js
  // Affliction Burst for inline counters
  if (partySkillsA && combatA && inlineCountersA.length > 0) {
    const activeA = toActivePartySkillIdSet(partySkillsA);
    if (activeA.has('afflictionBurst')) {
      checkAfflictionBurstCounter(sideB, combatA, inlineCountersA);
    }
  }
  if (partySkillsB && combatB && inlineCountersB.length > 0) {
    const activeB = toActivePartySkillIdSet(partySkillsB);
    if (activeB.has('afflictionBurst')) {
      checkAfflictionBurstCounter(sideA, combatB, inlineCountersB);
    }
  }

  // Backward compat: empty counterAttacks array
  const counterAttacks = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/pvp/pvp-combat.test.js`
Expected: All PvP tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pvp/pvp-combat.js tests/unit/pvp/pvp-combat.test.js
git commit -m "feat: inline counter attacks into PvP initiative loop"
```

---

## Chunk 2: Frontend — Inline Counter Playback

### Task 4: Extract `showOneCounterAttackAnimated` and update playback loops

**Files:**
- Modify: `public/js/ui/combat-loop.js:1838-1893, 2289-2297, 2410-2441, 2535-2536`

- [ ] **Step 1: Extract `showOneCounterAttackAnimated` from `showCounterAttacks`**

In `public/js/ui/combat-loop.js`, add a new function right before `showCounterAttacks` (before line 1838):

```js
/**
 * Show a single counter attack animation (used inline in initiative playback).
 * @param {Object} counter - Counter attack record from server
 */
async function showOneCounterAttackAnimated(counter) {
  const defenderPos = spritePos('player', counter.defenderIndex);
  popupSkillProc('COUNTER!', defenderPos);

  // Lunge toward enemy (positive X = right = toward enemy side)
  const defenderSprite = getCreatureSprite('player', counter.defenderIndex);
  if (defenderSprite) await pixiLunge(defenderSprite, { distance: 40, duration: 300 });

  if (counter.damage > 0) {
    const counterFrom = spritePos('player', counter.defenderIndex);
    const counterTo = spritePos('enemy', counter.targetIndex);
    await fireElementBlast(counterFrom, counterTo, 'neutral', () => {
      pixiDamageNumber(counter.damage, counterTo, { tier: 1 });
      screenShake('light');
    });
  }

  // Show Vengeful Mark and other counter procs
  if (counter.procs?.length) {
    for (const proc of counter.procs) {
      if (proc.type === 'stageChange') {
        const SC_NAMES2 = { atk: 'ATK', def: 'DEF' };
        const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
        const text = `${SC_NAMES2[proc.stat] || proc.stat} ${dir}`;
        const side = proc.targetSide === 'enemy' ? 'enemy' : 'player';
        const pos = spritePos(side, proc.targetIndex);
        if (proc.delta > 0) popupBuff(text, pos);
        else popupDebuff(text, pos);
      } else if (proc.type === 'spread') {
        const pos = spritePos('enemy', proc.targetIndex);
        popupSkillProc('SPREAD!', pos);
        burstParticles(pos, { count: 4, color: 0x9C27B0 });
      } else if (proc.type === 'pandemic') {
        const enemies = getCombatEnemies() || [];
        enemies.forEach((enemy, i) => {
          if (enemy && enemy.hp > 0) {
            const pos = spritePos('enemy', i);
            popupSkillProc('PANDEMIC!', pos);
            burstParticles(pos, { count: 6, color: 0x9C27B0 });
          }
        });
      } else if (proc.type === 'burst') {
        const pos = spritePos('enemy', proc.targetIndex);
        popupSkillProc('AFFLICTION BURST!', pos);
        pixiDamageNumber(proc.damage, pos, { tier: 1 });
        burstParticles(pos, { count: 10, color: 0xE91E63 });
      }
    }
  }

  await effectDelay(600);
}
```

Note: This is nearly identical to the `showCounterAttacks` loop body, with one change: the `pandemic` branch uses `getCombatEnemies()` instead of `result.enemies` since we don't have the full result object. Verify `getCombatEnemies` is available in scope (it should be — it's a module-level helper).

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

- [ ] **Step 3: Update the move-turn playback loop (~line 2289)**

Change the initiative playback loop from:

```js
      if (merged.length > 0) {
        for (const { side, atk } of merged) {
          if (side === 'player') {
            await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn);
          } else {
            await showOneEnemyAttackAnimated(result, atk, allyHpMap, false);
          }
        }
      }
```

To:

```js
      if (merged.length > 0) {
        for (const { side, atk } of merged) {
          if (side === 'player' && atk.type === 'counter') {
            await showOneCounterAttackAnimated(atk);
          } else if (side === 'player') {
            await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn);
          } else {
            await showOneEnemyAttackAnimated(result, atk, allyHpMap, false);
          }
        }
      }
```

- [ ] **Step 4: Update the legacy attack playback loop (~line 2410)**

Same change to the legacy loop:

```js
      if (mergedLegacy.length > 0) {
        for (const { side, atk } of mergedLegacy) {
          if (side === 'player' && atk.type === 'counter') {
            await showOneCounterAttackAnimated(atk);
          } else if (side === 'player') {
            await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn2);
          } else {
            await showOneEnemyAttackAnimated(result, atk, allyHpMap, false);
          }
        }
      }
```

- [ ] **Step 5: Verify remaining `showCounterAttacks` calls are harmless**

Three calls to `showCounterAttacks(result)` exist:
- **Line ~2330** (after move-turn initiative loop): `result.counterAttacks` is now `[]` → no-op. Leave as-is.
- **Line ~2441** (after legacy attack initiative loop): same — `result.counterAttacks` is `[]` → no-op. Leave as-is.
- **Line ~2536** (defend path): Still uses the legacy `result.counterAttacks` array populated by `applyAfterEnemyAttacks` in `loop.js`. Correct behavior — no change needed.

- [ ] **Step 6: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: render counter attacks inline during initiative playback"
```

---

### Task 5: Add `buildMergedInitiativeAttacks` counter support

**Files:**
- Modify: `public/js/ui/combat-loop.js:1938-1947`

Counter records are in `result.playerAttacks` and have `playbackIndex`. The existing `buildMergedInitiativeAttacks` already merges `result.playerAttacks` + `result.enemyAttacks` by `playbackIndex`. So counters should automatically sort into the right position.

- [ ] **Step 1: Verify `buildMergedInitiativeAttacks` handles counters correctly**

Read the function at line 1938. Confirm it maps `result.playerAttacks` into `{ side: 'player', atk }` entries. Counter records in `playerAttacks` will get `side: 'player'` — which is exactly what the playback loop checks for with `atk.type === 'counter'`.

No code change needed here. This is a verification step.

- [ ] **Step 2: Verify syntax one final time**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

---

### Task 6: Final integration test and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Verify `processInterleavedPvERound` call in loop.js**

Read `src/game/loop.js` at line 734 to verify the call passes `options` correctly. The original call should look something like:

```js
const playerResult = processInterleavedPvERound(
  this.combat.allies,
  this.combat.enemies,
  moveChoices,
  this.run.itemBuffs,
  this.run.creatureParty,
  metaMults
);
```

After our change it should be:

```js
const playerResult = processInterleavedPvERound(
  this.combat.allies,
  this.combat.enemies,
  moveChoices,
  this.run.itemBuffs,
  this.run.creatureParty,
  metaMults,
  { runPartySkills: this.run.partySkills, combat: this.combat }
);
```

- [ ] **Step 3: Syntax-check all modified server files**

Run: `node --check src/game/combat/party-skill-engine.js && node --check src/game/services/creature-combat-service.js && node --check src/game/loop.js && node --check src/pvp/pvp-combat.js && echo "ALL OK"`
Expected: "ALL OK"

- [ ] **Step 4: Final commit if any cleanup was needed**

Only if any files were touched during verification:

```bash
git add -A && git commit -m "chore: cleanup inline counter attack integration"
```
