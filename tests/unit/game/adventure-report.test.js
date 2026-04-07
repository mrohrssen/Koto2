import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNewRun, createMetaProgression } from '../../../src/game/state.js';

describe('adventure-report: run state tracking fields', () => {
  const mockPlayer = { name: 'Test', hp: 100, maxHp: 100, attack: 10, credits: 50 };

  it('createNewRun includes runSummary with tracking fields', () => {
    const run = createNewRun(mockPlayer);
    assert.ok(run.runSummary, 'runSummary should exist');
    assert.equal(run.runSummary.creaturesBefriended, 0);
    assert.equal(run.runSummary.creaturesDefeated, 0);
    assert.equal(run.runSummary.itemsCollected, 0);
    assert.deepStrictEqual(run.runSummary.elementsCollected, { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 });
    assert.ok(Array.isArray(run.runSummary.wordsExposed));
    assert.ok(Array.isArray(run.runSummary.wordsMastered));
  });
});

describe('adventure-report: meta-progression discovery tracking', () => {
  it('createMetaProgression includes itemsDiscovered as empty array', () => {
    const meta = createMetaProgression();
    assert.ok(Array.isArray(meta.itemsDiscovered));
    assert.equal(meta.itemsDiscovered.length, 0);
  });
});

describe('adventure-report: buildRunSummary', () => {
  it('buildRunSummary produces correct summary from run and meta state', async () => {
    const { buildRunSummary } = await import('../../../src/game/adventure-report.js');

    const run = {
      areasCompleted: 3,
      areasToWin: 10,
      stats: { startTime: 1000, endTime: 61000 },
      runSummary: {
        creaturesBefriended: 2,
        creaturesDefeated: 5,
        itemsCollected: 3,
        elementsCollected: { fire: 3, water: 1, earth: 0, wood: 2, metal: 0 },
        wordsExposed: ['光', 'ください', 'こんにちは'],
        wordsMastered: [
          { word: 'ください', meaning: 'please', exposures: 5 },
          { word: 'こんにちは', meaning: 'hello', exposures: 5 },
        ],
      },
    };

    const meta = {
      lifetimeStats: { totalRuns: 7 },
      creatureCollection: ['hikaribon', 'hanatchi', 'tsukimochi', 'tetsu', 'nami', 'mori', 'iwa', 'hagane'],
      itemsDiscovered: ['ocha', 'toufu', 'ringo', 'tamago', 'sake', 'raamen', 'hon', 'kutsu', 'boushi', 'ichigo', 'bentou', 'sushi'],
    };

    const summary = buildRunSummary(run, meta);

    assert.equal(summary.areasCompleted, 3);
    assert.equal(summary.areasToWin, 10);
    assert.equal(summary.creaturesBefriended, 2);
    assert.equal(summary.creaturesDefeated, 5);
    assert.equal(summary.itemsCollected, 3);
    assert.deepStrictEqual(summary.elementsCollected, { fire: 3, water: 1, earth: 0, wood: 2, metal: 0 });
    assert.equal(summary.wordsImmersed, 3);
    assert.equal(summary.wordsMastered.length, 2);
    assert.equal(summary.runNumber, 7);
    assert.equal(summary.durationMs, 60000);
    assert.equal(summary.creaturesDiscovered, 8);
    assert.ok(summary.totalCreatures > 0, 'totalCreatures should come from creatures.json');
    assert.equal(summary.itemsDiscoveredCount, 12);
    assert.ok(summary.totalItems > 0, 'totalItems should come from items.json');
  });
});
