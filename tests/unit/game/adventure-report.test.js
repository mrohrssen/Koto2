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
