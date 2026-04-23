import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipAttackRecord } from '../../../public/js/ui/combat-ui-utils.js';

describe('shouldSkipAttackRecord — dead-target playback pruning', () => {
  it('skips a player damage attack whose enemy target is already at hp=0', () => {
    const atk = { type: 'damage', category: 'damage', targetIndex: 0, attackerId: 'p1' };
    const enemyHpMap = { 0: { hp: 0, maxHp: 40, index: 0 } };
    const allyHpMap  = { p1: { hp: 10, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', atk, enemyHpMap, allyHpMap, { allies: [{ id: 'p1' }] });
    assert.equal(skip, true);
  });

  it('does NOT skip a player damage attack whose enemy target is still alive', () => {
    const atk = { type: 'damage', category: 'damage', targetIndex: 0, attackerId: 'p1' };
    const enemyHpMap = { 0: { hp: 20, maxHp: 40, index: 0 } };
    const allyHpMap  = { p1: { hp: 10, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', atk, enemyHpMap, allyHpMap, { allies: [{ id: 'p1' }] });
    assert.equal(skip, false);
  });

  it('skips a counter whose enemy target is already at hp=0 (Neko countered a dead enemy)', () => {
    const counter = { type: 'counter', defenderIndex: 0, targetIndex: 1 };
    const enemyHpMap = { 0: { hp: 10, maxHp: 40, index: 0 }, 1: { hp: 0, maxHp: 40, index: 1 } };
    const allyHpMap  = { neko: { hp: 30, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', counter, enemyHpMap, allyHpMap, { allies: [{ id: 'neko' }] });
    assert.equal(skip, true);
  });

  it('does NOT skip a counter whose enemy target is still alive', () => {
    const counter = { type: 'counter', defenderIndex: 0, targetIndex: 1 };
    const enemyHpMap = { 0: { hp: 10, maxHp: 40, index: 0 }, 1: { hp: 10, maxHp: 40, index: 1 } };
    const allyHpMap  = { neko: { hp: 30, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', counter, enemyHpMap, allyHpMap, { allies: [{ id: 'neko' }] });
    assert.equal(skip, false);
  });

  it('skips a counter whose defender ally died earlier this round', () => {
    const counter = { type: 'counter', defenderIndex: 0, targetIndex: 1 };
    const enemyHpMap = { 0: { hp: 10, maxHp: 40, index: 0 }, 1: { hp: 10, maxHp: 40, index: 1 } };
    const allyHpMap  = { neko: { hp: 0, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', counter, enemyHpMap, allyHpMap, { allies: [{ id: 'neko' }] });
    assert.equal(skip, true);
  });

  it('does NOT skip a buff move targeting an ally even when an enemy at that index is dead', () => {
    const buff = { type: 'buff', category: 'buff', targetIndex: 0, attackerId: 'p1' };
    const enemyHpMap = { 0: { hp: 0, maxHp: 40, index: 0 } };
    const allyHpMap  = { p1: { hp: 10, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', buff, enemyHpMap, allyHpMap, { allies: [{ id: 'p1' }] });
    assert.equal(skip, false);
  });

  it('does NOT skip a shield move targeting an ally even when an enemy at that index is dead', () => {
    const shield = { type: 'shield', category: 'shield', targetIndex: 2, attackerId: 'p1' };
    const enemyHpMap = { 2: { hp: 0, maxHp: 40, index: 2 } };
    const allyHpMap  = { p1: { hp: 10, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', shield, enemyHpMap, allyHpMap, { allies: [{ id: 'p1' }] });
    assert.equal(skip, false);
  });

  it('skips a player attack whose attacker died earlier this round', () => {
    const atk = { type: 'damage', category: 'damage', targetIndex: 0, attackerId: 'p1' };
    const enemyHpMap = { 0: { hp: 20, maxHp: 40, index: 0 } };
    const allyHpMap  = { p1: { hp: 0, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('player', atk, enemyHpMap, allyHpMap, { allies: [{ id: 'p1' }] });
    assert.equal(skip, true);
  });

  it('skips an enemy attack whose ally target is already at hp=0', () => {
    const atk = { category: 'damage', attackerIndex: 0, targetId: 'p2' };
    const enemyHpMap = { 0: { hp: 20, maxHp: 40, index: 0 } };
    const allyHpMap  = { p1: { hp: 30, maxHp: 50 }, p2: { hp: 0, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('enemy', atk, enemyHpMap, allyHpMap, {});
    assert.equal(skip, true);
  });

  it('does NOT skip an enemy attack whose attacker was killed after attacking (e.g. Arc Strike chain)', () => {
    // Enemy attacked ally during its initiative slot (damage already applied), then a
    // post-round party skill chain killed it. The attack happened — it must animate.
    const atk = { category: 'damage', attackerIndex: 0, targetId: 'p2' };
    const enemyHpMap = { 0: { hp: 0, maxHp: 40, index: 0 } };
    const allyHpMap  = { p2: { hp: 30, maxHp: 50 } };
    const skip = shouldSkipAttackRecord('enemy', atk, enemyHpMap, allyHpMap, {});
    assert.equal(skip, false);
  });

  it('returns false when attack record is nullish or maps are empty', () => {
    assert.equal(shouldSkipAttackRecord('player', null, {}, {}, {}), false);
    assert.equal(shouldSkipAttackRecord('player', {}, {}, {}, {}), false);
  });
});
