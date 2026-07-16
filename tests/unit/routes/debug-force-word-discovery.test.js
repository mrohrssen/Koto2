import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createMiscRoutes from '../../../src/routes/game/misc.js';
import { buildExploreRunway } from '../../../src/game/services/explore-runway-service.js';

function routeHandlers(router, path) {
  const layer = router.stack.find(candidate => candidate.route?.path === path);
  return layer?.route?.stack?.map(entry => entry.handle) || [];
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('debug forced Word Discovery', () => {
  it('keeps a prepared successor so completing the room cannot exhaust the runway', async () => {
    const router = createMiscRoutes({
      getDebugMode: () => true,
      setDebugMode: () => {},
    });
    const [guard, handler] = routeHandlers(router, '/debug-force-phase');
    const run = {
      active: true,
      mode: 'standard',
      currentArea: { id: 'okunomori', background: 'test.webp' },
      currentRoom: 3,
      roomActionSeq: 9,
      areaCleared: true,
      rooms: [],
      player: { credits: 0 },
    };
    const gameManager = {
      player: { name: 'DebugTester' },
      run,
      combat: null,
      meta: {},
    };
    const req = {
      body: { phase: 'wordDiscovery' },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({ run }),
    };
    const res = makeRes();
    let allowed = false;

    guard(req, res, () => { allowed = true; });
    assert.equal(allowed, true);
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(run.currentRoom, 0);
    assert.equal(run.areaCleared, false);
    assert.equal(run.roomActionSeq, 0);
    assert.equal(run.exploreRunway, null);
    assert.equal(run.rooms[0].type, 'wordDiscovery');
    assert.ok(run.rooms[1], 'debug Word Discovery must have a successor');

    const runway = await buildExploreRunway({
      run,
      meta: {},
      getCurrentRoom: () => run.rooms[run.currentRoom],
    }, {
      userId: 'debug-word-discovery-user',
      dailyWordLimit: 2,
      getKnownWords: () => [],
      getDialogueCardAudio: async () => null,
      getDiscoveryStatus: async () => ({ todayCount: 0, dailyLimit: 2, atLimit: false }),
      getDiscoveryWords: async () => ({ words: [{ word: '火' }], available: true }),
    });
    assert.deepEqual(runway.preparedRooms.map(entry => entry.index), [0, 1]);
    assert.equal(runway.preparedRooms[1].offlineReady, true);
  });
});
