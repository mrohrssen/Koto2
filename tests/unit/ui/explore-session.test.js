import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createExploreSession,
  configureExploreSession,
  getExploreSession,
  resetExploreSession,
  EXPLORE_SESSION_HARD_CAP,
  EXPLORE_SESSION_RESUME_AT,
  EXPLORE_SYNC_DEBOUNCE_MS,
  EXPLORE_SYNC_RETRY_DELAYS_MS,
} from '../../../public/js/ui/explore-session.js';

function makeManualScheduler() {
  const timers = [];
  return {
    schedule: (fn, delay) => {
      timers.push({ fn, delay });
      return timers.length - 1;
    },
    cancel: id => {
      if (timers[id]) timers[id].fn = null;
    },
    fire: async () => {
      const pending = timers.splice(0);
      for (const timer of pending) {
        if (timer.fn) await timer.fn();
      }
    },
    delays: () => timers.map(timer => timer.delay),
  };
}

function preparedRoom(index, overrides = {}) {
  const roomId = overrides.roomId ?? `room-${index}`;
  return {
    index,
    roomId,
    actionSeq: overrides.actionSeq ?? index,
    room: { id: roomId, type: overrides.type ?? 'room', ...(overrides.room || {}) },
    acceptedActions: overrides.acceptedActions ?? ['proceed'],
    actionEffects: overrides.actionEffects ?? { proceed: ['areaProgress'] },
    dependencies: overrides.dependencies ?? [],
    offlineReady: overrides.offlineReady ?? true,
    ...overrides,
  };
}

function makeRunway(overrides = {}) {
  return {
    sessionEpoch: overrides.sessionEpoch ?? 'ese_1111111111111111',
    roomActionSeq: overrides.roomActionSeq ?? 7,
    currentRoom: overrides.currentRoom ?? 0,
    preparedRooms: overrides.preparedRooms ?? [
      preparedRoom(0, {
        actionSeq: 7,
        acceptedActions: ['friendlyNpc.choose', 'proceed'],
        actionEffects: {
          'friendlyNpc.choose': ['partyStats'],
          proceed: ['areaProgress'],
        },
      }),
      preparedRoom(1, {
        actionSeq: 8,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['ingredients', 'areaProgress'] },
      }),
    ],
  };
}

function okResponse(confirmedThroughSeq, overrides = {}) {
  return { status: 'ok', confirmedThroughSeq, results: [], ...overrides };
}

function assertExploreActionId(actionId, seq) {
  assert.match(actionId, /^run_es_[a-z0-9]+_[0-9]{8}$/);
  assert.equal(actionId.endsWith(String(seq).padStart(8, '0')), true);
}

test('exports explore session contract constants', () => {
  assert.equal(EXPLORE_SESSION_HARD_CAP, 50);
  assert.equal(EXPLORE_SESSION_RESUME_AT, 40);
  assert.equal(EXPLORE_SYNC_DEBOUNCE_MS, 300);
  assert.deepEqual(EXPLORE_SYNC_RETRY_DELAYS_MS, [500, 1000, 2000, 4000, 8000, 15000]);
});

test('records actions with room identity and predicted effects', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());

  const result = session.recordRoomAction('friendlyNpc.choose', {
    itemId: 'iron-charm',
    targetCreatureIndex: 0,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.pendingCount, 1);
  assert.equal(session.pendingCount(), 1);

  const [entry] = session.snapshot();
  assert.equal(entry.seq, 1);
  assertExploreActionId(entry.actionId, 1);
  assert.equal(entry.kind, 'friendlyNpc.choose');
  assert.equal(entry.roomIndex, 0);
  assert.equal(entry.roomId, 'room-0');
  assert.equal(entry.actionSeq, 7);
  assert.deepEqual(entry.payload, { itemId: 'iron-charm', targetCreatureIndex: 0 });
  assert.deepEqual(entry.predictedEffects, ['partyStats']);
  assert.equal(typeof entry.createdAt, 'number');
});

test('action ids include a session nonce and rotate when seq resets', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());
  const first = session.recordRoomAction('friendlyNpc.choose', { itemId: 'first' }).entry.actionId;
  assertExploreActionId(first, 1);

  session.reset();
  session.adoptRunway(makeRunway());
  const afterReset = session.recordRoomAction('friendlyNpc.choose', { itemId: 'after-reset' }).entry.actionId;
  assertExploreActionId(afterReset, 1);
  assert.notEqual(afterReset, first);

  const configured = configureExploreSession({ syncRequest: async () => okResponse(1) });
  configured.adoptRunway(makeRunway());
  const configuredId = configured.recordRoomAction('friendlyNpc.choose', { itemId: 'configured' }).entry.actionId;
  assertExploreActionId(configuredId, 1);
  assert.notEqual(configuredId, afterReset);
  resetExploreSession();
});

