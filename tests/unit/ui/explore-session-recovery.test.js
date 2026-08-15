import test from 'node:test';
import assert from 'node:assert/strict';
import { createExploreSession } from '../../../public/js/ui/explore-session.js';
import { adoptExploreSessionRecoveryState } from '../../../public/js/ui/explore-session-recovery.js';

function makeRunway(overrides = {}) {
  return {
    protocolVersion: 2,
    sessionEpoch: 'ese_recovery_current111',
    currentRoom: 0,
    preparedRooms: [{
      index: 0,
      roomId: 'room_recovery_0',
      actionSeq: 10,
      offlineReady: true,
      acceptedActions: ['friendlyNpc.choose'],
      actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
    }],
    ...overrides,
  };
}

function queuePendingAction(session) {
  session.adoptRunway(makeRunway());
  const queued = session.recordRoomAction('friendlyNpc.choose', { itemId: 'field-tonic' });
  assert.equal(queued.accepted, true);
}

function strictOkTransport() {
  return {
    transport: true,
    httpStatus: 200,
    body: { protocolVersion: 1, status: 'ok', confirmedThroughSeq: 0, results: [] },
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
  };
}

test('post-reauth recovery adopts authoritative same-epoch state while retaining its pending log', async () => {
  const session = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(session);
  const nextRunway = makeRunway({ preparedRooms: [{
    ...makeRunway().preparedRooms[0], actionSeq: 11,
  }] });
  const capture = session.captureFence({ pending: 'preserve' });

  const adopted = await adoptExploreSessionRecoveryState({
    capture,
    getSession: () => session,
    fetchState: async () => ({ player: { id: 'player_1' }, run: { exploreRunway: nextRunway } }),
  });

  assert.equal(adopted, true);
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.currentPreparedRoom().actionSeq, 11);
});

test('post-reauth recovery uses its supplied preserve capture without recapturing', async () => {
  const session = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(session);
  const capture = session.captureFence({ pending: 'preserve' });
  let recaptureCalls = 0;
  session.captureFence = () => {
    recaptureCalls += 1;
    throw new Error('auth recovery must use its supplied capture');
  };

  const adopted = await adoptExploreSessionRecoveryState({
    capture,
    expectedSession: session,
    getSession: () => session,
    fetchState: async () => ({ player: { id: 'player_1' }, run: { exploreRunway: makeRunway() } }),
  });

  assert.equal(adopted, true);
  assert.equal(recaptureCalls, 0);
  assert.equal(session.pendingCount(), 1);
});

test('writer-conflict review adopts authoritative same-epoch state while retaining its pending log', async () => {
  const session = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(session);
  const nextRunway = makeRunway({ preparedRooms: [{
    ...makeRunway().preparedRooms[0], actionSeq: 12,
  }] });
  const capture = session.captureFence({ pending: 'preserve' });

  const adopted = await adoptExploreSessionRecoveryState({
    capture,
    getSession: () => session,
    fetchState: async () => ({ player: { id: 'player_1' }, run: { exploreRunway: nextRunway } }),
  });

  assert.equal(adopted, true);
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.currentPreparedRoom().actionSeq, 12);
});

test('recovery rejects a superseded response when its preserved pending log changes', async () => {
  const session = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(session);
  let resolveFetch;
  const fetchState = () => new Promise(resolve => { resolveFetch = resolve; });
  const capture = session.captureFence({ pending: 'preserve' });

  const recovery = adoptExploreSessionRecoveryState({ capture, getSession: () => session, fetchState });
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'second-tonic' });
  resolveFetch({ player: { id: 'player_1' }, run: { exploreRunway: makeRunway({
    preparedRooms: [{ ...makeRunway().preparedRooms[0], actionSeq: 13 }],
  }) } });

  assert.equal(await recovery, false);
  assert.equal(session.pendingCount(), 2);
  assert.equal(session.currentPreparedRoom().actionSeq, 10);
});

test('recovery reports failure and retains pending work when its state fetch fails', async () => {
  const session = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(session);
  const capture = session.captureFence({ pending: 'preserve' });

  const adopted = await adoptExploreSessionRecoveryState({
    capture,
    getSession: () => session,
    fetchState: async () => { throw new Error('offline'); },
  });

  assert.equal(adopted, false);
  assert.equal(session.pendingCount(), 1);
});

test('expected-session recovery refuses a replacement before fetching or adopting it', async () => {
  const sessionA = createExploreSession({ syncRequest: async () => strictOkTransport() });
  const sessionB = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(sessionB);
  const exactB = sessionB.snapshot();
  let fetchCalls = 0;
  const capture = sessionA.captureFence({ pending: 'preserve' });

  const adopted = await adoptExploreSessionRecoveryState({
    capture,
    expectedSession: sessionA,
    getSession: () => sessionB,
    fetchState: async () => {
      fetchCalls += 1;
      return { player: { id: 'player_1' }, run: { exploreRunway: makeRunway() } };
    },
  });

  assert.equal(adopted, false);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(sessionB.snapshot(), exactB);
  assert.equal(sessionB.currentPreparedRoom().actionSeq, 10);
});

test('expected-session recovery fences a replacement during its state fetch', async () => {
  const sessionA = createExploreSession({ syncRequest: async () => strictOkTransport() });
  const sessionB = createExploreSession({ syncRequest: async () => strictOkTransport() });
  queuePendingAction(sessionA);
  queuePendingAction(sessionB);
  const exactB = sessionB.snapshot();
  let currentSession = sessionA;
  let resolveFetch;
  const capture = sessionA.captureFence({
    pending: 'preserve',
    leases: [{ label: 'active session', isCurrent: () => currentSession === sessionA }],
  });
  const recovery = adoptExploreSessionRecoveryState({
    capture,
    expectedSession: sessionA,
    getSession: () => currentSession,
    fetchState: () => new Promise(resolve => { resolveFetch = resolve; }),
  });

  currentSession = sessionB;
  resolveFetch({ player: { id: 'player_1' }, run: { exploreRunway: makeRunway({
    preparedRooms: [{ ...makeRunway().preparedRooms[0], actionSeq: 77 }],
  }) } });

  assert.equal(await recovery, false);
  assert.deepEqual(sessionB.snapshot(), exactB);
  assert.equal(sessionB.currentPreparedRoom().actionSeq, 10);
});
