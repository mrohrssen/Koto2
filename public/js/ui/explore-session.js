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

function actionIdForSeq(seq) {
  return `run_es_${String(seq).padStart(8, '0')}`;
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

function hasIntersectingEffect(entries, dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) return false;
  const dependencySet = new Set(dependencies);
  return entries.some(entry => (
    Array.isArray(entry.predictedEffects)
    && entry.predictedEffects.some(effect => dependencySet.has(effect))
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
  let attempts = 0;
  let paused = false;
  let pauseReason = null;
  let generation = 0;

  function pendingCount() { return log.length; }
  function isPaused() { return paused; }

  function clearTimers() {
    if (debounceTimer != null) {
      cancel(debounceTimer);
      debounceTimer = null;
    }
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
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
    const epochChanged = Boolean(previousEpoch && nextEpoch && previousEpoch !== nextEpoch);

    runway = cloneValue(nextRunway) ?? null;
    sessionEpoch = nextEpoch;

    const rooms = preparedRoomsFor(runway);
    const firstRoomIndex = roomIndexFor(rooms[0]);
    localCurrentRoom = Number.isInteger(runway?.currentRoom)
      ? runway.currentRoom
      : firstRoomIndex;

    if (!fromSync && epochChanged) {
      generation += 1;
      clearTimers();
      log = [];
      syncing = false;
      attempts = 0;
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

  function scheduleDrain(delay) {
    if (debounceTimer != null) cancel(debounceTimer);
    debounceTimer = schedule(() => {
      debounceTimer = null;
      return drain();
    }, delay);
  }

  function scheduleRetry() {
    if (retryTimer != null) cancel(retryTimer);
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
      actionId: actionIdForSeq(seq),
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

    const entry = buildEntry(kind, payload, preparedRoom);
    log.push(entry);

    if (kind === 'proceed') {
      const nextRoom = nextPreparedRoomAfter(preparedRoom);
      if (!nextRoom) {
        enterPause('runwayExhausted');
      } else if (!isRoomReady(nextRoom)) {
        enterPause('nextRoomNotReady');
      } else if (hasIntersectingEffect(log, dependenciesFor(nextRoom))) {
        enterPause('dependency');
      } else {
        localCurrentRoom = roomIndexFor(nextRoom);
      }
    }

    if (log.length >= EXPLORE_SESSION_HARD_CAP) enterPause('hardCap');
    scheduleDrain(EXPLORE_SYNC_DEBOUNCE_MS);

    return { accepted: true, pendingCount: log.length, entry: cloneValue(entry) };
  }

  async function drain() {
    if (syncing || log.length === 0) return;

    const myGeneration = generation;
    syncing = true;
    const entries = log.map(entry => cloneValue(entry));

    try {
      const response = await syncRequest({ sessionEpoch, entries });
      if (myGeneration !== generation) return;
      if (!response || (response.status !== 'ok' && response.status !== 'corrected')) {
        throw new Error(response?.error || 'explore session sync failed');
      }

      attempts = 0;

      if (response.status === 'corrected') {
        log = [];
        notify(onCorrection, response);
        if (response.exploreRunway) adoptRunwayInternal(response.exploreRunway, { fromSync: true });
      } else {
        const confirmed = Number.isInteger(response.confirmedThroughSeq)
          ? response.confirmedThroughSeq
          : -1;
        log = log.filter(entry => entry.seq > confirmed);
        notify(onCheckpoint, response, { logEmpty: log.length === 0 });
        if (response.exploreRunway) adoptRunwayInternal(response.exploreRunway, { fromSync: true });
      }

      maybeResumeAfterDrain();
      if (log.length > 0) scheduleDrain(0);
    } catch {
      if (myGeneration !== generation) return;
      scheduleRetry();
    } finally {
      if (myGeneration === generation) syncing = false;
    }
  }

  function syncNow() {
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
    attempts = 0;
    scheduleDrain(0);
  }

  function reset() {
    generation += 1;
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
