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

export function isGameStateErrorResponse(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && Object.hasOwn(data, 'error'),
  );
}
