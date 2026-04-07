import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeInlineCounter, checkAfflictionBurstCounter } from '../../../src/game/combat/party-skill-engine.js';
import { processInterleavedPvERound } from '../../../src/game/services/creature-combat-service.js';

function makeAlly(overrides = {}) {
  return {
    id: 'ally-1', name: 'テスト', nameEn: 'TestAlly',
    element: 'fire', level: 5,
    hp: 80, maxHp: 100, mp: 20, maxMp: 20,
    attack: 20, defense: 5,
    activeEffects: [], statStages: { atk: 0, def: 0 },
    ...overrides
  };
}

function makeEnemy(overrides = {}) {
  return {
    id: 'enemy-1', name: 'スライム', nameEn: 'Slime',
    element: 'neutral', level: 3,
    hp: 50, maxHp: 50, mp: 10, maxMp: 10,
    attack: 10, defense: 3,
    activeEffects: [], statStages: { atk: 0, def: 0 },
    ...overrides
  };
}

function makeEnemyAttackRecord(overrides = {}) {
  return {
    attackerIndex: 0, attackerId: 'enemy-1',
    targetIndex: 0, damage: 15,
    ...overrides
  };
}

describe('computeInlineCounter', () => {
  let allies, enemies, combat;

  beforeEach(() => {
    allies = [makeAlly()];
    enemies = [makeEnemy()];
    combat = {};
  });

  it('returns null when no retaliationStrike skill active', () => {
    const record = makeEnemyAttackRecord();
    const result = computeInlineCounter(record, allies, enemies, [], combat);
    assert.strictEqual(result, null);
  });

  it('returns null when defender is KO', () => {
    allies[0].hp = 0;
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result, null);
    } finally {
      Math.random = origRandom;
    }
  });

  it('returns null when enemy attack did zero damage', () => {
    const record = makeEnemyAttackRecord({ damage: 0 });
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result, null);
    } finally {
      Math.random = origRandom;
    }
  });

  it('returns counter record when proc succeeds (Math.random < 0.5)', () => {
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result.type, 'counter');
      assert.strictEqual(result.defenderIndex, 0);
      assert.strictEqual(result.targetIndex, 0);
      assert.ok(result.damage > 0);
      assert.ok(enemies[0].hp < 50, 'enemy hp should be reduced');
    } finally {
      Math.random = origRandom;
    }
  });

  it('returns null when proc fails (Math.random >= 0.5)', () => {
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.9;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result, null);
    } finally {
      Math.random = origRandom;
    }
  });

  it('applies Fury Counter stacks', () => {
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const r1 = computeInlineCounter(record, allies, enemies, ['retaliationStrike', 'furyCounter'], combat);
      assert.strictEqual(r1.furyStacks, 1);
      enemies[0].hp = 50;
      const r2 = computeInlineCounter(record, allies, enemies, ['retaliationStrike', 'furyCounter'], combat);
      assert.strictEqual(r2.furyStacks, 2);
      assert.ok(r2.damage > r1.damage, 'second counter should deal more damage');
    } finally {
      Math.random = origRandom;
    }
  });

  it('sets targetDefeated when counter kills enemy', () => {
    enemies[0].hp = 1;
    const record = makeEnemyAttackRecord();
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = computeInlineCounter(record, allies, enemies, ['retaliationStrike'], combat);
      assert.strictEqual(result.targetDefeated, true);
      assert.strictEqual(enemies[0].hp, 0);
    } finally {
      Math.random = origRandom;
    }
  });
});

describe('processInterleavedPvERound inline counters', () => {
  it('counter records appear in playerAttacks with playbackIndex', () => {
    const allies = [makeAlly({ level: 1, attack: 40 })];
    const enemies = [makeEnemy({ level: 10, hp: 500, maxHp: 500 })];
    enemies[0].moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    allies[0].moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = processInterleavedPvERound(
        allies, enemies, moveChoices, null, null, null,
        { runPartySkills: ['retaliationStrike'], combat: {} }
      );

      const counters = result.playerAttacks.filter(a => a.type === 'counter');
      assert.ok(counters.length > 0, 'should have inline counter in playerAttacks');
      assert.ok(typeof counters[0].playbackIndex === 'number', 'counter should have playbackIndex');

      const enemyAtk = result.enemyAttacks.find(a => a.attackerIndex === 0);
      if (enemyAtk && counters[0]) {
        assert.strictEqual(counters[0].playbackIndex, enemyAtk.playbackIndex + 1,
          'counter playbackIndex should be right after triggering enemy attack');
      }
    } finally {
      Math.random = origRandom;
    }
  });

  it('counter kill prevents subsequent enemy attacks', () => {
    const allies = [makeAlly({ level: 1, attack: 200 })];
    const enemies = [makeEnemy({ level: 10, hp: 5, maxHp: 5 })];
    enemies[0].moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    enemies[0].activeEffects = [{ type: 'haste', duration: 1 }];

    const moveChoices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    allies[0].moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = processInterleavedPvERound(
        allies, enemies, moveChoices, null, null, null,
        { runPartySkills: ['retaliationStrike'], combat: {} }
      );

      const enemyAtks = result.enemyAttacks.filter(a => a.attackerIndex === 0);
      assert.ok(enemyAtks.length <= 1, 'enemy should not get second attack after being killed by counter');
      assert.strictEqual(enemies[0].hp, 0, 'enemy should be dead');
    } finally {
      Math.random = origRandom;
    }
  });

  it('inlineCounters array is returned in result', () => {
    const allies = [makeAlly({ level: 1, attack: 40 })];
    const enemies = [makeEnemy({ level: 10, hp: 500, maxHp: 500 })];
    enemies[0].moves = [{
      id: 'bite', name: '噛む', nameEn: 'Bite', reading: 'かむ',
      element: 'neutral', category: 'damage', power: 30,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    allies[0].moves = [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = processInterleavedPvERound(
        allies, enemies, moveChoices, null, null, null,
        { runPartySkills: ['retaliationStrike'], combat: {} }
      );
      assert.ok(Array.isArray(result.inlineCounters), 'should have inlineCounters array');
      assert.ok(result.inlineCounters.length > 0, 'should have counters');
    } finally {
      Math.random = origRandom;
    }
  });
});
