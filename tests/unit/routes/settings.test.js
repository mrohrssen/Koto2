import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../../src/app.js';
import { resetDataDirForTest } from '../../../src/data-dir.js';
import { signToken } from '../../../src/auth/middleware.js';

function authHeader(username) {
  return { Authorization: `Bearer ${signToken({ id: `u-${username}`, username })}` };
}

describe('settings routes App Store readiness', () => {
  let originalNodeEnv;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    resetDataDirForTest();
  });

  it('does not expose debug super attack through public settings', async () => {
    const settings = { debugSuperAttack: false, voiceGender: 'boy' };
    let savedSettings = null;
    const app = createApp({
      routeOverrides: {
        getSettings: () => settings,
        saveSettings: (next) => { savedSettings = { ...next }; }
      }
    });

    const getRes = await request(app).get('/api/settings').expect(200);
    assert.equal(Object.hasOwn(getRes.body, 'debugSuperAttack'), false);

    await request(app)
      .post('/api/settings')
      .send({ debugSuperAttack: true, voiceGender: 'girl' })
      .expect(200);

    assert.equal(settings.debugSuperAttack, false);
    assert.equal(savedSettings.debugSuperAttack, false);
    assert.equal(savedSettings.voiceGender, 'girl');
  });

  it('exposes and saves debug super attack only for allowlisted usernames', async () => {
    const settings = {
      debugSuperAttack: true,
      debugSuperAttackByUsername: { michia: false },
      voiceGender: 'boy'
    };
    let savedSettings = null;
    const app = createApp({
      routeOverrides: {
        getSettings: () => settings,
        saveSettings: (next) => { savedSettings = { ...next }; }
      }
    });

    const regularGet = await request(app)
      .get('/api/settings')
      .set(authHeader('newplayer'))
      .expect(200);
    assert.equal(Object.hasOwn(regularGet.body, 'debugSuperAttack'), false);

    await request(app)
      .post('/api/settings')
      .set(authHeader('newplayer'))
      .send({ debugSuperAttack: true })
      .expect(200);
    assert.equal(savedSettings.debugSuperAttackByUsername.michia, false);

    const allowlistedGet = await request(app)
      .get('/api/settings')
      .set(authHeader('michia'))
      .expect(200);
    assert.equal(allowlistedGet.body.debugSuperAttack, false);

    await request(app)
      .post('/api/settings')
      .set(authHeader('michia'))
      .send({ debugSuperAttack: true })
      .expect(200);
    assert.equal(settings.debugSuperAttackByUsername.michia, true);
    assert.equal(savedSettings.debugSuperAttackByUsername.michia, true);

    const capitalizedGet = await request(app)
      .get('/api/settings')
      .set(authHeader('Michia'))
      .expect(200);
    assert.equal(capitalizedGet.body.debugSuperAttack, true);
  });

  it('does not expose or save global TTS volume', async () => {
    const settings = {
      gameTtsEnabled: true,
      gameTtsSpeakerId: 13,
      gameTtsSpeed: 0.9,
      gameTtsVolume: 0.2,
      voiceGender: 'boy'
    };
    let savedSettings = null;
    const app = createApp({
      routeOverrides: {
        getSettings: () => settings,
        saveSettings: (next) => { savedSettings = { ...next }; }
      }
    });

    const getRes = await request(app).get('/api/settings').expect(200);
    assert.equal(Object.hasOwn(getRes.body, 'gameTtsVolume'), false);

    await request(app)
      .post('/api/settings')
      .send({ gameTtsVolume: 0.9 })
      .expect(200);

    assert.equal(savedSettings.gameTtsVolume, 0.2);
  });

  it('does not expose debug game routes in production', async () => {
    process.env.NODE_ENV = 'production';
    const dataDir = mkdtempSync(join(tmpdir(), 'koto-debug-routes-'));
    try {
      const app = createApp({ dataDir, usersFile: join(dataDir, '.jrpg-users.json') });
      const register = await request(app)
        .post('/api/auth/register')
        .field('username', 'debuguser')
        .field('password', 'pass123')
        .field('aiDataSharingConsent', 'true')
        .expect(200);

      await request(app)
        .post('/api/game/debug-mode')
        .set('Authorization', `Bearer ${register.body.token}`)
        .send({ enabled: true })
        .expect(404);

      await request(app)
        .post('/api/game/fusion/debug-add-core')
        .set('Authorization', `Bearer ${register.body.token}`)
        .send({})
        .expect(404);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
