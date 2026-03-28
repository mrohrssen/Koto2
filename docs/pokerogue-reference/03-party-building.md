# Party Building — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

Party building in PokeRogue happens in two phases: pre-run starter selection (spending a point budget on unlocked starters) and mid-run recruitment (catching wild Pokemon, evolution, form changes). The starter system gates access to stronger Pokemon behind a candy economy that rewards repeated play.

Each Pokemon's power is shaped by its species (base stats), IVs (genetic quality, 0-31 per stat), nature (one stat boosted 10%, one reduced 10%), and ability (including hidden abilities and passives). Shinies are cosmetic with minor luck bonuses. The fusion system lets two Pokemon merge into one with averaged stats.

## Table of Contents

- [Starter Selection & Cost Budget](#starter-selection--cost-budget)
- [Candy Economy](#candy-economy)
- [IV System](#iv-system)
- [Nature System](#nature-system)
- [Shiny & Variant System](#shiny--variant-system)
- [Hidden Ability System](#hidden-ability-system)
- [Passive Ability System](#passive-ability-system)
- [Evolution System](#evolution-system)
- [Form Change System](#form-change-system)
- [Learnset Structure](#learnset-structure)
- [Fusion System](#fusion-system)
- [Gender System](#gender-system)
- [Pokedex Tracking](#pokedex-tracking)
- [Mid-Run Catching](#mid-run-catching)

---

## Starter Selection & Cost Budget

At the start of each run, the player picks 1-6 starters from their unlocked roster, spending from a point budget.

**How it works:**

Each species has a fixed cost (1-9). The player's total starter cost must fit within the budget. Higher-cost species are generally stronger (legendaries cost 6-9, common Pokemon cost 1-2).

Starter data includes: species, gender, shiny/variant status, IVs, nature, form, ability index, moveset, and Tera type. All of these are configured before the run starts.

**Key values:**

| Cost | Example Species |
|------|----------------|
| 1 | Weedle, Pidgey, Rattata |
| 2 | Caterpie, Paras, Diglett |
| 3 | Bulbasaur, Charmander, Squirtle |
| 4 | Pikachu, Growlithe, Abra |
| 5 | Shellder, Scyther, Aerodactyl |
| 6 | Articuno, Zapdos, Moltres |
| 7 | Latias, Latios, Heatran |
| 8 | Mewtwo, Lugia, Ho-Oh, Dialga |
| 9 | Kyogre, Groudon, Rayquaza |

**Koto Relevance:** High — The cost-budget starter system is directly portable to Koto's creature selection.

*(source: `data/balance/starters.ts:50-687`, `phases/select-starter-phase.ts:41-129`)*

---

## Candy Economy

Candies are the meta-progression currency. You earn them through battle friendship, then spend them to unlock starters.

**How it works:**

Each battle, participating Pokemon gain friendship:
```
friendshipGain = 3 (base)
friendshipGain = 9 in Classic mode (3 * CLASSIC_CANDY_FRIENDSHIP_MULTIPLIER)
```

When cumulative friendship reaches the species' threshold, you earn 1 candy and the counter resets:

| Starter Cost | Friendship Threshold |
|-------------|---------------------|
| 1 | 25 |
| 2 | 50 |
| 3 | 75 |
| 4 | 100 |
| 5 | 150 |
| 6 | 200 |
| 7 | 300 |
| 8 | 450 |
| 9 | 450 |

**Other friendship sources:**

| Source | Amount |
|--------|--------|
| Battle participation | +3 (base) |
| Rare Candy item | +6 |
| Fainting | -5 |
| Classic mode multiplier | x3 |
| Timed event (e.g., PKMNDAY) | up to x4 |

Max candy per species: 9,999.

**Koto Relevance:** High — The friendship-to-candy loop creates satisfying between-run progression. Directly portable.

*(source: `data/balance/starters.ts:1-48`)*

---

## IV System

Each Pokemon has 6 Individual Values (0-31) that contribute to stat calculation. Higher IVs = stronger stats.

**How it works:**

IVs are encoded in the Pokemon's 32-bit personality ID using 5-bit masks:

| Stat | Bits | Mask |
|------|------|------|
| HP | 29-25 | 0x3e000000 |
| ATK | 24-20 | 0x01f00000 |
| DEF | 19-15 | 0x000f8000 |
| SPATK | 14-10 | 0x00007c00 |
| SPDEF | 9-5 | 0x000003e0 |
| SPD | 4-0 | 0x0000001f |

At level 100, each IV point adds roughly 2 to the final stat value. The difference between 0 IVs and 31 IVs in a stat is about 62 points at level 100.

Eggs get an IV bonus: a second set of IVs is rolled and the max of each pair is kept.

**Koto Relevance:** High — IVs add meaningful variation between creatures of the same species.

*(source: `utils/common.ts:190-199`, `field/pokemon.ts:1590`)*

---

## Nature System

25 natures, each boosting one stat by 10% and reducing another by 10%. 5 neutral natures have no effect.

**How it works:**

```
nature multiplier: 1.1 (boosted stat), 0.9 (reduced stat), 1.0 (neutral)
```

Natures affect ATK, DEF, SPATK, SPDEF, and SPD (never HP). Examples:

| Nature | +10% | -10% |
|--------|------|------|
| Adamant | ATK | SPATK |
| Modest | SPATK | ATK |
| Jolly | SPD | SPATK |
| Timid | SPD | ATK |
| Bold | DEF | ATK |
| Hardy | — | — (neutral) |

**Koto Relevance:** High — Natures add build diversity and are trivial to implement.

*(source: `data/nature.ts:43-118`)*

---

## Shiny & Variant System

Shinies are rare color variants with a small gameplay bonus (luck stat). Shinies come in 3 visual tiers.

**How it works:**

Base shiny chance: 64/65536 = **1 in 1,024**.

If shiny, variant tier is rolled:

| Variant | Chance | Visual |
|---------|--------|--------|
| Standard | 60% (6/10) | Basic alternate colors |
| Rare | 30% (3/10) | Enhanced palette |
| Epic | 10% (1/10) | Most distinct palette |

Shinies grant a `luck` stat bonus: `luck = variant + 1`. Fused shinies add both: `luck = (variant + 1) + (fusionVariant + 1)`.

Shiny Charm modifier: multiplies odds by 2^(1 + stacks). With 1 Shiny Charm: 4x shiny rate.

**Koto Relevance:** Medium — Shinies are a nice prestige system. The tiered variant approach adds collector depth.

*(source: `data/balance/rates.ts:8-9,52-53`, `field/pokemon.ts:3030-3103`)*

---

## Hidden Ability System

Each species can have up to 3 abilities: 2 normal + 1 hidden (often stronger).

**How it works:**

Wild Pokemon hidden ability chance: 256/65536 = **1 in 256** (0.39%).

Trainer Pokemon never have hidden abilities. Eggs from gacha have 1/192 chance; same-species eggs have 1/8 chance.

Ability index 0-1 = normal abilities (50/50 split), index 2 = hidden ability.

**Koto Relevance:** High — Hidden abilities as a rare upgrade layer is a great progression mechanic.

*(source: `data/balance/rates.ts:11-12`, `field/pokemon.ts:3115-3129`)*

---

## Passive Ability System

Separate from the main ability slot, each species can have a passive ability that's always active.

**How it works:**

A mapping defines passives per species and ability index:
```
starterPassiveAbilities[BULBASAUR][0] = GRASSY_SURGE
starterPassiveAbilities[CHARIZARD][0] = BATTLE_BOND
```

Passives are unlocked via the starter system and activate alongside the Pokemon's primary ability.

**Koto Relevance:** High — Passive abilities double the ability design space and add progression depth.

*(source: `data/balance/passives.ts:1-300+`)*

---

## Evolution System

Pokemon evolve into stronger forms when meeting conditions (level, item, friendship, etc.).

**How it works:**

An evolution is defined by: target species, minimum level, optional item, and conditions.

**Condition types:**

| Type | Example |
|------|---------|
| Level | Charmeleon → Charizard at level 36 |
| Friendship | Eevee → Espeon at high friendship + daytime |
| Item | Seadra + Dragon Scale → Kingdra |
| Move | Knows Ancient Power → Mamoswine |
| Biome | Location-specific evolutions |
| Gender | Female-only or male-only |
| Nature | Nature-based branching |
| Time of Day | Dawn/Day/Dusk/Night triggers |

Evolution can be paused by the player. Fusion Pokemon can evolve if either component meets conditions.

**Koto Relevance:** High — Evolution is a core creature RPG mechanic. The condition variety (level + item + context) is worth porting.

*(source: `data/balance/pokemon-evolutions.ts:25-202`)*

---

## Form Change System

Form changes are temporary or permanent transformations triggered by items, moves, abilities, weather, or Tera type.

**Trigger types:**

| Trigger | Example |
|---------|---------|
| Item | Mega Stones → Mega Evolution |
| Move learned | Sacred Sword → Keldeo Resolute Form |
| Weather | Rain → Castform Water Form |
| Active in battle | Enters/leaves battle |
| Tera type | Specific Tera → form change |
| Ability | Having specific ability |
| Post-move | After using a specific move |

Form changes can alter stats, types, and abilities. They can revert if conditions are no longer met.

**Koto Relevance:** Medium-High — Form changes add depth to creature customization.

*(source: `data/pokemon-forms.ts:33-97`, `data/pokemon-forms/form-change-triggers.ts:19-200+`)*

---

## Learnset Structure

Pokemon learn moves at specific levels and can inherit egg moves.

**How it works:**

**Level-up moves:** Stored as `[level, moveId]` pairs. When a Pokemon levels up, any moves at or below the new level become available.

Special markers:
- EVOLVE_MOVE: learned on evolution
- RELEARN_MOVE: available from move tutors

**Egg moves:** Each species has exactly 4 egg moves. Egg move index 3 is the "rare" egg move, harder to obtain from gacha.

Moveset limit: 4 moves per Pokemon. When learning a 5th move, one must be replaced.

**Koto Relevance:** High — Learnsets define combat options and are core to creature progression.

*(source: `data/balance/pokemon-level-moves.ts:1-150+`, `data/balance/egg-moves.ts:1-150+`)*

---

## Fusion System

Two Pokemon can merge into one with averaged stats, combined moves, and a blended appearance.

**How it works:**

```
fusedStat = ceil((primaryBaseStat + fusionBaseStat) / 2)
```

The fused Pokemon keeps the primary's species but gains access to the fusion species' move pool, abilities, and types. Shiny status matches between primary and fusion.

In Spliced Endless mode, all Pokemon are forced fusions.

**Koto Relevance:** High — Fusion is PokeRogue's most distinctive feature and could inspire a similar mechanic in Koto.

*(source: `field/pokemon.ts:3136-3200`)*

---

## Gender System

Gender is determined from the Pokemon's ID against the species' male percentage.

```
genderChance = (pokemonId % 256) * (100 / 256)
if genderChance < malePercent: MALE, else: FEMALE
```

If `malePercent` is null, the species is genderless.

Gender affects some evolution conditions (e.g., female-only evolutions) and form changes.

**Koto Relevance:** Medium — Gender can add variety but has minimal gameplay impact.

*(source: `data/gender.ts:1-26`)*

---

## Pokedex Tracking

The Pokedex tracks caught/seen attributes via a bitmask per species.

**Tracked attributes (DexAttr):**

| Bit | Attribute |
|-----|-----------|
| 1 | Non-shiny caught |
| 2 | Shiny caught |
| 4 | Male caught |
| 8 | Female caught |
| 16 | Default variant |
| 32 | Variant 2 |
| 64 | Variant 3 |
| 128 | Default form |

Used for: unlock conditions, starter availability, achievement tracking, shiny rate bonuses.

**Koto Relevance:** Medium — Dex completion drives long-term engagement.

*(source: `enums/dex-attr.ts:1-13`)*

---

## Mid-Run Catching

Wild Pokemon can be caught during battle to join your party.

**How it works:**

Catching uses the catch rate formula (see Battle doc). Caught Pokemon are added to the party if there's space (max 6). Shiny wild Pokemon have a 2x catch rate multiplier.

Catching counts toward Pokedex completion and can earn candy for the caught species.

**Koto Relevance:** Medium-High — Mid-run recruitment adds tactical flexibility.

*(source: `data/balance/rates.ts:56`, `init/init-catchable-species.ts:13-52`)*
