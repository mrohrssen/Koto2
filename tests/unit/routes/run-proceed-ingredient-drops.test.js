import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { createNewPlayer, createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';

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
    assert.ok(response.body.ingredientDrops.every(drop => drop.nameToken.reading));
    assert.equal(Object.values(gm.run.cooking.ingredients).reduce((sum, count) => sum + count, 0), 1);
  });
});
