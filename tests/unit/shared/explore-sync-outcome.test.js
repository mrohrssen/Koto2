import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyExploreTransport,
  isValidatedExploreV2Transport,
} from '../../../src/shared/explore/sync-outcome.js';
import {
  PAUSE_REASONS,
  pausePriority,
  shouldReplacePauseReason,
} from '../../../src/shared/explore/pause-reasons.js';

function transport(overrides = {}) {
  return {
    transport: true,
    httpStatus: 0,
    body: null,
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
    ...overrides,
  };
}

test('classifies strict V1, unsupported V2, conflict, auth, and indeterminate envelopes', () => {
  const cases = [
    [transport({ networkError: new TypeError('lost') }), 'indeterminate'],
    [transport({ aborted: true }), 'indeterminate'],
    [transport({ httpStatus: 429, body: { error: 'slow' } }), 'indeterminate'],
    [transport({ httpStatus: 503, body: { error: 'down' } }), 'indeterminate'],
    [transport({ httpStatus: 200, parseError: new Error('html') }), 'indeterminate'],
    [transport({ httpStatus: 200, body: {} }), 'indeterminate'],
    [transport({ httpStatus: 401, body: { error: 'expired' } }), 'authRequired'],
    [transport({ clientAuthMismatch: true }), 'authRequired'],
    [transport({ httpStatus: 200, body: { status: 'ok', confirmedThroughSeq: 1, results: [] } }), 'v1Settled'],
    [transport({ httpStatus: 200, body: { status: 'corrected', confirmedThroughSeq: 0, rejectedSeq: 1, results: [] } }), 'v1Settled'],
    [transport({ httpStatus: 409, body: { status: 'corrected', confirmedThroughSeq: null, rejectedSeq: 1, results: [] } }), 'v1Settled'],
    [transport({ httpStatus: 200, body: { protocolVersion: 2, status: 'ok', runId: 'r', appliedThroughSeq: 1, nextExpectedSeq: 2, results: [] } }), 'unsupportedProtocol'],
    [transport({ httpStatus: 200, body: { protocolVersion: 2, status: 'corrected', runId: 'r', appliedThroughSeq: 0, nextExpectedSeq: 1, results: [] } }), 'unsupportedProtocol'],
    [transport({ httpStatus: 409, body: { protocolVersion: 2, status: 'conflict', reason: 'writer_lease_mismatch' } }), 'conflict'],
    [{ httpStatus: 200, body: { status: 'ok', confirmedThroughSeq: 1, results: [] } }, 'indeterminate'],
    [transport({ httpStatus: 200, body: { status: 'ok', confirmedThroughSeq: 1 } }), 'indeterminate'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(classifyExploreTransport(input, { expectedProtocolVersion: 1 }), expected, JSON.stringify(input));
  }
});

test('does not accept a V1 envelope after a run speaks V2', () => {
  assert.equal(classifyExploreTransport(transport({
    httpStatus: 200,
    body: { status: 'ok', confirmedThroughSeq: 1, results: [] },
  }), { expectedProtocolVersion: 2 }), 'indeterminate');
});

test('recognizes only fully validated V2 transport results independent of client auth mismatch', () => {
  const validOkWithChangedAuth = transport({
    httpStatus: 200,
    clientAuthMismatch: true,
    body: {
      protocolVersion: 2,
      status: 'ok',
      runId: 'v2-auth-ratchet',
      appliedThroughSeq: 1,
      nextExpectedSeq: 2,
      results: [],
    },
  });
  const validConflictWithChangedAuth = transport({
    httpStatus: 409,
    clientAuthMismatch: true,
    body: { protocolVersion: 2, status: 'conflict', reason: 'writer_lease_mismatch' },
  });

  assert.equal(isValidatedExploreV2Transport(validOkWithChangedAuth), true);
  assert.equal(isValidatedExploreV2Transport(validConflictWithChangedAuth), true);
  assert.equal(
    classifyExploreTransport(validOkWithChangedAuth, { expectedProtocolVersion: 1 }),
    'authRequired',
  );

  for (const invalid of [
    transport({ ...validOkWithChangedAuth, parseError: new Error('html') }),
    transport({ ...validOkWithChangedAuth, networkError: new TypeError('lost') }),
    transport({ ...validOkWithChangedAuth, aborted: true }),
    transport({ ...validOkWithChangedAuth, httpStatus: 401 }),
    transport({ ...validOkWithChangedAuth, body: { protocolVersion: 2, status: 'ok' } }),
  ]) {
    assert.equal(isValidatedExploreV2Transport(invalid), false);
  }
});

test('rejects transport envelopes missing even one required Task 3 field', () => {
  const incomplete = transport({
    httpStatus: 200,
    body: { status: 'ok', confirmedThroughSeq: 1, results: [] },
  });
  delete incomplete.authRevision;

  assert.equal(classifyExploreTransport(incomplete, { expectedProtocolVersion: 1 }), 'indeterminate');
});

test('rejects surplus transport keys instead of accepting classifier configuration from the envelope', () => {
  const injected = transport({
    httpStatus: 200,
    expectedProtocolVersion: 1,
    body: { status: 'ok', confirmedThroughSeq: 1, results: [] },
  });

  assert.equal(classifyExploreTransport(injected, { expectedProtocolVersion: 1 }), 'indeterminate');
  assert.equal(classifyExploreTransport(transport({
    httpStatus: 200,
    body: { status: 'ok', confirmedThroughSeq: 1, results: [] },
  }), { expectedProtocolVersion: 2 }), 'indeterminate');
});

test('pause reasons expose only authoritative severity and replacement priority', () => {
  const requiredReasons = [
    'dependency', 'syncPending', 'noPreparedRoom', 'currentRoomNotReady',
    'nextRoomNotReady', 'runwayExhausted', 'missingPayload', 'actionNotAccepted',
    'hardCap', 'combatPlaybackFailed', 'transportDegraded', 'writerConflict',
    'authRequired', 'unsupportedProtocol',
  ];

  for (const reason of requiredReasons) {
    const policy = PAUSE_REASONS[reason];
    assert.ok(policy, `${reason} must be defined`);
    assert.deepEqual(Object.keys(policy).sort(), ['priority', 'severity']);
    assert.equal(typeof policy.priority, 'number');
    assert.ok(Object.isFrozen(policy), `${reason} policy must be frozen`);
  }
  assert.equal(PAUSE_REASONS.storageUnavailable, undefined);
});

test('pause priority only permits strictly higher authoritative reasons', () => {
  assert.equal(pausePriority('dependency'), 10);
  assert.equal(pausePriority('transportDegraded'), 20);
  assert.equal(pausePriority('writerConflict'), 30);
  assert.equal(pausePriority('authRequired'), 40);
  assert.equal(pausePriority('unsupportedProtocol'), 50);
  assert.equal(shouldReplacePauseReason('dependency', 'hardCap'), false);
  assert.equal(shouldReplacePauseReason('writerConflict', 'writerConflict'), false);
  assert.equal(shouldReplacePauseReason('writerConflict', 'authRequired'), true);
  assert.equal(shouldReplacePauseReason('unsupportedProtocol', 'authRequired'), false);
});
