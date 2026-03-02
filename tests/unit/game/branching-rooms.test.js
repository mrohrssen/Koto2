import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../../src/game/state.js';
import { PHASES, derivePhase } from '../../../src/game/phase-machine.js';
import { generateAreaRooms, ROOM_TYPES } from '../../../src/game/rooms.js';

describe('createNewRun with branching support', () => {
  it('should include pendingBranch and selectedRooms fields', () => {
    const player = createNewPlayer('Test');
    const run = createNewRun(player);

    assert.strictEqual(run.pendingBranch, false);
    assert.deepStrictEqual(run.selectedRooms, []);
  });
});

describe('BRANCH_SELECTION phase', () => {
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

describe('generateAreaRooms with branching', () => {
  it('should generate first room as single, rest as branch pairs', () => {
    const rooms = generateAreaRooms('okunomori', 4); // 4 room slots

    // First room: single (not an array)
    assert.strictEqual(Array.isArray(rooms[0]), false);
    assert.strictEqual(rooms[0].roomNumber, 1);

    // Remaining rooms (indices 1, 2, 3): pairs (arrays of 2)
    assert.strictEqual(Array.isArray(rooms[1]), true);
    assert.strictEqual(rooms[1].length, 2);
    assert.strictEqual(Array.isArray(rooms[2]), true);
    assert.strictEqual(rooms[2].length, 2);
    assert.strictEqual(Array.isArray(rooms[3]), true);
    assert.strictEqual(rooms[3].length, 2);
  });

  it('should not have duplicate special types in same branch', () => {
    // Run multiple times to catch randomness
    for (let i = 0; i < 20; i++) {
      const rooms = generateAreaRooms('okunomori', 5);
      for (let j = 1; j < rooms.length - 1; j++) {
        const pair = rooms[j];
        if (Array.isArray(pair)) {
          const type0 = pair[0].type;
          const type1 = pair[1].type;
          // If both are special types, they must be different
          const specialTypes = ['shrine', 'quiz', 'wordDiscovery'];
          if (specialTypes.includes(type0) && specialTypes.includes(type1)) {
            assert.notStrictEqual(type0, type1, `Branch ${j} has duplicate special type: ${type0}`);
          }
        }
      }
    }
  });
});

