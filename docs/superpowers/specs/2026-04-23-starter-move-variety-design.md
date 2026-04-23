# Starter Move Variety — Design

**Date:** 2026-04-23
**Status:** Draft — pending approval
**Owner:** Claude (Opus 4.7)

## Problem

Of 19 creatures in `data/creatures.json`, **13 open combat with `tataku` (叩く)**. This has two consequences:

1. **Exposure violation.** `叩く` appears as the first attack of ~68% of creatures a player encounters. In a language-learning game built on i+1 comprehensible input, the most-exposed word should not be the same generic verb on most creatures.
2. **Combat repetition.** Every fight opens identically. The variety among creatures (element, archetype, vocabulary) is invisible on turn 1.

Root cause: `tataku` is the only stage-1 neutral damage move with MP ≤ 5. When the `learnset-builder` subskill has no obvious concept-driven verb for a creature, it falls back to `tataku` by default.

## Goals

- Reduce `tataku` starter usage from 13/19 creatures to ≤ 2.
- Give each creature a starter move that fits its concept, element, or archetype.
- Reuse only existing moves from `data/moves.json` — no new move creation.
- Prevent regression via the forge pipeline for future creatures.
- Minimal edits: touch only the level-1 learnset slot, except where that creates a duplicate or regression.

## Non-goals

- No new moves added to `data/moves.json`.
- No changes to creature archetypes, elements, stats, or sprites.
- No wholesale learnset rewrites — later levels stay as-is unless the L1 change creates a duplicate.
- No migration of player save data (no one is currently playing).

## Design

### 1. Starter move reassignment table (13 creatures)

Rule: the new level-1 move must fit the creature's concept thematically, its element (STAB), or its archetype. No single move may appear as a `level: 1` starter for more than 2 creatures.

| Creature | Archetype | Old L1 | New L1 | Element | Category | MP | Power | Rationale |
|---|---|---|---|---|---|---|---|---|
| hi | Fighter | tataku | **honoo** 炎 | fire | damage | 12 | 15 | Fire STAB; "flame" is the creature |
| mizu | Fighter | tataku | **nagasu** 流す | water | damage | 12 | 15 | Water STAB; "to flow/wash" |
| ki | Fighter | tataku | **sasu** 刺す | wood | damage | 12 | 15 | Wood STAB; wooden spike/pierce |
| ishi | Tank/Healer | tataku | **mamoru** 守る | neutral | buff (def +1) | 8 | — | Archetype fit; stone guards |
| tetsu | Tank/Healer | tataku | **tataku** 叩く | neutral | damage | 5 | 10 | Kept — hammer-on-iron is the iconic 叩く context |
| kaze | Mage | tataku | **naku** 泣く | neutral | buff | 10 | — | 風が泣く — wind whistles/cries |
| mushi | Trickster | tataku | **kakureru** 隠れる | earth | buff | 8 | — | Bugs hide (2nd user; cap = 2) |
| hana | Tank/Healer | tataku | **nemuru** 眠る | neutral | heal | 15 | 8 | Flowers close at night |
| tori | Mage | tataku | **tobu** 飛ぶ | neutral | damage | 10 | 15 | Birds fly — iconic |
| sakana | Tank/Healer | tataku | **nomu** 飲む | water | heal | 8 | 25 | Fish drink water; water heal |
| neko | Trickster | tataku | **okoru** 怒る | fire | debuff | 15 | — | Cats hiss/get angry; fire STAB |
| inu | Fighter | tataku | **horu** 掘る | earth | damage | 15 | 20→**15** | Dogs dig; earth STAB (see move rebalance) |
| hineko | Trickster | tataku | **honoo** 炎 | fire | damage | 12 | 15 | Flame-cat (2nd user of honoo; cap = 2) |

**Unchanged creatures (already have thematic starters):** `tsukue→kaku`, `isu→suwaru`, `fukurou→yomu`, `chou→odoru`, `hachi→sasu`, `ari→kakureru`.

**Distribution after change:**
- Distinct starters: 7 → 14.
- `tataku` as starter: 13 → 1 (`tetsu`).
- Moves used as starter for exactly 2 creatures (at cap): `honoo` (hi, hineko), `sasu` (ki, hachi), `kakureru` (mushi, ari).

### 2. Mid-level slot replacements (9 creatures)

Nine of the new starters duplicated a move the creature already learned at a later level. Each duplicate is resolved by replacing the **later** slot with a move that (a) fills an archetype gap, (b) does not duplicate any remaining slot, and (c) preserves thematic fit.

| Creature | Duplicate slot | Replaced with | Why |
|---|---|---|---|
| hi | L7 honoo → | **okoru** (fire debuff) | Fire STAB preserved; adds non-damage tool |
| mizu | L7 nagasu → | **mamoru** (neutral buff) | Fills Fighter's 1-buff slot |
| ishi | L5 mamoru → | **suwaru** (earth heal) | 3rd heal for Tank/Healer; stone sits |
| kaze | L5 naku → | **nemuru** (neutral heal) | Wind lulls to sleep; Mage's heal slot |
| hana | L5 nemuru → | **nomu** (water heal) | Flowers drink; 2nd heal for Tank/Healer |
| tori | L16 tobu → | **nemuru** (neutral heal) | Bird rests; Mage's heal slot |
| sakana | L5 nomu → | **kakureru** (earth buff) | Fish hide in reefs |
| neko | L5 okoru → | **kakureru** (earth buff) | Cats hide — iconic |
| hineko | L10 honoo → | **kesu** (earth debuff) | Fire-cat "extinguishes"; fills Trickster's 2nd debuff slot |

