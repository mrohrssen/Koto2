/**
 * @fileoverview Combat routes
 *
 * Handles combat actions: combat-cycle, start-encounter, start-boss, combat-end-narration
 */

import { Router } from 'express';
import { useChipSkill } from '../../game/combat/chip-skills.js';
import { getChip, getChipCharge, isChipSkillReady, getChipLevel } from '../../game/items/chips.js';

export default function createCombatRoutes({
  generateGameNarration,
  enrichRewardDrops,
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats
}) {
  const router = Router();

  // Combat cycle (vocab-pause turn-based)
  router.post('/combat-cycle', (req, res) => {
    const gameManager = req.gameManager;
    const { attackerType, actionType } = req.body;
    try {
      const result = gameManager.combatCycle(attackerType || 'player', actionType);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Combat end narration
  router.post('/combat-end-narration', async (req, res) => {
    const gameManager = req.gameManager;
    const { victory, expGained, creditsGained, loot, leveledUp, newLevel, isBoss } = req.body;
    const gameStats = getGameStats();
    try {
      let narration;
      const enemy = gameManager.combat?.enemy || gameManager.combat?.enemies?.[0];

      if (victory) {
        const rewards = { xp: expGained, credits: creditsGained, drops: loot };
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
        }, req.userKeys);
      } else {
        narration = await generateGameNarration('defeat', {
          player: gameManager.run?.player,
          enemy
        }, req.userKeys);
      }

      res.json({ narration, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start encounter
  router.post('/start-encounter', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const encounter = gameManager.startEncounter();
      const narration = await generateGameNarration('encounterStart', {
        enemy: encounter.enemy,
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({ ...encounter, state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start boss encounter
  router.post('/start-boss', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const encounter = gameManager.startBossEncounter();
      const narration = await generateGameNarration('bossStart', {
        enemy: encounter.enemy,
        player: gameManager.run.player,
        isFinalBoss: encounter.isFinalBoss
      }, req.userKeys);

      req.saveGame();
      res.json({ ...encounter, state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Use a chip's active skill in combat
  router.post('/use-chip-skill', (req, res) => {
    const gameManager = req.gameManager;
    const { chipId } = req.body;
    if (!chipId) {
      return res.status(400).json({ error: 'chipId required' });
    }
    if (!gameManager.combat?.active) {
      return res.status(400).json({ error: 'No active combat' });
    }

    const result = useChipSkill(
      gameManager.run.player,
      gameManager.combat.enemy,
      chipId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json({
      ...result,
      playerHp: { current: gameManager.run.player.hp, max: gameManager.run.player.maxHp },
      enemyHp: { current: gameManager.combat.enemy.hp, max: gameManager.combat.enemy.maxHp },
      chipCharges: gameManager.run.player._chipCharges
    });
  });

  // Get info about a chip's skill
  router.get('/chip-skill-info/:chipId', (req, res) => {
    const gameManager = req.gameManager;
    const { chipId } = req.params;
    const chip = getChip(chipId);
    if (!chip) {
      return res.status(404).json({ error: 'Chip not found' });
    }

    const player = gameManager.run?.player;
    if (!player) {
      return res.status(400).json({ error: 'No active run' });
    }

    res.json({
      chip: {
        id: chip.id,
        name: chip.name,
        nameEn: chip.nameEn,
        skill: chip.skill
      },
      charges: getChipCharge(player, chipId),
      chargesRequired: chip.skill?.chargesRequired || 5,
      level: getChipLevel(player, chipId),
      isReady: isChipSkillReady(player, chipId)
    });
  });

  // ============ ROBOT COMBAT ============

  // Start robot encounter
  router.post('/start-robot-encounter', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const encounter = gameManager.startRobotEncounter();
      req.saveGame();
      res.json({ ...encounter, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Robot combat cycle
  router.post('/robot-combat-cycle', (req, res) => {
    const gameManager = req.gameManager;
    const { actionType } = req.body;
    try {
      const result = gameManager.robotCombatCycle(actionType || 'attack');
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Use robot ultimate
  router.post('/use-robot-ultimate', (req, res) => {
    const gameManager = req.gameManager;
    const { robotIndex } = req.body;
    try {
      const result = gameManager.useRobotUltimate(robotIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get starter robots
  router.get('/starters', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const starters = gameManager.getStarters();
      res.json({ starters });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Post-combat item shop
  router.post('/robot-shop-roll', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.rollPostCombatShop();
      req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/robot-shop-select', (req, res) => {
    const gameManager = req.gameManager;
    const { itemIndex } = req.body;
    try {
      const result = gameManager.selectShopItem(itemIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Robot swap (in combat)
  router.post('/swap-robot', (req, res) => {
    const gameManager = req.gameManager;
    const { activeIndex, reserveIndex } = req.body;
    try {
      const result = gameManager.swapRobot(activeIndex, reserveIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Rearrange active robots (swap positions, works in and out of combat)
  router.post('/rearrange-robots', (req, res) => {
    const gameManager = req.gameManager;
    const { indexA, indexB } = req.body;
    try {
      const result = gameManager.rearrangeRobots(indexA, indexB);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Robot swap (out of combat, equip screen)
  router.post('/swap-robot-equip', (req, res) => {
    const gameManager = req.gameManager;
    const { activeIndex, reserveIndex } = req.body;
    try {
      const result = gameManager.swapRobotOutOfCombat(activeIndex, reserveIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Befriend and replace (full roster)
  router.post('/befriend-replace', (req, res) => {
    const gameManager = req.gameManager;
    const { releaseRobotId } = req.body;
    try {
      const result = gameManager.befriendReplace(releaseRobotId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
