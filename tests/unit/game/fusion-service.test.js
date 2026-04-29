import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSION_RECIPES,
  getFusionState,
  startFusion,
  addFusionCore
} from '../../../src/game/services/fusion-service.js';

function makeMeta(overrides = {}) {
  return {
    creatureCollection: ['hi', 'neko'],
    fusionCores: 1,
    ...overrides
  };
}

describe('fusion-service', () => {
  it('describes the Fire Cat recipe and current eligibility', () => {
    const meta = makeMeta();

    const state = getFusionState(meta);

    assert.equal(state.fusionCores, 1);
    assert.equal(state.recipes.length, 1);
    assert.equal(state.recipes[0].id, FUSION_RECIPES.fireCat.id);
    assert.deepEqual(state.recipes[0].ingredientIds, ['hi', 'neko']);
    assert.equal(state.recipes[0].resultId, 'hineko');
    assert.equal(state.recipes[0].cost.fusionCores, 1);
    assert.equal(state.recipes[0].canFuse, true);
    assert.deepEqual(state.recipes[0].missingIngredientIds, []);
    assert.equal(state.recipes[0].alreadyUnlocked, false);
  });

  it('spends one fusion core and permanently unlocks Fire Cat without consuming inputs', () => {
    const meta = makeMeta();

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, true);
    assert.equal(result.recipe.resultId, 'hineko');
    assert.equal(result.unlockedCreatureId, 'hineko');
    assert.equal(meta.fusionCores, 0);
    assert.deepEqual(meta.creatureCollection, ['hi', 'neko', 'hineko']);
  });

  it('rejects fusion when an ingredient is missing', () => {
    const meta = makeMeta({ creatureCollection: ['hi'] });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Missing fusion ingredients');
    assert.deepEqual(result.missingIngredientIds, ['neko']);
    assert.equal(meta.fusionCores, 1);
    assert.deepEqual(meta.creatureCollection, ['hi']);
  });

  it('rejects fusion when there are not enough fusion cores', () => {
    const meta = makeMeta({ fusionCores: 0 });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Not enough fusion cores');
    assert.equal(meta.fusionCores, 0);
    assert.deepEqual(meta.creatureCollection, ['hi', 'neko']);
  });

  it('does not spend a fusion core when Fire Cat is already unlocked', () => {
    const meta = makeMeta({ creatureCollection: ['hi', 'neko', 'hineko'] });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Creature already unlocked');
    assert.equal(meta.fusionCores, 1);
    assert.deepEqual(meta.creatureCollection, ['hi', 'neko', 'hineko']);
  });

  it('adds one fusion core for debug testing', () => {
    const meta = makeMeta({ fusionCores: 0 });

    const result = addFusionCore(meta);

    assert.equal(result.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
  });
});
