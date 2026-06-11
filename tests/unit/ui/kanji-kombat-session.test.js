import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKanjiKombatSession,
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

test('reset abandons in-flight responses', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const session = createKanjiKombatSession({
    syncRequest: async () => { await gate; return okResponse(1); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  const draining = scheduler.fire();
  session.reset();
  release();
  await draining;
  assert.equal(session.pendingCount(), 0); // reset cleared; stale response ignored
});
