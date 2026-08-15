import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createExploreProtocolDriver } from './helpers/run-driver.js';

const RETIRED_ORACLE_FIELDS = [
  'pauseReason' + 'Info',
  'observedPause' + 'Policies',
  'pausePolicy' + 'Violations',
  'unrecoverable' + 'Pauses',
  'duplicateExternal' + 'Effects',
];

function assertNoRetiredOracleFields(report) {
  for (const field of RETIRED_ORACLE_FIELDS) {
    assert.equal(Object.hasOwn(report, field), false);
  }
}

describe('Explore V1 protocol safety', { concurrency: false }, () => {
  let driver;

  beforeEach(async () => {
    driver = await createExploreProtocolDriver();
  });

  afterEach(async () => {
    await driver?.cleanup();
  });

  it('commits friendlyNpc.choose then proceed through the real authenticated sync route', async () => {
    driver.link.respondOnce({ status: 200, body: {} });
    driver.link.reset();
    const choose = driver.recordFriendlyNpcChoice();
    await driver.flush();
    const proceed = driver.recordProceed();
    await driver.flush();

    const oracle = await driver.readOracle();
    assert.equal(choose.accepted, true);
    assert.equal(proceed.accepted, true);
    assert.equal(oracle.pendingCount, 0);
    assert.deepEqual(oracle.silentDeletedActionIds, []);
    assert.equal(oracle.duplicateGameEffects, 0);
    assert.equal(oracle.missingGameEffects, 0);
    assert.equal(oracle.correctedSyncsUnderPureTransport, 0);
    assert.equal(oracle.serverRoomAdvance, 1);
    assert.deepEqual(oracle.unknownPauseReasons, []);
    assertNoRetiredOracleFields(oracle);
  });

  it('retries the exact action after a request is dropped before reaching the server', async () => {
    driver.link.dropBeforeRequestOnce();

    const choose = driver.recordFriendlyNpcChoice();
    await driver.flush();

    const oracle = await driver.readOracle();
    assert.equal(oracle.pendingCount, 0);
    assert.deepEqual(oracle.requestedActionIds, [
      choose.entry.actionId,
      choose.entry.actionId,
    ]);
    assert.deepEqual(oracle.committedRecordedActionIds, [choose.entry.actionId]);
    assert.deepEqual(oracle.silentDeletedActionIds, []);
    assert.equal(oracle.duplicateGameEffects, 0);
    assert.equal(oracle.missingGameEffects, 0);
    assert.equal(oracle.correctedSyncsUnderPureTransport, 0);
  });

  it('treats a malformed 200 as indeterminate and succeeds on retry', async () => {
    driver.link.respondOnce({ status: 200, body: {} });

    const choose = driver.recordFriendlyNpcChoice();
    await driver.flush();

    const oracle = await driver.readOracle();
    assert.equal(oracle.pendingCount, 0);
    assert.deepEqual(oracle.requestedActionIds, [
      choose.entry.actionId,
      choose.entry.actionId,
    ]);
    assert.deepEqual(oracle.committedRecordedActionIds, [choose.entry.actionId]);
    assert.deepEqual(oracle.silentDeletedActionIds, []);
    assert.equal(oracle.duplicateGameEffects, 0);
    assert.equal(oracle.missingGameEffects, 0);
    assert.equal(oracle.correctedSyncsUnderPureTransport, 0);
  });

  it('replays the exact action ID when the response is lost after a real commit', async () => {
    driver.link.dropResponseAfterCommitOnce();

    const choose = driver.recordFriendlyNpcChoice();
    await driver.flush();

    const oracle = await driver.readOracle();
    assert.equal(oracle.pendingCount, 0);
    assert.deepEqual(oracle.requestedActionIds.slice(0, 2), [
      choose.entry.actionId,
      choose.entry.actionId,
    ]);
    assert.deepEqual(oracle.replayedActionIds, [choose.entry.actionId]);
    assert.deepEqual(oracle.committedRecordedActionIds, [choose.entry.actionId]);
    assert.equal(oracle.duplicateGameEffects, 0);
    assert.equal(oracle.missingGameEffects, 0);
    assert.deepEqual(oracle.silentDeletedActionIds, []);
    assert.equal(oracle.correctedSyncsUnderPureTransport, 0);
  });

  it('reports registered pause reasons as observed facts while retaining real idempotency evidence', async () => {
    driver.link.delayNext(125);
    const choose = driver.recordFriendlyNpcChoice();
    const blockedProceed = driver.recordProceed();
    await driver.flush();
    const afterDelayedChoose = driver.scheduler.now();
    driver.link.duplicateNext();
    const proceed = driver.recordProceed();
    await driver.flush();

    assert.equal(choose.accepted, true);
    assert.equal(proceed.accepted, true);
    const actionNotAccepted = driver.session.recordRoomAction('not-a-real-action', {});

    const state = await driver.client.getState();
    assert.equal(state.status, 200);
    driver.session.adoptRunway(state.body.run.exploreRunway);

    const room = driver.session.currentPreparedRoom();
    const itemId = room?.interactionPayload?.offered?.[0]?.id;
    assert.ok(itemId, 'hard-cap stimulus requires a real friendly NPC offer');
    const hardCapResults = Array.from({ length: 50 }, () => (
      driver.session.recordRoomAction('friendlyNpc.choose', {
        itemId,
        targetCreatureIndex: 0,
      })
    ));
    assert.equal(hardCapResults.every(result => result.accepted), true);
    const hardCapBlocked = driver.session.recordRoomAction('friendlyNpc.choose', {
      itemId,
      targetCreatureIndex: 0,
    });

    driver.session.reset();
    const noPreparedRoom = driver.session.recordRoomAction('proceed', {});

    const pauseCases = [
      { expected: 'dependency', accepted: blockedProceed.accepted, actual: blockedProceed.reason },
      { expected: 'actionNotAccepted', accepted: actionNotAccepted.accepted, actual: actionNotAccepted.reason },
      { expected: 'hardCap', accepted: hardCapBlocked.accepted, actual: hardCapBlocked.reason },
      { expected: 'noPreparedRoom', accepted: noPreparedRoom.accepted, actual: noPreparedRoom.reason },
    ];
    for (const pauseCase of pauseCases) {
      assert.equal(pauseCase.accepted, false, `${pauseCase.expected} must block input`);
      assert.equal(pauseCase.actual, pauseCase.expected);
    }

    const pauseOracle = await driver.readOracle();
    assert.deepEqual([...new Set(pauseOracle.observedPauseReasons)].sort(), [
      'actionNotAccepted',
      'dependency',
      'hardCap',
      'noPreparedRoom',
    ]);
    assert.deepEqual(pauseOracle.unknownPauseReasons, []);
    assertNoRetiredOracleFields(pauseOracle);
    assert.equal(pauseOracle.pendingCount, 0);
    assert.equal(pauseOracle.duplicateGameEffects, 0);
    assert.equal(pauseOracle.missingGameEffects, 0);
    assert.equal(afterDelayedChoose, 425);
    assert.ok(pauseOracle.replayedActionIds.includes(proceed.entry.actionId));
  });

  for (const status of ['ok', 'corrected']) {
    it(`keeps a valid V2 ${status} terminal without adopting or reposting a later V1 response`, async () => {
      driver.link.respondOnce({
        status: 200,
        body: {
          protocolVersion: 2,
          status,
          runId: `run-v2-${status}`,
          appliedThroughSeq: 1,
          nextExpectedSeq: 2,
          results: [],
        },
      });
      const choose = driver.recordFriendlyNpcChoice();
      const expectedPendingIds = [choose.entry.actionId];
      await driver.flush();

      const afterV2 = driver.observe();
      assert.deepEqual(afterV2.pendingActionIds, expectedPendingIds);
      assert.equal(afterV2.requestCount, 1);
      assert.equal(afterV2.checkpointCount, 0);
      assert.equal(afterV2.correctionCount, 0);
      assert.equal(afterV2.schedulerPendingCount, 0);
      assert.deepEqual(afterV2.pauseReasons, ['unsupportedProtocol']);

      driver.link.respondOnce({
        status: 200,
        body: { protocolVersion: 1, status: 'ok', confirmedThroughSeq: 1, results: [] },
      });
      await driver.session.syncNow();

      const afterV1 = driver.observe();
      assert.deepEqual(afterV1.pendingActionIds, expectedPendingIds);
      assert.equal(afterV1.requestCount, 1);
      assert.equal(afterV1.checkpointCount, 0);
      assert.equal(afterV1.correctionCount, 0);
      assert.equal(afterV1.schedulerPendingCount, 0);
      assert.equal(driver.session.getPauseReason(), 'unsupportedProtocol');
    });
  }

  it('keeps a valid V2 conflict paused for manual review without adopting or reposting a later V1 response', async () => {
    driver.link.respondOnce({
      status: 409,
      body: {
        protocolVersion: 2,
        status: 'conflict',
        runId: 'run-v2-conflict',
        appliedThroughSeq: 1,
        nextExpectedSeq: 2,
        results: [],
        reason: 'writer_lease_mismatch',
      },
    });
    const choose = driver.recordFriendlyNpcChoice();
    const expectedPendingIds = [choose.entry.actionId];
    await driver.flush();

    const afterConflict = driver.observe();
    assert.deepEqual(afterConflict.pendingActionIds, expectedPendingIds);
    assert.equal(afterConflict.requestCount, 1);
    assert.equal(afterConflict.checkpointCount, 0);
    assert.equal(afterConflict.correctionCount, 0);
    assert.equal(afterConflict.schedulerPendingCount, 0);
    assert.deepEqual(afterConflict.pauseReasons, ['writerConflict']);

    driver.link.respondOnce({
      status: 200,
      body: { protocolVersion: 1, status: 'ok', confirmedThroughSeq: 1, results: [] },
    });
    await driver.session.syncNow();

    const afterV1 = driver.observe();
    assert.deepEqual(afterV1.pendingActionIds, expectedPendingIds);
    assert.equal(afterV1.requestCount, 1);
    assert.equal(afterV1.checkpointCount, 0);
    assert.equal(afterV1.correctionCount, 0);
    assert.equal(afterV1.schedulerPendingCount, 0);
    assert.equal(driver.session.getPauseReason(), 'writerConflict');
  });
});
