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
 * Player: /game/create-player, /game/allocate-stat
 * Run: /game/start-run, /game/forfeit, /game/enter-floor, /game/next-floor
 * Ward: /game/starting-wards, /game/select-starting-ward, /game/next-ward-options
 * Room: /game/room, /game/proceed, /game/interact-trap, /game/loot-body
 * Combat: /game/start-encounter, /game/start-boss, /game/combat-cycle, /game/combat-end-narration
 * Economy: /game/shop, /game/shop/buy, /game/refine, /game/open-treasure
 * Chips: /game/chip-loadout, /game/equip-chip, /game/unequip-chip
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
  fetchDeckVocabulary,
  fetchAllDecksVocabulary,
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
import { getItem } from './src/game/items.js';
import { getChipLoadout, equipChip, unequipChip } from './src/game/items/chips.js';
import { generateNarration, getSimpleNarration } from './src/game/dm.js';
import { ACHIEVEMENTS } from './src/game/state.js';
import { getLiberationTrackerData } from './src/game/enemies.js';
import {
  loadGameStats, saveGameStats, updateGameStatsWithNarration,
  updateGameStatsWithWords, updateGameStatsWithEvent,
  getGameStatsForPeriod, getGameStatsAvailableDates, resetGameStats
} from './src/game-stats.js';
import {
  initVocabManager, getSuggestionsForNarration, addUsedWords,
  refreshWordStateCache, getVocabManagerStats, invalidateWordStateCache as invalidateVocabManagerCache
} from './src/game/vocab-manager.js';
import {
  getCachedAudio, clearCache as clearPrefetchCache,
  setTTSSynthesizer, updateTTSConfig, cancelPendingPrefetches
} from './src/game/prefetch.js';
import { enforceVocabLimit } from './src/game/vocab-repair.js';
import createRoutes from './src/routes/index.js';
import createAuthRoutes from './src/auth/routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;

// File paths
const SETTINGS_FILE = join(__dirname, '.jrpg-settings.json');
const GAME_SAVE_FILE = join(__dirname, '.jrpg-save.json');
const VOCAB_CACHE_FILE = join(__dirname, '.jrpg-vocab-cache.json');
// Use JChat's vocab suggestions file for shared word state cache
const VOCAB_SUGGESTIONS_FILE = join(__dirname, '..', 'JChat', '.jchat-vocab-suggestions.json');

// Configure JPDB with file paths
configureJpdb({
  vocabCacheFile: VOCAB_CACHE_FILE,
  vocabSuggestionsFile: VOCAB_SUGGESTIONS_FILE
});
initializeJpdb();

const app = express();
const gameManager = new GameManager();

// Debug mode - disables AI narration only (JPDB vocab calls still work)
let debugMode = false;

// Initialize vocab manager for word suggestions
initVocabManager();

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
    reviewType: 'typing'
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
app.use(express.json());

