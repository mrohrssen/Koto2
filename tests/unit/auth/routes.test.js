import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_USERS_FILE = join(__dirname, '../../../.jrpg-users-routes-test.json');

// Set env before importing
process.env.JWT_SECRET = 'test-secret-for-routes';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);
process.env.ADMIN_SECRET = 'admin-test-secret';

import { createInviteCode } from '../../../src/auth/users.js';
import { verifyToken } from '../../../src/auth/middleware.js';
import createAuthRoutes from '../../../src/auth/routes.js';

describe('auth/routes', () => {
  beforeEach(() => {
    if (existsSync(TEST_USERS_FILE)) unlinkSync(TEST_USERS_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_USERS_FILE)) unlinkSync(TEST_USERS_FILE);
  });

  function mockReqRes(body = {}, headers = {}) {
    const req = { body, headers, ip: '127.0.0.1' };
    let statusCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseBody = data; }
    };
    return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
  }

  it('registers a user with valid invite code', async () => {
    const code = createInviteCode('admin-test-secret', TEST_USERS_FILE);

    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });
    const handler = router._testHandlers.register;

    const { req, res, getBody } = mockReqRes({
      username: 'takeshi',
      password: 'pass123',
      inviteCode: code
    });

    await handler(req, res);
    const body = getBody();
    assert.ok(body.token);
    assert.equal(body.user.username, 'takeshi');
    assert.ok(body.user.id.startsWith('u_'));

    const payload = verifyToken(body.token);
    assert.equal(payload.username, 'takeshi');
  });

  it('rejects registration without invite code', async () => {
    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });
    const handler = router._testHandlers.register;

    const { req, res, getStatus, getBody } = mockReqRes({
      username: 'takeshi',
      password: 'pass123',
      inviteCode: 'FAKE-CODE'
    });

    await handler(req, res);
    assert.equal(getStatus(), 400);
    assert.ok(getBody().error.includes('invite code'));
  });

  it('logs in with correct credentials', async () => {
    const code = createInviteCode('admin-test-secret', TEST_USERS_FILE);
    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });

    // Register first
    const { req: regReq, res: regRes } = mockReqRes({
      username: 'takeshi', password: 'pass123', inviteCode: code
    });
    await router._testHandlers.register(regReq, regRes);

    // Login
    const { req, res, getBody } = mockReqRes({
      username: 'takeshi', password: 'pass123'
    });
    await router._testHandlers.login(req, res);
    const body = getBody();
    assert.ok(body.token);
    assert.equal(body.user.username, 'takeshi');
  });

  it('rejects login with wrong password', async () => {
    const code = createInviteCode('admin-test-secret', TEST_USERS_FILE);
    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });

    // Register
    const { req: regReq, res: regRes } = mockReqRes({
      username: 'takeshi', password: 'pass123', inviteCode: code
    });
    await router._testHandlers.register(regReq, regRes);

    // Login with wrong password
    const { req, res, getStatus } = mockReqRes({
      username: 'takeshi', password: 'wrongpass'
    });
    await router._testHandlers.login(req, res);
    assert.equal(getStatus(), 401);
  });
});
