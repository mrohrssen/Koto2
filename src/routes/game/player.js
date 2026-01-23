/**
 * @fileoverview Player routes - /api/game/create-player
 */

import { Router } from 'express';

export default function createPlayerRoutes({
  gameManager,
  getEnrichedGameState,
  saveGameData,
  generateGameNarration
}) {
  const router = Router();

  // Create new player
  router.post('/create-player', async (req, res) => {
    const { name, stats, statPoints } = req.body;

    gameManager.createPlayer(name || 'Hunter', stats || null, statPoints ?? null);
    saveGameData();

    const narration = await generateGameNarration('runStart', gameManager.player, req.body);

    res.json({
      state: gameManager.getState(),
      narration
    });
  });

  return router;
}
