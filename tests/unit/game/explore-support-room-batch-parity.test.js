import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { instantiateCreature } from '../../../src/game/creatures.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { ExploreSessionSyncService } from '../../../src/game/services/explore-session-sync-service.js';
import { resolvePveCursorTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
import { hashTranscript } from '../../../src/shared/action-protocol.js';
import { buildLocalCombatFromStart } from '../../../src/shared/combat/local-combat-start.js';
import { applyRoomEntryPartyRecovery } from '../../../src/game/room-entry-party.js';
import {
  roomDependenciesForType,
  predictedEffectsForAction,
  EXPLORE_EFFECTS,
} from '../../../src/game/services/explore-session-contract.js';

// ---------------------------------------------------------------------------
// Root cause + fix for the task-12e attempt-B transcript_mismatch (seq 7).
//
// A support-room PARTY_STATS effect (shrine blessing / friendlyNpc stat item)
// that shares a sync batch with the NEXT fight's combat entries mutates the
// ALLY-side stats on the server's replay (level/xp/attack/defense/dex/hp/mp —
// every field in buildStateSummary). The client's OFFLINE optimistic path does
// NOT apply that mutation (exploration.js only flags the room complete). If the
// fight is then built offline against un-boosted allies, its first combat.cycle
// hash forks from the server's post-effect replay → transcript_mismatch.
//
// The prepared roll (Task 8) pins the ENEMIES, not the allies — so combat rooms
// dropped PARTY_STATS from their ROOM_DEPENDENCIES. That was correct for enemies
// and wrong for allies. The fix re-adds PARTY_STATS as a combat-room dependency
// so proceeding into a combat room PAUSES (`dependency`) while a PARTY_STATS
// effect is still queued ahead of it, forcing a reconnect drain that lands the
// effect server-side and refreshes combatStart.allies to the boosted snapshot.
// ---------------------------------------------------------------------------

const AREA_ID = 'hajimari-no-hiroba';
const LIVE_EPOCH = 'ese_2222222222222222';

const BIG_MOVE = Object.freeze({
  id: 'smash', name: '砕く', nameEn: 'Smash', reading: 'くだく',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 40, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});

const WEAK_MOVE = Object.freeze({
  id: 'tap', name: '触る', nameEn: 'Tap', reading: 'さわる',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 0, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});

// A GM whose room 0 is a support room and room 1 is a combat room.
function makeGm({
  allyLevel = 3,
  enemyHp = 200,
  supportRoomType = ROOM_TYPES.shrine,
} = {}) {
  const ally = instantiateCreature('hi');
  ally.level = allyLevel;
  ally.moves = [BIG_MOVE];
  ally.hp = ally.maxHp;
  ally.mp = ally.maxMp;

  const run = {
    active: true,
    mode: 'standard',
    currentArea: { id: AREA_ID, nameEn: 'Starting Meadow', bossCreatureId: 'mizu' },
    areaPath: [AREA_ID],
    currentRoom: 0,
    roomActionSeq: 0,
    exploreSessionEpoch: LIVE_EPOCH,
    creatureParty: { active: [ally], reserves: [], maxTotal: 6, pendingCaptures: [] },
    partySkills: [],
    itemBuffs: {
      attackMult: 1, hpMult: 1, elementEdge: 0, flatDamageReduction: 0,
      xpMultiplier: 1, xpBalanceStacks: 0, baseAttackBonus: 0, baseHpBonus: 0, baseMpBonus: 0,
    },
    crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    runSummary: { itemsCollected: 0, creaturesBefriended: 0 },
    stats: { damageDealt: 0 },
    rooms: [
      createRoom(supportRoomType, AREA_ID, 1, 3),
      createRoom(ROOM_TYPES.encounter, AREA_ID, 2, 3),
    ],
    bossesDefeated: [],
    currentAreaEncounters: 0,
  };
  if (supportRoomType === ROOM_TYPES.shrine) {
    run.rooms[0].shrine = {
      offered: true,
      used: false,
      completed: false,
      chosenReward: null,
      greeting: null,
    };
  }
  if (supportRoomType === ROOM_TYPES.wordDiscovery) {
    run.rooms[0].wordDiscovery = {
      completed: false,
      snapshotInitialized: true,
      snapshotWords: [],
      snapshotWordKeys: [],
      wordsLearned: 0,
    };
  }
  if (supportRoomType === ROOM_TYPES.whackAMole) {
    run.rooms[0].whackAMole = { completed: false, score: 0 };
  }

  const gm = {
    player: { name: 'BatchParity', credits: 0 },
    run,
    combat: null,
    meta: { creatureCollection: ['hi'], befriendCount: {}, actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
    userId: null,
    _enemyHp: enemyHp,
    narrations: [],
    narrate(text) { this.narrations.push(text); },
    emitState() {},
    getState() {
      return structuredClone({
        phase: this.combat?.active ? 'combat' : 'room',
        run: this.run,
        combat: this.combat,
        room: this.run.rooms[this.run.currentRoom] || null,
      });
    },
    _onRunDefeat() {},
  };
  run.player = gm.player;

  gm.explorationService = new ExplorationService(gm);
  gm.combatCycleService = new CombatCycleService(gm);
  gm.startCreatureEncounter = () => gm.combatCycleService.startCreatureEncounter();

  gm.combatCycleService._rollEncounterEnemies = () => {
    const enemy = instantiateCreature('mizu');
    enemy.moves = [WEAK_MOVE];
    enemy.hp = enemy.maxHp = gm._enemyHp;
    enemy.mp = enemy.maxMp = 100;
    return { enemies: [enemy], isBoss: false, isNpcBattle: false };
  };
  gm.combatCycleService._rollNpcForBattle = () => null;

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

describe('support-room + combat shared-batch: the fix (combat rooms depend on PARTY_STATS)', () => {
  it('combat room types now declare a PARTY_STATS dependency', () => {
    // The behavior change: proceeding into a combat room while a PARTY_STATS
    // effect is queued ahead must pause, not build the fight offline.
    assert.deepEqual(roomDependenciesForType('encounter'), [EXPLORE_EFFECTS.PARTY_STATS]);
    assert.deepEqual(roomDependenciesForType('boss'), [EXPLORE_EFFECTS.PARTY_STATS]);
    assert.deepEqual(roomDependenciesForType('npcBattle'), [EXPLORE_EFFECTS.PARTY_STATS]);
  });

  it('shrine.choose and friendlyNpc.choose still advertise the PARTY_STATS effect that the dependency guards against', () => {
    // The pause only fires when the pending effect intersects the next room's
    // dependency — these two are the support-room actions that emit it.
    assert.ok(predictedEffectsForAction('shrine.choose').includes(EXPLORE_EFFECTS.PARTY_STATS));
    assert.ok(predictedEffectsForAction('friendlyNpc.choose').includes(EXPLORE_EFFECTS.PARTY_STATS));
  });
});

describe('support-room + combat shared-batch: the root cause it prevents', () => {
  // Documents WHY the dependency is needed: if the fight IS built offline against
  // un-boosted allies (the pre-fix behavior — client never mirrors the shrine
  // stat mutation), the first combat turn hashes DIFFERENTLY from the server's
  // post-shrine replay. This is the transcript_mismatch. The dependency pause
  // above prevents the client from ever reaching this offline-built fight while
  // the shrine effect is still pending.
  it('an offline fight built pre-shrine diverges from the server replay post-shrine (the divergence the pause prevents)', async () => {
    const gm = makeGm({ allyLevel: 3 });
    const creatureKey = gm.run.creatureParty.active[0].id;

    // CLIENT (pre-fix offline behavior): NO stat mirror — party stays level 3.
    const clientParty = { active: [structuredClone(gm.run.creatureParty.active[0])], reserves: [] };
    const prepared = gm.combatCycleService.prepareCombatStart(gm.run.rooms[1]);
    const combatStart = {
      enemy: structuredClone(prepared.enemies[0]),
      enemies: structuredClone(prepared.enemies),
      allies: structuredClone(clientParty.active),
      isBoss: false, isNpcBattle: false,
      optimistic: { combatId: prepared.combatId, stateVersion: 0, nextTurnSeed: prepared.turnSeeds[0] },
    };
    const seedChain = [...prepared.turnSeeds];
    const seed = seedChain[0];
    const clientCombat = buildLocalCombatFromStart(combatStart, seedChain);
    const clientHash = hashTranscript(resolvePveCursorTurn(
      { combat: clientCombat, run: { creatureParty: clientParty, itemBuffs: gm.run.itemBuffs, partySkills: [] }, moveChoices: [{ creatureIndex: 0, moveId: BIG_MOVE.id, targetIndex: 0 }] },
      { actionType: 'attack', seed },
    ).transcript);

    // SERVER: replay shrine.choose -> proceed -> encounter.start (party gets boosted).
    const service = new ExploreSessionSyncService(gm);
    const rooms = gm.run.rooms;
    await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [
      { seq: 1, actionId: 'run_es_10000001', kind: 'shrine.choose', roomIndex: 0, roomId: rooms[0].id, actionSeq: 0, payload: { rewardType: 'level_up', creatureKey } },
      { seq: 2, actionId: 'run_es_10000002', kind: 'proceed', roomIndex: 0, roomId: rooms[0].id, actionSeq: 0, payload: {} },
    ] });
    assert.equal(gm.run.currentRoom, 1);
    await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [
      { seq: 3, actionId: 'run_es_10000003', kind: 'encounter.start', roomIndex: 1, roomId: rooms[1].id, actionSeq: gm.run.roomActionSeq, payload: {} },
    ] });
    assert.equal(gm.combat.active, true);

    const serverSeed = gm.combat.optimistic.nextTurnSeed;
    assert.equal(serverSeed, seed, 'both sides resolve the same head seed — only the ally stats differ');
    const serverHash = hashTranscript(resolvePveCursorTurn(
      { combat: gm.combat, run: gm.run, moveChoices: [{ creatureIndex: 0, moveId: BIG_MOVE.id, targetIndex: 0 }] },
      { actionType: 'attack', seed: serverSeed },
    ).transcript);

    // The shrine LEVEL_UP moved the server ally off the client's snapshot.
    assert.notEqual(
      gm.run.creatureParty.active[0].level, clientParty.active[0].level,
      'server ally level-up is not reflected on the un-mirrored client party',
    );
    assert.notEqual(
      clientHash, serverHash,
      'the un-boosted offline fight diverges — exactly the transcript_mismatch the dependency pause prevents',
    );
  });
});