// Static files with aggressive caching
app.use(express.static(join(__dirname, 'public'), {
  maxAge: '1d',           // Cache for 1 day by default
  etag: true,             // Enable ETags for cache validation
  lastModified: true,     // Enable Last-Modified headers
  setHeaders: (res, path) => {
    // Long cache for assets (images, icons, sprites)
    if (path.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    }
    // Short cache for HTML
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
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
gameManager.initMeta(gameSave?.version >= SAVE_VERSION ? gameSave?.meta : null);
if (gameSave?.meta && gameSave?.version >= SAVE_VERSION) {
  console.log(`Loaded meta-progression: ${gameSave.meta.essence} essence`);
}

// Helper to enrich player data for frontend display
function enrichPlayerItems(player) {
  if (!player) return player;

  const enriched = { ...player };

  if (enriched.equipment?.weapon) {
    const itemDef = getItem(enriched.equipment.weapon.id);
    enriched.equipment = {
      weapon: {
        ...enriched.equipment.weapon,
        name: itemDef?.name || enriched.equipment.weapon.id,
        slot: 'weapon',
        rarity: itemDef?.rarity || 'common'
      }
    };
  }

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
    enriched.drops = enriched.drops.map(itemId => {
      const itemDef = getItem(itemId);
      return {
        id: itemId,
        name: itemDef?.name || itemId,
        slot: itemDef?.slot || null,
        type: itemDef?.type || 'consumable',
        rarity: itemDef?.rarity || 'common'
      };
    });
  }

  if (enriched.bossDrop) {
    const itemDef = getItem(enriched.bossDrop.itemId);
    enriched.bossDrop = {
      ...enriched.bossDrop,
      name: itemDef?.name || enriched.bossDrop.itemId,
      slot: itemDef?.slot || null,
      type: itemDef?.type || 'equipment',
      rarity: itemDef?.rarity || 'epic'
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
  cancelPendingPrefetches,
  clearPrefetchCache,
  enrichRewardDrops,
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats: () => gameStats,
  setGameStats: (newStats) => { gameStats = newStats; },
  getDebugMode: () => debugMode,
  setDebugMode: (val) => { debugMode = val; },
  vocabCacheFile: VOCAB_CACHE_FILE
}));

// Narration helpers
function trackNarrationStats(narration, jpdbApiKey = null) {
  if (!narration) return;

  updateGameStatsWithNarration(gameStats, narration);
  saveGameStats(gameStats);

  if (jpdbApiKey) {
    try {
      addUsedWords(narration, jpdbApiKey);
    } catch (e) {}
  }
}

async function applyVocabRepair(narration, vocabulary, userKeys, gameTerms = []) {
  const { jpdbApiKey, aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel } = userKeys || {};
  if (!jpdbApiKey || !vocabulary?.length) return narration;

  try {
    const aiConfig = {
      provider: aiProvider || 'openai',
      apiKey: aiApiKey,
      openaiModel: openaiModel || 'gpt-4o-mini',
      openrouterModel: openrouterModel || ''
    };

    const repaired = await enforceVocabLimit(
      narration,
      vocabulary,
      jpdbApiKey,
      gameTerms,
      chat,
      aiConfig,
      jlptLevel || 'N4'
    );

    return repaired || narration;
  } catch (error) {
    console.error('[Vocab Repair] Error:', error.message);
    return narration;
  }
}

async function generateGameNarration(event, context, userKeys = {}) {
  if (debugMode) {
    console.log(`[Debug] Returning fallback narration for ${event}`);
    return getSimpleNarration(event, context);
  }

  const { jpdbApiKey, aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel } = userKeys;

  const vocabResult = getVocabulary();
  const vocabulary = vocabResult.words;
  const aiConfig = {
    provider: aiProvider || 'openai',
    apiKey: aiApiKey,
    openaiModel: openaiModel || 'gpt-4o-mini',
    openrouterModel: openrouterModel || ''
  };

  let narration;
  let suggestedWords = null;

  if (!aiConfig.apiKey || vocabulary.length === 0) {
    narration = getSimpleNarration(event, context);
  } else {
    if (jpdbApiKey && vocabulary.length > 0) {
      try {
        suggestedWords = await getSuggestionsForNarration(jpdbApiKey, vocabulary);
      } catch (e) {}
    }

    const gameState = {
      player: context.player || null,
      floor: context.floor || 1,
      enemy: context.enemy || null,
      combat: context.enemy ? { active: true, turn: context.turn || 0 } : null
    };

    narration = await generateNarration(
      chat,
      gameState,
      event,
      context,
      vocabulary,
      jlptLevel || 'N4',
      aiConfig,
      suggestedWords
    );

    if (!narration) {
      narration = getSimpleNarration(event, context);
    }
  }

  const gameTerms = [];
  if (context.enemy?.name) {
    gameTerms.push(context.enemy.name);
  }
  narration = await applyVocabRepair(narration, vocabulary, userKeys, gameTerms);

  trackNarrationStats(narration, jpdbApiKey);

  return narration;
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
  console.log(`JRPG server running at http://localhost:${PORT}`);
  console.log('[TTS] Prefetch:', settings.gameTtsEnabled ? 'enabled' : 'disabled');
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to play');
});
