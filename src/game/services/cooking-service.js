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

const ROOM_DROP_COUNT_WEIGHTS = [
  [1, 25],
  [2, 25],
  [3, 25],
  [4, 25],
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

export function consumeIngredientsFromBag(bag, requirements) {
  if (!hasIngredients(bag, requirements)) throw new Error('Not enough ingredients');
  for (const requirement of requirements) {
    bag[requirement.id] -= requirement.quantity;
    if (bag[requirement.id] <= 0) delete bag[requirement.id];
  }
  return bag;
}

export function rollRoomIngredientDrops({ rng = Math.random } = {}) {
  const totalDrops = weightedPick(ROOM_DROP_COUNT_WEIGHTS, rng);
  const drops = [];
  for (let i = 0; i < totalDrops; i++) {
    const rarity = weightedPick(DROP_RARITY_WEIGHTS, rng);
    const pool = COOKING_INGREDIENTS.filter(ingredient => ingredient.rarity === rarity);
    const pick = pool[Math.floor(rng() * pool.length)] || COOKING_INGREDIENTS[0];
    drops.push({ id: pick.id, quantity: 1 });
  }
  return drops;
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

export function createCookedDishItem(dish, effect = dish.effects[0]) {
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

export function createCookedDishItems(dish) {
  return dish.effects.map(effect => createCookedDishItem(dish, effect));
}

export function applyCookedDish(dish, creatureParty, targetIndex, context = {}) {
  const results = [];
  for (const item of createCookedDishItems(dish)) {
    const result = applyItem(item, creatureParty, null, targetIndex, context);
    results.push(result);
    if (!result.applied) return { applied: false, results };
  }
  return { applied: true, results };
}
