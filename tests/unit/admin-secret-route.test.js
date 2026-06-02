import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  createAdminSecretRouter,
  isLocalAdminSecretRequest,
} from '../../src/routes/admin-secret.js';

function createApp() {
  const app = express();
  app.use('/api/admin', createAdminSecretRouter());
  return app;
}

describe('admin secret route', () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.ENABLE_LOCAL_ADMIN_SECRET;
  });

  it('returns the secret for localhost requests', async () => {
    process.env.ADMIN_SECRET = 'local-secret';
    process.env.ENABLE_LOCAL_ADMIN_SECRET = '1';
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'localhost');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { secret: 'local-secret' });
  });

  it('does not expose the secret for remote hostnames', async () => {
    process.env.ADMIN_SECRET = 'remote-secret';
    process.env.ENABLE_LOCAL_ADMIN_SECRET = '1';
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'jrpg-production.up.railway.app');

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Not found' });
  });

  it('returns 404 when ADMIN_SECRET is not configured', async () => {
    process.env.ENABLE_LOCAL_ADMIN_SECRET = '1';
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'localhost');

    assert.equal(response.status, 404);
  });

  it('returns 404 when local secret discovery is not enabled', async () => {
    process.env.ADMIN_SECRET = 'local-secret';
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'localhost');

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Not found' });
  });

  it('does not trust a spoofed localhost host header from a remote address', () => {
    assert.equal(isLocalAdminSecretRequest({
      hostname: 'localhost',
      socket: { remoteAddress: '203.0.113.5' },
    }), false);
  });
});
