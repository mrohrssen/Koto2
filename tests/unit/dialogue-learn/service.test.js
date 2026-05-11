import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueLearnCache } from '../../../src/dialogue-learn/cache.js';
import { LEARN_LESSON_SCHEMA_VERSION } from '../../../src/dialogue-learn/schema.js';
import { logger } from '../../../src/logger.js';
import {
  buildDialogueLearnConfig,
  buildDialogueLearnPrompts,
  generateDialogueLearnLesson
} from '../../../src/dialogue-learn/service.js';

const ORIGINAL_ENV = { ...process.env };
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

function lesson() {
  return {
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
}

describe('dialogue learn service', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('builds master config from DIALOGUE_LEARN_* env vars', () => {
    process.env.DIALOGUE_LEARN_PROVIDER = 'openai';
    process.env.DIALOGUE_LEARN_API_KEY = 'key';
    process.env.DIALOGUE_LEARN_MODEL = 'gpt-5-mini';
    assert.deepEqual(buildDialogueLearnConfig(), { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' });
  });

  it('returns null config when provider, key, or model is missing', () => {
    delete process.env.DIALOGUE_LEARN_PROVIDER;
    delete process.env.DIALOGUE_LEARN_API_KEY;
    delete process.env.DIALOGUE_LEARN_MODEL;
    assert.equal(buildDialogueLearnConfig(), null);
  });

  it('builds game-context JSON prompts with parser hints and flexible breakdown schema', () => {
    const prompts = buildDialogueLearnPrompts({ sourceText: '花は森で光を見た。', tokens, entities });
    assert.match(prompts.systemPrompt, /Koto, a Japanese vocabulary-learning RPG/);
    assert.match(prompts.systemPrompt, /game UI/);
    assert.match(prompts.systemPrompt, /Return only valid JSON/);
    assert.match(prompts.userPrompt, /parser hints are context only/i);
    assert.match(prompts.userPrompt, /Parser hints/);
    assert.doesNotMatch(prompts.userPrompt, /Trusted tokens/);
    assert.match(prompts.userPrompt, /schemaVersion/);
    assert.match(prompts.userPrompt, /breakdown/);
    assert.match(prompts.userPrompt, /花は森で光を見た。/);
    assert.match(prompts.userPrompt, /Flower/);
    assert.match(prompts.userPrompt, /Do not introduce new Japanese example sentences/);
  });

  it('returns cached lesson without calling AI', async () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    const key = DialogueLearnCache.keyFor('花は森で光を見た。', 'creature:hana:花:Flower:flower / blossom', LEARN_LESSON_SCHEMA_VERSION);
    cache.set(key, lesson(), { sourceText: '花は森で光を見た。', entitySignature: 'creature:hana:花:Flower:flower / blossom' });
    let called = false;
    const result = await generateDialogueLearnLesson({
      text: '花は森で光を見た。',
      tokens,
      entities,
      cache,
      chatFn: async () => { called = true; return '{}'; },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });
    assert.equal(result.ok, true);
    assert.equal(result.cached, true);
    assert.equal(result.lesson.translation, 'Flower saw a light in the forest.');
    assert.equal(called, false);
  });

  it('generates, validates, and caches lesson JSON on miss', async () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    const calls = [];
    const result = await generateDialogueLearnLesson({
      text: '花は森で光を見た。',
      tokens,
      entities,
      cache,
      chatFn: async (args) => { calls.push(args); return JSON.stringify(lesson()); },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });
    assert.equal(result.ok, true);
    assert.equal(result.cached, false);
    assert.equal(result.lesson.translation, 'Flower saw a light in the forest.');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].purpose, 'dialogue-learn');
    assert.equal(calls[0].openaiModel, 'gpt-5-mini');
  });

  it('fails closed with specific diagnostics for empty text, missing tokens, missing config, and invalid AI output', async () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    const warnMock = mock.method(logger, 'warn', () => {});
    assert.deepEqual(await generateDialogueLearnLesson({ text: '', tokens, entities, cache, chatFn: async () => '{}', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_invalid_request', reason: 'missing_text' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens: [], entities, cache, chatFn: async () => '{}', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_invalid_request', reason: 'missing_tokens' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens, entities, cache, chatFn: async () => JSON.stringify(lesson()), config: null }), { ok: false, error: 'learn_lesson_config_missing', reason: 'missing_config_or_chat' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens, entities, cache, chatFn: async () => '```json\n{}\n```', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_parse_failed', reason: 'invalid_json' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens, entities, cache, chatFn: async () => '{"bad":true}', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_validation_failed', reason: 'top_level_keys' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens, entities, cache, chatFn: async () => { throw new Error('provider exploded'); }, config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_generation_failed', reason: 'provider_error' });
    assert.equal(warnMock.mock.callCount(), 2);
  });
});
