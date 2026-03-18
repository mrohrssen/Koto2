import { Router } from 'express';
import {
  initKanaDeck,
  getNextKanaCard,
  reviewKanaCard,
  getKanaStats
} from '../../game/internal-srs.js';

export default function createKanaRoutes() {
  const router = Router();

  // GET /api/game/kana-card — next due hiragana card
  router.get('/kana-card', (req, res) => {
    const userId = req.user.id;
    initKanaDeck(userId); // no-op if already initialized
    const card = getNextKanaCard(userId);
    if (!card) {
      return res.status(500).json({ error: 'No kana card available' });
    }
    res.json(card);
  });

  // POST /api/game/kana-review — record review result
  router.post('/kana-review', (req, res) => {
    const userId = req.user.id;
    const { char, grade } = req.body;
    if (!char || !['again', 'good'].includes(grade)) {
      return res.status(400).json({ error: 'char and grade (again|good) required' });
    }
    const result = reviewKanaCard(userId, char, grade);
    if (!result) {
      return res.status(404).json({ error: `Card not found: ${char}` });
    }
    const stats = getKanaStats(userId);
    res.json({ card: result, stats });
  });

  // GET /api/game/kana-stats — get kana learning progress
  router.get('/kana-stats', (req, res) => {
    const userId = req.user.id;
    initKanaDeck(userId);
    res.json(getKanaStats(userId));
  });

  return router;
}
