import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateAreaRooms, ROOM_TYPES } from '../../../src/game/rooms.js';

describe('Koto2 30-room generation', () => {
  it('should have npcBattle and friendlyNpc room types', () => {
    assert.ok(ROOM_TYPES.npcBattle);
    assert.ok(ROOM_TYPES.friendlyNpc);
  });

  it('should generate exactly 30 rooms', () => {
    const rooms = generateAreaRooms('test-area');
    assert.equal(rooms.length, 30);
  });

  it('should place npcBattle at rooms 6, 12, 18, 24', () => {
    const rooms = generateAreaRooms('test-area');
    assert.equal(rooms[5].type, 'npcBattle');
    assert.equal(rooms[11].type, 'npcBattle');
    assert.equal(rooms[17].type, 'npcBattle');
    assert.equal(rooms[23].type, 'npcBattle');
  });

  it('should place boss at room 30', () => {
    const rooms = generateAreaRooms('test-area');
    assert.equal(rooms[29].type, 'boss');
  });

  it('should fill remaining rooms with encounter, friendlyNpc, or whackAMole', () => {
    const rooms = generateAreaRooms('test-area');
    const fixedIndices = new Set([5, 11, 17, 23, 29]);
    const allowedTypes = new Set(['encounter', 'friendlyNpc', 'whackAMole']);
    const otherRooms = rooms.filter((_, i) => !fixedIndices.has(i));
    for (const room of otherRooms) {
      assert.ok(
        allowedTypes.has(room.type),
        `Unexpected room type: ${room.type} at room ${room.roomNumber}`
      );
    }
  });

  it('should have roughly even split of encounter and friendlyNpc with some whackAMole', () => {
    const rooms = generateAreaRooms('test-area');
    const fixedIndices = new Set([5, 11, 17, 23, 29]);
    const otherRooms = rooms.filter((_, i) => !fixedIndices.has(i));
    const encounters = otherRooms.filter(r => r.type === 'encounter').length;
    const friendlyNpcs = otherRooms.filter(r => r.type === 'friendlyNpc').length;
    const wam = otherRooms.filter(r => r.type === 'whackAMole').length;
    assert.ok(encounters >= 5 && encounters <= 18, `Encounter count ${encounters} out of range`);
    assert.ok(friendlyNpcs >= 5 && friendlyNpcs <= 18, `FriendlyNpc count ${friendlyNpcs} out of range`);
    assert.ok(wam >= 0 && wam <= 8, `WhackAMole count ${wam} out of range`);
  });

  it('should not generate disabled room types', () => {
    const rooms = generateAreaRooms('test-area');
    const disabledTypes = ['shrine', 'quiz', 'wordDiscovery', 'dealer', 'speedReviewRoom'];
    for (const room of rooms) {
      assert.ok(!disabledTypes.includes(room.type), `Disabled room type found: ${room.type}`);
    }
  });

  it('friendlyNpc rooms should have offerCategory set to food or weapon', () => {
    const rooms = generateAreaRooms('test-area');
    const friendlyRooms = rooms.filter(r => r.type === 'friendlyNpc');
    for (const room of friendlyRooms) {
      assert.ok(
        room.friendlyNpc?.offerCategory === 'food' || room.friendlyNpc?.offerCategory === 'equipment',
        `friendlyNpc room missing valid offerCategory`
      );
    }
  });
});
