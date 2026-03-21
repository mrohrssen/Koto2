import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyItem, createItemBuffs } from '../../../src/game/services/item-service.js';
import { instantiateCreature } from '../../../src/game/creatures.js';

describe('EXP Charm Item', () => {
  it('xpCharm multiplies xpMultiplier by 1.25 on creature', () => {
    const creature = instantiateCreature('hi');
    const party = { active: [creature], reserves: [] };
    const item = { type: 'xpCharm', effect: { field: 'xpMultiplier', value: 0.25 } };

    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.xpMultiplier, 1.25);
  });

  it('xpCharm stacks multiplicatively on creature', () => {
    const creature = instantiateCreature('hi');
    const party = { active: [creature], reserves: [] };
    const item = { type: 'xpCharm', effect: { field: 'xpMultiplier', value: 0.25 } };

    applyItem(item, party, null, 0);
    applyItem(item, party, null, 0);
    // 1.0 * 1.25 * 1.25 = 1.5625
    assert.ok(Math.abs(creature.itemBuffs.xpMultiplier - 1.5625) < 0.001);
  });
});

describe('EXP Balance Item', () => {
  it('xpBalance increments xpBalanceStacks on creature', () => {
    const creature = instantiateCreature('hi');
    const party = { active: [creature], reserves: [] };
    const item = { type: 'xpBalance', effect: { field: 'xpBalanceStacks', value: 1 } };

    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.xpBalanceStacks, 1);

    applyItem(item, party, null, 0);
    assert.strictEqual(creature.itemBuffs.xpBalanceStacks, 2);
  });
});
