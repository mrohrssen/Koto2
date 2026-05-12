import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { createNewPlayer, createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { hasCookableRecipe } from '../../../src/game/services/cooking-service.js';

function setupRun() {
  const gm = getManager('test-user');
  gm.player = createNewPlayer();
  gm.initMeta();
  gm.run = createNewRun(gm.player);
  gm.run.active = true;
  gm.run.rooms = [
    createRoom(ROOM_TYPES.friendlyNpc, 'test-area', 1, 2),
    createRoom(ROOM_TYPES.encounter, 'test-area', 2, 2)
  ];
  gm.run.currentRoom = 0;
  gm.run.roomsExplored = 1;
  gm.run.totalEncounters = 1;
  gm.run.currentArea = { id: 'test-area', nameEn: 'Test Area' };
  gm.run.creatureParty.active = [{ id: 'hi', hp: 10, maxHp: 20 }];
  return gm;
}

function setupTutorialStartingMeadowRun() {
  const gm = setupRun();
  gm.meta.tutorialStep = 0;
  gm.run.currentArea = { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' };
  gm.run.rooms = [
    createRoom(ROOM_TYPES.encounter, 'hajimari-no-hiroba', 1, 7),
    createRoom(ROOM_TYPES.friendlyNpc, 'hajimari-no-hiroba', 2, 7),
    createRoom(ROOM_TYPES.encounter, 'hajimari-no-hiroba', 3, 7),
    createRoom(ROOM_TYPES.npcBattle, 'hajimari-no-hiroba', 4, 7),
    createRoom(ROOM_TYPES.whackAMole, 'hajimari-no-hiroba', 5, 7),
    createRoom(ROOM_TYPES.campfire, 'hajimari-no-hiroba', 6, 7),
    createRoom(ROOM_TYPES.boss, 'hajimari-no-hiroba', 7, 7),
  ];
  gm.run.rooms[0].interacted = true;
  gm.run.currentRoom = 0;
  gm.run.roomsExplored = 1;
  return gm;
}

describe('run proceed ingredient drops', () => {
  afterEach(() => {
    mock.restoreAll();
    clearManagersForTest();
  });

  it('adds room-transition ingredient drops and returns decorated drop data', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupRun();
    const randomValues = [0, 0, 0];
    gm.explorationService.ingredientDropRandom = () => randomValues.shift() ?? 0;
    mock.method(Math, 'random', () => 0);

    const response = await request(app)
      .post('/api/game/proceed')
      .send({})
      .expect(200);

    assert.equal(response.body.ingredientDrops.length, 1);
    assert.ok(response.body.ingredientDrops.every(drop => drop.quantity === 1));
    assert.ok(response.body.ingredientDrops.every(drop => drop.ingredient.reading));
    assert.ok(response.body.ingredientDrops.every(drop => drop.ingredient.nameEn));
    assert.ok(response.body.ingredientDrops.every(drop => drop.nameToken.reading));
    assert.equal(Object.values(gm.run.cooking.ingredients).reduce((sum, count) => sum + count, 0), 1);
  });

  it('forces the first four Starting Meadow tutorial drops into a 4-ingredient recipe', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupTutorialStartingMeadowRun();
    gm.explorationService.ingredientDropRandom = () => 0.99;

    const dropIds = [];
    for (let i = 0; i < 4; i++) {
      const response = await request(app)
        .post('/api/game/proceed')
        .send({})
        .expect(200);
      dropIds.push(...response.body.ingredientDrops.map(drop => drop.id));
      gm.run.rooms[gm.run.currentRoom].interacted = true;
    }

    assert.deepEqual(dropIds, ['mizu', 'gyuunyuu', 'toriniku', 'jagaimo']);
    assert.deepEqual(gm.run.cooking.ingredients, {
      mizu: 1,
      gyuunyuu: 1,
      toriniku: 1,
      jagaimo: 1
    });
    assert.equal(hasCookableRecipe(gm.run.cooking.ingredients, { minTotalQuantity: 4 }), true);
  });

  it('uses normal Starting Meadow drops after tutorial mode is complete', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupTutorialStartingMeadowRun();
    gm.meta.tutorialStep = 6;
    gm.explorationService.ingredientDropRandom = () => 0.99;

    const response = await request(app)
      .post('/api/game/proceed')
      .send({})
      .expect(200);

    assert.equal(response.body.ingredientDrops.length, 4);
    assert.ok(response.body.ingredientDrops.every(drop => drop.id === 'tougarashi'));
    assert.deepEqual(gm.run.cooking.ingredients, { tougarashi: 4 });
  });
});
