# Items & Modifiers — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

PokeRogue's item system uses "modifiers" — persistent buffs and consumable items that define each run's power curve. After every boss wave (every 10th), the player picks from randomly-rolled modifiers in a shop. Items are tiered (Common through Master), with luck and wave progression shifting the odds toward better items over time.

The modifier system is where most of PokeRogue's build variety comes from. Two runs with the same starters can play completely differently based on which items drop. The shop reroll mechanic adds a money-sink decision point, and the Lock Capsule lets you fish for specific items within a tier.

## Table of Contents

- [Tier System & Roll Probabilities](#tier-system--roll-probabilities)
- [Luck-Based Tier Upgrades](#luck-based-tier-upgrades)
- [Items Per Wave](#items-per-wave)
- [Reroll Mechanics](#reroll-mechanics)
- [Stacking Rules](#stacking-rules)
- [Item Pool Composition](#item-pool-composition)
- [Enemy Buff Scaling](#enemy-buff-scaling)
- [Shop Mechanics](#shop-mechanics)
- [Key Modifier Types](#key-modifier-types)
- [Healing & Revival Items](#healing--revival-items)
- [Lock Capsule](#lock-capsule)

---

## Tier System & Roll Probabilities

Six tiers determine item rarity. Base roll uses a 1024-point scale.

**How it works:**

```
tierValue = random(0, 1024)
```

| Tier | Range | Probability |
|------|-------|------------|
| COMMON | 256-1023 | 75.0% |
| GREAT | 61-255 | 19.0% |
| ULTRA | 13-60 | 4.7% |
| ROGUE | 1-12 | 1.2% |
| MASTER | 0 | 0.1% |
| LUXURY | — | Special (UI only) |

**Koto Relevance:** High — The 5-tier system with these probability breakpoints is well-tuned and directly portable.

*(source: `modifier/modifier-type.ts:2352,2809-2819`, `enums/modifier-tier.ts`)*

---

## Luck-Based Tier Upgrades

After the base tier roll, party luck can upgrade items to higher tiers.

**How it works:**

Luck value: sum of all party members' luck stats (0-14 range, clamped). Daily runs use a random value 0-14.

```
upgradeOdds = floor(128 / ((luckValue + 4) / 4))

For each potential upgrade:
  if random(0, upgradeOdds) < 4: tier += 1
  (repeat — multiple upgrades possible)
```

With max luck (14), `upgradeOdds = floor(128 / 4.5) = 28`, giving a ~14% chance per upgrade step. With zero luck, `upgradeOdds = 128`, giving ~3% per step.

If the upgraded tier has no items in the pool, it steps back down until valid.

**Koto Relevance:** High — Luck-based upgrades reward shiny/rare Pokemon collection with tangible gameplay benefits.

*(source: `modifier/modifier-type.ts:2798-2827`)*

---

## Items Per Wave

The default reward count is **3 items** per modifier selection phase (after boss waves).

This can be increased by:
- `ExtraModifierModifier`: permanent +1 per stack
- `TempExtraModifierModifier`: temporary +1 for current phase

**Koto Relevance:** High — 3 choices per shop visit is a sweet spot for decision-making.

*(source: `phases/select-modifier-phase.ts:375-395`)*

---

## Reroll Mechanics

Players can spend money to reroll the item selection.

**How it works:**

Base reroll cost: **250 gold** (without tier lock).

Reroll cost scales with wave and exponentially with reroll count:
```
cost = ceil(waveIndex / 10) * baseCost * 2^rerollCount * customMultiplier
```

| Reroll # | Cost at Wave 50 | Cost at Wave 100 |
|----------|----------------|-----------------|
| 1st | 1,250 | 2,500 |
| 2nd | 2,500 | 5,000 |
| 3rd | 5,000 | 10,000 |

**Tier-locked rerolls** (with Lock Capsule) cost the sum of per-tier prices instead:

| Tier | Lock Cost |
|------|-----------|
| COMMON | 50 |
| GREAT | 125 |
| ULTRA | 300 |
| ROGUE | 750 |
| MASTER | 2,000 |

**Koto Relevance:** High — Exponential reroll cost is an elegant money sink that prevents infinite fishing.

*(source: `phases/select-modifier-phase.ts:417-451`)*

---

## Stacking Rules

Most modifiers can stack. Each type has a max stack count.

**Key stacking limits:**

| Modifier | Max Stacks | Stacking Type |
|----------|-----------|---------------|
| EXP Booster (25%) | 99 | Additive: exp * (1 + stacks * 0.25) |
| EXP Booster (60%) | 30 | Additive |
| EXP Booster (100%) | 10 | Additive |
| Money Multiplier | 5 | Additive: money * (1 + stacks * 0.2) |
| Base Stat Booster (vitamins) | 10 per Pokemon | Additive: stat * (1 + stacks * 0.1) |
| Berry Preservation | 3 | Chance-based |
| Enemy Damage Booster | 999 | Multiplicative: 1.05^stacks |
| Enemy Damage Reducer | 99 (999 after wave 2000) | Multiplicative: 0.975^stacks |

**Stacking types:**
- **Additive:** `value * (1 + stacks * multiplier)` — most player items
- **Multiplicative:** `value * multiplier^stacks` — enemy scaling, shiny charm
- Items that hit max stacks are removed from the reward pool

**Koto Relevance:** High — Stacking rules control power creep. The additive vs multiplicative distinction matters a lot for balance.

*(source: `modifier/modifier.ts:183-236,737-756,2481,2977,3002,3425`)*

---

## Item Pool Composition

Each tier has a pool of possible items, weighted by party state. Items with unmet conditions or max stacks are filtered out.

**COMMON tier highlights:**

| Item | Weight | Effect |
|------|--------|--------|
| Pokeball | 6 | Catch tool |
| Rare Candy | 2 | Level +1 |
| Potion | 0-9 (by damaged count) | Heal 20 HP / 10% |
| Berry | 2 | Random held berry |
| Temp Stat Booster | 4 | +1 stat for 5 battles |
| TM (Common) | 2 | Teach move |

**GREAT tier highlights:**

| Item | Weight | Effect |
|------|--------|--------|
| Great Ball | 6 | 1.5x catch rate |
| Revive | 0-27 (by fainted count) | Restore 50% HP |
| Evolution Item | scales with wave | Enable evolution |
| Base Stat Booster | 3 | +10% to one base stat |
| DNA Splicers | conditional | Fuse two Pokemon |

**ULTRA tier highlights:**

| Item | Weight | Effect |
|------|--------|--------|
| Ultra Ball | 15 | 2x catch rate |
| Mint | 4 | Change nature |
| Eviolite | 10 | +1.5x DEF/SPDEF if unevolved |
| Attack Type Booster | 9 | +1.5x damage for one type |
| EXP Charm | 8 | +25% EXP |
| EXP Share | 10 | Share EXP to whole party |

**ROGUE tier highlights:**

| Item | Weight | Effect |
|------|--------|--------|
| Rogue Ball | 16 | 3x catch rate |
| Leftovers | 3 | Heal 12.5% HP/turn |
| Shell Bell | 3 | Heal 25% of damage dealt |
| Scope Lens | 4 | +1.5x crit rate |
| Soul Dew | 7 | SpA/SpD x1.2 |
| Super EXP Charm | 8 | +60% EXP |
| Mega Bracelet | scales with wave | Mega Evolution access |

**MASTER tier highlights:**

| Item | Weight | Effect |
|------|--------|--------|
| Master Ball | 24 | Guaranteed catch |
| Shiny Charm | 14 | Shiny rate x2^(1+stacks) |
| Healing Charm | 18 | +30% healing per stack |
| Multi Lens | 18 | +1 hit to multi-hit moves |
| DNA Splicers | 24 | Fuse Pokemon |

**Koto Relevance:** High — The tiered item pool with conditional weights is a very clean design.

*(source: `modifier/init-modifier-pools.ts:64-653`)*

---

## Enemy Buff Scaling

Enemy Pokemon get stronger each wave via stacking buff modifiers.

**How it works:**

Buff tier by wave milestone:

| Wave | Tier | Initial Stacks |
|------|------|---------------|
| Every wave | COMMON | 1 |
| Every 250 | GREAT | 3 |
| Every 1000 | ULTRA | 5 |

Buff count per wave: `ceil(wave / 250)` — increases by 1 every 250 waves.

**Enemy buff types:**

| Buff | Effect | Rate |
|------|--------|------|
| Damage Booster | x1.05 per stack (multiplicative) | Common |
| Damage Reducer | x0.975 per stack (multiplicative) | Common |
| Attack Poison/Paralyze/Burn | 2.5% chance on hit | Common |
| Status Heal | Chance to cure status/turn | Common |
| Endure | 2% survive at 1 HP | Common |
| Fusion | 1% chance enemy is fused | Common |
| Heal (Ultra only) | 2% max HP/turn per stack | Ultra (wave 1000+) |

**Koto Relevance:** High — Enemy scaling via invisible buffs is essential for infinite/endless modes.

*(source: `phases/add-enemy-buff-modifier-phase.ts:14-28`, `modifier/init-modifier-pools.ts:698-741`)*

---

## Shop Mechanics

Non-boss waves have a healing shop with wave-scaled inventory.

**How it works:**

Shop items unlock as waves progress:

| Wave Range | Available Items |
|-----------|----------------|
| 1-29 | Potion, Ether, Revive |
| 30-59 | + Super Potion, Full Heal |
| 60-89 | + Elixir, Max Ether |
| 90-119 | + Hyper Potion, Max Revive, Memory Mushroom |
| 120-149 | + Max Potion, Max Elixir |
| 150-179 | + Full Restore |
| 180+ | + Sacred Ash |

Item count formula: `ceil((wave + 10) / 30)`.

Prices scale with wave: `baseCost * (1 + waveIndex / 10)`.

**Koto Relevance:** Medium — Wave-gated shop inventory is a clean way to pace healing access.

*(source: `modifier/modifier-type.ts:2629-2669`)*

---

## Key Modifier Types

**Persistent modifiers** (last the whole run):

| Type | Effect | Max Stacks |
|------|--------|-----------|
| Money Multiplier | +20% money per stack | 5 |
| EXP Share | Share EXP to non-participants | 5 |
| EXP Balance | Redistribute EXP to underleveled | 4 |
| Map Modifier | Choose biome path | 1 |
| Shiny Charm | Multiply shiny odds | 4 |
| Healing Charm | +30% healing | 5 |

**Held items** (per-Pokemon):

| Type | Effect | Max/Pokemon |
|------|--------|-------------|
| Leftovers | Heal 12.5% HP/turn | 1 |
| Shell Bell | Heal 25% damage dealt | 1 |
| Focus Band | 10% survive at 1 HP | 1 |
| King's Rock | 30% flinch | 1 |
| Wide Lens | +5% accuracy | 1 |
| Quick Claw | +1.5x speed | 1 |
| Lucky Egg | +40% EXP | 99 |

**Lapsing modifiers** (expire after N battles):

| Type | Duration | Effect |
|------|----------|--------|
| Temp Stat Booster | 5 battles | +1 to random stat |
| Dire Hit | 5 battles | +1 crit stage |
| Lure / Super Lure / Max Lure | 10/15/30 battles | Double battle chance |
| Reviver Seed | 10 battles | Auto-revive at 25% HP |

**Koto Relevance:** High — The three modifier categories (persistent, held, lapsing) create layered build decisions.

*(source: `modifier/modifier.ts:139-806`)*

---

## Healing & Revival Items

**Healing items:**

| Item | Heal Amount |
|------|------------|
| Potion | 20 HP or 10% |
| Super Potion | 50 HP or 25% |
| Hyper Potion | 80% |
| Max Potion | 100% |
| Full Restore | 100% + cure status |

**Revival items:**

| Item | Effect |
|------|--------|
| Revive | Restore fainted to 50% HP |
| Max Revive | Restore fainted to 100% HP |
| Sacred Ash | Revive all fainted (full HP) |
| Reviver Seed (held) | Auto-revive at 25% HP once |

Healing Charm modifier: increases all healing by `(1 + stacks * 0.1)`.

**Koto Relevance:** Medium — Standard healing tiers. The auto-revive held item is a nice design.

*(source: `modifier/modifier-type.ts:462-522`, `modifier/modifier.ts:2413-2445`)*

---

## Lock Capsule

A Rogue-tier item that enables tier-locking during rerolls.

**How it works:**

When Lock Capsule is held, rerolling the shop keeps the same tiers but changes which items appear within those tiers. This lets you fish for a specific item within a known tier.

The tradeoff: tier-locked rerolls cost the sum of each locked tier's price (potentially much more than the base 250 gold).

**Koto Relevance:** Medium — Adds strategic depth to the reroll system for advanced players.

*(source: `phases/select-modifier-phase.ts:246-260`)*
