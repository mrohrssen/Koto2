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
  let automaticAuthRepeatEpisode = null;

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

  function currentAuthEpisode(session, revision) {
    return {
      session,
      revision,
      localRevision: session?.getLocalRevision?.(),
    };
  }

  function hasUsedAutomaticAuthRepeat(session, revision) {
    const episode = automaticAuthRepeatEpisode;
    return (
      episode?.session === session
      && episode.revision === revision
      && episode.localRevision === session?.getLocalRevision?.()
    );
  }

  function useAutomaticAuthRepeat(session, revision) {
    automaticAuthRepeatEpisode = currentAuthEpisode(session, revision);
  }

  function clearAutomaticAuthRepeat(session, revision) {
    if (
      automaticAuthRepeatEpisode?.session === session
      && automaticAuthRepeatEpisode.revision === revision
    ) {
      automaticAuthRepeatEpisode = null;
    }
  }

  function isAttachedAuthRecovery(active) {
    return (
      active != null
      && active.detached !== true
      && activeAuthRecovery === active
      && authRecoveryPromise === active.promise
    );
  }

  function hasCurrentActiveAuthRecovery(active) {
    return (
      active != null
      && active.detached !== true
      && (
        active.capture == null
          ? isCurrent(active.revision, active.session)
          : hasCurrentAuthRecovery(active.capture, active.revision, active.session)
      )
    );
  }

  function releaseActiveReauthenticationClaim(active) {
    const claim = active?.reauthenticationClaim;
    if (claim == null) return false;
    // Clear before notifying auth so a reentrant detach/finally cannot
    // release this exact opaque claim twice.
    active.reauthenticationClaim = null;
    releaseReauthentication?.(claim);
    return true;
  }

  function detachAuthRecovery(active = activeAuthRecovery) {
    if (!active) {
      authRecoveryPromise = null;
      return false;
    }
    if (active.detached === true) return false;
    active.detached = true;
    releaseActiveReauthenticationClaim(active);
    if (activeAuthRecovery === active) activeAuthRecovery = null;
    if (authRecoveryPromise === active.promise) authRecoveryPromise = null;
    return true;
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
    let session = getSession?.();
    if (
      authRecoveryPromise
      && (!activeAuthRecovery || !hasCurrentActiveAuthRecovery(activeAuthRecovery))
    ) {
      // Signals can arrive for a non-auth successor too. Release a stale
      // auth handoff before handling that successor, rather than leaving an
      // unrelated hung adoption to monopolize it.
      detachAuthRecovery(activeAuthRecovery);
      session = getSession?.();
    }
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
    let session = getSession?.();
    if (disposed) return Promise.resolve(false);
    if (authRecoveryPromise) {
      const active = activeAuthRecovery;
      if (active && hasCurrentActiveAuthRecovery(active)) {
        return authRecoveryPromise;
      }
      // A previous recovery can be parked in external adoption while its
      // capture, session, or controller lifecycle has already gone stale.
      // It cannot safely own the one-use auth handoff any longer, so detach
      // (rather than aborting the external work) before the current session
      // is allowed to begin a successor recovery.
      detachAuthRecovery(active);
      session = getSession?.();
    }
    if (!session || session.getPauseReason?.() !== 'authRequired') return Promise.resolve(false);
    const revision = lifecycleRevision;
    const active = {
      session,
      revision,
      capture: null,
      reauthenticationClaim: null,
      detached: false,
      promise: null,
    };
    activeAuthRecovery = active;

    const recovery = (async () => {
      // This is intentionally after the promise is coalesced: a reentrant
      // onPause observer cannot capture before the session transaction bumps
      // its ownership revision.
      await Promise.resolve();
      if (!hasCurrentActiveAuthRecovery(active) || session.getPauseReason?.() !== 'authRequired') return false;
      let acknowledged = false;
      try {
        const capture = session.captureFence?.({
          pending: 'preserve',
          leases: [{
            label: 'Explore pause controller',
            isCurrent: () => isCurrent(revision, session),
          }],
        });
        active.capture = capture;
        if (!capture || !hasCurrentActiveAuthRecovery(active)) return false;
        const authenticated = await capture.fence.step(
          'reauthenticate Explore session',
          () => reauthenticate?.(),
        );
        if (authenticated !== true || !hasCurrentActiveAuthRecovery(active)) return false;
        if (typeof claimReauthentication === 'function') {
          const candidateClaim = await claimReauthentication();
          if (!hasCurrentActiveAuthRecovery(active)) {
            if (candidateClaim != null) releaseReauthentication?.(candidateClaim);
            // Claim acquisition itself can suspend. Once a stale claimant
            // releases the one-use handoff, let the current auth-paused
            // session claim it after this recovery clears.
            if (isAttachedAuthRecovery(active)) queueCurrentAuthRecovery();
            return false;
          }
          if (candidateClaim == null) {
            // Another current recovery consumed this one-use handoff. Re-run
            // only after this flow clears so requestReauthentication can show
            // a fresh prompt when this still-current pause is independent.
            if (isAttachedAuthRecovery(active)) queueAuthRecovery(session, revision);
            return false;
          }
          active.reauthenticationClaim = candidateClaim;
        }
        if ((await capture.fence.step(
          'adopt Explore recovery state',
          () => adoptRecoveryState?.({ capture }),
        )) !== true) return false;
        if (!hasCurrentActiveAuthRecovery(active)) return false;
        if (session.resolvePause?.('authRequired', { owner: capture.sessionLease }) !== true) return false;
        // The auth drain that raised this pause may still be unwinding. Yield
        // before redelivery so the owned successor can never join it.
        await capture.fence.step('yield before Explore auth redelivery', () => Promise.resolve());
        if (!hasCurrentActiveAuthRecovery(active)) return false;
        await capture.fence.step(
          'redeliver Explore auth recovery',
          () => session.syncNow?.({ owner: capture.sessionLease }),
        );
        if (!hasCurrentActiveAuthRecovery(active)) return false;
        if (session.getPauseReason?.() != null || session.isPaused?.() === true) {
          if (
            session.getPauseReason?.() === 'authRequired'
            && !hasUsedAutomaticAuthRepeat(session, revision)
          ) {
            useAutomaticAuthRepeat(session, revision);
            queueAuthRecovery(session, revision);
          }
          return false;
        }
        if (acknowledgeReauthentication?.(active.reauthenticationClaim) === false) {
          throw new FenceContractViolation('Explore auth recovery did not acknowledge its exact reauthentication claim');
        }
        active.reauthenticationClaim = null;
        acknowledged = true;
        clearAutomaticAuthRepeat(session, revision);
        return true;
      } catch (error) {
        if (error instanceof FenceSuperseded) {
          if (isAttachedAuthRecovery(active)) queueCurrentAuthRecovery();
          return false;
        }
        if (error instanceof FenceContractViolation) throw error;
        // Authentication owns its own error surface. A failed adoption retains
        // the existing pause and is allowed to retry from a later signal.
        return false;
      } finally {
        if (!acknowledged) releaseActiveReauthenticationClaim(active);
      }
    })();
    let wrappedRecovery;
    wrappedRecovery = recovery.finally(() => {
      if (!isAttachedAuthRecovery(active) || active.promise !== wrappedRecovery) return;
      authRecoveryPromise = null;
      activeAuthRecovery = null;
      flushQueuedAuthRecovery();
    });
    active.promise = wrappedRecovery;
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
    detachAuthRecovery(activeAuthRecovery);
    queuedAuthRecovery = null;
    automaticAuthRepeatEpisode = null;
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
