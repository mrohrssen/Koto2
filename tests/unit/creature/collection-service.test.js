import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MAX_TEAM_POINTS,
  DEFAULT_COLLECTION,
  validateTeamSelection,
  addToCollection,
  getCollectionCatalog,
  ensureCreatureCounts,
  getCreatureCount,
  addCreatureCopy,
  consumeCreatureCopies,
  countRequirements
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

  describe('creature copy counts', () => {
    it('initializes default starter counts for new or old meta', () => {
      const meta = { creatureCollection: ['hi'] };

      const counts = ensureCreatureCounts(meta);

      assert.strictEqual(counts.hi, 1);
      assert.strictEqual(getCreatureCount(meta, 'hi'), 1);
      for (const id of DEFAULT_COLLECTION) {
        assert.strictEqual(counts[id], 1);
        assert.ok(meta.creatureCollection.includes(id));
      }
    });

    it('adds creature copies and preserves discovery', () => {
      const meta = { creatureCollection: ['hi'], creatureCounts: { hi: 1 } };

      const result = addCreatureCopy(meta, 'hi');
      const newResult = addCreatureCopy(meta, 'neko', 2);

      assert.deepStrictEqual(result, { addedDiscovery: false, count: 2 });
      assert.deepStrictEqual(newResult, { addedDiscovery: true, count: 2 });
      assert.strictEqual(meta.creatureCounts.hi, 2);
      assert.strictEqual(meta.creatureCounts.neko, 2);
      assert.ok(meta.creatureCollection.includes('neko'));
    });

    it('counts duplicate requirements by creature ID', () => {
      assert.deepStrictEqual(countRequirements(['hi', 'hi', 'neko']), [
        { id: 'hi', required: 2 },
        { id: 'neko', required: 1 }
      ]);
    });

    it('consumes creature copies atomically', () => {
      const meta = { creatureCollection: ['hi', 'neko'], creatureCounts: { hi: 2, neko: 1 } };

      const result = consumeCreatureCopies(meta, [
        { id: 'hi', required: 2 },
        { id: 'neko', required: 1 }
      ]);

      assert.strictEqual(result.success, true);
      assert.strictEqual(meta.creatureCounts.hi, 0);
      assert.strictEqual(meta.creatureCounts.neko, 0);
      assert.deepStrictEqual(result.consumed, [
        { id: 'hi', required: 2, ownedBefore: 2, ownedAfter: 0 },
        { id: 'neko', required: 1, ownedBefore: 1, ownedAfter: 0 }
      ]);
    });

    it('does not partially consume when requirements are missing', () => {
      const meta = { creatureCollection: ['hi', 'neko'], creatureCounts: { hi: 2, neko: 0 } };

      const result = consumeCreatureCopies(meta, [
        { id: 'hi', required: 2 },
        { id: 'neko', required: 1 }
      ]);

      assert.strictEqual(result.success, false);
      assert.deepStrictEqual(result.missing, [
        { id: 'neko', required: 1, owned: 0, missing: 1 }
      ]);
      assert.strictEqual(meta.creatureCounts.hi, 2);
      assert.strictEqual(meta.creatureCounts.neko, 0);
    });

    it('preserves explicit zero counts during normal helper use', () => {
      const meta = {
        creatureCollection: ['hi'],
        creatureCounts: { hi: 0, hikaribon: 1, hanatchi: 1, tsukimochi: 1 }
      };

      ensureCreatureCounts(meta);

      assert.strictEqual(meta.creatureCounts.hi, 0);
    });

    it('validates starter selection against owned counts', () => {
      const meta = {
        creatureCollection: ['hi', 'mizu'],
        creatureCounts: { hi: 1, mizu: 0 }
      };

      const valid = validateTeamSelection(meta.creatureCollection, ['hi'], meta.creatureCounts);
      const invalid = validateTeamSelection(meta.creatureCollection, ['mizu'], meta.creatureCounts);

      assert.strictEqual(valid.valid, true);
      assert.strictEqual(invalid.valid, false);
      assert.match(invalid.reason, /no owned copies/i);
    });

    it('adds owned count to catalog rows', () => {
      const catalog = getCollectionCatalog(['hi'], { hi: 5 }, { hi: 2 });
      const hi = catalog.find(c => c.id === 'hi');

      assert.strictEqual(hi.owned, true);
      assert.strictEqual(hi.ownedCount, 2);
      assert.strictEqual(hi.befriendCount, 5);
    });
  });
});
