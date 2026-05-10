import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  addIngredientsToBag,
  consumeIngredientsFromBag,
  createCookedDishItem,
  getCookableRecipeHints,
  getIngredientCount,
  hasCookableRecipe,
  hasIngredients,
  resolveCookingSelection,
} from '../../../src/game/services/cooking-service.js';
import { createMetaProgression, createNewPlayer, createNewRun } from '../../../src/game/state.js';

describe('cooking inventory helpers', () => {
  it('adds and consumes ingredient counts without mutating unrelated ids', () => {
    const bag = {};
    addIngredientsToBag(bag, [{ id: 'ebi', quantity: 2 }, { id: 'kinoko', quantity: 1 }]);
    assert.deepStrictEqual(bag, { ebi: 2, kinoko: 1 });
    assert.strictEqual(getIngredientCount(bag), 3);
    assert.strictEqual(hasIngredients(bag, [{ id: 'ebi', quantity: 2 }]), true);

    consumeIngredientsFromBag(bag, [{ id: 'ebi', quantity: 1 }]);
    assert.deepStrictEqual(bag, { ebi: 1, kinoko: 1 });
  });

  it('rejects consuming missing ingredients', () => {
    assert.throws(() => consumeIngredientsFromBag({ ebi: 1 }, [{ id: 'ebi', quantity: 2 }]), /Not enough ingredients/);
  });
});

describe('cooking resolver', () => {
  it('chooses the largest fully matched recipe', () => {
    const result = resolveCookingSelection([
      { id: 'mizu', quantity: 1 },
      { id: 'miso', quantity: 1 },
      { id: 'toufu', quantity: 1 },
    ]);

    assert.strictEqual(result.kind, 'recipe');
    assert.strictEqual(result.recipe.id, 'tofu-miso-soup');
    assert.strictEqual(result.recipe.ingredients.reduce((sum, item) => sum + item.quantity, 0), 3);
  });

  it('falls back to cooked single ingredient when no authored recipe matches', () => {
    const result = resolveCookingSelection([
      { id: 'niku', quantity: 1 },
      { id: 'mikan', quantity: 1 },
    ]);

    assert.strictEqual(result.kind, 'fallback');
    assert.ok(result.dish.id.startsWith('cooked-'));
    assert.ok(result.dish.effects.length > 0);
  });

  it('returns a player-facing item compatible with applyItem', () => {
    const result = resolveCookingSelection([{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }]);
    const item = createCookedDishItem(result.dish);
    assert.ok(item.id);
    assert.ok(item.word);
    assert.ok(item.reading);
    assert.ok(item.nameEn);
    assert.ok(item.description);
    assert.ok(['heal', 'boost', 'mpRestore', 'revive', 'xpCharm', 'xpGrant'].includes(item.type));
  });
});

describe('cooking state defaults', () => {
  it('creates run-scoped ingredient inventory and meta recipe discovery', () => {
    const run = createNewRun(createNewPlayer());
    const meta = createMetaProgression();

    assert.deepStrictEqual(run.cooking.ingredients, {});
    assert.deepStrictEqual(run.cooking.cookedThisRun, []);
    assert.deepStrictEqual(meta.cookingRecipesDiscovered, []);
  });
});

describe('cookable recipe hints', () => {
  it('returns sanitized hints for recipes the player can fully make', () => {
    const recipes = [
      {
        id: 'known-good',
        word: '秘密料理',
        reading: 'ひみつりょうり',
        nameEn: 'Secret Dish',
        rarity: 'rare',
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
        effectDescription: 'Hidden outcome.',
      },
      {
        id: 'missing-ingredient',
        word: '足りない料理',
        reading: 'たりないりょうり',
        nameEn: 'Missing Dish',
        rarity: 'epic',
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'toufu', quantity: 1 }],
      },
    ];

    const hints = getCookableRecipeHints({ mizu: 1, miso: 1 }, recipes);

    assert.deepStrictEqual(hints, [{
      id: 'known-good',
      rarity: 'rare',
      totalQuantity: 2,
      ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
    }]);
    assert.equal(hints[0].word, undefined);
    assert.equal(hints[0].nameEn, undefined);
    assert.equal(hints[0].effectDescription, undefined);
  });

  it('excludes recipes above the five ingredient selection cap', () => {
    const recipes = [{
      id: 'too-large',
      rarity: 'legendary',
      ingredients: [
        { id: 'a', quantity: 1 },
        { id: 'b', quantity: 1 },
        { id: 'c', quantity: 1 },
        { id: 'd', quantity: 1 },
        { id: 'e', quantity: 1 },
        { id: 'f', quantity: 1 },
      ],
    }];

    const hints = getCookableRecipeHints({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }, recipes);

    assert.deepStrictEqual(hints, []);
  });

  it('detects cookable authored recipes with at least two ingredients', () => {
    const recipes = [
      {
        id: 'single-water',
        rarity: 'common',
        ingredients: [{ id: 'mizu', quantity: 1 }]
      },
      {
        id: 'miso-soup',
        rarity: 'common',
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }]
      }
    ];

    assert.equal(hasCookableRecipe({ mizu: 1 }, { recipes, minTotalQuantity: 2 }), false);
    assert.equal(hasCookableRecipe({ mizu: 1, miso: 1 }, { recipes, minTotalQuantity: 2 }), true);
  });

  it('does not treat fallback single-ingredient cooking as a cookable recipe', () => {
    assert.equal(hasCookableRecipe({ mizu: 1 }, { recipes: [], minTotalQuantity: 2 }), false);
  });
});
