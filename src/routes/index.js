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
import createBugReportRoutes from './bug-reports.js';

/**
 * Create main API router with all route modules
 * @param {object} deps - Dependencies for route modules
 * @param {function} deps.getSettings - Get current settings object
 * @param {function} deps.saveSettings - Save settings to file
 * @param {function} deps.enrichGameState - Enrich game state (accepts gameManager)
 * @param {function} deps.generateGameNarration - Generate AI narration
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

  // Game routes: /api/game/* (auth-protected, per-user managers)
  router.use('/game', createGameRoutes({
    enrichGameState: deps.enrichGameState,
    generateGameNarration: deps.generateGameNarration,
    generateDoorHints: deps.generateDoorHints,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache,
    enrichRewardDrops: deps.enrichRewardDrops,
    updateGameStatsWithEvent: deps.updateGameStatsWithEvent,
    saveGameStats: deps.saveGameStats,
    getGameStats: deps.getGameStats,
    setGameStats: deps.setGameStats,
    getDebugMode: deps.getDebugMode,
    setDebugMode: deps.setDebugMode,
    vocabCacheFile: deps.vocabCacheFile,
    staticWordList: deps.staticWordList,
    getSettings: deps.getSettings
  }));

  // Prefetch routes: /api/prefetch/*
  router.use('/prefetch', createPrefetchRoutes());

  // Bug report routes: /api/bug-report, /api/bug-reports/*
  router.use(createBugReportRoutes());

  return router;
}
