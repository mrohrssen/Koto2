import express from 'express';
import {
  applyCampfireCook,
  applyCampfireFeed,
  applyCampfireSkip,
  getCookableRecipeHints,
  getIngredientCount,
  ensureCookingRunState,
  COOKING_INGREDIENTS,
  COOKING_RECIPES,
} from '../../game/services/cooking-service.js';
import { entityToToken, getEligibleFrameTokens } from '../../game/token-format.js';
import { getKnownWordsFromFsrs, getWordDict } from '../../game/bootstrap/word-knowledge.js';
import { getGameMasterYesFrame, getGameMasterNoFrame } from '../../game/dialogue-loader.js';
import {
  createOptimisticActionRunner,
  getOptimisticActionLedgerOwner,
} from './optimistic-action-response.js';

const QUANTITY_LABELS = {
  1: { surface: '一つ', reading: 'ひとつ' },
  2: { surface: '二つ', reading: 'ふたつ' },
  3: { surface: '三つ', reading: 'みっつ' },
  4: { surface: '四つ', reading: 'よっつ' },
  5: { surface: '五つ', reading: 'いつつ' },
};

export default function createCookingRoutes() {
  const router = express.Router();
  const runCampfireAction = createOptimisticActionRunner({
    owner: req => {
      const gm = req.gameManager;
      if (gm && !gm.meta && typeof gm.initMeta === 'function') {
        try {
          gm.initMeta();
        } catch {
          // Let the route mutation path report the real validation error.
        }
      }
      return getOptimisticActionLedgerOwner(req);
    },
  });

  router.get('/campfire', (req, res) => {
    try {
      const gm = req.gameManager;
      ensureCookingRunState(gm);
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'campfire') throw new Error('Not in a campfire room');
      res.json(buildCampfireState(req));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Compatibility path for clients that have not adopted /api/game/explore/sync.
  // The session client should not call this endpoint after explore runway cutover.
  router.post('/campfire/cook', (req, res) => runCampfireAction(req, res, {
    actionType: 'campfire.cook',
    perform: () => {
      applyCampfireCook(req.gameManager, { ingredients: req.body?.ingredients || [] });
      return buildCampfireState(req);
    },
  }));

  // Compatibility path for clients that have not adopted /api/game/explore/sync.
  // The session client should not call this endpoint after explore runway cutover.
  router.post('/campfire/feed', (req, res) => runCampfireAction(req, res, {
    actionType: 'campfire.feed',
    perform: () => {
      const { dish, applyResult } = applyCampfireFeed(req.gameManager, {
        targetCreatureIndex: req.body?.targetCreatureIndex,
      });
      return { state: req.getEnrichedGameState(), dish, applyResult };
    },
  }));

  // Compatibility path for clients that have not adopted /api/game/explore/sync.
  // The session client should not call this endpoint after explore runway cutover.
  router.post('/campfire/skip', (req, res) => runCampfireAction(req, res, {
    actionType: 'campfire.skip',
    perform: () => {
      applyCampfireSkip(req.gameManager);
      return { state: req.getEnrichedGameState(), skipped: true };
    },
  }));

  return router;
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
