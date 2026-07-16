import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { buildExploreRunway } from '../../../src/game/services/explore-runway-service.js';
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
