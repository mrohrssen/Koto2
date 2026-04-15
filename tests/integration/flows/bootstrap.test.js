import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('integration test infrastructure', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('boots the app and responds to settings endpoint', async () => {
    const res = await client.get('/api/settings');
    assert.equal(res.status, 200);
  });

  it('rejects unauthenticated game requests', async () => {
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 401);
  });

  it('allows authenticated game requests after login', async () => {
    await client.loginAsNewUser();
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 200);
    assert.ok(res.body);
  });
});
