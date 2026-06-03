import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';

function makeCreature(overrides = {}) {
  return {
    id: 'hikaribon',
    name: '光',
    nameEn: 'Hikaribon',
    level: 3,
    hp: 5,
    maxHp: 10,
    mp: 2,
    maxMp: 10,
    ...overrides,
  };
}

function makeGameManager(item) {
  return {
    run: {
      currentAreaEncounters: 0,
      runSummary: { itemsCollected: 0 },
      creatureParty: {
        active: [makeCreature()],
        reserves: [],
      },
      postCombatShop: {
        active: true,
        items: [item],
      },
    },
    meta: { itemsDiscovered: [] },
    emitState() {},
  };
}

describe('post-combat shop source consistency', () => {
  it('returns persisted postCombatShop items for reload recovery', () => {
    const item = {
      id: 'small-heal',
      word: '薬',
      rarity: 'common',
      type: 'heal',
      effect: { healPercent: 0.5 },
    };
    const gm = makeGameManager(item);
    const service = new CombatCycleService(gm);

    assert.deepEqual(service.rollPostCombatShop(), { items: [item] });
  });

  it('selects from persisted postCombatShop items and clears the active shop', () => {
    const item = {
      id: 'small-heal',
      word: '薬',
      rarity: 'common',
      type: 'heal',
      effect: { healPercent: 0.5 },
    };
    const gm = makeGameManager(item);
    const service = new CombatCycleService(gm);

    const result = service.selectShopItem(0, 0);

    assert.equal(result.selected.id, 'small-heal');
    assert.equal(gm.run.creatureParty.active[0].hp, 10);
    assert.equal(gm.run.postCombatShop, null);
    assert.equal(gm.run._pendingShopItems, null);
    assert.equal(gm.run.runSummary.itemsCollected, 1);
    assert.deepEqual(gm.meta.itemsDiscovered, ['small-heal']);
  });

  it('keeps the disabled random roll path disabled when no shop is active', () => {
    const gm = makeGameManager({ id: 'small-heal', type: 'heal', effect: { healPercent: 0.5 } });
    gm.run.postCombatShop = null;
    const service = new CombatCycleService(gm);

    assert.equal(service.rollPostCombatShop(), null);
  });
});
