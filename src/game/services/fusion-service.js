import {
  addCreatureCopy,
  consumeCreatureCopies,
  countRequirements,
  ensureCreatureCounts,
  getCreatureCount
} from './creature-collection-service.js';
import { hasTutorialFusionData, TUTORIAL_FUSION_CREATURE_ID } from './tutorial-service.js';
import { AREAS } from '../rooms.js';

export const FUSION_RECIPES = {
  fireCat: {
    id: 'fire-cat',
    name: '火猫',
    nameEn: 'Fire Cat',
    ingredientIds: ['hi', 'neko'],
    resultId: 'hineko',
    cost: { fusionCores: 1 }
  },
  stoneGiant: {
    id: 'stone-giant',
    name: '石の巨人',
    nameEn: 'Stone Giant',
    ingredientIds: ['ishi', 'ishi', 'ishi'],
    resultId: 'ishino-kyojin',
    requiresBossDefeatId: 'ishino-kyojin',
    cost: { fusionCores: 1 }
  }
};

function getCollection(meta) {
  if (!Array.isArray(meta.creatureCollection)) meta.creatureCollection = [];
  return meta.creatureCollection;
}

function getFusionCores(meta) {
  return Number.isFinite(meta.fusionCores) ? meta.fusionCores : 0;
}

function hasDefeatedBoss(meta, bossCreatureId) {
  if (Array.isArray(meta?.bossesDefeated) && meta.bossesDefeated.includes(bossCreatureId)) {
    return true;
  }

  const bossAreaIndex = AREAS.findIndex(area => area.bossCreatureId === bossCreatureId);
  if (bossAreaIndex < 0) return false;

  const highestUnlocked = meta?.levels?.highestUnlocked || 1;
  return highestUnlocked >= bossAreaIndex + 2;
}

function getRecipeLockedReason(meta, recipe) {
  if (recipe.resultId === TUTORIAL_FUSION_CREATURE_ID && !hasTutorialFusionData(meta, recipe.resultId)) {
    return 'Hineko fusion data required';
  }
  if (recipe.requiresBossDefeatId && !hasDefeatedBoss(meta, recipe.requiresBossDefeatId)) {
    return `${recipe.nameEn} defeat required`;
  }
  return null;
}

function isRecipeVisible(meta, recipe) {
  return !recipe.requiresBossDefeatId || hasDefeatedBoss(meta, recipe.requiresBossDefeatId);
}

function buildRecipeState(meta, recipe) {
  const collection = getCollection(meta);
  ensureCreatureCounts(meta);
  const ingredientRequirements = countRequirements(recipe.ingredientIds).map(req => {
    const owned = getCreatureCount(meta, req.id);
    return {
      ...req,
      owned,
      missing: Math.max(0, req.required - owned)
    };
  });
  const missingIngredientIds = ingredientRequirements
    .filter(req => req.missing > 0)
    .map(req => req.id);
  const alreadyDiscovered = collection.includes(recipe.resultId);
  const resultOwned = getCreatureCount(meta, recipe.resultId);
  const fusionCores = getFusionCores(meta);
  const hasEnoughCores = fusionCores >= recipe.cost.fusionCores;
  const lockedReason = getRecipeLockedReason(meta, recipe);
  const dataUnlocked = !lockedReason;

  return {
    ...recipe,
    ingredientRequirements,
    missingIngredientIds,
    alreadyUnlocked: alreadyDiscovered,
    alreadyDiscovered,
    resultOwned,
    hasEnoughCores,
    dataUnlocked,
    lockedReason,
    canFuse: dataUnlocked && missingIngredientIds.length === 0 && hasEnoughCores
  };
}

export function getFusionState(meta, recipes = Object.values(FUSION_RECIPES)) {
  return {
    fusionCores: getFusionCores(meta),
    recipes: recipes
      .filter(recipe => isRecipeVisible(meta, recipe))
      .map(recipe => buildRecipeState(meta, recipe))
  };
}

export function startFusion(meta, recipeId) {
  const recipe = Object.values(FUSION_RECIPES).find(entry => entry.id === recipeId);
  if (!recipe) return { success: false, error: 'Unknown fusion recipe' };

  const recipeState = buildRecipeState(meta, recipe);
  if (!recipeState.dataUnlocked) {
    return { success: false, error: recipeState.lockedReason || 'Fusion data required', recipe: recipeState };
  }
  if (recipeState.missingIngredientIds.length > 0) {
    return {
      success: false,
      error: 'Missing fusion ingredients',
      missingIngredientIds: recipeState.missingIngredientIds,
      recipe: recipeState
    };
  }
  if (!recipeState.hasEnoughCores) {
    return { success: false, error: 'Not enough fusion cores', recipe: recipeState };
  }

  const consumeResult = consumeCreatureCopies(meta, recipeState.ingredientRequirements);
  if (!consumeResult.success) {
    return {
      success: false,
      error: 'Missing fusion ingredients',
      missingIngredientIds: consumeResult.missing.map(entry => entry.id),
      recipe: buildRecipeState(meta, recipe)
    };
  }

  meta.fusionCores = getFusionCores(meta) - recipe.cost.fusionCores;
  addCreatureCopy(meta, recipe.resultId);

  return {
    success: true,
    unlockedCreatureId: recipe.resultId,
    consumedIngredients: consumeResult.consumed,
    recipe: buildRecipeState(meta, recipe)
  };
}

export function addFusionCore(meta) {
  meta.fusionCores = getFusionCores(meta) + 1;
  return { fusionCores: meta.fusionCores };
}
