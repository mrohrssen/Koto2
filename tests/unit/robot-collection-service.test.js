import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  RARITY_POINT_COST,
  MAX_TEAM_POINTS,
  DEFAULT_COLLECTION,
  validateTeamSelection,
  addToCollection
} from '../../src/game/services/robot-collection-service.js';

describe('robot-collection-service', () => {
  describe('RARITY_POINT_COST', () => {
    it('has correct costs per rarity', () => {
      assert.strictEqual(RARITY_POINT_COST.common, 3);
      assert.strictEqual(RARITY_POINT_COST.uncommon, 4);
      assert.strictEqual(RARITY_POINT_COST.rare, 6);
      assert.strictEqual(RARITY_POINT_COST.epic, 7);
      assert.strictEqual(RARITY_POINT_COST.legendary, 8);
    });
  });

  describe('validateTeamSelection', () => {
    const collection = ['fire-common', 'water-common', 'wood-common'];

    it('accepts valid selection within budget', () => {
      const result = validateTeamSelection(collection, ['fire-common', 'water-common']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 6);
    });

    it('accepts single robot', () => {
      const result = validateTeamSelection(collection, ['fire-common']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 3);
    });

    it('rejects empty selection', () => {
      const result = validateTeamSelection(collection, []);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /at least 1/i);
    });

    it('rejects robot not in collection', () => {
      const result = validateTeamSelection(collection, ['metal-legendary']);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /not in collection/i);
    });

    it('rejects selection over budget', () => {
      const bigCollection = ['fire-common', 'water-common', 'wood-common', 'earth-common', 'metal-uncommon'];
      const result = validateTeamSelection(bigCollection, ['fire-common', 'water-common', 'wood-common', 'metal-uncommon']);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /exceeds.*budget/i);
    });

    it('accepts exactly 10 points', () => {
      const coll = ['fire-common', 'water-common', 'earth-uncommon'];
      const result = validateTeamSelection(coll, ['fire-common', 'water-common', 'earth-uncommon']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 10);
    });
  });

  describe('addToCollection', () => {
    it('adds new robot ID', () => {
      const collection = ['fire-common'];
      const result = addToCollection(collection, 'water-rare');
      assert.strictEqual(result.added, true);
      assert.ok(result.collection.includes('water-rare'));
    });

    it('does not duplicate existing robot', () => {
      const collection = ['fire-common'];
      const result = addToCollection(collection, 'fire-common');
      assert.strictEqual(result.added, false);
      assert.strictEqual(result.collection.filter(id => id === 'fire-common').length, 1);
    });
  });
});
