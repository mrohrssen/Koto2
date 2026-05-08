# Campfire Recipe Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live ingredient glow pruning and fireplace ready feedback so campfire cooking clearly shows which selections can produce real, non-fallback recipes.

**Architecture:** The server exposes anonymous `cookableRecipeHints` in the existing campfire state, derived from authored recipes the player can fully make from their current ingredient bag. The frontend keeps recipe discovery unchanged, computes guidance from `cookableRecipeHints` and local `selected` counts on every render, and maps that state to CSS classes for ingredient glow and fireplace pulse. Cooking resolution remains unchanged, including fallback cooking.

**Tech Stack:** Node.js ES modules, Express routes, browser DOM rendering in `public/js/ui/campfire.js`, CSS animations in `public/game.css`, `node:test`, `supertest`.

---

## File Structure

- Modify `src/game/services/cooking-service.js`: add exported helper `getCookableRecipeHints(bag, recipes)` and reuse the existing `recipeTotalQuantity()`/`hasIngredients()` logic.
- Modify `src/routes/game/cooking.js`: include `cookableRecipeHints` in `buildCampfireState(req)`.
- Modify `public/js/ui/campfire.js`: derive recipe guidance from `campfireState.cookableRecipeHints`, add `recipe-valid` to ingredient cards, and add `campfire-focus-wrap--recipe-ready` to the fireplace wrapper.
- Modify `public/game.css`: add pulsing glow styles for `.campfire-ingredient-card.recipe-valid` and ready pulse animation for `.campfire-focus-wrap--recipe-ready`.
- Modify `tests/unit/game/cooking-service.test.js`: cover anonymous hint filtering.
- Modify `tests/unit/routes/cooking-routes.test.js`: assert campfire API includes sanitized hints.
- Modify `tests/unit/ui/campfire.test.js`: cover glow pruning, ready pulse, stronger extensions, fallback-only selections, and duplicate quantities.

## Task 1: Add Cookable Recipe Hint Helper

**Files:**
- Modify: `src/game/services/cooking-service.js`
- Test: `tests/unit/game/cooking-service.test.js`

- [ ] **Step 1: Write failing service tests for anonymous cookable hints**

Append this `describe` block to `tests/unit/game/cooking-service.test.js` and add `getCookableRecipeHints` to the import list.

