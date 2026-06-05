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

function counterDamage({ level, defenderHp, defenderMaxHp = 100, enemyHp = 200, rng = () => 0.01 }) {
  const result = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally({ hp: defenderHp, maxHp: defenderMaxHp })],
    [enemy({ hp: enemyHp })],
    [{ id: 'counterMaster', level }],
    {},
    rng
  );

  assert.ok(result);
  return result.damage;
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

test('Counter Master Lvl 2 succeeds below 75% and fails at the threshold', () => {
  const success = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 2 }],
    {},
    () => 0.74
  );
  assert.ok(success);

  const threshold = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 2 }],
    {},
    () => 0.75
  );
  assert.equal(threshold, null);
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

test('Counter Master Lvl 4 below 50% HP doubles base damage', () => {
  const base = counterDamage({ level: 3, defenderHp: 80 });
  const boosted = counterDamage({ level: 4, defenderHp: 40 });
  assert.equal(boosted, base * 2);
});

test('Counter Master Lvl 4 at or above 50% HP does not boost damage', () => {
  const base = counterDamage({ level: 3, defenderHp: 80 });
  const atThreshold = counterDamage({ level: 4, defenderHp: 50 });
  const aboveThreshold = counterDamage({ level: 4, defenderHp: 80 });

  assert.equal(atThreshold, base);
  assert.equal(aboveThreshold, base);
});

test('Counter Master Lvl 5 above 50% HP doubles base damage', () => {
  const base = counterDamage({ level: 3, defenderHp: 80 });
  const boosted = counterDamage({ level: 5, defenderHp: 80 });
  assert.equal(boosted, base * 2);
});

test('Counter Master Lvl 5 below 50% HP stacks Lvl 4 and Lvl 5 boosts', () => {
  const base = counterDamage({ level: 3, defenderHp: 80 });
  const boosted = counterDamage({ level: 5, defenderHp: 40 });
  assert.equal(boosted, base * 4);
});
