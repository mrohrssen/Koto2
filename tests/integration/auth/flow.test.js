import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_USERS = join(__dirname, '../../../.jrpg-users-integration-test.json');

process.env.JWT_SECRET = 'integration-test-secret';
process.env.ENCRYPTION_KEY = 'd'.repeat(64);
process.env.ADMIN_SECRET = 'admin-integration-test';

import createAuthRoutes from '../../../src/auth/routes.js';
import { verifyToken } from '../../../src/auth/middleware.js';
import { createInviteCode } from '../../../src/auth/users.js';

describe('Auth Integration Flow', () => {
  let router;

  beforeEach(() => {
    if (existsSync(TEST_USERS)) unlinkSync(TEST_USERS);
    router = createAuthRoutes({ usersFile: TEST_USERS });
  });

  afterEach(() => {
    if (existsSync(TEST_USERS)) unlinkSync(TEST_USERS);
  });

  function mockReqRes(body = {}, headers = {}) {
    const req = { body, headers, ip: '127.0.0.1', user: null };
    let statusCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseBody = data; }
    };
    return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
  }

  it('full flow: generate invite -> register -> login -> get me -> update keys', async () => {
    // 1. Generate invite code
    const { req: invReq, res: invRes, getBody: invBody } = mockReqRes(
      {}, { 'x-admin-secret': 'admin-integration-test' }
    );
    router._testHandlers.generateInvite(invReq, invRes);
    const code = invBody().code;
    assert.ok(code.startsWith('NEO-TOKYO-'));

    // 2. Register
    const { req: regReq, res: regRes, getBody: regBody } = mockReqRes({
      username: 'integration_user', password: 'securepass', inviteCode: code
    });
    await router._testHandlers.register(regReq, regRes);
    const regData = regBody();
    assert.ok(regData.token);
    const userId = regData.user.id;

    // 3. Login
    const { req: loginReq, res: loginRes, getBody: loginBody } = mockReqRes({
      username: 'integration_user', password: 'securepass'
    });
    await router._testHandlers.login(loginReq, loginRes);
    assert.ok(loginBody().token);

    // 4. Get /me
    const mePayload = verifyToken(regData.token);
    const { req: meReq, res: meRes, getBody: meBody } = mockReqRes();
    meReq.user = { id: mePayload.id, username: mePayload.username };
    router._testHandlers.me(meReq, meRes);
    assert.equal(meBody().username, 'integration_user');
    assert.equal(meBody().apiKeys.hasJpdbKey, false);

    // 5. Update API keys
    const { req: keyReq, res: keyRes, getBody: keyBody } = mockReqRes({
      jpdbApiKey: 'test-jpdb-key', aiApiKey: 'test-ai-key', aiProvider: 'openai'
    });
    keyReq.user = { id: userId };
    router._testHandlers.updateKeys(keyReq, keyRes);
    assert.equal(keyBody().success, true);

    // 6. Verify keys saved (via /me)
    const { req: me2Req, res: me2Res, getBody: me2Body } = mockReqRes();
    me2Req.user = { id: userId };
    router._testHandlers.me(me2Req, me2Res);
    assert.equal(me2Body().apiKeys.hasJpdbKey, true);
    assert.equal(me2Body().apiKeys.hasAiKey, true);
    assert.equal(me2Body().apiKeys.aiProvider, 'openai');
  });
});
