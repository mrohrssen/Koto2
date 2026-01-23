/**
 * @fileoverview Economy routes
 *
 * Handles post-combat chip shop, shrines, and meta-progression upgrades
 */

import { Router } from 'express';

/**
 * Create economy router
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @returns {Router}
 */
export default function createEconomyRoutes({
  gameManager,
  getEnrichedGameState,
  saveGameData,
  generateGameNarration
}) {
  const router = Router();

  // Post-combat shop buy
  router.post('/post-combat-shop-buy', async (req, res) => {
    const { itemIndex } = req.body;
    try {
      const result = gameManager.buyFromPostCombatShop(itemIndex);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Post-combat shop refresh
  router.post('/post-combat-shop-refresh', async (req, res) => {
    try {
      const result = gameManager.refreshPostCombatShop();
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Skip post-combat shop
  router.post('/shop-skip', async (req, res) => {
    try {
      const result = gameManager.skipShop();
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Use shrine
  router.post('/use-shrine', async (req, res) => {
    try {
      const result = gameManager.useShrine();

      const narration = await generateGameNarration('shrine', {
        player: gameManager.run.player,
        effect: result.effect
      }, req.body);

      saveGameData();
      res.json({ ...result, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get available upgrades (meta-progression)
  router.get('/upgrades', (req, res) => {
    const upgrades = gameManager.getAvailableUpgrades();
    res.json({ upgrades, meta: gameManager.meta });
  });

  // Purchase upgrade (meta-progression)
  router.post('/purchase-upgrade', (req, res) => {
    const { upgradeId } = req.body;
    try {
      const result = gameManager.purchaseUpgrade(upgradeId);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