test('local proceed advances to next prepared room and uses next actionSeq', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(2) });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, { actionSeq: 7, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
      preparedRoom(1, { actionSeq: 8, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
      preparedRoom(2, { actionSeq: 9, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
    ],
  }));

  const proceed = session.recordRoomAction('proceed');
  assert.equal(proceed.accepted, true);
  assert.equal(session.currentPreparedRoom().index, 1);
  assert.equal(session.isPaused(), false);

  const next = session.recordRoomAction('proceed', { source: 'button' });
  assert.equal(next.accepted, true);

  const entries = session.snapshot();
  assert.deepEqual(entries.map(entry => entry.seq), [1, 2]);
  assert.deepEqual(entries.map(entry => entry.actionSeq), [7, 8]);
  assert.deepEqual(entries.map(entry => entry.roomIndex), [0, 1]);
  assert.equal(entries[1].roomId, 'room-1');
});

test('dependency pause keeps local room when unsynced effects intersect next dependencies', () => {
  const pauses = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(2),
    onPause: detail => pauses.push(detail),
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        acceptedActions: ['friendlyNpc.choose', 'proceed'],
        actionEffects: {
          'friendlyNpc.choose': ['partyStats'],
          proceed: [],
        },
      }),
      preparedRoom(1, {
        actionSeq: 4,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: [] },
        dependencies: ['partyStats'],
      }),
    ],
  }));

  assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'berry' }).accepted, true);
  const proceed = session.recordRoomAction('proceed');

  assert.deepEqual(proceed, { accepted: false, reason: 'dependency', pendingCount: 1 });
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.isPaused(), true);
  assert.equal(session.currentPreparedRoom().index, 0);
  assert.deepEqual(session.snapshot().map(entry => entry.kind), ['friendlyNpc.choose']);
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].reason, 'dependency');
  assert.equal(pauses[0].pendingCount, 1);
});

test('proceed predicted effects are included in dependency preflight without consuming seq', () => {
  const pauses = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(1),
    onPause: detail => pauses.push(detail),
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['ingredients'] },
      }),
      preparedRoom(1, {
        actionSeq: 4,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: [] },
        dependencies: ['ingredients'],
      }),
    ],
  }));

  const proceed = session.recordRoomAction('proceed');

  assert.deepEqual(proceed, { accepted: false, reason: 'dependency', pendingCount: 0 });
  assert.equal(session.pendingCount(), 0);
  assert.equal(session.isPaused(), true);
  assert.deepEqual(session.snapshot(), []);
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].reason, 'dependency');
  assert.equal(pauses[0].pendingCount, 0);

  session.adoptRunway(makeRunway({
    sessionEpoch: 'ese_2222222222222222',
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        acceptedActions: ['friendlyNpc.choose'],
        actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      }),
    ],
  }));
  const next = session.recordRoomAction('friendlyNpc.choose', { itemId: 'after-reject' });
  assert.equal(next.accepted, true);
  assertExploreActionId(next.entry.actionId, 1);
});

test('proceed rejects before logging when runway is exhausted', () => {
  const pauses = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(1),
    onPause: detail => pauses.push(detail),
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: [] },
      }),
    ],
  }));

  const proceed = session.recordRoomAction('proceed');

  assert.deepEqual(proceed, { accepted: false, reason: 'runwayExhausted', pendingCount: 0 });
  assert.equal(session.pendingCount(), 0);
  assert.equal(session.isPaused(), true);
  assert.deepEqual(session.snapshot(), []);
  assert.equal(session.currentPreparedRoom().index, 0);
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].reason, 'runwayExhausted');
  assert.equal(pauses[0].pendingCount, 0);
});

test('proceed rejects before logging when next prepared room is not ready', () => {
  const pauses = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(1),
    onPause: detail => pauses.push(detail),
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: [] },
      }),
      preparedRoom(1, {
        actionSeq: 4,
        acceptedActions: ['proceed'],
        actionEffects: { proceed: [] },
        offlineReady: false,
      }),
    ],
  }));

  const proceed = session.recordRoomAction('proceed');

  assert.deepEqual(proceed, { accepted: false, reason: 'nextRoomNotReady', pendingCount: 0 });
  assert.equal(session.pendingCount(), 0);
  assert.equal(session.isPaused(), true);
  assert.deepEqual(session.snapshot(), []);
  assert.equal(session.currentPreparedRoom().index, 0);
  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].reason, 'nextRoomNotReady');
  assert.equal(pauses[0].pendingCount, 0);
});

