import { Router } from 'express';
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge } from '../../game/bootstrap/word-knowledge.js';

export function createKnownWordsRoutes() {
  const router = Router();

  // GET /api/game/known-words
  router.get('/', (req, res) => {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    res.json({ words: Object.keys(wk.known) });
  });

  // POST /api/game/known-words/expose
  // Body: { words: ["回復", "生き物", ...] }
  router.post('/expose', (req, res) => {
    const { words } = req.body || {};
    if (!Array.isArray(words) || words.length === 0) {
      return res.json({ ok: true });
    }
    try {
      const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
      for (const word of words) {
        if (typeof word === 'string' && word.length > 0) {
          registerExposure(wk, word);
        }
      }
      saveWordKnowledge(wk);
      res.json({ ok: true });
    } catch (e) {
      console.warn('[known-words/expose] Error:', e.message);
      res.json({ ok: false });
    }
  });

  return router;
}
