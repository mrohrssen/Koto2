import { Router } from 'express';

import { ExploreSessionSyncService } from '../../game/services/explore-session-sync-service.js';
import {
  enrichedState,
  restoreGameManager,
  snapshotGameManager,
} from './optimistic-action-response.js';

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

export default function createExploreSessionRoutes() {
  const router = Router();

  router.post('/sync', async (req, res) => {
    const { sessionEpoch, entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }

    const snapshot = snapshotGameManager(req.gameManager);
    try {
      const service = new ExploreSessionSyncService(req.gameManager);
      const result = await service.applySessionSync({ sessionEpoch, entries });
      await req.saveGame?.();
      return res.json(withAuthoritativeState(result, req));
    } catch (error) {
      restoreGameManager(req.gameManager, snapshot);
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
