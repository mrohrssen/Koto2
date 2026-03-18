import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ROOM_TYPES, createRoom, generateAreaRooms, getRoomEntryNarration, getRoomActions, queueTestRooms, clearTestRoomQueue } from '../../../src/game/rooms.js';

describe('Skill Master Room', () => {
  it('should expose ROOM_TYPES.skillMaster', () => {
    assert.strictEqual(ROOM_TYPES.skillMaster, 'skillMaster');
  });

  it('should create skillMaster room with correct structure', () => {
    const room = createRoom('skillMaster', 'okunomori', 2, 5);
    assert.strictEqual(room.type, 'skillMaster');
    assert.deepStrictEqual(room.skillMaster, {
      offered: null,
      chosenId: null,
      completed: false
    });
  });

  it('should return English-only entry narration', () => {
    const room = createRoom('skillMaster', 'okunomori', 2, 5);
    const narration = getRoomEntryNarration(room);
    assert.ok(narration.includes('Skill Master'), 'Narration should mention Skill Master');
    assert.ok(narration.includes('Room 2/5'), 'Narration should include room number');
  });

  it('should be generatable via room generation rolls and test queue', () => {
    // Deterministic via test queue
    queueTestRooms(['skillMaster']);
    try {
      const rooms = generateAreaRooms('okunomori', 1);
      assert.strictEqual(rooms[0].type, 'skillMaster');
    } finally {
      clearTestRoomQueue();
    }

    // Deterministic via random roll ladder (skillMaster bucket)
    const originalRandom = Math.random;
    Math.random = () => 0.32;
    try {
      const rooms = generateAreaRooms('okunomori', 1);
      assert.strictEqual(rooms[0].type, 'skillMaster');
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should gate proceed until skillMaster is completed', () => {
    const unfinished = createRoom('skillMaster', 'okunomori', 2, 5);
    unfinished.interacted = false;
    unfinished.skillMaster.completed = false;

    const unfinishedActions = getRoomActions(unfinished);
    assert.ok(
      unfinishedActions.find(a => a.id === 'skill_master_choose'),
      'skill_master_choose should be available'
    );
    assert.strictEqual(
      unfinishedActions.find(a => a.id === 'proceed'),
      undefined,
      'proceed should not be available'
    );

    const finishedViaInteracted = createRoom('skillMaster', 'okunomori', 2, 5);
    finishedViaInteracted.interacted = true;
    finishedViaInteracted.skillMaster.completed = false;
    const finishedViaInteractedActions = getRoomActions(finishedViaInteracted);
    assert.strictEqual(
      finishedViaInteractedActions.find(a => a.id === 'proceed'),
      undefined,
      'proceed should not be available after interacted unless completed'
    );

    const finishedViaCompletedFlag = createRoom('skillMaster', 'okunomori', 2, 5);
    finishedViaCompletedFlag.interacted = false;
    finishedViaCompletedFlag.skillMaster.completed = true;
    const finishedViaCompletedFlagActions = getRoomActions(finishedViaCompletedFlag);
    assert.ok(
      finishedViaCompletedFlagActions.find(a => a.id === 'proceed'),
      'proceed should be available after skillMaster.completed'
    );
  });
});

