/**
 * @fileoverview Run routes
 *
 * Handles run lifecycle: start-run, forfeit, area selection, room navigation
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNewWordsForDiscovery } from '../../game/vocab-manager.js';
import { lookupVocabularyBatch } from '../../jpdb.js';
import { getDiscoveryStatus } from '../../word-tracking.js';
import { getQuizQuestion as getBunproQuestion, submitAnswer as submitBunproAnswer } from '../../bunpro.js';
import { validateTeamSelection } from '../../game/services/creature-collection-service.js';
import { rollFriendlyNpcOffers } from '../../game/services/exploration-service.js';
import { applyItem } from '../../game/services/item-service.js';
import { rollSkillMasterOffers, getPartySkillDisplay } from '../../game/party-skills.js';
import { getCidScripts } from '../../game/dialogue-loader.js';
import { filterEligibleScripts, selectCidScript } from '../../game/dialogue-filter.js';
import { getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';

const SPRITE_VERSION = '20260321';
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
    if (!userKeys.aiApiKey || !userKeys.aiProvider) return;

    const aiConfig = {
      provider: userKeys.aiProvider,
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel,
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    };

    if (queueMissingCreatureDialoguesFn && getUserVocabulary) {
      const { words: vocabulary, vidSet } = getUserVocabulary(req.user.id);
      const vocabSet = new Set(vocabulary);
      const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
        ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
        : null;
      queueMissingCreatureDialoguesFn(req.user.id, aiConfig, { words: vocabulary, vidSet, checkViolationsFn }).catch(e => {
        console.error('[CreatureDialogue] Background generation failed:', e.message);
      });
    }

    if (queueMissingNpcDialoguesFn && getUserVocabulary) {
      const { words: vocabulary, vidSet } = getUserVocabulary(req.user.id);
      const vocabSet = new Set(vocabulary);
      const checkViolationsFn = userKeys.jpdbApiKey && checkSentenceViolations
        ? async (text) => checkSentenceViolations(text, vocabSet, userKeys.jpdbApiKey, new Set(), vidSet)
        : null;
      queueMissingNpcDialoguesFn(req.user.id, aiConfig, { words: vocabulary, vidSet, checkViolationsFn }).catch(e => {
        console.error('[NpcDialogue] Background generation failed:', e.message);
      });
    }
  }

  // Start a new run
  router.post('/start-run', async (req, res) => {
    const gameManager = req.gameManager;
    const { starterId, starterIds } = req.body;
    try {
      // Validate creature selection against collection
      const ids = starterIds || (starterId ? [starterId] : null);
      if (ids) {
        const meta = gameManager.getMeta();
        const collection = meta.creatureCollection || [];
        const validation = validateTeamSelection(collection, ids);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.reason });
        }
      }

      gameManager.startRun(null, starterId, starterIds);

      const narration = null; // DM narration disabled — frontend discards this

      // Select a CID script for this run based on player's known words
      let cidScript = null;
      try {
        const knownWords = new Set(getKnownWordsFromFsrs(req.user.id));
        const seenScripts = gameManager.getMeta()?.seenCidScripts || [];
        const eligible = filterEligibleScripts(getCidScripts(), knownWords);
        const selected = selectCidScript(eligible, knownWords, seenScripts);
        if (selected) {
          cidScript = {
            scriptId: selected.id,
            lines: selected.lines.map(l => ({
              text: l.text,
              tokens: l._tokens || [],
              overrides: l.overrides || {},
            })),
          };
          const meta = gameManager.getMeta();
          if (!meta.seenCidScripts) meta.seenCidScripts = [];
          meta.seenCidScripts.push(selected.id);
          // Expose CID dialogue content words to SRS
          const cidWords = [];
          for (const line of selected.lines) {
            for (const w of (line._contentWords || [])) {
              cidWords.push({ word: w, meaning: '' });
            }
          }
          if (cidWords.length > 0) {
            req.gameManager.exposeWords(cidWords);
          }
        }
      } catch (e) {
        console.warn('[CID] Script selection failed:', e.message);
      }

      req.saveGame();

      queueBackgroundDialogues(req);

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
      res.json({ offered, state: req.getEnrichedGameState() });
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

      res.json({ offered, state: req.getEnrichedGameState() });
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

      const offeredIds = Array.isArray(room.npcBattle.offered) ? room.npcBattle.offered : [];
      if (!offeredIds.includes(skillId)) {
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

  // Level up creature at shrine
  router.post('/shrine-upgrade', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { creatureId } = req.body;
      if (!creatureId) {
        return res.status(400).json({ error: 'creatureId required' });
      }
      const result = gameManager.useShrine(creatureId);
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
    const result = req.gameManager.forfeitRun();
    cancelPendingPrefetches();
    clearPrefetchCache();
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  });

  // Get words for discovery room
  router.get('/discovery-words', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 2;
      const result = getNewWordsForDiscovery(limit, req.user.id);
      console.log(`[Discovery] Fetched ${result.words.length} new words (available: ${result.available})`);

      // Enrich words with meanings from JPDB
      if (result.words.length > 0) {
        const jpdbApiKey = req.userKeys?.jpdbApiKey;
        if (jpdbApiKey) {
          const vocabList = result.words.map(w => [w.vid, w.sid]);
          try {
            const definitions = await lookupVocabularyBatch(jpdbApiKey, vocabList);
            // Merge meanings into words
            for (const word of result.words) {
              const key = `${word.vid}:${word.sid}`;
              const def = definitions[key];
              if (def && def.meanings) {
                word.meanings = def.meanings;
                word.reading = def.reading || word.reading;
              }
            }
            console.log(`[Discovery] Enriched ${result.words.length} words with meanings`);
          } catch (lookupError) {
            console.warn('[Discovery] Failed to fetch meanings:', lookupError.message);
            // Continue with words without meanings
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
        userId: req.user?.id,
        jpdbApiKey: req.userKeys?.jpdbApiKey
      });
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      const status = isSpeedReviewRoomTransitionError(error) ? 409 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  router.post('/speed-review-room/progress', (req, res) => {
    const { roomId, vid, sid, commitIndex } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }
    if (vid === undefined || vid === null) {
      return res.status(400).json({ error: 'vid is required' });
    }
    if (sid === undefined || sid === null) {
      return res.status(400).json({ error: 'sid is required' });
    }
    if (!Number.isInteger(commitIndex) || commitIndex < 0) {
      return res.status(400).json({ error: 'commitIndex must be an integer >= 0' });
    }

    try {
      const gameManager = req.gameManager;
      const result = gameManager.recordSpeedReviewRoomCommit({ roomId, vid, sid, commitIndex });
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
      const creaturePool = allCreatures.map(c => ({
        id: c.id,
        type: 'creature',
        word: c.baseWord,
        reading: c.baseReading,
        meaning: c.baseMeaning,
        element: c.element || '',
        sprite: `/assets/sprites/creatures/${c.id}.webp?v=${SPRITE_VERSION}`
      }));

      const itemPool = allItems.map(i => ({
        id: i.id,
        type: 'item',
        word: i.word,
        reading: i.reading,
        meaning: i.meaning,
        sprite: `/assets/sprites/items/${i.id}.webp?v=${SPRITE_VERSION}`
      }));

      // Moves from moves.json — action icon tiles
      const skillPool = allMoves.map(m => {
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
        room.friendlyNpc.offered = rollFriendlyNpcOffers(room.friendlyNpc.offerCategory, allItems);
        req.saveGame();
        // Expose item words to SRS
        const itemWords = room.friendlyNpc.offered
          .filter(item => item.word)
          .map(item => ({ word: item.word, meaning: item.nameEn || '' }));
        if (itemWords.length > 0) {
          req.gameManager.exposeWords(itemWords);
        }
      }
      res.json({ offered: room.friendlyNpc.offered, state: req.getEnrichedGameState() });
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
      room.friendlyNpc.chosenId = itemId;
      room.friendlyNpc.completed = true;
      room.interacted = true;
      req.gameManager.exposeWords([{ word: 'ください', meaning: 'please (when requesting)' }]);
      req.saveGame();
      res.json({ chosen: item, state: req.getEnrichedGameState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
