# Unified Initiative Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify PvE and PvP initiative loops so both use `executeSlotMoveTurn` with an `onAttack` callback, fixing the PvP counter-kill bug.

**Architecture:** Refactor `executeSlotMoveTurn` to accept an options object with `onAttack` callback. Add `defenderItemBuffs` to `executeMove`. Pre-select enemy moves before the initiative loop. Both PvE and PvP use a single unified loop body.

**Tech Stack:** Node.js, ES6 modules, `node:test` for testing

**Spec:** `docs/superpowers/specs/2026-04-07-unified-initiative-loop-design.md`

---

## Chunk 1: Refactor `executeSlotMoveTurn` Signature and Add `defenderItemBuffs`

### Task 1: Refactor `executeSlotMoveTurn` to options object

**Files:**
- Modify: `src/game/services/creature-combat-service.js:718-779`

- [ ] **Step 1: Write failing test**

Create `tests/unit/game/execute-slot-move-turn.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeSlotMoveTurn } from '../../../src/game/services/creature-combat-service.js';

function makeCreature(overrides = {}) {
  return {
    id: `c-${Math.random().toString(36).slice(2, 6)}`,
    name: 'テスト', nameEn: 'Test',
    element: 'neutral', level: 5,
    hp: 100, maxHp: 100, mp: 20, maxMp: 20,
    attack: 15, defense: 5,
    baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
    activeEffects: [], statStages: { atk: 0, def: 0 },
    itemBuffs: null,
    moves: [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }],
    ...overrides
  };
}

describe('executeSlotMoveTurn options-based API', () => {
  it('works with options object (new API)', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];

    const { attacks } = executeSlotMoveTurn(allies, enemies, 0, choices, {
      itemBuffs: null,
      hastedSlots: null,
      defeatedIndices: new Set()
    });

    assert.ok(attacks.length > 0, 'should produce at least one attack');
    assert.strictEqual(attacks[0].attackerIndex, 0);
  });

  it('onAttack callback is called for each attack', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const received = [];

    executeSlotMoveTurn(allies, enemies, 0, choices, {
      onAttack(atk) { received.push(atk); }
    });

    assert.ok(received.length > 0, 'onAttack should have been called');
    assert.strictEqual(received.length, 1);
  });

  it('onAttack returning false stops execution (no haste follow-up)', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const hastedSlots = new Set([0]);

    const { attacks } = executeSlotMoveTurn(allies, enemies, 0, choices, {
      hastedSlots,
      onAttack() { return false; }
    });

    assert.strictEqual(attacks.length, 1, 'should stop after first attack when onAttack returns false');
  });

  it('creature.hp <= 0 between haste strikes stops execution', () => {
    const allies = [makeCreature()];
    const enemies = [makeCreature({ hp: 500, maxHp: 500 })];
    const choices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const hastedSlots = new Set([0]);

    const { attacks } = executeSlotMoveTurn(allies, enemies, 0, choices, {
      hastedSlots,
      onAttack(atk) {
        // Simulate counter killing the attacker
        allies[0].hp = 0;
        return true;
      }
    });

    assert.strictEqual(attacks.length, 1, 'should stop after first attack when creature hp <= 0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/execute-slot-move-turn.test.js`
Expected: FAIL — options-based API doesn't exist yet (old positional params)

- [ ] **Step 3: Refactor `executeSlotMoveTurn`**

In `src/game/services/creature-combat-service.js`, replace lines 718-779. Change from:

```js
export function executeSlotMoveTurn(
  allies,
  enemies,
  slotIndex,
  choices,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  hastedSlots = null,
  defeatedEnemyIndices = null
) {
  const attacks = [];
  const xpEvents = [];
  const defeated = defeatedEnemyIndices || new Set();
  // ...
  for (const choice of choices) {
    // ...
    runOneExecute();
    if (hastedSlots?.has(slotIndex)) {
      runOneExecute();
    }
  }
  return { attacks, xpEvents };
}
```

To:

