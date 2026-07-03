import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { startExplorationRun, queueRooms, clearQueuedRooms } from '../helpers/game-flow.js';

describe('exploration flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    await startExplorationRun(client);
    await client.post('/api/game/debug-mode', { enabled: true });
  });

  afterEach(async () => {
    try { await clearQueuedRooms(client); } catch { /* ignore */ }
    await cleanup();
  });

  it('starts a run and enters exploration phase', async () => {
    const res = await client.getState();
    assert.equal(res.status, 200);
    assert.ok(res.body.run, 'run should exist');
    assert.ok(res.body.run.currentArea, 'run.currentArea should exist');
    assert.equal(Object.hasOwn(res.body.run, 'rooms'), false, 'client state must not expose full run.rooms');
    assert.equal(Object.hasOwn(res.body.run, 'revealedRooms'), false, 'retired legacy reveal buffer must not ride along');
    assert.ok(res.body.run.exploreRunway, 'client state should include exploreRunway');
    assert.equal(res.body.run.exploreRunway.preparedAhead, 5);
    assert.ok(
      res.body.run.exploreRunway.preparedRooms.length <= 6,
      'runway includes current room plus at most five ahead'
    );
    assert.equal(res.body.run.exploreRunway.preparedRooms[0].index, res.body.run.currentRoom);
    assert.equal(typeof res.body.run.roomActionSeq, 'number');
  });

  it('rotates explore session epoch on state fetch during active regular explore', async () => {
    const first = await client.get('/api/game/state');
    const firstEpoch = first.body.run?.exploreRunway?.sessionEpoch;
    const second = await client.get('/api/game/state');
    const secondEpoch = second.body.run?.exploreRunway?.sessionEpoch;

    assert.match(firstEpoch, /^ese_[0-9a-f]{16}$/);
    assert.match(secondEpoch, /^ese_[0-9a-f]{16}$/);
    assert.notEqual(secondEpoch, firstEpoch);
  });

  it('proceeds into a queued encounter room', async () => {
    // Skip the current room so proceed is allowed
    await client.post('/api/game/debug-skip-room', {});

    await queueRooms(client, ['encounter']);

    const proceedRes = await client.post('/api/game/proceed', {});
    assert.equal(proceedRes.status, 200, `proceed failed: ${JSON.stringify(proceedRes.body)}`);

    const room = proceedRes.body.state.room;
    assert.ok(room, 'state should include the current room');
    assert.equal(room.type, 'encounter');
    assert.equal(Object.hasOwn(proceedRes.body.state.run, 'rooms'), false, 'proceed state must not expose full run.rooms');
    assert.equal(Object.hasOwn(proceedRes.body.state.run, 'revealedRooms'), false, 'proceed state must not expose the retired reveal buffer');
    const proceedRunway = proceedRes.body.state.run.exploreRunway;
    assert.ok(proceedRunway, 'proceed state should include exploreRunway');
    assert.equal(proceedRunway.preparedRooms[0].index, proceedRes.body.state.run.currentRoom);
  });

  it('proceeds into a queued friendly NPC room without leaking combat state', async () => {
    // Skip the current room so proceed is allowed
    await client.post('/api/game/debug-skip-room', {});

    await queueRooms(client, ['friendlyNpc']);

    const proceedRes = await client.post('/api/game/proceed', {});
    assert.equal(proceedRes.status, 200, `proceed failed: ${JSON.stringify(proceedRes.body)}`);

    const room = proceedRes.body.state.room;
    assert.ok(room, 'state should include the current room');
    assert.equal(room.type, 'friendlyNpc');
    assert.ok(!proceedRes.body.state.combat,
      'combat state should be null in a friendly NPC room');
    assert.equal(proceedRes.body.state.phase, 'friendlyNpc',
      'phase should be friendlyNpc, not combat');
  });

  // Regression: F1 (explore subway rooms tier). Proceeding via the legacy
  // /api/game/proceed advances run.currentRoom + roomActionSeq, which
  // invalidates the cached exploreRunway. getState()'s sync snapshot then
  // returns an empty preparedRooms (by design — rebuilding is async), so the
  // proceed route MUST rebuild the runway before responding. Otherwise the
  // client adopts a runway with no prepared room for the new current room and
  // getExploreSession().recordRoomAction(...) rejects with 'noPreparedRoom',
  // surfacing the offline "Connection is spotty" soft pause while ONLINE.
  it('proceed rebuilds the explore runway so the new room accepts session actions', async () => {
    await client.post('/api/game/debug-skip-room', {});
    await queueRooms(client, ['shrine']);

    const proceedRes = await client.post('/api/game/proceed', {});
    assert.equal(proceedRes.status, 200, `proceed failed: ${JSON.stringify(proceedRes.body)}`);

    const state = proceedRes.body.state;
    assert.equal(state.room.type, 'shrine');

    const runway = state.run.exploreRunway;
    assert.ok(runway, 'proceed response must include exploreRunway');
    assert.equal(runway.currentRoom, state.run.currentRoom,
      'runway cursor should track the advanced current room');
    assert.ok(
      Array.isArray(runway.preparedRooms) && runway.preparedRooms.length > 0,
      `proceed must rebuild preparedRooms, got: ${JSON.stringify(runway.preparedRooms)}`
    );

    const currentPrepared = runway.preparedRooms.find(entry => entry.index === state.run.currentRoom);
    assert.ok(currentPrepared,
      'runway must include a prepared room for the new current room (else recordRoomAction -> noPreparedRoom -> soft pause online)');
    assert.ok(
      Array.isArray(currentPrepared.acceptedActions)
        && currentPrepared.acceptedActions.includes('shrine.choose'),
      `current prepared room must accept its interaction, got: ${JSON.stringify(currentPrepared.acceptedActions)}`
    );
    assert.equal(currentPrepared.offlineReady, true,
      'freshly-prepared support room should be offline ready');

    // The rebuild must PRESERVE the session epoch across proceeds (unlike
    // /api/game/state, which deliberately rotates it): rotating mid-run would
    // reset the client's queued session. A shrine room does not gate proceed,
    // so a second proceed advances again and must keep the same epoch.
    assert.match(runway.sessionEpoch, /^ese_[0-9a-f]{16}$/);
    await queueRooms(client, ['encounter']);
    const secondProceed = await client.post('/api/game/proceed', {});
    assert.equal(secondProceed.status, 200, `second proceed failed: ${JSON.stringify(secondProceed.body)}`);
    assert.equal(
      secondProceed.body.state.run.exploreRunway.sessionEpoch,
      runway.sessionEpoch,
      'proceed must not rotate the explore session epoch (would reset the client session mid-run)'
    );
  });
});