```js
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
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `node --test tests/unit/game/cooking-service.test.js`

Expected: FAIL with an import/export error for `getCookableRecipeHints`.

- [ ] **Step 3: Implement `getCookableRecipeHints`**

In `src/game/services/cooking-service.js`, add this export after `hasIngredients()`:

```js
export function getCookableRecipeHints(bag = {}, recipes = COOKING_RECIPES) {
  return recipes
    .filter(recipe => recipeTotalQuantity(recipe) <= 5)
    .filter(recipe => hasIngredients(bag, recipe.ingredients || []))
    .map(recipe => ({
      id: recipe.id,
      rarity: recipe.rarity,
      totalQuantity: recipeTotalQuantity(recipe),
      ingredients: (recipe.ingredients || []).map(ingredient => ({
        id: ingredient.id,
        quantity: ingredient.quantity,
      })),
    }));
}
```

- [ ] **Step 4: Run the service test to verify it passes**

Run: `node --test tests/unit/game/cooking-service.test.js`

Expected: PASS for all cooking service tests.

- [ ] **Step 5: Commit the service helper change**

```bash
git add src/game/services/cooking-service.js tests/unit/game/cooking-service.test.js
git commit -m "Add cookable recipe hint helper"
```

## Task 2: Expose Recipe Hints From Campfire State

**Files:**
- Modify: `src/routes/game/cooking.js`
- Test: `tests/unit/routes/cooking-routes.test.js`

- [ ] **Step 1: Write a failing route test for sanitized hints**

Append this test inside `describe('cooking routes', ...)` in `tests/unit/routes/cooking-routes.test.js`.

```js
it('campfire state includes anonymous cookable recipe hints', async () => {
  loadDialoguePools(`${process.cwd()}/data`);
  const app = createApp({ authBypass: true });
  const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
  gm.run.cooking.ingredients = { mizu: 1, miso: 1, toufu: 1 };

  const res = await request(app)
    .get('/api/game/campfire')
    .expect(200);

  const misoSoup = res.body.cookableRecipeHints.find(recipe => recipe.id === 'miso-soup');
  const tofuMisoSoup = res.body.cookableRecipeHints.find(recipe => recipe.id === 'tofu-miso-soup');

  assert.ok(misoSoup);
  assert.ok(tofuMisoSoup);
  assert.deepEqual(misoSoup.ingredients, [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }]);
  assert.equal(misoSoup.totalQuantity, 2);
  assert.equal(misoSoup.word, undefined);
  assert.equal(misoSoup.nameEn, undefined);
  assert.equal(misoSoup.effectDescription, undefined);
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --test tests/unit/routes/cooking-routes.test.js`

Expected: FAIL because `res.body.cookableRecipeHints` is undefined.

- [ ] **Step 3: Add `getCookableRecipeHints` to the cooking route imports**

In `src/routes/game/cooking.js`, update the import from `../../game/services/cooking-service.js`:

```js
import {
  addIngredientsToBag,
  applyCookedDish,
  consumeIngredientsFromBag,
  getCookableRecipeHints,
  getIngredientCount,
  hasIngredients,
  resolveCookingSelection,
  COOKING_INGREDIENTS,
  COOKING_RECIPES,
} from '../../game/services/cooking-service.js';
```

- [ ] **Step 4: Include hints in `buildCampfireState(req)`**

Add `cookableRecipeHints` next to the existing campfire data fields:

```js
return {
  ingredients: gm.run.cooking.ingredients,
  ingredientCatalog: COOKING_INGREDIENTS,
  ingredientCount: getIngredientCount(gm.run.cooking.ingredients),
  discoveredRecipes: COOKING_RECIPES.filter(recipe => discoveredIds.has(recipe.id)),
  cookableRecipeHints: getCookableRecipeHints(gm.run.cooking.ingredients),
  room: gm.getCurrentRoom()?.campfire || null,
  yesTokens: getEligibleFrameTokens(getGameMasterYesFrame(), knownSet, { dict }),
  noTokens: getEligibleFrameTokens(getGameMasterNoFrame(), knownSet, { dict }),
  state: req.getEnrichedGameState(),
};
```

- [ ] **Step 5: Run the route test to verify it passes**

Run: `node --test tests/unit/routes/cooking-routes.test.js`

Expected: PASS for all cooking route tests.

- [ ] **Step 6: Commit the route payload change**

```bash
git add src/routes/game/cooking.js tests/unit/routes/cooking-routes.test.js
git commit -m "Expose campfire recipe guidance hints"
```

## Task 3: Add Frontend Guidance State Tests

**Files:**
- Modify: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Expand `sampleState()` with recipe hints and extra ingredients**

Update `sampleState()` in `tests/unit/ui/campfire.test.js` so the default state includes `toufu` and anonymous hints:

```js
function sampleState(overrides = {}) {
  return {
    ingredients: { mizu: 1, miso: 1, toufu: 1 },
    ingredientCatalog: [
      { id: 'mizu', word: '水', reading: 'みず', nameEn: 'Water', meaning: 'water' },
      { id: 'miso', word: '味噌', reading: 'みそ', nameEn: 'Miso', meaning: 'miso' },
      { id: 'toufu', word: '豆腐', reading: 'とうふ', nameEn: 'Tofu', meaning: 'tofu' },
    ],
    discoveredRecipes: [{
      id: 'miso-soup',
      word: '味噌汁',
      reading: 'みそしる',
      nameEn: 'Miso soup',
      meaning: 'miso soup',
      rarity: 'common',
      ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      effectDescription: 'Restores 20% MP.',
    }],
    cookableRecipeHints: [
      {
        id: 'miso-soup',
        rarity: 'common',
        totalQuantity: 2,
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      },
      {
        id: 'tofu-miso-soup',
        rarity: 'uncommon',
        totalQuantity: 3,
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }, { id: 'toufu', quantity: 1 }],
      },
    ],
    yesTokens: {
      tokens: [{ surface: 'はい', base: 'はい', reading: 'はい', pos: 'Interjection' }],
      overrides: {},
    },
    noTokens: {
      tokens: [{ surface: 'いいえ', base: 'いいえ', reading: 'いいえ', pos: 'Interjection' }],
      overrides: {},
    },
    room: { cookedDish: null },
    ...overrides,
  };
}
```

- [ ] **Step 2: Add UI tests for glow pruning and ready pulse**

Append these tests near the other ingredient selection tests:

```js
it('glows ingredients that belong to a cookable real recipe path', () => {
  campfire.renderForTest(sampleState());
  openCooking();

  const cards = actionArea.querySelectorAll('.campfire-ingredient-card');

  assert.match(cards[0].className, /recipe-valid/);
  assert.match(cards[1].className, /recipe-valid/);
  assert.match(cards[2].className, /recipe-valid/);
});

