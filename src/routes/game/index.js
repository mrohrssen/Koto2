/**
 * @fileoverview Game routes aggregator
 *
 * Collects all game-related route modules under /api/game/*
 */

import { Router } from 'express';
import createGameStateRoutes from './state.js';
import createPlayerRoutes from './player.js';
import createRunRoutes from './run.js';
import createCombatRoutes from './combat.js';
import createEconomyRoutes from './economy.js';
import createMiscRoutes from './misc.js';

/**
 * Create game router
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.queueRunStartPrefetch - Queue run start prefetch
 * @param {function} deps.eagerPrefetchForRun - Prefetch for run start
 * @param {function} deps.cancelPendingPrefetches - Cancel pending prefetches
 * @param {function} deps.clearPrefetchCache - Clear prefetch cache
 * @param {function} deps.clearCombatCache - Clear combat prefetch cache
 * @param {function} deps.enrichRewardDrops - Enrich reward drops with item data
 * @param {function} deps.updateGameStatsWithEvent - Update game stats
 * @param {function} deps.saveGameStats - Save game stats
 * @param {function} deps.getGameStats - Get game stats object
 * @returns {Router}
 */
export default function createGameRoutes(deps) {
  const router = Router();

  // Mount game state routes
  router.use(createGameStateRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState
  }));

  // Mount player routes
  router.use(createPlayerRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState,
    saveGameData: deps.saveGameData,
    generateGameNarration: deps.generateGameNarration,
    queueRunStartPrefetch: deps.queueRunStartPrefetch
  }));

  // Mount run routes
  router.use(createRunRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState,
    saveGameData: deps.saveGameData,
    generateGameNarration: deps.generateGameNarration,
    eagerPrefetchForRun: deps.eagerPrefetchForRun,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache
  }));

  // Mount combat routes
  router.use(createCombatRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState,
    saveGameData: deps.saveGameData,
    generateGameNarration: deps.generateGameNarration,
    clearCombatCache: deps.clearCombatCache,
    enrichRewardDrops: deps.enrichRewardDrops,
    updateGameStatsWithEvent: deps.updateGameStatsWithEvent,
    saveGameStats: deps.saveGameStats,
    getGameStats: deps.getGameStats
  }));

  // Mount economy routes
  router.use(createEconomyRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState,
    saveGameData: deps.saveGameData,
    generateGameNarration: deps.generateGameNarration
  }));

  // Mount misc routes
  router.use(createMiscRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState,
    saveGameData: deps.saveGameData,
    generateGameNarration: deps.generateGameNarration,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache,
    getGameStats: deps.getGameStats,
    setGameStats: deps.setGameStats,
    getDebugMode: deps.getDebugMode,
    setDebugMode: deps.setDebugMode,
    gameSaveFile: deps.gameSaveFile,
    vocabCacheFile: deps.vocabCacheFile
  }));

  return router;
}
