/**
 * @fileoverview Player routes
 *
 * Handles /api/game/create-player, /allocate-stat, /stat-info
 */

import { Router } from 'express';
import { allocateStat } from '../../game/state.js';
import { STAT_NAMES, STAT_DESCRIPTIONS } from '../../game/stats.js';

/**
 * Create player router
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.queueRunStartPrefetch - Queue run start prefetch
 * @returns {Router}
 */
export default function createPlayerRoutes({
  gameManager,
  getEnrichedGameState,
  saveGameData,
  generateGameNarration,
  queueRunStartPrefetch
}) {
  const router = Router();

  // Allocate stat point
  router.post('/allocate-stat', (req, res) => {
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

  // Get stat info
  router.get('/stat-info', (req, res) => {
    res.json({
      statNames: STAT_NAMES,
      statDescriptions: STAT_DESCRIPTIONS,
      costFormula: 'floor((currentValue - 1) / 10) + 2'
    });
  });

  // Create new player
  router.post('/create-player', async (req, res) => {
    const { name, stats, statPoints } = req.body;

    gameManager.createPlayer(name || 'Hunter', stats || null, statPoints ?? null);
    saveGameData();

    const narration = await generateGameNarration('runStart', gameManager.player, req.body);
    queueRunStartPrefetch();

    res.json({
      state: gameManager.getState(),
      narration
    });
  });

  return router;
}
