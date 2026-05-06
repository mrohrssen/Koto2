import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  rollShopItems,
  applyItem,
  createItemBuffs,
  getBuffedAttack,
  getBuffedElementMultiplier,
  applyDamageReduction
} from '../../../src/game/services/item-service.js';

// Mock creature for item tests — avoids dependency on creature data
function mockCreature(hp = 100, maxHp = 100) {
  return {
    hp, maxHp, element: 'fire',
    mp: 80, maxMp: 80, level: 1,
    moves: [{ id: 'test', name: 'test', nameEn: 'Test', category: 'damage', target: 'single_enemy', power: 20, mpCost: 10, element: 'fire' }],
    itemBuffs: null,
    equippedItems: [],
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
  it('attack mult stacks per application on creature', () => {
    const atkItem = { type: 'boost', effect: { field: 'attackMult', value: 0.02 } };
    const creature = mockCreature();
    const party = { active: [creature], reserves: [] };
    applyItem(atkItem, party, null, 0);
    assert.strictEqual(creature.itemBuffs.attackMult, 1.02);
    applyItem(atkItem, party, null, 0);
    assert.strictEqual(creature.itemBuffs.attackMult, 1.04);
  });

  it('getBuffedAttack applies multiplier', () => {
    const buffs = createItemBuffs();
    buffs.attackMult = 1.10;
    assert.strictEqual(getBuffedAttack(10, buffs), 11);
  });

  it('getBuffedAttack bumps by at least 1 when small % would floor to same integer', () => {
    const buffs = createItemBuffs();
    buffs.attackMult = 1.02;
    assert.strictEqual(getBuffedAttack(20, buffs), 21);
    buffs.attackMult = 1.05;
    assert.strictEqual(getBuffedAttack(20, buffs), 21);
  });

  it('applyItem boost creates itemBuffs on creature if missing', () => {
    const atkItem = { type: 'boost', effect: { field: 'attackMult', value: 0.05 } };
    const creature = mockCreature();
    creature.itemBuffs = null;
    const party = { active: [creature], reserves: [] };
    applyItem(atkItem, party, null, 0);
    assert.strictEqual(creature.itemBuffs.attackMult, 1.05);
    assert.strictEqual(typeof creature.itemBuffs.hpMult, 'number');
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

  it('boost applies field stat to creature buffs', () => {
    const item = { type: 'boost', effect: { field: 'flatDamageReduction', value: 2 } };
    const creature = mockCreature();
    const party = { active: [creature], reserves: [] };
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.flatDamageReduction, 2);
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.flatDamageReduction, 4);
  });

  it('hpMult boost scales creature maxHp and hp', () => {
    const item = { type: 'boost', effect: { field: 'hpMult', value: 0.05 } };
    const creature = mockCreature(80, 100);
    const party = { active: [creature], reserves: [] };
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.hpMult, 1.05);
    assert.strictEqual(creature.maxHp, 105); // 100 * 1.05
    assert.strictEqual(creature.hp, 84);     // 80 * 1.05
  });

  it('negative hpMult reduces creature maxHp', () => {
    const item = { type: 'boost', effect: { stats: [{ field: 'attackMult', value: 0.05 }, { field: 'hpMult', value: -0.05 }] } };
    const creature = mockCreature(100, 100);
    const party = { active: [creature], reserves: [] };
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.attackMult, 1.05);
    assert.strictEqual(creature.itemBuffs.hpMult, 0.95);
    assert.strictEqual(creature.maxHp, 95);
    assert.strictEqual(creature.hp, 95);
  });

  it('boost applies baseHpBonus and scales creature HP', () => {
    const item = { type: 'boost', effect: { field: 'baseHpBonus', value: 10 } };
    const creature = mockCreature(100, 100);
    creature.level = 1;
    const party = { active: [creature], reserves: [] };
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.baseHpBonus, 10);
    assert.strictEqual(creature.maxHp, 110); // +10 at level 1 (mult 1.0)
    assert.strictEqual(creature.hp, 110);
  });
});

