import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { buildExploreRunway } from '../../../src/game/services/explore-runway-service.js';

function makeGm(roomTypes) {
  const player = { name: 'RunwayTester', hp: 100, maxHp: 100, credits: 50 };
  const run = createNewRun(player);
  run.active = true;
  run.mode = 'standard';
  run.currentArea = {
    id: 'hajimari-no-hiroba',
    nameEn: 'Starting Meadow',
    background: 'areas/hajimari-no-hiroba/hajimari-no-hiroba_01.webp',
  };
  run.currentRoom = 1;
  run.roomActionSeq = 4;
  run.areaPath = ['hajimari-no-hiroba'];
  run.cooking = { ingredients: { mizu: 1, gyuunyuu: 1 }, cookedThisRun: [] };
  run.creatureParty = {
    active: [{ id: 'hi', uid: 'hi-1', hp: 10, maxHp: 20, level: 2, rarity: 'common', moves: [] }],
    reserves: [],
    maxTotal: 3,
    pendingCaptures: [],
  };
  run.rooms = roomTypes.map((type, index) => createRoom(type, 'hajimari-no-hiroba', index + 1, roomTypes.length));
  return {
    run,
    meta: { levels: { highestUnlocked: 1 }, creatureCollection: ['hi'], creatureCounts: { hi: 1 }, cookingRecipesDiscovered: [] },
    getCurrentRoom: () => run.rooms[run.currentRoom],
  };
}

test('builds current plus five prepared rooms without removing legacy reveal compatibility', async () => {
  const gm = makeGm([
    ROOM_TYPES.encounter,
    ROOM_TYPES.friendlyNpc,
    ROOM_TYPES.shrine,
    ROOM_TYPES.campfire,
    ROOM_TYPES.dealer,
    ROOM_TYPES.whackAMole,
    ROOM_TYPES.boss,
    ROOM_TYPES.encounter,
  ]);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  assert.match(runway.sessionEpoch, /^ese_[0-9a-f]{16}$/);
  assert.equal(runway.currentRoom, 1);
  assert.equal(runway.roomActionSeq, 4);
  assert.equal(runway.preparedAhead, 5);
  assert.deepEqual(runway.preparedRooms.map(entry => entry.index), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(runway.preparedRooms.map(entry => entry.actionSeq), [4, 5, 6, 7, 8, 9]);
  const dealer = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.dealer);
  assert.deepEqual(dealer.actionEffects['dealer.sell'], ['credits']);
  const boss = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.boss);
  assert.deepEqual(boss.acceptedActions, []);
});

test('finalizes random rooms before they enter the runway', async () => {
  const gm = makeGm([
    ROOM_TYPES.encounter,
    ROOM_TYPES.randomRoom,
    ROOM_TYPES.support,
    ROOM_TYPES.boss,
  ]);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  assert.notEqual(runway.preparedRooms[0].room.type, ROOM_TYPES.randomRoom);
  assert.notEqual(runway.preparedRooms[1].room.type, ROOM_TYPES.support);
});

test('marks missing payloads instead of pretending offline readiness', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].friendlyNpc.offered = [];
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const friendly = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  assert.equal(friendly.room.type, ROOM_TYPES.friendlyNpc);
  assert.equal(friendly.offlineReady, false);
  assert.ok(friendly.missingPayloadReasons.includes('friendlyNpc.offered'));
});

test('does not include raw static Japanese entry narration', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.shrine]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  assert.equal(runway.preparedRooms[0].entryPayload.narrationFrame, null);
  assert.equal(Object.hasOwn(runway.preparedRooms[0].entryPayload, 'rawNarration'), false);
});
