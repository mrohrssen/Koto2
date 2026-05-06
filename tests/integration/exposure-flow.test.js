import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/test-app.js';
import { createApiClient } from './helpers/api-client.js';

describe('known-word exposure flow', () => {
  let client;
  let cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('updates the active run summary through the live game manager', async () => {
    await client.loginAsNewUser('exposure-user', 'test-pass-123');

    const createPlayerRes = await client.createPlayer('ExposureTester');
    assert.equal(createPlayerRes.status, 200);

    await client.claimDailyCrystals();
    const startRunRes = await client.post('/api/game/start-run', {});
    assert.equal(startRunRes.status, 200);

    const exposeRes = await client.post('/api/game/known-words/expose', {
      words: [
        { word: '遊ぶ', meaning: 'to play' },
        { word: '遊ぶ', meaning: 'to play' },
        { word: '犬', meaning: 'dog' }
      ]
    });
    assert.equal(exposeRes.status, 200);
    assert.deepEqual(exposeRes.body, { ok: true });

    const forfeitRes = await client.post('/api/game/forfeit', { isVictory: false });
    assert.equal(forfeitRes.status, 200);
    assert.equal(forfeitRes.body.runSummary?.wordsImmersed, 2);
    assert.deepEqual(
      forfeitRes.body.runSummary?.wordsMastered || [],
      []
    );
  });
});
