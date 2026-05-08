# Campfire Cooking UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the campfire cooking UI so it uses a fusion-inspired scene preview, compact icon-first ingredient/recipe cards, English tab labels, and an English `Cook` button.

**Architecture:** Keep all behavior inside the existing campfire frontend module. Add small render helpers in `public/js/ui/campfire.js` for entity-name rendering, icon fallback HTML, selected slot preview, ingredient cards, and recipe cards. Add scoped CSS in `public/game.css`; do not change server routes or cooking mechanics.

**Tech Stack:** ES modules, browser DOM templates, Node test runner, existing `renderJpSentence` Japanese renderer, existing campfire unit tests.

---

## Files

- Modify: `public/js/ui/campfire.js`
- Modify: `public/game.css`
- Modify: `tests/unit/ui/campfire.test.js`
- Create: `docs/superpowers/specs/2026-05-08-campfire-cooking-ui-polish-design.md`
- Create: `docs/superpowers/plans/2026-05-08-campfire-cooking-ui-polish.md`

## Baseline

- `node --experimental-test-module-mocks --test "tests/unit/ui/campfire.test.js"` passes before changes.
- `npm test` currently fails before changes in unrelated tests:
  - `tests/unit/auth/middleware.test.js`
  - `tests/unit/routes/crystals-routes.test.js`

### Task 1: Add Failing Campfire UI Tests

**Files:**
- Modify: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Extend the fake DOM parser enough for new markup**

Update `parseElements()` so tests can inspect `img`, `ruby`, `rt`, and disabled button/class markup used by the new UI. Keep this parser minimal; it only needs to support selectors already used by these tests.

- [ ] **Step 2: Add tests for English labels and rendered ingredient cards**

Add assertions that fail on the current UI:

```js
it('renders English tabs and Cook button label', () => {
  campfire.renderForTest(sampleState());

  assert.match(actionArea.innerHTML, />Ingredients</);
  assert.match(actionArea.innerHTML, />Recipes</);
  assert.match(actionArea.innerHTML, />Cook</);
  assert.doesNotMatch(actionArea.innerHTML, />材料</);
  assert.doesNotMatch(actionArea.innerHTML, />料理する</);
});

it('renders ingredient cards with icon fallback and Japanese renderer output', () => {
  campfire.renderForTest(sampleState());

  assert.ok(actionArea.querySelector('.campfire-ingredient-card'));
  assert.ok(actionArea.querySelector('.campfire-ingredient-icon'));
  assert.match(actionArea.innerHTML, /<ruby>/);
  assert.match(actionArea.innerHTML, /<rt>/);
  assert.match(actionArea.innerHTML, /water|Water/);
});
```

- [ ] **Step 3: Add a selected slot preview test**

```js
it('renders selected ingredients in the scene slot preview', () => {
  campfire.renderForTest(sampleState());

  actionArea.querySelector('.campfire-ingredient-card').click();

  assert.ok(actionArea.querySelector('.campfire-slot-preview'));
  assert.match(actionArea.innerHTML, /Cooking slots/);
  assert.match(actionArea.innerHTML, /1 \/ 5/);
});
```

- [ ] **Step 4: Add a recipe card rendering test**

Click the `Recipes` tab and assert that the recipe list uses `.campfire-recipe-card`, icon fallback, English readiness labels, and renderer output.

- [ ] **Step 5: Run focused tests and confirm RED**

Run:

```bash
node --experimental-test-module-mocks --test "tests/unit/ui/campfire.test.js"
```

Expected: FAIL because the current UI uses Japanese tab/button labels, old class names, plain ingredient text, and no scene slot preview.

### Task 2: Implement Campfire Rendering Helpers

**Files:**
- Modify: `public/js/ui/campfire.js`

- [ ] **Step 1: Import the existing Japanese renderer**

Add:

```js
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
```

- [ ] **Step 2: Add helper functions**

Add helpers near the top of the module:

```js
function renderEntityName(entity) {
  const surface = entity?.word || entity?.name || entity?.baseWord || entity?.id || '？';
  const reading = entity?.reading || entity?.baseReading || surface;
  const meaning = entity?.meaning || entity?.nameEn || entity?.baseMeaning || surface;
  return renderJpSentence([{ surface, base: surface, reading, meaning, entity: true }], getKnownWords(), new Map());
}

function renderIngredientIcon(entity, className = 'campfire-ingredient-icon') {
  const word = escapeHtml(entity?.word || '？');
  const id = escapeHtml(entity?.id || 'unknown');
  return `<img class="${className}" src="/assets/sprites/items/${id}.webp" alt="${word}" onerror="this.outerHTML='<div class=\\'${className} text-sprite\\'>${word}</div>'">`;
}

function getIngredientById() {
  return new Map((campfireState?.ingredientCatalog || []).map(ingredient => [ingredient.id, ingredient]));
}
```

- [ ] **Step 3: Render English tabs and slot preview shell**

Change tab labels to `Ingredients` and `Recipes`. Add a scene-preview block inside `.campfire-panel` before `.campfire-body`, using five slots rendered from the current `selected` map.

- [ ] **Step 4: Replace ingredient rows with compact cards**

Render `.campfire-ingredient-card` buttons in a `.campfire-ingredient-grid`. Each card should include `renderIngredientIcon()`, `renderEntityName()`, and `selected/owned` count.

- [ ] **Step 5: Replace recipe rows with compact recipe cards**

Render `.campfire-recipe-card` buttons. Each card should include dish icon fallback, `renderEntityName(recipe)`, English badge (`Ready` when all required ingredients are owned, otherwise `Need`), and ingredient requirement pills.

- [ ] **Step 6: Keep existing click behavior**

Keep the existing selection increment/wrap behavior for ingredient cards. Keep recipe click behavior: set `selected` from recipe ingredients, switch `activeTab = 'ingredients'`, and rerender.

### Task 3: Style The Composite UI

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Replace old campfire card styling**

Update the `.campfire-*` CSS at the top of `public/game.css` to support:

- `.campfire-slot-preview`
- `.campfire-scene-panel`
- `.campfire-slot-row`
- `.campfire-slot`
- `.campfire-ingredient-grid`
- `.campfire-ingredient-card`
- `.campfire-ingredient-icon`
- `.campfire-recipe-card`
- `.campfire-recipe-pills`
- `.campfire-recipe-pill`

- [ ] **Step 2: Match the approved composite**

Use a warm translucent scene preview, five compact slots, three-column ingredient grid, icon-first cards, and strong selected state.

- [ ] **Step 3: Keep action area responsive**

Use CSS grid with `repeat(3, minmax(0, 1fr))`, with compact typography so cards fit the lower action area without crowding.

### Task 4: Verify And Polish

**Files:**
- Modify: `public/js/ui/campfire.js`
- Modify: `public/game.css`
- Modify: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --experimental-test-module-mocks --test "tests/unit/ui/campfire.test.js"
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check public/js/ui/campfire.js
```

Expected: PASS with no syntax errors.

- [ ] **Step 3: Run lints/diagnostics**

Use IDE diagnostics on modified files and fix any introduced issues.

- [ ] **Step 4: Note full-suite baseline status**

Run `npm test` if time permits. If the same two unrelated baseline failures remain, report them as pre-existing and include the focused campfire test result.

- [ ] **Step 5: Manual visual verification**

Because this is a visual change, ask before opening Playwright. Then run `npm run dev`, navigate to a campfire state, and capture a screenshot proving the composite UI is visible.
