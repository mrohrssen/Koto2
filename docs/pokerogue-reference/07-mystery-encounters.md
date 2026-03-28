# Mystery Encounters — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

Mystery encounters are random special events that appear during Classic and Challenge runs. They break the normal battle-boss-shop loop with branching-choice scenarios — trade a Pokemon for rare items, battle a unique boss for berries, take a quiz, gamble on a chest, etc. Each encounter offers 2-4 options with different risk/reward profiles, and many options have requirements (specific Pokemon types, moves, money).

The spawn system uses a pity weight that increases each wave a mystery encounter fails to appear, targeting ~12 encounters per 200-wave Classic run. Four tiers (Common, Great, Ultra, Rogue) control encounter rarity, and biome restrictions ensure encounters feel contextually appropriate.

## Table of Contents

- [Spawn Mechanics](#spawn-mechanics)
- [Tier System](#tier-system)
- [Biome Restrictions](#biome-restrictions)
- [Option & Requirement System](#option--requirement-system)
- [Encounter Catalog](#encounter-catalog)

---

## Spawn Mechanics

Mystery encounters use a rolling weight system with anti-variance correction.

**How it works:**

```
BASE_WEIGHT = 3
MAX_WEIGHT = 256
WEIGHT_INCREMENT_ON_MISS = 3
TARGET_PER_RUN = 12
ANTI_VARIANCE_MODIFIER = 15

Each eligible wave:
  spawnChance = currentWeight / 256

  if spawn succeeds: reset weight to BASE_WEIGHT (3)
  if spawn fails: weight += WEIGHT_INCREMENT_ON_MISS (3)

Anti-variance correction:
  expectedCount = (currentWave / 200) * TARGET_PER_RUN
  adjustment = (expectedCount - actualCount) * ANTI_VARIANCE_MODIFIER / 256
  weight += adjustment
```

If you've been unlucky (fewer encounters than expected), the weight increases faster. If you've been lucky, it slows down. This targets ~1 encounter every 16.7 waves.

**Eligible wave ranges:**

| Mode | Range |
|------|-------|
| Classic | Waves 10-180 |
| Challenge | Waves 10-180 |
| Daily | None |
| Endless | None |

**Koto Relevance:** Medium — The pity-weighted spawn system is a clean design for random event frequency control.

*(source: `constants.ts:15-96`, `game-mode.ts:421-433`)*

---

## Tier System

Four tiers control encounter rarity:

| Tier | Weight | Target Ratio |
|------|--------|-------------|
| COMMON | 66 | ~46% |
| GREAT | 40 | ~31% |
| ULTRA | 19 | ~19% |
| ROGUE | 3 | ~4% |

MASTER tier exists in the enum but is not currently used.

**Koto Relevance:** Medium — The 4-tier distribution with heavily weighted common encounters is well-balanced.

*(source: `enums/mystery-encounter-tier.ts`)*

---

## Biome Restrictions

Encounters are filtered by biome categories:

- **Extreme biomes** (Sea, Volcano, Abyss, Space, etc.): Only encounters designed for harsh environments
- **Non-extreme biomes** (Grass, Forest, Cave, etc.): Most encounters available
- **Civilization biomes** (Town, Metropolis): Human NPC encounters
- **Any-biome encounters** (13 total): Fight or Flight, Dark Deal, Mysterious Chest, Training Session, Delibirdy, Berries Abound, Clowning Around, Weird Dream, Teleporting Hijinks, Bug Type Superfan, Uncommon Breed, Trash to Treasure, A Trainer's Test

**Koto Relevance:** Medium — Biome-gated encounters ensure thematic consistency.

*(source: `data/mystery-encounters/mystery-encounters.ts:37-226`)*

---

## Option & Requirement System

Each encounter presents 2-4 options, each with optional requirements. Options can be: always available, available-or-disabled, or special.

**Scene requirements:** Wave range, party size, money amount, weather, time of day, held items, previous encounter history.

**Pokemon requirements:** Type match, specific species, nature, known move, learnable move, ability, status effect, form change capability.

Requirements can be combined with AND/OR logic.

**Koto Relevance:** High — The requirement framework is very flexible and worth studying for Koto's NPC encounter system.

*(source: `data/mystery-encounters/mystery-encounter-option.ts:26-195`, `mystery-encounter-requirements.ts:180-811`)*

---

## Encounter Catalog

### Common Tier

**Berries Abound** — Battle or race for berries. Speed-check option: your fastest Pokemon vs a random boss. Win = 2-7 berries, lose = half. *(waves 10-180, any biome)*

**Department Store Sale** — Shop with 4 departments: TMs (5 items), Vitamins (3 items), X Items (5 items), Pokeballs (4 items). Weighted random within each. *(waves 10-100)*

**Field Trip** — Quiz: classify a move as Physical, Special, or Status. Correct answer = stat boosters + Rarer Candy. Wrong = consolation EXP. *(waves 10-100)*

**Fiery Fallout** — Double battle vs 2 Volcarona with Sunny weather. They use Fire Spin + Quiver Dance on turn 1, no switching allowed. Reward: Fire-type Attack Booster. *(waves 40-180)*

**Fight or Flight** — Battle a boss with a random +2 stat boost for a tier-scaled item (GREAT→MASTER by wave). Option 2: steal with Thief/Covet move. *(waves 10-180, any biome)*

**Global Trade System** — Wonder Trade (random species) or Legendary Trade (cost-tiered pool). Shiny 1/128, HA 1/64. *(waves 10-180, any biome)*

**Lost at Sea** — Use Surf or Fly (learnable move requirement) to escape safely with EXP. Or wander for 25% HP damage to all. *(waves 10-180)*

**Mysterious Chest** — Open for random outcome: 30% trap (KO highest level Pokemon), 25% Common/Great reward, 30% Ultra reward, 10% Rogue reward, 5% Master reward. *(waves 10-180, any biome)*

**Part Timer** — Work for money or items. Simple reward, no battle. *(waves 10-100, civilization biomes)*

**Shady Vitamin Dealer** — Buy discounted base stat boosters. *(waves 10-180)*

**Teleporting Hijinks** — Use Teleport (learnable) to escape, wander (30% HP damage), or battle to escape. *(waves 10-180, any biome)*

**Uncommon Breed** — Catch a shiny-boosted rare Pokemon. *(waves 10-180, any biome)*

### Great Tier

**Absolute Avarice** — Requires 6+ berries. Battle 3-segment boss Greedent holding all your berries. Win = Reviver Seed per party member. Negotiate or steal alternatives. *(waves 20-180)*

**An Offer You Can't Refuse** — Sell your strongest Pokemon for 10-30x Relic Gold + Shiny Charm. Or extort with Thief/Covet. *(waves 10-180, requires party >= 2)*

**Bug Type Superfan** — Trainer battle scaling with wave (7 difficulty tiers from wave 30 to 160). Reward: tutored bug move. *(waves 10-180, requires Bug type or bug item)*

**Dancing Lessons** — Battle biome-specific Oricorio form (Baile in Volcano, Pom-Pom in Power Plant, etc.) with +1 to 4 stats. Or learn Revelation Dance without fighting. *(waves 10-180)*

**Delibirdy** — Max 4 per run. Trade money for Amulet Coin, berry for Candy Jar, or non-berry item for modifier. Holiday event bonuses. *(waves 10-180, requires money >= 2x wave value)*

**Mysterious Challengers** — Accept a trainer challenge for Common/Great reward. *(waves 10-180, human biomes)*

**Slumbering Snorlax** — Battle boss Snorlax for Rarer Candy, sneak past for EXP, or wake-and-flee. *(waves 20-180, grass/plains)*

### Ultra Tier

**Clowning Around** — Double battle vs Mr. Mime + Blacephalon (random types/ability). Mr. Mime uses Role Play on Blacephalon. Post-battle: ability swap option. Disallowed in single-type challenges. *(waves 80-180)*

**Training Session** — Battle a clone of your own Pokemon (2-5 segments by wave). Win: 2 random IVs boosted (+10 if <10, +5 if 10-20, +3 if >20). Or permanently change nature. *(waves 10-180, requires party >= 2)*

**The Expert Pokemon Breeder** — Battle for perfect-IV Pokemon, trade, or get IV boost item. *(waves 10-180)*

**The Pokemon Salesman** — Buy Pokemon, negotiate, or rob. *(waves 10-180)*

**Trash to Treasure** — Search for Common/Great item, or battle for Rogue item. *(waves 10-180, any biome)*

### Rogue Tier

**A Trainer's Test** — Battle stat trainer (Cheryl/Marley/Mira/Riley/Buck) for 2x Rogue modifiers + Relic Gold + Epic egg. Or decline for party heal + Rare egg. *(waves 100-180)*

**Dark Deal** — Sacrifice a random party member. Spawn legendary boss (tier 6-9, weighted 35/50/10/5%) matching removed Pokemon's types. Win = 5 Rogue Balls. *(waves 30-180, requires party >= 2)*

**The Winstrate Challenge** — 5 consecutive trainer battles (Victor/Victoria/Vito/Vivi/Vicky). Win all = 10x Premium Voucher + Macho Brace (Master tier). Max 1 per run. *(waves 100-180, requires party >= 3)*

**Weird Dream** — Narrative-driven bizarre encounter with unique modifier reward. *(waves 40-180)*

---

**Koto Relevance by design pattern:**
- **Risk/reward gambling** (Mysterious Chest, Dark Deal): High — creates memorable moments
- **Move/type gating** (Lost at Sea, Fight or Flight steal): High — rewards diverse party composition
- **Multi-stage challenges** (Winstrate, Trainer's Test): High — epic encounters within encounters
- **Economy transactions** (Delibirdy, Pokemon Salesman): Medium — money sinks with item rewards
- **Quizzes/minigames** (Field Trip, Fun and Games): Medium — educational potential for Koto's vocab system
