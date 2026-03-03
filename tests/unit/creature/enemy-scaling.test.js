import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getEnemyLevel } from '../../../src/game/creatures.js';

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
