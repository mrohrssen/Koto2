import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getEnemyLevel, getRarityWeightsForStage, getEnemyCountWeights, generateEnemyCreatures } from '../../../src/game/creatures.js';

describe('getEnemyLevel', () => {
  it('computes baseline from stage', () => {
    // Stage 1, encounter 0, 2 enemies (1.0x), player level 5
    const level = getEnemyLevel({ stage: 1, encounterIndex: 0, enemyCount: 2, playerLevel: 5 });
    // stageBaseline = 1 * 3 = 3, encounterBonus = 0, partySizeMult = 1.0 → 3, clamp [1,10] → 3
    assert.strictEqual(level, 3);
  });

  it('ramps with encounter index', () => {
    // Stage 3, encounter 5, 2 enemies, player level 13
    const level = getEnemyLevel({ stage: 3, encounterIndex: 5, enemyCount: 2, playerLevel: 13 });
    // stageBaseline = 9, encounterBonus = 9 * (5 * 0.08) = 3.6, total = 12.6, round = 13, clamp [8,18] → 13
    assert.strictEqual(level, 13);
  });

  it('applies solo multiplier (1.2x) for 1 enemy', () => {
    const level = getEnemyLevel({ stage: 3, encounterIndex: 0, enemyCount: 1, playerLevel: 11 });
    // stageBaseline = 9, encounterBonus = 0, * 1.2 = 10.8, round = 11, clamp [6,16] → 11
    assert.strictEqual(level, 11);
  });

  it('applies group multiplier (0.85x) for 3 enemies', () => {
    const level = getEnemyLevel({ stage: 3, encounterIndex: 0, enemyCount: 3, playerLevel: 8 });
    // stageBaseline = 9, encounterBonus = 0, * 0.85 = 7.65, round = 8, clamp [3,13] → 8
    assert.strictEqual(level, 8);
  });

  it('clamps to playerLevel + 5 max', () => {
    // Stage 10, encounter 5 → high raw level, but player is only level 10
    const level = getEnemyLevel({ stage: 10, encounterIndex: 5, enemyCount: 1, playerLevel: 10 });
    assert.strictEqual(level, 15); // 10 + 5
  });

  it('clamps to playerLevel - 5 min (floor 1)', () => {
    // Stage 1, encounter 0, 3 enemies → low raw level, player is level 20
    const level = getEnemyLevel({ stage: 1, encounterIndex: 0, enemyCount: 3, playerLevel: 20 });
    assert.strictEqual(level, 15); // 20 - 5
  });

  it('never returns below 1', () => {
    const level = getEnemyLevel({ stage: 1, encounterIndex: 0, enemyCount: 3, playerLevel: 1 });
    assert.ok(level >= 1);
  });

  it('defaults to stage 1 when stage is undefined', () => {
    const level = getEnemyLevel({ encounterIndex: 0, enemyCount: 2, playerLevel: 5 });
    // stageBaseline = 1 * 3 = 3
    assert.strictEqual(level, 3);
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
  it('accepts stage and encounterIndex options', () => {
    const enemies = generateEnemyCreatures(10, {
      stage: 3,
      encounterIndex: 2,
      creaturePool: ['hikaribon', 'kamedor', 'kazenoko']
    });
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.level >= 1, `enemy level should be >= 1, got ${e.level}`);
    }
  });

  it('enemies are higher level with higher stage', () => {
    let avgLowStage = 0;
    let avgHighStage = 0;
    const trials = 50;
    const pool = ['hikaribon', 'kamedor', 'kazenoko'];
    for (let i = 0; i < trials; i++) {
      const low = generateEnemyCreatures(15, { stage: 1, encounterIndex: 0, creaturePool: pool });
      const high = generateEnemyCreatures(15, { stage: 7, encounterIndex: 0, creaturePool: pool });
      avgLowStage += low.reduce((s, e) => s + e.level, 0) / low.length;
      avgHighStage += high.reduce((s, e) => s + e.level, 0) / high.length;
    }
    avgLowStage /= trials;
    avgHighStage /= trials;
    assert.ok(avgHighStage > avgLowStage, `Stage 7 avg (${avgHighStage}) should be > Stage 1 avg (${avgLowStage})`);
  });

  it('still works with legacy call (no stage/encounterIndex)', () => {
    const enemies = generateEnemyCreatures(5);
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.hp > 0);
    }
  });
});
