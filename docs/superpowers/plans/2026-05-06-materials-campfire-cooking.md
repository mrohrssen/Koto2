# Materials Campfire Cooking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add run-scoped ingredient pickup rooms and one-dish deterministic campfire cooking using the approved ingredient and recipe seed data.

**Architecture:** Put cooking data and resolver logic in a focused server-side cooking service, then wire it into run state, room resolution, game routes, and a small frontend campfire renderer. Materials and campfire rooms are ordinary exploration rooms once resolved, but support-slot late binding lets campfires depend on current run ingredients.

**Tech Stack:** Node.js ES modules, Express routes, JSON data files, current Koto run state, frontend vanilla JS modules, `node:test` unit tests.

---

## File Structure

Create:

- `data/cooking/ingredients.json` - durable copy of approved ingredient seed data.
- `data/cooking/recipes.json` - durable copy of approved final recipe seed data.
- `src/game/services/cooking-service.js` - pure cooking data validation, ingredient drops, inventory helpers, recipe resolver, cooked item conversion, and apply helper.
- `src/routes/game/cooking.js` - materials and campfire endpoints.
- `public/js/ui/campfire.js` - campfire ingredients/recipes tabs and feed flow.
- `tests/unit/game/cooking-service.test.js` - resolver, inventory, drop, and apply tests.
- `tests/unit/game/cooking-data.test.js` - data contract tests for ingredients and recipes.
- `tests/unit/routes/cooking-routes.test.js` - endpoint idempotency and state changes.
- `tests/unit/ui/campfire.test.js` - UI rendering and API-call behavior.

Modify:

- `src/game/state.js` - add run-scoped cooking inventory and meta-scoped discovered recipe ids.
- `src/game/rooms.js` - add `materials`, `campfire`, and `support` room types; support-slot late binding helpers; room actions and narration.
- `src/game/services/item-service.js` - add `dexMult` to item buff shape and stat application.
- `src/game/services/exploration-service.js` - resolve support slots before entering a room and expose actions for new room types.
- `src/routes/game/index.js` - mount `src/routes/game/cooking.js`.
- `public/js/api.js` - add cooking API helpers.
- `public/js/ui/exploration.js` - register callbacks and route `materials` / `campfire` rendering.
- `public/js/game.js` or bootstrap module that initializes exploration callbacks - pass cooking API helpers to exploration UI.
- `public/game.css` - campfire tab and result styles.

Do not modify:

- `data/dictionary.json`.
- `data/dialogue/frames.json` by hand.
- Permanent inventory systems outside the cooking fields listed in this plan.

Before execution, create or use an isolated worktree. Do not commit unless the user explicitly asks for commits.

---

### Task 1: Move Seed Data And Add Data Validation

**Files:**
- Create: `data/cooking/ingredients.json`
- Create: `data/cooking/recipes.json`
- Create: `tests/unit/game/cooking-data.test.js`

- [ ] **Step 1: Copy approved seed data**

Copy:

```bash
mkdir -p data/cooking
cp output/koto-base-ingredients.json data/cooking/ingredients.json
cp output/koto-cooking-recipes-final.json data/cooking/recipes.json
```

Expected: both files exist and are valid JSON.

- [ ] **Step 2: Write data contract tests**

Create `tests/unit/game/cooking-data.test.js`:

```js
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
```

- [ ] **Step 3: Run the data tests and verify they pass**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-data.test.js
```

Expected: all cooking data tests pass.

---

### Task 2: Build The Cooking Service

**Files:**
- Create: `src/game/services/cooking-service.js`
- Test: `tests/unit/game/cooking-service.test.js`

- [ ] **Step 1: Write resolver and inventory tests**

Create `tests/unit/game/cooking-service.test.js`:

```js
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
  it('rolls between 3 and 5 ingredient units', () => {
    for (let i = 0; i < 50; i++) {
      const drops = rollMaterialDrops();
      const total = drops.reduce((sum, drop) => sum + drop.quantity, 0);
      assert.ok(total >= 3 && total <= 5, `expected 3-5 drops, got ${total}`);
      assert.ok(drops.every(drop => drop.id && drop.quantity > 0));
    }
  });
});
```

- [ ] **Step 2: Run the service tests and verify they fail for missing module**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-service.test.js
```

Expected: fail with module not found for `cooking-service.js`.

- [ ] **Step 3: Implement the cooking service**

Create `src/game/services/cooking-service.js`:

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { applyItem } from './item-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const COOKING_INGREDIENTS = JSON.parse(
  readFileSync(join(__dirname, '../../../data/cooking/ingredients.json'), 'utf8')
);

export const COOKING_RECIPES = JSON.parse(
  readFileSync(join(__dirname, '../../../data/cooking/recipes.json'), 'utf8')
);

export const RARITY_RANK = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

const DROP_RARITY_WEIGHTS = [
  ['common', 680],
  ['uncommon', 220],
  ['rare', 80],
  ['epic', 18],
  ['legendary', 2],
];

