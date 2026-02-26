# Pokemon-Style Move System Design

**Date**: 2026-02-26
**Status**: Approved

## Overview

Replace the current auto-attack + flashcard combat system with a Pokemon-style shared move pool. Creatures learn moves from a global pool of ~150 Japanese verbs, each with fixed combat stats. Moves are the vocabulary learning mechanism — players learn Japanese through repeated contextual use of move names, not flashcard drilling.

## Core Concepts

### Shared Move Pool (`data/moves.json`)

~150 Japanese verbs, each a fully defined combat move. A move always has the same stats regardless of which creature uses it — just like Pokemon.

```json
{
  "id": "moyasu",
  "name": "燃やす",
  "nameEn": "Burn",
  "reading": "もやす",
  "meaning": "to burn",
  "rank": 4800,

  "element": "fire",
  "category": "damage",
  "target": "single_enemy",
  "power": 50,
  "mpCost": 30,

  "statusEffect": null,
  "statusChance": 0,
  "statusDuration": 0,

  "tier": 2,
  "description": "Engulfs the target in flames."
}
```

**Categories**: `damage`, `heal`, `shield`, `buff`, `debuff`, `drain`

**Target types**: `single_enemy`, `all_enemies`, `single_ally`, `all_allies`, `self`

**Elements**: `fire`, `water`, `wood`, `earth`, `metal`, `neutral`

**Tiers 1-4**: Soft correlation with JPDB frequency rank. Common words trend toward lower tiers (weaker/cheaper), rarer words toward higher tiers (stronger/costlier), with deliberate exceptions.

### Creature Learnsets

Each creature has a curated learnset of 4-6 moves from the shared pool. Creatures learn moves at specific levels.

```json
{
  "id": "kasai",
  "baseMp": 60,
  "learnset": [
    { "moveId": "kamu", "level": 1 },
    { "moveId": "moyasu", "level": 3 },
    { "moveId": "hoeru", "level": 7 },
    { "moveId": "bakuhatsu", "level": 12 },
    { "moveId": "mamoru", "level": 16 },
    { "moveId": "moeru", "level": 22 }
  ]
}
```

- **3 move slots max** — creatures start with 1 move at level 1, learn more as they level
- When a creature learns a 4th+ move, player chooses which existing move to replace (or skip)
- Learnsets are influenced by element + archetype but not locked — tanks still get damage moves, fighters can learn a utility move
- Existing `autoSkill` and `ultimate` fields are removed, replaced by learnset entries

### MP Resource

New third stat alongside HP and attack.

- `baseMp` on each creature, scales with level: `baseMp * (1 + (level-1) * 0.1)`
- MP regenerates partially each turn (~10-15% of max)
- Archetype determines base MP:

| Archetype | baseHp | baseAttack | baseMp | Playstyle |
|-----------|--------|------------|--------|-----------|
| Fighter | Medium | High | Low (~60) | Cheap physical moves, high attack multiplies damage |
| Tank/Healer | High | Low | Medium (~80) | Enough MP for heals/shields |
| Mage | Low | Low | High (~120) | Deep pool for powerful elemental moves |
| Trickster | Low-Med | Medium | Medium (~90) | Status effects, balanced utility |

Mage damage comes from high-power moves (affordable due to large MP pool). Fighter damage comes from high attack stat amplifying cheap moves. Same formula: `(attack / 10) * movePower * elementMultiplier * variance`.

### STAB (Same Type Attack Bonus)

Creature using a move that matches its own element gets 1.5x damage, like Pokemon. A fire creature using a fire move does 50% more damage.

## Combat Flow

Replaces the flashcard-gated auto-attack system. All interaction happens in the action area at the bottom of the screen.

### Per-Creature Turn

**Step 1 — Move Selection** (action area shows 2x2 grid):

