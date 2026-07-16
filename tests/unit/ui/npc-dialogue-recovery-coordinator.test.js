import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createNpcDialogueRecoveryCoordinator } from '../../../public/js/ui/npc-dialogue-recovery-coordinator.js';

function makeCoordinator(overrides = {}) {
  let state = { phase: 'npc_dialogue' };
  const calls = {
    recovered: 0,
    refresh: 0,
    resetOwnership: 0,
    retries: [],
  };
  const coordinator = createNpcDialogueRecoveryCoordinator({
    getState: () => state,
    needsRecovery: value => value?.phase === 'npc_dialogue',
    runDialogue: async () => ({ ok: true }),
    refreshState: async () => {
      calls.refresh += 1;
      state = { phase: 'npc_skill_selection' };
      return state;
    },
    renderRetry: retry => { calls.retries.push(retry); },
    onRecovered: () => { calls.recovered += 1; },
    resetDialogueOwnership: () => { calls.resetOwnership += 1; },
    ...overrides,
  });
  return {
    calls,
    coordinator,
    getState: () => state,
    setState: value => { state = value; },
  };
}

describe('NPC dialogue recovery coordinator', () => {
  it('turns a failed attempt into a manual retry that can later recover once', async () => {
    let attempts = 0;
    const harness = makeCoordinator({
      runDialogue: async () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, reason: 'dialogue_unavailable' }
          : { ok: true };
      },
    });

    assert.deepEqual(await harness.coordinator.run(), {
      ok: false,
      reason: 'dialogue_unavailable',
    });
    assert.equal(harness.calls.retries.length, 1);
    assert.equal(harness.coordinator.shouldStart(), true);

    assert.deepEqual(await harness.calls.retries[0](), { ok: true });
    assert.equal(harness.calls.refresh, 1);
    assert.equal(harness.calls.recovered, 1);
  });

  it('shares online and manual triggers through one in-flight attempt', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let dialogueCalls = 0;
    const harness = makeCoordinator({
      runDialogue: async () => {
        dialogueCalls += 1;
        await gate;
        return { ok: true };
      },
    });

    const online = harness.coordinator.run();
    const manual = harness.coordinator.run();
    assert.strictEqual(manual, online);
    assert.equal(dialogueCalls, 1);

    release();
    assert.deepEqual(await online, { ok: true });
    assert.equal(harness.calls.refresh, 1);
    assert.equal(harness.calls.recovered, 1);
  });

  it('keeps refresh failures retryable instead of reporting recovery', async () => {
    const harness = makeCoordinator({
      refreshState: async () => {
        harness.calls.refresh += 1;
        return { phase: 'npc_dialogue' };
      },
    });

    assert.deepEqual(await harness.coordinator.run(), {
      ok: false,
      reason: 'state_refresh_failed',
    });
    assert.equal(harness.calls.recovered, 0);
    assert.equal(harness.calls.retries.length, 1);
    assert.equal(harness.coordinator.shouldStart(), true);
  });

  it('reset invalidates the old owner and lets a new session start independently', async () => {
    let releaseOld;
    const oldGate = new Promise(resolve => { releaseOld = resolve; });
    let dialogueCalls = 0;
    const harness = makeCoordinator({
      runDialogue: async () => {
        dialogueCalls += 1;
        if (dialogueCalls === 1) await oldGate;
        return { ok: true };
      },
    });

    const oldAttempt = harness.coordinator.run();
    harness.coordinator.reset();
    const currentAttempt = harness.coordinator.run();

    assert.notStrictEqual(currentAttempt, oldAttempt);
    assert.equal(harness.calls.resetOwnership, 1);
    assert.deepEqual(await currentAttempt, { ok: true });
    assert.equal(harness.calls.refresh, 1);
    assert.equal(harness.calls.recovered, 1);

    releaseOld();
    assert.deepEqual(await oldAttempt, { ok: false, reason: 'recovery_cancelled' });
    assert.equal(harness.calls.refresh, 1, 'old owner must not refresh the new session');
    assert.equal(harness.calls.recovered, 1, 'old owner must not update the new session');
  });
});
