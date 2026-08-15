import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLORE_TRANSPORT_KEYS,
  makeExploreV1OkTransport,
} from './explore-sync-transport.js';
import { classifyExploreTransport } from '../../src/shared/explore/sync-outcome.js';

test('makeExploreV1OkTransport returns a complete, schema-valid V1 transport envelope', () => {
  const empty = makeExploreV1OkTransport();
  const result = makeExploreV1OkTransport({ entries: [{ seq: 7 }] });

  assert.equal(classifyExploreTransport(empty, { expectedProtocolVersion: 1 }), 'v1Settled');
  assert.equal(classifyExploreTransport(result, { expectedProtocolVersion: 1 }), 'v1Settled');
  assert.deepEqual(Object.keys(result).sort(), [...EXPLORE_TRANSPORT_KEYS].sort());
  assert.equal(empty.body.confirmedThroughSeq, 0);
  assert.deepEqual(result.body, {
    protocolVersion: 1,
    status: 'ok',
    confirmedThroughSeq: 7,
    results: [],
  });
});