None of these replacements introduces a new duplicate elsewhere in the same creature's learnset (verified against each creature's remaining slots).

### 3. Move rebalances (2 moves)

Two moves are pwr-20 outliers against the tier-1 elemental damage baseline (pwr 15, mp 12). Both become starters under this design; normalizing them fixes the `inu` regression and eliminates the efficiency outlier.

| Move | Before | After | Reason |
|---|---|---|---|
| `tobu` 飛ぶ | pwr 20 / mp 10 | **pwr 15** / mp 10 | Removes tier-1 efficiency outlier; still slightly cheaper MP as a neutral option for Mages |
| `horu` 掘る | pwr 20 / mp 15 | **pwr 15 / mp 12** | Matches tier-1 elemental baseline; resolves `inu` power regression (horu L1 was stronger than nigiru L7 and tobu L12) |

Other creatures that learn `tobu` at later levels (hi L18, mizu L12, ki L12, kaze L16, chou L10, hachi L10, fukurou L22) will see the same −5 power. No creature other than `inu` currently has `horu` in its learnset.

### 4. Learnset-builder skill update

File: `.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/learnset-builder.md`.

Insert a new **Step 0 (Starter move selection)** before the existing Step 1–6:

> **Step 0: Pick the level-1 starter move**
>
> The level-1 move is the move a player encounters most often for this creature. Pick in this priority order:
>
> 1. **Thematic match** — a move whose meaning fits the creature's concept.
> 2. **Element-STAB match** — a damage/buff/debuff move sharing the creature's element.
> 3. **Archetype fit** — Fighter: damage; Mage: damage or buff; Trickster: debuff or hide; Tank/Healer: buff or heal.
>
> **Starter-cap rule:** Read `data/creatures.json` and count how many creatures already have your candidate as their `level: 1` move. If the count is ≥ 2, pick a different move.
>
> **`tataku` rule:** `tataku` may only be picked as a starter if no other candidate fits the thematic, element, or archetype tests.
>
> **Anti-duplication rule:** The level-1 move must not appear at any other level in this creature's learnset. When building the rest of the learnset (Steps 1–6), exclude the level-1 move from the candidate pool.

Update Step 5 (Tier Spread) to say: "Level 1 is reserved for the starter chosen in Step 0" instead of implying L1 is a free tier-1 pick.

### 5. Migration script

File (new): `scripts/migrate-starter-moves.mjs`.

- Load `data/creatures.json` and `data/moves.json`.
- Apply the 13 starter reassignments from a literal table inside the script.
- Apply the 9 mid-level replacements from a literal table inside the script.
- Apply the 2 move rebalances (`tobu`, `horu`) to `data/moves.json`.
- Write both files back (preserving key order and 2-space indent to minimize diff noise).
- Print a summary: for each creature, `old L1 → new L1` and any mid-slot replacement; for moves, before/after stats.

The reassignment/replacement tables are inline in the script, not in separate fixture files. After the run, the script serves as the audit log. Keep it in the repo for reference.

### 6. Invariant tests

File (new): `tests/unit/creatures-starter-distribution.test.mjs`.

Three assertions, run against live `data/creatures.json` + `data/moves.json`:

1. **Starter cap:** no `moveId` appears as `level: 1` for more than 2 creatures.
2. **Anti-duplication:** for every creature, the `level: 1` move does not appear at any other level in that creature's `learnset`.
3. **No backward curve:** for every creature with at least one damage move at `level: 1`, no later-level damage move in the same learnset has strictly lower `power` than the L1 damage move.

These tests catch regressions from manual edits or the forge pipeline.

## Player-visible impact

- **Exposure:** `叩く` exposure on first encounter drops from ~68% to ~5% (1 creature). The pool of distinct starter moves expands from 7 (tataku + kaku, suwaru, yomu, odoru, sasu, kakureru) to 14 — adding `honoo`, `nagasu`, `mamoru`, `naku`, `nemuru`, `tobu`, `nomu`, `okoru`, `horu`, and broadening `sasu` / `kakureru` use.
- **Combat feel:** opening turns vary by creature — fire creatures lead with `honoo`, cats with `okoru`, dogs with `horu`, fish with `nomu`, etc.
- **Balance:** `tobu` and `horu` power nerfs (−5 each) are small; baseMp (45–60) covers all new starter MP costs (max 15).
- **Saves / caches:** learnset data is read from JSON at runtime. No save migration, no sprite version bump.

## Scope summary

- **13** creature `level: 1` reassignments in `data/creatures.json`
- **9** creature mid-level replacements in `data/creatures.json`
- **2** move stat rebalances in `data/moves.json`
- **1** `learnset-builder.md` skill update
- **1** new migration script (`scripts/migrate-starter-moves.mjs`)
- **1** new invariant test file (`tests/unit/creatures-starter-distribution.test.mjs`)

## Out of scope

- Introducing new moves.
- Broader creature rebalance (HP, Attack, Defense, baseMp, archetype).
- Rewriting learnsets beyond the slots listed above.
- Any sprite or animation work.
