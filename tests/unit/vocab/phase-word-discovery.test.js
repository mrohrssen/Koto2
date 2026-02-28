import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PHASES, derivePhase } from '../../../src/game/phase-machine.js';

describe('Word Discovery Phase', () => {
  it('should have WORD_DISCOVERY phase constant', () => {
    assert.strictEqual(PHASES.WORD_DISCOVERY, 'wordDiscovery');
  });

  it('should derive wordDiscovery phase from room state', () => {
    const state = {
      player: { name: 'Test' },
      run: {
        active: true,
        rooms: [{
          type: 'wordDiscovery',
          interacted: false,
          wordDiscovery: { completed: false }
        }],
        currentRoom: 0
      },
      combat: null
    };

    assert.strictEqual(derivePhase(state), 'wordDiscovery');
  });

  it('should derive room phase when wordDiscovery is completed', () => {
    const state = {
      player: { name: 'Test' },
      run: {
        active: true,
        rooms: [{
          type: 'wordDiscovery',
          interacted: true,
          wordDiscovery: { completed: true }
        }],
        currentRoom: 0
      },
      combat: null
    };

    assert.strictEqual(derivePhase(state), PHASES.ROOM);
  });
});
