import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../src/game/state.js';
import { PHASES, derivePhase } from '../../src/game/phase-machine.js';

describe('createNewRun with branching support', () => {
  it('should include pendingBranch and selectedRooms fields', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);

    assert.strictEqual(run.pendingBranch, false);
    assert.deepStrictEqual(run.selectedRooms, []);
  });
});

describe('BRANCH_SELECTION phase', () => {
  it('should have BRANCH_SELECTION in PHASES', () => {
    assert.strictEqual(PHASES.BRANCH_SELECTION, 'branch_selection');
  });

  it('should derive branch_selection when pendingBranch is true', () => {
    const state = {
      player: { name: 'Test' },
      run: {
        active: true,
        pendingBranch: true,
        rooms: [{ type: 'encounter', explored: true, interacted: true }],
        currentRoom: 0
      },
      combat: null
    };

    assert.strictEqual(derivePhase(state), 'branch_selection');
  });
});
