import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { buildExploreRunway } from '../../../src/game/services/explore-runway-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { PVE_TURN_SEED_CHAIN_TARGET } from '../../../src/game/services/combat-seed-chain.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { markNpcBattleRewardResolved } from '../../../src/game/npc-battle-reward.js';

// Mirrors the fixture in explore-runway-service.test.js, plus the combat wiring
// (combatCycleService, narrate, emitState, userId) that prepared combat needs.
function makeGm(roomTypes, { currentRoom = 1 } = {}) {
  const player = { name: 'RunwayCombatTester', hp: 100, maxHp: 100, credits: 50 };
  const run = createNewRun(player);
  run.active = true;
  run.mode = 'standard';
  // A non-tutorial area so the Starting-Meadow forced-cat / hinoneko branches stay dormant.
  run.currentArea = {
    id: 'wild-plains',
    nameEn: 'Wild Plains',
    background: 'areas/wild-plains/wild-plains_01.webp',
    creatures: ['neko', 'inu'],
    stage: 1,
  };
  run.currentRoom = currentRoom;
  run.roomActionSeq = 4;
  run.totalEncounters = 5;
  run.currentAreaEncounters = 2;
  run.areaPath = ['wild-plains'];
  run.cooking = { ingredients: {}, cookedThisRun: [] };
  run.creatureParty = {
    active: [
      { id: 'neko', uid: 'neko-1', hp: 30, maxHp: 30, level: 6, rarity: 'common', moves: [], element: 'fire' },
      { id: 'inu', uid: 'inu-1', hp: 28, maxHp: 28, level: 5, rarity: 'common', moves: [], element: 'water' },
    ],
    reserves: [],
    maxTotal: 3,
    pendingCaptures: [],
  };
  run.rooms = roomTypes.map((type, index) => createRoom(type, 'wild-plains', index + 1, roomTypes.length));

  const gm = {
    userId: 'runway-combat-user',
    run,
    meta: {
      levels: { highestUnlocked: 2 },
      creatureCollection: ['neko', 'inu'],
      creatureCounts: { neko: 1, inu: 1 },
      cookingRecipesDiscovered: [],
    },
    narrate() {},
    emitState() {},
    getCurrentRoom: () => run.rooms[run.currentRoom],
  };
  gm.combatCycleService = new CombatCycleService(gm);
  return gm;
}

test('prepareCombatStart is idempotent and start consumes the prepared roll', () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.encounter], { currentRoom: 0 });
  const svc = gm.combatCycleService;
  const room = gm.run.rooms[0];

  const first = svc.prepareCombatStart(room);
  const second = svc.prepareCombatStart(room);

  assert.equal(first.combatId, second.combatId, 'idempotent: same combatId');
  assert.ok(first.enemies.length >= 1, 'prepared enemies rolled');
  assert.equal(first.turnSeeds.length, PVE_TURN_SEED_CHAIN_TARGET, 'seed chain filled to target');
  assert.equal(first.turnSeeds, second.turnSeeds, 'idempotent: same seed chain reference');

  const started = svc.startCreatureEncounter();
  assert.equal(started.optimistic.combatId, first.combatId, 'start uses prepared combatId');
  assert.equal(started.optimistic.nextTurnSeed, first.turnSeeds[0], 'start head = prepared seed[0]');
  assert.deepEqual(gm.combat.optimistic.turnSeeds, first.turnSeeds, 'start adopts prepared chain');
  assert.deepEqual(started.enemies, first.enemies, 'start uses prepared enemies');
  assert.equal(room.preparedCombat, undefined, 'single-use: preparedCombat cleared after start');
});

test('startCreatureEncounter rolls fresh when no prepared combat exists', () => {
  const gm = makeGm([ROOM_TYPES.encounter], { currentRoom: 0 });
  const svc = gm.combatCycleService;

  const started = svc.startCreatureEncounter();
  assert.ok(started.enemies.length >= 1, 'enemies rolled at start');
  assert.ok(started.optimistic.combatId, 'combatId assigned');
  assert.ok(started.optimistic.nextTurnSeed, 'nextTurnSeed assigned');
});

