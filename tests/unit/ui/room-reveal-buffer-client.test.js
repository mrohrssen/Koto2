import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import {
  applyOptimisticRoomAdvance,
  getBufferedRoom,
  getCurrentRoom,
  getNextRoom,
} from '../../../public/js/ui/room-reveal-buffer.js';

function sampleState() {
  return {
    player: { name: 'ClientReveal' },
    phase: 'room',
    room: { id: 'room-0', type: ROOM_TYPES.encounter, interacted: true },
    run: {
      active: true,
      areaSelectionRequired: false,
      currentArea: { id: 'hajimari-no-hiroba' },
      currentRoom: 0,
      roomActionSeq: 4,
      totalRooms: 3,
      initialSkillPick: { chosenId: 'buffMaster' },
      creatureParty: { active: [{ id: 'hi' }] },
      exploreRunway: {
        preparedRooms: [
          { index: 0, room: { id: 'room-0', type: ROOM_TYPES.encounter, interacted: true } },
          { index: 1, room: { id: 'room-1', type: ROOM_TYPES.friendlyNpc, interacted: false } },
        ],
      },
    },
  };
}

describe('client room reveal buffer helpers', () => {
  it('reads current and next rooms without run.rooms', () => {
    const state = sampleState();

    assert.equal(getCurrentRoom(state).type, ROOM_TYPES.encounter);
    assert.equal(getNextRoom(state).type, ROOM_TYPES.friendlyNpc);
    assert.equal(getBufferedRoom(state, 2), null);
  });

  it('applies an optimistic advance using the buffered next room only', () => {
    const state = sampleState();

    const draft = applyOptimisticRoomAdvance(state);

    assert.equal(draft.run.currentRoom, 1);
    assert.equal(draft.room.type, ROOM_TYPES.friendlyNpc);
    assert.equal(draft.phase, 'friendlyNpc');
    assert.equal(Object.hasOwn(draft.run, 'rooms'), false);
    assert.equal(state.run.currentRoom, 0, 'helper should not mutate caller state');
  });

  it('returns null when there is no buffered next room', () => {
    const state = sampleState();
    state.run.exploreRunway.preparedRooms = [
      { index: 0, room: { id: 'room-0', type: ROOM_TYPES.encounter } },
    ];

    assert.equal(getNextRoom(state), null);
    assert.equal(applyOptimisticRoomAdvance(state), null);
  });

  it('matches server room-entry recovery byte-for-byte', () => {
    const rooms = [
      createRoom(ROOM_TYPES.friendlyNpc, 'okunomori', 1, 2),
      createRoom(ROOM_TYPES.friendlyNpc, 'okunomori', 2, 2),
    ];
    rooms[0].interacted = true;
    const creatureParty = {
      active: [
        {
          id: 'hi',
          hp: 40,
          maxHp: 80,
          statStages: { atk: 2, def: -1, dex: 3 },
          activeEffects: [{ type: 'poison', remainingTurns: 2 }],
        },
        {
          id: 'ko',
          hp: 0,
          maxHp: 80,
          statStages: { atk: -2, def: 1, dex: 0 },
          activeEffects: [{ type: 'sleep', remainingTurns: 1 }],
        },
      ],
      reserves: [{
        id: 'reserve',
        hp: 20,
        maxHp: 160,
        statStages: { atk: 1, def: 1, dex: 1 },
        activeEffects: [{ type: 'stun', remainingTurns: 1 }],
      }],
    };
    const baseRun = {
      active: true,
      rooms,
      currentRoom: 0,
      roomsExplored: 1,
      totalEncounters: 1,
      stats: { roomsExplored: 0, areasCleared: 0 },
      runStats: { roomsCleared: 0 },
      areasCompleted: 0,
      areasToWin: 99,
      areaPath: [],
      currentArea: { id: 'okunomori', nameEn: 'Okunomori' },
      areaCleared: false,
      areaSelectionRequired: false,
      player: { credits: 0 },
      partySkills: [{ id: 'hpMaster', level: 2 }],
      creatureParty,
    };
    const serverGm = {
      run: structuredClone(baseRun),
      narrate() {},
      emitState() {},
    };
    const clientState = {
      phase: 'room',
      room: structuredClone(rooms[0]),
      run: {
        ...structuredClone(baseRun),
        exploreRunway: {
          preparedRooms: [
            { index: 0, room: structuredClone(rooms[0]) },
            { index: 1, room: structuredClone(rooms[1]) },
          ],
        },
      },
    };

    new ExplorationService(serverGm).proceedToNextRoom();
    const clientDraft = applyOptimisticRoomAdvance(clientState);

    assert.deepEqual(
      clientDraft.run.creatureParty,
      serverGm.run.creatureParty,
    );
    assert.equal(clientDraft.run.creatureParty.active[0].hp, 60);
    assert.equal(clientDraft.run.creatureParty.active[1].hp, 0);
    assert.deepEqual(
      clientDraft.run.creatureParty.active[0].statStages,
      { atk: 0, def: 0, dex: 0 },
    );
    assert.deepEqual(
      clientDraft.run.creatureParty.active[0].activeEffects,
      [],
    );
  });
});
