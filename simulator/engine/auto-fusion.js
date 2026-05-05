export const DEFAULT_MAX_AUTO_FUSIONS = 20;

function isUnownedResult(recipe) {
  return !Number.isFinite(recipe?.resultOwned) || recipe.resultOwned <= 0;
}

export function selectAutoFusionRecipe(recipes = []) {
  const fuseable = recipes.filter(recipe => recipe?.canFuse === true);
  return fuseable.find(isUnownedResult) || fuseable[0] || null;
}

export async function autoFuseAvailableCreatures(simCall, options = {}) {
  const maxFusions = Number.isInteger(options.maxFusions) && options.maxFusions >= 0
    ? options.maxFusions
    : DEFAULT_MAX_AUTO_FUSIONS;
  let fusionsPerformed = 0;

  for (let attempt = 0; attempt < maxFusions; attempt++) {
    const stateResult = await simCall(
      'GET',
      '/api/game/fusion',
      null,
      `auto fusion state ${attempt}`
    );
    if (!stateResult.ok) {
      return { fusionsPerformed, stoppedReason: 'state_failed' };
    }

    const recipe = selectAutoFusionRecipe(stateResult.data?.recipes || []);
    if (!recipe) {
      return { fusionsPerformed, stoppedReason: 'no_available_recipe' };
    }

    const startResult = await simCall(
      'POST',
      '/api/game/fusion/start',
      { recipeId: recipe.id },
      `auto fusion start ${recipe.id}`
    );
    if (!startResult.ok || startResult.data?.error) {
      return { fusionsPerformed, stoppedReason: 'start_failed' };
    }

    fusionsPerformed++;
  }

  return { fusionsPerformed, stoppedReason: 'max_fusions_reached' };
}
