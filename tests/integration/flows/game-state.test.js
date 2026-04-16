import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('game state flows', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('creates a player and returns initial game state', async () => {
    await client.loginAsNewUser();
    const createRes = await client.createPlayer('StateTest');
    assert.equal(createRes.status, 200);

    const stateRes = await client.getState();
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.body.player.name, 'StateTest');
  });

  it('starts a run via the real route chain', async () => {
    await client.loginAsNewUser('run-user', 'run-pass-123');
    await client.createPlayer('RunTest');

    // 0. Select all three starters to populate creature collection
    await client.post('/api/game/select-starter', { starterId: 'starter-fire' });
    await client.post('/api/game/select-starter', { starterId: 'starter-water' });
    await client.post('/api/game/select-starter', { starterId: 'starter-wood' });

    // 1. Start run
    const startRes = await client.post('/api/game/start-run', {});
    assert.equal(startRes.status, 200);

    // 2. Get area options and pick the first
    const areasRes = await client.get('/api/game/area-options');
    assert.equal(areasRes.status, 200);
    assert.ok(Array.isArray(areasRes.body), 'area-options should return an array');
    assert.ok(areasRes.body.length > 0, 'should have at least one area option');
    const firstArea = areasRes.body[0];

    // 3. Select area
    const selectRes = await client.post('/api/game/select-area', { areaId: firstArea.id });
    assert.equal(selectRes.status, 200);

    // 4. Get creature collection
    const collectionRes = await client.get('/api/game/creature-collection');
    assert.equal(collectionRes.status, 200, `creature-collection failed: ${JSON.stringify(collectionRes.body)}`);
    assert.ok(Array.isArray(collectionRes.body.collection), 'should have a collection array');
    const collection = collectionRes.body.collection;
    assert.ok(collection.length >= 3, `should have at least 3 creatures, got: ${JSON.stringify(collection)}`);

    // 5. Confirm creatures with the 3 valid starters we selected
    const starterIds = ['hi', 'mizu', 'ki'];
    const confirmRes = await client.post('/api/game/confirm-creatures', { starterIds });
    assert.equal(confirmRes.status, 200, `confirm-creatures failed: ${JSON.stringify(confirmRes.body)}`);

    // Verify state has run.currentArea
    const stateRes = await client.getState();
    assert.equal(stateRes.status, 200);
    assert.ok(stateRes.body.run, 'state should have an active run');
    assert.ok(stateRes.body.run.currentArea, 'run should have currentArea set');
    assert.equal(stateRes.body.run.currentArea.id, firstArea.id);
  });

  it('game state persists across requests', async () => {
    await client.loginAsNewUser('persist-user', 'persist-pass-123');
    await client.createPlayer('PersistTest');

    const first = await client.getState();
    assert.equal(first.status, 200);

    const second = await client.getState();
    assert.equal(second.status, 200);

    assert.deepStrictEqual(first.body, second.body);
  });
});
