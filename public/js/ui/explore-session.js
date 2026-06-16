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
  return Boolean(preparedRoom) && preparedRoom.offlineReady !== false;
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
  let actionNonce = createSessionNonce();

  function pendingCount() { return log.length; }
  function isPaused() { return paused; }

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
    return rooms.find(room => roomIndexFor(room) === localCurrentRoom) || rooms[0] || null;
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

  function adoptRunwayInternal(nextRunway, { fromSync = false } = {}) {
    const previousEpoch = sessionEpoch;
    const nextEpoch = nextRunway?.sessionEpoch ?? null;
    const sessionBoundary = !fromSync
      && Boolean(previousEpoch)
      && (!nextEpoch || previousEpoch !== nextEpoch);

    runway = cloneValue(nextRunway) ?? null;
    sessionEpoch = nextEpoch;

    const rooms = preparedRoomsFor(runway);
    const firstRoomIndex = roomIndexFor(rooms[0]);
    localCurrentRoom = Number.isInteger(runway?.currentRoom)
      ? runway.currentRoom
      : firstRoomIndex;

    if (fromSync) replayPendingProceedCursor();

    if (sessionBoundary) {
      generation += 1;
      activeDrainToken += 1;
      activeDrainPromise = null;
      clearTimers();
      log = [];
      syncing = false;
      attempts = 0;
      forceDrainRequested = false;
      maybeResumeAfterDrain();
    }

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
    if (!preparedRoom) return reject('noPreparedRoom');
    if (!isRoomReady(preparedRoom)) {
      enterPause('currentRoomNotReady');
      return reject('currentRoomNotReady');
    }
    if (!isAcceptedAction(preparedRoom, kind)) return reject('actionNotAccepted');

    const nextRoom = kind === 'proceed' ? nextPreparedRoomAfter(preparedRoom) : null;
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
      const pendingEffects = effectsForAction(preparedRoom, kind);
      if (
        hasIntersectingEffect(log, nextDependencies)
        || hasEffectIntersection(pendingEffects, nextDependencies)
      ) {
        enterPause('dependency');
        return reject('dependency');
      }
    }

    const entry = buildEntry(kind, payload, preparedRoom);
    log.push(entry);

    if (kind === 'proceed') {
      localCurrentRoom = roomIndexFor(nextRoom);
    }

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
      if (!response || (response.status !== 'ok' && response.status !== 'corrected')) {
        throw new Error(response?.error || 'explore session sync failed');
      }

      attempts = 0;
      let appendedAfterSnapshot = false;

      if (response.status === 'corrected') {
        log = [];
        notify(onCorrection, response);
        if (Object.hasOwn(response, 'exploreRunway')) {
          adoptRunwayInternal(response.exploreRunway, { fromSync: true });
        }
      } else {
        const confirmed = Number.isInteger(response.confirmedThroughSeq)
          ? response.confirmedThroughSeq
          : -1;
        log = log.filter(entry => entry.seq > confirmed);
        appendedAfterSnapshot = log.some(entry => entry.seq > snapshotMaxSeq);
        notify(onCheckpoint, response, { logEmpty: log.length === 0 });
        if (Object.hasOwn(response, 'exploreRunway')) {
          adoptRunwayInternal(response.exploreRunway, { fromSync: true });
        }
      }

      maybeResumeAfterDrain();
      return { ok: true, appendedAfterSnapshot };
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
