import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MAX_TEAM_POINTS,
  DEFAULT_COLLECTION,
  validateTeamSelection,
  addToCollection,
  getCollectionCatalog
} from '../../../src/game/services/creature-collection-service.js';

describe('creature-collection-service', () => {
  describe('validateTeamSelection', () => {
    const collection = ['hi', 'mizu', 'ki'];

    it('accepts valid selection within budget', () => {
      const result = validateTeamSelection(collection, ['hi', 'mizu']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 6);
    });

    it('accepts single creature', () => {
      const result = validateTeamSelection(collection, ['hi']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 3);
    });

    it('rejects empty selection', () => {
      const result = validateTeamSelection(collection, []);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /at least 1/i);
    });

    it('rejects creature not in collection', () => {
      const result = validateTeamSelection(collection, ['nonexistent']);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /not in collection/i);
    });

    it('rejects selection over budget', () => {
      // 4 commons = 12 points, exceeds 10-point budget
      const bigCollection = ['hi', 'mizu', 'ki', 'ishi'];
      const result = validateTeamSelection(bigCollection, ['hi', 'mizu', 'ki', 'ishi']);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /exceeds.*budget/i);
    });

    it('accepts exactly 9 points (3 commons)', () => {
      // All R1 creatures are common (3 pts each): 3 * 3 = 9
      const coll = ['hi', 'mizu', 'ki'];
      const result = validateTeamSelection(coll, ['hi', 'mizu', 'ki']);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCost, 9);
    });
  });

  describe('getCollectionCatalog', () => {
    it('includes archetype and base stats', () => {
      const catalog = getCollectionCatalog([]);
      const hi = catalog.find(c => c.id === 'hi');
      assert.ok(hi, 'hi should exist in catalog');
      assert.ok(hi.archetype, 'should have archetype');
      assert.ok(hi.baseHp > 0, 'should have baseHp');
      assert.ok(hi.baseAttack > 0, 'should have baseAttack');
      assert.ok(hi.element, 'should have element');
      assert.ok(hi.rarity, 'should have rarity');
    });

    it('includes archetype and element', () => {
      const catalog = getCollectionCatalog([]);
      const hi = catalog.find(c => c.id === 'hi');
      assert.strictEqual(hi.archetype, 'Fighter');
      assert.strictEqual(hi.element, 'fire');
    });

    it('includes befriendCount from meta', () => {
      const catalog = getCollectionCatalog(['hi'], { hi: 5 });
      const hi = catalog.find(c => c.id === 'hi');
      assert.strictEqual(hi.befriendCount, 5);
    });

    it('defaults befriendCount to 0', () => {
      const catalog = getCollectionCatalog([]);
      const hi = catalog.find(c => c.id === 'hi');
      assert.strictEqual(hi.befriendCount, 0);
    });
  });

  describe('addToCollection', () => {
    it('adds new creature ID', () => {
      const collection = ['hi'];
      const result = addToCollection(collection, 'mizu');
      assert.strictEqual(result.added, true);
      assert.ok(result.collection.includes('mizu'));
    });

    it('does not duplicate existing creature', () => {
      const collection = ['hi'];
      const result = addToCollection(collection, 'hi');
      assert.strictEqual(result.added, false);
      assert.strictEqual(result.collection.filter(id => id === 'hi').length, 1);
    });
  });
});
