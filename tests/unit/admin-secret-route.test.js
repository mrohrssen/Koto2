import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createAdminSecretRouter } from '../../src/routes/admin-secret.js';

function createApp() {
  const app = express();
  app.use('/api/admin', createAdminSecretRouter());
  return app;
}

describe('admin secret route', () => {
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
  });

  it('returns the secret for localhost requests', async () => {
    process.env.ADMIN_SECRET = 'local-secret';
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'localhost');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { secret: 'local-secret' });
  });

  it('does not expose the secret for remote hostnames', async () => {
    process.env.ADMIN_SECRET = 'remote-secret';
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'jrpg-production.up.railway.app');

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Not found' });
  });

  it('returns 404 when ADMIN_SECRET is not configured', async () => {
    const response = await request(createApp())
      .get('/api/admin/secret')
      .set('Host', 'localhost');

    assert.equal(response.status, 404);
  });
});
