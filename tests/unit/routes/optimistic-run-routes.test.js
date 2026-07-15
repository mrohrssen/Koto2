import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import createCombatRoutes from '../../../src/routes/game/combat.js';
import createCookingRoutes from '../../../src/routes/game/cooking.js';
import createEconomyRoutes from '../../../src/routes/game/economy.js';
import createRunRoutes from '../../../src/routes/game/run.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { PARTY_SKILL_TREE_IDS } from '../../../src/game/party-skills.js';
import { loadDialoguePools } from '../../../src/game/dialogue-loader.js';

const actionId = suffix => `run_test_${suffix}`;

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

function createRunRouter(overrides = {}) {
  return createRunRoutes({
    cancelPendingPrefetches: () => {},
    clearPrefetchCache: () => {},
    queueMissingCreatureDialoguesFn: () => {},
    getUserVocabulary: () => ({ words: [] }),
    queueMissingNpcDialoguesFn: () => {},
    checkSentenceViolations: () => ({ violations: [] }),
    getDialogueCardAudio: async () => null,
    ...overrides,
  });
}

function attachExplorationService(gameManager, room) {
  if (!gameManager.run) gameManager.run = {};
  gameManager.run.currentRoom = 0;
  gameManager.run.rooms = [room];
  gameManager.emitState = gameManager.emitState || (() => {});
  gameManager.explorationService = new ExplorationService(gameManager);
  gameManager.getCurrentRoom = () => gameManager.explorationService.getCurrentRoom();
  return gameManager;
}

function createCombatRouter() {
  return createCombatRoutes({
    getUserVocabulary: () => ({ words: [] }),
    getCreatureDialogueFromCache: () => null,
    regenCreatureDialogueFn: () => {},
    getNpcDialogueFromCache: () => null,
    logNpcEncounterFn: () => {},
    regenNpcDialogueFn: () => {},
    setNpcMemoryFlagFn: () => {},
    updateNpcMemoryBondFn: () => {},
    checkSentenceViolations: () => ({ violations: [] }),
    getDialogueCardAudio: async () => null,
    isCreatureDialogueStaleFn: () => false,
  });
}

function createCookingRouter() {
  return createCookingRoutes();
}

function createEconomyRouter() {
  return createEconomyRoutes();
}

function makeCampfireReq({
  body = {},
  room = null,
  ingredients = {},
  party = null,
  state = { phase: 'campfire', run: { currentRoom: 0 } },
  meta = { actionLedger: { entries: {}, order: [] }, cookingRecipesDiscovered: [] },
} = {}) {
  const currentRoom = room || {
    type: 'campfire',
    campfire: { cookedDish: null, consumed: null, fed: false, completed: false },
  };
  const run = {
    cooking: { ingredients: { ...ingredients }, cookedThisRun: [] },
    creatureParty: party || {
      active: [{ id: 'hi', hp: 10, maxHp: 20, mp: 2, maxMp: 10, level: 3 }],
      reserves: [],
    },
  };
  let saveCount = 0;
  const gm = {
    run,
    meta,
    getCurrentRoom: () => currentRoom,
    initMeta() {
      this.meta ||= { actionLedger: { entries: {}, order: [] }, cookingRecipesDiscovered: [] };
    },
  };

  return {
    body,
    user: { id: 'test-user' },
    gameManager: gm,
    saveGame: () => { saveCount += 1; },
    getEnrichedGameState: () => state,
    get saveCount() { return saveCount; },
  };
}

