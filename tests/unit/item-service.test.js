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

// Mock robot for item tests — avoids dependency on creature data
function mockRobot(hp = 100, maxHp = 100) {
  return {
    hp, maxHp, element: 'fire',
    mp: 80, maxMp: 80,
    moves: [{ id: 'test', name: 'test', nameEn: 'Test', category: 'damage', target: 'single_enemy', power: 20, mpCost: 10, element: 'fire' }],
    // Legacy charge fields still used by chargeBoost code path
    ultimate: { charges: 0, chargesRequired: 5 }
  };
}

describe('Item Shop - Roll', () => {
  it('returns exactly 3 items', () => {
    const items = rollShopItems();
    assert.strictEqual(items.length, 3);
  });

  it('each item has vocab fields and effect', () => {
    const items = rollShopItems();
    for (const item of items) {
      assert.ok(item.id, 'missing id');
      assert.ok(item.word, 'missing word');
      assert.ok(item.reading, 'missing reading');
      assert.ok(item.meaning, 'missing meaning');
      assert.ok(item.description, 'missing description');
      assert.ok(item.type, 'missing type');
      assert.ok(item.rarity, 'missing rarity');
    }
  });

  it('never returns duplicate items in a single roll', () => {
    for (let i = 0; i < 20; i++) {
      const items = rollShopItems();
      const ids = items.map(it => it.id);
      assert.strictEqual(new Set(ids).size, ids.length, `Duplicate found: ${ids}`);
    }
  });
});

describe('Item Buffs - Stat Boosts', () => {
  it('attack mult stacks per application', () => {
    const buffs = createItemBuffs();
    const atkItem = { type: 'boost', effect: { field: 'attackMult', value: 0.02 } };
    const party = { active: [mockRobot()], reserves: [] };
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

  it('boost applies field stat correctly', () => {
    const buffs = createItemBuffs();
    const item = {
      type: 'boost',
      effect: { field: 'hpMult', value: 0.03 }
    };
    const party = { active: [mockRobot()], reserves: [] };
    applyItem(item, party, buffs);
    assert.strictEqual(buffs.hpMult, 1.03);
  });

  it('boost applies flatDamageReduction additively', () => {
    const buffs = createItemBuffs();
    const item = {
      type: 'boost',
      effect: { field: 'flatDamageReduction', value: 2 }
    };
    const party = { active: [mockRobot()], reserves: [] };
    applyItem(item, party, buffs);
    assert.strictEqual(buffs.flatDamageReduction, 2);
    applyItem(item, party, buffs);
    assert.strictEqual(buffs.flatDamageReduction, 4);
  });
});

describe('Item Buffs - Heals', () => {
  it('healPercent heals only the lowest HP robot', () => {
    const party = {
      active: [mockRobot(50), mockRobot(30), mockRobot(70)],
      reserves: []
    };
    const healItem = { type: 'heal', effect: { healPercent: 0.25 } };
    const buffs = createItemBuffs();
    applyItem(healItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 50);
    assert.strictEqual(party.active[1].hp, 55);  // 30 + 25% of 100 = 55
    assert.strictEqual(party.active[2].hp, 70);
  });

  it('healAllPercent heals all alive robots', () => {
    const party = {
      active: [mockRobot(50), mockRobot(60)],
      reserves: []
    };
    const healAllItem = { type: 'heal', effect: { healAllPercent: 0.15 } };
    const buffs = createItemBuffs();
    applyItem(healAllItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 65);  // 50 + 15
    assert.strictEqual(party.active[1].hp, 75);  // 60 + 15
  });

  it('healMostDamaged heals most damaged robot to full', () => {
    const party = {
      active: [mockRobot(80), mockRobot(30)],
      reserves: []
    };
    const patchItem = { type: 'heal', effect: { healMostDamaged: true } };
    const buffs = createItemBuffs();
    applyItem(patchItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 80);
    assert.strictEqual(party.active[1].hp, 100);
  });

  it('revivePercent restores one KO robot', () => {
    const party = {
      active: [mockRobot(0)],
      reserves: [mockRobot(50)]
    };
    const reviveItem = { type: 'revive', effect: { revivePercent: 0.3 } };
    const buffs = createItemBuffs();
    applyItem(reviveItem, party, buffs);
    assert.strictEqual(party.active[0].hp, 30);
  });
});

describe('Item Buffs - Charge', () => {
  it('chargeBoost adds charges to all robots', () => {
    const party = {
      active: [mockRobot()],
      reserves: []
    };
    const chargeItem = { type: 'charge', effect: { chargeBoost: 2 } };
    const buffs = createItemBuffs();
    applyItem(chargeItem, party, buffs);
    assert.strictEqual(party.active[0].ultimate.charges, 2);
  });
});

describe('Item Buffs - XP Items', () => {
  it('xpCharm multiplies XP', () => {
    const buffs = createItemBuffs();
    const item = { type: 'xpCharm', effect: { value: 0.25 } };
    const party = { active: [mockRobot()], reserves: [] };
    applyItem(item, party, buffs);
    assert.strictEqual(buffs.xpMultiplier, 1.25);
  });

  it('xpBalance adds stacks', () => {
    const buffs = createItemBuffs();
    const item = { type: 'xpBalance', effect: { value: 1 } };
    const party = { active: [mockRobot()], reserves: [] };
    applyItem(item, party, buffs);
    assert.strictEqual(buffs.xpBalanceStacks, 1);
    applyItem(item, party, buffs);
    assert.strictEqual(buffs.xpBalanceStacks, 2);
  });
});

describe('Item Buffs - Temp Boost', () => {
  it('tempBoost applies temp_attack_flat effect to all robots', () => {
    const r1 = mockRobot();
    r1.activeEffects = [];
    const r2 = mockRobot();
    r2.activeEffects = [];
    const party = { active: [r1, r2], reserves: [] };
    const buffs = createItemBuffs();
    const item = {
      type: 'boost',
      effect: { tempBoost: { field: 'attack', value: 3, turns: 5, target: 'all' } }
    };
    applyItem(item, party, buffs);
    assert.strictEqual(r1.activeEffects.length, 1);
    assert.strictEqual(r1.activeEffects[0].type, 'temp_attack_flat');
    assert.strictEqual(r1.activeEffects[0].value, 3);
    assert.strictEqual(r1.activeEffects[0].remainingTurns, 5);
    assert.strictEqual(r2.activeEffects.length, 1);
  });

  it('tempBoost does not permanently change robot.attack', () => {
    const r1 = mockRobot();
    r1.attack = 10;
    r1.activeEffects = [];
    const party = { active: [r1], reserves: [] };
    const buffs = createItemBuffs();
    const item = {
      type: 'boost',
      effect: { tempBoost: { field: 'attack', value: 3, turns: 5, target: 'all' } }
    };
    applyItem(item, party, buffs);
    assert.strictEqual(r1.attack, 10, 'attack should not be permanently modified');
  });
});
