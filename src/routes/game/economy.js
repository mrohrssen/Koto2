import { Router } from 'express';

function withOptimisticRunStatus(req, payload = {}) {
  if (!req.body?.actionId) return payload;
  return {
    ...payload,
    status: 'accepted',
    actionId: req.body.actionId,
    state: req.getEnrichedGameState(),
  };
}

function sendOptimisticRunCorrection(req, res, error, statusCode = 409) {
  let authoritativeState = null;
  try {
    authoritativeState = req.getEnrichedGameState();
  } catch {
    authoritativeState = null;
  }
  return res.status(statusCode).json({
    status: 'corrected',
    actionId: req.body?.actionId,
    reason: error?.message || 'run_action_rejected',
    authoritativeState,
  });
}

export default function createEconomyRoutes() {
  const router = Router();

  // Skip post-combat shop
  router.post('/shop-skip', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.skipShop();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Dealer room: get state
  router.get('/dealer-state', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.getDealerState();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Dealer room: sell a creature
  router.post('/dealer-sell', async (req, res) => {
    const gameManager = req.gameManager;
    const { creatureId } = req.body;
    try {
      const result = gameManager.dealerSell(creatureId);
      req.saveGame();
      res.json(withOptimisticRunStatus(req, { ...result, state: req.getEnrichedGameState() }));
    } catch (error) {
      if (req.body?.actionId) return sendOptimisticRunCorrection(req, res, error);
      res.status(400).json({ error: error.message });
    }
  });

  // Dealer room: buy offered creature
  router.post('/dealer-buy', async (req, res) => {
    const gameManager = req.gameManager;
    const { creatureId } = req.body;
    try {
      const result = gameManager.dealerBuy(creatureId);
      req.saveGame();
      res.json(withOptimisticRunStatus(req, { ...result, state: req.getEnrichedGameState() }));
    } catch (error) {
      if (req.body?.actionId) return sendOptimisticRunCorrection(req, res, error);
      res.status(400).json({ error: error.message });
    }
  });

  // Dealer room: leave
  router.post('/dealer-leave', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.leaveDealer();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
