/**
 * @fileoverview Game routes aggregator
 *
 * Applies requireAuth middleware and per-user GameManager injection,
 * then mounts all game-related route modules under /api/game/*
 */

import { Router } from 'express';
import { requireAuth } from '../../auth/middleware.js';
import { getManager, saveManager } from '../../game/manager-registry.js';
import { findUserById } from '../../auth/users.js';
import { decryptKeys } from '../../auth/crypto.js';
import createGameStateRoutes from './state.js';
import createPlayerRoutes from './player.js';
import createRunRoutes from './run.js';
import createCombatRoutes from './combat.js';
import createEconomyRoutes from './economy.js';
import createMiscRoutes from './misc.js';

/**
 * Get decrypted API keys for a user
 * @param {string} userId
 * @returns {object} Decrypted keys or empty object
 */
function getUserKeys(userId) {
  const user = findUserById(userId);
  if (!user?.encryptedApiKeys) return {};
  try {
    return decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
  } catch {
    return {};
  }
}

/**
 * Create game router
 * @param {object} deps - Dependencies
 * @param {function} deps.enrichGameState - Enrich a game state with item data
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.cancelPendingPrefetches - Cancel pending prefetches
 * @param {function} deps.clearPrefetchCache - Clear prefetch cache
 * @param {function} deps.enrichRewardDrops - Enrich reward drops with item data
 * @param {function} deps.updateGameStatsWithEvent - Update game stats
 * @param {function} deps.saveGameStats - Save game stats
 * @param {function} deps.getGameStats - Get game stats object
 * @returns {Router}
 */
export default function createGameRoutes(deps) {
  const router = Router();

  // Auth + per-user manager middleware
  router.use(requireAuth);
  router.use((req, res, next) => {
    req.gameManager = getManager(req.user.id);
    req.saveGame = () => saveManager(req.user.id);
    req.userKeys = getUserKeys(req.user.id);
    req.getEnrichedGameState = () => deps.enrichGameState(req.gameManager);
    next();
  });

  // Mount game state routes
  router.use(createGameStateRoutes());

  // Mount player routes
  router.use(createPlayerRoutes({
    generateGameNarration: deps.generateGameNarration
  }));

  // Mount run routes
  router.use(createRunRoutes({
    generateGameNarration: deps.generateGameNarration,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache
  }));

  // Mount combat routes
  router.use(createCombatRoutes({
    generateGameNarration: deps.generateGameNarration,
    enrichRewardDrops: deps.enrichRewardDrops,
    updateGameStatsWithEvent: deps.updateGameStatsWithEvent,
    saveGameStats: deps.saveGameStats,
    getGameStats: deps.getGameStats
  }));

  // Mount economy routes
  router.use(createEconomyRoutes({
    generateGameNarration: deps.generateGameNarration
  }));

  // Mount misc routes
  router.use(createMiscRoutes({
    generateGameNarration: deps.generateGameNarration,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache,
    getGameStats: deps.getGameStats,
    setGameStats: deps.setGameStats,
    getDebugMode: deps.getDebugMode,
    setDebugMode: deps.setDebugMode,
    vocabCacheFile: deps.vocabCacheFile
  }));

  return router;
}
