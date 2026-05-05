import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { DialogueTranslationCache } from '../../../src/dialogue-translation/cache.js';

describe('POST /api/dialogue/translate', () => {
  it('requires authentication', async () => {
    const app = createApp({
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });

    await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！' })
      .expect(401);
  });

  it('returns cached translations without calling AI', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    cache.set('待って！', 'Wait!', { provider: 'openai', model: 'gpt-5-mini' });
    let called = false;

    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: cache,
        dialogueTranslationChatFn: async () => { called = true; return 'Do not call'; },
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！' })
      .expect(200);

    assert.deepEqual(res.body, { ok: true, translation: 'Wait!', cached: true });
    assert.equal(called, false);
  });

  it('generates and caches translations on miss', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    let calls = 0;

    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: cache,
        dialogueTranslationChatFn: async () => { calls += 1; return "Let's go."; },
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });

    const first = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '行こう。' })
      .expect(200);

    const second = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '行こう。' })
      .expect(200);

    assert.deepEqual(first.body, { ok: true, translation: "Let's go.", cached: false });
    assert.deepEqual(second.body, { ok: true, translation: "Let's go.", cached: true });
    assert.equal(calls, 1);
  });

  it('returns translation_unavailable for empty text without calling AI', async () => {
    let called = false;
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => { called = true; return 'No'; },
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '   ' })
      .expect(400);

    assert.deepEqual(res.body, { ok: false, error: 'translation_unavailable' });
    assert.equal(called, false);
  });

  it('returns translation_unavailable when master config is missing', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => null
      }
    });

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！' })
      .expect(503);

    assert.deepEqual(res.body, { ok: false, error: 'translation_unavailable' });
  });
});
