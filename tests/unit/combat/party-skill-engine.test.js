import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAfterPlayerAttacks, applyRoundStartSkills, applyAfterEnemyAttacks, countDebuffTypes, countBuffTypes } from '../../../src/game/combat/party-skill-engine.js';

function makeAlly({ id = 'ally', hp = 50, maxHp = 100, attack = 20, element = 'fire', defense = 10 } = {}) {
  return { id, hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeEnemy({ id = 'enemy', hp = 100, maxHp = 100, element = 'water', attack = 15, defense = 10 } = {}) {
  return { id, hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeDmgRecord({ attackerIndex = 0, targetIndex = 0, damage = 20, elementMultiplier = 1.0 } = {}) {
  return {
    attackerIndex, category: 'damage', damage, elementMultiplier,
    targetIndex, targetDefeated: false, partySkillProcs: [],
    statChangesApplied: null, effectApplied: null
  };
}

function makeCombat() {
  return { chainHitsThisTurn: 0, counterCounts: {}, afflictionBurstCooldown: {} };
}

function withStubbedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

// ── Smoke tests ──

test('engine exports exist and are callable', () => {
  assert.equal(typeof applyRoundStartSkills, 'function');
  assert.equal(typeof applyAfterPlayerAttacks, 'function');
  assert.equal(typeof applyAfterEnemyAttacks, 'function');
  assert.equal(typeof countDebuffTypes, 'function');
  assert.equal(typeof countBuffTypes, 'function');
});

test('applyRoundStartSkills returns empty array when no skills active', () => {
  const result = applyRoundStartSkills({
    allies: [makeAlly()],
    enemies: [makeEnemy()],
    runPartySkills: [],
    combat: makeCombat()
  });
  assert.deepEqual(result, []);
});

test('applyAfterPlayerAttacks handles empty skills gracefully', () => {
  const attacks = [makeDmgRecord()];
  applyAfterPlayerAttacks({
    attacks,
    allies: [makeAlly()],
    enemies: [makeEnemy()],
    runPartySkills: [],
    combat: makeCombat()
  });
  // Should not crash; no procs added
  assert.deepEqual(attacks[0].partySkillProcs, []);
});

test('applyAfterEnemyAttacks returns empty array when no retaliation skill', () => {
  const result = applyAfterEnemyAttacks({
    enemyAttacks: [{ targetIndex: 0, attackerIndex: 0, damage: 10 }],
    allies: [makeAlly()],
    enemies: [makeEnemy()],
    runPartySkills: [],
    combat: makeCombat()
  });
  assert.deepEqual(result, []);
});

// ── countDebuffTypes ──

test('countDebuffTypes counts negative stages and negative status effects', () => {
  const creature = {
    statStages: { atk: -1, def: -2, spd: 0 },
    activeEffects: [
      { type: 'poison', remainingTurns: 2 },
      { type: 'confuse', remainingTurns: 1 },
      { type: 'shield', remainingTurns: 3 }  // not a debuff
    ]
  };
  assert.equal(countDebuffTypes(creature), 4); // atk(-1) + def(-2) + poison + confuse
});

test('countDebuffTypes returns 0 for clean creature', () => {
  const creature = {
    statStages: { atk: 0, def: 0 },
    activeEffects: []
  };
  assert.equal(countDebuffTypes(creature), 0);
});

// ── countBuffTypes ──

test('countBuffTypes counts positive stages and positive status effects', () => {
  const creature = {
    statStages: { atk: 2, def: 1, spd: -1 },
    activeEffects: [
      { type: 'haste', remainingTurns: 1 },
      { type: 'shield', percent: 10, remainingTurns: 2 },
      { type: 'poison', remainingTurns: 3 }  // not a buff
    ]
  };
  assert.equal(countBuffTypes(creature), 4); // atk(+2) + def(+1) + haste + shield
});

test('countBuffTypes returns 0 for debuffed creature', () => {
  const creature = {
    statStages: { atk: -1, def: 0 },
    activeEffects: [{ type: 'poison', remainingTurns: 2 }]
  };
  assert.equal(countBuffTypes(creature), 0);
});
