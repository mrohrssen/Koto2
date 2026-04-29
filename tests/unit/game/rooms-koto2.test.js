import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateAreaRooms, getAreaById, getAreaSelectionOptions, ROOM_TYPES } from '../../../src/game/rooms.js';

function assertOnlyEnabledRoomTypes(rooms, fixedIndices) {
  const allowedTypes = new Set(['encounter', 'friendlyNpc', 'whackAMole']);
  const otherRooms = rooms.filter((_, i) => !fixedIndices.has(i));
  for (const room of otherRooms) {
    assert.ok(
      allowedTypes.has(room.type),
      `Unexpected room type: ${room.type} at room ${room.roomNumber}`
    );
  }
}

function assertFriendlyNpcOfferCategories(rooms) {
  const friendlyRooms = rooms.filter(r => r.type === 'friendlyNpc');
  for (const room of friendlyRooms) {
    assert.ok(
      room.friendlyNpc?.offerCategory === 'food' || room.friendlyNpc?.offerCategory === 'equipment',
      `friendlyNpc room missing valid offerCategory`
    );
  }
}

function assertNoDisabledRoomTypes(rooms) {
  const disabledTypes = ['shrine', 'quiz', 'wordDiscovery', 'dealer', 'speedReviewRoom'];
  for (const room of rooms) {
    assert.ok(!disabledTypes.includes(room.type), `Disabled room type found: ${room.type}`);
  }
}

describe('Koto2 area room generation', () => {
  it('should have npcBattle and friendlyNpc room types', () => {
    assert.ok(ROOM_TYPES.npcBattle);
    assert.ok(ROOM_TYPES.friendlyNpc);
  });

  describe('Starting Meadow', () => {
    it('generates exactly 10 rooms', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assert.equal(rooms.length, 10);
    });

    it('places npcBattle at room 6 and keeps Hineko as boss at room 10', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assert.equal(rooms[5].type, 'npcBattle');
      assert.equal(rooms[9].type, 'boss');
      assert.equal(rooms[9].boss.creatureId, 'hineko');
    });

    it('fills remaining rooms with encounter, friendlyNpc, or whackAMole', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assertOnlyEnabledRoomTypes(rooms, new Set([5, 9]));
    });

    it('does not generate disabled room types', () => {
      assertNoDisabledRoomTypes(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('friendlyNpc rooms should have offerCategory set to food or equipment', () => {
      assertFriendlyNpcOfferCategories(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('tutorial mode keeps first two tutorial rooms in the short layout', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba', undefined, undefined, undefined, undefined, true);
      assert.equal(rooms.length, 10);
      assert.equal(rooms[0].type, 'encounter');
      assert.equal(rooms[1].type, 'friendlyNpc');
      assert.equal(rooms[9].type, 'boss');
    });
  });

  describe('Wild Plains', () => {
    it('generates exactly 30 rooms', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms.length, 30);
    });

    it('keeps npcBattle at rooms 6, 12, 18, 24', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[5].type, 'npcBattle');
      assert.equal(rooms[11].type, 'npcBattle');
      assert.equal(rooms[17].type, 'npcBattle');
      assert.equal(rooms[23].type, 'npcBattle');
    });

    it('keeps Stone Giant as the boss at room 30', () => {
      const rooms = generateAreaRooms('wild-plains');
      assert.equal(rooms[29].type, 'boss');
      assert.equal(rooms[29].boss.creatureId, 'ishino-kyojin');
    });

    it('does not include Stone Giant in normal Wild Plains encounters', () => {
      const area = getAreaById('wild-plains');
      assert.ok(area);
      assert.equal(area.creatures.includes('ishino-kyojin'), false);
    });

    it('fills remaining rooms with encounter, friendlyNpc, or whackAMole', () => {
      const rooms = generateAreaRooms('wild-plains');
      assertOnlyEnabledRoomTypes(rooms, new Set([5, 11, 17, 23, 29]));
    });

    it('does not generate disabled room types', () => {
      assertNoDisabledRoomTypes(generateAreaRooms('wild-plains'));
    });

    it('friendlyNpc rooms should have offerCategory set to food or equipment', () => {
      assertFriendlyNpcOfferCategories(generateAreaRooms('wild-plains'));
    });
  });

  describe('area unlock ordering', () => {
    it('offers only Starting Meadow before the first clear', () => {
      const options = getAreaSelectionOptions(null, 1);
      assert.deepEqual(options.map(area => area.id), ['hajimari-no-hiroba']);
    });

    it('offers Starting Meadow and Wild Plains after the first clear', () => {
      const options = getAreaSelectionOptions(null, 2);
      assert.deepEqual(options.map(area => area.id), ['hajimari-no-hiroba', 'wild-plains']);
    });
  });
});