describe('Item Buffs - Heals', () => {
  it('healPercent heals only the target creature', () => {
    const party = {
      active: [mockCreature(50), mockCreature(30), mockCreature(70)],
      reserves: []
    };
    const healItem = { type: 'heal', effect: { healPercent: 0.25 } };
    applyItem(healItem, party, null, 1);
    assert.strictEqual(party.active[0].hp, 50);
    assert.strictEqual(party.active[1].hp, 55);  // 30 + 25% of 100 = 55
    assert.strictEqual(party.active[2].hp, 70);
  });

  it('healAllPercent heals all alive creatures', () => {
    const party = {
      active: [mockCreature(50), mockCreature(60)],
      reserves: []
    };
    const healAllItem = { type: 'heal', effect: { healAllPercent: 0.15 } };
    applyItem(healAllItem, party, null, 0);
    assert.strictEqual(party.active[0].hp, 65);  // 50 + 15
    assert.strictEqual(party.active[1].hp, 75);  // 60 + 15
  });

  it('healMostDamaged heals most damaged creature to full', () => {
    const party = {
      active: [mockCreature(80), mockCreature(30)],
      reserves: []
    };
    const patchItem = { type: 'heal', effect: { healMostDamaged: true } };
    applyItem(patchItem, party, null, 0);
    assert.strictEqual(party.active[0].hp, 80);
    assert.strictEqual(party.active[1].hp, 100);
  });

  it('revivePercent restores one KO creature', () => {
    const party = {
      active: [mockCreature(0)],
      reserves: [mockCreature(50)]
    };
    const reviveItem = { type: 'revive', effect: { revivePercent: 0.3 } };
    applyItem(reviveItem, party, null, 0);
    assert.strictEqual(party.active[0].hp, 30);
  });
});

describe('Item Buffs - MP Restore', () => {
  it('mpRestore restores MP to target creature only', () => {
    const r1 = mockCreature();
    r1.mp = 20; r1.maxMp = 80;
    const r2 = mockCreature();
    r2.mp = 0; r2.maxMp = 80;
    const party = { active: [r1, r2], reserves: [] };
    const item = { type: 'mpRestore', effect: { mpRestorePercent: 0.25 } };
    applyItem(item, party, null, 0);
    assert.strictEqual(r1.mp, 40);   // 20 + 25% of 80 = 40
    assert.strictEqual(r2.mp, 0);    // untouched — not targeted
  });

  it('mpRestore does not exceed maxMp', () => {
    const r1 = mockCreature();
    r1.mp = 70; r1.maxMp = 80;
    const party = { active: [r1], reserves: [] };
    const item = { type: 'mpRestore', effect: { mpRestorePercent: 0.5 } };
    applyItem(item, party, null, 0);
    assert.strictEqual(r1.mp, 80);  // capped at maxMp
  });
});

describe('Item Buffs - XP Items', () => {
  it('xpCharm multiplies XP on creature', () => {
    const creature = mockCreature();
    const item = { type: 'xpCharm', effect: { value: 0.25 } };
    const party = { active: [creature], reserves: [] };
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.xpMultiplier, 1.25);
  });

  it('xpBalance adds stacks on creature', () => {
    const creature = mockCreature();
    const item = { type: 'xpBalance', effect: { value: 1 } };
    const party = { active: [creature], reserves: [] };
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.xpBalanceStacks, 1);
    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.xpBalanceStacks, 2);
  });
});

describe('Item Buffs - Deprecated Temp Boost', () => {
  it('tempBoost does not permanently change creature.attack', () => {
    const r1 = mockCreature();
    r1.attack = 10;
    r1.activeEffects = [];
    const party = { active: [r1], reserves: [] };
    const item = {
      type: 'boost',
      effect: { tempBoost: { field: 'attack', value: 3, turns: 5, target: 'single' } }
    };
    applyItem(item, party, null, 0);
    assert.strictEqual(r1.attack, 10, 'attack should not be permanently modified');
  });
});

describe('Item Buffs - Target Index', () => {
  it('applyItem with targetIndex applies heal to specific creature', () => {
    const party = {
      active: [
        { id: 'hi', hp: 30, maxHp: 50, mp: 50, maxMp: 50, level: 1, itemBuffs: null, equippedItems: [] },
        { id: 'mizu', hp: 50, maxHp: 50, mp: 50, maxMp: 50, level: 1, itemBuffs: null, equippedItems: [] },
        null
      ],
      reserves: []
    };
    const item = { type: 'heal', effect: { healPercent: 0.5 } };
    applyItem(item, party, null, 0);
    // 30 + floor(50*0.5) = 55, capped at maxHp 50
    assert.strictEqual(party.active[0].hp, 50);
    assert.strictEqual(party.active[1].hp, 50); // untouched
  });

  it('applyItem with targetIndex revives specific KOd creature', () => {
    const party = {
      active: [
        { id: 'hi', hp: 0, maxHp: 50, mp: 50, maxMp: 50, level: 1, itemBuffs: null, equippedItems: [] },
        { id: 'mizu', hp: 0, maxHp: 50, mp: 50, maxMp: 50, level: 1, itemBuffs: null, equippedItems: [] },
        null
      ],
      reserves: []
    };
    const item = { type: 'revive', effect: { revivePercent: 1.0 } };
    applyItem(item, party, null, 0);
    assert.strictEqual(party.active[0].hp, 50); // revived at full
    assert.strictEqual(party.active[1].hp, 0); // still KO
  });
});
