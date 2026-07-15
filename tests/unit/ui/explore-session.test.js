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
import { roomDependenciesForType } from '../../../src/game/services/explore-session-contract.js';

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

function whackThenCombatRunway({ completed = false } = {}) {
  return makeRunway({
    sessionEpoch: 'ese_4444444444444444',
    currentRoom: 0,
    roomActionSeq: 5,
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 5,
        type: 'whackAMole',
        room: {
          id: 'room-0',
          type: 'whackAMole',
          interacted: completed,
          whackAMole: { completed },
        },
        acceptedActions: completed
          ? ['proceed']
          : ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
        actionEffects: {
          'whackAMole.complete': ['credits', 'partyStats'],
          'whackAMole.skip': [],
          proceed: ['ingredients', 'areaProgress'],
        },
      }),
      preparedRoom(1, {
        actionSeq: 6,
        type: 'encounter',
        dependencies: ['partyStats'],
        acceptedActions: ['encounter.start', 'combat.cycle'],
        actionEffects: {
          'encounter.start': [],
          'combat.cycle': ['partyStats'],
        },
        interactionPayload: {
          combatStart: { optimistic: { nextTurnSeed: 'seed-a' } },
          seedChain: ['seed-a', 'seed-b'],
        },
        offlineReady: true,
      }),
    ],
  });
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

test('shrine.choose pending pauses the proceed INTO a combat room (transcript_mismatch fix, task-12f)', () => {
  // Regression for task-12e attempt B (transcript_mismatch seq 7). The runway
  // now stamps combat rooms with their real ROOM_DEPENDENCIES, which include
  // PARTY_STATS. A queued shrine.choose (predictedEffects: ['partyStats']) must
  // therefore pause the proceed into an encounter room offline — the client must
  // NOT build the fight against un-boosted allies. Uses roomDependenciesForType
  // as the source of truth so this test tracks the contract, not a hardcoded tag.
  const encounterDeps = roomDependenciesForType('encounter');
  assert.ok(encounterDeps.includes('partyStats'), 'precondition: encounter rooms depend on partyStats');

  const pauses = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(2),
    onPause: detail => pauses.push(detail),
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        type: 'shrine',
        acceptedActions: ['shrine.choose', 'proceed'],
        actionEffects: {
          'shrine.choose': ['partyStats'],
          proceed: [],
        },
      }),
      preparedRoom(1, {
        actionSeq: 4,
        type: 'encounter',
        acceptedActions: ['encounter.start', 'combat.cycle'],
        actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
        dependencies: encounterDeps,
      }),
    ],
  }));

  assert.equal(session.recordRoomAction('shrine.choose', { rewardType: 'level_up', creatureKey: 'hi' }).accepted, true);
  const proceed = session.recordRoomAction('proceed');

  assert.deepEqual(proceed, { accepted: false, reason: 'dependency', pendingCount: 1 });
  assert.equal(session.isPaused(), true);
  assert.equal(session.currentPreparedRoom().index, 0, 'stayed on the shrine room — never advanced into combat offline');
  assert.deepEqual(session.snapshot().map(entry => entry.kind), ['shrine.choose']);
  assert.equal(pauses[0].reason, 'dependency');
});

test('proceed with self-intersecting effects queues and pauses instead of rejecting', () => {
  // A proceed whose OWN predicted effects (proceed → ['ingredients','areaProgress'])
  // intersect the NEXT room's dependencies (campfire → ['ingredients','partyStats'])
  // is a STATIC intersection: it holds before the entry is ever queued. Rejecting
  // here deadlocks — the reject fires before the log ever contains the effect, so the
  // drain can never land it and every retry re-trips the same static intersection
  // (support→campfire "Connection is spotty" loop). The fix: QUEUE the proceed
  // (its own effect can only land server-side once the entry syncs), advance the
  // cursor, and pause('dependency') so the just-entered campfire's own actions
  // (campfire.cook) are held until the proceed's ingredient award lands. The drain
  // lifts the pause once the log empties (see the drain-resume test below).
  const pauses = [];
  const session = createExploreSession({
    syncRequest: async () => okResponse(1),
    onPause: detail => pauses.push(detail),
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        type: 'whackAMole',
        acceptedActions: ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
        actionEffects: {
          'whackAMole.complete': ['credits'],
          'whackAMole.skip': [],
          proceed: ['ingredients', 'areaProgress'],
        },
      }),
      preparedRoom(1, {
        actionSeq: 4,
        type: 'campfire',
        offlineReady: true,
        acceptedActions: ['campfire.cook', 'campfire.feed', 'campfire.skip', 'proceed'],
        actionEffects: {
          'campfire.cook': ['ingredients'],
          'campfire.feed': ['partyStats', 'ingredients'],
          'campfire.skip': [],
        },
        dependencies: ['ingredients', 'partyStats'],
      }),
    ],
  }));

  const proceed = session.recordRoomAction('proceed');

  assert.equal(proceed.accepted, true, 'the proceed is queued rather than rejected');
  assert.equal(proceed.pendingCount, 1);
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.isPaused(), true, 'pause holds the next room until the proceed syncs');

  const [entry] = session.snapshot();
  assert.equal(entry.kind, 'proceed');
  assert.equal(entry.roomIndex, 0);
  assert.deepEqual(entry.predictedEffects, ['ingredients', 'areaProgress']);
  assert.equal(session.currentPreparedRoom().index, 1, 'cursor advanced into the campfire room');

  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].reason, 'dependency');
  assert.equal(pauses[0].pendingCount, 1);

  // While paused, the campfire's own action is held (rejected with the pause reason).
  const cook = session.recordRoomAction('campfire.cook', { recipeId: 'stew' });
  assert.deepEqual(cook, { accepted: false, reason: 'dependency', pendingCount: 1 });
});

