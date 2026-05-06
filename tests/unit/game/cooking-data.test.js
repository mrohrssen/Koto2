import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const INGREDIENTS = JSON.parse(readFileSync('data/cooking/ingredients.json', 'utf8'));
const RECIPES = JSON.parse(readFileSync('data/cooking/recipes.json', 'utf8'));

const ALLOWED_RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const ALLOWED_EFFECTS = new Set([
  'hpRestore',
  'partyHpRestore',
  'mpRestore',
  'revive',
  'attackMult',
  'hpMult',
  'xpMult',
  'xpGrant',
  'elementEdge',
  'dexMult',
]);

function recipeSignature(recipe) {
  return recipe.ingredients
    .map(ingredient => `${ingredient.id}:${ingredient.quantity}`)
    .sort()
    .join('|');
}

function recipeTotalIngredients(recipe) {
  return recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.quantity, 0);
}

describe('cooking ingredient data', () => {
  it('has unique ingredient ids with allowed rarities and effects', () => {
    const ids = new Set();
    for (const ingredient of INGREDIENTS) {
      assert.ok(ingredient.id, 'ingredient missing id');
      assert.ok(!ids.has(ingredient.id), `duplicate ingredient id ${ingredient.id}`);
      ids.add(ingredient.id);
      assert.ok(ingredient.word, `${ingredient.id} missing word`);
      assert.ok(ingredient.reading, `${ingredient.id} missing reading`);
      assert.ok(ingredient.nameEn, `${ingredient.id} missing nameEn`);
      assert.ok(ingredient.meaning, `${ingredient.id} missing meaning`);
      assert.ok(Number.isFinite(ingredient.jpdbRank), `${ingredient.id} missing jpdbRank`);
      assert.ok(ALLOWED_RARITIES.has(ingredient.rarity), `${ingredient.id} invalid rarity`);
      assert.ok(ALLOWED_EFFECTS.has(ingredient.primaryEffect), `${ingredient.id} invalid primaryEffect`);
      if (ingredient.secondaryEffect !== null) {
        assert.ok(ALLOWED_EFFECTS.has(ingredient.secondaryEffect), `${ingredient.id} invalid secondaryEffect`);
      }
    }
  });
});

describe('cooking recipe data', () => {
  it('has 200 unique recipes with valid ingredient signatures', () => {
    assert.strictEqual(RECIPES.length, 200);
    const recipeIds = new Set();
    const signatures = new Set();
    const ingredientIds = new Set(INGREDIENTS.map(ingredient => ingredient.id));

    for (const recipe of RECIPES) {
      assert.ok(recipe.id, 'recipe missing id');
      assert.ok(!recipeIds.has(recipe.id), `duplicate recipe id ${recipe.id}`);
      recipeIds.add(recipe.id);
      assert.ok(!signatures.has(recipeSignature(recipe)), `duplicate recipe signature ${recipe.id}`);
      signatures.add(recipeSignature(recipe));
      assert.ok(ALLOWED_RARITIES.has(recipe.rarity), `${recipe.id} invalid rarity`);

      for (const ingredient of recipe.ingredients) {
        assert.ok(ingredientIds.has(ingredient.id), `${recipe.id} unknown ingredient ${ingredient.id}`);
        assert.ok(Number.isInteger(ingredient.quantity) && ingredient.quantity > 0, `${recipe.id} invalid quantity`);
      }
    }
  });

  it('matches the approved total ingredient count distribution', () => {
    const counts = { 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const recipe of RECIPES) counts[recipeTotalIngredients(recipe)]++;
    assert.deepStrictEqual(counts, { 2: 90, 3: 70, 4: 30, 5: 10 });
  });

  it('uses only allowed nonzero effects derived from ingredient lanes', () => {
    const ingredientById = new Map(INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));

    for (const recipe of RECIPES) {
      const lanes = new Set();
      for (const requirement of recipe.ingredients) {
        const ingredient = ingredientById.get(requirement.id);
        lanes.add(ingredient.primaryEffect);
        if (ingredient.secondaryEffect) lanes.add(ingredient.secondaryEffect);
      }

      for (const effect of recipe.effects) {
        assert.ok(ALLOWED_EFFECTS.has(effect.type), `${recipe.id} invalid effect ${effect.type}`);
        assert.notStrictEqual(effect.value, 0, `${recipe.id} has zero ${effect.type}`);
        assert.ok(['fedCreature', 'party'].includes(effect.target), `${recipe.id} invalid target`);
        assert.ok(lanes.has(effect.type), `${recipe.id} effect ${effect.type} not represented by ingredients`);
      }
    }
  });
});
