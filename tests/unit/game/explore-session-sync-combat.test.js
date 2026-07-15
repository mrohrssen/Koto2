import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

import { instantiateCreature } from '../../../src/game/creatures.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { ExploreSessionSyncService } from '../../../src/game/services/explore-session-sync-service.js';
import { resolvePveCursorTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
import { hashTranscript } from '../../../src/shared/action-protocol.js';
import { buildLocalCombatFromStart } from '../../../src/shared/combat/local-combat-start.js';

const AREA_ID = 'hajimari-no-hiroba';
const LIVE_EPOCH = 'ese_1111111111111111';

const BIG_MOVE = Object.freeze({
  id: 'smash', name: '砕く', nameEn: 'Smash', reading: 'くだく',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 500, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});

const WEAK_MOVE = Object.freeze({
  id: 'tap', name: '触る', nameEn: 'Tap', reading: 'さわる',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 0, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});

// A combat GM wired with the REAL ExplorationService + CombatCycleService so the
// replay path exercises startCreatureEncounter → creatureCombatCycle →
// finalizeCombatVictory / resolveDefeat exactly as the online flow does.
function makeCombatGm({
  roomType = ROOM_TYPES.boss,
  allyMove = BIG_MOVE,
  allyHp = 200,
  enemyHp = 10,
  enemyMove = WEAK_MOVE,
  ownedExtra = false, // add a reserve so the party isn't a single creature
} = {}) {
  const ally = instantiateCreature('hi');
  ally.moves = [allyMove];
  ally.hp = ally.maxHp = allyHp;
  ally.mp = ally.maxMp = 100;

  const reserves = [];
  if (ownedExtra) {
    const bench = instantiateCreature('ki');
    bench.hp = bench.maxHp = 100;
    reserves.push(bench);
  }

  const run = {
    active: true,
    mode: 'standard',
    currentArea: { id: AREA_ID, nameEn: 'Starting Meadow', bossCreatureId: 'mizu' },
    areaPath: [AREA_ID],
    currentRoom: 0,
    roomActionSeq: 0,
    exploreSessionEpoch: LIVE_EPOCH,
    creatureParty: { active: [ally], reserves, maxTotal: 6, pendingCaptures: [] },
    partySkills: [],
    itemBuffs: {
      attackMult: 1, hpMult: 1, elementEdge: 0, flatDamageReduction: 0,
      xpMultiplier: 1, xpBalanceStacks: 0, baseAttackBonus: 0, baseHpBonus: 0, baseMpBonus: 0,
    },
    crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    runSummary: { itemsCollected: 0, creaturesBefriended: 0 },
    stats: { damageDealt: 0 },
    rooms: [createRoom(roomType, AREA_ID, 1, 2), createRoom(ROOM_TYPES.friendlyNpc, AREA_ID, 2, 2)],
    bossesDefeated: [],
    currentAreaEncounters: 0,
  };
  // Boss rooms carry a boss descriptor referencing the enemy the combat rolls.
  if (roomType === ROOM_TYPES.boss) {
    run.rooms[0].boss = { creatureId: 'mizu', defeated: false };
  }

  const gm = {
    player: { name: 'CombatSync', credits: 0 },
    run,
    combat: null,
    meta: { creatureCollection: ['hi'], befriendCount: {}, actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
    userId: null,
    _enemyHp: enemyHp,
    _enemyMove: enemyMove,
    narrations: [],
    narrate(text) { this.narrations.push(text); },
    emitState() {},
    getState() {
      return {
        phase: this.combat?.active ? 'combat' : 'room',
        run: { currentRoom: run.currentRoom, roomActionSeq: run.roomActionSeq, exploreRunway: run.exploreRunway || null },
        combat: this.combat ? { active: this.combat.active } : null,
        room: run.rooms[run.currentRoom] || null,
      };
    },
    _onRunDefeat() {},
  };

  gm.explorationService = new ExplorationService(gm);
  gm.combatCycleService = new CombatCycleService(gm);
  gm.startCreatureEncounter = () => gm.combatCycleService.startCreatureEncounter();

  // Deterministic enemy roll: fixed HP + fixed move so the fight resolves in a
  // predictable number of cycles regardless of creature-generation randomness.
  gm.combatCycleService._rollEncounterEnemies = () => {
    const enemy = instantiateCreature('mizu');
    enemy.moves = [gm._enemyMove];
    enemy.hp = enemy.maxHp = gm._enemyHp;
    enemy.mp = enemy.maxMp = 100;
    return {
      enemies: [enemy],
      isBoss: roomType === ROOM_TYPES.boss,
      isNpcBattle: roomType === ROOM_TYPES.npcBattle,
    };
  };
  gm.combatCycleService._rollNpcForBattle = () => (
    roomType === ROOM_TYPES.npcBattle ? { id: 'npc-rival', nameEn: 'Rival', name: 'ライバル' } : null
  );

  gm.explorationService.buildExploreRunway = async () => {
    const exploreRunway = {
      sessionEpoch: run.exploreSessionEpoch,
      roomActionSeq: run.roomActionSeq,
      currentRoom: run.currentRoom,
      preparedRooms: [],
    };
    run.exploreRunway = exploreRunway;
    return exploreRunway;
  };

  return gm;
}

function startEntry(gm, { seq = 1, actionId = 'run_es_00000001', kind = 'boss.start' } = {}) {
  const room = gm.run.rooms[gm.run.currentRoom];
  return {
    seq, actionId, kind,
    roomIndex: gm.run.currentRoom,
    roomId: room.id,
    actionSeq: gm.run.roomActionSeq,
    payload: {},
  };
}

// Build a combat.cycle entry whose predictedHash matches what the server will
// replay for the CURRENT combat head seed (the honest-client case).
function matchingCycleEntry(gm, { seq, actionId, moveId }) {
  const room = gm.run.rooms[gm.run.currentRoom];
  const seed = gm.combat.optimistic.nextTurnSeed;
  const moveChoices = [{ creatureIndex: 0, moveId, targetIndex: 0 }];
  const resolved = resolvePveCursorTurn(
    { combat: gm.combat, run: gm.run, moveChoices },
    { actionType: 'attack', seed },
  );
  return {
    seq, actionId, kind: 'combat.cycle',
    roomIndex: gm.run.currentRoom,
    roomId: room.id,
    actionSeq: gm.run.roomActionSeq,
    payload: { actionType: 'attack', moveChoices, predictedHash: hashTranscript(resolved.transcript) },
  };
}

describe('ExploreSessionSyncService — combat replay', () => {
  it('replays boss.start + a victory combat.cycle in one batch', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.boss, enemyHp: 10 });
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];

    const start = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000001', kind: 'boss.start' })],
    });
    assert.equal(start.status, 'ok');
    assert.equal(start.results[0].started, true);
    assert.equal(start.results[0].isBoss, true);
    assert.equal(gm.combat.active, true);

    const cycle = matchingCycleEntry(gm, { seq: 2, actionId: 'run_es_00000002', moveId: BIG_MOVE.id });
    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [cycle] });

    assert.equal(result.status, 'ok');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(result.results[0].combatEnded, true);
    assert.equal(result.results[0].victory, true);
    assert.equal(room.interacted, true, 'victory marks the boss room interacted');
    assert.equal(gm.combat.active, false);
  });

  it('replays encounter.start, victory cycle, then proceed for the same room in one batch', async () => {
    // NPC battle: befriend never triggers (npcId set), so a single lethal cycle
    // ends in a clean victory that marks the room interacted and unblocks proceed.
    const gm = makeCombatGm({ roomType: ROOM_TYPES.npcBattle, enemyHp: 10 });
    const service = new ExploreSessionSyncService(gm);

    const start = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000101', kind: 'npcBattle.start' })],
    });
    assert.equal(start.status, 'ok');
    assert.equal(start.results[0].isNpcBattle, true);

    const cycle = matchingCycleEntry(gm, { seq: 2, actionId: 'run_es_00000102', moveId: BIG_MOVE.id });
    const proceed = {
      seq: 3, actionId: 'run_es_00000103', kind: 'proceed',
      roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 0, payload: {},
    };
    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [cycle, proceed] });

    assert.equal(result.status, 'ok');
    assert.equal(result.confirmedThroughSeq, 3);
    assert.equal(result.results[0].victory, true);
    assert.equal(gm.run.currentRoom, 1, 'proceed advanced past the cleared combat room');
    assert.equal(gm.run.roomActionSeq, 1);
  });

  it('replays a duplicate combat.cycle actionId from the ledger without re-committing', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.boss, enemyHp: 500, allyMove: WEAK_MOVE, allyHp: 200, enemyMove: WEAK_MOVE });
    const service = new ExploreSessionSyncService(gm);

    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000201', kind: 'boss.start' })],
    });

    const cycle = matchingCycleEntry(gm, { seq: 2, actionId: 'run_es_00000202', moveId: WEAK_MOVE.id });
    const first = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [cycle] });
    assert.equal(first.status, 'ok');
    assert.equal(first.results[0].combatEnded, false);
    const seedAfterFirst = gm.combat.optimistic.nextTurnSeed;
    const versionAfterFirst = gm.combat.optimistic.stateVersion;

    // Re-POST the exact same entry: dedup fires before the performer, so the chain
    // head must not move (no double-commit).
    const replay = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [cycle] });
    assert.equal(replay.results[0].replayed, true);
    assert.equal(replay.confirmedThroughSeq, 2);
    assert.equal(gm.combat.optimistic.nextTurnSeed, seedAfterFirst);
    assert.equal(gm.combat.optimistic.stateVersion, versionAfterFirst);
  });

  it('replays a landed terminal victory without duplicating rewards', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.npcBattle, enemyHp: 10 });
    const service = new ExploreSessionSyncService(gm);
    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, {
        seq: 1,
        actionId: 'run_es_terminal_start',
        kind: 'npcBattle.start',
      })],
    });
    const cycle = matchingCycleEntry(gm, {
      seq: 2,
      actionId: 'run_es_terminal_cycle',
      moveId: BIG_MOVE.id,
    });

    const first = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [cycle],
    });
    const afterFirst = structuredClone({
      party: gm.run.creatureParty,
      room: gm.run.rooms[0],
      combat: gm.combat,
      stats: gm.run.stats,
      summary: gm.run.runSummary,
    });
    const replay = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [cycle],
    });

    assert.equal(first.results[0].combatEnded, true);
    assert.equal(replay.results[0].combatEnded, true);
    assert.equal(replay.results[0].replayed, true);
    assert.deepEqual({
      party: gm.run.creatureParty,
      room: gm.run.rooms[0],
      combat: gm.combat,
      stats: gm.run.stats,
      summary: gm.run.runSummary,
    }, afterFirst);
  });

  it('replays a landed befriend trigger without rerolling or granting twice', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.encounter, enemyHp: 10 });
    const service = new ExploreSessionSyncService(gm);
    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, {
        seq: 1,
        actionId: 'run_es_befriend_start',
        kind: 'encounter.start',
      })],
    });
    const cycle = matchingCycleEntry(gm, {
      seq: 2,
      actionId: 'run_es_befriend_cycle',
      moveId: BIG_MOVE.id,
    });

    const first = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [cycle],
    });
    const afterFirst = structuredClone({
      party: gm.run.creatureParty,
      enemies: gm.combat.enemies,
      quiz: gm.combat.befriendQuiz,
      pendingCaptures: gm.run.creatureParty.pendingCaptures,
    });
    const replay = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [cycle],
    });

    assert.equal(first.results[0].befriendQuizTriggered, true);
    assert.equal(replay.results[0].befriendQuizTriggered, true);
    assert.equal(replay.results[0].replayed, true);
    assert.deepEqual({
      party: gm.run.creatureParty,
      enemies: gm.combat.enemies,
      quiz: gm.combat.befriendQuiz,
      pendingCaptures: gm.run.creatureParty.pendingCaptures,
    }, afterFirst);
  });

  it('commits the grade and returns a correction on a tampered predictedHash', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.boss, enemyHp: 10 });
    const service = new ExploreSessionSyncService(gm);

    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000301', kind: 'boss.start' })],
    });

    const room = gm.run.rooms[0];
    const tampered = {
      seq: 2, actionId: 'run_es_00000302', kind: 'combat.cycle',
      roomIndex: 0, roomId: room.id, actionSeq: 0,
      payload: { actionType: 'attack', moveChoices: [{ creatureIndex: 0, moveId: BIG_MOVE.id, targetIndex: 0 }], predictedHash: 'deadbeef_not_the_real_hash' },
    };
    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [tampered] });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'transcript_mismatch');
    assert.equal(result.rejectedSeq, 2);
    // Grade landed: the seq is confirmed even though the hash was wrong, and the
    // authoritative combat actually resolved to victory.
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(room.interacted, true);
    assert.equal(gm.combat.active, false);

    // Re-POST of the tampered entry replays from the corrected ledger entry
    // (no re-commit, no action_id_conflict).
    const replay = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [tampered] });
    assert.equal(replay.results[0].replayed, true);
  });

  it('stops the batch at the first invalid combat entry and confirms prior seqs', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.boss, enemyHp: 500, allyMove: WEAK_MOVE, enemyMove: WEAK_MOVE });
    const service = new ExploreSessionSyncService(gm);

    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000401', kind: 'boss.start' })],
    });

    const goodCycle = matchingCycleEntry(gm, { seq: 2, actionId: 'run_es_00000402', moveId: WEAK_MOVE.id });
    // Second entry re-starts combat with a different actionId over the live fight —
    // startCreatureEncounter throws 'Combat already active' (a correction case).
    const badStart = startEntry(gm, { seq: 3, actionId: 'run_es_00000403', kind: 'boss.start' });

    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [goodCycle, badStart] });
    assert.equal(result.status, 'corrected');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(result.rejectedSeq, 3);
    assert.equal(result.results.length, 1);
    assert.match(result.reason, /Combat already active/);
  });

  it('a mid-batch defeat stops further same-room combat entries with a clean rejection', async () => {
    // Ally at 1 HP with a no-power move; boss survives and one-shots the ally →
    // defeat in a single cycle. resolveDefeat sets run.active = false, so the next
    // combat entry fails position validation rather than double-resolving.
    const gm = makeCombatGm({
      roomType: ROOM_TYPES.boss, enemyHp: 500, allyMove: WEAK_MOVE, allyHp: 1, enemyMove: BIG_MOVE,
    });
    const service = new ExploreSessionSyncService(gm);

    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000501', kind: 'boss.start' })],
    });

    const defeatCycle = matchingCycleEntry(gm, { seq: 2, actionId: 'run_es_00000502', moveId: WEAK_MOVE.id });
    const trailingCycle = {
      seq: 3, actionId: 'run_es_00000503', kind: 'combat.cycle',
      roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 0,
      payload: { actionType: 'attack', moveChoices: [{ creatureIndex: 0, moveId: WEAK_MOVE.id, targetIndex: 0 }], predictedHash: 'irrelevant' },
    };

    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [defeatCycle, trailingCycle] });
    assert.equal(result.status, 'corrected');
    assert.equal(result.confirmedThroughSeq, 2, 'the defeat cycle itself is confirmed');
    assert.equal(result.rejectedSeq, 3);
    assert.equal(result.results[0].combatEnded, true);
    assert.equal(result.results[0].victory, false);
    assert.equal(gm.run.active, false, 'defeat ended the run');
  });

  it('replays a koSwap turn (front ally KO, reserve swaps in) with a matching hash', async () => {
    // Front ally at 1 HP with a no-power move; boss survives the tap and one-shots
    // the ally. A reserve is on the bench, so the resolver auto-swaps it in
    // (koSwaps in-transcript, no mid-turn player choice) and the fight continues —
    // a NON-terminal turn. The predicted hash (built from resolvePveCursorTurn)
    // must equal what replayCombatCycleEntry commits, proving KO-swap turns are
    // deterministic across the resolver-prediction / server-replay boundary.
    const gm = makeCombatGm({
      roomType: ROOM_TYPES.boss, enemyHp: 500, allyMove: WEAK_MOVE, allyHp: 1,
      enemyMove: BIG_MOVE, ownedExtra: true,
    });
    const service = new ExploreSessionSyncService(gm);

    await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000701', kind: 'boss.start' })],
    });

    // Sanity: the resolver actually produces a koSwap for this turn (built on a
    // clone so the honest predicted hash is computed against the live head).
    const seed = gm.combat.optimistic.nextTurnSeed;
    const moveChoices = [{ creatureIndex: 0, moveId: WEAK_MOVE.id, targetIndex: 0 }];
    const predicted = resolvePveCursorTurn(
      { combat: gm.combat, run: gm.run, moveChoices },
      { actionType: 'attack', seed },
    );
    assert.ok(predicted.transcript.koSwaps.length > 0, 'turn produces a koSwap');
    assert.equal(predicted.transcript.combatEnded, false, 'koSwap turn is non-terminal');

    const cycle = matchingCycleEntry(gm, { seq: 2, actionId: 'run_es_00000702', moveId: WEAK_MOVE.id });
    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [cycle] });

    assert.equal(result.status, 'ok', 'matching-hash koSwap turn is accepted, not corrected');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(result.results[0].combatEnded, false);
    assert.equal(gm.combat.active, true, 'fight continues after the swap');
    assert.equal(gm.run.creatureParty.reserves.length, 0, 'reserve was swapped into the active slot');
  });

  it('rejects a combat start whose kind does not match the current room type', async () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.boss });
    const service = new ExploreSessionSyncService(gm);

    // Room 0 is a boss room but the client sent encounter.start.
    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [startEntry(gm, { seq: 1, actionId: 'run_es_00000601', kind: 'encounter.start' })],
    });
    assert.equal(result.status, 'corrected');
    assert.match(result.reason, /combat_start_room_mismatch/);
    assert.equal(gm.combat, null, 'no combat started on a mismatch');
  });
});

