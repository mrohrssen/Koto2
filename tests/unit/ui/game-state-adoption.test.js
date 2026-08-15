import test from 'node:test';
import assert from 'node:assert/strict';
import * as gameStateAdoption from '../../../public/js/ui/game-state-adoption.js';
import { createExploreSession } from '../../../public/js/ui/explore-session.js';
import { createExploreSessionPauseController } from '../../../public/js/ui/explore-session-pause-controller.js';
import { FenceSuperseded } from '../../../public/js/async-ownership-fence.js';

const {
  captureGameStateFetchFence,
  isGameStateErrorResponse,
  adoptCapturedExploreRecoveryState,
} = gameStateAdoption;

function runway(actionSeq = 7) {
  return {
    sessionEpoch: 'ese_game_state_adoption',
    currentRoom: 0,
    preparedRooms: [{
      index: 0,
      roomId: 'room-0',
      actionSeq,
      room: { id: 'room-0', type: 'shrine' },
      acceptedActions: ['shrine.choose'],
      actionEffects: {},
      dependencies: [],
      offlineReady: true,
    }],
  };
}

function completeTransport(body = null) {
  return {
    transport: true,
    httpStatus: 200,
    body,
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
  };
}

test('rejects HTTP error bodies but accepts explicit fresh-account state', () => {
  assert.equal(isGameStateErrorResponse({ error: 'HTTP 500' }), true);
  assert.equal(isGameStateErrorResponse({ error: 'rate_limited' }), true);
  assert.equal(isGameStateErrorResponse({ error: 'forbidden' }), true);
  assert.equal(isGameStateErrorResponse({
    player: null,
    run: null,
    meta: { prologueComplete: false },
    phase: 'no_save',
  }), false);
});

test('a no-session state fetch becomes stale when a successor Explore session appears', async () => {
  let activeSession = null;
  let releaseFetch;
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const capture = captureGameStateFetchFence(null, () => activeSession);
  const request = capture.fence.step('fetch game state', () => fetchGate);

  activeSession = { id: 'successor-session' };
  releaseFetch({ player: { id: 'player_1' } });

  await assert.rejects(request, FenceSuperseded);
});

test('captured recovery installs state after deferred adoption and before resume UI', async () => {
  const events = [];
  let state = { version: 'old' };
  const session = createExploreSession({
    syncRequest: async () => completeTransport(),
    onResume: () => {
      events.push('resume/UI');
      assert.equal(state.version, 'fresh');
    },
  });
  session.adoptRunway(runway());
  session.pause('nextRoomNotReady');
  const captureFence = session.captureFence;
  session.captureFence = options => {
    const capture = captureFence(options);
    const expectRunwayAdoption = capture.expectRunwayAdoption;
    capture.expectRunwayAdoption = (...args) => {
      const transaction = expectRunwayAdoption(...args);
      const apply = transaction.apply;
      transaction.apply = () => {
        events.push('commit/adopt');
        return apply();
      };
      return transaction;
    };
    return capture;
  };
  const controller = createExploreSessionPauseController({
    getSession: () => session,
    refreshRunwayState: async ({ capture }) => adoptCapturedExploreRecoveryState({
      capture,
      data: { player: { id: 'player-1' }, run: { exploreRunway: runway(11) }, version: 'fresh' },
      updateGameState: data => { state = data; events.push('state'); },
    }),
    reviewAuthoritativeState: async () => false,
    renderNarration: () => {}, renderActions: () => {}, showToast: () => {},
    schedule: () => null, cancel: () => {}, windowTarget: null, documentTarget: null,
  });

  await controller.triggerRecovery();

  assert.deepEqual(events, ['commit/adopt', 'state', 'resume/UI']);
  assert.equal(session.currentPreparedRoom().actionSeq, 11);
  controller.dispose();
});

test('stale captured recovery cannot adopt runway or mutate game state', () => {
  const session = createExploreSession({ syncRequest: async () => completeTransport() });
  session.adoptRunway(runway());
  const capture = session.captureFence({ pending: 'empty' });
  session.pause('authRequired');
  let updates = 0;

  assert.throws(
    () => adoptCapturedExploreRecoveryState({
      capture,
      data: { player: { id: 'player-1' }, run: { exploreRunway: runway(12) } },
      updateGameState: () => { updates += 1; },
    }),
    FenceSuperseded,
  );
  assert.equal(updates, 0);
  assert.equal(session.currentPreparedRoom().actionSeq, 7);
});
