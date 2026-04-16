import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCrest, openChest, getCrestMultipliers, equipCrest, unequipCrest, getCrestState, ELEMENT_STAT_MAP, RARITY_RANGES, CHEST_DROP_RATES, CHEST_COST } from '../../../src/game/services/crest-service.js';

describe('crest-service', () => {
  describe('generateCrest', () => {
    it('generates a crest with correct element and stat', () => {
      const crest = generateCrest('fire');
      assert.equal(crest.element, 'fire');
      assert.equal(crest.stat, 'attack');
      assert.ok(crest.id.startsWith('crest_fire_'));
      assert.ok(typeof crest.value === 'number');
      assert.ok(crest.value >= 0.03 && crest.value <= 0.40);
      assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(crest.rarity));
    });

    it('maps each element to the correct stat', () => {
      assert.equal(generateCrest('fire').stat, 'attack');
      assert.equal(generateCrest('water').stat, 'mp');
      assert.equal(generateCrest('wood').stat, 'hp');
      assert.equal(generateCrest('earth').stat, 'defense');
      assert.equal(generateCrest('metal').stat, 'xp');
    });

    it('generates value within rarity range', () => {
      for (let i = 0; i < 100; i++) {
        const crest = generateCrest('fire');
        const range = RARITY_RANGES[crest.rarity];
        assert.ok(crest.value >= range.min, `${crest.value} < ${range.min} for ${crest.rarity}`);
        assert.ok(crest.value <= range.max, `${crest.value} > ${range.max} for ${crest.rarity}`);
      }
    });

    it('throws on invalid element', () => {
      assert.throws(() => generateCrest('neutral'), /Invalid element/);
      assert.throws(() => generateCrest('ice'), /Invalid element/);
    });
  });

  describe('openChest', () => {
    function makeMeta(drops = {}) {
      return {
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0, ...drops },
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null }
      };
    }

    it('opens a chest and deducts drops', () => {
      const meta = makeMeta({ fire: 5 });
      const result = openChest(meta, 'fire');
      assert.equal(result.success, true);
      assert.equal(meta.elementDrops.fire, 2);
      assert.equal(meta.crests.length, 1);
      assert.equal(meta.crests[0].element, 'fire');
      assert.equal(result.crest.element, 'fire');
    });

    it('fails with insufficient drops', () => {
      const meta = makeMeta({ fire: 2 });
      const result = openChest(meta, 'fire');
      assert.equal(result.success, false);
      assert.equal(result.error, 'Not enough element drops');
      assert.equal(meta.elementDrops.fire, 2);
      assert.equal(meta.crests.length, 0);
    });

    it('fails with invalid element', () => {
      const meta = makeMeta();
      const result = openChest(meta, 'neutral');
      assert.equal(result.success, false);
      assert.match(result.error, /Invalid element/);
    });
  });

  describe('equipCrest', () => {
    function makeMeta() {
      const crest = { id: 'crest_fire_abc', element: 'fire', rarity: 'rare', stat: 'attack', value: 0.15 };
      return {
        crests: [crest],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null }
      };
    }

    it('equips a crest to matching element slot', () => {
      const meta = makeMeta();
      const result = equipCrest(meta, 'crest_fire_abc');
      assert.equal(result.success, true);
      assert.equal(meta.equippedCrests.fire, 'crest_fire_abc');
    });

    it('fails when crest not found', () => {
      const meta = makeMeta();
      const result = equipCrest(meta, 'crest_fire_nonexistent');
      assert.equal(result.success, false);
      assert.equal(result.error, 'Crest not found');
    });

    it('replaces existing equipped crest', () => {
      const meta = makeMeta();
      const better = { id: 'crest_fire_xyz', element: 'fire', rarity: 'epic', stat: 'attack', value: 0.25 };
      meta.crests.push(better);
      meta.equippedCrests.fire = 'crest_fire_abc';
      const result = equipCrest(meta, 'crest_fire_xyz');
      assert.equal(result.success, true);
      assert.equal(meta.equippedCrests.fire, 'crest_fire_xyz');
    });
  });

  describe('unequipCrest', () => {
    it('unequips a crest from the element slot', () => {
      const meta = {
        crests: [{ id: 'crest_fire_abc', element: 'fire', rarity: 'rare', stat: 'attack', value: 0.15 }],
        equippedCrests: { fire: 'crest_fire_abc', water: null, earth: null, wood: null, metal: null }
      };
      const result = unequipCrest(meta, 'fire');
      assert.equal(result.success, true);
      assert.equal(meta.equippedCrests.fire, null);
    });

    it('succeeds even when slot is already empty', () => {
      const meta = { crests: [], equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null } };
      const result = unequipCrest(meta, 'fire');
      assert.equal(result.success, true);
    });
  });

  describe('getCrestMultipliers', () => {
    it('returns 1.0 multipliers when no crests equipped', () => {
      const meta = { crests: [], equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null } };
      const mults = getCrestMultipliers(meta);
      assert.equal(mults.hpMult, 1.0);
      assert.equal(mults.atkMult, 1.0);
      assert.equal(mults.mpMult, 1.0);
      assert.equal(mults.defMult, 1.0);
      assert.equal(mults.xpMult, 1.0);
    });

    it('applies equipped crest values as multipliers', () => {
      const meta = {
        crests: [
          { id: 'crest_fire_a', element: 'fire', stat: 'attack', value: 0.15 },
          { id: 'crest_wood_b', element: 'wood', stat: 'hp', value: 0.10 }
        ],
        equippedCrests: { fire: 'crest_fire_a', water: null, earth: null, wood: 'crest_wood_b', metal: null }
      };
      const mults = getCrestMultipliers(meta);
      assert.equal(mults.atkMult, 1.15);
      assert.equal(mults.hpMult, 1.10);
      assert.equal(mults.mpMult, 1.0);
      assert.equal(mults.defMult, 1.0);
      assert.equal(mults.xpMult, 1.0);
    });

    it('returns 1.0 multipliers for null/undefined meta', () => {
      const mults = getCrestMultipliers(null);
      assert.equal(mults.hpMult, 1.0);
      assert.equal(mults.atkMult, 1.0);
    });
  });

  describe('getCrestState', () => {
    it('returns default state for empty meta', () => {
      const state = getCrestState({});
      assert.equal(state.chestCost, CHEST_COST);
      assert.deepEqual(state.elementDrops, { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 });
      assert.deepEqual(state.crests, []);
      assert.deepEqual(state.equippedCrests, { fire: null, water: null, earth: null, wood: null, metal: null });
    });
  });
});
