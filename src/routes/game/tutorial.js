import { Router } from 'express';
import {
  getTutorialStep,
  advanceTutorial,
  TUTORIAL_STEPS,
  awardTutorialFusionCore,
  markTutorialFusionComplete
} from '../../game/services/tutorial-service.js';

export default function createTutorialRoutes() {
  const router = Router();

  router.post('/tutorial-advance', (req, res) => {
    const { expectedStep } = req.body;
    const meta = req.gameManager.getMeta();
    const currentStep = getTutorialStep(meta);

    if (typeof expectedStep !== 'number' || expectedStep !== currentStep) {
      return res.status(400).json({ error: 'Tutorial step mismatch', currentStep });
    }

    if (currentStep < TUTORIAL_STEPS.DEATH_HUB || currentStep > TUTORIAL_STEPS.CREATURE_FORMATION) {
      return res.status(400).json({ error: 'Cannot advance tutorial at this step from client', currentStep });
    }

    const newStep = advanceTutorial(meta);
    req.saveGame();
    res.json({ tutorialStep: newStep, state: req.getEnrichedGameState() });
  });

  router.post('/tutorial-fusion-core', (req, res) => {
    const meta = req.gameManager.getMeta();
    try {
      const result = awardTutorialFusionCore(meta);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/tutorial-fusion-complete', (req, res) => {
    const meta = req.gameManager.getMeta();
    const result = markTutorialFusionComplete(meta);
    req.saveGame();
    res.json({ ...result, state: req.getEnrichedGameState() });
  });

  router.get('/tutorial-state', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json({ tutorialStep: getTutorialStep(meta) });
  });

  return router;
}
