import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { buildExploreRunway } from '../../../src/game/services/explore-runway-service.js';
import { PARTY_SKILL_TREE_IDS } from '../../../src/game/party-skills.js';

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

test('prepares shrine rewards and frame-safe greeting payload', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.shrine]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const shrine = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.shrine);
  assert.equal(shrine.interactionPayload.kind, 'shrine');
  assert.deepEqual(shrine.interactionPayload.rewards.map(reward => reward.id), ['heal_all', 'restore_mp_all', 'level_up']);
  assert.ok(shrine.interactionPayload.greeting?.tokens?.length > 0);
  assert.equal(shrine.offlineReady, true);
});

test('prepares skill master offers and frame-safe prompt payload', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.skillMaster]);
  gm.run.partySkills = [{ id: 'counterMaster', level: 1 }];

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const skillMaster = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.skillMaster);
  assert.equal(skillMaster.interactionPayload.kind, 'skillMaster');
  assert.ok(skillMaster.interactionPayload.offered.length > 0);
  assert.ok(skillMaster.interactionPayload.skillSelectPrompt?.tokens?.length > 0);
  assert.ok(skillMaster.acceptedActions.includes('skillMaster.choose'));
  assert.equal(skillMaster.offlineReady, true);
});

test('pre-rolls future ingredient drops without awarding them early', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc, ROOM_TYPES.campfire]);
  const beforeIngredients = structuredClone(gm.run.cooking.ingredients);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const futureEntry = runway.preparedRooms.find(entry => entry.index > gm.run.currentRoom);
  assert.ok(futureEntry.entryPayload.ingredientDrops.length > 0);
  assert.deepEqual(gm.run.cooking.ingredients, beforeIngredients);
  assert.deepEqual(
    futureEntry.entryPayload.ingredientDrops,
    gm.run.rooms[futureEntry.index].entryIngredientDrops
  );
});

test('prepares friendly NPC greeting before marking payload offline ready', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC' };

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const friendly = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  assert.ok(friendly.interactionPayload.offered.length > 0);
  for (const item of friendly.interactionPayload.offered.filter(item => item.word)) {
    assert.ok(item.tokens?.length > 0);
    assert.ok(item.words?.length > 0);
  }
  assert.ok(friendly.interactionPayload.greeting?.tokens?.length > 0);
  assert.equal(friendly.offlineReady, true);
});

test('marks skill master without offers as missing payload', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.skillMaster]);
  gm.run.partySkills = PARTY_SKILL_TREE_IDS.map(id => ({ id, level: 5 }));

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const skillMaster = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.skillMaster);
  assert.deepEqual(skillMaster.interactionPayload.offered, []);
  assert.equal(skillMaster.offlineReady, false);
  assert.ok(skillMaster.missingPayloadReasons.includes('skillMaster.offered'));
});
