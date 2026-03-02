import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateAreaRooms, getAreaById, getRoomEntryNarration, createRoom } from '../../../src/game/rooms.js';

describe('Sub-area assignment', () => {
  it('assigns sub-areas to rooms when area has subAreas', () => {
    const area = getAreaById('okunomori');
    if (!area?.subAreas?.length) {
      // Skip if sub-area data not yet added — tested after Task 3
      return;
    }
    const rooms = generateAreaRooms('okunomori', 6);
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
    const rooms = generateAreaRooms('okunomori', 10);
    // With 6 sub-areas and 10 rooms, room 7 (index 6) should wrap to sub-area 0
    const getSubArea = (room) => Array.isArray(room) ? room[0].subArea : room.subArea;
    assert.strictEqual(getSubArea(rooms[6]).id, getSubArea(rooms[0]).id, 'should cycle back');
  });

  it('works gracefully when area has no subAreas', () => {
    // generateAreaRooms should not crash if area lacks subAreas
    const rooms = generateAreaRooms('nonexistent-area', 4);
    assert.ok(rooms.length > 0, 'should still generate rooms');
    assert.strictEqual(rooms[0].subArea, undefined, 'no subArea when area has none');
  });
});

describe('Sub-area narration', () => {
  it('uses sub-area name in narration when present', () => {
    const room = createRoom('encounter', 'okunomori', 3, 10);
    room.subArea = { id: 'okunomori-pond', name: '小さな池', nameEn: 'Small Pond' };
    const narration = getRoomEntryNarration(room);
    assert.ok(narration.includes('小さな池'), 'narration should contain sub-area name');
    assert.ok(narration.includes('3/10'), 'narration should contain room number');
    assert.ok(!narration.includes('エリア'), 'narration should NOT contain エリア');
  });

  it('falls back to エリア format when no sub-area', () => {
    const room = createRoom('encounter', 'okunomori', 3, 10);
    const narration = getRoomEntryNarration(room);
    assert.ok(narration.includes('エリア3/10'), 'should fall back to エリア format');
  });

  it('works for all room types with sub-area', () => {
    const types = ['encounter', 'shrine', 'quiz', 'wordDiscovery', 'dealer', 'whackAMole'];
    for (const type of types) {
      const room = createRoom(type, 'okunomori', 2, 8);
      room.subArea = { id: 'test', name: '古い橋', nameEn: 'Old Bridge' };
      const narration = getRoomEntryNarration(room);
      assert.ok(narration.includes('古い橋'), `${type} narration should use sub-area name`);
    }
  });
});
