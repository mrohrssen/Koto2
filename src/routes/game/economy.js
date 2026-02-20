/**
 * @fileoverview Economy routes
 *
 * Handles post-combat shop, shrines, and meta-progression upgrades
 */

import { Router } from 'express';

export default function createEconomyRoutes({ generateGameNarration }) {
  const router = Router();

  // Post-combat shop buy
  router.post('/post-combat-shop-buy', async (req, res) => {
    const gameManager = req.gameManager;
    const { itemIndex } = req.body;
    try {
      const result = gameManager.buyFromPostCombatShop(itemIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Post-combat shop refresh
  router.post('/post-combat-shop-refresh', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.refreshPostCombatShop();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
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

  // Get inventory status
  router.get('/inventory-status', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const status = gameManager.getInventoryStatus();
      res.json(status);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Use shrine
  router.post('/use-shrine', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.useShrine();

      const narration = null; // DM narration disabled — frontend discards this

      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState(), narration });
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

  // Collect credits during exploration
  router.post('/collect-credits', (req, res) => {
    const gameManager = req.gameManager;
    const { amount } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const state = gameManager.getState();

    if (!state.player) {
      return res.status(400).json({ error: 'No active player' });
    }

    // Add credits to player
    state.player.credits = (state.player.credits || 0) + amount;

    req.saveGame();
    res.json({
      success: true,
      amount,
      newTotal: state.player.credits
    });
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

  // Dealer room: sell a robot
  router.post('/dealer-sell', async (req, res) => {
    const gameManager = req.gameManager;
    const { robotId } = req.body;
    try {
      const result = gameManager.dealerSell(robotId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Dealer room: buy offered robot
  router.post('/dealer-buy', async (req, res) => {
    const gameManager = req.gameManager;
    const { robotId } = req.body;
    try {
      const result = gameManager.dealerBuy(robotId);
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
