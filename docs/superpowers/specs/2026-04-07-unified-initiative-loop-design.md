# Unified Initiative Loop Design

**Date:** 2026-04-07
**Status:** Approved

## Problem

PvE and PvP have separate initiative loop implementations that duplicate logic and diverge in behavior. PvE uses `runEnemyTurn` (executes one attack at a time, checks hp between haste strikes) while PvP uses `executeSlotMoveTurn` (pre-computes all attacks including haste as a batch). This causes a bug: counter-kills in PvP don't prevent subsequent haste attacks because the damage was already applied.

## Solution: Unify via Callback-Based `executeSlotMoveTurn`

1. Modify `executeSlotMoveTurn` to accept an `onAttack` callback that fires after each individual attack, with hp checks between haste strikes
2. Pre-select enemy moves before the initiative loop (like PvP does for players)
3. Both PvE and PvP use the same loop body: iterate initiative, call `executeSlotMoveTurn` with `onAttack` for playback tagging + counter checks

## `executeSlotMoveTurn` Callback Pattern

### Current signature (9 positional params):
```js
executeSlotMoveTurn(allies, enemies, slotIndex, choices, itemBuffs, creatureParty, metaMults, hastedSlots, defeatedEnemyIndices)
```

### New signature (options object):
```js
executeSlotMoveTurn(allies, enemies, slotIndex, choices, options = {})
```

Where `options` contains:
- `itemBuffs` — item buff modifiers
- `creatureParty` — for XP awards (null for enemies/PvP)
- `metaMults` — crest multipliers (null for enemies/PvP)
- `hastedSlots` — Set of slot indices that consumed haste
- `defeatedIndices` — Set for kill tracking
- `onAttack(atk)` — callback fired after each attack record. Return `false` to stop execution (e.g., attacker died to counter).

### Inner loop change:

After each `executeMove` result, each attack record is emitted individually. Between haste strikes, check `creature.hp <= 0` to handle counter-kills:

```js
for (const choice of choices) {
  // ... move lookup, mp deduction ...
  
  const runOne = () => {
    const result = executeMove(...);
    for (const atk of result.attacks) {
      attacks.push(atk);
      if (options.onAttack && options.onAttack(atk) === false) return false;
    }
    xpEvents.push(...result.xpEvents);
    return true;
  };

  if (!runOne()) break;
  if (creature.hp <= 0) break; // killed by counter between strikes
  if (options.hastedSlots?.has(slotIndex)) {
    runOne();
  }
}
```

Callers that don't pass `onAttack` get the same batch behavior (backward compat).

## Defender Item Buff Damage Reduction

`buildEnemyActionRecord` applies `applyDamageReduction(damage, itemBuffs)` where `itemBuffs` is the **player's** defensive item buffs (e.g., flat damage reduction). `executeMove` does not do this — its `itemBuffs` param is for attacker buffs.

To preserve this behavior when enemies attack through `executeSlotMoveTurn`, add `defenderItemBuffs` to the options. In the `onAttack` callback or in `executeMove` itself, apply `applyDamageReduction` to damage dealt to the defending side. The simplest approach: have `executeMove` accept an optional `defenderItemBuffs` param and apply it after damage calculation, same place `buildEnemyActionRecord` does.

For PvE: pass `this.run.itemBuffs` as `defenderItemBuffs` when the attacker is an enemy.
For PvP: no item buffs in PvP, so `defenderItemBuffs` is null.

Note: `defendActive` (50% damage reduction) is NOT relevant here. It only applies in the defend path (`processEnemyTurn`), never in the initiative loop. Defend path stays unchanged.

## Enemy Move Pre-Selection

Before the initiative loop, pre-select enemy moves into the same `{ creatureIndex, moveId, targetIndex }` format:

```js
const enemyChoicesMap = new Map();
for (let ei = 0; ei < enemies.length; ei++) {
  const enemy = enemies[ei];
  if (!enemy || enemy.hp <= 0 || isIncapacitated(enemy)) continue;
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
```

If a pre-selected target dies before the enemy's turn, `executeMove` → `resolveTargets` handles it (picks a new alive target or skips).

Enemy haste sets are computed before the loop alongside ally haste sets.

## Unified Initiative Loop

Both PvE and PvP iterate the sorted initiative list and call `executeSlotMoveTurn` for every slot — allies and enemies alike.

### PvE:

```js
for (const slot of initiative) {
  const isAlly = slot.kind === 'ally';
  const attacker = isAlly ? allies : enemies;
  const defender = isAlly ? enemies : allies;
  const choices = isAlly ? choicesByAlly.get(slot.index) : enemyChoicesMap.get(slot.index);

  executeSlotMoveTurn(attacker, defender, slot.index, choices, {
    itemBuffs,
    creatureParty: isAlly ? creatureParty : null,
    metaMults: isAlly ? metaMults : null,
    hastedSlots: isAlly ? hastedAllySlots : hastedEnemySlots,
    defeatedIndices,
    onAttack(atk) {
      tagPlayback(atk, isAlly ? 'player' : 'enemy');
      (isAlly ? playerAttacks : enemyAttacks).push(atk);

      // Inline counter from defending side
      if (!isAlly && options.runPartySkills && options.combat) {
        const counter = computeInlineCounter(atk, allies, enemies, options.runPartySkills, options.combat);
        if (counter) {
          tagPlayback(counter, 'player');
          playerAttacks.push(counter);
          inlineCounters.push(counter);
        }
      }

      return attacker[slot.index]?.hp > 0;
    }
  });
}
```

### PvP:

Same pattern but symmetric — when sideA attacks, sideB may counter; when sideB attacks, sideA may counter. The duplicated sideA/sideB branches collapse into a single loop body parameterized by which side is attacking.

## What Dies

- `runEnemyTurn` closure in `processInterleavedPvERound`
- `runAllyChoices` closure in `processInterleavedPvERound`
- Duplicated sideA/sideB branches in `resolveRound`
- `buildEnemyActionRecord` is no longer called from the initiative loop (enemies use `executeMove` via `executeSlotMoveTurn`)

## What Stays Unchanged

- `executeMove` — the canonical attack execution function
- `buildEnemyActionRecord` — still used by `processEnemyTurn` (defend/befriend paths)
- `processEnemyTurn` — defend/befriend paths keep batch enemy execution
- `computeInlineCounter` — called from `onAttack` callback, no changes
- `checkAfflictionBurstCounter` — still runs once after the initiative loop
- Frontend `combat-loop.js` — already handles inline counters, no further changes
- `pickEnemyMoveChoice` — still used, just called during pre-selection instead of execution

## Test Changes

- Update `executeSlotMoveTurn` callers to use new options-based signature
- Update `processInterleavedPvERound` integration tests for new internals
- Update PvP `resolveRound` tests for unified loop
- Add test: PvP counter-kill prevents subsequent haste attack (the bug this fixes)
- Add test: enemy pre-selection produces valid move choices

## Files Modified

| File | Change |
|------|--------|
| `src/game/services/creature-combat-service.js` | Refactor `executeSlotMoveTurn` to options+callback, add `defenderItemBuffs` to `executeMove`, refactor `processInterleavedPvERound` to use pre-selection + unified loop |
| `src/pvp/pvp-combat.js` | Refactor `resolveRound` to use unified loop with callback |
| `tests/unit/game/party-skill-engine-counter.test.js` | Update `processInterleavedPvERound` tests for new signature |
| `tests/unit/pvp/pvp-combat.test.js` | Add PvP counter-kill test, update for unified loop |
