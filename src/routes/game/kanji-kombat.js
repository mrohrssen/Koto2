import { Router } from 'express';
import { getKanjiKombatLeaderboard } from '../../auth/users.js';
import { KANJI_KOMBAT_PREDICTION_MODE } from '../../shared/action-protocol.js';
import {
  createOptimisticActionRunner,
  enrichedState,
  getOptimisticActionLedgerOwner,
  restoreGameManager,
  sendOptimisticActionError,
  snapshotGameManager,
} from './optimistic-action-response.js';

function isOptimisticKanjiAnswerEnvelope(body = {}) {
  return body?.actionType === 'kanjiKombat.answer'
    || body?.payload?.predictionMode === KANJI_KOMBAT_PREDICTION_MODE;
}

function hasOwn(value, key) {
  return !!value && typeof value === 'object' && Object.hasOwn(value, key);
}

function firstPresent(...candidates) {
  for (const [value, key] of candidates) {
    if (hasOwn(value, key)) return value[key];
  }
  return undefined;
}

function normalizePromptSequence(sequence) {
  if (Number.isSafeInteger(sequence)) return sequence;
  if (typeof sequence === 'string' && sequence.trim() !== '') {
    const numeric = Number(sequence);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  throw new Error('promptSequence integer required');
}

function assignPromptSequence(ref, ...candidates) {
  const sequence = firstPresent(...candidates);
  if (sequence !== undefined) ref.sequence = normalizePromptSequence(sequence);
}

function promptRefFromBody(body = {}) {
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const suppliedPromptRef = hasOwn(payload, 'promptRef') && payload.promptRef && typeof payload.promptRef === 'object'
    ? payload.promptRef
    : null;

  if (suppliedPromptRef) {
    const ref = {};
    if (hasOwn(suppliedPromptRef, 'promptId')) ref.promptId = suppliedPromptRef.promptId;
    assignPromptSequence(ref, [suppliedPromptRef, 'sequence'], [suppliedPromptRef, 'promptSequence']);
    if (hasOwn(suppliedPromptRef, 'cardId')) ref.cardId = suppliedPromptRef.cardId;
    return ref;
  }

  const hasPromptMetadata = hasOwn(body, 'promptId')
    || hasOwn(body, 'sequence')
    || hasOwn(body, 'promptSequence')
    || hasOwn(payload, 'promptId')
    || hasOwn(payload, 'sequence')
    || hasOwn(payload, 'promptSequence')
    || hasOwn(payload, 'cardId');
  if (!hasPromptMetadata) return null;

  const ref = {};
  if (hasOwn(body, 'promptId') || hasOwn(payload, 'promptId')) {
    ref.promptId = firstPresent([body, 'promptId'], [payload, 'promptId']);
  }
  assignPromptSequence(
    ref,
    [body, 'sequence'],
    [body, 'promptSequence'],
    [payload, 'sequence'],
    [payload, 'promptSequence']
  );
  if (hasOwn(payload, 'cardId')) ref.cardId = payload.cardId;
  return ref;
}

function withIntroPromptCardId(promptRef, cardId) {
  if (!promptRef) return {};
  if (hasOwn(promptRef, 'cardId')) return promptRef;
  return { ...promptRef, cardId };
}

function submitKanjiKombatAnswer(manager, answerId, promptRef) {
  const options = { promptRef };
  return typeof manager.kanjiKombatService?.submitAnswer === 'function'
    ? manager.kanjiKombatService.submitAnswer(answerId, options)
    : manager.submitKanjiKombatAnswer(answerId, options);
}

export default function createKanjiKombatRoutes() {
  const router = Router();
  const runOptimisticAction = createOptimisticActionRunner({ owner: getOptimisticActionLedgerOwner });

  router.post('/prompt-buffer/refill', (req, res) => {
    try {
      const promptBuffer = req.gameManager.kanjiKombatService.refillPromptBuffer();
      req.saveGame();
      res.json({ promptBuffer, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Status-code contract: HTTP 200 + status 'corrected' = service-level correction (epoch
  // mismatch / entry rejection, state saved where committed); HTTP 409 = unexpected throw,
  // state restored to pre-call snapshot.
  router.post('/sync', (req, res) => {
    const { sessionEpoch, entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }
    const snapshot = snapshotGameManager(req.gameManager);
    try {
      const result = req.gameManager.kanjiKombatService.applySessionSync({ sessionEpoch, entries });
      req.saveGame();
      const state = enrichedState(req);
      if (result.status === 'corrected') {
        return res.json({ ...result, authoritativeState: state, state });
      }
      return res.json({ ...result, state });
    } catch (error) {
      restoreGameManager(req.gameManager, snapshot);
      return res.status(409).json({
        status: 'corrected',
        reason: error.message,
        confirmedThroughSeq: null,
        results: [],
        rejectedSeq: entries[0]?.seq ?? null,
        sessionEpoch: req.gameManager.run?.kanjiKombat?.sessionEpoch ?? null,
        authoritativeState: enrichedState(req),
      });
    }
  });

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
    // legacy client path — remove after next release
    const { cardId, choice } = req.body || {};
    let promptRef = null;
    try {
      promptRef = promptRefFromBody(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    return runOptimisticAction(req, res, {
      actionType: 'kanjiKombat.intro',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        if (!cardId || !['known', 'unknown'].includes(choice)) {
          throw new Error('cardId and choice (known|unknown) required');
        }
        const introPromptRef = withIntroPromptCardId(promptRef, cardId);
        const result = req.gameManager.kanjiKombatService?.submitIntroChoice
          ? req.gameManager.kanjiKombatService.submitIntroChoice(cardId, choice, introPromptRef)
          : req.gameManager.submitKanjiKombatIntro(cardId, choice, introPromptRef);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  router.post('/answer', (req, res) => {
    // legacy client path — remove after next release
    const body = req.body || {};
    const optimisticAnswer = isOptimisticKanjiAnswerEnvelope(body);
    let promptRef = null;
    if (!optimisticAnswer) {
      try {
        promptRef = promptRefFromBody(body);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    const optimisticSnapshot = optimisticAnswer
      ? snapshotGameManager(req.gameManager)
      : null;
    try {
      const answerId = body.payload?.answerId || body.answerId;
      if (!answerId) return res.status(400).json({ error: 'answerId required' });
      const result = optimisticAnswer
        ? req.gameManager.kanjiKombatService.verifyAndCommitOptimisticAnswer(body)
        : submitKanjiKombatAnswer(req.gameManager, answerId, promptRef);
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
    // legacy client path — remove after next release
    const { keepGoing } = req.body || {};
    let promptRef = null;
    try {
      promptRef = promptRefFromBody(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    return runOptimisticAction(req, res, {
      actionType: 'kanjiKombat.completionChoice',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        if (typeof keepGoing !== 'boolean') {
          throw new Error('keepGoing boolean required');
        }
        const result = req.gameManager.kanjiKombatService.resolveCompletionChoice(keepGoing, promptRef || {});
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });

  return router;
}
