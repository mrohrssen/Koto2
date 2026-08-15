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

export function isGameStateErrorResponse(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && Object.hasOwn(data, 'error'),
  );
}
