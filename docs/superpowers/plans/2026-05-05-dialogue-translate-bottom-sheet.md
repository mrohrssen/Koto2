# Dialogue Translate Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dialogue-card `Translate` button open a bottom sheet that returns a natural English translation from a global exact-text cache, backed by a master AI provider configuration.

**Architecture:** Add a focused server-side translation service with a persistent global JSON cache, an authenticated `/api/dialogue/translate` route, and a small client API helper. The NPC dialogue card derives exact Japanese source text from the current token page, opens a transient bottom sheet, and calls the server without advancing dialogue state.

**Tech Stack:** Express, ES modules, Node `node:test`, existing `chat()` AI provider helper, browser DOM APIs, `public/game.css`, Vite dev server for visual verification.

---

## File Structure

- Create `src/dialogue-translation/cache.js`: global exact-text translation cache, persisted with `dataPath('dialogue-translation-cache.json')`.
- Create `src/dialogue-translation/service.js`: prompt construction, env config parsing, cache-first translation flow, output sanitization.
- Create `src/routes/dialogue.js`: authenticated `/api/dialogue/translate` route.
- Modify `src/routes/index.js`: mount `/api/dialogue`.
- Modify `src/app.js`: add default route dependencies for dialogue translation.
- Modify `src/ai-providers.js`: allow Gemini model override and lower temperature for `purpose: 'dialogue-translation'`.
- Modify `.env.example`: document `DIALOGUE_TRANSLATION_*`.
- Modify `public/js/api.js`: export `translateDialogue(text)`.
- Modify `public/js/ui/npc-dialogue-card.js`: derive source text, enable `Translate`, render bottom sheet states, call `translateDialogue()`.
- Modify `public/game.css`: add bottom sheet styling.
- Add tests under `tests/unit/dialogue-translation/`, `tests/unit/routes/`, and update `tests/unit/ui/npc-dialogue-card.test.js`.

## Task 1: Global Translation Cache

**Files:**
- Create: `src/dialogue-translation/cache.js`
- Test: `tests/unit/dialogue-translation/cache.test.js`

- [ ] **Step 1: Write failing cache tests**

Create `tests/unit/dialogue-translation/cache.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { DialogueTranslationCache } from '../../../src/dialogue-translation/cache.js';

describe('DialogueTranslationCache', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dialogue-translation-cache-'));
    setDataDirForTest(tempDir);
  });

  afterEach(() => {
    resetDataDirForTest();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for missing exact text', () => {
    const cache = new DialogueTranslationCache();
    assert.equal(cache.get('いまは怖いけど、一緒に行こう。'), null);
  });

  it('stores and retrieves by exact Japanese text', () => {
    const cache = new DialogueTranslationCache();
    const entry = cache.set('いまは怖いけど、一緒に行こう。', 'It is scary right now, but let us go together.', {
      provider: 'openai',
      model: 'gpt-5-mini'
    });

    assert.equal(entry.sourceText, 'いまは怖いけど、一緒に行こう。');
    assert.equal(entry.translation, 'It is scary right now, but let us go together.');
    assert.equal(entry.provider, 'openai');
    assert.equal(entry.model, 'gpt-5-mini');
    assert.ok(entry.createdAt);
    assert.ok(entry.updatedAt);

    const cached = cache.get('いまは怖いけど、一緒に行こう。');
    assert.equal(cached.translation, 'It is scary right now, but let us go together.');
  });

  it('persists entries to the app data directory', () => {
    const cache = new DialogueTranslationCache();
    cache.set('待って！', 'Wait!', { provider: 'anthropic', model: 'claude-sonnet-4-6' });

    const filePath = join(tempDir, 'dialogue-translation-cache.json');
    assert.equal(existsSync(filePath), true);

    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(raw['待って！'].translation, 'Wait!');

    const reloaded = new DialogueTranslationCache();
    assert.equal(reloaded.get('待って！').translation, 'Wait!');
  });

  it('preserves createdAt when overwriting an existing translation', () => {
    const cache = new DialogueTranslationCache();
    const first = cache.set('行こう。', 'Let us go.', { provider: 'openai', model: 'gpt-5-mini' });
    const second = cache.set('行こう。', "Let's go.", { provider: 'openrouter', model: 'test/model' });

    assert.equal(second.createdAt, first.createdAt);
    assert.equal(second.translation, "Let's go.");
    assert.equal(second.provider, 'openrouter');
    assert.equal(second.model, 'test/model');
  });

  it('supports in-memory cache for route tests', () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    cache.set('こんにちは。', 'Hello.', { provider: 'gemini', model: 'gemini-2.0-flash' });
    assert.equal(cache.get('こんにちは。').translation, 'Hello.');
    assert.equal(existsSync(join(tempDir, 'dialogue-translation-cache.json')), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/cache.test.js
```

