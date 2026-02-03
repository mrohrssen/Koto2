# New Chips Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 12 new chips with meaningful trade-offs and build-around mechanics.

**Architecture:** Add chip definitions to `data/chips.json`, implement new effect types in `processPipelineChip()` in `src/game/items/chips.js`, add persistent state for degrading chips.

**Tech Stack:** Node.js, ES6 modules, node:test for testing

---

## Task 1: Add hpCost Effect Type (Needle Bot)

**Files:**
- Modify: `src/game/items/chips.js:363-585` (add case in processPipelineChip switch)
- Modify: `data/chips.json` (add needle chip)
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/pipeline-chips.test.js`:

```javascript
describe('Needle Bot (hpCost)', () => {
  it('should deal damage to player when triggered', () => {
    const player = { hp: 100, maxHp: 100 };
    const result = runPipeline([getChip('needle')], { player });
    // PWR 22, BW 4 → Damage = 22 × (1 + 4) = 110
    assert.strictEqual(result.powerPool, 22);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 110);
    assert.strictEqual(result.hpCost, 5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/michia/Documents/jrpg-wt-new-chips && node --test tests/unit/pipeline-chips.test.js 2>&1 | grep -A5 "Needle Bot"`

Expected: FAIL with "Chip not found: needle"

**Step 3: Add needle chip to chips.json**

Add to `data/chips.json` before the closing `}`:

```json
  "needle": {
    "id": "needle",
    "name": "針ボット",
    "nameEn": "Needle Bot",
    "description": "攻撃ごとにHP5消費。高火力！",
    "descriptionEn": "Costs 5 HP per attack. High power!",
    "category": "pipeline",
    "rarity": "rare",
    "stats": { "power": 22, "bandwidth": 4 },
    "effects": {
      "pipeline": {
        "type": "hpCost",
        "target": "meta",
        "hpCost": 5,
        "triggerChance": 1,
        "displayText": "-5 HP"
      }
    },
    "skill": {
      "id": "bloodPrice",
      "name": "血の代償",
      "nameEn": "Blood Price",
      "description": "次の攻撃×2.5倍、HP15消費",
      "descriptionEn": "Next attack ×2.5, costs 15 HP",
      "type": "buff",
      "buffType": "POST_PIPELINE",
      "effect": { "multiplier": 2.5, "hpCost": 15 },
      "chargesRequired": 5
    }
  }
```

**Step 4: Add hpCost case to processPipelineChip**

Add case in `src/game/items/chips.js` inside the switch statement (around line 580, before `default:`):

```javascript
    case 'hpCost':
      // Pure stat stick with HP cost - stats already summed, just track cost
      return {
        ...baseResult,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        hpCost: effect.hpCost || 0
      };
```

**Step 5: Aggregate hpCost in executeChipPipeline**

Add to state initialization (around line 613):

```javascript
    totalHpCost: 0,
```

Add after `if (result.healPlayer) state.totalHealPlayer += result.healPlayer;` (around line 761):

```javascript
      if (result.hpCost) state.totalHpCost += result.hpCost;
```

Add to return object (around line 835):

```javascript
    hpCost: state.totalHpCost,
```

**Step 6: Run test to verify it passes**

Run: `cd /Users/michia/Documents/jrpg-wt-new-chips && node --test tests/unit/pipeline-chips.test.js 2>&1 | grep -A5 "Needle Bot"`

Expected: PASS

**Step 7: Commit**

```bash
cd /Users/michia/Documents/jrpg-wt-new-chips
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Needle Bot with hpCost effect type"
```

---

## Task 2: Add missingHpBonus Effect Type (Adrenaline Bot)

**Files:**
- Modify: `src/game/items/chips.js` (add case in processPipelineChip)
- Modify: `data/chips.json` (add adrenaline chip)
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Adrenaline Bot (missingHpBonus)', () => {
  it('should add BW based on missing HP', () => {
    const player = { hp: 50, maxHp: 100 }; // 50 HP missing
    const result = runPipeline([getChip('adrenaline')], { player });
    // PWR 12, BW 2 base
    // 50 HP missing = +5 BW (1 per 10 missing)
    // Total BW = 2 + 5 = 7
    // Damage = 12 × (1 + 7) = 96
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 7);
    assert.strictEqual(result.finalDamage, 96);
  });

  it('should give no bonus at full HP', () => {
    const player = { hp: 100, maxHp: 100 };
    const result = runPipeline([getChip('adrenaline')], { player });
    // PWR 12, BW 2 base, no bonus
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 36); // 12 × (1 + 2)
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/michia/Documents/jrpg-wt-new-chips && node --test tests/unit/pipeline-chips.test.js 2>&1 | grep -A5 "Adrenaline Bot"`

Expected: FAIL

**Step 3: Add adrenaline chip to chips.json**

```json
  "adrenaline": {
    "id": "adrenaline",
    "name": "アドレナリンボット",
    "nameEn": "Adrenaline Bot",
    "description": "HP10減少ごとに+1帯域。ピンチで強い！",
    "descriptionEn": "+1 BW per 10 HP missing. Stronger when hurt!",
    "category": "pipeline",
    "rarity": "epic",
    "stats": { "power": 12, "bandwidth": 2 },
    "effects": {
      "pipeline": {
        "type": "missingHpBonus",
        "target": "bandwidth",
        "valuePer10Hp": 1,
        "triggerChance": 1,
        "displayText": "+1 BW/10 HP missing"
      }
    },
    "skill": {
      "id": "nearDeath",
      "name": "瀕死",
      "nameEn": "Near Death",
      "description": "HP20%以下で次の攻撃×3倍",
      "descriptionEn": "If below 20% HP, next attack ×3",
      "type": "buff",
      "buffType": "POST_PIPELINE",
      "effect": { "multiplier": 3.0 },
      "condition": "playerBelow20",
      "chargesRequired": 5
    }
  }
```

**Step 4: Add missingHpBonus case to processPipelineChip**

```javascript
    case 'missingHpBonus':
      // Add BW based on missing HP
      const missingHp = state.player ? (state.player.maxHp - state.player.hp) : 0;
      const hpBonus = Math.floor(missingHp / 10) * (effect.valuePer10Hp || 1);
      bandwidthAdd = hpBonus;
      return {
        ...baseResult,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        missingHpBonus: true,
        missingHp,
        displayText: `+${hpBonus} BW (${missingHp} HP missing)`
      };
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/michia/Documents/jrpg-wt-new-chips && node --test tests/unit/pipeline-chips.test.js 2>&1 | grep -A5 "Adrenaline Bot"`

Expected: PASS

**Step 6: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Adrenaline Bot with missingHpBonus effect type"
```

---

## Task 3: Add slotCount Effect Type (Duo Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Duo Bot (slotCount)', () => {
  it('should work with exactly 2 chips equipped', () => {
    const result = runPipeline([getChip('duo'), getChip('battery')], {
      weaponUsedSlots: 2
    });
    // Duo: PWR 18, BW 4 + Battery: PWR 10, BW 0
    // Total: PWR 28, BW 4
    // Damage = 28 × (1 + 4) = 140
    assert.strictEqual(result.powerPool, 28);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 140);
  });

  it('should contribute nothing with wrong chip count', () => {
    const result = runPipeline([getChip('duo'), getChip('battery'), getChip('speaker')], {
      weaponUsedSlots: 3
    });
    // Duo contributes 0 (wrong count), Battery: PWR 10, Speaker: PWR 10, BW 3
    // Total: PWR 20, BW 3
    // Damage = 20 × (1 + 3) = 80
    assert.strictEqual(result.powerPool, 20);
    assert.strictEqual(result.bandwidthPool, 3);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add duo chip to chips.json**

```json
  "duo": {
    "id": "duo",
    "name": "二人組ボット",
    "nameEn": "Duo Bot",
    "description": "チップ2つ装備時のみ有効。二人三脚！",
    "descriptionEn": "Only works with exactly 2 chips equipped. Perfect pair!",
    "category": "pipeline",
    "rarity": "rare",
    "stats": { "power": 18, "bandwidth": 4 },
    "effects": {
      "pipeline": {
        "type": "slotCount",
        "target": "meta",
        "requiredCount": 2,
        "triggerChance": 1,
        "displayText": "2 chips only"
      }
    },
    "skill": {
      "id": "perfectPair",
      "name": "完璧な二人",
      "nameEn": "Perfect Pair",
      "description": "チップ2つ装備時、次の攻撃×2倍",
      "descriptionEn": "Next attack ×2 (only if 2 chips)",
      "type": "buff",
      "buffType": "POST_PIPELINE",
      "effect": { "multiplier": 2.0 },
      "condition": "exactlyTwoChips",
      "chargesRequired": 5
    }
  }
```

**Step 4: Modify stat summing to check slotCount chips**

In `executeChipPipeline`, modify the first pass stat summing loop (around line 618-655) to skip slotCount chips that don't meet their condition:

```javascript
  for (const chip of weaponChips) {
    if (chip.category === 'pipeline' && chip.stats) {
      // Check slotCount restriction before adding stats
      const effect = chip.effects?.pipeline;
      if (effect?.type === 'slotCount') {
        if (state.weaponUsedSlots !== effect.requiredCount) {
          console.log(`[Pipeline] ${chip.nameEn || chip.id}: DISABLED (need ${effect.requiredCount} chips, have ${state.weaponUsedSlots})`);
          continue; // Skip this chip's stats entirely
        }
      }

      let statPower = chip.stats.power || 0;
      // ... rest of existing code
```

**Step 5: Add slotCount case to processPipelineChip**

```javascript
    case 'slotCount':
      // Check if exact chip count requirement is met
      if (state.weaponUsedSlots !== effect.requiredCount) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          displayText: `Need ${effect.requiredCount} chips`
        };
      }
      // Condition met - pure stat stick (stats already added in first pass)
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 6: Run test to verify it passes**

Expected: PASS

**Step 7: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Duo Bot with slotCount effect type"
```

---

## Task 4: Add degradePerAttack Effect Type (Ice Cream Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Ice Cream Bot (degradePerAttack)', () => {
  it('should track degradation amount', () => {
    const result = runPipeline([getChip('iceCream')]);
    // PWR 14, BW 6 → Damage = 14 × (1 + 6) = 98
    assert.strictEqual(result.powerPool, 14);
    assert.strictEqual(result.bandwidthPool, 6);
    assert.strictEqual(result.finalDamage, 98);
    assert.strictEqual(result.degradation?.iceCream, 0.5);
  });

  it('should use reduced BW from combatStacks', () => {
    const combatStacks = { iceCream_degraded: 2 }; // Already degraded 1 BW
    const result = runPipeline([getChip('iceCream')], { combatStacks });
    // PWR 14, BW 6 - 1 = 5 → Damage = 14 × (1 + 5) = 84
    assert.strictEqual(result.bandwidthPool, 5);
    assert.strictEqual(result.finalDamage, 84);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add iceCream chip to chips.json**

```json
  "iceCream": {
    "id": "iceCream",
    "name": "アイスボット",
    "nameEn": "Ice Cream Bot",
    "description": "攻撃ごとに帯域-0.5。溶けていく！",
    "descriptionEn": "Loses 0.5 BW per attack. Melting fast!",
    "category": "pipeline",
    "rarity": "uncommon",
    "stats": { "power": 14, "bandwidth": 6 },
    "effects": {
      "pipeline": {
        "type": "degradePerAttack",
        "target": "bandwidth",
        "degradeAmount": 0.5,
        "triggerChance": 1,
        "displayText": "-0.5 BW/attack"
      }
    },
    "skill": {
      "id": "brainFreeze",
      "name": "頭キーン",
      "nameEn": "Brain Freeze",
      "description": "この戦闘中、劣化を停止",
      "descriptionEn": "Freeze degradation for this combat",
      "type": "buff",
      "buffType": "COMBAT_MODIFIER",
      "effect": { "freezeDegradation": true },
      "chargesRequired": 5
    }
  }
```

**Step 4: Modify stat summing to apply degradation**

In the stat summing loop, after getting base stats, apply degradation:

```javascript
      // Apply degradation from previous attacks
      const degradeKey = chip.id + '_degraded';
      const totalDegraded = state.combatStacks[degradeKey] || 0;
      if (chip.effects?.pipeline?.type === 'degradePerAttack' && totalDegraded > 0) {
        const degradeTarget = chip.effects.pipeline.target;
        if (degradeTarget === 'bandwidth') {
          statBandwidth = Math.max(0, statBandwidth - totalDegraded);
        } else if (degradeTarget === 'power') {
          statPower = Math.max(0, statPower - totalDegraded);
        }
      }
```

**Step 5: Add degradePerAttack case to processPipelineChip**

```javascript
    case 'degradePerAttack':
      // Track degradation for next attack
      const degradeKey = chip.id + '_degraded';
      if (!state.combatStacks) state.combatStacks = {};
      state.combatStacks[degradeKey] = (state.combatStacks[degradeKey] || 0) + effect.degradeAmount;
      // Track in result for return value
      if (!state.degradation) state.degradation = {};
      state.degradation[chip.id] = effect.degradeAmount;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 6: Add degradation to state and return**

In state initialization:
```javascript
    degradation: {},
```

In return object:
```javascript
    degradation: state.degradation,
```

**Step 7: Run test to verify it passes**

Expected: PASS

**Step 8: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Ice Cream Bot with degradePerAttack effect type"
```

---

## Task 5: Add degradePerCombat Effect Type (Candle Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Candle Bot (degradePerCombat)', () => {
  it('should return combat degradation info', () => {
    const result = runPipeline([getChip('candle')]);
    // PWR 16, BW 5 → Damage = 16 × (1 + 5) = 96
    assert.strictEqual(result.powerPool, 16);
    assert.strictEqual(result.bandwidthPool, 5);
    assert.strictEqual(result.combatDegradation?.candle, 1);
  });

  it('should use reduced BW from player chip state', () => {
    const player = {
      _chipDegradation: { candle: 2 } // Already lost 2 BW
    };
    const result = runPipeline([getChip('candle')], { player });
    // PWR 16, BW 5 - 2 = 3 → Damage = 16 × (1 + 3) = 64
    assert.strictEqual(result.bandwidthPool, 3);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add candle chip to chips.json**

```json
  "candle": {
    "id": "candle",
    "name": "蝋燭ボット",
    "nameEn": "Candle Bot",
    "description": "戦闘ごとに帯域-1。0で破壊。",
    "descriptionEn": "Loses 1 BW after each combat. Destroyed at 0.",
    "category": "pipeline",
    "rarity": "rare",
    "stats": { "power": 16, "bandwidth": 5 },
    "effects": {
      "pipeline": {
        "type": "degradePerCombat",
        "target": "bandwidth",
        "degradeAmount": 1,
        "destroyAtZero": true,
        "triggerChance": 1,
        "displayText": "-1 BW/combat"
      }
    },
    "skill": {
      "id": "lastLight",
      "name": "最後の灯",
      "nameEn": "Last Light",
      "description": "残り帯域×8のダメージ",
      "descriptionEn": "Deal remaining BW ×8 as direct damage",
      "type": "instant",
      "effect": { "damageFromBandwidth": true, "bwMultiplier": 8 },
      "chargesRequired": 5
    }
  }
```

**Step 4: Modify stat summing to apply persistent degradation**

In the stat summing loop:

```javascript
      // Apply persistent degradation (per-combat type)
      if (chip.effects?.pipeline?.type === 'degradePerCombat' && state.player?._chipDegradation) {
        const persistentDegraded = state.player._chipDegradation[chip.id] || 0;
        const degradeTarget = chip.effects.pipeline.target;
        if (degradeTarget === 'bandwidth') {
          statBandwidth = Math.max(0, statBandwidth - persistentDegraded);
        } else if (degradeTarget === 'power') {
          statPower = Math.max(0, statPower - persistentDegraded);
        }
      }
```

**Step 5: Add degradePerCombat case to processPipelineChip**

```javascript
    case 'degradePerCombat':
      // Track degradation to apply after combat ends
      if (!state.combatDegradation) state.combatDegradation = {};
      state.combatDegradation[chip.id] = effect.degradeAmount;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 6: Add combatDegradation to state and return**

In state initialization:
```javascript
    combatDegradation: {},
```

In return object:
```javascript
    combatDegradation: state.combatDegradation,
```

**Step 7: Run test to verify it passes**

Expected: PASS

**Step 8: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Candle Bot with degradePerCombat effect type"
```

---

## Task 6: Add rarityBonus Effect Type (Commoner Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Commoner Bot (rarityBonus)', () => {
  it('should add BW per common chip', () => {
    // Commoner is common, battery is common, onigiri is common
    const chips = [getChip('commoner'), getChip('battery'), getChip('onigiri')];
    const result = runPipeline(chips, {
      equippedChipRarities: ['common', 'common', 'common']
    });
    // Commoner: PWR 8, BW 1 + Battery: PWR 10, BW 0 + Onigiri: PWR 9, BW 0
    // Total base: PWR 27, BW 1
    // Commoner effect: +2 BW × 3 common = +6 BW
    // Total: PWR 27, BW 7
    // Damage = 27 × (1 + 7) = 216
    assert.strictEqual(result.bandwidthPool, 7);
    assert.strictEqual(result.finalDamage, 216);
  });

  it('should not count non-common chips', () => {
    const chips = [getChip('commoner'), getChip('speaker')]; // speaker is rare
    const result = runPipeline(chips, {
      equippedChipRarities: ['common', 'rare']
    });
    // Only 1 common chip (commoner itself)
    // Commoner: PWR 8, BW 1 + Speaker: PWR 10, BW 3
    // Total base: PWR 18, BW 4
    // Commoner effect: +2 BW × 1 common = +2 BW
    // Total: PWR 18, BW 6
    assert.strictEqual(result.bandwidthPool, 6);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add commoner chip to chips.json**

```json
  "commoner": {
    "id": "commoner",
    "name": "庶民ボット",
    "nameEn": "Commoner Bot",
    "description": "コモンチップ1つにつき+2帯域。庶民の力！",
    "descriptionEn": "+2 BW per common chip equipped. People power!",
    "category": "pipeline",
    "rarity": "common",
    "stats": { "power": 8, "bandwidth": 1 },
    "effects": {
      "pipeline": {
        "type": "rarityBonus",
        "target": "bandwidth",
        "targetRarity": "common",
        "valuePerChip": 2,
        "triggerChance": 1,
        "displayText": "+2 BW/common"
      }
    },
    "skill": {
      "id": "strengthInNumbers",
      "name": "数の力",
      "nameEn": "Strength in Numbers",
      "description": "コモンチップ1つにつき+5ダメージ",
      "descriptionEn": "+5 damage per common chip",
      "type": "buff",
      "buffType": "PRE_PIPELINE",
      "effect": { "flatBonusPerRarity": 5, "targetRarity": "common" },
      "chargesRequired": 5
    }
  }
```

**Step 4: Add equippedChipRarities to context**

In `executeChipPipeline`, add to state initialization:
```javascript
    equippedChipRarities: context.equippedChipRarities || weaponChips.map(c => c.rarity || 'common'),
```

**Step 5: Add rarityBonus case to processPipelineChip**

```javascript
    case 'rarityBonus':
      // Add value per chip of target rarity
      const rarities = state.equippedChipRarities || [];
      const matchCount = rarities.filter(r => r === effect.targetRarity).length;
      const rarityBonusValue = matchCount * (effect.valuePerChip || 0);
      if (target === 'bandwidth') bandwidthAdd = rarityBonusValue;
      else if (target === 'power') powerAdd = rarityBonusValue;
      return {
        ...baseResult,
        powerAdd, powerMult, bandwidthAdd, bandwidthMult,
        rarityBonus: true,
        matchCount,
        displayText: `+${rarityBonusValue} (${matchCount} ${effect.targetRarity})`
      };
```

**Step 6: Run test to verify it passes**

Expected: PASS

**Step 7: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Commoner Bot with rarityBonus effect type"
```

---

## Task 7: Add rarityRestriction Effect Type (Underdog Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Underdog Bot (rarityRestriction)', () => {
  it('should multiply BW with no epic/legendary chips', () => {
    const chips = [getChip('underdog'), getChip('battery')];
    const result = runPipeline(chips, {
      equippedChipRarities: ['uncommon', 'common']
    });
    // Underdog: PWR 10, BW 2 + Battery: PWR 10, BW 0
    // Total base: PWR 20, BW 2
    // Underdog effect: ×1.5 BW → BW 3
    // Damage = 20 × (1 + 3) = 80
    assert.strictEqual(result.bandwidthPool, 3);
    assert.strictEqual(result.finalDamage, 80);
  });

  it('should not trigger with epic chip equipped', () => {
    const chips = [getChip('underdog'), getChip('adrenaline')]; // adrenaline is epic
    const result = runPipeline(chips, {
      equippedChipRarities: ['uncommon', 'epic']
    });
    // No multiplier applied
    // Underdog: PWR 10, BW 2 + Adrenaline: PWR 12, BW 2
    // Total: PWR 22, BW 4
    assert.strictEqual(result.bandwidthPool, 4);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add underdog chip to chips.json**

```json
  "underdog": {
    "id": "underdog",
    "name": "弱者ボット",
    "nameEn": "Underdog Bot",
    "description": "エピック/レジェンダリーなしで帯域×1.5倍",
    "descriptionEn": "×1.5 BW if no epic/legendary chips equipped",
    "category": "pipeline",
    "rarity": "uncommon",
    "stats": { "power": 10, "bandwidth": 2 },
    "effects": {
      "pipeline": {
        "type": "rarityRestriction",
        "target": "bandwidth",
        "forbiddenRarities": ["epic", "legendary"],
        "multiplier": 1.5,
        "triggerChance": 1,
        "displayText": "×1.5 BW (no epic/legend)"
      }
    },
    "skill": {
      "id": "proveThemWrong",
      "name": "見返してやる",
      "nameEn": "Prove Them Wrong",
      "description": "エピック/レジェンダリーなしで次の攻撃×2倍",
      "descriptionEn": "Next attack ×2 (only if no epic/legendary)",
      "type": "buff",
      "buffType": "POST_PIPELINE",
      "effect": { "multiplier": 2.0 },
      "condition": "noEpicOrLegendary",
      "chargesRequired": 5
    }
  }
```

**Step 4: Add rarityRestriction case to processPipelineChip**

```javascript
    case 'rarityRestriction':
      // Multiply if no forbidden rarities present
      const equippedRarities = state.equippedChipRarities || [];
      const hasForbidden = equippedRarities.some(r => effect.forbiddenRarities.includes(r));
      if (hasForbidden) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          displayText: 'Forbidden rarity equipped'
        };
      }
      applyMult(effect.multiplier);
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 5: Run test to verify it passes**

Expected: PASS

**Step 6: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Underdog Bot with rarityRestriction effect type"
```

---

## Task 8: Add positionBonus Effect Type (Anchor Bot + Spark Plug Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Anchor Bot (positionBonus - last)', () => {
  it('should give bonus when in last slot', () => {
    const chips = [getChip('battery'), getChip('anchor')];
    const result = runPipeline(chips, {
      weaponUsedSlots: 2
    });
    // Battery: PWR 10, BW 0 + Anchor: PWR 12, BW 2
    // Total base: PWR 22, BW 2
    // Anchor in position 1 (last of 2): +8 PWR, ×1.5 BW
    // PWR = 22 + 8 = 30, BW = 2 × 1.5 = 3
    // Damage = 30 × (1 + 3) = 120
    assert.strictEqual(result.powerPool, 30);
    assert.strictEqual(result.bandwidthPool, 3);
  });

  it('should not give bonus when not in last slot', () => {
    const chips = [getChip('anchor'), getChip('battery')];
    const result = runPipeline(chips, {
      weaponUsedSlots: 2
    });
    // Anchor in position 0 (not last): no bonus
    // PWR 22, BW 2
    assert.strictEqual(result.powerPool, 22);
    assert.strictEqual(result.bandwidthPool, 2);
  });
});

describe('Spark Plug Bot (positionBonus - first)', () => {
  it('should give bonus when in first slot', () => {
    const chips = [getChip('sparkPlug'), getChip('battery')];
    const result = runPipeline(chips, {
      weaponUsedSlots: 2
    });
    // Spark Plug: PWR 10, BW 3 + Battery: PWR 10, BW 0
    // Total base: PWR 20, BW 3
    // Spark Plug in position 0 (first): ×1.8 BW
    // BW = 3 × 1.8 = 5.4
    // Damage = 20 × (1 + 5.4) = 128
    assert.strictEqual(result.powerPool, 20);
    assert.strictEqual(result.bandwidthPool, 5.4);
    assert.strictEqual(result.finalDamage, 128);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add anchor and sparkPlug chips to chips.json**

```json
  "anchor": {
    "id": "anchor",
    "name": "錨ボット",
    "nameEn": "Anchor Bot",
    "description": "最後のスロットで+8パワー、帯域×1.5倍",
    "descriptionEn": "+8 PWR and ×1.5 BW if in LAST slot",
    "category": "pipeline",
    "rarity": "rare",
    "stats": { "power": 12, "bandwidth": 2 },
    "effects": {
      "pipeline": {
        "type": "positionBonus",
        "position": "last",
        "powerAdd": 8,
        "bandwidthMult": 1.5,
        "triggerChance": 1,
        "displayText": "+8 PWR ×1.5 BW (last)"
      }
    },
    "skill": {
      "id": "holdTheLine",
      "name": "死守",
      "nameEn": "Hold the Line",
      "description": "最後のスロットで次の攻撃+20ダメージ",
      "descriptionEn": "Next attack +20 damage (only if last slot)",
      "type": "buff",
      "buffType": "PRE_PIPELINE",
      "effect": { "flatBonus": 20 },
      "condition": "lastSlot",
      "chargesRequired": 5
    }
  },
  "sparkPlug": {
    "id": "sparkPlug",
    "name": "点火ボット",
    "nameEn": "Spark Plug Bot",
    "description": "最初のスロットで帯域×1.8倍",
    "descriptionEn": "×1.8 BW if in FIRST slot",
    "category": "pipeline",
    "rarity": "rare",
    "stats": { "power": 10, "bandwidth": 3 },
    "effects": {
      "pipeline": {
        "type": "positionBonus",
        "position": "first",
        "bandwidthMult": 1.8,
        "triggerChance": 1,
        "displayText": "×1.8 BW (first)"
      }
    },
    "skill": {
      "id": "ignition",
      "name": "点火",
      "nameEn": "Ignition",
      "description": "この戦闘の最初の攻撃×2倍",
      "descriptionEn": "First attack this combat ×2",
      "type": "buff",
      "buffType": "POST_PIPELINE",
      "effect": { "multiplier": 2.0 },
      "condition": "firstAttack",
      "chargesRequired": 5
    }
  }
```

**Step 4: Track chip index in pipeline execution**

In the while loop of `executeChipPipeline`, pass chipIndex to processPipelineChip:

```javascript
    // Add to state before processing
    state.currentChipIndex = chipIndex;
    state.totalChipCount = weaponChips.length;
```

**Step 5: Add positionBonus case to processPipelineChip**

```javascript
    case 'positionBonus':
      // Check if in correct position
      const isFirst = state.currentChipIndex === 0;
      const isLast = state.currentChipIndex === state.totalChipCount - 1;
      const positionMatch =
        (effect.position === 'first' && isFirst) ||
        (effect.position === 'last' && isLast);

      if (!positionMatch) {
        return {
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          triggered: false,
          conditionFailed: true,
          displayText: `Not in ${effect.position} slot`
        };
      }

      // Apply bonuses
      powerAdd = effect.powerAdd || 0;
      if (effect.bandwidthMult) bandwidthMult = effect.bandwidthMult;
      if (effect.powerMult) powerMult = effect.powerMult;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 6: Run test to verify it passes**

Expected: PASS

**Step 7: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Anchor Bot and Spark Plug Bot with positionBonus effect type"
```

---

## Task 9: Add healingToDamage Effect Type (Leech Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Leech Bot (healingToDamage)', () => {
  it('should convert healing to bonus damage', () => {
    // Leech + Onigiri (heals 5 per attack)
    const chips = [getChip('leech'), getChip('onigiri')];
    const result = runPipeline(chips);
    // Leech: PWR 8, BW 2 + Onigiri: PWR 9, BW 0
    // Total base: PWR 17, BW 2
    // Onigiri heals 5 → Leech converts to +5 damage
    // Damage = 17 × (1 + 2) + 5 = 56
    assert.strictEqual(result.healPlayer, 5);
    assert.strictEqual(result.healingToDamage, 5);
    assert.strictEqual(result.finalDamage, 56);
  });

  it('should work without other healing chips', () => {
    const result = runPipeline([getChip('leech')]);
    // No healing, no bonus damage
    assert.strictEqual(result.healingToDamage, 0);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add leech chip to chips.json**

```json
  "leech": {
    "id": "leech",
    "name": "ヒルボット",
    "nameEn": "Leech Bot",
    "description": "回復量と同じダメージを敵に与える",
    "descriptionEn": "Healing you receive also deals equal damage to enemy",
    "category": "pipeline",
    "rarity": "epic",
    "stats": { "power": 8, "bandwidth": 2 },
    "effects": {
      "pipeline": {
        "type": "healingToDamage",
        "target": "meta",
        "triggerChance": 1,
        "displayText": "heal → damage"
      }
    },
    "skill": {
      "id": "drainLife",
      "name": "生命吸収",
      "nameEn": "Drain Life",
      "description": "HP10回復、10ダメージ",
      "descriptionEn": "Heal 10 HP and deal 10 damage",
      "type": "instant",
      "effect": { "heal": 10, "damage": 10 },
      "chargesRequired": 5
    }
  }
```

**Step 4: Add healingToDamage case to processPipelineChip**

```javascript
    case 'healingToDamage':
      // Mark that healing should be converted to damage
      state.healingToDamageActive = true;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 5: Apply healingToDamage at end of pipeline**

Before calculating finalDamage in `executeChipPipeline`:

```javascript
  // Apply healing to damage conversion
  let healingToDamage = 0;
  if (state.healingToDamageActive && state.totalHealPlayer > 0) {
    healingToDamage = state.totalHealPlayer;
  }

  // Calculate final damage using dual-pool formula: POWER × (1 + BANDWIDTH)
  const finalDamage = Math.floor(state.powerPool * (1 + state.bandwidthPool)) + healingToDamage;
```

Add to return:
```javascript
    healingToDamage,
```

**Step 6: Run test to verify it passes**

Expected: PASS

**Step 7: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Leech Bot with healingToDamage effect type"
```

---

## Task 10: Add lifesteal Effect Type (Vampire Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Vampire Bot (lifesteal)', () => {
  it('should return lifesteal percentage and disable other healing', () => {
    const chips = [getChip('vampire'), getChip('onigiri')];
    const result = runPipeline(chips);
    // Vampire: PWR 14, BW 3 + Onigiri: PWR 9, BW 0
    // Total base: PWR 23, BW 3
    // Damage = 23 × (1 + 3) = 92
    // Lifesteal: 5% of 92 = 4.6 → 4 HP
    // Onigiri healing DISABLED
    assert.strictEqual(result.finalDamage, 92);
    assert.strictEqual(result.lifestealPercent, 0.05);
    assert.strictEqual(result.healPlayer, 0); // Disabled by vampire
  });

  it('should work alone without disabling anything', () => {
    const result = runPipeline([getChip('vampire')]);
    // PWR 14, BW 3 → Damage = 14 × (1 + 3) = 56
    // Lifesteal: 5% of 56 = 2.8 → 2 HP
    assert.strictEqual(result.lifestealPercent, 0.05);
    assert.strictEqual(result.finalDamage, 56);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add vampire chip to chips.json**

```json
  "vampire": {
    "id": "vampire",
    "name": "吸血ボット",
    "nameEn": "Vampire Bot",
    "description": "ダメージの5%をHP回復。他の回復無効。",
    "descriptionEn": "5% of damage dealt heals you. Disables other healing.",
    "category": "pipeline",
    "rarity": "rare",
    "stats": { "power": 14, "bandwidth": 3 },
    "effects": {
      "pipeline": {
        "type": "lifesteal",
        "target": "meta",
        "lifestealPercent": 0.05,
        "disableOtherHealing": true,
        "triggerChance": 1,
        "displayText": "5% lifesteal"
      }
    },
    "skill": {
      "id": "bloodPact",
      "name": "血の契約",
      "nameEn": "Blood Pact",
      "description": "次の攻撃のライフスティール20%",
      "descriptionEn": "Next attack heals 20% of damage dealt",
      "type": "buff",
      "buffType": "POST_PIPELINE",
      "effect": { "lifestealOverride": 0.20 },
      "chargesRequired": 5
    }
  }
```

**Step 4: Add lifesteal case to processPipelineChip**

```javascript
    case 'lifesteal':
      // Set lifesteal percentage and optionally disable other healing
      state.lifestealPercent = effect.lifestealPercent || 0;
      if (effect.disableOtherHealing) {
        state.disableOtherHealing = true;
      }
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 5: Apply disableOtherHealing in heal accumulation**

Modify the heal accumulation line:

```javascript
      if (result.healPlayer && !state.disableOtherHealing) {
        state.totalHealPlayer += result.healPlayer;
      }
```

**Step 6: Add lifestealPercent to state and return**

In state initialization:
```javascript
    lifestealPercent: 0,
    disableOtherHealing: false,
```

In return object:
```javascript
    lifestealPercent: state.lifestealPercent,
```

**Step 7: Run test to verify it passes**

Expected: PASS

**Step 8: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Vampire Bot with lifesteal effect type"
```

---

## Task 11: Add selfDamagePerTrigger Effect Type (Overclocked Bot)

**Files:**
- Modify: `src/game/items/chips.js`
- Modify: `data/chips.json`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write the failing test**

```javascript
describe('Overclocked Bot (selfDamagePerTrigger)', () => {
  it('should track total self damage from all triggers', () => {
    // Overclocked + battery (stat stick, triggers) + speaker (80% trigger)
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Speaker triggers (< 0.8)

    try {
      const chips = [getChip('overclocked'), getChip('battery'), getChip('speaker')];
      const result = runPipeline(chips);
      // All 3 chips trigger, Overclocked deals 3 damage per trigger
      // Self damage = 3 × 3 = 9
      assert.strictEqual(result.selfDamage, 9);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should have high stats to offset self-damage', () => {
    const result = runPipeline([getChip('overclocked')]);
    // PWR 25, BW 5 → Damage = 25 × (1 + 5) = 150
    assert.strictEqual(result.powerPool, 25);
    assert.strictEqual(result.bandwidthPool, 5);
    assert.strictEqual(result.finalDamage, 150);
    assert.strictEqual(result.selfDamage, 3); // Only itself triggers
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL

**Step 3: Add overclocked chip to chips.json**

```json
  "overclocked": {
    "id": "overclocked",
    "name": "過負荷ボット",
    "nameEn": "Overclocked Bot",
    "description": "チップ発動ごとに3ダメージを受ける",
    "descriptionEn": "Take 3 damage every time ANY chip triggers",
    "category": "pipeline",
    "rarity": "epic",
    "stats": { "power": 25, "bandwidth": 5 },
    "effects": {
      "pipeline": {
        "type": "selfDamagePerTrigger",
        "target": "meta",
        "damagePerTrigger": 3,
        "triggerChance": 1,
        "displayText": "-3 HP/trigger"
      }
    },
    "skill": {
      "id": "overclock",
      "name": "限界突破",
      "nameEn": "Overclock",
      "description": "全チップ効果2倍、自傷も2倍",
      "descriptionEn": "Double all chip effects, take double self-damage",
      "type": "buff",
      "buffType": "PIPELINE_MODIFIER",
      "effect": { "doubleEffects": true, "doubleSelfDamage": true },
      "chargesRequired": 5
    }
  }
```

**Step 4: Add selfDamagePerTrigger case and trigger counting**

First, add to state initialization:
```javascript
    selfDamagePerTrigger: 0,
    triggerCount: 0,
```

Add case:
```javascript
    case 'selfDamagePerTrigger':
      // Record damage per trigger - actual counting happens elsewhere
      state.selfDamagePerTrigger = effect.damagePerTrigger || 0;
      return { ...baseResult, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 5: Count triggers and calculate self damage**

After processing each chip (after `state.firedChips.push(result)`):

```javascript
    // Count triggers for selfDamagePerTrigger
    if (result.triggered) {
      state.triggerCount++;
    }
```

Before return, calculate total self damage:

```javascript
  // Calculate self damage from triggers
  const selfDamage = state.selfDamagePerTrigger * state.triggerCount;
```

Add to return:
```javascript
    selfDamage,
```

**Step 6: Run test to verify it passes**

Expected: PASS

**Step 7: Commit**

```bash
git add data/chips.json src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat(chips): add Overclocked Bot with selfDamagePerTrigger effect type"
```

---

## Task 12: Update Pipeline Chip Tests and Verify All Tests Pass

**Files:**
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Update the "should have all X pipeline chips defined" test**

Find and update the test that lists all pipeline chips:

```javascript
describe('Pipeline Chip Definitions', () => {
  it('should have all 27 pipeline chips defined', () => {
    const allChips = [
      // Original 15
      'battery', 'speaker', 'glasses', 'lightbulb', 'scissors',
      'clock', 'charcoal', 'book', 'eraser', 'onigiri',
      'wallet', 'straw', 'key', 'egg', 'fireworks',
      'mirror', 'feather', 'drum', 'magnifyingGlass', 'toolbox',
      // New 12
      'needle', 'adrenaline', 'duo', 'iceCream', 'candle',
      'commoner', 'underdog', 'anchor', 'sparkPlug', 'leech',
      'vampire', 'overclocked'
    ];
    // ... rest of test
  });
});
```

**Step 2: Run all pipeline tests**

Run: `cd /Users/michia/Documents/jrpg-wt-new-chips && node --test tests/unit/pipeline-chips.test.js`

Expected: All tests pass

**Step 3: Run full unit test suite**

Run: `cd /Users/michia/Documents/jrpg-wt-new-chips && npm run test:unit`

Expected: 195+ passing (same or better than baseline)

**Step 4: Commit**

```bash
git add tests/unit/pipeline-chips.test.js
git commit -m "test(chips): update pipeline chip test count for new chips"
```

---

## Task 13: Integration Test - Run E2E Tests

**Files:**
- None (verification only)

**Step 1: Run E2E tests**

```bash
cd /Users/michia/Documents/jrpg-wt-new-chips
./scripts/e2e-test.sh
```

Expected: 60+/66 tests pass (acceptable threshold per CLAUDE.md)

**Step 2: If tests fail, debug and fix**

Check for regressions in chip-related flows.

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: address any E2E test regressions"
```

---

## Summary

| Task | Chip | Effect Type |
|------|------|-------------|
| 1 | Needle Bot | hpCost |
| 2 | Adrenaline Bot | missingHpBonus |
| 3 | Duo Bot | slotCount |
| 4 | Ice Cream Bot | degradePerAttack |
| 5 | Candle Bot | degradePerCombat |
| 6 | Commoner Bot | rarityBonus |
| 7 | Underdog Bot | rarityRestriction |
| 8 | Anchor + Spark Plug | positionBonus |
| 9 | Leech Bot | healingToDamage |
| 10 | Vampire Bot | lifesteal |
| 11 | Overclocked Bot | selfDamagePerTrigger |
| 12-13 | - | Test verification |
