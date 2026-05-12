import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRoomEligibilityFilters,
  applyRoomPacingModifiers,
  finalizeRandomRoom,
  generateAreaRooms,
  getAreaById,
  getAreaSelectionOptions,
  getRandomRoomBaseWeights,
  pickWeightedRoomType,
  ROOM_TYPES
} from '../../../src/game/rooms.js';

function assertOnlyEnabledRoomTypes(rooms, fixedIndices) {
  const allowedTypes = new Set(['randomRoom']);
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
    assert.equal(room.friendlyNpc?.offerCategory, 'equipment');
  }
}

function assertShrineRoomState(rooms) {
  for (const room of rooms.filter(r => r.type === 'shrine')) {
    assert.deepEqual(room.shrine, {
      used: false,
      completed: false,
      chosenReward: null,
      greeting: null
    });
  }
}

function assertNoDisabledRoomTypes(rooms) {
  const disabledTypes = ['quiz', 'wordDiscovery', 'dealer', 'speedReviewRoom'];
  for (const room of rooms) {
    assert.ok(!disabledTypes.includes(room.type), `Disabled room type found: ${room.type}`);
  }
}

describe('weighted room picker helpers', () => {
  it('defines base weights for every random room candidate', () => {
    assert.deepEqual(getRandomRoomBaseWeights(), {
      encounter: 45,
      friendlyNpc: 18,
      whackAMole: 14,
      shrine: 10,
      campfire: 13
    });
  });

  it('selects room types from the weighted range', () => {
    const weights = getRandomRoomBaseWeights();

    assert.equal(pickWeightedRoomType(weights, () => 0.44), ROOM_TYPES.encounter);
    assert.equal(pickWeightedRoomType(weights, () => 0.46), ROOM_TYPES.friendlyNpc);
    assert.equal(pickWeightedRoomType(weights, () => 0.65), ROOM_TYPES.whackAMole);
    assert.equal(pickWeightedRoomType(weights, () => 0.80), ROOM_TYPES.shrine);
    assert.equal(pickWeightedRoomType(weights, () => 0.95), ROOM_TYPES.campfire);
  });

  it('removes campfire from the roll when no real two-plus ingredient recipe is cookable', () => {
    const weights = applyRoomEligibilityFilters(getRandomRoomBaseWeights(), {
      cooking: { ingredients: { mizu: 1 } }
    });

    assert.equal(weights.campfire, 0);
    assert.equal(weights.shrine, 10);
    assert.equal(weights.whackAMole, 14);
  });

  it('keeps campfire eligible when a real two-plus ingredient recipe is cookable', () => {
    const weights = applyRoomEligibilityFilters(getRandomRoomBaseWeights(), {
      cooking: { ingredients: { mizu: 1, miso: 1 } }
    });

    assert.equal(weights.campfire, 13);
  });

  it('applies support cooldowns without blocking encounters', () => {
    const base = getRandomRoomBaseWeights();
    const afterShrine = applyRoomPacingModifiers(base, [
      { type: ROOM_TYPES.shrine, random: true }
    ]);
    const shrineTwoRandomSlotsAgo = applyRoomPacingModifiers(base, [
      { type: ROOM_TYPES.shrine, random: true },
      { type: ROOM_TYPES.encounter, random: true }
    ]);

    assert.equal(afterShrine.shrine, 0);
    assert.equal(shrineTwoRandomSlotsAgo.shrine, 3.5);
    assert.equal(afterShrine.encounter, 45);
  });

  it('boosts encounter after a support-room streak', () => {
    const weights = applyRoomPacingModifiers(getRandomRoomBaseWeights(), [
      { type: ROOM_TYPES.friendlyNpc, random: true },
      { type: ROOM_TYPES.shrine, random: true },
      { type: ROOM_TYPES.campfire, random: true }
    ]);

    assert.equal(weights.encounter, 112.5);
  });

  it('boosts support rooms after a combat-like streak that includes npcBattle', () => {
    const weights = applyRoomPacingModifiers(getRandomRoomBaseWeights(), [
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.npcBattle, random: false },
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.encounter, random: true }
    ]);

    assert.equal(weights.friendlyNpc, 31.5);
    assert.equal(weights.whackAMole, 24.5);
    assert.equal(weights.shrine, 17.5);
    assert.equal(weights.campfire, 22.75);
  });

  it('pity-boosts long-unseen room types without forcing fixed counts', () => {
    const afterSix = applyRoomPacingModifiers(getRandomRoomBaseWeights(), [
      { type: ROOM_TYPES.friendlyNpc, random: true },
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.whackAMole, random: true },
      { type: ROOM_TYPES.encounter, random: true },
      { type: ROOM_TYPES.campfire, random: true },
      { type: ROOM_TYPES.encounter, random: true }
    ]);

    assert.equal(afterSix.shrine, 15);
  });
});

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

    it('places npcBattle at room 6 and keeps Hinoneko as boss at room 10', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assert.equal(rooms[5].type, 'npcBattle');
      assert.equal(rooms[9].type, 'boss');
      assert.equal(rooms[9].boss.creatureId, 'hinoneko');
    });

    it('fills remaining rooms with encounter, friendlyNpc, or whackAMole', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba');
      assertOnlyEnabledRoomTypes(rooms, new Set([5, 9]));
    });

    it('does not generate disabled room types', () => {
      assertNoDisabledRoomTypes(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('friendlyNpc rooms should have offerCategory set to equipment', () => {
      assertFriendlyNpcOfferCategories(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('shrine rooms have modern shrine state when generated', () => {
      assertShrineRoomState(generateAreaRooms('hajimari-no-hiroba'));
    });

    it('tutorial mode uses the 7-room first-user playtest sequence', () => {
      const rooms = generateAreaRooms('hajimari-no-hiroba', undefined, undefined, undefined, undefined, true);
      assert.equal(rooms.length, 7);
      assert.deepEqual(rooms.map(room => room.type), [
        'encounter',
        'friendlyNpc',
        'encounter',
        'npcBattle',
        'whackAMole',
        'campfire',
        'boss'
      ]);
      assert.deepEqual(rooms[5].campfire, { cookedDish: null, consumed: null, fed: false, completed: false });
      assert.equal(rooms[6].boss.creatureId, 'hinoneko');
      assertFriendlyNpcOfferCategories(rooms);
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

    it('creates unresolved random slots instead of support placeholders', () => {
      const rooms = generateAreaRooms('wild-plains');

      assert.equal(rooms.some(room => room.type === ROOM_TYPES.support), false);
      assert.equal(rooms[0].type, ROOM_TYPES.randomRoom);
      assert.equal(rooms[1].type, ROOM_TYPES.randomRoom);
      assert.equal(rooms[5].type, ROOM_TYPES.npcBattle);
      assert.equal(rooms[29].type, ROOM_TYPES.boss);
    });

    it('finalizes random slots using current cooking eligibility', () => {
      const rooms = generateAreaRooms('wild-plains');
      const room = rooms[0];
      const runWithoutRecipe = { rooms, cooking: { ingredients: { mizu: 1 } } };
      const finalizedWithoutRecipe = finalizeRandomRoom(room, runWithoutRecipe, () => 0.99);

      assert.strictEqual(finalizedWithoutRecipe, room);
      assert.notEqual(room.type, ROOM_TYPES.campfire);

      const eligibleRooms = generateAreaRooms('wild-plains');
      const eligibleRoom = eligibleRooms[0];
      const runWithRecipe = { rooms: eligibleRooms, cooking: { ingredients: { mizu: 1, miso: 1 } } };
      finalizeRandomRoom(eligibleRoom, runWithRecipe, () => 0.99);

      assert.equal(eligibleRoom.type, ROOM_TYPES.campfire);
      assert.equal(eligibleRoom.randomRoomResolved, true);
    });

    it('does not generate disabled room types', () => {
      assertNoDisabledRoomTypes(generateAreaRooms('wild-plains'));
    });

    it('friendlyNpc rooms should have offerCategory set to equipment', () => {
      assertFriendlyNpcOfferCategories(generateAreaRooms('wild-plains'));
    });

    it('shrine rooms have modern shrine state when generated', () => {
      assertShrineRoomState(generateAreaRooms('wild-plains'));
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
