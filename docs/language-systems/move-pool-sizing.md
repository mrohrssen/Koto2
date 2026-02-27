# Move Pool Sizing: How Many Combat Moves Does the Game Need?

**Date**: 2026-02-26
**Status**: Reference document

## Context

Each combat move is a Japanese verb that players learn through repeated use. This document answers: how many moves do we need at each stage of development, based on language acquisition research and game design constraints?

## Language Acquisition Benchmarks

### JLPT Vocabulary Requirements

| Level | Total Words | Real-world ability |
|---|---|---|
| N5 | ~800 | Survive a tourist trip |
| N4 | ~1,500 | Basic daily conversation |
| N3 | ~3,750 | Read simple articles |
| N2 | ~6,000 | University/work in Japanese |
| N1 | ~10,000 | Read novels, newspapers |

### Text Coverage Thresholds (Nation 2006)

- **95% coverage** (minimum comprehension): ~4,000 word families (written), ~3,000 (spoken)
- **98% coverage** (unassisted reading): ~8,000–9,000 word families
- Japanese requires roughly **12,000 words for 95% text coverage** due to flatter frequency distribution

### Our Vocab Category Data

Across 17 category files (23,412 total entries, JPDB ranks 90–27,000):

| Word Type | % of All | % of Top 5,000 |
|---|---|---|
| Noun | 59.9% | 52.7% |
| Verb | 23.1% | 28.0% |
| Adjective | 7.9% | 8.0% |
| Number/Time | 4.6% | 6.9% |
| Emotion noun | 4.0% | 3.8% |

Japanese is heavily noun-dominated. Verbs are the second biggest chunk and the primary source of combat moves.

### Available Verbs by Frequency Tier

| JPDB Rank Range | JLPT Equivalent | Unique Verbs Available | Cumulative |
|---|---|---|---|
| 500–2,000 | N5–N4 | 240 | 240 |
| 2,000–4,000 | N3 | 421 | 661 |
| 4,000–7,000 | N2 | 606 | 1,267 |
| 7,000–12,000 | N1 | 868 | 2,135 |
| 12,000–20,000 | Beyond N1 | 1,211 | 3,346 |

There is no shortage of verb candidates. The constraint is cognitive, not supply.

## Why Moves ≠ Total Vocabulary

Combat moves are only one of several vocabulary teaching channels in the game:

| Channel | Word Types Taught |
|---|---|
| **Combat moves** | Verbs (the focus of this doc) |
| **Creature names** | Nouns (animals, nature, concepts) |
| **NPC dialogue** | Grammar, particles, everything (i+1 validated) |
| **Door hints** | Contextual phrases |
| **Item names** | Nouns (foods, objects) |
| **Area names** | Location vocabulary |
| **Quiz rooms** | Any word (targeted review) |

Moves carry the **verb** load. Other systems handle the remaining ~70% of vocabulary (nouns, adjectives, grammar, particles).

## The Spaced Repetition Constraint

This is the hard ceiling on move pool size.

**Typical combat session math:**
- ~20 encounters per session
- ~4 moves seen per encounter (2 per side)
- = **80 move exposures per session**

| Pool Size | Sessions Between Seeing a Move | Real Time (2 sessions/week) | Retention? |
|---|---|---|---|
| 150 | ~2 | ~1 week | Strong |
| 300 | ~4 | ~2 weeks | Good |
| 400–500 | ~5–6 | ~2.5–3 weeks | Borderline |
| 800 | ~10 | ~5 weeks | Too infrequent |

Research shows retention drops steeply below weekly review. Creature learnsets provide natural clustering (you see the same creature's moves repeatedly), which helps — but beyond ~500 moves, the per-move exposure rate falls below effective SRS thresholds.

## Comparable Products

| Product | Total Moves/Vocab | Feeling | Dev Maturity |
|---|---|---|---|
| **Pokemon Gen 1** (Red/Blue) | 165 moves | Complete, tight | Launch |
| **Pokemon Gen 3** (Ruby/Sapphire) | 372 moves | Peak "complete" era | Mature |
| **Pokemon Gen 9** (Scarlet/Violet) | 934 moves | Bloated, most moves forgettable | 25+ years |
| **WaniKani** | 6,000+ vocab (not moves) | Full course, 1–2 years | Mature |
| **Duolingo Japanese** | ~3,200 words | Full course | Mature |

Pokemon didn't feel incomplete at 165. It felt fully realized at ~350–400. Beyond that, new moves were novelty, not necessity.

## Creature Identity Constraint

- ~40 creatures × 5 avg learnset size = 200 learnset slots
- With ~50% move overlap between creatures, need **~300–400 unique moves** for every creature to feel distinct
- Beyond 400, new moves don't add creature identity — they pad the pool

## Recommended Growth Path

| Phase | Move Pool | JPDB Range | Milestone |
|---|---|---|---|
| **v1.0 Launch** | 150 | 500–5,000 | Core loop proven |
| **v2.0 Expansion** | 300 | 500–8,000 | Mid/late-game content |
| **v3.0 Endgame** | 400–500 | 500–12,000 | Full late-game, prestige |
| **v4.0+ Seasonal** | 500–600 | 500–15,000 | Only if player demand exists |

### Tier Distribution Within Each Phase

| Move Tier | JPDB Range | Role | v1.0 | v2.0 | v3.0 |
|---|---|---|---|---|---|
| Tier 1 (common) | 500–2,000 | Starter moves, bread-and-butter | 40 | 60 | 80 |
| Tier 2 (intermediate) | 2,000–4,000 | Mid-game power spike | 50 | 80 | 120 |
| Tier 3 (advanced) | 4,000–8,000 | Late-game specialization | 40 | 100 | 160 |
| Tier 4 (rare) | 8,000–12,000 | Prestige/endgame moves | 20 | 60 | 140 |

## Expansion Paths Beyond Pure Verbs

If the game needs more learnable content without inflating the verb move pool:

| Expansion Type | Examples | Word Count | Teaching Channel |
|---|---|---|---|
| **する-verb nouns as moves** | 攻撃する, 防御する, 回復する | +50–100 | Combat (noun+verb) |
| **Adjective passives/buffs** | 強い, 速い, 硬い | +30–50 | Creature abilities |
| **Compound verbs** | 打ち込む, 切り裂く | +50–80 | Advanced prestige moves |

## Key Takeaway

**Target 400–500 as the mature endstate.** This covers JPDB ranks 500–12,000 (through N1 verbs), keeps per-move exposure within SRS retention windows, gives every creature a unique identity, and leaves the remaining ~9,500 words to N1 for other teaching channels. Going past 600 hurts learning more than it helps.

## References

- Nation, I.S.P. (2006). "How Large a Vocabulary Is Needed for Reading and Listening?" *Canadian Modern Language Review*, 63(1), 59–82.
- Kremmel, B. (2023). "Unknown Vocabulary Density and Reading Comprehension." *Language Learning*, 73(4).
- FSRS optimal retention research: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-optimal-retention