Expected: FAIL with module-not-found for `src/dialogue-translation/cache.js`.

- [ ] **Step 3: Implement cache**

Create `src/dialogue-translation/cache.js`:

```js
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dataPath } from '../data-dir.js';

const DEFAULT_CACHE_FILE = 'dialogue-translation-cache.json';

export class DialogueTranslationCache {
  constructor({ inMemory = false, fileName = DEFAULT_CACHE_FILE } = {}) {
    this._inMemory = inMemory;
    this._filePath = inMemory ? null : dataPath(fileName);
    this._data = {};
    this._load();
  }

  _load() {
    if (this._inMemory || !this._filePath || !existsSync(this._filePath)) return;
    try {
      this._data = JSON.parse(readFileSync(this._filePath, 'utf8'));
    } catch {
      this._data = {};
    }
  }

  _save() {
    if (this._inMemory || !this._filePath) return;
    writeFileSync(this._filePath, JSON.stringify(this._data, null, 2));
  }

  get(sourceText) {
    return this._data[sourceText] || null;
  }

  set(sourceText, translation, { provider = '', model = '' } = {}) {
    const now = new Date().toISOString();
    const previous = this._data[sourceText] || {};
    const entry = {
      sourceText,
      translation,
      provider,
      model,
      createdAt: previous.createdAt || now,
      updatedAt: now
    };

    this._data[sourceText] = entry;
    this._save();
    return entry;
  }

  getAll() {
    return { ...this._data };
  }
}
```

- [ ] **Step 4: Verify cache tests pass**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/cache.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit cache layer**

```bash
git add src/dialogue-translation/cache.js tests/unit/dialogue-translation/cache.test.js
git commit -m "feat(dialogue): add global translation cache"
```

## Task 2: Translation Service And Provider Config

**Files:**
- Create: `src/dialogue-translation/service.js`
- Modify: `src/ai-providers.js`
- Test: `tests/unit/dialogue-translation/service.test.js`
- Test: `tests/unit/ai-providers.test.js` if present; otherwise create `tests/unit/ai-providers.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/dialogue-translation/service.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueTranslationCache } from '../../../src/dialogue-translation/cache.js';
import {
  buildDialogueTranslationConfig,
  buildDialogueTranslationPrompts,
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
});
```

- [ ] **Step 2: Write failing AI provider test for Gemini model override and translation purpose**

