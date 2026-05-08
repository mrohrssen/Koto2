import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { createNewPlayer, createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { loadDialoguePools } from '../../../src/game/dialogue-loader.js';

function mockCreature(overrides = {}) {
  return {
    id: 'hi',
    uid: 'active-hi',
    name: '火',
    nameEn: 'Hi',
    hp: 30,
    maxHp: 50,
    mp: 10,
    maxMp: 30,
    level: 3,
    itemBuffs: null,
    equippedItems: [],
    ...overrides,
  };
}

function setupRun(room) {
  const gm = getManager('test-user');
  gm.player = createNewPlayer();
  gm.initMeta();
  gm.run = createNewRun(gm.player);
  gm.run.rooms = [room];
  gm.run.currentRoom = 0;
  gm.run.creatureParty.active = [mockCreature()];
  return gm;
}

describe('cooking routes', () => {
  afterEach(() => {
    clearManagersForTest();
  });

  it('materials claim endpoint no longer exists', async () => {
    const app = createApp({ authBypass: true });
    setupRun(createRoom(ROOM_TYPES.encounter, 'test-area', 1, 1));

    await request(app)
      .post('/api/game/materials/claim')
      .send({})
      .expect(404);
  });

  it('campfire state rejects non-campfire room', async () => {
    const app = createApp({ authBypass: true });
    setupRun(createRoom(ROOM_TYPES.encounter, 'test-area', 1, 1));

    await request(app)
      .get('/api/game/campfire')
      .expect(400);
  });

  it('campfire state includes rendered-choice token payloads for yes and no', async () => {
    loadDialoguePools(`${process.cwd()}/data`);
    const app = createApp({ authBypass: true });
    const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
    gm.run.cooking.ingredients = { mizu: 1 };

    const res = await request(app)
      .get('/api/game/campfire')
      .expect(200);

    assert.ok(Array.isArray(res.body.yesTokens.tokens));
    assert.ok(Array.isArray(res.body.noTokens.tokens));
    assert.equal(res.body.yesTokens.tokens[0].surface, 'はい');
    assert.equal(res.body.noTokens.tokens[0].surface, 'いいえ');
  });

  it('campfire state includes anonymous cookable recipe hints', async () => {
    loadDialoguePools(`${process.cwd()}/data`);
    const app = createApp({ authBypass: true });
    const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
    gm.run.cooking.ingredients = { mizu: 1, miso: 1, toufu: 1 };

    const res = await request(app)
      .get('/api/game/campfire')
      .expect(200);

    const misoSoup = res.body.cookableRecipeHints.find(recipe => recipe.id === 'miso-soup');
    const tofuMisoSoup = res.body.cookableRecipeHints.find(recipe => recipe.id === 'tofu-miso-soup');

    assert.ok(misoSoup);
    assert.ok(tofuMisoSoup);
    assert.deepEqual(misoSoup.ingredients, [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }]);
    assert.equal(misoSoup.totalQuantity, 2);
    assert.equal(misoSoup.word, undefined);
    assert.equal(misoSoup.nameEn, undefined);
    assert.equal(misoSoup.effectDescription, undefined);
  });

  it('campfire cook consumes ingredients and stores cooked dish', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
    gm.run.cooking.ingredients = { mizu: 1, miso: 1 };

    const res = await request(app)
      .post('/api/game/campfire/cook')
      .send({ ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }] })
      .expect(200);

    assert.equal(res.body.room.cookedDish.id, 'miso-soup');
    assert.deepEqual(gm.run.cooking.ingredients, {});
    assert.equal(gm.getCurrentRoom().campfire.cookedDish.id, 'miso-soup');
  });

  it('campfire feed applies dish once, completes room, and discovers authored recipe', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
    gm.run.cooking.ingredients = { mizu: 1, miso: 1 };

    await request(app)
      .post('/api/game/campfire/cook')
      .send({ ingredients: [{ id: 'mizu', quantity: 1 }, { id: 'miso', quantity: 1 }] })
      .expect(200);

    const first = await request(app)
      .post('/api/game/campfire/feed')
      .send({ targetCreatureIndex: 0 })
      .expect(200);
    const second = await request(app)
      .post('/api/game/campfire/feed')
      .send({ targetCreatureIndex: 0 })
      .expect(200);

    assert.equal(first.body.applyResult.applied, true);
    assert.equal(second.body.applyResult, undefined);
    assert.equal(gm.getCurrentRoom().interacted, true);
    assert.equal(gm.getCurrentRoom().campfire.completed, true);
    assert.deepEqual(gm.meta.cookingRecipesDiscovered, ['miso-soup']);
  });

  it('campfire skip completes room without consuming ingredients or cooking a dish', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
    gm.run.cooking.ingredients = { mizu: 1, miso: 1 };

    const res = await request(app)
      .post('/api/game/campfire/skip')
      .send({})
      .expect(200);

    assert.deepEqual(gm.run.cooking.ingredients, { mizu: 1, miso: 1 });
    assert.equal(gm.getCurrentRoom().campfire.cookedDish, null);
    assert.equal(gm.getCurrentRoom().campfire.completed, true);
    assert.equal(gm.getCurrentRoom().interacted, true);
    assert.equal(res.body.skipped, true);
  });
});
