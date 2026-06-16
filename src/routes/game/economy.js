import { Router } from 'express';
import {
  createOptimisticActionRunner,
  getOptimisticActionLedgerOwner,
} from './optimistic-action-response.js';

export default function createEconomyRoutes() {
  const router = Router();
  const runDealerAction = createOptimisticActionRunner({
    owner: req => {
      const gm = req.gameManager;
      if (gm && !gm.meta && typeof gm.initMeta === 'function') {
        try {
          gm.initMeta();
        } catch {
          // Let the mutation path surface validation errors normally.
        }
      }
      return getOptimisticActionLedgerOwner(req);
    },
  });

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
    const { creatureId } = req.body;
    return runDealerAction(req, res, {
      actionType: 'dealer.sell',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        const result = req.gameManager.dealerSell(creatureId);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  // Dealer room: buy offered creature
  router.post('/dealer-buy', async (req, res) => {
    const { creatureId } = req.body;
    return runDealerAction(req, res, {
      actionType: 'dealer.buy',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        const result = req.gameManager.dealerBuy(creatureId);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  // Dealer room: leave
  router.post('/dealer-leave', async (req, res) => {
    return runDealerAction(req, res, {
      actionType: 'dealer.leave',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        const result = req.gameManager.leaveDealer();
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  return router;
}
