# Chip Bandwidth Rebalance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove easy/passive bandwidth from chips, keeping bandwidth only for active skills or interesting conditional effects.

**Architecture:** Direct edits to `data/chips.json`. Each chip modification is atomic. One chip rename (commoner → goldStar) requires updating any code references.

**Tech Stack:** JSON data files, possibly JS files if chip IDs are referenced

---

### Task 1: Speaker Bot - Convert BW to PWR

**Files:**
- Modify: `data/chips.json` (speaker entry, lines 32-61)

**Step 1: Edit speaker pipeline effect**

Change `target` from `"bandwidth"` to `"power"` and update `displayText`:

```json
"effects": {
  "pipeline": {
    "type": "multiply",
    "target": "power",
    "value": 1.2,
    "triggerChance": 0.8,
    "displayText": "×1.2 PWR"
  }
}
```

Also update descriptions:
- `"description": "80%でパワー×1.2倍。ダメージを増幅！"`
- `"descriptionEn": "80% chance to x1.2 PWR. Amplifies your damage!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): speaker bot - convert bandwidth to power multiplier"
```

---

### Task 2: Glasses Bot - Convert BW Ramping to PWR Ramping

**Files:**
- Modify: `data/chips.json` (glasses entry, lines 63-93)

**Step 1: Edit glasses pipeline effect**

Change `target` from `"bandwidth"` to `"power"`, change `value` from `0.3` to `3`, update `displayText`:

```json
"effects": {
  "pipeline": {
    "type": "rampingMultiply",
    "target": "power",
    "value": 3,
    "triggerChance": 1,
    "displayText": "+3 PWR/hit"
  }
}
```

Update descriptions:
- `"description": "攻撃ごとに+3パワー。観察眼！"`
- `"descriptionEn": "+3 PWR per hit. Studies enemies carefully!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): glasses bot - convert bandwidth to +3 power ramping"
```

---

### Task 3: Straw Bot - Remove BW, Boost Healing

**Files:**
- Modify: `data/chips.json` (straw entry, lines 348-378)

**Step 1: Edit straw pipeline effect**

Remove bandwidth bonus, boost healing from 4% to 5%:

```json
"effects": {
  "pipeline": {
    "type": "damageAndHeal",
    "target": "meta",
    "value": 0,
    "healPercent": 0.05,
    "triggerChance": 1,
    "displayText": "heal 5%"
  }
}
```

Update descriptions:
- `"description": "5%HP回復。ちゅーっ！"`
- `"descriptionEn": "Heal 5% HP. Sips health back!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): straw bot - remove bandwidth, boost healing to 5%"
```

---

### Task 4: Spark Plug Bot - Convert to Amplify Next Chip's Power

**Files:**
- Modify: `data/chips.json` (sparkPlug entry, lines 886-917)

**Step 1: Edit sparkPlug pipeline effect**

Change from position bonus to amplifyNext:

```json
"effects": {
  "pipeline": {
    "type": "amplifyNext",
    "target": "power",
    "value": 2.0,
    "triggerChance": 1,
    "displayText": "×2 next PWR"
  }
}
```

Update descriptions:
- `"description": "次のチップのパワーを2倍に！"`
- `"descriptionEn": "Doubles next chip's power!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): spark plug bot - convert to x2 next chip power"
```

---

### Task 5: Anchor Bot - Remove BW, Boost Power

**Files:**
- Modify: `data/chips.json` (anchor entry, lines 853-885)

**Step 1: Edit anchor pipeline effect**

Remove bandwidth multiplier, increase power to +12:

```json
"effects": {
  "pipeline": {
    "type": "positionBonus",
    "target": "power",
    "position": "last",
    "powerAdd": 12,
    "triggerChance": 1,
    "displayText": "+12 PWR (last)"
  }
}
```

Update descriptions:
- `"description": "最後のスロットで+12パワー！"`
- `"descriptionEn": "+12 PWR when in last slot!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): anchor bot - remove bandwidth, boost to +12 power"
```

