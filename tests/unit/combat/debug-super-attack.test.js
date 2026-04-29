import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { createItemBuffs } from '../../../src/game/services/item-service.js';
import { applyDebugSuperAttack, cleanupDebugSuperAttack } from '../../../src/game/loop.js';

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

describe('cleanupDebugSuperAttack', () => {
  it('reverts +100 buff and clears flag for creatures with _debugAtkApplied', () => {
    const ally = instantiateCreature('hi');
    applyDebugSuperAttack([ally]);
    assert.equal(ally._debugAtkApplied, true);
    assert.equal(ally.itemBuffs.baseAttackBonus, 100);

    const changed = cleanupDebugSuperAttack([ally]);
    assert.equal(changed, true);
    assert.equal(ally._debugAtkApplied, undefined);
    assert.equal(ally.itemBuffs.baseAttackBonus, 0);
  });

  it('preserves equipment baseAttackBonus when reverting debug buff', () => {
    const ally = instantiateCreature('hi');
    ally.itemBuffs = createItemBuffs();
    ally.itemBuffs.baseAttackBonus = 5;
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 105);

    cleanupDebugSuperAttack([ally]);
    assert.equal(ally._debugAtkApplied, undefined);
    assert.equal(ally.itemBuffs.baseAttackBonus, 5);
  });

  it('returns false and makes no changes when no creatures have the flag', () => {
    const ally = instantiateCreature('hi');
    ally.itemBuffs = createItemBuffs();
    ally.itemBuffs.baseAttackBonus = 7;

    const changed = cleanupDebugSuperAttack([ally]);
    assert.equal(changed, false);
    assert.equal(ally.itemBuffs.baseAttackBonus, 7);
  });

  it('handles null/undefined creature lists safely', () => {
    assert.equal(cleanupDebugSuperAttack(null), false);
    assert.equal(cleanupDebugSuperAttack(undefined), false);
    assert.equal(cleanupDebugSuperAttack([]), false);
    assert.equal(cleanupDebugSuperAttack([null, undefined]), false);
  });

  it('clamps baseAttackBonus to 0 when buff exceeds stored value', () => {
    const ally = instantiateCreature('hi');
    ally.itemBuffs = createItemBuffs();
    ally.itemBuffs.baseAttackBonus = 50;
    ally._debugAtkApplied = true;

    cleanupDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 0);
    assert.equal(ally._debugAtkApplied, undefined);
  });
});
