// JRPG Server
// Japanese vocabulary learning RPG

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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
import { getItem, getSkill, CONSUMABLES, SKILLS, calculateEquipmentBonuses } from './src/game/items.js';
import { getChipLoadout, equipChip, unequipChip } from './src/game/items/chips.js';
import { generateNarration, getSimpleNarration } from './src/game/dm.js';
import { ACHIEVEMENTS, allocateStat, getFullPlayerStats } from './src/game/state.js';
import { calculateDerivedStats, getStatPointCost, STAT_NAMES, STAT_DESCRIPTIONS } from './src/game/stats.js';
import {
  loadGameStats, saveGameStats, updateGameStatsWithNarration,
  updateGameStatsWithWords, updateGameStatsWithEvent,
  getGameStatsForPeriod, getGameStatsAvailableDates, resetGameStats
} from './src/game-stats.js';
import {
  initVocabManager, getSuggestionsForNarration, addUsedWords,
  refreshWordStateCache, getVocabManagerStats, invalidateWordStateCache
} from './src/game/vocab-manager.js';
import {
  getCachedNarration, getCachedAudio, clearCache as clearPrefetchCache,
  clearCombatCache, setPrefetchGenerator, setTTSSynthesizer,
  updateTTSConfig, predictAndPrefetch, cancelPendingPrefetches,
  getStats as getPrefetchStats, resetStats as resetPrefetchStats,
  getCacheContents, eagerPrefetchForRun, queuePrefetch
} from './src/game/prefetch.js';
import { enforceVocabLimit } from './src/game/vocab-repair.js';

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
  const defaults = {
    jpdbApiKey: process.env.JPDB_API_KEY || '',
    jpdbDeckId: 'all',
    aiProvider: 'openai',
    aiApiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || '',
    jlptLevel: 'N5',
    openaiModel: 'gpt-4o-mini',
    openrouterModel: 'anthropic/claude-3.5-sonnet',
    // Game TTS Settings (narrator voice)
    gameTtsEnabled: false,
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
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

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

function saveGameData() {
  try {
    const data = {
      player: gameManager.player,
      meta: gameManager.meta,
      savedAt: new Date().toISOString()
    };
    writeFileSync(GAME_SAVE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Failed to save game:', e.message);
  }
}

// Load game save on startup
const gameSave = loadGameSave();
if (gameSave?.player) {
  gameManager.loadPlayer(gameSave.player);
  console.log(`Loaded game save for ${gameSave.player.name}`);
}
gameManager.initMeta(gameSave?.meta || null);
if (gameSave?.meta) {
  console.log(`Loaded meta-progression: ${gameSave.meta.essence} essence`);
}

// Helper to enrich player items with full item data
function enrichPlayerItems(player) {
  if (!player) return player;

  const enriched = { ...player };

  if (enriched.items) {
    enriched.items = enriched.items.map(item => {
      const itemDef = getItem(item.id);
      return {
        ...item,
        name: itemDef?.name || item.id,
        description: itemDef?.description,
        slot: itemDef?.slot || null,
        type: itemDef?.type || 'consumable',
        rarity: itemDef?.rarity || 'common'
      };
    });
  }

  if (enriched.equipment) {
    const slots = ['weapon', 'body', 'shield', 'accessory'];
    for (const slot of slots) {
      if (enriched.equipment[slot]) {
        const itemDef = getItem(enriched.equipment[slot].id);
        enriched.equipment[slot] = {
          ...enriched.equipment[slot],
          name: itemDef?.name || enriched.equipment[slot].id,
          slot: slot,
          rarity: itemDef?.rarity || 'common'
        };
      }
    }
  }

  if (enriched.skills) {
    enriched.skills = enriched.skills.map(skill => {
      const skillDef = getSkill(skill.id);
      return {
        ...skill,
        name: skillDef?.name || skill.id,
        spCost: skillDef?.spCost || 0,
        description: skillDef?.description
      };
    });
  }

  if (enriched.stats) {
    const equipBonuses = calculateEquipmentBonuses(enriched);
    const derived = calculateDerivedStats(enriched.stats, enriched.level, equipBonuses);

    enriched.derivedStats = {
      atk: derived.atk,
      def: derived.def,
      matk: derived.matk,
      mdef: derived.mdef,
      hit: derived.hit,
      flee: derived.flee,
      crit: derived.crit,
      critShield: derived.critShield,
      perfectDodge: derived.perfectDodge
    };

    enriched.statCosts = {
      str: getStatPointCost(enriched.stats.str),
      agi: getStatPointCost(enriched.stats.agi),
      vit: getStatPointCost(enriched.stats.vit),
      int: getStatPointCost(enriched.stats.int),
      dex: getStatPointCost(enriched.stats.dex),
      luk: getStatPointCost(enriched.stats.luk)
    };
  }

  return enriched;
}

function getEnrichedGameState() {
  const state = gameManager.getState();
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

// Config
app.get('/api/config', (req, res) => {
  res.json({
    providers: getProviders(),
    jlptLevels: getJLPTLevels()
  });
});

// Settings
app.get('/api/settings', (req, res) => {
  updateTTSConfig({
    enabled: settings.gameTtsEnabled || false,
    speakerId: settings.gameTtsSpeakerId || 13,
    speed: settings.gameTtsSpeed || 0.9,
    volume: settings.gameTtsVolume || 1.0
  });

  res.json({
    ...settings,
    jpdbApiKey: settings.jpdbApiKey ? '********' : '',
    aiApiKey: settings.aiApiKey ? '********' : '',
    openaiModel: settings.openaiModel || 'gpt-4o-mini',
    openrouterModel: settings.openrouterModel || '',
    gameTtsEnabled: settings.gameTtsEnabled || false,
    gameTtsSpeakerId: settings.gameTtsSpeakerId || 13,
    gameTtsSpeed: settings.gameTtsSpeed || 0.9,
    gameTtsVolume: settings.gameTtsVolume || 1.0
  });
});

app.post('/api/settings', (req, res) => {
  const { jpdbApiKey, jpdbDeckId, aiProvider, aiApiKey, jlptLevel, openaiModel, openrouterModel,
          gameTtsEnabled, gameTtsSpeakerId, gameTtsSpeed, gameTtsVolume,
          reviewType } = req.body;

  if (jpdbApiKey && jpdbApiKey !== '********') {
    settings.jpdbApiKey = jpdbApiKey;
    clearVocabCache();
  }
  if (jpdbDeckId !== undefined) {
    settings.jpdbDeckId = jpdbDeckId;
    clearVocabCache();
  }
  if (aiProvider) settings.aiProvider = aiProvider;
  if (aiApiKey && aiApiKey !== '********') settings.aiApiKey = aiApiKey;
  if (jlptLevel) settings.jlptLevel = jlptLevel;
  if (openaiModel !== undefined) settings.openaiModel = openaiModel;
  if (openrouterModel !== undefined) settings.openrouterModel = openrouterModel;

  if (gameTtsEnabled !== undefined) settings.gameTtsEnabled = gameTtsEnabled;
  if (gameTtsSpeakerId !== undefined) settings.gameTtsSpeakerId = gameTtsSpeakerId;
  if (gameTtsSpeed !== undefined) settings.gameTtsSpeed = gameTtsSpeed;
  if (gameTtsVolume !== undefined) settings.gameTtsVolume = gameTtsVolume;

  if (reviewType !== undefined) settings.reviewType = reviewType;

  if (gameTtsEnabled !== undefined || gameTtsSpeakerId !== undefined ||
      gameTtsSpeed !== undefined || gameTtsVolume !== undefined) {
    updateTTSConfig({
      enabled: settings.gameTtsEnabled,
      speakerId: settings.gameTtsSpeakerId,
      speed: settings.gameTtsSpeed,
      volume: settings.gameTtsVolume
    });
  }

  saveSettings(settings);
  res.json({ success: true });
});

// TTS Routes
app.get('/api/tts/status', async (req, res) => {
  const running = await isVoicevoxRunning();
  let version = null;
  let speakers = [];

  if (running) {
    try {
      version = await getVoicevoxVersion();
      speakers = await getSpeakers();
    } catch (e) {}
  }

  res.json({ running, version, speakers });
});

app.get('/api/tts/speakers', async (req, res) => {
  try {
    const speakers = await getSpeakers();
    res.json(speakers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tts/synthesize', async (req, res) => {
  const { text, speakerId, speedScale, volumeScale } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const audioBuffer = await synthesize(text, speakerId || 13, {
      speedScale: speedScale || settings.gameTtsSpeed || 0.9,
      volumeScale: volumeScale || settings.gameTtsVolume || 1.0
    });

    res.set('Content-Type', 'audio/wav');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tts/cached/:key', async (req, res) => {
  const cached = await getCachedAudio(req.params.key);
  if (cached) {
    res.set('Content-Type', 'audio/wav');
    res.send(Buffer.from(cached));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// JPDB/Vocab Routes
app.get('/api/vocab/status', async (req, res) => {
  if (!settings.jpdbApiKey) {
    return res.json({ connected: false, error: 'No API key configured' });
  }

  const result = await testConnection(settings.jpdbApiKey);
  res.json(result);
});

app.get('/api/vocab/words', async (req, res) => {
  const vocabResult = getVocabulary();
  res.json({
    words: vocabResult.words,
    count: vocabResult.words.length,
    source: vocabResult.source
  });
});

app.post('/api/vocab/fetch', async (req, res) => {
  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    let result;
    if (settings.jpdbDeckId === 'all') {
      result = await fetchAllDecksVocabulary(settings.jpdbApiKey);
    } else {
      result = await fetchDeckVocabulary(settings.jpdbApiKey, settings.jpdbDeckId);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jpdb/parse', async (req, res) => {
  const { text } = req.body;

  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    const tokens = await parseText(settings.jpdbApiKey, text);
    res.json({ tokens });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jpdb/review', async (req, res) => {
  const { vid, sid, grade } = req.body;

  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    const result = await reviewVocabulary(settings.jpdbApiKey, vid, sid, grade);

    // Invalidate local cache so this word won't reappear as "due" immediately
    invalidateWordStateCache(parseInt(vid, 10));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jpdb/lookup', async (req, res) => {
  const { vid, sid } = req.query;

  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  if (!vid || !sid) {
    return res.status(400).json({ error: 'vid and sid are required' });
  }

  try {
    const result = await lookupVocabularyMeaning(
      settings.jpdbApiKey,
      parseInt(vid, 10),
      parseInt(sid, 10)
    );

    if (!result) {
      return res.status(404).json({ error: 'Vocabulary not found' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Narration helpers
function trackNarrationStats(narration) {
  if (!narration) return;

  updateGameStatsWithNarration(gameStats, narration);
  saveGameStats(gameStats);

  if (settings.jpdbApiKey) {
    try {
      addUsedWords(narration, settings.jpdbApiKey);
    } catch (e) {}
  }
}

async function applyVocabRepair(narration, vocabulary, gameTerms = []) {
  if (!settings.jpdbApiKey || !vocabulary?.length) return narration;

  try {
    const aiConfig = {
      provider: settings.aiProvider,
      apiKey: settings.aiApiKey,
      openaiModel: settings.openaiModel,
      openrouterModel: settings.openrouterModel
    };

    const repaired = await enforceVocabLimit(
      narration,
      vocabulary,
      settings.jpdbApiKey,
      gameTerms,
      chat,
      aiConfig,
      settings.jlptLevel || 'N4'
    );

    return repaired || narration;
  } catch (error) {
    console.error('[Vocab Repair] Error:', error.message);
    return narration;
  }
}

async function generateGameNarration(event, context) {
  if (debugMode) {
    console.log(`[Debug] Returning fallback narration for ${event}`);
    return getSimpleNarration(event, context);
  }

  const cachedNarration = getCachedNarration(event, context);
  if (cachedNarration) {
    console.log(`[Prefetch] Using cached narration for ${event}`);
    trackNarrationStats(cachedNarration);
    triggerPrefetch(event, context);
    return cachedNarration;
  }

  const vocabResult = getVocabulary();
  const vocabulary = vocabResult.words;
  const jlptLevel = settings.jlptLevel || 'N4';
  const aiConfig = {
    provider: settings.aiProvider,
    apiKey: settings.aiApiKey,
    openaiModel: settings.openaiModel,
    openrouterModel: settings.openrouterModel
  };

  let narration;
  let suggestedWords = null;

  if (!aiConfig.apiKey || vocabulary.length === 0) {
    narration = getSimpleNarration(event, context);
  } else {
    if (settings.jpdbApiKey && vocabulary.length > 0) {
      try {
        suggestedWords = await getSuggestionsForNarration(settings.jpdbApiKey, vocabulary);
      } catch (e) {}
    }

    const gameState = {
      player: gameManager.run?.player || gameManager.player,
      floor: gameManager.run?.floor || 1,
      enemy: gameManager.combat?.enemy,
      combat: gameManager.combat ? {
        active: gameManager.combat.active,
        turn: gameManager.combat.turn
      } : null
    };

    narration = await generateNarration(
      chat,
      gameState,
      event,
      context,
      vocabulary,
      jlptLevel,
      aiConfig,
      suggestedWords
    );

    if (!narration) {
      narration = getSimpleNarration(event, context);
    }
  }

  const gameTerms = [];
  if (gameManager.combat?.enemy?.name) {
    gameTerms.push(gameManager.combat.enemy.name);
  }
  narration = await applyVocabRepair(narration, vocabulary, gameTerms);

  trackNarrationStats(narration);
  triggerPrefetch(event, context);

  return narration;
}

function triggerPrefetch(event, context) {
  predictAndPrefetch(event, context, gameManager);
}

function queueRunStartPrefetch() {
  queuePrefetch('runStart', {
    player: gameManager.player
  });
}

// ============ Game Routes ============

app.get('/api/game/state', (req, res) => {
  res.json(getEnrichedGameState());
});

app.post('/api/game/allocate-stat', (req, res) => {
  const { stat } = req.body;

  if (!stat) {
    return res.status(400).json({ error: 'Stat name required' });
  }

  const player = gameManager.run?.player || gameManager.player;

  if (!player) {
    return res.status(400).json({ error: 'No player exists' });
  }

  const result = allocateStat(player, stat);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  saveGameData();
  res.json({ success: true, result, state: getEnrichedGameState() });
});

app.get('/api/game/stat-info', (req, res) => {
  res.json({
    statNames: STAT_NAMES,
    statDescriptions: STAT_DESCRIPTIONS,
    costFormula: 'floor((currentValue - 1) / 10) + 2'
  });
});

app.post('/api/game/create-player', async (req, res) => {
  const { name, stats, statPoints } = req.body;

  gameManager.createPlayer(name || 'Hunter', stats || null, statPoints ?? null);
  saveGameData();

  const narration = await generateGameNarration('runStart', gameManager.player);
  queueRunStartPrefetch();

  res.json({
    state: gameManager.getState(),
    narration
  });
});

app.post('/api/game/start-run', async (req, res) => {
  try {
    gameManager.startRun();
    eagerPrefetchForRun(gameManager);

    const narration = await generateGameNarration('runStart', {
      player: gameManager.run.player
    });

    saveGameData();
    res.json({
      state: getEnrichedGameState(),
      narration
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Ward selection endpoints (Phase 12)
app.get('/api/game/starting-wards', (req, res) => {
  try {
    const options = gameManager.getStartingWardOptions();
    res.json(options);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/select-starting-ward', async (req, res) => {
  try {
    const { wardId } = req.body;
    const result = gameManager.selectStartingWard(wardId);
    saveGameData();
    res.json({
      ...result,
      state: getEnrichedGameState()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/game/next-ward-options', (req, res) => {
  try {
    const options = gameManager.getNextWardOptions();
    res.json(options);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/select-next-ward', async (req, res) => {
  try {
    const { wardId } = req.body;
    const result = gameManager.selectNextWard(wardId);
    saveGameData();
    res.json({
      ...result,
      state: getEnrichedGameState()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Chip loadout endpoints (Phase 11)
app.get('/api/game/chip-loadout', (req, res) => {
  try {
    // Use run player if in a run, otherwise base player
    const player = gameManager.run?.player || gameManager.player;
    const runStats = gameManager.run?.runStats || {};
    const loadout = getChipLoadout(player, runStats);
    res.json(loadout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/equip-chip', (req, res) => {
  try {
    const { equipmentSlot, chipId } = req.body;
    const player = gameManager.run?.player || gameManager.player;
    const result = equipChip(player, equipmentSlot, chipId);
    if (result.success) saveGameData();
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/unequip-chip', (req, res) => {
  try {
    const { equipmentSlot, chipId } = req.body;
    const player = gameManager.run?.player || gameManager.player;
    const result = unequipChip(player, equipmentSlot, chipId);
    if (result.success) saveGameData();
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/enter-floor', async (req, res) => {
  try {
    const floor = gameManager.enterFloor();
    const narration = await generateGameNarration('floorEnter', {
      floor,
      player: gameManager.run.player
    });

    saveGameData();
    res.json({
      state: getEnrichedGameState(),
      narration
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/attack', async (req, res) => {
  const { attackType } = req.body;
  try {
    const result = gameManager.attack(attackType);

    let narration = null;
    if (result.enemyDefeated) {
      clearCombatCache();

      if (result.rewards) {
        const enrichedRewards = enrichRewardDrops(result.rewards);
        result.rewards = enrichedRewards;
      }

      updateGameStatsWithEvent(gameStats, 'combat', {
        victory: true,
        turns: gameManager.combat?.turn,
        enemyName: result.enemy?.name
      });
      saveGameStats(gameStats);

      narration = await generateGameNarration('victory', {
        player: gameManager.run.player,
        enemy: result.enemy,
        rewards: result.rewards
      });
    }

    saveGameData();
    res.json({
      ...result,
      state: getEnrichedGameState(),
      narration
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/realtime-attack', (req, res) => {
  const { attackerType } = req.body;
  try {
    const result = gameManager.realtimeAttackCycle(attackerType || 'player');
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/combat-end-narration', async (req, res) => {
  const { victory, expGained, goldGained, loot, leveledUp, newLevel, isBoss } = req.body;
  try {
    let narration;
    const enemy = gameManager.combat?.enemy;

    if (victory) {
      const rewards = { xp: expGained, gold: goldGained, drops: loot };
      const enrichedRewards = enrichRewardDrops(rewards);
      updateGameStatsWithEvent(gameStats, 'combat', {
        victory: true,
        enemyName: enemy?.name
      });
      saveGameStats(gameStats);

      narration = await generateGameNarration('victory', {
        player: gameManager.run?.player,
        enemy,
        rewards: enrichedRewards
      });
    } else {
      narration = await generateGameNarration('defeat', {
        player: gameManager.run?.player,
        enemy
      });
    }

    res.json({ narration, state: getEnrichedGameState() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game/defend', async (req, res) => {
  try {
    const result = gameManager.defend();
    const narration = await generateGameNarration('playerDefend', {
      player: gameManager.run.player,
      enemy: gameManager.combat?.enemy,
      result
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/magic', async (req, res) => {
  const { skillId } = req.body;
  try {
    const result = gameManager.magic(skillId);

    let narration = null;
    if (result.enemyDefeated) {
      narration = await generateGameNarration('victory', {
        player: gameManager.run.player,
        enemy: result.enemy,
        rewards: result.rewards
      });
    }

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/use-item', async (req, res) => {
  const { itemId } = req.body;
  try {
    const result = gameManager.useItem(itemId);

    let narration = null;
    if (gameManager.combat?.active) {
      narration = await generateGameNarration('itemUsed', {
        player: gameManager.run.player,
        item: result.item,
        effect: result.message
      });
    }

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/equip', (req, res) => {
  const { itemId } = req.body;
  try {
    const result = gameManager.equipItem(itemId);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/unequip', (req, res) => {
  const { slot } = req.body;
  try {
    const result = gameManager.unequipItem(slot);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/flee', async (req, res) => {
  try {
    const result = gameManager.flee();

    const narration = await generateGameNarration(result.success ? 'fleeSuccess' : 'fleeFail', {
      player: gameManager.run.player,
      enemy: gameManager.combat?.enemy
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/enemy-turn', async (req, res) => {
  try {
    const result = gameManager.enemyTurn();

    let narration = null;
    let isGameOver = false;

    if (result.playerDefeated) {
      clearCombatCache();

      updateGameStatsWithEvent(gameStats, 'combat', {
        victory: false,
        enemyName: gameManager.combat?.enemy?.name
      });
      updateGameStatsWithEvent(gameStats, 'death', {
        floor: gameManager.run.floor,
        cause: 'combat'
      });
      saveGameStats(gameStats);

      isGameOver = true;
      narration = await generateGameNarration('defeat', {
        player: gameManager.run.player,
        enemy: gameManager.combat?.enemy,
        attack: result.attack
      });
    }

    saveGameData();
    res.json({
      ...result,
      state: getEnrichedGameState(),
      narration,
      isGameOver
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/next-floor', async (req, res) => {
  try {
    const floor = gameManager.nextFloor();
    const narration = await generateGameNarration('floorEnter', {
      floor: gameManager.run.floor,
      player: gameManager.run.player
    });

    saveGameData();
    res.json({ state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/proceed', async (req, res) => {
  try {
    const room = gameManager.proceedToNextRoom();

    let narration = null;
    if (room.type === 'monster') {
      narration = await generateGameNarration('encounterStart', {
        enemy: room.enemy,
        player: gameManager.run.player
      });
    }

    saveGameData();
    res.json({ room, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/shop-buy', async (req, res) => {
  const { itemId } = req.body;
  try {
    const result = gameManager.buyFromShop(itemId);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/shop-skip', async (req, res) => {
  try {
    const result = gameManager.skipShop();
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/post-combat-shop-buy', async (req, res) => {
  const { itemIndex } = req.body;
  try {
    const result = gameManager.buyFromPostCombatShop(itemIndex);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/disarm', async (req, res) => {
  try {
    const result = gameManager.disarmTrap();

    const narration = await generateGameNarration(result.success ? 'trapDisarm' : 'trapFail', {
      player: gameManager.run.player,
      trap: result.trap
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/trigger-trap', async (req, res) => {
  try {
    const result = gameManager.triggerTrap();

    const narration = await generateGameNarration('trapTrigger', {
      player: gameManager.run.player,
      damage: result.damage
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/loot', async (req, res) => {
  try {
    const result = gameManager.lootBody();

    const narration = await generateGameNarration('loot', {
      player: gameManager.run.player,
      loot: result.loot
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/skip-body', async (req, res) => {
  try {
    const result = gameManager.skipBody();
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/skip-treasure', async (req, res) => {
  try {
    const result = gameManager.skipTreasure();
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/open-treasure', async (req, res) => {
  try {
    const result = gameManager.openTreasure();

    const narration = await generateGameNarration('treasure', {
      player: gameManager.run.player,
      treasure: result.item
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/use-shrine', async (req, res) => {
  try {
    const result = gameManager.useShrine();

    const narration = await generateGameNarration('shrine', {
      player: gameManager.run.player,
      effect: result.effect
    });

    saveGameData();
    res.json({ ...result, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/game/shop', (req, res) => {
  const shop = gameManager.getShopInventory();
  res.json(shop || { items: [] });
});

app.post('/api/game/shop/buy', (req, res) => {
  const { itemId } = req.body;
  try {
    const result = gameManager.buyFromShop(itemId);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/game/refine-preview', (req, res) => {
  const { itemId } = req.query;
  const preview = gameManager.getRefinePreview(itemId);
  res.json(preview || { error: 'Cannot preview' });
});

app.post('/api/game/refine', async (req, res) => {
  const { itemId } = req.body;
  try {
    const result = gameManager.refineEquipment(itemId);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/start-encounter', async (req, res) => {
  try {
    const encounter = gameManager.startEncounter();
    const narration = await generateGameNarration('encounterStart', {
      enemy: encounter.enemy,
      player: gameManager.run.player
    });

    saveGameData();
    res.json({ ...encounter, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/start-boss', async (req, res) => {
  try {
    const encounter = gameManager.startBossEncounter();
    const narration = await generateGameNarration('bossStart', {
      enemy: encounter.enemy,
      player: gameManager.run.player
    });

    saveGameData();
    res.json({ ...encounter, state: getEnrichedGameState(), narration });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/forfeit', (req, res) => {
  const result = gameManager.forfeitRun();
  cancelPendingPrefetches();
  clearPrefetchCache();
  saveGameData();
  res.json({ ...result, state: getEnrichedGameState() });
});

app.post('/api/game/narrate', async (req, res) => {
  const { event, context } = req.body;
  try {
    const narration = await generateGameNarration(event, context);
    res.json({ narration });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/meta', (req, res) => {
  res.json({
    meta: gameManager.meta,
    state: getEnrichedGameState()
  });
});

app.get('/api/game/upgrades', (req, res) => {
  const upgrades = gameManager.getAvailableUpgrades();
  res.json({ upgrades, meta: gameManager.meta });
});

app.post('/api/game/purchase-upgrade', (req, res) => {
  const { upgradeId } = req.body;
  try {
    const result = gameManager.purchaseUpgrade(upgradeId);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/game/achievements', (req, res) => {
  res.json({
    achievements: ACHIEVEMENTS,
    unlocked: gameManager.meta?.achievements || [],
    progress: gameManager.meta?.achievementProgress || {}
  });
});

app.get('/api/game/lifetime-stats', (req, res) => {
  res.json({
    stats: gameManager.meta?.lifetimeStats || {}
  });
});

app.post('/api/game/reset', (req, res) => {
  gameManager.createPlayer('Hunter');
  cancelPendingPrefetches();
  clearPrefetchCache();
  saveGameData();
  res.json({ state: gameManager.getState() });
});

app.post('/api/game/debug-mode', (req, res) => {
  const { enabled } = req.body;
  debugMode = !!enabled;
  console.log(`Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
  res.json({ debugMode });
});

// Debug: Give player test chips
app.post('/api/game/debug-chips', (req, res) => {
  const player = gameManager.run?.player || gameManager.player;
  if (!player) {
    return res.status(400).json({ error: 'No player found' });
  }

  // Add some test chips
  const testChips = [
    { id: 'fryingPan', name: 'フライパン', nameEn: 'Frying Pan', category: 'stat', rarity: 'uncommon', effects: { stats: { str: 4, vit: 1 } } },
    { id: 'compass', name: 'コンパス', nameEn: 'Drafting Compass', category: 'onHit', rarity: 'rare', effects: { onHit: { chance: 0.15, status: 'defrag', duration: 2 } } },
    { id: 'businessCard', name: '名刺', nameEn: 'Business Card', category: 'counter', rarity: 'uncommon', effects: { counter: { trigger: 'onKill', stat: 'str', perStack: 1, maxStacks: 10 } } }
  ];

  player.chips = player.chips || [];
  player.chips.push(...testChips);
  saveGameData();

  res.json({ success: true, chipsAdded: testChips.length, totalChips: player.chips.length });
});

app.post('/api/game/heal', (req, res) => {
  const { amount } = req.body;
  const player = gameManager.run?.player || gameManager.player;
  if (player) {
    const healAmount = amount || 0;
    player.hp = Math.min(player.hp + healAmount, player.maxHp);
    saveGameData();
    res.json({ success: true, state: getEnrichedGameState() });
  } else {
    res.status(400).json({ error: 'No player' });
  }
});

app.post('/api/game/full-reset', (req, res) => {
  gameManager.player = null;
  gameManager.run = null;
  gameManager.combat = null;
  gameManager.meta = {
    essence: 0,
    upgrades: [],
    achievements: [],
    achievementProgress: {},
    lifetimeStats: { runs: 0, deaths: 0, kills: 0, goldEarned: 0, bossesKilled: 0 }
  };
  cancelPendingPrefetches();
  clearPrefetchCache();
  saveGameData();
  res.json({ success: true, state: gameManager.getState() });
});

// Prefetch stats
app.get('/api/prefetch/stats', (req, res) => {
  res.json(getPrefetchStats());
});

app.post('/api/prefetch/reset', (req, res) => {
  resetPrefetchStats();
  res.json({ success: true });
});

app.get('/api/prefetch/cache', (req, res) => {
  res.json(getCacheContents());
});

app.post('/api/prefetch/clear', (req, res) => {
  clearPrefetchCache();
  cancelPendingPrefetches();
  res.json({ success: true });
});

// Game stats
app.get('/api/game/stats', async (req, res) => {
  const { period, startDate, endDate } = req.query;
  try {
    const stats = await getGameStatsForPeriod(period || 'all', startDate, endDate);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/stats/dates', (req, res) => {
  res.json(getGameStatsAvailableDates());
});

app.post('/api/game/stats/reset', (req, res) => {
  gameStats = resetGameStats();
  res.json({ success: true });
});

app.get('/api/game/stats/word-states', (req, res) => {
  if (gameStats.cachedWordStates) {
    res.json({ ...gameStats.cachedWordStates, cached: true });
  } else {
    res.json({ words: [], stateCounts: {}, totalWords: 0, cached: false });
  }
});

app.post('/api/game/vocab-cache/warm', async (req, res) => {
  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    const vocabResult = getVocabulary();
    if (vocabResult.words.length === 0) {
      return res.json({ warmed: 0, message: 'No vocabulary to warm' });
    }

    await refreshWordStateCache(settings.jpdbApiKey, vocabResult.words);
    res.json({
      warmed: vocabResult.words.length,
      message: 'Cache warmed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/due-words', async (req, res) => {
  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    const limit = parseInt(req.query.limit) || 10;
    const excludeVids = req.query.exclude ? req.query.exclude.split(',').map(v => parseInt(v, 10)) : [];
    const result = await getDueWordsWithMeanings(settings.jpdbApiKey, limit, excludeVids);
    // getDueWordsWithMeanings returns { words: [...], source: 'due' | 'learning' | 'none' }
    res.json({ words: result.words, count: result.words.length, source: result.source });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game/refresh-word-states', async (req, res) => {
  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    const vocabResult = getVocabulary();
    if (vocabResult.words.length === 0) {
      return res.json({ refreshed: 0 });
    }

    const states = await refreshWordStateCache(settings.jpdbApiKey, vocabResult.words);
    invalidateWordStateCache();

    res.json({
      refreshed: Object.keys(states).length,
      message: 'Word states refreshed'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game/stats/word-states', async (req, res) => {
  if (!settings.jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  try {
    const usedWords = Object.keys(gameStats.vocabulary?.uniqueWords || {});
    if (usedWords.length === 0) {
      return res.json({ words: [], stateCounts: {}, totalWords: 0 });
    }

    const states = await lookupWordStates(settings.jpdbApiKey, usedWords);

    const stateCounts = {};
    const wordsWithStates = usedWords.map(word => {
      const state = states[word];
      const stateName = state?.states?.[0] || 'unknown';
      stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
      return {
        word,
        count: gameStats.vocabulary.uniqueWords[word],
        state: stateName,
        vid: state?.vid,
        sid: state?.sid
      };
    });

    gameStats.cachedWordStates = {
      words: wordsWithStates,
      stateCounts,
      totalWords: usedWords.length,
      cachedAt: new Date().toISOString()
    };
    saveGameStats(gameStats);

    res.json({ ...gameStats.cachedWordStates, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve game page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'game.html'));
});

// ============ Prefetch Initialization ============

async function prefetchGeneratorFn(event, context) {
  const vocabResult = getVocabulary();
  const vocabulary = vocabResult.words;
  const jlptLevel = settings.jlptLevel || 'N4';
  const aiConfig = {
    provider: settings.aiProvider,
    apiKey: settings.aiApiKey,
    openaiModel: settings.openaiModel,
    openrouterModel: settings.openrouterModel
  };

  if (!aiConfig.apiKey || vocabulary.length === 0) {
    return null;
  }

  let suggestedWords = null;
  if (settings.jpdbApiKey && vocabulary.length > 0) {
    try {
      suggestedWords = await getSuggestionsForNarration(settings.jpdbApiKey, vocabulary);
    } catch (e) {}
  }

  const gameState = {
    player: gameManager.run?.player || gameManager.player,
    floor: gameManager.run?.floor || 1,
    enemy: gameManager.combat?.enemy,
    combat: gameManager.combat ? {
      active: gameManager.combat.active,
      turn: gameManager.combat.turn
    } : null
  };

  let narration = await generateNarration(
    chat,
    gameState,
    event,
    context,
    vocabulary,
    jlptLevel,
    aiConfig,
    suggestedWords
  );

  if (narration) {
    const gameTerms = [];
    if (gameManager.combat?.enemy?.name) {
      gameTerms.push(gameManager.combat.enemy.name);
    }
    narration = await applyVocabRepair(narration, vocabulary, gameTerms);
  }

  return narration;
}

setPrefetchGenerator(prefetchGeneratorFn);

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
  console.log('[Prefetch] System initialized');
  console.log('[Prefetch] TTS prefetch:', settings.gameTtsEnabled ? 'enabled' : 'disabled');

  if (!gameManager.run?.active) {
    queueRunStartPrefetch();
  }
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to play');
});