Create `tests/unit/ai-providers.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const modelCalls = [];
const openAiCalls = [];

await mock.module('@google/generative-ai', {
  namedExports: {
    GoogleGenerativeAI: class {
      constructor(apiKey) { this.apiKey = apiKey; }
      getGenerativeModel(args) {
        modelCalls.push(args);
        return {
          startChat() {
            return {
              async sendMessage() {
                return {
                  response: {
                    text: () => 'Hello.',
                    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 }
                  }
                };
              }
            };
          }
        };
      }
    }
  }
});

await mock.module('openai', {
  default: class {
    constructor(args) { this.args = args; }
    chat = {
      completions: {
        create: async (params) => {
          openAiCalls.push(params);
          return {
            choices: [{ message: { content: 'Hello.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 1 }
          };
        }
      }
    };
  }
});

await mock.module('@anthropic-ai/sdk', {
  default: class {
    messages = {
      create: async () => ({
        content: [{ text: 'Hello.' }],
        usage: { input_tokens: 2, output_tokens: 1 }
      })
    };
  }
});

const { chat } = await import('../../src/ai-providers.js');

describe('ai provider model routing', () => {
  it('passes configured Gemini model into GoogleGenerativeAI', async () => {
    const result = await chat({
      provider: 'gemini',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'こんにちは。' }],
      customSystemPrompt: 'Translate.',
      geminiModel: 'gemini-2.0-flash',
      purpose: 'dialogue-translation'
    });

    assert.equal(result, 'Hello.');
    assert.equal(modelCalls.at(-1).model, 'gemini-2.0-flash');
  });

  it('uses low temperature for non-reasoning OpenAI dialogue translation calls', async () => {
    await chat({
      provider: 'openai',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'こんにちは。' }],
      customSystemPrompt: 'Translate.',
      openaiModel: 'gpt-4o-mini',
      purpose: 'dialogue-translation'
    });

    assert.equal(openAiCalls.at(-1).temperature, 0.1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/service.test.js tests/unit/ai-providers.test.js
```

Expected: FAIL because `service.js` does not exist and `chat()` does not accept `geminiModel` yet.

- [ ] **Step 4: Implement translation service**

Create `src/dialogue-translation/service.js`:

```js
import { logger } from '../logger.js';

export const TRANSLATION_UNAVAILABLE = 'translation_unavailable';

export function buildDialogueTranslationConfig(env = process.env) {
  const provider = env.DIALOGUE_TRANSLATION_PROVIDER?.trim();
  const apiKey = env.DIALOGUE_TRANSLATION_API_KEY?.trim();
  const model = env.DIALOGUE_TRANSLATION_MODEL?.trim();

  if (!provider || !apiKey || !model) return null;
  return { provider, apiKey, model };
}

export function buildDialogueTranslationPrompts(sentence) {
  return {
    systemPrompt: 'You are a careful Japanese-to-English translator for a language-learning RPG. Produce accurate, natural English translations without commentary.',
    userPrompt: `Translate the following Japanese dialogue into natural English.

Rules:
- Preserve the meaning and tone.
- Return only the English translation.
- Do not include explanations, romanization, quotation marks, alternatives, or notes.

