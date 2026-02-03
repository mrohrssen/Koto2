# Chip HP Stat & Archetype System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add HP as a third chip stat and classify chips into archetypes, enabling tank vs glass cannon build diversity.

**Architecture:** Add `hp` and `archetype` fields to chip definitions, modify maxHP calculation to sum equipped chip HP (with level scaling), convert healing effects to percentage-based, update UI to display HP stat.

**Tech Stack:** Node.js ES modules, Playwright for E2E tests, vanilla JS frontend

**Status:** All 32 chips are in master (12 new chips from feature/new-chips already merged).

---

## Task 1: Add Archetype Config

**Files:**
- Modify: `data/chip-config.json`

**Step 1: Add archetype definitions to chip-config.json**

Add after the `"rarities"` section in `data/chip-config.json`:

```json
  "archetypes": {
    "tank": {
      "id": "tank",
      "name": "タンク",
      "nameEn": "Tank",
      "description": "High HP, low damage - survive and outlast",
      "hpRange": [70, 100],
      "pwrRange": [5, 10],
      "bwRange": [0, 1]
    },
    "healer": {
      "id": "healer",
      "name": "ヒーラー",
      "nameEn": "Healer",
      "description": "Medium HP, sustain through recovery effects",
      "hpRange": [50, 70],
      "pwrRange": [5, 10],
      "bwRange": [0, 2]
    },
    "striker": {
      "id": "striker",
      "name": "ストライカー",
      "nameEn": "Striker",
      "description": "High PWR, medium survivability",
      "hpRange": [30, 50],
      "pwrRange": [12, 25],
      "bwRange": [0, 2]
    },
    "amplifier": {
      "id": "amplifier",
      "name": "アンプ",
      "nameEn": "Amplifier",
      "description": "Glass cannon - high BW multipliers, low HP",
      "hpRange": [10, 30],
      "pwrRange": [5, 10],
      "bwRange": [2, 6]
    },
    "trickster": {
      "id": "trickster",
      "name": "トリックスター",
      "nameEn": "Trickster",
      "description": "Chaotic effects, variable stats, high variance",
      "hpRange": [20, 50],
      "pwrRange": [8, 18],
      "bwRange": [1, 3]
    }
  },
```

**Step 2: Commit**

```bash
git add data/chip-config.json
git commit -m "feat(chips): add archetype definitions to config"
```

---

## Task 2: Add HP and Archetype to All 32 Chips

**Files:**
- Modify: `data/chips.json`

**Step 1: Update chips.json with HP stats and archetypes**

For each chip, add `hp` to the `stats` object and add `archetype` field. Update all 32 chips:

### Original 20 Chips

**Tank chips:**
```json
"eraser": {
  ...
  "archetype": "tank",
  "stats": { "power": 12, "bandwidth": 2, "hp": 75 },
  ...
}

"egg": {
  ...
  "archetype": "tank",
  "stats": { "power": 15, "bandwidth": 2, "hp": 85 },
  ...
}
```

**Healer chips:**
```json
"onigiri": {
  ...
  "archetype": "healer",
  "stats": { "power": 9, "bandwidth": 0, "hp": 60 },
  ...
}

"straw": {
  ...
  "archetype": "healer",
  "stats": { "power": 6, "bandwidth": 2, "hp": 65 },
  ...
}

"charcoal": {
  ...
  "archetype": "healer",
  "stats": { "power": 20, "bandwidth": 3, "hp": 50 },
  ...
}
```

**Striker chips:**
```json
"battery": {
  ...
  "archetype": "striker",
  "stats": { "power": 10, "bandwidth": 0, "hp": 45 },
  ...
}

"scissors": {
  ...
  "archetype": "striker",
  "stats": { "power": 14, "bandwidth": 1, "hp": 40 },
  ...
}

"wallet": {
  ...
  "archetype": "striker",
  "stats": { "power": 11, "bandwidth": 1, "hp": 45 },
  ...
}

"toolbox": {
  ...
  "archetype": "striker",
  "stats": { "power": 10, "bandwidth": 1, "hp": 50 },
  ...
}
```

**Amplifier chips:**
```json
"speaker": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 10, "bandwidth": 3, "hp": 25 },
  ...
}

"glasses": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 8, "bandwidth": 3, "hp": 25 },
  ...
}

"lightbulb": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 10, "bandwidth": 2, "hp": 30 },
  ...
}

"key": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 13, "bandwidth": 2, "hp": 25 },
  ...
}

"drum": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 15, "bandwidth": 3, "hp": 20 },
  ...
}

"magnifyingGlass": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 14, "bandwidth": 3, "hp": 20 },
  ...
}
```