const DROP_COUNT_WEIGHTS = [
  [3, 50],
  [4, 35],
  [5, 15],
];

const INGREDIENT_BY_ID = new Map(COOKING_INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));

function weightedPick(weightedEntries, rng = Math.random) {
  const total = weightedEntries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of weightedEntries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return weightedEntries[weightedEntries.length - 1][0];
}

function recipeTotalQuantity(recipe) {
  return recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.quantity, 0);
}

function normalizeSelection(selection) {
  const counts = {};
  for (const item of selection || []) {
    if (!INGREDIENT_BY_ID.has(item.id)) throw new Error(`Unknown ingredient: ${item.id}`);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error(`Invalid ingredient quantity: ${item.id}`);
    counts[item.id] = (counts[item.id] || 0) + item.quantity;
  }
  return Object.entries(counts).map(([id, quantity]) => ({ id, quantity }));
}

export function getIngredientCount(bag = {}) {
  return Object.values(bag).reduce((sum, count) => sum + (Number(count) || 0), 0);
}

export function addIngredientsToBag(bag, drops) {
  for (const drop of drops) {
    if (!INGREDIENT_BY_ID.has(drop.id)) throw new Error(`Unknown ingredient: ${drop.id}`);
    bag[drop.id] = (bag[drop.id] || 0) + drop.quantity;
  }
  return bag;
}

export function hasIngredients(bag = {}, requirements = []) {
  return requirements.every(requirement => (bag[requirement.id] || 0) >= requirement.quantity);
}

export function consumeIngredientsFromBag(bag, requirements) {
  if (!hasIngredients(bag, requirements)) throw new Error('Not enough ingredients');
  for (const requirement of requirements) {
    bag[requirement.id] -= requirement.quantity;
    if (bag[requirement.id] <= 0) delete bag[requirement.id];
  }
  return bag;
}

export function rollMaterialDrops({ rng = Math.random } = {}) {
  const totalDrops = weightedPick(DROP_COUNT_WEIGHTS, rng);
  const counts = {};
  for (let i = 0; i < totalDrops; i++) {
    const rarity = weightedPick(DROP_RARITY_WEIGHTS, rng);
    const pool = COOKING_INGREDIENTS.filter(ingredient => ingredient.rarity === rarity);
    const pick = pool[Math.floor(rng() * pool.length)] || COOKING_INGREDIENTS[0];
    counts[pick.id] = (counts[pick.id] || 0) + 1;
  }
  return Object.entries(counts).map(([id, quantity]) => ({ id, quantity }));
}

export function resolveCookingSelection(selection) {
  const normalized = normalizeSelection(selection);
  const totalSelected = normalized.reduce((sum, item) => sum + item.quantity, 0);
  if (totalSelected < 1 || totalSelected > 5) throw new Error('Select 1 to 5 ingredients');
  const selectedBag = Object.fromEntries(normalized.map(item => [item.id, item.quantity]));

  const matches = COOKING_RECIPES
    .filter(recipe => hasIngredients(selectedBag, recipe.ingredients))
    .sort((a, b) => {
      const sizeDelta = recipeTotalQuantity(b) - recipeTotalQuantity(a);
      if (sizeDelta !== 0) return sizeDelta;
      const rarityDelta = (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0);
      if (rarityDelta !== 0) return rarityDelta;
      return a.id.localeCompare(b.id);
    });

  if (matches.length > 0) {
    return { kind: 'recipe', recipe: matches[0], dish: matches[0], consumed: matches[0].ingredients };
  }

  const fallbackIngredient = normalized
    .map(item => INGREDIENT_BY_ID.get(item.id))
    .sort((a, b) => {
      const rarityDelta = (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0);
      if (rarityDelta !== 0) return rarityDelta;
      return a.id.localeCompare(b.id);
    })[0];

  const dish = createFallbackDish(fallbackIngredient);
  return { kind: 'fallback', recipe: null, dish, consumed: [{ id: fallbackIngredient.id, quantity: 1 }] };
}

export function createFallbackDish(ingredient) {
  const effectType = ingredient.primaryEffect;
  const effect = fallbackEffect(effectType);
  return {
    id: `cooked-${ingredient.id}`,
    word: ingredient.word,
    reading: ingredient.reading,
    nameEn: `Cooked ${ingredient.nameEn}`,
    meaning: `cooked ${ingredient.meaning}`,
    rarity: ingredient.rarity,
    ingredients: [{ id: ingredient.id, quantity: 1 }],
    effects: [effect],
    effectDescription: describeEffect(effect),
    rationale: `A simple cooked ${ingredient.nameEn} uses the ingredient's ${effectType} lane.`,
  };
}