```js
export function executeSlotMoveTurn(allies, enemies, slotIndex, choices, options = {}) {
  const {
    itemBuffs = null,
    creatureParty = null,
    metaMults = null,
    hastedSlots = null,
    defeatedIndices = null,
    defenderItemBuffs = null,
    onAttack = null
  } = options;

  const attacks = [];
  const xpEvents = [];
  const defeated = defeatedIndices || new Set();

  const creature = allies[slotIndex];
  if (!creature || creature.hp <= 0 || isIncapacitated(creature)) {
    return { attacks, xpEvents };
  }
  if (!choices?.length) {
    return { attacks, xpEvents };
  }

  for (const choice of choices) {
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const move = (creature.moves || []).find(m => m.id === choice.moveId);
    if (!move) continue;
    if ((creature.mp || 0) < move.mpCost) continue;

    creature.mp = (creature.mp || 0) - move.mpCost;

    let stopped = false;

    const runOneExecute = () => {
      const result = executeMove(
        creature,
        choice.creatureIndex,
        move,
        choice.targetIndex,
        allies,
        enemies,
        itemBuffs,
        creatureParty,
        defeated,
        metaMults,
        defenderItemBuffs
      );
      for (const atk of result.attacks) {
        atk.attackerMp = creature.mp;
        atk.attackerMaxMp = creature.maxMp || 0;
        attacks.push(atk);
        if (onAttack && onAttack(atk) === false) {
          stopped = true;
          return;
        }
      }
      xpEvents.push(...result.xpEvents);
    };

    runOneExecute();
    if (stopped) break;
    if (creature.hp <= 0) break;
    if (hastedSlots?.has(slotIndex)) {
      runOneExecute();
      if (stopped) break;
    }
  }

  return { attacks, xpEvents };
}
```

- [ ] **Step 4: Add `defenderItemBuffs` param to `executeMove`**

In `src/game/services/creature-combat-service.js`, change the `executeMove` signature (line 214) from:

```js
function executeMove(creature, creatureIndex, move, targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIndices, metaMults = null) {
```

To:

```js
function executeMove(creature, creatureIndex, move, targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIndices, metaMults = null, defenderItemBuffs = null) {
```

Then in the `damage` case (line ~226), after `rollMoveDamage` and before the shield reduction, add defender item buff reduction:

```js
        let damage = rollMoveDamage(creature, target, move, itemBuffs, variance);

        // Defender item buff damage reduction (e.g. flatDamageReduction)
        if (defenderItemBuffs) {
          damage = applyDamageReduction(damage, defenderItemBuffs);
        }

        const shieldReduction = getDamageReduction(target);
```

Do the same in the `drain` case (line ~262):

```js
        let damage = rollMoveDamage(creature, target, move, itemBuffs, variance);

        // Defender item buff damage reduction
        if (defenderItemBuffs) {
          damage = applyDamageReduction(damage, defenderItemBuffs);
        }

        const shieldReduction = getDamageReduction(target);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/unit/game/execute-slot-move-turn.test.js`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: FAIL — callers of `executeSlotMoveTurn` still use positional params (PvE `runAllyChoices`, PvP `resolveRound`). That's fine — we fix them in Tasks 2 and 3. But the function itself should work with both old positional and new options patterns. 

**Actually** — the old callers pass positional args which would be interpreted as a single options object. We need to handle backward compat. The simplest: detect if the 5th argument is a plain object (new API) or not (old API). Add this at the top of the function:

```js
export function executeSlotMoveTurn(allies, enemies, slotIndex, choices, optionsOrItemBuffs = {}, ...legacyArgs) {
  let options;
  if (legacyArgs.length > 0 || optionsOrItemBuffs === null || typeof optionsOrItemBuffs !== 'object' || Array.isArray(optionsOrItemBuffs)) {
    // Legacy positional call: (allies, enemies, slotIndex, choices, itemBuffs, creatureParty, metaMults, hastedSlots, defeatedEnemyIndices)
    options = {
      itemBuffs: optionsOrItemBuffs ?? null,
      creatureParty: legacyArgs[0] ?? null,
      metaMults: legacyArgs[1] ?? null,
      hastedSlots: legacyArgs[2] ?? null,
      defeatedIndices: legacyArgs[3] ?? null
    };
  } else {
    options = optionsOrItemBuffs;
  }
  // ... rest of function uses `options`
```

This lets old callers keep working until we migrate them.

- [ ] **Step 7: Run full test suite again**

Run: `npm test`
Expected: All tests PASS (backward compat shim handles old callers)

- [ ] **Step 8: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/game/execute-slot-move-turn.test.js
git commit -m "refactor: executeSlotMoveTurn options object + onAttack callback

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Unify PvE initiative loop

**Files:**
- Modify: `src/game/services/creature-combat-service.js:790-939`
- Modify: `tests/unit/game/party-skill-engine-counter.test.js`

- [ ] **Step 1: Update existing PvE inline counter tests**

The tests in `tests/unit/game/party-skill-engine-counter.test.js` for `processInterleavedPvERound` currently pass `{ runPartySkills, combat }` in options. These will still work — the function signature doesn't change. But the internal behavior changes (enemies go through `executeSlotMoveTurn` now), so verify the tests still pass after the refactor.

No test changes needed upfront — existing tests are the regression gate.

- [ ] **Step 2: Refactor `processInterleavedPvERound`**

Replace the entire body from the `runAllyChoices` closure through the initiative loop (lines ~826-907). Delete `runAllyChoices` and `runEnemyTurn` closures. Replace with:

