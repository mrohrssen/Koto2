/**
 * @fileoverview Main router aggregator
 *
 * Collects all route modules and exports a factory function
 * that server.js uses to create the combined router.
 *
 * Dependencies are passed through to route modules that need them.
 */

import { Router } from 'express';
import createSettingsRoutes from './settings.js';
import createTTSRoutes from './tts.js';
import createVocabRoutes from './vocab.js';
import createGameRoutes from './game/index.js';
import createPrefetchRoutes from './prefetch.js';

/**
 * Create main API router with all route modules
 * @param {object} deps - Dependencies for route modules
 * @param {function} deps.getSettings - Get current settings object
 * @param {function} deps.saveSettings - Save settings to file
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.queueRunStartPrefetch - Queue run start prefetch
 * @param {function} deps.eagerPrefetchForRun - Prefetch for run start
 * @param {function} deps.cancelPendingPrefetches - Cancel pending prefetches
 * @param {function} deps.clearPrefetchCache - Clear prefetch cache
 * @returns {Router}
 */
export default function createRoutes(deps) {
  const router = Router();

  // Settings routes: /api/config, /api/settings
  router.use(createSettingsRoutes({
    getSettings: deps.getSettings,
    saveSettings: deps.saveSettings
  }));

  // TTS routes: /api/tts/*
  router.use('/tts', createTTSRoutes({
    getSettings: deps.getSettings
  }));

  // Vocab/JPDB routes: /api/vocab/*, /api/jpdb/*
  router.use(createVocabRoutes({
    getSettings: deps.getSettings
  }));

  // Game routes: /api/game/*
  router.use('/game', createGameRoutes({
    gameManager: deps.gameManager,
    getEnrichedGameState: deps.getEnrichedGameState,
    saveGameData: deps.saveGameData,
    generateGameNarration: deps.generateGameNarration,
    queueRunStartPrefetch: deps.queueRunStartPrefetch,
    eagerPrefetchForRun: deps.eagerPrefetchForRun,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache,
    clearCombatCache: deps.clearCombatCache,
    enrichRewardDrops: deps.enrichRewardDrops,
    updateGameStatsWithEvent: deps.updateGameStatsWithEvent,
    saveGameStats: deps.saveGameStats,
    getGameStats: deps.getGameStats,
    setGameStats: deps.setGameStats,
    getDebugMode: deps.getDebugMode,
    setDebugMode: deps.setDebugMode,
    gameSaveFile: deps.gameSaveFile,
    vocabCacheFile: deps.vocabCacheFile
  }));

  // Prefetch routes: /api/prefetch/*
  router.use('/prefetch', createPrefetchRoutes());

  return router;
}
