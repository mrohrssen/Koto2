# AI & Trainers — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

The AI and trainer system controls all enemy behavior — from random wild Pokemon to gym leaders, Elite Four, and the Champion. Three AI types (Random, Smart Random, Smart) determine how enemies choose moves, with progressively better decision-making. Trainers have configurable party templates, species pools with rarity tiers, and level scaling that follows the same quadratic curve as wild encounters but with strength-based multipliers.

The moveset generation system is particularly sophisticated: it builds weighted move pools from level-up moves, TMs, and egg moves, forces at least one STAB move, scales weights by move power and stat alignment, and caps TM/egg move counts by level. This ensures enemy Pokemon have reasonably competitive movesets without hand-curation.

## Table of Contents

- [AI Types](#ai-types)
- [Move Selection Algorithm](#move-selection-algorithm)
- [Target Selection](#target-selection)
- [Matchup Scoring](#matchup-scoring)
- [Switching Logic](#switching-logic)
- [Trainer Party Level Scaling](#trainer-party-level-scaling)
- [Party Member Strength Tiers](#party-member-strength-tiers)
- [Party Templates](#party-templates)
- [Species Pool & Rarity](#species-pool--rarity)
- [Moveset Generation](#moveset-generation)
- [Trainer Configuration System](#trainer-configuration-system)
- [Gym Leaders](#gym-leaders)
- [Elite Four & Champion](#elite-four--champion)
- [Evil Teams](#evil-teams)
- [Fixed Battle Schedule](#fixed-battle-schedule)
- [Boss HP Segments](#boss-hp-segments)
- [Terastallization AI](#terastallization-ai)
- [Modifier Drop Rates](#modifier-drop-rates)

---

## AI Types

Three AI levels control enemy decision quality.

| AI Type | Behavior |
|---------|----------|
| RANDOM | Pick moves purely at random |
| SMART_RANDOM | 62.5% chance to pick the best move, 37.5% to consider next-best |
| SMART | Score-based selection with diminishing probability down the ranked list |

Most trainer Pokemon use SMART_RANDOM or SMART. Wild Pokemon typically use RANDOM or SMART_RANDOM.

**Koto Relevance:** High — The 3-tier AI system lets you tune difficulty without changing the encounters themselves.

*(source: `enums/ai-type.ts:1-5`)*

---

## Move Selection Algorithm

The core decision loop for enemy Pokemon.

**How it works:**

1. Check for queued move (from multi-turn moves); if usable, return it
2. Filter to moves with PP > 0 and not blocked by status
3. If only 1 move available, use it
4. Check Encore tag forcing a specific move
5. Based on AI type, score and select:

**Move scoring formula:**
```
For each move against each valid target:
  score = getUserBenefitScore(move) + getTargetBenefitScore(move) * (ally ? -1 : 1)

  If attacking opponent:
    score *= typeEffectiveness * (STAB ? 1.5 : 1.0)
  If attacking ally:
    score /= typeEffectiveness / (STAB ? 1.5 : 1.0)

  moveScore = max(targetScores) across all valid targets
```

**SMART_RANDOM selection:**
Sort moves by score descending. With 5/8 probability take the best; with 3/8 advance to next-best (repeat).

**SMART selection:**
Sort by score. For each step down the list: `probability = min(nextScore / currentScore, 1) * 50`. If random(100) < probability, advance; else use current.

This means the SMART AI strongly prefers the best move but occasionally uses second-best when scores are close.

**Koto Relevance:** High — The benefit-score system with STAB/effectiveness weighting is directly applicable to Koto's element system.

*(source: `field/pokemon.ts:6645-6878`)*

---

## Target Selection

For single-target moves, the AI evaluates all valid targets and selects by weighted score.

**How it works:**

1. Calculate benefit score for each potential target
2. Multiply ally scores by -1 (prefer helping allies less)
3. Sort by score descending
4. Remove targets with score < 50% of max
5. Select by weighted random from remaining

**Koto Relevance:** Medium — Relevant for double battles or multi-target scenarios.

*(source: `field/pokemon.ts:6885-6964`)*

---

## Matchup Scoring

Used by trainers to decide whether to switch Pokemon.

**How it works:**

```
defScore = 1 / max(effectiveness_vs_type1, 0.25)
  If dual-typed: defScore /= max(effectiveness_vs_type2, 0.25)
  Capped at 4.0

For each damaging move:
  moveScore = effectiveness * (STAB ? 1.5 : 1.0)
atkScore = average(moveScores)

hpDiffRatio = this_hp% + (1 - opponent_hp%)
  If HP <= 20% and not faster: hpDiffRatio *= 0.85
  If faster: hpDiffRatio *= 1.25
  If HP 20-40%: hpDiffRatio *= 0.5

finalScore = (atkScore + defScore) * min(hpDiffRatio, 1.0)
```

Typical range: 0-16. Considers type matchup, offensive coverage, HP remaining, and speed advantage.

**Koto Relevance:** High — Matchup scoring drives switching behavior, making trainer battles feel strategic.

*(source: `field/pokemon.ts:2666-2749`)*

---

## Switching Logic

Trainers evaluate whether to switch their active Pokemon each turn.

**How it works:**

1. Get matchup scores for all bench Pokemon against player's field
2. Find best bench score
3. Compare against current active score with threshold and switch counter

```
switchMultiplier = 1 - (counter ? 0.1^(1/counter) : 0)

Boss trainers: need bench score >= active * 2.0
Regular trainers: need bench score >= active * 3.0

After switch: counter++
After move selection: counter = max(counter - 1, 0)
```

The switch counter creates exponential resistance to repeated switching:
- After 1 switch: ~68% effectiveness on next switch attempt
- After 3 switches: ~89%
- After 10 switches: ~99% (almost impossible to switch again)

This prevents the AI from switch-looping.

**Koto Relevance:** High — The counter-decay system prevents degenerate AI switching while still allowing smart plays.

*(source: `phases/enemy-command-phase.ts:41-88`, `field/trainer.ts:552-596`)*

---

## Trainer Party Level Scaling

Enemy trainer levels follow the same quadratic formula as wild Pokemon, modified by party member strength.

**How it works:**

```
baseLevel = 1 + (difficultyWave / 2) + (difficultyWave / 25)^2
```

Then per party member:

| Strength | Level Multiplier | Level Offset |
|----------|-----------------|-------------|
| WEAKER | 0.95 | Scales down with wave |
| WEAK | 1.00 | Scales down |
| AVERAGE | 1.10 | None |
| STRONG | 1.20 | None |
| STRONGER | 1.25 | None |

Sub-STRONG members get a progressive catch-up: `multiplier += 0.025 * floor(wave / 25)`, capped at 1.20.

Level offset for sub-STRONG: `offset = -floor((wave / 50) * (STRONG - strength))`.

**Koto Relevance:** High — The strength-tier system creates natural difficulty variance within a single trainer's team.

*(source: `field/trainer.ts:263-309`)*

---

## Party Member Strength Tiers

| Tier | Multiplier | Purpose |
|------|-----------|---------|
| WEAKER | 0.95x | Filler/tutorial |
| WEAK | 1.00x | Standard members |
| AVERAGE | 1.10x | Mid-tier |
| STRONG | 1.20x | Ace Pokemon |
| STRONGER | 1.25x | Signature Pokemon |

*(source: `enums/party-member-strength.ts:1-8`)*

---

## Party Templates

Templates define how many Pokemon a trainer has and at what strength.

**Key templates:**

| Template | Composition | Total |
|----------|-------------|-------|
| TWO_AVG | 2x AVERAGE | 2 |
| GYM_LEADER_1 | 1 AVG + 1 STRONG | 2 |
| GYM_LEADER_3 | 2 AVG + 1 STRONG + 1 STRONGER | 4 |
| GYM_LEADER_5 | 3 AVG + 2 STRONG + 1 STRONGER | 6 |
| ELITE_FOUR | 1 AVG + 3 STRONG + 1 STRONGER + 1 AVG | 6 |
| CHAMPION | 4 STRONG + 2 STRONGER | 6 |
| RIVAL_5 | 1 STRONG + 1 AVG + 3 AVG + 1 STRONG | 6 |
| EVIL_LEADER | 1 STRONG + 2 AVG + 2 STRONG + 1 STRONGER | 6 |

Gym leader templates scale dynamically with wave:

| Wave Range | Template | Party Size |
|-----------|----------|-----------|
| 1-20 | GYM_LEADER_1 | 2 |
| 21-30 | GYM_LEADER_2 | 3 |
| 31-60 | GYM_LEADER_3 | 4 |
| 61-90 | GYM_LEADER_4 | 5 |
| 91+ | GYM_LEADER_5 | 6 |

**Koto Relevance:** High — Templates are an elegant way to define difficulty without specifying exact Pokemon.

*(source: `data/trainers/trainer-party-template.ts:1-313`)*

---

## Species Pool & Rarity

Trainer Pokemon are selected from rarity-tiered pools (same tiers as biome pools).

**Rarity distribution (512-point scale):**

| Tier | Probability |
|------|------------|
| Common | 59.6% |
| Uncommon | 24.2% |
| Rare | 5.1% |
| Super Rare | 1.0% |
| Ultra Rare | 0.2% |

If the selected tier's pool is empty, it downgrades to the next tier.

**Specialty type enforcement:** Trainers with a specialty type (e.g., Fire gym leader) reroll up to 10 times to match the type. Type-balanced templates prevent duplicate types in a party.

**Duplicate prevention:** Species already in the party or in the trainer's signature list are rerolled.

**Koto Relevance:** High — Rarity pools with specialty filtering is exactly how Koto's NPC teams should work.

*(source: `field/trainer.ts:446-529`)*

---

## Moveset Generation

The AI moveset generator builds competitive movesets from weighted pools.

**Five-step process:**

1. **Build pools:** Level-up moves weighted by learn level (+20 base), TMs unlocked by level (25/40/55), egg moves at level 60+
2. **Filter:** Remove unimplemented moves, self-KO moves (bosses), OHKO moves (trainers)
3. **Trainer adjustments:** Self-KO x0.5, stat buff moves x1.25, charging moves x0.7
4. **Power scaling:** Weight by move power relative to max (90 cap). Penalize moves that use the weaker offensive stat
5. **Weight exponentiation:** `finalWeight = weight^1.6` (or `^2.0` for bosses)

Then: force one STAB move, fill remaining slots with weighted selection avoiding duplicate types.

**TM caps by level:**

| Level | Max TMs |
|-------|---------|
| <25 | 0 |
| 25-40 | 1 |
| 41-70 | 2 |
| 71-100 | 3 |
| 101+ | 4 |

**Egg move caps:**

| Level | Max Egg Moves |
|-------|-------------|
| <80 | 0 |
| 80-120 | 1 |
| 121-160 | 2 |
| 161-200 | 3 |
| 201+ | 4 |

**Koto Relevance:** Critical — Automated moveset generation eliminates hand-curation. The STAB forcing + power weighting produces good movesets reliably.

*(source: `ai/ai-moveset-gen.ts:1-765`, `data/balance/moveset-generation.ts:1-246`)*

---

## Trainer Configuration System

All trainer behavior is defined in `TrainerConfig` objects with these key properties:

| Property | Purpose |
|----------|---------|
| trainerType | Trainer class (Youngster, Gym Leader, etc.) |
| isBoss | Boss mechanics enabled |
| specialtyType | Type specialization (Fire, Water, etc.) |
| moneyMultiplier | Reward scaling |
| partyTemplates | Available party formations |
| partyMemberFuncs | Slot-specific Pokemon generators |
| speciesPools | Rarity-based species pools |
| speciesFilter | BST/type filtering |

Specialized init methods: `initForGymLeader()`, `initForEliteFour()`, `initForChampion()`.

**Koto Relevance:** High — A central config object per trainer type is clean and maintainable.

*(source: `data/trainers/trainer-config.ts:68-948`)*

---

## Gym Leaders

Gym leaders use dynamic party templates (scaling with wave), specialty types, signature species, and Terastallization.

| Property | Value |
|----------|-------|
| Money multiplier | 2.5x |
| Boss status | Yes |
| Static party | Yes |
| Tera | After wave 100 (1 Pokemon) |
| Signature species | Filled in reverse party slots |

Paldean gym leaders always have Tera regardless of wave.

**Koto Relevance:** High — The wave-scaling gym leader template is directly portable to Koto's NPC bosses.

*(source: `data/trainers/trainer-config.ts:663-706`)*

---

## Elite Four & Champion

**Elite Four:**
- Party template: 1 AVG + 3 STRONG + 1 STRONGER + 1 AVG (6 total)
- Species filter: BST >= 460
- Money multiplier: 3.25x
- Tera: 1 Pokemon

**Champion:**
- Party template: 4 STRONG + 2 STRONGER (6 total)
- No BST filter (already strongest species)
- Money multiplier: **10x** (highest in game)

**Koto Relevance:** High — The escalating multipliers (Gym 2.5x → E4 3.25x → Champ 10x) create satisfying progression.

*(source: `data/trainers/trainer-config.ts:716-790`)*

---

## Evil Teams

Evil grunts scale with wave:

| Wave Range | Template | Size |
|-----------|----------|------|
| 1-35 | TWO_AVG | 2 |
| 35-62 | THREE_AVG | 3 |
| 62-64 | TWO_AVG_ONE_STRONG | 3 |
| 64+ | GYM_LEADER_5 | 6 |

Evil admins use the RIVAL_5 template (6 members, boss status, specialty type). Evil leaders use EVIL_LEADER (6 members, signature species).

10 evil team types exist (one per game generation), randomly selected for each run.

**Koto Relevance:** Medium — Evil team scaling shows how to ramp generic enemy difficulty.

*(source: `data/trainers/trainer-party-template.ts:254-269`)*

---

## Fixed Battle Schedule

See [The Run doc](01-the-run.md#fixed-battle-schedule-classic-mode) for the complete wave-by-wave schedule (waves 5, 8, 25, 35, 55, 62-66, 95, 112-115, 145, 164-165, 182-190, 195).

Rival battles have guaranteed modifier tier rewards that escalate:
- Rival 2: ULTRA + GREAT + GREAT
- Rival 3: ULTRA + ULTRA + GREAT + GREAT
- Rival 4: ULTRA x4

**Koto Relevance:** High — Fixed battles at story beats create memorable pacing.

*(source: `data/trainers/fixed-battle-configs.ts:1-250+`)*

---

## Boss HP Segments

Boss Pokemon divide their HP into segments. Clearing each segment triggers a stat boost.

**How it works:**

When a segment is cleared:
- Select a random non-maxed stat, weighted by base stat value
- Boost by +1 stage (or +2 for the last segment on 3+ segment bosses)

Segment count scales with BST and wave. Double battles reduce segments proportionally.

**Koto Relevance:** Medium — HP segments make boss fights feel epic. The stat-boost-on-break mechanic adds drama.

*(source: `field/pokemon.ts:6982-7115`)*

---

## Terastallization AI

Trainers can force specific Pokemon to Terastallize on turn 1.

**How it works:**

`instantTeras` is an array of party slot indices. When an enemy Pokemon enters and its slot is in the array, it Terastallizes immediately (before move selection). Can be conditional.

Tera type defaults to the trainer's specialty type.

**Koto Relevance:** Medium — Instant Tera creates a power spike at battle start that players must react to.

*(source: `data/trainers/trainer-config.ts:68-123`, `phases/enemy-command-phase.ts:93-110`)*

---

## Modifier Drop Rates

Weaker party members drop modifiers more frequently.

| Strength | Drop Multiplier |
|----------|----------------|
| WEAKER | 75% |
| WEAK | 67.5% |
| AVERAGE | 56.25% |
| STRONG | 45% |
| STRONGER | 37.5% |

This creates an incentive to fight through the whole team rather than just beating the ace.

**Koto Relevance:** Medium — Inverse strength/drop-rate relationship rewards full engagement with trainer battles.

*(source: `field/trainer.ts:626-642`)*
