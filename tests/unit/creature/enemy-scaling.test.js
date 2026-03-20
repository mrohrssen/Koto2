import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  clampEarlyAreaEnemyLevel,
  getEnemyLevel,
  getRarityWeightsForStage,
  getEnemyCountWeights,
  generateEnemyCreatures
} from '../../../src/game/creatures.js';

describe('getEnemyLevel', () => {
  it('returns level 1 at encounter 0 (before variance)', () => {
    // base = 2 + 0/2 + (0/25)^2 = 2
    // With variance of -1 to +1, result should be 1-3 (clamped to >= 1)
    const level = getEnemyLevel({ totalEncounters: 0, enemyCount: 2 });
    assert.ok(level >= 1 && level <= 3, `Expected 1-3, got ${level}`);
  });

  it('scales with total encounters', () => {
    // base = 2 + 10/2 + (10/25)^2 = 2 + 5 + 0.16 = 7.16
    const level = getEnemyLevel({ totalEncounters: 10, enemyCount: 2 });
    assert.ok(level >= 6 && level <= 8, `Expected ~7 ± 1, got ${level}`);
  });

  it('accelerates at higher encounter counts', () => {
    // base = 2 + 20/2 + (20/25)^2 = 2 + 10 + 0.64 = 12.64
    const level = getEnemyLevel({ totalEncounters: 20, enemyCount: 2 });
    assert.ok(level >= 12 && level <= 14, `Expected ~13 ± 1, got ${level}`);
  });

  it('applies solo multiplier (1.2x) for 1 enemy', () => {
    // base = 2 + 10/2 + (10/25)^2 ≈ 7.16, * 1.2 ≈ 8.6
    const level = getEnemyLevel({ totalEncounters: 10, enemyCount: 1 });
    assert.ok(level >= 8 && level <= 10, `Expected ~9 ± 1, got ${level}`);
  });

  it('applies group multiplier (0.85x) for 3 enemies', () => {
    // base ≈ 7.16, * 0.85 ≈ 6.09
    const level = getEnemyLevel({ totalEncounters: 10, enemyCount: 3 });
    assert.ok(level >= 5 && level <= 7, `Expected ~6 ± 1, got ${level}`);
  });

  it('never returns below 1', () => {
    for (let i = 0; i < 50; i++) {
      const level = getEnemyLevel({ totalEncounters: 0, enemyCount: 3 });
      assert.ok(level >= 1, `Expected >= 1, got ${level}`);
    }
  });

  it('stage 1 caps wild enemy level at 2 even with many run encounters', () => {
    for (let i = 0; i < 30; i++) {
      const level = getEnemyLevel({ totalEncounters: 50, enemyCount: 1, stage: 1 });
      assert.ok(level >= 1 && level <= 2, `Expected 1-2 for stage 1, got ${level}`);
    }
  });

  it('clampEarlyAreaEnemyLevel only applies for stage <= 1', () => {
    assert.strictEqual(clampEarlyAreaEnemyLevel(5, 2), 5);
    assert.strictEqual(clampEarlyAreaEnemyLevel(5, null), 5);
    assert.strictEqual(clampEarlyAreaEnemyLevel(5, 1), 2);
    assert.strictEqual(clampEarlyAreaEnemyLevel(0, 1), 1);
  });

  it('produces variance across multiple calls', () => {
    const levels = new Set();
    for (let i = 0; i < 50; i++) {
      levels.add(getEnemyLevel({ totalEncounters: 10, enemyCount: 2 }));
    }
    assert.ok(levels.size > 1, 'Expected some variance in levels');
  });
});

