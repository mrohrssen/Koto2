import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameManager } from '../../../src/game/loop.js';
import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { PHASES, derivePhase } from '../../../src/game/phase-machine.js';
import { ensureRoomActionSeq } from '../../../src/game/room-reveal-buffer.js';

function makeRunWithRooms() {
  const player = { name: 'RevealTester', hp: 100, maxHp: 100, attack: 10 };
  const run = createNewRun(player);
  run.currentArea = { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' };
  run.areaSelectionRequired = false;
  run.initialSkillPick.chosenId = 'buffMaster';
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

describe('server room action sequence + client state room shape', () => {
  it('normalizes the room action sequence', () => {
    assert.equal(ensureRoomActionSeq({ roomActionSeq: 7 }), 7);
    assert.equal(ensureRoomActionSeq({ roomActionSeq: -3 }), 0);
    assert.equal(ensureRoomActionSeq({}), 0);
  });

  it('omits full run.rooms and the legacy reveal buffer from GameManager client state', () => {
    const { player, run } = makeRunWithRooms();
    const gm = new GameManager();
    gm.player = player;
    gm.initMeta();
    gm.run = run;

    const state = gm.getState();

    // The canonical spine and the retired reveal buffer never reach the client;
    // the runway (exploreRunway.preparedRooms) is the sole client room source.
    assert.equal(Object.hasOwn(state.run, 'rooms'), false);
    assert.equal(Object.hasOwn(state.run, 'revealedRooms'), false);
    assert.equal(Object.hasOwn(state.run, 'revealBufferSize'), false);
    assert.equal(state.run.roomActionSeq, 7);
    assert.equal(state.room.type, ROOM_TYPES.friendlyNpc);
  });

  it('derives client phase from state.room when full run.rooms is absent', () => {
    // The client never receives run.rooms; the room-reveal buffer keeps the
    // current room on state.room (sourced from exploreRunway.preparedRooms), so
    // phase derivation falls through to state.room.
    const phase = derivePhase({
      player: { name: 'ClientPlayer' },
      combat: null,
      room: { type: ROOM_TYPES.friendlyNpc, interacted: false },
      run: {
        active: true,
        areaSelectionRequired: false,
        currentArea: { id: 'hajimari-no-hiroba' },
        currentRoom: 2,
        initialSkillPick: { chosenId: 'buffMaster' },
        creatureParty: { active: [{ id: 'hi' }] },
      },
    });

    assert.equal(phase, PHASES.FRIENDLY_NPC);
  });

  it('derives server phase from the canonical run.rooms spine', () => {
    const { run } = makeRunWithRooms();
    const phase = derivePhase({
      player: { name: 'ServerPlayer' },
      combat: null,
      room: null,
      run,
    });

    // run.currentRoom === 1 -> friendlyNpc room, not yet interacted.
    assert.equal(phase, PHASES.FRIENDLY_NPC);
  });
});
