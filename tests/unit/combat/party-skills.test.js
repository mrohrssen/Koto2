import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPartySkillsAfterPlayerAttacks } from '../../../src/game/services/creature-combat-service.js';

function makeAlly({ id, hp = 50, maxHp = 100 } = {}) {
  return { id: id || 'ally', hp, maxHp, activeEffects: [] };
}

function makeEnemy({ id, hp = 100, maxHp = 100 } = {}) {
  return { id: id || 'enemy', hp, maxHp, activeEffects: [] };
}

function withStubbedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('superEffectiveMend: procs only on super-effective qualifying player records', () => {
  withStubbedRandom(0.0, () => {
    const allies = [makeAlly({ id: 'a1', hp: 40, maxHp: 100 }), makeAlly({ id: 'a2', hp: 80, maxHp: 100 })];
    const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
    const combat = { partyHitCounter: 0 };
    const attacks = [{
      attackerIndex: 0,
      category: 'damage',
      damage: 10,
      elementMultiplier: 2,
      targetIndex: 0,
      targetDefeated: false
    }];

    applyPartySkillsAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'superEffectiveMend' }],
      combat
    });

    assert.equal(allies[0].hp, 50); // +10
    assert.equal(allies[1].hp, 90); // +10
    assert.equal(combat.partyHitCounter, 1);
  });
});

test('hasteSpark: procs only on super-effective qualifying player records and applies haste to attacker', () => {
  withStubbedRandom(0.0, () => {
    const allies = [makeAlly({ id: 'a1', hp: 50, maxHp: 100 })];
    const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
    const combat = { partyHitCounter: 0 };
    const attacks = [{
      attackerIndex: 0,
      category: 'drain',
      damage: 12,
      elementMultiplier: 1.5,
      targetIndex: 0,
      targetDefeated: false
    }];

    applyPartySkillsAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: ['hasteSpark'],
      combat
    });

    assert.ok(allies[0].activeEffects.some(e => e.type === 'haste'));
    assert.equal(combat.partyHitCounter, 1);
  });
});

test('guardPulse: procs only on super-effective qualifying player records and applies team shield', () => {
  withStubbedRandom(0.0, () => {
    const allies = [makeAlly({ id: 'a1', hp: 50, maxHp: 100 }), makeAlly({ id: 'a2', hp: 1, maxHp: 100 })];
    const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
    const combat = { partyHitCounter: 0 };
    const attacks = [{
      attackerIndex: 0,
      category: 'damage',
      damage: 10,
      elementMultiplier: 2,
      targetIndex: 0,
      targetDefeated: false
    }];

    applyPartySkillsAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'guardPulse' }],
      combat
    });

    for (const ally of allies) {
      const shield = ally.activeEffects.find(e => e.type === 'team_shield');
      assert.ok(shield, 'expected team_shield effect');
      assert.equal(shield.percent, 10);
      assert.equal(shield.remainingTurns, 2);
    }
    assert.equal(combat.partyHitCounter, 1);
  });
});

test('battleRhythm: every 5th qualifying hit deals bonus damage and updates the same record', () => {
  const allies = [makeAlly({ id: 'a1', hp: 50, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 3, maxHp: 100 })];
  const combat = { partyHitCounter: 4 };
  const attacks = [{
    attackerIndex: 0,
    category: 'damage',
    damage: 11,
    elementMultiplier: 1,
    targetIndex: 0,
    targetDefeated: false
  }];

  applyPartySkillsAfterPlayerAttacks({
    attacks,
    allies,
    enemies,
    runPartySkills: ['battleRhythm'],
    combat
  });

  assert.equal(combat.partyHitCounter, 5);
  assert.equal(attacks[0].damage, 13); // 11 + bonusApplied(2); bonus cannot KO
  assert.equal(enemies[0].hp, 1);
});

test('finisherFeast: heals party on defeated target from qualifying player record', () => {
  const allies = [makeAlly({ id: 'a1', hp: 50, maxHp: 100 }), makeAlly({ id: 'a2', hp: 90, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 0, maxHp: 100 })];
  const combat = { partyHitCounter: 0 };
  const attacks = [{
    attackerIndex: 0,
    category: 'damage',
    damage: 10,
    elementMultiplier: 1,
    targetIndex: 0,
    targetDefeated: true
  }];

  applyPartySkillsAfterPlayerAttacks({
    attacks,
    allies,
    enemies,
    runPartySkills: ['finisherFeast'],
    combat
  });

  assert.equal(allies[0].hp, 55); // +5
  assert.equal(allies[1].hp, 95); // +5
  assert.equal(combat.partyHitCounter, 1);
});

test('does not trigger or increment counter on non-qualifying records (NPC skill / heal / zero-damage)', () => {
  withStubbedRandom(0.0, () => {
    const allies = [makeAlly({ id: 'a1', hp: 40, maxHp: 100 })];
    const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
    const combat = { partyHitCounter: 0 };
    const attacks = [
      // NPC skill record (attackerIndex -1 in this codebase)
      { attackerIndex: -1, category: 'damage', damage: 50, elementMultiplier: 2, targetIndex: 0, targetDefeated: false },
      // Heal category should not qualify
      { attackerIndex: 0, category: 'heal', damage: 0, elementMultiplier: 2, targetIndex: 0, targetDefeated: false },
      // Damage category but zero damage should not qualify (requires damage > 0).
      { attackerIndex: 0, category: 'damage', damage: 0, elementMultiplier: 2, targetIndex: 0, targetDefeated: false },
    ];

    applyPartySkillsAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: ['superEffectiveMend', 'hasteSpark', 'guardPulse', 'battleRhythm', 'finisherFeast'],
      combat
    });

    assert.equal(combat.partyHitCounter, 0);
    assert.equal(allies[0].hp, 40);
    assert.equal(allies[0].activeEffects.length, 0);
  });
});

