# PokeRogue Mechanics Reference — Design Spec

> **Date:** 2026-03-28
> **Source repo:** `/home/ubuntu/Pokerogue` (commit `505bcff2452`)
> **Purpose:** Extract every game mechanic from PokeRogue into human-readable reference docs for adapting into Koto

## Goal

Create 8 self-contained reference documents covering every PokeRogue game mechanic — formulas, constants, progression curves, reward tables, and system interactions. These docs serve two audiences:

1. **Humans** designing Koto features — reads like a game design wiki, not a code dump
2. **Claude** implementing those features — has exact formulas and source citations for faithful adaptation

## Output

```
docs/pokerogue-reference/
  01-the-run.md
  02-battle.md
  03-party-building.md
  04-items-and-modifiers.md
  05-economy-and-progression.md
  06-gacha-and-eggs.md
  07-mystery-encounters.md
  08-ai-and-trainers.md
```

## Writing Style

- **Lead with plain English.** Every mechanic starts with a 1-2 sentence explanation of what it does and why it matters, before any formula.
- **Formulas in math notation.** Write `damage = ((2 * level / 5 + 2) * power * atk / def) / 50 + 2` not TypeScript.
- **Tables for constants.** Stat multipliers, tier breakpoints, catch rates — all in markdown tables.
- **Source citations in parentheses** at the end of sections, not inline. e.g., *(source: `field/pokemon.ts:1234`)*
- **Koto Relevance tag** on each mechanic: High / Medium / Low with a brief note.
- **No jargon without definition.** If a term is PokeRogue-specific, define it on first use.

## Document Template

```markdown
# [Theme] — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview
[2-3 paragraph summary of this system — what it does, how it fits into the game loop]

## Table of Contents

## [Mechanic Name]

[Plain English: what this does and why it matters]

**How it works:**
[Step-by-step logic or formula in readable notation]

**Key values:**
| Parameter | Value | Notes |
|-----------|-------|-------|
| ...       | ...   | ...   |

**Interactions:** [How this connects to other systems]

**Koto Relevance:** [High/Medium/Low] — [brief adaptation note]

*(source: `path/file.ts:lines`)*
```

## Theme Assignments

### 1. The Run
What is a run? Wave structure, biome progression, boss waves, milestones, win conditions, game modes (classic/endless/daily/challenge), biome ecosystem (species pools, transitions), EXP curves, level caps.

**Key files:**
- `src/game-mode.ts` — game mode definitions and rules
- `src/battle-scene.ts` — main scene orchestration
- `src/battle.ts` — battle setup and wave management
- `src/starting-wave.ts` — starting wave config
- `src/data/challenge.ts` — challenge mode rules
- `src/data/exp.ts` — EXP growth curves
- `src/data/balance/biomes/*.ts` — all 30 biome definitions
- `src/init/init-biomes.ts`, `init-biome-depths.ts` — biome initialization
- `src/enums/fixed-boss-waves.ts`, `game-modes.ts`, `biome-id.ts`
- `src/field/arena.ts` — arena mechanics
- Phases: `encounter-phase.ts`, `new-battle-phase.ts`, `select-biome-phase.ts`, `switch-biome-phase.ts`, `game-over-phase.ts`, `end-card-phase.ts`, `level-cap-phase.ts`, `exp-phase.ts`, `party-exp-phase.ts`

### 2. Battle
The complete combat system: damage formula, type effectiveness, stat stages, speed/turn order, crits, accuracy/evasion, multi-hit, priority brackets, double battles, status effects, weather, terrain, arena tags (hazards, screens), ability triggers, move effects and flags, berries, catching (pokeball types, catch rate formula), move learning, Tera/Mega/form changes in battle.

**Key files:**
- `src/field/pokemon.ts` — Pokemon class, stat calc, damage calc
- `src/utils/damage.ts` — damage utilities
- `src/utils/speed-order.ts`, `speed-order-generator.ts` — speed/turn order
- `src/data/moves/move.ts` — all move definitions and effect attributes
- `src/data/moves/move-utils.ts`, `move-condition.ts`, `apply-attrs.ts`
- `src/data/type.ts` — type effectiveness chart
- `src/data/status-effect.ts` — status conditions
- `src/data/battler-tags.ts` — battler tags (confusion, flinch, etc.)
- `src/data/weather.ts`, `data/terrain.ts`, `data/arena-tag.ts`
- `src/data/abilities/ab-attrs.ts`, `ability.ts`, `apply-ab-attrs.ts`
- `src/data/pokeball.ts` — catch rates
- `src/data/berry.ts` — berry effects
- `src/enums/stat.ts`, `move-flags.ts`, `move-category.ts`, `move-target.ts`
- Phases: `move-phase.ts`, `move-effect-phase.ts`, `turn-start-phase.ts`, `stat-stage-change-phase.ts`, `tera-phase.ts`, `attempt-capture-phase.ts`, `berry-phase.ts`, `faint-phase.ts`, `weather-effect-phase.ts`
- `src/turn-command-manager.ts`

### 3. Party Building
Starter selection and cost budget, candy system, IVs/natures, species data, evolution chains, form changes, passive abilities, egg moves, learnsets, gender, shinies, catching wild Pokemon mid-run.

**Key files:**
- `src/data/pokemon-species.ts` — species definitions
- `src/data/nature.ts` — nature stat multipliers
- `src/data/gender.ts` — gender ratios
- `src/data/balance/starters.ts` — starter costs and config
- `src/data/balance/pokemon-evolutions.ts` — evolution chains
- `src/data/balance/pokemon-level-moves.ts` — level-up learnsets
- `src/data/balance/egg-moves.ts` — egg move pools
- `src/data/balance/passives.ts` — passive ability assignments
- `src/data/pokemon-forms.ts`, `pokemon-forms/form-change-triggers.ts`
- `src/init/init-catchable-species.ts` — catchable species
- `src/system/pokemon-data.ts` — Pokemon save structure
- Phases: `evolution-phase.ts`, `form-change-phase.ts`, `select-starter-phase.ts`, `learn-move-phase.ts`

