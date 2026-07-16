import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import {
  clearTestRoomQueue,
  createRoom,
  generateAreaRooms,
  queueTestRooms,
  ROOM_TYPES,
} from '../../../src/game/rooms.js';
import {
  buildExploreRunway,
  missingPayloadReasonsFor,
} from '../../../src/game/services/explore-runway-service.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { PARTY_SKILL_TREE_IDS } from '../../../src/game/party-skills.js';
import { getDialogueLineText } from '../../../src/services/dialogue-card-tts.js';
import { hashKey } from '../../../src/services/tts-dialogue-cache.js';

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
  const friendlyNpc = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  assert.deepEqual(friendlyNpc.dependencies, ['partyStats']);
  const dealer = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.dealer);
  assert.deepEqual(dealer.actionEffects['dealer.sell'], ['credits', 'partyStats']);
  const boss = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.boss);
  assert.deepEqual(boss.acceptedActions, ['boss.start', 'combat.cycle']);
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

test('rejects malformed support-room identities and essential payload fields', () => {
  const cases = [
    {
      room: { id: 'friendly-1', type: ROOM_TYPES.friendlyNpc },
      payload: { kind: 'wrong', roomId: 'other', npc: null, offered: [], greeting: null },
      expected: [
        'friendlyNpc.kind',
        'friendlyNpc.roomId',
        'friendlyNpc.npc',
        'friendlyNpc.offered',
        'friendlyNpc.greeting',
      ],
    },
    {
      room: { id: 'shrine-1', type: ROOM_TYPES.shrine },
      payload: { kind: 'wrong', roomId: 'other', rewards: [], greeting: null },
      expected: [
        'shrine.kind',
        'shrine.roomId',
        'shrine.rewards',
        'shrine.greeting',
        'shrine.completed',
      ],
    },
    {
      room: { id: 'campfire-1', type: ROOM_TYPES.campfire },
      payload: { kind: 'wrong', roomId: 'other', yesTokens: null, noTokens: null },
      expected: [
        'campfire.kind',
        'campfire.roomId',
        'campfire.ingredients',
        'campfire.ingredientCatalog',
        'campfire.ingredientCount',
        'campfire.discoveredRecipes',
        'campfire.cookableRecipeHints',
        'campfire.recipes',
        'campfire.room',
        'campfire.yesTokens',
        'campfire.noTokens',
      ],
    },
    {
      room: { id: 'skill-1', type: ROOM_TYPES.skillMaster },
      payload: { kind: 'wrong', roomId: 'other', offered: [], skillSelectPrompt: null },
      expected: [
        'skillMaster.kind',
        'skillMaster.roomId',
        'skillMaster.offered',
        'skillMaster.skillSelectPrompt',
        'skillMaster.completed',
      ],
    },
    {
      room: { id: 'dealer-1', type: ROOM_TYPES.dealer },
      payload: { kind: 'wrong', roomId: 'other' },
      expected: [
        'dealer.kind',
        'dealer.roomId',
        'dealer.dealer',
        'dealer.offeredCreatures',
        'dealer.partyCreatures',
        'dealer.credits',
        'dealer.canBuy',
        'dealer.sellCount',
        'dealer.maxSells',
      ],
    },
  ];

  for (const { room, payload, expected } of cases) {
    assert.deepEqual(missingPayloadReasonsFor(room, payload), expected);
  }
});

test('rejects stale nested campfire room identity before accepting cooked or feed state', () => {
  const room = { id: 'campfire-current', type: ROOM_TYPES.campfire };
  const payload = {
    kind: ROOM_TYPES.campfire,
    roomId: room.id,
    ingredients: {},
    ingredientCatalog: [],
    ingredientCount: 0,
    discoveredRecipes: [],
    cookableRecipeHints: [],
    recipes: [],
    room: {
      id: 'campfire-previous',
      type: ROOM_TYPES.campfire,
      campfire: { cookedDish: { id: 'stale-dish' }, completed: true, fedTargetIndex: 0 },
    },
    yesTokens: { tokens: [{}] },
    noTokens: { tokens: [{}] },
  };

  assert.deepEqual(missingPayloadReasonsFor(room, payload), ['campfire.room']);

  payload.room.id = room.id;
  payload.room.type = ROOM_TYPES.shrine;
  assert.deepEqual(missingPayloadReasonsFor(room, payload), ['campfire.room']);
});

