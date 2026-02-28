import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../../src/game/state.js';

describe('Robot Party in Run State', () => {
  it('run has robotParty with active, reserves, maxTotal', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.ok(run.robotParty);
    assert.deepStrictEqual(run.robotParty.active, []);
    assert.deepStrictEqual(run.robotParty.reserves, []);
    assert.strictEqual(run.robotParty.maxTotal, 6);
  });
});

