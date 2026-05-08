import express from 'express';
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
import { entityToToken, getEligibleFrameTokens } from '../../game/token-format.js';
import { getKnownWordsFromFsrs, getWordDict } from '../../game/bootstrap/word-knowledge.js';
import { getGameMasterYesFrame, getGameMasterNoFrame } from '../../game/dialogue-loader.js';

const QUANTITY_LABELS = {
  1: { surface: '一つ', reading: 'ひとつ' },
  2: { surface: '二つ', reading: 'ふたつ' },
  3: { surface: '三つ', reading: 'みっつ' },
  4: { surface: '四つ', reading: 'よっつ' },
  5: { surface: '五つ', reading: 'いつつ' },
};

export default function createCookingRoutes() {
  const router = express.Router();

  router.get('/campfire', (req, res) => {
    try {
      const gm = req.gameManager;
      ensureCookingState(gm);
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
      ensureCookingState(gm);
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
      ensureCookingState(gm);
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
        const discovered = gm.meta.cookingRecipesDiscovered ||= [];
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

  router.post('/campfire/skip', (req, res) => {
    try {
      const gm = req.gameManager;
      ensureCookingState(gm);
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'campfire') return res.status(400).json({ error: 'Not in a campfire room' });
      if (!room.campfire) room.campfire = { cookedDish: null, consumed: null, fed: false, completed: false };

      room.campfire.completed = true;
      room.campfire.skipped = true;
      room.interacted = true;
      req.saveGame();

      res.json({ state: req.getEnrichedGameState(), skipped: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

function ensureCookingState(gm) {
  if (!gm.run.cooking) gm.run.cooking = { ingredients: {}, cookedThisRun: [] };
  if (!gm.run.cooking.ingredients) gm.run.cooking.ingredients = {};
  if (!Array.isArray(gm.run.cooking.cookedThisRun)) gm.run.cooking.cookedThisRun = [];
  if (!gm.meta) gm.initMeta();
  if (!Array.isArray(gm.meta.cookingRecipesDiscovered)) gm.meta.cookingRecipesDiscovered = [];
}

function decorateDrops(drops) {
  const byId = new Map(COOKING_INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));
  return drops.map(drop => {
    const ingredient = byId.get(drop.id);
    return { ...drop, ingredient, nameToken: entityToToken(ingredient) };
  });
}

function quantityToken(quantity) {
  const label = QUANTITY_LABELS[quantity] || { surface: `${quantity}つ`, reading: `${quantity}つ` };
  return { surface: `を${label.surface}`, reading: `を${label.reading}`, meaning: `${quantity}` };
}

function buildReceipt(drops) {
  const decorated = decorateDrops(drops);
  const tokens = [];
  decorated.forEach(({ ingredient, quantity }, index) => {
    if (index > 0) tokens.push({ surface: '、', reading: '、', meaning: ',' });
    tokens.push(entityToToken(ingredient));
    tokens.push(quantityToken(quantity));
  });
  tokens.push({ surface: '手に入れた。', reading: 'てにいれた。', meaning: 'received' });
  return { tokens, words: decorated.map(({ ingredient }) => ingredient.word) };
}

function buildCampfireState(req) {
  const gm = req.gameManager;
  const discoveredIds = new Set(gm.meta?.cookingRecipesDiscovered || []);
  const knownWords = getKnownWordsFromFsrs(req.user.id);
  const knownSet = new Set(knownWords);
  const dict = getWordDict();
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
}

function getHighestPartyLevel(party) {
  const all = [...(party?.active || []), ...(party?.reserves || [])].filter(Boolean);
  return all.reduce((max, creature) => Math.max(max, creature.level || 1), 1);
}
