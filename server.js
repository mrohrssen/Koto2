/**
 * @fileoverview Express server - API endpoints, game orchestration, AI integration
 * @module server
 *
 * PURPOSE:
 * Main Express.js server providing REST API for the JRPG frontend. Handles game
 * state management, AI narration generation, JPDB vocabulary integration, TTS
 * synthesis via VOICEVOX, and all game actions. Uses GameManager for game logic.
 *
 * KEY EXPORTS: (None - this is the server entry point)
 *
 * API ENDPOINT GROUPS:
 * /api/settings - Server settings (GET/POST, non-sensitive only)
 * /api/tts/* - VOICEVOX TTS (status, speakers, synthesize, cached)
 * /api/vocab/* - Vocabulary (status, words, fetch from JPDB)
 * /api/jpdb/* - JPDB integration (parse, review, lookup)
 * /api/game/* - Game actions (~40 endpoints)
 *
 * GAME ENDPOINTS:
 * State: /game/state, /game/meta, /game/achievements, /game/lifetime-stats
 * Player: /game/create-player
 * Run: /game/start-run, /game/forfeit, /game/enter-floor, /game/next-floor
 * Ward: /game/starting-wards, /game/select-starting-ward, /game/next-ward-options
 * Room: /game/room, /game/proceed, /game/interact-trap, /game/loot-body
 * Combat: /game/start-encounter, /game/start-boss, /game/combat-cycle, /game/combat-end-narration
 * Economy: /game/shop, /game/shop/buy, /game/refine, /game/open-treasure
 * Creatures: /game/creature-party, /game/creature-swap
 * Meta: /game/upgrades, /game/purchase-upgrade
 *
 * DEPENDENCIES:
 * - ./src/jpdb.js - JPDB API integration
 * - ./src/ai-providers.js - OpenAI/Anthropic/Google AI
 * - ./src/voicevox.js - TTS synthesis
 * - ./src/game/loop.js - GameManager class
 * - ./src/game/dm.js - AI narration generation
 * - ./src/game/state.js - State factories
 * - ./src/game-stats.js - Statistics tracking
 *
 * KEY INTERNAL FUNCTIONS:
 * - loadSettings() / saveSettings() - Settings persistence
 * - generateGameNarration(event, context, userKeys) - AI narration with vocab
 * - applyVocabRepair(narration, vocab, userKeys) - Fix AI vocab errors
 * - trackNarrationStats(narration, jpdbApiKey) - Track word usage
 * - getEnrichedGameState() - Add computed fields to game state
 *
 * STATE:
 * - gameManager - GameManager singleton instance
 * - settings - Server settings (non-sensitive, persisted to file)
 * - gameStats - Usage statistics
 *
 * ARCHITECTURE NOTES:
 * - API keys now in request body (per-user via localStorage)
 * - GameManager instantiated once, persists game state
 * - AI narration generated via generateNarration() with vocab suggestions
 * - Prefetch system disabled (requires server-side keys)
 * - TTS proxied to VOICEVOX_URL environment variable
 * - Game data saved to .jrpg-*.json files
 *
 * CLAUDE HINTS:
 * - For game logic, trace through GameManager methods in loop.js
 * - AI narration flow: endpoint -> generateGameNarration -> dm.js
 * - JPDB endpoints extract jpdbApiKey from req.body
 * - Game endpoints pass req.body as userKeys to helper functions
 * - Settings split: API keys in client localStorage, TTS/JLPT on server
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import dotenv from 'dotenv';

// Local module imports
import {
  configure as configureJpdb,
  initialize as initializeJpdb,
  getVocabulary,
  clearVocabCache,
  testConnection,
  parseText,
  lookupWordStates,
  CARD_STATES,
  reviewVocabulary,
  REVIEW_GRADES,
  getDueWordsWithMeanings,
  getWordState,
  invalidateWordStateCache,
  lookupVocabularyMeaning
} from './src/jpdb.js';

import {
  chat,
  getProviders,
  getJLPTLevels,
  buildSystemPrompt,
  JLPT_GRAMMAR
} from './src/ai-providers.js';

import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from './src/voicevox.js';

// Game imports
import { GameManager } from './src/game/loop.js';
import { generateNarration, getSimpleNarration } from './src/game/dm.js';
import { ACHIEVEMENTS } from './src/game/state.js';
import { getLiberationTrackerData } from './src/game/enemies.js';
import {
  loadGameStats, saveGameStats, updateGameStatsWithNarration,
  updateGameStatsWithWords, updateGameStatsWithEvent,
  getGameStatsForPeriod, getGameStatsAvailableDates, resetGameStats
} from './src/game-stats.js';
import {
  configureVocabManager, getSuggestionsForNarration, addUsedWords,
  refreshWordStateCache, getVocabManagerStats, invalidateWordStateCache as invalidateVocabManagerCache,
  getNarrationVocabularyForUser
} from './src/game/vocab-manager.js';
import {
  getCachedAudio, clearCache as clearPrefetchCache,
  setTTSSynthesizer, updateTTSConfig, cancelPendingPrefetches,
  queueTTSPrefetch
} from './src/game/prefetch.js';
import { enforceVocabLimit, checkSentenceViolations } from './src/game/vocab-repair.js';
import { generateDoorHints as _generateDoorHints } from './src/game/services/door-hint-service.js';
import {
  getDialogueFromCache as getNpcDialogueFromCache,
  getAllDialogueCache as getAllNpcDialogueCache,
  clearDialogueCache as clearNpcDialogueCache,
  queueMissingDialogues as queueNpcDialogues,
  logEncounter as logNpcEncounter,
  regenerateDialogue as regenNpcDialogue,
  setMemoryFlag as setNpcMemoryFlag,
  updateMemoryBond as updateNpcMemoryBond
} from './src/narration-engine/index.js';
import createRoutes from './src/routes/index.js';
import createAuthRoutes from './src/auth/routes.js';
import { dataPath } from './src/data-dir.js';
import { logger } from './src/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;

// File paths - use persistent data directory on Railway
const SETTINGS_FILE = dataPath('.jrpg-settings.json');
const GAME_SAVE_FILE = dataPath('.jrpg-save.json');
const VOCAB_CACHE_FILE = dataPath('.jrpg-vocab-cache.json');
// Use persistent data directory for per-user vocab suggestion caches
const VOCAB_CACHE_DIR = dataPath('data/');

// Configure JPDB with file paths
configureJpdb({
  vocabCacheFile: VOCAB_CACHE_FILE,
  vocabCacheDir: VOCAB_CACHE_DIR
});
initializeJpdb();

// Configure vocab manager with cache directory for per-user files
configureVocabManager({ cacheDir: VOCAB_CACHE_DIR });

// Load static word list for JPDB batch parsing
let staticWordList = [];
const wordListPath = join(__dirname, 'data/jpdb-wordlist.json');
if (existsSync(wordListPath)) {
  try {
    staticWordList = JSON.parse(readFileSync(wordListPath, 'utf-8'));
    console.log(`Loaded ${staticWordList.length} words from static word list`);
  } catch (e) {
    console.warn('Failed to load static word list:', e.message);
  }
}

const app = express();
const gameManager = new GameManager();

// Debug mode - disables AI narration only (JPDB vocab calls still work)
let debugMode = false;

// Vocab manager is now initialized per-user when they first access vocab features

// Load settings from file or use defaults
function loadSettings() {
  // API keys are now stored client-side in localStorage, not server-side
  const defaults = {
    jpdbDeckId: 'all',
    jlptLevel: 'N5',
    // Game TTS Settings (narrator voice)
    gameTtsEnabled: true,
    gameTtsSpeakerId: 13, // Cool male narrator voice
    gameTtsSpeed: 0.9,
    gameTtsVolume: 1.0,
    // Word Review Settings
    reviewType: 'typing',
    // Word Discovery Settings
    dailyWordLimit: 10  // 0-50, 0 = skip discovery rooms
  };

  if (existsSync(SETTINGS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
      console.log('Loaded settings from file');
      return { ...defaults, ...saved };
    } catch (e) {
      console.warn('Failed to load settings file:', e.message);
    }
  }
  return defaults;
}

function saveSettings(settings) {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.warn('Failed to save settings:', e.message);
  }
}

// Middleware
app.use(cors());
app.use(compression()); // Gzip/Brotli compression for all responses
app.use(express.json({ limit: '10mb' })); // Increased for bug report screenshots

// Static files - only cache webp images, load everything else fresh
app.use(express.static(join(__dirname, 'public'), {
  maxAge: 0,              // No caching by default
  etag: false,            // Disable ETags for fresh loads
  lastModified: false,    // Disable Last-Modified for fresh loads
  setHeaders: (res, path) => {
    // Only cache webp images and mp3 audio (sprites, backgrounds, music)
    if (path.endsWith('.webp') || path.endsWith('.mp3')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    } else {
      // Everything else loads fresh (JS, CSS, HTML, other assets)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Load persisted data
let settings = loadSettings();
let gameStats = loadGameStats();

// Game save/load helpers
function loadGameSave() {
  if (existsSync(GAME_SAVE_FILE)) {
    try {
      return JSON.parse(readFileSync(GAME_SAVE_FILE, 'utf-8'));
    } catch (e) {
      console.warn('Failed to load game save:', e.message);
    }
  }
  return null;
}

const SAVE_VERSION = 2;

function saveGameData() {
  try {
    const data = {
      version: SAVE_VERSION,
      player: gameManager.player,
      meta: gameManager.meta,
      savedAt: new Date().toISOString()
    };
    writeFileSync(GAME_SAVE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Failed to save game:', e.message);
  }
}

// Load game save on startup (invalidate pre-cleanup saves)
const gameSave = loadGameSave();
if (gameSave && (!gameSave.version || gameSave.version < SAVE_VERSION)) {
  console.warn(`Discarding old save (version ${gameSave.version || 'none'}, need ${SAVE_VERSION}). Requiring new game.`);
} else if (gameSave?.player) {
  gameManager.loadPlayer(gameSave.player);
  console.log(`Loaded game save for ${gameSave.player.name}`);
}
// Migrate: rename robotCollection → creatureCollection (no version bump)
if (gameSave?.meta?.robotCollection && !gameSave?.meta?.creatureCollection) {
  gameSave.meta.creatureCollection = gameSave.meta.robotCollection;
  delete gameSave.meta.robotCollection;
}
gameManager.initMeta(gameSave?.version >= SAVE_VERSION ? gameSave?.meta : null);
if (gameSave?.meta && gameSave?.version >= SAVE_VERSION) {
  console.log(`Loaded meta-progression: ${gameSave.meta.essence} essence`);
}

// Helper to enrich player data for frontend display
function enrichPlayerItems(player) {
  if (!player) return player;

  const enriched = { ...player };

  enriched.derivedStats = {
    atk: enriched.attack || 15
  };

  return enriched;
}

function enrichGameState(manager) {
  const state = manager.getState();
  if (state.player) {
    state.player = enrichPlayerItems(state.player);
  }
  if (state.run?.player) {
    state.run.player = enrichPlayerItems(state.run.player);
  }
  return state;
}

function enrichRewardDrops(rewards) {
  if (!rewards) return rewards;

  const enriched = { ...rewards };

  if (enriched.drops && Array.isArray(enriched.drops)) {
    enriched.drops = enriched.drops.map(itemId => ({
      id: itemId,
      name: itemId,
      slot: null,
      type: 'consumable',
      rarity: 'common'
    }));
  }

  if (enriched.bossDrop) {
    enriched.bossDrop = {
      ...enriched.bossDrop,
      name: enriched.bossDrop.itemId,
      slot: null,
      type: 'equipment',
      rarity: 'epic'
    };
  }

  return enriched;
}

// ============ API Routes ============

// Mount auth routes (public, no auth required)
app.use('/api/auth', createAuthRoutes());

// Mount extracted route modules
app.use('/api', createRoutes({
  getSettings: () => settings,
  saveSettings: saveSettings,
  enrichGameState,
  generateGameNarration,
  generateDoorHints: generateDoorHintsForRoute,
  cancelPendingPrefetches,
  clearPrefetchCache,
  enrichRewardDrops,
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats: () => gameStats,
  setGameStats: (newStats) => { gameStats = newStats; },
  getDebugMode: () => debugMode,
  setDebugMode: (val) => { debugMode = val; },
  vocabCacheFile: VOCAB_CACHE_FILE,
  staticWordList,
  getUserVocabulary: getUserNarrationVocabulary,
  getCreatureDialogueFromCache: (userId, creatureId) =>
    getNpcDialogueFromCache(userId, creatureId, 'creature'),
  getAllCreatureDialogueCache: (userId) =>
    getAllNpcDialogueCache(userId, 'creature'),
  queueMissingCreatureDialoguesFn: async (userId, aiConfig, vocabContext) =>
    queueNpcDialogues(userId, chat, aiConfig, vocabContext, 'creature'),
  regenCreatureDialogueFn: async (userId, creatureId, aiConfig, vocabContext) =>
    regenNpcDialogue(userId, creatureId, chat, aiConfig, vocabContext, 'creature'),
  // NPC narration engine deps
  getNpcDialogueFromCache,
  getAllNpcDialogueCache,
  clearNpcDialogueCache,
  clearCreatureDialogueCache: (userId) =>
    clearNpcDialogueCache(userId, 'creature'),
  queueMissingNpcDialoguesFn: async (userId, aiConfig, vocabContext) => {
    return queueNpcDialogues(userId, chat, aiConfig, vocabContext);
  },
  logNpcEncounterFn: logNpcEncounter,
  regenNpcDialogueFn: async (userId, npcId, aiConfig, vocabContext) => {
    return regenNpcDialogue(userId, npcId, chat, aiConfig, vocabContext);
  },
  setNpcMemoryFlagFn: setNpcMemoryFlag,
  updateNpcMemoryBondFn: updateNpcMemoryBond,
  checkSentenceViolations
}));

// Narration helpers
function trackNarrationStats(narration, jpdbApiKey = null, userId = null) {
  if (!narration) return;

  updateGameStatsWithNarration(gameStats, narration);
  saveGameStats(gameStats);

  if (jpdbApiKey && userId) {
    try {
      addUsedWords(narration, userId);
    } catch (e) {}
  }
}

const DM_EVENT_ALIASES = Object.freeze({
  floorEnter: 'enterFloor',
  encounterStart: 'combatStart',
  shrine: 'shrineUse'
});

function normalizeNarrationRequest(event, context = {}) {
  if (event === 'bossStart') {
    const isFinalBoss = Boolean(context?.isFinalBoss) || Number(context?.floor) === 7;
    const bossContext = context?.enemy || context?.boss || context || {};
    // Preserve allies if present for creature-specific narration
    if (context?.allies) bossContext.allies = context.allies;
    return {
      event: isFinalBoss ? 'finalBossAppear' : 'bossAppear',
      context: bossContext
    };
  }

  if (event === 'floorEnter') {
    const floorValue = Number(context?.floor);
    return {
      event: 'enterFloor',
      context: Number.isFinite(floorValue) ? floorValue : (context?.floor || context || 1)
    };
  }

  if (event === 'shrine') {
    if (typeof context === 'number') {
      return { event: 'shrineUse', context: { healed: context } };
    }

    const healed = Number(context?.healed);
    const effectHealed = Number(context?.effect?.healed);
    return {
      event: 'shrineUse',
      context: {
        ...(context || {}),
        healed: Number.isFinite(healed) ? healed : (Number.isFinite(effectHealed) ? effectHealed : 0)
      }
    };
  }

  return {
    event: DM_EVENT_ALIASES[event] || event,
    context
  };
}

function getUserNarrationVocabulary(userId) {
  const vocabResult = getVocabulary();
  const fallbackVocabulary = Array.isArray(vocabResult?.words) ? vocabResult.words : [];
  return getNarrationVocabularyForUser(userId, fallbackVocabulary);
}

async function applyVocabRepair(narration, vocabulary, userKeys, gameTerms = [], vidSet = null) {
  const { jpdbApiKey, aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel } = userKeys || {};
  if (!jpdbApiKey || !aiApiKey || !vocabulary?.length) return narration;

  try {
    const aiConfig = {
      provider: aiProvider || 'openai',
      apiKey: aiApiKey,
      openaiModel: openaiModel || 'gpt-4o-mini',
      openrouterModel: openrouterModel || ''
    };

    const repairChat = async (repairPrompt) => {
      return chat({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        messages: [{ role: 'user', content: repairPrompt }],
        vocabulary,
        jlptLevel: jlptLevel || 'N4',
        openaiModel: aiConfig.openaiModel,
        openrouterModel: aiConfig.openrouterModel,
        customSystemPrompt: 'You rewrite Japanese text while preserving meaning. Return only the rewritten Japanese sentence.',
        purpose: 'narration_repair'
      });
    };

    const repaired = await enforceVocabLimit(
      narration,
      vocabulary,
      jpdbApiKey,
      repairChat,
      1,
      gameTerms,
      vidSet
    );

    return repaired?.narration || narration;
  } catch (error) {
    console.error('[Vocab Repair] Error:', error.message);
    return narration;
  }
}

async function generateGameNarration(event, context, userKeys = {}) {
  const sourceContext = context || {};

  if (debugMode) {
    const { event: debugEvent, context: debugContext } = normalizeNarrationRequest(event, sourceContext);
    console.log(`[Debug] Returning fallback narration for ${debugEvent}`);
    return getSimpleNarration(debugEvent, debugContext);
  }

  const { jpdbApiKey, aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel, userId } = userKeys;
  const { event: normalizedEvent, context: normalizedContext } = normalizeNarrationRequest(event, sourceContext);
  const enemyForState = sourceContext?.enemy
    || ((normalizedEvent === 'bossAppear' || normalizedEvent === 'finalBossAppear') ? normalizedContext : null);

  const { words: vocabulary, vidSet } = getUserNarrationVocabulary(userId);
  const aiConfig = {
    provider: aiProvider || 'openai',
    apiKey: aiApiKey,
    openaiModel: openaiModel || 'gpt-4o-mini',
    openrouterModel: openrouterModel || ''
  };

  let narration;
  let suggestedWords = null;

  if (!aiConfig.apiKey || vocabulary.length === 0) {
    narration = getSimpleNarration(normalizedEvent, normalizedContext);
  } else {
    if (jpdbApiKey && vocabulary.length > 0) {
      try {
        suggestedWords = await getSuggestionsForNarration(jpdbApiKey, vocabulary, userId);
      } catch (e) {}
    }

    const gameState = {
      player: sourceContext.player || null,
      floor: sourceContext.floor || 1,
      enemy: enemyForState || null,
      combat: enemyForState ? { active: true, turn: sourceContext.turn || 0 } : null,
      allies: sourceContext.allies || null
    };

    narration = await generateNarration(
      chat,
      gameState,
      normalizedEvent,
      normalizedContext,
      vocabulary,
      jlptLevel || 'N4',
      aiConfig,
      suggestedWords
    );

    if (!narration) {
      narration = getSimpleNarration(normalizedEvent, normalizedContext);
    }
  }

  const gameTerms = [];
  if (enemyForState?.name) {
    gameTerms.push(enemyForState.name);
  }
  narration = await applyVocabRepair(narration, vocabulary, userKeys, gameTerms, vidSet);

  // Prefetch TTS audio so it's ready when the client requests it
  if (narration) {
    queueTTSPrefetch(narration);
  }

  trackNarrationStats(narration, jpdbApiKey, userId);

  return narration;
}

function generateDoorHintsForRoute(roomType1, roomType2) {
  return _generateDoorHints(roomType1, roomType2);
}

// Serve game page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'game.html'));
});

// ============ TTS Initialization ============

async function ttsSynthesizerFn(text, config) {
  if (!config?.enabled) return null;

  try {
    const isRunning = await isVoicevoxRunning();
    if (!isRunning) return null;

    return await synthesize(
      text,
      config.speakerId || settings.gameTtsSpeakerId || 13,
      {
        speedScale: config.speed || settings.gameTtsSpeed || 0.9,
        volumeScale: config.volume || settings.gameTtsVolume || 1.0
      }
    );
  } catch (error) {
    console.error('[TTS Prefetch] Synthesis error:', error.message);
    return null;
  }
}

setTTSSynthesizer(ttsSynthesizerFn, {
  enabled: settings.gameTtsEnabled,
  speakerId: settings.gameTtsSpeakerId,
  speed: settings.gameTtsSpeed,
  volume: settings.gameTtsVolume
});

// Start server
app.listen(PORT, () => {
  logger.info('[Server] Started:', { port: PORT, env: process.env.NODE_ENV || 'development' });
  logger.info('[Server] Log level:', logger.getLevel());
  console.log(`JRPG server running at http://localhost:${PORT}`);
  console.log('[TTS] Prefetch:', settings.gameTtsEnabled ? 'enabled' : 'disabled');
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to play');
});