```js
  // Pre-select enemy moves before initiative loop
  const enemyChoicesMap = new Map();
  const hastedEnemyIndices = new Set();
  for (let ei = 0; ei < enemies.length; ei++) {
    const enemy = enemies[ei];
    if (!enemy || enemy.hp <= 0 || isIncapacitated(enemy)) continue;
    if (hasHaste(enemy)) {
      hastedEnemyIndices.add(ei);
      consumeHaste(enemy);
    }
    const choice = pickEnemyMoveChoice(enemy, allies, enemies);
    if (!choice) continue;
    const { move, mode } = choice;
    const targeting = pickEnemyTarget(enemy, move, mode, allies, enemies);
    if (!targeting) continue;
    const targetIndex = targeting.targetSide === 'player'
      ? allies.indexOf(targeting.target)
      : enemies.indexOf(targeting.target);
    enemyChoicesMap.set(ei, [{ creatureIndex: ei, moveId: move.id, targetIndex }]);
  }

  const initiative = [];

  for (const [allyIndex] of choicesByAlly) {
    const c = allies[allyIndex];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ kind: 'ally', index: allyIndex, level: c.level || 1 });
    }
  }

  for (let ei = 0; ei < enemies.length; ei++) {
    const e = enemies[ei];
    if (e && e.hp > 0 && !isIncapacitated(e) && e.moves?.length > 0) {
      initiative.push({ kind: 'enemy', index: ei, level: e.level || 1 });
    }
  }

  initiative.sort((a, b) => {
    const d = (b.level || 1) - (a.level || 1);
    if (d !== 0) return d;
    return Math.random() - 0.5;
  });

  for (const slot of initiative) {
    const isAlly = slot.kind === 'ally';

    executeSlotMoveTurn(
      isAlly ? allies : enemies,
      isAlly ? enemies : allies,
      slot.index,
      isAlly ? choicesByAlly.get(slot.index) : enemyChoicesMap.get(slot.index),
      {
        itemBuffs,
        creatureParty: isAlly ? creatureParty : null,
        metaMults: isAlly ? metaMults : null,
        hastedSlots: isAlly ? hastedCreatureIndices : hastedEnemyIndices,
        defeatedIndices: defeatedEnemyIndices,
        defenderItemBuffs: isAlly ? null : itemBuffs,
        onAttack(atk) {
          tagPlayback(atk, isAlly ? 'player' : 'enemy');
          (isAlly ? playerAttacks : enemyAttacks).push(atk);

          if (!isAlly && options.runPartySkills && options.combat) {
            const counter = computeInlineCounter(atk, allies, enemies, options.runPartySkills, options.combat);
            if (counter) {
              tagPlayback(counter, 'player');
              playerAttacks.push(counter);
              inlineCounters.push(counter);
            }
          }

          const attacker = isAlly ? allies : enemies;
          return attacker[slot.index]?.hp > 0;
        }
      }
    );

    // Collect XP from executeSlotMoveTurn — already handled internally via defeatedIndices
  }
```

**Wait — XP events.** Currently `runAllyChoices` captures `xpEvents` from `executeSlotMoveTurn`. The new unified loop needs to collect them too. `executeSlotMoveTurn` returns `{ attacks, xpEvents }` but in the new callback pattern we don't use the return value for attacks. We still need xpEvents.

Capture the return value:

```js
    const result = executeSlotMoveTurn(
      isAlly ? allies : enemies,
      isAlly ? enemies : allies,
      slot.index,
      isAlly ? choicesByAlly.get(slot.index) : enemyChoicesMap.get(slot.index),
      { /* ... options ... */ }
    );
    if (isAlly) xpEvents.push(...result.xpEvents);
```

- [ ] **Step 3: Run existing tests**

Run: `node --test tests/unit/game/party-skill-engine-counter.test.js`
Expected: All 10 tests PASS. The `processInterleavedPvERound` integration tests verify counter playback ordering and counter-kill behavior.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/services/creature-combat-service.js
git commit -m "refactor: unify PvE initiative loop — enemies use executeSlotMoveTurn

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Unify PvP initiative loop

**Files:**
- Modify: `src/pvp/pvp-combat.js:176-238`
- Modify: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Add PvP counter-kill test**

Add to `tests/unit/pvp/pvp-combat.test.js`:

