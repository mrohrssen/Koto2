const EMPTY_RUNWAY_REASONS = new Set([
  'noPreparedRoom',
  'currentRoomNotReady',
  'nextRoomNotReady',
  'runwayExhausted',
  'missingPayload',
  'actionNotAccepted',
]);

const RUNWAY_RETRY_DELAYS = [500, 1000, 2000, 4000, 8000, 15000];
const SPOTTY_CONNECTION_COPY = 'Connection is spotty. Unsynced progress can be lost if you reload.';
const UNSUPPORTED_PROTOCOL_COPY = 'A newer version of Koto is required to continue this run.';
const ARMED_TIMER = Symbol('armed Explore runway recovery timer');

/**
 * Owns Explore's non-auth pause presentation and empty-runway recovery.
 * Pending-log transport retry remains exclusively owned by ExploreSession.
 */
export function createExploreSessionPauseController({
  getSession,
  refreshRunwayState,
  reviewAuthoritativeState,
  renderNarration,
  renderActions,
  showToast,
  schedule,
  cancel,
  windowTarget,
  documentTarget,
} = {}) {
  let lifecycleRevision = 0;
  let disposed = false;
  let recoveryPromise = null;
  let recoveryTimer = null;
  let recoveryAttempt = 0;
  let pauseDispatching = false;

  const isCurrent = (revision, session) => (
    !disposed
    && lifecycleRevision === revision
    && getSession?.() === session
  );

  function cancelRecoveryTimer() {
    if (recoveryTimer == null) return;
    if (recoveryTimer !== ARMED_TIMER) cancel?.(recoveryTimer);
    recoveryTimer = null;
  }

  function scheduleRecovery(session, revision) {
    if (!isCurrent(revision, session) || recoveryTimer != null) return;
    const delay = RUNWAY_RETRY_DELAYS[Math.min(recoveryAttempt, RUNWAY_RETRY_DELAYS.length - 1)];
    recoveryAttempt += 1;
    recoveryTimer = ARMED_TIMER;
    const scheduledTimer = schedule?.(() => {
      recoveryTimer = null;
      if (isCurrent(revision, session)) return triggerRecovery();
      return false;
    }, delay);
    if (recoveryTimer === ARMED_TIMER && scheduledTimer !== undefined) {
      recoveryTimer = scheduledTimer;
    }
  }

  function currentPause() {
    const session = getSession?.();
    return { session, reason: session?.getPauseReason?.() || null };
  }

  function renderAuthoritativePause() {
    const { session, reason } = currentPause();
    if (!session || !reason) return;
    const pending = (session.pendingCount?.() ?? 0) > 0;

    if (reason === 'transportDegraded') {
      renderNarration?.(SPOTTY_CONNECTION_COPY);
      if (pending) {
        renderActions?.({
          message: SPOTTY_CONNECTION_COPY,
          actions: [{
            label: 'Retry',
            primary: true,
            onClick: () => session.syncNow?.(),
          }],
        });
      }
      return;
    }

    if (reason === 'unsupportedProtocol') {
      renderActions?.({ message: UNSUPPORTED_PROTOCOL_COPY, actions: [] });
      return;
    }

    if (reason === 'writerConflict') {
      renderActions?.({
        message: 'This run is open on another device. Review its latest progress before continuing here.',
        actions: [
          { label: 'Review latest progress', primary: true, onClick: reviewLatestProgress },
          { label: 'Keep paused', onClick: () => showToast?.('This session will remain paused until you review the other device.') },
        ],
      });
      return;
    }

    // Task 7 gives authentication its fenced lifecycle owner. Until then the
    // existing auth surface keeps exclusive ownership of the action area.
    if (reason === 'authRequired') return;

    renderNarration?.(
      pending
        ? 'Syncing your progress. Please wait…'
        : 'Preparing the next room. Please wait…',
    );
  }

  function handlePause(pauseAttempt = {}) {
    let session = getSession?.();
    if (!session) return;

    if (pauseDispatching) return;
    if (pauseAttempt?.reason) {
      pauseDispatching = true;
      try {
        session.pause?.(pauseAttempt.reason);
      } finally {
        pauseDispatching = false;
      }
    }

    // `pause()` can synchronously notify a newer owner. Re-read rather than
    // trusting the caller's attempted reason so lower-severity UI never wins.
    session = getSession?.();
    renderAuthoritativePause();

    const reason = session?.getPauseReason?.();
    if (
      session
      && (session.pendingCount?.() ?? 0) === 0
      && EMPTY_RUNWAY_REASONS.has(reason)
    ) {
      void triggerRecovery();
    }
  }

  function triggerRecovery() {
    if (disposed || recoveryPromise) return recoveryPromise || Promise.resolve(false);
    const session = getSession?.();
    const reason = session?.getPauseReason?.();
    if (
      !session
      || (session.pendingCount?.() ?? 0) !== 0
      || !EMPTY_RUNWAY_REASONS.has(reason)
    ) {
      return Promise.resolve(false);
    }

    const revision = lifecycleRevision;
    let capture;
    try {
      capture = session.captureFence?.({
        pending: 'empty',
        leases: [{
          label: 'Explore pause controller',
          isCurrent: () => isCurrent(revision, session),
        }],
      });
    } catch {
      return Promise.resolve(false);
    }
    if (!capture) return Promise.resolve(false);

    recoveryPromise = Promise.resolve()
      .then(() => refreshRunwayState?.({ capture }))
      .then(() => {
        if (!isCurrent(revision, session)) return false;
        const stillPausedFor = session.getPauseReason?.();
        const stillEmpty = (session.pendingCount?.() ?? 0) === 0;
        if (stillEmpty && EMPTY_RUNWAY_REASONS.has(stillPausedFor)) {
          scheduleRecovery(session, revision);
          renderAuthoritativePause();
          return false;
        }
        recoveryAttempt = 0;
        cancelRecoveryTimer();
        return true;
      })
      .catch(() => {
        if (!isCurrent(revision, session)) return false;
        scheduleRecovery(session, revision);
        return false;
      })
      .finally(() => { recoveryPromise = null; });
    return recoveryPromise;
  }

  async function reviewLatestProgress() {
    const session = getSession?.();
    if (!session || session.getPauseReason?.() !== 'writerConflict') return false;
    const revision = lifecycleRevision;
    let capture;
    try {
      capture = session.captureFence?.({
        pending: 'preserve',
        leases: [{
          label: 'Explore pause controller',
          isCurrent: () => isCurrent(revision, session),
        }],
      });
      if (!capture) return false;
      if ((await reviewAuthoritativeState?.({ capture })) !== true) {
        throw new Error('authoritative review was not adopted');
      }
    } catch {
      if (isCurrent(revision, session)) {
        showToast?.('Unable to load the latest progress. Please try again.');
        renderAuthoritativePause();
      }
      return false;
    }
    if (!isCurrent(revision, session)) return false;
    renderAuthoritativePause();
    return true;
  }

  const onOnline = () => { void triggerRecovery(); };
  const onVisibilityChange = () => {
    if (documentTarget?.visibilityState !== 'hidden') void triggerRecovery();
  };

  if (typeof windowTarget?.addEventListener === 'function') {
    windowTarget.addEventListener('online', onOnline);
  }
  if (typeof documentTarget?.addEventListener === 'function') {
    documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    lifecycleRevision += 1;
    cancelRecoveryTimer();
    if (typeof windowTarget?.removeEventListener === 'function') {
      windowTarget.removeEventListener('online', onOnline);
    }
    if (typeof documentTarget?.removeEventListener === 'function') {
      documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
    }
  }

  return { handlePause, triggerRecovery, reviewLatestProgress, dispose };
}