### 4. Items & Modifiers
The held-item / modifier system: what items exist, tier system, stacking rules, modifier pools per context, shop mechanics (rerolls, pricing), how item selection works after each wave, enemy buff modifiers.

**Key files:**
- `src/modifier/modifier.ts` — all modifier classes
- `src/modifier/modifier-type.ts` — modifier type definitions
- `src/modifier/modifier-pools.ts` — item pools per tier
- `src/modifier/init-modifier-pools.ts` — pool initialization
- `src/utils/modifier-utils.ts` — modifier utilities
- `src/system/modifier-data.ts` — modifier save data
- `src/enums/modifier-tier.ts`, `modifier-pool-type.ts`
- Phases: `select-modifier-phase.ts`, `modifier-reward-phase.ts`, `game-over-modifier-reward-phase.ts`, `add-enemy-buff-modifier-phase.ts`

### 5. Economy & Progression
Money system, vouchers, shop pricing, reward phases, achievements, unlockables, ribbons, game stats, meta-progression (what persists between runs), timed/seasonal events.

**Key files:**
- `src/system/game-data.ts` — save/load, persistent data
- `src/system/game-stats.ts` — statistics tracking
- `src/system/achv.ts` — achievements
- `src/system/unlockables.ts` — unlockable content
- `src/system/voucher.ts` — voucher system
- `src/system/ribbons/*.ts` — ribbon system
- `src/timed-event-manager.ts` — timed event system
- `src/data/balance/timed-events.ts` — event config
- Phases: `money-reward-phase.ts`, `unlock-phase.ts`, `ribbon-modifier-reward-phase.ts`

### 6. Gacha & Eggs
Egg types, gacha machines, hatch mechanics, shiny/rare rates, species pools, manaphy eggs, how eggs interact with meta-progression, egg lapse/countdown system.

**Key files:**
- `src/data/egg.ts` — egg mechanics and generation
- `src/data/egg-hatch-data.ts` — hatch result data
- `src/system/egg-data.ts` — egg save data
- `src/data/balance/rates.ts` — shiny/rare rates
- `src/data/balance/species-egg-tiers.ts` — species-to-tier mapping
- `src/enums/egg-type.ts`, `gacha-types.ts`, `egg-source-types.ts`
- Phases: `egg-hatch-phase.ts`, `egg-lapse-phase.ts`, `egg-summary-phase.ts`
- `src/ui/handlers/egg-gacha-ui-handler.ts` — gacha UI logic

### 7. Mystery Encounters
The random event system: what triggers encounters, tier system, option structures, requirements, rewards, individual encounter designs, how they break up the normal wave flow.

**Key files:**
- `src/data/mystery-encounters/mystery-encounter.ts` — base class
- `src/data/mystery-encounters/mystery-encounters.ts` — encounter registry
- `src/data/mystery-encounters/mystery-encounter-option.ts` — option system
- `src/data/mystery-encounters/mystery-encounter-requirements.ts` — requirements
- `src/data/mystery-encounters/encounters/*.ts` — all ~25 individual encounters
- `src/data/mystery-encounters/utils/*.ts` — encounter utilities
- `src/enums/mystery-encounter-tier.ts`, `mystery-encounter-type.ts`, `mystery-encounter-mode.ts`
- `src/phases/mystery-encounter-phases.ts`

### 8. AI & Trainers
Enemy AI decision-making, trainer party templates, gym leaders, evil teams, rival configs, boss scaling, how enemy parties are generated, AI move selection logic.

**Key files:**
- `src/data/trainers/trainer-config.ts` — all trainer configurations
- `src/data/trainers/trainer-party-template.ts` — party templates
- `src/data/trainers/fixed-battle-configs.ts` — fixed battle setups
- `src/data/trainers/evil-admin-trainer-pools.ts` — evil team pools
- `src/data/trainers/rival-party-config.ts` — rival config
- `src/ai/ai-moveset-gen.ts` — AI moveset generation
- `src/ai/ai-species-gen.ts` — AI species selection
- `src/ai/rival-team-gen.ts` — rival team generation
- `src/enums/trainer-type.ts`, `ai-type.ts`, `party-member-strength.ts`
- `src/field/trainer.ts` — trainer field class
- Phases: `enemy-command-phase.ts`, `trainer-victory-phase.ts`

## Execution Plan

### Phase 1: Parallel Research (8 Explore subagents)
Launch all 8 simultaneously. Each agent gets:
- The file list above
- The document template
- Strict rules: cite every formula with `file:line`, use plain English, use tables for constants, no summarizing

### Phase 2: Verification Pass
After all agents return:
- Spot-check 3-5 key claims per doc against actual source
- Grep for undocumented exports in each theme's file set
- Fill gaps with targeted follow-up agents

### Phase 3: Polish & Commit
- Ensure consistent formatting across all 8 docs
- Add cross-references between docs where systems interact
- Commit to repo

## Quality Rules for Subagents

1. **Every formula must have a source citation** — `(source: file.ts:line)`
2. **No summarizing** — extract actual logic, write it in readable notation
3. **Lead with English** — what does this do, in one sentence, before the formula
4. **Tables for data** — any set of 3+ related constants becomes a table
5. **List files read** — agent must enumerate which files it actually read at the end
6. **Flag unknowns** — if logic is unclear, say so rather than guessing