test('treats an initialized zero-card speed review snapshot as offline ready', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.speedReviewRoom]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user-with-no-due-cards',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const speedReview = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.speedReviewRoom);
  assert.deepEqual(speedReview.interactionPayload.snapshotWords, []);
  assert.equal(speedReview.interactionPayload.snapshotInitialized, true);
  assert.equal(speedReview.offlineReady, true);
  assert.deepEqual(speedReview.missingPayloadReasons, []);
});

test('prepares a stable word discovery snapshot capped to the remaining daily allowance', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.wordDiscovery]);
  let statusCalls = 0;
  let wordsCalls = 0;
  const opts = {
    userId: 'word-discovery-runway-user',
    dailyWordLimit: 3,
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
    getDiscoveryStatus: async () => {
      statusCalls += 1;
      return { todayCount: 2, dailyLimit: 3, atLimit: false };
    },
    getDiscoveryWords: async limit => {
      wordsCalls += 1;
      assert.equal(limit, 1);
      return {
        words: [
          { word: '火' },
          { word: '水', reading: 'みず', meanings: ['water'] },
        ],
        available: true,
      };
    },
  };

  const first = await buildExploreRunway(gm, opts);
  const discovery = first.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.wordDiscovery);

  assert.deepEqual(discovery.interactionPayload, {
    kind: 'wordDiscovery',
    roomId: gm.run.rooms[1].id,
    snapshotInitialized: true,
    snapshotWords: [{ word: '火', reading: 'ひ', meanings: ['fire'] }],
    snapshotWordKeys: ['火'],
    todayCount: 2,
    dailyLimit: 3,
    atLimit: false,
    available: true,
    wordsLearned: 0,
  });
  assert.equal(discovery.offlineReady, true);
  assert.deepEqual(discovery.missingPayloadReasons, []);

  const rebuilt = await buildExploreRunway(gm, opts);
  assert.deepEqual(
    rebuilt.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.wordDiscovery).interactionPayload,
    discovery.interactionPayload,
  );
  assert.equal(statusCalls, 1, 'the persisted runway status is not fetched again');
  assert.equal(wordsCalls, 1, 'the persisted discovery snapshot is not rerolled');
});

test('prepares finalized random word discovery rooms with the same persisted snapshot contract', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.randomRoom, ROOM_TYPES.boss]);
  queueTestRooms([ROOM_TYPES.wordDiscovery]);
  try {
    const runway = await buildExploreRunway(gm, {
      userId: 'queued-word-discovery-user',
      dailyWordLimit: 5,
      getKnownWords: () => [],
      getDialogueCardAudio: async () => null,
      getDiscoveryStatus: async () => ({ todayCount: 0, dailyLimit: 5, atLimit: false }),
      getDiscoveryWords: async () => ({ words: [{ word: '水' }], available: true }),
    });
    const discovery = runway.preparedRooms.find(entry => entry.index === 1);

    assert.equal(discovery.room.randomRoomResolved, true);
    assert.equal(discovery.interactionPayload.kind, 'wordDiscovery');
    assert.deepEqual(discovery.interactionPayload.snapshotWords, [
      { word: '水', reading: 'みず', meanings: ['water'] },
    ]);
    assert.deepEqual(discovery.interactionPayload.snapshotWordKeys, ['水']);
    assert.equal(discovery.offlineReady, true);
  } finally {
    clearTestRoomQueue();
  }
});

test('treats an initialized empty at-limit word discovery snapshot as offline ready', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.wordDiscovery]);
  let wordsCalls = 0;
  const runway = await buildExploreRunway(gm, {
    userId: 'at-limit-word-discovery-user',
    dailyWordLimit: 2,
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
    getDiscoveryStatus: async () => ({ todayCount: 2, dailyLimit: 2, atLimit: true }),
    getDiscoveryWords: async () => {
      wordsCalls += 1;
      return [{ word: '火' }];
    },
  });
  const discovery = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.wordDiscovery);

  assert.equal(wordsCalls, 0);
  assert.deepEqual(discovery.interactionPayload.snapshotWords, []);
  assert.deepEqual(discovery.interactionPayload.snapshotWordKeys, []);
  assert.equal(discovery.interactionPayload.snapshotInitialized, true);
  assert.equal(discovery.interactionPayload.available, false);
  assert.equal(discovery.interactionPayload.atLimit, true);
  assert.equal(discovery.offlineReady, true);
  assert.deepEqual(discovery.missingPayloadReasons, []);
});

