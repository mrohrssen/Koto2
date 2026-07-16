import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { startExplorationRun, queueRooms, clearQueuedRooms, setupRunBeforeArea, finishExplorationSetup } from '../helpers/game-flow.js';
import { clearSrsCache, createCard, getDeckCards } from '../../../src/game/internal-srs.js';
import { clearDiscoveryTracking, getDiscoveryStatus } from '../../../src/word-tracking.js';

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
    const firstEntry = startRes.body.exploreRunway.preparedRooms.find(
      entry => entry.index === startRes.body.state.run.currentRoom,
    );
    assert.ok(firstEntry, 'start response includes the current runway entry');
    assert.deepEqual(firstEntry.acceptedActions, ['combat.cycle']);
    assert.equal(
      firstEntry.interactionPayload.combatId,
      startRes.body.state.combat?.optimistic?.combatId,
    );
    assert.deepEqual(
      firstEntry.interactionPayload.combatStart.enemies,
      startRes.body.state.combat?.enemies,
    );
    assert.deepEqual(
      firstEntry.interactionPayload.seedChain,
      startRes.body.state.combat?.optimistic?.turnSeeds,
    );
    assert.equal(startRes.body.state.room?.preparedCombat, undefined);

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
    const replayEntry = replayRes.body.exploreRunway.preparedRooms.find(
      entry => entry.index === replayRes.body.state.run.currentRoom,
    );
    assert.ok(replayEntry, 'replay response includes the current runway entry');
    assert.deepEqual(replayEntry.acceptedActions, ['combat.cycle']);
    assert.equal(
      replayEntry.interactionPayload.combatId,
      firstEntry.interactionPayload.combatId,
    );
    assert.deepEqual(
      replayEntry.interactionPayload.combatStart.enemies,
      firstEntry.interactionPayload.combatStart.enemies,
    );
    assert.deepEqual(
      replayEntry.interactionPayload.seedChain,
      firstEntry.interactionPayload.seedChain,
    );
    assert.equal(replayRes.body.state.room?.preparedCombat, undefined);
  });

  it('grades offline speed-review and word-discovery commits once through the authenticated sync route', async () => {
    const login = await client.loginAsNewUser('speed-sync-user', 'test-pass-123');
    const userId = login.body?.user?.id;
    assert.ok(userId, `login failed: ${JSON.stringify(login.body)}`);
    const created = await client.createPlayer('SpeedSyncPlayer');
    assert.equal(created.status, 200);
    createCard(userId, 'vocab', '明るい', { word: '明るい' });

    await client.post('/api/game/select-starter', { starterId: 'starter-fire' });
    await client.post('/api/game/select-starter', { starterId: 'starter-water' });
    await client.post('/api/game/select-starter', { starterId: 'starter-wood' });
    await client.claimDailyCrystals();
    const startRun = await client.post('/api/game/start-run', {});
    assert.equal(startRun.status, 200, `start-run failed: ${JSON.stringify(startRun.body)}`);
    await client.post('/api/game/debug-mode', { enabled: true });
    await clearQueuedRooms(client);
    await queueRooms(client, ['speedReviewRoom']);
    await finishExplorationSetup(client);

    const skipped = await client.post('/api/game/debug-skip-room', {});
    assert.equal(skipped.status, 200, `debug skip failed: ${JSON.stringify(skipped.body)}`);
    const proceeded = await client.post('/api/game/proceed', {});
    assert.equal(proceeded.status, 200, `proceed failed: ${JSON.stringify(proceeded.body)}`);
    const state = proceeded.body.state;
    const runway = state.run?.exploreRunway;
    const prepared = runway?.preparedRooms?.find(entry => entry.index === state.run.currentRoom);
    assert.equal(prepared?.room?.type, 'speedReviewRoom');
    assert.deepEqual(prepared.interactionPayload.snapshotWordKeys, ['明るい']);

    const before = JSON.stringify(getDeckCards(userId, 'vocab').find(card => card.id === '明るい'));
    const entry = {
      seq: 1,
      actionId: 'run_es_speedgrade1',
      kind: 'speedReview.commit',
      roomIndex: prepared.index,
      roomId: prepared.roomId,
      actionSeq: prepared.actionSeq,
      payload: {
        roomId: prepared.roomId,
        word: '明るい',
        grade: 'again',
        commitIndex: 0,
      },
    };

    const first = await client.post('/api/game/explore/sync', {
      sessionEpoch: runway.sessionEpoch,
      entries: [entry],
    });
    assert.equal(first.status, 200, `first sync failed: ${JSON.stringify(first.body)}`);
    assert.equal(first.body.status, 'ok');
    assert.equal(first.body.results[0].knownWordReview?.mastered, false);
    const afterFirst = JSON.stringify(getDeckCards(userId, 'vocab').find(card => card.id === '明るい'));
    assert.notEqual(afterFirst, before, 'the queued grade must reach the authenticated user SRS');

    const replay = await client.post('/api/game/explore/sync', {
      sessionEpoch: runway.sessionEpoch,
      entries: [entry],
    });
    const duplicate = await client.post('/api/game/explore/sync', {
      sessionEpoch: runway.sessionEpoch,
      entries: [{
        ...entry,
        seq: 2,
        actionId: 'run_es_speedgrade2',
        payload: { ...entry.payload, grade: 'good' },
      }],
    });
    const afterRetries = JSON.stringify(getDeckCards(userId, 'vocab').find(card => card.id === '明るい'));

    assert.equal(replay.body.results[0].replayed, true);
    assert.equal(duplicate.body.status, 'ok');
    assert.equal(duplicate.body.results[0].alreadyCommitted, true);
    assert.equal(afterRetries, afterFirst,
      'ledger replay and a different action for the same review key must not grade twice');

    // Reuse the same authenticated user/app to stay below the integration auth
    // rate limit while proving the discovery-specific daily counter path too.
    createCard(userId, 'vocab', '火', { word: '火' });
    const forced = await client.post('/api/game/debug-force-phase', { phase: 'wordDiscovery' });
    assert.equal(forced.status, 200, `force phase failed: ${JSON.stringify(forced.body)}`);
    const stateRes = await client.getState();
    assert.equal(stateRes.status, 200, `state failed: ${JSON.stringify(stateRes.body)}`);
    const discoveryRunway = stateRes.body.run?.exploreRunway;
    const discoveryPrepared = discoveryRunway?.preparedRooms?.find(
      preparedEntry => preparedEntry.index === stateRes.body.run.currentRoom,
    );
    assert.equal(discoveryPrepared?.room?.type, 'wordDiscovery');
    assert.deepEqual(discoveryPrepared.interactionPayload.snapshotWordKeys, ['火']);

    const beforeCard = JSON.stringify(getDeckCards(userId, 'vocab').find(card => card.id === '火'));
    const beforeStatus = getDiscoveryStatus(userId, 10);
    const discoveryEntry = {
      seq: 1,
      actionId: 'run_es_wordgrade01',
      kind: 'wordDiscovery.review',
      roomIndex: discoveryPrepared.index,
      roomId: discoveryPrepared.roomId,
      actionSeq: discoveryPrepared.actionSeq,
      payload: {
        roomId: discoveryPrepared.roomId,
        word: '火',
        grade: 'again',
        reviewIndex: 0,
      },
    };

    const firstDiscovery = await client.post('/api/game/explore/sync', {
      sessionEpoch: discoveryRunway.sessionEpoch,
      entries: [discoveryEntry],
    });
    assert.equal(firstDiscovery.status, 200, `first sync failed: ${JSON.stringify(firstDiscovery.body)}`);
    assert.equal(firstDiscovery.body.status, 'ok');
    assert.deepEqual(firstDiscovery.body.results[0].knownWordReview, {
      word: '火',
      grade: 'again',
      mastered: false,
      isKnown: true,
    });
    assert.equal(firstDiscovery.body.state.room.wordDiscovery.wordsLearned, 1);
    const afterFirstCard = JSON.stringify(getDeckCards(userId, 'vocab').find(card => card.id === '火'));
    const afterFirstStatus = getDiscoveryStatus(userId, 10);
    assert.notEqual(afterFirstCard, beforeCard);
    assert.equal(afterFirstStatus.todayCount, beforeStatus.todayCount + 1);

    const discoveryReplay = await client.post('/api/game/explore/sync', {
      sessionEpoch: discoveryRunway.sessionEpoch,
      entries: [discoveryEntry],
    });
    const discoveryDuplicate = await client.post('/api/game/explore/sync', {
      sessionEpoch: discoveryRunway.sessionEpoch,
      entries: [{ ...discoveryEntry, seq: 2, actionId: 'run_es_wordgrade02' }],
    });

    assert.equal(discoveryReplay.body.results[0].replayed, true);
    assert.equal(discoveryDuplicate.body.status, 'ok');
    assert.equal(discoveryDuplicate.body.results[0].alreadyCommitted, true);
    assert.equal(
      JSON.stringify(getDeckCards(userId, 'vocab').find(card => card.id === '火')),
      afterFirstCard,
    );
    assert.equal(getDiscoveryStatus(userId, 10).todayCount, afterFirstStatus.todayCount);
    clearDiscoveryTracking(userId);
    clearSrsCache(userId);
  });

  it('keeps queued room types identical from prepared runway through server transition', async () => {
    await setupRunBeforeArea(client);
    const tutorialRes = await client.post('/api/game/tutorial-fusion-complete', {});
    assert.equal(tutorialRes.status, 200, `tutorial completion failed: ${JSON.stringify(tutorialRes.body)}`);
    await client.post('/api/game/debug-mode', { enabled: true });
    await clearQueuedRooms(client);
    const expectedTypes = ['shrine', 'encounter', 'friendlyNpc', 'encounter'];
    await queueRooms(client, expectedTypes);
    let state = await finishExplorationSetup(client);

    const offersRes = await client.post('/api/game/skill-master-offers', {});
    if (offersRes.status === 200 && offersRes.body.offered?.length > 0) {
      const chooseRes = await client.post('/api/game/skill-master-choose', {
        skillId: offersRes.body.offered[0].id,
      });
      assert.equal(chooseRes.status, 200);
      state = chooseRes.body.state || state;
    }

    for (let offset = 0; offset < expectedTypes.length; offset += 1) {
      const nextIndex = offset + 1;
      const prepared = state.run?.exploreRunway?.preparedRooms?.find(
        room => room.index === nextIndex,
      );
      assert.ok(prepared, `runway should prepare queued room index ${nextIndex}`);
      assert.equal(prepared.room?.type, expectedTypes[offset]);

      const skipped = await client.post('/api/game/debug-skip-room', {});
      assert.equal(skipped.status, 200, `debug skip failed: ${JSON.stringify(skipped.body)}`);
      const proceeded = await client.post('/api/game/proceed', {});
      assert.equal(proceeded.status, 200, `proceed failed: ${JSON.stringify(proceeded.body)}`);
      state = proceeded.body.state;
      assert.equal(state.run.currentRoom, nextIndex);
      assert.equal(state.room?.type, expectedTypes[offset]);
      assert.equal(state.room?.id, prepared.roomId);
      const transitioned = state.run.exploreRunway.preparedRooms.find(
        room => room.index === nextIndex,
      );
      assert.equal(transitioned?.room?.type, expectedTypes[offset]);
      assert.equal(transitioned?.roomId, prepared.roomId);
    }

    const fixedNpc = state.run.exploreRunway.preparedRooms.find(room => room.index === 5);
    assert.equal(fixedNpc?.room?.type, 'npcBattle');
    assert.equal(fixedNpc?.roomId, 'hajimari-no-hiroba_room6');
  });
});
