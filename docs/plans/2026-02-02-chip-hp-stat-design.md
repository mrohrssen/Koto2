# Chip HP Stat & Archetype System Design

> **Goal:** Increase player agency and build diversity by adding HP as a third chip stat and classifying chips into archetypes with distinct stat profiles.

## Overview

Currently chips have two stats (Power, Bandwidth). This design adds HP as a third stat, enabling tank vs glass cannon build choices. Chips are classified into five archetypes that define their stat distribution.

**Build diversity achieved:**
- Tank loadout: High HP, low damage - survive and outlast
- Glass cannon: Low HP, high damage - kill fast or die
- Sustain build: Medium HP with healing effects
- Mixed builds remain viable

---

## Three-Stat Chip System

### Stats

| Stat | Role | Range |
|------|------|-------|
| PWR | Raw damage contribution | 5-25 |
| BW | Multiplier contribution | 0-6 |
| HP | Bonus to player maxHP when equipped | 10-100 |

### Scaling

All three stats scale +20% per chip level (levels 1-7), matching current behavior.

**Example - Battery Bot at level 1 vs level 7:**
- Level 1: PWR 10, BW 0, HP 45
- Level 7 (2.2x): PWR 22, BW 0, HP 99

### Player MaxHP Formula

```
maxHP = baseHP (100) + vitalityBonus + sum(equippedChipHP)
```

**Example loadouts:**
- 5 Tank chips (avg 85 HP): 100 + 425 = 525 HP
- 5 Amplifier chips (avg 20 HP): 100 + 100 = 200 HP

---

## Five Archetypes

### Archetype Definitions

| Archetype | PWR | BW | HP | Playstyle |
|-----------|-----|----|----|-----------|
| **Tank** | Low (5-10) | Low (0-1) | High (70-100) | Survive, outlast |
| **Healer** | Low (5-10) | Low (0-2) | Medium (50-70) | Sustain through recovery |
| **Striker** | High (12-25) | Low (0-2) | Medium (30-50) | Consistent raw damage |
| **Amplifier** | Low (5-10) | High (2-6) | Low (10-30) | Multipliers, burst potential |
| **Trickster** | Variable | Variable | Low-Med (20-50) | Chaotic effects, high variance |

### Balancing Principle

Each chip has a hidden "power budget" distributed across PWR + BW + HP. High stats in one area require lower stats elsewhere. No chip should be dominant in all three.

---

## Chip Classification (32 chips)

### Tank (3 chips)
High survivability, low damage output.

| Chip | Current PWR | Current BW | Proposed HP |
|------|-------------|------------|-------------|
| Eraser | 12 | 2 | 75 |
| Egg | 15 | 2 | 85 |
| Duo | 18 | 4 | 70 |

### Healer (5 chips)
Medium HP, sustain through effects.

| Chip | Current PWR | Current BW | Proposed HP |
|------|-------------|------------|-------------|
| Onigiri | 9 | 0 | 60 |
| Straw | 6 | 2 | 65 |
| Charcoal | 20 | 3 | 50 |
| Leech | 8 | 2 | 55 |
| Vampire | 14 | 3 | 50 |

### Striker (7 chips)
High PWR focus, medium survivability.

| Chip | Current PWR | Current BW | Proposed HP |
|------|-------------|------------|-------------|
| Battery | 10 | 0 | 45 |
| Scissors | 14 | 1 | 40 |
| Wallet | 11 | 1 | 45 |
| Toolbox | 10 | 1 | 50 |
| Needle | 22 | 4 | 30 |
| Overclocked | 25 | 5 | 30 |
| Anchor | 12 | 2 | 45 |

### Amplifier (10 chips)
Glass cannon - high BW, low HP.

| Chip | Current PWR | Current BW | Proposed HP |
|------|-------------|------------|-------------|
| Speaker | 10 | 3 | 25 |
| Lightbulb | 10 | 2 | 30 |
| Glasses | 8 | 3 | 25 |
| Drum | 15 | 3 | 20 |
| Magnifying Glass | 14 | 3 | 20 |
| Key | 13 | 2 | 25 |
| Spark Plug | 10 | 3 | 25 |
| Adrenaline | 12 | 2 | 20 |
| Ice Cream | 14 | 6 | 15 |
| Candle | 16 | 5 | 15 |

### Trickster (7 chips)
Chaotic effects, variable stats.

