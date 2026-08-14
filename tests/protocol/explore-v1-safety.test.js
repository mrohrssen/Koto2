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
    assert.deepEqual(oracle.requestedActionIds.slice(0, 2), [
      choose.entry.actionId,
      choose.entry.actionId,
    ]);
    assert.deepEqual(oracle.committedRecordedActionIds, [choose.entry.actionId]);
    assert.deepEqual(oracle.silentDeletedActionIds, []);
    assert.equal(oracle.missingGameEffects, 0);
    assert.equal(oracle.correctedSyncsUnderPureTransport, 0);
  });

  it('treats a malformed 200 as indeterminate and succeeds on retry', async () => {
    driver.link.respondOnce({ status: 200, body: {} });

    const choose = driver.recordFriendlyNpcChoice();
    await driver.flush();

    const oracle = await driver.readOracle();
    assert.equal(oracle.pendingCount, 0);
    assert.deepEqual(oracle.requestedActionIds.slice(0, 2), [
      choose.entry.actionId,
      choose.entry.actionId,
    ]);
    assert.deepEqual(oracle.committedRecordedActionIds, [choose.entry.actionId]);
    assert.deepEqual(oracle.silentDeletedActionIds, []);
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

    const oracle = await driver.readOracle();
    assert.equal(choose.accepted, true);
    assert.equal(blockedProceed.accepted, false);
    assert.equal(blockedProceed.reason, 'dependency');
    assert.equal(proceed.accepted, true);
    assert.ok(oracle.observedPauseReasons.includes('dependency'));
    assert.equal(oracle.unrecoverablePauses, 0);
    assert.equal(oracle.pendingCount, 0);
    assert.equal(oracle.duplicateGameEffects, 0);
    assert.equal(oracle.missingGameEffects, 0);
    assert.equal(afterDelayedChoose, 425);
    assert.ok(oracle.replayedActionIds.includes(proceed.entry.actionId));
  });
});
