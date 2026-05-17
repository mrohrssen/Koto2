import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import createRunRoutes from '../../../src/routes/game/run.js';

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
    json(data) { this.body = data; return this; }
  };
}

describe('Shrine room routes', () => {
  let router;

  beforeEach(() => {
    router = createRunRoutes({
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: async () => [],
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] }),
      getDialogueCardAudio: async ({ userId, speakerKey }) => ({ userId, key: `${speakerKey}.wav` })
    });
  });

  it('POST /shrine-offers returns reward options and greeting field', async () => {
    const room = {
      type: 'shrine',
      interacted: false,
      shrine: {
        used: false,
        completed: false,
        chosenReward: null,
        greeting: { raw: 'こんにちは！', tokens: [{ surface: 'こんにちは', reading: 'こんにちは' }] }
      }
    };
    const handler = getHandler(router, 'post', '/shrine-offers');
    const req = {
      user: { id: 'shrine-route-user' },
      gameManager: { getCurrentRoom: () => room },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'shrine' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.rewards.map(reward => reward.id), ['heal_all', 'restore_mp_all', 'level_up']);
    assert.ok('greeting' in res.body);
    assert.deepEqual(res.body.greeting.audio, { userId: 'shrine-route-user', key: 'shrine_fox.wav' });
    assert.deepEqual(res.body.state, { phase: 'shrine' });
  });

  it('POST /shrine-offers rejects non-shrine rooms', async () => {
    const handler = getHandler(router, 'post', '/shrine-offers');
    const req = {
      user: { id: 'shrine-route-user' },
      gameManager: { getCurrentRoom: () => ({ type: 'friendlyNpc' }) },
      saveGame: () => {},
      getEnrichedGameState: () => ({})
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Not in a shrine room');
  });

  it('POST /shrine-choose applies selected reward and saves', async () => {
    const handler = getHandler(router, 'post', '/shrine-choose');
    let saved = false;
    const req = {
      body: { rewardType: 'level_up', creatureKey: 'reserve-mizu' },
      gameManager: {
        useShrineReward: (rewardType, creatureKey) => ({
          type: 'shrine_reward',
          rewardType,
          affectedCreatures: [],
          levelUp: { creatureKey }
        })
      },
      saveGame: () => { saved = true; },
      getEnrichedGameState: () => ({ phase: 'room' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.rewardType, 'level_up');
    assert.equal(res.body.levelUp.creatureKey, 'reserve-mizu');
    assert.deepEqual(res.body.state, { phase: 'room' });
    assert.equal(saved, true);
  });
});