test('a self-intersecting proceed pause lifts after the drain lands it, then the next room accepts', async () => {
  const scheduler = makeManualScheduler();
  const resumes = [];
  const session = createExploreSession({
    syncRequest: async payload => okResponse(payload.entries.at(-1).seq),
    onResume: detail => resumes.push(detail),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        type: 'whackAMole',
        acceptedActions: ['whackAMole.complete', 'whackAMole.skip', 'proceed'],
        actionEffects: {
          'whackAMole.complete': ['credits'],
          'whackAMole.skip': [],
          proceed: ['ingredients', 'areaProgress'],
        },
      }),
      preparedRoom(1, {
        actionSeq: 4,
        type: 'campfire',
        offlineReady: true,
        acceptedActions: ['campfire.cook', 'campfire.feed', 'campfire.skip', 'proceed'],
        actionEffects: {
          'campfire.cook': ['ingredients'],
          'campfire.feed': ['partyStats', 'ingredients'],
          'campfire.skip': [],
        },
        dependencies: ['ingredients', 'partyStats'],
      }),
    ],
  }));

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  assert.equal(session.isPaused(), true);

  // The drain syncs the queued proceed; its ingredient award lands server-side and
  // the log empties → the pause lifts.
  await scheduler.fire();

  assert.equal(session.pendingCount(), 0);
  assert.equal(session.isPaused(), false, 'the drain emptied the log and resumed the session');
  assert.equal(resumes.length, 1);
  assert.equal(resumes[0].reason, 'dependency');

  const cook = session.recordRoomAction('campfire.cook', { recipeId: 'stew' });
  assert.equal(cook.accepted, true, 'the campfire room accepts its action once the proceed has synced');
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

test('permanent and malformed sync responses pause without retry while corrections still apply', async () => {
  for (const response of [
    { error: 'forbidden', httpStatus: 403, transient: false },
    { unexpected: 'malformed 2xx body' },
  ]) {
    const scheduler = makeManualScheduler();
    const session = createExploreSession({
      syncRequest: async () => response,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    session.adoptRunway(makeRunway());
    session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });

    await session.syncNow();

    assert.equal(session.pendingCount(), 1);
    assert.equal(session.getPauseReason(), 'syncRejected');
    assert.equal(scheduler.delays().includes(500), false);
  }

  let correctionCalls = 0;
  const correctedSession = createExploreSession({
    syncRequest: async () => ({
      status: 'corrected',
      error: 'HTTP 409',
      httpStatus: 409,
      transient: false,
      confirmedThroughSeq: null,
      rejectedSeq: 1,
      reason: 'server_correction',
      results: [],
      exploreRunway: makeRunway(),
    }),
    onCorrection: () => { correctionCalls += 1; },
  });
  correctedSession.adoptRunway(makeRunway());
  correctedSession.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });
  await correctedSession.syncNow();
  assert.equal(correctionCalls, 1);
  assert.equal(correctedSession.pendingCount(), 0);
  assert.notEqual(correctedSession.getPauseReason(), 'syncRejected');
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

