# Chip Balance Tuning Plan

## Problem

Chip effect values were designed for a player with ~50-100 ATK, but the actual player ATK is 15-25. Several chips are wildly overpowered (Feather +20/empty, Charcoal ×10, Fireworks +50) while others are useless (Glasses — crits don't exist, Key ×1.1 boss).

## Constraints

- **DO NOT** change effect types or mechanics — only numeric values
- **DO NOT** change leveling system (1-7, +5%/level)
- **DO** tune passive effect values and skill effect values
- **DO** redesign Glasses Bot (crits don't exist in the game)
- **DO** add 2 new chips (Magnifying Glass Bot, Toolbox Bot)

## Balance Targets

- Regular enemies (150-330 HP): **5-8 turns** with average build
- Bosses (570-930 HP): **10-15 turns** with decent build
- Perfect build (all lv7, ideal synergy): **2-3 hits** on tier 4 boss (930 HP)
- Player base ATK: 15 (up to 25 with full meta upgrades)

## Reference: Enemy Stats

| Tier | Floors | ATK | HP |
|------|--------|-----|-----|
| 1 | 1-2 | 9 (±20%) | 150 (±20%) |
| 2 | 3-4 | 13 (±20%) | 210 (±20%) |
| 3 | 5-6 | 17 (±20%) | 270 (±20%) |
| 4 | 7 | 21 (±20%) | 330 (±20%) |
| Boss T4 | 7 | 40 (±20%) | 930 (±20%) |

---

## Passive Effect Changes (chips.json)

### Flat Damage Chips

| Chip | Field | Old | New | Notes |
|------|-------|-----|-----|-------|
| Battery | value | 5 | **5** | Keep — 33% of base ATK |
| Feather | value | 20 | **4** | Per empty slot. Was +80 with 4 empty |
| Eraser | value | 40 | **10** | Conditional on 2+ empty |
| Fireworks | value | 50 | **15** | Has 10% destroy risk |
| Onigiri | value | 5 | **5** | Keep |
| Onigiri | healValue | 5 | **5** | Keep |
| Straw | value | -2 | **-2** | Keep |
| Straw | healValue | 10 | **10** | Keep |
| Toolbox (NEW) | value | — | **3** | Per equipped chip, type: perEquipped |

### Multiplier Chips

| Chip | Field | Old | New | Notes |
|------|-------|-----|-----|-------|
| Speaker | value | 1.5 | **1.3** | 80% trigger. Expected: 1.24x avg |
| Lightbulb | value | 2 | **1.6** | 50% trigger. Expected: 1.3x avg |
| Scissors | value | 1.5 | **1.5** | Keep — conditional (<30% HP) |
| Charcoal | value | 10 | **5** | Sacrifice. Lv7: ×6.2 |
| Clock | triggerChance | 0.1 | **0.07** | Recursion chance |
| Drum | multiplier | 3 | **2.5** | Every 5th attack |
| Key | value | 1.1 | **1.25** | BUFF — was useless |

### Redesigned Chips

| Chip | Field | Old | New | Notes |
|------|-------|-----|-----|-------|
| Glasses | type | critMod | **rampingMultiply** | New effect type |
| Glasses | value | 20 | **0.05** | +0.05× per consecutive hit, resets per enemy |
| Magnifying Glass (NEW) | type | — | **amplifyNext** | New effect type |
| Magnifying Glass (NEW) | value | — | **1.3** | Amplifies next chip's effect |

### Scaling/Utility Chips

| Chip | Field | Old | New | Notes |
|------|-------|-----|-----|-------|
| Book | value | 3 | **2** | 25% trigger stacking |
| Wallet | value | 1 | **1** | Keep — per kill |
| Egg | perDestroyed | 1 | **0.5** | Halved synergy scaling |

---

## Skill Effect Changes (chips.json → skill.effect)

| Chip | Skill | Field | Old | New |
|------|-------|-------|-----|-----|
| Battery | Full Charge | flatBonus | 20 | **8** |
| Speaker | Max Volume | multiplier | 1.8 | **1.4** |
| Lightbulb | Flash | damage | 40 | **20** |
| Scissors | Final Cut | multiplier | 2.0 | **1.6** |
| Clock | Rewind | runTwice | true | **keep** |
| Charcoal | Warmth | heal | 30 | **keep** |
| Book | Total Release | stackMultiplier | 5 | **3** |
| Eraser | Clean Slate | flatBonus | 60 | **15** |
| Onigiri | Extra Serving | heal | 25 | **15** |
| Wallet | Cash Out | killMultiplier | 2 | **1.5** |
| Straw | Big Sip | heal | 20 | **15** |
| Straw | Big Sip | damage | 10 | **8** |
| Key | Trump Card | multiplier | 1.3 | **1.5** |
| Egg | Revival | surviveLethal | true | **keep** |
| Fireworks | Grand Finale | flatBonus | 15 | **8** |
| Mirror | Facing Mirrors | nextChipDouble | true | **keep** |
| Feather | Light Step | flatBonusPerEmpty | 30 | **6** |
| Drum | Power Hit | attackMultiplier | 3 | **2** |
| Glasses | Analysis Complete (NEW) | multiplier | — | **1.3** |
| Glasses | — | buffType | — | **POST_PIPELINE** |
| Magnifying Glass | Focused Magnification (NEW) | nextChipAmplify | — | **2.0** |
| Magnifying Glass | — | buffType | — | **PIPELINE_MODIFIER** |
| Toolbox | Full Arsenal (NEW) | flatBonusPerEquipped | — | **5** |
| Toolbox | — | buffType | — | **PRE_PIPELINE** |

---

## New Chip Definitions

### Glasses Bot (Redesigned)

```json
{
  "id": "glasses",
  "name": "眼鏡ボット",
  "nameEn": "Glasses Bot",
  "description": "じっくり観察。連続攻撃でダメージ倍率が上がる。",
  "descriptionEn": "Studies enemies carefully. Damage multiplier grows with each consecutive hit!",
  "category": "pipeline",
  "effects": {
    "pipeline": {
      "type": "rampingMultiply",
      "value": 0.05,
      "triggerChance": 1,
      "displayText": "+0.05×/hit"
    }
  },
  "skill": {
    "id": "analysisComplete",
    "name": "解析完了",
    "nameEn": "Analysis Complete",
    "description": "次の攻撃×1.3倍",
    "descriptionEn": "Next attack ×1.3 multiplier",
    "type": "buff",
    "buffType": "POST_PIPELINE",
    "effect": { "multiplier": 1.3 },
    "chargesRequired": 5
  }
}
```

### Magnifying Glass Bot (New)

```json
{
  "id": "magnifyingGlass",
  "name": "虫眼鏡ボット",
  "nameEn": "Magnifying Glass Bot",
  "description": "次のチップの効果を1.3倍に拡大する。位置が大事！",
  "descriptionEn": "Amplifies the next chip in pipeline by 1.3×. Placement matters!",
  "category": "pipeline",
  "effects": {
    "pipeline": {
      "type": "amplifyNext",
      "value": 1.3,
      "triggerChance": 1,
      "displayText": "×1.3 NEXT"
    }
  },
  "skill": {
    "id": "focusedMagnification",
    "name": "集中拡大",
    "nameEn": "Focused Magnification",
    "description": "次のチップの効果を2倍に",
    "descriptionEn": "Amplify next chip by 2× for one attack",
    "type": "buff",
    "buffType": "PIPELINE_MODIFIER",
    "effect": { "nextChipAmplify": 2.0 },
    "chargesRequired": 5
  }
}
```

### Toolbox Bot (New)

```json
{
  "id": "toolbox",
  "name": "工具箱ボット",
  "nameEn": "Toolbox Bot",
  "description": "装備チップ1つにつき+3ダメージ。仲間が多いほど強い！",
  "descriptionEn": "+3 damage per equipped chip. More tools, more power!",
  "category": "pipeline",
  "effects": {
    "pipeline": {
      "type": "perEquipped",
      "value": 3,
      "triggerChance": 1,
      "displayText": "+EQUIPPED"
    }
  },
  "skill": {
    "id": "fullArsenal",
    "name": "全装備",
    "nameEn": "Full Arsenal",
    "description": "装備チップ1つにつき+5ダメージ",
    "descriptionEn": "Next attack +5 per equipped chip",
    "type": "buff",
    "buffType": "PRE_PIPELINE",
    "effect": { "flatBonusPerEquipped": 5 },
    "chargesRequired": 5
  }
}
```

---

## New Pipeline Effect Types to Implement

### 1. `rampingMultiply` (Glasses Bot)

```javascript
case 'rampingMultiply':
  // Track consecutive hits on same enemy
  if (!state.combatStacks) state.combatStacks = {};
  const rampKey = chip.id + '_ramp';
  state.combatStacks[rampKey] = (state.combatStacks[rampKey] || 0) + 1;
  const rampCount = state.combatStacks[rampKey];
  const rampMultiplier = 1 + (effectValue * rampCount);
  newDamage = state.currentDamage * rampMultiplier;
  // Return result with ramp info...
```

Level scaling: uses multiply formula `1 + (value - 1) * scaleFactor` — but since value is 0.05 (not a multiplier > 1), needs special handling. Add to the flat-scaling group instead: `Math.floor(value * scaleFactor * 100) / 100` (scale as decimal, keep 2dp).

### 2. `amplifyNext` (Magnifying Glass Bot)

```javascript
case 'amplifyNext':
  // Set amplification factor for next chip
  state.nextChipAmplify = effectValue;
  // Don't modify current damage
  newDamage = state.currentDamage;
  // Return result...
```

Then in the main pipeline loop, before processing each chip, check `state.nextChipAmplify` and multiply the chip's effective value by it.

### 3. `perEquipped` (Toolbox Bot)

```javascript
case 'perEquipped':
  const equippedCount = state.weaponUsedSlots || 0;
  const equippedBonus = effectValue * equippedCount;
  newDamage = state.currentDamage + equippedBonus;
  // Return result...
```

---

## Simulated Builds (Verification)

### Regular Fight — Average Build (2-3 chips, lv1, ATK 15, vs Tier 1: 150 HP)

- Battery + Speaker: (15+5) × 1.24 = 24.8 DPS → **6 turns** ✓
- Feather only (4 empty): 15 + 16 = 31 DPS → **4.8 turns** ✓
- Toolbox + Battery + Speaker (3 equipped): (15+9+5) × 1.24 = 36 DPS → **4.2 turns** (strong but 3-chip build)

### Boss Fight — Sustainable Build (5 chips, lv7, ATK 25, vs Tier 4 Boss: 930 HP)

Speaker → Lightbulb → Drum → Glasses → Key:
- Turn 1: 25 × 1.312 × 1.39 × 1.3(Drum avg) × 1.065(Glasses t1) × 1.325 = ~82 DPS
- Turn 10: Glasses at ×1.65 → ~120 DPS
- Average: ~97 DPS → **~10 turns** ✓ (skills shave 1-2 turns)

### Boss Fight — Perfect Sacrifice Build (5 chips, lv7, ATK 25, vs 930 HP)

Fireworks → Speaker → Lightbulb → Charcoal → Egg:
- Expected Charcoal hit: 44 × 1.312 × 1.39 × 6.2 × 1.5 = **745 damage** (80% of boss)
- Best case (all triggers): 44 × 1.39 × 1.78 × 6.2 × 1.5 = **1012 damage** (one-shot)
- Cleanup: 1-2 more hits → **2-3 total** ✓

---

## Future Cleanup (Separate Session)

1. **Dead rarity code:** Remove `applyRarityMultiplier()`, rarity-variant shop generation in `generateShopChips()`, `statMultiplier` fields in `chip-config.json`, `RARITY_WEIGHTS`, `rollRandomRarity()`
2. **Level scaling bugs:** Drum's `multiplier` field and Egg's `baseValue`/`perDestroyed` don't go through `getScaledEffectValue` — they never scale with levels. Fix by adding these fields to the scaling logic.
3. **Straw negative-value bug:** `Math.floor(-2 × 1.3) = -3` — penalty gets worse with levels instead of better. Fix by using `Math.ceil` for negative values or keeping penalty constant.
4. **Remove rarity field from chips.json** — all chips are just chips, no categorization.
5. **Glasses Bot old crit references** — remove `critMod` from PIPELINE_EFFECTS in chip-config.json if unused elsewhere.

---

## Implementation Steps

1. Update `chips.json` — change all numeric values per tables above
2. Add Magnifying Glass and Toolbox chip definitions to `chips.json`
3. Implement 3 new pipeline effect types in `processPipelineChip()` in `chips.js`
4. Add `amplifyNext` handling to the pipeline loop (amplify next chip's effectValue)
5. Add `rampingMultiply` to level scaling logic (treat as flat decimal, not multiply-type)
6. Update `getScaledEffectValue()` to handle new types
7. Update Glasses Bot skill descriptions (Japanese + English)
8. Update chip-config.json `pipelineEffects` with new type entries
9. Run unit tests: `npm run test:unit`
10. Run e2e tests: `./scripts/e2e-test.sh`
