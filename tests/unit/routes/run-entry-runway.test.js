import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createRunRoutes from '../../../src/routes/game/run.js';

// The run-entry chain (start-run → select-area → confirm-creatures →
// skill-master-choose) drops the player into room 0 WITHOUT ever building an
// explore runway — only GET /state and the legacy POST /proceed did. When room 0
// is a support room (friendlyNpc / shrine), the client enters holding an empty
// runway and the first recordRoomAction rejects `noPreparedRoom`, surfacing the
// offline soft pause on a perfect connection (the "first-room spotty" deadlock).
//
// These tests pin the response-shape fix: confirm-creatures and skill-master-choose
// must carry a rebuilt runway (non-null sessionEpoch + a prepared room covering the
// current room) so the client adopts a usable runway at run entry.

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeLayer = layer.route.stack.find(s => s.method === method);
      if (routeLayer) return routeLayer.handle;
    }
  }
  return null;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

const RUNWAY_EPOCH = 'ese_runentry11111';

// A runway whose room 0 is a support (friendlyNpc) room. buildExploreRunway
// returns this; the fix must call it and hang the result on run.exploreRunway
// before snapshotting the enriched state.
function builtSupportRunway(currentRoom = 0) {
  return {
    sessionEpoch: RUNWAY_EPOCH,
    roomActionSeq: 0,
    currentRoom,
    preparedAhead: 3,
    preparedRooms: [
      {
        index: currentRoom,
        roomId: `room-${currentRoom}`,
        actionSeq: 0,
        room: { id: `room-${currentRoom}`, type: 'friendlyNpc' },
        acceptedActions: ['friendlyNpc.choose', 'proceed'],
        actionEffects: { 'friendlyNpc.choose': ['partyStats'], proceed: ['areaProgress'] },
        dependencies: [],
        offlineReady: true,
      },
      {
        index: currentRoom + 1,
        roomId: `room-${currentRoom + 1}`,
        actionSeq: 1,
        room: { id: `room-${currentRoom + 1}`, type: 'encounter' },
        acceptedActions: ['encounter.start', 'combat.cycle'],
        actionEffects: { 'encounter.start': [], 'combat.cycle': ['partyStats'] },
        dependencies: [],
        offlineReady: true,
      },
    ],
  };
}

// Build a fake gameManager + req around an active explore run parked on a
// support room 0 with NO runway yet (the exact state the run-entry chain
// produces). buildExploreRunway is a spy that returns builtSupportRunway.
function makeRunReq({ currentRoom = 0, buildCalls } = {}) {
  const run = {
    active: true,
    mode: null,
    areaCleared: false,
    currentRoom,
    // Enters the room with an empty shell runway — the bug.
    exploreRunway: { sessionEpoch: null, preparedRooms: [] },
  };
  const meta = { creatureCollection: ['hi'], creatureCounts: { hi: 1 } };
  const gameManager = {
    run,
    getMeta: () => meta,
    confirmCreatures: () => {},
    explorationService: {
      applySkillMasterChoose: () => ({ chosen: { id: 'skill-1' } }),
      buildExploreRunway: async (opts) => {
        buildCalls?.push(opts);
        return builtSupportRunway(currentRoom);
      },
    },
  };
  return {
    body: {},
    user: { id: 'run-entry-user' },
    gameManager,
    saveGame: () => {},
    // Mirror the real enrichment: run (with its freshly-built exploreRunway)
    // rides along in the response state.
    getEnrichedGameState: () => ({ run }),
  };
}

function currentRoomPrepared(runway, index) {
  return (runway?.preparedRooms || []).find(r => r.index === index) || null;
}

describe('run-entry explore runway (first-room spotty deadlock)', () => {
  it('confirm-creatures rebuilds the runway so the response carries a usable session', async () => {
    const buildCalls = [];
    const handler = getHandler(createRunRoutes({ getDialogueCardAudio: async () => null }), 'post', '/confirm-creatures');
    const req = makeRunReq({ currentRoom: 0, buildCalls });
    req.body = { starterIds: ['hi'] };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.equal(buildCalls.length, 1, 'confirm-creatures must rebuild the explore runway once');
    const runway = res.body?.state?.run?.exploreRunway;
    assert.ok(runway, 'response state must carry an explore runway');
    assert.equal(runway.sessionEpoch, RUNWAY_EPOCH, 'runway must have a non-null session epoch');
    assert.ok(
      currentRoomPrepared(runway, 0),
      'runway.preparedRooms must include an entry for the current room (0)',
    );
  });

  it('skill-master-choose rebuilds the runway so the response carries a usable session', async () => {
    const buildCalls = [];
    const handler = getHandler(createRunRoutes({ getDialogueCardAudio: async () => null }), 'post', '/skill-master-choose');
    const req = makeRunReq({ currentRoom: 0, buildCalls });
    req.body = { skillId: 'skill-1' };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.equal(buildCalls.length, 1, 'skill-master-choose must rebuild the explore runway once');
    const runway = res.body?.state?.run?.exploreRunway;
    assert.ok(runway, 'response state must carry an explore runway');
    assert.equal(runway.sessionEpoch, RUNWAY_EPOCH, 'runway must have a non-null session epoch');
    assert.ok(
      currentRoomPrepared(runway, 0),
      'runway.preparedRooms must include an entry for the current room (0)',
    );
  });
});
