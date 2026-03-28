# Gacha & Eggs — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

The gacha system is PokeRogue's primary meta-progression mechanic for acquiring new species. Players spend vouchers to pull eggs from three gacha machines, each with different rate bonuses. Eggs hatch after a set number of battle waves, yielding new Pokemon with potential shiny status, hidden abilities, and egg moves.

The system has multiple pity mechanisms to prevent extreme bad luck: tier pity (forces rare tiers after N pulls), species pity (forces new species after N duplicates), and per-batch guarantees (10-pulls guarantee at least Rare). The math is carefully tuned so ~80% of players hit natural rates before pity kicks in.

## Table of Contents

- [Egg Tiers](#egg-tiers)
- [Gacha Machines](#gacha-machines)
- [Pull Costs (Vouchers)](#pull-costs-vouchers)
- [Tier Roll Probabilities](#tier-roll-probabilities)
- [Pity System](#pity-system)
- [Per-Batch Guarantees](#per-batch-guarantees)
- [Species Selection & Weighting](#species-selection--weighting)
- [Species Pity (Unlock Pity)](#species-pity-unlock-pity)
- [Shiny Rates](#shiny-rates)
- [Variant Tiers](#variant-tiers)
- [Hidden Ability from Eggs](#hidden-ability-from-eggs)
- [Egg Moves](#egg-moves)
- [Hatch Countdown](#hatch-countdown)
- [Manaphy Egg](#manaphy-egg)
- [Legendary Daily Rotation](#legendary-daily-rotation)
- [IV Bonus from Eggs](#iv-bonus-from-eggs)
- [Complete Constants Table](#complete-constants-table)

---

## Egg Tiers

Four tiers determine species pool, hatch time, and rare rates.

| Tier | Hatch Waves | Base Pull Rate |
|------|------------|---------------|
| COMMON | 10 waves | 79.7% |
| RARE | 25 waves | 17.2% |
| EPIC | 50 waves | 2.7% |
| LEGENDARY | 100 waves | 0.4% |

Higher tiers yield rarer species with better egg move rates.

**Koto Relevance:** High — The 4-tier egg system is clean and directly portable.

*(source: `enums/egg-type.ts:1-6`, `data/balance/rates.ts:31-35`)*

---

## Gacha Machines

Three machines, each boosting a different rate:

| Machine | Focus | Shiny Rate | HA Rate | Egg Move Boost | Special |
|---------|-------|-----------|---------|----------------|---------|
| Move | Egg moves | 1/128 | 1/192 | 2-3x better rates | — |
| Legendary | Legendary tier | 1/128 | 1/192 | Normal | +1/256 Legendary rate, daily featured legendary |
| Shiny | Shinies | **1/64** | 1/192 | Normal | 2x shiny rate |

The Legendary machine has a daily rotating featured legendary: if you pull a Legendary-tier egg, there's a 50% chance it becomes the featured species.

**Koto Relevance:** High — Three distinct gacha flavors give players meaningful choice in how they spend vouchers.

*(source: `enums/gacha-types.ts:1-9`, `data/egg.ts:169-177,397-400`)*

---

## Pull Costs (Vouchers)

| Pull Count | Voucher Type | Vouchers Spent |
|-----------|-------------|---------------|
| 1 pull | REGULAR | 1 |
| 10 pulls | REGULAR | 10 |
| 5 pulls | PLUS | 1 |
| 10 pulls | PREMIUM | 1 |
| 25 pulls | GOLDEN | 1 |

Max egg capacity: 99. Cannot pull if eggs + pullCount > 99.

**Koto Relevance:** High — The voucher-to-pull exchange rates create natural progression tiers.

*(source: `ui/handlers/egg-gacha-ui-handler.ts:703-716,728-762`)*

---

## Tier Roll Probabilities

Each egg's tier is rolled on a 256-point scale:

```
roll = random(0, 256)
tierOffset = 1 if Legendary gacha, else 0

if roll >= (52 + offset): COMMON
else if roll >= (8 + offset): RARE
else if roll >= (1 + offset): EPIC
else: LEGENDARY
```

| Tier | Normal Gacha | Legendary Gacha |
|------|-------------|----------------|
| COMMON | 204/256 (79.7%) | 203/256 (79.3%) |
| RARE | 44/256 (17.2%) | 43/256 (16.8%) |
| EPIC | 7/256 (2.7%) | 6/256 (2.3%) |
| LEGENDARY | 1/256 (0.4%) | 2/256 (0.8%) |

**Koto Relevance:** High — These probabilities are the core gacha math. Well-tuned for engagement.

*(source: `data/egg.ts:397-408`, `data/balance/rates.ts:19-22`)*

---

## Pity System

After pulling eggs without hitting a tier, a pity counter forces that tier. Thresholds are set at the ~80th percentile — most players hit naturally before pity fires.

**How it works:**

Three independent counters track consecutive pulls without RARE, EPIC, or LEGENDARY:

```
On each pull:
  for each tier T in {RARE, EPIC, LEGENDARY}:
    if pulled_tier != T: eggPity[T] += 1
    else: eggPity[T] = 0

  if pulled_tier == COMMON:
    if eggPity[LEGENDARY] >= 412: upgrade to LEGENDARY
    else if eggPity[EPIC] >= 59: upgrade to EPIC
    else if eggPity[RARE] >= 9: upgrade to RARE
```

| Tier | Pity Threshold | Meaning |
|------|---------------|---------|
| RARE | 9 | Guaranteed Rare by 10th pull without one |
| EPIC | 59 | Guaranteed Epic by 60th pull without one |
| LEGENDARY | 412 | Guaranteed Legendary by 413th pull without one |

Only upgrades COMMON eggs. Only fires on pulled eggs (not event eggs).

**Koto Relevance:** High — Pity systems are essential for player trust in gacha. These thresholds are well-calibrated.

*(source: `data/egg.ts:561-579`, `data/balance/rates.ts:26-28`)*

---

## Per-Batch Guarantees

Multi-pulls guarantee a minimum tier in the batch.

| Pull Count | Guaranteed Minimum |
|-----------|-------------------|
| 1 | None |
| 5 | None |
| 10 | RARE |
| 25 | EPIC |

If no egg in the batch naturally reached the guaranteed tier, one random COMMON egg is upgraded. Eggs are shuffled after generation so the guaranteed egg isn't always last.

**Koto Relevance:** High — Batch guarantees encourage larger pulls, which feels more rewarding.

*(source: `ui/handlers/egg-gacha-ui-handler.ts:540-549,467-489`)*

---

## Species Selection & Weighting

Within a tier, species are weighted by starter cost. Cheaper species appear more often.

**How it works:**

```
weight = floor(((maxCost - clampedCost) / (maxCost - minCost + 1)) * 1.5 + 1) * 100
```

| Starter Cost | Weight Multiplier | Notes |
|-------------|------------------|-------|
| 1 (cheapest) | 2.0x | Most common |
| 2 | 1.5x | |
| 3, 5, 7, 9 | 1.0x | Standard |
| 4, 6, 8 | 1.75x | Slightly above standard |
| Regional forms | 0.5x | Half weight |

Pre-evolutions and Phione/Manaphy/Eternatus are excluded from the pool.

If the egg is shiny with Rare/Epic variant, species without variant data are filtered out.

**Koto Relevance:** High — Weighted species selection ensures common creatures aren't drowned out by rare ones.

*(source: `data/egg.ts:410-521`)*

---

## Species Pity (Unlock Pity)

After 9 consecutive hatches of already-owned species, the 10th is forced to be a new species.

**How it works:**

Per-tier counter tracks consecutive duplicates:
```
if species already caught or already in egg list:
  unlockPity[tier] = min(unlockPity[tier] + 1, 10)
else:
  unlockPity[tier] = 0

if unlockPity[tier] >= 9:
  filter pool to only uncaught species
```

Resets to 0 on any new species. Only filters if uncaught species exist in the pool.

**Koto Relevance:** Medium — Quality of life that prevents frustrating duplicate streaks.

*(source: `data/egg.ts:461-470,512-518`)*

---

## Shiny Rates

Shiny determination is independent of tier.

| Source | Shiny Rate | Odds |
|--------|-----------|------|
| Move gacha | 1/128 | 0.78% |
| Legendary gacha | 1/128 | 0.78% |
| Shiny gacha | **1/64** | 1.56% |
| Same-species egg | **1/12** | 8.33% |
| Event egg | 1/128 | 0.78% |

Same-species eggs (from starter shop) have dramatically better shiny odds — almost 11x the base rate.

**Koto Relevance:** High — Shiny rates from eggs should be meaningful but not trivial.

*(source: `data/egg.ts:527-541`, `data/balance/rates.ts:38-40`)*

---

## Variant Tiers

Shiny eggs roll a visual variant tier:

| Variant | Chance | Visual |
|---------|--------|--------|
| Standard | 60% (6/10) | Basic alternate colors |
| Rare | 30% (3/10) | Enhanced palette |
| Epic | 10% (1/10) | Most distinct palette |

Non-shiny eggs are always Standard. Species without variant data default to Standard.

**Koto Relevance:** Medium — Variant tiers add collector depth to shinies.

*(source: `data/egg.ts:546-559`, `data/balance/rates.ts:52-53`)*

---

## Hidden Ability from Eggs

| Source | HA Rate | Odds |
|--------|---------|------|
| Normal gacha | 1/192 | 0.52% |
| Same-species egg | **1/8** | 12.5% |

Only applies if the species actually has a hidden ability.

**Koto Relevance:** Medium — HA from eggs is a rare but meaningful unlock.

*(source: `data/egg.ts:261-269`, `data/balance/rates.ts:41,43`)*

---

## Egg Moves

Each egg rolls for one of 4 egg moves (indices 0-2 common, index 3 rare).

**Rare egg move rates (1/x):**

| Tier | Normal Rate | Boosted Rate (Move gacha / same-species) |
|------|-----------|----------------------------------------|
| COMMON | 1/48 | 1/16 |
| RARE | 1/24 | 1/12 |
| EPIC | 1/12 | 1/6 |
| LEGENDARY | 1/6 | 1/3 |

If the rare roll fails, a random common egg move (0-2) is selected.

**Koto Relevance:** Medium — Egg moves add progression depth to individual species.

*(source: `data/egg.ts:369-379`, `data/balance/rates.ts:46-48`)*

---

## Hatch Countdown

Eggs hatch after a set number of battle waves.

| Tier | Waves to Hatch |
|------|---------------|
| COMMON | 10 |
| RARE | 25 |
| EPIC | 50 |
| LEGENDARY | 100 |
| MANAPHY | 50 |

Each battle decrements all eggs' counters by 1. When counter hits 0, the egg hatches (with animation and species reveal).

UI proximity indicators:
- 5 or fewer waves: "Soon"
- 15 or fewer: "Close"
- 50 or fewer: "Not close"
- Over 50: "Long time"

**Koto Relevance:** High — Hatch countdowns tied to battles (not real time) reward active play.

*(source: `data/egg.ts:381-395,316-327`, `phases/egg-lapse-phase.ts:23-25`)*

---

## Manaphy Egg

A special egg type hidden within COMMON pulls.

**How it works:**

```
isManaphy = (eggId % 204 == 0) AND (tier == COMMON)
```

About 1 in 204 COMMON eggs (~0.5%) becomes a Manaphy egg. These hatch into either Phione (87.5%) or Manaphy (12.5%):

```
roll = random(0, 8)
species = (roll == 0) ? MANAPHY : PHIONE
```

Manaphy eggs hatch in 50 waves (same as EPIC) despite being pulled from the COMMON pool.

**Koto Relevance:** High — Hidden rare outcomes within common pulls create exciting surprises.

*(source: `data/egg.ts:227-233,419-427`)*

---

## Legendary Daily Rotation

The Legendary gacha features a daily rotating species.

**How it works:**

```
dayIndex = floor(timestamp / 86400000)  // ms per day
offset = floor(dayIndex / legendaryCount)
index = dayIndex % legendaryCount

shuffle the legendary list using offset as seed
featuredSpecies = shuffledList[index]
```

When a Legendary-tier egg is pulled from the Legendary gacha, 50% chance it becomes the featured species.

The featured species rotates every ~40 days (one full cycle through all legendaries).

**Koto Relevance:** High — Daily rotation creates check-in incentives and FOMO for specific species.

*(source: `data/egg.ts:617-638`, `ui/handlers/egg-gacha-ui-handler.ts:909-917`)*

---

## IV Bonus from Eggs

All egg-hatched Pokemon get an IV boost via a "best of two" system.

**How it works:**

```
baseIVs = normal random IVs from Pokemon creation
secondaryIVs = getIvsFromId(random(0, 4294967295))

for each stat:
  finalIV = max(baseIV, secondaryIV)
```

This effectively gives each IV two rolls and keeps the better one, biasing toward higher values.

**Koto Relevance:** Medium — Subtle but meaningful — egg Pokemon are statistically better than wild catches.

*(source: `data/egg.ts:276-280`)*

---

## Complete Constants Table

All numeric constants used in the gacha/egg system:

| Constant | Value | Context |
|----------|-------|---------|
| EGG_SEED | 1,073,741,824 | RNG seed range |
| Common egg threshold | 52 | Tier roll cutoff |
| Rare egg threshold | 8 | Tier roll cutoff |
| Epic egg threshold | 1 | Tier roll cutoff |
| Legendary Up offset | 1 | Legendary gacha bonus |
| Pity: Rare | 9 pulls | Force Rare |
| Pity: Epic | 59 pulls | Force Epic |
| Pity: Legendary | 412 pulls | Force Legendary |
| Hatch: Common | 10 waves | |
| Hatch: Rare | 25 waves | |
| Hatch: Epic | 50 waves | |
| Hatch: Legendary | 100 waves | |
| Hatch: Manaphy | 50 waves | |
| Shiny: Default | 1/128 | |
| Shiny: Shiny gacha | 1/64 | |
| Shiny: Same-species | 1/12 | |
| HA: Default | 1/192 | |
| HA: Same-species | 1/8 | |
| Manaphy rate | 1/8 | Within Manaphy eggs |
| Rare egg move rates | [1/48, 1/24, 1/12, 1/6] | Per tier |
| Boosted egg move rates | [1/16, 1/12, 1/6, 1/3] | Move gacha / same-species |
| Variant: Rare threshold | 4/10 | |
| Variant: Epic threshold | 1/10 | |
| Max eggs | 99 | Inventory cap |
