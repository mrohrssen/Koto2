import { classifyExploreTransport } from '../../../src/shared/explore/sync-outcome.js';
import { PAUSE_REASONS, shouldReplacePauseReason } from '../../../src/shared/explore/pause-reasons.js';
import { createAsyncOwnershipFence, FenceSuperseded } from '../async-ownership-fence.js';

export const EXPLORE_SESSION_HARD_CAP = 50;
export const EXPLORE_SESSION_RESUME_AT = 40;
export const EXPLORE_SYNC_DEBOUNCE_MS = 300;
export const EXPLORE_SYNC_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000];
export const EXPLORE_SYNC_DEGRADE_AFTER_ATTEMPTS = 12;

function defaultSchedule(fn, delay) {
  const timer = setTimeout(fn, delay);
  timer?.unref?.();
  return timer;
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

function notify(callback, ...args) {
  try {
    callback(...args);
  } catch (error) {
    console.error('[ExploreSession] session callback failed', error);
  }
}

let sessionNonceCounter = 0;

function createSessionNonce() {
  sessionNonceCounter += 1;
  const counter = sessionNonceCounter.toString(36);
  let random = '';
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    random = Array.from(bytes, byte => (byte % 36).toString(36)).join('');
  } else {
    random = Math.random().toString(36).slice(2, 10);
  }
  return `${counter}${random || Date.now().toString(36)}`.slice(0, 20);
}

function actionIdForSeq(seq, nonce) {
  return `run_es_${nonce}_${String(seq).padStart(8, '0')}`;
}

function preparedRoomsFor(runway) {
  return Array.isArray(runway?.preparedRooms) ? runway.preparedRooms : [];
}

function roomIndexFor(preparedRoom) {
  return Number.isInteger(preparedRoom?.index) ? preparedRoom.index : null;
}

function roomIdFor(preparedRoom) {
  return preparedRoom?.roomId ?? preparedRoom?.room?.id ?? null;
}

function actionSeqFor(preparedRoom) {
  return Number.isInteger(preparedRoom?.actionSeq) ? preparedRoom.actionSeq : null;
}

function effectsForAction(preparedRoom, kind) {
  const effects = preparedRoom?.actionEffects?.[kind];
  return Array.isArray(effects) ? [...effects] : [];
}

function dependenciesFor(preparedRoom) {
  return Array.isArray(preparedRoom?.dependencies) ? preparedRoom.dependencies : [];
}

function isRoomReady(preparedRoom) {
  return Boolean(preparedRoom) && preparedRoom.offlineReady === true;
}

function isAcceptedAction(preparedRoom, kind) {
  return Array.isArray(preparedRoom?.acceptedActions)
    && preparedRoom.acceptedActions.includes(kind);
}

function hasEffectIntersection(effects, dependencies) {
  if (!Array.isArray(effects) || !Array.isArray(dependencies) || dependencies.length === 0) {
    return false;
  }
  const dependencySet = new Set(dependencies);
  return effects.some(effect => dependencySet.has(effect));
}

function hasIntersectingEffect(entries, dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) return false;
  return entries.some(entry => (
    Array.isArray(entry.predictedEffects)
    && hasEffectIntersection(entry.predictedEffects, dependencies)
  ));
}

