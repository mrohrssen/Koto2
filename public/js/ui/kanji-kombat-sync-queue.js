export const REVIEW_SYNC_QUEUE_SOFT_LIMIT = 40;
export const REVIEW_SYNC_QUEUE_HARD_LIMIT = 60;
export const REVIEW_SYNC_QUEUE_RESUME_LIMIT = 30;
export const REVIEW_SYNC_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000, 15000];

function defaultSchedule(fn, delay) {
  return setTimeout(fn, delay);
}

function defaultCancel(timerId) {
  clearTimeout(timerId);
}

function isResolvedSyncResult(result) {
  return result?.status === 'accepted'
    || result?.status === 'corrected'
    || result?.alreadyCommitted === true;
}

function notifyCallback(callback, ...args) {
  try {
    callback(...args);
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error('Kanji Kombat sync queue callback failed', error);
    }
  }
}

export function createKanjiKombatSyncQueue({
  syncItem,
  onAccepted = () => {},
  onCorrected = () => {},
  onFailed = () => {},
  onPause = () => {},
  onResume = () => {},
  schedule = defaultSchedule,
  cancel = defaultCancel,
} = {}) {
  if (typeof syncItem !== 'function') {
    throw new Error('syncItem function required');
  }

  let items = [];
  let draining = false;
  let retryTimer = null;
  let pausedForHardLimit = false;
  let queueEpoch = 0;

  function pendingCount() {
    return items.length;
  }

  function isAtSoftLimit() {
    return pendingCount() >= REVIEW_SYNC_QUEUE_SOFT_LIMIT;
  }

  function isAtHardLimit() {
    return pendingCount() >= REVIEW_SYNC_QUEUE_HARD_LIMIT;
  }

  function canConsumePrompt() {
    return !isAtHardLimit();
  }

  function isCurrentDrain(drainEpoch, item) {
    return drainEpoch === queueEpoch && items[0] === item;
  }

  function clearRetryTimer() {
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
  }

  function enterHardLimitPause() {
    if (pausedForHardLimit) return;
    pausedForHardLimit = true;
    notifyCallback(onPause, { pendingCount: pendingCount(), reason: 'hardLimit' });
  }

  function scheduleRetry(item) {
    clearRetryTimer();
    const index = Math.min(item.attempts || 0, REVIEW_SYNC_RETRY_DELAYS_MS.length - 1);
    const delay = REVIEW_SYNC_RETRY_DELAYS_MS[index];
    item.attempts = (item.attempts || 0) + 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      void drain();
    }, delay);
  }

  function checkResume() {
    if (pausedForHardLimit && pendingCount() <= REVIEW_SYNC_QUEUE_RESUME_LIMIT) {
      pausedForHardLimit = false;
      notifyCallback(onResume, { pendingCount: pendingCount() });
    }
  }

  async function drain() {
    if (draining) return;
    if (items.length === 0) {
      checkResume();
      return;
    }
    if (retryTimer != null) return;

    const drainEpoch = queueEpoch;
    draining = true;
    const item = items[0];
    item.status = 'syncing';

    try {
      const result = await syncItem(item);
      if (!isCurrentDrain(drainEpoch, item)) return;

      if (!isResolvedSyncResult(result)) {
        throw new Error(result?.error || 'Kanji Kombat sync did not return an accepted response');
      }

      items.shift();
      item.status = result.status === 'corrected' ? 'corrected' : 'accepted';
      item.attempts = 0;

      if (result.status === 'corrected') {
        notifyCallback(onCorrected, item, result);
      } else {
        notifyCallback(onAccepted, item, result);
      }
    } catch (error) {
      if (!isCurrentDrain(drainEpoch, item)) return;

      item.status = 'failed';
      notifyCallback(onFailed, item, error);
      if (!isCurrentDrain(drainEpoch, item)) return;

      scheduleRetry(item);
    } finally {
      if (drainEpoch === queueEpoch) {
        draining = false;
      }
    }

    if (drainEpoch !== queueEpoch) return;

    checkResume();
    if (retryTimer == null && items.length > 0) {
      void drain();
    }
  }

  function enqueue(item) {
    if (isAtHardLimit()) {
      enterHardLimitPause();
      return { accepted: false, pendingCount: pendingCount(), hardLimit: true };
    }

    items.push({
      ...item,
      attempts: Number.isInteger(item.attempts) ? item.attempts : 0,
      status: 'pending',
      createdAt: item.createdAt || Date.now(),
    });

    if (isAtHardLimit()) {
      enterHardLimitPause();
    }

    void drain();
    return { accepted: true, pendingCount: pendingCount(), hardLimit: isAtHardLimit() };
  }

  function reset() {
    queueEpoch += 1;
    clearRetryTimer();
    items = [];
    draining = false;
    pausedForHardLimit = false;
  }

  function drainNow() {
    clearRetryTimer();
    void drain();
  }

  return {
    enqueue,
    drain,
    drainNow,
    reset,
    pendingCount,
    isAtSoftLimit,
    isAtHardLimit,
    canConsumePrompt,
    snapshot: () => items.map(item => ({ ...item })),
  };
}

let activeKanjiKombatSyncQueue = null;

export function configureKanjiKombatSyncQueue(options = {}) {
  activeKanjiKombatSyncQueue = createKanjiKombatSyncQueue(options);
  return activeKanjiKombatSyncQueue;
}

export function getKanjiKombatSyncQueue() {
  return activeKanjiKombatSyncQueue;
}

export function resetKanjiKombatSyncQueue() {
  activeKanjiKombatSyncQueue?.reset();
  activeKanjiKombatSyncQueue = null;
}
