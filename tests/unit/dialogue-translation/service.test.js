import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueTranslationCache } from '../../../src/dialogue-translation/cache.js';
import {
  buildDialogueTranslationConfig,
  buildEntitySignature,
  buildDialogueTranslationPrompts,
  normalizeDialogueEntities,
  parseEntityMarkedTranslation,
  sanitizeTranslationOutput,
  translateDialogueText,
} from '../../../src/dialogue-translation/service.js';

const ORIGINAL_ENV = { ...process.env };

describe('dialogue translation service', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('builds master config from DIALOGUE_TRANSLATION_* env vars', () => {
    process.env.DIALOGUE_TRANSLATION_PROVIDER = 'openrouter';
    process.env.DIALOGUE_TRANSLATION_API_KEY = 'test-key';
    process.env.DIALOGUE_TRANSLATION_MODEL = 'anthropic/claude-sonnet-4.5';

    assert.deepEqual(buildDialogueTranslationConfig(), {
      provider: 'openrouter',
      apiKey: 'test-key',
      model: 'anthropic/claude-sonnet-4.5'
    });
  });

  it('returns null config when provider, key, or model is missing', () => {
    delete process.env.DIALOGUE_TRANSLATION_PROVIDER;
    delete process.env.DIALOGUE_TRANSLATION_API_KEY;
    delete process.env.DIALOGUE_TRANSLATION_MODEL;
    assert.equal(buildDialogueTranslationConfig(), null);
  });

  it('builds concise natural translation prompts', () => {
    const prompts = buildDialogueTranslationPrompts('いまは怖いけど、一緒に行こう。');

    assert.match(prompts.systemPrompt, /Japanese-to-English translator/);
    assert.match(prompts.userPrompt, /Translate the following Japanese dialogue into natural English/);
    assert.match(prompts.userPrompt, /Return only the English translation/);
    assert.match(prompts.userPrompt, /いまは怖いけど、一緒に行こう。/);
  });

  it('normalizes protected dialogue entities from trusted game metadata', () => {
    const entities = normalizeDialogueEntities([
      { id: ' hana ', type: 'creature', surface: ' 花 ', displayName: ' Flower ' },
      { id: '', type: 'creature', surface: '猫', displayName: 'Cat' },
      { id: 'bad', type: 'creature', surface: '犬', displayName: '' },
      { id: 'npc-1', type: 'npc', surface: 'ソラ', displayName: 'Sora' }
    ]);

    assert.deepEqual(entities, [
      { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      { id: 'npc-1', type: 'npc', surface: 'ソラ', displayName: 'Sora' }
    ]);
  });

  it('builds stable order-independent entity signatures', () => {
    const first = buildEntitySignature([
      { id: 'sora', type: 'npc', surface: 'ソラ', displayName: 'Sora' },
      { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }
    ]);
    const second = buildEntitySignature([
      { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      { id: 'sora', type: 'npc', surface: 'ソラ', displayName: 'Sora' }
    ]);

    assert.equal(first, second);
    assert.equal(first, 'creature:hana:花:Flower|npc:sora:ソラ:Sora');
  });

  it('adds protected entity marker rules to translation prompts', () => {
    const prompts = buildDialogueTranslationPrompts('花は強い！', [
      { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }
    ]);

    assert.match(prompts.systemPrompt, /Protected game entity names/);
    assert.match(prompts.userPrompt, /Every listed protected game entity/);
    assert.match(prompts.userPrompt, /花 = \[\[entity:hana\|Flower\]\]/);
  });

  it('sanitizes plain text translation output', () => {
    assert.equal(sanitizeTranslationOutput(' "Let us go." '), 'Let us go.');
    assert.equal(sanitizeTranslationOutput('```text\nLet us go.\n```'), 'Let us go.');
  });

  it('rejects empty or explanatory translation output', () => {
    assert.equal(sanitizeTranslationOutput(''), '');
    assert.equal(sanitizeTranslationOutput('Translation: Let us go.'), '');
    assert.equal(sanitizeTranslationOutput('Here is the translation: Let us go.'), '');
  });

  it('returns cached translation without calling AI', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    cache.set('待って！', 'Wait!', { provider: 'openai', model: 'gpt-5-mini' });
    let called = false;

    const result = await translateDialogueText({
      text: '待って！',
      cache,
      chatFn: async () => { called = true; return 'Do not call'; },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.equal(result.ok, true);
    assert.equal(result.cached, true);
    assert.equal(result.translation, 'Wait!');
    assert.deepEqual(result.entities, []);
    assert.equal(called, false);
  });

  it('calls AI on miss, stores sanitized result, and returns uncached response', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const calls = [];

    const result = await translateDialogueText({
      text: '行こう。',
      cache,
      chatFn: async (args) => {
        calls.push(args);
        return "Let's go.";
      },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.equal(result.ok, true);
    assert.equal(result.cached, false);
    assert.equal(result.translation, "Let's go.");
    assert.deepEqual(result.entities, []);
    assert.equal(cache.get('行こう。').translation, "Let's go.");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].purpose, 'dialogue-translation');
    assert.equal(calls[0].openaiModel, 'gpt-5-mini');
  });

  it('maps configured model by provider family', async () => {
    const providers = [
      ['openai', 'gpt-5-mini', 'openaiModel'],
      ['anthropic', 'claude-sonnet-4-6', 'claudeModel'],
      ['claude', 'claude-sonnet-4-6', 'claudeModel'],
      ['gemini', 'gemini-2.0-flash', 'geminiModel'],
      ['google', 'gemini-2.0-flash', 'geminiModel'],
      ['openrouter', 'anthropic/claude-sonnet-4.5', 'openrouterModel']
    ];

    for (const [provider, model, modelKey] of providers) {
      const cache = new DialogueTranslationCache({ inMemory: true });
      const calls = [];

      await translateDialogueText({
        text: `文-${provider}`,
        cache,
        chatFn: async (args) => { calls.push(args); return 'Sentence.'; },
        config: { provider, apiKey: 'key', model }
      });

      assert.equal(calls[0][modelKey], model, provider);
    }
  });

  it('returns unavailable and does not cache when config is missing or AI output is invalid', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });

    const missingConfig = await translateDialogueText({
      text: '待って！',
      cache,
      chatFn: async () => 'Wait!',
      config: null
    });

    assert.deepEqual(missingConfig, { ok: false, error: 'translation_unavailable' });

    const badOutput = await translateDialogueText({
      text: '待って！',
      cache,
      chatFn: async () => 'Translation: Wait!',
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.deepEqual(badOutput, { ok: false, error: 'translation_unavailable' });
    assert.equal(cache.get('待って！'), null);
  });

  it('retries invalid plain translation output twice before returning a valid translation', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const responses = ['Translation: Wait!', 'Here is the translation: Wait!', 'Wait!'];
    const calls = [];

    const result = await translateDialogueText({
      text: '待って！',
      cache,
      chatFn: async (args) => {
        calls.push(args);
        return responses.shift();
      },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.deepEqual(result, {
      ok: true,
      translation: 'Wait!',
      entities: [],
      cached: false
    });
    assert.equal(calls.length, 3);
  });

  it('gives up after three invalid plain translation outputs', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    let calls = 0;

    const result = await translateDialogueText({
      text: '待って！',
      cache,
      chatFn: async () => {
        calls += 1;
        return 'Translation: Wait!';
      },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.deepEqual(result, { ok: false, error: 'translation_unavailable' });
    assert.equal(calls, 3);
  });

  it('parses valid entity markers into plain text and spans', () => {
    const result = parseEntityMarkedTranslation('Wow, [[entity:hana|Flower]] is strong!', [
      { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }
    ]);

    assert.deepEqual(result, {
      ok: true,
      translation: 'Wow, Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 5, end: 11 }]
    });
  });

  it('rejects malformed, unknown, and mismatched entity markers', () => {
    const entities = [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }];

    assert.deepEqual(parseEntityMarkedTranslation('[[entity:hana|flower]] is strong!', entities), {
      ok: false,
      error: 'translation_unavailable'
    });
    assert.deepEqual(parseEntityMarkedTranslation('[[entity:neko|Cat]] is strong!', entities), {
      ok: false,
      error: 'translation_unavailable'
    });
    assert.deepEqual(parseEntityMarkedTranslation('[[entity:hana|Flower] is strong!', entities), {
      ok: false,
      error: 'translation_unavailable'
    });
  });

  it('rejects output missing required markers when source contains the protected surface', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    let calls = 0;

    const result = await translateDialogueText({
      text: '花は強い！',
      entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }],
      cache,
      chatFn: async () => {
        calls += 1;
        return calls === 1 ? 'Flowers are strong!' : 'Flower is strong!';
      },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.deepEqual(result, { ok: false, error: 'translation_unavailable' });
    assert.equal(calls, 3);
  });

  it('retries validation failures twice and caches when corrected output contains required markers', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const calls = [];

    const result = await translateDialogueText({
      text: '花は強い！',
      entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }],
      cache,
      chatFn: async (args) => {
        calls.push(args);
        return calls.length < 3 ? 'Flowers are strong!' : '[[entity:hana|Flower]] is strong!';
      },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.deepEqual(result, {
      ok: true,
      translation: 'Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }],
      cached: false
    });
    assert.equal(calls.length, 3);
    assert.match(calls[1].messages[0].content, /previous answer did not follow/);
    assert.match(calls[2].messages[0].content, /previous answer did not follow/);
  });
});
