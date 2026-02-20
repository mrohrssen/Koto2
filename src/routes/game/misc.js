/**
 * @fileoverview Miscellaneous game routes
 *
 * Handles debug, heal, session-start, post-combat-refresh, due-words, NPC cache
 */

import { Router } from 'express';
import {
  getDueWordsWithMeanings,
  fetchDueWordsDirectly,
  parseWordBatch
} from '../../jpdb.js';
import {
  performFullParse,
  updateWordStates
} from '../../game/vocab-manager.js';

export default function createMiscRoutes({
  getDebugMode,
  setDebugMode,
  staticWordList,
  getAllNpcDialogueCache,
  clearNpcDialogueCache
}) {
  const router = Router();

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
        areaId: gameManager.run.currentArea?.id || 'okunomori',
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
        case 'area_selection': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
          }
          gameManager.run.areaSelectionRequired = true;
          gameManager.run.areaCleared = false;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          break;
        }
        case 'area_complete': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.areaSelectionRequired) {
              gameManager.selectArea('okunomori');
            }
          }
          gameManager.run.areaSelectionRequired = false;
          gameManager.run.areaCleared = true;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          break;
        }
        case 'post_combat_shop': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.areaSelectionRequired) {
              gameManager.selectArea('okunomori');
            }
          }
          gameManager.run.areaSelectionRequired = false;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          break;
        }
        case 'wordDiscovery': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.areaSelectionRequired) {
              gameManager.selectArea('okunomori');
            }
          }
          gameManager.run.areaSelectionRequired = false;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          const { WORDS_PER_DISCOVERY } = await import('../../game/rooms.js');
          // Set up a word discovery room
          const wordRoom = {
            id: 'debug_word_discovery',
            type: 'wordDiscovery',
            roomNumber: 1,
            totalRooms: 3,
            areaId: gameManager.run.currentArea?.id || 'okunomori',
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
    // Handle both old combat (combat.enemy) and robot combat (combat.enemies[])
    if (!gameManager.combat) {
      return res.status(400).json({ error: 'No active combat' });
    }
    if (gameManager.combat.enemy) {
      gameManager.combat.enemy.hp = hp;
    }
    if (gameManager.combat.enemies?.length > 0) {
      gameManager.combat.enemies.forEach(e => { e.hp = hp; });
    }
    if (!gameManager.combat.enemy && !gameManager.combat.enemies?.length) {
      return res.status(400).json({ error: 'No active combat enemy' });
    }
    req.saveGame();
    res.json({ success: true, enemyHp: hp });
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

  // Debug: Dump NPC dialogue cache for the current user
  router.get('/debug-npc-dialogue-cache', (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const cache = getAllNpcDialogueCache?.(req.user.id) || {};
    const npcCount = Object.keys(cache).length;
    res.json({ userId: req.user.id, npcCount, cache });
  });

  // Clear NPC dialogue cache — forces regeneration on next exploration
  router.post('/clear-npc-dialogue-cache', (req, res) => {
    try {
      clearNpcDialogueCache(req.user.id);
      res.json({ success: true, message: 'NPC dialogue cache cleared' });
    } catch (error) {
      console.error('Clear NPC dialogue cache error:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
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

  // Session start - warm cache with full parse if needed
  router.post('/session-start', async (req, res) => {
    // Use userKeys from middleware (same as /api/jpdb/parse)
    const jpdbApiKey = req.userKeys?.jpdbApiKey;

    console.log('[Session Start] req.userKeys?.jpdbApiKey:', jpdbApiKey ? 'present' : 'missing');

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
      const cache = await performFullParse(jpdbApiKey, staticWordList, req.user.id);
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
      const refreshed = updateWordStates(results, req.user.id);

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
    console.log('[Due Words] Request received, apiKey:', jpdbApiKey ? 'present' : 'missing');
    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const { limit: bodyLimit, exclude, bypassCache } = req.body;
      const limit = parseInt(bodyLimit) || 10;
      const excludeVids = exclude
        ? (Array.isArray(exclude) ? exclude.map(v => parseInt(v, 10)) : exclude.split(',').map(v => parseInt(v, 10)))
        : [];

      console.log(`[Due Words] limit=${limit}, excludeVids=${excludeVids.length}, bypassCache=${bypassCache}`);

      let result;
      if (bypassCache) {
        result = await fetchDueWordsDirectly(jpdbApiKey, limit, excludeVids, req.user.id);
      } else {
        result = await getDueWordsWithMeanings(jpdbApiKey, limit, excludeVids, req.user.id);
      }
      console.log(`[Due Words] Returning ${result.words.length} words, source: ${result.source}`);
      res.json({ words: result.words, count: result.words.length, source: result.source });
    } catch (error) {
      console.error('[Due Words] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
