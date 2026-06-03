import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameManager } from '../../../src/game/loop.js';
import { ROOM_TYPES } from '../../../src/game/rooms.js';

function makeReadyGameManager() {
  const gm = new GameManager();
  gm.initMeta();
  gm.createPlayer('RevealRunner');
  gm.startRun(null, null, ['hi']);
  gm.selectArea('hajimari-no-hiroba');
  gm.run.initialSkillPick.chosenId = 'momentum';
  return gm;
}

describe('exploration reveal buffer state', () => {
  it('initializes roomActionSeq and reveal metadata on area entry', () => {
    const gm = makeReadyGameManager();
    const state = gm.getState();

    assert.equal(gm.run.roomActionSeq, 0);
    assert.equal(state.run.roomActionSeq, 0);
    assert.equal(state.run.revealedRooms[0].index, 0);
    assert.equal(state.run.revealedRooms[0].room.type, gm.run.rooms[0].type);
    assert.equal(state.run.revealedRooms.length, Math.min(2, gm.run.rooms.length));
  });

  it('increments roomActionSeq once for an accepted room advance', () => {
    const gm = makeReadyGameManager();
    gm.run.rooms[gm.run.currentRoom].interacted = true;

    const result = gm.proceedToNextRoom();

    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
    assert.equal(result.room.type, gm.run.rooms[1].type);

    const state = gm.getState();
    assert.equal(state.run.roomActionSeq, 1);
    assert.equal(state.run.revealedRooms[0].index, 1);
    assert.equal(state.run.revealedRooms[0].room.type, gm.run.rooms[1].type);
  });

  it('finalizes random and support rooms before they enter the reveal buffer', () => {
    const gm = makeReadyGameManager();
    gm.run.rooms[1].type = ROOM_TYPES.randomRoom;
    gm.run.rooms[1].randomRoom = { resolvedType: null };
    gm.run.rooms[2].type = ROOM_TYPES.support;
    gm.run.rooms[2].support = { resolvedType: null };

    gm.explorationService.prepareRoomRevealBuffer();
    const state = gm.getState();

    assert.notEqual(state.run.revealedRooms[1].room.type, ROOM_TYPES.randomRoom);

    gm.run.rooms[0].interacted = true;
    gm.proceedToNextRoom();
    const nextState = gm.getState();

    assert.notEqual(nextState.run.revealedRooms[1].room.type, ROOM_TYPES.support);
  });
});
