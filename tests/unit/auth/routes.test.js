import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../../src/app.js';
import { resetDataDirForTest } from '../../../src/data-dir.js';
import { loadUsers } from '../../../src/auth/users.js';

describe('auth routes', { concurrency: false }, () => {
  let dataDir;
  let usersFile;

  beforeEach(() => {
    dataDir = join(tmpdir(), `koto-auth-routes-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dataDir, { recursive: true });
    usersFile = join(dataDir, '.jrpg-users.json');
  });

  afterEach(() => {
    resetDataDirForTest();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('registers a user without an invite code when AI consent is accepted', async () => {
    const app = createApp({ dataDir, usersFile });

    const res = await request(app)
      .post('/api/auth/register')
      .field('username', 'reviewer')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    assert.equal(res.body.user.username, 'reviewer');
    assert.ok(res.body.token);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
    assert.equal(me.body.apiKeys.aiDataSharingConsent, true);
  });

  it('requires AI data-sharing consent to register', async () => {
    const app = createApp({ dataDir, usersFile });

    await request(app)
      .post('/api/auth/register')
      .field('username', 'noconsent')
      .field('password', 'pass123')
      .expect(400);

    assert.equal(loadUsers(usersFile).users.length, 0);
  });

  it('deletes the signed-in user account and associated data files', async () => {
    const app = createApp({ dataDir, usersFile });

    const register = await request(app)
      .post('/api/auth/register')
      .field('username', 'deleteme')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    const userId = register.body.user.id;
    writeFileSync(join(dataDir, `save-${userId}.json`), '{}');
    writeFileSync(join(dataDir, `npc-memory-${userId}.json`), '{}');

    const reportDir = join(dataDir, 'bug-reports', 'report-one');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'report.json'), JSON.stringify({ userId, note: 'delete me' }));

    const res = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ password: 'pass123' })
      .expect(200);

    assert.deepEqual(res.body, {
      success: true,
      deletedUserId: userId,
      deletedFiles: [`npc-memory-${userId}.json`, `save-${userId}.json`],
      deletedBugReports: ['report-one']
    });
    assert.equal(loadUsers(usersFile).users.length, 0);
    assert.equal(existsSync(join(dataDir, `save-${userId}.json`)), false);
    assert.equal(existsSync(join(dataDir, `npc-memory-${userId}.json`)), false);
    assert.equal(existsSync(reportDir), false);
  });

  it('rejects the old token after account deletion', async () => {
    const app = createApp({ dataDir, usersFile });

    const register = await request(app)
      .post('/api/auth/register')
      .field('username', 'revoked')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ password: 'pass123' })
      .expect(200);

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .expect(401);

    await request(app)
      .get('/api/game/state')
      .set('Authorization', `Bearer ${register.body.token}`)
      .expect(401);

    await request(app)
      .post('/api/dialogue/translate')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ text: 'こんにちは。', idempotencyKey: 'deleted-token-translate' })
      .expect(401);
  });

  it('requires the current password before deleting an account', async () => {
    const app = createApp({ dataDir, usersFile });

    const register = await request(app)
      .post('/api/auth/register')
      .field('username', 'keepme')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ password: 'wrong-password' })
      .expect(401);

    const users = loadUsers(usersFile).users;
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'keepme');
  });

  it('rejects direct AI key saves without data-sharing consent', async () => {
    const app = createApp({ dataDir, usersFile });

    const register = await request(app)
      .post('/api/auth/register')
      .field('username', 'aiconsent')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    await request(app)
      .put('/api/auth/api-keys')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ aiProvider: 'openai', aiApiKey: 'sk-test', aiDataSharingConsent: false })
      .expect(400);

    await request(app)
      .put('/api/auth/api-keys')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({ aiProvider: 'openai', aiApiKey: 'sk-test', aiDataSharingConsent: true })
      .expect(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .expect(200);
    assert.equal(me.body.apiKeys.aiDataSharingConsent, true);
  });
});
