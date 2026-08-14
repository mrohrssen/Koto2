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

test('post-reauth recovery adopts authoritative same-epoch state while retaining its pending log', async () => {
  const session = createExploreSession({ syncRequest: async () => ({ status: 'ok' }) });
  queuePendingAction(session);
  const nextRunway = makeRunway({ preparedRooms: [{
    ...makeRunway().preparedRooms[0], actionSeq: 11,
  }] });

  const adopted = await adoptExploreSessionRecoveryState({
    getSession: () => session,
    fetchState: async () => ({ player: { id: 'player_1' }, run: { exploreRunway: nextRunway } }),
  });

  assert.equal(adopted, true);
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.currentPreparedRoom().actionSeq, 11);
});

test('writer-conflict review adopts authoritative same-epoch state while retaining its pending log', async () => {
  const session = createExploreSession({ syncRequest: async () => ({ status: 'ok' }) });
  queuePendingAction(session);
  const nextRunway = makeRunway({ preparedRooms: [{
    ...makeRunway().preparedRooms[0], actionSeq: 12,
  }] });

  const adopted = await adoptExploreSessionRecoveryState({
    getSession: () => session,
    fetchState: async () => ({ player: { id: 'player_1' }, run: { exploreRunway: nextRunway } }),
  });

  assert.equal(adopted, true);
  assert.equal(session.pendingCount(), 1);
  assert.equal(session.currentPreparedRoom().actionSeq, 12);
});

test('recovery rejects a superseded response when its preserved pending log changes', async () => {
  const session = createExploreSession({ syncRequest: async () => ({ status: 'ok' }) });
  queuePendingAction(session);
  let resolveFetch;
  const fetchState = () => new Promise(resolve => { resolveFetch = resolve; });

  const recovery = adoptExploreSessionRecoveryState({ getSession: () => session, fetchState });
  session.recordRoomAction('friendlyNpc.choose', { itemId: 'second-tonic' });
  resolveFetch({ player: { id: 'player_1' }, run: { exploreRunway: makeRunway({
    preparedRooms: [{ ...makeRunway().preparedRooms[0], actionSeq: 13 }],
  }) } });

  assert.equal(await recovery, false);
  assert.equal(session.pendingCount(), 2);
  assert.equal(session.currentPreparedRoom().actionSeq, 10);
});

test('recovery reports failure and retains pending work when its state fetch fails', async () => {
  const session = createExploreSession({ syncRequest: async () => ({ status: 'ok' }) });
  queuePendingAction(session);

  const adopted = await adoptExploreSessionRecoveryState({
    getSession: () => session,
    fetchState: async () => { throw new Error('offline'); },
  });

  assert.equal(adopted, false);
  assert.equal(session.pendingCount(), 1);
});
