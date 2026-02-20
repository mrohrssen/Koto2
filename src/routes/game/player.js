/**
 * @fileoverview Player routes - /api/game/create-player
 */

import { Router } from 'express';

export default function createPlayerRoutes({ generateGameNarration }) {
  const router = Router();

  // Create new player
  router.post('/create-player', async (req, res) => {
    const { name, stats, statPoints } = req.body;
    const gameManager = req.gameManager;

    gameManager.createPlayer(name || 'Hunter', stats || null, statPoints ?? null);
    req.saveGame();

    const narration = null; // DM narration disabled — frontend discards this

    res.json({
      state: req.getEnrichedGameState(),
      narration
    });
  });

  return router;
}
