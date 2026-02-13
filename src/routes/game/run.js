/**
 * @fileoverview Run routes
 *
 * Handles run lifecycle: start-run, forfeit, floor navigation, ward selection
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNewWordsForDiscovery } from '../../game/vocab-manager.js';
import { lookupVocabularyBatch } from '../../jpdb.js';
import { getDiscoveryStatus } from '../../word-tracking.js';
import { getQuizQuestion as getBunproQuestion, submitAnswer as submitBunproAnswer } from '../../bunpro.js';
import { validateTeamSelection } from '../../game/services/robot-collection-service.js';
import { queueTTSPrefetch } from '../../game/prefetch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const quizQuestionsPath = join(__dirname, '../../data/quiz-questions.json');
const levelsPath = join(__dirname, '../../../data/levels.json');

function loadQuizQuestions() {
  const data = JSON.parse(readFileSync(quizQuestionsPath, 'utf-8'));
  return data.questions;
}

function loadLevels() {
  return JSON.parse(readFileSync(levelsPath, 'utf-8'));
}

export default function createRunRoutes({
  generateGameNarration,
  generateDoorHints,
  cancelPendingPrefetches,
  clearPrefetchCache,
  generateMissingDialoguesFn,
  getUserVocabulary,
  queueMissingNpcDialoguesFn
}) {
  const router = Router();

  // Start a new run
  router.post('/start-run', async (req, res) => {
    const gameManager = req.gameManager;
    const { starterId, starterIds } = req.body;
    try {
      // Validate robot selection against collection
      const ids = starterIds || (starterId ? [starterId] : null);
      if (ids) {
        const meta = gameManager.getMeta();
        const collection = meta.robotCollection || [];
        const validation = validateTeamSelection(collection, ids);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.reason });
        }
      }

      gameManager.startRun(null, starterId, starterIds);

      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();

      // Fire-and-forget: generate any missing befriend dialogues
      if (generateMissingDialoguesFn && getUserVocabulary) {
        const userKeys = req.userKeys || {};
        if (userKeys.aiApiKey) {
          const { words: vocabulary } = getUserVocabulary(req.user.id);
          generateMissingDialoguesFn(req.user.id, {
            provider: userKeys.aiProvider || 'openai',
            apiKey: userKeys.aiApiKey,
            openaiModel: userKeys.openaiModel || 'gpt-4o-mini',
            openrouterModel: userKeys.openrouterModel,
            jlptLevel: userKeys.jlptLevel || 'N4'
          }, vocabulary).catch(e => {
            console.error('[BefriendDialogue] Background bulk generation failed:', e.message);
          });
        }
      }

      // Fire-and-forget: generate missing NPC dialogues
      if (queueMissingNpcDialoguesFn && getUserVocabulary) {
        const userKeys = req.userKeys || {};
        if (userKeys.aiApiKey) {
          const { words: vocabulary } = getUserVocabulary(req.user.id);
          queueMissingNpcDialoguesFn(req.user.id, {
            provider: userKeys.aiProvider || 'openai',
            apiKey: userKeys.aiApiKey,
            openaiModel: userKeys.openaiModel || 'gpt-4o-mini',
            openrouterModel: userKeys.openrouterModel,
            jlptLevel: userKeys.jlptLevel || 'N4'
          }, vocabulary).catch(e => {
            console.error('[NpcDialogue] Background generation failed:', e.message);
          });
        }
      }

      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get level definitions and player progress
  router.get('/levels', (req, res) => {
    try {
      const levels = loadLevels();
      const meta = req.gameManager.getMeta();
      res.json({
        levels,
        progress: meta.levels || { highestUnlocked: 1, completed: [], current: null }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Select a level and start a run
  router.post('/levels/select', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { levelId, starterId, starterIds } = req.body;
      if (!levelId || typeof levelId !== 'number') {
        return res.status(400).json({ error: 'levelId (number) required' });
      }

      const meta = gameManager.getMeta();
      const levels = meta.levels || { highestUnlocked: 1, completed: [], current: null };

      if (levelId > levels.highestUnlocked) {
        return res.status(400).json({ error: 'Level not yet unlocked' });
      }

      if (gameManager.run?.active) {
        return res.status(400).json({ error: 'A run is already active' });
      }

      // Validate robot selection against collection
      const ids = starterIds || (starterId ? [starterId] : null);
      if (ids) {
        const meta = gameManager.getMeta();
        const collection = meta.robotCollection || [];
        const validation = validateTeamSelection(collection, ids);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.reason });
        }
      }

      gameManager.startRun(levelId, starterId, starterIds);

      const narration = await generateGameNarration('runStart', {
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();

      // Fire-and-forget: generate any missing befriend dialogues
      if (generateMissingDialoguesFn && getUserVocabulary) {
        const userKeys = req.userKeys || {};
        if (userKeys.aiApiKey) {
          const { words: vocabulary } = getUserVocabulary(req.user.id);
          generateMissingDialoguesFn(req.user.id, {
            provider: userKeys.aiProvider || 'openai',
            apiKey: userKeys.aiApiKey,
            openaiModel: userKeys.openaiModel || 'gpt-4o-mini',
            openrouterModel: userKeys.openrouterModel,
            jlptLevel: userKeys.jlptLevel || 'N4'
          }, vocabulary).catch(e => {
            console.error('[BefriendDialogue] Background bulk generation failed:', e.message);
          });
        }
      }

      // Fire-and-forget: generate missing NPC dialogues
      if (queueMissingNpcDialoguesFn && getUserVocabulary) {
        const userKeys = req.userKeys || {};
        if (userKeys.aiApiKey) {
          const { words: vocabulary } = getUserVocabulary(req.user.id);
          queueMissingNpcDialoguesFn(req.user.id, {
            provider: userKeys.aiProvider || 'openai',
            apiKey: userKeys.aiApiKey,
            openaiModel: userKeys.openaiModel || 'gpt-4o-mini',
            openrouterModel: userKeys.openrouterModel,
            jlptLevel: userKeys.jlptLevel || 'N4'
          }, vocabulary).catch(e => {
            console.error('[NpcDialogue] Background generation failed:', e.message);
          });
        }
      }

      res.json({
        state: req.getEnrichedGameState(),
        narration
      });
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

  // Continue to next endless floor
  router.post('/continue-endless', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const floor = gameManager.continueEndless();
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

  // Return to hub after game victory (choosing not to continue)
  router.post('/return-to-hub-from-victory', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.returnToHubFromVictory();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
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

  // Get Chippy's door hints for branch selection
  router.post('/door-hints', (req, res) => {
    const gameManager = req.gameManager;
    try {
      if (!gameManager.run?.pendingBranch) {
        return res.status(400).json({ error: 'No branch selection pending' });
      }

      const pair = gameManager.run.rooms[gameManager.run.currentRoom];
      if (!Array.isArray(pair) || pair.length !== 2) {
        return res.status(400).json({ error: 'Current room is not a branch pair' });
      }

      const hints = generateDoorHints(pair[0].type, pair[1].type);

      // Prefetch TTS audio for each door hint
      if (hints.door1) queueTTSPrefetch(hints.door1);
      if (hints.door2) queueTTSPrefetch(hints.door2);

      res.json({ hints });
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

  // Level up robot at shrine
  router.post('/shrine-upgrade', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { robotId } = req.body;
      if (!robotId) {
        return res.status(400).json({ error: 'robotId required' });
      }
      const result = gameManager.useShrine(robotId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/quiz-reward', (req, res) => {
    try {
      const gameManager = req.gameManager;
      const { rewardType, robotId } = req.body;
      if (!rewardType) {
        return res.status(400).json({ error: 'rewardType required' });
      }
      const result = gameManager.useQuizReward(rewardType, robotId);
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

  return router;
}
