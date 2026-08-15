import { FenceSuperseded } from '../async-ownership-fence.js';

// This direct state-adoption path is only for callbacks invoked by Explore
// recovery itself. Calling the ordinary state loader here would await the drain
// currently awaiting us. The recovery token permits the captured pending log,
// but rejects every other change before the response can replace the runway.
export async function adoptExploreSessionRecoveryState({
  expectedSession,
  getSession,
  fetchState,
  isUsableState = data => Boolean(data?.player) && !Object.hasOwn(data || {}, 'error'),
} = {}) {
  const session = expectedSession ?? getSession?.();
  if (!session || getSession?.() !== session || typeof fetchState !== 'function') return false;
  const capture = session.captureFence?.({
    pending: 'preserve',
    leases: [{
      label: 'active Explore session',
      isCurrent: () => getSession?.() === session,
    }],
  });
  if (!capture) return false;
  let data;
  try {
    data = await capture.fence.step(
      'fetch Explore recovery state',
      () => fetchState({ adoptSession: true }),
    );
  } catch (error) {
    if (error instanceof FenceSuperseded) return false;
    return false;
  }
  if (!isUsableState(data)) return false;

  const nextRunway = data?.run?.exploreRunway;
  try {
    capture.fence.commit('adopt Explore recovery runway', capture.expectRunwayAdoption(nextRunway));
    return true;
  } catch (error) {
    if (error instanceof FenceSuperseded) return false;
    return false;
  }
}
