import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyItem, createItemBuffs } from '../../src/game/services/item-service.js';
import { instantiateRobot } from '../../src/game/robots.js';

describe('EXP Charm Item', () => {
  it('xpCharm multiplies xpMultiplier by 1.25', () => {
    const itemBuffs = createItemBuffs();
    const party = { active: [instantiateRobot('hikaribon')], reserves: [] };
    const item = { type: 'xpCharm', effect: { field: 'xpMultiplier', value: 0.25 } };

    applyItem(item, party, itemBuffs);
    assert.strictEqual(itemBuffs.xpMultiplier, 1.25);
  });

  it('xpCharm stacks multiplicatively', () => {
    const itemBuffs = createItemBuffs();
    const party = { active: [instantiateRobot('hikaribon')], reserves: [] };
    const item = { type: 'xpCharm', effect: { field: 'xpMultiplier', value: 0.25 } };

    applyItem(item, party, itemBuffs);
    applyItem(item, party, itemBuffs);
    // 1.0 * 1.25 * 1.25 = 1.5625
    assert.ok(Math.abs(itemBuffs.xpMultiplier - 1.5625) < 0.001);
  });
});

describe('EXP Balance Item', () => {
  it('xpBalance increments xpBalanceStacks', () => {
    const itemBuffs = createItemBuffs();
    const party = { active: [instantiateRobot('hikaribon')], reserves: [] };
    const item = { type: 'xpBalance', effect: { field: 'xpBalanceStacks', value: 1 } };

    applyItem(item, party, itemBuffs);
    assert.strictEqual(itemBuffs.xpBalanceStacks, 1);

    applyItem(item, party, itemBuffs);
    assert.strictEqual(itemBuffs.xpBalanceStacks, 2);
  });
});
