import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNewWordsForDiscovery } from '../../game/vocab-manager.js';
import { loadWordDictionary } from '../../game/word-dictionary.js';
import { resolveLiveDictPath } from '../../game/live-dict-path.js';
import { getDiscoveryStatus } from '../../word-tracking.js';
import { getQuizQuestion as getBunproQuestion, submitAnswer as submitBunproAnswer } from '../../bunpro.js';
import { validateTeamSelection } from '../../game/services/creature-collection-service.js';
import { rollFriendlyNpcOffers } from '../../game/services/exploration-service.js';
import { getAreaById } from '../../game/rooms.js';
import { applyItem } from '../../game/services/item-service.js';
import {
  CRYSTAL_COSTS,
  CRYSTAL_REASONS,
  prepareCrystalSpend,
  recordCrystalSpend
} from '../../game/services/crystal-wallet-service.js';
import {
  assembleFrame,
  entityToToken,
  getEligibleFrameTokens,
  selectBestFrame,
} from '../../game/token-format.js';
import { getKnownWordsFromFsrs, getWordDict } from '../../game/bootstrap/word-knowledge.js';
import { rollSkillMasterOffers, getPartySkillDisplay } from '../../game/party-skills.js';
import { getShopPurchaseFrames, getShopGreetingFrames, getShrineGreetingFrames, getGameMasterAskFrames, getGameMasterFinishFrames, getGameMasterYesFrame, getGameMasterNoFrame, getSkillSelectFrame } from '../../game/dialogue-loader.js';

const SPRITE_VERSION = '20260430b';
const SHRINE_REWARDS = [
  {
    id: 'heal_all',
    title: 'Heal all creatures',
    description: 'Restore 50% HP to living active and reserve creatures.'
  },
  {
    id: 'restore_mp_all',
    title: 'Restore MP',
    description: 'Restore MP for all creatures to full.'
  },
  {
    id: 'level_up',
    title: 'Level up one creature',
    description: 'Choose one living creature to gain one level.'
  }
];
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const quizQuestionsPath = join(__dirname, '../../data/quiz-questions.json');
const creaturesPath = join(__dirname, '../../../data/creatures.json');
const itemsPath = join(__dirname, '../../../data/items.json');
const movesPath = join(__dirname, '../../../data/moves.json');
const allCreatures = JSON.parse(readFileSync(creaturesPath, 'utf8'));
const allItems = JSON.parse(readFileSync(itemsPath, 'utf8'));
const allMoves = JSON.parse(readFileSync(movesPath, 'utf8'));

function loadQuizQuestions() {
  const data = JSON.parse(readFileSync(quizQuestionsPath, 'utf-8'));
  return data.questions;
}

