import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeRoomForExploreState,
  preparedExploreRoomCapability,
} from '../../../public/js/ui/explore-room-capability.js';

function fixture() {
  const room = { id: 'support-room-4', type: 'shrine' };
  const state = {
    room,
    run: {
      active: true,
      mode: 'standard',
      currentRoom: 4,
      rooms: [null, null, null, null, room],
    },
  };
  const prepared = {
    index: 4,
    roomId: room.id,
    room: structuredClone(room),
    offlineReady: true,
    acceptedActions: ['shrine.choose', 'proceed'],
    interactionPayload: {
      kind: 'shrine',
      roomId: room.id,
      rewards: [{ id: 'heal_all' }],
    },
  };
  const session = {
    currentPreparedRoom: () => prepared,
    isPaused: () => false,
  };
  return { room, state, prepared, session };
}

test('accepts only the exact live, unpaused standard-session capability', () => {
  const { room, state, session } = fixture();
  const capability = preparedExploreRoomCapability({
    session,
    state,
    room,
    expectedKind: 'shrine',
    requiredActions: ['shrine.choose', 'proceed'],
    validatePayload: payload => Array.isArray(payload.rewards) && payload.rewards.length > 0,
  });

  assert.equal(capability.activeStandard, true);
  assert.equal(capability.valid, true);
  assert.equal(capability.payload.kind, 'shrine');
  assert.equal(activeRoomForExploreState(state), room);
});

test('fails closed for every stale, incomplete, malformed, or paused capability axis', () => {
  const mutations = [
    ({ session }) => { session.isPaused = () => true; },
    ({ state }) => { state.run.currentRoom = 3; },
    ({ prepared }) => { prepared.index = 3; },
    ({ prepared }) => { prepared.roomId = 'other-room'; },
    ({ prepared }) => { prepared.room.id = 'other-room'; },
    ({ room }) => { room.type = 'friendlyNpc'; },
    ({ prepared }) => { prepared.room.type = 'friendlyNpc'; },
    ({ prepared }) => { prepared.offlineReady = false; },
    ({ prepared }) => { prepared.acceptedActions = ['shrine.choose']; },
    ({ prepared }) => { prepared.interactionPayload.kind = 'friendlyNpc'; },
    ({ prepared }) => { prepared.interactionPayload.roomId = 'other-room'; },
    ({ prepared }) => { prepared.interactionPayload.rewards = []; },
  ];

  for (const mutate of mutations) {
    const value = fixture();
    mutate(value);
    const capability = preparedExploreRoomCapability({
      session: value.session,
      state: value.state,
      room: value.room,
      expectedKind: 'shrine',
      requiredActions: ['shrine.choose', 'proceed'],
      validatePayload: payload => Array.isArray(payload.rewards) && payload.rewards.length > 0,
    });
    assert.equal(capability.activeStandard, true);
    assert.equal(capability.valid, false);
  }
});

test('does not claim ownership for no-session, inactive, or non-standard runs', () => {
  for (const mutate of [
    value => { value.session = null; },
    value => { value.state.run.active = false; },
    value => { value.state.run.mode = 'kanjiKombat'; },
  ]) {
    const value = fixture();
    mutate(value);
    const capability = preparedExploreRoomCapability({
      session: value.session,
      state: value.state,
      room: value.room,
      expectedKind: 'shrine',
      requiredActions: ['shrine.choose', 'proceed'],
      validatePayload: () => true,
    });
    assert.equal(capability.activeStandard, false);
    assert.equal(capability.valid, false);
  }
});
