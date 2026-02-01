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

  it('Battery Bot should have PWR 10, BW 0 (common)', () => {
    assert.strictEqual(CHIPS.battery.stats.power, 10);
    assert.strictEqual(CHIPS.battery.stats.bandwidth, 0);
    assert.strictEqual(CHIPS.battery.rarity, 'common');
  });

  it('Speaker Bot should have PWR 10, BW 3 (rare)', () => {
    assert.strictEqual(CHIPS.speaker.stats.power, 10);
    assert.strictEqual(CHIPS.speaker.stats.bandwidth, 3);
    assert.strictEqual(CHIPS.speaker.rarity, 'rare');
  });

  it('Fireworks Bot should have PWR 17, BW 2 (epic)', () => {
    assert.strictEqual(CHIPS.fireworks.stats.power, 17);
    assert.strictEqual(CHIPS.fireworks.stats.bandwidth, 2);
    assert.strictEqual(CHIPS.fireworks.rarity, 'epic');
  });
});

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