```js
  it('counter-kill prevents subsequent haste attacks in PvP', () => {
    // Side A has very high attack creature, side B has low hp creature with haste
    const strongA = makeCreature({ level: 1, attack: 10, hp: 200, maxHp: 200 });
    strongA.moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const weakB = makeCreature({ level: 10, hp: 1, maxHp: 1, attack: 20 });
    weakB.moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    weakB.activeEffects = [{ type: 'haste', duration: 1 }];

    const movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const movesB = [{ creatureIndex: 0, moveId: 'bite', targetIndex: 0 }];

    const origRandom = Math.random;
    Math.random = () => 0.1; // force counter proc
    try {
      const result = resolveRound([strongA], [weakB], movesA, movesB, {
        partySkillsA: ['retaliationStrike'],
        combatA: {}
      });

      // Side B attacks first (higher level), side A counters and kills side B
      const sideACounters = result.attacks.filter(a => a.type === 'counter' && a.side === 'sideA');
      assert.ok(sideACounters.length > 0, 'Side A should counter');
      assert.strictEqual(weakB.hp, 0, 'Side B creature should be dead');

      // Side B should NOT get a second haste attack after dying
      const sideBAttacks = result.attacks.filter(a => a.side === 'sideB' && a.type !== 'counter');
      assert.ok(sideBAttacks.length <= 1, 'Dead creature should not get haste follow-up attack');
    } finally {
      Math.random = origRandom;
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/pvp/pvp-combat.test.js`
Expected: FAIL — dead creature still gets haste attack (current bug)

- [ ] **Step 3: Refactor `resolveRound` initiative loop**

Replace lines 176-238 (the duplicated sideA/sideB branches) with a unified loop:

```js
  for (const slot of initiative) {
    const isA = slot.side === 'sideA';
    const attackerSide = isA ? sideA : sideB;
    const defenderSide = isA ? sideB : sideA;
    const choices = isA ? mapA.get(slot.index) : mapB.get(slot.index);
    const attackerResult = isA ? resultA : resultB;
    const sideLabel = isA ? 'sideA' : 'sideB';
    const defenderPartySkills = isA ? partySkillsB : partySkillsA;
    const defenderCombat = isA ? combatB : combatA;
    const defenderCounters = isA ? inlineCountersB : inlineCountersA;
    const attackerCounters = isA ? inlineCountersA : inlineCountersB;

    const result = executeSlotMoveTurn(attackerSide, defenderSide, slot.index, choices, {
      itemBuffs: isA ? itemBuffsA : itemBuffsB,
      hastedSlots: isA ? hastedA : hastedB,
      defeatedIndices: defeatedDummy,
      onAttack(atk) {
        atk.playbackIndex = playbackCounter++;
        atk.side = sideLabel;
        orderedAttacks.push(atk);
        attackerResult.attacks.push(atk);

        // Opposing side counters
        if (defenderPartySkills && defenderCombat) {
          const counter = computeInlineCounter(atk, defenderSide, attackerSide, defenderPartySkills, defenderCombat);
          if (counter) {
            counter.playbackIndex = playbackCounter++;
            counter.side = isA ? 'sideB' : 'sideA';
            orderedAttacks.push(counter);
            defenderCounters.push(counter);
          }
        }

        return attackerSide[slot.index]?.hp > 0;
      }
    });
  }
```

- [ ] **Step 4: Run PvP tests**

Run: `node --test tests/unit/pvp/pvp-combat.test.js`
Expected: All tests PASS including the new counter-kill test

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Remove backward compat shim from `executeSlotMoveTurn`**

Now that both PvE and PvP use the new options-based API, remove the legacy positional param detection added in Task 1 Step 6. Change the signature back to clean:

```js
export function executeSlotMoveTurn(allies, enemies, slotIndex, choices, options = {}) {
```

Remove the `legacyArgs` detection block.

- [ ] **Step 7: Run full test suite again**

Run: `npm test`
Expected: All tests PASS (no callers use old API)

- [ ] **Step 8: Commit**

```bash
git add src/pvp/pvp-combat.js src/game/services/creature-combat-service.js tests/unit/pvp/pvp-combat.test.js
git commit -m "refactor: unify PvP initiative loop + fix counter-kill haste bug

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Cleanup and Final Verification

### Task 4: Final integration verification

- [ ] **Step 1: Syntax-check all modified files**

Run: `node --check src/game/services/creature-combat-service.js && node --check src/pvp/pvp-combat.js && node --check src/game/loop.js && echo "ALL OK"`
Expected: "ALL OK"

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS (only pre-existing prologue test failure)

- [ ] **Step 3: Verify PvE inline counter tests still pass**

Run: `node --test tests/unit/game/party-skill-engine-counter.test.js`
Expected: All 10 tests PASS

- [ ] **Step 4: Verify PvP tests still pass**

Run: `node --test tests/unit/pvp/pvp-combat.test.js`
Expected: All tests PASS including counter-kill test

- [ ] **Step 5: Verify `executeSlotMoveTurn` tests pass**

Run: `node --test tests/unit/game/execute-slot-move-turn.test.js`
Expected: All tests PASS

- [ ] **Step 6: Commit if any cleanup needed**

Only if files were touched:

```bash
git add -A && git commit -m "chore: final cleanup for unified initiative loop

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
