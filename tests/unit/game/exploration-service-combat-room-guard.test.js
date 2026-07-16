import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoom,
  ROOM_TYPES,
} from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';

const AREA_ID = 'hajimari-no-hiroba';

function makeGuardGm(room, { combat = null } = {}) {
  return {
    combat,
    run: {
      active: true,
      mode: 'standard',
      currentRoom: 0,
      roomActionSeq: 4,
      roomsExplored: 1,
      totalEncounters: 1,
      stats: { roomsExplored: 3, areasCleared: 0 },
      runStats: { roomsCleared: 2 },
      areasCompleted: 0,
      areasToWin: 10,
      areaPath: [],
      currentArea: { id: AREA_ID, nameEn: 'Starting Meadow' },
      areaCleared: false,
      gameVictoryPending: false,
      areaSelectionRequired: false,
      player: { credits: 0 },
      creatureParty: { active: [], reserves: [] },
      partySkills: [],
      rooms: [room, createRoom(ROOM_TYPES.friendlyNpc, AREA_ID, 2, 2)],
    },
    narrate() {},
    emitState() {},
  };
}

for (const testCase of [
  {
    name: 'unfinished boss',
    room: Object.assign(createRoom(ROOM_TYPES.boss, AREA_ID, 1, 2), {
      interacted: false,
      boss: { creatureId: 'mizu', defeated: false },
    }),
    combat: null,
  },
  {
    name: 'unfinished NPC battle',
    room: Object.assign(createRoom(ROOM_TYPES.npcBattle, AREA_ID, 1, 2), {
      interacted: false,
      npcBattle: { skillSelectionPending: false },
    }),
    combat: null,
  },
  {
    name: 'active interacted encounter',
    room: Object.assign(createRoom(ROOM_TYPES.encounter, AREA_ID, 1, 2), {
      interacted: true,
    }),
    combat: { active: true },
  },
]) {
  test(`does not mutate while blocking ${testCase.name}`, () => {
    const gm = makeGuardGm(testCase.room, { combat: testCase.combat });
    const before = structuredClone(gm.run);
    const service = new ExplorationService(gm);

    assert.throws(
      () => service.proceedToNextRoom(),
      /Must complete|Must claim|Must resolve/,
      testCase.name,
    );
    assert.deepEqual(gm.run, before, testCase.name);
  });
}

for (const npcBattle of [
  { rewardResolved: true },
  { chosenSkillId: 'hpMaster' },
  { skillSelectionPending: false },
]) {
  test(`advances after resolved NPC reward ${JSON.stringify(npcBattle)}`, () => {
    const room = Object.assign(
      createRoom(ROOM_TYPES.npcBattle, AREA_ID, 1, 2),
      { interacted: true, npcBattle },
    );
    const gm = makeGuardGm(room);
    const service = new ExplorationService(gm);

    service.proceedToNextRoom();

    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 5);
  });
}