test('corrected response with null exploreRunway clears stale prepared room', async () => {
  const scheduler = makeManualScheduler();
  const corrections = [];
  const session = createExploreSession({
    syncRequest: async () => ({
      status: 'corrected',
      reason: 'run_inactive',
      confirmedThroughSeq: null,
      exploreRunway: null,
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
  assert.equal(corrections[0].reason, 'run_inactive');
  assert.equal(session.currentPreparedRoom(), null);
});

test('ok response with null exploreRunway clears stale prepared room after confirming entries', async () => {
  const scheduler = makeManualScheduler();
  const checkpoints = [];
  const session = createExploreSession({
    syncRequest: async payload => okResponse(payload.entries.at(-1).seq, { exploreRunway: null }),
    onCheckpoint: response => checkpoints.push(response),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway());

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });
  await scheduler.fire();

  assert.equal(session.pendingCount(), 0);
  assert.equal(checkpoints.length, 1);
  assert.equal(session.currentPreparedRoom(), null);
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

test('inactive runway adoption invalidates in-flight responses from a live epoch', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const checkpoints = [];
  const corrections = [];
  const staleRunway = makeRunway({
    sessionEpoch: 'ese_stale111111111',
    currentRoom: 1,
    preparedRooms: [preparedRoom(1, { actionSeq: 8 })],
  });
  const session = createExploreSession({
    syncRequest: async () => {
      await gate;
      return okResponse(1, { exploreRunway: staleRunway });
    },
    onCheckpoint: response => checkpoints.push(response),
    onCorrection: response => corrections.push(response),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({ sessionEpoch: 'ese_live1111111111' }));

  session.recordRoomAction('friendlyNpc.choose', { itemId: 'before-inactive' });
  const draining = scheduler.fire();
  assert.equal(session.pendingCount(), 1);

  session.adoptRunway(null);
  assert.equal(session.pendingCount(), 0);
  assert.equal(session.currentPreparedRoom(), null);

  release();
  await draining;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(checkpoints.length, 0);
  assert.equal(corrections.length, 0);
  assert.equal(session.currentPreparedRoom(), null);

  session.adoptRunway(makeRunway({
    sessionEpoch: 'ese_fresh111111111',
    preparedRooms: [
      preparedRoom(0, {
        actionSeq: 3,
        acceptedActions: ['friendlyNpc.choose'],
        actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      }),
    ],
  }));
  const fresh = session.recordRoomAction('friendlyNpc.choose', { itemId: 'after-inactive' });
  assert.equal(fresh.accepted, true);
  assert.equal(session.pendingCount(), 1);
});

test('XP completion checkpoints before proceed into combat', async () => {
  const scheduler = makeManualScheduler();
  const session = createExploreSession({
    syncRequest: async ({ entries }) => okResponse(entries.at(-1).seq, {
      exploreRunway: whackThenCombatRunway({ completed: true }),
    }),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(whackThenCombatRunway());

  const complete = session.recordRoomAction('whackAMole.complete', { score: 4 });
  const blockedProceed = session.recordRoomAction('proceed');

  assert.equal(complete.accepted, true);
  assert.deepEqual(blockedProceed, {
    accepted: false,
    reason: 'dependency',
    pendingCount: 1,
  });
  assert.equal(session.isPaused(), true);

  await scheduler.fire();

  assert.equal(session.pendingCount(), 0);
  assert.equal(session.isPaused(), false);
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

// Regression (first-room spotty deadlock, client side): a session paused by a
// rejected `proceed` (nextRoomNotReady) with an EMPTY log can never resume via
// the drain — runDrainLoop early-returns on an empty log, so drainOnce (the only
// caller of maybeResumeAfterDrain) never runs. Adopting a refreshed SAME-epoch
// runway whose next room is now ready is the recovery moment: adoptRunway must
// call maybeResumeAfterDrain on the non-boundary path too, so the pause lifts and
// the proceed is accepted.
test('adopting a refreshed same-epoch runway resumes a session paused on an empty log', () => {
  const EPOCH = 'ese_resume11111111';
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });

  // Room 0 can proceed; room 1 exists but is NOT offline-ready yet.
  session.adoptRunway({
    sessionEpoch: EPOCH,
    roomActionSeq: 7,
    currentRoom: 0,
    preparedRooms: [
      preparedRoom(0, { actionSeq: 7, acceptedActions: ['proceed'], actionEffects: { proceed: ['areaProgress'] } }),
      preparedRoom(1, { actionSeq: 8, acceptedActions: ['proceed'], offlineReady: false }),
    ],
  });

  const rejected = session.recordRoomAction('proceed');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'nextRoomNotReady');
  assert.equal(session.isPaused(), true, 'a not-ready next room pauses the session');
  assert.equal(session.pendingCount(), 0, 'the rejected proceed leaves the log empty (nothing queued)');

  // A refreshed runway arrives (SAME epoch — not a session boundary) with room 1
  // now offline-ready. This must clear the empty-log pause.
  session.adoptRunway({
    sessionEpoch: EPOCH,
    roomActionSeq: 7,
    currentRoom: 0,
    preparedRooms: [
      preparedRoom(0, { actionSeq: 7, acceptedActions: ['proceed'], actionEffects: { proceed: ['areaProgress'] } }),
      preparedRoom(1, { actionSeq: 8, acceptedActions: ['proceed'], offlineReady: true }),
    ],
  });

  assert.equal(session.isPaused(), false, 'adopting the refreshed runway resumes the session');

  const accepted = session.recordRoomAction('proceed');
  assert.equal(accepted.accepted, true, 'the proceed is accepted once the next room is ready');
  assert.equal(session.pendingCount(), 1);
});

test('exposes pause reason and a monotonic local revision', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());
  const r0 = session.getLocalRevision();

  const rejected = session.recordRoomAction('dealer.buy', {});
  assert.equal(rejected.reason, 'actionNotAccepted');
  assert.equal(session.getPauseReason(), 'actionNotAccepted');
  assert.equal(session.getLocalRevision(), r0);

  session.adoptRunway(makeRunway());
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'x' });
  assert.equal(session.getLocalRevision(), r0 + 1);

  session.reset();
  assert.equal(session.getLocalRevision(), r0 + 2);
});

test('consumes each returned action result once per session epoch', () => {
  const session = createExploreSession({ syncRequest: async () => okResponse(1) });
  session.adoptRunway(makeRunway());

  assert.equal(session.consumeResultOnce('run_es_result_1'), true);
  assert.equal(session.consumeResultOnce('run_es_result_1'), false);

  session.adoptRunway(makeRunway({ sessionEpoch: 'ese_2222222222222222' }));
  assert.equal(session.consumeResultOnce('run_es_result_1'), true);
});

test('a sync-delivered epoch change rotates result consumption and revision', async () => {
  const nextEpochRunway = makeRunway({
    sessionEpoch: 'ese_3333333333333333',
  });
  const session = createExploreSession({
    syncRequest: async () => okResponse(1, {
      exploreRunway: nextEpochRunway,
    }),
  });
  session.adoptRunway(makeRunway({
    sessionEpoch: 'ese_2222222222222222',
  }));
  const before = session.getLocalRevision();
  assert.equal(session.consumeResultOnce('run_es_result_2'), true);
  assert.equal(session.consumeResultOnce('run_es_result_2'), false);

  assert.equal(session.recordRoomAction('friendlyNpc.choose', {
    itemId: 'field-tonic',
  }).accepted, true);
  await session.syncNow();

  assert.ok(session.getLocalRevision() > before);
  assert.equal(session.consumeResultOnce('run_es_result_2'), true);
});

test('sync callbacks see the response runway before a paused session resumes', async () => {
  const scheduler = makeManualScheduler();
  const events = [];
  const refreshed = makeRunway({
    currentRoom: 1,
    roomActionSeq: 88,
    preparedRooms: [preparedRoom(1, { actionSeq: 88 })],
  });
  let session;
  session = createExploreSession({
    syncRequest: async () => okResponse(1, { exploreRunway: refreshed }),
    onCheckpoint: () => events.push([
      'checkpoint',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    onResume: () => events.push([
      'resume',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['partyStats'] },
      }),
      preparedRoom(1, { dependencies: ['partyStats'] }),
    ],
  }));

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  await scheduler.fire();

  assert.deepEqual(events, [
    ['checkpoint', 88, true],
    ['resume', 88, false],
  ]);
});

test('correction callback sees corrected runway before resume', async () => {
  const scheduler = makeManualScheduler();
  const events = [];
  const correctedRunway = makeRunway({
    currentRoom: 1,
    roomActionSeq: 99,
    preparedRooms: [preparedRoom(1, { actionSeq: 99 })],
  });
  let session;
  session = createExploreSession({
    syncRequest: async () => ({
      status: 'corrected',
      confirmedThroughSeq: null,
      rejectedSeq: 1,
      reason: 'server_correction',
      results: [],
      exploreRunway: correctedRunway,
    }),
    onCorrection: () => events.push([
      'correction',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    onResume: () => events.push([
      'resume',
      session.currentPreparedRoom()?.actionSeq,
      session.isPaused(),
    ]),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptRunway(makeRunway({
    preparedRooms: [
      preparedRoom(0, {
        acceptedActions: ['proceed'],
        actionEffects: { proceed: ['partyStats'] },
      }),
      preparedRoom(1, { dependencies: ['partyStats'] }),
    ],
  }));

  assert.equal(session.recordRoomAction('proceed').accepted, true);
  await scheduler.fire();

  assert.deepEqual(events, [
    ['correction', 99, true],
    ['resume', 99, false],
  ]);
});
