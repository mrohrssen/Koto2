import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { createNewPlayer, createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';

function setupFriendlyNpcRun() {
  const gm = getManager('test-user');
  gm.player = createNewPlayer();
  gm.initMeta();
  gm.run = createNewRun(gm.player);
  gm.run.active = true;
  gm.run.currentArea = { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' };
  gm.run.areaPath = ['hajimari-no-hiroba'];
  gm.run.rooms = [createRoom(ROOM_TYPES.friendlyNpc, 'hajimari-no-hiroba', 1, 1)];
  gm.run.currentRoom = 0;
  return gm;
}

describe('friendly NPC equipment-only offers', () => {
  afterEach(() => {
    clearManagersForTest();
  });

  it('regenerates stale consumable offers from old saves', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupFriendlyNpcRun();
    const room = gm.getCurrentRoom();
    room.friendlyNpc.offerCategory = 'food';
    room.friendlyNpc.offered = [
      { id: 'old-tea', category: 'food', word: '茶', reading: 'ちゃ', meaning: 'tea', type: 'heal', effect: {}, description: 'old food' }
    ];

    const response = await request(app)
      .post('/api/game/friendly-npc-offers')
      .send({})
      .expect(200);

    assert.ok(response.body.offered.length > 0);
    assert.ok(response.body.offered.every(item => item.category === 'equipment'));
    assert.ok(gm.getCurrentRoom().friendlyNpc.offered.every(item => item.category === 'equipment'));
  });

  it('rejects direct selection of stale consumable offers', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupFriendlyNpcRun();
    const room = gm.getCurrentRoom();
    room.friendlyNpc.offered = [
      { id: 'old-tea', category: 'food', word: '茶', reading: 'ちゃ', meaning: 'tea', type: 'heal', effect: { healPercent: 0.1 }, description: 'old food' }
    ];

    await request(app)
      .post('/api/game/friendly-npc-choose')
      .send({ itemId: 'old-tea', targetCreatureIndex: 0 })
      .expect(400);
  });
});
