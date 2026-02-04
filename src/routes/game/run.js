/**
 * @fileoverview Run routes
 *
 * Handles run lifecycle: start-run, forfeit, floor navigation, ward selection, chip management
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getChipLoadout, equipChip, unequipChip, reorderChips } from '../../game/items/chips.js';
import { getNewWordsForDiscovery } from '../../game/vocab-manager.js';
import { lookupVocabularyBatch } from '../../jpdb.js';
import { getDiscoveryStatus } from '../../word-tracking.js';
import { getQuizQuestion as getBunproQuestion, submitAnswer as submitBunproAnswer } from '../../bunpro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const quizQuestionsPath = join(__dirname, '../../data/quiz-questions.json');

function loadQuizQuestions() {
  const data = JSON.parse(readFileSync(quizQuestionsPath, 'utf-8'));
  return data.questions;
}

export default function createRunRoutes({
  generateGameNarration,
  cancelPendingPrefetches,
  clearPrefetchCache
}) {
  const router = Router();

  // Start a new run
  router.post('/start-run', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      gameManager.startRun();

      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Claim free starting chip
  router.post('/claim-starting-chip', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { itemIndex } = req.body;
      const result = gameManager.claimStartingChip(itemIndex);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Refresh starting chip shop
  router.post('/starting-chip-refresh', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.refreshStartingChipShop();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Ward selection
  router.get('/starting-wards', (req, res) => {
    try {
      const options = req.gameManager.getStartingWardOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-starting-ward', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { wardId } = req.body;
      const result = gameManager.selectStartingWard(wardId);
      req.saveGame();
      res.json({
        ...result,
        state: req.getEnrichedGameState()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/next-ward-options', (req, res) => {
    try {
      const options = req.gameManager.getNextWardOptions();
      res.json(options);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/select-next-ward', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { wardId } = req.body;
      const result = gameManager.selectNextWard(wardId);
      req.saveGame();
      res.json({
        ...result,
        state: req.getEnrichedGameState()
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Chip loadout management
  router.get('/chip-loadout', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const player = gameManager.run?.player || gameManager.player;
      const runStats = gameManager.run?.runStats || {};
      const loadout = getChipLoadout(player, runStats);
      res.json({
        ...loadout,
        chipCharges: player._chipCharges || {},
        chipLevels: player._chipLevels || {}
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/equip-chip', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { equipmentSlot, chipId } = req.body;
      const player = gameManager.run?.player || gameManager.player;
      const result = equipChip(player, equipmentSlot, chipId);
      if (result.success) req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/unequip-chip', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { equipmentSlot, chipId } = req.body;
      const player = gameManager.run?.player || gameManager.player;
      const result = unequipChip(player, equipmentSlot, chipId);
      if (result.success) req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/reorder-chips', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { chipIds } = req.body;
      const player = gameManager.run?.player || gameManager.player;
      const result = reorderChips(player, chipIds);
      if (result.success) req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Floor navigation
  router.post('/enter-floor', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const floor = gameManager.enterFloor();
      const narration = await generateGameNarration('floorEnter', {
        floor,
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/next-floor', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const floor = gameManager.nextFloor();
      const narration = await generateGameNarration('floorEnter', {
        floor: gameManager.run.floor,
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({ state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/proceed', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const room = gameManager.proceedToNextRoom();

      let narration = null;
      if (room.type === 'monster') {
        narration = await generateGameNarration('encounterStart', {
          enemy: room.enemy,
          player: gameManager.run.player
        }, req.userKeys);
      }

      req.saveGame();
      res.json({ room, state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Select branch door
  router.post('/select-branch', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { door } = req.body;
      if (door !== 0 && door !== 1) {
        return res.status(400).json({ error: 'door must be 0 or 1' });
      }
      const result = gameManager.selectBranch(door);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
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

  // Upgrade chip at shrine
  router.post('/shrine-upgrade', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { chipId } = req.body;
      if (!chipId) {
        return res.status(400).json({ error: 'chipId required' });
      }
      const result = gameManager.useShrine(chipId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/quiz-reward', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { rewardType } = req.body;
      if (!rewardType) {
        return res.status(400).json({ error: 'rewardType required' });
      }
      const result = gameManager.useQuizReward(rewardType);
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
      const result = getNewWordsForDiscovery(limit);
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

  return router;
}
