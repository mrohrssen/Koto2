import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createExploreSessionPauseController } from '../../../public/js/ui/explore-session-pause-controller.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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
    captureFence(options) {
      captureFenceCalls.push(options);
      return { marker: 'preserved-capture' };
    },
    setReason(nextReason) { currentReason = nextReason; },
    setPending(nextPending) { currentPending = nextPending; },
    captureFenceCalls,
  };
}

function harness({ session = createSession(), refreshRunwayState = async () => {}, reviewAuthoritativeState = async () => {}, schedule, cancel } = {}) {
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
    assert.deepEqual(captures, [{ marker: 'preserved-capture' }]);
    assert.equal(session.pendingCount(), 2);
    assert.equal(session.getPauseReason(), 'writerConflict');
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

  it('uses no controller timer for pending work and ratchets empty-runway refresh delays', async () => {
    const pending = harness({ session: createSession({ reason: 'transportDegraded', pending: 1 }) });
    pending.controller.handlePause();
    pending.windowTarget.dispatch('online');
    await Promise.resolve();
    assert.equal(pending.timers.length, 0);
    pending.controller.dispose();

    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    const empty = harness({ session, refreshRunwayState: async () => {} });
    empty.controller.handlePause();
    await empty.controller.triggerRecovery();
    assert.equal(empty.timers[0].delay, 500);
    await empty.timers.shift().callback();
    assert.equal(empty.timers[0].delay, 1000);
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

  it('coalesces signal recovery, removes exact listeners, cancels timers, and ignores stale completion after disposal', async () => {
    const refresh = deferred();
    const cancels = [];
    const session = createSession({ reason: 'nextRoomNotReady', pending: 0 });
    let refreshCalls = 0;
    const { controller, timers, windowTarget, documentTarget, narrations } = harness({
      session,
      refreshRunwayState: async () => { refreshCalls += 1; await refresh.promise; },
      cancel: timer => cancels.push(timer),
    });

    assert.equal(windowTarget.listeners.get('online').length, 1);
    assert.equal(documentTarget.listeners.get('visibilitychange').length, 1);
    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    assert.equal(refreshCalls, 1);
    controller.dispose();
    refresh.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(windowTarget.listeners.get('online').length, 0);
    assert.equal(documentTarget.listeners.get('visibilitychange').length, 0);
    assert.equal(timers.length, 0);
    assert.deepEqual(cancels, []);
    assert.equal(narrations.length, 0);
  });
});
