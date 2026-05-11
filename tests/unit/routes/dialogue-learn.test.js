import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { DialogueLearnCache } from '../../../src/dialogue-learn/cache.js';
import { LEARN_LESSON_SCHEMA_VERSION } from '../../../src/dialogue-learn/schema.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';

const tokens = [
  { surface: '花', reading: 'はな', baseForm: '花', pos: 'noun', meaning: 'flower / blossom', entity: true },
  { surface: 'は', reading: 'は', baseForm: 'は', pos: 'particle' },
  { surface: '森', reading: 'もり', baseForm: '森', pos: 'noun', meaning: 'forest' },
  { surface: 'で', reading: 'で', baseForm: 'で', pos: 'particle' },
  { surface: '光', reading: 'ひかり', baseForm: '光', pos: 'noun', meaning: 'light' },
  { surface: 'を', reading: 'を', baseForm: 'を', pos: 'particle' },
  { surface: '見た', reading: 'みた', baseForm: '見る', pos: 'verb', meaning: 'saw' },
  { surface: '。', reading: '。', baseForm: '。', pos: 'punctuation' }
];
const entities = [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }];
const lesson = {
  schemaVersion: LEARN_LESSON_SCHEMA_VERSION,
  sourceText: '花は森で光を見た。',
  pronunciation: { kana: 'はな は もり で ひかり を みた', romaji: 'hana wa mori de hikari o mita' },
  translation: 'Flower saw a light in the forest.',
  breakdown: [
    { kind: 'entity', text: '花', reading: 'はな', meaning: 'Flower, the creature', explanation: 'In this Koto line, 花 refers to the creature named Flower. In ordinary Japanese, 花 means flower / blossom.' },
    { kind: 'particle', text: 'は', reading: 'わ', meaning: 'topic marker', explanation: 'After Flower, は marks who the sentence is about.' },
    { kind: 'phrase', text: '森で', reading: 'もりで', meaning: 'in the forest', explanation: '森 means forest. で marks the place where the action happens.' },
    { kind: 'phrase', text: '光を', reading: 'ひかりを', meaning: 'a light', explanation: '光 is what was seen. を marks the direct object.' },
    { kind: 'verb', text: '見た', reading: 'みた', meaning: 'saw', explanation: '見た is the past form of 見る, to see.' }
  ],
  grammarHints: [{ title: 'Verb goes last.', body: 'Japanese sentences put the verb at the end. Read to the end first to find 見た, saw.' }],
  otherTips: [{ title: 'Entity vs ordinary noun.', body: 'In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom.' }]
};

describe('POST /api/dialogue/learn', () => {
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
        dialogueLearnCache: new DialogueLearnCache({ inMemory: true }),
        dialogueLearnChatFn: async () => JSON.stringify(lesson),
        getDialogueLearnConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities, idempotencyKey: 'learn-1' }).expect(401);
  });

  it('generates and caches a learn lesson', async () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    let calls = 0;
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueLearnCache: cache,
        dialogueLearnChatFn: async () => { calls += 1; return JSON.stringify(lesson); },
        getDialogueLearnConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    fundTestUser();

    const first = await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities, idempotencyKey: 'learn-1' }).expect(200);
    const second = await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities, idempotencyKey: 'learn-1' }).expect(200);

    assert.equal(first.body.ok, true);
    assert.equal(first.body.cached, false);
    assert.equal(first.body.lesson.translation, 'Flower saw a light in the forest.');
    assert.equal(first.body.crystals.cost, 15);
    assert.equal(second.body.cached, true);
    assert.equal(calls, 1);
  });

  it('returns specific diagnostics for empty text, missing tokens, missing key, or missing config', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueLearnCache: new DialogueLearnCache({ inMemory: true }),
        dialogueLearnChatFn: async () => JSON.stringify(lesson),
        getDialogueLearnConfig: () => null
      }
    });
    fundTestUser();

    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: ' ', tokens, entities, idempotencyKey: 'learn-1' }).expect(400)).body, { ok: false, error: 'learn_lesson_invalid_request', reason: 'missing_text' });
    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens: [], entities, idempotencyKey: 'learn-1' }).expect(400)).body, { ok: false, error: 'learn_lesson_invalid_request', reason: 'missing_tokens' });
    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities }).expect(400)).body, { ok: false, error: 'missing_idempotency_key' });
    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities, idempotencyKey: 'learn-1' }).expect(503)).body, { ok: false, error: 'learn_lesson_config_missing', reason: 'missing_config_or_chat' });
  });
});
