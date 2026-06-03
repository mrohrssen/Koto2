import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { hashPassword } from '../../src/auth/crypto.js';
import createAdminAuthRoutes, { adminAuth } from '../../src/routes/admin-auth.js';

describe('admin auth routes', { concurrency: false }, () => {
  const originalEnv = {};

  beforeEach(async () => {
    originalEnv.ADMIN_USER = process.env.ADMIN_USER;
    originalEnv.ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;
    originalEnv.ADMIN_SECRET = process.env.ADMIN_SECRET;
    originalEnv.JWT_SECRET = process.env.JWT_SECRET;

    process.env.ADMIN_USER = 'operator';
    process.env.ADMIN_PASS_HASH = await hashPassword('correct horse battery staple');
    process.env.ADMIN_SECRET = 'legacy-secret';
    process.env.JWT_SECRET = 'unit-test-jwt-secret';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function appWithAuth() {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', createAdminAuthRoutes());
    app.get('/api/admin/protected', adminAuth, (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('logs in with configured admin credentials and exposes the session', async () => {
    const app = appWithAuth();

    const login = await request(app)
      .post('/api/admin/login')
      .send({ username: 'operator', password: 'correct horse battery staple' })
      .expect(200);

    assert.equal(login.body.authenticated, true);
    assert.equal(login.body.username, 'operator');
    assert.match(String(login.headers['set-cookie']?.[0] || ''), /koto_admin=/);
    assert.match(String(login.headers['set-cookie']?.[0] || ''), /(?:^|; )Path=\/(?:;|$)/);

    const session = await request(app)
      .get('/api/admin/session')
      .set('Cookie', login.headers['set-cookie'])
      .expect(200);

    assert.deepEqual(session.body, { authenticated: true, username: 'operator' });
  });

  it('rejects invalid admin credentials without setting a session cookie', async () => {
    const res = await request(appWithAuth())
      .post('/api/admin/login')
      .send({ username: 'operator', password: 'wrong' })
      .expect(401);

    assert.equal(res.body.error, 'Invalid admin credentials');
    assert.equal(res.headers['set-cookie'], undefined);
  });

  it('reports no session when the admin cookie is missing', async () => {
    const res = await request(appWithAuth())
      .get('/api/admin/session')
      .expect(200);

    assert.deepEqual(res.body, { authenticated: false });
  });

  it('clears the admin cookie on logout', async () => {
    const app = appWithAuth();
    const login = await request(app)
      .post('/api/admin/login')
      .send({ username: 'operator', password: 'correct horse battery staple' })
      .expect(200);

    const logout = await request(app)
      .post('/api/admin/logout')
      .set('Cookie', login.headers['set-cookie'])
      .expect(200);

    assert.deepEqual(logout.body, { authenticated: false });
    assert.match(String(logout.headers['set-cookie']?.[0] || ''), /koto_admin=;/);
  });

  it('allows protected admin routes with a valid session cookie', async () => {
    const app = appWithAuth();
    const login = await request(app)
      .post('/api/admin/login')
      .send({ username: 'operator', password: 'correct horse battery staple' })
      .expect(200);

    const res = await request(app)
      .get('/api/admin/protected')
      .set('Cookie', login.headers['set-cookie'])
      .expect(200);

    assert.deepEqual(res.body, { ok: true });
  });

  it('keeps legacy x-admin-secret access for scripts', async () => {
    const res = await request(appWithAuth())
      .get('/api/admin/protected')
      .set('x-admin-secret', 'legacy-secret')
      .expect(200);

    assert.deepEqual(res.body, { ok: true });
  });

  it('rejects protected admin routes without a session or legacy secret', async () => {
    const res = await request(appWithAuth())
      .get('/api/admin/protected')
      .expect(401);

    assert.equal(res.body.error, 'Admin login required');
  });
});
