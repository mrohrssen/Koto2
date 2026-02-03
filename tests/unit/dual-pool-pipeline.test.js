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
    player: { hp: 100, maxHp: 100 }, // For healPercent calculations
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
    // Battery Bot: PWR 10, BW 0, type: "none"
    const result = runPipeline([getChip('battery')]);
    // PWR = 10, BW = 0
    // Damage = 10 × (1 + 0) = 10
    assert.strictEqual(result.powerPool, 10);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 10);
  });

  it('should sum stats from multiple chips', () => {
    // Battery (PWR 10, BW 0) + Key (PWR 13, BW 2)
    // Neither triggers effects (Battery is "none", Key only vs bosses)
    const result = runPipeline([getChip('battery'), getChip('key')], {
      target: { isBoss: false, hp: 500, maxHp: 500 }
    });
    // PWR = 10 + 13 = 23, BW = 0 + 2 = 2
    // Damage = 23 × (1 + 2) = 69
    assert.strictEqual(result.powerPool, 23);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 69);
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
      // PWR 10, BW 3 → effect ×1.2 BW → BW 3.6
      // Damage = 10 × (1 + 3.6) = 46
      assert.strictEqual(result.bandwidthPool, 3.6);
      assert.strictEqual(result.powerPool, 10);
      assert.strictEqual(result.finalDamage, 46);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('conditional effect with target=power should add to power', () => {
    const result = runPipeline([getChip('scissors')], {
      target: { hp: 10, maxHp: 100 } // 10% HP, below 30%
    });
    // PWR 14 + 10 (effect) = 24, BW 1
    // Damage = 24 × (1 + 1) = 48
    assert.strictEqual(result.powerPool, 24);
    assert.strictEqual(result.bandwidthPool, 1);
    assert.strictEqual(result.finalDamage, 48);
  });

  it('stacking effect with target=bandwidth should add to bandwidth', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger book

    try {
      const combatStacks = {};
      const result = runPipeline([getChip('book')], { combatStacks });
      // PWR 9, BW 2 + 1 (stack) = 3
      assert.strictEqual(result.powerPool, 9);
      assert.strictEqual(result.bandwidthPool, 3);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('sacrifice effect should multiply both pools', () => {
    const result = runPipeline([getChip('battery'), getChip('charcoal')]);
    // Battery: PWR 10, BW 0
    // Charcoal: PWR 20, BW 3 → then ×3 PWR, ×2 BW
    // PWR = (10 + 20) × 3 = 90
    // BW = (0 + 3) × 2 = 6
    // Damage = 90 × (1 + 6) = 630
    assert.strictEqual(result.powerPool, 90);
    assert.strictEqual(result.bandwidthPool, 6);
    assert.strictEqual(result.finalDamage, 630);
  });

  it('vsBoss effect should multiply bandwidth vs bosses', () => {
    const result = runPipeline([getChip('battery'), getChip('key')], {
      target: { isBoss: true, hp: 1000, maxHp: 1000 }
    });
    // Battery: PWR 10, BW 0
    // Key: PWR 13, BW 2 → effect ×1.5 BW
    // PWR = 23
    // BW = 2 × 1.5 = 3
    // Damage = 23 × (1 + 3) = 92
    assert.strictEqual(result.powerPool, 23);
    assert.strictEqual(result.bandwidthPool, 3);
    assert.strictEqual(result.finalDamage, 92);
  });
});

describe('Migrated Chip Values', () => {
  it('Eraser Bot: +12 PWR, +2 BW if 2+ empty', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty
    });
    // PWR 12 + 12 = 24, BW 2 + 2 = 4
    // Damage = 24 × (1 + 4) = 120
    assert.strictEqual(result.powerPool, 24);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 120);
  });

  it('Feather Bot: +3 PWR, +0.5 BW per empty', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty
    });
    // PWR 11 + (3 × 4) = 23, BW 2 + (0.5 × 4) = 4
    // Damage = 23 × (1 + 4) = 115
    assert.strictEqual(result.powerPool, 23);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 115);
  });

  it('Toolbox Bot: +2 PWR, +0.3 BW per equipped', () => {
    const result = runPipeline([
      getChip('battery'),
      getChip('toolbox')
    ], {
      weaponUsedSlots: 5 // Full loadout
    });
    // Battery: PWR 10, BW 0
    // Toolbox: PWR 10, BW 1 + effect (+2×5=10 PWR, +0.3×5=1.5 BW)
    // PWR = 10 + 10 + 10 = 30
    // BW = 0 + 1 + 1.5 = 2.5
    // Damage = 30 × (1 + 2.5) = 105
    assert.strictEqual(result.powerPool, 30);
    assert.strictEqual(result.bandwidthPool, 2.5);
    assert.strictEqual(result.finalDamage, 105);
  });

  it('Glasses Bot: +0.3 BW per hit (ramping)', () => {
    const combatStacks = {};

    // Hit 1: base BW 3 + ramping 0.3×1 = 3.3
    const result1 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result1.bandwidthPool, 3.3);

    // Hit 2: base BW 3 + ramping 0.3×2 = 3.6
    Object.assign(combatStacks, result1.combatStacks);
    const result2 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result2.bandwidthPool, 3.6);

    // Hit 3: base BW 3 + ramping 0.3×3 = 3.9
    Object.assign(combatStacks, result2.combatStacks);
    const result3 = runPipeline([getChip('glasses')], { combatStacks });
    assert.strictEqual(result3.bandwidthPool, 3.9);
  });

  it('Wallet Bot: +0.5 PWR per kill', () => {
    const result = runPipeline([getChip('wallet')], {
      runKills: 10
    });
    // PWR 11 + (0.5 × 10) = 16, BW 1
    // Damage = 16 × (1 + 1) = 32
    assert.strictEqual(result.powerPool, 16);
    assert.strictEqual(result.bandwidthPool, 1);
    assert.strictEqual(result.finalDamage, 32);
  });

  it('Egg Bot: +1 BW per destroyed chip', () => {
    const result = runPipeline([getChip('egg')], {
      runChipsDestroyed: 3
    });
    // PWR 15, BW 2 + (1 × 3) = 5
    // Damage = 15 × (1 + 5) = 90
    assert.strictEqual(result.powerPool, 15);
    assert.strictEqual(result.bandwidthPool, 5);
    assert.strictEqual(result.finalDamage, 90);
  });

  it('Drum Bot: ×2 BW every 5th attack', () => {
    const combatStacks = {};

    // Hits 1-4: just charging
    for (let i = 0; i < 4; i++) {
      const result = runPipeline([getChip('drum')], { combatStacks });
      Object.assign(combatStacks, result.combatStacks);
      // PWR 15, BW 3 - no burst yet
      assert.strictEqual(result.powerPool, 15);
      assert.strictEqual(result.bandwidthPool, 3);
    }

    // Hit 5: BURST! ×2 BW
    const burstResult = runPipeline([getChip('drum')], { combatStacks });
    // PWR 15, BW 3 × 2 = 6
    // Damage = 15 × (1 + 6) = 105
    assert.strictEqual(burstResult.powerPool, 15);
    assert.strictEqual(burstResult.bandwidthPool, 6);
    assert.strictEqual(burstResult.finalDamage, 105);
  });

  it('Straw Bot: +6 PWR, +2 BW, +0.2 BW effect, heal 4% of maxHp', () => {
    const result = runPipeline([getChip('straw')]);
    // PWR 6, BW 2 + 0.2 = 2.2
    // Damage = 6 × (1 + 2.2) = 19.2 → floor = 19
    assert.strictEqual(result.powerPool, 6);
    assert.strictEqual(result.bandwidthPool, 2.2);
    // Check heal: 4% of player.maxHp (100) = 4
    assert.strictEqual(result.healPlayer, 4);
  });

  it('Lightbulb Bot: 50% ×1.5 BW', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.3; // Trigger (50% chance)

    try {
      const result = runPipeline([getChip('lightbulb')]);
      // PWR 10, BW 2 × 1.5 = 3
      // Damage = 10 × (1 + 3) = 40
      assert.strictEqual(result.powerPool, 10);
      assert.strictEqual(result.bandwidthPool, 3);
      assert.strictEqual(result.finalDamage, 40);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Chip Level Scaling', () => {
  it('should scale chip stats by level', () => {
    // Battery level 5: PWR 10 × 1.8 = 18
    const result = runPipeline([getChip('battery')], {
      player: { _chipLevels: { battery: 5 } }
    });
    assert.strictEqual(result.powerPool, 18);
  });

  it('should not scale bandwidth if base is 0', () => {
    // Battery has BW 0, so 0 × 1.8 = 0
    const result = runPipeline([getChip('battery')], {
      player: { _chipLevels: { battery: 5 } }
    });
    assert.strictEqual(result.bandwidthPool, 0);
  });

  it('should scale both stats for balanced chips', () => {
    // Lightbulb level 5: PWR 10 × 1.8 = 18, BW 2 × 1.8 = 3.6 → 4
    const originalRandom = Math.random;
    Math.random = () => 0.9; // Don't trigger lightbulb's 50% effect

    try {
      const result = runPipeline([getChip('lightbulb')], {
        player: { _chipLevels: { lightbulb: 5 } }
      });
      assert.strictEqual(result.powerPool, 18);
      assert.strictEqual(result.bandwidthPool, 4);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should use level 1 (no scaling) when no player provided', () => {
    const result = runPipeline([getChip('battery')]);
    // Level 1: PWR 10 × 1.0 = 10
    assert.strictEqual(result.powerPool, 10);
  });
});
