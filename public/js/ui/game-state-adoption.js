import { createAsyncOwnershipFence } from '../async-ownership-fence.js';

export function captureGameStateFetchFence(session, getCurrentSession) {
  const capturedSession = session || null;
  const activeSessionLease = {
    label: 'active Explore session',
    isCurrent: () => (getCurrentSession?.() || null) === capturedSession,
  };
  if (capturedSession) {
    return capturedSession.captureFence({
      pending: 'empty',
      leases: [activeSessionLease],
    });
  }
  return {
    fence: createAsyncOwnershipFence([activeSessionLease]),
    sessionLease: activeSessionLease,
  };
}

/**
 * Commits a previously captured Explore runway before publishing its state.
 * Resume stays deferred so the pause controller can lift only its exact,
 * still-current recoverable pause after the authoritative state is visible.
 */
export function adoptCapturedExploreRecoveryState({ capture, data, updateGameState }) {
  capture.fence.commit(
    'adopt Explore pause recovery runway',
    capture.expectRunwayAdoption(data.run?.exploreRunway || null, { deferResume: true }),
  );
  updateGameState(data);
  return true;
}

export function isGameStateErrorResponse(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && Object.hasOwn(data, 'error'),
  );
}
