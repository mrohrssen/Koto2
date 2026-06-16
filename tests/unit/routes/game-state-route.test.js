import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createGameStateRoutes from '../../../src/routes/game/state.js';
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

function makeStateReq({ app = {}, buildExploreRunway, saveGame } = {}) {
  const previousRunway = {
    sessionEpoch: 'ese_aaaaaaaaaaaaaaaa',
    roomActionSeq: 4,
    currentRoom: 2,
    preparedAhead: 5,
    preparedRooms: [{ index: 2 }],
  };
  const run = {
    active: true,
    mode: null,
    exploreSessionEpoch: 'ese_aaaaaaaaaaaaaaaa',
    exploreRunway: previousRunway,
  };

  return {
    app,
    user: { id: 'route-user' },
    gameManager: {
      run,
      explorationService: {
        buildExploreRunway: buildExploreRunway || (async () => ({
          sessionEpoch: run.exploreSessionEpoch,
          roomActionSeq: 4,
          currentRoom: 2,
          preparedAhead: 5,
          preparedRooms: [],
        })),
      },
    },
    saveGame: saveGame || (() => {}),
    getEnrichedGameState: () => ({ run }),
    previousRunway,
  };
}

describe('game state route', () => {
  afterEach(() => {
    clearSrsCache('route-user');
    resetDataDirForTest();
  });

  it('forwards configured dialogue card audio dependency into explore runway builds', async () => {
    const tmp = await createTestTmpDir('koto-state-route-');
    setDataDirForTest(tmp.path);
    configureSrs({ dataDir: tmp.path });
    createCard('route-user', 'vocab', '光', { word: '光' });
    gradeCard('route-user', 'vocab', '光', 'good');

    const getDialogueCardAudio = async () => ({ key: 'audio.wav' });
    let buildOpts = null;
    const handler = getHandler(createGameStateRoutes({ getDialogueCardAudio }), 'get', '/state');
    try {
      const req = makeStateReq({
        buildExploreRunway: async (opts) => {
          buildOpts = opts;
          return {
            sessionEpoch: req.gameManager.run.exploreSessionEpoch,
            roomActionSeq: 4,
            currentRoom: 2,
            preparedAhead: 5,
            preparedRooms: [],
          };
        },
      });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(buildOpts.getDialogueCardAudio, getDialogueCardAudio);
      assert.deepEqual(buildOpts.getKnownWords(), ['光']);
    } finally {
      configureSrs({ dataDir: 'data/' });
      await tmp.cleanup();
    }
  });

  it('returns a clean error and restores explore session state when runway build fails', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    const req = makeStateReq({
      buildExploreRunway: async () => {
        throw new Error('runway build failed');
      },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'runway build failed');
    assert.equal(req.gameManager.run.exploreSessionEpoch, 'ese_aaaaaaaaaaaaaaaa');
    assert.equal(req.gameManager.run.exploreRunway, req.previousRunway);
  });

  it('returns a clean error and restores explore session state when saving fails', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    const builtRunway = {
      sessionEpoch: 'ese_bbbbbbbbbbbbbbbb',
      roomActionSeq: 4,
      currentRoom: 2,
      preparedAhead: 5,
      preparedRooms: [],
    };
    const req = makeStateReq({
      buildExploreRunway: async () => builtRunway,
      saveGame: () => {
        throw new Error('save failed');
      },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'save failed');
    assert.equal(req.gameManager.run.exploreSessionEpoch, 'ese_aaaaaaaaaaaaaaaa');
    assert.equal(req.gameManager.run.exploreRunway, req.previousRunway);
  });

  it('returns a clean error and restores explore session state when async saving rejects', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    const req = makeStateReq({
      saveGame: async () => {
        throw new Error('async save failed');
      },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'async save failed');
    assert.equal(req.gameManager.run.exploreSessionEpoch, 'ese_aaaaaaaaaaaaaaaa');
    assert.equal(req.gameManager.run.exploreRunway, req.previousRunway);
  });
});
