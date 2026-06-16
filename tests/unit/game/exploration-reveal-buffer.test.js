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
  gm.run.initialSkillPick.chosenId = 'buffMaster';
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

  it('exposes exploreRunway only for active regular exploration runs', () => {
    const gm = makeReadyGameManager();
    gm.run.exploreSessionEpoch = 'ese_1111111111111111';
    gm.run.exploreRunway = {
      sessionEpoch: 'ese_1111111111111111',
      roomActionSeq: 0,
      currentRoom: 0,
      preparedAhead: 5,
      preparedRooms: [],
    };

    const explorationState = gm.getState();
    assert.equal(Object.hasOwn(explorationState.run, 'exploreRunway'), true);
    assert.equal(explorationState.run.exploreRunway.sessionEpoch, 'ese_1111111111111111');

    gm.run.mode = 'kanjiKombat';
    const kanjiKombatState = gm.getState();
    assert.equal(Object.hasOwn(kanjiKombatState.run, 'exploreRunway'), false);

    gm.run.mode = null;
    gm.run.active = false;
    const inactiveState = gm.getState();
    assert.equal(Object.hasOwn(inactiveState.run, 'exploreRunway'), false);
  });

  it('falls back when cached exploreRunway lags behind room progress', () => {
    const gm = makeReadyGameManager();
    gm.run.exploreSessionEpoch = 'ese_2222222222222222';
    gm.run.exploreRunway = {
      sessionEpoch: 'ese_2222222222222222',
      roomActionSeq: 0,
      currentRoom: 0,
      preparedAhead: 5,
      preparedRooms: [{ index: 0, room: { type: gm.run.rooms[0].type } }],
    };

    gm.run.rooms[gm.run.currentRoom].interacted = true;
    gm.proceedToNextRoom();

    const state = gm.getState();
    assert.equal(state.run.currentRoom, 1);
    assert.equal(state.run.roomActionSeq, 1);
    assert.equal(state.run.exploreRunway.sessionEpoch, 'ese_2222222222222222');
    assert.equal(state.run.exploreRunway.currentRoom, 1);
    assert.equal(state.run.exploreRunway.roomActionSeq, 1);
    assert.deepEqual(state.run.exploreRunway.preparedRooms, []);
  });

  it('falls back when cached exploreRunway epoch differs from the live run', () => {
    const gm = makeReadyGameManager();
    gm.run.exploreSessionEpoch = 'ese_3333333333333333';
    gm.run.exploreRunway = {
      sessionEpoch: 'ese_4444444444444444',
      roomActionSeq: 0,
      currentRoom: 0,
      preparedAhead: 5,
      preparedRooms: [{ index: 0, room: { type: gm.run.rooms[0].type } }],
    };

    const state = gm.getState();

    assert.equal(state.run.exploreRunway.sessionEpoch, 'ese_3333333333333333');
    assert.equal(state.run.exploreRunway.currentRoom, 0);
    assert.equal(state.run.exploreRunway.roomActionSeq, 0);
    assert.deepEqual(state.run.exploreRunway.preparedRooms, []);
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
