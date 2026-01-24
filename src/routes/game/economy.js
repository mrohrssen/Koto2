/**
 * @fileoverview Economy routes
 *
 * Handles post-combat chip shop, shrines, and meta-progression upgrades
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

  // Use shrine
  router.post('/use-shrine', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.useShrine();

      const narration = await generateGameNarration('shrine', {
        player: gameManager.run.player,
        effect: result.effect
      }, req.userKeys);

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

  return router;
}
