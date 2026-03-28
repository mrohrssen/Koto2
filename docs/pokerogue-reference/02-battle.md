# Battle — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

The battle system is the core gameplay loop. Each wave is a turn-based combat encounter where the player's party fights wild Pokemon or trainer teams. Combat resolves through a damage formula that combines attacker stats, move power, type effectiveness, and numerous multipliers (weather, terrain, abilities, items, crits, STAB).

Turn order is determined by speed stats within priority brackets — higher priority moves always go first regardless of speed, and within the same bracket, the faster Pokemon acts first (reversed by Trick Room). Status effects, weather, terrain, and arena tags (hazards/screens) layer additional strategic depth.

The system also handles catching wild Pokemon mid-run, berry consumption, Terastallization, and move learning — all integrated into the same phase-based battle flow.

## Table of Contents

- [Stat Calculation](#stat-calculation)
- [Stat Stages](#stat-stages)
- [Damage Formula](#damage-formula)
- [Type Effectiveness](#type-effectiveness)
- [Critical Hits](#critical-hits)
- [Accuracy and Evasion](#accuracy-and-evasion)
- [Speed and Turn Order](#speed-and-turn-order)
- [Status Effects](#status-effects)
- [Weather](#weather)
- [Terrain](#terrain)
- [Arena Tags (Hazards & Screens)](#arena-tags-hazards--screens)
- [Catch Rate Formula](#catch-rate-formula)
- [Multi-Hit Moves](#multi-hit-moves)
- [Move Priority](#move-priority)
- [Berries](#berries)
- [Terastallization](#terastallization)

---

## Stat Calculation

Each Pokemon's six stats (HP, ATK, DEF, SPATK, SPDEF, SPD) are calculated from base stats, IVs, level, and nature.

**How it works:**

For HP:
```
HP = floor((2 * baseHP + IV) * level / 100) + level + 10
```

For all other stats:
```
stat = floor((2 * baseStat + IV) * level / 100) + 5
stat = floor(stat * natureMultiplier)
```

Nature multiplier is 1.1 (boosted), 0.9 (reduced), or 1.0 (neutral). Each nature boosts one stat and reduces another (5 neutral natures do nothing).

**Key values:**

| Component | Range | Notes |
|-----------|-------|-------|
| Base stat | 1-255 | Species-specific |
| IV | 0-31 | 5 bits from personality value |
| Nature multiplier | 0.9 / 1.0 / 1.1 | One up, one down |
| Fusion stat | ceil((stat1 + stat2) / 2) | Averaged, rounded up |

IVs are extracted from the Pokemon's 32-bit personality ID using 5-bit masks per stat: HP (bits 29-25), ATK (24-20), DEF (19-15), SPATK (14-10), SPDEF (9-5), SPD (4-0).

**Koto Relevance:** High — Directly portable. Koto can use the same formula with creature base stats.

*(source: `field/pokemon.ts:1581-1622`, `utils/common.ts:190-199`)*

---

## Stat Stages

In-battle stat modifications range from -6 to +6. Each stage changes the effective stat by a ratio.

**How it works:**

```
multiplier = max(2, 2 + stage) / max(2, 2 - stage)
```

| Stage | Multiplier | Stage | Multiplier |
|-------|-----------|-------|-----------|
| +6 | 4.00x | -1 | 0.67x |
| +5 | 3.50x | -2 | 0.50x |
| +4 | 3.00x | -3 | 0.40x |
| +3 | 2.50x | -4 | 0.33x |
| +2 | 2.00x | -5 | 0.29x |
| +1 | 1.50x | -6 | 0.25x |
| 0 | 1.00x | | |

Critical hits ignore negative ATK/SPATK stages on the attacker and positive DEF/SPDEF stages on the defender.

**Koto Relevance:** High — The stage multiplier table is directly portable.

*(source: `field/pokemon.ts:3415-3461`)*

---

## Damage Formula

The core damage formula combines base damage with a chain of multipliers.

**How it works:**

**Step 1 — Base damage:**
```
baseDamage = ((2 * level / 5 + 2) * power * ATK / DEF) / 50 + 2
```

**Step 2 — Multiplier chain (all multiplied together):**

| Multiplier | Value | Condition |
|------------|-------|-----------|
| Multi-target | 0.75 | Move hits 2+ non-fainted targets |
| Multi-hit | varies | From Multi-Lens / Parental Bond |
| Weather/Terrain | 1.5 or 0.5 | Type-weather interaction |
| Glaive Rush | 2.0 | Target used Glaive Rush last turn |
| Critical | 1.5 | On critical hit |
| Random | 0.85-1.00 | Uniform random roll |
| STAB | 1.5 | Move matches user's type |
| Tera STAB | +0.5 | Additional if Terastallized + matching |
| Type effectiveness | 0 / 0.5 / 1 / 2 / 4 | Per defender type |
| Burn | 0.5 | Physical move + user is burned |
| Screen | 0.5 (single) / 0.67 (double) | Reflect/Light Screen active |
| Misty Terrain | 0.5 | Dragon move vs grounded target |

**STAB details:**
- Base STAB: 1.5x if move type matches user's type
- Tera STAB: additional +0.5 if Terastallized and move matches Tera type
- Stellar Tera: +0.2 to non-matching types
- Max STAB cap: 2.25x

**Minimum power rule:** Non-priority, single-hit Tera-type moves have minimum 60 power when Terastallized.

**Koto Relevance:** Critical — This is the single most important formula to port. The multiplier chain design is clean and extensible.

*(source: `field/pokemon.ts:3552-3942`)*

---

## Type Effectiveness

18 types form a rock-paper-scissors web. Each attacking type has a multiplier against each defending type (0x immune, 0.5x resisted, 1x neutral, 2x super effective). Dual-typed defenders multiply both.

**Key matchups (super effective):**

| Attacking Type | Super Effective Against |
|----------------|----------------------|
| Fire | Grass, Ice, Bug, Steel |
| Water | Fire, Ground, Rock |
| Grass | Water, Ground, Rock |
| Electric | Flying, Water |
| Fighting | Normal, Rock, Ice, Dark, Steel |
| Psychic | Fighting, Poison |
| Dark | Ghost, Psychic |
| Fairy | Fighting, Dragon, Dark |
| Dragon | Dragon |
| Ground | Poison, Rock, Steel, Fire, Electric |
| Steel | Rock, Ice, Fairy |

**Immunities:** Normal/Fighting → Ghost, Ground → Electric, Psychic → Dark, Dragon → Fairy, Poison → Steel.

Inverse Battle challenge reverses all effectiveness (0 ↔ 2, 0.5 ↔ 2).

**Koto Relevance:** High — Koto uses elements instead of types, but the multiplier structure ports directly.

*(source: `data/type.ts:19-287`)*

---

## Critical Hits

Critical hits deal 1.5x damage and ignore unfavorable stat stages.

**How it works:**

Crit stage determines the chance:

| Crit Stage | Chance | Percentage |
|------------|--------|-----------|
| 0 | 1 in 24 | 4.2% |
| 1 | 1 in 8 | 12.5% |
| 2 | 1 in 2 | 50% |
| 3+ | 1 in 1 | 100% |

Crit stages are increased by moves with HighCritAttr, abilities (Super Luck), items (Scope Lens), and battler tags (CritBoost from Focus Energy).

On crit: negative ATK/SPATK stages on the attacker are ignored, positive DEF/SPDEF stages on the defender are ignored.

**Koto Relevance:** High — The crit stage table is elegant and directly portable.

*(source: `field/pokemon.ts:1424-1438, 3950-3978`)*

---

## Accuracy and Evasion

Moves have a base accuracy (typically 70-100, or -1 for never-miss). The accuracy check compares this against accuracy/evasion stage differences.

**How it works:**

```
stageDiff = user_ACC_stage - target_EVA_stage

if stageDiff > 0: multiplier = (3 + min(stageDiff, 6)) / 3
if stageDiff < 0: multiplier = 3 / (3 + min(abs(stageDiff), 6))
if stageDiff = 0: multiplier = 1.0

finalAccuracy = moveAccuracy * multiplier
hit = random(0, 100) < finalAccuracy
```

| Stage Diff | Multiplier |
|-----------|-----------|
| +6 | 3.00x |
| +3 | 2.00x |
| +1 | 1.33x |
| 0 | 1.00x |
| -1 | 0.75x |
| -3 | 0.50x |
| -6 | 0.33x |

**Special cases:**
- `accuracy = -1`: always hits
- Gravity: accuracy x1.67
- Fog: accuracy -10%
- Multi-hit moves: only first hit checked (unless CHECK_ALL_HITS flag)

**Koto Relevance:** High — Accuracy stages are directly portable.

*(source: `field/pokemon.ts:3473-3543`)*

---

## Speed and Turn Order

Turn order is resolved by priority bracket first, then speed within each bracket.

**How it works:**

1. Non-FIGHT commands (Switch, Ball, Run) go before all FIGHT commands
2. Within FIGHT commands, group by move priority (+5 to -7)
3. Within each priority group, sort by effective speed (highest first)
4. Trick Room reverses speed order within each bracket

**Effective speed** = base SPD stat * stat stage multiplier, modified by abilities, items, weather (Ice-type in Snow: 1.5x), paralysis (0.5x).

**Common priority levels:**

| Priority | Examples |
|----------|---------|
| +5 | Protect |
| +2 | Extreme Speed |
| +1 | Quick Attack, Aqua Jet, Mach Punch |
| 0 | Most moves |
| -1 | Vital Throw |
| -6 | Trick Room |
| -7 | Roar, Whirlwind |

**Koto Relevance:** High — Priority brackets + speed ordering is the standard and works great.

*(source: `utils/speed-order.ts:21-83`, `phases/turn-start-phase.ts:21-79`)*

---

## Status Effects

Six non-volatile status conditions affect Pokemon persistently until cured.

| Status | Per-Turn Damage | Other Effect | Catch Rate |
|--------|----------------|--------------|-----------|
| Poison | 1/8 max HP | — | 1.5x |
| Toxic | 1/16 * turnCount max HP | Damage increases each turn | 1.5x |
| Burn | 1/8 max HP | Physical ATK halved | 1.5x |
| Paralysis | — | Speed halved, 25% skip turn | 1.5x |
| Sleep | — | Can't act (ticks down) | 2.5x |
| Freeze | — | Can't act (20% thaw/turn) | 2.5x |

Poison, Burn, and Toxic damage are applied post-turn (after all moves resolve). Toxic's turn counter increments each application.

**Koto Relevance:** Medium — Status effects are important but Koto may want a simplified set.

*(source: `data/status-effect.ts:1-181`)*

---

## Weather

Weather modifies move damage by type and can deal passive damage.

**Damage multipliers:**

| Weather | Boosted Type (1.5x) | Weakened Type (0.5x) |
|---------|---------------------|---------------------|
| Sunny / Harsh Sun | Fire | Water |
| Rain / Heavy Rain | Water | Fire |

**Per-turn damage:**

| Weather | Damage | Immune Types |
|---------|--------|-------------|
| Sandstorm | 1/8 max HP | Rock, Ground, Steel |
| Hail | 1/8 max HP | Ice |

**Move cancellation:** Harsh Sun cancels Water moves; Heavy Rain cancels Fire moves.

Standard weather lasts 5 turns. Harsh Sun, Heavy Rain, and Strong Winds are permanent until replaced.

**Koto Relevance:** Medium — Weather is a good optional layer. The 1.5x/0.5x multipliers are well-balanced.

*(source: `data/weather.ts:10-247`)*

---

## Terrain

Terrain boosts moves of a matching type by 1.3x for grounded Pokemon.

| Terrain | Boosted Type | Special Effect |
|---------|-------------|----------------|
| Electric | Electric (1.3x) | — |
| Grassy | Grass (1.3x) | Heal 1/8 HP per turn |
| Psychic | Psychic (1.3x) | Blocks priority moves vs grounded targets |
| Misty | — | Dragon moves deal 0.5x vs grounded targets |

Terrain lasts 5 turns.

**Koto Relevance:** Low-Medium — Terrain is a niche mechanic, lower priority for Koto.

*(source: `data/terrain.ts:10-187`)*

---

## Arena Tags (Hazards & Screens)

Field effects placed by moves that persist across turns.

**Damage reduction screens:**

| Screen | Reduces | Single Battle | Double Battle | Duration | Bypassed By |
|--------|---------|--------------|--------------|----------|-------------|
| Reflect | Physical | 0.5x | 0.67x | 5 turns | Crits, Infiltrator |
| Light Screen | Special | 0.5x | 0.67x | 5 turns | Crits, Infiltrator |
| Aurora Veil | Both | 0.5x | 0.67x | 5 turns | Crits, Infiltrator |

**Entry hazards (damage on switch-in):**

| Hazard | Max Layers | Damage |
|--------|-----------|--------|
| Stealth Rock | 1 | 12.5% * type effectiveness (can be 3.125% to 50%) |
| Spikes | 3 | 1/8 (1 layer), 1/6 (2), 1/4 (3) — grounded only |
| Toxic Spikes | 2 | Poison (1 layer), Toxic (2 layers) — grounded only |

**Other key tags:**

| Tag | Duration | Effect |
|-----|----------|--------|
| Trick Room | 5 turns | Reverses speed order |
| Tailwind | 4 turns | Speed 1.5x for team |
| Safeguard | 5 turns | Prevents status |
| Mist | 5 turns | Prevents stat reduction |
| Gravity | 5 turns | Grounds all, accuracy +67% |

**Koto Relevance:** High — Hazards (especially Stealth Rock) and screens are core competitive mechanics worth porting.

*(source: `data/arena-tag.ts:113-1850`)*

---

## Catch Rate Formula

Wild Pokemon can be caught with Pokeballs using a modified catch rate formula.

**How it works:**

```
modifiedRate = floor(
  ((3 * maxHP - 2 * currentHP) * speciesCatchRate * ballMultiplier) / (3 * maxHP)
  * statusMultiplier
  * shinyMultiplier
)
```

**Pokeball multipliers:**

| Ball | Multiplier |
|------|-----------|
| Pokeball | 1.0 |
| Great Ball | 1.5 |
| Ultra Ball | 2.0 |
| Rogue Ball | 3.0 |
| Master Ball | Guaranteed |

**Status multipliers:** Sleep/Freeze = 2.5x, Poison/Burn/Paralysis = 1.5x, None = 1.0x.

**Shake check:** Each catch attempt requires 3 successful shake checks (1 for critical capture):
```
shakeProbability = floor(65536 / (255 / modifiedRate)^0.1875)
```
If modifiedRate >= 255, capture is guaranteed.

**Critical capture:** Chance scales with Pokedex completion (0x at <100 species, 2.5x at >800 species). Only requires 1 shake check instead of 3.

**Koto Relevance:** High — Catch mechanics are core to party building mid-run.

*(source: `data/pokeball.ts:50-110`, `phases/attempt-capture-phase.ts:62-87`)*

---

## Multi-Hit Moves

Some moves hit 2-5 times per turn.

**Hit count for 2-5 hit moves:**

```
roll = random(0, 20)
if roll >= 13: 2 hits (35%)
if roll >= 6:  3 hits (35%)
if roll >= 3:  4 hits (15%)
else:          5 hits (15%)
```

Skill Link ability forces 5 hits. Parental Bond adds 1 extra hit. Multi-Lens item adds 1 hit per stack.

First hit checks accuracy; subsequent hits always land (unless CHECK_ALL_HITS flag is set).

**Koto Relevance:** Medium — Multi-hit is a nice mechanic but not essential for Koto's vocab-card combat.

*(source: `data/moves/move.ts:2836-2967`)*

---

## Move Priority

Each move has a static priority value (-7 to +5). Higher priority moves always act first regardless of speed.

Common priority moves:

| Priority | Moves |
|----------|-------|
| +5 | Protect, Detect |
| +3 | Fake Out |
| +2 | Extreme Speed |
| +1 | Quick Attack, Aqua Jet, Mach Punch, Bullet Punch, Shadow Sneak |
| 0 | Most moves |
| -1 | Vital Throw |
| -6 | Trick Room |
| -7 | Roar, Whirlwind |

Psychic Terrain blocks priority moves against grounded targets.

**Koto Relevance:** Medium — Priority adds depth but Koto's turn structure may differ.

*(source: `data/moves/move.ts:1161-1181`)*

---

## Berries

Held berries trigger automatically when conditions are met.

**HP-based berries (trigger at <25% HP):**

| Berry | Effect |
|-------|--------|
| Sitrus | Heal 1/4 max HP |
| Liechi | +1 ATK |
| Ganlon | +1 DEF |
| Petaya | +1 SPATK |
| Apicot | +1 SPDEF |
| Salac | +1 SPD |
| Lansat | +1 Crit stage |
| Starf | +2 random stat |

**Other berries:**

| Berry | Trigger | Effect |
|-------|---------|--------|
| Lum | Has status or confusion | Cure all |
| Enigma | Hit by super-effective move | Heal 1/4 max HP |
| Leppa | Any move reaches 0 PP | Restore 10 PP |

Abilities can modify berry thresholds (Gluttony triggers at 50% instead of 25%) and double effects (Ripen).

**Koto Relevance:** Medium — Berry-like consumable items could add depth to Koto's item system.

*(source: `data/berry.ts:13-162`)*

---

## Terastallization

Terastallization changes a Pokemon's type to their Tera type, boosting STAB for matching moves.

**How it works:**

- Each Pokemon has a Tera type (may differ from their natural types)
- Once per battle, a Pokemon can Terastallize
- Terastallized Pokemon's defensive typing changes to the Tera type
- STAB bonus: +0.5 for Tera-matching moves (stacks with natural STAB for up to 2.25x)
- Minimum 60 power for non-priority single-hit Tera-type moves

**Stellar Tera (special):** Grants +0.5 STAB to original-type moves and +0.2 to all other moves.

**Koto Relevance:** Medium — Tera is a strong "super mode" mechanic but Pokemon-specific. Could inspire a similar mid-battle transformation for Koto.

*(source: `phases/tera-phase.ts:13-54`, `field/pokemon.ts:3630-3663`)*