**Trickster chips:**
```json
"clock": {
  ...
  "archetype": "trickster",
  "stats": { "power": 18, "bandwidth": 2, "hp": 35 },
  ...
}

"book": {
  ...
  "archetype": "trickster",
  "stats": { "power": 9, "bandwidth": 2, "hp": 45 },
  ...
}

"fireworks": {
  ...
  "archetype": "trickster",
  "stats": { "power": 17, "bandwidth": 2, "hp": 40 },
  ...
}

"mirror": {
  ...
  "archetype": "trickster",
  "stats": { "power": 18, "bandwidth": 3, "hp": 30 },
  ...
}

"feather": {
  ...
  "archetype": "trickster",
  "stats": { "power": 11, "bandwidth": 2, "hp": 40 },
  ...
}
```

### New 12 Chips

**Striker chips:**
```json
"needle": {
  ...
  "archetype": "striker",
  "stats": { "power": 22, "bandwidth": 4, "hp": 30 },
  ...
}

"overclocked": {
  ...
  "archetype": "striker",
  "stats": { "power": 25, "bandwidth": 5, "hp": 30 },
  ...
}

"anchor": {
  ...
  "archetype": "striker",
  "stats": { "power": 12, "bandwidth": 2, "hp": 45 },
  ...
}
```

**Healer chips (new):**
```json
"leech": {
  ...
  "archetype": "healer",
  "stats": { "power": 8, "bandwidth": 2, "hp": 55 },
  ...
}

"vampire": {
  ...
  "archetype": "healer",
  "stats": { "power": 14, "bandwidth": 3, "hp": 50 },
  ...
}
```

**Tank chips (new):**
```json
"duo": {
  ...
  "archetype": "tank",
  "stats": { "power": 18, "bandwidth": 4, "hp": 70 },
  ...
}
```

**Amplifier chips (new):**
```json
"sparkPlug": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 10, "bandwidth": 3, "hp": 25 },
  ...
}

"adrenaline": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 12, "bandwidth": 2, "hp": 20 },
  ...
}

"iceCream": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 14, "bandwidth": 6, "hp": 15 },
  ...
}

"candle": {
  ...
  "archetype": "amplifier",
  "stats": { "power": 16, "bandwidth": 5, "hp": 15 },
  ...
}
```

**Trickster chips (new):**
```json
"commoner": {
  ...
  "archetype": "trickster",
  "stats": { "power": 8, "bandwidth": 1, "hp": 50 },
  ...
}

"underdog": {
  ...
  "archetype": "trickster",
  "stats": { "power": 10, "bandwidth": 2, "hp": 45 },
  ...
}
```

**Step 2: Verify all 32 chips have HP stat**

Run: `node -e "const c = require('./data/chips.json'); const missing = Object.entries(c).filter(([id, chip]) => !chip.stats?.hp).map(([id]) => id); console.log(missing.length ? 'Missing HP: ' + missing.join(', ') : 'All 32 chips have HP stat')"`

Expected: `All 32 chips have HP stat`

**Step 3: Commit**

```bash
git add data/chips.json
git commit -m "feat(chips): add HP stat and archetype to all 32 chips"
```

---

## Task 3: Write Unit Test for Chip HP Calculation

**Files:**
- Create: `tests/unit/chip-hp.test.js`

**Step 1: Write the failing test**