| Chip | Current PWR | Current BW | Proposed HP |
|------|-------------|------------|-------------|
| Clock | 18 | 2 | 35 |
| Mirror | 18 | 3 | 30 |
| Fireworks | 17 | 2 | 40 |
| Book | 9 | 2 | 45 |
| Feather | 11 | 2 | 40 |
| Commoner | 8 | 1 | 50 |
| Underdog | 10 | 2 | 45 |

---

## Healing Scaling

With larger HP pools, flat heals become trivial. Convert to percentage-based:

| Chip | Current Heal | New Heal |
|------|--------------|----------|
| Onigiri | 5 HP/attack | 2% maxHP/attack |
| Straw | 12 HP/attack | 4% maxHP/attack |
| Charcoal skill | 30 HP | 10% maxHP |

**Formula:**
```javascript
healAmount = Math.floor(player.maxHP * healPercent)
```

**Example at 500 maxHP:**
- Onigiri: 500 × 0.02 = 10 HP/attack
- Straw: 500 × 0.04 = 20 HP/attack

---

## Balancing Process

### Three-Agent Review System

All three agents must unanimously approve changes before they ship.

| Agent | Role |
|-------|------|
| **Stat Auditor** | Checks no chip exceeds power budget; flags stat outliers |
| **Build Theorist** | Simulates optimal builds; identifies if one archetype dominates |
| **Edge Case Hunter** | Finds broken combos (e.g., 5 tanks = unkillable?) |

### Review Cycle

1. **Initial Assignment** - Assign HP values within archetype ranges
2. **Agent Review** - Each agent analyzes and flags concerns
3. **Propose Adjustments** - Agents suggest specific stat changes
4. **Consensus Check** - All three must agree
5. **Iterate** - Repeat until unanimous approval

### Acceptance Criteria

- No single archetype dominates optimal builds
- Tank builds survive ~40% longer but deal ~40% less damage
- Glass cannon builds kill ~40% faster but die ~40% sooner
- Mixed builds remain competitive
- No "must pick" or "never pick" chips

---

## UI Changes

### Chip Popup (chip-row.js)

Add HP as third stat box:

```
┌─────────────────────────────┐
│   PWR     BW      HP        │
│  [10]    [2]    [65]        │
├─────────────────────────────┤
│ Passive: ...                │
│ Skill: ...                  │
└─────────────────────────────┘
```

### HP Bar

Show total HP only - no breakdown needed:

```
[████████████░░░░] 420 HP
```

### Chip Select (Shopping)

- Display HP column in comparison view
- Optional: Filter/sort by archetype

---

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `data/chips.json` | Add `hp` to stats object for all 32 chips |
| `src/game/items/chips.js` | Include chip HP in pipeline context |
| `src/game/state.js` | Calculate maxHP including chip HP sum |
| `src/game/combat/mechanics.js` | Update healing to use percentages |
| `public/js/ui/chip-row.js` | Display HP in chip popup |
| `public/js/ui/chip-select.js` | Display HP in shop UI |

### Data Schema Change

**Before:**
```json
{
  "battery": {
    "stats": { "power": 10, "bandwidth": 0 }
  }
}
```

**After:**
```json
{
  "battery": {
    "stats": { "power": 10, "bandwidth": 0, "hp": 45 },
    "archetype": "striker"
  }
}
```

### MaxHP Calculation

```javascript
function calculateMaxHP(player) {
  let maxHP = player.baseMaxHP || 100;

  // Add vitality meta-upgrade bonus
  const vitalityBonus = getMetaUpgradeEffects(player.meta).maxHpPercent || 0;
  maxHP = Math.floor(maxHP * (1 + vitalityBonus / 100));

  // Add equipped chip HP
  const equippedChips = getEquippedChips(player);
  for (const chip of equippedChips) {
    const chipLevel = getChipLevel(player, chip.id);
    const scaleFactor = 1 + (chipLevel - 1) * 0.20;
    maxHP += Math.floor((chip.stats?.hp || 0) * scaleFactor);
  }

  return maxHP;
}
```

---

## Dependencies

This design should be implemented **after** the new-chips worktree is merged (adds 12 chips, bringing total to 32).

---

## Summary

| Aspect | Current | New |
|--------|---------|-----|
| Chip stats | PWR, BW | PWR, BW, HP |
| HP range | N/A | 10-100 per chip |
| Archetypes | None | Tank, Healer, Striker, Amplifier, Trickster |
| Build diversity | Damage optimization only | Tank vs glass cannon vs sustain vs hybrid |
| Healing | Flat values | Percentage of maxHP |
| Balancing | Manual | 3-agent unanimous review |
