import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createExploreSessionRoutes from '../../../src/routes/game/explore-session.js';
import { resetDataDirForTest, setDataDirForTest } from '../../../src/data-dir.js';
import { clearSrsCache, configureSrs, createCard, gradeCard } from '../../../src/game/internal-srs.js';
import { createTestTmpDir } from '../../helpers/tmp.js';

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

function makeSyncReq({ buildExploreRunway, saveGame } = {}) {
  const run = {
    active: true,
    mode: 'standard',
    exploreSessionEpoch: 'ese_aaaaaaaaaaaaaaaa',
    exploreRunway: null,
    currentRoom: 0,
    roomActionSeq: 0,
    rooms: [],
  };
  const gameManager = {
    player: null,
    run,
    combat: null,
    meta: { actionLedger: { entries: {}, order: [] } },
    explorationService: {
      buildExploreRunway: buildExploreRunway || (async () => ({
        sessionEpoch: run.exploreSessionEpoch,
        roomActionSeq: 0,
        currentRoom: 0,
        preparedAhead: 5,
        preparedRooms: [],
      })),
    },
    getState() {
      return {
        run: {
          exploreRunway: run.exploreRunway,
          currentRoom: run.currentRoom,
          roomActionSeq: run.roomActionSeq,
        },
      };
    },
  };

  return {
    user: { id: 'route-user' },
    body: {
      sessionEpoch: 'ese_bbbbbbbbbbbbbbbb',
      entries: [{ seq: 5 }],
    },
    gameManager,
    saveGame: saveGame || (async () => {}),
    getEnrichedGameState: () => gameManager.getState(),
  };
}

describe('explore session route', () => {
  afterEach(() => {
    clearSrsCache('route-user');
    resetDataDirForTest();
  });

  it('does not decorate stale epoch corrections', async () => {
    const tmp = await createTestTmpDir('koto-explore-sync-route-');
    setDataDirForTest(tmp.path);
    configureSrs({ dataDir: tmp.path });
    createCard('route-user', 'vocab', '光', { word: '光' });
    gradeCard('route-user', 'vocab', '光', 'good');

    const getDialogueCardAudio = async () => ({ key: 'audio.wav' });
    let buildOpts = null;
    const handler = getHandler(createExploreSessionRoutes({ getDialogueCardAudio }), 'post', '/sync');
    try {
      const req = makeSyncReq({
        buildExploreRunway: async (opts) => {
          buildOpts = opts;
          const exploreRunway = {
            sessionEpoch: req.gameManager.run.exploreSessionEpoch,
            roomActionSeq: 0,
            currentRoom: 0,
            preparedAhead: 5,
            preparedRooms: [],
          };
          req.gameManager.run.exploreRunway = exploreRunway;
          return exploreRunway;
        },
      });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, 'corrected');
      assert.equal(res.body.reason, 'session_epoch_mismatch');
      assert.equal(buildOpts, null);
    } finally {
      configureSrs({ dataDir: 'data/' });
      await tmp.cleanup();
    }
  });

  it('does not roll back a committed Explore action when response save fails', async () => {
    const handler = getHandler(
      createExploreSessionRoutes(),
      'post',
      '/sync',
    );
    const active = [{ id: 'hi', hp: 10, maxHp: 10 }];
    const room = {
      id: 'route-friendly',
      type: 'friendlyNpc',
      interacted: false,
      friendlyNpc: { completed: false, offered: [] },
    };
    const run = {
      active: true,
      mode: 'standard',
      exploreSessionEpoch: 'ese_aaaaaaaaaaaaaaaa',
      exploreRunway: null,
      currentRoom: 0,
      roomActionSeq: 0,
      creatureParty: { active, reserves: [] },
      rooms: [room],
    };
    const gameManager = {
      run,
      combat: { active: false, allies: active },
      meta: { actionLedger: { entries: {}, order: [] } },
      explorationService: {
        applyFriendlyNpcChoose() {
          run.committedMarker = true;
          room.interacted = true;
          return { chosen: true };
        },
        async buildExploreRunway() {
          const runway = {
            sessionEpoch: run.exploreSessionEpoch,
            currentRoom: 0,
            roomActionSeq: 0,
            preparedRooms: [],
          };
          run.exploreRunway = runway;
          return runway;
        },
      },
      getState() {
        return {
          phase: 'room',
          run: {
            currentRoom: run.currentRoom,
            roomActionSeq: run.roomActionSeq,
            committedMarker: run.committedMarker === true,
            creatureParty: run.creatureParty,
            exploreRunway: run.exploreRunway,
          },
        };
      },
    };
    const req = {
      user: { id: 'route-user' },
      body: {
        sessionEpoch: run.exploreSessionEpoch,
        entries: [{
          seq: 1,
          actionId: 'run_es_route_commit',
          kind: 'friendlyNpc.choose',
          roomIndex: 0,
          roomId: room.id,
          actionSeq: 0,
          payload: { itemId: 'none', targetCreatureIndex: 0 },
        }],
      },
      gameManager,
      saveGame: async () => { throw new Error('disk unavailable'); },
      getEnrichedGameState: () => gameManager.getState(),
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.reason, 'disk unavailable');
    assert.equal(req.gameManager.run.committedMarker, true);
    assert.equal(res.body.state.run.committedMarker, true);
    assert.deepEqual(req.gameManager.meta.actionLedger.order, ['run_es_route_commit']);
    assert.deepEqual(res.body.exploreRunway, req.gameManager.run.exploreRunway);
    assert.strictEqual(
      req.gameManager.combat.allies,
      req.gameManager.run.creatureParty.active,
    );
  });
});
