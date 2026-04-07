import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeInlineCounter, checkAfflictionBurstCounter } from '../../../src/game/combat/party-skill-engine.js';

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
