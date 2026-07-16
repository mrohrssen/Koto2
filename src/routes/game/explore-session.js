import { Router } from 'express';

import { getKnownWordsFromFsrs } from '../../game/bootstrap/word-knowledge.js';
import { ExploreSessionSyncService } from '../../game/services/explore-session-sync-service.js';
import { enrichedState } from './optimistic-action-response.js';

function withAuthoritativeState(result, req) {
  if (result?.status !== 'corrected' || Object.hasOwn(result, 'authoritativeState')) {
    return result;
  }
  return {
    ...result,
    authoritativeState: result.state ?? enrichedState(req),
  };
}

function currentExploreRunway(req, state) {
  return state?.run?.exploreRunway || req.gameManager?.run?.exploreRunway || null;
}

function buildRunwayOpts(req, { getDialogueCardAudio } = {}) {
  return {
    userId: req.user?.id,
    getKnownWords: () => getKnownWordsFromFsrs(req.user?.id),
    getDialogueCardAudio,
  };
}

export default function createExploreSessionRoutes({ getDialogueCardAudio } = {}) {
  const router = Router();

  router.post('/sync', async (req, res) => {
    const { sessionEpoch, entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }

    try {
      const service = new ExploreSessionSyncService(req.gameManager, {
        runwayOpts: buildRunwayOpts(req, { getDialogueCardAudio }),
      });
      const result = await service.applySessionSync({ sessionEpoch, entries });
      await req.saveGame?.();
      return res.json(withAuthoritativeState(result, req));
    } catch (error) {
      const state = enrichedState(req);
      return res.status(409).json({
        status: 'corrected',
        reason: error?.message || 'explore_session_sync_failed',
        confirmedThroughSeq: null,
        rejectedSeq: entries[0]?.seq ?? null,
        results: [],
        state,
        authoritativeState: state,
        exploreRunway: currentExploreRunway(req, state),
      });
    }
  });

  return router;
}