function fallbackEffect(type) {
  switch (type) {
    case 'hpRestore':
      return { type, value: 0.12, target: 'fedCreature' };
    case 'partyHpRestore':
      return { type: 'hpRestore', value: 0.10, target: 'fedCreature' };
    case 'mpRestore':
      return { type, value: 0.15, target: 'fedCreature' };
    case 'revive':
      return { type: 'hpRestore', value: 0.20, target: 'fedCreature' };
    case 'attackMult':
    case 'hpMult':
    case 'dexMult':
      return { type, value: 0.05, target: 'fedCreature' };
    case 'xpMult':
      return { type, value: 0.05, target: 'fedCreature' };
    case 'xpGrant':
      return { type: 'xpMult', value: 0.05, target: 'fedCreature' };
    case 'elementEdge':
      return { type, value: 0.05, target: 'fedCreature' };
    default:
      return { type: 'hpRestore', value: 0.10, target: 'fedCreature' };
  }
}

function describeEffect(effect) {
  const pct = Math.round(effect.value * 100);
  switch (effect.type) {
    case 'hpRestore':
      return `Restores ${pct}% HP.`;
    case 'partyHpRestore':
      return `Restores ${pct}% party HP.`;
    case 'mpRestore':
      return `Restores ${pct}% MP.`;
    case 'revive':
      return `Revives at ${pct}% HP.`;
    case 'attackMult':
      return `Boosts attack by ${pct}%.`;
    case 'hpMult':
      return `Boosts max HP by ${pct}%.`;
    case 'xpMult':
      return `Boosts XP by ${pct}%.`;
    case 'xpGrant':
      return `Grants ${effect.value} battle XP equivalent.`;
    case 'elementEdge':
      return `Boosts elemental edge by ${pct}%.`;
    case 'dexMult':
      return `Boosts dex by ${pct}%.`;
    default:
      return 'Applies a cooking effect.';
  }
}

export function createCookedDishItem(dish) {
  const effect = dish.effects[0];
  const base = {
    id: dish.id,
    word: dish.word,
    reading: dish.reading,
    nameEn: dish.nameEn,
    meaning: dish.meaning,
    category: 'food',
    rarity: dish.rarity,
    description: dish.effectDescription,
  };

  if (effect.type === 'hpRestore') return { ...base, type: 'heal', effect: { healPercent: effect.value } };
  if (effect.type === 'partyHpRestore') return { ...base, type: 'heal', effect: { healAllPercent: effect.value } };
  if (effect.type === 'mpRestore') return { ...base, type: 'mpRestore', effect: { mpRestorePercent: effect.value } };
  if (effect.type === 'revive') return { ...base, type: 'revive', effect: { revivePercent: effect.value } };
  if (effect.type === 'xpMult') return { ...base, type: 'xpCharm', effect: { value: effect.value } };
  if (effect.type === 'xpGrant') return { ...base, type: 'xpGrant', effect: { xpGrant: 'killEquivalent', value: effect.value } };
  return { ...base, type: 'boost', effect: { field: effect.type, value: effect.value } };
}

export function applyCookedDish(dish, creatureParty, targetIndex, context = {}) {
  const item = createCookedDishItem(dish);
  return applyItem(item, creatureParty, null, targetIndex, context);
}
```

- [ ] **Step 4: Run service tests and fix import/data mistakes**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-service.test.js tests/unit/game/cooking-data.test.js
```

Expected: both test files pass.

---

### Task 3: Extend State And Item Buff Shape

**Files:**
- Modify: `src/game/state.js`
- Modify: `src/game/services/item-service.js`
- Test: `tests/unit/item/service.test.js`
- Test: `tests/unit/game/cooking-service.test.js`

- [ ] **Step 1: Add tests for cooking state and dex item buffs**

Append to `tests/unit/game/cooking-service.test.js`:

```js
import { createMetaProgression, createNewPlayer, createNewRun } from '../../../src/game/state.js';

describe('cooking state defaults', () => {
  it('creates run-scoped ingredient inventory and meta recipe discovery', () => {
    const run = createNewRun(createNewPlayer());
    const meta = createMetaProgression();

    assert.deepStrictEqual(run.cooking.ingredients, {});
    assert.deepStrictEqual(run.cooking.cookedThisRun, []);
    assert.deepStrictEqual(meta.cookingRecipesDiscovered, []);
  });
});
```

Append to `tests/unit/item/service.test.js`:

```js
describe('Item Buffs - Dex', () => {
  it('createItemBuffs includes dexMult and boost applies it to the target creature', () => {
    const creature = mockCreature();
    const party = { active: [creature], reserves: [] };

    applyItem({ type: 'boost', effect: { field: 'dexMult', value: 0.10 } }, party, null, 0);

    assert.strictEqual(creature.itemBuffs.dexMult, 1.10);
  });
});
```

