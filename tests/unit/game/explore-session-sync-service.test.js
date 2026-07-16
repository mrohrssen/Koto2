import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { ExploreSessionSyncService } from '../../../src/game/services/explore-session-sync-service.js';
import createGameStateRoutes from '../../../src/routes/game/state.js';

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
  run.areaCleared = false;
  run.gameVictoryPending = false;
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

async function expectSupportReplayOnce({ roomType, kind, payload = {}, installPerformer, assertApplied }) {
  const gm = makeGm();
  gm.run.rooms[0] = createRoom(roomType, AREA_ID, 1, 3);
  gm.run.roomActionSeq = 2;
  let calls = 0;
  installPerformer(gm, () => { calls += 1; });
  const service = new ExploreSessionSyncService(gm);
  const entry = {
    seq: 1,
    actionId: `run_es_${kind.replace(/[^a-z]/gi, '').slice(0, 8)}1`,
    kind,
    roomIndex: 0,
    roomId: gm.run.rooms[0].id,
    actionSeq: 2,
    payload,
  };

  const first = await service.applySessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  const replay = await service.applySessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });

  assert.equal(first.status, 'ok');
  assert.equal(replay.results[0].replayed, true);
  assert.equal(calls, 1);
  assertApplied(gm);
}

describe('ExploreSessionSyncService', () => {
  it('returns correction for stale sessionEpoch with rejectedSeq', async () => {
    const gm = makeGm();
    gm.run.exploreRunway = {
      sessionEpoch: LIVE_EPOCH,
      roomActionSeq: 0,
      currentRoom: 0,
      preparedRooms: [],
    };
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

  it('gives session epoch mismatch priority over malformed batch shape', async () => {
    const gm = makeGm();
    const service = new ExploreSessionSyncService(gm);

    const result = await service.applySessionSync({
      sessionEpoch: 'ese_2222222222222222',
      entries: null,
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'session_epoch_mismatch');
    assert.equal(result.rejectedSeq, null);
    assert.equal(result.confirmedThroughSeq, null);
    assert.deepEqual(result.results, []);
    assert.equal(gm.run.currentRoom, 0);
    assert.deepEqual(gm.meta.actionLedger.order, []);
  });

  it('rejects omitted, empty, and non-array live-epoch batches without mutation', async () => {
    for (const [name, invoke, reason] of [
      ['omitted', service => service.applySessionSync({ sessionEpoch: LIVE_EPOCH }), 'empty_explore_batch'],
      ['empty', service => service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [] }), 'empty_explore_batch'],
      ['null', service => service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: null }), 'invalid_explore_batch'],
    ]) {
      const gm = makeGm();
      let buildCalls = 0;
      gm.explorationService.buildExploreRunway = async () => {
        buildCalls += 1;
        return gm.run.exploreRunway;
      };
      const service = new ExploreSessionSyncService(gm);
      const result = await invoke(service);

      assert.equal(result.status, 'corrected', name);
      assert.equal(result.reason, reason, name);
      assert.equal(result.rejectedSeq, null, name);
      assert.equal(result.confirmedThroughSeq, null, name);
      assert.deepEqual(result.results, [], name);
      assert.equal(gm.run.currentRoom, 0, name);
      assert.equal(gm.run.roomActionSeq, 0, name);
      assert.deepEqual(gm.meta.actionLedger.order, [], name);
      assert.equal(buildCalls, 0, name);
    }
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

  // RIDER (Task 8): support rooms proceed through the session log. Server-side
  // proceed validation must match the legacy route: a choose→proceed pair for a
  // completed support room succeeds in order; an uncompleted-support-room proceed
  // fails validation (skillMaster is the support room with a completion gate).
  it('applies a skillMaster choose→proceed pair through the session log in order', async () => {
    const gm = makeGm([ROOM_TYPES.skillMaster, ROOM_TYPES.friendlyNpc]);
    gm.run.roomActionSeq = 0;
    gm.run.rooms[0].skillMaster = {
      offered: [{ id: 'counterMaster', level: 1 }],
      chosenId: null,
      completed: false,
    };
    const room = gm.run.rooms[0];
    // Stand in for the real choose so the test targets proceed validation, not
    // party-skill mechanics: mark the room completed exactly as the real path does.
    gm.explorationService.applySkillMasterChoose = () => {
      room.skillMaster.completed = true;
      room.skillMaster.chosenId = 'counterMaster';
      room.interacted = true;
      return { ok: true, chosenId: 'counterMaster' };
    };
    const service = new ExploreSessionSyncService(gm);

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 1,
          actionId: 'run_es_00005001',
          kind: 'skillMaster.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: { skillId: 'counterMaster' },
        }),
        makeEntry(gm, {
          seq: 2,
          actionId: 'run_es_00005002',
          kind: 'proceed',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
        }),
      ],
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(room.skillMaster.completed, true);
    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
  });

  it('rejects a proceed for an uncompleted skillMaster support room', async () => {
    const gm = makeGm([ROOM_TYPES.skillMaster, ROOM_TYPES.friendlyNpc]);
    gm.run.roomActionSeq = 0;
    gm.run.rooms[0].skillMaster = {
      offered: [{ id: 'counterMaster', level: 1 }],
      chosenId: null,
      completed: false,
    };
    const service = new ExploreSessionSyncService(gm);

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 1,
          actionId: 'run_es_00005003',
          kind: 'proceed',
          roomIndex: 0,
          roomId: gm.run.rooms[0].id,
          actionSeq: 0,
        }),
      ],
    });

    assert.equal(result.status, 'corrected');
    assert.match(result.reason, /Skill Master/);
    assert.equal(result.rejectedSeq, 1);
    assert.equal(gm.run.currentRoom, 0);
    assert.equal(gm.run.roomActionSeq, 0);
  });

  it('replays an exact duplicate actionId without rerunning the performer', async () => {
    const gm = makeGm();
    const originalProceed = gm.explorationService.applyExploreProceed.bind(gm.explorationService);
    let proceedCalls = 0;
    gm.explorationService.applyExploreProceed = () => {
      proceedCalls += 1;
      return originalProceed();
    };
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];
    const entry = makeEntry(gm, {
      seq: 4,
      actionId: 'run_es_00000004',
      roomIndex: 0,
      roomId: room.id,
      actionSeq: 0,
    });

    const first = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [entry] });
    const replay = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries: [entry] });

    assert.equal(first.status, 'ok');
    assert.equal(replay.status, 'ok');
    assert.equal(replay.results[0].replayed, true);
    assert.equal(replay.confirmedThroughSeq, 4);
    assert.equal(proceedCalls, 1);
    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
  });

  it('passes configured runway options when building an ok response context', async () => {
    const gm = makeGm();
    const getKnownWords = () => ['光'];
    const getDialogueCardAudio = async () => ({ key: 'dialogue.wav' });
    const runwayOpts = { userId: 'route-user', getKnownWords, getDialogueCardAudio };
    const buildCalls = [];
    gm.explorationService.buildExploreRunway = async (opts) => {
      buildCalls.push(opts);
      const exploreRunway = {
        sessionEpoch: gm.run.exploreSessionEpoch,
        roomActionSeq: gm.run.roomActionSeq,
        currentRoom: gm.run.currentRoom,
        preparedRooms: [],
      };
      gm.run.exploreRunway = exploreRunway;
      return exploreRunway;
    };
    const service = new ExploreSessionSyncService(gm, { runwayOpts });

    const result = await service.ok();

    assert.equal(result.status, 'ok');
    assert.equal(buildCalls.length, 1);
    assert.equal(buildCalls[0].userId, 'route-user');
    assert.equal(buildCalls[0].getKnownWords, getKnownWords);
    assert.equal(buildCalls[0].getDialogueCardAudio, getDialogueCardAudio);
  });

  it('rejects same-kind actionId reuse with different entry identity without advancing confirmedThroughSeq', async () => {
    const gm = makeGm([ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc]);
    const service = new ExploreSessionSyncService(gm);
    const firstRoom = gm.run.rooms[0];
    const secondRoom = gm.run.rooms[1];

    const recorded = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 30,
          actionId: 'run_es_00000030',
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: firstRoom.id,
          actionSeq: 0,
          payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
        }),
      ],
    });
    assert.equal(recorded.status, 'ok');

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 31,
          actionId: 'run_es_00000031',
          kind: 'proceed',
          roomIndex: 0,
          roomId: firstRoom.id,
          actionSeq: 0,
        }),
        makeEntry(gm, {
          seq: 32,
          actionId: 'run_es_00000030',
          kind: 'friendlyNpc.choose',
          roomIndex: 1,
          roomId: secondRoom.id,
          actionSeq: 1,
          payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 1 },
        }),
      ],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'action_id_conflict');
    assert.equal(result.confirmedThroughSeq, 31);
    assert.equal(result.rejectedSeq, 32);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].seq, 31);
    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
    assert.equal(secondRoom.friendlyNpc.completed, false);
    assert.equal(gm.run.runSummary.itemsCollected, 1);
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

  it('rejects a missing explore actionId without mutating state', async () => {
    const gm = makeGm();
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 12,
          actionId: undefined,
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
        }),
      ],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'invalid_explore_action_id');
    assert.equal(result.confirmedThroughSeq, null);
    assert.equal(result.rejectedSeq, 12);
    assert.deepEqual(result.results, []);
    assert.equal(gm.run.currentRoom, 0);
    assert.equal(gm.run.roomActionSeq, 0);
    assert.equal(gm.run.runSummary.itemsCollected, 0);
    assert.equal(room.friendlyNpc.completed, false);
    assert.equal(room.friendlyNpc.chosenId, null);
  });

  it('returns stale sessionEpoch correction without decorating or rolling back concurrent mutations', async () => {
    const gm = makeGm();
    const active = gm.run.creatureParty.active;
    gm.combat = { active: true, allies: active };
    const originalRunway = {
      sessionEpoch: LIVE_EPOCH,
      roomActionSeq: 0,
      currentRoom: 0,
      preparedRooms: [{ roomId: 'existing' }],
    };
    gm.run.exploreRunway = originalRunway;
    let buildCalls = 0;
    let releaseBuild;
    const buildGate = new Promise(resolve => { releaseBuild = resolve; });
    gm.explorationService.buildExploreRunway = async () => {
      buildCalls += 1;
      await buildGate;
      return { sessionEpoch: LIVE_EPOCH, preparedRooms: [] };
    };
    const service = new ExploreSessionSyncService(gm);

    const pending = service.applySessionSync({
      sessionEpoch: 'ese_2222222222222222',
      entries: [makeEntry(gm, { seq: 40 })],
    });
    await Promise.resolve();
    gm.run.creatureParty.active[0].hp = 7;
    gm.meta.concurrentMarker = 'landed';
    releaseBuild?.();
    const result = await pending;

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'session_epoch_mismatch');
    assert.equal(result.rejectedSeq, 40);
    assert.equal(buildCalls, 0);
    assert.deepEqual(gm.run.exploreRunway, originalRunway);
    assert.equal(gm.run.creatureParty.active[0].hp, 7);
    assert.equal(gm.meta.concurrentMarker, 'landed');
    assert.strictEqual(gm.combat.allies, gm.run.creatureParty.active);
  });

  it('falls back to the current canonical runway when response decoration throws', async () => {
    const gm = makeGm();
    const originalRunway = {
      sessionEpoch: LIVE_EPOCH,
      roomActionSeq: 0,
      currentRoom: 0,
      preparedRooms: [{ roomId: 'existing' }],
    };
    gm.run.exploreRunway = originalRunway;
    gm.explorationService.buildExploreRunway = async () => {
      throw new Error('decoration unavailable');
    };
    const service = new ExploreSessionSyncService(gm);

    const result = await service.ok();

    assert.equal(result.status, 'ok');
    assert.deepEqual(result.exploreRunway, originalRunway);
    assert.deepEqual(gm.run.exploreRunway, originalRunway);
  });

  it('preflights malformed batches without committing an earlier valid entry', async () => {
    for (const testCase of [
      { name: 'reordered', seqs: [2, 1], ids: ['run_es_shape0001', 'run_es_shape0002'] },
      { name: 'duplicate seq', seqs: [1, 1], ids: ['run_es_shape0011', 'run_es_shape0012'] },
      { name: 'gapped', seqs: [1, 3], ids: ['run_es_shape0021', 'run_es_shape0022'] },
      { name: 'invalid second id', seqs: [1, 2], ids: ['run_es_shape0031', 'bad'] },
      { name: 'duplicate id', seqs: [1, 2], ids: ['run_es_shape0041', 'run_es_shape0041'] },
    ]) {
      const gm = makeGm([ROOM_TYPES.friendlyNpc, ROOM_TYPES.friendlyNpc]);
      const room = gm.run.rooms[0];
      const service = new ExploreSessionSyncService(gm);
      const entries = [
        makeEntry(gm, {
          seq: testCase.seqs[0],
          actionId: testCase.ids[0],
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: {
            itemId: TEST_EQUIPMENT.id,
            targetCreatureIndex: 0,
          },
        }),
        makeEntry(gm, {
          seq: testCase.seqs[1],
          actionId: testCase.ids[1],
          kind: 'proceed',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: {},
        }),
      ];

      const result = await service.applySessionSync({
        sessionEpoch: LIVE_EPOCH,
        entries,
      });

      assert.equal(result.status, 'corrected', testCase.name);
      assert.equal(result.confirmedThroughSeq, null, testCase.name);
      assert.deepEqual(result.results, [], testCase.name);
      assert.equal(gm.run.currentRoom, 0, testCase.name);
      assert.equal(gm.run.roomActionSeq, 0, testCase.name);
      assert.equal(room.interacted, false, testCase.name);
      assert.equal(gm.run.runSummary.itemsCollected, 0, testCase.name);
      assert.deepEqual(gm.meta.actionLedger.order, [], testCase.name);
    }
  });

  it('preflights an exact ledger replay batch before returning replay results', async () => {
    const gm = makeGm();
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];
    const entry = makeEntry(gm, {
      seq: 50,
      actionId: 'run_es_shape_replay',
      kind: 'friendlyNpc.choose',
      roomIndex: 0,
      roomId: room.id,
      actionSeq: 0,
      payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
    });
    const first = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [entry],
    });
    assert.equal(first.status, 'ok');
    const before = structuredClone(gm.run);
    const ledgerBefore = gm.meta.actionLedger;
    const entriesBefore = ledgerBefore.entries;
    const recordedEntryBefore = entriesBefore[entry.actionId];
    const orderBefore = [...ledgerBefore.order];

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        entry,
        makeEntry(gm, {
          seq: 52,
          actionId: 'bad',
          kind: 'proceed',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
        }),
      ],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'non_contiguous_explore_seq');
    assert.equal(result.confirmedThroughSeq, null);
    assert.deepEqual(result.results, []);
    assert.deepEqual(gm.run, before);
    assert.strictEqual(gm.meta.actionLedger, ledgerBefore);
    assert.strictEqual(gm.meta.actionLedger.entries, entriesBefore);
    assert.strictEqual(gm.meta.actionLedger.entries[entry.actionId], recordedEntryBefore);
    assert.deepEqual(gm.meta.actionLedger.order, orderBefore);
  });

  it('rejects a forged proceed that tries to skip an unfinished boss', async () => {
    const gm = makeGm([ROOM_TYPES.boss, ROOM_TYPES.friendlyNpc]);
    gm.run.rooms[0].boss = { creatureId: 'mizu', defeated: false };
    const result = await new ExploreSessionSyncService(gm).applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [makeEntry(gm, {
        seq: 1,
        actionId: 'run_es_boss_skip',
        kind: 'proceed',
        roomIndex: 0,
        roomId: gm.run.rooms[0].id,
        actionSeq: 0,
      })],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'explore_action_not_accepted:proceed');
    assert.equal(gm.run.currentRoom, 0);
    assert.equal(gm.run.areaCleared, false);
    assert.equal(gm.run.gameVictoryPending, false);
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

  it('rejects an invalid sparse friendly NPC target before completing the room', async () => {
    const gm = makeGm();
    const survivor = gm.run.creatureParty.active[0];
    gm.run.creatureParty.active = [null, survivor];
    const service = new ExploreSessionSyncService(gm);
    const room = gm.run.rooms[0];

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 4,
          actionId: 'run_es_00000004',
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
        }),
      ],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'Invalid target creature');
    assert.equal(result.confirmedThroughSeq, null);
    assert.equal(result.rejectedSeq, 4);
    assert.deepEqual(result.results, []);
    assert.equal(room.friendlyNpc.completed, false);
    assert.equal(room.friendlyNpc.chosenId, null);
    assert.equal(room.interacted, false);
    assert.equal(gm.run.runSummary.itemsCollected, 0);
    assert.deepEqual(gm.meta.itemsDiscovered, []);
    assert.equal(survivor.itemBuffs, undefined);
    assert.equal(survivor.equippedItems, undefined);
  });

  it('commits dealer leave idempotently through explore sync', async () => {
    const gm = makeGm();
    gm.run.rooms[0] = createRoom(ROOM_TYPES.dealer, AREA_ID, 1, 3);
    gm.run.roomActionSeq = 2;
    gm.run.rooms[0].dealer.offeredCreatures = [];
    let calls = 0;
    gm.explorationService.applyDealerLeave = () => {
      calls += 1;
      gm.run.rooms[0].dealer.visited = true;
      gm.run.rooms[0].interacted = true;
      return { success: true };
    };
    const service = new ExploreSessionSyncService(gm);
    const entry = {
      seq: 1,
      actionId: 'run_es_00001001',
      kind: 'dealer.leave',
      roomIndex: 0,
      roomId: gm.run.rooms[0].id,
      actionSeq: 2,
      payload: {},
    };

    const first = await service.applySessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
    const replay = await service.applySessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });

    assert.equal(first.status, 'ok');
    assert.equal(replay.results[0].replayed, true);
    assert.equal(calls, 1);
    assert.equal(gm.run.rooms[0].interacted, true);
  });

  it('campfire.skip replays without double mutation', async () => {
    await expectSupportReplayOnce({
      roomType: ROOM_TYPES.campfire,
      kind: 'campfire.skip',
      installPerformer: (gm, count) => {
        gm.explorationService.applyCampfireSkip = () => {
          count();
          gm.run.rooms[0].campfire.completed = true;
          gm.run.rooms[0].interacted = true;
          return { skipped: true };
        };
      },
      assertApplied: gm => assert.equal(gm.run.rooms[0].campfire.completed, true),
    });
  });

  it('whackAMole.skip replays without double mutation', async () => {
    await expectSupportReplayOnce({
      roomType: ROOM_TYPES.whackAMole,
      kind: 'whackAMole.skip',
      installPerformer: (gm, count) => {
        gm.explorationService.applyWhackAMoleSkip = () => {
          count();
          gm.run.rooms[0].whackAMole.completed = true;
          gm.run.rooms[0].interacted = true;
          return { skipped: true };
        };
      },
      assertApplied: gm => assert.equal(gm.run.rooms[0].interacted, true),
    });
  });

  it('replays a whackAMole.skip → proceed pair for the same room in order', async () => {
    // A skip-type completion marks the room interacted; the paired proceed must
    // then advance in the same batch (skip ordering: complete-then-proceed).
    const gm = makeGm([ROOM_TYPES.whackAMole, ROOM_TYPES.friendlyNpc]);
    gm.run.roomActionSeq = 0;
    gm.run.rooms[0].whackAMole = { score: 0, completed: false };
    const room = gm.run.rooms[0];
    let skipCalls = 0;
    gm.explorationService.applyWhackAMoleSkip = () => {
      skipCalls += 1;
      room.whackAMole.completed = true;
      room.interacted = true;
      return { skipped: true };
    };
    const service = new ExploreSessionSyncService(gm);

    const result = await service.applySessionSync({
      sessionEpoch: LIVE_EPOCH,
      entries: [
        makeEntry(gm, {
          seq: 1,
          actionId: 'run_es_00006001',
          kind: 'whackAMole.skip',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
        }),
        makeEntry(gm, {
          seq: 2,
          actionId: 'run_es_00006002',
          kind: 'proceed',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
        }),
      ],
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(skipCalls, 1);
    assert.equal(room.interacted, true);
    assert.equal(gm.run.currentRoom, 1);
    assert.equal(gm.run.roomActionSeq, 1);
  });

  it('resolves whackAMole complete and skip before a separate proceed advances', async () => {
    for (const testCase of [
      {
        kind: 'whackAMole.complete',
        payload: { score: 4 },
        actionId: 'run_es_wamcomplete1',
        proceedActionId: 'run_es_wamc_go',
      },
      {
        kind: 'whackAMole.skip',
        payload: {},
        actionId: 'run_es_wamskip0001',
        proceedActionId: 'run_es_wams_go',
      },
    ]) {
      const gm = makeGm([ROOM_TYPES.whackAMole, ROOM_TYPES.friendlyNpc]);
      gm.run.roomActionSeq = 5;
      gm.run.rooms[0].whackAMole = { score: 0, completed: false };
      const room = gm.run.rooms[0];
      const service = new ExploreSessionSyncService(gm);
      const completion = makeEntry(gm, {
        seq: 1,
        actionId: testCase.actionId,
        kind: testCase.kind,
        roomIndex: 0,
        roomId: room.id,
        actionSeq: 5,
        payload: testCase.payload,
      });

      const resolved = await service.applySessionSync({
        sessionEpoch: LIVE_EPOCH,
        entries: [completion],
      });

      assert.equal(resolved.status, 'ok');
      assert.equal(resolved.confirmedThroughSeq, 1);
      assert.equal(room.interacted, true);
      assert.equal(gm.run.currentRoom, 0);
      assert.equal(gm.run.roomActionSeq, 5);

      const proceeded = await service.applySessionSync({
        sessionEpoch: LIVE_EPOCH,
        entries: [makeEntry(gm, {
          seq: 2,
          actionId: testCase.proceedActionId,
          kind: 'proceed',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 5,
          payload: {},
        })],
      });

      assert.equal(proceeded.status, 'ok');
      assert.equal(proceeded.confirmedThroughSeq, 2);
      assert.equal(gm.run.currentRoom, 1);
      assert.equal(gm.run.roomActionSeq, 6);
    }
  });

  it('speedReview.complete replays without double mutation', async () => {
    await expectSupportReplayOnce({
      roomType: ROOM_TYPES.speedReviewRoom,
      kind: 'speedReview.complete',
      payload: { roomId: 'hajimari-no-hiroba_room1' },
      installPerformer: (gm, count) => {
        gm.explorationService.applySpeedReviewComplete = () => {
          count();
          gm.run.rooms[0].speedReviewRoom.completed = true;
          gm.run.rooms[0].interacted = true;
          return { completed: true };
        };
      },
      assertApplied: gm => assert.equal(gm.run.rooms[0].speedReviewRoom.completed, true),
    });
  });

  it('wordDiscovery.complete replays without double mutation', async () => {
    await expectSupportReplayOnce({
      roomType: ROOM_TYPES.wordDiscovery,
      kind: 'wordDiscovery.complete',
      installPerformer: (gm, count) => {
        gm.explorationService.applyWordDiscoveryComplete = () => {
          count();
          gm.run.rooms[0].wordDiscovery.completed = true;
          gm.run.rooms[0].interacted = true;
          return { completed: true };
        };
      },
      assertApplied: gm => assert.equal(gm.run.rooms[0].wordDiscovery.completed, true),
    });
  });

  it('wordDiscovery.review replays without double grading', async () => {
    const gm = makeGm();
    gm.run.rooms[0] = createRoom(ROOM_TYPES.wordDiscovery, AREA_ID, 1, 3);
    gm.run.roomActionSeq = 2;
    let reviewCount = 0;
    gm.explorationService.applyWordDiscoveryReview = ({ word, grade }) => {
      reviewCount += 1;
      return { ok: true, word, grade };
    };
    const service = new ExploreSessionSyncService(gm);
    const entry = {
      seq: 1,
      actionId: 'run_es_00002001',
      kind: 'wordDiscovery.review',
      roomIndex: 0,
      roomId: gm.run.rooms[0].id,
      actionSeq: 2,
      payload: { word: '明るい', grade: 'good' },
    };

    const first = await service.applySessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });
    const replay = await service.applySessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });

    assert.equal(first.status, 'ok');
    assert.equal(reviewCount, 1);
    assert.equal(replay.results[0].replayed, true);
  });

  it('wordDiscovery.review fallback records pending review intent once', async () => {
    const gm = makeGm();
    gm.run.rooms[0] = createRoom(ROOM_TYPES.wordDiscovery, AREA_ID, 1, 3);
    gm.run.roomActionSeq = 2;
    const service = new ExploreSessionSyncService(gm);
    const entry = {
      seq: 1,
      actionId: 'run_es_00002002',
      kind: 'wordDiscovery.review',
      roomIndex: 0,
      roomId: gm.run.rooms[0].id,
      actionSeq: 2,
      payload: { word: '明るい', grade: 'good' },
    };

    const first = await service.applySessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });
    const replay = await service.applySessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });

    assert.equal(first.status, 'ok');
    assert.deepEqual(gm.run.pendingWordDiscoveryReviews, [{ word: '明るい', grade: 'good' }]);
    assert.equal(replay.results[0].replayed, true);
    assert.deepEqual(gm.run.pendingWordDiscoveryReviews, [{ word: '明るい', grade: 'good' }]);
  });

  it('wordDiscovery.review fallback rejects invalid review payloads', async () => {
    const gm = makeGm();
    gm.run.rooms[0] = createRoom(ROOM_TYPES.wordDiscovery, AREA_ID, 1, 3);
    gm.run.roomActionSeq = 2;
    const service = new ExploreSessionSyncService(gm);
    const entry = {
      seq: 1,
      actionId: 'run_es_00002003',
      kind: 'wordDiscovery.review',
      roomIndex: 0,
      roomId: gm.run.rooms[0].id,
      actionSeq: 2,
      payload: { word: '明るい', grade: 'later' },
    };

    const result = await service.applySessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'invalid_word_discovery_review');
    assert.equal(gm.run.pendingWordDiscoveryReviews, undefined);
  });

  it('replays every Task 8 support-room action kind', async () => {
    const cases = [
      {
        roomType: ROOM_TYPES.shrine,
        kind: 'shrine.choose',
        payload: { rewardType: 'heal_all' },
        method: 'applyShrineChoose',
      },
      {
        roomType: ROOM_TYPES.skillMaster,
        kind: 'skillMaster.choose',
        payload: { skillId: 'counterMaster' },
        method: 'applySkillMasterChoose',
      },
      {
        roomType: ROOM_TYPES.npcBattle,
        kind: 'npcBattleSkill.choose',
        payload: { skillId: 'counterMaster' },
        method: 'applyNpcBattleSkillChoose',
        prepare: gm => {
          gm.run.rooms[0].interacted = true;
          gm.run.rooms[0].npcBattle = {
            skillSelectionPending: true,
            rewardResolved: false,
            offered: [{ id: 'counterMaster', level: 1 }],
          };
        },
      },
      {
        roomType: ROOM_TYPES.dealer,
        kind: 'dealer.sell',
        payload: { creatureId: 'hi-1' },
        method: 'applyDealerSell',
      },
      {
        roomType: ROOM_TYPES.dealer,
        kind: 'dealer.buy',
        payload: { creatureId: 'dealer-hi' },
        method: 'applyDealerBuy',
      },
      {
        roomType: ROOM_TYPES.campfire,
        kind: 'campfire.cook',
        payload: { ingredients: [{ id: 'mizu', quantity: 1 }] },
        method: 'applyCampfireCook',
      },
      {
        roomType: ROOM_TYPES.campfire,
        kind: 'campfire.feed',
        payload: { targetCreatureIndex: 0 },
        method: 'applyCampfireFeed',
      },
      {
        roomType: ROOM_TYPES.speedReviewRoom,
        kind: 'speedReview.commit',
        payload: { roomId: 'hajimari-no-hiroba_room1', word: '明るい', commitIndex: 0 },
        method: 'applySpeedReviewCommit',
      },
    ];

    for (const testCase of cases) {
      const gm = makeGm();
      gm.run.rooms[0] = createRoom(testCase.roomType, AREA_ID, 1, 3);
      gm.run.roomActionSeq = 2;
      testCase.prepare?.(gm);
      let calls = 0;
      gm.explorationService[testCase.method] = payload => {
        calls += 1;
        gm.run.rooms[0].interacted = true;
        return { ok: true, payload };
      };
      const service = new ExploreSessionSyncService(gm);
      const entry = {
        seq: 1,
        actionId: `run_es_${String(cases.indexOf(testCase) + 3000).padStart(8, '0')}`,
        kind: testCase.kind,
        roomIndex: 0,
        roomId: gm.run.rooms[0].id,
        actionSeq: 2,
        payload: testCase.payload,
      };

      const first = await service.applySessionSync({
        sessionEpoch: gm.run.exploreSessionEpoch,
        entries: [entry],
      });
      const replay = await service.applySessionSync({
        sessionEpoch: gm.run.exploreSessionEpoch,
        entries: [entry],
      });

      assert.equal(first.status, 'ok', testCase.kind);
      assert.equal(replay.results[0].replayed, true, testCase.kind);
      assert.equal(calls, 1, testCase.kind);
    }
  });

  // ---- The 12d drain→rotate→adopt race, sequenced at the service level ----
  //
  // Epoch contract: explore session epochs mark RELOAD boundaries only.
  // GET /state rotates the epoch ONLY on a bare fetch; an in-session fetch
  // (adoptSession=1 — combat-victory reload, recovery refresh) PRESERVES it.
  // These two tests drive the REAL /state route handler against the same
  // gameManager the sync service replays into, reproducing the exact sequence
  // from the task-12d report: entries recorded under the live epoch, a mid-run
  // state fetch, then the drain.

  function getStateRouteHandler() {
    const router = createGameStateRoutes();
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === '/state') {
        const routeLayer = layer.route.stack.find(s => s.method === 'get');
        if (routeLayer) return routeLayer.handle;
      }
    }
    throw new Error('GET /state handler not found');
  }

  function makeQueuedEntries(gm) {
    const room = gm.run.rooms[0];
    return [
      makeEntry(gm, {
        seq: 1,
        actionId: 'run_es_race00001',
        kind: 'friendlyNpc.choose',
        roomIndex: 0,
        roomId: room.id,
        actionSeq: 0,
        payload: { itemId: TEST_EQUIPMENT.id, targetCreatureIndex: 0 },
      }),
      makeEntry(gm, {
        seq: 2,
        actionId: 'run_es_race00002',
        kind: 'proceed',
        roomIndex: 0,
        roomId: room.id,
        actionSeq: 0,
      }),
    ];
  }

  async function fetchStateViaRoute(gm, query) {
    const handler = getStateRouteHandler();
    const req = {
      query,
      user: { id: 'race-user' },
      gameManager: gm,
      saveGame: () => {},
      getEnrichedGameState: () => gm.getState(),
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    return res;
  }

  it('12d race sequence: queued entries survive an in-session (adoptSession) /state fetch and commit under the preserved epoch', async () => {
    const gm = makeGm();
    // 1. Entries recorded client-side under the live epoch (offline queue).
    const entries = makeQueuedEntries(gm);

    // 2. A mid-run IN-SESSION state fetch fires before the drain lands (the
    //    combat-victory modal reload / recovery refresh) — adoptSession=1.
    await fetchStateViaRoute(gm, { adoptSession: '1' });
    assert.equal(
      gm.run.exploreSessionEpoch,
      LIVE_EPOCH,
      'an in-session /state fetch must PRESERVE the explore session epoch',
    );

    // 3. The drain: the queued entries sync under the SAME epoch and commit.
    const service = new ExploreSessionSyncService(gm);
    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries });

    assert.equal(result.status, 'ok', 'the drain must commit — not a corrected sync');
    assert.equal(result.confirmedThroughSeq, 2);
    assert.equal(gm.run.currentRoom, 1, 'the queued proceed advanced the room');
    assert.equal(gm.run.runSummary.itemsCollected, 1, 'the queued choose applied');
  });

  it('12d race counterfactual: a bare /state fetch (reload boundary) rotates the epoch and the stale drain is corrected', async () => {
    const gm = makeGm();
    const entries = makeQueuedEntries(gm);

    // A BARE fetch is a boot/reload — it rotates BY DESIGN (the reload loses
    // the unsynced log). This pins the reload-boundary side of the contract and
    // documents the exact pre-fix race signature from the 12d report.
    await fetchStateViaRoute(gm, {});
    assert.notEqual(
      gm.run.exploreSessionEpoch,
      LIVE_EPOCH,
      'a bare (reload) /state fetch must rotate the explore session epoch',
    );

    const service = new ExploreSessionSyncService(gm);
    const result = await service.applySessionSync({ sessionEpoch: LIVE_EPOCH, entries });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'session_epoch_mismatch');
    assert.equal(result.rejectedSeq, 1);
    assert.equal(gm.run.currentRoom, 0, 'nothing committed from the stale-epoch batch');
  });
});
