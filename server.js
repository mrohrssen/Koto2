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
 * Run: /game/start-run, /game/forfeit, /game/select-area, /game/proceed
 * Room: /game/room, /game/proceed, /game/room-encounter, /game/door-hints
 * Combat: /game/start-creature-encounter, /game/creature-combat-cycle, /game/combat-end-narration
 * Economy: /game/shop-skip, /game/dealer-state, /game/dealer-sell, /game/dealer-buy
 * Creatures: /game/creature-collection, /game/swap-creature, /game/befriend-conversation
 * Meta: /game/achievements, /game/lifetime-stats
 *
 * DEPENDENCIES:
 * - ./src/jpdb.js - JPDB API integration
 * - ./src/ai-providers.js - OpenAI/Anthropic/Google AI
 * - ./src/voicevox.js - TTS synthesis
 * - ./src/game/loop.js - GameManager class
 * - ./src/game/dm.js - AI narration generation
 * - ./src/game/state.js - State factories, achievements
 * - ./src/game-stats.js - Statistics tracking
 *
 * KEY INTERNAL FUNCTIONS:
 * - loadSettings() / saveSettings() - Settings persistence
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
 * - Prefetch system disabled (requires server-side keys)
 * - TTS proxied to VOICEVOX_URL environment variable
 * - Game data saved to .jrpg-*.json files
 *
 * CLAUDE HINTS:
 * - For game logic, trace through GameManager methods in loop.js
 * - JPDB endpoints extract jpdbApiKey from req.body
 * - Game endpoints pass req.body as userKeys to helper functions
 * - Settings split: API keys in client localStorage, TTS/JLPT on server
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
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
  getProviders
} from './src/ai-providers.js';

import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from './src/voicevox.js';

// Game imports
import { GameManager } from './src/game/loop.js';
import { ACHIEVEMENTS } from './src/game/state.js';
import {
  loadGameStats, saveGameStats,
  updateGameStatsWithWords, updateGameStatsWithEvent,
  getGameStatsForPeriod, getGameStatsAvailableDates, resetGameStats
} from './src/game-stats.js';
import {
  configureVocabManager,
  refreshWordStateCache, getVocabManagerStats, invalidateWordStateCache as invalidateVocabManagerCache,
  getNarrationVocabularyForUser
} from './src/game/vocab-manager.js';
import {
  getCachedAudio, clearCache as clearPrefetchCache,
  setTTSSynthesizer, updateTTSConfig, cancelPendingPrefetches
} from './src/game/prefetch.js';
import { checkSentenceViolations } from './src/game/vocab-repair.js';
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
import { createDevRouter } from './src/routes/dev.js';
import { createForgeRouter } from './src/routes/forge.js';
import { createSpriteForgeRouter } from './src/routes/sprite-forge.js';
import createAdminRoutes from './src/routes/admin.js';
import { dataPath } from './src/data-dir.js';
import { loadDialoguePools } from './src/game/dialogue-loader.js';
import { logger } from './src/logger.js';
import { TtsCache } from './src/services/tts-cache.js';
import { TtsDialogueCache } from './src/services/tts-dialogue-cache.js';
import { setupPvpSockets } from './src/pvp/socket-handler.js';

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

// Load hardcoded dialogue pools (CID scripts, NPC lines, barks)
loadDialoguePools(join(process.cwd(), 'data'));

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
setupPvpSockets(io);
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
    // Player voice gender ('boy' or 'girl')
    voiceGender: 'boy',
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
const ALLOWED_ORIGINS = [
  'https://jrpg-production.up.railway.app',
  'https://jrpg-dev.up.railway.app',
  'capacitor://localhost',      // iOS Capacitor WebView
  'https://localhost',          // Android Capacitor WebView
  'http://localhost:5173',      // Vite dev server
  'http://localhost:3000',      // Express dev server
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // TODO: tighten to callback(new Error('CORS')) after testing
    }
  },
  credentials: true
}));
// Prevent WebView from caching stale API responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(compression()); // Gzip/Brotli compression for all responses
app.use(express.json({ limit: '10mb' })); // Increased for bug report screenshots

// Static files - serve from dist/ (Vite build) in production, public/ in dev
const staticDir = process.env.NODE_ENV === 'production' && existsSync(join(__dirname, 'dist'))
  ? join(__dirname, 'dist')
  : join(__dirname, 'public');

