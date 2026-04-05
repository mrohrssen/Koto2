import { Router } from 'express';
import { join } from 'path';
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge, markKnown, unmarkKnown, getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
import { createCard, getDeckCards, gradeCard, getDueCards, getDueCount } from '../../game/internal-srs.js';
import { getDialogueWordSet, getBarkPool } from '../../game/dialogue-loader.js';
import { loadWordDictionary } from '../../game/word-dictionary.js';

const EXPOSURE_THRESHOLD = 5;

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
    const { words } = req.body || {};
    if (!Array.isArray(words) || words.length === 0) {
      return res.json({ ok: true });
    }
    try {
      const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
      for (const entry of words) {
        const word = typeof entry === 'string' ? entry : entry?.word;
        const meaning = typeof entry === 'string' ? '' : (entry?.meaning || '');
        if (typeof word !== 'string' || word.length === 0) continue;

        registerExposure(wk, word);

        if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
          const existingCards = getDeckCards(req.user.id, 'vocab');
          if (!existingCards.find(c => c.id === word)) {
            createCard(req.user.id, 'vocab', word, {
              word, meaning, reading: word
            });
          }
        }
      }
      saveWordKnowledge(wk);
      res.json({ ok: true });
    } catch (e) {
      console.warn('[known-words/expose] Error:', e.message);
      res.json({ ok: false });
    }
  });

  // POST /api/game/known-words/review
  router.post('/review', (req, res) => {
    const { word, grade } = req.body || {};
    if (!word || !['good', 'again'].includes(grade)) {
      return res.status(400).json({ error: 'word and grade (good|again) required' });
    }
    try {
      const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);
      const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);

      if (grade === 'good') {
        markKnown(wk, word);
      } else {
        unmarkKnown(wk, word);
        if (wk.seen[word]) wk.seen[word].exposures = 0;
      }
      saveWordKnowledge(wk);

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

  return router;
}
