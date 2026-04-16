import { Router } from 'express';
import { join } from 'path';
import { exposeWords, getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
import { gradeCard, getDueCards, getDueCount, createCard, getDeckCards } from '../../game/internal-srs.js';
import { getDialogueWordSet, getBarkPool } from '../../game/dialogue-loader.js';
import { loadWordDictionary } from '../../game/word-dictionary.js';
import { tokenize } from '../../tokenizer.js';
import { incrementDiscoveryCount, getDiscoveryStatus } from '../../word-tracking.js';
import { addReview } from '../../auth/users.js';

let _wordDict = null;
function getWordDict() {
  if (!_wordDict) _wordDict = loadWordDictionary(join(process.cwd(), 'data'));
  return _wordDict;
}

export function createKnownWordsRoutes() {
  const router = Router();

  // GET /api/game/known-words — now uses FSRS as source of truth
  router.get('/', (req, res) => {
    const words = getKnownWordsFromFsrs(req.user.id);
    res.json({ words });
  });

  // POST /api/game/known-words/expose
  router.post('/expose', (req, res) => {
    try {
      exposeWords(req.user.id, req.body?.words || []);
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

    const userId = req.user?.id || 'default';
    const settings = req.getSettings?.() || {};
    const dailyLimit = settings.dailyWordLimit ?? 10;

    // If discovery mode, check limit before processing
    if (isDiscovery) {
      const status = getDiscoveryStatus(userId, dailyLimit);
      if (status.atLimit) {
        return res.json({ ok: false, atLimit: true, todayCount: status.todayCount });
      }
    }

    try {
      // Auto-create card if it doesn't exist (allows fast-tracking words)
      const existingCards = getDeckCards(req.user.id, 'vocab');
      if (!existingCards.find(c => c.id === word)) {
        const dict = getWordDict();
        const entry = dict.get(word);
        const meaning = entry?.definitions?.find(d => d.primary)?.en
          || entry?.definitions?.[0]?.en || '';
        const reading = entry?.reading || word;
        createCard(req.user.id, 'vocab', word, { word, meaning, reading });
      }
      const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);

      // Track review for leaderboard
      addReview(userId);

      // If discovery mode, increment counter and return discovery-specific fields
      if (isDiscovery) {
        const counts = incrementDiscoveryCount(userId, dailyLimit);
        return res.json({
          ok: true,
          mastered: grade === 'good',
          card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses },
          todayCount: counts.todayCount,
          atLimit: counts.atLimit
        });
      }

      res.json({
        ok: true,
        mastered: grade === 'good',
        card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses }
      });
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
    const cards = getDueCards(req.user.id, 'vocab');
    const words = cards.map(c => ({
      word: c.word,
      reading: c.reading || c.word,
      meanings: c.meaning ? [c.meaning] : [''],
      source: 'internal',
    }));
    res.json({ words });
  });

  // GET /api/game/known-words/word-dictionary
  router.get('/word-dictionary', (req, res) => {
    try {
      const dialogueWords = getDialogueWordSet();
      const dict = getWordDict();
      const filtered = {};
      for (const word of dialogueWords) {
        const entry = dict.get(word);
        if (entry) filtered[word] = entry;
      }
      res.json({ dictionary: filtered });
    } catch (e) {
      console.warn('[word-dictionary] Error:', e.message);
      res.json({ dictionary: {} });
    }
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
      const tokens = tokenize(text);
      const enriched = tokens.map(t => {
        const entry = dict.get(t.baseForm) || dict.get(t.surface);
        return {
          spelling: t.surface,
          word: t.baseForm,
          reading: entry?.reading || t.reading || t.baseForm,
          meanings: entry?.definitions?.map(d => d.en).filter(Boolean) || [],
          partOfSpeech: t.pos ? [t.pos.split(',')[0]] : [],
          lookupable: !!entry
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
