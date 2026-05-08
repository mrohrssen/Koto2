import express from 'express';
import cors from 'cors';
import compression from 'compression';
import createRoutes from './routes/index.js';
import createAuthRoutes from './auth/routes.js';
import { dataPath, setDataDirForTest } from './data-dir.js';
import { migrateAiConsentForExistingUsers } from './auth/users.js';
import { chat } from './ai-providers.js';
import { DialogueTranslationCache } from './dialogue-translation/cache.js';
import { buildDialogueTranslationConfig } from './dialogue-translation/service.js';
import { DialogueLearnCache } from './dialogue-learn/cache.js';
import { buildDialogueLearnConfig } from './dialogue-learn/service.js';

// --- Shared helpers (reused by production and tests) ---

function enrichPlayerItems(player) {
  if (!player) return player;

  const enriched = { ...player };

  enriched.derivedStats = {
    atk: enriched.attack || 15
  };

  return enriched;
}

export function enrichGameState(manager) {
  const state = manager.getState();
  if (state.player) {
    state.player = enrichPlayerItems(state.player);
  }
  if (state.run?.player) {
    state.run.player = enrichPlayerItems(state.run.player);
  }
  return state;
}

// --- CORS whitelist ---

const ALLOWED_ORIGINS = [
  'https://jrpg-production.up.railway.app',
  'https://jrpg-dev.up.railway.app',
  'capacitor://localhost',      // iOS Capacitor WebView
  'https://localhost',          // Android Capacitor WebView
  'http://localhost:5173',      // Vite dev server
  'http://localhost:3000',      // Express dev server
];

// --- Safe defaults for route deps (tests get no-ops, production overrides all) ---

const DEFAULT_ROUTE_DEPS = {
  enrichGameState,
  getSettings: () => ({}),
  saveSettings: () => {},
  ttsCache: null,
  ttsDialogueCache: null,
  cancelPendingPrefetches: () => {},
  clearPrefetchCache: () => {},
  updateGameStatsWithEvent: () => {},
  saveGameStats: () => {},
  getGameStats: () => ({}),
  setGameStats: () => {},
  getDebugMode: () => false,
  setDebugMode: () => {},
  vocabCacheFile: '',
  staticWordList: [],
  getUserVocabulary: () => ({ words: [] }),
  getCreatureDialogueFromCache: () => null,
  getAllCreatureDialogueCache: () => ({}),
  queueMissingCreatureDialoguesFn: async () => {},
  regenCreatureDialogueFn: async () => {},
  getNpcDialogueFromCache: () => null,
  getAllNpcDialogueCache: () => ({}),
  clearNpcDialogueCache: () => {},
  clearCreatureDialogueCache: () => {},
  queueMissingNpcDialoguesFn: async () => {},
  logNpcEncounterFn: () => {},
  regenNpcDialogueFn: async () => {},
  setNpcMemoryFlagFn: () => {},
  updateNpcMemoryBondFn: () => {},
  checkSentenceViolations: (sentence) => ({ sentence: sentence || '', unknownWords: [], count: 0 }),
  dialogueTranslationCache: new DialogueTranslationCache(),
  dialogueTranslationChatFn: chat,
  getDialogueTranslationConfig: buildDialogueTranslationConfig,
  dialogueLearnCache: new DialogueLearnCache(),
  dialogueLearnChatFn: chat,
  getDialogueLearnConfig: buildDialogueLearnConfig,
};

/**
 * Create the Express app with API routes.
 * Shared between production (server.js) and integration tests.
 *
 * @param {object} opts
 * @param {string} [opts.dataDir] - Override data directory (wired up by data-dir.js)
 * @param {string} [opts.usersFile] - Override users JSON file path
 * @param {boolean} [opts.authBypass=false] - Set SKIP_AUTH=true for this app
 * @param {object} [opts.routeOverrides={}] - Override route deps (AI, TTS, narration, etc.)
 * @returns {express.Express}
 */
export function createApp({
  dataDir,
  usersFile,
  routeOverrides = {},
  authBypass = false
} = {}) {
  if (dataDir) setDataDirForTest(dataDir);
  if (authBypass) process.env.SKIP_AUTH = 'true';

  const app = express();
  app.locals.usersFile = usersFile || dataPath('.jrpg-users.json');

  const consentMigration = migrateAiConsentForExistingUsers({
    filePath: app.locals.usersFile,
    encryptionKey: process.env.ENCRYPTION_KEY || 'a'.repeat(64)
  });
  if (consentMigration.migratedUsers > 0) {
    console.log(`[Auth] Migrated AI consent for ${consentMigration.migratedUsers}/${consentMigration.totalUsers} users.`);
  }

  // Standard middleware
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
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // Auth routes (public, no auth required)
  app.use('/api/auth', createAuthRoutes({ usersFile: app.locals.usersFile }));

  // Main API routes — merge caller deps over safe defaults
  const routeDeps = { ...DEFAULT_ROUTE_DEPS, ...routeOverrides };
  app.use('/api', createRoutes(routeDeps));

  return app;
}