test('reports explicit word discovery payload reasons instead of accepting malformed persisted data', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.wordDiscovery]);
  Object.assign(gm.run.rooms[1].wordDiscovery, {
    snapshotInitialized: true,
    snapshotWords: [{ word: '火', reading: null, meanings: [] }],
    snapshotWordKeys: ['水'],
    todayCount: 'two',
    dailyLimit: 2,
    atLimit: false,
    available: 1,
    wordsLearned: -1,
  });

  const runway = await buildExploreRunway(gm, {
    userId: 'malformed-word-discovery-user',
    dailyWordLimit: 2,
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
    getDiscoveryStatus: async () => { throw new Error('initialized snapshots must not refetch'); },
    getDiscoveryWords: async () => { throw new Error('initialized snapshots must not refetch'); },
  });
  const discovery = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.wordDiscovery);

  assert.equal(discovery.offlineReady, false);
  assert.ok(discovery.missingPayloadReasons.includes('wordDiscovery.snapshotWords'));
  assert.ok(discovery.missingPayloadReasons.includes('wordDiscovery.snapshotWordKeys'));
  assert.ok(discovery.missingPayloadReasons.includes('wordDiscovery.status'));
  assert.ok(discovery.missingPayloadReasons.includes('wordDiscovery.wordsLearned'));
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

test('awards pre-rolled ingredient drops when entering the prepared room', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc, ROOM_TYPES.campfire]);
  gm.narrate = () => {};
  gm.emitState = () => {};
  gm.explorationService = new ExplorationService(gm);

  await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const futureIndex = gm.run.currentRoom + 1;
  const preRolledDrops = structuredClone(gm.run.rooms[futureIndex].entryIngredientDrops);
  const beforeIngredients = structuredClone(gm.run.cooking.ingredients);
  gm.run.rooms[gm.run.currentRoom].interacted = true;

  const result = gm.explorationService.proceedToNextRoom();

  assert.deepEqual(result.ingredientDrops, preRolledDrops);
  for (const drop of preRolledDrops) {
    assert.equal(gm.run.cooking.ingredients[drop.id], (beforeIngredients[drop.id] || 0) + drop.quantity);
  }

  const followupRunway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const currentEntry = followupRunway.preparedRooms.find(entry => entry.index === gm.run.currentRoom);
  assert.deepEqual(currentEntry.entryPayload.ingredientDrops, []);
});

test('prepares campfire yes and no response frames', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.campfire]);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const campfire = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.campfire);
  assert.equal(campfire.interactionPayload.kind, 'campfire');
  assert.ok(campfire.interactionPayload.yesTokens?.tokens?.length > 0);
  assert.ok(campfire.interactionPayload.noTokens?.tokens?.length > 0);
  assert.equal(campfire.offlineReady, true);
});

function assertFullWhackPayload(prepared) {
  assert.equal(prepared.interactionPayload.kind, 'whackAMole');
  assert.ok(prepared.interactionPayload.dialogue?.tokens?.length > 0);
  assert.ok(prepared.interactionPayload.yesTokens?.tokens?.length > 0);
  assert.ok(prepared.interactionPayload.noTokens?.tokens?.length > 0);
  assert.ok(prepared.interactionPayload.pool.length >= 9);
  assert.ok(prepared.interactionPayload.pool.every(entry => (
    entry.id && entry.type && entry.word && entry.reading && entry.meaning && entry.sprite
  )));
  assert.equal(prepared.offlineReady, true);
  assert.deepEqual(prepared.missingPayloadReasons, []);
}