Create `tests/unit/chip-hp.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateChipBonusHP, getChipLevel } from '../../src/game/items/chips.js';

describe('Chip HP Calculation', () => {
  describe('calculateChipBonusHP', () => {
    it('should return 0 for player with no equipped chips', () => {
      const player = {
        equipment: { weapon: { equippedChips: [] } },
        chips: [],
        _chipLevels: {}
      };
      const result = calculateChipBonusHP(player);
      assert.strictEqual(result, 0);
    });

    it('should sum HP from all equipped chips at level 1', () => {
      const player = {
        equipment: { weapon: { equippedChips: ['battery', 'speaker'] } },
        chips: [
          { id: 'battery', stats: { power: 10, bandwidth: 0, hp: 45 } },
          { id: 'speaker', stats: { power: 10, bandwidth: 3, hp: 25 } }
        ],
        _chipLevels: {}
      };
      const result = calculateChipBonusHP(player);
      assert.strictEqual(result, 70); // 45 + 25
    });

    it('should apply level scaling to chip HP', () => {
      const player = {
        equipment: { weapon: { equippedChips: ['battery'] } },
        chips: [
          { id: 'battery', stats: { power: 10, bandwidth: 0, hp: 45 } }
        ],
        _chipLevels: { 'battery': 7 } // Max level
      };
      const result = calculateChipBonusHP(player);
      // Level 7: 1 + (7-1) * 0.20 = 2.2x
      // 45 * 2.2 = 99
      assert.strictEqual(result, 99);
    });

    it('should handle mixed chip levels', () => {
      const player = {
        equipment: { weapon: { equippedChips: ['battery', 'speaker'] } },
        chips: [
          { id: 'battery', stats: { power: 10, bandwidth: 0, hp: 45 } },
          { id: 'speaker', stats: { power: 10, bandwidth: 3, hp: 25 } }
        ],
        _chipLevels: { 'battery': 3 } // Level 3 battery, level 1 speaker
      };
      const result = calculateChipBonusHP(player);
      // Battery at level 3: 45 * 1.4 = 63
      // Speaker at level 1: 25 * 1.0 = 25
      assert.strictEqual(result, 88);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-hp.test.js`

Expected: FAIL with "calculateChipBonusHP is not a function" or similar

**Step 3: Commit test**

```bash
git add tests/unit/chip-hp.test.js
git commit -m "test(chips): add failing tests for chip HP calculation"
```

---

## Task 4: Implement calculateChipBonusHP Function

**Files:**
- Modify: `src/game/items/chips.js`

**Step 1: Add calculateChipBonusHP function**

Add after the `getChipLevel` function (around line 1103) in `src/game/items/chips.js`:

```javascript
/**
 * Calculate total bonus HP from equipped chips
 * @param {object} player - Player object with equipment and chip levels
 * @returns {number} Total HP bonus from equipped chips
 */
export function calculateChipBonusHP(player) {
  const equippedChips = getEquippedChips(player);
  let totalHP = 0;

  for (const chip of equippedChips) {
    const baseHP = chip.stats?.hp || 0;
    const level = getChipLevel(player, chip.id);
    const scalingPerLevel = 0.20;
    const scaleFactor = 1 + (level - 1) * scalingPerLevel;
    totalHP += Math.floor(baseHP * scaleFactor);
  }

  return totalHP;
}
```

**Step 2: Run test to verify it passes**

Run: `node --test tests/unit/chip-hp.test.js`

Expected: All tests pass

**Step 3: Commit**

```bash
git add src/game/items/chips.js
git commit -m "feat(chips): implement calculateChipBonusHP function"
```

---

## Task 5: Integrate Chip HP into MaxHP Calculation

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Import calculateChipBonusHP**

Add to imports at top of `src/game/loop.js`:

```javascript
import { calculateChipBonusHP } from './items/chips.js';
```

**Step 2: Update applyMetaBonuses to include chip HP**

Modify the `applyMetaBonuses` method (around line 270) to add chip HP after meta bonuses:

```javascript
  applyMetaBonuses(player) {
    if (!this.meta) return player;

    const effects = getMetaUpgradeEffects(this.meta);

    // HP bonus (percentage from vitality upgrade)
    if (effects.maxHpPercent > 0) {
      const bonus = Math.floor(player.maxHp * effects.maxHpPercent / 100);
      player.maxHp += bonus;
      player.hp += bonus;
    }

    // HP bonus from equipped chips
    const chipHPBonus = calculateChipBonusHP(player);
    if (chipHPBonus > 0) {
      player.maxHp += chipHPBonus;
      player.hp += chipHPBonus;
    }

    // Attack bonus
    player.attack += effects.attackBonus || 0;

    // Starting credits
    player.credits += effects.startingCredits || 0;

    return player;
  }
```

**Step 3: Verify syntax**

Run: `node --check src/game/loop.js && echo "OK"`

Expected: `OK`

**Step 4: Commit**

```bash
git add src/game/loop.js
git commit -m "feat(chips): integrate chip HP bonus into maxHP calculation"
```

---

## Task 6: Update Chip Popup UI to Show HP

**Files:**
- Modify: `public/js/ui/chip-row.js`

**Step 1: Add HP stat box to popup**

Update the `showPopup` function (around line 150) to include HP in the stat row:

Find this block:
```javascript
  dom.chipPopupDesc.innerHTML = `
    <div class="chip-stat-row">
      <div class="chip-stat-box pwr">
        <span class="chip-stat-label">PWR</span>
        <span class="chip-stat-value">${power}</span>
      </div>
      <div class="chip-stat-box bw">
        <span class="chip-stat-label">BW</span>
        <span class="chip-stat-value">${bandwidth}</span>
      </div>
    </div>
