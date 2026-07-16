import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTestRoomQueue,
  createRoom,
  finalizeRandomRoom,
  queueTestRooms,
} from '../../../src/game/rooms.js';

afterEach(() => clearTestRoomQueue());

function randomRoom(index, totalRooms = 10) {
  return createRoom('randomRoom', 'hajimari-no-hiroba', index + 1, totalRooms);
}

test('queued debug types materialize once when future runway rooms are prepared', () => {
  const rooms = Array.from({ length: 10 }, (_, index) => randomRoom(index));
  rooms[5] = createRoom('npcBattle', 'hajimari-no-hiroba', 6, 10);
  rooms[9] = createRoom('boss', 'hajimari-no-hiroba', 10, 10);
  const run = { currentRoom: 0, rooms };
  queueTestRooms(['shrine', 'encounter', 'friendlyNpc', 'encounter']);

  finalizeRandomRoom(rooms[0], run, () => 0, { consumeQueuedType: false });
  for (let index = 1; index <= 5; index += 1) {
    finalizeRandomRoom(rooms[index], run, () => 0);
  }

  assert.notEqual(rooms[0].type, 'shrine', 'the current first room does not consume the future queue');
  assert.deepEqual(rooms.slice(1, 5).map(room => room.type), [
    'shrine',
    'encounter',
    'friendlyNpc',
    'encounter',
  ]);
  assert.equal(rooms[5].type, 'npcBattle', 'fixed NPC battle remains untouched');
  assert.equal(rooms[9].type, 'boss', 'fixed boss remains untouched');
});

test('preparing the same room again does not double-consume the queue', () => {
  const rooms = [randomRoom(0), randomRoom(1), randomRoom(2)];
  const run = { currentRoom: 0, rooms };
  queueTestRooms(['shrine', 'encounter']);

  finalizeRandomRoom(rooms[1], run, () => 0);
  finalizeRandomRoom(rooms[1], run, () => 0);
  finalizeRandomRoom(rooms[2], run, () => 0);

  assert.equal(rooms[1].type, 'shrine');
  assert.equal(rooms[2].type, 'encounter');
});

test('fixed NPC and boss rooms do not consume or shift a queued type', () => {
  const npc = createRoom('npcBattle', 'hajimari-no-hiroba', 6, 10);
  const boss = createRoom('boss', 'hajimari-no-hiroba', 10, 10);
  const future = randomRoom(6);
  const run = { currentRoom: 4, rooms: [null, null, null, null, null, npc, future, null, null, boss] };
  queueTestRooms(['shrine']);

  finalizeRandomRoom(npc, run, () => 0);
  finalizeRandomRoom(boss, run, () => 0);
  finalizeRandomRoom(future, run, () => 0);

  assert.equal(npc.type, 'npcBattle');
  assert.equal(boss.type, 'boss');
  assert.equal(future.type, 'shrine');
});
