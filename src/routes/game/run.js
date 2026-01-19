/**
 * @fileoverview Run routes
 *
 * Handles run lifecycle: start-run, forfeit, floor navigation, ward selection, chip management
 */

import { Router } from 'express';
import { getChipLoadout, equipChip, unequipChip } from '../../game/items/chips.js';

/**
 * Create run router
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.eagerPrefetchForRun - Prefetch for run start
 * @param {function} deps.cancelPendingPrefetches - Cancel pending prefetches
 * @param {function} deps.clearPrefetchCache - Clear prefetch cache
 * @returns {Router}
 */
export default function createRunRoutes({
  gameManager,
  getEnrichedGameState,
  saveGameData,
  generateGameNarration,
  eagerPrefetchForRun,
  cancelPendingPrefetches,
  clearPrefetchCache
}) {
  const router = Router();

  // Start a new run
  router.post('/start-run', async (req, res) => {
    try {
      gameManager.startRun();
      eagerPrefetchForRun(gameManager);

      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.body);

      saveGameData();
      res.json({
        state: getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Claim free starting chip
  router.post('/claim-starting-chip', (req, res) => {
    try {
      const { itemIndex } = req.body;
      const result = gameManager.claimStartingChip(itemIndex);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Ward selection
  router.get('/starting-wards', (req, res) => {
    try {
      const options = gameManager.getStartingWardOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-starting-ward', async (req, res) => {
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

  router.get('/next-ward-options', (req, res) => {
    try {
      const options = gameManager.getNextWardOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-next-ward', async (req, res) => {
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

  // Chip loadout management
  router.get('/chip-loadout', (req, res) => {
    try {
      const player = gameManager.run?.player || gameManager.player;
      const runStats = gameManager.run?.runStats || {};
      const loadout = getChipLoadout(player, runStats);
      res.json(loadout);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/equip-chip', (req, res) => {
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

  router.post('/unequip-chip', (req, res) => {
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

  // Floor navigation
  router.post('/enter-floor', async (req, res) => {
    try {
      const floor = gameManager.enterFloor();
      const narration = await generateGameNarration('floorEnter', {
        floor,
        player: gameManager.run.player
      }, req.body);

      saveGameData();
      res.json({
        state: getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/next-floor', async (req, res) => {
    try {
      const floor = gameManager.nextFloor();
      const narration = await generateGameNarration('floorEnter', {
        floor: gameManager.run.floor,
        player: gameManager.run.player
      }, req.body);

      saveGameData();
      res.json({ state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/proceed', async (req, res) => {
    try {
      const room = gameManager.proceedToNextRoom();

      let narration = null;
      if (room.type === 'monster') {
        narration = await generateGameNarration('encounterStart', {
          enemy: room.enemy,
          player: gameManager.run.player
        }, req.body);
      }

      saveGameData();
      res.json({ room, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Forfeit run
  router.post('/forfeit', (req, res) => {
    const result = gameManager.forfeitRun();
    cancelPendingPrefetches();
    clearPrefetchCache();
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  });

  return router;
}
