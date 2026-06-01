import { Router } from 'express';

export default function createKanjiKombatRoutes() {
  const router = Router();

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

  router.post('/intro', (req, res) => {
    try {
      const { cardId, choice } = req.body || {};
      if (!cardId || !['known', 'unknown'].includes(choice)) {
        return res.status(400).json({ error: 'cardId and choice (known|unknown) required' });
      }
      const result = req.gameManager.submitKanjiKombatIntro
        ? req.gameManager.submitKanjiKombatIntro(cardId, choice)
        : req.gameManager.kanjiKombatService.submitIntroChoice(cardId, choice);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/answer', (req, res) => {
    try {
      const { answerId } = req.body || {};
      if (!answerId) return res.status(400).json({ error: 'answerId required' });
      const result = req.gameManager.submitKanjiKombatAnswer(answerId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/completion-choice', (req, res) => {
    try {
      const { keepGoing } = req.body || {};
      if (typeof keepGoing !== 'boolean') {
        return res.status(400).json({ error: 'keepGoing boolean required' });
      }
      const result = req.gameManager.kanjiKombatService.resolveCompletionChoice(keepGoing);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
