import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MAX_TEAM_POINTS,
  DEFAULT_COLLECTION,
  validateTeamSelection,
  addToCollection,
  getCollectionCatalog
} from '../../../src/game/services/creature-collection-service.js';

describe('robot-collection-service', () => {
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
    it('includes archetype and base stats', () => {
      const catalog = getCollectionCatalog([]);
      const kamedor = catalog.find(c => c.id === 'kamedor');
      assert.ok(kamedor, 'kamedor should exist in catalog');
      assert.ok(kamedor.archetype, 'should have archetype');
      assert.ok(kamedor.baseHp > 0, 'should have baseHp');
      assert.ok(kamedor.baseAttack > 0, 'should have baseAttack');
      assert.ok(kamedor.element, 'should have element');
      assert.ok(kamedor.rarity, 'should have rarity');
    });

    it('includes archetype and modifier', () => {
      const catalog = getCollectionCatalog([]);
      const kamedor = catalog.find(c => c.id === 'kamedor');
      assert.strictEqual(kamedor.archetype, 'Tank/Healer');
      assert.ok(kamedor.modifier, 'should have modifier');
      assert.strictEqual(kamedor.modifier.meaning, 'Ancient');
    });

    it('includes befriendCount from meta', () => {
      const catalog = getCollectionCatalog(['kamedor'], { kamedor: 5 });
      const kamedor = catalog.find(c => c.id === 'kamedor');
      assert.strictEqual(kamedor.befriendCount, 5);
    });

    it('defaults befriendCount to 0', () => {
      const catalog = getCollectionCatalog([]);
      const kamedor = catalog.find(c => c.id === 'kamedor');
      assert.strictEqual(kamedor.befriendCount, 0);
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
