import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyExploreTransport } from '../../../src/shared/explore/sync-outcome.js';
import { PAUSE_REASONS } from '../../../src/shared/explore/pause-reasons.js';

test('classifies the strict Explore transport envelope', () => {
  const cases = [
    [{ networkError: new TypeError('lost') }, 'indeterminate'],
    [{ aborted: true }, 'indeterminate'],
    [{ httpStatus: 429, body: { error: 'slow' } }, 'indeterminate'],
    [{ httpStatus: 503, body: { error: 'down' } }, 'indeterminate'],
    [{ httpStatus: 200, parseError: new Error('html') }, 'indeterminate'],
    [{ httpStatus: 200, body: {} }, 'indeterminate'],
    [{ httpStatus: 401, body: { error: 'expired' } }, 'authRequired'],
    [{ httpStatus: 200, expectedProtocolVersion: 1, body: { status: 'ok', confirmedThroughSeq: 1, results: [] } }, 'settled'],
    [{ httpStatus: 200, expectedProtocolVersion: 1, body: { status: 'corrected', confirmedThroughSeq: 0, rejectedSeq: 1, results: [] } }, 'settled'],
    [{ httpStatus: 409, expectedProtocolVersion: 1, body: { status: 'corrected', confirmedThroughSeq: null, rejectedSeq: 1, results: [] } }, 'settled'],
    [{ httpStatus: 200, body: { protocolVersion: 2, status: 'ok', runId: 'r', appliedThroughSeq: 1, nextExpectedSeq: 2, results: [] } }, 'settled'],
    [{ httpStatus: 200, body: { protocolVersion: 2, status: 'corrected', runId: 'r', appliedThroughSeq: 0, nextExpectedSeq: 1, results: [] } }, 'settled'],
    [{ httpStatus: 409, body: { protocolVersion: 2, status: 'conflict', reason: 'writer_lease_mismatch' } }, 'conflict'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(classifyExploreTransport(input), expected, JSON.stringify(input));
  }
});

test('does not accept a V1 envelope after a run speaks V2', () => {
  assert.equal(classifyExploreTransport({
    expectedProtocolVersion: 2,
    httpStatus: 200,
    body: { status: 'ok', confirmedThroughSeq: 1, results: [] },
  }), 'indeterminate');
});

test('every Explore pause reason is recoverable and documented', () => {
  const requiredReasons = [
    'dependency', 'syncPending', 'noPreparedRoom', 'currentRoomNotReady',
    'nextRoomNotReady', 'runwayExhausted', 'missingPayload', 'actionNotAccepted',
    'hardCap', 'combatPlaybackFailed', 'transportDegraded', 'authRequired',
    'storageUnavailable', 'writerConflict',
  ];

  for (const reason of requiredReasons) {
    const policy = PAUSE_REASONS[reason];
    assert.ok(policy, `${reason} must be defined`);
    assert.equal(typeof policy.resumeWhen, 'string', `${reason} needs a resume condition`);
    assert.ok(policy.resumeWhen.length > 0, `${reason} needs a resume condition`);
    assert.ok(policy.automaticRecovery || policy.manualRecovery, `${reason} needs recovery`);
    assert.ok(Object.isFrozen(policy), `${reason} policy must be frozen`);
  }
});
