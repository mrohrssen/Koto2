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
  it('should return powerPool and bandwidthPool in result', () => {
    const result = runPipeline([getChip('battery')]);
    assert.ok('powerPool' in result, 'result should have powerPool');
    assert.ok('bandwidthPool' in result, 'result should have bandwidthPool');
  });

  it('should calculate damage as POWER × (1 + BANDWIDTH)', () => {
    // Battery Bot: PWR 8, BW 0, type: "none"
    const result = runPipeline([getChip('battery')]);
    // PWR = 8, BW = 0
    // Damage = 8 × (1 + 0) = 8
    assert.strictEqual(result.powerPool, 8);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 8);
  });

  it('should sum stats from multiple chips', () => {
    // Battery (PWR 8, BW 0) + Key (PWR 2, BW 1)
    // Neither triggers effects (Battery is "none", Key only vs bosses)
    const result = runPipeline([getChip('battery'), getChip('key')], {
      target: { isBoss: false, hp: 500, maxHp: 500 }
    });
    // PWR = 8 + 2 = 10, BW = 0 + 1 = 1
    // Damage = 10 × (1 + 1) = 20
    assert.strictEqual(result.powerPool, 10);
    assert.strictEqual(result.bandwidthPool, 1);
    assert.strictEqual(result.finalDamage, 20);
  });

  it('should return 0 damage with no chips', () => {
    const result = runPipeline([]);
    assert.strictEqual(result.finalDamage, 0);
    assert.strictEqual(result.powerPool, 0);
    assert.strictEqual(result.bandwidthPool, 0);
  });
});

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

describe('Migrated Chip Values', () => {
  it('Eraser Bot: +12 PWR, +2 BW if 2+ empty', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty
    });
    // PWR 0 + 12 = 12, BW 0 + 2 = 2
    // Damage = 12 × (1 + 2) = 36
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 36);
  });

  it('Feather Bot: +3 PWR, +0.5 BW per empty', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty
    });
    // PWR 0 + (3 × 4) = 12, BW 0 + (0.5 × 4) = 2
    // Damage = 12 × (1 + 2) = 36
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 36);
  });

  it('Toolbox Bot: +2 PWR, +0.3 BW per equipped', () => {
    const result = runPipeline([
      getChip('battery'),
      getChip('toolbox')
    ], {
      weaponUsedSlots: 5 // Full loadout
    });
    // Battery: PWR 8, BW 0
    // Toolbox: PWR 2, BW 0 + effect (+2×5=10 PWR, +0.3×5=1.5 BW)
    // PWR = 8 + 2 + 10 = 20
    // BW = 0 + 0 + 1.5 = 1.5
    // Damage = 20 × (1 + 1.5) = 50
    assert.strictEqual(result.powerPool, 20);
    assert.strictEqual(result.bandwidthPool, 1.5);
    assert.strictEqual(result.finalDamage, 50);
  });

  it('Glasses Bot: +0.3 BW per hit (ramping)', () => {
    const combatStacks = {};

    // Hit 1: base BW 1 + ramping 0.3×1 = 1.3
    const result1 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result1.bandwidthPool, 1.3);

    // Hit 2: base BW 1 + ramping 0.3×2 = 1.6
    Object.assign(combatStacks, result1.combatStacks);
    const result2 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result2.bandwidthPool, 1.6);

    // Hit 3: base BW 1 + ramping 0.3×3 = 1.9
    Object.assign(combatStacks, result2.combatStacks);
    const result3 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result3.bandwidthPool, 1.9);
  });

  it('Wallet Bot: +0.5 PWR per kill', () => {
    const result = runPipeline([getChip('wallet')], {
      runKills: 10
    });
    // PWR 2 + (0.5 × 10) = 7, BW 0
    // Damage = 7 × 1 = 7
    assert.strictEqual(result.powerPool, 7);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 7);
  });

  it('Egg Bot: +1 BW per destroyed chip', () => {
    const result = runPipeline([getChip('egg')], {
      runChipsDestroyed: 3
    });
    // PWR 0, BW 1 + (1 × 3) = 4
    // Damage = 0 × 5 = 0
    assert.strictEqual(result.powerPool, 0);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 0);
  });

  it('Drum Bot: ×2 BW every 5th attack', () => {
    const combatStacks = {};

    // Hits 1-4: just charging
    for (let i = 0; i < 4; i++) {
      const result = runPipeline([getChip('drum')], { combatStacks });
      Object.assign(combatStacks, result.combatStacks);
      // PWR 4, BW 0 - no burst yet
      assert.strictEqual(result.powerPool, 4);
      assert.strictEqual(result.bandwidthPool, 0);
    }

    // Hit 5: BURST! ×2 BW
    const burstResult = runPipeline([getChip('drum')], { combatStacks });
    // PWR 4, BW 0 × 2 = 0 (still 0 because base is 0)
    // Actually the multiplier applies to the pool, not base
    // BW = 0 * 2 = 0
    assert.strictEqual(burstResult.powerPool, 4);
    // Note: mult on 0 is still 0
    assert.strictEqual(burstResult.bandwidthPool, 0);
  });

  it('Straw Bot: -3 PWR, +0.2 BW, heal 12', () => {
    const result = runPipeline([getChip('straw')]);
    // PWR -3, BW 0 + 0.2 = 0.2
    // Damage = -3 × (1 + 0.2) = -3.6 → floor = -3 (or 0 if clamped)
    assert.strictEqual(result.powerPool, -3);
    assert.strictEqual(result.bandwidthPool, 0.2);
    // Check heal
    assert.strictEqual(result.healPlayer, 12);
  });

  it('Lightbulb Bot: 50% ×1.5 BW', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.3; // Trigger (50% chance)

    try {
      const result = runPipeline([getChip('lightbulb')]);
      // PWR 2, BW 1 × 1.5 = 1.5
      // Damage = 2 × (1 + 1.5) = 5
      assert.strictEqual(result.powerPool, 2);
      assert.strictEqual(result.bandwidthPool, 1.5);
      assert.strictEqual(result.finalDamage, 5);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Chip Level Scaling', () => {
  it('should scale chip stats by level', () => {
    // Battery level 5: PWR 8 × 1.8 = 14.4 → 14
    const result = runPipeline([getChip('battery')], {
      player: { _chipLevels: { battery: 5 } }
    });
    assert.strictEqual(result.powerPool, 14);
  });

  it('should not scale bandwidth if base is 0', () => {
    // Battery has BW 0, so 0 × 1.8 = 0
    const result = runPipeline([getChip('battery')], {
      player: { _chipLevels: { battery: 5 } }
    });
    assert.strictEqual(result.bandwidthPool, 0);
  });

  it('should scale both stats for balanced chips', () => {
    // Lightbulb level 5: PWR 2 × 1.8 = 3.6 → 4, BW 1 × 1.8 = 1.8 → 2
    const originalRandom = Math.random;
    Math.random = () => 0.9; // Don't trigger lightbulb's 50% effect

    try {
      const result = runPipeline([getChip('lightbulb')], {
        player: { _chipLevels: { lightbulb: 5 } }
      });
      assert.strictEqual(result.powerPool, 4);
      assert.strictEqual(result.bandwidthPool, 2);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should use level 1 (no scaling) when no player provided', () => {
    const result = runPipeline([getChip('battery')]);
    // Level 1: PWR 8 × 1.0 = 8
    assert.strictEqual(result.powerPool, 8);
  });
});
