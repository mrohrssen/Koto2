import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInlineCounter } from '../../../src/game/combat/party-skill-engine.js';
import { calculateCreatureDamage, getElementMultiplier } from '../../../src/shared/combat/creature-math.js';

function ally(overrides = {}) {
  return { id: 'a', nameEn: 'Ally', hp: 50, maxHp: 100, attack: 20, element: 'fire', statStages: { atk: 0, def: 0, dex: 0 }, ...overrides };
}

function enemy(overrides = {}) {
  return { id: 'e', nameEn: 'Enemy', hp: 100, maxHp: 100, element: 'wood', statStages: { atk: 0, def: 0, dex: 0 }, ...overrides };
}

test('Counter Master Lvl 1 fails at the 50% threshold', () => {
  const result = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 1 }],
    {},
    () => 0.50
  );
  assert.equal(result, null);
});

test('Counter Master Lvl 1 deals shared 7-power damage on successful roll', () => {
  const allies = [ally()];
  const enemies = [enemy()];
  const defender = allies[0];
  const target = enemies[0];
  const expectedDamage = calculateCreatureDamage({
    attackerLevel: Math.max(1, defender.level || 1),
    attack: defender.attack || 10,
    defenderDefense: Math.max(1, target.defense || 5),
    power: 7,
    typeMultiplier: getElementMultiplier(defender.element || 'neutral', target.element || 'neutral'),
    variance: 1
  });

  const counter = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    allies,
    enemies,
    [{ id: 'counterMaster', level: 1 }],
    {},
    () => 0.01
  );

  assert.ok(counter);
  assert.equal(counter.damage, expectedDamage);
  assert.equal(counter.targetIndex, 0);
});

test('Counter Master Lvl 2 fails only above 75% roll', () => {
  const result = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 2 }],
    {},
    () => 0.80
  );
  assert.equal(result, null);
});

test('Counter Master Lvl 3 always counters when hit', () => {
  const result = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 3 }],
    {},
    () => 0.99
  );
  assert.ok(result);
});

test('Counter Master Lvl 4 and Lvl 5 damage multipliers stack', () => {
  const baseEnemies = [enemy({ hp: 200 })];
  const base = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally({ hp: 80 })],
    baseEnemies,
    [{ id: 'counterMaster', level: 3 }],
    {},
    () => 0.01
  );

  const boostedEnemies = [enemy({ hp: 200 })];
  const boosted = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally({ hp: 40 })],
    boostedEnemies,
    [{ id: 'counterMaster', level: 5 }],
    {},
    () => 0.01
  );

  assert.equal(boosted.damage, base.damage * 4);
});