describe('getRarityWeightsForStage', () => {
  it('stage 1 is heavily common-weighted, no epic', () => {
    const weights = getRarityWeightsForStage(1);
    assert.strictEqual(weights.common, 80);
    assert.strictEqual(weights.uncommon, 18);
    assert.strictEqual(weights.rare, 2);
    assert.strictEqual(weights.epic, 0);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('stage 5 has moderate rarity spread', () => {
    const weights = getRarityWeightsForStage(5);
    assert.strictEqual(weights.common, 50);
    assert.strictEqual(weights.uncommon, 35);
    assert.strictEqual(weights.rare, 12);
    assert.strictEqual(weights.epic, 3);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('stage 8 has rare/epic prevalent', () => {
    const weights = getRarityWeightsForStage(8);
    assert.strictEqual(weights.common, 30);
    assert.strictEqual(weights.uncommon, 30);
    assert.strictEqual(weights.rare, 25);
    assert.strictEqual(weights.epic, 15);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('stage 10 is endgame distribution', () => {
    const weights = getRarityWeightsForStage(10);
    assert.strictEqual(weights.common, 20);
    assert.strictEqual(weights.uncommon, 30);
    assert.strictEqual(weights.rare, 30);
    assert.strictEqual(weights.epic, 20);
    assert.strictEqual(weights.legendary, undefined);
  });

  it('never includes legendary in wild encounters', () => {
    for (let s = 1; s <= 10; s++) {
      const weights = getRarityWeightsForStage(s);
      assert.strictEqual(weights.legendary, undefined, `Stage ${s} should not have legendary`);
    }
  });

  it('defaults to stage 1 weights when stage is undefined', () => {
    const weights = getRarityWeightsForStage(undefined);
    assert.strictEqual(weights.common, 80);
  });
});

describe('getEnemyCountWeights', () => {
  it('early encounters favor solo enemies', () => {
    const weights = getEnemyCountWeights(0);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 50 },
      { count: 2, weight: 40 },
      { count: 3, weight: 10 }
    ]);
  });

  it('mid encounters are balanced', () => {
    const weights = getEnemyCountWeights(3);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 40 },
      { count: 2, weight: 35 },
      { count: 3, weight: 25 }
    ]);
  });

  it('late encounters favor groups', () => {
    const weights = getEnemyCountWeights(5);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 30 },
      { count: 2, weight: 35 },
      { count: 3, weight: 35 }
    ]);
  });

  it('very late encounters use late weights', () => {
    const weights = getEnemyCountWeights(10);
    assert.deepStrictEqual(weights, [
      { count: 1, weight: 30 },
      { count: 2, weight: 35 },
      { count: 3, weight: 35 }
    ]);
  });
});

describe('generateEnemyCreatures with scaling', () => {
  it('accepts totalEncounters option', () => {
    const enemies = generateEnemyCreatures(10, {
      totalEncounters: 5,
      encounterIndex: 2,
      creaturePool: ['hi', 'mizu', 'ki']
    });
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.level >= 1, `enemy level should be >= 1, got ${e.level}`);
    }
  });

  it('higher totalEncounters produces higher level enemies', () => {
    let avgLow = 0;
    let avgHigh = 0;
    const trials = 50;
    const pool = ['hi', 'mizu', 'ki'];
    for (let i = 0; i < trials; i++) {
      const low = generateEnemyCreatures(15, { totalEncounters: 2, encounterIndex: 0, creaturePool: pool });
      const high = generateEnemyCreatures(15, { totalEncounters: 20, encounterIndex: 0, creaturePool: pool });
      avgLow += low.reduce((s, e) => s + e.level, 0) / low.length;
      avgHigh += high.reduce((s, e) => s + e.level, 0) / high.length;
    }
    avgLow /= trials;
    avgHigh /= trials;
    assert.ok(avgHigh > avgLow, `20 encounters avg (${avgHigh}) should be > 2 encounters avg (${avgLow})`);
  });

  it('still works with legacy call (no totalEncounters)', () => {
    const enemies = generateEnemyCreatures(5);
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.hp > 0);
    }
  });
});

describe('Full scaling integration', () => {
  it('later encounters produce higher average enemy levels', () => {
    const pool = ['hi', 'mizu', 'ki'];
    let avgEarly = 0;
    let avgLate = 0;
    const trials = 30;
    for (let i = 0; i < trials; i++) {
      const early = generateEnemyCreatures(20, { totalEncounters: 2, encounterIndex: 0, creaturePool: pool });
      const late = generateEnemyCreatures(20, { totalEncounters: 15, encounterIndex: 5, creaturePool: pool });
      avgEarly += early.reduce((s, e) => s + e.level, 0) / early.length;
      avgLate += late.reduce((s, e) => s + e.level, 0) / late.length;
    }
    avgEarly /= trials;
    avgLate /= trials;
    assert.ok(avgLate > avgEarly, `Late encounters (${avgLate}) should be > early (${avgEarly})`);
  });

  it('no enemy is ever legendary in wild encounters with stage', () => {
    const pool = ['hi', 'mizu', 'ki'];
    for (let i = 0; i < 100; i++) {
      const enemies = generateEnemyCreatures(30, { stage: 10, totalEncounters: 20, encounterIndex: 5, creaturePool: pool });
      for (const e of enemies) {
        assert.notStrictEqual(e.rarity, 'legendary', 'Should never get legendary in wild');
      }
    }
  });
});
