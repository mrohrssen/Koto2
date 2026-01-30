import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getChipLevel,
  setChipLevel,
  getScaledEffectValue,
  CHIPS
} from '../../src/game/items/chips.js';

describe('Chip Level Helpers', () => {
  function makePlayer(levels = {}) {
    return { _chipLevels: levels };
  }

  it('getChipLevel returns 1 for unleveled chip', () => {
    const player = makePlayer();
    assert.strictEqual(getChipLevel(player, 'battery'), 1);
  });

  it('getChipLevel returns stored level', () => {
    const player = makePlayer({ battery: 4 });
    assert.strictEqual(getChipLevel(player, 'battery'), 4);
  });

  it('setChipLevel stores level', () => {
    const player = makePlayer();
    setChipLevel(player, 'battery', 5);
    assert.strictEqual(player._chipLevels.battery, 5);
  });

  it('setChipLevel clamps to max 7', () => {
    const player = makePlayer();
    setChipLevel(player, 'battery', 10);
    assert.strictEqual(player._chipLevels.battery, 7);
  });

  it('setChipLevel clamps to min 1', () => {
    const player = makePlayer();
    setChipLevel(player, 'battery', 0);
    assert.strictEqual(player._chipLevels.battery, 1);
  });
});

describe('getScaledEffectValue', () => {
  // Uses formula: scaledStat = round(baseStat × (1 + 0.20 × (level - 1)))
  // Level 1: ×1.0, Level 5: ×1.8, Level 7: ×2.2

  it('type "none" chip returns undefined (no effect value)', () => {
    const chip = CHIPS.battery; // type: "none", no value
    assert.strictEqual(getScaledEffectValue(chip, 1), undefined);
  });

  it('conditional chip at level 1 returns base value', () => {
    const chip = CHIPS.scissors; // conditional, value: 10
    assert.strictEqual(getScaledEffectValue(chip, 1), 10);
  });

  it('conditional chip at level 5 applies 80% bonus floored', () => {
    const chip = CHIPS.scissors; // conditional, value: 10
    // floor(10 * 1.8) = floor(18) = 18
    assert.strictEqual(getScaledEffectValue(chip, 5), 18);
  });

  it('multiply chip at level 1 returns base value', () => {
    const chip = CHIPS.speaker; // multiply, value: 1.2
    assert.strictEqual(getScaledEffectValue(chip, 1), 1.2);
  });

  it('multiply chip at level 5 scales bonus portion', () => {
    const chip = CHIPS.speaker; // multiply, value: 1.2
    // 1 + (1.2-1) * 1.8 = 1 + 0.2 * 1.8 = 1.36
    const result = getScaledEffectValue(chip, 5);
    assert.ok(Math.abs(result - 1.36) < 0.001, `Expected ~1.36, got ${result}`);
  });

  it('rampingMultiply chip scales as decimal (no floor)', () => {
    const chip = CHIPS.glasses; // rampingMultiply, value: 0.3
    // 0.3 * 1.8 = 0.54
    const result = getScaledEffectValue(chip, 5);
    assert.ok(Math.abs(result - 0.54) < 0.001, `Expected ~0.54, got ${result}`);
  });

  it('stacking chip at level 5 uses floor', () => {
    const chip = CHIPS.book; // stacking, value: 1
    // floor(1 * 1.8) = floor(1.8) = 1
    assert.strictEqual(getScaledEffectValue(chip, 5), 1);
  });

  it('stacking chip at level 7 uses floor', () => {
    const chip = CHIPS.book; // stacking, value: 1
    // floor(1 * 2.2) = floor(2.2) = 2
    assert.strictEqual(getScaledEffectValue(chip, 7), 2);
  });
});
