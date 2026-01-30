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
