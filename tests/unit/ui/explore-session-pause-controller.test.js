import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createExploreSessionPauseController } from '../../../public/js/ui/explore-session-pause-controller.js';
import { FenceContractViolation, FenceSuperseded } from '../../../public/js/async-ownership-fence.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('condition was not met');
}

function eventTarget({ visibilityState = 'visible' } = {}) {
  const listeners = new Map();
  return {
    visibilityState,
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener();
    },
  };
}

function createSession({ reason = null, pending = 0 } = {}) {
  let currentReason = reason;
  let currentPending = pending;
  const captureFenceCalls = [];
  return {
    getPauseReason: () => currentReason,
    isPaused: () => currentReason != null,
    pendingCount: () => currentPending,
    pause(nextReason) {
      const priority = { nextRoomNotReady: 1, syncPending: 1, transportDegraded: 2, writerConflict: 3, authRequired: 4, unsupportedProtocol: 5 };
      if (!currentReason || (priority[nextReason] || 0) > (priority[currentReason] || 0)) {
        currentReason = nextReason;
        return true;
      }
      return false;
    },
    retryNow: async () => {},
    resolvePause(expectedReason) {
      if (
        currentReason !== expectedReason
        || expectedReason === 'writerConflict'
        || expectedReason === 'unsupportedProtocol'
      ) return false;
      currentReason = null;
      return true;
    },
    captureFence(options) {
      captureFenceCalls.push(options);
      return { marker: 'preserved-capture', fence: { isCurrent: () => true } };
    },
    setReason(nextReason) { currentReason = nextReason; },
    setPending(nextPending) { currentPending = nextPending; },
    captureFenceCalls,
  };
}

function harness({
  session = createSession(),
  refreshRunwayState = async () => {},
  reviewAuthoritativeState = async () => {},
  reauthenticate = async () => false,
  claimReauthentication,
  releaseReauthentication,
  adoptRecoveryState = async () => false,
  acknowledgeReauthentication,
  schedule,
  cancel,
} = {}) {
  const narrations = [];
  const actions = [];
  const toasts = [];
  const timers = [];
  const windowTarget = eventTarget();
  const documentTarget = eventTarget();
  const controller = createExploreSessionPauseController({
    getSession: () => session,
    refreshRunwayState,
    reviewAuthoritativeState,
    reauthenticate,
    claimReauthentication,
    releaseReauthentication,
    adoptRecoveryState,
    acknowledgeReauthentication,
    renderNarration: value => narrations.push(value),
    renderActions: value => actions.push(value),
    showToast: value => toasts.push(value),
    schedule: schedule || ((callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    }),
    cancel: cancel || (() => {}),
    windowTarget,
    documentTarget,
  });
  return { controller, session, narrations, actions, toasts, timers, windowTarget, documentTarget };
}

