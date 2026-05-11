import { Router } from 'express';
import { canUseDebugSuperAttack } from '../../game/debug-super-attack-access.js';
import { addFusionCore, getFusionState, startFusion } from '../../game/services/fusion-service.js';

export default function createFusionRoutes() {
  const router = Router();

  router.get('/fusion', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json(getFusionState(meta));
  });

  router.post('/fusion/debug-add-core', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!canUseDebugSuperAttack(req.user)) {
      return res.status(403).json({ ok: false, error: 'debug_fusion_core_forbidden' });
    }

    const meta = req.gameManager.getMeta();
    const result = addFusionCore(meta);
    req.saveGame();
    res.json({ ok: true, amount: 1, ...result });
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