```
┌──────────────┬──────────────┐
│ 🔥 燃やす     │ 🐺 噛む      │
│ Burn | Pwr 50│ Bite | Pwr 30│
│ MP: 30       │ MP: 10       │
├──────────────┼──────────────┤
│ 🔊 吠える     │ 🎒 アイテム   │
│ Howl | Buff  │ Items        │
│ MP: 20       │              │
└──────────────┴──────────────┘
```

- Shows Japanese name + reading, English name, power, MP cost, element icon
- Moves greyed out if insufficient MP
- Items button opens inventory

**Step 2 — Target Selection** (action area swaps to vertical enemy list):

```
┌─────────────────────────────┐
│ 🟢 スライム A   slime  ████░ │
├─────────────────────────────┤
│ 👺 ゴブリン B   goblin ██████│
├─────────────────────────────┤
│ 🟢 スライム C   slime  ██░░░ │
└─────────────────────────────┘
```

- Each row shows: sprite icon, Japanese name, base word/meaning, HP bar
- Player taps a row to target — more vocab exposure during target selection
- **AoE moves**: skip target selection, hit all enemies
- **Ally-target moves**: show party creature list instead
- **Self moves**: skip target selection

### Turn Resolution

1. Player selects moves for each creature (left to right)
2. All party moves execute in order
3. Enemies attack
4. MP regenerates
5. Next turn

### What Gets Removed

- Vocab flashcard gate (cards no longer appear in combat)
- Auto-attack system (player now chooses moves)
- Ultimate charge bar (replaced by MP bar)
- Attack/Defend/Befriend card choice (replaced by move selection; befriend becomes a menu option or move)
- Flashcard/SRS in combat deferred to separate design

## Move Generation Pipeline

Separate scripts, run and review between each step.

### Step 1: JPDB Verb Pull (`scripts/pull-move-candidates.mjs`)

- Query JPDB API for top verbs by frequency rank
- Filter to verbs that could work as combat abilities
- Output: `data/move-candidates.json` (~250 candidates)

### Step 2: Opus Classification (`scripts/classify-moves.mjs`)

- Feed each candidate verb to Opus with the game's element/category system
- Opus assigns: element, category, target type, power tier, MP cost tier, description
- Opus flags verbs that don't fit as combat moves
- Output: `data/moves-classified.json`

### Step 3: Balance Pass (`scripts/balance-moves.mjs`)

- Convert tiers to concrete power/mpCost numbers using a balance table
- Ensure distribution: ~60% damage, ~10% heal, ~10% buff, ~10% debuff, ~10% utility
- Ensure element distribution is roughly even
- Output: `data/moves.json` (the final 150 moves)

### Step 4: Human Review

- Review `data/moves.json` for translation accuracy
- Verify all meanings match dictionary definitions (CLAUDE.md mandate)
- Adjust misclassified moves

### Step 5: Learnset Assignment (`scripts/assign-learnsets.mjs`)

- Opus assigns 4-6 moves to each creature based on element + archetype + thematic fit
- First move always level 1, rest spread across levels
- Output: updated `data/creatures.json` with learnset fields

## Migration Plan

### Seed Moves

Existing ~80 autoSkill/ultimate moves across ~40 creatures become the initial entries in `data/moves.json` before the pipeline runs. The pipeline generates ~70 more to reach 150.

### Phased Implementation

1. **Phase 1 — Move Pool Data**: Pipeline scripts, generate 150 moves, review
2. **Phase 2 — Creature Data**: Add baseMp + learnsets, remove autoSkill/ultimate
3. **Phase 3 — Combat Backend**: Rewrite `robot-combat-service.js` for move selection + MP + targeting
4. **Phase 4 — Combat UI**: Rebuild action area for move grid + vertical target list + MP bar

## Open Questions (Deferred)

- Where does flashcard/SRS vocab review live after leaving combat? (Separate design)
- How does befriend work in the new system? (Likely a menu option alongside moves)
- Should moves have accuracy/miss chance? (Start without, add if needed)
- PP-style per-move limits vs shared MP pool? (Going with shared MP for now)
