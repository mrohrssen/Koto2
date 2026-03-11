import { Router } from 'express';
import { loadWordKnowledge, createWordKnowledge } from '../../game/bootstrap/word-knowledge.js';

export function createKnownWordsRoutes() {
  const router = Router();

  // GET /api/game/known-words
  router.get('/', (req, res) => {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    res.json({ words: Object.keys(wk.known) });
  });

  return router;
}