test('prepares the scripted Starting Meadow whack room for a fully offline Yes flow', async () => {
  const gm = makeGm([ROOM_TYPES.encounter]);
  gm.meta.tutorialStep = 0;
  gm.run.rooms = generateAreaRooms(
    'hajimari-no-hiroba',
    undefined,
    undefined,
    undefined,
    undefined,
    true,
  );
  gm.run.currentRoom = 0;

  const runway = await buildExploreRunway(gm, {
    userId: 'starting-meadow-whack-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const whack = runway.preparedRooms.find(entry => entry.index === 4);

  assert.equal(runway.currentRoom, 0);
  assert.equal(whack.room.randomRoomResolved, undefined);
  assertFullWhackPayload(whack);
});

test('repairs malformed persisted Whack dialogue from the shared frame content', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.whackAMole]);
  gm.run.rooms[1].whackAMole.dialogue = { tokens: [], words: [] };

  const runway = await buildExploreRunway(gm, {
    userId: 'repair-whack-dialogue-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const whack = runway.preparedRooms.find(entry => entry.index === 1);

  assertFullWhackPayload(whack);
  assert.ok(gm.run.rooms[1].whackAMole.dialogue.tokens.length > 0);
});

test('finalized random whack rooms carry the same stable offline capability', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.randomRoom, ROOM_TYPES.boss]);
  queueTestRooms([ROOM_TYPES.whackAMole]);
  try {
    const first = await buildExploreRunway(gm, {
      userId: 'random-whack-user',
      getKnownWords: () => [],
      getDialogueCardAudio: async () => null,
    });
    const whack = first.preparedRooms.find(entry => entry.index === 1);
    assert.equal(whack.room.randomRoomResolved, true);
    assertFullWhackPayload(whack);

    const rebuilt = await buildExploreRunway(gm, {
      userId: 'random-whack-user',
      getKnownWords: () => [],
      getDialogueCardAudio: async () => null,
    });
    assert.deepEqual(
      rebuilt.preparedRooms.find(entry => entry.index === 1).interactionPayload.pool,
      whack.interactionPayload.pool,
      'runway refresh should rebuild the same stable pool without rerolling it',
    );
    assert.equal(
      Object.hasOwn(gm.run.rooms[1].whackAMole, 'pool'),
      false,
      'large pool capability must not be duplicated into persisted room state',
    );
  } finally {
    clearTestRoomQueue();
  }
});

test('marks a whack room offline-incomplete with distinct missing capability reasons', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.whackAMole]);
  const runway = await buildExploreRunway(gm, {
    userId: 'invalid-whack-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
    buildWhackAMolePool: () => [{ id: 'too-small' }],
  });
  const whack = runway.preparedRooms.find(entry => entry.index === 1);

  assert.equal(whack.offlineReady, false);
  assert.deepEqual(whack.missingPayloadReasons, ['whackAMole.pool']);
});

test('Whack-a-Mole dialogue remains offline-ready when Game Master audio preparation fails', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.whackAMole]);
  const runway = await buildExploreRunway(gm, {
    userId: 'whack-audio-failure-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => { throw new Error('voicevox down'); },
  });
  const whack = runway.preparedRooms.find(entry => entry.index === 1);

  assert.ok(whack.interactionPayload.dialogue?.tokens?.length > 0);
  assert.equal(Object.hasOwn(whack.interactionPayload.dialogue, 'audio'), false);
  assert.equal(whack.offlineReady, true);
  assert.equal(gm.run.rooms[1].whackAMole.dialogueAudio, undefined);
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

test('rerolls stale non-equipment friendly NPC offers before preparing runway payload', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC' };
  gm.run.rooms[1].friendlyNpc.offered = [
    { id: 'old-tea', category: 'food', word: '茶', reading: 'ちゃ', meaning: 'tea' },
  ];

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const friendly = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  assert.ok(friendly.interactionPayload.offered.length > 0);
  assert.ok(friendly.interactionPayload.offered.every(item => item.category === 'equipment'));
  assert.equal(friendly.offlineReady, true);
});

test('uses iterable known words when selecting frame-safe runway payloads', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC' };

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => new Set(['来る']),
    getDialogueCardAudio: async () => null,
  });

  const friendly = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  assert.deepEqual(friendly.interactionPayload.greeting.words, ['よく', '来る']);
});

// Faithful stand-in for the production dialogue-card resolver on the
// waitForSynthesis:false CACHE-HIT path: it resolves the speaker id the same
// way (explicit speakerId, else game-master default 13), derives the line text
// with the real getDialogueLineText, and keys the WAV with the real hashKey.
// Attaching this lets us pin the ATTACHED key to the key the client's own
// request would derive for THAT speaker — a mismatch (e.g. the service passing
// the wrong speaker) fails the assertion.
function makeAudioResolver({ calls } = {}) {
  return async ({ userId, speakerKey, speakerId, line }) => {
    const text = getDialogueLineText(line);
    const resolvedSpeakerId = Number.isFinite(Number(speakerId)) ? Number(speakerId) : 13;
    if (calls) calls.push({ userId, speakerKey, speakerId, resolvedSpeakerId, text });
    return { userId, key: hashKey(resolvedSpeakerId, text), speakerId: resolvedSpeakerId };
  };
}