it('prunes unrelated ingredient glow after selecting an ingredient', () => {
  campfire.renderForTest(sampleState({
    ingredients: { mizu: 1, miso: 1, sakana: 1, yasai: 1 },
    ingredientCatalog: [
      { id: 'mizu', word: '水', reading: 'みず', nameEn: 'Water', meaning: 'water' },
      { id: 'miso', word: '味噌', reading: 'みそ', nameEn: 'Miso', meaning: 'miso' },
      { id: 'sakana', word: '魚', reading: 'さかな', nameEn: 'Fish', meaning: 'fish' },
      { id: 'yasai', word: '野菜', reading: 'やさい', nameEn: 'Vegetable', meaning: 'vegetable' },
    ],
    cookableRecipeHints: [
      {
        id: 'miso-soup',
        rarity: 'common',
        totalQuantity: 2,
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      },
      {
        id: 'fish-greens',
        rarity: 'common',
        totalQuantity: 2,
        ingredients: [{ id: 'sakana', quantity: 1 }, { id: 'yasai', quantity: 1 }],
      },
    ],
  }));
  openCooking();

  actionArea.querySelectorAll('.campfire-ingredient-card')[0].click();
  const cards = actionArea.querySelectorAll('.campfire-ingredient-card');

  assert.match(cards[0].className, /recipe-valid/);
  assert.match(cards[1].className, /recipe-valid/);
  assert.doesNotMatch(cards[2].className, /recipe-valid/);
  assert.doesNotMatch(cards[3].className, /recipe-valid/);
});

