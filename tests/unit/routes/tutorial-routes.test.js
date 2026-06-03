import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import createTutorialRoutes from '../../../src/routes/game/tutorial.js';

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

describe('tutorial routes', () => {
  it('marks post-fusion narration as seen once Hinoneko is owned', async () => {
    const handler = getHandler(createTutorialRoutes(), 'post', '/tutorial-post-fusion-seen');
    const res = makeRes();
    const meta = {
      tutorialFusionComplete: true,
      tutorialPostFusionNarrationShown: false,
      creatureCollection: ['hinoneko'],
    };
    let saveCalls = 0;

    await handler({
      gameManager: {
        getMeta: () => meta,
      },
      saveGame: () => {
        saveCalls += 1;
      },
      getEnrichedGameState: () => ({ meta: { ...meta } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.marked, true);
    assert.equal(res.body.state.meta.tutorialPostFusionNarrationShown, true);
    assert.equal(meta.tutorialPostFusionNarrationShown, true);
    assert.equal(saveCalls, 1);
  });
});
