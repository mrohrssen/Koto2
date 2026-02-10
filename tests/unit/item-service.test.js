import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  rollShopItems,
  applyItem,
  createItemBuffs,
  getBuffedAttack,
  getBuffedAutoPower,
  getBuffedUltimatePower,
  getBuffedElementMultiplier,
  applyDamageReduction
} from '../../src/game/services/item-service.js';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Item Shop - Roll', () => {
  it('returns exactly 3 items', () => {
    const items = rollShopItems();
    assert.strictEqual(items.length, 3);
  });

  it('each item has id, name, description, type', () => {
    const items = rollShopItems();
    for (const item of items) {
      assert.ok(item.id);
      assert.ok(item.nameEn);
      assert.ok(item.description);
      assert.ok(item.type);
    }
  });
});

describe('Item Buffs - Stat Boosts', () => {
  it('ATK Boost stacks +2% per application', () => {
    const buffs = createItemBuffs();
    const atkItem = { type: 'stat', effect: { field: 'attackMult', value: 0.02 } };
    const party = { active: [instantiateRobot('fire-common')], reserves: [] };
    applyItem(atkItem, party, buffs);
    assert.strictEqual(buffs.attackMult, 1.02);
    applyItem(atkItem, party, buffs);
    assert.strictEqual(buffs.attackMult, 1.04);
  });

  it('getBuffedAttack applies multiplier', () => {
    const buffs = createItemBuffs();
    buffs.attackMult = 1.10;
    assert.strictEqual(getBuffedAttack(10, buffs), 11);
  });

  it('Element Edge adds to super-effective multiplier', () => {
    const buffs = createItemBuffs();
    buffs.elementEdge = 0.10;
    assert.strictEqual(getBuffedElementMultiplier(1.5, buffs), 1.6);
    assert.strictEqual(getBuffedElementMultiplier(1.0, buffs), 1.0);
  });

  it('Flat damage reduction reduces incoming damage (min 1)', () => {
    const buffs = createItemBuffs();
    buffs.flatDamageReduction = 3;
    assert.strictEqual(applyDamageReduction(10, buffs), 7);
    assert.strictEqual(applyDamageReduction(2, buffs), 1);
  });
});

describe('Item Buffs - Heals', () => {
  it('Team Heal heals only the lowest HP robot for 25% max HP', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common'), instantiateRobot('earth-common')],
      reserves: []
    };
    party.active[0].hp = 50;
    party.active[1].hp = 30;
    party.active[2].hp = 70;
    const healItem = { type: 'heal', effect: { healPercent: 0.25 } };
    const buffs = createItemBuffs();
    applyItem(healItem, party, buffs);
    // Only the lowest HP robot (active[1] at 30 HP) should be healed
    assert.strictEqual(party.active[0].hp, 50);  // unchanged
    assert.strictEqual(party.active[1].hp, 55);  // 30 + 25 = 55
    assert.strictEqual(party.active[2].hp, 70);  // unchanged
  });

  it('Patch Up heals most damaged robot to full', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common')],
      reserves: []
    };
    party.active[0].hp = 80;
    party.active[1].hp = 30;
    const patchItem = { type: 'heal', effect: { healMostDamaged: true } };
    const buffs = createItemBuffs();
    applyItem(patchItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 80);
    assert.strictEqual(party.active[1].hp, 100);
  });

  it('Revive restores one KO robot at 30% HP', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: [instantiateRobot('water-common')]
    };
    party.active[0].hp = 0;
    const reviveItem = { type: 'heal', effect: { revivePercent: 0.3 } };
    const buffs = createItemBuffs();
    applyItem(reviveItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 30);
  });

  it('Quick Charge adds +2 charges to all robots', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: []
    };
    const chargeItem = { type: 'utility', effect: { chargeBoost: 2 } };
    const buffs = createItemBuffs();
    applyItem(chargeItem, party, buffs);
    assert.strictEqual(party.active[0].ultimate.charges, 2);
  });
});