test('prepareCombatStart covers boss rooms deterministically', () => {
  const gm = makeGm([ROOM_TYPES.boss], { currentRoom: 0 });
  const svc = gm.combatCycleService;
  const room = gm.run.rooms[0];
  room.boss = { defeated: false, creatureId: 'neko' };

  const prepared = svc.prepareCombatStart(room);
  assert.equal(prepared.isBoss, true, 'flagged as boss');
  assert.equal(prepared.enemies.length, 1, 'boss is a solo enemy');
  assert.equal(prepared.enemies[0].id, 'neko', 'boss creature matches room.boss.creatureId');

  const started = svc.startCreatureEncounter();
  assert.equal(started.isBoss, true);
  assert.deepEqual(started.enemies, prepared.enemies, 'start reuses prepared boss enemy');
  assert.equal(room.preparedCombat, undefined);
});

test('prepareCombatStart covers npcBattle rooms with a picked NPC', () => {
  const gm = makeGm([ROOM_TYPES.npcBattle], { currentRoom: 0 });
  const svc = gm.combatCycleService;
  const room = gm.run.rooms[0];

  const prepared = svc.prepareCombatStart(room);
  assert.equal(prepared.isNpcBattle, true, 'flagged as npcBattle');
  assert.equal(prepared.enemies.length, 3, 'npcBattle always rolls 3 enemies');

  const started = svc.startCreatureEncounter();
  assert.equal(started.isNpcBattle, true);
  assert.deepEqual(started.enemies, prepared.enemies, 'start reuses prepared npcBattle enemies');
  // npcData is optional (depends on roster availability) but must round-trip if present.
  assert.equal(gm.combat.npcId ?? null, prepared.npcId ?? null, 'npcId round-trips');
  assert.equal(room.preparedCombat, undefined);
});