- [ ] **Step 2: Run focused tests and verify failures**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-service.test.js tests/unit/item/service.test.js
```

Expected: fail because `run.cooking`, `meta.cookingRecipesDiscovered`, and `dexMult` are missing.

- [ ] **Step 3: Add cooking state**

Modify `src/game/state.js`:

```js
// In createMetaProgression(), near itemsDiscovered:
cookingRecipesDiscovered: [],
```

```js
// In createNewRun(), near itemBuffs or run history:
cooking: {
  ingredients: {},
  cookedThisRun: []
},
```

- [ ] **Step 4: Add dexMult to item buffs**

Modify `src/game/services/item-service.js`:

```js
export function createItemBuffs() {
  return {
    attackMult: 1.0,
    hpMult: 1.0,
    dexMult: 1.0,
    elementEdge: 0,
    flatDamageReduction: 0,
    xpMultiplier: 1.0,
    xpBalanceStacks: 0,
    baseAttackBonus: 0,
    baseHpBonus: 0,
    baseMpBonus: 0
  };
}

const MULT_FIELDS = new Set(['attackMult', 'hpMult', 'dexMult', 'xpMultiplier']);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-service.test.js tests/unit/item/service.test.js
```

Expected: pass.

---

### Task 4: Add Room Types And Late-Bound Support Resolution

**Files:**
- Modify: `src/game/rooms.js`
- Modify: `src/game/services/exploration-service.js`
- Test: `tests/unit/game/cooking-rooms.test.js`

- [ ] **Step 1: Write room resolution tests**

Create `tests/unit/game/cooking-rooms.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createRoom,
  getRoomActions,
  resolveSupportRoomType,
  ROOM_TYPES,
} from '../../../src/game/rooms.js';

describe('cooking room types', () => {
  it('creates materials and campfire room state', () => {
    const materials = createRoom(ROOM_TYPES.materials, 'test-area', 1, 3);
    const campfire = createRoom(ROOM_TYPES.campfire, 'test-area', 2, 3);

    assert.deepStrictEqual(materials.materials, { drops: null, claimed: false, completed: false });
    assert.deepStrictEqual(campfire.campfire, { cookedDish: null, consumed: null, fed: false, completed: false });
  });

  it('shows room actions for unfinished materials and campfire rooms', () => {
    const materials = createRoom(ROOM_TYPES.materials, 'test-area', 1, 3);
    const campfire = createRoom(ROOM_TYPES.campfire, 'test-area', 2, 3);

    assert.ok(getRoomActions(materials).some(action => action.id === 'materials_claim'));
    assert.ok(getRoomActions(campfire).some(action => action.id === 'campfire_cook'));
  });

  it('resolves support room to campfire only when ingredients exist', () => {
    assert.strictEqual(resolveSupportRoomType({ cooking: { ingredients: {} } }, () => 0), ROOM_TYPES.materials);
    assert.strictEqual(resolveSupportRoomType({ cooking: { ingredients: { ebi: 1 } } }, () => 0), ROOM_TYPES.campfire);
  });
});
```

- [ ] **Step 2: Run room tests and verify failure**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-rooms.test.js
```

Expected: fail because room types and resolver are missing.

- [ ] **Step 3: Add room constants and creation state**

Modify `src/game/rooms.js`:

```js
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  wordDiscovery: 'wordDiscovery',
  dealer: 'dealer',
  skillMaster: 'skillMaster',
  whackAMole: 'whackAMole',
  speedReviewRoom: 'speedReviewRoom',
  boss: 'boss',
  npcBattle: 'npcBattle',
  friendlyNpc: 'friendlyNpc',
  support: 'support',
  materials: 'materials',
  campfire: 'campfire'
};
```

Add cases in `createRoom()`:

```js
case ROOM_TYPES.support:
  room.support = { resolvedType: null };
  break;
case ROOM_TYPES.materials:
  room.materials = { drops: null, claimed: false, completed: false };
  break;
case ROOM_TYPES.campfire:
  room.campfire = { cookedDish: null, consumed: null, fed: false, completed: false };
  break;
```

- [ ] **Step 4: Add support room resolver**

Add to `src/game/rooms.js`:

```js
function hasUnusedIngredients(run) {
  const ingredients = run?.cooking?.ingredients || {};
  return Object.values(ingredients).some(count => count > 0);
}

export function resolveSupportRoomType(run, rng = Math.random) {
  const roll = rng();
  if (hasUnusedIngredients(run) && roll < 0.25) return ROOM_TYPES.campfire;
  if (roll < (hasUnusedIngredients(run) ? 0.35 : 0.10)) return ROOM_TYPES.materials;
  if (roll < 0.45) return ROOM_TYPES.whackAMole;
  if (roll < 0.50) return ROOM_TYPES.shrine;
  return ROOM_TYPES.friendlyNpc;
}

export function resolveSupportRoom(room, run, rng = Math.random) {
  if (!room || room.type !== ROOM_TYPES.support) return room;
  const resolvedType = room.support?.resolvedType || resolveSupportRoomType(run, rng);
  const resolved = createRoom(resolvedType, room.areaId, room.roomNumber, room.totalRooms);
  resolved.id = room.id;
  resolved.explored = room.explored;
  resolved.interacted = room.interacted;
  resolved.subArea = room.subArea;
  resolved.supportResolved = true;
  room.support = { resolvedType };
  Object.assign(room, resolved);
  return room;
}
```

