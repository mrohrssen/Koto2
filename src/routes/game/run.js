/**
 * @fileoverview Run routes
 *
 * Handles run lifecycle: start-run, forfeit, floor navigation, ward selection, chip management
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getChipLoadout, equipChip, unequipChip } from '../../game/items/chips.js';

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

  // Get a random quiz question
  router.get('/quiz-question', (req, res) => {
    try {
      const questions = loadQuizQuestions();
      const randomIndex = Math.floor(Math.random() * questions.length);
      const question = questions[randomIndex];

      // Don't send correctIndex to frontend (prevent cheating)
      res.json({
        id: question.id,
        type: question.type,
        question: question.question,
        options: question.options
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load quiz questions' });
    }
  });

  // Validate quiz answer
  router.post('/quiz-answer', (req, res) => {
    try {
      const { questionId, selectedIndex } = req.body;
      if (!questionId || selectedIndex === undefined) {
        return res.status(400).json({ error: 'questionId and selectedIndex required' });
      }

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

  return router;
}
