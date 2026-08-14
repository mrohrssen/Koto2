export function captureGameStateFetchToken(session) {
  return {
    session: session || null,
    revision: session?.getLocalRevision?.() ?? null,
  };
}

export function isGameStateFetchCurrent(token, currentSession) {
  if (!token?.session) return currentSession == null;
  return currentSession === token.session
    && (currentSession.pendingCount?.() ?? 0) === 0
    && (currentSession.getLocalRevision?.() ?? null) === token.revision;
}

function pendingIdentity(session) {
  return (session?.snapshot?.() || []).map(entry => ({
    seq: entry?.seq ?? null,
    actionId: entry?.actionId ?? null,
  }));
}

// Recovery fetches intentionally preserve a non-empty Explore log, unlike an
// ordinary state fetch. Its token therefore fences the exact session state
// without requiring the log to drain first.
export function captureExploreRecoveryToken(session) {
  return {
    session: session || null,
    generation: session?.getGeneration?.() ?? null,
    revision: session?.getLocalRevision?.() ?? null,
    runwayRevision: session?.getRunwayRevision?.() ?? null,
    sessionEpoch: session?.getSessionEpoch?.() ?? null,
    pending: pendingIdentity(session),
  };
}

export function isExploreRecoveryCurrent(token, currentSession) {
  if (!token?.session) return currentSession == null;
  return currentSession === token.session
    && (currentSession.getGeneration?.() ?? null) === token.generation
    && (currentSession.getLocalRevision?.() ?? null) === token.revision
    && (currentSession.getRunwayRevision?.() ?? null) === token.runwayRevision
    && (currentSession.getSessionEpoch?.() ?? null) === token.sessionEpoch
    && JSON.stringify(pendingIdentity(currentSession)) === JSON.stringify(token.pending);
}

export function isGameStateErrorResponse(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && Object.hasOwn(data, 'error'),
  );
}
