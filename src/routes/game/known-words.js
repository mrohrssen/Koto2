import { Router } from 'express';
import { join } from 'path';
import { getKnownWordsFromFsrs, hydrateCards } from '../../game/bootstrap/word-knowledge.js';
import { gradeCard, getDueCards, getDueCount, createCard, getDeckCards } from '../../game/internal-srs.js';
import { getBarkPool } from '../../game/dialogue-loader.js';
import { loadWordDictionary } from '../../game/word-dictionary.js';
import { resolveLiveDictPath } from '../../game/live-dict-path.js';
import { tokenizeAndAnnotate } from '../../game/grammar/tokenize-and-annotate.js';
import { incrementDiscoveryCount, getDiscoveryStatus } from '../../word-tracking.js';
import { addReview } from '../../auth/users.js';
import {
  isReviewFusionCoreEligible,
  rollReviewFusionCoreDrop
} from '../../game/services/review-fusion-core-service.js';
import {
  createOptimisticActionRunner,
  getOptimisticActionLedgerOwner,
} from './optimistic-action-response.js';

let _wordDict = null;
function getWordDict() {
  if (!_wordDict) {
    _wordDict = loadWordDictionary({
      overlayDir: join(process.cwd(), 'data'),
      liveDictPath: resolveLiveDictPath(),
    });
  }
  return _wordDict;
}

export function invalidateKnownWordsDict() {
  _wordDict = null;
}

export function performKnownWordReview(req, {
  word,
  grade,
  isDiscovery,
  reviewFusionCoreRandom = Math.random,
} = {}) {
  if (!word || !['good', 'again'].includes(grade)) {
    throw new Error('word and grade (good|again) required');
  }

  const userId = req.user?.id || 'default';
  const settings = req.getSettings?.() || {};
  const dailyLimit = settings.dailyWordLimit ?? 10;

  if (isDiscovery) {
    const status = getDiscoveryStatus(userId, dailyLimit);
    if (status.atLimit) {
      return { ok: false, atLimit: true, todayCount: status.todayCount };
    }
  }

  // Capture pre-review state before auto-create so first-time "again"
  // reviews cannot farm Fusion Core drops.
  const existingCards = getDeckCards(userId, 'vocab');
  const preReviewCard = existingCards.find(card => card.id === word) || null;
  const fusionCoreEligible = isReviewFusionCoreEligible({
    grade,
    isDiscovery,
    preReviewCard,
  });

  // Auto-create card if it doesn't exist (allows fast-tracking words).
  if (!preReviewCard) {
    createCard(userId, 'vocab', word, { word });
  }
  const updatedCard = gradeCard(userId, 'vocab', word, grade);

  // Track review for leaderboard.
  addReview(userId);

  const baseResponse = {
    ok: true,
    mastered: grade === 'good',
    card: {
      state: updatedCard.state,
      due: updatedCard.due,
      lapses: updatedCard.lapses,
    },
  };

  const response = isDiscovery
    ? {
        ...baseResponse,
        ...incrementDiscoveryCount(userId, dailyLimit),
      }
    : baseResponse;

  const meta = req.gameManager?.getMeta?.() || req.gameManager?.meta;
  if (!meta) return response;

  const fusionCoreDrop = rollReviewFusionCoreDrop(meta, {
    eligible: fusionCoreEligible,
    random: reviewFusionCoreRandom,
  });
  if (!fusionCoreDrop) return response;

  req.saveGame?.();
  return {
    ...response,
    fusionCoreDrop,
    state: req.getEnrichedGameState?.(),
  };
}

