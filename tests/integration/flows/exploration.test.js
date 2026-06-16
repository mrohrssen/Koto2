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
    assert.ok(Array.isArray(res.body.run.revealedRooms), 'client state should include the reveal buffer');
    assert.ok(res.body.run.revealedRooms.length <= 2, 'reveal buffer should include current room plus at most one future room');
    assert.equal(res.body.run.revealedRooms[0].index, res.body.run.currentRoom);
    assert.ok(res.body.run.exploreRunway, 'client state should include exploreRunway');
    assert.equal(res.body.run.exploreRunway.preparedAhead, 5);
    assert.ok(
      res.body.run.exploreRunway.preparedRooms.length <= 6,
      'runway includes current room plus at most five ahead'
    );
    assert.equal(res.body.run.exploreRunway.preparedRooms[0].index, res.body.run.currentRoom);
    assert.equal(res.body.run.revealedRooms.length <= 2, true, 'legacy reveal remains current plus one');
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
    assert.ok(proceedRes.body.state.run.revealedRooms.length <= 2);
    assert.equal(proceedRes.body.state.run.revealedRooms[0].index, proceedRes.body.state.run.currentRoom);
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
});