test('hard cap pauses, rejects overflow, and resumes after pending count drops to resume mark', async () => {
  const scheduler = makeManualScheduler();
  const events = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(EXPLORE_SESSION_HARD_CAP - EXPLORE_SESSION_RESUME_AT),
    onPause: detail => events.push(['pause', detail]),
    onResume: detail => events.push(['resume', detail]),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  for (let i = 0; i < EXPLORE_SESSION_HARD_CAP; i += 1) {
    const result = session.recordRoomAction('friendlyNpc.choose', { itemId: `item-${i}` });
    assert.equal(result.accepted, true);
  }

  assert.equal(session.pendingCount(), EXPLORE_SESSION_HARD_CAP);
  assert.equal(session.isPaused(), true);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'pause');
  assert.equal(events[0][1].reason, 'hardCap');

  const rejected = session.recordRoomAction('friendlyNpc.choose', { itemId: 'overflow' });
  assert.deepEqual(rejected, {
    accepted: false,
    reason: 'hardCap',
    pendingCount: EXPLORE_SESSION_HARD_CAP,
  });

  await scheduler.fire();
  assert.equal(session.pendingCount(), EXPLORE_SESSION_RESUME_AT);
  assert.equal(session.isPaused(), false);
  assert.equal(events.length, 2);
  assert.equal(events[1][0], 'resume');
  assert.equal(events[1][1].pendingCount, EXPLORE_SESSION_RESUME_AT);
});

test('recordRoomAction rejects actions not accepted by the current prepared room', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());

  const rejected = session.recordRoomAction('dealer.buy', { creatureId: 'mizu' });

  assert.deepEqual(rejected, { accepted: false, reason: 'actionNotAccepted', pendingCount: 0 });
  assert.equal(session.pendingCount(), 0);
});

test('sync batches entries with sessionEpoch and adopts checkpoint runway', async () => {
  const scheduler = makeManualScheduler();
  const calls = [];
  const checkpoints = [];
  const refreshedRunway = makeRunway({
    sessionEpoch: 'ese_2222222222222222',
    currentRoom: 1,
    preparedRooms: [preparedRoom(1, { actionSeq: 8 })],
  });
  const session = createExploreSession({
    syncRequest: async payload => {
      calls.push(payload);
      return okResponse(payload.entries.at(-1).seq, { exploreRunway: refreshedRunway });
    },
    onCheckpoint: response => checkpoints.push(response),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });
  session.recordRoomAction('proceed');
  await scheduler.fire();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionEpoch, 'ese_1111111111111111');
  assert.deepEqual(calls[0].entries.map(entry => entry.seq), [1, 2]);
  assert.equal(session.pendingCount(), 0);
  assert.equal(checkpoints.length, 1);
  assert.equal(session.currentPreparedRoom().index, 1);
});

test('syncNow immediately drains pending entries without firing the scheduler', async () => {
  const scheduler = makeManualScheduler();
  const calls = [];
  const session = createExploreSession({
    syncRequest: async payload => {
      calls.push(payload);
      return okResponse(payload.entries.at(-1).seq);
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });
  assert.equal(calls.length, 0);

  await session.syncNow();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].entries.length, 1);
  assert.equal(session.pendingCount(), 0);
});

test('syncNow during an in-flight sync waits and drains entries appended during that sync', async () => {
  const scheduler = makeManualScheduler();
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const calls = [];
  const session = createExploreSession({
    syncRequest: async payload => {
      calls.push(payload);
      if (calls.length === 1) {
        await firstGate;
        return okResponse(1);
      }
      return okResponse(payload.entries.at(-1).seq);
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'first' });
  const scheduledDrain = scheduler.fire();
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'second' });

  let syncNowSettled = false;
  const syncNowDrain = session.syncNow().then(() => { syncNowSettled = true; });
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(syncNowSettled, false);

  releaseFirst();
  await syncNowDrain;
  await scheduledDrain;

  assert.equal(syncNowSettled, true);
  assert.deepEqual(calls.map(call => call.entries.map(entry => entry.seq)), [[1], [2]]);
  assert.equal(session.pendingCount(), 0);
});

