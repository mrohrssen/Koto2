# Combat Move Mechanics Engine Design

**Date:** 2026-05-06  
**Status:** Approved design, awaiting implementation plan  
**Scope:** Build engine support for the move mechanics described in `docs/move-system-reference.md`, including dexterity, without authoring the upcoming expanded move set.

## Goal

Koto's move data is expanding soon. Before that data lands, actual combat needs to support the full intended move design space:

- `dex` as a real creature stat and battle-stage stat.
- Dexterity-driven initiative, critical hits, and dodge.
- Heal moves with status/stat riders.
- Poison that can KO.
- Cleanse as a supported status rider.
- Removal of deprecated shield/haste/spd/temp flat attack paths.
- PvE and PvP parity for all combat mechanics.

This work should make future authored moves functional as soon as their JSON is added, but it should not add a large set of new moves in this task.

## Existing Architecture

The current stat-stage system already supports temporary battle modifiers through `statStages` and `getStageMultiplier(creature, stat)` in `src/game/combat/effects.js`.

Today that model is used for:

- `atk`: multiplies outgoing damage.
- `def`: multiplies incoming damage resistance.

Dex should reuse this system rather than introducing a separate buff model. The engine should extend stages from `{ atk, def }` to `{ atk, def, dex }` and add thin dex-specific helpers on top.

Core combat resolution is shared across PvE and PvP through `src/game/services/creature-combat-service.js`, especially `executeMove()` and `executeSlotMoveTurn()`. PvP calls into that path from `src/pvp/pvp-combat.js`. New behavior should be implemented in shared helpers so PvE and PvP stay aligned.

## Dexterity Stat Model

Creatures should gain a real dexterity stat:

- Template field: `baseDex`.
- Runtime field: `dex`.
- Runtime template field for save sync / level-up: `baseDexTemplate`.
- Battle-stage field: `statStages.dex`.

Dex scales with level the same way as existing `attack`, `defense`, `maxHp`, and `maxMp`, using `getStatsForLevel()` or an equivalent extension of that function.

Every creature template in `data/creatures.json` must receive an authored `baseDex` as part of this plan. There should be no template-level fallback for missing dex: tests should fail if any creature lacks `baseDex`.

Older save data may contain runtime creature instances without `dex` or `baseDexTemplate`. Save sync should populate those runtime fields from the creature's template `baseDex`, then recompute scaled `dex` from level. If a saved creature references an unknown template or a template without `baseDex`, that is invalid data and should surface as an error in tests rather than silently falling back.

## Dex Stage Multiplier

Dex stages use the existing stage multiplier:

```js
max(2, 2 + stage) / max(2, 2 - stage)
```

Examples:

- `dex +1` = `1.5x`
- `dex +2` = `2.0x`
- `dex -1` = `0.667x`
- `dex -2` = `0.5x`

Effective dex:

```js
effectiveDex = round(creature.dex * getStageMultiplier(creature, 'dex'))
```

This is intentionally consistent with `atk` and `def`: moves can author temporary dex buffs/debuffs through `statChanges: { "dex": 1 }` without permanently changing the creature.

## Initiative Formula

Turn order should use effective dex first:

```js
effectiveDex descending
level descending
random tie-break
```

This replaces the current level-first initiative in both PvE and PvP. Level remains a tie-breaker so progression still matters when dex is equal.

This requires updating:

- `processInterleavedPvERound()` initiative sorting.
- `resolveRound()` PvP initiative sorting.
- Any exported helper such as `buildTurnOrder()` that currently sorts by level.

## Critical Hit Formula

Research summary:

- Pokemon Gen I used base Speed as a critical-hit threshold over 256.
- Modern Pokemon moved to fixed critical-hit stages.
- Koto wants dex to matter directly, so Gen I is the better inspiration, but the result should be capped for mobile RPG readability.

Approved Koto formula:

```js
critChance = clamp((effectiveDex + 8) / 256, 0.03, 0.25)
```

Damage multiplier:

```js
criticalDamage = floor(baseDamage * 1.5)
```

Only `damage` and `drain` moves can crit. Healing, buff, and debuff moves should not crit.

Attack records should include:

- `critical: true | false`
- `critChance` if useful for tests/debugging

The UI already has partial `critical` handling and should receive the same field for PvE and PvP.

## Dodge Formula

Research summary:

- Pokemon accuracy/evasion uses stages capped from `-6` to `+6`.
- Gen V+ stage multiplier is `max(3, 3 + stage) / max(3, 3 - stage)`.
- A strict Pokemon adaptation can push a 100%-accuracy move down to roughly 33% hit chance at extreme evasion, which is too miss-heavy for Koto's learning loop.

Approved Koto formula:

```js
stageDelta = clamp(attacker.statStages.dex - defender.statStages.dex, -6, 6)
rawHitChance = max(3, 3 + stageDelta) / max(3, 3 - stageDelta)
hitChance = clamp(rawHitChance, 0.70, 1.00)
dodgeChance = 1 - hitChance
```

This means:

- Equal dex stages: 100% hit chance.
- Defender dex buffs or attacker dex debuffs can create dodge chance.
- Dodge is capped at 30%, avoiding long miss streaks.
- Attacker dex advantage cannot exceed 100% hit because normal combat has no baseline miss chance.

The dodge check should happen per target before damage/status/stat riders. If a move is dodged:

- No HP damage.
- No drain healing.
- No status rider.
- No stat-stage rider.
- Attack record includes `dodged: true`, `damage: 0`, and the same target metadata as a normal attack.

Self and ally-targeting beneficial moves should not be dodged.

## Move Resolution Changes

### Damage and Drain

For each hostile target:

