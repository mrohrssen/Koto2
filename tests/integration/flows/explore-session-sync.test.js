import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { startExplorationRun } from '../helpers/game-flow.js';

function staleEpochDifferentFrom(currentEpoch) {
  return currentEpoch === 'ese_0000000000000000'
    ? 'ese_ffffffffffffffff'
    : 'ese_0000000000000000';
}

function buildProceedEntryFromPreparedRoom(preparedRoom, seq = 1) {
  return {
    seq,
    actionId: `run_es_${String(seq).padStart(8, '0')}`,
    kind: 'proceed',
    roomIndex: preparedRoom.index,
    roomId: preparedRoom.roomId,
    actionSeq: preparedRoom.actionSeq,
    payload: {},
  };
}

describe('POST /api/game/explore/sync', () => {
  let client;
  let cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('missing or empty entries array returns 400', async () => {
    await client.loginAsNewUser();

    const missingEntries = await client.post('/api/game/explore/sync', {
      sessionEpoch: 'ese_0000000000000000',
    });
    assert.equal(missingEntries.status, 400);
    assert.equal(missingEntries.body.error, 'entries array required');

    const emptyEntries = await client.post('/api/game/explore/sync', {
      sessionEpoch: 'ese_0000000000000000',
      entries: [],
    });
    assert.equal(emptyEntries.status, 400);
    assert.equal(emptyEntries.body.error, 'entries array required');
  });

  it('stale sessionEpoch after a real exploration run returns a corrected authoritative state', async () => {
    await startExplorationRun(client);

    const stateRes = await client.getState();
    assert.equal(stateRes.status, 200, `state fetch failed: ${JSON.stringify(stateRes.body)}`);

    const exploreRunway = stateRes.body.run?.exploreRunway;
    assert.ok(exploreRunway, 'state should include exploreRunway');
    assert.match(exploreRunway.sessionEpoch, /^ese_[0-9a-f]{16}$/);
    assert.ok(
      Array.isArray(exploreRunway.preparedRooms) && exploreRunway.preparedRooms.length > 0,
      `expected preparedRooms, got: ${JSON.stringify(exploreRunway.preparedRooms)}`
    );

    const entry = buildProceedEntryFromPreparedRoom(exploreRunway.preparedRooms[0], 1);
    const syncRes = await client.post('/api/game/explore/sync', {
      sessionEpoch: staleEpochDifferentFrom(exploreRunway.sessionEpoch),
      entries: [entry],
    });

    assert.equal(syncRes.status, 200, `sync failed: ${JSON.stringify(syncRes.body)}`);
    assert.equal(syncRes.body.status, 'corrected');
    assert.equal(syncRes.body.reason, 'session_epoch_mismatch');
    assert.equal(syncRes.body.confirmedThroughSeq, null);
    assert.equal(syncRes.body.rejectedSeq, 1);
    assert.deepEqual(syncRes.body.results, []);
    assert.ok(syncRes.body.state, 'corrected response should include state');
    assert.ok(syncRes.body.authoritativeState, 'corrected response should include authoritativeState');
    assert.equal(syncRes.body.authoritativeState.run?.currentRoom, syncRes.body.state.run?.currentRoom);
    assert.equal(
      syncRes.body.authoritativeState.run?.exploreRunway?.sessionEpoch,
      syncRes.body.state.run?.exploreRunway?.sessionEpoch
    );
    assert.ok(syncRes.body.exploreRunway, 'corrected response should include exploreRunway');
    assert.equal(syncRes.body.exploreRunway.sessionEpoch, exploreRunway.sessionEpoch);
  });
});
