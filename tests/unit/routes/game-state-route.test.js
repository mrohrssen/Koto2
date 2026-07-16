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

function makeStateReq({ app = {}, buildExploreRunway, saveGame, query = {}, exploreSessionEpoch = 'ese_aaaaaaaaaaaaaaaa', dailyWordLimit = 7 } = {}) {
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
    exploreSessionEpoch,
    exploreRunway: previousRunway,
  };

  return {
    app,
    query,
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
    getSettings: () => ({ dailyWordLimit }),
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
      assert.equal(buildOpts.dailyWordLimit, 7);
      assert.equal(typeof buildOpts.getDiscoveryStatus, 'function');
      assert.equal(typeof buildOpts.getDiscoveryWords, 'function');
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

  // ---- Epoch contract: /state rotates on RELOAD boundaries only ----
  // A bare fetch (no adoptSession signal) is a boot/reload — it ROTATES the epoch
  // (reload loses the unsynced log BY DESIGN). An in-session fetch (adoptSession=1)
  // PRESERVES the epoch (create-if-absent, never rotate) so queued session entries
  // are not stranded — but still rebuilds a fresh runway.

  it('bare fetch (reload boundary) rotates the explore session epoch and rebuilds the runway', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    let buildCalled = false;
    const req = makeStateReq({
      query: {},
      buildExploreRunway: async () => {
        buildCalled = true;
        return { sessionEpoch: 'ignored', roomActionSeq: 4, currentRoom: 2, preparedAhead: 5, preparedRooms: [] };
      },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.notEqual(
      req.gameManager.run.exploreSessionEpoch,
      'ese_aaaaaaaaaaaaaaaa',
      'a bare (reload) /state fetch MUST rotate the epoch',
    );
    assert.match(req.gameManager.run.exploreSessionEpoch, /^ese_[0-9a-f]{16}$/);
    assert.equal(buildCalled, true, 'a bare /state fetch still rebuilds the runway');
  });

  it('adoptSession fetch (in-session) PRESERVES the epoch and still rebuilds the runway', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    let buildCalled = false;
    const req = makeStateReq({
      query: { adoptSession: '1' },
      buildExploreRunway: async () => {
        buildCalled = true;
        return { sessionEpoch: 'ignored', roomActionSeq: 4, currentRoom: 2, preparedAhead: 5, preparedRooms: [] };
      },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(
      req.gameManager.run.exploreSessionEpoch,
      'ese_aaaaaaaaaaaaaaaa',
      'an in-session (adoptSession=1) /state fetch MUST NOT rotate the epoch — it would strand queued entries',
    );
    assert.equal(buildCalled, true, 'an in-session /state fetch still rebuilds a fresh runway');
  });

  it('creates the epoch when absent — bare fetch', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    const req = makeStateReq({ query: {}, exploreSessionEpoch: undefined });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(req.gameManager.run.exploreSessionEpoch, /^ese_[0-9a-f]{16}$/, 'bare fetch creates a valid epoch when absent');
  });

  it('creates the epoch when absent — adoptSession fetch', async () => {
    const handler = getHandler(createGameStateRoutes(), 'get', '/state');
    const req = makeStateReq({ query: { adoptSession: '1' }, exploreSessionEpoch: undefined });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(req.gameManager.run.exploreSessionEpoch, /^ese_[0-9a-f]{16}$/, 'adoptSession fetch creates a valid epoch when absent');
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
