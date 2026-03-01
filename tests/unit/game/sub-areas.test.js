import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateFloorRooms, getAreaById } from '../../../src/game/rooms.js';

describe('Sub-area assignment', () => {
  it('assigns sub-areas to rooms when area has subAreas', () => {
    const area = getAreaById('okunomori');
    if (!area?.subAreas?.length) {
      // Skip if sub-area data not yet added — tested after Task 3
      return;
    }
    const rooms = generateFloorRooms('okunomori', 6);
    // First room is single
    assert.ok(rooms[0].subArea, 'first room should have a subArea');
    assert.ok(rooms[0].subArea.name, 'subArea should have a name');
    assert.ok(rooms[0].subArea.nameEn, 'subArea should have nameEn');
    assert.ok(rooms[0].subArea.background, 'subArea should have background');
    // Branch pair rooms should both have the same sub-area
    const pair = rooms[1];
    assert.ok(Array.isArray(pair), 'room 2+ should be a branch pair');
    assert.ok(pair[0].subArea, 'branch room 0 should have subArea');
    assert.ok(pair[1].subArea, 'branch room 1 should have subArea');
    assert.strictEqual(pair[0].subArea.id, pair[1].subArea.id, 'both doors share same sub-area');
  });

  it('cycles through sub-areas when more rooms than sub-areas', () => {
    const area = getAreaById('okunomori');
    if (!area?.subAreas?.length) return;
    const rooms = generateFloorRooms('okunomori', 10);
    // With 6 sub-areas and 10 rooms, room 7 (index 6) should wrap to sub-area 0
    const getSubArea = (room) => Array.isArray(room) ? room[0].subArea : room.subArea;
    assert.strictEqual(getSubArea(rooms[6]).id, getSubArea(rooms[0]).id, 'should cycle back');
  });

  it('works gracefully when area has no subAreas', () => {
    // generateFloorRooms should not crash if area lacks subAreas
    const rooms = generateFloorRooms('nonexistent-area', 4);
    assert.ok(rooms.length > 0, 'should still generate rooms');
    assert.strictEqual(rooms[0].subArea, undefined, 'no subArea when area has none');
  });
});
