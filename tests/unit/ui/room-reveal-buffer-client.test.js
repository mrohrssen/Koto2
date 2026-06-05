import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_TYPES } from '../../../src/game/rooms.js';
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
      revealedRooms: [
        { index: 0, room: { id: 'room-0', type: ROOM_TYPES.encounter, interacted: true } },
        { index: 1, room: { id: 'room-1', type: ROOM_TYPES.friendlyNpc, interacted: false } },
      ],
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
    state.run.revealedRooms = [{ index: 0, room: { id: 'room-0', type: ROOM_TYPES.encounter } }];

    assert.equal(getNextRoom(state), null);
    assert.equal(applyOptimisticRoomAdvance(state), null);
  });
});
