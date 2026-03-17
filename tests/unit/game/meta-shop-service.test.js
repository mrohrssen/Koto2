import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMetaShopState, buyUpgrade, getMetaMultipliers } from '../../../src/game/services/meta-shop-service.js';

describe('meta-shop-service', () => {
  function makeMeta(tokens = 0, upgrades = {}) {
    return { progressionTokens: tokens, upgrades };
  }

  describe('getMetaShopState', () => {
    it('returns all upgrades with current levels and costs', () => {
      const meta = makeMeta(5, { hp_boost: 2 });
      const result = getMetaShopState(meta);

      assert.equal(result.progressionTokens, 5);
      assert.equal(result.upgrades.length, 3);

      const hp = result.upgrades.find(u => u.id === 'hp_boost');
      assert.equal(hp.currentLevel, 2);
      assert.equal(hp.currentValue, 10);
      assert.equal(hp.nextCost, 3);
      assert.equal(hp.nextValue, 15);

      const xp = result.upgrades.find(u => u.id === 'xp_boost');
      assert.equal(xp.currentLevel, 0);
      assert.equal(xp.nextCost, 1);
    });

    it('shows null for next cost/value when maxed', () => {
      const meta = makeMeta(0, { atk_boost: 5 });
      const result = getMetaShopState(meta);
      const atk = result.upgrades.find(u => u.id === 'atk_boost');
      assert.equal(atk.currentLevel, 5);
      assert.equal(atk.nextCost, null);
      assert.equal(atk.nextValue, null);
    });
  });

  describe('buyUpgrade', () => {
    it('purchases an upgrade and deducts tokens', () => {
      const meta = makeMeta(3, {});
      const result = buyUpgrade(meta, 'hp_boost');

      assert.equal(result.success, true);
      assert.equal(meta.upgrades.hp_boost, 1);
      assert.equal(meta.progressionTokens, 2);
    });

    it('purchases next level of existing upgrade', () => {
      const meta = makeMeta(5, { hp_boost: 2 });
      const result = buyUpgrade(meta, 'hp_boost');

      assert.equal(result.success, true);
      assert.equal(meta.upgrades.hp_boost, 3);
      assert.equal(meta.progressionTokens, 2); // cost 3 for level 3
    });

    it('rejects purchase when not enough tokens', () => {
      const meta = makeMeta(1, { hp_boost: 2 }); // needs 3 for level 3
      const result = buyUpgrade(meta, 'hp_boost');

      assert.equal(result.success, false);
      assert.match(result.error, /enough tokens/i);
      assert.equal(meta.upgrades.hp_boost, 2); // unchanged
    });

    it('rejects purchase when already maxed', () => {
      const meta = makeMeta(99, { xp_boost: 5 });
      const result = buyUpgrade(meta, 'xp_boost');

      assert.equal(result.success, false);
      assert.match(result.error, /max/i);
    });

    it('rejects purchase for unknown upgrade', () => {
      const meta = makeMeta(10, {});
      const result = buyUpgrade(meta, 'fake_upgrade');

      assert.equal(result.success, false);
      assert.match(result.error, /not found/i);
    });
  });

  describe('getMetaMultipliers', () => {
    it('returns 1.0 multipliers when no upgrades', () => {
      const meta = makeMeta(0, {});
      const mults = getMetaMultipliers(meta);

      assert.equal(mults.hpMult, 1.0);
      assert.equal(mults.atkMult, 1.0);
      assert.equal(mults.xpMult, 1.0);
    });

    it('calculates correct multipliers from upgrade levels', () => {
      const meta = makeMeta(0, { hp_boost: 3, atk_boost: 2, xp_boost: 4 });
      const mults = getMetaMultipliers(meta);

      assert.equal(mults.hpMult, 1.15);  // 15%
      assert.equal(mults.atkMult, 1.10);  // 10%
      assert.equal(mults.xpMult, 1.40);  // 40%
    });
  });
});
