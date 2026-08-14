import {
  captureExploreRecoveryToken,
  isExploreRecoveryCurrent,
} from './game-state-adoption.js';

// This direct state-adoption path is only for callbacks invoked by Explore
// recovery itself. Calling the ordinary state loader here would await the drain
// currently awaiting us. The recovery token permits the captured pending log,
// but rejects every other change before the response can replace the runway.
export async function adoptExploreSessionRecoveryState({
  getSession,
  fetchState,
  isUsableState = data => Boolean(data?.player) && !Object.hasOwn(data || {}, 'error'),
} = {}) {
  const session = getSession?.();
  if (!session || typeof fetchState !== 'function') return false;
  const token = captureExploreRecoveryToken(session);
  let data;
  try {
    data = await fetchState({ adoptSession: true });
  } catch {
    return false;
  }
  if (!isExploreRecoveryCurrent(token, getSession?.())) return false;
  if (!isUsableState(data)) return false;

  const nextRunway = data?.run?.exploreRunway;
  if (!nextRunway?.sessionEpoch || nextRunway.sessionEpoch !== token.sessionEpoch) return false;
  session.adoptRunway?.(nextRunway);
  return true;
}
