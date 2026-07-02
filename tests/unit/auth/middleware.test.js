import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Set test secret before importing
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';

import { signToken, verifyToken, requireAuth } from '../../../src/auth/middleware.js';
import { createUserRecord } from '../../../src/auth/users.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';

describe('auth/middleware', () => {
  let dataDir;
  let usersFile;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'koto-auth-middleware-'));
    usersFile = join(dataDir, '.jrpg-users.json');
    setDataDirForTest(dataDir);
    resetDbForTest();
    await createUserRecord({ id: 'u_123', username: 'takeshi', password: 'secret123' });
  });

  afterEach(() => {
    resetDbForTest();
    resetDataDirForTest();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
    usersFile = null;
  });

  describe('signToken / verifyToken', () => {
    it('creates and verifies a valid token', () => {
      const token = signToken({ id: 'u_123', username: 'takeshi' });
      assert.ok(typeof token === 'string');
      assert.ok(token.split('.').length === 3);

      const payload = verifyToken(token);
      assert.equal(payload.id, 'u_123');
      assert.equal(payload.username, 'takeshi');
    });

    it('rejects an invalid token', () => {
      const result = verifyToken('invalid.token.here');
      assert.equal(result, null);
    });

    it('rejects expired token', () => {
      const token = signToken({ id: 'u_123', username: 'test' }, '-1s');
      const result = verifyToken(token);
      assert.equal(result, null);
    });
  });

  describe('requireAuth middleware', () => {
    it('attaches user to req on valid token', () => {
      const token = signToken({ id: 'u_123', username: 'takeshi' });
      const req = {
        headers: { authorization: `Bearer ${token}` },
        app: { locals: { usersFile } },
      };
      const res = { status: () => res, json: () => {} };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      requireAuth(req, res, next);
      assert.equal(nextCalled, true);
      assert.equal(req.user.id, 'u_123');
      assert.equal(req.user.username, 'takeshi');
    });

    it('returns 401 on missing token', () => {
      const req = { headers: {} };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (body) => { responseBody = body; }
      };
      const next = () => {};

      requireAuth(req, res, next);
      assert.equal(statusCode, 401);
      assert.equal(responseBody.error, 'No token provided');
    });

    it('returns 401 on invalid token', () => {
      const req = { headers: { authorization: 'Bearer bad-token' } };
      let statusCode = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: () => {}
      };
      const next = () => {};

      requireAuth(req, res, next);
      assert.equal(statusCode, 401);
    });
  });
});