export default function createRunRoutes({
  cancelPendingPrefetches,
  clearPrefetchCache,
  queueMissingCreatureDialoguesFn,
  getUserVocabulary,
  queueMissingNpcDialoguesFn,
  checkSentenceViolations
}) {
  const router = Router();
  const SPEED_REVIEW_TRANSITION_ERROR_CODES = new Set([
    'SPEED_REVIEW_TRANSITION_CONFLICT',
    'ROOM_STATE_CONFLICT',
    'INVALID_ROOM_STATE',
    'CONFLICT'
  ]);
  const SPEED_REVIEW_TRANSITION_ERROR_MESSAGES = [
    'No active run',
    'Speed review room not found',
    'Room is not a speed review room',
    'Speed review room state missing',
    'Speed review snapshot not initialized',
    'commitIndex is outside snapshot bounds',
    'Commit does not match server snapshot order',
    'already completed'
  ];

  function isSpeedReviewRoomTransitionError(error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    if (SPEED_REVIEW_TRANSITION_ERROR_CODES.has(code)) {
      return true;
    }

    const message = String(error?.message || '');
    return SPEED_REVIEW_TRANSITION_ERROR_MESSAGES.some(knownMessage => message.includes(knownMessage));
  }

  /** Fire-and-forget: queue missing creature + NPC dialogues for current run */
  function queueBackgroundDialogues(req) {
    const userKeys = req.userKeys || {};
    if (!userKeys.aiDataSharingConsent || !userKeys.aiApiKey || !userKeys.aiProvider) return;

    const aiConfig = {
      provider: userKeys.aiProvider,
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel,
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    };

    if (queueMissingCreatureDialoguesFn && getUserVocabulary) {
      const { words: vocabulary } = getUserVocabulary(req.user.id);
      const vocabSet = new Set(vocabulary);
      const checkViolationsFn = checkSentenceViolations
        ? (text) => checkSentenceViolations(text, vocabSet, new Set())
        : null;
      queueMissingCreatureDialoguesFn(req.user.id, aiConfig, { words: vocabulary, checkViolationsFn }).catch(e => {
        console.error('[CreatureDialogue] Background generation failed:', e.message);
      });
    }

    if (queueMissingNpcDialoguesFn && getUserVocabulary) {
      const { words: vocabulary } = getUserVocabulary(req.user.id);
      const vocabSet = new Set(vocabulary);
      const checkViolationsFn = checkSentenceViolations
        ? (text) => checkSentenceViolations(text, vocabSet, new Set())
        : null;
      queueMissingNpcDialoguesFn(req.user.id, aiConfig, { words: vocabulary, checkViolationsFn }).catch(e => {
        console.error('[NpcDialogue] Background generation failed:', e.message);
      });
    }
  }

  // Start a new run
  router.post('/start-run', async (req, res) => {
    const gameManager = req.gameManager;
    const { starterId, starterIds } = req.body;
    try {
      const meta = gameManager.getMeta();
      const startRunChargeKey = `start-run:${Date.now()}`;
      const preparedSpend = prepareCrystalSpend(meta, {
        reason: CRYSTAL_REASONS.startRun,
        key: startRunChargeKey,
        cost: CRYSTAL_COSTS.startRun
      });
      if (!preparedSpend.ok) {
        return res.status(402).json(preparedSpend);
      }

      // Validate creature selection against collection
      const ids = starterIds || (starterId ? [starterId] : null);
      if (ids) {
        const collection = meta.creatureCollection || [];
        const validation = validateTeamSelection(collection, ids, meta.creatureCounts || {});
        if (!validation.valid) {
          return res.status(400).json({ error: validation.reason });
        }
      }

      const spendResult = recordCrystalSpend(meta, {
        reason: CRYSTAL_REASONS.startRun,
        key: startRunChargeKey,
        cost: CRYSTAL_COSTS.startRun
      });
      if (!spendResult.ok) {
        return res.status(402).json(spendResult);
      }

      gameManager.startRun(null, starterId, starterIds);

      const narration = null; // DM narration disabled — frontend discards this

      // CID pre-run scripts disabled
      const cidScript = null;

      req.saveGame();

      // Only queue dialogues if creatures were provided (legacy path).
      // For bare runs, dialogues are queued in /confirm-creatures instead.
      if (ids) {
        queueBackgroundDialogues(req);
      }

      res.json({
        state: req.getEnrichedGameState(),
        narration,
        cidScript,
        useKanji: false,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Area selection
  router.get('/area-options', (req, res) => {
    try {
      const options = req.gameManager.getAreaOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-area', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { areaId, forceRoomType } = req.body;
      const result = gameManager.selectArea(areaId, forceRoomType || null);
      req.saveGame();
      res.json({
        ...result,
        state: req.getEnrichedGameState()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Confirm creature selection (after area is chosen)
  router.post('/confirm-creatures', async (req, res) => {
    const gameManager = req.gameManager;
    const { starterIds } = req.body;
    try {
      if (!starterIds || starterIds.length === 0) {
        return res.status(400).json({ error: 'No creatures selected' });
      }
      const meta = gameManager.getMeta();
      const collection = meta.creatureCollection || [];
      const validation = validateTeamSelection(collection, starterIds, meta.creatureCounts || {});
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }

      gameManager.confirmCreatures(starterIds);
      req.saveGame();

      // Queue background dialogues now that party is finalized
      queueBackgroundDialogues(req);

      res.json({ state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/proceed', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { forceRoomType } = req.body || {};
      const room = gameManager.proceedToNextRoom(forceRoomType || null);

      const narration = null; // DM narration disabled — frontend discards this

      req.saveGame();
      res.json({ room, state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Skill Master: get offers (idempotent per room)
  router.post('/skill-master-offers', async (req, res) => {
    try {
      const { offered } = req.gameManager.explorationService.getSkillMasterOffers();
      req.saveGame();
      const knownSet = new Set(getKnownWordsFromFsrs(req.user.id));
      const skillSelectPrompt = getEligibleFrameTokens(getSkillSelectFrame(), knownSet, { dict: getWordDict() });
      res.json({ offered, skillSelectPrompt, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Skill Master: choose one offer
  router.post('/skill-master-choose', async (req, res) => {
    try {
      const { skillId } = req.body || {};
      if (!skillId) return res.status(400).json({ error: 'skillId required' });
      const result = req.gameManager.explorationService.chooseSkillMasterOffer(skillId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // NPC Battle: get skill offers for post-battle reward (idempotent per room)
  router.post('/npc-battle-skill-offers', async (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'npcBattle') {
        return res.status(400).json({ error: 'Not in an NPC battle room' });
      }
      if (!room.npcBattle?.skillSelectionPending) {
        return res.status(400).json({ error: 'NPC battle skill selection not pending' });
      }

      // Generate offers if not already generated (idempotent)
      if (!Array.isArray(room.npcBattle.offered)) {
        const ownedSkillIds = (gm.run?.partySkills || []).map(s => s?.id).filter(Boolean);
        const offeredIds = rollSkillMasterOffers({ ownedSkillIds, count: 3 });
        room.npcBattle.offered = offeredIds;
        req.saveGame();
      }

      const offered = (room.npcBattle.offered || [])
        .map(id => getPartySkillDisplay(id))
        .filter(Boolean);

      const knownSet = new Set(getKnownWordsFromFsrs(req.user.id));
      const skillSelectPrompt = getEligibleFrameTokens(getSkillSelectFrame(), knownSet, { dict: getWordDict() });
      res.json({ offered, skillSelectPrompt, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // NPC Battle: choose one skill offer
  router.post('/npc-battle-skill-choose', async (req, res) => {
    try {
      const { skillId } = req.body || {};
      if (!skillId) return res.status(400).json({ error: 'skillId required' });

      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'npcBattle') {
        return res.status(400).json({ error: 'Not in an NPC battle room' });
      }
      if (!room.npcBattle?.skillSelectionPending) {
        return res.status(400).json({ error: 'NPC battle skill selection not pending' });
      }
      if (room.npcBattle.chosenSkillId) {
        return res.status(400).json({ error: 'Skill already chosen for this room' });
      }

      // Generate offers if they were never set (race: client used fallback data)
      if (!Array.isArray(room.npcBattle.offered)) {
        console.warn('[npc-battle-skill-choose] offered not set — generating on demand',
          { skillId, npcBattle: JSON.stringify(room.npcBattle) });
        const ownedSkillIds = (gm.run?.partySkills || []).map(s => s?.id).filter(Boolean);
        room.npcBattle.offered = rollSkillMasterOffers({ ownedSkillIds, count: 3 });
        req.saveGame();
      }

      const offeredIds = room.npcBattle.offered;
      if (!offeredIds.includes(skillId)) {
        console.warn('[npc-battle-skill-choose] skillId not in offered',
          { skillId, offeredIds, typeof_skillId: typeof skillId });
        return res.status(400).json({ error: 'Invalid skill choice' });
      }

      if (!gm.run) throw new Error('No active run');
      if (!Array.isArray(gm.run.partySkills)) gm.run.partySkills = [];

      // No duplicates
      const alreadyOwned = gm.run.partySkills.some(s => s?.id === skillId);
      if (!alreadyOwned) {
        gm.run.partySkills.push({ id: skillId });
      }

      room.npcBattle.chosenSkillId = skillId;
      room.npcBattle.skillSelectionPending = false;
      room.interacted = true;

      req.saveGame();
      res.json({ chosenId: skillId, partySkills: gm.run.partySkills, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start room encounter (marks room, then starts combat)
  router.post('/room-encounter', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.startRoomEncounter();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/shrine-offers', async (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'shrine') {
        return res.status(400).json({ error: 'Not in a shrine room' });
      }

      if (!room.shrine) room.shrine = { used: false, completed: false, chosenReward: null, greeting: null };
      if (!room.shrine.greeting) {
        const knownWords = getKnownWordsFromFsrs(req.user.id);
        const knownSet = new Set(knownWords);
        const greetingFrames = getShrineGreetingFrames();
        const greetingCandidates = greetingFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
        room.shrine.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });
        req.saveGame();
      }

      res.json({
        rewards: SHRINE_REWARDS,
        greeting: room.shrine.greeting || null,
        completed: room.shrine.completed === true || room.shrine.used === true,
        state: req.getEnrichedGameState()
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/shrine-choose', async (req, res) => {
    try {
      const { rewardType, creatureKey, creatureId } = req.body || {};
      if (!rewardType) {
        return res.status(400).json({ error: 'rewardType required' });
      }
      const result = req.gameManager.useShrineReward(rewardType, creatureKey || creatureId || null);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/shrine-upgrade', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { creatureId } = req.body;
      if (!creatureId) {
        return res.status(400).json({ error: 'creatureId required' });
      }
      const result = gameManager.useShrineReward('level_up', creatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/quiz-reward', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { rewardType, creatureId } = req.body;
      if (!rewardType) {
        return res.status(400).json({ error: 'rewardType required' });
      }
      const result = gameManager.useQuizReward(rewardType, creatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get a quiz question (Bunpro first, fallback to static)
  router.get('/quiz-question', async (req, res) => {
    try {
      // Try Bunpro first if token available (use req.userKeys set by middleware)
      const bunproToken = req.userKeys?.bunproToken;
      if (bunproToken) {
        console.log('[Quiz] Attempting Bunpro question...');
        const bunproQuestion = await getBunproQuestion(bunproToken);
        if (bunproQuestion) {
          console.log('[Quiz] Serving Bunpro question');
          // Don't send correctIndex to frontend
          return res.json({
            id: bunproQuestion.id,
            type: bunproQuestion.type,
            question: bunproQuestion.question,
            translation: bunproQuestion.translation,
            options: bunproQuestion.options,
            // Store these server-side for answer validation
            _bunpro: {
              reviewId: bunproQuestion.reviewId,
              sessionId: bunproQuestion.sessionId,
              correctIndex: bunproQuestion.correctIndex
            }
          });
        }
        console.log('[Quiz] Bunpro unavailable, falling back to static');
      }

      // Fallback to static questions
      const questions = loadQuizQuestions();
      const randomIndex = Math.floor(Math.random() * questions.length);
      const question = questions[randomIndex];

      res.json({
        id: question.id,
        type: question.type,
        question: question.question,
        options: question.options
      });
    } catch (error) {
      console.error('[Quiz] Error:', error.message);
      res.status(500).json({ error: 'Failed to load quiz question' });
    }
  });

  // Validate quiz answer
  router.post('/quiz-answer', async (req, res) => {
    try {
      const { questionId, selectedIndex, _bunpro } = req.body;
      if (questionId === undefined || selectedIndex === undefined) {
        return res.status(400).json({ error: 'questionId and selectedIndex required' });
      }

      // Handle Bunpro question
      if (questionId.startsWith('bunpro-') && _bunpro) {
        const correct = selectedIndex === _bunpro.correctIndex;
        console.log('[Quiz] Bunpro answer:', { questionId, selectedIndex, correctIndex: _bunpro.correctIndex, correct });

        // Submit to Bunpro (fire and forget - don't block response)
        const bunproToken = req.userKeys?.bunproToken;
        if (bunproToken) {
          submitBunproAnswer(bunproToken, _bunpro.reviewId, _bunpro.sessionId, correct)
            .then(success => console.log('[Quiz] Bunpro submission:', success ? 'success' : 'failed'))
            .catch(err => console.log('[Quiz] Bunpro submission error:', err.message));
        }

        return res.json({
          correct,
          correctIndex: _bunpro.correctIndex,
          response: correct
            ? 'その通りだ。文法をよく理解しているな。'
            : '残念だ。もう一度復習しよう。'
        });
      }

      // Handle static question
      const questions = loadQuizQuestions();
      const question = questions.find(q => q.id === questionId);

      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const correct = selectedIndex === question.correctIndex;
      res.json({
        correct,
        correctIndex: question.correctIndex,
        response: correct ? question.correctResponse : question.wrongResponse
      });
    } catch (error) {
      console.error('[Quiz] Answer error:', error.message);
      res.status(500).json({ error: 'Failed to validate answer' });
    }
  });

  // Forfeit run
  router.post('/forfeit', (req, res) => {
    const isVictory = req.body?.isVictory === true;
    const result = req.gameManager.forfeitRun(isVictory);
    cancelPendingPrefetches();
    clearPrefetchCache();
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  });

  // Get words for discovery room
  router.get('/discovery-words', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 2;
      const result = getNewWordsForDiscovery(limit, req.user.id);
      console.log(`[Discovery] Fetched ${result.words.length} new words (available: ${result.available})`);

      // Enrich words with meanings from local dictionary
      if (result.words.length > 0) {
        const dict = req.app.locals.wordDictionary || loadWordDictionary({
          overlayDir: join(process.cwd(), 'data'),
          liveDictPath: resolveLiveDictPath(),
        });
        for (const word of result.words) {
          if (!word.meanings?.length) {
            const entry = dict.get(word.word);
            if (entry) {
              word.meanings = entry.definitions?.map(d => d.en).filter(Boolean) || [];
              word.reading = word.reading || entry.reading || word.word;
            }
          }
        }
      }

      res.json(result);
    } catch (error) {
      console.error('[Discovery] Error fetching words:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Get discovery status (daily limit tracking)
  router.get('/discovery-status', (req, res) => {
    try {
      const userId = req.user?.id || 'default';
      const settings = req.getSettings?.() || {};
      const dailyLimit = settings.dailyWordLimit ?? 10;

      const status = getDiscoveryStatus(userId, dailyLimit);
      res.json(status);
    } catch (error) {
      console.error('[Discovery] Error getting status:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark word discovery room as complete
  router.post('/complete-discovery', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const result = gameManager.completeWordDiscovery();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      console.error('[Discovery] Error completing discovery:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/speed-review-room/start', async (req, res) => {
    const { roomId } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    try {
      const gameManager = req.gameManager;
      const result = await gameManager.startSpeedReviewRoom({
        roomId,
        userId: req.user?.id
      });
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      const status = isSpeedReviewRoomTransitionError(error) ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  router.post('/speed-review-room/progress', (req, res) => {
    const { roomId, word, commitIndex } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'word (string) is required' });
    }
    if (!Number.isInteger(commitIndex) || commitIndex < 0) {
      return res.status(400).json({ error: 'commitIndex must be an integer >= 0' });
    }

    try {
      const gameManager = req.gameManager;
      const result = gameManager.recordSpeedReviewRoomCommit({ roomId, word, commitIndex });
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      const status = isSpeedReviewRoomTransitionError(error) ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  router.post('/speed-review-room/complete', (req, res) => {
    const { roomId } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    try {
      const gameManager = req.gameManager;
      const result = gameManager.completeSpeedReviewRoom({ roomId });
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      const status = isSpeedReviewRoomTransitionError(error) ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  // Whack-a-Mole: get random pool of creatures + items + skills for matching game
  router.get('/whack-a-mole-pool', (req, res) => {
    try {
      // Filter by area progression (same pattern as friendly NPC shop)
      const gm = req.gameManager;
      const areaPath = gm.run.areaPath || [];
      const currentAreaId = gm.run.currentArea?.id;
      const areaIds = [...new Set([...areaPath, currentAreaId].filter(Boolean))];

      // Build set of creature IDs belonging to reached areas
      const areaCreatureIds = new Set();
      for (const areaId of areaIds) {
        const area = getAreaById(areaId);
        if (area?.creatures) {
          for (const cId of area.creatures) areaCreatureIds.add(cId);
        }
      }

      const filteredCreatures = areaCreatureIds.size > 0
        ? allCreatures.filter(c => areaCreatureIds.has(c.id))
        : allCreatures;

      const creaturePool = filteredCreatures.map(c => ({
        id: c.id,
        type: 'creature',
        word: c.name,
        reading: c.reading || c.baseReading || c.name,
        meaning: c.meaning || c.baseMeaning || c.nameEn,
        element: c.element || '',
        sprite: `/assets/sprites/creatures/${c.id}.webp?v=${SPRITE_VERSION}`
      }));

      // Filter items by area (same as friendly NPC shop)
      const filteredItems = areaIds.length > 0
        ? allItems.filter(i => !i.area || areaIds.includes(i.area))
        : allItems;

      const itemPool = filteredItems.map(i => ({
        id: i.id,
        type: 'item',
        word: i.word,
        reading: i.reading,
        meaning: i.meaning,
        sprite: `/assets/sprites/items/${i.id}.webp?v=${SPRITE_VERSION}`
      }));

      // Filter moves to those in learnsets of area creatures
      const areaMovesIds = new Set();
      for (const c of filteredCreatures) {
        if (c.learnset) {
          for (const entry of c.learnset) areaMovesIds.add(entry.moveId);
        }
      }

      const filteredMoves = areaMovesIds.size > 0
        ? allMoves.filter(m => areaMovesIds.has(m.id))
        : allMoves;

      const skillPool = filteredMoves.map(m => {
        const slug = (m.nameEn || '').toLowerCase().replace(/ /g, '-');
        return {
          id: `move-${m.id}`,
          type: 'skill',
          word: m.name,
          reading: m.reading,
          meaning: m.nameEn || m.name,
          sprite: `/assets/sprites/actions/${slug}.webp?v=${SPRITE_VERSION}`
        };
      });

      const pool = [...creaturePool, ...itemPool, ...skillPool].sort(() => Math.random() - 0.5);
      res.json({ pool });
    } catch (err) {
      res.status(500).json({ error: 'Failed to build whack-a-mole pool' });
    }
  });

  // Whack-a-Mole: complete game and award credits
  router.post('/whack-a-mole-complete', (req, res) => {
    try {
      const { score } = req.body;
      const result = req.gameManager.completeWhackAMole(score);
      req.saveGame();

      // Pick best i+1 finish dialogue for GM narration. Words auto-expose on client render.
      const knownWords = getKnownWordsFromFsrs(req.user.id);
      const knownSet = new Set(knownWords);
      const finishFrames = getGameMasterFinishFrames();
      const candidates = finishFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
      const finishDialogue = selectBestFrame(candidates, knownSet, { dict: getWordDict() }) || { tokens: [], words: [] };

      res.json({ ...result, finishDialogue, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Whack-a-Mole: get GM dialogue (i+1 selected greeting)
  router.get('/whack-a-mole-dialogue', (req, res) => {
    try {
      const knownWords = getKnownWordsFromFsrs(req.user.id);
      const knownSet = new Set(knownWords);
      const askFrames = getGameMasterAskFrames();
      const candidates = askFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
      const dialogue = selectBestFrame(candidates, knownSet, { dict: getWordDict() }) || { tokens: [], words: [] };

      const yesTokens = getEligibleFrameTokens(getGameMasterYesFrame(), knownSet, { dict: getWordDict() });
      const noTokens = getEligibleFrameTokens(getGameMasterNoFrame(), knownSet, { dict: getWordDict() });
      res.json({ dialogue, yesTokens, noTokens });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Whack-a-Mole: skip (player declined)
  router.post('/whack-a-mole-skip', (req, res) => {
    try {
      const result = req.gameManager.skipWhackAMole();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Friendly NPC: get item offers (idempotent per room)
  router.post('/friendly-npc-offers', async (req, res) => {
    try {
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'friendlyNpc') {
        return res.status(400).json({ error: 'Not in a friendly NPC room' });
      }
      // Generate offers if not already generated (idempotent)
      if (!room.friendlyNpc.offered) {
        const areaPath = gm.run.areaPath || [];
        const currentAreaId = gm.run.currentArea?.id;
        const areaIds = [...new Set([...areaPath, currentAreaId].filter(Boolean))];
        room.friendlyNpc.offered = rollFriendlyNpcOffers(room.friendlyNpc.offerCategory, areaIds, allItems);

        // Assemble pre-tokenized frames with items and select best per i+1
        const knownWords = getKnownWordsFromFsrs(req.user.id);
        const knownSet = new Set(knownWords);
        const shopFrames = getShopPurchaseFrames();

        for (const item of room.friendlyNpc.offered) {
          if (!item.word) continue;
          const candidates = shopFrames.map(frame => assembleFrame(frame, { item }, { dict: getWordDict() }));
          const best = selectBestFrame(candidates, knownSet, { dict: getWordDict() });
          item.tokens = best?.tokens || [];
          item.words = best?.words || [];
        }

        // Select best greeting frame via i+1
        const greetingFrames = getShopGreetingFrames();
        const greetingCandidates = greetingFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
        room.friendlyNpc.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });

        // Attach entity token for each item's card display
        for (const item of room.friendlyNpc.offered) {
          if (!item.word) continue;
          item.nameToken = entityToToken(item);
        }

        req.saveGame();
      }
      res.json({
        offered: room.friendlyNpc.offered,
        greeting: room.friendlyNpc.greeting || null,
        state: req.getEnrichedGameState(),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Friendly NPC: choose one offered item
  router.post('/friendly-npc-choose', async (req, res) => {
    try {
      const { itemId, targetCreatureIndex } = req.body;
      if (!itemId) {
        return res.status(400).json({ error: 'itemId required' });
      }
      const gm = req.gameManager;
      const room = gm.getCurrentRoom();
      if (!room || room.type !== 'friendlyNpc') {
        return res.status(400).json({ error: 'Not in a friendly NPC room' });
      }
      if (!room.friendlyNpc.offered) {
        return res.status(400).json({ error: 'No offers generated yet' });
      }
      if (room.friendlyNpc.completed) {
        return res.status(400).json({ error: 'Friendly NPC already completed' });
      }
      const item = room.friendlyNpc.offered.find(i => i.id === itemId);
      if (!item) {
        return res.status(400).json({ error: 'Invalid item choice' });
      }
      // Apply item effect to run state
      const targetIdx = Number.isInteger(targetCreatureIndex) ? targetCreatureIndex : null;
      applyItem(item, gm.run.creatureParty, gm.run.itemBuffs, targetIdx);
      // Track for adventure report
      if (gm.run?.runSummary) {
        gm.run.runSummary.itemsCollected++;
      }
      if (gm.meta && item?.id) {
        if (!gm.meta.itemsDiscovered) gm.meta.itemsDiscovered = [];
        if (!gm.meta.itemsDiscovered.includes(item.id)) {
          gm.meta.itemsDiscovered.push(item.id);
        }
      }
      room.friendlyNpc.chosenId = itemId;
      room.friendlyNpc.completed = true;
      room.interacted = true;
      req.saveGame();
      res.json({ chosen: item, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
