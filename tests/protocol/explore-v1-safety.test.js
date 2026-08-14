import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createExploreProtocolDriver } from './helpers/run-driver.js';

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

  it('never reaches a paused state without pause policy information', async () => {
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
    assert.equal(
      pauseOracle.observedPausePolicies.length,
      pauseOracle.observedPauseReasons.length,
    );
    for (const observed of pauseOracle.observedPausePolicies) {
      assert.ok(observed.policy, `${observed.reason} must have a mapped policy`);
      assert.equal(
        observed.policy.automaticRecovery === true || observed.policy.manualRecovery === true,
        true,
        `${observed.reason} must permit an automatic or manual recovery action`,
      );
      assert.ok(observed.policy.resumeWhen, `${observed.reason} must define when play resumes`);
    }
    assert.deepEqual(pauseOracle.pausePolicyViolations, []);
    assert.equal(pauseOracle.unrecoverablePauses, 0);
    assert.equal(pauseOracle.pendingCount, 0);
    assert.equal(pauseOracle.duplicateGameEffects, 0);
    assert.equal(pauseOracle.missingGameEffects, 0);
    assert.equal(afterDelayedChoose, 425);
    assert.ok(pauseOracle.replayedActionIds.includes(proceed.entry.actionId));
  });
});
