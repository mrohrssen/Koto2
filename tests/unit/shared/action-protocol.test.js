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
  it('creates action ids with a custom prefix', () => {
    assert.match(createActionId('turn'), /^turn_[a-z0-9]+_[a-z0-9]+$/);
  });

  it('hashes transcripts independently of object key insertion order', () => {
    const a = { damage: 12, nested: { b: 2, a: 1 } };
    const b = { nested: { a: 1, b: 2 }, damage: 12 };

    assert.equal(hashTranscript(a), hashTranscript(b));
  });

  it('hashes nested arrays independently of object key insertion order', () => {
    const a = { events: [{ damage: 12, nested: { b: 2, a: 1 } }, [{ z: 3, c: 2 }]] };
    const b = { events: [{ nested: { a: 1, b: 2 }, damage: 12 }, [{ c: 2, z: 3 }]] };

    assert.equal(hashTranscript(a), hashTranscript(b));
  });

  it('canonicalizes JSON edge values without mutating inputs', () => {
    const transcript = {
      keep: 'yes',
      skippedUndefined: undefined,
      skippedFunction: () => {},
      skippedSymbol: Symbol('skip'),
      nan: NaN,
      infinity: Infinity,
      negativeInfinity: -Infinity,
      nested: { keep: 1, skippedUndefined: undefined },
      list: [
        undefined,
        () => {},
        Symbol('skip'),
        NaN,
        Infinity,
        -Infinity,
        ,
        { b: 2, a: 1, skipped: undefined },
      ],
    };
    const jsonEquivalent = {
      keep: 'yes',
      nan: null,
      infinity: null,
      negativeInfinity: null,
      nested: { keep: 1 },
      list: [null, null, null, null, null, null, null, { a: 1, b: 2 }],
    };

    assert.equal(hashTranscript(transcript), hashTranscript(jsonEquivalent));
    assert.equal(hashTranscript(NaN), hashTranscript(null));
    assert.equal(hashTranscript(Infinity), hashTranscript(null));
    assert.equal(Object.hasOwn(transcript, 'skippedUndefined'), true);
    assert.equal(Object.hasOwn(transcript.nested, 'skippedUndefined'), true);
    assert.equal(Object.hasOwn(transcript.list[7], 'skipped'), true);
  });

  it('throws clear TypeErrors for unsupported top-level values and BigInt', () => {
    assert.throws(() => hashTranscript(undefined), {
      name: 'TypeError',
      message: /Cannot canonicalize unsupported top-level value/,
    });
    assert.throws(() => hashTranscript(() => {}), {
      name: 'TypeError',
      message: /Cannot canonicalize unsupported top-level value/,
    });
    assert.throws(() => hashTranscript(Symbol('skip')), {
      name: 'TypeError',
      message: /Cannot canonicalize unsupported top-level value/,
    });
    assert.throws(() => hashTranscript(1n), {
      name: 'TypeError',
      message: /Cannot canonicalize BigInt/,
    });
    assert.throws(() => hashTranscript({ nested: 1n }), {
      name: 'TypeError',
      message: /Cannot canonicalize BigInt/,
    });
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
    assert.deepEqual(envelope.payload, { moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }] });
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

    assert.deepEqual(verifyActionEnvelope({ ...envelope, actionId: undefined }, { combatId: 'cmb_1', stateVersion: 2, seed: 'seed-1' }), {
      ok: false,
      reason: 'missing_action_id',
    });
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
