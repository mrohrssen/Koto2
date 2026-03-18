import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PHASES, canTransition, derivePhase } from '../../../src/game/phase-machine.js';

describe('Speed Review Room Phase', () => {
  it('derives speedReviewRoom when room is active and unfinished', () => {
    const state = {
      player: { name: 'Test' },
      run: {
        active: true,
        rooms: [{
          type: 'speedReviewRoom',
          interacted: false,
          speedReviewRoom: { completed: false }
        }],
        currentRoom: 0
      },
      combat: null
    };

    assert.strictEqual(derivePhase(state), PHASES.SPEED_REVIEW_ROOM);
  });

  it('derives ROOM phase after speedReviewRoom interaction completes', () => {
    const state = {
      player: { name: 'Test' },
      run: {
        active: true,
        rooms: [{
          type: 'speedReviewRoom',
          interacted: true,
          speedReviewRoom: { completed: true }
        }],
        currentRoom: 0
      },
      combat: null
    };

    assert.strictEqual(derivePhase(state), PHASES.ROOM);
  });

  it('allows ROOM <-> SPEED_REVIEW_ROOM transitions', () => {
    assert.strictEqual(canTransition(PHASES.ROOM, PHASES.SPEED_REVIEW_ROOM), true);
    assert.strictEqual(canTransition(PHASES.SPEED_REVIEW_ROOM, PHASES.ROOM), true);
  });
});
