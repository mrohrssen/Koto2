/**
 * @fileoverview Combat routes
 *
 * Handles combat actions: combat-cycle, start-encounter, start-boss, combat-end-narration
 */

import { Router } from 'express';
import { processEnemyTurn, handleRobotKO, handleBefriendAnswer } from '../../game/services/robot-combat-service.js';
import { getCollectionCatalog } from '../../game/services/robot-collection-service.js';
import { loadNpcs, shuffleOptions, updateBond, recordEncounter, handleNpcDialogueResponse } from '../../game/services/npc-service.js';
import { buildVocabConfig } from './route-helpers.js';

export default function createCombatRoutes({
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats,
  getUserVocabulary,
  getCreatureDialogueFromCache,
  regenCreatureDialogueFn,
  getNpcDialogueFromCache,
  logNpcEncounterFn,
  regenNpcDialogueFn,
  setNpcMemoryFlagFn,
  updateNpcMemoryBondFn,
  checkSentenceViolations
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
      const allies = gameManager.combat?.allies || [];

      if (victory) {
        updateGameStatsWithEvent(gameStats, 'combat', {
          victory: true,
          enemyName: enemy?.name
        });
        saveGameStats(gameStats);

        narration = isBoss
          ? 'ボスが倒れる。「お前は...強かった...」長い戦いが終わった。よくやった！'
          : '敵が倒れる。「まさか...」最後の言葉が消える。勝利だ。';
      } else {
        narration = '力が抜ける。「弱かったな...」敵の声が遠くなる。目の前が暗くなる...';
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
      const narration = null; // DM narration disabled — frontend discards this

      req.saveGame();
      res.json({ ...encounter, state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
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

  // Get robot collection + catalog for team select
  router.get('/robot-collection', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const meta = gameManager.getMeta();
      const collection = meta.robotCollection || ['hikaribon', 'hanatchi', 'tsukimochi'];
      const befriendCount = meta.befriendCount || {};
      res.json({ collection, catalog: getCollectionCatalog(collection, befriendCount) });
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

  // Generate befriend conversation
  router.post('/befriend-conversation', async (req, res) => {
    const gameManager = req.gameManager;
    const { enemyIndex } = req.body;
    const combat = gameManager.combat;

    if (!combat?.active || !combat.isRobotCombat) {
      return res.status(400).json({ error: 'No active robot combat' });
    }

    if (combat.npcId) {
      return res.status(400).json({ error: 'Cannot befriend NPC trainer robots' });
    }

    const enemies = combat.enemies || [];
    let targetIdx = typeof enemyIndex === 'number' ? enemyIndex : -1;
    if (targetIdx < 0) {
      targetIdx = enemies.findIndex(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
    }

    const target = enemies[targetIdx];
    if (!target || target.hp <= 0 || target.befriended || (target.hp / target.maxHp) > 0.5) {
      return res.status(400).json({ error: 'No eligible enemy for befriend conversation' });
    }

    try {
      // Try cached dialogue first, generate on-demand if missing
      let cached = getCreatureDialogueFromCache?.(req.user.id, target.id);
      if (!cached?.rounds) {
        const vocabConfig = buildVocabConfig(req, getUserVocabulary, checkSentenceViolations);
        if (vocabConfig) {
          console.log(`[CreatureDialogue] No cached dialogue for ${target.id}, generating on-demand`);
          await regenCreatureDialogueFn(
            req.user.id, target.id, vocabConfig.aiConfig,
            { words: vocabConfig.vocabulary, checkViolationsFn: vocabConfig.checkViolationsFn }
          );
          cached = getCreatureDialogueFromCache?.(req.user.id, target.id);
        }
      }

      const rounds = cached?.rounds;
      if (!rounds) {
        return res.status(503).json({ error: 'Creature dialogue generation failed' });
      }

      combat.befriendConversation = {
        targetEnemyIndex: targetIdx,
        rounds,
        currentRound: 0,
        active: true
      };

      req.saveGame();

      // Return rounds WITHOUT correctIndex
      const clientRounds = rounds.map(r => ({
        speaker: r.speaker,
        options: r.options
      }));

      res.json({
        targetEnemy: { name: target.name, nameEn: target.nameEn, element: target.element, id: target.id },
        rounds: clientRounds,
        targetEnemyIndex: targetIdx
      });
    } catch (error) {
      console.error('[Befriend Conversation] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Validate befriend conversation answer
  router.post('/befriend-answer', (req, res) => {
    const result = handleBefriendAnswer(req.gameManager, req.body);

    if (result.error) {
      if (result.statusCode === 400 && result.error === 'No active befriend conversation') {
        const combat = req.gameManager.combat;
        console.error('[BefriendAnswer] Rejected:', {
          hasCombat: !!combat,
          combatActive: combat?.active,
          hasBefriendConvo: !!combat?.befriendConversation,
          convoActive: combat?.befriendConversation?.active,
          roundIndex: req.body.roundIndex,
          selectedIndex: req.body.selectedIndex
        });
      }
      return res.status(result.statusCode || 400).json({ error: result.error });
    }

    req.saveGame();

    if (result.needsDialogueRegen && regenCreatureDialogueFn) {
      const vocabConfig = buildVocabConfig(req, getUserVocabulary, checkSentenceViolations);
      if (vocabConfig) {
        regenCreatureDialogueFn(
          req.user.id, result.targetEnemy?.id, vocabConfig.aiConfig,
          { words: vocabConfig.vocabulary, checkViolationsFn: vocabConfig.checkViolationsFn }
        ).catch(e => console.error('[CreatureDialogue] Background regen failed:', e.message));
      }
    }

    // Build client response (strip internal fields, add state when needed)
    const { targetEnemy, needsDialogueRegen, ...clientResult } = result;
    if (result.conversationComplete && result.correct) {
      clientResult.state = req.getEnrichedGameState();
    }

    res.json(clientResult);
  });

  // Start NPC post-combat dialogue
  router.post('/npc-dialogue-start', (req, res) => {
    const gameManager = req.gameManager;
    const combat = gameManager.combat;

    if (!combat?.npcId) {
      return res.status(400).json({ error: 'No NPC in this combat' });
    }

    const npcs = loadNpcs();
    const npc = npcs[combat.npcId];
    if (!npc) {
      return res.status(400).json({ error: 'NPC not found' });
    }

    // Try AI-generated dialogue from cache first
    const cached = getNpcDialogueFromCache?.(req.user.id, combat.npcId);

    // Use cached data if available, otherwise fall back to static npcs.json
    const greeting = cached?.greeting || npc.greeting;
    const freed = cached?.freedLine || npc.postCombat.freed;
    const sourceRounds = cached?.rounds || npc.postCombat.rounds;

    const preparedRounds = sourceRounds.map(round => {
      const { shuffled, toneMap } = shuffleOptions(round.options);
      return {
        npcLine: round.npcLine,
        options: shuffled,
        _toneMap: toneMap
      };
    });

    gameManager.run.npcDialogue = {
      active: true,
      npcId: npc.id,
      npcData: { id: npc.id, name: npc.name, nameEn: npc.nameEn },
      currentRound: 0,
      totalDelta: 0,
      rounds: preparedRounds
    };

    req.saveGame();

    const clientRounds = preparedRounds.map(r => ({
      npcLine: r.npcLine,
      options: r.options
    }));

    res.json({
      npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn },
      greeting,
      freed,
      rounds: clientRounds
    });
  });

  // Respond to NPC dialogue round
  router.post('/npc-dialogue-respond', (req, res) => {
    const result = handleNpcDialogueResponse(req.gameManager, req.body);

    if (result.error) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }

    req.saveGame();

    // Post-completion side effects (memory logging, background regen)
    if (result.dialogueComplete) {
      const { npcId, totalDelta } = result;

      if (logNpcEncounterFn) {
        const outcome = totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral';
        logNpcEncounterFn(req.user.id, npcId, outcome, `Bond change: ${totalDelta}`);
      }
      if (updateNpcMemoryBondFn) {
        updateNpcMemoryBondFn(req.user.id, npcId, totalDelta);
      }
      if (setNpcMemoryFlagFn) {
        setNpcMemoryFlagFn(req.user.id, npcId, 'liberated', true);
      }

      if (regenNpcDialogueFn) {
        const vocabConfig = buildVocabConfig(req, getUserVocabulary, checkSentenceViolations);
        if (vocabConfig) {
          regenNpcDialogueFn(req.user.id, npcId, vocabConfig.aiConfig, {
            words: vocabConfig.vocabulary,
            vidSet: vocabConfig.vidSet,
            checkViolationsFn: vocabConfig.checkViolationsFn
          }).catch(e => {
            console.error('[NpcDialogue] Background regen failed:', e.message);
          });
        }
      }

      // Build client response (strip internal npcId, add state)
      const { npcId: _npcId, ...clientResult } = result;
      clientResult.state = req.getEnrichedGameState();
      return res.json(clientResult);
    }

    res.json(result);
  });

  return router;
}
