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
    getSettings: deps.getSettings,
    ttsCache: deps.ttsCache,
    ttsDialogueCache: deps.ttsDialogueCache
  }));

  // Vocab/JPDB routes: /api/vocab/*, /api/jpdb/*
  router.use(createVocabRoutes({
    getSettings: deps.getSettings
  }));

  // Game routes: /api/game/* (auth-protected, per-user managers)
  router.use('/game', createGameRoutes({
    enrichGameState: deps.enrichGameState,
    cancelPendingPrefetches: deps.cancelPendingPrefetches,
    clearPrefetchCache: deps.clearPrefetchCache,
    updateGameStatsWithEvent: deps.updateGameStatsWithEvent,
    saveGameStats: deps.saveGameStats,
    getGameStats: deps.getGameStats,
    setGameStats: deps.setGameStats,
    getDebugMode: deps.getDebugMode,
    setDebugMode: deps.setDebugMode,
    vocabCacheFile: deps.vocabCacheFile,
    staticWordList: deps.staticWordList,
    getSettings: deps.getSettings,
    getUserVocabulary: deps.getUserVocabulary,
    // Creature narration engine deps
    getCreatureDialogueFromCache: deps.getCreatureDialogueFromCache,
    getAllCreatureDialogueCache: deps.getAllCreatureDialogueCache,
    queueMissingCreatureDialoguesFn: deps.queueMissingCreatureDialoguesFn,
    regenCreatureDialogueFn: deps.regenCreatureDialogueFn,
    // NPC narration engine deps
    getNpcDialogueFromCache: deps.getNpcDialogueFromCache,
    getAllNpcDialogueCache: deps.getAllNpcDialogueCache,
    clearNpcDialogueCache: deps.clearNpcDialogueCache,
    clearCreatureDialogueCache: deps.clearCreatureDialogueCache,
    queueMissingNpcDialoguesFn: deps.queueMissingNpcDialoguesFn,
    logNpcEncounterFn: deps.logNpcEncounterFn,
    regenNpcDialogueFn: deps.regenNpcDialogueFn,
    setNpcMemoryFlagFn: deps.setNpcMemoryFlagFn,
    updateNpcMemoryBondFn: deps.updateNpcMemoryBondFn,
    checkSentenceViolations: deps.checkSentenceViolations
  }));

  // Prefetch routes: /api/prefetch/*
  router.use('/prefetch', createPrefetchRoutes());

  // Bug report routes: /api/bug-report, /api/bug-reports/*
  router.use(createBugReportRoutes());

  return router;
}
