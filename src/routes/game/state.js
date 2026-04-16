import { Router } from 'express';

/**
 * Create game state router
 * gameManager, getEnrichedGameState come from req (set by game/index.js middleware)
 * @returns {Router}
 */
export default function createGameStateRoutes() {
  const router = Router();

  // Get current game state
  router.get('/state', (req, res) => {
    res.json(req.getEnrichedGameState());
  });

  return router;
}
