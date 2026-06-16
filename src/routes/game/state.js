import { Router } from 'express';
import { rotateKanjiKombatSessionEpoch } from '../../game/services/kanji-kombat-service.js';
import { rotateExploreSessionEpoch } from '../../game/services/explore-session-contract.js';
import { getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';

/**
 * Create game state router
 * gameManager, getEnrichedGameState come from req (set by game/index.js middleware)
 * @returns {Router}
 */
export default function createGameStateRoutes() {
  const router = Router();

  // Get current game state
  router.get('/state', async (req, res) => {
    if (req.gameManager.run?.mode === 'kanjiKombat' && req.gameManager.run?.active) {
      rotateKanjiKombatSessionEpoch(req.gameManager.run.kanjiKombat);
      req.saveGame();
    } else if (req.gameManager.run?.active) {
      rotateExploreSessionEpoch(req.gameManager.run);
      req.gameManager.run.exploreRunway = await req.gameManager.explorationService.buildExploreRunway({
        userId: req.user?.id,
        getKnownWords: () => getKnownWordsFromFsrs(req.user?.id),
        getDialogueCardAudio: req.app?.locals?.getDialogueCardAudio,
      });
      req.saveGame();
    }
    res.json(req.getEnrichedGameState());
  });

  return router;
}