Japanese:
${sentence}`
  };
}

export function sanitizeTranslationOutput(output) {
  let text = String(output || '').trim();
  if (!text) return '';

  text = text.replace(/^```(?:text|plain|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  text = text.replace(/^["“”']+|["“”']+$/g, '').trim();

  if (!text) return '';
  if (/^(translation|english|natural english|note|explanation)\s*:/i.test(text)) return '';
  if (/^here(?:'s| is)\b/i.test(text)) return '';
  if (/\n\s*(note|explanation|alternative|literal)\s*:/i.test(text)) return '';

  return text;
}

function modelArgsForProvider(provider, model) {
  switch ((provider || '').toLowerCase()) {
    case 'openai':
      return { openaiModel: model };
    case 'anthropic':
    case 'claude':
      return { claudeModel: model };
    case 'gemini':
    case 'google':
      return { geminiModel: model };
    case 'openrouter':
      return { openrouterModel: model };
    default:
      return {};
  }
}

export async function translateDialogueText({
  text,
  cache,
  chatFn,
  config = buildDialogueTranslationConfig()
}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const cached = cache.get(sourceText);
  if (cached?.translation) {
    return { ok: true, translation: cached.translation, cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const { systemPrompt, userPrompt } = buildDialogueTranslationPrompts(sourceText);

  try {
    const raw = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      purpose: 'dialogue-translation',
      ...modelArgsForProvider(config.provider, config.model)
    });

    const translation = sanitizeTranslationOutput(raw);
    if (!translation) {
      return { ok: false, error: TRANSLATION_UNAVAILABLE };
    }

    cache.set(sourceText, translation, {
      provider: config.provider,
      model: config.model
    });

    return { ok: true, translation, cached: false };
  } catch (error) {
    logger.warn('[DialogueTranslation] Translation failed:', error.message);
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }
}
```

- [ ] **Step 5: Modify `src/ai-providers.js` for Gemini model and low translation temperature**

Update function signatures and routing:

```js
async function chatWithOpenAI(apiKey, messages, systemPrompt, model, purpose = 'other') {
  const client = new OpenAI({ apiKey });

  const modelId = model || 'gpt-5-mini';
  const isReasoningModel = modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4') || modelId.startsWith('gpt-5');

  const params = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ]
  };

  if (isReasoningModel) {
    params.max_completion_tokens = 10000;
  } else {
    params.temperature = purpose === 'dialogue-translation' ? 0.1 : 0.7;
    params.max_tokens = purpose === 'dialogue-translation' ? 120 : 500;
  }

  const response = await client.chat.completions.create(params);
  // keep the existing response handling below this point
}
```

Update Gemini helper:

```js
async function chatWithGemini(apiKey, messages, systemPrompt, model) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = model || 'gemini-1.5-flash';
  const geminiModel = genAI.getGenerativeModel({ model: modelId });

  const chat = geminiModel.startChat({
    history: messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    systemInstruction: systemPrompt
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage?.content || 'Hello');

  const meta = result.response.usageMetadata;
  const usage = meta ? {
    inputTokens: meta.promptTokenCount || 0,
    outputTokens: meta.candidatesTokenCount || 0
  } : null;

  return { text: result.response.text(), usage };
}
```

Update `chat()` parameters and routing:

```js
export async function chat({
  provider,
  apiKey,
  messages,
  openrouterModel,
  openaiModel,
  claudeModel,
  geminiModel,
  customSystemPrompt,
  systemBlocks,
  purpose = 'other',
  returnUsage = false
}) {
  // existing validation stays
```

Update model selection:

```js
switch (provider.toLowerCase()) {
  case 'openai': model = openaiModel || 'gpt-5-mini'; break;
  case 'claude':
  case 'anthropic': model = claudeModel || 'claude-sonnet-4-6'; break;
  case 'gemini':
  case 'google': model = geminiModel || 'gemini-1.5-flash'; break;
  case 'openrouter': model = openrouterModel || 'unknown-openrouter'; break;
  default: model = 'unknown';
}
```

Update provider calls:

```js
case 'openai':
  providerResult = await chatWithOpenAI(apiKey, messages, systemPrompt, openaiModel, purpose);
  break;
// ...
case 'gemini':
case 'google':
  providerResult = await chatWithGemini(apiKey, messages, systemPrompt, geminiModel);
  break;
```

- [ ] **Step 6: Verify service and provider tests pass**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/service.test.js tests/unit/ai-providers.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit service/provider work**

```bash
git add src/dialogue-translation/service.js src/ai-providers.js tests/unit/dialogue-translation/service.test.js tests/unit/ai-providers.test.js
git commit -m "feat(dialogue): add translation service"
```

## Task 3: Translation Route

**Files:**
- Create: `src/routes/dialogue.js`
- Modify: `src/routes/index.js`
- Modify: `src/app.js`
- Test: `tests/unit/routes/dialogue-translate.test.js`

- [ ] **Step 1: Write failing route tests**

Create `tests/unit/routes/dialogue-translate.test.js`:

```js
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
```

- [ ] **Step 2: Run route test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-translate.test.js
```

Expected: FAIL because route module is not mounted.

- [ ] **Step 3: Implement route module**

Create `src/routes/dialogue.js`:

```js
import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { chat } from '../ai-providers.js';
import { DialogueTranslationCache } from '../dialogue-translation/cache.js';
import {
  TRANSLATION_UNAVAILABLE,
  buildDialogueTranslationConfig,
  translateDialogueText
} from '../dialogue-translation/service.js';

export default function createDialogueRoutes({
  dialogueTranslationCache = new DialogueTranslationCache(),
  dialogueTranslationChatFn = chat,
  getDialogueTranslationConfig = buildDialogueTranslationConfig
} = {}) {
  const router = Router();

  router.use(requireAuth);

  router.post('/translate', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: TRANSLATION_UNAVAILABLE });
    }

    const result = await translateDialogueText({
      text,
      cache: dialogueTranslationCache,
      chatFn: dialogueTranslationChatFn,
      config: getDialogueTranslationConfig()
    });

    if (!result.ok) {
      return res.status(503).json(result);
    }

    return res.json(result);
  });

  return router;
}
```

- [ ] **Step 4: Mount route and defaults**

Modify `src/routes/index.js` imports:

```js
import createDialogueRoutes from './dialogue.js';
```

Mount after vocab routes and before game routes:

```js
  // Dialogue routes: /api/dialogue/*
  router.use('/dialogue', createDialogueRoutes({
    dialogueTranslationCache: deps.dialogueTranslationCache,
    dialogueTranslationChatFn: deps.dialogueTranslationChatFn,
    getDialogueTranslationConfig: deps.getDialogueTranslationConfig
  }));
```

Modify `src/app.js` imports:

```js
import { chat } from './ai-providers.js';
import { DialogueTranslationCache } from './dialogue-translation/cache.js';
import { buildDialogueTranslationConfig } from './dialogue-translation/service.js';
```

Add to `DEFAULT_ROUTE_DEPS`:

```js
  dialogueTranslationCache: new DialogueTranslationCache(),
  dialogueTranslationChatFn: chat,
  getDialogueTranslationConfig: buildDialogueTranslationConfig,
```

- [ ] **Step 5: Verify route tests pass**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-translate.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit route work**

```bash
git add src/routes/dialogue.js src/routes/index.js src/app.js tests/unit/routes/dialogue-translate.test.js
git commit -m "feat(dialogue): expose translation endpoint"
```

## Task 4: Client API Helper

**Files:**
- Modify: `public/js/api.js`
- Test: add focused tests only if this project has existing API helper unit tests. If not, cover usage through `npc-dialogue-card.test.js` in Task 5.

- [ ] **Step 1: Add client helper**

Add near the top-level exported API helpers in `public/js/api.js`:

```js
export async function translateDialogue(text) {
  try {
    const response = await fetch(apiUrl('/api/dialogue/translate'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text })
    });

    const data = await response.json();
    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'translation_unavailable' };
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) onApiFailure();
    return { ok: false, error: 'translation_unavailable' };
  }
}
```

- [ ] **Step 2: Syntax check**

Run:

```bash
node --check public/js/api.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit client API helper**

```bash
git add public/js/api.js
git commit -m "feat(dialogue): add translate API helper"
```

## Task 5: Dialogue Card Bottom Sheet Behavior

**Files:**
- Modify: `public/js/ui/npc-dialogue-card.js`
- Modify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Update UI test mocks for async translation**

In `tests/unit/ui/npc-dialogue-card.test.js`, add state near existing globals:

```js
let translationResponse = { ok: true, translation: 'Wait!', cached: false };
let translatedTexts = [];
```

Add fetch/module mock before importing `npc-dialogue-card.js`:

```js
await mock.module('../../../public/js/api.js', {
  namedExports: {
    translateDialogue: async (text) => {
      translatedTexts.push(text);
      return translationResponse;
    }
  }
});
```

Update `beforeEach()`:

```js
    translationResponse = { ok: true, translation: 'Wait!', cached: false };
    translatedTexts = [];
```

Add these methods to the `FakeElement` class after `click()` so the bottom sheet can be inserted and removed in tests:

```js
  insertAdjacentHTML(position, html) {
    if (position !== 'beforeend') throw new Error(`Unsupported insertAdjacentHTML position: ${position}`);
    this._innerHTML += String(html || '');
    this._parsedElements = null;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
```

- [ ] **Step 2: Write failing tests for source extraction and sheet states**

Append these tests:

```js
  it('enables Translate for tokenized dialogue and keeps Learn disabled', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [translateButton, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(translateButton.disabled, false);
    assert.equal(learnButton.disabled, true);
  });

  it('opens translation bottom sheet without resolving dialogue', async () => {
    let resolved = false;
    const promise = showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    }).then(() => { resolved = true; });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(resolved, false);
    assert.deepEqual(translatedTexts, ['待って！']);
    assert.match(actionArea.innerHTML, /npc-dialogue-translation-sheet/);
    assert.match(actionArea.innerHTML, /Wait!/);

    const [continueButton] = actionArea.querySelectorAll('.npc-dialogue-continue');
    continueButton.click();
    await promise;
  });

  it('renders unavailable translation state with retry control', async () => {
    translationResponse = { ok: false, error: 'translation_unavailable' };

    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /Translation is unavailable right now/);
    assert.match(actionArea.innerHTML, /Try again/);
  });

  it('disables Translate for fallback HTML without source text', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      html: '<span>Hello</span>',
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(translateButton.disabled, true);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: FAIL because Translate is still disabled and no bottom sheet exists.

- [ ] **Step 4: Implement source extraction and translation sheet**

Modify `public/js/ui/npc-dialogue-card.js` import:

```js
import { translateDialogue } from '../api.js';
```

Add helpers after `paginateTokens()`:

```js
function tokenSurface(token, useKanji) {
  if (!token) return '';
  if (!isContentExposureToken(token)) return token.surface || '';
  if (useKanji) return token.surface || token.reading || token.baseForm || '';
  return token.surface || token.reading || token.baseForm || '';
}

export function getDialogueSourceText(tokens, useKanji = false) {
  return (tokens || []).map(token => tokenSurface(token, useKanji)).join('').trim();
}

function renderTranslationSheet({ sourceText, state, translation = '' }) {
  const body = state === 'loading'
    ? '<div class="npc-dialogue-translation-status">Translating...</div>'
    : state === 'success'
      ? `<p class="npc-dialogue-translation-en">${esc(translation)}</p>`
      : `
        <p class="npc-dialogue-translation-error">Translation is unavailable right now.</p>
        <button class="npc-dialogue-translation-retry" type="button">Try again</button>
      `;

  return `
    <div class="npc-dialogue-translation-backdrop" role="presentation"></div>
    <section class="npc-dialogue-translation-sheet" role="dialog" aria-modal="true" aria-label="Dialogue translation">
      <div class="npc-dialogue-translation-handle" aria-hidden="true"></div>
      <header class="npc-dialogue-translation-header">
        <h3>Translation</h3>
        <button class="npc-dialogue-translation-close" type="button" aria-label="Close translation">Done</button>
      </header>
      <p class="npc-dialogue-translation-jp">${esc(sourceText)}</p>
      ${body}
    </section>
  `;
}
```

Inside `showNpcDialogueCard()`, add `let translationRequestId = 0;` next to `pageIndex` and `resolved`.

Inside `render()`, after `continueLabel`:

```js
      const sourceText = pageTokens?.length ? getDialogueSourceText(pageTokens, options.useKanji) : '';
      const canTranslate = !!sourceText;
```

Change the Translate button:

```html
            <button class="npc-dialogue-utility npc-dialogue-translate" type="button" ${canTranslate ? '' : 'disabled'}>
```

After audio listener, add:

```js
      const closeTranslationSheet = () => {
        actionArea.querySelector('.npc-dialogue-translation-backdrop')?.remove();
        actionArea.querySelector('.npc-dialogue-translation-sheet')?.remove();
      };

      const setTranslationSheet = (state, translation = '') => {
        closeTranslationSheet();
        actionArea.querySelector('.npc-dialogue-shell')?.insertAdjacentHTML(
          'beforeend',
          renderTranslationSheet({ sourceText, state, translation })
        );
        actionArea.querySelector('.npc-dialogue-translation-close')?.addEventListener('click', closeTranslationSheet);
        actionArea.querySelector('.npc-dialogue-translation-backdrop')?.addEventListener('click', closeTranslationSheet);
        actionArea.querySelector('.npc-dialogue-translation-retry')?.addEventListener('click', requestTranslation);
      };

      const requestTranslation = async () => {
        if (!sourceText) return;
        const requestId = ++translationRequestId;
        setTranslationSheet('loading');
        const result = await translateDialogue(sourceText);
        if (requestId !== translationRequestId || resolved) return;
        if (result?.ok && result.translation) {
          setTranslationSheet('success', result.translation);
          return;
        }
        setTranslationSheet('unavailable');
      };

      actionArea.querySelector('.npc-dialogue-translate')?.addEventListener('click', requestTranslation);
```

Keep the Learn button disabled.

- [ ] **Step 5: Verify UI tests pass**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 6: Syntax check**

Run:

```bash
node --check public/js/ui/npc-dialogue-card.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 7: Commit dialogue card behavior**

```bash
git add public/js/ui/npc-dialogue-card.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "feat(ui): open dialogue translation sheet"
```

## Task 6: Bottom Sheet Styling

**Files:**
- Modify: `public/game.css`
- Test: visual verification in Task 8

- [ ] **Step 1: Add CSS near NPC dialogue card block**

Append before the `/* — DMG effectiveness pill` marker in `public/game.css`:

```css
.npc-dialogue-translation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 240;
  background: rgba(18, 14, 10, 0.42);
}

.npc-dialogue-translation-sheet {
  position: fixed;
  left: max(10px, calc((100vw - 430px) / 2 + 10px));
  right: max(10px, calc((100vw - 430px) / 2 + 10px));
  bottom: 0;
  z-index: 241;
  padding: 10px 16px max(18px, calc(18px + env(safe-area-inset-bottom, 0px)));
  border-radius: 22px 22px 0 0;
  border: 3px solid #4d3c28;
  border-bottom: 0;
  background:
    radial-gradient(circle at 45% 0%, rgba(255, 255, 255, 0.62), transparent 30%),
    linear-gradient(180deg, #fff9eb, #f0d7ad);
  box-shadow:
    0 -12px 28px rgba(0, 0, 0, 0.34),
    inset 0 0 0 2px rgba(255, 255, 255, 0.72);
  color: #17130f;
  font-family: "Hiragino Maru Gothic ProN", "Yu Gothic", ui-rounded, system-ui, sans-serif;
}

.npc-dialogue-translation-handle {
  width: 48px;
  height: 5px;
  margin: 0 auto 10px;
  border-radius: 999px;
  background: rgba(77, 60, 40, 0.38);
}

.npc-dialogue-translation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(101, 80, 52, 0.23);
}

.npc-dialogue-translation-header h3 {
  margin: 0;
  color: #1f1712;
  font-size: 18px;
  font-weight: 800;
}

.npc-dialogue-translation-close,
.npc-dialogue-translation-retry {
  border: 2px solid #f4d9a5;
  border-radius: 12px;
  background: linear-gradient(180deg, #2f80db, #1d56be);
  color: #fff;
  box-shadow: 0 3px 0 rgba(44, 29, 20, 0.82), inset 0 0 0 1px rgba(255, 255, 255, 0.28);
  font-weight: 800;
  -webkit-tap-highlight-color: transparent;
}

.npc-dialogue-translation-close {
  min-width: 72px;
  padding: 8px 12px;
}

.npc-dialogue-translation-jp {
  margin: 12px 0 8px;
  font-size: clamp(16px, 4.4vw, 19px);
  font-weight: 720;
  line-height: 1.35;
}

.npc-dialogue-translation-en,
.npc-dialogue-translation-error,
.npc-dialogue-translation-status {
  margin: 0;
  color: #2c241d;
  font-family: Inter, system-ui, sans-serif;
  font-size: clamp(15px, 4vw, 18px);
  font-weight: 700;
  line-height: 1.35;
}

.npc-dialogue-translation-status {
  color: rgba(44, 36, 29, 0.72);
}

.npc-dialogue-translation-error {
  margin-bottom: 12px;
  color: #78401f;
}

.npc-dialogue-translation-retry {
  padding: 10px 16px;
}
```

- [ ] **Step 2: Commit CSS**

```bash
git add public/game.css
git commit -m "style(ui): add dialogue translation sheet"
```

## Task 7: Environment Example And Full Unit Verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add env vars to `.env.example`**

Add under AI provider keys:

```bash
# Dialogue Translate button (master-level server config; set in Railway dev/prod)
DIALOGUE_TRANSLATION_PROVIDER=
DIALOGUE_TRANSLATION_API_KEY=
DIALOGUE_TRANSLATION_MODEL=
```

- [ ] **Step 2: Run focused syntax checks**

Run:

```bash
node --check src/dialogue-translation/cache.js && \
node --check src/dialogue-translation/service.js && \
node --check src/routes/dialogue.js && \
node --check src/ai-providers.js && \
node --check public/js/api.js && \
node --check public/js/ui/npc-dialogue-card.js && \
echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Run focused unit tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/dialogue-translation/cache.test.js \
  tests/unit/dialogue-translation/service.test.js \
  tests/unit/routes/dialogue-translate.test.js \
  tests/unit/ai-providers.test.js \
  tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 4: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit env and final test fixes**

```bash
git add .env.example
git commit -m "docs(env): document dialogue translation config"
```

## Task 8: Manual Visual Verification

**Files:**
- No new source files unless verification reveals a bug.
- Read before browser testing: `docs/playtest-guide.md`

- [ ] **Step 1: Read playtest guide**

Read `docs/playtest-guide.md`, especially the Vite dev server and visual CSS audit notes.

- [ ] **Step 2: Start or reuse dev server**

Before starting, check running terminals. If no dev server is running, run:

```bash
npm run dev
```

Expected: Vite server available at `http://localhost:5173`.

- [ ] **Step 3: Verify server responds**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 4: Browser visual verification**

Ask the user before opening browser automation. Then use the browser tooling to:

1. Navigate to `http://localhost:5173`.
2. Reach an NPC/creature dialogue card that shows the `Translate` button.
3. Click `Translate`.
4. Confirm the bottom sheet appears, covers the lower screen, and does not advance dialogue.
5. Confirm loading, success, close, and retry/unavailable states where practical.
6. Take a screenshot for evidence.
7. Delete any screenshot file immediately after showing it.

- [ ] **Step 5: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: PASS.

- [ ] **Step 6: Final commit if visual/test fixes were needed**

Only if Task 8 required code changes:

```bash
git add public/game.css public/js/ui/npc-dialogue-card.js
git commit -m "fix(ui): polish dialogue translation sheet"
```

## Self-Review Notes

- Spec coverage: Tasks cover global exact-text cache, no separate authored translation table, master env config, all provider families including Gemini model override, prompt, endpoint contract, client bottom sheet states, retry/close behavior, auth, and visual verification.
- Marker scan: no known unfinished-work markers, no unbounded "add error handling" steps. Each code step includes concrete code or concrete insertion snippets.
- Type consistency: service result shape is `{ ok, translation, cached }` or `{ ok: false, error: 'translation_unavailable' }`; route and client tests use the same shape.
- Scope control: no admin cache editor, no generation-time enrichment, no Learn behavior, no per-speaker translation keying.
