/**
 * @fileoverview Combat routes
 *
 * Handles creature combat, befriending, NPC dialogue, and combat-end-narration
 */

import { Router } from 'express';
import { processEnemyTurn, handleCreatureKO, handleBefriendAnswer, rollTalkAcceptance } from '../../game/services/creature-combat-service.js';
import { MOVES_BY_ID } from '../../game/creatures.js';
import { getCollectionCatalog } from '../../game/services/creature-collection-service.js';
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

  // ============ CREATURE COMBAT ============

  // Start creature encounter
  router.post('/start-creature-encounter', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const encounter = gameManager.startCreatureEncounter();
      req.saveGame();

      // Enrich NPC data with TTS greeting from dialogue cache
      if (encounter.npc?.id && getNpcDialogueFromCache) {
        const cached = getNpcDialogueFromCache(req.user.id, encounter.npc.id);
        if (cached?.greetingTts) {
          encounter.npc.greetingTts = cached.greetingTts;
          encounter.npc.userId = req.user.id;
        }
      }

      res.json({ ...encounter, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creature combat cycle
  // Attack: { actionType: 'attack', moveChoices: [{ creatureIndex, moveId, targetIndex }] }
  // Defend: { actionType: 'defend' }
  // Befriend: { actionType: 'befriend', targetEnemyIndex }
  router.post('/creature-combat-cycle', (req, res) => {
    const gameManager = req.gameManager;
    const { actionType, moveChoices } = req.body;
    try {
      const result = gameManager.creatureCombatCycle(actionType || 'attack', moveChoices || []);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Learn a new move on level-up (add or replace)
  router.post('/learn-move', (req, res) => {
    const gameManager = req.gameManager;
    const { creatureIndex, newMoveId, replaceIndex } = req.body;
    try {
      if (!gameManager.run?.creatureParty) throw new Error('No active run');
      const creature = gameManager.run.creatureParty.active[creatureIndex];
      if (!creature) throw new Error('Invalid creature index');

      const moveData = MOVES_BY_ID[newMoveId];
      if (!moveData) throw new Error('Invalid move ID');

      if (typeof replaceIndex === 'number' && replaceIndex >= 0 && replaceIndex < creature.moves.length) {
        creature.moves[replaceIndex] = { ...moveData };
      } else if (creature.moves.length < 4) {
        creature.moves.push({ ...moveData });
      } else {
        throw new Error('Move slots full — must specify replaceIndex');
      }

      req.saveGame();
      res.json({ success: true, moves: creature.moves, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get creature collection + catalog for team select
  router.get('/creature-collection', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const meta = gameManager.getMeta();
      const collection = meta.creatureCollection || ['hikaribon', 'hanatchi', 'tsukimochi'];
      const befriendCount = meta.befriendCount || {};
      res.json({ collection, catalog: getCollectionCatalog(collection, befriendCount) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Post-combat item shop
  router.post('/creature-shop-roll', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.rollPostCombatShop();
      req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/creature-shop-select', (req, res) => {
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

  // Creature swap (in combat)
  router.post('/swap-creature', (req, res) => {
    const gameManager = req.gameManager;
    const { activeIndex, reserveIndex } = req.body;
    try {
      const result = gameManager.swapCreature(activeIndex, reserveIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Rearrange active creatures (swap positions, works in and out of combat)
  router.post('/rearrange-creatures', (req, res) => {
    const gameManager = req.gameManager;
    const { indexA, indexB } = req.body;
    try {
      const result = gameManager.rearrangeCreatures(indexA, indexB);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creature swap (out of combat, equip screen)
  router.post('/swap-creature-equip', (req, res) => {
    const gameManager = req.gameManager;
    const { activeIndex, reserveIndex } = req.body;
    try {
      const result = gameManager.swapCreatureOutOfCombat(activeIndex, reserveIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Befriend and replace (full roster)
  router.post('/befriend-replace', (req, res) => {
    const gameManager = req.gameManager;
    const { releaseCreatureId } = req.body;
    try {
      const result = gameManager.befriendReplace(releaseCreatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Gate: RNG check before befriend conversation
  router.post('/befriend-talk', (req, res) => {
    const gameManager = req.gameManager;
    const combat = gameManager.combat;

    if (!combat?.active || !combat.isCreatureCombat) {
      return res.status(400).json({ error: 'No active creature combat' });
    }

    if (combat.npcId) {
      return res.status(400).json({ error: 'Cannot befriend NPC trainer creatures' });
    }

    // Find exactly 1 alive, non-befriended enemy at ≤50% HP
    const enemies = combat.enemies || [];
    const eligible = enemies.filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
    if (eligible.length !== 1) {
      return res.status(400).json({ error: 'No single eligible enemy for befriend talk' });
    }

    const target = eligible[0];
    const { accepted, chance } = rollTalkAcceptance(target);

    if (!accepted) {
      // Rejection: enemy attacks (mirrors handleBefriendAnswer wrong-answer path)
      const enemyResult = processEnemyTurn(
        combat.enemies, combat.allies, false, gameManager.run?.itemBuffs
      );

      const koSwaps = [];
      for (let i = 0; i < combat.allies.length; i++) {
        if (combat.allies[i] && combat.allies[i].hp <= 0) {
          const replacement = handleCreatureKO(gameManager.run.creatureParty, i);
          if (replacement) {
            koSwaps.push({ slot: i, replacement: replacement.nameEn });
          }
        }
      }
      combat.allies = gameManager.run.creatureParty.active;

      const allAlliesKO = combat.allies.every(a => !a || a.hp <= 0);
      if (allAlliesKO) {
        combat.active = false;
        gameManager.run.active = false;
      }

      req.saveGame();

      return res.json({
        accepted: false,
        chance,
        enemyAttacks: enemyResult.attacks || [],
        koSwaps,
        combatEnded: allAlliesKO,
        allies: combat.allies,
        enemies: combat.enemies
      });
    }

    // Accepted: save and let frontend proceed to /befriend-conversation
    req.saveGame();
    res.json({ accepted: true, chance });
  });

  // Generate befriend conversation
  router.post('/befriend-conversation', async (req, res) => {
    const gameManager = req.gameManager;
    const { enemyIndex } = req.body;
    const combat = gameManager.combat;

    if (!combat?.active || !combat.isCreatureCombat) {
      return res.status(400).json({ error: 'No active creature combat' });
    }

    if (combat.npcId) {
      return res.status(400).json({ error: 'Cannot befriend NPC trainer creatures' });
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

      // Return rounds WITHOUT correctIndex, but include TTS fields
      const clientRounds = rounds.map(r => ({
        speaker: r.speaker,
        speakerTts: r.speakerTts || undefined,
        options: r.options,
        optionsTts: r.optionsTts || undefined
      }));

      res.json({
        userId: req.user.id,
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
        npcLineTts: round.npcLineTts || null,
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
      npcLineTts: r.npcLineTts || undefined,
      options: r.options
    }));

    res.json({
      userId: req.user.id,
      npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn },
      greeting,
      greetingTts: cached?.greetingTts || undefined,
      freed,
      freedTts: cached?.freedLineTts || undefined,
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
