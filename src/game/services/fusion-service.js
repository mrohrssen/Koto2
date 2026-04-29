import { addToCollection } from './creature-collection-service.js';

export const FUSION_RECIPES = {
  fireCat: {
    id: 'fire-cat',
    name: '火猫',
    nameEn: 'Fire Cat',
    ingredientIds: ['hi', 'neko'],
    resultId: 'hineko',
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

function buildRecipeState(meta, recipe) {
  const collection = getCollection(meta);
  const missingIngredientIds = recipe.ingredientIds.filter(id => !collection.includes(id));
  const alreadyUnlocked = collection.includes(recipe.resultId);
  const fusionCores = getFusionCores(meta);
  const hasEnoughCores = fusionCores >= recipe.cost.fusionCores;

  return {
    ...recipe,
    missingIngredientIds,
    alreadyUnlocked,
    hasEnoughCores,
    canFuse: missingIngredientIds.length === 0 && hasEnoughCores && !alreadyUnlocked
  };
}

export function getFusionState(meta) {
  return {
    fusionCores: getFusionCores(meta),
    recipes: Object.values(FUSION_RECIPES).map(recipe => buildRecipeState(meta, recipe))
  };
}

export function startFusion(meta, recipeId) {
  const recipe = Object.values(FUSION_RECIPES).find(entry => entry.id === recipeId);
  if (!recipe) return { success: false, error: 'Unknown fusion recipe' };

  const recipeState = buildRecipeState(meta, recipe);
  if (recipeState.alreadyUnlocked) {
    return { success: false, error: 'Creature already unlocked', recipe: recipeState };
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

  meta.fusionCores = getFusionCores(meta) - recipe.cost.fusionCores;
  addToCollection(getCollection(meta), recipe.resultId);

  return {
    success: true,
    unlockedCreatureId: recipe.resultId,
    recipe: buildRecipeState(meta, recipe)
  };
}

export function addFusionCore(meta) {
  meta.fusionCores = getFusionCores(meta) + 1;
  return { fusionCores: meta.fusionCores };
}