describe('local combat start — statStages hash parity with server', () => {
  // Reproduces the runway-started-fight first-turn transcript_mismatch: the client
  // builds combat via buildLocalCombatFromStart (which must mirror the server's
  // resetStatStages step), the server builds via startCreatureEncounter, and the
  // SAME first turn must hash identically. buildStateSummary serializes
  // `statStages: creature.statStages || null`, so a client that skips the reset
  // (fresh creatures → statStages absent → null) diverges from the server
  // ({atk:0,def:0,dex:0}) on turn 1 of every offline-started fight.

  // Shape the wire payload buildCombatPayload emits: allies/enemies cloned from
  // the party + prepared roll BEFORE the server mutates them in startCreatureEncounter.
  function buildClientCombatStart(gm, prepared) {
    return {
      combatStart: {
        enemy: structuredClone(prepared.enemies[0] || null),
        enemies: structuredClone(prepared.enemies || []),
        allies: structuredClone(gm.run.creatureParty.active || []),
        isBoss: prepared.isBoss === true,
        isNpcBattle: prepared.isNpcBattle === true,
        optimistic: {
          combatId: prepared.combatId,
          stateVersion: 0,
          nextTurnSeed: prepared.turnSeeds[0] || null,
        },
      },
      seedChain: [...prepared.turnSeeds],
    };
  }

  function resolveFirstTurn(combat, run, seed) {
    // clone:true (default) so the combat object is never mutated by resolution.
    return resolvePveCursorTurn(
      { combat, run, moveChoices: [{ creatureIndex: 0, moveId: BIG_MOVE.id, targetIndex: 0 }] },
      { actionType: 'attack', seed },
    );
  }

  it('client buildLocalCombatFromStart and server startCreatureEncounter hash the same first turn', () => {
    const gm = makeCombatGm({ roomType: ROOM_TYPES.boss, enemyHp: 500, allyHp: 500 });
    const room = gm.run.rooms[0];

    // Real prepared roll (combatId + pre-committed seed chain), shared by both sides.
    const prepared = gm.combatCycleService.prepareCombatStart(room);
    const { combatStart, seedChain } = buildClientCombatStart(gm, prepared);
    const seed = seedChain[0];

    // Client path: fresh creatures, no statStages until buildLocalCombatFromStart resets them.
    assert.equal(
      Object.prototype.hasOwnProperty.call(combatStart.allies[0], 'statStages'), false,
      'precondition: the wire payload carries fresh creatures without statStages',
    );
    const clientCombat = buildLocalCombatFromStart(combatStart, seedChain);

    // Server path: consumes the same prepared roll (single-use) and resets stat stages.
    gm.combatCycleService.startCreatureEncounter();
    const serverCombat = gm.combat;
    assert.equal(serverCombat.optimistic.nextTurnSeed, seed, 'both sides resolve the same head seed');

    const clientHash = hashTranscript(resolveFirstTurn(clientCombat, gm.run, seed).transcript);
    const serverHash = hashTranscript(resolveFirstTurn(serverCombat, gm.run, seed).transcript);

    assert.equal(
      clientHash, serverHash,
      'first-turn transcript hashes must match across the client-build / server-build boundary',
    );
  });
});

test('local combat prefers explicitly supplied current allies over stale payload allies', () => {
  const stale = [{ id: 'hi', hp: 10, maxHp: 100 }];
  const current = [{ id: 'hi', hp: 75, maxHp: 125 }];
  const combat = buildLocalCombatFromStart({
    enemies: [{ id: 'mizu', hp: 100, maxHp: 100 }],
    allies: stale,
    optimistic: { combatId: 'combat-current-party', stateVersion: 0, nextTurnSeed: 'seed-1' },
  }, ['seed-1'], { allies: current });

  assert.strictEqual(combat.allies, current);
  assert.equal(combat.allies[0].hp, 75);
});
