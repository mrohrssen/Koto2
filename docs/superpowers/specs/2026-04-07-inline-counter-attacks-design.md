# Inline Counter Attacks Design

**Date:** 2026-04-07
**Status:** Approved

## Problem

Counter attacks (Retaliation Strike and related party skills) currently fire as a batch at the end of the turn, after all initiative attacks have played out. This feels disconnected — the player sees their creature get hit, then several more attacks play, and only then does the counter animation appear. Counters should feel like immediate reactions: the creature gets hit and counters on the very next move shown.

## Solution: Inline Counters into the Initiative Sequence

Move counter computation from the post-turn batch (`applyAfterEnemyAttacks`) into the initiative loop itself. Each enemy attack is immediately followed by its counter (if one triggers), and the counter gets the next `playbackIndex` so the frontend plays it in sequence.

## Server-Side Changes

### New function: `computeInlineCounter`

Extract the per-attack counter logic from `applyAfterEnemyAttacks` into:

```js
computeInlineCounter(record, allies, enemies, runPartySkills, combat)
```

- Evaluates a single enemy attack record
- Returns a counter record or `null`
- Applies counter damage to the enemy immediately
- Handles Retaliation Strike (50% proc), Hardened Riposte, Fury Counter, Last Stand
- Handles Vengeful Mark, Contagion procs on the counter record

### Initiative loop integration (PvE)

In `processInterleavedPvERound` (`creature-combat-service.js`), after each enemy attack record is created:

1. Call `computeInlineCounter`
2. If counter fires: assign next `playbackIndex`, set `type: 'counter'` and `combatSide: 'player'`, push into `playerAttacks`
3. Enemy dies from counter → subsequent attacks naturally skipped (existing `hp <= 0` checks)

### Initiative loop integration (PvP)

Same pattern in `resolveRound` (`pvp-combat.js`). After each side's attack records are created, check if the opposing side has counter skills and compute inline. Counter records get `side: 'sideA'`/`'sideB'` matching the defending side.

Note: `applyPartySkillsAfterPlayerAttacks` (chain skills, Diverse Empowerment, etc.) runs on player attack records and does not affect counter computation. It currently runs after the initiative loop in PvP — this stays unchanged. Counters only trigger on attacks received, not on chain procs.

### Affliction Burst

Two existing Affliction Burst check sites:
1. **After player attacks** (in `applyAfterPlayerAttacks`) — unchanged, not related to counters
2. **After counters** (in `applyAfterEnemyAttacks`) — moves to a standalone call after the initiative loop, running once over all counter records that fired inline

This keeps the same two-check behavior, just relocates check #2.

### `applyAfterEnemyAttacks` becomes legacy wrapper

Retained for the defend path (which doesn't use initiative ordering). Internally calls `computeInlineCounter` in a loop. No behavior change for defend/befriend paths.

## Counter Record Shape

```js
{
  type: 'counter',           // distinguishes from normal attacks
  playbackIndex: 7,          // position in initiative sequence
  combatSide: 'player',      // PvE (or side: 'sideA'/'sideB' for PvP)
  defenderIndex: 1,          // which ally countered
  defenderName: 'Foxfire',
  defenderElement: 'fire',
  targetIndex: 0,            // which enemy got hit
  targetName: 'Slime',
  damage: 12,
  targetDefeated: false,
  furyStacks: 2,
  isLastStand: false,
  procs: [...]               // Vengeful Mark, Contagion, Spread, etc.
}
```

## Result Payload Changes

- Counters move from `result.counterAttacks` into `result.playerAttacks` (PvE) / `orderedAttacks` (PvP)
- `result.counterAttacks` kept as empty `[]` for backward compatibility
- Frontend stops reading `result.counterAttacks` for move-based combat

## Frontend Changes

### Playback loop

The merged initiative loop in `combat-loop.js` (~line 2290) adds a counter branch:

```js
for (const { side, atk } of merged) {
  if (side === 'player' && atk.type === 'counter') {
    await showOneCounterAttackAnimated(atk);
  } else if (side === 'player') {
    await playOnePlayerAttackInMoveTurn(...);
  } else {
    await showOneEnemyAttackAnimated(...);
  }
}
```

### `showOneCounterAttackAnimated(counter)`

Extracted from the existing `showCounterAttacks` loop body. Shows:
- "COUNTER!" popup on defender
- Lunge animation
- Element blast + damage number on enemy
- Proc animations (Vengeful Mark, Spread, Pandemic, Affliction Burst)

### `showCounterAttacks`

Becomes effectively a no-op for move-based combat (empty array). Retained for legacy defend path.

## `loop.js` Call Site Changes

`src/game/loop.js` calls `applyAfterEnemyAttacks` in 3 places:

1. **Move turn path** (~line 1010): Replace with reading inline counters from `processInterleavedPvERound` result. The counters are already in `playerAttacks` — just collect them for the Affliction Burst check and pass empty `[]` as `counterAttacks` in the response.
2. **Defend turn path** (~line 1175): Keep as-is. Defend uses `processEnemyTurn` (batch, no initiative), so counters are still computed in batch.
3. **Befriend turn path** (~line 1347): Keep as-is. Same batch pattern as defend.

## Non-Changes

- **Befriend counter-attacks**: Computed in `processBefriendQuizAnswer`, don't use initiative. Already feel immediate. No changes.
- **Defend path**: Keeps using `applyAfterEnemyAttacks` and `showCounterAttacks`. Enemies attack as a batch, counters follow as a batch.
- **Fury Counter stacks**: Still accumulate per-defender via `combat.counterCounts`. Works the same inline.
- **Counter procs** (Vengeful Mark, Contagion, Pandemic): Computed per-counter as today, just inline instead of batched.

## Test Changes

- Update `pvp-combat.test.js` to expect counters in `attacks`/`orderedAttacks` instead of `counterAttacks`
- Add test: counter kill prevents subsequent enemy attacks in same initiative
- Existing counter damage/proc tests stay the same, just check different array location

## Files Modified

| File | Change |
|------|--------|
| `src/game/combat/party-skill-engine.js` | Extract `computeInlineCounter`, refactor `applyAfterEnemyAttacks` to use it |
| `src/game/services/creature-combat-service.js` | Call `computeInlineCounter` in initiative loop of `processInterleavedPvERound` |
| `src/game/loop.js` | Update 3 call sites of `applyAfterEnemyAttacks`: move-turn path uses inline counters from result, defend/befriend paths keep batch call |
| `src/pvp/pvp-combat.js` | Call `computeInlineCounter` in initiative loop of `resolveRound` |
| `public/js/ui/combat-loop.js` | Add counter branch to playback loop, extract `showOneCounterAttackAnimated` |
| `tests/unit/pvp/pvp-combat.test.js` | Update counter assertion locations |
