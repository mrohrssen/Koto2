# Damage Feedback Granularity Design

**Date:** 2026-02-03
**Status:** Ready for implementation
**Scope:** Small (~100-150 lines)

## Overview

Replace the binary damage feedback system (150+ threshold) with a 5-tier gradient system based on percentage of enemy max HP. This makes "big hit" feedback meaningful throughout the entire game rather than becoming the default after Ward 2.

## Tier Definitions

| Tier | Name | % of Enemy HP | Description |
|------|------|---------------|-------------|
| 0 | Chip | < 10% | Barely scratched them |
| 1 | Normal | 10-20% | Expected damage |
| 2 | Solid | 20-35% | Above average hit |
| 3 | Big | 35-50% | Major damage |
| 4 | Massive | 50%+ | Devastating blow |

**Rationale:** If combat averages 3-5 turns, "normal" damage is ~20-33% per hit. Tier 2+ triggers when outperforming expectations.

## Visual Feedback per Tier

### Screen Effects

| Tier | Screen Shake | Hit Stop | Particles | Flash |
|------|--------------|----------|-----------|-------|
| 0 (Chip) | none | none | 4 | none |
| 1 (Normal) | light | 30ms | 8 | none |
| 2 (Solid) | medium | 60ms | 12 | element |
| 3 (Big) | heavy | 100ms | 18 | element + screen |
| 4 (Massive) | heavy + extra | 150ms | 25 | screen x2 |

### Damage Number Styling

| Tier | Class | Font Scale | Color | Effects |
|------|-------|------------|-------|---------|
| 0 | `.dmg-chip` | 0.85x | gray (#888) | none |
| 1 | `.dmg-normal` | 1.0x | white (#fff) | none |
| 2 | `.dmg-solid` | 1.15x | cyan (#0ff) | subtle glow |
| 3 | `.dmg-big` | 1.3x | cyan (#0ff) | strong glow, pop animation |
| 4 | `.dmg-massive` | 1.6x | gold (#ffd700) | intense glow, bounce animation |

### CSS Text Shadows

```css
.dmg-chip { color: #888; }
.dmg-normal { color: #fff; }
.dmg-solid { color: #0ff; text-shadow: 0 0 8px #0ff; }
.dmg-big { color: #0ff; text-shadow: 0 0 12px #0ff, 0 0 24px #0ff; }
.dmg-massive { color: #ffd700; text-shadow: 0 0 16px #ffd700, 0 0 32px #ff8c00; }
```

### Animations

- **Tier 2 (Solid)**: Slight scale pulse (1.0 → 1.1 → 1.0)
- **Tier 3 (Big)**: Pop in with overshoot (0 → 1.2 → 1.0), shake
- **Tier 4 (Massive)**: Dramatic entrance (0 → 1.4 → 1.0), stays on screen 50% longer, slight bounce

## Implementation

### New Function: getDamageTier()

```javascript
// combat-effects.js
export function getDamageTier(damage, enemyMaxHp) {
  const percent = (damage / enemyMaxHp) * 100;
  if (percent >= 50) return 4;  // Massive
  if (percent >= 35) return 3;  // Big
  if (percent >= 20) return 2;  // Solid
  if (percent >= 10) return 1;  // Normal
  return 0;                      // Chip
}
```

### Files to Modify

1. **`public/js/ui/combat-effects.js`**
   - Replace `bigDamageThreshold: 150` with tier config object
   - Add `getDamageTier(damage, enemyMaxHp)` function
   - Update `CONFIG` with per-tier effect settings
   - Modify `playEnemyHitEffects()` to accept tier parameter

2. **`public/js/ui/combat-loop.js`**
   - Pass `enemy.maxHp` to damage feedback functions
   - Calculate tier before calling effects

3. **`public/game.css`**
   - Add `.dmg-chip`, `.dmg-normal`, `.dmg-solid`, `.dmg-big`, `.dmg-massive` classes
   - Add keyframe animations for pop/bounce effects

### Backward Compatibility

Keep `isBigDamage()` working:
```javascript
export const isBigDamage = (damage, enemyMaxHp) => getDamageTier(damage, enemyMaxHp) >= 3;
```

## Edge Cases

**Overkill (damage > enemy HP):**
- Calculate based on maxHp, not remaining HP
- 500 damage on 400 HP enemy = 125% = Tier 4 (Massive)

**Multi-hit (recursion, pipeline runs twice):**
- Each hit calculated independently
- Prevents dilution of big hit feedback

**Bosses:**
- System handles naturally - higher HP = lower tier for same raw damage
- Correctly tells player "how well you're doing in THIS fight"

**Minimum damage:**
- Tier 0 still shows damage number, just subdued
- Prevents visual noise while keeping information visible

## Sound (Optional Enhancement)

If implementing sound pitch variation:
- Tier 0: -10% pitch
- Tier 1: normal
- Tier 2: +10% pitch
- Tier 3: +20% pitch
- Tier 4: +30% pitch

---

*Design approved 2026-02-03*
