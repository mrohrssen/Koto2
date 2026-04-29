import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('fusion lab flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    await client.loginAsNewUser();
    await client.createPlayer();
  });

  afterEach(() => cleanup());

  it('adds a fusion core for testing and exposes fusion status', async () => {
    const addRes = await client.post('/api/game/fusion/debug-add-core', {});
    assert.equal(addRes.status, 200, `debug-add-core failed: ${JSON.stringify(addRes.body)}`);
    assert.equal(addRes.body.fusionCores, 1);
    assert.equal(addRes.body.state.meta.fusionCores, 1);

    const stateRes = await client.get('/api/game/fusion');
    assert.equal(stateRes.status, 200, `fusion state failed: ${JSON.stringify(stateRes.body)}`);
    assert.equal(stateRes.body.fusionCores, 1);
    assert.equal(stateRes.body.recipes[0].id, 'fire-cat');
    assert.equal(stateRes.body.recipes[0].resultId, 'hineko');
  });

  it('consumes Fire and Cat copies when unlocking Fire Cat', async () => {
    await client.post('/api/game/debug-mode', { enabled: true });
    const collectionRes = await client.post('/api/game/debug-set-collection', {
      creatureIds: ['hi', 'neko'],
      tutorialFusionDataUnlocked: ['hineko']
    });
    assert.equal(collectionRes.status, 200, `debug-set-collection failed: ${JSON.stringify(collectionRes.body)}`);
    await client.post('/api/game/fusion/debug-add-core', {});

    const fuseRes = await client.post('/api/game/fusion/start', { recipeId: 'fire-cat' });

    assert.equal(fuseRes.status, 200, `fusion start failed: ${JSON.stringify(fuseRes.body)}`);
    assert.equal(fuseRes.body.unlockedCreatureId, 'hineko');
    assert.equal(fuseRes.body.fusionCores, 0);
    assert.equal(fuseRes.body.state.meta.fusionCores, 0);
    const collection = fuseRes.body.state.meta.creatureCollection;
    assert.ok(collection.includes('hi'));
    assert.ok(collection.includes('neko'));
    assert.ok(collection.includes('hineko'));
    const counts = fuseRes.body.state.meta.creatureCounts;
    assert.equal(counts.hi, 0);
    assert.equal(counts.neko, 0);
    assert.equal(counts.hineko, 1);
  });

  it('rejects starting fusion during a run', async () => {
    await client.post('/api/game/debug-mode', { enabled: true });
    await client.post('/api/game/debug-set-collection', { creatureIds: ['hi', 'neko'] });
    await client.post('/api/game/fusion/debug-add-core', {});
    await client.post('/api/game/start-run', {});

    const fuseRes = await client.post('/api/game/fusion/start', { recipeId: 'fire-cat' });

    assert.equal(fuseRes.status, 400);
    assert.equal(fuseRes.body.error, 'Cannot start fusion during a run');
  });
});
