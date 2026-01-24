/**
 * @fileoverview Run routes
 *
 * Handles run lifecycle: start-run, forfeit, floor navigation, ward selection, chip management
 */

import { Router } from 'express';
import { getChipLoadout, equipChip, unequipChip } from '../../game/items/chips.js';

export default function createRunRoutes({
  generateGameNarration,
  cancelPendingPrefetches,
  clearPrefetchCache
}) {
  const router = Router();

  // Start a new run
  router.post('/start-run', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      gameManager.startRun();

      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Claim free starting chip
  router.post('/claim-starting-chip', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { itemIndex } = req.body;
      const result = gameManager.claimStartingChip(itemIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Ward selection
  router.get('/starting-wards', (req, res) => {
    try {
      const options = req.gameManager.getStartingWardOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-starting-ward', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { wardId } = req.body;
      const result = gameManager.selectStartingWard(wardId);
      req.saveGame();
      res.json({
        ...result,
        state: req.getEnrichedGameState()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/next-ward-options', (req, res) => {
    try {
      const options = req.gameManager.getNextWardOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-next-ward', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { wardId } = req.body;
      const result = gameManager.selectNextWard(wardId);
      req.saveGame();
      res.json({
        ...result,
        state: req.getEnrichedGameState()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Chip loadout management
  router.get('/chip-loadout', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const player = gameManager.run?.player || gameManager.player;
      const runStats = gameManager.run?.runStats || {};
      const loadout = getChipLoadout(player, runStats);
      res.json({
        ...loadout,
        chipCharges: player._chipCharges || {},
        chipLevels: player._chipLevels || {}
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/equip-chip', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { equipmentSlot, chipId } = req.body;
      const player = gameManager.run?.player || gameManager.player;
      const result = equipChip(player, equipmentSlot, chipId);
      if (result.success) req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/unequip-chip', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { equipmentSlot, chipId } = req.body;
      const player = gameManager.run?.player || gameManager.player;
      const result = unequipChip(player, equipmentSlot, chipId);
      if (result.success) req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Floor navigation
  router.post('/enter-floor', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const floor = gameManager.enterFloor();
      const narration = await generateGameNarration('floorEnter', {
        floor,
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/next-floor', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const floor = gameManager.nextFloor();
      const narration = await generateGameNarration('floorEnter', {
        floor: gameManager.run.floor,
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({ state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/proceed', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const room = gameManager.proceedToNextRoom();

      let narration = null;
      if (room.type === 'monster') {
        narration = await generateGameNarration('encounterStart', {
          enemy: room.enemy,
          player: gameManager.run.player
        }, req.userKeys);
      }

      req.saveGame();
      res.json({ room, state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start room encounter (marks room, then starts combat)
  router.post('/room-encounter', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.startRoomEncounter();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Forfeit run
  router.post('/forfeit', (req, res) => {
    const result = req.gameManager.forfeitRun();
    cancelPendingPrefetches();
    clearPrefetchCache();
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  });

  return router;
}
