/**
 * @fileoverview Economy routes
 *
 * Handles shop-skip, meta-progression upgrades, and dealer room
 */

import { Router } from 'express';

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

  // Get available upgrades (meta-progression)
  router.get('/upgrades', (req, res) => {
    const gameManager = req.gameManager;
    const upgrades = gameManager.getAvailableUpgrades();
    res.json({ upgrades, meta: gameManager.meta });
  });

  // Purchase upgrade (meta-progression)
  router.post('/purchase-upgrade', (req, res) => {
    const gameManager = req.gameManager;
    const { upgradeId } = req.body;
    try {
      const result = gameManager.purchaseUpgrade(upgradeId);
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
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
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
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
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
