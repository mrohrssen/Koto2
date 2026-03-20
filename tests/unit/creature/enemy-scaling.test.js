import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getEnemyLevel,
  getRarityWeightsForStage,
  getEnemyCountWeights,
  generateEnemyCreatures
} from '../../../src/game/creatures.js';

describe('getEnemyLevel', () => {
  it('early totalEncounters 0–1 stay in Lv 1–2 from formula alone', () => {
    for (let i = 0; i < 40; i++) {
      const duo0 = getEnemyLevel({ totalEncounters: 0, enemyCount: 2 });
      const duo1 = getEnemyLevel({ totalEncounters: 1, enemyCount: 2 });
      const solo1 = getEnemyLevel({ totalEncounters: 1, enemyCount: 1 });
      assert.ok(duo0 >= 1 && duo0 <= 2, `te=0 duo expected 1-2, got ${duo0}`);
      assert.ok(duo1 >= 1 && duo1 <= 2, `te=1 duo expected 1-2, got ${duo1}`);
      assert.ok(solo1 >= 1 && solo1 <= 2, `te=1 solo expected 1-2, got ${solo1}`);
    }
  });

  it('scales with total encounters', () => {
    // base = 1 + 9/2 + (10/25)^2 = 5.66
    const level = getEnemyLevel({ totalEncounters: 10, enemyCount: 2 });
    assert.ok(level >= 5 && level <= 7, `Expected ~6 ± 1, got ${level}`);
  });

  it('accelerates at higher encounter counts', () => {
    // base = 1 + 19/2 + (20/25)^2 ≈ 11.14
    const level = getEnemyLevel({ totalEncounters: 20, enemyCount: 2 });
    assert.ok(level >= 10 && level <= 12, `Expected ~11 ± 1, got ${level}`);
  });

  it('applies solo multiplier (1.2x) for 1 enemy', () => {
    const level = getEnemyLevel({ totalEncounters: 10, enemyCount: 1 });
    assert.ok(level >= 6 && level <= 8, `Expected ~7 ± 1, got ${level}`);
  });

  it('applies group multiplier (0.85x) for 3 enemies', () => {
    const level = getEnemyLevel({ totalEncounters: 10, enemyCount: 3 });
    assert.ok(level >= 4 && level <= 6, `Expected ~5 ± 1, got ${level}`);
  });

  it('never returns below 1', () => {
    for (let i = 0; i < 50; i++) {
      const level = getEnemyLevel({ totalEncounters: 0, enemyCount: 3 });
      assert.ok(level >= 1, `Expected >= 1, got ${level}`);
    }
  });

  it('high totalEncounters produces high levels (no early-game cap)', () => {
    const level = getEnemyLevel({ totalEncounters: 50, enemyCount: 1 });
    assert.ok(level >= 25, `Expected strong scaling at te=50 solo, got ${level}`);
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
