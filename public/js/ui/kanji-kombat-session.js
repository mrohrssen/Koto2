export const KK_SESSION_HARD_CAP = 50;
export const KK_SESSION_RESUME_AT = 40;
export const KK_SYNC_DEBOUNCE_MS = 300;
export const KK_SYNC_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

function defaultSchedule(fn, delay) {
  const timer = setTimeout(fn, delay);
  timer?.unref?.();
  return timer;
}

function notify(callback, ...args) {
  try {
    callback(...args);
  } catch (error) {
    console.error('[KanjiKombat] session callback failed', error);
  }
}

export function createKanjiKombatSession({
  syncRequest,
  onCheckpoint = () => {},
  onCorrection = () => {},
  onPause = () => {},
  onResume = () => {},
  schedule = defaultSchedule,
  cancel = id => clearTimeout(id),
} = {}) {
  if (typeof syncRequest !== 'function') throw new Error('syncRequest function required');

  let log = [];
  let nextSeq = 1;
  let sessionEpoch = null;
  let syncing = false;
  let debounceTimer = null;
  let retryTimer = null;
  let attempts = 0;
  let paused = false;
  let generation = 0;

  function pendingCount() { return log.length; }
  function canConsumePrompt() { return log.length < KK_SESSION_HARD_CAP; }
  function isPaused() { return paused; }

  function adoptServerState(state) {
    const epoch = state?.run?.kanjiKombat?.sessionEpoch;
    if (epoch) sessionEpoch = epoch;
  }

  function clearTimers() {
    if (debounceTimer != null) { cancel(debounceTimer); debounceTimer = null; }
    if (retryTimer != null) { cancel(retryTimer); retryTimer = null; }
  }

  function maybeResume() {
    if (paused && log.length <= KK_SESSION_RESUME_AT) {
      paused = false;
      notify(onResume, { pendingCount: log.length });
    }
  }

  function enterPause(reason) {
    if (paused) return;
    paused = true;
    notify(onPause, { pendingCount: log.length, reason });
  }

  function scheduleDrain(delay) {
    if (debounceTimer != null) cancel(debounceTimer);
    debounceTimer = schedule(() => {
      debounceTimer = null;
      void drain();
    }, delay);
  }

  function scheduleRetry() {
    if (retryTimer != null) cancel(retryTimer);
    const index = Math.min(attempts, KK_SYNC_RETRY_DELAYS_MS.length - 1);
    attempts += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      void drain();
    }, KK_SYNC_RETRY_DELAYS_MS[index]);
  }

  async function drain() {
    if (syncing || log.length === 0) return;
    const myGeneration = generation;
    syncing = true;
    const entries = log.map(item => ({ ...item }));
    try {
      const response = await syncRequest({ sessionEpoch, entries });
      if (myGeneration !== generation) return;
      if (!response || (response.status !== 'ok' && response.status !== 'corrected')) {
        throw new Error(response?.error || 'kanji kombat sync failed');
      }
      attempts = 0;
      adoptServerState(response.state || response.authoritativeState);
      if (response.sessionEpoch) sessionEpoch = response.sessionEpoch;

      if (response.status === 'corrected') {
        log = [];
        notify(onCorrection, response);
      } else {
        const confirmed = Number.isInteger(response.confirmedThroughSeq)
          ? response.confirmedThroughSeq
          : -1;
        log = log.filter(item => item.seq > confirmed);
        notify(onCheckpoint, response, { logEmpty: log.length === 0 });
      }
      maybeResume();
      if (log.length > 0) scheduleDrain(0);
    } catch {
      if (myGeneration !== generation) return;
      scheduleRetry();
    } finally {
      if (myGeneration === generation) syncing = false;
    }
  }

  function recordAction(entry) {
    if (log.length >= KK_SESSION_HARD_CAP) {
      enterPause('hardCap');
      return { accepted: false, pendingCount: log.length };
    }
    log.push({ createdAt: Date.now(), ...entry, seq: nextSeq++ });
    if (log.length >= KK_SESSION_HARD_CAP) enterPause('hardCap');
    scheduleDrain(KK_SYNC_DEBOUNCE_MS);
    return { accepted: true, pendingCount: log.length };
  }

  function syncNow() {
    if (retryTimer != null) { cancel(retryTimer); retryTimer = null; }
    attempts = 0;
    scheduleDrain(0);
  }

  function reset() {
    generation += 1;
    clearTimers();
    log = [];
    nextSeq = 1;
    sessionEpoch = null;
    syncing = false;
    attempts = 0;
    paused = false;
  }

  return {
    adoptServerState,
    recordAction,
    syncNow,
    drain,
    pendingCount,
    canConsumePrompt,
    isPaused,
    reset,
    snapshot: () => log.map(item => ({ ...item })),
  };
}

let activeSession = null;

export function configureKanjiKombatSession(options = {}) {
  if (activeSession) activeSession.reset();
  activeSession = createKanjiKombatSession(options);
  return activeSession;
}

export function getKanjiKombatSession() {
  return activeSession;
}

export function resetKanjiKombatSession() {
  if (activeSession) activeSession.reset();
  activeSession = null;
}
