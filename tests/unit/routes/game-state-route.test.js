import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createGameStateRoutes from '../../../src/routes/game/state.js';

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

function makeStateReq({ buildExploreRunway, saveGame } = {}) {
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
    app: { locals: { getDialogueCardAudio: async () => null } },
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
});
