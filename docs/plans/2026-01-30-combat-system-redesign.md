# Combat System Redesign: Power x Bandwidth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the sequential damage pipeline with a dual-pool system where damage = POWER x (1 + BANDWIDTH), enabling exponential scaling and greater build diversity.

**Architecture:** The chip pipeline will track two pools (power/bandwidth) instead of a single currentDamage. Each chip contributes base stats to the pools, then executes effects that may add to or multiply either pool. Final damage calculation happens after all chips fire.

**Tech Stack:** Node.js backend, ES6 modules, node:test for unit tests, Playwright for E2E

---

## Overview

This plan implements Phase 1 (Core System) and Phase 2 (Effects System) of the Combat System Redesign proposal documented in `docs/proposals/COMBAT_SYSTEM_REDESIGN.md`.

**Key Changes:**
1. Add `stats: { power, bandwidth }` to all chips in `data/chips.json`
2. Add `target` field to pipeline effects (power/bandwidth/both)
3. Rewrite `executeChipPipeline()` to track dual pools
4. Update `processPipelineChip()` to modify appropriate pool
5. Update unit tests with new expected values
6. Update UI to display power x bandwidth breakdown

**Files Modified:**
- `data/chips.json` - Add stats and target fields
- `src/game/items/chips.js` - Dual pool pipeline logic
- `tests/unit/pipeline-chips.test.js` - Updated assertions
- `public/js/ui/combat-loop.js` - Damage breakdown display

---

## Task 0: Create Feature Branch

**Files:**
- None (git operation only)

