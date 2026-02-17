# Status Effects Design

Date: 2026-02-18

## Goal

Add 8 status effects to the archetype combat system. Effects are applied via ultimates only. Extends the existing `effects.js` (Approach A — no new files).

## Effects

| Effect | Category | Duration | Break Condition | Scaling |
|--------|----------|----------|-----------------|---------|
| sleep | debuff | 2 turns | Wakes on damage | — |
| stun | debuff | 1 turn | No break | — |
| confuse | debuff | 2 turns | No break | — |
| attack_buff | buff | 2 turns | — | power% attack increase |
| haste | buff | 1 use | Consumed on action | — |
| shield | buff | 2 turns | — | power% damage reduction |
| team_shield | buff | 2 turns | — | power% damage reduction (all allies) |
| taunt | buff | 2 turns | — | — |

## Behavior Details

- **sleep**: Target skips their action for 2 turns. If the sleeper takes any damage, the sleep effect is removed immediately (they wake up).
- **stun**: Target skips their action for 1 turn. Does not break early.
- **confuse**: When the confused creature acts, its target is randomly selected from ALL alive creatures on the field (allies + enemies). Could hit itself or allies.
- **attack_buff**: Increases target ally's attack by `power`% for 2 turns. The skill's `power` field IS the percentage (e.g., power: 30 → +30% attack).
- **haste**: Next time the creature acts, it attacks twice. Not turn-based — persists until the creature's next action, then consumed.
- **shield**: Reduces incoming damage to target by `power`% for 2 turns.
- **team_shield**: Same as shield but applied to every alive ally. Legendary-tier effect.
- **taunt**: All enemies must target the taunting creature for 2 turns.

## Active Effect Storage

Each effect stored in `robot.activeEffects[]`:

```js
{ type: 'sleep', remainingTurns: 2, sourceId: 'chouri-1' }
{ type: 'stun', remainingTurns: 1, sourceId: 'chouri-1' }
{ type: 'confuse', remainingTurns: 2, sourceId: 'hebiveil-1' }
{ type: 'attack_buff', percent: 30, remainingTurns: 2, sourceId: 'chouri-1' }
{ type: 'haste', sourceId: 'chouri-1' }  // no remainingTurns — consumed on use
{ type: 'shield', percent: 50, remainingTurns: 2, sourceId: 'kamedor-1' }
{ type: 'team_shield', percent: 40, remainingTurns: 2, sourceId: 'kamedor-1' }
{ type: 'taunt', remainingTurns: 2, sourceId: 'kamedor-1' }
```

## Integration Points

### effects.js — New Functions

Apply functions:
- `applySleep(target, { duration, sourceId })`
- `applyStun(target, { sourceId })`
- `applyConfuse(target, { duration, sourceId })`
- `applyAttackBuff(target, { percent, duration, sourceId })`
- `applyHaste(target, { sourceId })`
- `applyShield(target, { percent, duration, sourceId })`
- `applyTeamShield(allies, { percent, duration, sourceId })`
- `applyTaunt(target, { duration, sourceId })`

Query helpers:
- `isIncapacitated(robot)` — has sleep or stun → skip turn
- `isConfused(robot)` — has confuse → random targeting
- `hasHaste(robot)` — has haste → double attack
- `getAttackMultiplier(robot)` — returns `1 + sum(attack_buff percents) / 100`
- `getDamageReduction(robot)` — returns combined shield + team_shield percent (capped at some max)
- `getTauntTarget(allies)` — returns the taunting ally if any, else null

Expanded `tickEffects()`:
- Decrement `remainingTurns` for all effect types (not just poison)
- Remove expired effects
- Haste does NOT tick — consumed on use, removed separately

Sleep break:
- `breakSleep(target)` — called after damage is dealt to remove sleep

### robot-combat-service.js — Changes

`processAttackTurn()`:
- Check `isIncapacitated()` → skip this robot's action
- Check `isConfused()` → random target from all alive creatures (allies + enemies)
- Check `hasHaste()` → attack twice, then remove haste effect
- Apply `getAttackMultiplier()` to attack value

`processEnemyTurn()`:
- Same incapacitated/confused/haste checks for enemies
- `getTauntTarget()` overrides target selection when a taunting ally exists
- `getDamageReduction()` applied to damage calculation

`processUltimate()`:
- New type branches: sleep, stun, confuse, attack_buff, haste, shield, team_shield, taunt
- Each calls the appropriate apply function and returns `{ success: true, type, effectEvents }`

After damage dealt (both attack and enemy turns):
- Call `breakSleep(target)` to wake sleeping targets

## Damage Reduction Math

```
finalDamage = floor(rawDamage * (1 - percent / 100))
```

Shield and team_shield stack additively (sum percents), capped at 90% reduction.

## Attack Buff Math

```
buffedAttack = floor(baseAttack * (1 + percent / 100))
```

Multiple attack_buffs stack additively (sum percents).

## Ultimate Type Routing

New valid `type` values for skills:
```
"damage" | "heal" | "poison" | "sleep" | "stun" | "confuse" | "attack_buff" | "haste" | "shield" | "team_shield" | "taunt"
```

Debuffs target enemies. Buffs target allies. Taunt targets self. team_shield targets all_allies.

`power` is only meaningful for attack_buff, shield, team_shield (the percentage). For sleep/stun/confuse/haste/taunt, power is 0 or ignored.

## Stacking Rules

Effects do not stack. Reapplication refreshes duration.

## Scope

**In scope:**
- `src/game/combat/effects.js` — 8 apply functions, query helpers, expanded tickEffects
- `src/game/services/robot-combat-service.js` — combat flow changes
- Unit tests for all new effects

**Out of scope:**
- UI indicators for status effects (Layer 4 follow-up)
- Auto-skill status effects (future traits system)
- Creature data updates (done via creature forge separately)
- Enemy AI targeting preferences (enemies already use processUltimate, they get effects for free)
