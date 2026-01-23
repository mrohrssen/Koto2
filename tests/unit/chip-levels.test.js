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
  it('flatAdd chip at level 1 returns base value', () => {
    const chip = CHIPS.battery; // flatAdd, value: 5
    assert.strictEqual(getScaledEffectValue(chip, 1), 5);
  });

  it('flatAdd chip at level 7 applies 30% bonus floored', () => {
    const chip = CHIPS.battery; // flatAdd, value: 5
    // floor(5 * (1 + 6*0.05)) = floor(5 * 1.3) = floor(6.5) = 6
    assert.strictEqual(getScaledEffectValue(chip, 7), 6);
  });

  it('multiply chip at level 1 returns base value', () => {
    const chip = CHIPS.speaker; // multiply, value: 1.3
    assert.strictEqual(getScaledEffectValue(chip, 1), 1.3);
  });

  it('multiply chip at level 7 scales bonus portion', () => {
    const chip = CHIPS.speaker; // multiply, value: 1.3
    // 1 + (1.3-1) * (1 + 6*0.05) = 1 + 0.3 * 1.3 = 1.39
    const result = getScaledEffectValue(chip, 7);
    assert.ok(Math.abs(result - 1.39) < 0.001, `Expected ~1.39, got ${result}`);
  });

  it('rampingMultiply chip scales as decimal', () => {
    const chip = CHIPS.glasses; // rampingMultiply, value: 0.05
    // 0.05 * (1 + 6*0.05) = 0.05 * 1.3 = 0.065
    const result = getScaledEffectValue(chip, 7);
    assert.ok(Math.abs(result - 0.065) < 0.001, `Expected ~0.065, got ${result}`);
  });

  it('stacking chip uses flatAdd formula', () => {
    const chip = CHIPS.book; // stacking, value: 2
    // floor(2 * (1 + 2*0.05)) = floor(2 * 1.1) = floor(2.2) = 2
    assert.strictEqual(getScaledEffectValue(chip, 3), 2);
  });
});
