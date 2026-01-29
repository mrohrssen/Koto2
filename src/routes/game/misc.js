/**
 * @fileoverview Miscellaneous game routes
 *
 * Handles narrate, reset, debug, heal, stats, vocab-cache, word-states
 */

import { Router } from 'express';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import {
  getVocabulary,
  lookupWordStates,
  getDueWordsWithMeanings,
  fetchDueWordsDirectly,
  parseWordBatch,
  configure as configureJpdb
} from '../../jpdb.js';
import {
  refreshWordStateCache,
  invalidateWordStateCache as invalidateVocabManagerCache,
  performFullParse,
  updateWordStates
} from '../../game/vocab-manager.js';
import {
  getGameStatsForPeriod,
  getGameStatsAvailableDates,
  resetGameStats
} from '../../game-stats.js';
import { getSaveFilePath } from '../../game/manager-registry.js';

export default function createMiscRoutes({
  generateGameNarration,
  cancelPendingPrefetches,
  clearPrefetchCache,
  getGameStats,
  setGameStats,
  getDebugMode,
  setDebugMode,
  vocabCacheFile,
  staticWordList
}) {
  const router = Router();

  // Narrate
  router.post('/narrate', async (req, res) => {
    const { event, context } = req.body;
    try {
      const narration = await generateGameNarration(event, context, req.userKeys);
      res.json({ narration });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset (full game reset)
  router.post('/reset', (req, res) => {
    const gameManager = req.gameManager;
    gameManager.fullReset();
    cancelPendingPrefetches();
    clearPrefetchCache();

    try {
      const saveFile = getSaveFilePath(req.user.id);
      if (existsSync(saveFile)) {
        unlinkSync(saveFile);
      }
      if (existsSync(vocabCacheFile)) {
        unlinkSync(vocabCacheFile);
      }
    } catch (err) {
      console.error('Error deleting save files:', err);
    }

    res.json({ state: gameManager.getState(), fullReset: true });
  });

  // Debug mode toggle
  router.post('/debug-mode', (req, res) => {
    const { enabled } = req.body;
    setDebugMode(!!enabled);
    console.log(`Debug mode ${getDebugMode() ? 'enabled' : 'disabled'}`);
    res.json({ debugMode: getDebugMode() });
  });

  // Debug: Force combat
  router.post('/debug-force-combat', (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }

    const gameManager = req.gameManager;
    try {
      const { enemyId } = req.body;
      const result = gameManager.debugForceCombat(enemyId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Debug: Force blacksmith room
  router.post('/debug-force-blacksmith', (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }

    const gameManager = req.gameManager;
    try {
      if (!gameManager.run) {
        return res.status(400).json({ error: 'No active run' });
      }

      const room = {
        id: 'debug_blacksmith',
        type: 'blacksmith',
        roomNumber: 1,
        totalRooms: 5,
        floor: 1,
        explored: true,
        interacted: false,
        blacksmith: {
          interacted: false,
          successBonus: 0.02
        }
      };

      if (!gameManager.run.rooms) {
        gameManager.run.rooms = [room];
        gameManager.run.currentRoom = 0;
      } else {
        gameManager.run.rooms[gameManager.run.currentRoom] = room;
      }

      gameManager.combat = null;
      gameManager.run.postCombatShop = null;

      req.saveGame();
      res.json({ success: true, room, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Debug: Give player test chips
  router.post('/debug-chips', (req, res) => {
    const gameManager = req.gameManager;
    const player = gameManager.run?.player || gameManager.player;
    if (!player) {
      return res.status(400).json({ error: 'No player found' });
    }

    const testChips = [
      { id: 'battery', name: '電池ボット', nameEn: 'Battery Bot', category: 'pipeline', rarity: 'common', effects: { pipeline: { type: 'flatAdd', value: 5, triggerChance: 1 } } },
      { id: 'speaker', name: 'スピーカーボット', nameEn: 'Speaker Bot', category: 'pipeline', rarity: 'uncommon', effects: { pipeline: { type: 'multiply', value: 1.5, triggerChance: 0.8 } } },
      { id: 'scissors', name: 'ハサミボット', nameEn: 'Scissors Bot', category: 'pipeline', rarity: 'uncommon', effects: { pipeline: { type: 'flatAdd', value: 8, triggerChance: 0.9 } } }
    ];

    player.chips = player.chips || [];
    player.chips.push(...testChips);
    req.saveGame();

    res.json({ success: true, chipsAdded: testChips.length, totalChips: player.chips.length });
  });

  // Debug: Force a specific game phase
  router.post('/debug-force-phase', async (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const gameManager = req.gameManager;
    const { phase } = req.body;
    try {
      if (!gameManager.player) {
        gameManager.createPlayer('TestPlayer');
      }
      switch (phase) {
        case 'boss_ready': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.run.encountersCompleted = gameManager.run.encountersNeeded;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          gameManager.run.bossDefeated = false;
          // Set up a boss room so derivePhase returns boss_ready
          const bossRoom = {
            id: 'debug_boss',
            type: 'boss',
            isBossRoom: true,
            roomNumber: gameManager.run.encountersNeeded,
            totalRooms: gameManager.run.encountersNeeded,
            floor: gameManager.run.floor || 1,
            explored: true,
            interacted: false
          };
          gameManager.run.rooms = [bossRoom];
          gameManager.run.currentRoom = 0;
          break;
        }
        case 'floor_complete': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.run.bossDefeated = true;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          break;
        }
        case 'post_combat_shop': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.combat = null;
          gameManager.run.bossDefeated = false;
          const ownedIds = (gameManager.run.player.chips || []).map(c => c.id);
          const { generatePostCombatShop } = await import('../../game/rooms.js');
          gameManager.run.postCombatShop = {
            active: true,
            items: generatePostCombatShop(gameManager.run.floor, ownedIds)
          };
          break;
        }
        case 'wordDiscovery': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.wardSelectionRequired) {
              gameManager.selectStartingWard('nerima');
            }
          }
          gameManager.run.wardSelectionRequired = false;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          gameManager.run.bossDefeated = false;
          const { WORDS_PER_DISCOVERY } = await import('../../game/rooms.js');
          // Set up a word discovery room
          const wordRoom = {
            id: 'debug_word_discovery',
            type: 'wordDiscovery',
            roomNumber: 1,
            totalRooms: 3,
            floor: gameManager.run.floor || 1,
            explored: true,
            interacted: false,
            wordDiscovery: {
              wordsToLearn: WORDS_PER_DISCOVERY,
              wordsLearned: 0,
              wordIds: [],
              completed: false
            }
          };
          gameManager.run.rooms = [wordRoom];
          gameManager.run.currentRoom = 0;
          break;
        }
        default:
          return res.status(400).json({ error: `Unsupported phase: ${phase}` });
      }
      req.saveGame();
      res.json({ success: true, state: req.getEnrichedGameState() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Debug: Set enemy HP (for testing combat victory)
  router.post('/debug-set-enemy-hp', (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const gameManager = req.gameManager;
    const { hp } = req.body;
    if (!gameManager.combat || !gameManager.combat.enemy) {
      return res.status(400).json({ error: 'No active combat' });
    }
    gameManager.combat.enemy.hp = hp;
    req.saveGame();
    res.json({ success: true, enemyHp: gameManager.combat.enemy.hp });
  });

  // Debug: Queue room types for testing
  router.post('/debug-queue-rooms', async (req, res) => {
    if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
      return res.status(403).json({ error: 'Only available in test mode or debug mode' });
    }

    const { rooms } = req.body;
    if (!Array.isArray(rooms)) {
      return res.status(400).json({ error: 'rooms must be an array' });
    }

    const { queueTestRooms } = await import('../../game/rooms.js');
    queueTestRooms(rooms);

    res.json({ success: true, queued: rooms.length, rooms });
  });

  // Debug: Clear room queue
  router.post('/debug-clear-room-queue', async (req, res) => {
    if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
      return res.status(403).json({ error: 'Only available in test mode or debug mode' });
    }

    const { clearTestRoomQueue } = await import('../../game/rooms.js');
    clearTestRoomQueue();

    res.json({ success: true });
  });

  // Heal
  router.post('/heal', (req, res) => {
    const gameManager = req.gameManager;
    const { amount } = req.body;
    const player = gameManager.run?.player || gameManager.player;
    if (player) {
      const healAmount = amount || 0;
      player.hp = Math.min(player.hp + healAmount, player.maxHp);
      req.saveGame();
      res.json({ success: true, state: req.getEnrichedGameState() });
    } else {
      res.status(400).json({ error: 'No player' });
    }
  });

  // Full reset (used by tests)
  router.post('/full-reset', (req, res) => {
    const gameManager = req.gameManager;
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
    req.saveGame();
    res.json({ success: true, state: gameManager.getState() });
  });

  // Game stats
  router.get('/stats', async (req, res) => {
    const { period, startDate, endDate } = req.query;
    try {
      const stats = await getGameStatsForPeriod(period || 'all', startDate, endDate);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/stats/dates', (req, res) => {
    res.json(getGameStatsAvailableDates());
  });

  router.post('/stats/reset', (req, res) => {
    const newStats = resetGameStats();
    setGameStats(newStats);
    res.json({ success: true });
  });

  router.get('/stats/word-states', (req, res) => {
    const gameStats = getGameStats();
    if (gameStats.cachedWordStates) {
      res.json({ ...gameStats.cachedWordStates, cached: true });
    } else {
      res.json({ words: [], stateCounts: {}, totalWords: 0, cached: false });
    }
  });

  // Session start - warm cache with full parse if needed
  router.post('/session-start', async (req, res) => {
    // Check body first (frontend sends it), then userKeys (from encrypted storage)
    const jpdbApiKey = req.body?.jpdbApiKey || req.userKeys?.jpdbApiKey;

    console.log('[Session Start] req.body.jpdbApiKey:', req.body?.jpdbApiKey ? 'present' : 'missing');
    console.log('[Session Start] req.userKeys.jpdbApiKey:', req.userKeys?.jpdbApiKey ? 'present' : 'missing');
    console.log('[Session Start] Using key from:', req.body?.jpdbApiKey ? 'body' : (req.userKeys?.jpdbApiKey ? 'userKeys' : 'none'));

    if (!jpdbApiKey) {
      console.log('[Session Start] No JPDB API key found');
      return res.json({
        warmed: false,
        reason: 'No JPDB API key configured'
      });
    }

    if (!staticWordList || staticWordList.length === 0) {
      console.log('[Session Start] Static word list empty or not loaded');
      return res.json({
        warmed: false,
        reason: 'Static word list not loaded'
      });
    }

    console.log(`[Session Start] Static word list has ${staticWordList.length} words, starting parse...`);

    try {
      const cache = await performFullParse(jpdbApiKey, staticWordList);
      console.log(`[Session Start] Parse complete, cached ${Object.keys(cache).length} words`);
      res.json({
        warmed: true,
        cachedWords: Object.keys(cache).length,
        message: 'Session cache ready'
      });
    } catch (error) {
      console.error('[Session Start] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Post-combat refresh - update cache for reviewed words
  router.post('/post-combat-refresh', async (req, res) => {
    const jpdbApiKey = req.userKeys?.jpdbApiKey;
    const { words } = req.body;

    if (!jpdbApiKey) {
      return res.json({ refreshed: 0, reason: 'No API key' });
    }

    if (!words || words.length === 0) {
      return res.json({ refreshed: 0, reason: 'No words to refresh' });
    }

    try {
      // Parse the reviewed words to get fresh states
      const results = await parseWordBatch(jpdbApiKey, words);

      // Update local cache with new states
      const refreshed = updateWordStates(results);

      res.json({
        refreshed,
        message: 'Cache updated with fresh word states'
      });
    } catch (error) {
      console.error('[Post-Combat Refresh] Error:', error.message);
      res.json({ refreshed: 0, error: error.message });
    }
  });

  // Due words
  router.post('/due-words', async (req, res) => {
    const jpdbApiKey = req.userKeys?.jpdbApiKey;
    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const { limit: bodyLimit, exclude, bypassCache } = req.body;
      const limit = parseInt(bodyLimit) || 10;
      const excludeVids = exclude
        ? (Array.isArray(exclude) ? exclude.map(v => parseInt(v, 10)) : exclude.split(',').map(v => parseInt(v, 10)))
        : [];

      let result;
      if (bypassCache) {
        result = await fetchDueWordsDirectly(jpdbApiKey, limit, excludeVids);
      } else {
        result = await getDueWordsWithMeanings(jpdbApiKey, limit, excludeVids);
      }
      res.json({ words: result.words, count: result.words.length, source: result.source });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh word states
  router.post('/refresh-word-states', async (req, res) => {
    const jpdbApiKey = req.userKeys?.jpdbApiKey;
    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const vocabResult = getVocabulary();
      if (vocabResult.words.length === 0) {
        return res.json({ refreshed: 0 });
      }

      const states = await refreshWordStateCache(jpdbApiKey, vocabResult.words);
      invalidateVocabManagerCache();

      res.json({
        refreshed: Object.keys(states).length,
        message: 'Word states refreshed'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Word states lookup
  router.post('/stats/word-states', async (req, res) => {
    const jpdbApiKey = req.userKeys?.jpdbApiKey;
    const gameStats = getGameStats();
    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const usedWords = Object.keys(gameStats.vocabulary?.uniqueWords || {});
      if (usedWords.length === 0) {
        return res.json({ words: [], stateCounts: {}, totalWords: 0 });
      }

      const states = await lookupWordStates(jpdbApiKey, usedWords);

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

      res.json(gameStats.cachedWordStates);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