```

Replace with:
```javascript
  // Get chip's base stats
  const power = chip.stats?.power || 0;
  const bandwidth = chip.stats?.bandwidth || 0;
  const hp = chip.stats?.hp || 0;

  dom.chipPopupDesc.innerHTML = `
    <div class="chip-stat-row">
      <div class="chip-stat-box pwr">
        <span class="chip-stat-label">PWR</span>
        <span class="chip-stat-value">${power}</span>
      </div>
      <div class="chip-stat-box bw">
        <span class="chip-stat-label">BW</span>
        <span class="chip-stat-value">${bandwidth}</span>
      </div>
      <div class="chip-stat-box hp">
        <span class="chip-stat-label">HP</span>
        <span class="chip-stat-value">${hp}</span>
      </div>
    </div>
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/chip-row.js && echo "OK"`

Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/chip-row.js
git commit -m "feat(ui): display HP stat in chip popup"
```

---

## Task 7: Update Chip Select UI to Show HP

**Files:**
- Modify: `public/js/ui/chip-select.js`

**Step 1: Add HP stat box to chip select card**

Update the `renderChipCard` function (around line 114) to include HP:

Find this block:
```javascript
        <div class="chip-stat-row">
          <div class="chip-stat-box pwr">
            <span class="chip-stat-label">PWR</span>
            <span class="chip-stat-value">${chip.stats?.power || 0}</span>
          </div>
          <div class="chip-stat-box bw">
            <span class="chip-stat-label">BW</span>
            <span class="chip-stat-value">${chip.stats?.bandwidth || 0}</span>
          </div>
        </div>
```

Replace with:
```javascript
        <div class="chip-stat-row">
          <div class="chip-stat-box pwr">
            <span class="chip-stat-label">PWR</span>
            <span class="chip-stat-value">${chip.stats?.power || 0}</span>
          </div>
          <div class="chip-stat-box bw">
            <span class="chip-stat-label">BW</span>
            <span class="chip-stat-value">${chip.stats?.bandwidth || 0}</span>
          </div>
          <div class="chip-stat-box hp">
            <span class="chip-stat-label">HP</span>
            <span class="chip-stat-value">${chip.stats?.hp || 0}</span>
          </div>
        </div>
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/chip-select.js && echo "OK"`

Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/ui/chip-select.js
git commit -m "feat(ui): display HP stat in chip select card"
```

---

## Task 8: Add CSS for HP Stat Box

**Files:**
- Modify: `public/game.css`

**Step 1: Find existing chip-stat-box styles**

Run: `grep -n "chip-stat-box" public/game.css | head -5`

**Step 2: Add HP stat box color**

Add after the existing `.chip-stat-box.bw` rule:

```css
.chip-stat-box.hp {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.15);
}

.chip-stat-box.hp .chip-stat-label {
  color: #e74c3c;
}
```

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(ui): add HP stat box styling (red theme)"
```

---

## Task 9: Convert Healing Effects to Percentage-Based

**Files:**
- Modify: `data/chips.json`
- Modify: `src/game/items/chips.js`

**Step 1: Update healing chips to use percentage**

In `data/chips.json`, update healing chip effects:

**Onigiri Bot:**
```json
"onigiri": {
  ...
  "effects": {
    "pipeline": {
      "type": "damageAndHeal",
      "target": "meta",
      "value": 0,
      "healPercent": 0.02,
      "triggerChance": 1,
      "displayText": "heal 2%"
    }
  },
  ...
}
```

**Straw Bot:**
```json
"straw": {
  ...
  "effects": {
    "pipeline": {
      "type": "damageAndHeal",
      "target": "bandwidth",
      "value": 0.2,
      "healPercent": 0.04,
      "triggerChance": 1,
      "displayText": "+0.2 BW heal 4%"
    }
  },
  ...
}
```

**Step 2: Update processPipelineChip to handle healPercent**

In `src/game/items/chips.js`, find the `damageAndHeal` case (around line 427) and update:

```javascript
    case 'damageAndHeal':
      // Heal player, optionally add to targeted pool
      applyAdd(effectValue);
      // Support both flat heal and percentage heal
      let healAmount = effect.healValue || 0;
      if (effect.healPercent && state.player?.maxHp) {
        healAmount = Math.floor(state.player.maxHp * effect.healPercent);
      }
      return { ...baseResult, healPlayer: healAmount, powerAdd, powerMult, bandwidthAdd, bandwidthMult };