app.use(express.static(staticDir, {
  maxAge: 0,              // No caching by default
  etag: false,            // Disable ETags for fresh loads
  lastModified: false,    // Disable Last-Modified for fresh loads
  setHeaders: (res, filePath) => {
    // Only cache webp images and mp3 audio (sprites, backgrounds, music)
    if (filePath.endsWith('.webp') || filePath.endsWith('.mp3')) {
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
  console.log(`Loaded meta-progression`);
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

const CREATURE_SPEECH = JSON.parse(readFileSync(join(__dirname, 'data', 'creature-speech.json'), 'utf-8'));

function enrichGameState(manager) {
  const state = manager.getState();
  if (state.player) {
    state.player = enrichPlayerItems(state.player);
  }
  if (state.run?.player) {
    state.run.player = enrichPlayerItems(state.run.player);
  }
  state.creatureSpeech = CREATURE_SPEECH;
  return state;
}

// ============ API Routes ============

// Mount auth routes (public, no auth required)
app.use('/api/auth', createAuthRoutes());

// TTS disk cache — loads existing manifest, or auto-generates on first boot
const ttsCache = new TtsCache(join(__dirname, 'data', 'tts-cache'));
ttsCache.load();
const voicevoxUrl = process.env.VOICEVOX_URL || 'http://localhost:50021';
ttsCache.generateIfMissing(join(__dirname, 'data'), voicevoxUrl);

// Per-user dialogue TTS cache
const ttsDialogueCache = new TtsDialogueCache(join(__dirname, 'data', 'tts-dialogue'));

// Build TTS options for narration engine dialogue generation
function buildTtsOptions() {
  if (!settings.gameTtsEnabled) return null;

  const PLAYER_BOY_SPEAKER_ID = 11;    // 玄野武宏 ノーマル
  const PLAYER_GIRL_SPEAKER_ID = 2;    // 四国めたん ノーマル
  const CREATURE_SPEAKER_ID = 21;      // 剣崎雌雄 ノーマル

  const playerSpeakerId = settings.voiceGender === 'girl'
    ? PLAYER_GIRL_SPEAKER_ID
    : PLAYER_BOY_SPEAKER_ID;

  return {
    ttsDialogueCache,
    playerSpeakerId,
    getEntitySpeakerId: (entityId, entityType) => {
      if (entityType === 'creature') return CREATURE_SPEAKER_ID;
      try {
        const npcs = JSON.parse(readFileSync(join(__dirname, 'data', 'npcs.json'), 'utf-8'));
        return npcs[entityId]?.speakerId || 13;
      } catch {
        return 13;
      }
    },
    synthesizeFn: async (text, speakerId) => {
      return synthesize(text, speakerId, {
        speedScale: settings.gameTtsSpeed ?? 0.9,
        volumeScale: settings.gameTtsVolume ?? 1.0
      });
    }
  };
}

// Mount extracted route modules
app.use('/api', createRoutes({
  getSettings: () => settings,
  saveSettings: saveSettings,
  ttsCache,
  ttsDialogueCache,
  enrichGameState,
  cancelPendingPrefetches,
  clearPrefetchCache,
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
    queueNpcDialogues(userId, chat, aiConfig, vocabContext, 'creature', buildTtsOptions()),
  regenCreatureDialogueFn: async (userId, creatureId, aiConfig, vocabContext) =>
    regenNpcDialogue(userId, creatureId, chat, aiConfig, vocabContext, 'creature', buildTtsOptions()),
  // NPC narration engine deps
  getNpcDialogueFromCache,
  getAllNpcDialogueCache,
  clearNpcDialogueCache,
  clearCreatureDialogueCache: (userId) =>
    clearNpcDialogueCache(userId, 'creature'),
  queueMissingNpcDialoguesFn: async (userId, aiConfig, vocabContext) => {
    return queueNpcDialogues(userId, chat, aiConfig, vocabContext, 'npc', buildTtsOptions());
  },
  logNpcEncounterFn: logNpcEncounter,
  regenNpcDialogueFn: async (userId, npcId, aiConfig, vocabContext) => {
    return regenNpcDialogue(userId, npcId, chat, aiConfig, vocabContext, 'npc', buildTtsOptions());
  },
  setNpcMemoryFlagFn: setNpcMemoryFlag,
  updateNpcMemoryBondFn: updateNpcMemoryBond,
  checkSentenceViolations
}));

// Dev tools (sprite review dashboard)
const devPassword = process.env.DEV_DASHBOARD_PASSWORD || '';
if (devPassword) {
  app.use('/dev', createDevRouter({ password: devPassword }));
} else if (process.env.NODE_ENV !== 'production') {
  app.use('/dev', createDevRouter({ password: '' }));
}

function getUserNarrationVocabulary(userId) {
  const vocabResult = getVocabulary();
  const fallbackVocabulary = Array.isArray(vocabResult?.words) ? vocabResult.words : [];
  return getNarrationVocabularyForUser(userId, fallbackVocabulary);
}

// ============ Theme Pool Submit ============

app.post('/api/theme-pool/submit', async (req, res) => {
  try {
    const { themeId, areaWord, areaReading, areaMeaning, areaRank, words } = req.body;

    // Validate required fields
    if (!themeId || typeof themeId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid themeId (must be a string)' });
    }
    if (!areaWord || typeof areaWord !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid areaWord (must be a string)' });
    }
    if (!areaReading || typeof areaReading !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid areaReading (must be a string)' });
    }
    if (!areaMeaning || typeof areaMeaning !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid areaMeaning (must be a string)' });
    }
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'Missing or empty words array' });
    }

    // Dynamic import ESM helpers
    const { assignRoles, crossReferenceExisting, computeThemeStats } =
      await import('./scripts/lib/theme-pool-helpers.mjs');
    const { saveTheme, validateTheme } = await import('./scripts/lib/theme-utils.mjs');

    // Map JPDB short POS tags to the longer form expected by assignRoles
    const wordsWithPosTag = words.map(w => {
      let posTag = 'noun'; // default fallback
      const pos = (w.pos || '').toLowerCase();
      if (pos.includes('v')) {
        posTag = 'godan verb';
      } else if (pos.includes('adj')) {
        posTag = 'adjective';
      } else if (pos.includes('n')) {
        posTag = 'noun';
      }
      return { ...w, posTag };
    });

    // Assign roles based on POS
    const withRoles = assignRoles(wordsWithPosTag);

    // Cross-reference existing game data
    const withExisting = crossReferenceExisting(withRoles);

    // Compute stats
    const { avgRank, computedStage } = computeThemeStats(withExisting);

    // Build theme object
    const theme = {
      themeId,
      areaWord,
      areaReading,
      areaMeaning,
      areaRank: areaRank || null,
      avgRank,
      computedStage,
      generatedAt: new Date().toISOString().split('T')[0],
      words: withExisting.map(w => ({
        word: w.word,
        reading: w.reading,
        meaning: w.meaning,
        rank: w.rank,
        roles: w.roles,
        source: w.source || 'consensus',
        consensus: w.consensus,
        assigned: null,
        existingUses: w.existingUses || [],
      }))
    };

    // Validate
    const errors = validateTheme(theme);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Theme validation failed', errors });
    }

    // Save JSON
    const savedPath = saveTheme(theme);

    // Write CSV alongside JSON
    const csvPath = savedPath.replace(/\.json$/, '.csv');
    const csvHeader = 'word,reading,meaning,rank,source,existingUses';
    const csvRows = theme.words.map(w => {
      const escapeCsv = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      const existingStr = Array.isArray(w.existingUses) ? w.existingUses.join('; ') : '';
      return [
        escapeCsv(w.word),
        escapeCsv(w.reading),
        escapeCsv(w.meaning),
        w.rank,
        escapeCsv(w.source),
        escapeCsv(existingStr)
      ].join(',');
    });
    writeFileSync(csvPath, csvHeader + '\n' + csvRows.join('\n') + '\n', 'utf8');

    res.json({
      success: true,
      themeId,
      wordCount: words.length,
      computedStage,
      path: `language/themes/${themeId}.json`
    });
  } catch (error) {
    console.error('[Theme Pool Submit] Error:', error);
    res.status(500).json({ error: 'Failed to save theme pool', details: error.message });
  }
});

// ============ Forge Workbench ============
app.use('/api/forge', createForgeRouter({
  themesDir: join(__dirname, 'language', 'themes'),
  dataDir: join(__dirname, 'data')
}));

// ============ Sprite Forge ============
app.use('/api/sprite-forge', createSpriteForgeRouter({
  projectRoot: __dirname
}));

// ============ Admin (simulator) ============
app.use('/api/admin', createAdminRoutes({ dataDir: dataPath('') }));

// Serve game page
app.get('/', (req, res) => {
  res.sendFile(join(staticDir, 'index.html'));
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
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info('[Server] Started:', { port: PORT, env: process.env.NODE_ENV || 'development' });
  logger.info('[Server] Log level:', logger.getLevel());
  console.log(`JRPG server running at http://localhost:${PORT}`);
  console.log('[TTS] Prefetch:', settings.gameTtsEnabled ? 'enabled' : 'disabled');
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to play');
});