it('pulses the fireplace only when a real recipe is complete', () => {
  campfire.renderForTest(sampleState());
  openCooking();

  let cards = actionArea.querySelectorAll('.campfire-ingredient-card');
  cards[0].click();
  assert.equal(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'), null);

  cards = actionArea.querySelectorAll('.campfire-ingredient-card');
  cards[1].click();
  assert.ok(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'));
});

it('keeps stronger recipe extensions glowing after a smaller recipe is complete', () => {
  campfire.renderForTest(sampleState());
  openCooking();

  let cards = actionArea.querySelectorAll('.campfire-ingredient-card');
  cards[0].click();
  cards = actionArea.querySelectorAll('.campfire-ingredient-card');
  cards[1].click();
  cards = actionArea.querySelectorAll('.campfire-ingredient-card');

  assert.ok(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'));
  assert.match(cards[2].className, /recipe-valid/);
});

it('does not pulse the fireplace for fallback-only selections', () => {
  campfire.renderForTest(sampleState({
    ingredients: { niku: 1 },
    ingredientCatalog: [
      { id: 'niku', word: '肉', reading: 'にく', nameEn: 'Meat', meaning: 'meat' },
    ],
    cookableRecipeHints: [],
  }));
  openCooking();

  actionArea.querySelector('.campfire-ingredient-card').click();

  assert.equal(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'), null);
  assert.doesNotMatch(actionArea.querySelector('.campfire-ingredient-card').className, /recipe-valid/);
});

it('keeps duplicate-quantity recipe paths glowing before completion', () => {
  campfire.renderForTest(sampleState({
    ingredients: { tamago: 2 },
    ingredientCatalog: [
      { id: 'tamago', word: '卵', reading: 'たまご', nameEn: 'Egg', meaning: 'egg' },
    ],
    cookableRecipeHints: [{
      id: 'double-egg',
      rarity: 'common',
      totalQuantity: 2,
      ingredients: [{ id: 'tamago', quantity: 2 }],
    }],
  }));
  openCooking();

  actionArea.querySelector('.campfire-ingredient-card').click();

  assert.match(actionArea.querySelector('.campfire-ingredient-card').className, /recipe-valid/);
  assert.equal(sceneArea.querySelector('.campfire-focus-wrap--recipe-ready'), null);
});
```

- [ ] **Step 3: Run the UI test to verify the new tests fail**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js`

Expected: FAIL because `recipe-valid` and `campfire-focus-wrap--recipe-ready` are not rendered yet.

- [ ] **Step 4: Keep the failing UI tests uncommitted until Task 4 passes**

Do not commit after this task. The next task makes these tests pass, and the passing frontend logic and tests are committed together.

## Task 4: Implement Frontend Recipe Guidance Classes

**Files:**
- Modify: `public/js/ui/campfire.js`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Add frontend recipe guidance helpers**

Add these helpers after `selectedUnits()` in `public/js/ui/campfire.js`:

```js
function selectedCountTotal(selection = selected) {
  return Object.values(selection).reduce((sum, count) => sum + count, 0);
}

function requirementQuantity(recipe, id) {
  return (recipe.ingredients || []).find(ingredient => ingredient.id === id)?.quantity || 0;
}

function recipeContainsSelection(recipe, selection = selected) {
  return Object.entries(selection).every(([id, quantity]) => {
    return quantity <= requirementQuantity(recipe, id);
  });
}

function selectionCompletesRecipe(recipe, selection = selected) {
  return (recipe.ingredients || []).every(ingredient => {
    return (selection[ingredient.id] || 0) >= ingredient.quantity;
  });
}

function selectionWithAddedIngredient(id) {
  return {
    ...selected,
    [id]: (selected[id] || 0) + 1,
  };
}

function getRecipeGuidance() {
  const hints = campfireState?.cookableRecipeHints || [];
  const totalSelected = selectedCountTotal();
  const candidateRecipes = hints.filter(recipe => recipeContainsSelection(recipe));
  const hasValidPath = candidateRecipes.length > 0;
  const hasCompleteRecipe = candidateRecipes.some(recipe => selectionCompletesRecipe(recipe));
  const highlightedIngredientIds = new Set();

  if (hasValidPath) {
    Object.keys(selected).forEach(id => highlightedIngredientIds.add(id));
  }

  for (const [id, owned] of Object.entries(campfireState?.ingredients || {})) {
    if ((selected[id] || 0) >= owned) continue;
    if (totalSelected >= 5) continue;
    const nextSelection = selectionWithAddedIngredient(id);
    if (hints.some(recipe => recipeContainsSelection(recipe, nextSelection))) {
      highlightedIngredientIds.add(id);
    }
  }

  return { candidateRecipes, hasCompleteRecipe, highlightedIngredientIds };
}
```

- [ ] **Step 2: Apply ready class in `renderSlotPreview()`**

Update `renderSlotPreview()` to compute guidance and add the ready class:

```js
function renderSlotPreview() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;

  const units = selectedUnits();
  const totalSelected = units.length;
  const { hasCompleteRecipe } = getRecipeGuidance();
  const readyClass = hasCompleteRecipe ? ' campfire-focus-wrap--recipe-ready' : '';
  const slots = Array.from({ length: 5 }, (_, index) => {
    const ingredient = units[index];
    if (!ingredient) {
      return `<div class="campfire-slot campfire-slot--empty">Slot ${index + 1}</div>`;
    }
    return `
      <div class="campfire-slot">
        ${renderIngredientIcon(ingredient, 'campfire-slot-icon')}
        <div class="campfire-slot-name">${renderJpSentence([entityToToken(ingredient)], getKnownWords(), new Map())}</div>
      </div>
    `;
  }).join('');

  renderCampfireScene(`
    <div class="campfire-scene campfire-scene--cooking">
      <div class="campfire-focus-wrap${readyClass}">
        ${renderCampfireImage()}
      </div>
      <div class="campfire-slot-preview">
        <div class="campfire-slot-preview__header">
          <span>Cooking slots</span>
          <span>${totalSelected} / 5</span>
        </div>
        <div class="campfire-slot-row">${slots}</div>
      </div>
    </div>
  `);
}
```

- [ ] **Step 3: Apply ingredient `recipe-valid` classes in `renderIngredients()`**

Update the top of `renderIngredients()` to use `selectedCountTotal()` and guidance:

```js
function renderIngredients() {
  const body = document.querySelector('.campfire-body');
  const ingredientsById = ingredientById();
  const ingredients = Object.entries(campfireState?.ingredients || {});
  const totalSelected = selectedCountTotal();
  const { highlightedIngredientIds } = getRecipeGuidance();
```

Then update the button class inside the ingredient card map:

```js
const cardClasses = [
  'campfire-ingredient-card',
  selectedCount > 0 ? 'selected' : '',
  highlightedIngredientIds.has(id) ? 'recipe-valid' : '',
].filter(Boolean).join(' ');
return `
  <button class="${cardClasses}" data-id="${escapeHtml(id)}" type="button">
    ${renderIngredientIcon(ingredient)}
    <span class="campfire-ingredient-name">${renderJpSentence([entityToToken(ingredient)], getKnownWords(), new Map())}</span>
    <span class="campfire-ingredient-count">${selectedCount}/${count}</span>
  </button>
`;
```

- [ ] **Step 4: Run the UI tests to verify behavior passes**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js`

Expected: PASS for all campfire UI tests.

- [ ] **Step 5: Run a syntax check**

Run: `node --check public/js/ui/campfire.js`

Expected: `OK` output is not required, but the command must exit with code 0 and print no syntax error.

- [ ] **Step 6: Commit the frontend guidance logic**

```bash
git add public/js/ui/campfire.js tests/unit/ui/campfire.test.js
git commit -m "Add campfire recipe guidance state"
```

## Task 5: Add Glow and Fireplace Pulse Styling

**Files:**
- Modify: `public/game.css`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Add CSS animation classes**

In `public/game.css`, place these rules near the existing campfire styles after `.campfire-ingredient-card.selected`:

```css
.campfire-ingredient-card.recipe-valid {
  border-color: rgba(239, 143, 53, 0.9);
  box-shadow:
    0 0 0 2px rgba(239, 143, 53, 0.18),
    0 0 14px rgba(239, 143, 53, 0.36),
    0 8px 22px rgba(43, 52, 64, 0.08);
  animation: campfire-recipe-glow 1.25s ease-in-out infinite;
}

.campfire-focus-wrap--recipe-ready {
  animation:
    campfire-focus-in 320ms ease-out both,
    campfire-recipe-ready-pulse 1.15s ease-in-out 320ms infinite;
}

@keyframes campfire-recipe-glow {
  0%, 100% {
    box-shadow:
      0 0 0 2px rgba(239, 143, 53, 0.16),
      0 0 12px rgba(239, 143, 53, 0.3),
      0 8px 22px rgba(43, 52, 64, 0.08);
  }
  50% {
    box-shadow:
      0 0 0 4px rgba(239, 143, 53, 0.34),
      0 0 24px rgba(239, 143, 53, 0.58),
      0 8px 22px rgba(43, 52, 64, 0.08);
  }
}

@keyframes campfire-recipe-ready-pulse {
  0%, 100% {
    transform: translateX(-50%) scale(1);
  }
  50% {
    transform: translateX(-50%) scale(1.1);
  }
}
```

- [ ] **Step 2: Run UI tests after CSS change**

Run: `node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js`

Expected: PASS for all campfire UI tests.

- [ ] **Step 3: Commit the styling change**

```bash
git add public/game.css
git commit -m "Style campfire recipe guidance"
```

## Task 6: Full Verification and Manual Visual Check

**Files:**
- Verify: `src/game/services/cooking-service.js`
- Verify: `src/routes/game/cooking.js`
- Verify: `public/js/ui/campfire.js`
- Verify: `public/game.css`
- Verify: `tests/unit/game/cooking-service.test.js`
- Verify: `tests/unit/routes/cooking-routes.test.js`
- Verify: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Run focused automated tests**

Run:

```bash
node --test tests/unit/game/cooking-service.test.js
node --test tests/unit/routes/cooking-routes.test.js
node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
node --check public/js/ui/campfire.js
```

Expected: all tests pass and the syntax check exits 0.

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test:unit`

Expected: PASS for the unit suite.

- [ ] **Step 3: Ask before opening Playwright for visual verification**

Use this exact message before launching a browser:

```text
This includes visual/CSS animation changes, so I need to verify with Playwright screenshots before calling it complete. Is it okay to open the browser?
```

- [ ] **Step 4: Start the dev server after approval**

Run: `npm run dev`

Expected: Vite and Express start. Then verify with:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 5: Capture visual evidence**

Using Playwright MCP after reading `docs/playtest-guide.md`, navigate to `http://localhost:5173`, reach a campfire with ingredients, and capture screenshots showing:

- initial valid ingredient glows;
- pruned highlights after selecting one ingredient;
- fireplace ready pulse after selecting a complete real recipe.

Delete screenshot files immediately after they are shown, following the workspace cleanup rule.

- [ ] **Step 6: Commit final verification-only adjustments if needed**

If visual verification reveals a CSS timing or contrast issue, fix only the campfire guidance styles, rerun the focused UI test, and commit:

```bash
git add public/game.css tests/unit/ui/campfire.test.js
git commit -m "Polish campfire recipe guidance visuals"
```

If no code changes are needed after visual verification, do not create an empty commit.

## Self-Review Notes

- Spec coverage: Tasks cover anonymous recipe hints, path-based glow pruning, fallback exclusion, stronger recipe continuation, duplicate quantities, recipe-tab selection compatibility through existing recipe click behavior, and fireplace ready pulse.
- Placeholder scan: no deferred implementation language remains; each task includes exact paths, code snippets, and commands.
- Type consistency: the plan consistently uses `cookableRecipeHints`, `recipe-valid`, `campfire-focus-wrap--recipe-ready`, `getCookableRecipeHints()`, `recipeContainsSelection()`, and `selectionCompletesRecipe()`.
