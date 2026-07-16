export const EXPLORE_SESSION_HARD_CAP = 50;
export const EXPLORE_SESSION_RESUME_AT = 40;
export const EXPLORE_SYNC_DEBOUNCE_MS = 300;
export const EXPLORE_SYNC_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

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
  let localRevision = 0;
  let correctionRevision = 0;
  let handledResultActionIds = new Set();
  let actionNonce = createSessionNonce();

  function pendingCount() { return log.length; }
  function isPaused() { return paused; }
  function getPauseReason() { return pauseReason; }
  function getLocalRevision() { return localRevision; }
  function getCorrectionRevision() { return correctionRevision; }

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
    if (paused) return;
    paused = true;
    pauseReason = reason;
    notify(onPause, { pendingCount: log.length, reason });
  }

  function resumeIfPaused() {
    if (!paused) return;
    paused = false;
    const reason = pauseReason;
    pauseReason = null;
    notify(onResume, { pendingCount: log.length, reason });
  }

  function maybeResumeAfterDrain() {
    if (!paused) return;
    if (pauseReason === 'hardCap') {
      if (log.length <= EXPLORE_SESSION_RESUME_AT) resumeIfPaused();
      return;
    }
    if (log.length === 0) resumeIfPaused();
  }

  function adoptRunwayInternal(
    nextRunway,
    { fromSync = false, deferResume = false } = {},
  ) {
    const previousEpoch = sessionEpoch;
    const nextEpoch = nextRunway?.sessionEpoch ?? null;
    const epochChanged = Boolean(previousEpoch)
      && (!nextEpoch || previousEpoch !== nextEpoch);
    const sessionBoundary = !fromSync && epochChanged;

    runway = cloneValue(nextRunway) ?? null;
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

  function adoptRunway(nextRunway) {
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
    scheduleDrain(EXPLORE_SYNC_DEBOUNCE_MS);

    return { accepted: true, pendingCount: log.length, entry: cloneValue(entry) };
  }

  function drain({ force = false } = {}) {
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
      const response = await syncRequest({ sessionEpoch, entries });
      if (myGeneration !== generation || token !== activeDrainToken) return { ok: false };

      // Fence captured continuations as soon as a non-committing correction is
      // known. Combat playback may still be holding response adoption; waiting
      // until after that hold creates a race where the rejected local turn can
      // publish during the handoff.
      if (response?.status === 'corrected') correctionRevision += 1;

      // A combat checkpoint may arrive while the predicted turn is still
      // animating. Wait before changing either the ordered log or runway owner;
      // otherwise combat B can become current inside one of combat A's internal
      // animation awaits and the stale continuation can mutate B's scene.
      if (response?.status === 'ok' || response?.status === 'corrected') {
        await beforeResponseAdoption(response);
        if (myGeneration !== generation || token !== activeDrainToken) return { ok: false };
      }

      if (response?.status === 'corrected') {
        log = [];
        attempts = 0;
        if (Object.hasOwn(response, 'exploreRunway')) {
          adoptRunwayInternal(response.exploreRunway, {
            fromSync: true,
            deferResume: true,
          });
        }
        notify(onCorrection, response);
        maybeResumeAfterDrain();
        return { ok: true, appendedAfterSnapshot: false };
      } else if (response?.status === 'ok') {
        attempts = 0;
        const confirmed = Number.isInteger(response.confirmedThroughSeq)
          ? response.confirmedThroughSeq
          : -1;
        log = log.filter(entry => entry.seq > confirmed);
        const appendedAfterSnapshot = log.some(
          entry => entry.seq > snapshotMaxSeq,
        );
        if (Object.hasOwn(response, 'exploreRunway')) {
          adoptRunwayInternal(response.exploreRunway, {
            fromSync: true,
            deferResume: true,
          });
        }
        notify(onCheckpoint, response, { logEmpty: log.length === 0 });
        maybeResumeAfterDrain();
        return { ok: true, appendedAfterSnapshot };
      } else if (
        response?.transient === false
        || (response && typeof response === 'object' && !response?.error)
      ) {
        enterPause('syncRejected');
        return { ok: false, permanent: true };
      } else {
        throw new Error(response?.error || 'explore session sync failed');
      }
    } catch {
      if (myGeneration !== generation || token !== activeDrainToken) return { ok: false };
      scheduleRetry();
      return { ok: false };
    }
  }

  function syncNow() {
    cancelDebounceTimer();
    cancelRetryTimer();
    attempts = 0;
    return drain({ force: true });
  }

  function reset() {
    generation += 1;
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
  }

  return {
    adoptRunway,
    currentPreparedRoom,
    recordRoomAction,
    syncNow,
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
  const revision = session?.getLocalRevision?.() ?? 0;
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
    || (session?.getLocalRevision?.() ?? revision) !== revision
  ) {
    return { executed: false, result: null };
  }
  return { executed: true, result: await action() };
}
