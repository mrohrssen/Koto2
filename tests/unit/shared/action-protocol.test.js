import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createActionId,
  hashTranscript,
  buildActionEnvelope,
  verifyActionEnvelope,
  buildAcceptedResponse,
  buildCorrectedResponse,
} from '../../../src/shared/action-protocol.js';

describe('action protocol', () => {
  it('hashes transcripts independently of object key insertion order', () => {
    const a = { damage: 12, nested: { b: 2, a: 1 } };
    const b = { nested: { a: 1, b: 2 }, damage: 12 };

    assert.equal(hashTranscript(a), hashTranscript(b));
  });

  it('builds an envelope with action id, combat id, state version, seed, payload, and transcript hash', () => {
    const envelope = buildActionEnvelope({
      combatId: 'cmb_1',
      stateVersion: 4,
      actionType: 'combat.attack',
      seed: 'turn-seed',
      payload: { moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }] },
      predictedTranscript: { damage: 14 },
    });

    assert.match(envelope.actionId, /^act_/);
    assert.equal(envelope.combatId, 'cmb_1');
    assert.equal(envelope.stateVersion, 4);
    assert.equal(envelope.actionType, 'combat.attack');
    assert.equal(envelope.seed, 'turn-seed');
    assert.equal(envelope.predictedHash, hashTranscript({ damage: 14 }));
  });

  it('validates version and seed before server recompute', () => {
    const envelope = {
      actionId: 'act_1',
      combatId: 'cmb_1',
      stateVersion: 2,
      actionType: 'combat.attack',
      seed: 'seed-1',
      payload: {},
      predictedHash: 'hash',
    };

    assert.deepEqual(verifyActionEnvelope(envelope, { combatId: 'cmb_1', stateVersion: 2, seed: 'seed-1' }), { ok: true });
    assert.deepEqual(verifyActionEnvelope(envelope, { combatId: 'cmb_2', stateVersion: 2, seed: 'seed-1' }), {
      ok: false,
      reason: 'combat_id_mismatch',
    });
    assert.deepEqual(verifyActionEnvelope(envelope, { combatId: 'cmb_1', stateVersion: 3, seed: 'seed-1' }), {
      ok: false,
      reason: 'state_version_mismatch',
    });
    assert.deepEqual(verifyActionEnvelope(envelope, { combatId: 'cmb_1', stateVersion: 2, seed: 'seed-2' }), {
      ok: false,
      reason: 'seed_mismatch',
    });
  });

  it('builds accepted and corrected response shapes', () => {
    assert.deepEqual(buildAcceptedResponse({ stateVersion: 2, nextSeed: 'next' }), {
      status: 'accepted',
      stateVersion: 2,
      nextSeed: 'next',
    });
    assert.deepEqual(buildCorrectedResponse({
      reason: 'transcript_mismatch',
      authoritativeTranscript: { damage: 9 },
      authoritativeState: { phase: 'combat' },
      stateVersion: 2,
      nextSeed: 'next',
    }), {
      status: 'corrected',
      reason: 'transcript_mismatch',
      authoritativeTranscript: { damage: 9 },
      authoritativeState: { phase: 'combat' },
      stateVersion: 2,
      nextSeed: 'next',
    });
  });
});
