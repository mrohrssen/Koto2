import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { createRoom } from '../../../src/game/rooms.js';

// The explore runway deep-clones each room into preparedRooms once, on the
// proceed that reveals it. A mid-room mutation — arming an npcBattle skill
// reward when its combat is won — never reaches that snapshot, so the client
// (which reads its current room from the runway) treats the room as done and
// auto-proceeds past the reward. syncPreparedRoomSnapshot re-clones the
// authoritative run.rooms entry into the prepared snapshot to fix that.
function makeGm(rooms, currentRoom, preparedRooms) {
  return {
    run: {
      active: true,
      rooms,
      currentRoom,
      exploreRunway: { currentRoom, preparedRooms },
    },
    narrate() {},
    emitState() {},
  };
}

describe('ExplorationService syncPreparedRoomSnapshot', () => {
  it('re-clones the current room into the stale runway prepared snapshot', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 6, 10);
    npcRoom.interacted = true;

    // Stale runway snapshot captured on entry, before the reward was armed.
    const staleSnapshot = createRoom('npcBattle', 'okunomori', 6, 10);
    staleSnapshot.interacted = true;
    staleSnapshot.npcBattle = { skillSelectionPending: false };

    const rooms = new Array(6).fill(null);
    rooms[5] = npcRoom;
    const preparedRooms = [{ index: 5, room: staleSnapshot }];
    const gm = makeGm(rooms, 5, preparedRooms);
    const svc = new ExplorationService(gm);

    // Combat victory arms the reward on the authoritative room only.
    npcRoom.npcBattle = { skillSelectionPending: true, npc: { id: 'otokonoko', nameEn: 'Boy' } };
    assert.strictEqual(preparedRooms[0].room.npcBattle.skillSelectionPending, false);

    svc.syncPreparedRoomSnapshot();

    assert.strictEqual(preparedRooms[0].room.npcBattle.skillSelectionPending, true);
    assert.strictEqual(preparedRooms[0].room.npcBattle.npc.nameEn, 'Boy');
    // Deep clone, not a shared reference.
    assert.notStrictEqual(preparedRooms[0].room, npcRoom);
  });

  it('is a no-op when the room is not in the prepared window', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 6, 10);
    const rooms = new Array(6).fill(null);
    rooms[5] = npcRoom;
    const gm = makeGm(rooms, 5, [{ index: 7, room: createRoom('encounter', 'okunomori', 8, 10) }]);
    const svc = new ExplorationService(gm);
    assert.doesNotThrow(() => svc.syncPreparedRoomSnapshot());
  });
});