export function createKnownWordsRoutes({ reviewFusionCoreRandom = Math.random } = {}) {
  const router = Router();
  const runKnownWordReviewAction = createOptimisticActionRunner({
    owner: getOptimisticActionLedgerOwner,
  });

  // GET /api/game/known-words — now uses FSRS as source of truth
  router.get('/', (req, res) => {
    const words = getKnownWordsFromFsrs(req.user.id);
    res.json({ words });
  });

  // POST /api/game/known-words/expose
  router.post('/expose', (req, res) => {
    try {
      req.gameManager.exposeWords(req.body?.words || []);
      res.json({ ok: true });
    } catch (e) {
      console.warn('[known-words/expose] Error:', e.message);
      res.json({ ok: false });
    }
  });

  // POST /api/game/known-words/review
  router.post('/review', (req, res) => {
    const { word, grade, isDiscovery } = req.body || {};
    if (!word || !['good', 'again'].includes(grade)) {
      return res.status(400).json({ error: 'word and grade (good|again) required' });
    }

    const performReview = () => performKnownWordReview(req, {
      word,
      grade,
      isDiscovery,
      reviewFusionCoreRandom,
    });

    if (isDiscovery && req.body?.actionId) {
      return runKnownWordReviewAction(req, res, {
        actionType: 'wordDiscovery.review',
        errorStatusCode: 409,
        perform: performReview,
      });
    }

    try {
      res.json(performReview());
    } catch (e) {
      console.warn('[known-words/review] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/game/known-words/due-count
  router.get('/due-count', (req, res) => {
    const count = getDueCount(req.user.id, 'vocab');
    res.json({ count });
  });

  // GET /api/game/known-words/due-words
  router.get('/due-words', (req, res) => {
    const cards = hydrateCards(getDueCards(req.user.id, 'vocab'));
    const words = cards.map(c => ({
      word: c.id,
      reading: c.reading,
      meanings: c.meaning ? [c.meaning] : [''],
      source: 'internal',
    }));
    res.json({ words });
  });

  // GET /api/game/known-words/bark-pool
  router.get('/bark-pool', (req, res) => {
    res.json({ barkPool: getBarkPool() });
  });

  // POST /api/game/known-words/parse-text — Sudachi tokenization + dictionary enrichment
  router.post('/parse-text', (req, res) => {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text (string) required' });
    }
    try {
      const dict = getWordDict();
      const annotated = tokenizeAndAnnotate(text);
      const tokens = annotated.rawTokens;
      const grammarByIndex = new Map();
      for (const token of annotated.tokens) {
        if (Array.isArray(token.grammarHints)) {
          grammarByIndex.set(token.rawTokenStart, token.grammarHints);
        }
      }
      const enriched = tokens.map(t => {
        const entry = dict.get(t.baseForm) || dict.get(t.surface);
        return {
          spelling: t.surface,
          word: t.baseForm,
          reading: entry?.reading || t.reading || t.baseForm,
          meanings: entry?.definitions?.map(d => d.en).filter(Boolean) || [],
          partOfSpeech: t.pos ? [t.pos.split(',')[0]] : [],
          lookupable: !!entry,
          grammarHints: grammarByIndex.get(t.index) || []
        };
      });
      res.json({ tokens: enriched });
    } catch (e) {
      console.warn('[known-words/parse-text] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/game/known-words/lookup-word — single word lookup from dictionary
  router.post('/lookup-word', (req, res) => {
    const { word } = req.body || {};
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'word (string) required' });
    }
    try {
      const dict = getWordDict();
      const entry = dict.get(word);
      if (!entry) {
        return res.json({ word, meanings: [], reading: '', partOfSpeech: [] });
      }
      const cards = getDeckCards(req.user.id, 'vocab');
      const card = cards.find(c => c.id === word);
      const stateLabels = { 0: 'new', 1: 'learning', 2: 'known', 3: 'due' };
      const cardState = card ? [stateLabels[card.state] || 'unknown'] : ['never-looked-up'];
      res.json({
        word,
        spelling: word,
        reading: entry.reading || word,
        meanings: entry.definitions?.map(d => d.en).filter(Boolean) || [],
        partOfSpeech: entry.pos ? [entry.pos] : [],
        cardState
      });
    } catch (e) {
      console.warn('[known-words/lookup-word] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