---

### Task 6: Toolbox Bot - Remove BW, Boost Power

**Files:**
- Modify: `data/chips.json` (toolbox entry, lines 599-630)

**Step 1: Edit toolbox pipeline effect**

Remove bandwidth, change power to +5 per equipped:

```json
"effects": {
  "pipeline": {
    "type": "perEquipped",
    "target": "power",
    "powerValue": 5,
    "triggerChance": 1,
    "displayText": "+5 PWR/equipped"
  }
}
```

Update descriptions:
- `"description": "装備毎に+5パワー。仲間が多いほど強い！"`
- `"descriptionEn": "+5 PWR per equipped chip. Teamwork!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): toolbox bot - remove bandwidth, boost to +5 power/equipped"
```

---

### Task 7: Lightbulb Bot - Convert from % Chance to Rhythm-Based

**Files:**
- Modify: `data/chips.json` (lightbulb entry, lines 94-123)

**Step 1: Edit lightbulb pipeline effect**

Change from % chance multiply to nth attack bonus:

```json
"effects": {
  "pipeline": {
    "type": "nthAttack",
    "target": "bandwidth",
    "interval": 4,
    "flatBonus": 1,
    "triggerChance": 1,
    "displayText": "+1 BW every 4th"
  }
}
```

Update descriptions:
- `"description": "4回目の攻撃で+1帯域。ひらめき！"`
- `"descriptionEn": "+1 BW every 4th attack. Eureka moments!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): lightbulb bot - convert to +1 BW every 4th attack"
```

---

### Task 8: Feather Bot - Bump Rarity to Rare

**Files:**
- Modify: `data/chips.json` (feather entry, lines 505-536)

**Step 1: Edit feather rarity**

Change rarity from uncommon to rare:

```json
"rarity": "rare"
```

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): feather bot - bump rarity to rare"
```

---

### Task 9: Eraser Bot - Bump Rarity to Epic

**Files:**
- Modify: `data/chips.json` (eraser entry, lines 253-286)

**Step 1: Edit eraser rarity**

Change rarity from rare to epic:

```json
"rarity": "epic"
```

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): eraser bot - bump rarity to epic"
```

---

### Task 10: Adrenaline Bot - Convert BW to Power

**Files:**
- Modify: `data/chips.json` (adrenaline entry, lines 662-693)

**Step 1: Edit adrenaline pipeline effect**

Change from bandwidth to power, adjust scaling:

```json
"effects": {
  "pipeline": {
    "type": "missingHpBonus",
    "target": "power",
    "valuePer20Hp": 5,
    "triggerChance": 1,
    "displayText": "+5 PWR/20 HP missing"
  }
}
```

Update descriptions:
- `"description": "HP20減少ごとに+5パワー。ピンチで強い！"`
- `"descriptionEn": "+5 PWR per 20 HP missing. Stronger when hurt!"`

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): adrenaline bot - convert to +5 power per 20 HP missing"
```

---

### Task 11: Rename Commoner Bot to Gold Star Bot

**Files:**
- Modify: `data/chips.json` (commoner entry, lines 788-819)
- Search: Any JS files referencing `"commoner"` chip ID

**Step 1: Search for chip ID references**

Run: `grep -r '"commoner"' --include="*.js" src/ public/`

If no results, proceed. If results found, note files to update.

**Step 2: Edit the chip entry**

Change ID, name, description, and effect:

```json
"goldStar": {
  "id": "goldStar",
  "name": "金星ボット",
  "nameEn": "Gold Star Bot",
  "description": "レジェンダリーチップ1つにつき+1帯域。一流を集めろ！",
  "descriptionEn": "+1 BW per legendary chip equipped. Collect the best!",
  "category": "pipeline",
  "rarity": "common",
  "archetype": "trickster",
  "stats": { "power": 8, "bandwidth": 0, "hp": 50 },
  "effects": {
    "pipeline": {
      "type": "rarityBonus",
      "target": "bandwidth",
      "targetRarity": "legendary",
      "valuePerChip": 1,
      "triggerChance": 1,
      "displayText": "+1 BW/legendary"
    }
  },
  "skill": {
    "id": "strengthInNumbers",
    "name": "数の力",
    "nameEn": "Strength in Numbers",
    "description": "レジェンダリーチップ1つにつき+5ダメージ",
    "descriptionEn": "+5 damage per legendary chip",
    "type": "buff",
    "buffType": "PRE_PIPELINE",
    "effect": { "flatBonusPerRarity": 5, "targetRarity": "legendary" },
    "chargesRequired": 5
  }
}
```

**Important:** Remove the old `"commoner"` key and add the new `"goldStar"` key.

**Step 3: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): rename commoner to gold star, reward legendaries instead"
```