test('checkpoint adoption preserves optimistic cursor from remaining pending proceed entries', async () => {
  const scheduler = makeManualScheduler();
  let releaseFirst;
  let releaseSecond;
  let secondStarted;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const secondGate = new Promise(resolve => { releaseSecond = resolve; });
  const secondStartedPromise = new Promise(resolve => { secondStarted = resolve; });
  const initialRunway = makeRunway({
    preparedRooms: [
      preparedRoom(0, { actionSeq: 7, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
      preparedRoom(1, { actionSeq: 8, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
      preparedRoom(2, { actionSeq: 9, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
    ],
  });
  const checkpointRunway = makeRunway({
    currentRoom: 1,
    preparedRooms: [
      preparedRoom(1, { actionSeq: 8, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
      preparedRoom(2, { actionSeq: 9, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
    ],
  });
  const finalRunway = makeRunway({
    currentRoom: 2,
    preparedRooms: [
      preparedRoom(2, { actionSeq: 9, acceptedActions: ['proceed'], actionEffects: { proceed: [] } }),
    ],
  });
  const calls = [];
  const session = createExploreSession({
    syncRequest: async payload => {
      calls.push(payload);
      if (calls.length === 1) {
        await firstGate;
        return okResponse(1, { exploreRunway: checkpointRunway });
      }
      secondStarted();
      await secondGate;
      return okResponse(2, { exploreRunway: finalRunway });
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(initialRunway);

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  assert.equal(session.currentPreparedRoom().index, 1);
  const draining = scheduler.fire();

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  assert.equal(session.currentPreparedRoom().index, 2);

  releaseFirst();
  await secondStartedPromise;

  assert.deepEqual(calls.map(call => call.entries.map(entry => entry.seq)), [[1], [2]]);
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.currentPreparedRoom().index, 2);

  releaseSecond();
  await draining;

  assert.equal(session.pendingCount(), 0);
  assert.equal(session.currentPreparedRoom().index, 2);
});

test('network failure retries with backoff and keeps the log', async () => {
  const scheduler = makeManualScheduler();
  const session = createExploreSession({
    syncRequest: async () => { throw new Error('offline'); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });
  await scheduler.fire();

  assert.equal(session.pendingCount(), 1);
  assert.equal(scheduler.delays()[0], EXPLORE_SYNC_RETRY_DELAYS_MS[0]);

  await scheduler.fire();
  assert.equal(scheduler.delays()[0], EXPLORE_SYNC_RETRY_DELAYS_MS[1]);
});

test('corrected response clears the log, notifies, and adopts response runway', async () => {
  const scheduler = makeManualScheduler();
  const corrections = [];
  const correctedRunway = makeRunway({
    sessionEpoch: 'ese_3333333333333333',
    currentRoom: 1,
    preparedRooms: [preparedRoom(1, { actionSeq: 12 })],
  });
  const session = createExploreSession({
    syncRequest: async () => ({
      status: 'corrected',
      reason: 'room_index_mismatch',
      confirmedThroughSeq: null,
      exploreRunway: correctedRunway,
    }),
    onCorrection: response => corrections.push(response),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });
  await scheduler.fire();

  assert.equal(session.pendingCount(), 0);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].reason, 'room_index_mismatch');
  assert.equal(session.currentPreparedRoom().index, 1);
});

test('reset abandons in-flight responses', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const checkpoints = [];
  const session = createExploreSession({
    syncRequest: async () => {
      await gate;
      return okResponse(1);
    },
    onCheckpoint: response => checkpoints.push(response),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'before-reset' });
  const draining = scheduler.fire();

  session.reset();
  session.adoptRunway(makeRunway({ sessionEpoch: 'ese_4444444444444444' }));
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'after-reset' });
  assert.equal(session.pendingCount(), 1);

  release();
  await draining;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(session.pendingCount(), 1);
  assert.equal(session.snapshot()[0].payload.itemId, 'after-reset');
  assert.equal(checkpoints.length, 0);
});

test('new runway generation abandons in-flight responses and clears old pending log', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const checkpoints = [];
  const session = createExploreSession({
    syncRequest: async () => {
      await gate;
      return okResponse(1);
    },
    onCheckpoint: response => checkpoints.push(response),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({ sessionEpoch: 'ese_aaaaaaaaaaaaaaaa' }));

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'old-generation' });
  const draining = scheduler.fire();
  session.adoptRunway(makeRunway({ sessionEpoch: 'ese_bbbbbbbbbbbbbbbb' }));

  assert.equal(session.pendingCount(), 0, 'new external runway generation clears old pending log');

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'new-generation' });
  release();
  await draining;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(session.pendingCount(), 1);
  assert.equal(session.snapshot()[0].payload.itemId, 'new-generation');
  assert.equal(checkpoints.length, 0);
});

test('singleton lifecycle: configure / get / reset', () => {
  const session1 = configureExploreSession({ syncRequest: async () => okResponse(1) });
  assert.ok(session1);
  assert.equal(getExploreSession(), session1);

  session1.adoptRunway(makeRunway());
  session1.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });

  const session2 = configureExploreSession({ syncRequest: async () => okResponse(1) });
  assert.notEqual(session1, session2);
  assert.equal(getExploreSession(), session2);
  assert.equal(session1.pendingCount(), 0);

  resetExploreSession();
  assert.equal(getExploreSession(), null);
});