describe('Explore session pause controller', () => {
  it('coalesces auth pause, online, and visibility through one supplied capture', async () => {
    const session = createSession({ reason: 'authRequired', pending: 1 });
    const events = [];
    const owner = {};
    session.captureFence = options => {
      events.push(['capture', options]);
      return {
        sessionLease: owner,
        fence: {
          isCurrent: () => true,
          step: async (_label, operation) => operation(),
        },
      };
    };
    session.resolvePause = (reason, options) => {
      events.push(['resolve', reason, options]);
      session.setReason(null);
      return true;
    };
    session.syncNow = async options => { events.push(['drain', options]); };
    let authenticationCalls = 0;
    let adoptionCalls = 0;
    const { controller, windowTarget, documentTarget, actions } = harness({
      session,
      reauthenticate: async () => { authenticationCalls += 1; return true; },
      adoptRecoveryState: async ({ capture }) => {
        adoptionCalls += 1;
        events.push(['adopt', capture]);
        return true;
      },
    });

    controller.handlePause({ reason: 'authRequired' });
    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    await controller.triggerRecovery();

    assert.equal(authenticationCalls, 1);
    assert.equal(adoptionCalls, 1);
    assert.equal(events.filter(([kind]) => kind === 'capture').length, 1);
    assert.equal(events.find(([kind]) => kind === 'adopt')[1].sessionLease, owner);
    assert.deepEqual(events.find(([kind]) => kind === 'resolve').slice(1), ['authRequired', { owner }]);
    assert.deepEqual(events.find(([kind]) => kind === 'drain').slice(1), [{ owner }]);
    assert.deepEqual(actions, [], 'authentication owns the action area');
    controller.dispose();
  });

  it('does not acknowledge a repeat owned 401 and redelivers once after the finishing flow clears', async () => {
    const session = createSession({ reason: 'authRequired', pending: 1 });
    const owner = {};
    session.captureFence = () => ({
      session,
      sessionLease: owner,
      fence: {
        isCurrent: () => true,
        step: async (_label, operation) => operation(),
      },
    });
    session.resolvePause = (reason, { owner: suppliedOwner } = {}) => {
      assert.equal(reason, 'authRequired');
      assert.equal(suppliedOwner, owner);
      session.setReason(null);
      return true;
    };

    let controller;
    let authenticationCalls = 0;
    let adoptionCalls = 0;
    let drainCalls = 0;
    let acknowledgements = 0;
    let activeClaim = null;
    let claimCount = 0;
    let releaseCount = 0;
    const acknowledgedClaims = [];
    ({ controller } = harness({
      session,
      reauthenticate: async () => { authenticationCalls += 1; return true; },
      claimReauthentication: async () => {
        assert.equal(activeClaim, null);
        claimCount += 1;
        activeClaim = { claimCount };
        return activeClaim;
      },
      releaseReauthentication: claim => {
        assert.equal(claim, activeClaim);
        activeClaim = null;
        releaseCount += 1;
        return true;
      },
      adoptRecoveryState: async () => { adoptionCalls += 1; return true; },
      acknowledgeReauthentication: claim => {
        assert.equal(claim, activeClaim);
        acknowledgedClaims.push(claim);
        activeClaim = null;
        acknowledgements += 1;
        return true;
      },
    }));
    session.syncNow = async ({ owner: suppliedOwner } = {}) => {
      assert.equal(suppliedOwner, owner);
      drainCalls += 1;
      if (drainCalls === 1) {
        session.setReason('authRequired');
        controller.handlePause({ reason: 'authRequired' });
        return;
      }
      session.setReason(null);
    };

    await controller.triggerRecovery();
    await waitFor(() => drainCalls === 2 && acknowledgements === 1);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(authenticationCalls, 2);
    assert.equal(adoptionCalls, 2);
    assert.equal(drainCalls, 2, 'the repeat redelivery gets one fresh coalesced attempt, not a tight loop');
    assert.equal(acknowledgements, 1, 'the repeat 401 did not consume the completed login');
    assert.equal(claimCount, 2, 'the released completed-login handoff is claimed once per owned recovery');
    assert.equal(releaseCount, 1, 'the first repeat-401 claim is released, not acknowledged');
    assert.deepEqual(acknowledgedClaims, [{ claimCount: 2 }]);
    assert.equal(session.getPauseReason(), null);
    controller.dispose();
  });

  it('passes a completed login handoff from a stale replaced session to its successor without a second prompt', async () => {
    let activeSession;
    const adoptions = [];
    const renders = [];
    const login = deferred();
    let permitAvailable = false;
    let activeClaim = null;
    let promptCalls = 0;
    let acknowledgements = 0;

    function makeSession(name) {
      const owner = { name };
      let reason = 'authRequired';
      const session = {
        name,
        getPauseReason: () => reason,
        pendingCount: () => 1,
        pause: nextReason => {
          reason = nextReason;
          return true;
        },
        captureFence: () => ({
          session,
          sessionLease: owner,
          fence: {
            isCurrent: () => activeSession === session,
            async step(label, operation) {
              if (activeSession !== session) throw new FenceSuperseded(label, 'active Explore session');
              const result = await operation();
              if (activeSession !== session) throw new FenceSuperseded(label, 'active Explore session');
              return result;
            },
          },
        }),
        resolvePause: (expectedReason, { owner: suppliedOwner } = {}) => {
          assert.equal(expectedReason, 'authRequired');
          assert.equal(suppliedOwner, owner);
          reason = null;
          return true;
        },
        syncNow: async ({ owner: suppliedOwner } = {}) => {
          assert.equal(suppliedOwner, owner);
          session.drains += 1;
        },
        drains: 0,
      };
      return session;
    }

    const sessionA = makeSession('A');
    const sessionB = makeSession('B');
    const sessionC = makeSession('C');
    activeSession = sessionA;
    const controller = createExploreSessionPauseController({
      getSession: () => activeSession,
      reauthenticate: () => {
        if (permitAvailable) return Promise.resolve(true);
        promptCalls += 1;
        return login.promise;
      },
      claimReauthentication: async () => {
        if (!permitAvailable || activeClaim) return null;
        activeClaim = {};
        return activeClaim;
      },
      releaseReauthentication: claim => {
        if (claim !== activeClaim) return false;
        activeClaim = null;
        return true;
      },
      acknowledgeReauthentication: claim => {
        if (claim !== activeClaim) return false;
        permitAvailable = false;
        activeClaim = null;
        acknowledgements += 1;
        return true;
      },
      adoptRecoveryState: async ({ capture }) => {
        adoptions.push(capture.session.name);
        return true;
      },
      renderNarration: value => renders.push(value),
      renderActions: value => renders.push(value),
      showToast: value => renders.push(value),
      schedule: () => 0,
      cancel: () => {},
      windowTarget: eventTarget(),
      documentTarget: eventTarget(),
    });

    const staleRecovery = controller.triggerRecovery();
    await waitFor(() => promptCalls === 1);
    activeSession = sessionB;
    permitAvailable = true;
    login.resolve(true);

    await staleRecovery;
    await waitFor(() => sessionB.drains === 1 && acknowledgements === 1);

    assert.deepEqual(adoptions, ['B']);
    assert.equal(sessionA.drains, 0);
    assert.equal(promptCalls, 1, 'B consumes the completed same-account login instead of reopening auth');
    assert.deepEqual(renders, [], 'stale A did not repaint any successor UI');

    activeSession = sessionC;
    void controller.triggerRecovery();
    await waitFor(() => promptCalls === 2);
    controller.dispose();
  });

  it('retries a same-session preserve-fence supersession after login without a second prompt', async () => {
    let revision = 0;
    let reason = 'authRequired';
    let latestCapture = null;
    let captureCount = 0;
    const captures = [];
    const adoptions = [];
    const resolutions = [];
    const drains = [];
    const login = deferred();
    let permitAvailable = false;
    let activeClaim = null;
    let promptCalls = 0;
    let authenticationCalls = 0;
    let acknowledgements = 0;

    const session = {
      getPauseReason: () => reason,
      isPaused: () => reason != null,
      pendingCount: () => 1,
      pause(nextReason) {
        if (reason === nextReason) return false;
        reason = nextReason;
        revision += 1;
        return true;
      },
      captureFence({ pending, leases } = {}) {
        assert.equal(pending, 'preserve');
        assert.equal(typeof leases?.[0]?.isCurrent, 'function');
        const captureRevision = revision;
        let leaseRevision = captureRevision;
        const sessionLease = Object.freeze({ capture: ++captureCount });
        const isCurrent = () => revision === leaseRevision && leases[0].isCurrent();
        const capture = {
          session,
          sessionLease,
          fence: {
            isCurrent,
            async step(label, operation) {
              if (!isCurrent()) throw new FenceSuperseded(label, 'same Explore session');
              const result = await operation();
              if (!isCurrent()) throw new FenceSuperseded(label, 'same Explore session');
              return result;
            },
          },
          advance() { leaseRevision = revision; },
        };
        captures.push(capture);
        latestCapture = capture;
        return capture;
      },
      resolvePause(expectedReason, { owner } = {}) {
        if (
          reason !== expectedReason
          || owner !== latestCapture?.sessionLease
          || !latestCapture.fence.isCurrent()
        ) return false;
        reason = null;
        revision += 1;
        latestCapture.advance();
        resolutions.push(owner);
        return true;
      },
      async syncNow({ owner } = {}) {
        if (owner !== latestCapture?.sessionLease || !latestCapture.fence.isCurrent()) {
          throw new FenceSuperseded('redeliver same Explore session', 'same Explore session');
        }
        drains.push(owner);
        revision += 1;
        latestCapture.advance();
      },
      supersedePreserveFence() { revision += 1; },
    };

    const { controller, narrations, actions, toasts } = harness({
      session,
      reauthenticate: () => {
        authenticationCalls += 1;
        if (permitAvailable) return Promise.resolve(true);
        promptCalls += 1;
        return login.promise;
      },
      claimReauthentication: async () => {
        if (!permitAvailable || activeClaim) return null;
        activeClaim = Object.freeze({});
        return activeClaim;
      },
      releaseReauthentication: claim => {
        if (claim !== activeClaim) return false;
        activeClaim = null;
        return true;
      },
      acknowledgeReauthentication: claim => {
        if (claim !== activeClaim) return false;
        permitAvailable = false;
        activeClaim = null;
        acknowledgements += 1;
        return true;
      },
      adoptRecoveryState: async ({ capture }) => {
        adoptions.push(capture.sessionLease);
        return true;
      },
    });

    controller.handlePause({ reason: 'authRequired' });
    await waitFor(() => promptCalls === 1);
    const staleCapture = captures[0];
    session.supersedePreserveFence();
    permitAvailable = true;
    login.resolve(true);

    await waitFor(() => drains.length === 1 && acknowledgements === 1);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(captureCount, 2, 'the same live session was captured again after its stale login');
    assert.equal(staleCapture.fence.isCurrent(), false);
    assert.deepEqual(adoptions, [captures[1].sessionLease], 'the stale capture never adopts state');
    assert.deepEqual(resolutions, [captures[1].sessionLease], 'only the fresh capture resolves auth');
    assert.deepEqual(drains, [captures[1].sessionLease], 'only the fresh capture redelivers pending work');
    assert.equal(authenticationCalls, 2);
    assert.equal(promptCalls, 1, 'the completed login is retained for the fresh same-session recovery');
    assert.equal(reason, null);
    assert.deepEqual(narrations, []);
    assert.deepEqual(actions, []);
    assert.deepEqual(toasts, []);
    controller.dispose();
  });

  it('rethrows a fence contract violation instead of treating it as a recoverable stale flow', async () => {
    const session = createSession({ reason: 'authRequired', pending: 1 });
    session.captureFence = () => ({
      sessionLease: {},
      fence: {
        isCurrent: () => true,
        step: async (_label, operation) => operation(),
      },
    });
    const { controller } = harness({
      session,
      reauthenticate: async () => {
        throw new FenceContractViolation('reauthentication ownership contract failed');
      },
    });

    await assert.rejects(
      controller.triggerRecovery(),
      FenceContractViolation,
    );
    controller.dispose();
  });

  it('does not mutate a successor or acknowledge when disposed at every auth await boundary', async () => {
    for (const boundary of ['login', 'adoption', 'post-resolve yield', 'drain']) {
      let controller;
      let reason = 'authRequired';
      let loginStarted = false;
      let adoptionStarted = false;
      let drainStarted = false;
      let resolves = 0;
      let adoptions = 0;
      let drains = 0;
      let acknowledgements = 0;
      const login = deferred();
      const adoption = deferred();
      const drain = deferred();
      const owner = {};
      const session = {
        getPauseReason: () => reason,
        isPaused: () => reason != null,
        pendingCount: () => 1,
        pause: nextReason => { reason = nextReason; return true; },
        captureFence: () => ({
          sessionLease: owner,
          fence: {
            isCurrent: () => true,
            step: async (_label, operation) => operation(),
          },
        }),
        resolvePause: (_reason, { owner: suppliedOwner } = {}) => {
          assert.equal(suppliedOwner, owner);
          resolves += 1;
          reason = null;
          if (boundary === 'post-resolve yield') queueMicrotask(() => controller.dispose());
          return true;
        },
        syncNow: async ({ owner: suppliedOwner } = {}) => {
          assert.equal(suppliedOwner, owner);
          drains += 1;
          if (boundary === 'drain') {
            drainStarted = true;
            await drain.promise;
          }
        },
      };
      controller = createExploreSessionPauseController({
        getSession: () => session,
        reauthenticate: async () => {
          loginStarted = true;
          if (boundary === 'login') return login.promise;
          return true;
        },
        adoptRecoveryState: async () => {
          adoptions += 1;
          adoptionStarted = true;
          if (boundary === 'adoption') return adoption.promise;
          return true;
        },
        acknowledgeReauthentication: () => { acknowledgements += 1; },
        schedule: () => 0,
        cancel: () => {},
        windowTarget: eventTarget(),
        documentTarget: eventTarget(),
      });

      const recovery = controller.triggerRecovery();
      if (boundary === 'login') {
        await waitFor(() => loginStarted);
        controller.dispose();
        login.resolve(true);
      } else if (boundary === 'adoption') {
        await waitFor(() => adoptionStarted);
        controller.dispose();
        adoption.resolve(true);
      } else if (boundary === 'drain') {
        await waitFor(() => drainStarted);
        controller.dispose();
        drain.resolve();
      }
      await recovery;

      assert.equal(acknowledgements, 0, `${boundary}: stale work never acknowledges a login handoff`);
      if (boundary === 'login') {
        assert.equal(adoptions, 0, 'login disposal blocks adoption');
        assert.equal(resolves, 0, 'login disposal blocks pause resolution');
        assert.equal(drains, 0, 'login disposal blocks redelivery');
      }
      if (boundary === 'adoption') {
        assert.equal(resolves, 0, 'adoption disposal blocks pause resolution');
        assert.equal(drains, 0, 'adoption disposal blocks redelivery');
      }
      if (boundary === 'post-resolve yield') {
        assert.equal(resolves, 1, 'the pause was resolved before this controllable yield');
        assert.equal(drains, 0, 'yield disposal blocks redelivery');
      }
      if (boundary === 'drain') {
        assert.equal(drains, 1, 'the owned drain began before disposal');
      }
    }
  });

  it('only transport, unsupported protocol, and writer conflict replace actions', () => {
    const matrix = [
      ['transportDegraded', 1, 1],
      ['unsupportedProtocol', 1, 1],
      ['writerConflict', 1, 1],
      ['authRequired', 1, 0],
      ['syncPending', 1, 0],
      ['nextRoomNotReady', 0, 0],
    ];

    for (const [reason, pending, expectedActionCalls] of matrix) {
      const { controller, actions, narrations } = harness({ session: createSession({ reason, pending }) });
      controller.handlePause();
      assert.equal(actions.length, expectedActionCalls, reason);
      if (reason === 'unsupportedProtocol') {
        assert.deepEqual(actions[0], { message: 'A newer version of Koto is required to continue this run.', actions: [] });
      }
      if (reason === 'transportDegraded') assert.equal(actions[0].actions[0].label, 'Retry');
      if (reason === 'writerConflict') {
        assert.deepEqual(actions[0].actions.map(action => action.label), ['Review latest progress', 'Keep paused']);
      }
      if (reason === 'syncPending') assert.equal(narrations.at(-1), 'Syncing your progress. Please wait…');
      if (reason === 'nextRoomNotReady') assert.equal(narrations.at(-1), 'Preparing the next room. Please wait…');
      controller.dispose();
    }
  });

  it('re-reads the authoritative pause reason after a stale caller attempts a lower pause', () => {
    const session = createSession({ reason: 'authRequired', pending: 1 });
    const { controller, actions, narrations } = harness({ session });

    controller.handlePause({ reason: 'nextRoomNotReady' });

    assert.equal(session.getPauseReason(), 'authRequired');
    assert.equal(actions.length, 0);
    assert.equal(narrations.length, 0);
    controller.dispose();
  });

  it('lets a higher-priority attempted pause escalate once before rendering', () => {
    const session = createSession({ reason: 'nextRoomNotReady', pending: 1 });
    const { controller, actions, narrations } = harness({ session });

    controller.handlePause({ reason: 'authRequired' });

    assert.equal(session.getPauseReason(), 'authRequired');
    assert.equal(actions.length, 0);
    assert.equal(narrations.length, 0);
    controller.dispose();
  });

  it('attempts missingPayload when a pause caller supplies no reason', () => {
    const session = createSession({ pending: 1 });
    const { controller, narrations } = harness({ session });

    controller.handlePause();

    assert.equal(session.getPauseReason(), 'missingPayload');
    assert.equal(narrations.at(-1), 'Syncing your progress. Please wait…');
    controller.dispose();
  });

  it('reviews writer progress with the supplied preserved capture without reposting or resuming', async () => {
    const session = createSession({ reason: 'writerConflict', pending: 2 });
    const captures = [];
    const { controller, actions } = harness({
      session,
      reviewAuthoritativeState: async ({ capture }) => { captures.push(capture); return true; },
    });

    controller.handlePause();
    await actions[0].actions[0].onClick();

    assert.equal(session.captureFenceCalls[0].pending, 'preserve');
    assert.equal(typeof session.captureFenceCalls[0].leases[0].isCurrent, 'function');
    assert.equal(captures.length, 1);
    assert.equal(captures[0].marker, 'preserved-capture');
    assert.equal(typeof captures[0].fence.isCurrent, 'function');
    assert.equal(session.pendingCount(), 2);
    assert.equal(session.getPauseReason(), 'writerConflict');
    controller.dispose();
  });

  it('coalesces writer review clicks and suppresses a same-session superseded completion', async () => {
    const review = deferred();
    let captureCurrent = true;
    let reviewCalls = 0;
    const session = createSession({ reason: 'writerConflict', pending: 1 });
    session.captureFence = () => ({ fence: { isCurrent: () => captureCurrent } });
    const { controller, actions, toasts } = harness({
      session,
      reviewAuthoritativeState: async () => { reviewCalls += 1; return review.promise; },
    });

    controller.handlePause();
    const reviewAction = actions[0].actions[0];
    const firstClick = reviewAction.onClick();
    const secondClick = reviewAction.onClick();
    assert.equal(reviewCalls, 1);

    captureCurrent = false;
    review.resolve(true);
    await Promise.all([firstClick, secondClick]);

    assert.equal(actions.length, 1);
    assert.deepEqual(toasts, []);
    controller.dispose();
  });

  it('leaves writer conflict signals inert and keeps review choices after a review failure', async () => {
    const session = createSession({ reason: 'writerConflict', pending: 1 });
    let refreshes = 0;
    const { controller, actions, toasts, windowTarget, documentTarget } = harness({
      session,
      refreshRunwayState: async () => { refreshes += 1; },
      reviewAuthoritativeState: async () => { throw new Error('offline'); },
    });
    controller.handlePause();
    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    await actions[0].actions[0].onClick();

    assert.equal(refreshes, 0);
    assert.equal(toasts.length, 1);
    assert.equal(actions.at(-1).actions[0].label, 'Review latest progress');
    controller.dispose();
  });

  it('resolves an exact empty runway pause only after its refresh has installed authoritative state', async () => {
    const events = [];
    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    const resolvePause = session.resolvePause;
    session.resolvePause = reason => {
      events.push('resume/UI');
      return resolvePause(reason);
    };
    const { controller } = harness({
      session,
      refreshRunwayState: async () => {
        events.push('adopt/state');
        return true;
      },
    });

    await controller.triggerRecovery();

    assert.deepEqual(events, ['adopt/state', 'resume/UI']);
    assert.equal(session.isPaused(), false);
    controller.dispose();
  });

  it('does not retry, render, or resolve when refresh promotes an empty pause to auth', async () => {
    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    const { controller, timers, narrations, actions } = harness({
      session,
      refreshRunwayState: async () => {
        session.setReason('authRequired');
        throw new Error('auth took ownership');
      },
    });

    await controller.triggerRecovery();

    assert.equal(session.getPauseReason(), 'authRequired');
    assert.deepEqual(timers, []);
    assert.deepEqual(narrations, []);
    assert.deepEqual(actions, []);
    controller.dispose();
  });

  it('does not resolve, render, or retry after a same-session capture is superseded during refresh', async () => {
    let captureCurrent = true;
    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    session.captureFence = () => ({ fence: { isCurrent: () => captureCurrent } });
    const { controller, timers, narrations, actions } = harness({
      session,
      refreshRunwayState: async () => {
        captureCurrent = false;
        return true;
      },
    });

    await controller.triggerRecovery();

    assert.equal(session.getPauseReason(), 'nextRoomNotReady');
    assert.deepEqual(timers, []);
    assert.deepEqual(narrations, []);
    assert.deepEqual(actions, []);
    controller.dispose();
  });

  it('uses no controller timer for pending work and ratchets empty-runway refresh delays through the cap', async () => {
    const pending = harness({ session: createSession({ reason: 'transportDegraded', pending: 1 }) });
    pending.controller.handlePause();
    pending.windowTarget.dispatch('online');
    await Promise.resolve();
    assert.equal(pending.timers.length, 0);
    pending.controller.dispose();

    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    const empty = harness({ session, refreshRunwayState: async () => {} });
    empty.controller.handlePause();
    const delays = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      await empty.controller.triggerRecovery();
      const timer = empty.timers.shift();
      delays.push(timer.delay);
      await timer.callback();
    }
    assert.deepEqual(delays, [500, 1000, 2000, 4000, 8000, 15000, 15000]);
    empty.controller.dispose();
  });

  it('keeps an undefined timer handle armed so a second recovery cannot duplicate it', async () => {
    const scheduled = [];
    const { controller } = harness({
      session: createSession({ reason: 'nextRoomNotReady', pending: 0 }),
      refreshRunwayState: async () => {},
      schedule: (callback, delay) => { scheduled.push({ callback, delay }); },
    });

    await controller.triggerRecovery();
    await controller.triggerRecovery();

    assert.deepEqual(scheduled.map(item => item.delay), [500]);
    controller.dispose();
  });

  it('coalesces signal recovery, removes exact listeners, cancels an armed timer, and ignores stale completion after disposal', async () => {
    const cancels = [];
    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    let refreshCalls = 0;
    const { controller, timers, windowTarget, documentTarget, narrations } = harness({
      session,
      refreshRunwayState: async () => { refreshCalls += 1; },
      cancel: timer => cancels.push(timer),
    });

    assert.equal(windowTarget.listeners.get('online').length, 1);
    assert.equal(documentTarget.listeners.get('visibilitychange').length, 1);
    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    await controller.triggerRecovery();
    assert.equal(refreshCalls, 1);
    assert.equal(timers.length, 1);
    const armedTimer = timers[0];
    const narrationCountBeforeDispose = narrations.length;
    controller.dispose();
    await armedTimer.callback();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(windowTarget.listeners.get('online').length, 0);
    assert.equal(documentTarget.listeners.get('visibilitychange').length, 0);
    assert.equal(timers.length, 1);
    assert.deepEqual(cancels, [armedTimer]);
    assert.equal(refreshCalls, 1);
    assert.equal(narrations.length, narrationCountBeforeDispose);
  });

  it('ignores a real in-flight refresh completion after disposal', async () => {
    const refresh = deferred();
    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    const { controller, timers, narrations, actions } = harness({
      session,
      refreshRunwayState: async () => refresh.promise,
    });

    const recovery = controller.triggerRecovery();
    await Promise.resolve();
    controller.dispose();
    refresh.resolve(true);
    await recovery;

    assert.equal(session.getPauseReason(), 'nextRoomNotReady');
    assert.deepEqual(timers, []);
    assert.deepEqual(narrations, []);
    assert.deepEqual(actions, []);
  });
});
