# Combat System Redesign Proposal
## Attack × Bandwidth × Synergy

**Author:** Game Design Team
**Date:** January 2026
**Version:** 1.0
**Status:** Draft Proposal

---

## Executive Summary

This proposal outlines a fundamental redesign of our combat damage system, inspired by the mathematical depth of games like Balatro, Puzzle & Dragons, and Path of Exile. The goal is to dramatically increase build variety and outcome range while maintaining the approachable charm of our Bot chip system.

**Current System:** Linear damage with multiplicative bumps
**Proposed System:** Dual-pool multiplication with synergy bonuses

**Expected Outcomes:**
- 10× increase in viable build archetypes
- Exponential scaling potential (matching industry leaders)
- Deeper strategic choices without added complexity for casual players
- Natural progression hooks for meta-game engagement

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [The New Formula](#the-new-formula)
3. [Mathematical Analysis](#mathematical-analysis)
4. [Chip Stat Redesign](#chip-stat-redesign)
5. [Chip Migration Guide](#chip-migration-guide)
6. [Synergy System](#synergy-system)
7. [New Chip Types](#new-chip-types)
8. [Balancing Framework](#balancing-framework)
9. [UI/UX Considerations](#uiux-considerations)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Risk Assessment](#risk-assessment)

---

## Problem Statement

### Current Formula

```
damage = pipeline(playerAttack × variance, [chip₁, chip₂, chip₃, chip₄, chip₅])
```

Where each chip either:
- Adds flat damage (`+5`)
- Multiplies current damage (`×1.3`)
- Applies conditional effects

### Limitations

| Issue | Impact |
|-------|--------|
| **Single scaling axis** | All chips compete for the same "damage" value |
| **Linear ceiling** | Even optimal builds hit ~500 damage |
| **Solved builds** | Players discover "best" loadout quickly |
| **No investment tradeoffs** | No reason to specialize |
| **Predictable outcomes** | Low excitement from build experimentation |

### Competitive Analysis

| Game | Outcome Range | Build Archetypes |
|------|---------------|------------------|
| **Neo Tokyo (Current)** | 20 - 500 | ~5 viable |
| Slay the Spire | 10 - 999 | ~15 per character |
| Balatro | 100 - 10,000,000+ | 50+ |
| Puzzle & Dragons | 1,000 - 1,000,000,000,000 | 100+ |

We are significantly behind industry benchmarks for build variety.

---

## The New Formula

### Core Concept

```
DAMAGE = ATTACK × BANDWIDTH × SYNERGY BONUS
```

### Detailed Breakdown

```
ATTACK POOL:
  baseAttack = 0 (player has no innate attack)
  flatAttack = Σ(+ATK from chips)
  attackMult = Π(×ATK multipliers from chips)

  ATTACK = flatAttack × attackMult

BANDWIDTH POOL:
  baseBandwidth = 1 (minimum multiplier)
  flatBandwidth = Σ(+BW from chips)
  bandwidthMult = Π(×BW multipliers from chips)

  BANDWIDTH = (baseBandwidth + flatBandwidth) × bandwidthMult

SYNERGY BONUS:
  synergyBonus = Π(active synergy multipliers)

  SYNERGY = synergyBonus (default 1.0)

FINAL DAMAGE = ATTACK × BANDWIDTH × SYNERGY
```

### Why Base Attack = 0?

Setting player's base attack to zero creates **mandatory chip dependency**:

1. **Chips become essential**, not optional bonuses
2. **Every chip matters** — even small +ATK chips contribute
3. **Loadout = identity** — your build IS your character
4. **Thematic fit** — in a cyberpunk world, your tech defines your power

This mirrors Balatro where base hand scores are low; the jokers ARE the game.

---

## Mathematical Analysis

### Comparison of Growth Types

#### Current System (Sequential Pipeline)

```
damage = ((((base + flat₁) × mult₁) + flat₂) × mult₂) ...

Example with 5 chips:
  base: 10
  +5, ×1.3, +5, ×1.5, +10

  = ((((10 + 5) × 1.3) + 5) × 1.5) + 10
  = (((15 × 1.3) + 5) × 1.5) + 10
  = ((19.5 + 5) × 1.5) + 10
  = (24.5 × 1.5) + 10
  = 36.75 + 10
  = 46.75

Growth type: LINEAR with multiplicative bumps
```

#### Proposed System (Dual Pool)

```
damage = ATTACK × BANDWIDTH × SYNERGY

Example with same 5 chips (redistributed):
  Attack:    +15 flat, ×1.3 mult → 15 × 1.3 = 19.5
  Bandwidth: +3 flat, ×1.5 mult → (1 + 3) × 1.5 = 6
  Synergy:   none → 1.0

  DAMAGE = 19.5 × 6 × 1.0 = 117

Growth type: QUADRATIC minimum (two pools multiplying)
```

#### With Strategic Investment

```
Example: 5 chips, all providing ×1.5 multipliers

Current system (sequential):
  10 × 1.5 × 1.5 × 1.5 × 1.5 × 1.5 = 10 × 7.59 = 75.9

Proposed system (split between pools):
  Attack:    +10 base, ×1.5, ×1.5 mult → 10 × 2.25 = 22.5
  Bandwidth: +0, ×1.5, ×1.5 mult → 1 × 2.25 = 2.25
  Synergy:   ×1.5 → 1.5

  DAMAGE = 22.5 × 2.25 × 1.5 = 75.9 (same ceiling)

BUT with optimal split:
  Attack:    +10 base, ×1.5 mult → 15
  Bandwidth: +2 flat, ×1.5, ×1.5 mult → 3 × 2.25 = 6.75
  Synergy:   ×1.5 → 1.5

  DAMAGE = 15 × 6.75 × 1.5 = 151.9 (2× better!)
```

### The Key Insight: Optimal Ratios

In a multiplicative system, **balance between pools matters**:

```
If total "power budget" = P, distributed between Attack (A) and Bandwidth (B):
  A + B = P
  Damage = A × B

Maximum damage occurs when A = B = P/2

  Example: P = 100
    A=90, B=10 → 900
    A=50, B=50 → 2,500 (optimal!)
    A=10, B=90 → 900
```

This creates **meaningful build decisions** that don't exist in single-axis systems.

### Scaling Comparison Table

| # of ×2 Multipliers | Current (Sequential) | Proposed (Split Evenly) |
|---------------------|----------------------|-------------------------|
| 2 | base × 4 | base × 2 × 2 = base × 4 |
| 4 | base × 16 | base × 4 × 4 = base × 16 |
| 6 | base × 64 | base × 8 × 8 = base × 64 |
| 6 + synergy (×2) | base × 64 | base × 8 × 8 × 2 = base × 128 |

The third axis (Synergy) provides **additional exponential scaling** on top of the dual-pool system.

---

## Chip Stat Redesign

### New Chip Anatomy

Every chip now has **two base stats** plus **effect modifiers**:

```json
{
  "id": "battery",
  "name": "Battery Bot",
  "stats": {
    "attack": 8,
    "bandwidth": 0
  },
  "effects": {
    "onEquip": { ... },
    "onAttack": { ... },
    "passive": { ... }
  },
  "tags": ["electric", "basic"],
  "synergyContribution": ["electric"]
}
```

### Stat Guidelines

| Chip Archetype | Attack | Bandwidth | Notes |
|----------------|--------|-----------|-------|
| Damage Dealer | High (8-15) | Low (0-1) | Pure attack contribution |
| Amplifier | Low (0-3) | High (2-5) | Multiplies total output |
| Balanced | Medium (4-6) | Medium (1-2) | Flexible, safe choice |
| Specialist | Variable | Variable | Conditional bonuses |
| Synergy Enabler | Low (2-4) | Low (0-1) | Value comes from tag bonuses |

### Effect Types (Expanded)

#### Attack Pool Effects

| Effect | Description | Example |
|--------|-------------|---------|
| `+ATK` | Add flat attack | +5 attack |
| `×ATK` | Multiply attack pool | ×1.3 attack |
| `+ATK%` | Add % of base attack | +20% attack |
| `+ATK/condition` | Conditional attack | +10 ATK if enemy < 30% HP |
| `+ATK/stack` | Stacking attack | +2 ATK per stack (25% chance) |
| `+ATK/kill` | Kill-scaling attack | +1 ATK per enemy defeated |

#### Bandwidth Pool Effects

| Effect | Description | Example |
|--------|-------------|---------|
| `+BW` | Add flat bandwidth | +2 bandwidth |
| `×BW` | Multiply bandwidth pool | ×1.5 bandwidth |
| `+BW/empty` | Bandwidth per empty slot | +1 BW per empty slot |
| `+BW/equipped` | Bandwidth per chip | +0.5 BW per equipped chip |
| `×BW/combo` | Bandwidth on combo streak | ×1.1 BW per correct answer |

#### Synergy Effects

| Effect | Description | Example |
|--------|-------------|---------|
| `SYN/tag` | Synergy per tag count | +0.2× per [electric] chip |
| `SYN/threshold` | Synergy at breakpoint | ×1.5 if 3+ [electric] chips |
| `SYN/unique` | Synergy for variety | +0.1× per unique tag |
| `SYN/duo` | Duo synergy | ×2 if [electric] + [water] present |

---

## Chip Migration Guide

Below is the complete migration of all 18 existing chips to the new system.

### Damage Dealers (High Attack)

#### Battery Bot
```
CURRENT:
  +5 flat damage (100% trigger)
  Skill: +8 damage next attack

NEW:
  Stats: ATK 8, BW 0
  Tags: [electric, basic]
  Effects: None (pure stat stick)
  Skill: +12 ATK next attack

RATIONALE: Simple entry-level damage chip. Pure attack, no complexity.
```

#### Fireworks Bot
```
CURRENT:
  +15 flat damage, 10% destroy random chip

NEW:
  Stats: ATK 15, BW 1
  Tags: [explosive, risky]
  Effects:
    onAttack: 10% chance to destroy random equipped chip
  Skill: +20 ATK next attack (no risk)

RATIONALE: High risk, high reward. Best-in-class attack stat with downside.
```

#### Onigiri Bot
```
CURRENT:
  +5 damage, heal 5 HP

NEW:
  Stats: ATK 6, BW 0
  Tags: [food, sustain]
  Effects:
    onAttack: Heal 5 HP
  Skill: Heal 20 HP

RATIONALE: Sustain chip. Modest attack with healing utility.
```

### Multipliers (High Bandwidth)

#### Speaker Bot
```
CURRENT:
  80% chance ×1.3 damage

NEW:
  Stats: ATK 0, BW 2
  Tags: [electric, sound]
  Effects:
    onAttack: 80% chance ×1.2 BW
  Skill: ×1.5 BW next attack (guaranteed)

RATIONALE: Probabilistic bandwidth amplifier. Risk/reward profile.
```

#### Light Bulb Bot
```
CURRENT:
  50% chance ×1.6 damage

NEW:
  Stats: ATK 2, BW 1
  Tags: [electric, light]
  Effects:
    onAttack: 50% chance ×1.5 BW
  Skill: ×2.0 BW next attack (guaranteed)

RATIONALE: High variance amplifier. Bigger upside than Speaker, less reliable.
```

#### Glasses Bot
```
CURRENT:
  +0.05× per consecutive hit (ramping)

NEW:
  Stats: ATK 0, BW 1
  Tags: [optical, precision]
  Effects:
    onAttack: +0.3 BW per consecutive hit on same enemy (stacks in combat)
  Skill: Set BW stack to 5 instantly

RATIONALE: Sustained fight specialist. Rewards long engagements.
```

### Conditional Specialists

#### Scissors Bot
```
CURRENT:
  ×1.5 damage if enemy < 30% HP

NEW:
  Stats: ATK 3, BW 0
  Tags: [tool, finisher]
  Effects:
    passive: +10 ATK if enemy < 30% HP
  Skill: ×2.0 damage to enemies below 30% HP

RATIONALE: Execute/finisher chip. Clutch damage when it matters.
```

#### Key Bot
```
CURRENT:
  ×1.25 damage vs bosses

NEW:
  Stats: ATK 2, BW 1
  Tags: [tool, hunter]
  Effects:
    passive: ×1.5 BW vs bosses
  Skill: ×2.0 total damage vs boss (one attack)

RATIONALE: Boss specialist. Essential for ward boss fights.
```

#### Eraser Bot
```
CURRENT:
  +10 damage if 2+ empty slots

NEW:
  Stats: ATK 0, BW 0
  Tags: [tool, minimalist]
  Effects:
    passive: +12 ATK if 2+ empty slots
    passive: +2 BW if 3+ empty slots
  Skill: +20 ATK, +3 BW if 2+ empty (one attack)

RATIONALE: Minimalist archetype enabler. Rewards running few chips.
```

### Scaling Chips

#### Wallet Bot
```
CURRENT:
  +1 damage per enemy killed this run

NEW:
  Stats: ATK 2, BW 0
  Tags: [container, scaling]
  Effects:
    passive: +0.5 ATK per enemy killed this run
  Skill: Deal (kills × 2) direct damage

RATIONALE: Run-scaling chip. Gets stronger over time.
```

#### Book Bot
```
CURRENT:
  25% chance +2 damage, stacks during combat

NEW:
  Stats: ATK 0, BW 1
  Tags: [knowledge, stacking]
  Effects:
    onAttack: 25% chance +1 BW (stacks during combat, max 10)
  Skill: Convert all stacks to ATK (stack × 3)

RATIONALE: Combat-scaling bandwidth. Rewards long fights.
```

#### Egg Bot
```
CURRENT:
  ×1 base +0.5× per destroyed chip

NEW:
  Stats: ATK 0, BW 1
  Tags: [organic, phoenix]
  Effects:
    passive: +1.0 BW per chip destroyed this run
  Skill: Sacrifice this chip for ×3 BW permanently this run

RATIONALE: Synergizes with sacrifice/destruction archetype.
```

### Sacrifice & Risk

#### Charcoal Bot
```
CURRENT:
  ×5 damage, destroyed forever

NEW:
  Stats: ATK 5, BW 2
  Tags: [fire, sacrifice]
  Effects:
    onAttack (once): ×3 ATK and ×2 BW, then destroy this chip forever
  Skill: Passive - activates automatically on first attack

RATIONALE: Ultimate sacrifice chip. Massive one-time boost.
```

#### Straw Bot
```
CURRENT:
  -2 damage, heal 10 HP

NEW:
  Stats: ATK -3, BW 0
  Tags: [sustain, lifesteal]
  Effects:
    onAttack: Heal 12 HP
    onAttack: +0.2 BW
  Skill: Heal 25 HP, deal 15 direct damage

RATIONALE: Negative attack creates interesting tradeoff. Pure sustain.
```

### Meta/Pipeline Chips

#### Clock Bot
```
CURRENT:
  7% chance restart pipeline (max 10 recursions)

NEW:
  Stats: ATK 0, BW 0
  Tags: [time, meta]
  Effects:
    onDamageCalc: 7% chance to double final damage (max 3 procs per attack)
  Skill: Guarantee double damage next attack

RATIONALE: Simplified from recursion to doubling. Same spirit, cleaner math.
```

#### Mirror Bot
```
CURRENT:
  Copy previous chip's effect

NEW:
  Stats: ATK 0, BW 0
  Tags: [optical, meta]
  Effects:
    onEquip: Copy ATK and BW stats of highest-stat adjacent chip
  Skill: ×1.5 to both ATK and BW pools (one attack)

RATIONALE: Position-dependent stat copier. Rewards thoughtful loadout.
```

#### Magnifying Glass Bot
```
CURRENT:
  Amplify next chip by 1.3×

NEW:
  Stats: ATK 0, BW 1
  Tags: [optical, amplifier]
  Effects:
    passive: Next chip in loadout has ×1.3 stats
  Skill: ×2 stats for adjacent chips (one attack)

RATIONALE: Loadout position matters. Amplifies neighbors.
```

### Utility Chips

#### Feather Bot
```
CURRENT:
  +4 damage per empty slot

NEW:
  Stats: ATK 0, BW 0
  Tags: [light, minimalist]
  Effects:
    passive: +3 ATK and +0.5 BW per empty slot
  Skill: +8 ATK per empty slot (one attack)

RATIONALE: Core minimalist archetype chip. Pairs with Eraser Bot.
```

#### Toolbox Bot
```
CURRENT:
  +3 damage per equipped chip

NEW:
  Stats: ATK 2, BW 0
  Tags: [tool, maximalist]
  Effects:
    passive: +2 ATK and +0.3 BW per equipped chip
  Skill: +5 ATK per equipped chip (one attack)

RATIONALE: Opposite of Feather. Rewards full loadouts.
```

#### Drum Bot
```
CURRENT:
  Every 5th attack ×2.5 damage

NEW:
  Stats: ATK 4, BW 0
  Tags: [sound, burst]
  Effects:
    onAttack: Build rhythm stack (1-4: nothing, 5: ×2 BW, reset)
  Skill: Instantly trigger burst (×2 BW) and reset counter

RATIONALE: Burst damage pattern. Rhythm-based gameplay.
```

---

## Synergy System

### Overview

Synergies provide the third multiplicative axis. They reward **thematic builds** by granting bonuses when multiple chips share tags.

### Tag Categories

| Category | Tags | Thematic Identity |
|----------|------|-------------------|
| **Element** | electric, fire, water, ice, light, dark | Elemental damage types |
| **Material** | organic, metal, crystal, digital | Construction material |
| **Function** | tool, weapon, support, utility | Chip purpose |
| **Archetype** | sustain, burst, scaling, sacrifice, minimalist, maximalist | Build identity |
| **Rarity Implicit** | basic, advanced, prototype, legendary | Tier-based |

### Synergy Bonuses

#### Threshold Synergies (Count-Based)

| Synergy | Requirement | Bonus |
|---------|-------------|-------|
| Electric Surge | 2 [electric] chips | +0.3× Synergy |
| Electric Overload | 4 [electric] chips | +0.8× Synergy |
| Tool Mastery | 3 [tool] chips | +0.4× Synergy |
| Minimalist | 2 [minimalist] + 2 empty slots | +1.0× Synergy |
| Maximalist | 5 [maximalist] (full loadout) | +0.6× Synergy |
| Sustain Tank | 3 [sustain] chips | +0.3× Synergy, +20% heal |
| Burst Master | 3 [burst] chips | +0.5× Synergy on burst turns |

#### Duo Synergies (Combination-Based)

| Synergy | Requirement | Bonus |
|---------|-------------|-------|
| Storm | [electric] + [water] | ×1.5 Synergy |
| Inferno | [fire] + [light] | ×1.4 Synergy |
| Shadow Play | [dark] + [optical] | ×1.3 Synergy, +crit chance |
| Time Loop | [time] + [optical] | 15% chance double damage |
| Phoenix Flame | [fire] + [phoenix] | Revive once per combat at 30% HP |
| Knowledge Power | [knowledge] + [scaling] | BW stacks grant +1 ATK each |

#### Rainbow Synergy

| Synergy | Requirement | Bonus |
|---------|-------------|-------|
| Diversity Bonus | 5 unique tags | +0.5× Synergy |
| True Rainbow | 5 unique elemental tags | ×2.0 Synergy |

### Synergy UI Display

```
┌─────────────────────────────────────┐
│ ACTIVE SYNERGIES                    │
├─────────────────────────────────────┤
│ ⚡ Electric Surge (2/2)    +0.3×   │
│ 🔧 Tool Mastery (3/3)      +0.4×   │
│ 🌊 Storm [electric+water]  ×1.5    │
├─────────────────────────────────────┤
│ TOTAL SYNERGY BONUS:       ×2.61   │
└─────────────────────────────────────┘
```

---

## New Chip Types

To fully leverage the new system, we propose adding these new chip archetypes:

### Pure Bandwidth Chips

```json
{
  "id": "antenna",
  "name": "Antenna Bot",
  "nameEn": "Antenna Bot",
  "stats": { "attack": 0, "bandwidth": 4 },
  "tags": ["electric", "amplifier"],
  "effects": {},
  "description": "Pure bandwidth. No attack, maximum amplification."
}
```

```json
{
  "id": "prism",
  "name": "Prism Bot",
  "nameEn": "Prism Bot",
  "stats": { "attack": 0, "bandwidth": 2 },
  "tags": ["optical", "light", "amplifier"],
  "effects": {
    "passive": "×1.2 BW per [optical] chip equipped"
  },
  "description": "Bandwidth multiplier that scales with optical chips."
}
```

### Attack Multipliers

```json
{
  "id": "overclocker",
  "name": "Overclocker Bot",
  "nameEn": "Overclocker Bot",
  "stats": { "attack": 3, "bandwidth": 0 },
  "tags": ["electric", "risky"],
  "effects": {
    "passive": "×1.4 ATK (×1.8 if below 50% HP)"
  },
  "description": "Attack multiplier with low-HP bonus."
}
```

### Synergy Enablers

```json
{
  "id": "catalyst",
  "name": "Catalyst Bot",
  "nameEn": "Catalyst Bot",
  "stats": { "attack": 2, "bandwidth": 1 },
  "tags": ["meta", "catalyst"],
  "effects": {
    "passive": "All synergy thresholds require 1 fewer chip"
  },
  "description": "Makes synergies easier to activate."
}
```

```json
{
  "id": "wildcard",
  "name": "Wildcard Bot",
  "nameEn": "Wildcard Bot",
  "stats": { "attack": 3, "bandwidth": 0 },
  "tags": ["meta", "wildcard"],
  "effects": {
    "onEquip": "Counts as any ONE element tag of your choice"
  },
  "description": "Flexible tag for completing synergies."
}
```

### Bandwidth Multipliers (The Exponential Lever)

```json
{
  "id": "amplifier",
  "name": "Amplifier Bot",
  "nameEn": "Amplifier Bot",
  "stats": { "attack": 0, "bandwidth": 0 },
  "tags": ["electric", "sound", "amplifier"],
  "effects": {
    "passive": "×1.5 BW"
  },
  "description": "Pure bandwidth multiplier. The exponential lever."
}
```

```json
{
  "id": "resonator",
  "name": "Resonator Bot",
  "nameEn": "Resonator Bot",
  "stats": { "attack": 0, "bandwidth": 1 },
  "tags": ["sound", "amplifier"],
  "effects": {
    "passive": "×1.3 BW per [sound] chip (including self)"
  },
  "description": "Stacking bandwidth multiplier for sound builds."
}
```

---

## Balancing Framework

### Power Budget System

Each chip has a **power budget** based on rarity:

| Rarity | Base Power Budget | Example Distribution |
|--------|-------------------|----------------------|
| Common | 10 | ATK 8 + BW 0 + 2 effect |
| Uncommon | 15 | ATK 8 + BW 2 + 5 effect |
| Rare | 22 | ATK 10 + BW 3 + 9 effect |
| Epic | 32 | ATK 12 + BW 5 + 15 effect |
| Legendary | 45 | ATK 15 + BW 8 + 22 effect |

### Stat Point Values

| Component | Power Cost |
|-----------|------------|
| +1 ATK | 1 point |
| +1 BW | 2 points |
| ×1.1 ATK | 3 points |
| ×1.1 BW | 4 points |
| Basic tag | 0 points |
| Rare tag | -1 point (costs budget for power) |
| Downside | +3-5 points refund |

### Target Damage Ranges

| Progression Point | ATK Pool | BW Pool | Synergy | Total Damage |
|-------------------|----------|---------|---------|--------------|
| Early game (Ward 1) | 15-25 | 2-4 | 1.0 | 30-100 |
| Mid game (Ward 3) | 40-60 | 4-8 | 1.3-1.5 | 200-700 |
| Late game (Ward 5) | 80-120 | 8-15 | 1.5-2.0 | 1,000-3,600 |
| Optimized build | 150+ | 15-25 | 2.0-3.0 | 4,500-11,000+ |
| Perfect synergy build | 100 | 20 | 4.0+ | 8,000+ |

### Build Archetype Targets

| Archetype | ATK Focus | BW Focus | Synergy Focus | Playstyle |
|-----------|-----------|----------|---------------|-----------|
| Glass Cannon | High | Low | Medium | Big numbers, fragile |
| Amplifier | Low | High | Medium | Multiplies any ATK |
| Synergy Master | Medium | Medium | High | Tag stacking |
| Minimalist | Medium | High | Specific | 2-3 chips only |
| Maximalist | High | Medium | Specific | 5 chips always |
| Sustain | Low | Low | Sustain | Outlast enemies |
| Burst | Medium | Low | Burst | Every 5th attack huge |

---

## UI/UX Considerations

### Damage Display

```
┌────────────────────────────────────────────┐
│              DAMAGE BREAKDOWN              │
├────────────────────────────────────────────┤
│                                            │
│   ATTACK        ×    BANDWIDTH   ×  SYNERGY│
│  ┌────────┐       ┌────────────┐  ┌──────┐│
│  │   45   │   ×   │    8.5     │ ×│ 2.1  ││
│  │ (base) │       │ (1+7.5)×1  │  │      ││
│  └────────┘       └────────────┘  └──────┘│
│                                            │
│            = 803 DAMAGE                    │
│                                            │
└────────────────────────────────────────────┘
```

### Chip Card Redesign

```
┌─────────────────────────────┐
│ ⚡ BATTERY BOT              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                             │
│  ATK        BW              │
│  ████████   ░░░░░░░░        │
│    +8         +0            │
│                             │
│ ─────────────────────────── │
│ Tags: electric, basic       │
│                             │
│ "Always fully charged!"     │
└─────────────────────────────┘
```

### Loadout Screen

```
┌─────────────────────────────────────────────────────────┐
│ CHIP LOADOUT                              [5/5 slots]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Battery] [Speaker] [Prism] [Amplifier] [Toolbox]     │
│     +8        +0       +0       +0         +2+8        │
│     +0        +2       +2       +0         +0+1.5      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ TOTALS:                                                 │
│   Attack Pool:    8 + 2 + 8 = 18 × 1.0 = 18            │
│   Bandwidth Pool: (1 + 2 + 2 + 1.5) × 1.5 = 9.75       │
│   Synergy Bonus:  Electric Surge ×1.3                   │
│                                                         │
│   ESTIMATED DAMAGE: 18 × 9.75 × 1.3 = 228              │
└─────────────────────────────────────────────────────────┘
```

### Synergy Discovery

When players equip chips that could form synergies:

```
┌─────────────────────────────────────────┐
│ 💡 SYNERGY HINT                         │
├─────────────────────────────────────────┤
│ You have 1 [electric] chip.             │
│ Add 1 more for:                         │
│   ⚡ Electric Surge (+0.3× Synergy)     │
│                                         │
│ Available [electric] chips in inventory:│
│   • Speaker Bot                         │
│   • Light Bulb Bot                      │
│   • Antenna Bot                         │
└─────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Core System (Week 1-2)

1. **Data Migration**
   - Add `stats.attack` and `stats.bandwidth` to all chips in `chips.json`
   - Add `tags` array to all chips
   - Deprecate `effects.pipeline` structure

2. **Damage Calculation**
   - Create new `calculateDamage(player, enemy)` function
   - Implement Attack pool aggregation
   - Implement Bandwidth pool aggregation
   - Add Synergy multiplier calculation

3. **Basic Testing**
   - Unit tests for damage calculation
   - Verify all chips contribute correctly

### Phase 2: Effects System (Week 3-4)

1. **Effect Triggers**
   - Implement `onEquip`, `onAttack`, `passive` effect hooks
   - Migrate conditional effects (Scissors, Key, Eraser)
   - Migrate scaling effects (Wallet, Book, Glasses)

2. **Multiplier Effects**
   - Implement `×ATK` and `×BW` effect types
   - Ensure multipliers compound correctly

3. **Integration Testing**
   - Test all 18 migrated chips
   - Verify edge cases (empty loadout, all multipliers, etc.)

### Phase 3: Synergy System (Week 5-6)

1. **Tag System**
   - Implement tag registry
   - Add tag counting utilities

2. **Synergy Definitions**
   - Create `synergies.json` data file
   - Implement threshold synergy evaluation
   - Implement duo synergy evaluation

3. **Synergy UI**
   - Display active synergies
   - Show synergy hints during loadout

### Phase 4: Balance & Polish (Week 7-8)

1. **Balance Pass**
   - Playtest all build archetypes
   - Adjust stat values per balancing framework
   - Tune synergy bonuses

2. **New Chips**
   - Add 6-8 new chips to fill archetype gaps
   - Focus on bandwidth multipliers and synergy enablers

3. **UI Polish**
   - Damage breakdown display
   - Chip card redesign
   - Loadout screen improvements

### Phase 5: Testing & Launch (Week 9-10)

1. **Full Regression**
   - E2E test suite updates
   - Combat balance verification

2. **Player Testing**
   - Beta feedback collection
   - Final adjustments

3. **Launch**
   - Deploy to production
   - Monitor metrics

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing saves | Medium | High | Save migration script |
| Performance regression | Low | Medium | Profile damage calc, optimize |
| UI complexity | Medium | Medium | Progressive disclosure, tooltips |

### Design Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| System too complex for casual players | Medium | High | Tutorial, simplified display mode |
| Dominant strategy emerges | Medium | Medium | Balance patches, synergy diversity |
| Chips feel "samey" | Low | Medium | Strong thematic identity per chip |
| Power creep | Medium | Medium | Strict power budget enforcement |

### Mitigation Strategies

1. **Save Migration**
   - Detect old save format
   - Auto-migrate chip data
   - Grant compensation if chips changed significantly

2. **Complexity Management**
   - "Simple Mode" toggle shows only total damage
   - Advanced breakdown for engaged players
   - Gradual synergy introduction (unlock at Ward 2)

3. **Balance Monitoring**
   - Track build diversity metrics
   - Flag dominant strategies automatically
   - Quarterly balance updates

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Viable build archetypes | ~5 | 15+ | Builds used in Ward 5 clears |
| Damage outcome range | 20-500 (25×) | 50-10,000 (200×) | Min/max observed |
| Chip usage diversity | 60% use top 5 chips | No chip >15% usage | Equipment analytics |
| Player retention (D7) | Baseline | +15% | Analytics |
| Session length | Baseline | +10% | Analytics |
| Build experimentation | Baseline | 3+ loadout changes/session | Analytics |

---

## Conclusion

The proposed Attack × Bandwidth × Synergy system transforms our combat from a linear sequential pipeline into a multiplicative multi-axis system comparable to industry leaders like Balatro and Puzzle & Dragons.

**Key Benefits:**
1. **Exponential scaling potential** via dual multiplicative pools
2. **Meaningful build diversity** through investment tradeoffs
3. **Synergy depth** rewarding thematic commitment
4. **Future-proof architecture** for expansion

**Investment Required:**
- 8-10 weeks development
- All existing chips require migration
- UI updates for damage display

**Recommendation:** Approve for development. The mathematical foundation is sound, the migration path is clear, and the expected player experience improvement justifies the investment.

---

## Appendix A: Full Chip Migration Table

| Chip | Current Effect | New ATK | New BW | New Effect | Tags |
|------|----------------|---------|--------|------------|------|
| Battery Bot | +5 flat | 8 | 0 | None | electric, basic |
| Speaker Bot | 80% ×1.3 | 0 | 2 | 80% ×1.2 BW | electric, sound |
| Glasses Bot | +0.05×/hit | 0 | 1 | +0.3 BW/hit | optical, precision |
| Light Bulb Bot | 50% ×1.6 | 2 | 1 | 50% ×1.5 BW | electric, light |
| Scissors Bot | ×1.5 if <30% HP | 3 | 0 | +10 ATK if <30% | tool, finisher |
| Clock Bot | 7% recursion | 0 | 0 | 7% double dmg | time, meta |
| Charcoal Bot | ×5, destroy | 5 | 2 | ×3 ATK, ×2 BW, destroy | fire, sacrifice |
| Book Bot | 25% +2 stack | 0 | 1 | 25% +1 BW stack | knowledge, stacking |
| Eraser Bot | +10 if 2 empty | 0 | 0 | +12 ATK if 2 empty | tool, minimalist |
| Onigiri Bot | +5, heal 5 | 6 | 0 | heal 5 | food, sustain |
| Wallet Bot | +1/kill | 2 | 0 | +0.5 ATK/kill | container, scaling |
| Straw Bot | -2, heal 10 | -3 | 0 | +0.2 BW, heal 12 | sustain, lifesteal |
| Key Bot | ×1.25 vs boss | 2 | 1 | ×1.5 BW vs boss | tool, hunter |
| Egg Bot | +0.5×/destroyed | 0 | 1 | +1.0 BW/destroyed | organic, phoenix |
| Fireworks Bot | +15, 10% destroy | 15 | 1 | 10% destroy chip | explosive, risky |
| Mirror Bot | Copy prev chip | 0 | 0 | Copy adjacent stats | optical, meta |
| Feather Bot | +4/empty slot | 0 | 0 | +3 ATK, +0.5 BW/empty | light, minimalist |
| Drum Bot | 5th hit ×2.5 | 4 | 0 | 5th hit ×2 BW | sound, burst |
| Magnifying Glass | ×1.3 next chip | 0 | 1 | ×1.3 adjacent stats | optical, amplifier |
| Toolbox Bot | +3/equipped | 2 | 0 | +2 ATK, +0.3 BW/equipped | tool, maximalist |

---

## Appendix B: Example Builds

### Build 1: Glass Cannon

```
Chips: Battery, Fireworks, Overclocker, Charcoal, Scissors
ATK: 8 + 15 + 3 + 5 + 3 = 34 × 1.4 (Overclocker) × 3 (Charcoal) = 142.8
BW: (1 + 0 + 1 + 0 + 2 + 0) × 2 (Charcoal) = 8
Synergy: None active = 1.0

DAMAGE: 142.8 × 8 × 1.0 = 1,142 (one-time burst, then Charcoal gone)
```

### Build 2: Electric Amplifier

```
Chips: Battery, Speaker, Light Bulb, Antenna, Amplifier
ATK: 8 + 0 + 2 + 0 + 0 = 10
BW: (1 + 2 + 1 + 4 + 0) × 1.2 (Speaker avg) × 1.25 (LB avg) × 1.5 (Amp) = 8 × 2.25 = 18
Synergy: Electric Overload (4 electric) = +0.8× → 1.8

DAMAGE: 10 × 18 × 1.8 = 324 (consistent)
```

### Build 3: Minimalist

```
Chips: Eraser, Feather, [empty], [empty], [empty]
ATK: 0 + 0 + 12 (Eraser) + 9 (Feather: 3×3 empty) = 21
BW: (1 + 0 + 2 (Eraser) + 1.5 (Feather: 0.5×3)) × 1.0 = 4.5
Synergy: Minimalist (2 minimalist + 3 empty) = +1.0× → 2.0

DAMAGE: 21 × 4.5 × 2.0 = 189 (with only 2 chips!)
```

### Build 4: Sustain Tank

```
Chips: Onigiri, Straw, Egg, Book, Toolbox
ATK: 6 + (-3) + 0 + 0 + 2 + 10 (Toolbox: 2×5) = 15
BW: (1 + 0 + 0 + 1 + 1 + 1.5 (Toolbox)) × 1.0 = 4.5
Synergy: Sustain (2 sustain) = +0.3× → 1.3
Healing: 5 + 12 = 17 HP per attack

DAMAGE: 15 × 4.5 × 1.3 = 87.75 (but heals 17/attack!)
```

### Build 5: Boss Killer

```
Chips: Key, Scissors, Overclocker, Amplifier, Catalyst
vs Boss below 30% HP:
ATK: 2 + 3 + 10 (Scissors) + 3 + 0 + 2 = 20 × 1.4 (OC) = 28
BW: (1 + 1 + 0 + 0 + 0 + 1) × 1.5 (Key) × 1.5 (Amp) = 3 × 2.25 = 6.75
Synergy: Tool Mastery (2/3 with Catalyst) = +0.4× → 1.4

DAMAGE: 28 × 6.75 × 1.4 = 264.6 (normal)
DAMAGE vs Boss <30%: 28 × 6.75 × 1.4 × 2 (Key skill) = 529
```

---

*Document prepared for executive review. Questions and feedback welcome.*