describe('optimistic deterministic run routes', () => {
  it('/dealer-sell does not re-run duplicate optimistic actionId', async () => {
    const handler = getHandler(createEconomyRouter(), 'post', '/dealer-sell');
    const meta = { actionLedger: { entries: {}, order: [] } };
    let sellCalls = 0;
    let saveCalls = 0;
    const req = {
      body: { actionId: actionId('dealersell'), creatureId: 'mogu' },
      gameManager: {
        meta,
        dealerSell: creatureId => {
          sellCalls += 1;
          return { sold: true, soldCreature: { id: creatureId }, coinsGained: 8 };
        },
      },
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'dealer', sellCalls }),
    };

    const firstRes = makeRes();
    await handler(req, firstRes);
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(firstRes.statusCode, 200);
    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(sellCalls, 1);
    assert.equal(saveCalls, 1);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('dealersell'));
    assert.equal(duplicateRes.body.actionType, 'dealer.sell');
    assert.deepEqual(duplicateRes.body.soldCreature, { id: 'mogu' });
    assert.deepEqual(duplicateRes.body.state, { phase: 'dealer', sellCalls: 1 });
  });

  it('/dealer-buy does not re-run duplicate optimistic actionId', async () => {
    const handler = getHandler(createEconomyRouter(), 'post', '/dealer-buy');
    const meta = { actionLedger: { entries: {}, order: [] } };
    let buyCalls = 0;
    let saveCalls = 0;
    const req = {
      body: { actionId: actionId('dealerbuy'), creatureId: 'kumo' },
      gameManager: {
        meta,
        dealerBuy: creatureId => {
          buyCalls += 1;
          return { bought: true, creature: { id: creatureId }, coinsSpent: 12 };
        },
      },
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'dealer', buyCalls }),
    };

    const firstRes = makeRes();
    await handler(req, firstRes);
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(firstRes.statusCode, 200);
    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(buyCalls, 1);
    assert.equal(saveCalls, 1);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('dealerbuy'));
    assert.equal(duplicateRes.body.actionType, 'dealer.buy');
    assert.deepEqual(duplicateRes.body.creature, { id: 'kumo' });
    assert.deepEqual(duplicateRes.body.state, { phase: 'dealer', buyCalls: 1 });
  });

  it('/dealer-leave does not re-run duplicate optimistic actionId', async () => {
    const handler = getHandler(createEconomyRouter(), 'post', '/dealer-leave');
    const meta = { actionLedger: { entries: {}, order: [] } };
    let leaveCalls = 0;
    let saveCalls = 0;
    const req = {
      body: { actionId: actionId('dealerleave') },
      gameManager: {
        meta,
        leaveDealer: () => {
          leaveCalls += 1;
          return { success: true, leaveCalls };
        },
      },
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'room', leaveCalls }),
    };

    const firstRes = makeRes();
    await handler(req, firstRes);
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(firstRes.statusCode, 200);
    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(leaveCalls, 1);
    assert.equal(saveCalls, 1);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('dealerleave'));
    assert.equal(duplicateRes.body.actionType, 'dealer.leave');
    assert.equal(duplicateRes.body.success, true);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', leaveCalls: 1 });
  });

  it('wraps skill-master choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('skill1'), skillId: 'buffMaster' },
      gameManager: {
        explorationService: {
          applySkillMasterChoose: ({ skillId }) => ({ chosen: skillId }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [{ id: 'buffMaster', level: 1 }] } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('skill1'));
    assert.equal(res.body.chosen, 'buffMaster');
    assert.deepEqual(res.body.state, { phase: 'room', run: { partySkills: [{ id: 'buffMaster', level: 1 }] } });
  });

  it('keeps legacy skill-master responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const res = makeRes();

    await handler({
      body: { skillId: 'buffMaster' },
      gameManager: {
        explorationService: {
          applySkillMasterChoose: ({ skillId }) => ({ chosen: skillId }),
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
      body: { actionId: actionId('proceed1'), fromRoom: 0, actionSeq: 0 },
      gameManager: {
        run: { currentRoom: 0, roomActionSeq: 0, rooms: [{ type: 'room' }, { type: 'shrine' }] },
        proceedToNextRoom: () => ({ room: { type: 'shrine' }, ingredientDrops: [] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'shrine', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('proceed1'));
    assert.deepEqual(res.body.state, { phase: 'shrine', run: { currentRoom: 1 } });
  });

  it('/proceed does not re-run duplicate actionId and run.currentRoom remains 1', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const run = {
      currentRoom: 0,
      roomActionSeq: 0,
      rooms: [{ type: 'room' }, { type: 'shrine' }, { type: 'skillMaster' }],
    };
    const req = {
      body: { actionId: actionId('proceeddupe'), fromRoom: 0, actionSeq: 0 },
      gameManager: {
        run,
        meta: { actionLedger: { entries: {}, order: [] } },
        proceedToNextRoom: () => {
          run.currentRoom += 1;
          run.roomActionSeq += 1;
          return { room: run.rooms[run.currentRoom], ingredientDrops: [] };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: run.rooms[run.currentRoom].type, run: { currentRoom: run.currentRoom } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('proceeddupe'));
    assert.equal(run.currentRoom, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'shrine', run: { currentRoom: 1 } });
  });

  it('tags optimistic proceed responses even when server generated the next room', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('proceedgen'), fromRoom: 0, actionSeq: 4 },
      gameManager: {
        run: { currentRoom: 0, roomActionSeq: 4, rooms: [{ type: 'room' }] },
        proceedToNextRoom: () => ({ room: { type: 'encounter' }, ingredientDrops: [{ id: 'hi' }] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room_encounter', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('proceedgen'));
    assert.deepEqual(res.body.ingredientDrops, [{ id: 'hi' }]);
    assert.deepEqual(res.body.state, { phase: 'room_encounter', run: { currentRoom: 1 } });
  });

  it('/proceed corrects stale optimistic room index without advancing', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const res = makeRes();
    const run = { currentRoom: 1, roomActionSeq: 3, rooms: [{ type: 'room' }, { type: 'room' }] };
    let proceeded = false;

    await handler({
      body: { actionId: actionId('staleindex'), fromRoom: 0, actionSeq: 3 },
      gameManager: {
        run,
        proceedToNextRoom: () => {
          proceeded = true;
          run.currentRoom += 1;
          return { room: { type: 'encounter' }, ingredientDrops: [] };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: run.currentRoom, roomActionSeq: run.roomActionSeq } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('staleindex'));
    assert.equal(res.body.reason, 'Room index mismatch');
    assert.equal(proceeded, false);
    assert.equal(run.currentRoom, 1);
  });

  it('/proceed corrects stale optimistic action sequence without advancing', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const res = makeRes();
    const run = { currentRoom: 0, roomActionSeq: 6, rooms: [{ type: 'room' }, { type: 'room' }] };
    let proceeded = false;

    await handler({
      body: { actionId: actionId('staleseq'), fromRoom: 0, actionSeq: 5 },
      gameManager: {
        run,
        proceedToNextRoom: () => {
          proceeded = true;
          run.currentRoom += 1;
          return { room: { type: 'encounter' }, ingredientDrops: [] };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: run.currentRoom, roomActionSeq: run.roomActionSeq } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('staleseq'));
    assert.equal(res.body.reason, 'Room action sequence mismatch');
    assert.equal(proceeded, false);
    assert.equal(run.currentRoom, 0);
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
      body: { actionId: actionId('bad'), rewardType: 'level_up' },
      gameManager: {
        explorationService: {
          applyShrineChoose: () => {
            throw new Error('Shrine already completed');
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'shrine', run: { currentRoom: 2 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('bad'));
    assert.equal(res.body.reason, 'Shrine already completed');
    assert.deepEqual(res.body.authoritativeState, { phase: 'shrine', run: { currentRoom: 2 } });
  });

  it('returns corrected state for optimistic run route validation failures', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('missingskill') },
      gameManager: {
        explorationService: {
          applySkillMasterChoose: () => {
            throw new Error('should not be called');
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'skillMaster', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('missingskill'));
    assert.equal(res.body.reason, 'skillId required');
    assert.deepEqual(res.body.authoritativeState, { phase: 'skillMaster', run: { currentRoom: 1 } });
  });

  it('/skill-master-choose does not re-run duplicate actionId', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const run = { partySkills: [] };
    let choiceCount = 0;
    const req = {
      body: { actionId: actionId('skilldupe'), skillId: 'buffMaster' },
      gameManager: {
        run,
        meta: { actionLedger: { entries: {}, order: [] } },
        explorationService: {
          applySkillMasterChoose: ({ skillId }) => {
            choiceCount += 1;
            run.partySkills.push({ id: skillId, level: 1 });
            return { chosen: skillId };
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [...run.partySkills] } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(choiceCount, 1);
    assert.deepEqual(run.partySkills, [{ id: 'buffMaster', level: 1 }]);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { partySkills: [{ id: 'buffMaster', level: 1 }] } });
  });

  it('wraps shrine choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/shrine-choose');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('shrine1'), rewardType: 'heal_all' },
      gameManager: {
        explorationService: {
          applyShrineChoose: ({ rewardType }) => ({ rewardType, type: 'shrine_reward' }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('shrine1'));
    assert.equal(res.body.rewardType, 'heal_all');
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('/shrine-choose does not re-run duplicate actionId', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/shrine-choose');
    const run = { shrineUses: 0 };
    const req = {
      body: { actionId: actionId('shrinedupe'), rewardType: 'heal_all' },
      gameManager: {
        run,
        meta: { actionLedger: { entries: {}, order: [] } },
        explorationService: {
          applyShrineChoose: ({ rewardType }) => {
            run.shrineUses += 1;
            return { rewardType, type: 'shrine_reward' };
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { shrineUses: run.shrineUses } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(run.shrineUses, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { shrineUses: 1 } });
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

    const gameManager = attachExplorationService({
      run: {
        creatureParty: {
          active: [{ id: 'hi', hp: 10, maxHp: 10, mp: 5, maxMp: 5, level: 1 }],
          reserves: [],
        },
        itemBuffs: {},
        runSummary: { itemsCollected: 0 },
      },
      meta: {},
    }, room);

    await handler({
      body: { actionId: actionId('friendly1'), itemId: 'sword', targetCreatureIndex: 0 },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('friendly1'));
    assert.deepEqual(res.body.chosen, item);
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('returns 400 corrected response for optimistic friendly NPC validation failures', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/friendly-npc-choose');
    const item = { id: 'sword', category: 'equipment', type: 'boost', effect: { field: 'baseAttackBonus', value: 1 } };
    const room = {
      type: 'friendlyNpc',
      friendlyNpc: { offered: [item], completed: false },
      interacted: false,
    };
    const res = makeRes();

    await handler({
      body: { actionId: actionId('friendlyinvalid'), itemId: 'shield', targetCreatureIndex: 0 },
      gameManager: {
        run: {},
        meta: {},
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'friendlyNpc', run: { currentRoom: 3 } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('friendlyinvalid'));
    assert.equal(res.body.reason, 'Invalid item choice');
    assert.deepEqual(res.body.authoritativeState, { phase: 'friendlyNpc', run: { currentRoom: 3 } });
  });

  it('returns 409 corrected response for optimistic friendly NPC mutation-time failures', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/friendly-npc-choose');
    const item = { id: 'sword', category: 'equipment', type: 'boost', effect: { field: 'baseAttackBonus', value: 1 } };
    const room = {
      type: 'friendlyNpc',
      friendlyNpc: { offered: [item], completed: false },
      interacted: false,
    };
    const res = makeRes();

    await handler({
      body: { actionId: actionId('friendlyfail'), itemId: 'sword', targetCreatureIndex: 0 },
      gameManager: {
        run: {
          creatureParty: {},
          itemBuffs: {},
          runSummary: { itemsCollected: 0 },
        },
        meta: {},
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'friendlyNpc', run: { currentRoom: 3 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('friendlyfail'));
    assert.ok(res.body.reason);
    assert.deepEqual(res.body.authoritativeState, { phase: 'friendlyNpc', run: { currentRoom: 3 } });
  });

  it('/friendly-npc-choose does not re-run duplicate actionId and runSummary.itemsCollected remains 1', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/friendly-npc-choose');
    const item = { id: 'sword', category: 'equipment', type: 'boost', effect: { field: 'baseAttackBonus', value: 1 } };
    const room = {
      type: 'friendlyNpc',
      friendlyNpc: { offered: [item], completed: false },
      interacted: false,
    };
    const run = {
      creatureParty: {
        active: [{ id: 'hi', hp: 10, maxHp: 10, mp: 5, maxMp: 5, level: 1 }],
        reserves: [],
      },
      itemBuffs: {},
      runSummary: { itemsCollected: 0 },
    };
    const req = {
      body: { actionId: actionId('friendlydupe'), itemId: 'sword', targetCreatureIndex: 0 },
      gameManager: attachExplorationService({
        run,
        meta: { itemsDiscovered: [], actionLedger: { entries: {}, order: [] } },
      }, room),
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { runSummary: { ...run.runSummary } } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(run.runSummary.itemsCollected, 1);
    assert.deepEqual(req.gameManager.meta.itemsDiscovered, ['sword']);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { runSummary: { itemsCollected: 1 } } });
  });

  it('canonically resolves zero eligible NPC rewards across a lost response even when prompt audio fails', async () => {
    loadDialoguePools('data');
    let audioCalls = 0;
    const offersHandler = getHandler(
      createRunRouter({
        getDialogueCardAudio: async () => {
          audioCalls += 1;
          throw new Error('tts unavailable');
        },
      }),
      'post',
      '/npc-battle-skill-offers',
    );
    const room = {
      id: 'npc-maxed',
      type: 'npcBattle',
      interacted: true,
      npcBattle: {
        skillSelectionPending: true,
        rewardResolved: false,
        offered: [{ id: 'hpMaster', level: 1 }],
      },
    };
    const run = {
      active: true,
      mode: 'standard',
      currentRoom: 0,
      roomActionSeq: 4,
      partySkills: PARTY_SKILL_TREE_IDS.map(id => ({ id, level: 5 })),
    };
    const gm = attachExplorationService({ run }, room);
    const lifecycle = [];
    gm.explorationService.buildExploreRunway = async () => {
      lifecycle.push('rebuild');
      const runway = {
        sessionEpoch: 'ese_6666666666666666',
        currentRoom: 0,
        roomActionSeq: 4,
        preparedRooms: [],
      };
      run.exploreRunway = runway;
      return runway;
    };
    let saveCalls = 0;
    const req = {
      body: {},
      user: { id: 'test-user' },
      gameManager: gm,
      saveGame: async () => {
        saveCalls += 1;
        lifecycle.push('save');
      },
      getEnrichedGameState: () => {
        lifecycle.push('serialize');
        return {
          phase: room.npcBattle.skillSelectionPending
            ? 'npc_skill_selection'
            : 'room',
          room: structuredClone(room),
          run: {
            currentRoom: run.currentRoom,
            partySkills: structuredClone(run.partySkills),
            exploreRunway: structuredClone(run.exploreRunway),
          },
        };
      },
    };

    const first = makeRes();
    await offersHandler(req, first);
    const retry = makeRes();
    await offersHandler(req, retry);

    for (const response of [first, retry]) {
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body.offered, []);
      assert.equal(response.body.rewardResolved, true);
      assert.equal(response.body.state.room.npcBattle.rewardResolved, true);
      assert.equal(response.body.state.room.npcBattle.skillSelectionPending, false);
      assert.equal(response.body.state.run.exploreRunway.sessionEpoch, 'ese_6666666666666666');
    }
    assert.equal(room.npcBattle.skillSelectionPending, false);
    assert.equal(room.npcBattle.rewardResolved, true);
    assert.equal(audioCalls, 2, 'optional prompt audio was attempted on both idempotent requests');
    assert.equal(saveCalls, 2, 'each idempotent request persists through one awaited save');
    assert.deepEqual(lifecycle, [
      'rebuild', 'save', 'serialize',
      'rebuild', 'save', 'serialize',
    ]);
  });

  it('wraps NPC battle skill choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: [{ id: 'buffMaster', level: 1 }] },
      interacted: false,
    };
    const run = { partySkills: [] };
    const res = makeRes();

    await handler({
      body: { actionId: actionId('npcskill1'), skillId: 'buffMaster' },
      gameManager: attachExplorationService({ run }, room),
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [...run.partySkills] } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('npcskill1'));
    assert.equal(res.body.chosenId, 'buffMaster');
    assert.deepEqual(res.body.partySkills, [{ id: 'buffMaster', level: 1 }]);
    assert.deepEqual(res.body.state, { phase: 'room', run: { partySkills: [{ id: 'buffMaster', level: 1 }] } });
  });

  it('NPC battle legacy stored offers display and acquire next canonical tree levels', async () => {
    const router = createRunRouter();
    const offersHandler = getHandler(router, 'post', '/npc-battle-skill-offers');
    const chooseHandler = getHandler(router, 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: ['momentum'] },
      interacted: false,
    };
    const run = { partySkills: [{ id: 'buffMaster', level: 1 }] };
    const req = {
      body: {},
      user: { id: 'test-user' },
      gameManager: attachExplorationService({ run }, room),
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [...run.partySkills] } }),
    };

    const offersRes = makeRes();
    await offersHandler(req, offersRes);

    assert.equal(offersRes.statusCode, 200);
    assert.deepEqual(offersRes.body.offered.map(offer => offer.id), ['buffMaster']);
    assert.deepEqual(offersRes.body.offered.map(offer => offer.level), [2]);
    assert.deepEqual(offersRes.body.offered.map(offer => offer.title), ['Buff Master - Lvl. 2']);

    req.body = { skillId: 'buffMaster' };
    const chooseRes = makeRes();
    await chooseHandler(req, chooseRes);

    assert.equal(chooseRes.statusCode, 200);
    assert.equal(chooseRes.body.chosenId, 'buffMaster');
    assert.deepEqual(chooseRes.body.partySkills, [{ id: 'buffMaster', level: 2 }]);
    assert.deepEqual(run.partySkills, [{ id: 'buffMaster', level: 2 }]);
  });

  it('/npc-battle-skill-choose syncs HP Master bonuses and does not double-apply duplicate actionId', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: [{ id: 'hpMaster', level: 1 }] },
      interacted: false,
    };
    const run = {
      partySkills: [],
      creatureParty: {
        active: [{ id: 'hi', hp: 50, maxHp: 100 }],
        reserves: [],
      },
    };
    const req = {
      body: { actionId: actionId('npcskilldupe'), skillId: 'hpMaster' },
      gameManager: attachExplorationService({
        run,
        meta: { actionLedger: { entries: {}, order: [] } },
      }, room),
      saveGame: () => {},
      getEnrichedGameState: () => ({
        phase: 'room',
        run: {
          partySkills: [...run.partySkills],
          creatureParty: {
            active: run.creatureParty.active.map(creature => ({
              id: creature.id,
              hp: creature.hp,
              maxHp: creature.maxHp,
            })),
            reserves: [],
          },
        },
      }),
    };

    const firstRes = makeRes();
    await handler(req, firstRes);
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(firstRes.statusCode, 200);
    assert.deepEqual(firstRes.body.partySkills, [{ id: 'hpMaster', level: 1 }]);
    assert.equal(firstRes.body.state.run.creatureParty.active[0].hp, 63);
    assert.equal(firstRes.body.state.run.creatureParty.active[0].maxHp, 125);
    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('npcskilldupe'));
    assert.equal(run.partySkills.length, 1);
    assert.equal(run.creatureParty.active[0].hp, 63);
    assert.equal(run.creatureParty.active[0].maxHp, 125);
    assert.equal(room.npcBattle.chosenSkillId, 'hpMaster');
    assert.equal(room.npcBattle.skillSelectionPending, false);
    assert.equal(room.npcBattle.rewardResolved, true);
    assert.deepEqual(duplicateRes.body.state, {
      phase: 'room',
      run: {
        partySkills: [{ id: 'hpMaster', level: 1 }],
        creatureParty: {
          active: [{ id: 'hi', hp: 63, maxHp: 125 }],
          reserves: [],
        },
      },
    });
  });

  it('keeps legacy NPC battle skill choice responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: [{ id: 'buffMaster', level: 1 }] },
      interacted: false,
    };
    const run = { partySkills: [] };
    const res = makeRes();

    await handler({
      body: { skillId: 'buffMaster' },
      gameManager: attachExplorationService({ run }, room),
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.chosenId, 'buffMaster');
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('returns corrected 400 with authoritative state for invalid optimistic NPC battle skill choices', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: [{ id: 'buffMaster', level: 1 }] },
      interacted: false,
    };
    const run = {
      partySkills: [],
    };
    const res = makeRes();

    await handler({
      body: { actionId: actionId('npcskillbad'), skillId: 'invalid-skill' },
      gameManager: attachExplorationService({
        run,
        meta: { actionLedger: { entries: {}, order: [] } },
      }, room),
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'npc_skill_selection', run: { currentRoom: 4, partySkills: [] } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('npcskillbad'));
    assert.equal(res.body.reason, 'Invalid skill choice');
    assert.deepEqual(res.body.authoritativeState, { phase: 'npc_skill_selection', run: { currentRoom: 4, partySkills: [] } });
  });

  it('wraps post-combat shop selection with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createCombatRouter(), 'post', '/creature-shop-select');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('shop1'), itemIndex: 1, targetIndex: 2 },
      gameManager: {
        run: {},
        meta: { actionLedger: { entries: {}, order: [] } },
        combatCycleService: {
          selectShopItem: (itemIndex, targetIndex) => ({ itemIndex, targetIndex, itemId: 'tonic' }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { pendingPostCombatShopSelection: null } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('shop1'));
    assert.equal(res.body.itemIndex, 1);
    assert.equal(res.body.targetIndex, 2);
    assert.deepEqual(res.body.state, { phase: 'room', run: { pendingPostCombatShopSelection: null } });
  });

  it('duplicate post-combat shop actionId does not re-run selectShopItem', async () => {
    const handler = getHandler(createCombatRouter(), 'post', '/creature-shop-select');
    const run = {};
    let selectCount = 0;
    const req = {
      body: { actionId: actionId('shopdupe'), itemIndex: 0, targetIndex: 1 },
      gameManager: {
        run,
        meta: { actionLedger: { entries: {}, order: [] } },
        combatCycleService: {
          selectShopItem: (itemIndex, targetIndex) => {
            selectCount += 1;
            return { itemIndex, targetIndex, selected: selectCount };
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { selectedCount: selectCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('shopdupe'));
    assert.equal(selectCount, 1);
    assert.equal(duplicateRes.body.selected, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { selectedCount: 1 } });
  });

  it('selects post-combat shop items from persisted active shop state', async () => {
    const item = { id: 'small-heal', type: 'heal', effect: { healPercent: 0.5 }, rarity: 'common' };
    const run = {
      postCombatShop: { active: true, items: [item] },
      creatureParty: { active: [{ id: 'hi', hp: 5, maxHp: 10, level: 1 }], reserves: [] },
      runSummary: { itemsCollected: 0 },
      currentAreaEncounters: 0,
    };
    const gm = {
      run,
      meta: { actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
      emitState() {},
    };
    gm.combatCycleService = new CombatCycleService(gm);
    const handler = getHandler(createCombatRouter(), 'post', '/creature-shop-select');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('shopactive'), itemIndex: 0, targetIndex: 0 },
      gameManager: gm,
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { postCombatShop: run.postCombatShop } }),
    }, res);

    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.selected.id, 'small-heal');
    assert.equal(run.creatureParty.active[0].hp, 10);
    assert.equal(run.postCombatShop, null);
  });

  it('legacy post-combat shop no-actionId response remains legacy shape', async () => {
    const handler = getHandler(createCombatRouter(), 'post', '/creature-shop-select');
    const res = makeRes();

    await handler({
      body: { itemIndex: 2 },
      gameManager: {
        run: {},
        combatCycleService: {
          selectShopItem: (itemIndex, targetIndex) => ({ itemIndex, targetIndex, ok: true }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.deepEqual(res.body, { itemIndex: 2, targetIndex: 0, ok: true, state: { phase: 'room' } });
  });

  it('optimistic post-combat shop route errors return corrected 400 with authoritative state', async () => {
    const handler = getHandler(createCombatRouter(), 'post', '/creature-shop-select');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('shopbad'), itemIndex: 9, targetIndex: 0 },
      gameManager: {
        run: {},
        meta: { actionLedger: { entries: {}, order: [] } },
        combatCycleService: {
          selectShopItem: () => {
            throw new Error('Invalid shop item');
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'post_combat_shop', run: { currentRoom: 3 } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('shopbad'));
    assert.equal(res.body.reason, 'Invalid shop item');
    assert.deepEqual(res.body.authoritativeState, { phase: 'post_combat_shop', run: { currentRoom: 3 } });
  });

  it('wraps campfire cook with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createCookingRouter(), 'post', '/campfire/cook');
    const req = makeCampfireReq({
      body: {
        actionId: actionId('campcook'),
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      },
      ingredients: { mizu: 1, miso: 1 },
      state: { phase: 'campfire', run: { currentRoom: 2, pendingCampfireAction: null } },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('campcook'));
    assert.equal(res.body.actionType, 'campfire.cook');
    assert.equal(res.body.room.cookedDish.id, 'miso-soup');
    assert.deepEqual(res.body.state, { phase: 'campfire', run: { currentRoom: 2, pendingCampfireAction: null } });
  });

  it('keeps legacy campfire cook responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createCookingRouter(), 'post', '/campfire/cook');
    const req = makeCampfireReq({
      body: { ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }] },
      ingredients: { mizu: 1, miso: 1 },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.equal(res.body.room.cookedDish.id, 'miso-soup');
  });

  it('duplicate campfire cook actionId does not consume ingredients twice', async () => {
    const handler = getHandler(createCookingRouter(), 'post', '/campfire/cook');
    const req = makeCampfireReq({
      body: {
        actionId: actionId('campcookdupe'),
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      },
      ingredients: { mizu: 1, miso: 1 },
      state: { phase: 'campfire', run: { currentRoom: 1 } },
    });

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('campcookdupe'));
    assert.equal(duplicateRes.body.room.cookedDish.id, 'miso-soup');
    assert.deepEqual(req.gameManager.run.cooking.ingredients, {});
    assert.equal(req.saveCount, 1);
  });

  it('duplicate campfire feed actionId does not apply a cooked dish twice', async () => {
    const handler = getHandler(createCookingRouter(), 'post', '/campfire/feed');
    const req = makeCampfireReq({
      body: { actionId: actionId('campfeeddupe'), targetCreatureIndex: 0 },
      room: {
        type: 'campfire',
        campfire: {
          cookedDish: {
            id: 'miso-soup',
            word: '味噌汁',
            nameEn: 'Miso soup',
            effects: [{ type: 'mpRestore', value: 0.2, target: 'fedCreature' }],
            effectDescription: 'Restores 20% MP.',
            ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
          },
          consumed: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
          resultKind: 'recipe',
          fed: false,
          completed: false,
        },
      },
      state: { phase: 'room', run: { currentRoom: 1 } },
    });

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('campfeeddupe'));
    assert.equal(req.gameManager.run.cooking.cookedThisRun.length, 1);
    assert.deepEqual(req.gameManager.meta.cookingRecipesDiscovered, ['miso-soup']);
    assert.equal(req.saveCount, 1);
  });

  it('duplicate campfire skip actionId does not save the completion twice', async () => {
    const handler = getHandler(createCookingRouter(), 'post', '/campfire/skip');
    const req = makeCampfireReq({
      body: { actionId: actionId('campskipdupe') },
      state: { phase: 'room', run: { currentRoom: 1 } },
    });

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('campskipdupe'));
    assert.equal(duplicateRes.body.actionType, 'campfire.skip');
    assert.equal(duplicateRes.body.skipped, true);
    assert.equal(req.gameManager.getCurrentRoom().campfire.completed, true);
    assert.equal(req.saveCount, 1);
  });

  it('optimistic campfire route errors return corrected authoritative state', async () => {
    const handler = getHandler(createCookingRouter(), 'post', '/campfire/cook');
    const req = makeCampfireReq({
      body: {
        actionId: actionId('campbad'),
        ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }],
      },
      ingredients: { mizu: 1 },
      state: { phase: 'campfire', run: { currentRoom: 4 } },
    });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('campbad'));
    assert.equal(res.body.reason, 'not_enough_ingredients');
    assert.deepEqual(res.body.authoritativeState, { phase: 'campfire', run: { currentRoom: 4 } });
  });

  it('wraps complete-discovery with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/complete-discovery');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('discomplete') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWordDiscovery: () => ({ type: 'word_discovery_complete', xpGrants: [] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', room: { type: 'wordDiscovery', interacted: true } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('discomplete'));
    assert.equal(res.body.actionType, 'wordDiscovery.complete');
    assert.deepEqual(res.body.state, { phase: 'room', room: { type: 'wordDiscovery', interacted: true } });
  });

  it('duplicate complete-discovery actionId does not complete the room twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/complete-discovery');
    let completeCalls = 0;
    let saveCalls = 0;
    const req = {
      body: { actionId: actionId('disdupe') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWordDiscovery: () => {
          completeCalls += 1;
          return { type: 'word_discovery_complete', xpGrants: [{ creatureId: 'hi', xp: 2 }] };
        },
      },
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: 2 } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('disdupe'));
    assert.equal(completeCalls, 1);
    assert.equal(saveCalls, 1);
  });

  it('optimistic complete-discovery errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/complete-discovery');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('disbad') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWordDiscovery: () => {
          throw new Error('No word discovery room here');
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'wordDiscovery', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('disbad'));
    assert.equal(res.body.reason, 'No word discovery room here');
    assert.deepEqual(res.body.authoritativeState, { phase: 'wordDiscovery', run: { currentRoom: 4 } });
  });

  it('wraps speed-review room completion with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('speedcomplete'), roomId: 'speed-room-1' },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeSpeedReviewRoom: ({ roomId }) => ({ roomId, completed: true }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({
        phase: 'room',
        run: {
          currentRoom: 2,
          revealedRooms: [{ id: 'speed-room-1', speedReviewRoom: { completed: true } }],
        },
      }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('speedcomplete'));
    assert.equal(res.body.actionType, 'speedReview.complete');
    assert.equal(res.body.roomId, 'speed-room-1');
    assert.equal(res.body.completed, true);
    assert.deepEqual(res.body.state, {
      phase: 'room',
      run: {
        currentRoom: 2,
        revealedRooms: [{ id: 'speed-room-1', speedReviewRoom: { completed: true } }],
      },
    });
  });

  it('duplicate speed-review completion actionId does not complete the room twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    let completeCount = 0;
    const req = {
      body: { actionId: actionId('speeddupe'), roomId: 'speed-room-2' },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeSpeedReviewRoom: ({ roomId }) => {
          completeCount += 1;
          return { roomId, completed: true, completeCount };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { completeCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('speeddupe'));
    assert.equal(duplicateRes.body.actionType, 'speedReview.complete');
    assert.equal(completeCount, 1);
    assert.equal(duplicateRes.body.completeCount, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { completeCount: 1 } });
  });

  it('keeps legacy speed-review completion responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    const res = makeRes();

    await handler({
      body: { roomId: 'speed-room-3' },
      gameManager: {
        completeSpeedReviewRoom: ({ roomId }) => ({ roomId, completed: true }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.deepEqual(res.body, {
      roomId: 'speed-room-3',
      completed: true,
      state: { phase: 'room' },
    });
  });

  it('optimistic speed-review completion errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('speedcompletebad'), roomId: 'speed-room-4' },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeSpeedReviewRoom: () => {
          throw new Error('Speed review room is not ready to complete');
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'speedReviewRoom', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('speedcompletebad'));
    assert.equal(res.body.reason, 'Speed review room is not ready to complete');
    assert.deepEqual(res.body.authoritativeState, { phase: 'speedReviewRoom', run: { currentRoom: 4 } });
  });

  it('wraps whack-a-mole completion with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    const res = makeRes();

    await handler({
      user: { id: 'wam-user' },
      body: { actionId: actionId('wamcomplete'), score: 4 },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWhackAMole: score => ({ type: 'whack_a_mole_complete', score, creditsAwarded: score }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: 2 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('wamcomplete'));
    assert.equal(res.body.actionType, 'whackAMole.complete');
    assert.equal(res.body.score, 4);
    assert.deepEqual(res.body.state, { phase: 'room', run: { currentRoom: 2 } });
  });

  it('duplicate whack-a-mole completion actionId does not award twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    let completeCount = 0;
    const req = {
      user: { id: 'wam-user' },
      body: { actionId: actionId('wamcompletedupe'), score: 3 },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWhackAMole: score => {
          completeCount += 1;
          return { type: 'whack_a_mole_complete', score, creditsAwarded: score, completeCount };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { completeCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionType, 'whackAMole.complete');
    assert.equal(completeCount, 1);
    assert.equal(duplicateRes.body.completeCount, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { completeCount: 1 } });
  });

  it('keeps legacy whack-a-mole completion response unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    const res = makeRes();

    await handler({
      user: { id: 'wam-user' },
      body: { score: 2 },
      gameManager: {
        completeWhackAMole: score => ({ type: 'whack_a_mole_complete', score, creditsAwarded: score }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.equal(res.body.type, 'whack_a_mole_complete');
    assert.equal(res.body.score, 2);
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('optimistic whack-a-mole completion errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    const res = makeRes();

    await handler({
      user: { id: 'wam-user' },
      body: { actionId: actionId('wamcompletebad'), score: 5 },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWhackAMole: () => { throw new Error('No whack-a-mole room here'); },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'whackAMole', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('wamcompletebad'));
    assert.equal(res.body.reason, 'No whack-a-mole room here');
    assert.deepEqual(res.body.authoritativeState, { phase: 'whackAMole', run: { currentRoom: 4 } });
  });

  it('wraps whack-a-mole skip with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('wamskip') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        skipWhackAMole: () => ({ type: 'whack_a_mole_skipped' }),
        explorationService: {
          proceedToNextRoom: () => ({ room: { type: 'empty' } }),
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('wamskip'));
    assert.equal(res.body.actionType, 'whackAMole.skip');
    assert.equal(res.body.type, 'whack_a_mole_skipped');
    assert.deepEqual(res.body.state, { phase: 'room', run: { currentRoom: 1 } });
  });

  it('duplicate whack-a-mole skip actionId does not skip twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    let skipCount = 0;
    let proceedCount = 0;
    const req = {
      body: { actionId: actionId('wamskipdupe') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        skipWhackAMole: () => {
          skipCount += 1;
          return { type: 'whack_a_mole_skipped', skipCount };
        },
        explorationService: {
          proceedToNextRoom: () => {
            proceedCount += 1;
            return { proceedCount };
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { skipCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionType, 'whackAMole.skip');
    assert.equal(skipCount, 1);
    assert.equal(proceedCount, 1);
    assert.equal(duplicateRes.body.skipCount, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { skipCount: 1 } });
  });

  it('keeps legacy whack-a-mole skip response unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    const res = makeRes();
    let proceedCount = 0;

    await handler({
      body: {},
      gameManager: {
        skipWhackAMole: () => ({ type: 'whack_a_mole_skipped' }),
        explorationService: {
          proceedToNextRoom: () => {
            proceedCount += 1;
            return { room: { type: 'empty' } };
          },
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.equal(res.body.type, 'whack_a_mole_skipped');
    assert.equal(proceedCount, 1);
    assert.deepEqual(res.body.room, { type: 'empty' });
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('optimistic whack-a-mole skip errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('wamskipbad') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        skipWhackAMole: () => { throw new Error('No whack-a-mole room here'); },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'whackAMole', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('wamskipbad'));
    assert.equal(res.body.reason, 'No whack-a-mole room here');
    assert.deepEqual(res.body.authoritativeState, { phase: 'whackAMole', run: { currentRoom: 4 } });
  });
});