- [ ] **Step 5: Generate support slots for non-scripted support opportunities**

Modify the non-scripted branch in `generateAreaRooms()` so it uses support slots:

```js
const roll = Math.random();
if (roll < 0.45) {
  type = ROOM_TYPES.encounter;
} else {
  type = ROOM_TYPES.support;
}
```

Keep boss and NPC battle slots unchanged.

- [ ] **Step 6: Add actions and narration**

Modify `getRoomActions()` unfinished checks to include materials and campfire:

```js
const isUnfinishedMaterials = room.type === ROOM_TYPES.materials && room.materials?.completed !== true;
const isUnfinishedCampfire = room.type === ROOM_TYPES.campfire && room.campfire?.completed !== true;
```

Include these in the "no unfinished room" condition. Add switch cases:

```js
case ROOM_TYPES.materials:
  if (isUnfinishedMaterials) {
    actions.push({ id: 'materials_claim', name: '集める', description: '材料を集める' });
  }
  break;
case ROOM_TYPES.campfire:
  if (isUnfinishedCampfire) {
    actions.push({ id: 'campfire_cook', name: '料理する', description: '焚き火で料理する' });
  }
  break;
```

Add narration cases:

```js
case ROOM_TYPES.materials:
  return `${locationLabel}に入った。材料が見つかりそうだ。`;
case ROOM_TYPES.campfire:
  return `${locationLabel}に入った。焚き火がある。料理ができそうだ。`;
case ROOM_TYPES.support:
  return `${locationLabel}に入った。`;
```

- [ ] **Step 7: Resolve support slots on room entry**

In `src/game/services/exploration-service.js`, update the room import at the top:

```js
import {
  // keep existing imports
  resolveSupportRoom,
} from '../rooms.js';
```

In `proceedToNextRoom()`, immediately after the current code re-reads the room after queued/forced replacement:

```js
let room = this.gm.run.rooms[this.gm.run.currentRoom];
resolveSupportRoom(room, this.gm.run);
room = this.gm.run.rooms[this.gm.run.currentRoom];
```

This goes before `room.explored = true;`. The support resolver mutates the support slot into a concrete room and preserves the same room id, room number, total rooms, and sub-area.

- [ ] **Step 8: Run focused room tests**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-rooms.test.js
```

Expected: pass.

---

### Task 5: Add Materials And Campfire Routes

**Files:**
- Create: `src/routes/game/cooking.js`
- Modify: game route registration file for `/api/game`
- Test: `tests/unit/routes/cooking-routes.test.js`

- [ ] **Step 1: Write route tests**

Create `tests/unit/routes/cooking-routes.test.js` with route-level tests following nearby game route test patterns. Use a fake request with `gameManager`, `saveGame`, and `getEnrichedGameState` if the existing route tests do this. Cover:

```js
// Test names to implement:
'materials claim rejects non-materials room'
'materials claim rolls once and is idempotent'
'campfire state rejects non-campfire room'
'campfire cook consumes ingredients and stores cooked dish'
'campfire feed applies dish once and completes room'
'campfire feed discovers authored recipe in meta'
```

For fake state, use:

```js
const room = {
  type: 'materials',
  materials: { drops: null, claimed: false, completed: false },
  interacted: false
};
```

and:

```js
const run = {
  cooking: { ingredients: {}, cookedThisRun: [] },
  creatureParty: { active: [mockCreature()], reserves: [] }
};
const meta = { cookingRecipesDiscovered: [] };
```

- [ ] **Step 2: Implement `src/routes/game/cooking.js`**

Create route module:

```js
import express from 'express';
import {
  addIngredientsToBag,
  applyCookedDish,
  consumeIngredientsFromBag,
  getIngredientCount,
  hasIngredients,
  resolveCookingSelection,
  rollMaterialDrops,
  COOKING_INGREDIENTS,
  COOKING_RECIPES,
} from '../../game/services/cooking-service.js';
import { entityToToken } from '../../game/token-format.js';