export function createExploreSession({
  syncRequest,
  isAuthBindingCurrent = () => true,
  beforeResponseAdoption = async () => {},
  onCheckpoint = () => {},
  onCorrection = () => {},
  onPause = () => {},
  onResume = () => {},
  schedule = defaultSchedule,
  cancel = id => clearTimeout(id),
} = {}) {
  if (typeof syncRequest !== 'function') throw new Error('syncRequest function required');

  let runway = null;
  let sessionEpoch = null;
  let localCurrentRoom = null;
  let log = [];
  let nextSeq = 1;
  let syncing = false;
  let debounceTimer = null;
  let retryTimer = null;
  let activeDrainPromise = null;
  let activeDrainToken = 0;
  let forceDrainRequested = false;
  let attempts = 0;
  let paused = false;
  let pauseReason = null;
  let generation = 0;
  let ownershipRevision = 0;
  let sessionLifetime = 0;
  let localRevision = 0;
  let correctionRevision = 0;
  let handledResultActionIds = new Set();
  let actionNonce = createSessionNonce();
  let expectedProtocolVersion = 1;

  function pendingCount() { return log.length; }
  function isPaused() { return paused; }
  function getPauseReason() { return pauseReason; }
  function getLocalRevision() { return localRevision; }
  function getCorrectionRevision() { return correctionRevision; }

  let completingOwnershipTransaction = false;

  function completeOwnershipTransaction(mutator) {
    if (completingOwnershipTransaction) return mutator();
    completingOwnershipTransaction = true;
    try {
      const result = mutator();
      ownershipRevision += 1;
      return result;
    } finally {
      completingOwnershipTransaction = false;
    }
  }

  function consumeResultOnce(actionId) {
    if (typeof actionId !== 'string' || actionId.length === 0) return true;
    if (handledResultActionIds.has(actionId)) return false;
    handledResultActionIds.add(actionId);
    return true;
  }

  function cancelDebounceTimer() {
    if (debounceTimer != null) {
      cancel(debounceTimer);
      debounceTimer = null;
    }
  }

  function cancelRetryTimer() {
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
  }

  function clearTimers() {
    cancelDebounceTimer();
    cancelRetryTimer();
  }

  function currentPreparedRoom() {
    const rooms = preparedRoomsFor(runway);
    if (rooms.length === 0) return null;
    if (Number.isInteger(localCurrentRoom)) {
      return rooms.find(room => roomIndexFor(room) === localCurrentRoom) || null;
    }
    return rooms[0] || null;
  }

  function enterPause(reason) {
    if (!PAUSE_REASONS[reason]) return false;
    if (paused && !shouldReplacePauseReason(pauseReason, reason)) return false;
    completeOwnershipTransaction(() => {
      paused = true;
      pauseReason = reason;
      notify(onPause, { pendingCount: log.length, reason });
    });
    return true;
  }

  function resumeIfPaused() {
    if (!paused) return;
    completeOwnershipTransaction(() => {
      paused = false;
      const reason = pauseReason;
      pauseReason = null;
      notify(onResume, { pendingCount: log.length, reason });
    });
  }

  function resolvePause(reason) {
    if (
      !paused
      || pauseReason !== reason
      || reason === 'writerConflict'
      || reason === 'unsupportedProtocol'
    ) return false;
    resumeIfPaused();
    return true;
  }

  function maybeResumeAfterDrain() {
    if (!paused) return;
    if (pauseReason === 'hardCap') {
      if (log.length <= EXPLORE_SESSION_RESUME_AT) resumeIfPaused();
      return;
    }
    if (log.length === 0) resumeIfPaused();
  }

  function adoptRunwayState(
    nextRunway,
    { fromSync = false, deferResume = false } = {},
  ) {
    const previousEpoch = sessionEpoch;
    const nextEpoch = nextRunway?.sessionEpoch ?? null;
    const epochChanged = Boolean(previousEpoch)
      && (!nextEpoch || previousEpoch !== nextEpoch);
    const sessionBoundary = !fromSync && epochChanged;

    runway = cloneValue(nextRunway) ?? null;
    promoteProtocolVersion(runway?.protocolVersion);
    sessionEpoch = nextEpoch;
    const rooms = preparedRoomsFor(runway);
    const firstRoomIndex = roomIndexFor(rooms[0]);
    localCurrentRoom = Number.isInteger(runway?.currentRoom)
      ? runway.currentRoom
      : firstRoomIndex;
    if (fromSync) replayPendingProceedCursor();

    if (epochChanged) {
      localRevision += 1;
      handledResultActionIds = new Set();
    }

    if (sessionBoundary) {
      generation += 1;
      activeDrainToken += 1;
      activeDrainPromise = null;
      clearTimers();
      log = [];
      syncing = false;
      attempts = 0;
      forceDrainRequested = false;
    }

    if (!fromSync && !sessionBoundary && retryTimer != null && log.length > 0) {
      void syncNow();
    }

    // Adopting a refreshed runway is a recovery moment for a paused session whose
    // log is empty: such a pause (nextRoomNotReady / currentRoomNotReady /
    // runwayExhausted) can NEVER lift via the drain — runDrainLoop early-returns on
    // an empty log, so drainOnce (the only other maybeResumeAfterDrain caller) never
    // runs. Resume here on BOTH paths (boundary and same-epoch refresh), after the
    // cursor/log are settled. maybeResumeAfterDrain already encodes the correct
    // semantics (hardCap threshold, else resume only when the log is empty).
    if (!deferResume) maybeResumeAfterDrain();

    return runway;
  }

  function adoptRunwayInternal(nextRunway, options) {
    return completeOwnershipTransaction(() => adoptRunwayState(nextRunway, options));
  }

  function adoptRunway(nextRunway) {
    if (pauseReason === 'writerConflict' || pauseReason === 'unsupportedProtocol') {
      return runway;
    }
    return adoptRunwayInternal(nextRunway);
  }

  function nextPreparedRoomAfter(preparedRoom) {
    const index = roomIndexFor(preparedRoom);
    if (!Number.isInteger(index)) return null;
    return preparedRoomsFor(runway).find(room => roomIndexFor(room) > index) || null;
  }

  function preparedRoomForEntry(entry) {
    return preparedRoomsFor(runway).find(room => (
      roomIndexFor(room) === entry?.roomIndex
      && roomIdFor(room) === entry?.roomId
    )) || null;
  }

  function replayPendingProceedCursor() {
    const pendingProceeds = log
      .filter(entry => entry.kind === 'proceed')
      .sort((a, b) => a.seq - b.seq);

    for (const entry of pendingProceeds) {
      const room = preparedRoomForEntry(entry);
      const nextRoom = room ? nextPreparedRoomAfter(room) : null;
      if (nextRoom && isRoomReady(nextRoom)) {
        localCurrentRoom = roomIndexFor(nextRoom);
      }
    }
  }

  function scheduleDrain(delay) {
    cancelDebounceTimer();
    debounceTimer = schedule(() => {
      debounceTimer = null;
      return drain();
    }, delay);
  }

  function scheduleRetry() {
    cancelDebounceTimer();
    cancelRetryTimer();
    const index = Math.min(attempts, EXPLORE_SYNC_RETRY_DELAYS_MS.length - 1);
    attempts += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      return drain();
    }, EXPLORE_SYNC_RETRY_DELAYS_MS[index]);
  }

  function retryOrDegrade() {
    scheduleRetry();
    if (attempts >= EXPLORE_SYNC_DEGRADE_AFTER_ATTEMPTS) enterPause('transportDegraded');
    return { ok: false };
  }

  function promoteProtocolVersion(version) {
    if (version === 2 && expectedProtocolVersion < 2) {
      completeOwnershipTransaction(() => {
        expectedProtocolVersion = 2;
      });
    }
  }

  function responseAuthIsCurrent(transport) {
    try {
      return isAuthBindingCurrent(transport) !== false;
    } catch {
      return false;
    }
  }

  function handleAuthRequired() {
    enterPause('authRequired');
    return { ok: false };
  }

  function buildEntry(kind, payload, preparedRoom) {
    const seq = nextSeq++;
    return {
      seq,
      actionId: actionIdForSeq(seq, actionNonce),
      kind,
      roomIndex: roomIndexFor(preparedRoom),
      roomId: roomIdFor(preparedRoom),
      actionSeq: actionSeqFor(preparedRoom),
      payload: cloneValue(payload ?? {}),
      predictedEffects: effectsForAction(preparedRoom, kind),
      createdAt: Date.now(),
    };
  }

  function reject(reason) {
    return { accepted: false, reason, pendingCount: log.length };
  }

  function recordRoomAction(kind, payload = {}) {
    if (log.length >= EXPLORE_SESSION_HARD_CAP) {
      enterPause('hardCap');
      return reject('hardCap');
    }

    if (paused) {
      return reject(pauseReason || 'paused');
    }

    const preparedRoom = currentPreparedRoom();
    if (!preparedRoom) {
      enterPause('noPreparedRoom');
      return reject('noPreparedRoom');
    }
    if (!isRoomReady(preparedRoom)) {
      enterPause('currentRoomNotReady');
      return reject('currentRoomNotReady');
    }
    if (!isAcceptedAction(preparedRoom, kind)) {
      enterPause('actionNotAccepted');
      return reject('actionNotAccepted');
    }

    const nextRoom = kind === 'proceed' ? nextPreparedRoomAfter(preparedRoom) : null;
    let pauseSelfEffectsAfterQueue = false;
    if (kind === 'proceed') {
      if (!nextRoom) {
        enterPause('runwayExhausted');
        return reject('runwayExhausted');
      }
      if (!isRoomReady(nextRoom)) {
        enterPause('nextRoomNotReady');
        return reject('nextRoomNotReady');
      }
      const nextDependencies = dependenciesFor(nextRoom);
      // Two distinct dependency intersections, handled differently:
      //
      // 1. PRIOR-ENTRY: an already-queued earlier action (e.g. shrine.choose /
      //    friendlyNpc.choose with a partyStats effect) whose effect feeds the next
      //    room. REJECT before queuing — the drain empties the log, the effect lands
      //    server-side, and the retried proceed passes. The reject is transient.
      //
      // 2. SELF-EFFECTS: the proceed's OWN predicted effects feed the next room
      //    (proceed → ['ingredients'] × campfire deps ['ingredients','partyStats']).
      //    This intersects STATICALLY, before the entry is ever queued, so a reject
      //    can NEVER clear — the effect only lands if THIS entry syncs, but rejecting
      //    means it's never queued, so every retry re-trips the same static
      //    intersection (support→campfire deadlock, armed when proceed was granted to
      //    support rooms). So QUEUE it and pause AFTER pushing: the drain lands the
      //    effect and the pause holds the just-entered room's own actions until then.
      if (hasIntersectingEffect(log, nextDependencies)) {
        enterPause('dependency');
        return reject('dependency');
      }
      pauseSelfEffectsAfterQueue = hasEffectIntersection(
        effectsForAction(preparedRoom, kind),
        nextDependencies,
      );
    }

    const entry = buildEntry(kind, payload, preparedRoom);
    completeOwnershipTransaction(() => {
      log.push(entry);
      localRevision += 1;

      if (kind === 'proceed') {
        localCurrentRoom = roomIndexFor(nextRoom);
      }

      // Pause on a self-intersecting proceed's own effects (see above). Entering pause
      // here first makes the hardCap enterPause below a no-op (enterPause early-returns
      // while paused); the hardCap resume threshold still governs once this lifts.
      if (pauseSelfEffectsAfterQueue) enterPause('dependency');

      if (log.length >= EXPLORE_SESSION_HARD_CAP) enterPause('hardCap');
    });
    scheduleDrain(EXPLORE_SYNC_DEBOUNCE_MS);

    return { accepted: true, pendingCount: log.length, entry: cloneValue(entry) };
  }

  function drain({ force = false } = {}) {
    if (
      pauseReason === 'unsupportedProtocol'
      || pauseReason === 'writerConflict'
      || pauseReason === 'authRequired'
    ) {
      return Promise.resolve();
    }
    if (force) forceDrainRequested = true;
    if (activeDrainPromise) return activeDrainPromise;

    const token = activeDrainToken + 1;
    activeDrainToken = token;
    activeDrainPromise = runDrainLoop(token).finally(() => {
      if (activeDrainToken === token) {
        activeDrainPromise = null;
        syncing = false;
        forceDrainRequested = false;
      }
    });
    return activeDrainPromise;
  }

  async function runDrainLoop(token) {
    if (log.length === 0) return;
    syncing = true;

    while (log.length > 0 && activeDrainToken === token) {
      const result = await drainOnce(token);
      if (!result?.ok || log.length === 0) return;
      if (forceDrainRequested || result.appendedAfterSnapshot) continue;
      scheduleDrain(0);
      return;
    }
  }

  async function drainOnce(token) {
    const myGeneration = generation;
    cancelDebounceTimer();
    const entries = log.map(entry => cloneValue(entry));
    const snapshotMaxSeq = entries.reduce((max, entry) => Math.max(max, entry.seq), 0);

    try {
      const rawResponse = await syncRequest({ sessionEpoch, entries });
      if (myGeneration !== generation || token !== activeDrainToken) return { ok: false };

      const transport = rawResponse;
      const outcome = classifyExploreTransport(transport, { expectedProtocolVersion });
      const response = transport.body;

      if (outcome === 'indeterminate') return retryOrDegrade();
      if (outcome === 'unsupportedProtocol' || outcome === 'conflict') {
        promoteProtocolVersion(response.protocolVersion);
      }

      if (outcome === 'authRequired' || !responseAuthIsCurrent(transport)) return handleAuthRequired();

      if (outcome === 'conflict') {
        enterPause('writerConflict');
        return { ok: false };
      }
      if (outcome === 'unsupportedProtocol') {
        enterPause('unsupportedProtocol');
        return { ok: false };
      }
      if (outcome !== 'v1Settled') return retryOrDegrade();

      // Fence captured continuations as soon as a non-committing correction is
      // known. Combat playback may still be holding response adoption; waiting
      // until after that hold creates a race where the rejected local turn can
      // publish during the handoff.
      if (response?.status === 'corrected') {
        correctionRevision += 1;
      }

      // A combat checkpoint may arrive while the predicted turn is still
      // animating. Wait before changing either the ordered log or runway owner;
      // otherwise combat B can become current inside one of combat A's internal
      // animation awaits and the stale continuation can mutate B's scene.
      if (response?.status === 'ok' || response?.status === 'corrected') {
        await beforeResponseAdoption(response);
        if (myGeneration !== generation || token !== activeDrainToken) return { ok: false };
        if (!responseAuthIsCurrent(transport)) return handleAuthRequired();
      }

      if (response?.status === 'corrected') {
        completeOwnershipTransaction(() => {
          log = [];
          attempts = 0;
          if (Object.hasOwn(response, 'exploreRunway')) {
            adoptRunwayState(response.exploreRunway, {
              fromSync: true,
              deferResume: true,
            });
          }
          notify(onCorrection, response);
          maybeResumeAfterDrain();
        });
        return { ok: true, appendedAfterSnapshot: false };
      } else if (response?.status === 'ok') {
        let appendedAfterSnapshot = false;
        completeOwnershipTransaction(() => {
          attempts = 0;
          const confirmed = Number.isInteger(response.confirmedThroughSeq)
            ? response.confirmedThroughSeq
            : -1;
          log = log.filter(entry => entry.seq > confirmed);
          appendedAfterSnapshot = log.some(
            entry => entry.seq > snapshotMaxSeq,
          );
          if (Object.hasOwn(response, 'exploreRunway')) {
            adoptRunwayState(response.exploreRunway, {
              fromSync: true,
              deferResume: true,
            });
          }
          notify(onCheckpoint, response, { logEmpty: log.length === 0 });
          maybeResumeAfterDrain();
        });
        return { ok: true, appendedAfterSnapshot };
      }
    } catch {
      if (myGeneration !== generation || token !== activeDrainToken) return { ok: false };
      return retryOrDegrade();
    }
  }

  function syncNow() {
    cancelDebounceTimer();
    cancelRetryTimer();
    return drain({ force: true });
  }

  function reset() {
    completeOwnershipTransaction(() => {
      generation += 1;
      sessionLifetime += 1;
      localRevision += 1;
      activeDrainToken += 1;
      activeDrainPromise = null;
      clearTimers();
      runway = null;
      sessionEpoch = null;
      localCurrentRoom = null;
      log = [];
      nextSeq = 1;
      syncing = false;
      attempts = 0;
      paused = false;
      pauseReason = null;
      forceDrainRequested = false;
      handledResultActionIds = new Set();
      actionNonce = createSessionNonce();
      expectedProtocolVersion = 1;
    });
  }

  function captureFence({ pending, leases = [] } = {}) {
    if (pending !== 'empty' && pending !== 'preserve') {
      throw new Error("captureFence pending must be 'empty' or 'preserve'");
    }
    if (!Array.isArray(leases)) throw new Error('captureFence leases must be an array');
    if (pending === 'empty' && log.length !== 0) {
      throw new Error('cannot capture an empty Explore fence with pending work');
    }

    let expectedOwnershipRevision = ownershipRevision;
    let expectedLifetime = sessionLifetime;
    const capturedEpoch = sessionEpoch;
    const capturedPending = pending === 'preserve' ? cloneValue(log) : null;
    const sessionLease = {
      label: 'Explore session',
      isCurrent: () => (
        ownershipRevision === expectedOwnershipRevision
        && sessionLifetime === expectedLifetime
      ),
    };
    const fence = createAsyncOwnershipFence([sessionLease, ...leases]);

    function expectRunwayAdoption(nextRunway) {
      const requestedRunway = cloneValue(nextRunway);
      const requestedEpoch = nextRunway?.sessionEpoch ?? null;
      return {
        apply: () => {
          if (
            pending !== 'preserve'
            || requestedEpoch !== capturedEpoch
            || !sameValue(log, capturedPending)
          ) {
            throw new Error('recovery runway adoption no longer owns this Explore session');
          }
          return completeOwnershipTransaction(() => adoptRunwayState(nextRunway));
        },
        transitions: [{
          lease: sessionLease,
          verify: () => (
            ownershipRevision === expectedOwnershipRevision + 1
            && sessionLifetime === expectedLifetime
            && sessionEpoch === requestedEpoch
            && sameValue(runway, requestedRunway)
            && sameValue(log, capturedPending)
          ),
          advance: () => {
            expectedOwnershipRevision = ownershipRevision;
            expectedLifetime = sessionLifetime;
          },
        }],
      };
    }

    return { fence, sessionLease, expectRunwayAdoption };
  }

  return {
    adoptRunway,
    currentPreparedRoom,
    recordRoomAction,
    syncNow,
    retryNow: syncNow,
    drain,
    reset,
    pendingCount,
    snapshot: () => log.map(entry => cloneValue(entry)),
    isPaused,
    getPauseReason,
    getLocalRevision,
    getCorrectionRevision,
    consumeResultOnce,
    pause: enterPause,
    resolvePause,
    captureFence,
  };
}