describe('XP support-room checkpoint + first combat turn parity', () => {
  it('hash-converges word discovery and whack-a-mole checkpoint parties', async () => {
    for (const testCase of [
      {
        roomType: ROOM_TYPES.wordDiscovery,
        kind: 'wordDiscovery.complete',
        payload: {},
        actionId: 'run_es_xp_word_done',
        proceedActionId: 'run_es_xp_word_go',
        startActionId: 'run_es_xp_word_start',
      },
      {
        roomType: ROOM_TYPES.whackAMole,
        kind: 'whackAMole.complete',
        payload: { score: 4 },
        actionId: 'run_es_xp_whack_done',
        proceedActionId: 'run_es_xp_whack_go',
        startActionId: 'run_es_xp_whack_start',
      },
    ]) {
      const gm = makeGm({ supportRoomType: testCase.roomType, allyLevel: 3 });
      const service = new ExploreSessionSyncService(gm);
      const supportRoom = gm.run.rooms[0];
      const combatRoom = gm.run.rooms[1];
      const prepared = gm.combatCycleService.prepareCombatStart(combatRoom);
      const staleCombatStart = {
        enemy: structuredClone(prepared.enemies[0]),
        enemies: structuredClone(prepared.enemies),
        allies: structuredClone(gm.run.creatureParty.active),
        optimistic: {
          combatId: prepared.combatId,
          stateVersion: 0,
          nextTurnSeed: prepared.turnSeeds[0],
        },
      };
      const xpBefore = gm.run.creatureParty.active[0].xp;

      const checkpoint = await service.applySessionSync({
        sessionEpoch: LIVE_EPOCH,
        entries: [{
          seq: 1,
          actionId: testCase.actionId,
          kind: testCase.kind,
          roomIndex: 0,
          roomId: supportRoom.id,
          actionSeq: 0,
          payload: testCase.payload,
        }],
      });

      assert.ok(checkpoint.state.run.creatureParty.active[0].xp > xpBefore);
      assert.equal(gm.run.currentRoom, 0);
      const clientState = structuredClone(checkpoint.state);
      applyRoomEntryPartyRecovery(clientState.run);

      await service.applySessionSync({
        sessionEpoch: LIVE_EPOCH,
        entries: [{
          seq: 2,
          actionId: testCase.proceedActionId,
          kind: 'proceed',
          roomIndex: 0,
          roomId: supportRoom.id,
          actionSeq: 0,
          payload: {},
        }],
      });
      await service.applySessionSync({
        sessionEpoch: LIVE_EPOCH,
        entries: [{
          seq: 3,
          actionId: testCase.startActionId,
          kind: 'encounter.start',
          roomIndex: 1,
          roomId: combatRoom.id,
          actionSeq: 1,
          payload: {},
        }],
      });

      const clientCombat = buildLocalCombatFromStart(
        staleCombatStart,
        prepared.turnSeeds,
        { allies: clientState.run.creatureParty.active },
      );
      const seed = gm.combat.optimistic.nextTurnSeed;
      const moveChoices = [{
        creatureIndex: 0,
        moveId: BIG_MOVE.id,
        targetIndex: 0,
      }];
      const clientTurn = resolvePveCursorTurn({
        combat: clientCombat,
        run: clientState.run,
        moveChoices,
      }, { actionType: 'attack', seed });
      const serverTurn = resolvePveCursorTurn({
        combat: gm.combat,
        run: gm.run,
        moveChoices,
      }, { actionType: 'attack', seed });

      assert.equal(
        hashTranscript(clientTurn.transcript),
        hashTranscript(serverTurn.transcript),
        `${testCase.kind} checkpoint party must hash-converge`,
      );
    }
  });
});
