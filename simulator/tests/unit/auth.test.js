import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTestUser } from '../../engine/auth.js';

async function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

describe('simulator auth helpers', () => {
  it('accepts AI data sharing consent when creating test users', async () => {
    let requestBody;
    const app = express();
    app.use(express.json());
    app.post('/api/auth/register', (req, res) => {
      requestBody = req.body;
      res.status(201).json({ user: { id: 'sim-user' }, token: 'jwt-token' });
    });
    const server = await listen(app);

    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const result = await createTestUser(baseUrl, 'Consent Profile', 'unused-secret');

      assert.equal(result.userId, 'sim-user');
      assert.equal(result.token, 'jwt-token');
      assert.equal(requestBody.aiDataSharingConsent, true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
