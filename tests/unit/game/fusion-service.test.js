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
    creatureCounts: { hi: 1, neko: 1 },
    fusionCores: 1,
    tutorialFusionDataUnlocked: ['hinoneko'],
    bossesDefeated: ['ishino-kyojin'],
    ...overrides
  };
}

describe('fusion-service', () => {
  it('describes the Fire Cat recipe and current eligibility', () => {
    const meta = makeMeta();

    const state = getFusionState(meta);

    assert.equal(state.fusionCores, 1);
    assert.equal(state.recipes.length, 2);
    assert.equal(state.recipes[0].id, FUSION_RECIPES.fireCat.id);
    assert.equal(state.recipes[0].name, '火の猫');
    assert.deepEqual(state.recipes[0].ingredientIds, ['hi', 'neko']);
    assert.equal(state.recipes[0].resultId, 'hinoneko');
    assert.equal(state.recipes[0].cost.fusionCores, 1);
    assert.equal(state.recipes[0].canFuse, true);
    assert.deepEqual(state.recipes[0].missingIngredientIds, []);
    assert.equal(state.recipes[0].alreadyUnlocked, false);
  });

  it('locks Fire Cat until Hinoneko fusion data is unlocked', () => {
    const meta = makeMeta({ tutorialFusionDataUnlocked: [] });

    const state = getFusionState(meta);

    assert.equal(state.recipes[0].canFuse, false);
    assert.equal(state.recipes[0].dataUnlocked, false);
    assert.equal(state.recipes[0].lockedReason, 'Hinoneko fusion data required');
  });

  it('spends one fusion core, consumes ingredients, and adds a Fire Cat copy', () => {
    const meta = makeMeta();

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, true);
    assert.equal(result.recipe.resultId, 'hinoneko');
    assert.equal(result.unlockedCreatureId, 'hinoneko');
    assert.equal(meta.fusionCores, 0);
    assert.ok(meta.creatureCollection.includes('hinoneko'));
    assert.equal(meta.creatureCounts.hi, 0);
    assert.equal(meta.creatureCounts.neko, 0);
    assert.equal(meta.creatureCounts.hinoneko, 1);
  });

  it('rejects fusion before Hinoneko fusion data is unlocked', () => {
    const meta = makeMeta({ tutorialFusionDataUnlocked: [] });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Hinoneko fusion data required');
    assert.equal(meta.fusionCores, 1);
    assert.equal(meta.creatureCounts.hi, 1);
    assert.equal(meta.creatureCounts.neko, 1);
  });

  it('rejects fusion when an ingredient quantity is missing', () => {
    const meta = makeMeta({ creatureCounts: { hi: 1, neko: 0 } });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Missing fusion ingredients');
    assert.deepEqual(result.missingIngredientIds, ['neko']);
    assert.equal(meta.fusionCores, 1);
    assert.equal(meta.creatureCounts.hi, 1);
    assert.equal(meta.creatureCounts.neko, 0);
  });

  it('rejects fusion when there are not enough fusion cores', () => {
    const meta = makeMeta({ fusionCores: 0 });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Not enough fusion cores');
    assert.equal(meta.fusionCores, 0);
    assert.equal(meta.creatureCounts.hi, 1);
    assert.equal(meta.creatureCounts.neko, 1);
  });

  it('allows repeat fusion for an already-discovered result and consumes ingredients again', () => {
    const meta = makeMeta({
      creatureCollection: ['hi', 'neko', 'hinoneko'],
      creatureCounts: { hi: 2, neko: 1, hinoneko: 1 },
      fusionCores: 2
    });

    const result = startFusion(meta, FUSION_RECIPES.fireCat.id);

    assert.equal(result.success, true);
    assert.equal(meta.fusionCores, 1);
    assert.equal(meta.creatureCounts.hi, 1);
    assert.equal(meta.creatureCounts.neko, 0);
    assert.equal(meta.creatureCounts.hinoneko, 2);
  });

  it('supports recipes that require multiple copies of the same ingredient', () => {
    const tripleHiRecipe = {
      id: 'triple-hi-test',
      name: '三火',
      nameEn: 'Triple Hi',
      ingredientIds: ['hi', 'hi', 'hi'],
      resultId: 'neko',
      cost: { fusionCores: 1 }
    };
    const meta = makeMeta({
      creatureCollection: ['hi'],
      creatureCounts: { hi: 3 },
      fusionCores: 1
    });

    const state = getFusionState(meta, [tripleHiRecipe]);

    assert.equal(state.recipes[0].canFuse, true);
    assert.deepEqual(state.recipes[0].ingredientRequirements, [
      { id: 'hi', required: 3, owned: 3, missing: 0 }
    ]);
  });

  it('hides Stone Giant until Stone Giant has been defeated once', () => {
    const lockedState = getFusionState(makeMeta({ bossesDefeated: [] }));
    assert.deepEqual(
      lockedState.recipes.map(recipe => recipe.id),
      [FUSION_RECIPES.fireCat.id]
    );

    const unlockedState = getFusionState(makeMeta({ bossesDefeated: ['ishino-kyojin'] }));
    assert.ok(unlockedState.recipes.some(recipe => recipe.id === FUSION_RECIPES.stoneGiant.id));
  });

  it('fuses Stone Giant from three owned Stone copies', () => {
    const meta = makeMeta({
      creatureCollection: ['hi', 'neko', 'ishi'],
      creatureCounts: { hi: 1, neko: 1, ishi: 3 },
      fusionCores: 1
    });

    const result = startFusion(meta, FUSION_RECIPES.stoneGiant.id);

    assert.equal(result.success, true);
    assert.equal(result.unlockedCreatureId, 'ishino-kyojin');
    assert.equal(meta.fusionCores, 0);
    assert.equal(meta.creatureCounts.ishi, 0);
    assert.equal(meta.creatureCounts['ishino-kyojin'], 1);
    assert.ok(meta.creatureCollection.includes('ishino-kyojin'));
  });

  it('rejects Stone Giant fusion without three owned Stone copies', () => {
    const meta = makeMeta({
      creatureCollection: ['hi', 'neko', 'ishi'],
      creatureCounts: { hi: 1, neko: 1, ishi: 2 },
      fusionCores: 1
    });

    const result = startFusion(meta, FUSION_RECIPES.stoneGiant.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Missing fusion ingredients');
    assert.equal(meta.fusionCores, 1);
    assert.equal(meta.creatureCounts.ishi, 2);
    assert.equal(meta.creatureCounts['ishino-kyojin'] || 0, 0);
  });

  it('rejects direct Stone Giant fusion before Stone Giant has been defeated once', () => {
    const meta = makeMeta({
      bossesDefeated: [],
      creatureCollection: ['hi', 'neko', 'ishi'],
      creatureCounts: { hi: 1, neko: 1, ishi: 3 },
      fusionCores: 1
    });

    const result = startFusion(meta, FUSION_RECIPES.stoneGiant.id);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Stone Giant defeat required');
    assert.equal(meta.fusionCores, 1);
    assert.equal(meta.creatureCounts.ishi, 3);
    assert.equal(meta.creatureCounts['ishino-kyojin'] || 0, 0);
  });

  it('adds one fusion core for debug testing', () => {
    const meta = makeMeta({ fusionCores: 0 });

    const result = addFusionCore(meta);

    assert.equal(result.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
  });
});
