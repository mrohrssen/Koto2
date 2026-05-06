import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('Auth Integration Flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('registers a new user and returns a token', async () => {
    const res = await client.post('/api/auth/register', {
      username: 'newuser',
      password: 'securepass123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'response should include a JWT token');
    assert.equal(res.body.user.username, 'newuser');
    assert.ok(res.body.user.id, 'response should include a user id');
  });

  it('rejects duplicate registration', async () => {
    await client.post('/api/auth/register', {
      username: 'dupeuser',
      password: 'securepass123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });

    const res = await client.post('/api/auth/register', {
      username: 'dupeuser',
      password: 'differentpass123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'response should include an error message');
  });

  it('logs in with valid credentials', async () => {
    await client.post('/api/auth/register', {
      username: 'loginuser',
      password: 'securepass123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });

    const res = await client.post('/api/auth/login', {
      username: 'loginuser',
      password: 'securepass123'
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'login should return a JWT token');
    assert.equal(res.body.user.username, 'loginuser');
  });

  it('rejects login with wrong password', async () => {
    await client.post('/api/auth/register', {
      username: 'wrongpwuser',
      password: 'securepass123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });

    const res = await client.post('/api/auth/login', {
      username: 'wrongpwuser',
      password: 'totallyWrongPassword'
    });
    assert.equal(res.status, 401);
    assert.ok(res.body.error, 'response should include an error message');
  });

  it('uses token to access protected routes (GET /api/auth/me)', async () => {
    const regRes = await client.post('/api/auth/register', {
      username: 'meuser',
      password: 'securepass123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });

    client.setToken(regRes.body.token);
    const meRes = await client.get('/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.username, 'meuser');
    assert.ok(meRes.body.id, '/me should return the user id');
    assert.ok('apiKeys' in meRes.body, '/me should include apiKeys info');
  });

  it('rejects invalid JWT on protected routes', async () => {
    client.setToken('this.is.not-a-valid-jwt');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.ok(res.body.error, 'response should include an error message');
  });
});
