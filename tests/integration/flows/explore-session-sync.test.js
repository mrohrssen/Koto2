import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { startExplorationRun, queueRooms, clearQueuedRooms, setupRunBeforeArea, finishExplorationSetup } from '../helpers/game-flow.js';

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

  it('routes encounter.start through /explore/sync, starts the prepared combat, and re-POST is idempotent', async () => {
    // Queued types apply to rooms entered via proceed (room 1+), so queue a run of
    // encounters and walk to the first one that becomes the CURRENT room.
    await setupRunBeforeArea(client);
    await client.post('/api/game/debug-mode', { enabled: true });
    await clearQueuedRooms(client);
    await queueRooms(client, ['encounter', 'encounter', 'encounter']);
    await finishExplorationSetup(client);

    // Clear any pending initial skill-master offer.
    const offersRes = await client.post('/api/game/skill-master-offers', {});
    if (offersRes.status === 200 && offersRes.body.offered?.length > 0) {
      await client.post('/api/game/skill-master-choose', { skillId: offersRes.body.offered[0].id });
    }

    // Walk forward until the CURRENT room is an encounter. Room 0 (and any support
    // rooms before the queued encounters) are proceeded past; a gated skillMaster is
    // completed first. Uses the real proceed/skill routes, not the sync endpoint.
    let runway = null;
    let combatRoom = null;
    for (let hop = 0; hop < 6; hop += 1) {
      const stateNow = await client.getState();
      runway = stateNow.body.run?.exploreRunway;
      assert.ok(runway?.preparedRooms?.length, 'expected prepared runway rooms');
      const current = runway.preparedRooms[0];
      if (current.acceptedActions?.includes('encounter.start')) {
        combatRoom = current;
        break;
      }
      if (current.room?.type === 'skillMaster') {
        const so = await client.post('/api/game/skill-master-offers', {});
        if (so.status === 200 && so.body.offered?.length > 0) {
          await client.post('/api/game/skill-master-choose', { skillId: so.body.offered[0].id });
        }
      }
      const proceedRes = await client.post('/api/game/proceed', {});
      assert.equal(proceedRes.status, 200, `proceed failed at hop ${hop}: ${JSON.stringify(proceedRes.body)}`);
    }
    assert.ok(combatRoom, 'expected to reach an encounter room as the current room');

    // ---- encounter.start routes through the sync endpoint and starts combat ----
    // (The full combat.cycle replay path — victory/defeat/mismatch/dedup — is proven
    //  deterministically in tests/unit/game/explore-session-sync-combat.test.js with
    //  controlled enemy rolls; here we pin the HTTP route + ledger wiring, which the
    //  honest-client hash reconstruction cannot do reliably given enemy-roll variance.)
    const startEntry = {
      seq: 1,
      actionId: 'run_es_00090001',
      kind: 'encounter.start',
      roomIndex: combatRoom.index,
      roomId: combatRoom.roomId,
      actionSeq: combatRoom.actionSeq,
      payload: {},
    };
    const startRes = await client.post('/api/game/explore/sync', { sessionEpoch: runway.sessionEpoch, entries: [startEntry] });
    assert.equal(startRes.status, 200, `start sync failed: ${JSON.stringify(startRes.body)}`);
    assert.equal(startRes.body.status, 'ok');
    assert.equal(startRes.body.confirmedThroughSeq, 1);
    assert.equal(startRes.body.results[0].started, true);
    assert.equal(startRes.body.results[0].combatId, combatRoom.interactionPayload?.combatId, 'started the prepared combat');
    assert.equal(startRes.body.state.combat?.active, true, 'combat active on the server after encounter.start');

    // ---- Idempotent re-POST: the same actionId replays from the ledger ----
    const replayRes = await client.post('/api/game/explore/sync', {
      sessionEpoch: runway.sessionEpoch,
      entries: [startEntry],
    });
    assert.equal(replayRes.status, 200, `replay sync failed: ${JSON.stringify(replayRes.body)}`);
    assert.equal(replayRes.body.status, 'ok');
    assert.equal(replayRes.body.confirmedThroughSeq, 1);
    assert.equal(replayRes.body.results[0].replayed, true, 'encounter.start replayed from the ledger');
    // Still exactly one active combat with the same id — no double-start.
    assert.equal(replayRes.body.state.combat?.active, true);
    assert.equal(replayRes.body.state.combat?.optimistic?.combatId, startRes.body.state.combat?.optimistic?.combatId);
  });
});
