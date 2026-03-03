# Enemy Scaling System Design

**Date:** 2026-03-03
**Status:** Approved
**Inspired by:** Pokerogue's wave-based quadratic scaling system

## Problem

Koto's current enemy scaling is flat: enemy level = highest ally level ±1, enemy count is a fixed probability roll, XP rewards are constant, and rarity is unaffected by progression. There's no sense of difficulty ramping within an area or across stages.

## Design Decisions

1. **Both stage-based AND within-area scaling** — stage sets the baseline, encounters within an area ramp up
2. **Boss encounter at end of each area** — ramp + distinct boss with 1.25x level multiplier (boss implementation is OUT OF SCOPE for this task — we prepare hooks only)
3. **Rarity shifts with stage** — early stages are common/uncommon dominated; rare/epic appear more in later stages; legendaries are boss-exclusive (never in wild)
4. **Independent enemy levels with guardrails** — formula-driven levels, clamped to playerLevel ± 5
5. **Party size adjusts per-creature level** — solo enemies are tougher, groups of 3 are individually weaker

## Level Formula

```
stageBaseline = stage * 3
encounterBonus = stageBaseline * (encounterIndex * 0.08)
baseLevel = stageBaseline + encounterBonus
```

Where:
- `stage` = the area's stage field (1-10), from `new-areas-staging.json`
- `encounterIndex` = number of encounters completed in this area so far (0, 1, 2, ...)

### Party Size Multiplier

Applied per-creature based on how many enemies spawn:

| Enemy Count | Multiplier | Rationale |
|-------------|-----------|-----------|
| 1 | 1.2x | Solo threat — must feel dangerous |
| 2 | 1.0x | Baseline |
| 3 | 0.85x | Individually weaker, collectively stronger |

### Guardrails

Final level is clamped: `Math.max(1, Math.min(adjustedLevel, playerLevel + 5))` with a floor of `Math.max(1, playerLevel - 5)`.

This prevents impossible encounters while maintaining the feel of stage-appropriate difficulty.

### Boss Encounters (hooks only — not implemented)

Boss level will use: `baseLevel * 1.25` (no party size multiplier — always solo).
The room system should support a `room.isBoss` flag for future use.
Boss creatures are fixed per area (defined in area data), not randomly generated.

## Enemy Count Distribution

Shifts by encounter index within the area:

| Encounter Index | 1 enemy | 2 enemies | 3 enemies |
|----------------|---------|-----------|-----------|
| 0-2 (early) | 50% | 40% | 10% |
| 3-4 (mid) | 40% | 35% | 25% |
| 5+ (late) | 30% | 35% | 35% |

First battle of a run remains capped at max 2 enemies.

## Wild Rarity Distribution by Stage

Legendaries are **never** available in wild encounters — they are boss-exclusive.

| Rarity | Stage 1-3 | Stage 4-6 | Stage 7-9 | Stage 10 |
|--------|-----------|-----------|-----------|----------|
| Common | 80% | 50% | 30% | 20% |
| Uncommon | 18% | 35% | 30% | 30% |
| Rare | 2% | 12% | 25% | 30% |
| Epic | 0% | 3% | 15% | 20% |

## XP Scaling

Replace flat `BASE_KILL_XP = 10` with level-based rewards:

```
xpReward = BASE_KILL_XP + (enemyLevel * 2)
```

- Level 5 enemy → 20 XP
- Level 20 enemy → 50 XP
- Level 30 enemy → 70 XP

The existing XP sharing (active 2 shares, reserve 1 share) and balance redistribution remain unchanged.

## Files to Modify

| File | Change |
|------|--------|
| `src/game/creatures.js` | New `getEnemyLevel(stage, encounterIndex, enemyCount, playerLevel)` function; update `generateEnemyCreature()` and `generateEnemyCreatures()` to accept stage/encounter context; new `getRarityWeightsForStage(stage)` replacing fixed `RARITY_WEIGHTS`; update `rollRarity()` to accept stage |
| `src/game/services/creature-combat-service.js` | Update `BASE_KILL_XP` usage in `awardKillXp()` to use `BASE_KILL_XP + (enemyLevel * 2)` |
| `src/game/loop.js` | Pass `stage`, `encounterIndex` to `generateEnemyCreatures()` in `startCreatureEncounter()` |
| `src/game/rooms.js` | No changes needed now; boss room type will be added in future task |

## Example Progressions

### Stage 1 area, player level 5
| Encounter | Enemies | Per-enemy Level |
|-----------|---------|----------------|
| 0 | 2 | 3 |
| 1 | 1 | 4 |
| 2 | 3 | 3 |
| 3 | 1 | 5 |
| 4 (boss†) | 1 | 5 |

### Stage 5 area, player level 18
| Encounter | Enemies | Per-enemy Level |
|-----------|---------|----------------|
| 0 | 2 | 15 |
| 1 | 3 | 14 |
| 2 | 1 | 21 |
| 3 | 2 | 18 |
| 4 | 3 | 16 |
| 5 (boss†) | 1 | 23 |

### Stage 10 area, player level 35
| Encounter | Enemies | Per-enemy Level |
|-----------|---------|----------------|
| 0 | 2 | 30 |
| 1 | 1 | 39 |
| 2 | 3 | 28 |
| 3 | 2 | 33 |
| 4 | 1 | 40 |
| 5 (boss†) | 1 | 40 (capped) |

†Boss encounters listed for illustration — not implemented in this task.
