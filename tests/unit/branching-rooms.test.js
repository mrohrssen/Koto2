import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createNewRun, createNewPlayer } from '../../src/game/state.js';
import { PHASES, derivePhase } from '../../src/game/phase-machine.js';
import { generateFloorRooms, ROOM_TYPES } from '../../src/game/rooms.js';

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

describe('generateFloorRooms with branching', () => {
  it('should generate first room as single, middle rooms as pairs, boss as single', () => {
    const rooms = generateFloorRooms(1, 4); // 4 room slots + boss = 5 total

    // First room: single (not an array)
    assert.strictEqual(Array.isArray(rooms[0]), false);
    assert.strictEqual(rooms[0].roomNumber, 1);

    // Middle rooms (indices 1, 2, 3): pairs (arrays of 2)
    assert.strictEqual(Array.isArray(rooms[1]), true);
    assert.strictEqual(rooms[1].length, 2);
    assert.strictEqual(Array.isArray(rooms[2]), true);
    assert.strictEqual(rooms[2].length, 2);
    assert.strictEqual(Array.isArray(rooms[3]), true);
    assert.strictEqual(rooms[3].length, 2);

    // Boss room: single
    assert.strictEqual(Array.isArray(rooms[4]), false);
    assert.strictEqual(rooms[4].type, ROOM_TYPES.boss);
  });

  it('should not have duplicate special types in same branch', () => {
    // Run multiple times to catch randomness
    for (let i = 0; i < 20; i++) {
      const rooms = generateFloorRooms(1, 5);
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

describe('ExplorationService.selectBranch logic', () => {
  it('should replace pair with selected room and clear pendingBranch', () => {
    // This tests the logic inline (not the actual service)
    const mockRun = {
      rooms: [
        { id: 'room1', type: 'encounter', explored: true, interacted: true },
        [
          { id: 'room2a', type: 'shrine', explored: false },
          { id: 'room2b', type: 'encounter', explored: false }
        ]
      ],
      currentRoom: 1,
      pendingBranch: true,
      selectedRooms: [],
      roomsExplored: 1
    };

    // Simulate selectBranch(0)
    const pair = mockRun.rooms[mockRun.currentRoom];
    const selectedRoom = pair[0];
    mockRun.rooms[mockRun.currentRoom] = selectedRoom;
    mockRun.selectedRooms.push(0);
    selectedRoom.explored = true;
    mockRun.roomsExplored++;
    mockRun.pendingBranch = false;

    assert.strictEqual(mockRun.rooms[1].id, 'room2a');
    assert.strictEqual(mockRun.pendingBranch, false);
    assert.deepStrictEqual(mockRun.selectedRooms, [0]);
  });
});
