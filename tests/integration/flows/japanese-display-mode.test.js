import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('Japanese display mode flow', () => {
  let client;
  let cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('saves natural and hiragana display modes on the current player meta', async () => {
    await client.loginAsNewUser('display-mode-user', 'display-pass-123');
    await client.createPlayer('DisplayMode');

    const naturalRes = await client.post('/api/game/japanese-display-mode', { mode: 'natural' });
    assert.equal(naturalRes.status, 200);
    assert.equal(naturalRes.body.ok, true);
    assert.equal(naturalRes.body.japaneseDisplayMode, 'natural');
    assert.equal(naturalRes.body.kanaMode, false);
    assert.equal(naturalRes.body.state.meta.japaneseDisplayMode, 'natural');
    assert.equal(naturalRes.body.state.meta.kanaMode, false);

    const persistedNatural = await client.getState();
    assert.equal(persistedNatural.status, 200);
    assert.equal(persistedNatural.body.meta.japaneseDisplayMode, 'natural');
    assert.equal(persistedNatural.body.meta.kanaMode, false);

    const hiraganaRes = await client.post('/api/game/japanese-display-mode', { mode: 'hiragana' });
    assert.equal(hiraganaRes.status, 200);
    assert.equal(hiraganaRes.body.ok, true);
    assert.equal(hiraganaRes.body.japaneseDisplayMode, 'hiragana');
    assert.equal(hiraganaRes.body.kanaMode, true);
    assert.equal(hiraganaRes.body.state.meta.japaneseDisplayMode, 'hiragana');
    assert.equal(hiraganaRes.body.state.meta.kanaMode, true);
  });

  it('rejects invalid display modes without changing the saved mode', async () => {
    await client.loginAsNewUser('display-mode-bad', 'display-pass-123');
    await client.createPlayer('DisplayModeInvalid');

    const initial = await client.post('/api/game/japanese-display-mode', { mode: 'natural' });
    assert.equal(initial.status, 200);

    const invalid = await client.post('/api/game/japanese-display-mode', { mode: 'katakana' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'Invalid Japanese display mode');

    const state = await client.getState();
    assert.equal(state.status, 200);
    assert.equal(state.body.meta.japaneseDisplayMode, 'natural');
    assert.equal(state.body.meta.kanaMode, false);
  });
});
