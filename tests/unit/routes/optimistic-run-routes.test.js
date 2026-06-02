import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createRunRoutes from '../../../src/routes/game/run.js';
import createEconomyRoutes from '../../../src/routes/game/economy.js';

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

function createRunRouter() {
  return createRunRoutes({
    cancelPendingPrefetches: () => {},
    clearPrefetchCache: () => {},
    queueMissingCreatureDialoguesFn: () => {},
    getUserVocabulary: () => ({ words: [] }),
    queueMissingNpcDialoguesFn: () => {},
    checkSentenceViolations: () => ({ violations: [] }),
    getDialogueCardAudio: async () => null,
  });
}

describe('optimistic deterministic run routes', () => {
  it('wraps skill-master choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const res = makeRes();

    await handler({
      body: { actionId: 'run_action_1', skillId: 'momentum' },
      gameManager: {
        explorationService: {
          chooseSkillMasterOffer: skillId => ({ chosen: skillId }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [{ id: 'momentum' }] } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'run_action_1');
    assert.equal(res.body.chosen, 'momentum');
    assert.deepEqual(res.body.state, { phase: 'room', run: { partySkills: [{ id: 'momentum' }] } });
  });

  it('keeps legacy skill-master responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const res = makeRes();

    await handler({
      body: { skillId: 'momentum' },
      gameManager: {
        explorationService: {
          chooseSkillMasterOffer: skillId => ({ chosen: skillId }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('wraps proceed with accepted optimistic status when the next room already exists', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const res = makeRes();

    await handler({
      body: { actionId: 'run_proceed_1' },
      gameManager: {
        run: { currentRoom: 0, rooms: [{ type: 'room' }, { type: 'shrine' }] },
        proceedToNextRoom: () => ({ room: { type: 'shrine' }, ingredientDrops: [] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'shrine', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'run_proceed_1');
    assert.deepEqual(res.body.state, { phase: 'shrine', run: { currentRoom: 1 } });
  });

  it('tags optimistic proceed responses even when server generated the next room', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const res = makeRes();

    await handler({
      body: { actionId: 'run_proceed_generated' },
      gameManager: {
        run: { currentRoom: 0, rooms: [{ type: 'room' }] },
        proceedToNextRoom: () => ({ room: { type: 'encounter' }, ingredientDrops: [{ id: 'hi' }] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room_encounter', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'run_proceed_generated');
    assert.deepEqual(res.body.ingredientDrops, [{ id: 'hi' }]);
    assert.deepEqual(res.body.state, { phase: 'room_encounter', run: { currentRoom: 1 } });
  });

  it('keeps proceed legacy shape unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const res = makeRes();

    await handler({
      body: {},
      gameManager: {
        run: { currentRoom: 0, rooms: [{ type: 'room' }, { type: 'encounter' }] },
        proceedToNextRoom: () => ({ room: { type: 'encounter' }, ingredientDrops: [{ id: 'mizu' }] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room_encounter', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.deepEqual(res.body.ingredientDrops, [{ id: 'mizu' }]);
    assert.deepEqual(res.body.state, { phase: 'room_encounter', run: { currentRoom: 1 } });
  });

  it('returns corrected state for optimistic run route errors', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/shrine-choose');
    const res = makeRes();

    await handler({
      body: { actionId: 'run_action_bad', rewardType: 'level_up' },
      gameManager: {
        useShrineReward: () => {
          throw new Error('Shrine already completed');
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'shrine', run: { currentRoom: 2 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, 'run_action_bad');
    assert.equal(res.body.reason, 'Shrine already completed');
    assert.deepEqual(res.body.authoritativeState, { phase: 'shrine', run: { currentRoom: 2 } });
  });

  it('returns corrected state for optimistic run route validation failures', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const res = makeRes();

    await handler({
      body: { actionId: 'run_action_missing_skill' },
      gameManager: {
        explorationService: {
          chooseSkillMasterOffer: () => {
            throw new Error('should not be called');
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'skillMaster', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, 'run_action_missing_skill');
    assert.equal(res.body.reason, 'skillId required');
    assert.deepEqual(res.body.authoritativeState, { phase: 'skillMaster', run: { currentRoom: 1 } });
  });

  it('wraps shrine choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/shrine-choose');
    const res = makeRes();

    await handler({
      body: { actionId: 'shrine_action_1', rewardType: 'heal_all' },
      gameManager: {
        useShrineReward: rewardType => ({ rewardType, type: 'shrine_reward' }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'shrine_action_1');
    assert.equal(res.body.rewardType, 'heal_all');
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('wraps friendly NPC choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/friendly-npc-choose');
    const item = { id: 'sword', category: 'equipment', type: 'boost', effect: { field: 'baseAttackBonus', value: 1 } };
    const room = {
      type: 'friendlyNpc',
      friendlyNpc: { offered: [item], completed: false },
      interacted: false,
    };
    const res = makeRes();

    await handler({
      body: { actionId: 'friendly_action_1', itemId: 'sword', targetCreatureIndex: 0 },
      gameManager: {
        run: {
          creatureParty: {
            active: [{ id: 'hi', hp: 10, maxHp: 10, mp: 5, maxMp: 5, level: 1 }],
            reserves: [],
          },
          itemBuffs: {},
          runSummary: { itemsCollected: 0 },
        },
        meta: {},
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'friendly_action_1');
    assert.deepEqual(res.body.chosen, item);
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('wraps dealer buy choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createEconomyRoutes(), 'post', '/dealer-buy');
    const res = makeRes();

    await handler({
      body: { actionId: 'dealer_action_1', creatureId: 'hi' },
      gameManager: {
        dealerBuy: creatureId => ({ bought: creatureId }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'dealer', run: { player: { credits: 7 } } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'dealer_action_1');
    assert.equal(res.body.bought, 'hi');
    assert.deepEqual(res.body.state, { phase: 'dealer', run: { player: { credits: 7 } } });
  });

  it('wraps dealer sell choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createEconomyRoutes(), 'post', '/dealer-sell');
    const res = makeRes();

    await handler({
      body: { actionId: 'dealer_sell_1', creatureId: 'mizu' },
      gameManager: {
        dealerSell: creatureId => ({ sold: creatureId }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'dealer', run: { player: { credits: 12 } } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'dealer_sell_1');
    assert.equal(res.body.sold, 'mizu');
    assert.deepEqual(res.body.state, { phase: 'dealer', run: { player: { credits: 12 } } });
  });

  it('returns corrected state for optimistic dealer route errors', async () => {
    const handler = getHandler(createEconomyRoutes(), 'post', '/dealer-buy');
    const res = makeRes();

    await handler({
      body: { actionId: 'dealer_bad_1', creatureId: 'hinoneko' },
      gameManager: {
        dealerBuy: () => {
          throw new Error('Not enough credits');
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'dealer', run: { player: { credits: 1 } } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, 'dealer_bad_1');
    assert.equal(res.body.reason, 'Not enough credits');
    assert.deepEqual(res.body.authoritativeState, { phase: 'dealer', run: { player: { credits: 1 } } });
  });

  it('keeps legacy dealer responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createEconomyRoutes(), 'post', '/dealer-sell');
    const res = makeRes();

    await handler({
      body: { creatureId: 'mizu' },
      gameManager: {
        dealerSell: creatureId => ({ sold: creatureId }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'dealer' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.sold, 'mizu');
    assert.deepEqual(res.body.state, { phase: 'dealer' });
  });
});