let activeSession = null;

export function configureExploreSession(options = {}) {
  if (activeSession) activeSession.reset();
  activeSession = createExploreSession(options);
  return activeSession;
}

export function getExploreSession() {
  return activeSession;
}

export function resetExploreSession() {
  if (activeSession) activeSession.reset();
  activeSession = null;
}

export async function runWithStableExploreSession(session, action, { reason = 'legacyAction' } = {}) {
  const localRevision = session?.getLocalRevision?.() ?? 0;
  const wasActiveSession = activeSession === session;
  try {
    if ((session?.pendingCount?.() ?? 0) > 0) {
      await session.syncNow?.({ reason });
    }
  } catch {
    return { executed: false, result: null };
  }
  if (
    (session?.pendingCount?.() ?? 0) > 0
    || session?.isPaused?.() === true
    || (session?.getLocalRevision?.() ?? localRevision) !== localRevision
  ) {
    return { executed: false, result: null };
  }
  const capture = session?.captureFence?.({
    pending: 'empty',
    leases: wasActiveSession ? [{
      label: 'active Explore session',
      isCurrent: () => activeSession === session,
    }] : [],
  });
  if (!capture) return { executed: false, result: null };
  try {
    return { executed: true, result: await capture.fence.step('run legacy Explore action', action) };
  } catch (error) {
    if (error instanceof FenceSuperseded) return { executed: false, result: null };
    throw error;
  }
}
