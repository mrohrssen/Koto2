import { Router } from 'express';
import { getKanjiKombatLeaderboard } from '../../auth/users.js';
import { KANJI_KOMBAT_PREDICTION_MODE } from '../../shared/action-protocol.js';
import {
  createOptimisticActionRunner,
  getOptimisticActionLedgerOwner,
  restoreGameManager,
  sendOptimisticActionError,
  snapshotGameManager,
} from './optimistic-action-response.js';

function isOptimisticKanjiAnswerEnvelope(body = {}) {
  return body?.actionType === 'kanjiKombat.answer'
    || body?.payload?.predictionMode === KANJI_KOMBAT_PREDICTION_MODE;
}

export default function createKanjiKombatRoutes() {
  const router = Router();
  const runOptimisticAction = createOptimisticActionRunner({ owner: getOptimisticActionLedgerOwner });

  router.get('/leaderboard', (req, res) => {
    try {
      const period = req.query.period === 'weekly' ? 'weekly' : '24h';
      const result = getKanjiKombatLeaderboard(period, req.user.id, req.app?.locals?.usersFile);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/availability', (req, res) => {
    try {
      res.json(req.gameManager.kanjiKombatService.getAvailability());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/start', (req, res) => {
    try {
      const { creatureId } = req.body || {};
      const collection = req.gameManager.meta?.creatureCollection || [];
      if (!creatureId || !collection.includes(creatureId)) {
        return res.status(400).json({ error: 'Selected creature is not unlocked' });
      }
      const result = req.gameManager.kanjiKombatService.startRunWithCreatureId(creatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/onboarding', (req, res) => {
    try {
      const { knowsHiragana, knowsKatakana } = req.body || {};
      if (typeof knowsHiragana !== 'boolean' || typeof knowsKatakana !== 'boolean') {
        return res.status(400).json({ error: 'knowsHiragana and knowsKatakana booleans required' });
      }
      const result = req.gameManager.kanjiKombatService.submitOnboarding({ knowsHiragana, knowsKatakana });
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/intro', (req, res) => {
    const { cardId, choice } = req.body || {};
    return runOptimisticAction(req, res, {
      actionType: 'kanjiKombat.intro',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        if (!cardId || !['known', 'unknown'].includes(choice)) {
          throw new Error('cardId and choice (known|unknown) required');
        }
        const result = req.gameManager.submitKanjiKombatIntro
          ? req.gameManager.submitKanjiKombatIntro(cardId, choice)
          : req.gameManager.kanjiKombatService.submitIntroChoice(cardId, choice);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  router.post('/answer', (req, res) => {
    const body = req.body || {};
    const optimisticSnapshot = isOptimisticKanjiAnswerEnvelope(body)
      ? snapshotGameManager(req.gameManager)
      : null;
    try {
      const answerId = body.payload?.answerId || body.answerId;
      if (!answerId) return res.status(400).json({ error: 'answerId required' });
      const result = isOptimisticKanjiAnswerEnvelope(body)
        ? req.gameManager.kanjiKombatService.verifyAndCommitOptimisticAnswer(body)
        : req.gameManager.submitKanjiKombatAnswer(answerId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      if (isOptimisticKanjiAnswerEnvelope(req.body || {})) {
        restoreGameManager(req.gameManager, optimisticSnapshot);
        return sendOptimisticActionError(req, res, error, 409);
      }
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/completion-choice', (req, res) => {
    const { keepGoing } = req.body || {};
    return runOptimisticAction(req, res, {
      actionType: 'kanjiKombat.completionChoice',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        if (typeof keepGoing !== 'boolean') {
          throw new Error('keepGoing boolean required');
        }
        const result = req.gameManager.kanjiKombatService.resolveCompletionChoice(keepGoing);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  return router;
}
