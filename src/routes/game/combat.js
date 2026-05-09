import { Router } from 'express';
import { handleBefriendAnswer, rollTalkAcceptance } from '../../game/services/creature-combat-service.js';
import { MOVES_BY_ID } from '../../game/creatures.js';
import { getCollectionCatalog } from '../../game/services/creature-collection-service.js';
import { loadNpcs, shuffleOptions, updateBond, recordEncounter, handleNpcDialogueResponse } from '../../game/services/npc-service.js';
import { buildVocabConfig, buildBefriendDialogueVocabConfig } from './route-helpers.js';
import { getNpcLines, getNpcDefeatFrames } from '../../game/dialogue-loader.js';
import { selectNpcLine } from '../../game/dialogue-filter.js';
import { getKnownWordsFromFsrs, getWordDict } from '../../game/bootstrap/word-knowledge.js';
import { assembleFrame, selectBestFrame } from '../../game/token-format.js';

export default function createCombatRoutes({
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

  function buildDevFallbackBefriendRounds(targetEnemy) {
    const nameEn = targetEnemy?.nameEn || 'Creature';
    return [
      {
        speaker: `${nameEn}: ...?`,
        options: ['Offer food', 'Speak calmly', 'Threaten it'],
        correctIndex: 1
      },
      {
        speaker: `${nameEn}: (watches you closely)`,
        options: ['Back away slowly', 'Hold out your hand', 'Throw a rock'],
        correctIndex: 1
      },
      {
        speaker: `${nameEn}: ...!`,
        options: ['Smile and wait', 'Shout louder', 'Turn your back'],
        correctIndex: 0
      }
    ];
  }

  function allowDevBefriendFallback() {
    // Explicit opt-in only. Keeps i+1 Japanese rules safe in production.
    return process.env.DEV_BEFRIEND_FALLBACK === '1';
  }

  // ============ CREATURE COMBAT ============

  // Start creature encounter
  router.post('/start-creature-encounter', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const settings = req.getSettings?.() || {};
      gameManager._debugSuperAttack = !!settings.debugSuperAttack;
      const encounter = gameManager.combatCycleService.startCreatureEncounter();
      req.saveGame();

      // Enrich NPC data with TTS greeting from dialogue cache
      if (encounter.npc?.id && getNpcDialogueFromCache) {
        const cached = getNpcDialogueFromCache(req.user.id, encounter.npc.id);
        if (cached?.greetingTts) {
          encounter.npc.greetingTts = cached.greetingTts;
          encounter.npc.userId = req.user.id;
        }
      }

      // Word-gated bootstrap dialogue for NPC encounters
      let npcDialogue = null;
      const npcData = encounter.npc;
      if (npcData && getNpcLines()[npcData.id]) {
        try {
          const knownWords = new Set(getKnownWordsFromFsrs(req.user.id));
          const npcPool = getNpcLines()[npcData.id];

          const mapLine = (l) => l ? {
            text: l.raw,
            tokens: l.tokens || [],
            overrides: l.overrides || {},
          } : null;

          const fightStart = selectNpcLine(npcPool.fightStart || [], knownWords, { dict: getWordDict() });
          const defeatLine = selectNpcLine(npcPool.defeatLine || [], knownWords, { dict: getWordDict() });

          npcDialogue = {
            fightStart: mapLine(fightStart),
            defeatLine: mapLine(defeatLine),
            useKanji: false,
          };
        } catch (e) {
          console.warn('[NPC] Bootstrap dialogue selection failed:', e.message);
        }
      }

      res.json({ ...encounter, npcDialogue, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creature combat cycle
  // Attack: { actionType: 'attack', moveChoices: [{ creatureIndex, moveId, targetIndex }] }
  // The attack payload contains exactly one player-owned cursor action.
  // Defend: { actionType: 'defend' }
  // Befriend: { actionType: 'befriend', targetEnemyIndex }
  router.post('/creature-combat-cycle', (req, res) => {
    const gameManager = req.gameManager;
    const { actionType, moveChoices } = req.body;
    try {
      const result = gameManager.combatCycleService.creatureCombatCycle(actionType || 'attack', moveChoices || []);
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
      } else if (creature.moves.length < 3) {
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
      const creatureCounts = meta.creatureCounts || {};
      res.json({ collection, catalog: getCollectionCatalog(collection, befriendCount, creatureCounts) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Post-combat item shop
  router.post('/creature-shop-roll', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.combatCycleService.rollPostCombatShop();
      req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/creature-shop-select', (req, res) => {
    const gameManager = req.gameManager;
    const { itemIndex, targetIndex } = req.body;
    try {
      const result = gameManager.combatCycleService.selectShopItem(itemIndex, targetIndex ?? 0);
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
      const result = gameManager.combatCycleService.swapCreature(activeIndex, reserveIndex);
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
      const result = gameManager.combatCycleService.rearrangeCreatures(indexA, indexB);
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
      const result = gameManager.combatCycleService.swapCreatureOutOfCombat(activeIndex, reserveIndex);
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
      const result = gameManager.combatCycleService.befriendReplace(releaseCreatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ BEFRIEND NAME QUIZ (Koto2) ============

  // Get current befriend quiz state
  router.post('/befriend-quiz', (req, res) => {
    const gm = req.gameManager;
    const quiz = gm.combatCycleService.getBefriendQuiz();
    if (!quiz) {
      return res.status(400).json({ error: 'No active befriend quiz' });
    }
    res.json(quiz);
  });

  // Answer befriend quiz (Fight or Talk)
  router.post('/befriend-quiz-answer', (req, res) => {
    const { action, answerId } = req.body;
    const gm = req.gameManager;

    if (action === 'fight') {
      const result = gm.combatCycleService.handleBefriendFight();
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      req.saveGame();
      return res.json({ ...result, state: req.getEnrichedGameState() });
    }

    if (action === 'talk') {
      if (!answerId) {
        return res.status(400).json({ error: 'answerId required for talk action' });
      }
      const result = gm.combatCycleService.handleBefriendQuizAnswer(answerId);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      req.saveGame();
      return res.json({ ...result, state: req.getEnrichedGameState() });
    }

    res.status(400).json({ error: 'Invalid action — must be "fight" or "talk"' });
  });

  // ============ OLD BEFRIEND SYSTEM ============

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

    const creatureIndex = req.body?.creatureIndex;
    if (typeof creatureIndex !== 'number' || creatureIndex < 0 || !Number.isInteger(creatureIndex)) {
      return res.status(400).json({ error: 'creatureIndex required (active party slot)' });
    }
    const allies = combat.allies || [];
    if (!allies[creatureIndex] || allies[creatureIndex].hp <= 0) {
      return res.status(400).json({ error: 'Invalid creature slot for befriend' });
    }
    if (!combat.befriendAttemptedSlots) combat.befriendAttemptedSlots = {};
    if (combat.befriendAttemptedSlots[creatureIndex]) {
      return res.status(400).json({ error: 'This creature already used their turn on befriend' });
    }

    // Find exactly 1 alive, non-befriended enemy at ≤50% HP
    const enemies = combat.enemies || [];
    const eligible = enemies.filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
    if (eligible.length !== 1) {
      return res.status(400).json({ error: 'No single eligible enemy for befriend talk' });
    }

    const target = eligible[0];
    combat.befriendAttemptedSlots[creatureIndex] = true;
    const { accepted, chance } = rollTalkAcceptance(target);

    if (!accepted) {
      const rejection = gameManager.combatCycleService.handleBefriendTalkRejection();
      req.saveGame();
      return res.json({
        accepted: false,
        chance,
        ...rejection,
        befriendAttemptedSlots: { ...combat.befriendAttemptedSlots }
      });
    }

    // Accepted: save and let frontend proceed to /befriend-conversation
    req.saveGame();
    res.json({
      accepted: true,
      chance,
      befriendAttemptedSlots: { ...combat.befriendAttemptedSlots }
    });
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
      let cached = getCreatureDialogueFromCache?.(req.user.id, target.id);
      if (!cached?.rounds) {
        const vocabConfig = buildBefriendDialogueVocabConfig(req, getUserVocabulary, checkSentenceViolations);
        if (!vocabConfig) {
          if (allowDevBefriendFallback()) {
            const rounds = buildDevFallbackBefriendRounds(target);

            combat.lastBefriendTargetIndex = targetIdx;
            combat.befriendConversation = {
              targetEnemyIndex: targetIdx,
              rounds,
              currentRound: 0,
              active: true
            };
            req.saveGame();

            return res.json({
              userId: req.user.id,
              targetEnemy: { name: target.name, nameEn: target.nameEn, element: target.element, id: target.id },
              rounds: rounds.map(r => ({ speaker: r.speaker, options: r.options })),
              targetEnemyIndex: targetIdx,
              devFallback: true
            });
          }

          console.warn('[BefriendConversation] No AI config: add API keys in Settings or set OPENAI_API_KEY (etc.) in .env');
          return res.status(503).json({
            error: 'Befriend dialogue needs an AI API key. Add one in Settings, or for local play set OPENAI_API_KEY in .env.'
          });
        }
        console.log(`[CreatureDialogue] No cached dialogue for ${target.id}, generating on-demand`);
        await regenCreatureDialogueFn(
          req.user.id, target.id, vocabConfig.aiConfig,
          { words: vocabConfig.vocabulary, checkViolationsFn: vocabConfig.checkViolationsFn }
        );
        cached = getCreatureDialogueFromCache?.(req.user.id, target.id);
      }

      const rounds = cached?.rounds;
      if (!rounds) {
        console.error(`[BefriendConversation] Generation produced no cache for ${target.id} (AI error, vocab repair, or missing creature data)`);
        return res.status(503).json({
          error: 'Creature dialogue generation failed. Check server logs; try again or ensure AI keys are configured.'
        });
      }

      combat.lastBefriendTargetIndex = targetIdx;
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

    // --- v1: defeat line from shared npcDefeat pool ---
    const defeatFrames = getNpcDefeatFrames();
    const knownWords = new Set(getKnownWordsFromFsrs(req.user.id));

    // Pick a random active party creature for {randomPlayerCreature} slot
    const activeParty = gameManager.run.creatureParty?.active || [];
    const randomCreature = activeParty.length > 0
      ? activeParty[Math.floor(Math.random() * activeParty.length)]
      : null;
    const entities = randomCreature
      ? { randomPlayerCreature: randomCreature }
      : {};

    // Assemble frames (fills slots), then filter by i+1 and score (random tie-break)
    const candidates = defeatFrames.map(frame => {
      const assembled = assembleFrame(frame, entities, { dict: getWordDict() });
      return { ...assembled, raw: frame.raw, id: frame.id };
    });
    const selectedLine =
      selectBestFrame(candidates, knownWords, { randomizeTies: true, dict: getWordDict() }) ||
      { tokens: [], raw: '', words: [] };

    // Do NOT set gameManager.run.npcDialogue — that traps phase machine in NPC_DIALOGUE.
    // Set skillSelectionPending directly for immediate phase transition.
    const currentRoom = gameManager.getCurrentRoom();
    if (currentRoom?.npcBattle) {
      currentRoom.npcBattle.skillSelectionPending = true;
    }

    req.saveGame();

    res.json({
      mode: 'defeat_line',
      npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn, speakerId: npc.speakerId }, // speakerId for future TTS
      line: { tokens: selectedLine.tokens, raw: selectedLine.raw },
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
