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
