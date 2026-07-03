import { Router } from 'express';
import { rotateKanjiKombatSessionEpoch } from '../../game/services/kanji-kombat-service.js';
import { rotateExploreSessionEpoch } from '../../game/services/explore-session-contract.js';
import { getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';

/**
 * Create game state router
 * gameManager, getEnrichedGameState come from req (set by game/index.js middleware)
 * @returns {Router}
 */
export default function createGameStateRoutes({ getDialogueCardAudio } = {}) {
  const router = Router();

  // Get current game state
  router.get('/state', async (req, res) => {
    const run = req.gameManager.run;
    const shouldRestoreExplore = run?.active && run.mode !== 'kanjiKombat';
    const previousExploreSessionEpoch = shouldRestoreExplore ? run.exploreSessionEpoch : null;
    const previousExploreRunway = shouldRestoreExplore ? run.exploreRunway : null;

    try {
      if (run?.mode === 'kanjiKombat' && run?.active) {
        rotateKanjiKombatSessionEpoch(run.kanjiKombat);
        await req.saveGame();
      } else if (run?.active) {
        rotateExploreSessionEpoch(run);
        run.exploreRunway = await req.gameManager.explorationService.buildExploreRunway({
          userId: req.user?.id,
          getKnownWords: () => getKnownWordsFromFsrs(req.user?.id),
          getDialogueCardAudio,
        });
        await req.saveGame();
      }
      res.json(req.getEnrichedGameState());
    } catch (error) {
      if (shouldRestoreExplore) {
        run.exploreSessionEpoch = previousExploreSessionEpoch;
        run.exploreRunway = previousExploreRunway;
      }
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
