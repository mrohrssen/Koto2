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
