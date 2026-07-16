import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as exploreSessionApi from '../../../public/js/ui/explore-session.js';

function makeRunway() {
  return {
    sessionEpoch: 'ese_legacyfence01',
    currentRoom: 0,
    roomActionSeq: 0,
    preparedRooms: [{
      index: 0,
      roomId: 'room-0',
      actionSeq: 0,
      offlineReady: true,
      acceptedActions: ['friendlyNpc.choose'],
      actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      dependencies: [],
    }],
  };
}

function makeSession(overrides = {}) {
  const session = exploreSessionApi.createExploreSession({
    syncRequest: overrides.syncRequest || (async () => ({
      status: 'ok',
      confirmedThroughSeq: 0,
      results: [],
    })),
    schedule: overrides.schedule || (() => 0),
    cancel: () => {},
  });
  session.adoptRunway(makeRunway());
  return session;
}

test('exposes one shared stability fence for Explore compatibility actions', () => {
  assert.equal(typeof exploreSessionApi.runWithStableExploreSession, 'function');
});

test('does not execute a compatibility action from an empty paused session', async () => {
  const session = makeSession();
  session.pause('currentRoomNotReady');
  let legacyCalls = 0;

  const outcome = await exploreSessionApi.runWithStableExploreSession(
    session,
    async () => { legacyCalls += 1; },
    { reason: 'combatStart' },
  );

  assert.deepEqual(outcome, { executed: false, result: null });
  assert.equal(legacyCalls, 0);
  assert.equal(session.isPaused(), true);
  assert.equal(session.getPauseReason(), 'currentRoomNotReady');
});

test('drains pending Explore entries before executing a compatibility action', async () => {
  let syncCalls = 0;
  const session = makeSession({
    syncRequest: async ({ entries }) => {
      syncCalls += 1;
      return {
        status: 'ok',
        confirmedThroughSeq: entries.at(-1).seq,
        results: [],
      };
    },
  });
  assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' }).accepted, true);
  let legacyCalls = 0;

  const outcome = await exploreSessionApi.runWithStableExploreSession(
    session,
    async () => {
      legacyCalls += 1;
      return 'legacy-result';
    },
    { reason: 'combatStart' },
  );

  assert.deepEqual(outcome, { executed: true, result: 'legacy-result' });
  assert.equal(syncCalls, 1);
  assert.equal(session.pendingCount(), 0);
  assert.equal(legacyCalls, 1);
});

test('does not execute a compatibility action when the local revision changes during its drain', async () => {
  let releaseFirstSync;
  let markFirstSyncStarted;
  const firstSyncStarted = new Promise(resolve => { markFirstSyncStarted = resolve; });
  const firstSyncGate = new Promise(resolve => { releaseFirstSync = resolve; });
  let syncCalls = 0;
  const session = makeSession({
    syncRequest: async ({ entries }) => {
      syncCalls += 1;
      if (syncCalls === 1) {
        markFirstSyncStarted();
        await firstSyncGate;
      }
      return {
        status: 'ok',
        confirmedThroughSeq: entries.at(-1).seq,
        results: [],
      };
    },
  });
  assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' }).accepted, true);
  let legacyCalls = 0;

  const outcomePromise = exploreSessionApi.runWithStableExploreSession(
    session,
    async () => { legacyCalls += 1; },
    { reason: 'combatStart' },
  );
  await firstSyncStarted;
  assert.equal(session.recordRoomAction('friendlyNpc.choose', { itemId: 'guard-charm' }).accepted, true);
  releaseFirstSync();
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { executed: false, result: null });
  assert.equal(syncCalls, 2, 'the forced drain still flushes the newly appended entry');
  assert.equal(session.pendingCount(), 0);
  assert.equal(legacyCalls, 0, 'the changed local stream must fence the compatibility API');
});
