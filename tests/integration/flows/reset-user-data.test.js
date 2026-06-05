import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { configureSrs, createCard, getDeckCards } from '../../../src/game/internal-srs.js';
import { createWordKnowledge, registerExposure, saveWordKnowledge } from '../../../src/game/bootstrap/word-knowledge.js';

describe('reset user data flow', () => {
  let client, cleanup, tmpDir;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    tmpDir = testApp.tmpDir;
    configureSrs({ dataDir: tmpDir });
  });

  afterEach(() => cleanup());

  it('resets progress for the authenticated user while preserving login and settings', async () => {
    const registerRes = await client.post('/api/auth/register', {
      username: 'reset-flow-user',
      password: 'reset-pass-123',
      inviteCode: 'neo-tokyo-friends',
      aiDataSharingConsent: true
    });
    assert.equal(registerRes.status, 200);
    const userId = registerRes.body.user.id;
    client.setToken(registerRes.body.token);

    const keyRes = await client.put('/api/auth/api-keys', { jlptLevel: 'N3' });
    assert.equal(keyRes.status, 200);

    const createPlayerRes = await client.createPlayer('ResetFlow');
    assert.equal(createPlayerRes.status, 200);
    createCard(userId, 'vocab', '森', { word: '森' });
    const wordKnowledge = createWordKnowledge(userId);
    registerExposure(wordKnowledge, '森');
    saveWordKnowledge(wordKnowledge);
    writeFileSync(join(tmpDir, 'npc-memory-' + userId + '.json'), JSON.stringify({ npc: true }));
    writeFileSync(join(tmpDir, '.jrpg-word-tracking.json'), JSON.stringify({
      [userId]: { today: { date: '2026-04-29', count: 4 }, weekly: 4, lifetime: 4 }
    }));

    const resetRes = await client.post('/api/game/reset-user-data', {});

    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);
    assert.equal(resetRes.body.state.phase, 'no_save');
    assert.equal(resetRes.body.state.player, null);

    const stateRes = await client.getState();
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.body.phase, 'no_save');
    assert.equal(stateRes.body.player, null);

    assert.equal(existsSync(join(tmpDir, `.jrpg-save-${userId}.json`)), false);
    assert.equal(existsSync(join(tmpDir, `word-knowledge-${userId}.json`)), false);
    assert.equal(existsSync(join(tmpDir, `npc-memory-${userId}.json`)), false);
    assert.equal(getDeckCards(userId, 'vocab').length, 0);
    const tracking = JSON.parse(readFileSync(join(tmpDir, '.jrpg-word-tracking.json'), 'utf-8'));
    assert.equal(tracking[userId], undefined);

    const meRes = await client.get('/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.username, 'reset-flow-user');
    assert.deepEqual(meRes.body.apiKeys, {
      jlptLevel: 'N3',
      aiDataSharingConsent: true
    });
  });
});