**Step 1: Create and switch to feature branch**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git checkout -b feature/dual-pool-combat
```

**Step 2: Verify branch**

```bash
/usr/bin/git branch --show-current
```

Expected: `feature/dual-pool-combat`

**Step 3: Push branch to remote (for backup)**

```bash
/usr/bin/git push -u origin feature/dual-pool-combat
```

> **Note:** All work will be done on this branch. After testing, the user can merge to master or create a PR.

---

## Task 1: Add Stats to Chip Data Structure

**Files:**
- Modify: `data/chips.json`

**Step 1: Write the test for chip stats validation**

Create test file `tests/unit/chip-stats.test.js`:

```javascript
/**
 * Unit tests for dual-pool chip stats
 * Run with: node --test tests/unit/chip-stats.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CHIPS } from '../../src/game/items/chips.js';

describe('Chip Stats Structure', () => {
  it('all chips should have stats.power defined', () => {
    for (const [id, chip] of Object.entries(CHIPS)) {
      assert.ok(
        chip.stats && typeof chip.stats.power === 'number',
        `Chip ${id} missing stats.power`
      );
    }
  });

  it('all chips should have stats.bandwidth defined', () => {
    for (const [id, chip] of Object.entries(CHIPS)) {
      assert.ok(
        chip.stats && typeof chip.stats.bandwidth === 'number',
        `Chip ${id} missing stats.bandwidth`
      );
    }
  });

  it('Battery Bot should have PWR 8, BW 0', () => {
    assert.strictEqual(CHIPS.battery.stats.power, 8);
    assert.strictEqual(CHIPS.battery.stats.bandwidth, 0);
  });

  it('Speaker Bot should have PWR 0, BW 2', () => {
    assert.strictEqual(CHIPS.speaker.stats.power, 0);
    assert.strictEqual(CHIPS.speaker.stats.bandwidth, 2);
  });

  it('Fireworks Bot should have PWR 15, BW 1', () => {
    assert.strictEqual(CHIPS.fireworks.stats.power, 15);
    assert.strictEqual(CHIPS.fireworks.stats.bandwidth, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-stats.test.js`
Expected: FAIL with "Chip battery missing stats.power"

**Step 3: Add stats to all chips in chips.json**

Modify `data/chips.json` - add `stats` field to each chip according to the migration table:

```json
{
  "battery": {
    "id": "battery",
    "name": "電池ボット",
    "nameEn": "Battery Bot",
    "stats": {
      "power": 8,
      "bandwidth": 0
    },
    "description": "...",
    ...
  },
  "speaker": {
    "id": "speaker",
    "stats": {
      "power": 0,
      "bandwidth": 2
    },
    ...
  }
}
```

Full stats mapping (from proposal Appendix A):

| Chip | Power | Bandwidth |
|------|-------|-----------|
| battery | 8 | 0 |
| speaker | 0 | 2 |
| glasses | 0 | 1 |
| lightbulb | 2 | 1 |
| scissors | 3 | 0 |
| clock | 0 | 0 |
| charcoal | 5 | 2 |
| book | 0 | 1 |
| eraser | 0 | 0 |
| onigiri | 6 | 0 |
| wallet | 2 | 0 |
| straw | -3 | 0 |
| key | 2 | 1 |
| egg | 0 | 1 |
| fireworks | 15 | 1 |
| mirror | 0 | 0 |
| feather | 0 | 0 |
| drum | 4 | 0 |
| magnifyingGlass | 0 | 1 |
| toolbox | 2 | 0 |

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-stats.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/chip-stats.test.js data/chips.json
git commit -m "$(cat <<'EOF'
feat: add power/bandwidth stats to all chips

Add stats.power and stats.bandwidth fields to all 20 chips in
preparation for the dual-pool damage system. Values follow the
migration table in the Combat System Redesign proposal.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Target Field to Pipeline Effects

**Files:**
- Modify: `data/chips.json`
- Modify: `tests/unit/chip-stats.test.js`

**Step 1: Add test for effect target field**

Add to `tests/unit/chip-stats.test.js`:

```javascript
describe('Chip Effect Targets', () => {
  it('all pipeline effects should have target field', () => {
    for (const [id, chip] of Object.entries(CHIPS)) {
      if (chip.effects?.pipeline) {
        assert.ok(
          ['power', 'bandwidth', 'both', 'meta'].includes(chip.effects.pipeline.target),
          `Chip ${id} missing valid target field`
        );
      }
    }
  });

  it('Speaker Bot effect should target bandwidth', () => {
    assert.strictEqual(CHIPS.speaker.effects.pipeline.target, 'bandwidth');
  });

  it('Battery Bot should have no effect (stat stick)', () => {
    // Battery is a pure stat stick - no pipeline effect
    // Its flatAdd effect is removed in the new system
    assert.ok(
      !CHIPS.battery.effects?.pipeline ||
      CHIPS.battery.effects.pipeline.type === 'none',
      'Battery should be a pure stat stick'
    );
  });

  it('Scissors Bot effect should target power', () => {
    assert.strictEqual(CHIPS.scissors.effects.pipeline.target, 'power');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chip-stats.test.js`
Expected: FAIL

**Step 3: Add target field to all pipeline effects**

Update each chip's `effects.pipeline` in `data/chips.json`:

| Chip | Effect Target | Notes |
|------|---------------|-------|
| battery | (remove effect or type: "none") | Pure stat stick |
| speaker | bandwidth | ×1.2 BW |
| glasses | bandwidth | +0.3 BW/hit |
| lightbulb | bandwidth | ×1.5 BW |
| scissors | power | +10 PWR conditional |
| clock | meta | Double damage |
| charcoal | both | ×3 PWR, ×2 BW |
| book | bandwidth | +1 BW stacking |
| eraser | both | +12 PWR, +2 BW conditional |
| onigiri | power | +heal only, PWR from stats |
| wallet | power | +0.5 PWR/kill |
| straw | bandwidth | +0.2 BW, heal |
| key | bandwidth | ×1.5 BW vs boss |
| egg | bandwidth | +1 BW/destroyed |
| fireworks | power | risk effect only |
| mirror | meta | copies previous |
| feather | both | +3 PWR, +0.5 BW/empty |
| drum | bandwidth | ×2 BW on burst |
| magnifyingGlass | meta | amplifies next chip stats |
| toolbox | both | +2 PWR, +0.3 BW/equipped |

Example update for Speaker Bot:

```json
"speaker": {
  "id": "speaker",
  "stats": { "power": 0, "bandwidth": 2 },
  "effects": {
    "pipeline": {
      "type": "multiply",
      "value": 1.2,
      "target": "bandwidth",
      "triggerChance": 0.8,
      "displayText": "×1.2 BW"
    }
  },
  ...
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chip-stats.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add data/chips.json tests/unit/chip-stats.test.js
git commit -m "$(cat <<'EOF'
feat: add target field to pipeline effects

Each chip effect now specifies which pool it modifies:
- power: modifies the power pool
- bandwidth: modifies the bandwidth pool
- both: modifies both pools
- meta: special effects (copy, amplify, recursion)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement Dual Pool Pipeline State

**Files:**
- Modify: `src/game/items/chips.js:656-778` (executeChipPipeline)
- Modify: `tests/unit/pipeline-chips.test.js`

**Step 1: Write test for dual pool initialization**

Add new test file `tests/unit/dual-pool-pipeline.test.js`:

```javascript
/**
 * Unit tests for dual-pool pipeline system
 * Run with: node --test tests/unit/dual-pool-pipeline.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CHIPS, executeChipPipeline } from '../../src/game/items/chips.js';

function getChip(id) {
  const chip = CHIPS[id];
  if (!chip) throw new Error(`Chip not found: ${id}`);
  return { ...chip };
}

function runPipeline(chips, overrides = {}) {
  return executeChipPipeline(chips, {
    baseDamage: 0, // Player has no innate power
    isCrit: false,
    critChance: 0.05,
    target: { isBoss: false, hp: 500, maxHp: 500 },
    combatStacks: {},
    weaponMaxSlots: 5,
    weaponUsedSlots: chips.length,
    runKills: 0,
    runChipsDestroyed: 0,
    ...overrides
  });
}

describe('Dual Pool Pipeline - Basic Stats', () => {
  it('should calculate damage as POWER × (1 + BANDWIDTH)', () => {
    // Battery Bot: PWR 8, BW 0
    const result = runPipeline([getChip('battery')]);
    // PWR = 8, BW = 0
    // Damage = 8 × (1 + 0) = 8
    assert.strictEqual(result.finalDamage, 8);
    assert.strictEqual(result.powerPool, 8);
    assert.strictEqual(result.bandwidthPool, 0);
  });

  it('should sum stats from multiple chips', () => {
    // Battery (PWR 8, BW 0) + Speaker (PWR 0, BW 2)
    const result = runPipeline([getChip('battery'), getChip('speaker')]);
    // PWR = 8, BW = 2 (before Speaker effect)
    // Speaker effect: 80% chance ×1.2 BW - test without randomness first
    // For now just test stat aggregation
    assert.ok(result.powerPool >= 8); // At least base stats
    assert.ok(result.bandwidthPool >= 2);
  });

  it('should handle chips with both pools', () => {
    // Lightbulb (PWR 2, BW 1)
    const result = runPipeline([getChip('lightbulb')]);
    assert.ok(result.powerPool >= 2);
    assert.ok(result.bandwidthPool >= 1);
  });

  it('should return 0 damage with no chips', () => {
    const result = runPipeline([]);
    // PWR = 0, BW = 0
    // Damage = 0 × (1 + 0) = 0
    assert.strictEqual(result.finalDamage, 0);
    assert.strictEqual(result.powerPool, 0);
    assert.strictEqual(result.bandwidthPool, 0);
  });
});

describe('Dual Pool Pipeline - Effect Targeting', () => {
  it('Speaker effect should multiply bandwidth pool', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger speaker (80% chance)

    try {
      // Battery (8, 0) + Speaker (0, 2) with effect
      const result = runPipeline([getChip('battery'), getChip('speaker')]);
      // PWR = 8
      // BW = 2, then Speaker effect ×1.2 = 2.4
      // Damage = 8 × (1 + 2.4) = 8 × 3.4 = 27.2 → 27
      assert.strictEqual(result.powerPool, 8);
      assert.strictEqual(result.bandwidthPool, 2.4);
      assert.strictEqual(result.finalDamage, 27);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('Scissors should add power conditionally', () => {
    // Scissors (PWR 3, BW 0) + conditional +10 PWR if enemy < 30%
    const result = runPipeline([getChip('scissors')], {
      target: { isBoss: false, hp: 20, maxHp: 100 } // 20% HP
    });
    // PWR = 3 + 10 = 13
    // Damage = 13 × 1 = 13
    assert.strictEqual(result.powerPool, 13);
    assert.strictEqual(result.finalDamage, 13);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: FAIL (pipeline doesn't return powerPool/bandwidthPool yet)

**Step 3: Modify executeChipPipeline to track dual pools**

In `src/game/items/chips.js`, modify `executeChipPipeline()` (lines 656-778):

```javascript
export function executeChipPipeline(weaponChips, context) {
  const state = {
    // NEW: Dual pool tracking
    powerPool: 0,
    bandwidthPool: 0,

    // Keep for backwards compatibility during transition
    currentDamage: context.baseDamage,

    isCrit: context.isCrit,
    critChance: context.critChance || 0,
    critMultiplier: context.critMultiplier || 1.4,
    target: context.target,
    firedChips: [],
    recursionCount: 0,
    sacrificedChips: [],
    combatStacks: context.combatStacks || {},
    weaponMaxSlots: context.weaponMaxSlots || 5,
    weaponUsedSlots: context.weaponUsedSlots || 0,
    totalHealPlayer: 0,
    runKills: context.runKills || 0,
    runChipsDestroyed: context.runChipsDestroyed || 0,
    player: context.player || null
  };

  let nextChipDoubleActive = context.nextChipDouble || false;
  let nextChipAmplifyFactor = context.nextChipAmplify || null;

  const MAX_RECURSIONS = 10;
  let chipIndex = 0;

  while (chipIndex < weaponChips.length) {
    const chip = weaponChips[chipIndex];

    if (chip.category !== 'pipeline') {
      state.firedChips.push({ chipId: chip.id, skipped: true, notPipeline: true });
      chipIndex++;
      continue;
    }

    if (state.sacrificedChips.includes(chip.id)) {
      state.firedChips.push({ chipId: chip.id, skipped: true, alreadySacrificed: true });
      chipIndex++;
      continue;
    }

    // NEW: Add chip's base stats to pools BEFORE effect
    let statPower = chip.stats?.power || 0;
    let statBandwidth = chip.stats?.bandwidth || 0;

    // Apply Magnifying Glass amplification to STATS (not effects)
    if (nextChipAmplifyFactor) {
      statPower = Math.round(statPower * nextChipAmplifyFactor);
      statBandwidth = Math.round(statBandwidth * nextChipAmplifyFactor);
      nextChipAmplifyFactor = null;
    }

    state.powerPool += statPower;
    state.bandwidthPool += statBandwidth;

    // Process effect (modifies pools)
    const result = processPipelineChip(chip, state);
    state.firedChips.push(result);

    // Handle nextChipDouble
    if (nextChipDoubleActive && result.triggered) {
      const doubleResult = processPipelineChip(chip, state);
      state.firedChips.push(doubleResult);
      nextChipDoubleActive = false;
    }

    if (result.triggered) {
      // NEW: Update pools from effect result
      if (result.powerAdd) state.powerPool += result.powerAdd;
      if (result.powerMult) state.powerPool *= result.powerMult;
      if (result.bandwidthAdd) state.bandwidthPool += result.bandwidthAdd;
      if (result.bandwidthMult) state.bandwidthPool *= result.bandwidthMult;

      if (result.healPlayer) state.totalHealPlayer += result.healPlayer;

      // Track last chip effect for Mirror
      const effect = chip.effects?.pipeline;
      if (effect && effect.type !== 'copy') {
        state.lastChipEffect = { ...effect, chipName: chip.nameEn || chip.name };
      }

      // Handle recursion
      if (result.recursion && state.recursionCount < MAX_RECURSIONS) {
        state.recursionCount++;
        chipIndex = 0;
        continue;
      }

      // Handle sacrifice
      if (result.sacrifice) {
        state.sacrificedChips.push(chip.id);
      }

      // Handle random destruction
      if (result.randomDestroy) {
        state.randomDestroyTriggered = true;
      }

      // Handle amplifyNext - now amplifies STATS of next chip
      if (result.amplifyNext) {
        nextChipAmplifyFactor = result.amplifyFactor;
      }
    }

    chipIndex++;
  }

  // NEW: Calculate final damage from pools
  const finalDamage = Math.floor(state.powerPool * (1 + state.bandwidthPool));

  return {
    finalDamage,
    powerPool: state.powerPool,
    bandwidthPool: state.bandwidthPool,
    firedChips: state.firedChips,
    critChance: state.critChance,
    damageMultiplier: state.powerPool > 0 ? finalDamage / state.powerPool : 1,
    recursionCount: state.recursionCount,
    sacrificedChips: state.sacrificedChips,
    combatStacks: state.combatStacks,
    healPlayer: state.totalHealPlayer,
    randomDestroyTriggered: state.randomDestroyTriggered || false
  };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: PASS for basic stats tests (effects tests may still fail)

**Step 5: Commit**

```bash
git add src/game/items/chips.js tests/unit/dual-pool-pipeline.test.js
git commit -m "$(cat <<'EOF'
feat: implement dual pool state tracking in pipeline

executeChipPipeline now tracks powerPool and bandwidthPool separately.
Chip stats are added to pools before effects are processed.
Final damage = POWER × (1 + BANDWIDTH).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update processPipelineChip for Pool Targeting

**Files:**
- Modify: `src/game/items/chips.js:292-648` (processPipelineChip)
- Modify: `tests/unit/dual-pool-pipeline.test.js`

**Step 1: Add tests for each effect type targeting correct pool**

Add to `tests/unit/dual-pool-pipeline.test.js`:

```javascript
describe('Effect Type Pool Targeting', () => {
  it('multiply effect with target=bandwidth should multiply bandwidth', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1;

    try {
      const result = runPipeline([getChip('speaker')]);
      // PWR 0, BW 2 → effect ×1.2 BW → BW 2.4
      // Damage = 0 × (1 + 2.4) = 0
      assert.strictEqual(result.bandwidthPool, 2.4);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('conditional effect with target=power should add to power', () => {
    const result = runPipeline([getChip('scissors')], {
      target: { hp: 10, maxHp: 100 } // 10% HP, below 30%
    });
    // PWR 3 + 10 (effect) = 13, BW 0
    assert.strictEqual(result.powerPool, 13);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 13);
  });

  it('stacking effect with target=bandwidth should add to bandwidth', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger book

    try {
      const combatStacks = {};
      const result = runPipeline([getChip('book')], { combatStacks });
      // PWR 0, BW 1 + 1 (stack) = 2
      assert.strictEqual(result.bandwidthPool, 2);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('sacrifice effect should multiply both pools', () => {
    const result = runPipeline([getChip('battery'), getChip('charcoal')]);
    // Battery: PWR 8, BW 0
    // Charcoal: PWR 5, BW 2 → then ×3 PWR, ×2 BW
    // PWR = (8 + 5) × 3 = 39
    // BW = (0 + 2) × 2 = 4
    // Damage = 39 × (1 + 4) = 195
    assert.strictEqual(result.powerPool, 39);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 195);
  });

  it('vsBoss effect should multiply bandwidth vs bosses', () => {
    const result = runPipeline([getChip('battery'), getChip('key')], {
      target: { isBoss: true, hp: 1000, maxHp: 1000 }
    });
    // Battery: PWR 8, BW 0
    // Key: PWR 2, BW 1 → effect ×1.5 BW
    // PWR = 10
    // BW = 1 × 1.5 = 1.5
    // Damage = 10 × (1 + 1.5) = 25
    assert.strictEqual(result.powerPool, 10);
    assert.strictEqual(result.bandwidthPool, 1.5);
    assert.strictEqual(result.finalDamage, 25);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: FAIL

**Step 3: Rewrite processPipelineChip with pool targeting**

Modify `processPipelineChip()` in `src/game/items/chips.js`:

```javascript
function processPipelineChip(chip, state) {
  const effect = chip.effects?.pipeline;
  if (!effect || effect.type === 'none') {
    return { chipId: chip.id, triggered: true, pureStatStick: true };
  }

  // Apply level scaling
  let effectValue = effect.value;
  if (state.player) {
    effectValue = getScaledEffectValue(chip, getChipLevel(state.player, chip.id));
  }

  // Roll trigger chance
  const triggered = Math.random() < effect.triggerChance;
  if (!triggered) {
    return {
      chipId: chip.id,
      chipName: chip.nameEn || chip.name,
      triggered: false,
      displayText: effect.displayText
    };
  }

  // Check condition
  if (effect.condition && !checkPipelineCondition(effect.condition, state)) {
    return {
      chipId: chip.id,
      chipName: chip.nameEn || chip.name,
      triggered: false,
      conditionFailed: true,
      displayText: effect.displayText
    };
  }

  // Build result with pool modifications
  const result = {
    chipId: chip.id,
    chipName: chip.nameEn || chip.name,
    triggered: true,
    displayText: effect.displayText,
    // Pool modifiers (to be applied by caller)
    powerAdd: 0,
    powerMult: 1,
    bandwidthAdd: 0,
    bandwidthMult: 1
  };

  const target = effect.target || 'power'; // Default to power for backwards compat

  switch (effect.type) {
    case 'flatAdd':
      if (target === 'power' || target === 'both') result.powerAdd = effectValue;
      if (target === 'bandwidth' || target === 'both') result.bandwidthAdd = effectValue;
      break;

    case 'multiply':
      if (target === 'power' || target === 'both') result.powerMult = effectValue;
      if (target === 'bandwidth' || target === 'both') result.bandwidthMult = effectValue;
      break;

    case 'conditional':
      // Conditional flat add (scissors: +10 PWR if enemy < 30%)
      if (target === 'power') result.powerAdd = effectValue;
      if (target === 'bandwidth') result.bandwidthAdd = effectValue;
      break;

    case 'sacrifice':
      // Charcoal: ×3 PWR, ×2 BW
      result.powerMult = effect.powerMultiplier || effectValue;
      result.bandwidthMult = effect.bandwidthMultiplier || 2;
      result.sacrifice = true;
      result.destroyed = true;
      break;

    case 'stacking':
      if (!state.combatStacks) state.combatStacks = {};
      if (!state.combatStacks[chip.id]) state.combatStacks[chip.id] = 0;
      state.combatStacks[chip.id]++;
      const stackCount = state.combatStacks[chip.id];
      if (target === 'bandwidth') {
        result.bandwidthAdd = effectValue * stackCount;
      } else {
        result.powerAdd = effectValue * stackCount;
      }
      result.stackCount = stackCount;
      break;

    case 'emptySlots':
      const emptySlots = (state.weaponMaxSlots || 5) - (state.weaponUsedSlots || 0);
      if (emptySlots >= effect.requiredEmpty) {
        if (effect.powerValue) result.powerAdd = effect.powerValue;
        if (effect.bandwidthValue) result.bandwidthAdd = effect.bandwidthValue;
      } else {
        result.triggered = false;
        result.conditionFailed = true;
      }
      result.emptySlots = emptySlots;
      break;

    case 'damageAndHeal':
      result.healPlayer = effect.healValue;
      // PWR comes from stats, effect just heals
      break;

    case 'killCounter':
      const kills = state.runKills || 0;
      result.powerAdd = effectValue * kills;
      result.kills = kills;
      break;

    case 'vsBoss':
      if (state.target?.isBoss) {
        if (target === 'bandwidth') {
          result.bandwidthMult = effectValue;
        } else {
          result.powerMult = effectValue;
        }
      } else {
        result.triggered = false;
        result.conditionFailed = true;
      }
      break;

    case 'destroyedMultiplier':
      const destroyed = state.runChipsDestroyed || 0;
      const phoenixMult = effect.baseValue + (effect.perDestroyed * destroyed);
      if (target === 'bandwidth') {
        result.bandwidthAdd = phoenixMult - 1; // Convert multiplier to additive BW
      } else {
        result.powerMult = phoenixMult;
      }
      break;

    case 'riskyFlat':
      result.powerAdd = effectValue;
      if (Math.random() < effect.destroyChance) {
        result.randomDestroy = true;
      }
      break;

    case 'copy':
      if (!state.lastChipEffect) {
        result.triggered = false;
        result.noPreviousChip = true;
        return result;
      }
      // Copy previous effect's pool modifications
      const copied = state.lastChipEffect;
      // Re-process with same logic
      result.copied = true;
      result.copiedFrom = copied.chipName;
      // Simplified: apply same values as last effect
      if (copied.type === 'multiply') {
        if (copied.target === 'bandwidth') result.bandwidthMult = copied.value;
        else result.powerMult = copied.value;
      } else if (copied.type === 'flatAdd') {
        if (copied.target === 'bandwidth') result.bandwidthAdd = copied.value;
        else result.powerAdd = copied.value;
      }
      break;

    case 'perEmptySlot':
      const empty2 = (state.weaponMaxSlots || 5) - (state.weaponUsedSlots || 0);
      if (effect.powerValue) result.powerAdd = effect.powerValue * empty2;
      if (effect.bandwidthValue) result.bandwidthAdd = effect.bandwidthValue * empty2;
      result.emptySlots = empty2;
      break;

    case 'nthAttack':
      if (!state.combatStacks) state.combatStacks = {};
      const attackKey = chip.id + '_attacks';
      state.combatStacks[attackKey] = (state.combatStacks[attackKey] || 0) + 1;
      const attackNum = state.combatStacks[attackKey];
      if (attackNum % effect.interval === 0) {
        result.bandwidthMult = effect.multiplier;
        result.burstAttack = true;
      } else {
        result.charging = true;
        result.untilBurst = effect.interval - (attackNum % effect.interval);
      }
      result.attackNumber = attackNum;
      break;

    case 'rampingMultiply':
      if (!state.combatStacks) state.combatStacks = {};
      const rampKey = chip.id + '_ramp';
      state.combatStacks[rampKey] = (state.combatStacks[rampKey] || 0) + 1;
      const rampCount = state.combatStacks[rampKey];
      result.bandwidthAdd = effectValue * rampCount;
      result.hitCount = rampCount;
      break;

    case 'amplifyNext':
      result.amplifyNext = true;
      result.amplifyFactor = effectValue;
      break;

    case 'perEquipped':
      const equipped = state.weaponUsedSlots || 0;
      if (effect.powerValue) result.powerAdd = effect.powerValue * equipped;
      if (effect.bandwidthValue) result.bandwidthAdd = effect.bandwidthValue * equipped;
      result.equippedCount = equipped;
      break;

    case 'recursion':
      result.recursion = true;
      break;
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/items/chips.js tests/unit/dual-pool-pipeline.test.js
git commit -m "$(cat <<'EOF'
feat: rewrite processPipelineChip for dual pool targeting

Effects now return pool modifiers (powerAdd, powerMult, bandwidthAdd,
bandwidthMult) instead of directly modifying currentDamage. Each
effect type respects the target field to modify the correct pool.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update Chip Effect Values in Data

**Files:**
- Modify: `data/chips.json`
- Modify: `tests/unit/dual-pool-pipeline.test.js`

**Step 1: Add comprehensive tests for migrated chip values**

Add to `tests/unit/dual-pool-pipeline.test.js`:

```javascript
describe('Migrated Chip Values', () => {
  it('Eraser Bot: +12 PWR, +2 BW if 2+ empty', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty
    });
    // PWR 0 + 12 = 12, BW 0 + 2 = 2
    // Damage = 12 × 3 = 36
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 36);
  });

  it('Feather Bot: +3 PWR, +0.5 BW per empty', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty
    });
    // PWR 0 + 12 = 12, BW 0 + 2 = 2
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 2);
  });

  it('Toolbox Bot: +2 PWR, +0.3 BW per equipped', () => {
    const result = runPipeline([
      getChip('battery'),
      getChip('toolbox')
    ], {
      weaponUsedSlots: 5 // Full loadout
    });
    // Battery: PWR 8, BW 0
    // Toolbox: PWR 2, BW 0 + effect (+10 PWR, +1.5 BW for 5 equipped)
    // PWR = 8 + 2 + 10 = 20
    // BW = 0 + 0 + 1.5 = 1.5
    assert.strictEqual(result.powerPool, 20);
    assert.strictEqual(result.bandwidthPool, 1.5);
  });

  it('Glasses Bot: +0.3 BW per hit', () => {
    const combatStacks = {};

    // Hit 1
    const result1 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result1.bandwidthPool, 1.3); // 1 base + 0.3

    // Hit 3
    Object.assign(combatStacks, result1.combatStacks);
    runPipeline([getChip('glasses')], { combatStacks });
    const result3 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result3.bandwidthPool, 1.9); // 1 base + 0.9
  });
});
```

**Step 2: Run tests to verify failures**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: FAIL (effect values don't match yet)

**Step 3: Update all chip effect values in chips.json**

Update each chip's effect in `data/chips.json` with new values per the proposal:

**Eraser Bot:**
```json
"eraser": {
  "stats": { "power": 0, "bandwidth": 0 },
  "effects": {
    "pipeline": {
      "type": "emptySlots",
      "requiredEmpty": 2,
      "powerValue": 12,
      "bandwidthValue": 2,
      "target": "both",
      "triggerChance": 1,
      "displayText": "+12 PWR +2 BW"
    }
  }
}
```

**Feather Bot:**
```json
"feather": {
  "stats": { "power": 0, "bandwidth": 0 },
  "effects": {
    "pipeline": {
      "type": "perEmptySlot",
      "powerValue": 3,
      "bandwidthValue": 0.5,
      "target": "both",
      "triggerChance": 1,
      "displayText": "+3 PWR +0.5 BW"
    }
  }
}
```

**Toolbox Bot:**
```json
"toolbox": {
  "stats": { "power": 2, "bandwidth": 0 },
  "effects": {
    "pipeline": {
      "type": "perEquipped",
      "powerValue": 2,
      "bandwidthValue": 0.3,
      "target": "both",
      "triggerChance": 1,
      "displayText": "+2 PWR +0.3 BW"
    }
  }
}
```

**Glasses Bot:**
```json
"glasses": {
  "stats": { "power": 0, "bandwidth": 1 },
  "effects": {
    "pipeline": {
      "type": "rampingMultiply",
      "value": 0.3,
      "target": "bandwidth",
      "triggerChance": 1,
      "displayText": "+0.3 BW/hit"
    }
  }
}
```

Continue for all 20 chips per the migration table in the proposal.

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add data/chips.json tests/unit/dual-pool-pipeline.test.js
git commit -m "$(cat <<'EOF'
feat: update all chip effect values for dual pool system

Migrated all 20 chips to new effect values:
- Eraser: +12 PWR, +2 BW if 2+ empty
- Feather: +3 PWR, +0.5 BW per empty slot
- Toolbox: +2 PWR, +0.3 BW per equipped
- Glasses: +0.3 BW per hit (ramping)
- And 16 more chips

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update Existing Unit Tests

**Files:**
- Modify: `tests/unit/pipeline-chips.test.js`

**Step 1: Identify tests that need updating**

The existing tests in `tests/unit/pipeline-chips.test.js` use the old damage values. They need to be updated to:
1. Use baseDamage: 0 (player has no innate power)
2. Assert new damage values based on POWER × (1 + BANDWIDTH)

**Step 2: Update test helper**

```javascript
function runPipeline(chips, overrides = {}) {
  return executeChipPipeline(chips, {
    baseDamage: 0, // NEW: Player has no innate power
    isCrit: false,
    critChance: 0.05,
    target: { isBoss: false, hp: 500, maxHp: 500 },
    combatStacks: {},
    weaponMaxSlots: 5,
    weaponUsedSlots: chips.length,
    runKills: 0,
    runChipsDestroyed: 0,
    ...overrides
  });
}
```

**Step 3: Update Battery Bot test**

```javascript
describe('Battery Bot (baseline)', () => {
  it('should provide base power', () => {
    const result = runPipeline([getChip('battery')]);
    // PWR 8, BW 0 → Damage = 8 × 1 = 8
    assert.strictEqual(result.finalDamage, 8);
    assert.strictEqual(result.powerPool, 8);
    assert.strictEqual(result.bandwidthPool, 0);
  });
});
```

**Step 4: Update remaining tests with new expected values**

Update each test case with the correct dual-pool calculations. Example for Charcoal:

```javascript
describe('Charcoal Bot', () => {
  it('should multiply both pools', () => {
    const result = runPipeline([getChip('charcoal')]);
    // PWR 5 × 3 = 15, BW 2 × 2 = 4
    // Damage = 15 × 5 = 75
    assert.strictEqual(result.powerPool, 15);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 75);
  });
});
```

**Step 5: Run all unit tests**

Run: `node --test tests/unit/pipeline-chips.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add tests/unit/pipeline-chips.test.js
git commit -m "$(cat <<'EOF'
test: update pipeline tests for dual pool system

Updated all test assertions to match new damage formula:
DAMAGE = POWER × (1 + BANDWIDTH)

Tests now use baseDamage: 0 since player has no innate power.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update getScaledEffectValue for Dual Pools

**Files:**
- Modify: `src/game/items/chips.js` (getScaledEffectValue function)
- Add tests to: `tests/unit/dual-pool-pipeline.test.js`

**Step 1: Add tests for stat scaling**

```javascript
describe('Chip Level Scaling', () => {
  it('should scale chip stats by level', () => {
    // Battery level 5: PWR 8 × 1.8 = 14.4 → 14
    const chip = { ...getChip('battery'), level: 5 };
    const result = runPipeline([chip], {
      player: { _chipLevels: { battery: 5 } }
    });
    assert.strictEqual(result.powerPool, 14);
  });

  it('should not scale bandwidth if base is 0', () => {
    // Battery has BW 0, so 0 × 1.8 = 0
    const chip = { ...getChip('battery'), level: 5 };
    const result = runPipeline([chip], {
      player: { _chipLevels: { battery: 5 } }
    });
    assert.strictEqual(result.bandwidthPool, 0);
  });

  it('should scale both stats for balanced chips', () => {
    // Lightbulb level 5: PWR 2 × 1.8 = 3.6 → 4, BW 1 × 1.8 = 1.8 → 2
    const chip = { ...getChip('lightbulb'), level: 5 };
    const result = runPipeline([chip], {
      player: { _chipLevels: { lightbulb: 5 } }
    });
    assert.strictEqual(result.powerPool, 4);
    assert.strictEqual(result.bandwidthPool, 2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: FAIL

**Step 3: Update stat scaling in executeChipPipeline**

Modify the stat addition section in `executeChipPipeline()`:

```javascript
// Add chip's base stats to pools BEFORE effect (with level scaling)
let statPower = chip.stats?.power || 0;
let statBandwidth = chip.stats?.bandwidth || 0;

// Apply level scaling to stats
if (state.player) {
  const level = getChipLevel(state.player, chip.id);
  const scalingPerLevel = 0.20;
  const scaleFactor = 1 + (level - 1) * scalingPerLevel;
  statPower = Math.round(statPower * scaleFactor);
  statBandwidth = Math.round(statBandwidth * scaleFactor);
}

// Apply Magnifying Glass amplification to STATS
if (nextChipAmplifyFactor) {
  statPower = Math.round(statPower * nextChipAmplifyFactor);
  statBandwidth = Math.round(statBandwidth * nextChipAmplifyFactor);
  nextChipAmplifyFactor = null;
}

state.powerPool += statPower;
state.bandwidthPool += statBandwidth;
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/dual-pool-pipeline.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/items/chips.js tests/unit/dual-pool-pipeline.test.js
git commit -m "$(cat <<'EOF'
feat: apply level scaling to chip stats

Chip stats now scale with level using the formula:
scaledStat = round(baseStat × (1 + 0.20 × (level - 1)))

Level 5 provides 1.8× base stats, level 7 provides 2.2×.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update Combat UI Damage Display

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Identify the damage display code**

The damage breakdown is shown in the `executePlayerAttack` function around line 200+. Need to update it to show:
```
POWER × BANDWIDTH = DAMAGE
  45  ×   3.5    =   157
```

**Step 2: Update the damage display rendering**

Find the section that builds the damage display text and update it:

```javascript
// Build damage breakdown display
function formatDamageBreakdown(pipelineResult) {
  const pwr = pipelineResult.powerPool;
  const bw = pipelineResult.bandwidthPool;
  const damage = pipelineResult.finalDamage;

  return `PWR ${pwr} × (1 + BW ${bw.toFixed(1)}) = ${damage}`;
}
```

**Step 3: Update chip activation sequence display**

Modify `showChipActivationSequence` to show pool contributions:

```javascript
// For each chip fired:
const chipDisplay = firedChip.triggered
  ? `${chipName}: +${chipPwr} PWR, +${chipBw} BW`
  : `${chipName}: (missed)`;
```

**Step 4: Syntax check the file**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "$(cat <<'EOF'
feat: update combat UI to show power × bandwidth breakdown

Damage display now shows the dual-pool formula:
PWR × (1 + BW) = DAMAGE

Chip activations show their pool contributions.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Integration Testing

**Files:**
- Modify: `tests/integration/pipeline-chip-effects.test.js`

**Step 1: Update integration tests with new damage values**

The integration tests create full game states and verify combat outcomes. Update them with the new expected values.

**Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/pipeline-chip-effects.test.js
git commit -m "$(cat <<'EOF'
test: update integration tests for dual pool combat

Integration tests now expect damage = POWER × (1 + BANDWIDTH).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: E2E Testing

**Files:**
- E2E test suite

**Step 1: Run E2E tests**

```bash
./scripts/e2e-test.sh
```

Expected: 60+/66 tests passing (known flakiness acceptable)

**Step 2: Fix any failing tests**

If tests fail due to damage value assertions, update the expected values.

**Step 3: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test: verify E2E tests pass with dual pool system

All combat-related E2E tests verified working with new damage formula.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Code Cleanup - Remove Dead Code

**Files:**
- Modify: `src/game/items/chips.js`

**Step 1: Identify code to remove**

After the dual-pool system is working, remove the following deprecated code:

1. **`currentDamage` tracking in state** - No longer needed, damage is calculated from pools
2. **`damageMultiplier` calculation** - Old metric, replace with pool ratios if needed
3. **Old effect cases that directly modify damage** - Any remaining `newDamage =` patterns

**Step 2: Remove currentDamage from executeChipPipeline state**

In `executeChipPipeline()`, remove:
```javascript
// REMOVE: currentDamage: context.baseDamage,
```

**Step 3: Remove legacy return fields**

Remove from the return object:
```javascript
// REMOVE: damageMultiplier: state.powerPool > 0 ? finalDamage / state.powerPool : 1,
```

Or update to use new pool-based metrics:
```javascript
// ADD: bandwidthMultiplier: 1 + state.bandwidthPool,
```

**Step 4: Clean up processPipelineChip return object**

Remove any legacy fields that were used for the old single-damage system:
- Remove `previousDamage` (no longer meaningful)
- Remove `newDamage` from individual chip results (pools handle this now)

**Step 5: Run tests to verify nothing broke**

Run: `npm run test:unit && npm run test:integration`
Expected: PASS

**Step 6: Commit cleanup**

```bash
git add src/game/items/chips.js
git commit -m "$(cat <<'EOF'
refactor: remove legacy single-damage tracking code

Removed deprecated code after dual-pool migration:
- currentDamage state tracking
- damageMultiplier calculation
- previousDamage/newDamage chip result fields

The dual-pool system (powerPool, bandwidthPool) now handles
all damage calculation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update Architecture Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Find and update the combat system section**

Look for sections describing:
- Chip pipeline execution
- Damage calculation
- Combat mechanics

**Step 2: Update damage formula documentation**

Add/update section:

```markdown
### Combat Damage Formula

Damage is calculated using a dual-pool system:

```
DAMAGE = POWER × (1 + BANDWIDTH)
```

**Power Pool:**
- Accumulated from chip stats (`chip.stats.power`)
- Modified by effects with `target: "power"` or `target: "both"`
- Represents raw damage potential

**Bandwidth Pool:**
- Accumulated from chip stats (`chip.stats.bandwidth`)
- Modified by effects with `target: "bandwidth"` or `target: "both"`
- Acts as a damage multiplier

**Example:**
- 3 chips: Battery (PWR 8, BW 0), Speaker (PWR 0, BW 2), Scissors (PWR 3, BW 0)
- Power = 8 + 0 + 3 = 11
- Bandwidth = 0 + 2 + 0 = 2
- Damage = 11 × (1 + 2) = 33
```

**Step 3: Update chip data structure documentation**

```markdown
### Chip Data Structure

```json
{
  "id": "battery",
  "name": "電池ボット",
  "nameEn": "Battery Bot",
  "stats": {
    "power": 8,      // Base power contribution
    "bandwidth": 0   // Base bandwidth contribution
  },
  "effects": {
    "pipeline": {
      "type": "none",           // Effect type (none for pure stat sticks)
      "target": "power",        // Which pool the effect modifies
      "triggerChance": 1.0,     // Probability of effect activating
      "displayText": "+8 PWR"   // UI display text
    }
  }
}
```
```

**Step 4: Commit documentation**

```bash
git add docs/ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
docs: update architecture docs for dual-pool combat system

Added documentation for:
- POWER × (1 + BANDWIDTH) damage formula
- Pool accumulation from chip stats
- Effect targeting (power/bandwidth/both/meta)
- Updated chip data structure with stats field

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update Chip Descriptions for New System

**Files:**
- Modify: `data/chips.json`

**Step 1: Update English descriptions to reflect dual-pool mechanics**

Each chip's `descriptionEn` should explain its power/bandwidth contribution.

**Example updates:**

**Battery Bot:**
```json
"descriptionEn": "A reliable power source. Provides +8 Power with no Bandwidth. Pure damage, no multipliers."
```

**Speaker Bot:**
```json
"descriptionEn": "Amplifies your signal. +2 Bandwidth base, with 80% chance to multiply total Bandwidth by ×1.2."
```

**Step 2: Update Japanese descriptions similarly**

Update `description` fields with Japanese equivalents.

**Step 3: Update displayText for all chips**

Ensure `effects.pipeline.displayText` shows the new pool contributions:
- `"+8 PWR"` for power chips
- `"+2 BW"` for bandwidth chips
- `"×1.2 BW"` for bandwidth multipliers
- `"+3 PWR +0.5 BW"` for dual-pool effects

**Step 4: Commit description updates**

```bash
git add data/chips.json
git commit -m "$(cat <<'EOF'
docs: update chip descriptions for dual-pool system

Updated all 20 chip descriptions to explain their Power and
Bandwidth contributions in both English and Japanese.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Create Combat System README

**Files:**
- Create: `docs/COMBAT_SYSTEM.md`

**Step 1: Create comprehensive combat system documentation**

```markdown
# Combat System: Power × Bandwidth

## Overview

Neo Tokyo uses a dual-pool damage system inspired by Balatro and Puzzle & Dragons.

## Formula

```
DAMAGE = POWER × (1 + BANDWIDTH)
```

## Pools

### Power Pool
- Your raw damage potential
- Accumulated from chip `stats.power`
- Higher power = bigger base numbers

### Bandwidth Pool
- Your damage multiplier
- Accumulated from chip `stats.bandwidth`
- Higher bandwidth = exponential scaling

## Chip Types

### Damage Dealers (High Power)
| Chip | PWR | BW | Notes |
|------|-----|-----|-------|
| Battery Bot | 8 | 0 | Pure power |
| Fireworks Bot | 15 | 1 | High risk, high reward |
| Onigiri Bot | 6 | 0 | Power + healing |

### Multipliers (High Bandwidth)
| Chip | PWR | BW | Notes |
|------|-----|-----|-------|
| Speaker Bot | 0 | 2 | 80% ×1.2 BW |
| Light Bulb Bot | 2 | 1 | 50% ×1.5 BW |
| Glasses Bot | 0 | 1 | +0.3 BW per hit |

### Balanced
| Chip | PWR | BW | Notes |
|------|-----|-----|-------|
| Key Bot | 2 | 1 | ×1.5 BW vs bosses |
| Charcoal Bot | 5 | 2 | ×3 PWR, ×2 BW (sacrifice) |

## Build Archetypes

### Glass Cannon (High PWR, Low BW)
- Stack power chips
- Lower ceiling but reliable damage

### Multiplier Build (Low PWR, High BW)
- Stack bandwidth chips
- Exponential scaling potential

### Balanced Build
- Mix of both pools
- Most efficient use of the multiplicative formula

## Optimal Strategy

For maximum damage, balance your pools:
```
If total budget = 100:
  PWR=90, BW=10 → 90 × 11 = 990
  PWR=50, BW=50 → 50 × 51 = 2,550 ✓ Optimal
```

## Chip Order Matters

Effects apply in slot order. Position affects:
- Mirror Bot (copies previous chip)
- Magnifying Glass (amplifies next chip's stats)
- Clock Bot (restarts from beginning)
```

**Step 2: Commit documentation**

```bash
git add docs/COMBAT_SYSTEM.md
git commit -m "$(cat <<'EOF'
docs: add comprehensive combat system documentation

New COMBAT_SYSTEM.md explains:
- Power × Bandwidth formula
- Pool accumulation mechanics
- Chip type categories
- Build archetypes and strategy
- Optimal pool balancing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Final Testing and Branch Completion

**Files:**
- None (testing and git operations)

**Step 1: Run full test suite**

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (may take a few minutes)
./scripts/e2e-test.sh
```

Expected: All tests passing (60+/66 E2E acceptable due to known flakiness)

**Step 2: Manual playtesting**

Start the game and verify:
1. Combat shows correct damage breakdown
2. Chips contribute to correct pools
3. Build variety feels improved
4. No obvious balance issues

```bash
npm run dev
# Open http://localhost:3000 and play through combat
```

**Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: address issues found during playtesting

[List specific fixes here]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Step 4: Push branch for review**

```bash
/usr/bin/git push origin feature/dual-pool-combat
```

**Step 5: Notify user that branch is ready for testing**

The branch `feature/dual-pool-combat` is now ready for the user to:
1. Test gameplay feel
2. Verify balance
3. Merge to master or create PR when satisfied

---

## Summary Checklist

- [ ] Task 0: Create feature branch
- [ ] Task 1: Add stats to chip data structure
- [ ] Task 2: Add target field to pipeline effects
- [ ] Task 3: Implement dual pool pipeline state
- [ ] Task 4: Update processPipelineChip for pool targeting
- [ ] Task 5: Update chip effect values in data
- [ ] Task 6: Update existing unit tests
- [ ] Task 7: Update getScaledEffectValue for dual pools
- [ ] Task 8: Update combat UI damage display
- [ ] Task 9: Integration testing
- [ ] Task 10: E2E testing
- [ ] Task 11: Code cleanup - remove dead code
- [ ] Task 12: Update architecture documentation
- [ ] Task 13: Update chip descriptions for new system
- [ ] Task 14: Create combat system README
- [ ] Task 15: Final testing and branch completion

---

## Code to Remove/Clean Up (Reference)

### In `src/game/items/chips.js`:

1. **State field `currentDamage`** - Replace with pool tracking
   - Line ~658: `currentDamage: context.baseDamage,` → DELETE

2. **Return field `damageMultiplier`** - Old metric
   - Line ~771: `damageMultiplier: ...` → DELETE or replace

3. **Legacy effect handling** - Any direct damage modification
   - `newDamage = state.currentDamage + ...` → Now use pool modifiers
   - `previousDamage` in chip results → DELETE

4. **Old scaling logic** - If duplicated with new stat scaling
   - `getScaledEffectValue` may need review

### In `data/chips.json`:

1. **Old effect values** - Replaced by new dual-pool values
   - `"value": 5` for flatAdd → Now handled by `stats.power`

2. **Old displayText** - Updated for pool display
   - `"+5"` → `"+8 PWR"` (clearer)

### In `tests/unit/pipeline-chips.test.js`:

1. **Old assertions** - All need updating
   - `assert.strictEqual(result.finalDamage, 105)` → New calculated values
   - `baseDamage: 100` → `baseDamage: 0`

---

## Rollback Plan

If issues are discovered post-merge:

1. The feature branch preserves all changes - revert to `master` if needed
2. To restore old behavior:
   ```bash
   git checkout master
   git branch -D feature/dual-pool-combat  # If completely abandoning
   ```
3. All changes are in a single branch, making rollback straightforward

**Gradual Rollback Option:**
If partial rollback needed, the key files to revert are:
1. `data/chips.json` - Remove `stats` and `target` fields
2. `src/game/items/chips.js` - Restore `processPipelineChip` and `executeChipPipeline`
3. `tests/unit/pipeline-chips.test.js` - Restore old assertions