test('attaches friendly NPC greeting audio under the client-matching cache key', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC', speakerId: 42 };

  const calls = [];
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: makeAudioResolver({ calls }),
  });

  const friendly = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  const greeting = friendly.interactionPayload.greeting;
  assert.ok(greeting?.tokens?.length > 0, 'greeting frame still present');
  assert.ok(greeting.audio, 'greeting carries an audio descriptor');

  // The service must resolve the NPC's own voice, not a hard-coded game-master.
  const call = calls.find(c => c.speakerKey === 'test_npc');
  assert.ok(call, 'resolver called with the NPC speakerKey');
  assert.equal(call.speakerId, 42, 'resolver called with the NPC speakerId');

  // Pin: the attached key equals the key the client would derive for this
  // speaker + line, using the real tts-dialogue-cache derivation.
  const expectedText = getDialogueLineText(greeting);
  assert.equal(greeting.audio.key, hashKey(42, expectedText));
  assert.equal(greeting.audio.userId, 'runway-user');
});

test('attaches shrine greeting audio under the game-master (13) client-matching key', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.shrine]);

  const calls = [];
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: makeAudioResolver({ calls }),
  });

  const shrine = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.shrine);
  const greeting = shrine.interactionPayload.greeting;
  assert.ok(greeting?.tokens?.length > 0, 'shrine greeting frame still present');
  assert.ok(greeting.audio, 'shrine greeting carries an audio descriptor');

  // Shrine uses the legacy 'shrine_fox' speakerKey, which the resolver maps to
  // the game-master voice (13 unless settings override).
  const call = calls.find(c => c.speakerKey === 'shrine_fox');
  assert.ok(call, 'resolver called with the shrine_fox speakerKey');

  const expectedText = getDialogueLineText(greeting);
  assert.equal(greeting.audio.key, hashKey(13, expectedText));
});

test('attaches Whack-a-Mole dialogue audio under the game-master (13) client-matching key', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.whackAMole]);
  const calls = [];
  const runway = await buildExploreRunway(gm, {
    userId: 'whack-audio-user',
    getKnownWords: () => [],
    getDialogueCardAudio: makeAudioResolver({ calls }),
  });

  const whack = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.whackAMole);
  const dialogue = whack.interactionPayload.dialogue;
  const call = calls.find(entry => entry.speakerKey === 'game-master');

  assert.ok(call, 'resolver called with the Game Master speaker key');
  assert.equal(dialogue.audio.key, hashKey(13, getDialogueLineText(dialogue)));
  assert.deepEqual(gm.run.rooms[1].whackAMole.dialogueAudio, dialogue.audio);
  assert.equal(whack.offlineReady, true);
});

test('reuses the persisted greeting audio descriptor across rebuilds without recompute', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC', speakerId: 42 };

  let resolveCalls = 0;
  const opts = {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async ({ userId, speakerId, line }) => {
      resolveCalls += 1;
      return { userId, key: hashKey(Number(speakerId) || 13, getDialogueLineText(line)), speakerId };
    },
  };

  await buildExploreRunway(gm, opts);
  assert.equal(resolveCalls, 1, 'audio resolved once on first build');
  assert.ok(gm.run.rooms[1].friendlyNpc.greetingAudio, 'descriptor persisted on room state');

  // A second build for the same prepared room reuses the persisted descriptor.
  const rebuilt = await buildExploreRunway(gm, opts);
  assert.equal(resolveCalls, 1, 'audio not re-resolved on rebuild');
  const friendly = rebuilt.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  assert.ok(friendly.interactionPayload.greeting.audio, 'rebuild still carries attached audio');
});

test('a failing audio resolver never fails the runway build and emits no audio', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC', speakerId: 42 };

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => { throw new Error('voicevox down'); },
  });

  const friendly = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.friendlyNpc);
  const greeting = friendly.interactionPayload.greeting;
  assert.ok(greeting?.tokens?.length > 0, 'greeting still present without audio');
  assert.equal(Object.hasOwn(greeting, 'audio'), false, 'no audio attached on synthesis failure');
  assert.equal(friendly.offlineReady, true, 'room still offline-ready without audio');
  assert.equal(gm.run.rooms[1].friendlyNpc.greetingAudio, undefined, 'no descriptor persisted on failure');
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

test('unstarted npcBattle prepared room accepts only start and projected combat cycles', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.npcBattle]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const npcBattle = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.npcBattle);
  assert.ok(npcBattle, 'npcBattle room should be in the prepared window');
  // Reward choice is added only after victory arms the post-combat runway state.
  // Advertising it here would let a forged pre-combat choice bypass the fight.
  assert.deepEqual(npcBattle.acceptedActions, ['npcBattle.start', 'combat.cycle']);
});
