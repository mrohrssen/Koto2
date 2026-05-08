import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createRoom,
  getRoomActions,
  resolveSupportRoom,
  resolveSupportRoomType,
  ROOM_TYPES,
} from '../../../src/game/rooms.js';

describe('cooking room types', () => {
  it('creates materials and campfire room state', () => {
    const materials = createRoom(ROOM_TYPES.materials, 'test-area', 1, 3);
    const campfire = createRoom(ROOM_TYPES.campfire, 'test-area', 2, 3);

    assert.deepStrictEqual(materials.materials, { drops: null, claimed: false, completed: false });
    assert.deepStrictEqual(campfire.campfire, { cookedDish: null, consumed: null, fed: false, completed: false });
  });

  it('shows room actions for unfinished materials and campfire rooms', () => {
    const materials = createRoom(ROOM_TYPES.materials, 'test-area', 1, 3);
    const campfire = createRoom(ROOM_TYPES.campfire, 'test-area', 2, 3);

    assert.ok(getRoomActions(materials).some(action => action.id === 'materials_claim'));
    assert.ok(getRoomActions(campfire).some(action => action.id === 'campfire_cook'));
  });

  it('resolves support room to campfire only when ingredients exist', () => {
    assert.strictEqual(resolveSupportRoomType({ cooking: { ingredients: {} } }, () => 0), ROOM_TYPES.whackAMole);
    assert.strictEqual(resolveSupportRoomType({ cooking: { ingredients: { ebi: 1 } } }, () => 0), ROOM_TYPES.campfire);
  });

  it('never resolves support rooms to materials rooms', () => {
    const rolls = [0, 0.09, 0.10, 0.44, 0.49, 0.99];

    for (const roll of rolls) {
      assert.notStrictEqual(resolveSupportRoomType({ cooking: { ingredients: {} } }, () => roll), ROOM_TYPES.materials);
      assert.notStrictEqual(resolveSupportRoomType({ cooking: { ingredients: { ebi: 1 } } }, () => roll), ROOM_TYPES.materials);
    }
  });

  it('gives campfire a 50 percent support-room window when ingredients exist', () => {
    assert.strictEqual(resolveSupportRoomType({ cooking: { ingredients: { ebi: 1 } } }, () => 0.49), ROOM_TYPES.campfire);
    assert.notStrictEqual(resolveSupportRoomType({ cooking: { ingredients: { ebi: 1 } } }, () => 0.50), ROOM_TYPES.campfire);
    assert.notStrictEqual(resolveSupportRoomType({ cooking: { ingredients: {} } }, () => 0.49), ROOM_TYPES.campfire);
  });

  it('mutates a support room into a persisted concrete room', () => {
    const room = createRoom(ROOM_TYPES.support, 'test-area', 1, 3);
    room.subArea = { id: 'sub', name: 'Sub' };
    const resolved = resolveSupportRoom(room, { cooking: { ingredients: { ebi: 1 } } }, () => 0);

    assert.strictEqual(resolved, room);
    assert.strictEqual(room.type, ROOM_TYPES.campfire);
    assert.strictEqual(room.id, 'test-area_room1');
    assert.deepStrictEqual(room.subArea, { id: 'sub', name: 'Sub' });
  });
});
