import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { createRoom } from '../../../src/game/rooms.js';

function makeGmWithRooms(rooms) {
  return {
    run: {
      active: true,
      rooms,
      currentRoom: 0,
      roomsExplored: 1,
      totalEncounters: 1,
      stats: { roomsExplored: 0, areasCleared: 0 },
      areasCompleted: 0,
      areasToWin: 99,
      areaPath: [],
      currentArea: { id: 'okunomori', nameEn: 'Okunomori' },
      background: null,
      areaCleared: false,
      areaSelectionRequired: false,
      player: { credits: 0 }
    },
    narrate() {},
    emitState() {}
  };
}

describe('ExplorationService proceedToNextRoom guard (Skill Master)', () => {
  it('throws when proceeding from unfinished skillMaster room', () => {
    const skillRoom = createRoom('skillMaster', 'okunomori', 1, 2);
    skillRoom.skillMaster = { offered: null, chosenId: null, completed: false };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    const gm = makeGmWithRooms([skillRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.throws(
      () => svc.proceedToNextRoom(),
      /Must complete Skill Master before proceeding/
    );
  });

  it('does not throw when proceeding from completed skillMaster room', () => {
    const skillRoom = createRoom('skillMaster', 'okunomori', 1, 2);
    skillRoom.skillMaster = { offered: null, chosenId: 'any', completed: true };
    skillRoom.interacted = true;
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    nextRoom.interacted = true; // avoid encounter guard if test code ever proceeds further

    const gm = makeGmWithRooms([skillRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.doesNotThrow(() => svc.proceedToNextRoom());
    assert.strictEqual(gm.run.currentRoom, 1);
  });
});

