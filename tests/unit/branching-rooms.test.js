import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../src/game/state.js';

describe('createNewRun with branching support', () => {
  it('should include pendingBranch and selectedRooms fields', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);

    assert.strictEqual(run.pendingBranch, false);
    assert.deepStrictEqual(run.selectedRooms, []);
  });
});
