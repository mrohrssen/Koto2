import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { DialogueTranslationCache } from '../../../src/dialogue-translation/cache.js';
import { getManager, clearManagersForTest } from '../../../src/game/manager-registry.js';

describe('POST /api/dialogue/translate', () => {
  afterEach(() => {
    clearManagersForTest();
  });

  function fundTestUser(crystals = 100) {
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = crystals;
    return gm;
  }

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
    fundTestUser();

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'cached:wait' })
      .expect(200);

    assert.deepEqual(res.body, {
      ok: true,
      translation: 'Wait!',
      entities: [],
      cached: true,
      crystals: { cost: 5, charged: true, alreadyCharged: false, balance: 95 }
    });
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
    fundTestUser();

    const first = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '行こう。', idempotencyKey: 'generate:go' })
      .expect(200);

    const second = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '行こう。', idempotencyKey: 'generate:go' })
      .expect(200);

    assert.deepEqual(first.body, {
      ok: true,
      translation: "Let's go.",
      entities: [],
      cached: false,
      crystals: { cost: 5, charged: true, alreadyCharged: false, balance: 95 }
    });
    assert.deepEqual(second.body, {
      ok: true,
      translation: "Let's go.",
      entities: [],
      cached: true,
      crystals: { cost: 5, charged: false, alreadyCharged: true, balance: 95 }
    });
    assert.equal(calls, 1);
  });

  it('passes protected entities through to the translation service and returns spans', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: cache,
        dialogueTranslationChatFn: async () => '[[entity:hana|Flower]] is strong!',
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    fundTestUser();

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({
        text: '花は強い！',
        entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }],
        idempotencyKey: 'entity:hana'
      })
      .expect(200);

    assert.deepEqual(res.body, {
      ok: true,
      translation: 'Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }],
      cached: false,
      crystals: { cost: 5, charged: true, alreadyCharged: false, balance: 95 }
    });
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
    fundTestUser();

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'missing-config:wait' })
      .expect(503);

    assert.deepEqual(res.body, { ok: false, error: 'translation_unavailable' });
  });

  it('charges 5 crystals after a successful translation', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    const gm = fundTestUser(20);

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.translation, 'Wait!');
    assert.deepEqual(res.body.crystals, {
      cost: 5,
      charged: true,
      alreadyCharged: false,
      balance: 15
    });
    assert.equal(gm.meta.crystals, 15);
  });

  it('does not charge translation when the translation service is unavailable', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => null
      }
    });
    const gm = fundTestUser(20);

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(503);

    assert.deepEqual(res.body, { ok: false, error: 'translation_unavailable' });
    assert.equal(gm.meta.crystals, 20);
  });

  it('does not double-charge repeat translation taps for the same idempotency key', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => 'Wait!',
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    const gm = fundTestUser(20);

    await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(200);

    const second = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(200);

    assert.deepEqual(second.body.crystals, {
      cost: 5,
      charged: false,
      alreadyCharged: true,
      balance: 15
    });
    assert.equal(gm.meta.crystals, 15);
  });

  it('rejects translation before calling AI when crystals are insufficient', async () => {
    let called = false;
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueTranslationCache: new DialogueTranslationCache({ inMemory: true }),
        dialogueTranslationChatFn: async () => { called = true; return 'Wait!'; },
        getDialogueTranslationConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    fundTestUser(4);

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({ text: '待って！', idempotencyKey: 'encounter-1:page-0' })
      .expect(402);

    assert.deepEqual(res.body, {
      ok: false,
      error: 'insufficient_crystals',
      cost: 5,
      balance: 4
    });
    assert.equal(called, false);
  });
});