```

**Step 3: Verify syntax**

Run: `node --check src/game/items/chips.js && echo "OK"`

Expected: `OK`

**Step 4: Commit**

```bash
git add data/chips.json src/game/items/chips.js
git commit -m "feat(chips): convert healing effects to percentage-based"
```

---

## Task 10: Run Unit Tests

**Files:**
- None (verification only)

**Step 1: Run all unit tests**

Run: `npm run test:unit`

Expected: All tests pass (154+ tests)

**Step 2: Run integration tests**

Run: `npm run test:integration`

Expected: All tests pass (14 tests)

**Step 3: If tests fail, debug and fix before proceeding**

---

## Task 11: Run E2E Tests

**Files:**
- None (verification only)

**Step 1: Run E2E test suite**

Run: `./scripts/e2e-test.sh`

Expected: 60+/66 tests pass (acceptable threshold per CLAUDE.md)

**Step 2: If tests fail below threshold, debug chip-related flows**

Check for regressions in:
- Character creation (starting chip selection)
- Combat (chip pipeline execution)
- Post-combat shop (chip purchase)

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address E2E test regressions from chip HP changes"
```

---

## Task 12: Three-Agent Balance Review (Manual)

**Files:**
- Modify: `data/chips.json` (if adjustments needed)

This task requires spawning three specialized agents to review balance. All three must agree before changes ship.

**Step 1: Spawn Stat Auditor agent**

Prompt: "Review all 32 chips in data/chips.json. Check that no chip exceeds its archetype's stat budget (high in PWR AND BW AND HP). Flag any outliers where total stats seem too high or too low compared to peers."

**Step 2: Spawn Build Theorist agent**

Prompt: "Analyze optimal 5-chip builds for each archetype. Does any single archetype dominate? Calculate expected damage output and survivability for tank builds vs glass cannon builds. Target: tanks should survive ~40% longer, glass cannons should deal ~40% more damage."

**Step 3: Spawn Edge Case Hunter agent**

Prompt: "Look for broken chip combinations. What happens with 5 tank chips - is the player unkillable? What about 5 amplifiers - do they die in 1 hit? Check healing chip synergies with high HP pools."

**Step 4: Collect recommendations and iterate**

If any agent flags issues, adjust chip stats and re-run all three reviews until unanimous approval.

**Step 5: Commit final adjustments**

```bash
git add data/chips.json
git commit -m "balance(chips): final HP stat adjustments after 3-agent review"
```

---

## Task 13: Update Architecture Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Update Chip System section**

Add HP stat documentation to the Chip Data Structure section:

```markdown
### Chip Data Structure

Each chip has stats, effects, and archetype:

\`\`\`javascript
{
  "id": "battery",
  "name": "電池ボット",
  "nameEn": "Battery Bot",
  "archetype": "striker",
  "stats": {
    "power": 10,      // Contributes to power pool
    "bandwidth": 0,   // Contributes to bandwidth pool
    "hp": 45          // Contributes to player maxHP
  },
  ...
}
\`\`\`

### Archetypes

| Archetype | HP Range | PWR Range | BW Range | Playstyle |
|-----------|----------|-----------|----------|-----------|
| Tank | 70-100 | 5-10 | 0-1 | High survivability |
| Healer | 50-70 | 5-10 | 0-2 | Sustain builds |
| Striker | 30-50 | 12-25 | 0-2 | Raw damage |
| Amplifier | 10-30 | 5-10 | 2-6 | Glass cannon |
| Trickster | 20-50 | 8-18 | 1-3 | High variance |
```

**Step 2: Update Player HP calculation section**

```markdown
### Player MaxHP

\`\`\`
maxHP = baseHP (100) + vitalityBonus + sum(equippedChipHP)
\`\`\`

Chip HP scales +20% per chip level.
```

**Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: update architecture with chip HP stat and archetypes"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add archetype config | chip-config.json |
| 2 | Add HP/archetype to all 32 chips | chips.json |
| 3 | Write unit test | chip-hp.test.js |
| 4 | Implement calculateChipBonusHP | chips.js |
| 5 | Integrate into maxHP calc | loop.js |
| 6 | Update chip popup UI | chip-row.js |
| 7 | Update chip select UI | chip-select.js |
| 8 | Add HP stat CSS | game.css |
| 9 | Convert healing to % | chips.json, chips.js |
| 10-11 | Run tests | Verification |
| 12 | 3-agent balance review | Manual |
| 13 | Update docs | ARCHITECTURE.md |
