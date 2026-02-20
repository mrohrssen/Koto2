/**
 * @fileoverview Combat routes
 *
 * Handles combat actions: combat-cycle, start-encounter, start-boss, combat-end-narration
 */

import { Router } from 'express';
import { processEnemyTurn, handleRobotKO } from '../../game/services/robot-combat-service.js';
import { getCollectionCatalog } from '../../game/services/robot-collection-service.js';
import { loadNpcs, shuffleOptions, updateBond, recordEncounter } from '../../game/services/npc-service.js';

function triggerDialogueRegen(userId, targetEnemy, userKeys, getUserVocabularyFn, regenFn) {
  if (!regenFn || !targetEnemy || !userKeys?.aiApiKey) return;
  const { words: vocabulary } = getUserVocabularyFn(userId);
  regenFn(userId, targetEnemy, {
    provider: userKeys.aiProvider || 'anthropic',
    apiKey: userKeys.aiApiKey,
    openaiModel: userKeys.openaiModel,
    openrouterModel: userKeys.openrouterModel,
    jlptLevel: userKeys.jlptLevel || 'N4'
  }, vocabulary).catch(e => {
    console.error('[BefriendDialogue] Background regen failed:', e.message);
  });
}

export default function createCombatRoutes({
  generateGameNarration,
  enrichRewardDrops,
  updateGameStatsWithEvent,
  saveGameStats,
  getGameStats,
  generateBefriendConversationFn,
  getUserVocabulary,
  getDialogueForRobot,
  regenerateRobotDialogueFn,
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
          allies,
          rewards: enrichedRewards
        }, req.userKeys);
      } else {
        narration = await generateGameNarration('defeat', {
          player: gameManager.run?.player,
          enemy,
          allies
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
        player: gameManager.run.player,
        allies: gameManager.combat?.allies || []
      }, req.userKeys);

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
      res.json({ collection, catalog: getCollectionCatalog(collection) });
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
      const { words: vocabulary } = getUserVocabulary(req.user.id);
      const userKeys = req.userKeys || {};

      // Try pre-generated dialogue first
      let rounds = null;
      if (getDialogueForRobot) {
        const preGenerated = getDialogueForRobot(req.user.id, target.id);
        if (preGenerated) {
          rounds = preGenerated;
          console.log(`[BefriendDialogue] Using pre-generated dialogue for ${target.id}`);
        }
      }

      // Fall back to on-the-fly generation
      if (!rounds) {
        console.log(`[BefriendDialogue] No pre-generated dialogue for ${target.id}, generating on-the-fly`);
        rounds = await generateBefriendConversationFn(target, vocabulary, {
          provider: userKeys.aiProvider || 'anthropic',
          apiKey: userKeys.aiApiKey,
          openaiModel: userKeys.openaiModel,
          openrouterModel: userKeys.openrouterModel,
          jlptLevel: userKeys.jlptLevel || 'N4'
        });
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
    const gameManager = req.gameManager;
    const { roundIndex, selectedIndex } = req.body;
    const combat = gameManager.combat;

    if (!combat?.active || !combat.befriendConversation?.active) {
      console.error('[BefriendAnswer] Rejected:', {
        hasCombat: !!combat,
        combatActive: combat?.active,
        hasBefriendConvo: !!combat?.befriendConversation,
        convoActive: combat?.befriendConversation?.active,
        roundIndex, selectedIndex
      });
      return res.status(400).json({ error: 'No active befriend conversation' });
    }

    const convo = combat.befriendConversation;
    const targetEnemy = combat.enemies[convo.targetEnemyIndex];

    if (roundIndex !== convo.currentRound) {
      return res.status(400).json({ error: 'Wrong round index' });
    }

    const round = convo.rounds[roundIndex];
    if (!round) {
      return res.status(400).json({ error: 'Invalid round' });
    }

    const correct = selectedIndex === round.correctIndex;

    if (!correct) {
      // Failure: clear conversation, enemies attack
      combat.befriendConversation = null;

      const enemyResult = processEnemyTurn(
        combat.enemies, combat.allies, false, gameManager.run?.itemBuffs
      );

      // Handle KO'd allies
      const koSwaps = [];
      for (let i = 0; i < combat.allies.length; i++) {
        if (combat.allies[i] && combat.allies[i].hp <= 0) {
          const replacement = handleRobotKO(gameManager.run.robotParty, i);
          if (replacement) {
            koSwaps.push({ slot: i, replacement: replacement.nameEn });
          }
        }
      }
      combat.allies = gameManager.run.robotParty.active;

      const allAlliesKO = combat.allies.every(a => !a || a.hp <= 0);
      if (allAlliesKO) {
        combat.active = false;
        gameManager.run.active = false;
      }

      req.saveGame();
      triggerDialogueRegen(req.user.id, targetEnemy, req.userKeys, getUserVocabulary, regenerateRobotDialogueFn);
      return res.json({
        correct: false,
        correctIndex: round.correctIndex,
        enemyAttacks: enemyResult.attacks || [],
        koSwaps,
        combatEnded: allAlliesKO,
        victory: false,
        allies: combat.allies,
        enemies: combat.enemies
      });
    }

    // Correct answer
    convo.currentRound++;

    if (convo.currentRound >= 3) {
      // All 3 rounds correct — use existing befriend cycle
      combat.befriendConversation = null;

      const result = gameManager.robotCombatCycle('befriend');

      req.saveGame();
      triggerDialogueRegen(req.user.id, targetEnemy, req.userKeys, getUserVocabulary, regenerateRobotDialogueFn);
      return res.json({
        correct: true,
        correctIndex: round.correctIndex,
        conversationComplete: true,
        befriend: result.befriend,
        combatEnded: result.combatEnded || false,
        victory: result.victory || false,
        robotParty: result.robotParty,
        enemies: combat.enemies,
        state: req.getEnrichedGameState()
      });
    }

    // Correct but more rounds to go
    req.saveGame();
    res.json({
      correct: true,
      correctIndex: round.correctIndex,
      conversationComplete: false,
      currentRound: convo.currentRound
    });
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
    const gameManager = req.gameManager;
    const { roundIndex, selectedIndex } = req.body;
    const dialogue = gameManager.run?.npcDialogue;

    if (!dialogue?.active) {
      return res.status(400).json({ error: 'No active NPC dialogue' });
    }

    if (roundIndex !== dialogue.currentRound) {
      return res.status(400).json({ error: 'Wrong round index' });
    }

    if (selectedIndex < 0 || selectedIndex > 2) {
      return res.status(400).json({ error: 'Invalid selection' });
    }

    const round = dialogue.rounds[roundIndex];
    const tone = round._toneMap[selectedIndex];
    const delta = tone === 'positive' ? 1 : tone === 'negative' ? -1 : 0;
    dialogue.totalDelta += delta;
    dialogue.currentRound++;

    const dialogueComplete = dialogue.currentRound >= 3;

    if (dialogueComplete) {
      const meta = gameManager.getMeta();
      // Clamp total bond change to +1, 0, or -1
      const totalDelta = Math.max(-1, Math.min(1, dialogue.totalDelta));
      updateBond(meta, dialogue.npcId, totalDelta);
      recordEncounter(meta, dialogue.npcId);
      const bond = meta.npcBonds[dialogue.npcId];
      const npcName = dialogue.npcData.name;
      const npcNameEn = dialogue.npcData.nameEn;
      const npcId = dialogue.npcId;

      gameManager.run.npcDialogue = null;
      req.saveGame();

      // Log to narration engine memory
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

      // Trigger background regeneration for next encounter
      if (regenNpcDialogueFn && getUserVocabulary) {
        const userKeys = req.userKeys || {};
        if (userKeys.aiApiKey) {
          const { words: vocabulary, vidSet } = getUserVocabulary(req.user.id);
          const vocabSet = new Set(vocabulary);
          const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
            ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
            : null;
          regenNpcDialogueFn(req.user.id, npcId, {
            provider: userKeys.aiProvider || 'anthropic',
            apiKey: userKeys.aiApiKey,
            openaiModel: userKeys.openaiModel,
            openrouterModel: userKeys.openrouterModel,
            jlptLevel: userKeys.jlptLevel || 'N4'
          }, { words: vocabulary, vidSet, checkViolationsFn }).catch(e => {
            console.error('[NpcDialogue] Background regen failed:', e.message);
          });
        }
      }

      return res.json({
        tone,
        delta,
        dialogueComplete: true,
        totalDelta,
        bond: bond.bond,
        npcName,
        npcNameEn,
        state: req.getEnrichedGameState()
      });
    }

    req.saveGame();
    res.json({
      tone,
      delta,
      dialogueComplete: false,
      currentRound: dialogue.currentRound
    });
  });

  return router;
}
