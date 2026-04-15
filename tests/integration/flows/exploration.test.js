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
