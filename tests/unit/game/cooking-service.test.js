import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  addIngredientsToBag,
  consumeIngredientsFromBag,
  createCookedDishItem,
  getIngredientCount,
  hasIngredients,
  resolveCookingSelection,
  rollMaterialDrops,
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

describe('material drops', () => {
  it('rolls between 9 and 15 ingredient units for demo mode', () => {
    for (let i = 0; i < 50; i++) {
      const drops = rollMaterialDrops();
      const total = drops.reduce((sum, drop) => sum + drop.quantity, 0);
      assert.ok(total >= 9 && total <= 15, `expected 9-15 drops, got ${total}`);
      assert.ok(drops.every(drop => drop.id && drop.quantity > 0));
    }
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