export default function createCookingRoutes() {
  const router = express.Router();

  router.post('/materials/claim', (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'materials') return res.status(400).json({ error: 'Not in a materials room' });
      if (!room.materials) room.materials = { drops: null, claimed: false, completed: false };

      if (!room.materials.claimed) {
        room.materials.drops = rollMaterialDrops();
        addIngredientsToBag(gm.run.cooking.ingredients, room.materials.drops);
        room.materials.claimed = true;
        room.materials.completed = true;
        room.interacted = true;
        gm.run.runSummary.itemsCollected += room.materials.drops.reduce((sum, drop) => sum + drop.quantity, 0);
        req.saveGame();
      }

      res.json({
        drops: decorateDrops(room.materials.drops),
        receipt: buildReceipt(room.materials.drops),
        state: req.getEnrichedGameState(),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/campfire', (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'campfire') return res.status(400).json({ error: 'Not in a campfire room' });
      res.json(buildCampfireState(req));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/campfire/cook', (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'campfire') return res.status(400).json({ error: 'Not in a campfire room' });
      if (!room.campfire) room.campfire = { cookedDish: null, consumed: null, fed: false, completed: false };
      if (room.campfire.cookedDish) return res.json(buildCampfireState(req));

      const selection = req.body?.ingredients || [];
      if (!hasIngredients(gm.run.cooking.ingredients, selection)) throw new Error('Not enough ingredients');
      const result = resolveCookingSelection(selection);
      consumeIngredientsFromBag(gm.run.cooking.ingredients, result.consumed);
      room.campfire.cookedDish = result.dish;
      room.campfire.consumed = result.consumed;
      room.campfire.resultKind = result.kind;
      req.saveGame();

      res.json(buildCampfireState(req));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/campfire/feed', (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'campfire') return res.status(400).json({ error: 'Not in a campfire room' });
      if (!room.campfire?.cookedDish) throw new Error('No cooked dish to feed');
      if (room.campfire.fed) return res.json({ state: req.getEnrichedGameState(), dish: room.campfire.cookedDish });

      const targetIndex = Number(req.body?.targetCreatureIndex);
      if (!Number.isInteger(targetIndex)) throw new Error('Target creature required');
      const applyResult = applyCookedDish(room.campfire.cookedDish, gm.run.creatureParty, targetIndex, {
        enemyLevel: getHighestPartyLevel(gm.run.creatureParty),
      });
      if (!applyResult.applied) throw new Error('Dish could not be applied');

      if (room.campfire.resultKind === 'recipe') {
        const discovered = req.gameManager.meta.cookingRecipesDiscovered ||= [];
        if (!discovered.includes(room.campfire.cookedDish.id)) discovered.push(room.campfire.cookedDish.id);
      }
      gm.run.cooking.cookedThisRun.push({ id: room.campfire.cookedDish.id, targetCreatureIndex: targetIndex });
      room.campfire.fed = true;
      room.campfire.completed = true;
      room.interacted = true;
      req.saveGame();

      res.json({ state: req.getEnrichedGameState(), dish: room.campfire.cookedDish, applyResult });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

function decorateDrops(drops) {
  const byId = new Map(COOKING_INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));
  return drops.map(drop => {
    const ingredient = byId.get(drop.id);
    return { ...drop, ingredient, nameToken: entityToToken(ingredient) };
  });
}

function buildReceipt(drops) {
  return {
    tokens: decorateDrops(drops).flatMap(({ ingredient, quantity }) => [
      entityToToken(ingredient),
      { surface: `を${quantity}つ`, reading: `を${quantity}つ`, meaning: `${quantity}` },
    ]),
    words: [],
  };
}

function buildCampfireState(req) {
  const gm = req.gameManager;
  const discoveredIds = new Set(gm.meta?.cookingRecipesDiscovered || []);
  return {
    ingredients: gm.run.cooking.ingredients,
    ingredientCatalog: COOKING_INGREDIENTS,
    ingredientCount: getIngredientCount(gm.run.cooking.ingredients),
    discoveredRecipes: COOKING_RECIPES.filter(recipe => discoveredIds.has(recipe.id)),
    room: gm.getCurrentRoom()?.campfire || null,
    state: req.getEnrichedGameState(),
  };
}

function getHighestPartyLevel(party) {
  const all = [...(party?.active || []), ...(party?.reserves || [])].filter(Boolean);
  return all.reduce((max, creature) => Math.max(max, creature.level || 1), 1);
}
```

- [ ] **Step 3: Mount the cooking router**

In `src/routes/game/index.js`, add the import near the other game route modules:

```js
import createCookingRoutes from './cooking.js';
```

Mount it after run routes and before combat routes:

```js
router.use(createCookingRoutes());
```

- [ ] **Step 4: Run route tests**

Run:

```bash
npm run test:unit -- tests/unit/routes/cooking-routes.test.js
```

Expected: pass.

---

### Task 6: Add Frontend API Helpers And Exploration Routing

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/game.js`
- Modify: `public/js/ui/exploration.js`
- Create: `public/js/ui/campfire.js`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Add API helpers**

In `public/js/api.js`, add:

```js
async function claimMaterials() {
  return apiCall('/materials/claim', 'POST');
}

async function getCampfire() {
  return apiCall('/campfire', 'GET');
}

async function cookAtCampfire(ingredients) {
  return apiCall('/campfire/cook', 'POST', { ingredients });
}

async function feedCampfireDish(targetCreatureIndex) {
  return apiCall('/campfire/feed', 'POST', { targetCreatureIndex });
}
```

Add these functions to the default export object near the other room exploration endpoints:

```js
claimMaterials,
getCampfire,
cookAtCampfire,
feedCampfireDish,
```

- [ ] **Step 2: Create campfire UI tests**

Create `tests/unit/ui/campfire.test.js` using the existing JSDOM style from nearby UI tests. Test these names:

```js
'renders ingredient and recipe tabs'
'enables cook only after selecting 1 to 5 ingredients'
'shows cooked dish effects before target selection'
'calls feed callback with selected target index'
```

- [ ] **Step 3: Implement `public/js/ui/campfire.js`**

Create a focused UI module:

```js
import { renderChoices } from './ui-components.js';
import { escapeHtml } from './html-utils.js';

let callbacks = {};
let campfireState = null;
let selected = {};
let activeTab = 'ingredients';

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  campfireState = await callbacks.apiGetCampfire();
  selected = {};
  activeTab = 'ingredients';
  render();
}

function render() {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;
  const cookedDish = campfireState?.room?.cookedDish;
  actionArea.innerHTML = `
    <div class="campfire-panel">
      <div class="campfire-tabs">
        <button class="campfire-tab ${activeTab === 'ingredients' ? 'active' : ''}" data-tab="ingredients">材料</button>
        <button class="campfire-tab ${activeTab === 'recipes' ? 'active' : ''}" data-tab="recipes">レシピ</button>
      </div>
      <div class="campfire-body"></div>
    </div>
  `;

  actionArea.querySelectorAll('.campfire-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      render();
    });
  });

  if (cookedDish) renderCookedDish(cookedDish);
  else if (activeTab === 'recipes') renderRecipes();
  else renderIngredients();
}

function renderIngredients() {
  const body = document.querySelector('.campfire-body');
  const ingredientById = new Map((campfireState?.ingredientCatalog || []).map(ingredient => [ingredient.id, ingredient]));
  const ingredients = Object.entries(campfireState?.ingredients || {});
  const totalSelected = Object.values(selected).reduce((sum, count) => sum + count, 0);
  body.innerHTML = `
    <div class="campfire-grid">
      ${ingredients.map(([id, count]) => {
        const ingredient = ingredientById.get(id) || { word: id, nameEn: id };
        return `
        <button class="campfire-ingredient" data-id="${escapeHtml(id)}">
          <span>${escapeHtml(ingredient.word)}</span>
          <span>${escapeHtml(ingredient.nameEn)}</span>
          <span>${selected[id] || 0}/${count}</span>
        </button>
      `;
      }).join('')}
    </div>
    <button class="ui-btn ui-btn--primary campfire-cook-btn" ${totalSelected < 1 || totalSelected > 5 ? 'disabled' : ''}>料理する</button>
  `;

  body.querySelectorAll('.campfire-ingredient').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const owned = campfireState.ingredients[id] || 0;
      const current = selected[id] || 0;
      if (totalSelected >= 5 && current === 0) return;
      selected[id] = current >= owned ? 0 : current + 1;
      if (selected[id] === 0) delete selected[id];
      render();
    });
  });

  body.querySelector('.campfire-cook-btn')?.addEventListener('click', cookSelected);
}

function renderRecipes() {
  const recipes = campfireState?.discoveredRecipes || [];
  const body = document.querySelector('.campfire-body');
  body.innerHTML = recipes.length === 0
    ? '<div class="campfire-empty">まだレシピを見つけていない。</div>'
    : '<div class="campfire-recipes"></div>';
  if (recipes.length === 0) return;

  renderChoices({
    heading: 'レシピ',
    cards: recipes.map(recipe => ({
      title: escapeHtml(recipe.word),
      subtitle: escapeHtml(recipe.effectDescription || recipe.nameEn),
      badge: { text: recipe.rarity, color: '#ef8f35' },
    })),
    disableAfterSelect: false,
    onSelect(index) {
      selected = Object.fromEntries(recipes[index].ingredients.map(ingredient => [ingredient.id, ingredient.quantity]));
      activeTab = 'ingredients';
      render();
    }
  });
}

async function cookSelected() {
  const ingredients = Object.entries(selected).map(([id, quantity]) => ({ id, quantity }));
  campfireState = await callbacks.apiCookAtCampfire(ingredients);
  render();
}

function renderCookedDish(dish) {
  const body = document.querySelector('.campfire-body');
  const state = callbacks.getGameState();
  const party = state?.run?.creatureParty?.active || [];
  body.innerHTML = `
    <div class="campfire-result">
      <h3>${escapeHtml(dish.word)}</h3>
      <p>${escapeHtml(dish.effectDescription || dish.nameEn)}</p>
      <div class="campfire-targets"></div>
    </div>
  `;

  renderChoices({
    heading: 'だれに食べさせる？',
    cards: party.map(creature => ({
      title: escapeHtml(creature.name || creature.nameEn || creature.id),
      subtitle: `HP ${creature.hp}/${creature.maxHp} MP ${creature.mp || 0}/${creature.maxMp || 0}`,
    })),
    disableAfterSelect: true,
    onSelect: async (index) => {
      const result = await callbacks.apiFeedCampfireDish(index);
      callbacks.updateGameState?.(result.state);
      callbacks.updateUI?.();
    }
  });
}
```

- [ ] **Step 4: Wire exploration renderer**

In `public/js/ui/exploration.js`:

```js
import * as campfireUI from './campfire.js';
```

Add callback variables and init assignment for:

```js
let apiClaimMaterials = null;
let apiGetCampfire = null;
let apiCookAtCampfire = null;
let apiFeedCampfireDish = null;
```

In `init(callbacks)` assign them and call:

```js
campfireUI.init({
  apiGetCampfire,
  apiCookAtCampfire,
  apiFeedCampfireDish,
  getGameState,
  updateGameState,
  updateUI,
});
```

Where room types are rendered, add:

```js
if (room.type === 'materials') return renderMaterials(room);
if (room.type === 'campfire') return campfireUI.show();
```

Add:

```js
async function renderMaterials() {
  const result = await apiClaimMaterials();
  updateGameState?.(result.state);
  if (result.receipt?.tokens?.length) {
    await showNpcDialogueCard({
      speaker: 'SYSTEM',
      tokens: result.receipt.tokens,
      words: result.receipt.words || [],
      useKanji: true,
    });
  }
  updateUI?.();
}
```

- [ ] **Step 5: Pass callbacks from the game bootstrap**

In `public/js/game.js`, where `exploration.init` receives API callbacks from the default API object, pass:

```js
apiClaimMaterials: api.claimMaterials,
apiGetCampfire: api.getCampfire,
apiCookAtCampfire: api.cookAtCampfire,
apiFeedCampfireDish: api.feedCampfireDish,
```

- [ ] **Step 6: Run frontend syntax checks**

Run:

```bash
node --check public/js/api.js
node --check public/js/ui/campfire.js
node --check public/js/ui/exploration.js
node --check public/js/game.js
```

Expected: all print no syntax errors.

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/campfire.test.js
```

Expected: pass.

---

### Task 7: Full Focused Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all cooking-focused tests**

Run:

```bash
npm run test:unit -- tests/unit/game/cooking-data.test.js tests/unit/game/cooking-service.test.js tests/unit/game/cooking-rooms.test.js tests/unit/routes/cooking-routes.test.js tests/unit/ui/campfire.test.js
```

Expected: pass.

- [ ] **Step 2: Run nearby regression tests**

Run:

```bash
npm run test:unit -- tests/unit/item/service.test.js tests/unit/game/whack-a-mole.test.js tests/unit/game/speed-review-room.test.js tests/unit/scenes/exploration-scene.test.js tests/unit/ui/exploration-friendly-npc.test.js
```

Expected: pass.

- [ ] **Step 3: Run broader unit suite**

Run:

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 4: Check lints in edited files**

Use the IDE diagnostics or `ReadLints` for:

```text
src/game/services/cooking-service.js
src/game/rooms.js
src/game/state.js
src/routes/game/cooking.js
public/js/ui/campfire.js
public/js/ui/exploration.js
public/js/api.js
public/js/game.js
```

Expected: no new linter errors.

---

### Task 8: Manual Browser Verification

**Files:**
- Verify only.

- [ ] **Step 1: Ask before opening Playwright**

Before launching a browser, ask the user for permission because project rules require it.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev
```

Then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 3: Force or queue a materials room**

Use the existing force-room path already supported by `jrpg_forceRoomType` and `/api/game/proceed`:

```js
localStorage.setItem('jrpg_forceRoomType', 'materials');
```

Then proceed to the next room. Clear it after verification:

```js
localStorage.removeItem('jrpg_forceRoomType');
```

Expected visual result:

- Exploration scene remains active.
- Materials receipt appears in Japanese.
- Ingredient names are Japanese entity names.
- No player-facing English receipt text appears.

- [ ] **Step 4: Force or reach a campfire room**

Expected visual result:

- Campfire UI appears.
- Ingredients tab shows run ingredient counts.
- Recipes tab hides undiscovered recipes.
- Selecting 1-5 ingredients enables cooking.
- Cooking shows dish name and effect summary before feeding.
- Feeding applies to the selected creature and completes the room.

- [ ] **Step 5: Screenshot evidence**

Capture screenshots for:

- Materials room receipt.
- Campfire ingredient selection.
- Cooked dish result and target selection.

Delete screenshot files after they have been shown, per project cleanup rules.

---

## Plan Self-Review

Spec coverage:

- Source data copied into durable data files: Task 1.
- Ingredient and recipe validation: Task 1.
- Run-scoped ingredient inventory and meta recipe discovery: Task 3.
- Existing item model integration: Tasks 2 and 3.
- Materials room generation, drops, idempotent claim, and Japanese receipt: Tasks 4, 5, and 6.
- Campfire one-dish flow, deterministic resolver, recipe discovery, and feeding: Tasks 2, 5, and 6.
- Late-bound support-slot generation: Task 4.
- Tests and manual verification: Tasks 7 and 8.

Function names introduced in early tasks are reused consistently in later tasks.
