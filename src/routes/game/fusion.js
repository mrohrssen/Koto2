import { Router } from 'express';
import { getFusionState, startFusion } from '../../game/services/fusion-service.js';

export default function createFusionRoutes() {
  const router = Router();

  router.get('/fusion', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json(getFusionState(meta));
  });

  router.post('/fusion/start', (req, res) => {
    if (req.gameManager.run) {
      return res.status(400).json({ error: 'Cannot start fusion during a run' });
    }

    const { recipeId } = req.body;
    if (!recipeId) return res.status(400).json({ error: 'recipeId required' });

    const meta = req.gameManager.getMeta();
    const result = startFusion(meta, recipeId);
    if (!result.success) {
      return res.status(400).json({ error: result.error, ...result });
    }

    req.saveGame();
    res.json({
      ...result,
      ...getFusionState(meta),
      state: req.getEnrichedGameState()
    });
  });

  return router;
}