---

### Task 12: Underdog Bot - Convert Multiplier to Flat Bonus

**Files:**
- Modify: `data/chips.json` (underdog entry, lines 820-852)

**Step 1: Edit underdog pipeline effect**

Change from multiplier to flat bonus:

```json
"effects": {
  "pipeline": {
    "type": "rarityRestriction",
    "target": "bandwidth",
    "forbiddenRarities": ["epic", "legendary"],
    "flatBonus": 1,
    "triggerChance": 1,
    "displayText": "+1 BW (no epic/legend)"
  }
}
```

Update descriptions:
- `"description": "エピック/レジェンダリーなしで+1帯域"`
- `"descriptionEn": "+1 BW if no epic/legendary chips equipped"`

Also update the skill effect to match (change multiplier to flat):

```json
"skill": {
  "id": "proveThemWrong",
  "name": "見返してやる",
  "nameEn": "Prove Them Wrong",
  "description": "エピック/レジェンダリーなしで次の攻撃+10ダメージ",
  "descriptionEn": "Next attack +10 (only if no epic/legendary)",
  "type": "buff",
  "buffType": "PRE_PIPELINE",
  "effect": { "flatBonus": 10 },
  "condition": "noEpicOrLegendary",
  "chargesRequired": 5
}
```

**Step 2: Verify JSON is valid**

Run: `node -e "require('./data/chips.json'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "fix(balance): underdog bot - convert to +1 flat bandwidth bonus"
```

---

### Task 13: Final Verification - Run E2E Tests

**Files:**
- None (verification only)

**Step 1: Run E2E tests**

Run: `./scripts/e2e-test.sh`

Expected: 60+/66 tests pass (known flakiness acceptable)

**Step 2: If tests pass, final commit (if any uncommitted changes)**

```bash
git status
# If clean, done. If changes, commit them.
```

---

## Summary

| Task | Chip | Change |
|------|------|--------|
| 1 | Speaker | ×1.2 BW → ×1.2 PWR |
| 2 | Glasses | +0.3 BW/hit → +3 PWR/hit |
| 3 | Straw | +0.2 BW, 4% heal → 5% heal only |
| 4 | Spark Plug | ×1.8 BW first → ×2 next PWR |
| 5 | Anchor | +8 PWR, ×1.5 BW last → +12 PWR last |
| 6 | Toolbox | +2 PWR, +0.3 BW/eq → +5 PWR/eq |
| 7 | Lightbulb | 50% ×1.5 BW → +1 BW every 4th |
| 8 | Feather | uncommon → rare |
| 9 | Eraser | rare → epic |
| 10 | Adrenaline | +1 BW/10 HP → +5 PWR/20 HP |
| 11 | Commoner | Rename Gold Star, +1 BW/legendary |
| 12 | Underdog | ×1.5 BW → +1 BW flat |
| 13 | Verify | E2E tests |

**Chips kept as-is (interesting conditionals):**
- Key (boss only)
- Egg (per destroyed chip)
- Drum (every 5th attack)
