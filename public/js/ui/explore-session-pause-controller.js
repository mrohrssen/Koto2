import { FenceContractViolation, FenceSuperseded } from '../async-ownership-fence.js';

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
 * Owns Explore's pause presentation plus fenced auth and empty-runway recovery.
 * Pending-log transport retry remains exclusively owned by ExploreSession.
 */
export function createExploreSessionPauseController({
  getSession,
  refreshRunwayState,
  reviewAuthoritativeState,
  reauthenticate,
  claimReauthentication,
  releaseReauthentication,
  adoptRecoveryState,
  acknowledgeReauthentication,
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
  let reviewPromise = null;
  let authRecoveryPromise = null;
  let activeAuthRecovery = null;
  let queuedAuthRecovery = null;
  let automaticAuthRepeatUsed = false;

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

  function hasCurrentEmptyRunwayRecovery(capture, revision, session) {
    return (
      isCurrent(revision, session)
      && capture?.fence?.isCurrent?.() === true
      && (session.pendingCount?.() ?? 0) === 0
      && EMPTY_RUNWAY_REASONS.has(session.getPauseReason?.())
    );
  }

  function hasCurrentAuthRecovery(capture, revision, session) {
    return isCurrent(revision, session) && capture?.fence?.isCurrent?.() === true;
  }

  function queueAuthRecovery(session, revision) {
    if (!isCurrent(revision, session) || session.getPauseReason?.() !== 'authRequired') return;
    queuedAuthRecovery = { session, revision };
  }

  function queueCurrentAuthRecovery() {
    // A stale preserve capture can mean either a replacement session or a
    // changed ownership revision on the same still-auth-paused session. Keep
    // one deferred successor in both cases; it starts only after the stale
    // recovery clears, so this cannot recursively join its own promise.
    const current = getSession?.();
    if (current) queueAuthRecovery(current, lifecycleRevision);
  }

  function flushQueuedAuthRecovery() {
    const queued = queuedAuthRecovery;
    queuedAuthRecovery = null;
    if (!queued || !isCurrent(queued.revision, queued.session)) return;
    if (queued.session.getPauseReason?.() !== 'authRequired') return;
    void Promise.resolve().then(() => {
      if (
        isCurrent(queued.revision, queued.session)
        && queued.session.getPauseReason?.() === 'authRequired'
      ) {
        void triggerAuthRecovery();
      }
    });
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

    // Authentication owns the action area. The controller owns only its
    // reauthentication/adoption/drain lifecycle.
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
    const attemptedReason = pauseAttempt?.reason || 'missingPayload';
    if (attemptedReason) {
      pauseDispatching = true;
      try {
        session.pause?.(attemptedReason);
      } finally {
        pauseDispatching = false;
      }
    }

    // `pause()` can synchronously notify a newer owner. Re-read rather than
    // trusting the caller's attempted reason so lower-severity UI never wins.
    session = getSession?.();
    renderAuthoritativePause();

    const reason = session?.getPauseReason?.();
    if (session && reason === 'authRequired') {
      // onPause fires inside the session ownership transaction. Deferring the
      // capture makes its initial revision the fully committed pause revision.
      void Promise.resolve().then(() => triggerRecovery());
      return;
    }
    if (
      session
      && (session.pendingCount?.() ?? 0) === 0
      && EMPTY_RUNWAY_REASONS.has(reason)
    ) {
      // onPause can be delivered inside the session's ownership transaction;
      // capture on the next microtask so the pause revision is already current.
      void Promise.resolve().then(() => triggerRecovery());
    }
  }

  function triggerRecovery() {
    if (disposed) return Promise.resolve(false);
    const session = getSession?.();
    const reason = session?.getPauseReason?.();
    if (reason === 'authRequired') return triggerAuthRecovery();
    if (recoveryPromise) return recoveryPromise;
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
    } catch (error) {
      if (error instanceof FenceContractViolation) throw error;
      if (error instanceof FenceSuperseded) return Promise.resolve(false);
      return Promise.resolve(false);
    }
    if (!capture) return Promise.resolve(false);

    recoveryPromise = Promise.resolve()
      .then(() => refreshRunwayState?.({ capture }))
      .then(result => {
        if (!hasCurrentEmptyRunwayRecovery(capture, revision, session)) return false;
        const stillPausedFor = session.getPauseReason?.();
        if (result === true && session.resolvePause?.(stillPausedFor) === true) {
          recoveryAttempt = 0;
          cancelRecoveryTimer();
          return true;
        }
        if (result !== true) {
          scheduleRecovery(session, revision);
          renderAuthoritativePause();
        }
        return false;
      })
      .catch(error => {
        if (error instanceof FenceContractViolation) throw error;
        if (error instanceof FenceSuperseded) return false;
        if (!hasCurrentEmptyRunwayRecovery(capture, revision, session)) return false;
        scheduleRecovery(session, revision);
        renderAuthoritativePause();
        return false;
      })
      .finally(() => { recoveryPromise = null; });
    return recoveryPromise;
  }

  function triggerAuthRecovery() {
    const session = getSession?.();
    if (disposed) return Promise.resolve(false);
    if (authRecoveryPromise) {
      const active = activeAuthRecovery;
      if (!active || active.session !== session || active.revision !== lifecycleRevision) {
        queueAuthRecovery(session, lifecycleRevision);
      }
      return authRecoveryPromise;
    }
    if (!session || session.getPauseReason?.() !== 'authRequired') return Promise.resolve(false);
    const revision = lifecycleRevision;
    const active = { session, revision };
    activeAuthRecovery = active;

    const recovery = (async () => {
      // This is intentionally after the promise is coalesced: a reentrant
      // onPause observer cannot capture before the session transaction bumps
      // its ownership revision.
      await Promise.resolve();
      if (!isCurrent(revision, session) || session.getPauseReason?.() !== 'authRequired') return false;
      let capture;
      let reauthenticationClaim = null;
      let acknowledged = false;
      try {
        capture = session.captureFence?.({
          pending: 'preserve',
          leases: [{
            label: 'Explore pause controller',
            isCurrent: () => isCurrent(revision, session),
          }],
        });
        if (!capture || !hasCurrentAuthRecovery(capture, revision, session)) return false;
        const authenticated = await capture.fence.step(
          'reauthenticate Explore session',
          () => reauthenticate?.(),
        );
        if (authenticated !== true || !hasCurrentAuthRecovery(capture, revision, session)) return false;
        if (typeof claimReauthentication === 'function') {
          const candidateClaim = await claimReauthentication();
          if (!hasCurrentAuthRecovery(capture, revision, session)) {
            if (candidateClaim != null) releaseReauthentication?.(candidateClaim);
            return false;
          }
          if (candidateClaim == null) {
            // Another current recovery consumed this one-use handoff. Re-run
            // only after this flow clears so requestReauthentication can show
            // a fresh prompt when this still-current pause is independent.
            queueAuthRecovery(session, revision);
            return false;
          }
          reauthenticationClaim = candidateClaim;
        }
        if ((await capture.fence.step(
          'adopt Explore recovery state',
          () => adoptRecoveryState?.({ capture }),
        )) !== true) return false;
        if (!hasCurrentAuthRecovery(capture, revision, session)) return false;
        if (session.resolvePause?.('authRequired', { owner: capture.sessionLease }) !== true) return false;
        // The auth drain that raised this pause may still be unwinding. Yield
        // before redelivery so the owned successor can never join it.
        await capture.fence.step('yield before Explore auth redelivery', () => Promise.resolve());
        if (!hasCurrentAuthRecovery(capture, revision, session)) return false;
        await capture.fence.step(
          'redeliver Explore auth recovery',
          () => session.syncNow?.({ owner: capture.sessionLease }),
        );
        if (!hasCurrentAuthRecovery(capture, revision, session)) return false;
        if (session.getPauseReason?.() != null || session.isPaused?.() === true) {
          if (
            session.getPauseReason?.() === 'authRequired'
            && !automaticAuthRepeatUsed
          ) {
            automaticAuthRepeatUsed = true;
            queueAuthRecovery(session, revision);
          }
          return false;
        }
        if (acknowledgeReauthentication?.(reauthenticationClaim) === false) {
          throw new FenceContractViolation('Explore auth recovery did not acknowledge its exact reauthentication claim');
        }
        acknowledged = true;
        automaticAuthRepeatUsed = false;
        return true;
      } catch (error) {
        if (error instanceof FenceSuperseded) {
          queueCurrentAuthRecovery();
          return false;
        }
        if (error instanceof FenceContractViolation) throw error;
        // Authentication owns its own error surface. A failed adoption retains
        // the existing pause and is allowed to retry from a later signal.
        return false;
      } finally {
        if (!acknowledged && reauthenticationClaim != null) {
          releaseReauthentication?.(reauthenticationClaim);
        }
      }
    })();
    let wrappedRecovery;
    wrappedRecovery = recovery.finally(() => {
      if (authRecoveryPromise !== wrappedRecovery) return;
      authRecoveryPromise = null;
      activeAuthRecovery = null;
      flushQueuedAuthRecovery();
    });
    authRecoveryPromise = wrappedRecovery;
    return wrappedRecovery;
  }

  async function reviewLatestProgress() {
    if (reviewPromise) return reviewPromise;
    const session = getSession?.();
    if (!session || session.getPauseReason?.() !== 'writerConflict') return false;
    const revision = lifecycleRevision;
    reviewPromise = (async () => {
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
      } catch (error) {
        if (error instanceof FenceContractViolation) throw error;
        if (error instanceof FenceSuperseded) return false;
        if (capture?.fence?.isCurrent?.() === true && isCurrent(revision, session)) {
          showToast?.('Unable to load the latest progress. Please try again.');
          renderAuthoritativePause();
        }
        return false;
      }
      if (capture?.fence?.isCurrent?.() !== true || !isCurrent(revision, session)) return false;
      renderAuthoritativePause();
      return true;
    })().finally(() => { reviewPromise = null; });
    return reviewPromise;
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
    queuedAuthRecovery = null;
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
