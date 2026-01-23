/**
 * @fileoverview Combat routes
 *
 * Handles combat actions: realtime-attack, start-encounter, start-boss, combat-end-narration
 */

import { Router } from 'express';

/**
 * Create combat router
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @param {function} deps.saveGameData - Save game data to file
 * @param {function} deps.generateGameNarration - Generate AI narration
 * @param {function} deps.enrichRewardDrops - Enrich reward drops with item data
 * @param {function} deps.updateGameStatsWithEvent - Update game stats
 * @param {function} deps.saveGameStats - Save game stats
 * @param {function} deps.getGameStats - Get game stats object
 * @returns {Router}
 */
export default function createCombatRoutes({
  gameManager,
  getEnrichedGameState,
  saveGameData,
  generateGameNarration,
  enrichRewardDrops,
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats
}) {
  const router = Router();

  // Realtime attack cycle
  router.post('/realtime-attack', (req, res) => {
    const { attackerType } = req.body;
    try {
      const result = gameManager.realtimeAttackCycle(attackerType || 'player');
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Combat end narration (for realtime combat)
  router.post('/combat-end-narration', async (req, res) => {
    const { victory, expGained, goldGained, loot, leveledUp, newLevel, isBoss } = req.body;
    const gameStats = getGameStats();
    try {
      let narration;
      const enemy = gameManager.combat?.enemy;

      if (victory) {
        const rewards = { xp: expGained, gold: goldGained, drops: loot };
        const enrichedRewards = enrichRewardDrops(rewards);
        updateGameStatsWithEvent(gameStats, 'combat', {
          victory: true,
          enemyName: enemy?.name
        });
        saveGameStats(gameStats);

        narration = await generateGameNarration('victory', {
          player: gameManager.run?.player,
          enemy,
          rewards: enrichedRewards
        }, req.body);
      } else {
        narration = await generateGameNarration('defeat', {
          player: gameManager.run?.player,
          enemy
        }, req.body);
      }

      res.json({ narration, state: getEnrichedGameState() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start encounter
  router.post('/start-encounter', async (req, res) => {
    try {
      const encounter = gameManager.startEncounter();
      const narration = await generateGameNarration('encounterStart', {
        enemy: encounter.enemy,
        player: gameManager.run.player
      }, req.body);

      saveGameData();
      res.json({ ...encounter, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start boss encounter
  router.post('/start-boss', async (req, res) => {
    try {
      const encounter = gameManager.startBossEncounter();
      const narration = await generateGameNarration('bossStart', {
        enemy: encounter.enemy,
        player: gameManager.run.player
      }, req.body);

      saveGameData();
      res.json({ ...encounter, state: getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
