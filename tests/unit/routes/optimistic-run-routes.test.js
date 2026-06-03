import { describe, it } from 'node:test';
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

  it('/proceed does not re-run duplicate actionId and run.currentRoom remains 1', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/proceed');
    const run = {
      currentRoom: 0,
      rooms: [{ type: 'room' }, { type: 'shrine' }, { type: 'skillMaster' }],
      optimisticActionLedger: { entries: {}, order: [] },
    };
    const req = {
      body: { actionId: 'run_proceed_duplicate' },
      gameManager: {
        run,
        proceedToNextRoom: () => {
          run.currentRoom += 1;
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
    assert.equal(duplicateRes.body.actionId, 'run_proceed_duplicate');
    assert.equal(run.currentRoom, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'shrine', run: { currentRoom: 1 } });
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

  it('/skill-master-choose does not re-run duplicate actionId', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/skill-master-choose');
    const run = { partySkills: [], optimisticActionLedger: { entries: {}, order: [] } };
    let choiceCount = 0;
    const req = {
      body: { actionId: 'skill_master_duplicate', skillId: 'momentum' },
      gameManager: {
        run,
        explorationService: {
          chooseSkillMasterOffer: skillId => {
            choiceCount += 1;
            run.partySkills.push({ id: skillId });
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
    assert.deepEqual(run.partySkills, [{ id: 'momentum' }]);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { partySkills: [{ id: 'momentum' }] } });
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

  it('/shrine-choose does not re-run duplicate actionId', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/shrine-choose');
    const run = { shrineUses: 0, optimisticActionLedger: { entries: {}, order: [] } };
    const req = {
      body: { actionId: 'shrine_duplicate', rewardType: 'heal_all' },
      gameManager: {
        run,
        useShrineReward: rewardType => {
          run.shrineUses += 1;
          return { rewardType, type: 'shrine_reward' };
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
      body: { actionId: 'friendly_invalid_item', itemId: 'shield', targetCreatureIndex: 0 },
      gameManager: {
        run: { optimisticActionLedger: { entries: {}, order: [] } },
        meta: {},
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'friendlyNpc', run: { currentRoom: 3 } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, 'friendly_invalid_item');
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
      body: { actionId: 'friendly_mutation_failure', itemId: 'sword', targetCreatureIndex: 0 },
      gameManager: {
        run: {
          creatureParty: {},
          itemBuffs: {},
          runSummary: { itemsCollected: 0 },
          optimisticActionLedger: { entries: {}, order: [] },
        },
        meta: {},
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'friendlyNpc', run: { currentRoom: 3 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, 'friendly_mutation_failure');
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
      optimisticActionLedger: { entries: {}, order: [] },
    };
    const req = {
      body: { actionId: 'friendly_duplicate', itemId: 'sword', targetCreatureIndex: 0 },
      gameManager: {
        run,
        meta: { itemsDiscovered: [] },
        getCurrentRoom: () => room,
      },
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

  it('wraps NPC battle skill choices with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: ['momentum'] },
      interacted: false,
    };
    const run = { partySkills: [] };
    const res = makeRes();

    await handler({
      body: { actionId: 'npc_battle_skill_1', skillId: 'momentum' },
      gameManager: {
        run,
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [...run.partySkills] } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'npc_battle_skill_1');
    assert.equal(res.body.chosenId, 'momentum');
    assert.deepEqual(res.body.partySkills, [{ id: 'momentum' }]);
    assert.deepEqual(res.body.state, { phase: 'room', run: { partySkills: [{ id: 'momentum' }] } });
  });

  it('/npc-battle-skill-choose does not re-run duplicate actionId and run.partySkills length stays 1', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: ['momentum'] },
      interacted: false,
    };
    const run = {
      partySkills: [],
      optimisticActionLedger: { entries: {}, order: [] },
    };
    const req = {
      body: { actionId: 'npc_battle_skill_duplicate', skillId: 'momentum' },
      gameManager: {
        run,
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { partySkills: [...run.partySkills] } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, 'npc_battle_skill_duplicate');
    assert.equal(run.partySkills.length, 1);
    assert.equal(room.npcBattle.chosenSkillId, 'momentum');
    assert.equal(room.npcBattle.skillSelectionPending, false);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { partySkills: [{ id: 'momentum' }] } });
  });

  it('keeps legacy NPC battle skill choice responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: ['momentum'] },
      interacted: false,
    };
    const run = { partySkills: [] };
    const res = makeRes();

    await handler({
      body: { skillId: 'momentum' },
      gameManager: {
        run,
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.chosenId, 'momentum');
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('returns corrected 400 with authoritative state for invalid optimistic NPC battle skill choices', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/npc-battle-skill-choose');
    const room = {
      type: 'npcBattle',
      npcBattle: { skillSelectionPending: true, offered: ['momentum'] },
      interacted: false,
    };
    const run = {
      partySkills: [],
      optimisticActionLedger: { entries: {}, order: [] },
    };
    const res = makeRes();

    await handler({
      body: { actionId: 'npc_battle_skill_invalid', skillId: 'invalid-skill' },
      gameManager: {
        run,
        getCurrentRoom: () => room,
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'npc_skill_selection', run: { currentRoom: 4, partySkills: [] } }),
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, 'npc_battle_skill_invalid');
    assert.equal(res.body.reason, 'Invalid skill choice');
    assert.deepEqual(res.body.authoritativeState, { phase: 'npc_skill_selection', run: { currentRoom: 4, partySkills: [] } });
  });
});
