import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKanjiKombatSession,
  configureKanjiKombatSession,
  getKanjiKombatSession,
  resetKanjiKombatSession,
  KK_SESSION_HARD_CAP,
  KK_SESSION_RESUME_AT,
  KK_SYNC_RETRY_DELAYS_MS,
} from '../../../public/js/ui/kanji-kombat-session.js';

function makeManualScheduler() {
  const timers = [];
  return {
    schedule: (fn, delay) => { timers.push({ fn, delay }); return timers.length - 1; },
    cancel: id => { if (timers[id]) timers[id].fn = null; },
    fire: async () => {
      const pending = timers.splice(0);
      for (const t of pending) if (t.fn) await t.fn();
    },
    delays: () => timers.map(t => t.delay),
  };
}

function okResponse(confirmedThroughSeq, overrides = {}) {
  return { status: 'ok', confirmedThroughSeq, results: [], ...overrides };
}

test('recordAction batches rapid entries into one sync request', async () => {
  const calls = [];
  const scheduler = makeManualScheduler();
  const session = createKanjiKombatSession({
    syncRequest: async payload => { calls.push(payload); return okResponse(payload.entries.at(-1).seq); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'intro', actionId: 'run_a1', cardId: 'hiragana:あ', choice: 'unknown' });
  session.recordAction({ kind: 'intro', actionId: 'run_a2', cardId: 'hiragana:い', choice: 'unknown' });
  await scheduler.fire(); // debounce fires once
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entries.length, 2);
  assert.deepEqual(calls[0].entries.map(e => e.seq), [1, 2]);
  assert.equal(session.pendingCount(), 0);
});

test('confirmed entries drop; unconfirmed remain and resync', async () => {
  const scheduler = makeManualScheduler();
  let respondWith = okResponse(1);
  const calls = [];
  const session = createKanjiKombatSession({
    syncRequest: async payload => { calls.push(payload); return respondWith; },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'intro', actionId: 'run_a1' });
  session.recordAction({ kind: 'intro', actionId: 'run_a2' });
  await scheduler.fire();
  assert.equal(session.pendingCount(), 1); // seq 2 unconfirmed
  respondWith = okResponse(2);
  await scheduler.fire(); // immediate follow-up drain
  assert.equal(session.pendingCount(), 0);
});

