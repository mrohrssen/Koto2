import { Router } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resetTutorial } from '../../game/services/tutorial-service.js';
import { getManager } from '../../game/manager-registry.js';
import { resetUserProgress } from '../../game/user-data-reset.js';
import { ensureCreatureCounts } from '../../game/services/creature-collection-service.js';
import { getCidScripts } from '../../game/dialogue-loader.js';
import { getWordDict } from '../../game/bootstrap/word-knowledge.js';
import { enrichTokens } from '../../game/enrich-tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function createMiscRoutes({
  getDebugMode,
  setDebugMode,
  ttsDialogueCache,
  getAllNpcDialogueCache,
  getAllCreatureDialogueCache,
  clearNpcDialogueCache,
  clearCreatureDialogueCache
}) {
  const router = Router();

  function requireServerDebug(req, res, next) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    next();
  }

  // Debug mode toggle
  router.post('/debug-mode', requireServerDebug, (req, res) => {
    const { enabled } = req.body;
    setDebugMode(!!enabled);
    console.log(`Debug mode ${getDebugMode() ? 'enabled' : 'disabled'}`);
    res.json({ debugMode: getDebugMode() });
  });

  // Debug: Force combat
  router.post('/debug-force-combat', requireServerDebug, (req, res) => {
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

  // Debug: Force a specific game phase
  router.post('/debug-force-phase', requireServerDebug, async (req, res) => {
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
        case 'speedReviewRoom': {
          if (!gameManager.run || !gameManager.run.active) {
            gameManager.startRun();
            if (gameManager.run.areaSelectionRequired) {
              gameManager.selectArea('okunomori');
            }
          }
          gameManager.run.areaSelectionRequired = false;
          gameManager.run.areaCleared = false;
          gameManager.combat = null;
          gameManager.run.postCombatShop = null;
          const speedReviewRoom = {
            id: 'debug_speed_review_room',
            type: 'speedReviewRoom',
            roomNumber: 1,
            totalRooms: 3,
            areaId: gameManager.run.currentArea?.id || 'okunomori',
            explored: true,
            interacted: false,
            speedReviewRoom: {
              targetCards: 10,
              reviewedCards: 0,
              completed: false,
              snapshotWordKeys: [],
              awardedReviewKeys: [],
              pendingReviewKeys: [],
              settled: true
            }
          };
          gameManager.run.rooms = [speedReviewRoom];
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
  router.post('/debug-set-enemy-hp', requireServerDebug, (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const gameManager = req.gameManager;
    const { hp } = req.body;
    // Handle both old combat (combat.enemy) and creature combat (combat.enemies[])
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

  // Debug: Override creature collection (for testing)
  router.post('/debug-set-collection', requireServerDebug, (req, res) => {
    if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
      return res.status(403).json({ error: 'Only available in test mode or debug mode' });
    }

    const { creatureIds, tutorialFusionDataUnlocked } = req.body;
    if (!Array.isArray(creatureIds)) {
      return res.status(400).json({ error: 'creatureIds must be an array' });
    }

    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    meta.creatureCollection = creatureIds;
    if (Array.isArray(tutorialFusionDataUnlocked)) {
      meta.tutorialFusionDataUnlocked = tutorialFusionDataUnlocked;
    }

    req.saveGame();
    res.json({ success: true, collection: creatureIds });
  });

  // Debug: Mark the current room as interacted (for testing proceed)
  router.post('/debug-skip-room', requireServerDebug, (req, res) => {
    if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
      return res.status(403).json({ error: 'Only available in test mode or debug mode' });
    }

    const gameManager = req.gameManager;
    const room = gameManager.run?.rooms?.[gameManager.run?.currentRoom];
    if (!room) {
      return res.status(400).json({ error: 'No current room' });
    }

    room.interacted = true;
    if (room.skillMaster) room.skillMaster.completed = true;

    req.saveGame();
    res.json({ success: true, roomType: room.type });
  });

  // Debug: Queue room types for testing
  router.post('/debug-queue-rooms', requireServerDebug, async (req, res) => {
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
  router.post('/debug-clear-room-queue', requireServerDebug, async (req, res) => {
    if (process.env.NODE_ENV !== 'test' && !getDebugMode()) {
      return res.status(403).json({ error: 'Only available in test mode or debug mode' });
    }

    const { clearTestRoomQueue } = await import('../../game/rooms.js');
    clearTestRoomQueue();

    res.json({ success: true });
  });

  // Debug: Dump NPC dialogue cache for the current user
  router.get('/debug-npc-dialogue-cache', requireServerDebug, (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const cache = getAllNpcDialogueCache?.(req.user.id) || {};
    const npcCount = Object.keys(cache).length;
    res.json({ userId: req.user.id, npcCount, cache });
  });

  // Debug: Dump creature befriend dialogue cache for the current user
  router.get('/debug-creature-dialogue-cache', requireServerDebug, (req, res) => {
    if (!getDebugMode()) {
      return res.status(403).json({ error: 'Debug mode not enabled' });
    }
    const cache = getAllCreatureDialogueCache?.(req.user.id) || {};
    const creatureCount = Object.keys(cache).length;
    res.json({ userId: req.user.id, creatureCount, cache });
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

  // Clear creature dialogue cache — forces regeneration on next exploration
  router.post('/clear-creature-dialogue-cache', (req, res) => {
    try {
      clearCreatureDialogueCache(req.user.id);
      res.json({ success: true, message: 'Creature dialogue cache cleared' });
    } catch (error) {
      console.error('Clear creature dialogue cache error:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  // Get prologue scenes — resolves jpDemo tokens from the dialogue pool.
  // The scene list is cached unenriched; tokens are enriched per-request so
  // live-dict edits reach players without restarting the server.
  let _prologueCache = null;
  router.get('/prologue', (_req, res) => {
    if (!_prologueCache) {
      const filePath = join(__dirname, '../../../data/prologue.json');
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      _prologueCache = raw.map(scene => {
        if (scene.type === 'jpDemo' && scene.frameGroup) {
          const script = getCidScripts().find(s => s.id === scene.frameGroup);
          const tokens = script?.lines?.[0]?.tokens;
          return tokens ? { ...scene, tokens } : scene;
        }
        return scene;
      });
    }
    const dict = getWordDict();
    const scenes = _prologueCache.map(scene => (
      scene.tokens ? { ...scene, tokens: enrichTokens(scene.tokens, {}, dict) } : scene
    ));
    res.json(scenes);
  });

  // Mark prologue as completed
  router.post('/prologue-complete', (req, res) => {
    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    meta.prologueComplete = true;
    req.saveGame();
    res.json({ ok: true });
  });

  // Reset prologue so it plays again
  router.post('/prologue-reset', (req, res) => {
    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    meta.prologueComplete = false;
    req.saveGame();
    res.json({ ok: true });
  });

  // Reset tutorial so it replays from scratch
  router.post('/tutorial-reset', (req, res) => {
    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    resetTutorial(meta);
    req.saveGame();
    res.json({ ok: true });
  });

  // Reset all current-user progress while preserving account and settings.
  router.post('/reset-user-data', (req, res) => {
    try {
      const result = resetUserProgress(req.user.id);
      ttsDialogueCache?.clearUser?.(req.user.id);
      req.gameManager = getManager(req.user.id);
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      console.error('Reset user data error:', error);
      res.status(500).json({ error: 'Failed to reset user data' });
    }
  });

  // Toggle kana mode (hiragana-first learning path)
  router.post('/kana-mode', (req, res) => {
    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    const { enabled } = req.body;
    meta.kanaMode = !!enabled;
    req.saveGame();
    res.json({ ok: true, kanaMode: meta.kanaMode });
  });

  // Select starter creature during prologue
  router.post('/select-starter', async (req, res) => {
    const { starterId } = req.body;
    const starterMap = {
      'starter-fire': 'hi',
      'starter-water': 'mizu',
      'starter-wood': 'ki'
    };
    const creatureId = starterMap[starterId];
    if (!creatureId) {
      return res.status(400).json({ error: 'Invalid starter' });
    }
    const gm = req.gameManager;
    if (!gm.meta.starterCreatureId) {
      gm.meta.starterCreatureId = creatureId;
    }
    if (!gm.meta.creatureCollection) gm.meta.creatureCollection = [];
    if (!gm.meta.creatureCollection.includes(creatureId)) {
      gm.meta.creatureCollection.push(creatureId);
    }
    ensureCreatureCounts(gm.meta);
    await req.saveGame();
    res.json({ starterId: creatureId, state: gm.getState() });
  });

  return router;
}
