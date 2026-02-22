import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  RARITY_POINT_COST,
  MAX_TEAM_POINTS,
  DEFAULT_COLLECTION,
  validateTeamSelection,
  addToCollection,
  getCollectionCatalog
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
    const collection = ['hikaribon', 'tsukimochi', 'hanatchi'];

    it('accepts valid selection within budget', () => {
      const result = validateTeamSelection(collection, ['hikaribon', 'tsukimochi']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 6);
    });

    it('accepts single robot', () => {
      const result = validateTeamSelection(collection, ['hikaribon']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 3);
    });

    it('rejects empty selection', () => {
      const result = validateTeamSelection(collection, []);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /at least 1/i);
    });

    it('rejects robot not in collection', () => {
      const result = validateTeamSelection(collection, ['kitsunova']);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /not in collection/i);
    });

    it('rejects selection over budget', () => {
      const bigCollection = ['hikaribon', 'tsukimochi', 'hanatchi', 'kazenoko', 'kumaro'];
      const result = validateTeamSelection(bigCollection, ['hikaribon', 'tsukimochi', 'hanatchi', 'kumaro']);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /exceeds.*budget/i);
    });

    it('accepts exactly 10 points', () => {
      const coll = ['hikaribon', 'tsukimochi', 'kumaro'];
      const result = validateTeamSelection(coll, ['hikaribon', 'tsukimochi', 'kumaro']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 10);
    });
  });

  describe('getCollectionCatalog', () => {
    it('includes full ultimate skill data', () => {
      const catalog = getCollectionCatalog([]);
      const kamedor = catalog.find(c => c.id === 'kamedor');
      assert.ok(kamedor, 'kamedor should exist in catalog');
      assert.ok(kamedor.ultimate.power, 'ultimate should have power');
      assert.ok(kamedor.ultimate.chargesRequired, 'ultimate should have chargesRequired');
      assert.ok(kamedor.ultimate.type, 'ultimate should have type');
      assert.ok(kamedor.ultimate.target, 'ultimate should have target');
    });

    it('includes archetype and modifier', () => {
      const catalog = getCollectionCatalog([]);
      const kamedor = catalog.find(c => c.id === 'kamedor');
      assert.strictEqual(kamedor.archetype, 'Tank/Healer');
      assert.ok(kamedor.modifier, 'should have modifier');
      assert.strictEqual(kamedor.modifier.meaning, 'Ancient');
    });
  });

  describe('addToCollection', () => {
    it('adds new robot ID', () => {
      const collection = ['hikaribon'];
      const result = addToCollection(collection, 'nimbulon');
      assert.strictEqual(result.added, true);
      assert.ok(result.collection.includes('nimbulon'));
    });

    it('does not duplicate existing robot', () => {
      const collection = ['hikaribon'];
      const result = addToCollection(collection, 'hikaribon');
      assert.strictEqual(result.added, false);
      assert.strictEqual(result.collection.filter(id => id === 'hikaribon').length, 1);
    });
  });
});
