import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameManager } from '../../../src/game/loop.js';
import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { PHASES, derivePhase } from '../../../src/game/phase-machine.js';
import {
  buildClientRoomReveal,
  getRoomFromRevealBuffer,
} from '../../../src/game/room-reveal-buffer.js';

function makeRunWithRooms() {
  const player = { name: 'RevealTester', hp: 100, maxHp: 100, attack: 10 };
  const run = createNewRun(player);
  run.currentArea = { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' };
  run.areaSelectionRequired = false;
  run.initialSkillPick.chosenId = 'momentum';
  run.creatureParty.active = [{ id: 'hi', hp: 10, maxHp: 10, level: 1, moves: [] }];
  run.currentRoom = 1;
  run.roomActionSeq = 7;
  run.rooms = [
    createRoom(ROOM_TYPES.encounter, 'hajimari-no-hiroba', 1, 4),
    createRoom(ROOM_TYPES.friendlyNpc, 'hajimari-no-hiroba', 2, 4),
    createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 3, 4),
    createRoom(ROOM_TYPES.boss, 'hajimari-no-hiroba', 4, 4),
  ];
  return { player, run };
}

describe('server-prepared room reveal buffer', () => {
  it('serializes only the current room and one future room', () => {
    const { run } = makeRunWithRooms();

    const reveal = buildClientRoomReveal(run);

    assert.equal(reveal.roomActionSeq, 7);
    assert.equal(reveal.revealedRooms.length, 2);
    assert.deepEqual(
      reveal.revealedRooms.map(entry => [entry.index, entry.room.type]),
      [
        [1, ROOM_TYPES.friendlyNpc],
        [2, ROOM_TYPES.shrine],
      ]
    );
    assert.equal(getRoomFromRevealBuffer({ revealedRooms: reveal.revealedRooms }, 3), null);
  });

  it('deep-clones revealed rooms so client mutations cannot affect the canonical spine', () => {
    const { run } = makeRunWithRooms();

    const reveal = buildClientRoomReveal(run);
    reveal.revealedRooms[0].room.type = 'mutated';

    assert.equal(run.rooms[1].type, ROOM_TYPES.friendlyNpc);
  });

  it('omits full run.rooms from GameManager client state while preserving current room data', () => {
    const { player, run } = makeRunWithRooms();
    const gm = new GameManager();
    gm.player = player;
    gm.initMeta();
    gm.run = run;

    const state = gm.getState();

    assert.equal(Object.hasOwn(state.run, 'rooms'), false);
    assert.equal(state.run.roomActionSeq, 7);
    assert.equal(state.room.type, ROOM_TYPES.friendlyNpc);
    assert.deepEqual(
      state.run.revealedRooms.map(entry => [entry.index, entry.room.type]),
      [
        [1, ROOM_TYPES.friendlyNpc],
        [2, ROOM_TYPES.shrine],
      ]
    );
  });

  it('derives phase from revealed room data when full run.rooms is absent', () => {
    const phase = derivePhase({
      player: { name: 'ClientPlayer' },
      combat: null,
      room: { type: ROOM_TYPES.friendlyNpc, interacted: false },
      run: {
        active: true,
        areaSelectionRequired: false,
        currentArea: { id: 'hajimari-no-hiroba' },
        currentRoom: 2,
        initialSkillPick: { chosenId: 'momentum' },
        creatureParty: { active: [{ id: 'hi' }] },
        revealedRooms: [
          { index: 2, room: { type: ROOM_TYPES.friendlyNpc, interacted: false } },
        ],
      },
    });

    assert.equal(phase, PHASES.FRIENDLY_NPC);
  });
});
