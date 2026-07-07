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

describe('ExplorationService proceedToNextRoom guard (NPC Battle reward)', () => {
  it('throws and does not advance when the npcBattle skill reward is still pending', () => {
    // After an npcBattle victory the room is marked interacted (combat done) and
    // skillSelectionPending is set so the player can pick a party skill. Advancing
    // here would strand the reward — the phase machine only offers npc_skill_selection
    // while currentRoom still points at the npcBattle room.
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = {
      skillSelectionPending: true,
      npc: { id: 'otokonoko', nameEn: 'Boy' }
    };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    const gm = makeGmWithRooms([npcRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.throws(
      () => svc.proceedToNextRoom(),
      /Must claim NPC battle reward before proceeding/
    );
    assert.strictEqual(gm.run.currentRoom, 0);
  });

  it('does not throw once the npcBattle skill reward has been claimed', () => {
    const npcRoom = createRoom('npcBattle', 'okunomori', 1, 2);
    npcRoom.interacted = true;
    npcRoom.npcBattle = { skillSelectionPending: false, chosenSkillId: 'arcStrike' };
    const nextRoom = createRoom('encounter', 'okunomori', 2, 2);
    nextRoom.interacted = true;
    const gm = makeGmWithRooms([npcRoom, nextRoom]);
    const svc = new ExplorationService(gm);

    assert.doesNotThrow(() => svc.proceedToNextRoom());
    assert.strictEqual(gm.run.currentRoom, 1);
  });
});
