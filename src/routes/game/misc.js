/**
 * @fileoverview Miscellaneous game routes
 *
 * Handles narrate, reset, debug, heal, stats, vocab-cache, word-states
 */

import { Router } from 'express';
import { existsSync, unlinkSync } from 'fs';
import {
  getVocabulary,
  lookupWordStates,
  getDueWordsWithMeanings,
  fetchDueWordsDirectly
} from '../../jpdb.js';
import {
  refreshWordStateCache,
  invalidateWordStateCache as invalidateVocabManagerCache
} from '../../game/vocab-manager.js';
import {
  getGameStatsForPeriod,
  getGameStatsAvailableDates,
  resetGameStats
} from '../../game-stats.js';

/**
 * Create misc router
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.cancelPendingPrefetches - Cancel pending prefetches
 * @param {function} deps.clearPrefetchCache - Clear prefetch cache
 * @param {function} deps.getGameStats - Get game stats object
 * @param {function} deps.setGameStats - Set game stats object
 * @param {function} deps.getDebugMode - Get debug mode state
 * @param {function} deps.setDebugMode - Set debug mode state
 * @param {string} deps.gameSaveFile - Path to game save file
 * @param {string} deps.vocabCacheFile - Path to vocab cache file
 * @returns {Router}
 */
export default function createMiscRoutes({
  gameManager,
  getEnrichedGameState,
  saveGameData,
  generateGameNarration,
  cancelPendingPrefetches,
  clearPrefetchCache,
  getGameStats,
  setGameStats,
  getDebugMode,
  setDebugMode,
  gameSaveFile,
  vocabCacheFile
}) {
  const router = Router();

  // Narrate
  router.post('/narrate', async (req, res) => {
    const { event, context } = req.body;
    try {
      const narration = await generateGameNarration(event, context, req.body);
      res.json({ narration });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset (full game reset)
  router.post('/reset', (req, res) => {
    gameManager.fullReset();
    cancelPendingPrefetches();
    clearPrefetchCache();

    try {
      if (existsSync(gameSaveFile)) {
        unlinkSync(gameSaveFile);
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

    try {
      const { enemyId } = req.body;
      const result = gameManager.debugForceCombat(enemyId);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Debug: Force blacksmith room
  router.post('/debug-force-blacksmith', (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }

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

      saveGameData();
      res.json({ success: true, room, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Debug: Give player test chips
  router.post('/debug-chips', (req, res) => {
    const player = gameManager.run?.player || gameManager.player;
    if (!player) {
      return res.status(400).json({ error: 'No player found' });
    }

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

  // Heal
  router.post('/heal', (req, res) => {
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

  // Full reset (alternative)
  router.post('/full-reset', (req, res) => {
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

  // Vocab cache warm
  router.post('/vocab-cache/warm', async (req, res) => {
    const { jpdbApiKey, force } = req.body;
    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const vocabResult = getVocabulary();
      if (vocabResult.words.length === 0) {
        return res.json({ warmed: 0, message: 'No vocabulary to warm' });
      }

      await refreshWordStateCache(jpdbApiKey, vocabResult.words, force);
      res.json({
        warmed: vocabResult.words.length,
        message: 'Cache warmed successfully'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Due words
  router.post('/due-words', async (req, res) => {
    const { jpdbApiKey, limit: bodyLimit, exclude, bypassCache } = req.body;
    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const limit = parseInt(bodyLimit) || 10;
      const excludeVids = exclude
        ? (Array.isArray(exclude) ? exclude.map(v => parseInt(v, 10)) : exclude.split(',').map(v => parseInt(v, 10)))
        : [];

      let result;
      if (bypassCache) {
        // Fetch fresh due words directly from JPDB
        result = await fetchDueWordsDirectly(jpdbApiKey, limit, excludeVids);
      } else {
        // Use cached word states
        result = await getDueWordsWithMeanings(jpdbApiKey, limit, excludeVids);
      }
      res.json({ words: result.words, count: result.words.length, source: result.source });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh word states
  router.post('/refresh-word-states', async (req, res) => {
    const { jpdbApiKey } = req.body;
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
    const { jpdbApiKey } = req.body;
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
