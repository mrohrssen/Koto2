import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { createItemBuffs } from '../../../src/game/services/item-service.js';
import { applyDebugSuperAttack } from '../../../src/game/loop.js';

describe('debug super attack', () => {
  it('adds +100 baseAttackBonus to creatures without itemBuffs', () => {
    const ally = instantiateCreature('hi');
    delete ally.itemBuffs;
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 100);
  });

  it('adds +100 on top of existing baseAttackBonus', () => {
    const ally = instantiateCreature('hi');
    ally.itemBuffs = createItemBuffs();
    ally.itemBuffs.baseAttackBonus = 5;
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 105);
  });

  it('does not stack on repeated calls (uses _debugAtkApplied flag)', () => {
    const ally = instantiateCreature('hi');
    applyDebugSuperAttack([ally]);
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 100);
  });

  it('applies to newly befriended creatures on subsequent calls', () => {
    const original = instantiateCreature('hi');
    applyDebugSuperAttack([original]);
    const newCreature = instantiateCreature('mizu');
    applyDebugSuperAttack([original, newCreature]);
    assert.equal(original.itemBuffs.baseAttackBonus, 100);
    assert.equal(newCreature.itemBuffs.baseAttackBonus, 100);
  });
});
