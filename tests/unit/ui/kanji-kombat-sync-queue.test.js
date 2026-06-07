import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureKanjiKombatSyncQueue,
  createKanjiKombatSyncQueue,
  getKanjiKombatSyncQueue,
  REVIEW_SYNC_QUEUE_HARD_LIMIT,
  REVIEW_SYNC_QUEUE_RESUME_LIMIT,
  REVIEW_SYNC_QUEUE_SOFT_LIMIT,
  REVIEW_SYNC_RETRY_DELAYS_MS,
  resetKanjiKombatSyncQueue,
} from '../../../public/js/ui/kanji-kombat-sync-queue.js';

function createManualScheduler() {
  const scheduled = [];
  return {
    scheduled,
    schedule(fn, delay) {
      scheduled.push({ fn, delay });
      return scheduled.length;
    },
    cancel() {},
    async runNext() {
      const next = scheduled.shift();
      assert.ok(next, 'expected a scheduled retry');
      next.fn();
      await Promise.resolve();
      await Promise.resolve();
      return next.delay;
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForCondition(predicate, message, maxTicks = 250) {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.ok(predicate(), message);
}

describe('kanji-kombat sync queue', () => {
  it('tracks soft, hard, and resume limits as pause state transitions', async () => {
    const headSync = createDeferred();
    const pauses = [];
    const resumes = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: item => {
        if (item.actionId === 'run_0') return headSync.promise;
        return Promise.resolve({ status: 'accepted', actionId: item.actionId });
      },
      onPause: state => pauses.push(state),
      onResume: state => resumes.push(state),
    });

    assert.equal(REVIEW_SYNC_QUEUE_SOFT_LIMIT, 40);
    assert.equal(REVIEW_SYNC_QUEUE_HARD_LIMIT, 60);
    assert.equal(REVIEW_SYNC_QUEUE_RESUME_LIMIT, 30);

    for (let i = 0; i < REVIEW_SYNC_QUEUE_HARD_LIMIT; i++) {
      assert.equal(queue.enqueue({ actionId: `run_${i}`, kind: 'intro', promptId: `kkp_${i}` }).accepted, true);
    }

    assert.equal(queue.pendingCount(), REVIEW_SYNC_QUEUE_HARD_LIMIT);
    assert.equal(queue.isAtHardLimit(), true);
    assert.equal(queue.canConsumePrompt(), false);
    assert.deepEqual(pauses, [{ pendingCount: REVIEW_SYNC_QUEUE_HARD_LIMIT, reason: 'hardLimit' }]);

    assert.deepEqual(
      queue.enqueue({ actionId: 'run_blocked', kind: 'intro', promptId: 'kkp_blocked' }),
      { accepted: false, pendingCount: REVIEW_SYNC_QUEUE_HARD_LIMIT, hardLimit: true },
    );
    assert.equal(queue.enqueue({ actionId: 'run_blocked_2', kind: 'intro', promptId: 'kkp_blocked_2' }).accepted, false);
    assert.equal(pauses.length, 1);

    headSync.resolve({ status: 'accepted', actionId: 'run_0' });
    await waitForCondition(
      () => queue.pendingCount() <= REVIEW_SYNC_QUEUE_RESUME_LIMIT,
      'expected the queue to drain to the resume limit',
    );

    assert.deepEqual(resumes, [{ pendingCount: REVIEW_SYNC_QUEUE_RESUME_LIMIT }]);
  });

  it('drains one head item at a time and immediately drains the next accepted item', async () => {
    const calls = [];
    const accepted = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: async item => {
        calls.push(item.actionId);
        return { status: 'accepted', actionId: item.actionId };
      },
      onAccepted: (item, result) => accepted.push([item.actionId, result.status]),
    });

    queue.enqueue({ actionId: 'run_a', kind: 'intro', promptId: 'kkp_a' });
    queue.enqueue({ actionId: 'run_b', kind: 'intro', promptId: 'kkp_b' });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(calls, ['run_a', 'run_b']);
    assert.deepEqual(accepted, [['run_a', 'accepted'], ['run_b', 'accepted']]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('can drain externally enqueued quiz items through the same ordered queue', async () => {
    const calls = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: async item => {
        calls.push([item.kind, item.actionId, item.envelope?.actionType]);
        return { status: 'accepted', actionId: item.actionId };
      },
    });

    queue.enqueue({
      actionId: 'run_quiz',
      kind: 'quiz',
      promptId: 'kkp_quiz',
      envelope: { actionType: 'kanjiKombat.answer' },
    });

    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(calls, [['quiz', 'run_quiz', 'kanjiKombat.answer']]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('keeps a failed head item and retries with configured backoff', async () => {
    const scheduler = createManualScheduler();
    let attempts = 0;
    const queue = createKanjiKombatSyncQueue({
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      syncItem: async item => {
        attempts += 1;
        if (attempts < 3) throw new Error(`network-${attempts}`);
        return { status: 'accepted', actionId: item.actionId };
      },
    });

    queue.enqueue({ actionId: 'run_retry', kind: 'intro', promptId: 'kkp_retry' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(queue.pendingCount(), 1);
    assert.equal(scheduler.scheduled[0].delay, REVIEW_SYNC_RETRY_DELAYS_MS[0]);

    const firstDelay = await scheduler.runNext();
    assert.equal(firstDelay, REVIEW_SYNC_RETRY_DELAYS_MS[0]);
    assert.equal(scheduler.scheduled[0].delay, REVIEW_SYNC_RETRY_DELAYS_MS[1]);

    const secondDelay = await scheduler.runNext();
    assert.equal(secondDelay, REVIEW_SYNC_RETRY_DELAYS_MS[1]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('drainNow clears retry delay and immediately attempts the head item', async () => {
    const scheduler = createManualScheduler();
    let attempts = 0;
    let cancelCount = 0;
    const queue = createKanjiKombatSyncQueue({
      schedule: scheduler.schedule,
      cancel: timerId => {
        cancelCount += 1;
        scheduler.cancel(timerId);
      },
      syncItem: async item => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return { status: 'accepted', actionId: item.actionId };
      },
    });

    queue.enqueue({ actionId: 'run_online', kind: 'intro', promptId: 'kkp_online' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(queue.pendingCount(), 1);

    queue.drainNow();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(cancelCount, 1);
    assert.equal(queue.pendingCount(), 0);
  });

  it('treats corrected responses as resolved and calls onCorrected', async () => {
    const corrected = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: async item => ({ status: 'corrected', actionId: item.actionId, reason: 'prompt_mismatch' }),
      onCorrected: (item, result) => corrected.push([item.actionId, result.reason]),
    });

    queue.enqueue({ actionId: 'run_corrected', kind: 'quiz', promptId: 'kkp_corrected' });
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(corrected, [['run_corrected', 'prompt_mismatch']]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('exposes a shared configured queue for Kanji Kombat and combat-loop modules', () => {
    resetKanjiKombatSyncQueue();
    assert.equal(getKanjiKombatSyncQueue(), null);

    const queue = configureKanjiKombatSyncQueue({
      syncItem: async () => ({ status: 'accepted' }),
    });

    assert.equal(getKanjiKombatSyncQueue(), queue);
    resetKanjiKombatSyncQueue();
    assert.equal(getKanjiKombatSyncQueue(), null);
  });

  it('resets queued items and cancels retry state', async () => {
    const scheduler = createManualScheduler();
    let cancelCount = 0;
    const queue = createKanjiKombatSyncQueue({
      schedule: scheduler.schedule,
      cancel: () => { cancelCount += 1; },
      syncItem: async () => {
        throw new Error('offline');
      },
    });

    queue.enqueue({ actionId: 'run_reset', kind: 'intro', promptId: 'kkp_reset' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(queue.pendingCount(), 1);

    queue.reset();
    assert.equal(queue.pendingCount(), 0);
    assert.equal(cancelCount, 1);
  });

  it('ignores stale in-flight sync results after reset', async () => {
    const oldSync = createDeferred();
    const newSync = createDeferred();
    const accepted = [];
    const failed = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: item => {
        if (item.actionId === 'run_old') return oldSync.promise;
        if (item.actionId === 'run_new') return newSync.promise;
        throw new Error(`unexpected sync item ${item.actionId}`);
      },
      onAccepted: item => accepted.push(item.actionId),
      onFailed: item => failed.push(item.actionId),
    });

    queue.enqueue({ actionId: 'run_old', kind: 'intro', promptId: 'kkp_old' });
    queue.reset();
    queue.enqueue({ actionId: 'run_new', kind: 'quiz', promptId: 'kkp_new' });

    oldSync.resolve({ status: 'accepted', actionId: 'run_old' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(queue.pendingCount(), 1);
    assert.deepEqual(queue.snapshot().map(item => item.actionId), ['run_new']);
    assert.deepEqual(accepted, []);
    assert.deepEqual(failed, []);

    newSync.resolve({ status: 'accepted', actionId: 'run_new' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(queue.pendingCount(), 0);
    assert.deepEqual(accepted, ['run_new']);
    assert.deepEqual(failed, []);
  });

  it('does not retry an accepted item when accepted callback throws', async () => {
    const scheduler = createManualScheduler();
    const callbackErrors = [];
    const originalConsoleError = console.error;
    console.error = (...args) => callbackErrors.push(args);

    try {
      const failed = [];
      const queue = createKanjiKombatSyncQueue({
        schedule: scheduler.schedule,
        cancel: scheduler.cancel,
        syncItem: async item => ({ status: 'accepted', actionId: item.actionId }),
        onAccepted: () => {
          throw new Error('callback failed');
        },
        onFailed: item => failed.push(item.actionId),
      });

      queue.enqueue({ actionId: 'run_callback', kind: 'quiz', promptId: 'kkp_callback' });
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(queue.pendingCount(), 0);
      assert.deepEqual(failed, []);
      assert.deepEqual(scheduler.scheduled, []);
      assert.equal(callbackErrors.length, 1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
