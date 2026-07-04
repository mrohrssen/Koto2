import { Router } from 'express';
import { rotateKanjiKombatSessionEpoch } from '../../game/services/kanji-kombat-service.js';
import {
  ensureExploreSessionEpoch,
  rotateExploreSessionEpoch,
} from '../../game/services/explore-session-contract.js';
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
        // Explore session epochs mark RELOAD boundaries only. A bare /state fetch is
        // a boot/reload — rotate the epoch (a reload loses the unsynced offline log BY
        // DESIGN). An IN-SESSION fetch (adoptSession=1, e.g. a combat-victory state
        // reload, connection-recovery refresh, or the harness's final reconciliation)
        // must NOT rotate: rotating out from under a client that still holds
        // offline-queued session entries strands them, and their next drain is rejected
        // as session_epoch_mismatch (a corrected sync). Create-if-absent in that case,
        // then rebuild a fresh runway either way.
        if (req.query.adoptSession === '1') {
          ensureExploreSessionEpoch(run);
        } else {
          rotateExploreSessionEpoch(run);
        }
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