test('network failure retries with backoff and keeps the log', async () => {
  const scheduler = makeManualScheduler();
  let failures = 0;
  const session = createKanjiKombatSession({
    syncRequest: async () => { failures += 1; throw new Error('offline'); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  await scheduler.fire(); // debounce → first attempt fails
  assert.equal(session.pendingCount(), 1);
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[0]);
  await scheduler.fire(); // retry 1 fails
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[1]);
  assert.ok(failures >= 2);
});

test('hard cap pauses and resumes after draining below the resume mark', async () => {
  const scheduler = makeManualScheduler();
  let paused = 0;
  let resumed = 0;
  let allowSync = false;
  const session = createKanjiKombatSession({
    syncRequest: async payload => {
      if (!allowSync) throw new Error('offline');
      return okResponse(payload.entries.at(-1).seq);
    },
    onPause: () => { paused += 1; },
    onResume: () => { resumed += 1; },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  for (let i = 0; i < KK_SESSION_HARD_CAP; i++) {
    const result = session.recordAction({ kind: 'quiz', actionId: `run_q${i}` });
    assert.equal(result.accepted, true);
  }
  assert.equal(session.canConsumePrompt(), false);
  const rejected = session.recordAction({ kind: 'quiz', actionId: 'run_overflow' });
  assert.equal(rejected.accepted, false);
  assert.equal(paused, 1);
  allowSync = true;
  await scheduler.fire();
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0);
  assert.equal(resumed, 1);
});

test('corrected response clears the log and notifies', async () => {
  const scheduler = makeManualScheduler();
  let correction = null;
  const session = createKanjiKombatSession({
    syncRequest: async () => ({
      status: 'corrected',
      reason: 'transcript_mismatch',
      confirmedThroughSeq: 1,
      authoritativeState: { run: { kanjiKombat: { sessionEpoch: 'kse_new' } } },
    }),
    onCorrection: response => { correction = response; },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptServerState({ run: { kanjiKombat: { sessionEpoch: 'kse_old' } } });
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  session.recordAction({ kind: 'quiz', actionId: 'run_q2' });
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0);
  assert.equal(correction.reason, 'transcript_mismatch');
});

// Rewritten so the generation guard is actually load-bearing:
// Without it, the stale response would call onCheckpoint and filter the new entry
// (seq 1 again after reset), dropping it and corrupting observable state.
test('reset abandons in-flight responses', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const checkpointCalls = [];
  const session = createKanjiKombatSession({
    syncRequest: async () => { await gate; return okResponse(1); },
    onCheckpoint: (response) => { checkpointCalls.push(response); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  // Start an in-flight sync for the first generation (seq 1).
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  // Fire debounce to start the request; it blocks on the gate.
  const draining = scheduler.fire();

  // Reset bumps generation; log is cleared; new entries start at seq 1 again.
  session.reset();

  // Record a new entry (seq 1 in generation+1).
  session.recordAction({ kind: 'quiz', actionId: 'run_q2_after_reset' });
  assert.equal(session.pendingCount(), 1, 'new entry should be in log before gate release');

  // Release the gate so the stale syncRequest resolves with confirmedThroughSeq=1.
  release();

  // Await the drain promise and flush all remaining microtasks.
  await draining;
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  // The generation guard must prevent the stale response from processing.
  // Without the guard, the stale okResponse(1) would filter out seq 1 (the new entry)
  // and call onCheckpoint, dropping the new record and firing the callback.
  assert.equal(session.pendingCount(), 1, 'new entry must NOT be dropped by stale response');
  assert.equal(checkpointCalls.length, 0, 'onCheckpoint must NOT fire for stale response');
});

test('single-flight: no second request while one is in flight, surviving entry stays', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = [];
  const session = createKanjiKombatSession({
    syncRequest: async payload => { calls.push(payload); await gate; return okResponse(1); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  // Record entry 1, fire debounce — request is now in flight.
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  const draining = scheduler.fire(); // starts the gated request

  // Record entry 2 while the first request is still in flight.
  session.recordAction({ kind: 'quiz', actionId: 'run_q2' });

  // Calling drain() directly while syncing should be a no-op (single-flight guard).
  await session.drain();
  assert.equal(calls.length, 1, 'no second request should be issued while first is in flight');

  // Release the gate; first response confirms seq 1 only.
  release();
  await draining;
  // Flush microtasks so drain() resolves and the finally block runs.
  await Promise.resolve();
  await Promise.resolve();

  // Entry 2 (seq 2) must still be in the log — confirmed only through seq 1.
  // A follow-up scheduleDrain(0) was registered but we have NOT fired it yet.
  assert.equal(session.pendingCount(), 1, 'entry 2 survived: still pending after seq-1 confirmation');
  // During the in-flight phase entry 2 was unconfirmed.
  assert.equal(calls[0].entries.length, 1, 'first call only saw entry 1');
});

test('throwing onCheckpoint does not break the syncer', async () => {
  const scheduler = makeManualScheduler();
  const session = createKanjiKombatSession({
    syncRequest: async payload => okResponse(payload.entries.at(-1).seq),
    onCheckpoint: () => { throw new Error('checkpoint exploded'); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  // First sync cycle — onCheckpoint throws but sync must complete cleanly.
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0, 'log must be empty after first sync');

  // Second cycle — module must still work after a throwing callback.
  session.recordAction({ kind: 'quiz', actionId: 'run_q2' });
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0, 'log must be empty after second sync');
});

test('singleton lifecycle: configure / get / reset', async () => {
  const scheduler = makeManualScheduler();
  const calls = [];
  const session1 = configureKanjiKombatSession({
    syncRequest: async payload => { calls.push(1); return okResponse(payload.entries.at(-1).seq); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  assert.ok(session1, 'configureKanjiKombatSession returns a session');
  assert.equal(getKanjiKombatSession(), session1, 'getKanjiKombatSession returns the active session');

  session1.recordAction({ kind: 'quiz', actionId: 'run_q1' });

  // Configuring a second session must reset the first one.
  const scheduler2 = makeManualScheduler();
  const session2 = configureKanjiKombatSession({
    syncRequest: async payload => { calls.push(2); return okResponse(payload.entries.at(-1).seq); },
    schedule: scheduler2.schedule,
    cancel: scheduler2.cancel,
  });

  assert.notEqual(session1, session2, 'second configure returns a new session');
  assert.equal(getKanjiKombatSession(), session2, 'getKanjiKombatSession returns the new session');
  // session1 was reset: its pending entries should be gone.
  assert.equal(session1.pendingCount(), 0, 'prior session was reset on reconfigure');

  // resetKanjiKombatSession nulls the active session.
  resetKanjiKombatSession();
  assert.equal(getKanjiKombatSession(), null, 'getKanjiKombatSession returns null after reset');
});

test('full backoff ladder + attempts reset after success + syncNow resets attempts', async () => {
  const scheduler = makeManualScheduler();
  let shouldFail = true;
  const calls = [];
  const session = createKanjiKombatSession({
    syncRequest: async payload => {
      calls.push(payload);
      if (shouldFail) throw new Error('offline');
      return okResponse(payload.entries.at(-1).seq);
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });

  // Initial debounce fire — first attempt fails.
  await scheduler.fire();
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[0],
    'first retry delay should be delays[0]');

  // Walk every entry in KK_SYNC_RETRY_DELAYS_MS.
  for (let i = 1; i < KK_SYNC_RETRY_DELAYS_MS.length; i++) {
    await scheduler.fire(); // fires the retry, which fails again
    const expectedDelay = KK_SYNC_RETRY_DELAYS_MS[i];
    assert.equal(scheduler.delays()[0], expectedDelay,
      `retry ${i + 1} delay should be delays[${i}]`);
  }

  // One extra failure — should be capped at the last delay.
  await scheduler.fire();
  const lastDelay = KK_SYNC_RETRY_DELAYS_MS[KK_SYNC_RETRY_DELAYS_MS.length - 1];
  assert.equal(scheduler.delays()[0], lastDelay,
    'extra failure beyond ladder must cap at last delay');

  // Now succeed — attempts must reset.
  shouldFail = false;
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0, 'entry confirmed after success');

  // Add a new entry and verify that the next failure starts back at delays[0].
  shouldFail = true;
  session.recordAction({ kind: 'quiz', actionId: 'run_q2' });
  await scheduler.fire(); // debounce → fails
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[0],
    'after success, next failure must restart the backoff ladder at delays[0]');

  // syncNow while failing: it should reset attempts and schedule delay 0.
  // Drive a couple more failures first to advance the attempts counter.
  await scheduler.fire(); // retry 1 fails → delays[1]
  const beforeSyncNow = scheduler.delays()[0];
  assert.equal(beforeSyncNow, KK_SYNC_RETRY_DELAYS_MS[1],
    'before syncNow, delay should be delays[1]');

  session.syncNow(); // cancels retry, resets attempts, schedules drain(0)
  assert.equal(scheduler.delays().at(-1), 0,
    'syncNow should schedule a drain with delay 0');

  // The drain from syncNow fires and fails; the follow-up retry should be delays[0].
  await scheduler.fire();
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[0],
    'after syncNow-triggered failure, retry starts at delays[0]');
});

test('epoch adoption: authoritativeState sessionEpoch propagates into next sync payload', async () => {
  const scheduler = makeManualScheduler();
  const calls = [];
  let responseOverride = null;
  const session = createKanjiKombatSession({
    syncRequest: async payload => {
      calls.push({ ...payload });
      return responseOverride ?? okResponse(payload.entries.at(-1).seq);
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  // First sync — no epoch yet.
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  await scheduler.fire();
  assert.equal(calls[0].sessionEpoch, null, 'initial sync should have null sessionEpoch');

  // Server responds with an authoritativeState carrying a new sessionEpoch.
  const adoptedEpoch = 'kse_adopted_epoch';
  responseOverride = {
    status: 'ok',
    confirmedThroughSeq: 1,
    results: [],
    authoritativeState: { run: { kanjiKombat: { sessionEpoch: adoptedEpoch } } },
  };
  session.recordAction({ kind: 'quiz', actionId: 'run_q2' });
  await scheduler.fire(); // fires the follow-up drain from pendingCount > 0
  // The second call should already use the epoch from the first fire.
  // But calls[1] was sent before the response of calls[1] was received; let's re-check:
  // calls[1] was built from the state after the first response was processed.
  // After fire() completes for calls[1], the epoch is adopted.
  // We need a third action to observe adoption in the payload.
  assert.equal(calls[1].sessionEpoch, null,
    'second sync (sent before first epoch response) should still have null epoch');

  // Now that adoptedEpoch is in place, record another entry — next sync must carry it.
  responseOverride = null;
  session.recordAction({ kind: 'quiz', actionId: 'run_q3' });
  await scheduler.fire();
  assert.equal(calls[2].sessionEpoch, adoptedEpoch,
    'third sync payload must carry the adopted sessionEpoch');
});
