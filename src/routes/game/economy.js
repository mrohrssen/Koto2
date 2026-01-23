/**
 * @fileoverview Economy routes
 *
 * Handles shop, treasure, traps, shrines, refining, upgrades
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

  // Shop buy
  router.post('/shop-buy', async (req, res) => {
    const { itemId } = req.body;
    try {
      const result = gameManager.buyFromShop(itemId);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Shop skip
  router.post('/shop-skip', async (req, res) => {
    try {
      const result = gameManager.skipShop();
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

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

  // Disarm trap
  router.post('/disarm', async (req, res) => {
    try {
      const result = gameManager.disarmTrap();

      const narration = await generateGameNarration(result.success ? 'trapDisarm' : 'trapFail', {
        player: gameManager.run.player,
        trap: result.trap
      }, req.body);

      saveGameData();
      res.json({ ...result, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Trigger trap
  router.post('/trigger-trap', async (req, res) => {
    try {
      const result = gameManager.triggerTrap();

      const narration = await generateGameNarration('trapTrigger', {
        player: gameManager.run.player,
        damage: result.damage
      }, req.body);

      saveGameData();
      res.json({ ...result, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Loot body
  router.post('/loot', async (req, res) => {
    try {
      const result = gameManager.lootBody();

      const narration = await generateGameNarration('loot', {
        player: gameManager.run.player,
        loot: result.loot
      }, req.body);

      saveGameData();
      res.json({ ...result, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Skip body
  router.post('/skip-body', async (req, res) => {
    try {
      const result = gameManager.skipBody();
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Skip treasure
  router.post('/skip-treasure', async (req, res) => {
    try {
      const result = gameManager.skipTreasure();
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Open treasure
  router.post('/open-treasure', async (req, res) => {
    try {
      const result = gameManager.openTreasure();

      const narration = await generateGameNarration('treasure', {
        player: gameManager.run.player,
        treasure: result.item
      }, req.body);

      saveGameData();
      res.json({ ...result, state: getEnrichedGameState(), narration });
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

  // Get shop inventory
  router.get('/shop', (req, res) => {
    const shop = gameManager.getShopInventory();
    res.json(shop || { items: [] });
  });

  // Shop buy (alternative endpoint)
  router.post('/shop/buy', (req, res) => {
    const { itemId } = req.body;
    try {
      const result = gameManager.buyFromShop(itemId);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
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
