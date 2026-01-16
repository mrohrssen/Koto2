# Sequential Chip Pipeline System

## Overview

The sequential chip pipeline converts weapon chips from "universal simultaneous application" to a **sequential damage pipeline** where chips fire in order (left-to-right), enabling effect chaining like `+5 attack → attack * 3`.

## Key Change

Instead of all chips applying at once, weapon chips now form a **damage pipeline** that processes sequentially during each attack.

## Pipeline Flow

```
Base Damage (from stats)
    ↓
[Chip 0] → trigger check → modify damage → pass to next
    ↓
[Chip 1] → trigger check → modify damage → pass to next
    ↓
[Chip 2] → trigger check → modify damage → pass to next
    ↓
[Chip 3] → trigger check → modify damage → pass to next
    ↓
[Chip 4] → trigger check → modify damage → pass to next
    ↓
Final Damage → apply to enemy → post-damage effects
```

## New Chip Category: PIPELINE

### Category Definition

```javascript
PIPELINE: {
  id: 'pipeline',
  name: 'パイプライン',
  nameEn: 'Pipeline',
  description: 'Sequential damage modification - fires in weapon slot order'
}
```

### Pipeline Effect Types

| Type | Description | Example |
|------|-------------|---------|
| `flatAdd` | Add flat damage | +5 damage |
| `multiply` | Multiply damage | damage × 1.5 |
| `conditional` | Multiply if condition met | +50% if enemy <30% HP |
| `critMod` | Modify crit chance | +20% crit chance |

## MVP Pipeline Chips (5)

| Chip | Japanese | Effect | Trigger | Display |
|------|----------|--------|---------|---------|
| powerCell | パワーセル | +5 flat damage | 100% | `+5` |
| amplifier | アンプ | damage × 1.5 | 80% | `×1.5` |
| critBooster | クリットブースター | +20% crit chance | 100% | `+20% CRIT` |
| overloader | オーバーロード | damage × 2 | 50% | `×2` |
| finisher | フィニッシャー | +50% if enemy <30% HP | 100% | `+50%` |

## Chip Definition Schema

```javascript
{
  id: 'powerCell',
  name: 'パワーセル',
  nameEn: 'Power Cell',
  category: 'pipeline',
  rarity: 'common',
  effects: {
    pipeline: {
      type: 'flatAdd',       // Effect type
      value: 5,              // Effect value
      triggerChance: 1.0,    // 0-1, chance to fire
      displayText: '+5',     // UI display when triggered
      condition: null        // Optional: { type, threshold, status }
    }
  }
}
```

## Pipeline Execution Engine

### Function Signature

```javascript
executeChipPipeline(weaponChips, context) → {
  finalDamage: number,
  firedChips: Array<{
    chipId: string,
    chipName: string,
    triggered: boolean,
    previousDamage?: number,
    newDamage?: number,
    displayText: string,
    critChanceBonus?: number
  }>,
  critChance: number,
  damageMultiplier: number
}
```

### Context Object

```javascript
{
  baseDamage: number,    // Damage from stats/attack
  isCrit: boolean,       // Whether attack was critical
  critChance: number,    // Current crit chance
  critMultiplier: number,// Crit damage multiplier
  target: Enemy          // Target enemy for condition checks
}
```

## Integration Points

### Combat Flow (player-actions.js)

```
executePlayerAttack()
    → resolvePhysicalAttack() → base damage
    → executeChipPipeline() → modified damage  ← NEW
    → existing modifiers (double strike, boss bonus)
    → apply damage to enemy
    → on-hit chip effects (unchanged)
```

### UI Updates (game.js)

- `renderCombatChips()` shows pipeline chips with fire state
- New CSS classes: `.triggered`, `.failed`, `.firing`
- Effect text shown below chip when triggered

### CSS Animations

- `.triggered` - green glow, scale pulse
- `.failed` - reduced opacity
- `.firing` - brightness increase during animation
- Sequential animation with 120ms per chip

## Condition Types

| Condition | Description | Schema |
|-----------|-------------|--------|
| `enemyLowHp` | Enemy HP below threshold | `{ type: 'enemyLowHp', threshold: 0.3 }` |
| `enemyHasStatus` | Enemy has specific status | `{ type: 'enemyHasStatus', status: 'defrag' }` |
| `isCrit` | Attack was critical | `{ type: 'isCrit' }` |

## Example: Chip Chain Math

**Equipped chips (left to right):**
1. Power Cell (+5 flat, 100%)
2. Amplifier (×1.5, 80%)
3. Overloader (×2, 50%)

**Base damage:** 50

**Pipeline execution:**
1. Power Cell fires → 50 + 5 = 55
2. Amplifier fires (80% passed) → 55 × 1.5 = 82
3. Overloader fails (50% missed) → 82 (unchanged)

**Final damage:** 82

## Existing Category Behavior

| Category | Behavior |
|----------|----------|
| **STAT** | Unchanged - applied at stat calculation |
| **ON_HIT** | Unchanged - fire after damage dealt |
| **ON_EFFECT** | Unchanged - conditional triggers |
| **COUNTER** | Unchanged - scaling bonuses |
| **PIPELINE** | **NEW** - sequential damage modification |

## Files Modified

| File | Changes |
|------|---------|
| `src/game/items/chips.js` | Add PIPELINE category, 5 MVP chips, `executeChipPipeline()` |
| `src/game/combat/player-actions.js` | Integrate pipeline into `executePlayerAttack()` |
| `src/game/items/index.js` | Re-export new pipeline functions |
| `public/game.js` | Update `renderCombatChips()`, add animation |
| `public/game.css` | Add chip firing animations |

## Future Enhancements (Out of Scope)

- Armor/shield chips for defensive pipeline
- Chip synergies (bonus if adjacent chips match)
- Chip fusion/combining
- Visual chain connectors between chips