test('runway marks combat rooms offlineReady with combatStart + seedChain', async () => {
  const gm = makeGm([ROOM_TYPES.shrine, ROOM_TYPES.encounter]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const combatRoom = runway.preparedRooms.find(r => r.room.type === ROOM_TYPES.encounter);
  assert.ok(combatRoom, 'encounter room present in runway');
  assert.equal(combatRoom.offlineReady, true, 'combat room offline-ready');
  assert.equal(combatRoom.interactionPayload.kind, 'encounter');
  assert.ok(combatRoom.interactionPayload.combatStart.enemies.length >= 1, 'combatStart carries enemies');
  assert.ok(combatRoom.interactionPayload.seedChain.length >= 1, 'seedChain present');
  assert.equal(combatRoom.interactionPayload.combatId, combatRoom.interactionPayload.combatStart.optimistic.combatId);
  assert.equal(combatRoom.interactionPayload.initialStateVersion, 0);
  assert.deepEqual(combatRoom.acceptedActions, ['encounter.start', 'combat.cycle']);
});

test('runway combat rooms carry a PARTY_STATS dependency (pre-roll pins enemies, not ally stats)', async () => {
  // The prepared roll pins the ENEMIES (Task 8), but the ally-side stats still
  // feed the hashed transcript, so a support-room PARTY_STATS effect queued ahead
  // must pause the proceed into the fight (task-12f transcript_mismatch fix). The
  // runway therefore stamps combat rooms with the partyStats dependency.
  const gm = makeGm([ROOM_TYPES.shrine, ROOM_TYPES.encounter, ROOM_TYPES.boss, ROOM_TYPES.npcBattle]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  for (const type of [ROOM_TYPES.encounter, ROOM_TYPES.boss, ROOM_TYPES.npcBattle]) {
    const entry = runway.preparedRooms.find(r => r.room.type === type);
    assert.ok(entry, `${type} present`);
    assert.deepEqual(entry.dependencies, ['partyStats'], `${type} depends on partyStats`);
    // Reward selection is authorized only after an NPC victory arms it. Before
    // combat, every combat room advertises only its start plus projected cycles.
    const expectedActions = [`${type}.start`, 'combat.cycle'];
    assert.deepEqual(entry.acceptedActions, expectedActions);
  }
});

test('runway reuses prepared combat across rebuilds without re-rolling', async () => {
  const gm = makeGm([ROOM_TYPES.shrine, ROOM_TYPES.encounter]);
  const opts = {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  };

  const first = await buildExploreRunway(gm, opts);
  const firstCombat = first.preparedRooms.find(r => r.room.type === ROOM_TYPES.encounter);
  const firstCombatId = firstCombat.interactionPayload.combatId;

  const second = await buildExploreRunway(gm, opts);
  const secondCombat = second.preparedRooms.find(r => r.room.type === ROOM_TYPES.encounter);
  assert.equal(secondCombat.interactionPayload.combatId, firstCombatId, 'combatId stable across rebuilds');
  assert.deepEqual(
    secondCombat.interactionPayload.seedChain,
    firstCombat.interactionPayload.seedChain,
    'seed chain stable across rebuilds',
  );
});

test('runway serializes active then resolved combat without replacing the live fight', async () => {
  const gm = makeGm([ROOM_TYPES.boss, ROOM_TYPES.encounter], { currentRoom: 0 });
  gm.run.currentArea = {
    id: 'hajimari-no-hiroba',
    nameEn: 'Starting Meadow',
    background: 'areas/hajimari-no-hiroba/hajimari-no-hiroba_01.webp',
    creatures: ['hinoneko'],
    bossCreatureId: 'hinoneko',
    stage: 1,
  };
  gm.run.areaPath = ['hajimari-no-hiroba'];
  gm.run.rooms[0].boss = { defeated: false, creatureId: 'hinoneko' };
  const opts = {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  };

  const preparedRunway = await buildExploreRunway(gm, opts);
  const preparedEntry = preparedRunway.preparedRooms[0];
  const preparedId = preparedEntry.interactionPayload.combatId;
  const futureEntry = preparedRunway.preparedRooms[1];
  const futureId = futureEntry.interactionPayload.combatId;
  assert.ok(preparedEntry.interactionPayload.combatStart.tutorialBossIntro);

  gm.combatCycleService.startCreatureEncounter();
  gm.combat.optimistic.stateVersion = 7;
  const liveId = gm.combat.optimistic.combatId;
  const liveEnemies = structuredClone(gm.combat.enemies);
  const liveSeedPrefix = gm.combat.optimistic.turnSeeds.slice(0, 3);
  gm.combat.optimistic.turnSeeds = [...liveSeedPrefix];
  const liveVersion = gm.combat.optimistic.stateVersion;
  const liveNextTurnSeed = gm.combat.optimistic.nextTurnSeed;
  const currentAllies = structuredClone(gm.run.creatureParty.active);
  currentAllies[0].hp -= 1;
  gm.run.creatureParty.active = currentAllies;
  gm.run.rooms[0].interacted = true;

  const refreshed = await buildExploreRunway(gm, opts);
  const activeEntry = refreshed.preparedRooms[0];
  const refreshedFuture = refreshed.preparedRooms[1];
  const refilledLiveSeeds = [...gm.combat.optimistic.turnSeeds];

  assert.equal(gm.run.rooms[0].preparedCombat, undefined);
  assert.equal(liveId, preparedId);
  assert.deepEqual(activeEntry.acceptedActions, ['combat.cycle']);
  assert.equal(activeEntry.interactionPayload.lifecycle, 'active');
  assert.equal(activeEntry.interactionPayload.combatId, liveId);
  assert.equal(activeEntry.interactionPayload.initialStateVersion, liveVersion);
  assert.equal(
    activeEntry.interactionPayload.combatStart.optimistic.nextTurnSeed,
    liveNextTurnSeed,
  );
  assert.deepEqual(activeEntry.interactionPayload.combatStart.enemies, liveEnemies);
  assert.deepEqual(activeEntry.interactionPayload.combatStart.allies, currentAllies);
  assert.deepEqual(activeEntry.interactionPayload.seedChain, refilledLiveSeeds);
  assert.deepEqual(
    activeEntry.interactionPayload.seedChain.slice(0, liveSeedPrefix.length),
    liveSeedPrefix,
  );
  assert.equal(activeEntry.interactionPayload.seedChain.length, PVE_TURN_SEED_CHAIN_TARGET);
  assert.equal(activeEntry.interactionPayload.combatStart.isBoss, true);
  assert.equal(activeEntry.interactionPayload.combatStart.isNpcBattle, false);
  assert.equal(activeEntry.interactionPayload.combatStart.npc, null);
  assert.equal(activeEntry.interactionPayload.combatStart.tutorialBossIntro, null);
  assert.equal(activeEntry.offlineReady, true);
  assert.equal(refreshedFuture.interactionPayload.combatId, futureId);
  assert.ok(gm.run.rooms[1].preparedCombat, 'future combat remains prepared');

  gm.combat.active = false;
  gm.run.rooms[0].preparedCombat = { stale: true };
  const resolved = await buildExploreRunway(gm, opts);
  const resolvedEntry = resolved.preparedRooms[0];

  assert.equal(gm.run.rooms[0].preparedCombat, undefined);
  assert.deepEqual(resolvedEntry.acceptedActions, ['proceed']);
  assert.deepEqual(resolvedEntry.interactionPayload, {
    kind: 'boss',
    lifecycle: 'resolved',
    combatStart: null,
    seedChain: [],
    combatId: null,
    initialStateVersion: 0,
  });
  assert.equal(resolvedEntry.offlineReady, true);
  assert.deepEqual(resolvedEntry.missingPayloadReasons, []);
  assert.equal(resolved.preparedRooms[1].interactionPayload.combatId, futureId);
  assert.ok(gm.run.rooms[1].preparedCombat, 'future combat stays prepared after resolution');
});

test('active NPC combat takes precedence over post-victory reward state', async () => {
  const gm = makeGm([ROOM_TYPES.npcBattle], { currentRoom: 0 });
  const opts = {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  };

  await buildExploreRunway(gm, opts);
  gm.combatCycleService.startCreatureEncounter();
  const liveNpc = structuredClone(gm.combat.npcData);
  gm.run.rooms[0].interacted = true;
  gm.run.rooms[0].npcBattle = { rewardResolved: false };

  const runway = await buildExploreRunway(gm, opts);
  const entry = runway.preparedRooms[0];

  assert.equal(gm.run.rooms[0].preparedCombat, undefined);
  assert.deepEqual(entry.acceptedActions, ['combat.cycle']);
  assert.equal(entry.interactionPayload.lifecycle, 'active');
  assert.deepEqual(entry.interactionPayload.combatStart.npc, liveNpc);
  assert.equal(entry.interactionPayload.combatStart.isNpcBattle, true);
  assert.equal(entry.interactionPayload.combatStart.isBoss, false);
  assert.equal(entry.offlineReady, true);
});

// ============ RIDER: support rooms proceed via the session log ============

test('support rooms grant proceed in acceptedActions', async () => {
  const gm = makeGm([
    ROOM_TYPES.shrine,
    ROOM_TYPES.skillMaster,
    ROOM_TYPES.friendlyNpc,
    ROOM_TYPES.whackAMole,
    ROOM_TYPES.campfire,
    ROOM_TYPES.dealer,
  ]);
  gm.run.rooms[3].npc = { id: 'test_npc', name: 'Test NPC', nameEn: 'Test NPC' };

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  for (const type of [ROOM_TYPES.skillMaster, ROOM_TYPES.whackAMole, ROOM_TYPES.campfire, ROOM_TYPES.dealer]) {
    const entry = runway.preparedRooms.find(r => r.room.type === type);
    assert.ok(entry, `${type} present`);
    assert.ok(entry.acceptedActions.includes('proceed'), `${type} accepts proceed`);
  }
});

test('combat rooms do NOT grant proceed (they use <kind>.start)', async () => {
  const gm = makeGm([ROOM_TYPES.shrine, ROOM_TYPES.encounter, ROOM_TYPES.boss, ROOM_TYPES.npcBattle]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  for (const type of [ROOM_TYPES.encounter, ROOM_TYPES.boss, ROOM_TYPES.npcBattle]) {
    const entry = runway.preparedRooms.find(r => r.room.type === type);
    assert.equal(entry.acceptedActions.includes('proceed'), false, `${type} does not accept proceed`);
  }
});

test('pending post-victory NPC rewards are offline-ready with only choose accepted', async () => {
  const gm = makeGm([ROOM_TYPES.npcBattle, ROOM_TYPES.friendlyNpc], {
    currentRoom: 0,
  });
  gm.explorationService = new ExplorationService(gm);
  const room = gm.run.rooms[0];
  room.interacted = true;
  room.npcBattle ||= {};
  room.npcBattle.skillSelectionPending = true;
  room.npcBattle.rewardResolved = false;
  room.npcBattle.offered = [{ id: 'hpMaster', level: 1 }];

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const entry = runway.preparedRooms.find(item => item.index === 0);

  assert.deepEqual(entry.acceptedActions, ['npcBattleSkill.choose']);
  assert.equal(entry.offlineReady, true);
  assert.deepEqual(entry.missingPayloadReasons, []);
  assert.equal(entry.interactionPayload.kind, 'npcBattle');
  assert.equal(entry.interactionPayload.roomId, room.id);
  assert.equal(entry.interactionPayload.lifecycle, 'resolved');
  assert.equal(entry.interactionPayload.rewardPending, true);
  assert.deepEqual(entry.interactionPayload.offered.map(offer => offer.id), ['hpMaster']);
  assert.ok(entry.interactionPayload.skillSelectPrompt?.tokens?.length > 0);
  assert.equal(room.preparedCombat, undefined);
});

test('resolved post-victory NPC rewards are offline-ready with only proceed accepted', async () => {
  const gm = makeGm([ROOM_TYPES.npcBattle, ROOM_TYPES.friendlyNpc], {
    currentRoom: 0,
  });
  gm.explorationService = new ExplorationService(gm);
  const room = gm.run.rooms[0];
  room.preparedCombat = { stale: true };
  markNpcBattleRewardResolved(room);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const entry = runway.preparedRooms.find(item => item.index === 0);

  assert.deepEqual(entry.acceptedActions, ['proceed']);
  assert.equal(entry.offlineReady, true);
  assert.deepEqual(entry.missingPayloadReasons, []);
  assert.equal(room.preparedCombat, undefined);
});

test('resolved post-victory NPC rewards take precedence over stale pending', async () => {
  const gm = makeGm([ROOM_TYPES.npcBattle, ROOM_TYPES.friendlyNpc], {
    currentRoom: 0,
  });
  const room = gm.run.rooms[0];
  room.interacted = true;
  room.npcBattle = {
    rewardResolved: true,
    skillSelectionPending: true,
    offered: [{ id: 'hpMaster', level: 1 }],
  };

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const entry = runway.preparedRooms.find(item => item.index === 0);

  assert.deepEqual(entry.acceptedActions, ['proceed']);
  assert.equal(entry.offlineReady, true);
  assert.deepEqual(entry.missingPayloadReasons, []);
  assert.equal(room.preparedCombat, undefined);
});

test('explicitly unresolved post-victory NPC rewards are offline-ready with no actions', async () => {
  const gm = makeGm([ROOM_TYPES.npcBattle, ROOM_TYPES.friendlyNpc], {
    currentRoom: 0,
  });
  gm.explorationService = new ExplorationService(gm);
  const room = gm.run.rooms[0];
  room.interacted = true;
  room.npcBattle = { rewardResolved: false };

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-combat-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });
  const entry = runway.preparedRooms.find(item => item.index === 0);

  assert.deepEqual(entry.acceptedActions, []);
  assert.deepEqual(entry.interactionPayload, {
    kind: 'npcBattle',
    lifecycle: 'resolved',
    combatStart: null,
    seedChain: [],
    combatId: null,
    initialStateVersion: 0,
  });
  assert.equal(entry.offlineReady, true);
  assert.deepEqual(entry.missingPayloadReasons, []);
  assert.equal(room.preparedCombat, undefined);
});
