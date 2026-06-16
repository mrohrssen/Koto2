import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { ExploreSessionSyncService } from '../../../src/game/services/explore-session-sync-service.js';

const AREA_ID = 'hajimari-no-hiroba';
const LIVE_EPOCH = 'ese_1111111111111111';
const TEST_EQUIPMENT = Object.freeze({
  id: 'sync-sword',
  category: 'equipment',
  type: 'boost',
  effect: { field: 'baseAttackBonus', value: 3 },
  nameEn: 'Sync Sword',
});

function makeGm(roomTypes = [ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc]) {
  const player = { name: 'SyncTester', hp: 100, maxHp: 100, credits: 0 };
  const run = createNewRun(player);
  run.active = true;
  run.mode = 'standard';
  run.currentArea = { id: AREA_ID, nameEn: 'Starting Meadow' };
  run.areaPath = [AREA_ID];
  run.currentRoom = 0;
  run.roomActionSeq = 0;
  run.exploreSessionEpoch = LIVE_EPOCH;
  run.creatureParty = {
    active: [{ id: 'hi', hp: 10, maxHp: 10, mp: 5, maxMp: 5, level: 1, moves: [] }],
    reserves: [],
    maxTotal: 3,
    pendingCaptures: [],
  };
  run.itemBuffs = {};
  run.runSummary = { ...(run.runSummary || {}), itemsCollected: 0 };
  run.runStats = { ...(run.runStats || {}), roomsCleared: 0 };
  run.stats = { ...(run.stats || {}), roomsExplored: 0 };
  run.roomsExplored = 0;
  run.totalEncounters = 0;
  run.rooms = roomTypes.map((type, index) => createRoom(type, AREA_ID, index + 1, roomTypes.length));

  for (const room of run.rooms) {
    room.entryIngredientDrops = [];
    if (room.type === ROOM_TYPES.friendlyNpc) {
      room.friendlyNpc.offered = [{ ...TEST_EQUIPMENT }];
    }
  }

  const gm = {
    player,
    run,
    meta: { itemsDiscovered: [], actionLedger: { entries: {}, order: [] } },
    narrations: [],
    stateEmits: 0,
    narrate(text) {
      this.narrations.push(text);
    },
    emitState() {
      this.stateEmits += 1;
    },
    getState() {
      return {
        phase: 'room',
        run: {
          currentRoom: run.currentRoom,
          roomActionSeq: run.roomActionSeq,
          runSummary: { ...run.runSummary },
          exploreRunway: run.exploreRunway || null,
        },
        room: run.rooms[run.currentRoom] || null,
      };
    },
  };

  gm.explorationService = new ExplorationService(gm);
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

function makeEntry(gm, overrides = {}) {
  const roomIndex = overrides.roomIndex ?? gm.run.currentRoom;
  const room = gm.run.rooms[roomIndex];
  return {
    seq: 1,
    actionId: 'run_es_00000001',
    kind: 'proceed',
    roomIndex,
    roomId: room?.id,
    actionSeq: gm.run.roomActionSeq,
    payload: {},
    ...overrides,
  };
}

describe('ExploreSessionSyncService', () => {
  it('returns correction for stale sessionEpoch with rejectedSeq', async () => {
    const gm = makeGm();
    const service = new ExploreSessionSyncService(gm);

    const result = await service.applySessionSync({
      sessionEpoch: 'ese_2222222222222222',
      entries: [makeEntry(gm, { seq: 7 })],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'session_epoch_mismatch');
    assert.equal(result.rejectedSeq, 7);
    assert.equal(result.confirmedThroughSeq, null);
    assert.deepEqual(result.results, []);
    assert.equal(result.state.run.currentRoom, 0);
    assert.equal(result.exploreRunway.sessionEpoch, LIVE_EPOCH);
  });

  it('commits ordered entries and only proceed increments run.roomActionSeq', async () => {
    const gm = makeGm();
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 1,
          actionId: 'run_es_00000001',
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
        }),
        makeEntry(gm, {
          seq: 2,
          actionId: 'run_es_00000002',
          kind: 'proceed',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
        }),
      ],
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
    assert.equal(gm.run.runSummary.itemsCollected, 1);
    assert.equal(room.friendlyNpc.chosenId, TEST_EQUIPMENT.id);
    assert.equal(room.friendlyNpc.completed, true);
    assert.equal(room.interacted, true);
    assert.equal(result.results[0].applyResult.applied, true);
    assert.equal(result.results[1].roomNumber, 2);
    assert.equal(result.state.run.currentRoom, 1);
    assert.equal(result.exploreRunway.roomActionSeq, 1);
  });

  it('stops replay at the first stale actionSeq and confirms through the last committed seq', async () => {
    const gm = makeGm([ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc]);
    const service = new ExploreSessionSyncService(gm);
    const firstRoom = gm.run.rooms[0];
    const secondRoom = gm.run.rooms[1];

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 10,
          actionId: 'run_es_00000010',
          roomIndex: 0,
          roomId: firstRoom.id,
          actionSeq: 0,
        }),
        makeEntry(gm, {
          seq: 11,
          actionId: 'run_es_00000011',
          roomIndex: 1,
          roomId: secondRoom.id,
          actionSeq: 0,
        }),
      ],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'action_seq_mismatch');
    assert.equal(result.confirmedThroughSeq, 10);
    assert.equal(result.rejectedSeq, 11);
    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
    assert.equal(result.results.length, 1);
  });

  it('friendlyNpc.choose applies equipment through ExplorationService.applyFriendlyNpcChoose', async () => {
    const gm = makeGm();
    const originalChoose = gm.explorationService.applyFriendlyNpcChoose.bind(gm.explorationService);
    let calledWith = null;
    gm.explorationService.applyFriendlyNpcChoose = args => {
      calledWith = args;
      return originalChoose(args);
    };
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 3,
          actionId: 'run_es_00000003',
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
        }),
      ],
    });

    assert.deepEqual(calledWith, { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 });
    assert.equal(result.status, 'ok');
    assert.equal(gm.run.roomActionSeq, 0);
    assert.equal(gm.run.creatureParty.active[0].itemBuffs.baseAttackBonus, 3);
    assert.equal(gm.run.creatureParty.active[0].equippedItems[0].id, TEST_EQUIPMENT.id);
    assert.equal(gm.run.runSummary.itemsCollected, 1);
    assert.deepEqual(gm.meta.itemsDiscovered, [TEST_EQUIPMENT.id]);
    assert.equal(result.results[0].chosen.id, TEST_EQUIPMENT.id);
    assert.equal(result.results[0].applyResult.applied, true);
  });
});
