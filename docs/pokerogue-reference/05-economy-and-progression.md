# Economy & Progression — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

PokeRogue has two economic layers: an in-run economy (money earned per wave, spent on shop items and rerolls) and a meta-progression economy (candies, vouchers, achievements, unlockables that persist across runs). The in-run economy resets each run; the meta-progression is permanent.

The meta-progression loop is: play runs → earn friendship/candy → unlock starters → try harder runs → earn achievements → get vouchers → pull gacha eggs → unlock more starters. This creates a satisfying long-term progression curve while keeping each individual run self-contained.

## Table of Contents

- [Money System (In-Run)](#money-system-in-run)
- [What Persists Between Runs](#what-persists-between-runs)
- [Achievement System](#achievement-system)
- [Voucher System](#voucher-system)
- [Ribbon System](#ribbon-system)
- [Game Statistics](#game-statistics)
- [Unlockable Content](#unlockable-content)
- [Timed Events](#timed-events)

---

## Money System (In-Run)

Money is earned after each battle and spent on shop items and rerolls. It resets every run.

**How it works:**

Money reward formula:
```
waveSetIndex = ceil(wave / 10) - 1
base = (waveSetIndex + 1 + (0.75 + (((wave - 1) % 10) + 1) / 10)) * 100
exponent = 1 + (0.005 * waveSetIndex)
money = floor(base^exponent / 10) * 10
```

This produces exponential growth — early waves give ~175 gold, late waves give thousands.

**Multipliers:**
- MoneyMultiplierModifier: +20% per stack (max 5 stacks = 2x)
- Happy Hour arena tag: 2x
- DamageMoneyRewardModifier (Meowth): earn `damage * 0.5 * stacks`
- MoneyInterestModifier (Coin Case): earn `floor(currentMoney * 0.1 * stacks)` per turn

**Koto Relevance:** High — The exponential money curve with modifier multipliers is directly portable.

*(source: `battle-scene.ts:2614-2621`)*

---

## What Persists Between Runs

Everything in the `SystemSaveData` structure survives run death. Everything else resets.

**Persists:**

| Data | Purpose |
|------|---------|
| Trainer/Secret ID | Account identity |
| Player Gender | Cosmetic |
| Dex Data | Species seen/caught/hatched, IVs, ribbons |
| Starter Data | Candy count, friendship, movesets, egg moves, ability unlocks |
| Game Stats | 41 cumulative statistics |
| Eggs | Full egg state (tier, species, hatch countdown) |
| Egg/Unlock Pity | Gacha pity counters |
| Unlocks | Feature flags (Endless mode, etc.) |
| Achievement Unlocks | 130+ completion flags |
| Voucher Unlocks/Counts | Gacha pull currency |
| Run History | Last 25 runs |

**Resets each run:**
- Party composition
- Held modifiers/items
- Money
- Wave progress
- Biome state

**Koto Relevance:** High — The clean split between persistent and run-local state is essential for roguelike design.

*(source: `system/game-data.ts:128-207`)*

---

## Achievement System

130+ achievements gate voucher acquisition and track milestones.

**How it works:**

Each achievement has a score that determines its tier and voucher reward:

| Score Range | Tier | Voucher Reward |
|-------------|------|---------------|
| 0-24 | COMMON | REGULAR voucher |
| 25-49 | GREAT | PLUS voucher |
| 50-74 | ULTRA | PREMIUM voucher |
| 75-99 | ROGUE | PREMIUM voucher |
| 100+ | MASTER | GOLDEN voucher |

**Notable achievements:**

| Achievement | Condition | Score |
|-------------|-----------|-------|
| Classic Victory | First classic win | 250 |
| Daily Victory | Win daily run | 100 |
| 10K Money | Peak money >= 10,000 | 25 |
| 1M Money | Peak money >= 1,000,000 | 50 |
| 250 Damage | Single hit >= 250 | 25 |
| 10,000 Damage | Single hit >= 10,000 | 50 |
| Level 100 | Reach level 100 | 25 |
| Level 1000 | Reach level 1000 | 50 |
| 10 Ribbons | Earn 10 ribbons | 50 |
| 100 Ribbons | Earn 100 ribbons | 150 |
| Mono Normal/Fire/Water/etc. | Win monotype challenge | 100 each |
| Mono Gen 1/2/3/.../9 | Win mono-generation challenge | 100 each |
| Nuzlocke | Win Nuzlocke challenge | 100 |
| Fresh Start | Win Fresh Start challenge | 100 |
| See Shiny | Encounter any shiny | 50 |
| Shiny Party | Full party of shinies | 50 |
| Perfect IVs | Get a Pokemon with perfect IVs | 25 |

~40 achievements are "secret" (hidden until unlocked).

**Koto Relevance:** High — Achievements driving voucher rewards creates a natural progression loop. The tiered score system is elegant.

*(source: `system/achv.ts:23-891`)*

---

## Voucher System

Vouchers are the currency for gacha egg pulls. Earned through achievements and boss victories.

**How it works:**

| Voucher Type | Source | Egg Pull |
|--------------|--------|----------|
| REGULAR | Common/Great achievements, boss defeats | 1 pull |
| PLUS | Ultra achievements | 5 pulls |
| PREMIUM | Rogue achievements, boss defeats (high multiplier) | 10 pulls |
| GOLDEN | Master achievements | 25 pulls |

Voucher sources:
- Achievements: tier determines voucher type (see above)
- Trainer victories: PLUS if moneyMultiplier < 10, PREMIUM if >= 10
- Timed events can upgrade REGULAR to PLUS

Vouchers persist across runs. No cap on inventory.

**Koto Relevance:** High — Vouchers as a tiered meta-currency that feeds the gacha loop is well-designed.

*(source: `system/voucher.ts:1-124`)*

---

## Ribbon System

Ribbons are prestige marks awarded for completing challenge runs. Stored as a bitfield per species.

**How it works:**

Each species tracks earned ribbons as a 53-bit integer. Ribbons are awarded when a Pokemon participates in a winning challenge run.

**Ribbon types (40+ total):**

| Category | Examples | Count |
|----------|---------|-------|
| Mono Type | Normal, Fire, Water, ... Fairy | 18 |
| Mono Generation | Gen 1, Gen 2, ... Gen 9 | 9 |
| Classic | Classic mode win | 1 |
| Challenge | Nuzlocke, Fresh Start, Hardcore, No Heal, No Shop | 8+ |
| Special | Friendship (max 255), Flip Stats, Inverse | 3+ |

Total ribbon count feeds the ribbon achievement chain (10 → 25 → 50 → 75 → 100 ribbons), which awards increasingly valuable vouchers.

Ribbons are cosmetic/prestige — no direct mechanical benefit.

**Koto Relevance:** Medium — Ribbons drive long-term collector engagement and feed the achievement chain.

*(source: `system/ribbons/ribbon-data.ts:1-170`)*

---

## Game Statistics

41 cumulative statistics tracked across all runs.

**Key statistics:**

| Statistic | What It Tracks |
|-----------|---------------|
| playTime | Total milliseconds played |
| battles | Total battles fought |
| sessionsWon | Classic runs completed |
| ribbonsOwned | Unique ribbons earned |
| highestEndlessWave | Furthest endless wave |
| highestLevel | Highest Pokemon level |
| highestMoney | Peak money in a single run |
| highestDamage | Highest single-hit damage |
| pokemonSeen | Unique species encountered |
| pokemonCaught | Unique species caught |
| pokemonHatched | Unique species hatched |
| legendaryPokemonCaught | Legendary species caught |
| shinyPokemonCaught | Shiny species caught |
| trainersDefeated | Unique trainers beaten |
| eggsPulled | Total eggs from gacha |
| legendaryEggsPulled | Legendary-tier eggs |

All stats start at 0 and never reset. Used for achievement validation and profile display.

**Koto Relevance:** Medium — Stat tracking is easy to implement and drives achievement unlocks.

*(source: `system/game-stats.ts:1-82`)*

---

## Unlockable Content

Four major unlockables gated behind milestones.

| Unlockable | Unlock Condition | What It Grants |
|------------|-----------------|----------------|
| Endless Mode | Win Classic mode | Access to infinite-wave mode |
| Spliced Endless | (Hidden) | Fusion-only endless mode |
| Mini Black Hole | (Hidden) | Rare modifier availability |
| Eviolite | (Hidden) | Rare held item in pools |

These are persistent boolean flags checked before allowing mode selection or item pool inclusion.

**Koto Relevance:** Low — Small set, but the pattern of unlocking modes via achievements is good.

*(source: `system/unlockables.ts:1-18`)*

---

## Timed Events

Limited-time events provide multipliers, exclusive encounters, and mechanic modifiers.

**How it works:**

Events are defined with absolute UTC start/end dates. Multiple events can overlap. Each event can modify:

| Mechanic | Effect | Example |
|----------|--------|---------|
| shinyEncounterMultiplier | Boost shiny odds | 2x during Valentine's |
| shinyCatchMultiplier | Boost shiny catch rate | 3x during Hearts and Horses |
| classicFriendshipMultiplier | Boost candy earning | 4x during Pokemon Day |
| upgradeUnlockedVouchers | Upgrade voucher tier | REGULAR→PLUS during Winter |
| boostFusions | Enable fusion encounters | Valentine's, Shining Spring |
| luckBoostedSpecies | Boost specific species rates | Year of the Snake (37 species) |
| eventEncounters | Exclusive wild species pool | 20-25 species per event |
| classicWaveRewards | Fixed wave rewards | Charms at wave 8 |
| trainerShinyChance | Trainer shiny rate | 1/5 during April Fools |

**Event cycle:** Events run year-round — Valentine's, Pokemon Day, April Fools, Shining Spring, Pride, Halloween, Winter, etc.

**Koto Relevance:** Medium-High — Timed events create urgency and re-engagement. The multiplier system is clean and extensible.

*(source: `timed-event-manager.ts:1-228`, `data/balance/timed-events.ts:1-462`)*
