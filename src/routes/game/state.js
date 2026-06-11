import { Router } from 'express';
import { rotateKanjiKombatSessionEpoch } from '../../game/services/kanji-kombat-service.js';

/**
 * Create game state router
 * gameManager, getEnrichedGameState come from req (set by game/index.js middleware)
 * @returns {Router}
 */
export default function createGameStateRoutes() {
  const router = Router();

  // Get current game state
  router.get('/state', (req, res) => {
    if (req.gameManager.run?.mode === 'kanjiKombat' && req.gameManager.run?.active) {
      rotateKanjiKombatSessionEpoch(req.gameManager.run.kanjiKombat);
      req.saveGame();
    }
    res.json(req.getEnrichedGameState());
  });

  return router;
}
