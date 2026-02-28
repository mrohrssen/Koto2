import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../../src/game/state.js';

describe('Creature Party in Run State', () => {
  it('run has creatureParty with active, reserves, maxTotal', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);
    assert.ok(run.creatureParty);
    assert.deepStrictEqual(run.creatureParty.active, []);
    assert.deepStrictEqual(run.creatureParty.reserves, []);
    assert.strictEqual(run.creatureParty.maxTotal, 6);
  });
});