1. Resolve dodge.
2. If dodged, emit a dodge attack record and skip riders.
3. Roll damage variance.
4. Roll crit and apply crit multiplier.
5. Apply existing element, STAB, item, attack-stage, defense-stage, and defend reductions.
6. Apply damage and break sleep on damage.
7. Apply drain healing if applicable.
8. Apply status/stat riders if the target survived.
9. Award XP / KO flow as today for direct damage KOs.

### Heal

Heal moves should apply their heal amount and then apply allowed beneficial riders:

- `statusEffect: "cleanse"` if present.
- Positive `statChanges`.

Heal riders should work for `self`, `single_ally`, and `all_allies`.

### Buff and Debuff

Buff and debuff moves already call status/stat rider helpers. Their behavior should continue, with cleanse added and deprecated status names removed.

Debuffs that target enemies should be dodgeable if they are hostile. Pure self/ally buffs should not be dodgeable.

## Status Effects

### Cleanse

Add `applyCleanse(target)` in `src/game/combat/effects.js`.

It removes:

- `poison`
- `sleep`
- `stun`
- `confuse`

It does not remove:

- `taunt`
- positive stat stages
- negative stat stages

`tryApplyStatus()` should support `statusEffect: "cleanse"` and return `"cleanse"` when applied.

### Poison KOs

`tickEffects()` currently prevents poison from reducing HP below 1. That clamp should be removed.

Poison events should include enough data to identify a KO:

- `targetId`
- `targetIndex`
- `targetSide`
- `damage`
- `targetDefeated`
- `sourceId`

PvE combat-cycle handling needs to decide whether poison KOs trigger the same post-KO flow as direct damage. The intended behavior is:

- Poison can end a battle.
- Poison can trigger KO swaps/removals.
- If an enemy dies from poison applied by a player creature, the party should receive kill XP using the existing party XP model.
- Befriend quiz behavior should only trigger if the existing combat-cycle victory conditions would trigger it for that enemy state.

If source attribution is not reliable enough for per-attacker credit, awarding normal party kill XP is acceptable because the existing XP model already grants XP party-wide.

## Deprecated Mechanics Removal

Remove legacy mechanics that the move-system reference marks deprecated:

- `case "shield"` in `executeMove()`.
- `case "shield"` in `buildEnemyActionRecord()`.
- `statusEffect: "shield"`.
- `statusEffect: "team_shield"`.
- `statusEffect: "haste"`.
- `applyShield()`.
- `applyTeamShield()`.
- `applyHaste()`.
- `hasHaste()`.
- `consumeHaste()`.
- `getDamageReduction()`.
- `applyTempAttackFlat()`.
- `getFlatAttackBonus()`.
- `spd` label in `public/js/ui/move-effect-label.js`.

Before deleting, redesign the one live move that uses haste:

- `Call` (`呼ぶ`) should become a normal buff move with `statChanges: { "dex": 1 }`, likely targeting `all_allies`.

Party skills that currently count or benefit from shield/haste should be migrated in the same implementation rather than keeping deprecated effects alive:

- Positive `def` stage replaces shield for defensive-buff checks.
- Positive `dex` stage replaces haste for speed-buff checks.
- `countBuffTypes()` should count positive `atk`, `def`, and `dex` stages as separate buff types.

## Data Changes

This task should include minimal data changes required to keep the game valid:

- Add authored `baseDex` values to every existing creature template.
- Update `Call` away from `haste`.
- Remove or migrate any authored `shield` category/effect uses.

It should not add the upcoming expanded move set.

## UI Contract

Attack records should use existing UI-friendly fields:

- `critical`
- `dodged`
- `damage`
- `healAmount`
- `effectApplied`
- `statChangesApplied`

Move effect labels should support `dex`:

- `Dex +1`
- `Dex -1`

No major visual redesign is required. If the implementation changes visible combat behavior, it will need screenshot/playtest verification before completion under the repo's visual verification rule.

## Testing

Focused unit tests should cover:

- `initStatStages()` and `resetStatStages()` include `dex`.
- Every creature template has numeric `baseDex`.
- `getStageMultiplier()` remains unchanged and works for dex.
- `getEffectiveDex()` uses base dex plus stage multiplier.
- Initiative sorting uses effective dex in PvE and PvP.
- Crit chance clamps at 3% and 25%.
- Crit damage applies `1.5x` to damage/drain only.
- Dodge chance uses dex stage delta and caps dodge at 30%.
- Dodged hostile moves skip damage, drain, statuses, and stat riders.
- Beneficial ally/self moves cannot be dodged.
- Heal riders apply.
- Cleanse removes poison/sleep/stun/confuse and leaves taunt/stat stages alone.
- Poison can KO.
- Poison KO can end combat and run KO/XP flow.
- `Call` applies dex stage instead of haste.
- Deprecated shield/haste/temp flat attack helpers and branches are gone.
- PvP and PvE both receive `critical` and `dodged` records consistently.

Verification commands after implementation should include targeted unit tests first, then the broader unit suite:

```bash
npm run test:unit -- --test-name-pattern="combat|pvp|effects|creature"
npm run test:unit
```

After editing frontend JS, run syntax checks on touched files, for example:

```bash
node --check public/js/ui/move-effect-label.js
```

## Acceptance Criteria

The implementation is complete when:

- Existing combat can run with `dex` in creature data and stat stages.
- Dex affects turn order, crit chance, and dodge chance in both PvE and PvP.
- Future moves using `statChanges.dex`, `cleanse`, heal riders, poison, drain, debuffs, and multi-target hostile moves resolve correctly.
- Deprecated shield/haste/spd/temp-flat-attack paths are removed or migrated.
- No expanded move set is added as part of this task.
- Tests cover the new mechanics and pass.
