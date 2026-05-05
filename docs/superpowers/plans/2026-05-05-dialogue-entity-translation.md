# Dialogue Entity Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dialogue translation preserve source-line game entity names such as `花` -> `Flower`, return deterministic entity spans, and render those names green in the translation sheet.

**Architecture:** Extend the existing dialogue translation service rather than adding a parallel translation path. The client sends source-line-specific protected entities, the server builds a stable cache key from source text plus entity signature, prompts the AI to emit exact markers, validates markers deterministically, stores only plain translation plus spans, and the UI renders escaped text with span offsets.

**Tech Stack:** Express, ES modules, Node `node:test`, existing `DialogueTranslationCache`, existing `chat()` AI provider helper, browser DOM APIs, `public/game.css`, Vite dev server for visual verification.

---

## File Structure

- Modify `src/dialogue-translation/cache.js`: accept cache keys that include entity context and store `entitySignature` plus validated `entities` spans.
- Modify `src/dialogue-translation/service.js`: add entity normalization, entity signature creation, marker prompt construction, marker parsing, marker validation, retry flow, and cache lookup by source text plus signature.
- Modify `src/routes/dialogue.js`: read `req.body.entities` and pass it into `translateDialogueText()`.
- Modify `public/js/api.js`: let `translateDialogue()` accept an optional entity array and POST it to `/api/dialogue/translate`.
- Modify `public/js/ui/npc-dialogue-card.js`: derive protected entities from dialogue-card options and entity tokens, pass them to the API helper, render validated entity spans in the translation sheet.
- Modify `public/game.css`: add the green entity-name style inside `.npc-dialogue-translation-en`.
- Modify `tests/unit/dialogue-translation/cache.test.js`: cover entity-aware cache entries.
- Modify `tests/unit/dialogue-translation/service.test.js`: cover entity normalization, signatures, prompts, marker parsing, validation failures, retry, and cached span returns.
- Modify `tests/unit/routes/dialogue-translate.test.js`: cover request `entities` forwarding and entity span response shape.
- Modify `tests/unit/ui/npc-dialogue-card.test.js`: cover entity context sent to the API helper and green span rendering.

## Task 1: Entity-Aware Cache Keys

**Files:**
- Modify: `src/dialogue-translation/cache.js`
- Test: `tests/unit/dialogue-translation/cache.test.js`

- [ ] **Step 1: Write failing cache tests**

Append these tests inside the existing `describe('DialogueTranslationCache', ...)` block in `tests/unit/dialogue-translation/cache.test.js`:

```js
  it('stores entity-aware entries under a composed cache key', () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const key = DialogueTranslationCache.keyFor('花は強い！', 'creature:hana:花:Flower');

    cache.set(key, 'Flower is strong!', {
      sourceText: '花は強い！',
      entitySignature: 'creature:hana:花:Flower',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }],
      provider: 'openai',
      model: 'gpt-5-mini'
    });

    const cached = cache.get(key);
    assert.equal(cached.sourceText, '花は強い！');
    assert.equal(cached.entitySignature, 'creature:hana:花:Flower');
    assert.equal(cached.translation, 'Flower is strong!');
    assert.deepEqual(cached.entities, [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }]);
  });

  it('keeps plain text and entity-aware translations separate', () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const plainKey = DialogueTranslationCache.keyFor('花は強い！', '');
    const entityKey = DialogueTranslationCache.keyFor('花は強い！', 'creature:hana:花:Flower');

    cache.set(plainKey, 'Flowers are strong!', { sourceText: '花は強い！' });
    cache.set(entityKey, 'Flower is strong!', {
      sourceText: '花は強い！',
      entitySignature: 'creature:hana:花:Flower',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }]
    });

    assert.equal(cache.get(plainKey).translation, 'Flowers are strong!');
    assert.equal(cache.get(entityKey).translation, 'Flower is strong!');
  });
```

- [ ] **Step 2: Run cache tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/cache.test.js
```

Expected: FAIL because `DialogueTranslationCache.keyFor` does not exist and `set()` ignores `sourceText`, `entitySignature`, and `entities`.

- [ ] **Step 3: Implement entity-aware cache fields**

Update `src/dialogue-translation/cache.js` with these changes:

```js
export class DialogueTranslationCache {
  static keyFor(sourceText, entitySignature = '') {
    const text = String(sourceText || '').trim();
    const signature = String(entitySignature || '').trim();
    return signature ? `${text}\n::entities::${signature}` : text;
  }

  constructor({ inMemory = false, fileName = DEFAULT_CACHE_FILE } = {}) {
    this._inMemory = inMemory;
    this._filePath = inMemory ? null : dataPath(fileName);
    this._data = {};
    this._load();
  }

  // keep _load(), _save(), get(), and getAll() as they are

  set(cacheKey, translation, {
    sourceText = cacheKey,
    entitySignature = '',
    entities = [],
    provider = '',
    model = ''
  } = {}) {
    const now = new Date().toISOString();
    const previous = this._data[cacheKey] || {};
    const entry = {
      sourceText,
      entitySignature,
      translation,
      entities: Array.isArray(entities) ? entities : [],
      provider,
      model,
      createdAt: previous.createdAt || now,
      updatedAt: now
    };

    this._data[cacheKey] = entry;
    this._save();
    return entry;
  }
}
```

- [ ] **Step 4: Verify cache tests pass**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/cache.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit cache change**

```bash
git add src/dialogue-translation/cache.js tests/unit/dialogue-translation/cache.test.js
git commit -m "feat(dialogue): key translations by entity context"
```

## Task 2: Entity Normalization, Signatures, And Prompts

**Files:**
- Modify: `src/dialogue-translation/service.js`
- Test: `tests/unit/dialogue-translation/service.test.js`

- [ ] **Step 1: Write failing normalization and prompt tests**

Add these named imports at the top of `tests/unit/dialogue-translation/service.test.js`:

```js
  buildEntitySignature,
  normalizeDialogueEntities,
```

Append these tests inside the existing `describe('dialogue translation service', ...)` block:

```js
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
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/service.test.js
```

Expected: FAIL because `normalizeDialogueEntities` and `buildEntitySignature` are not exported, and `buildDialogueTranslationPrompts()` does not accept entity context.

- [ ] **Step 3: Implement normalization and prompt construction**

Add these helpers to `src/dialogue-translation/service.js` above `buildDialogueTranslationPrompts()`:

```js
const MAX_DIALOGUE_ENTITIES = 12;
const MAX_ENTITY_FIELD_LENGTH = 80;

function cleanEntityField(value) {
  return String(value || '').trim().slice(0, MAX_ENTITY_FIELD_LENGTH);
}

function cleanEntityType(value) {
  const type = cleanEntityField(value).toLowerCase();
  return type || 'entity';
}

export function normalizeDialogueEntities(entities = []) {
  if (!Array.isArray(entities)) return [];
  const normalized = [];
  const seen = new Set();

  for (const entity of entities.slice(0, MAX_DIALOGUE_ENTITIES)) {
    const id = cleanEntityField(entity?.id);
    const type = cleanEntityType(entity?.type);
    const surface = cleanEntityField(entity?.surface);
    const displayName = cleanEntityField(entity?.displayName);
    if (!id || !surface || !displayName) continue;

    const key = `${type}:${id}:${surface}:${displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ id, type, surface, displayName });
  }

  return normalized;
}

export function buildEntitySignature(entities = []) {
  return normalizeDialogueEntities(entities)
    .map(entity => `${entity.type}:${entity.id}:${entity.surface}:${entity.displayName}`)
    .sort()
    .join('|');
}

function protectedEntityPromptSection(entities) {
  if (!entities.length) return '';
  const lines = entities.map(entity => `- ${entity.surface} = [[entity:${entity.id}|${entity.displayName}]]`);
  return `
- Every listed protected game entity is a game entity reference in this Japanese line. Output exactly that entity's marker for it.
- Do not translate, pluralize, lowercase, rename, or remove protected game entity names.
- Do not invent entity markers that are not listed.

Protected game entities:
${lines.join('\n')}`;
}
```

Replace `buildDialogueTranslationPrompts(sentence)` with:

```js
export function buildDialogueTranslationPrompts(sentence, entities = []) {
  const normalizedEntities = normalizeDialogueEntities(entities);
  const entityRules = protectedEntityPromptSection(normalizedEntities);
  return {
    systemPrompt: 'You are a careful Japanese-to-English translator for a language-learning RPG. Produce accurate, natural English translations without commentary. Protected game entity names must be preserved exactly with the required marker syntax.',
    userPrompt: `Translate the following Japanese dialogue into natural English.

Rules:
- Preserve the meaning and tone.
- Return only the English translation.
- Do not include explanations, romanization, quotation marks, alternatives, or notes.${entityRules}

Japanese:
${sentence}`
  };
}
```

- [ ] **Step 4: Verify service tests pass**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/service.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit normalization and prompt change**

```bash
git add src/dialogue-translation/service.js tests/unit/dialogue-translation/service.test.js
git commit -m "feat(dialogue): prompt translations with protected entities"
```

## Task 3: Deterministic Marker Parsing And Retry

**Files:**
- Modify: `src/dialogue-translation/service.js`
- Test: `tests/unit/dialogue-translation/service.test.js`

- [ ] **Step 1: Write failing marker parser tests**

Add this named import at the top of `tests/unit/dialogue-translation/service.test.js`:

```js
  parseEntityMarkedTranslation,
```

Append these tests inside the service `describe` block:

```js
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
    assert.equal(calls, 2);
  });

  it('retries once and caches when corrected output contains required markers', async () => {
    const cache = new DialogueTranslationCache({ inMemory: true });
    const calls = [];

    const result = await translateDialogueText({
      text: '花は強い！',
      entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }],
      cache,
      chatFn: async (args) => {
        calls.push(args);
        return calls.length === 1 ? 'Flowers are strong!' : '[[entity:hana|Flower]] is strong!';
      },
      config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' }
    });

    assert.deepEqual(result, {
      ok: true,
      translation: 'Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }],
      cached: false
    });
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages[0].content, /previous answer did not follow/);
  });
```

- [ ] **Step 2: Update existing service assertions for empty entity spans**

In `tests/unit/dialogue-translation/service.test.js`, update existing successful `translateDialogueText()` expectations so no-entity translations include `entities: []`.

In `returns cached translation without calling AI`, after the existing translation assertion, add:

```js
    assert.deepEqual(result.entities, []);
```

In `calls AI on miss, stores sanitized result, and returns uncached response`, after the existing translation assertion, add:

```js
    assert.deepEqual(result.entities, []);
```

In `maps configured model by provider family`, no assertion change is needed because the test only inspects chat arguments.

- [ ] **Step 3: Run service tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/service.test.js
```

Expected: FAIL because marker parsing and retry are not implemented.

- [ ] **Step 4: Implement parser, validation, and retry**

Add this parser to `src/dialogue-translation/service.js` after `sanitizeTranslationOutput()`:

```js
export function parseEntityMarkedTranslation(output, entities = []) {
  const raw = sanitizeTranslationOutput(output);
  if (!raw) return { ok: false, error: TRANSLATION_UNAVAILABLE };

  const normalizedEntities = normalizeDialogueEntities(entities);
  if (!normalizedEntities.length) {
    if (/\[\[entity:/i.test(raw) || /\[\[|\]\]/.test(raw)) {
      return { ok: false, error: TRANSLATION_UNAVAILABLE };
    }
    return { ok: true, translation: raw, entities: [] };
  }

  const byId = new Map(normalizedEntities.map(entity => [entity.id, entity]));
  const markerRe = /\[\[entity:([^|\]\[]+)\|([^\]\[]+)\]\]/g;
  const spans = [];
  let translation = '';
  let lastIndex = 0;
  let match;

  while ((match = markerRe.exec(raw))) {
    const [marker, id, displayName] = match;
    const entity = byId.get(id);
    if (!entity || entity.displayName !== displayName) {
      return { ok: false, error: TRANSLATION_UNAVAILABLE };
    }

    translation += raw.slice(lastIndex, match.index);
    const start = translation.length;
    translation += displayName;
    spans.push({ id: entity.id, type: entity.type, text: displayName, start, end: translation.length });
    lastIndex = match.index + marker.length;
  }

  translation += raw.slice(lastIndex);
  if (/\[\[entity:/i.test(translation) || /\[\[|\]\]/.test(translation)) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  return { ok: true, translation, entities: spans };
}
```

Add this helper below the parser:

```js
function requiredEntitiesForSource(sourceText, entities) {
  return normalizeDialogueEntities(entities).filter(entity => sourceText.includes(entity.surface));
}

function hasRequiredEntityMarkers(parsed, requiredEntities) {
  return requiredEntities.every(entity => parsed.entities.some(span => span.id === entity.id));
}

function buildEntityRetryPrompt({ sourceText, entities, previousOutput }) {
  const entityLines = requiredEntitiesForSource(sourceText, entities)
    .map(entity => `- ${entity.surface} = [[entity:${entity.id}|${entity.displayName}]]`)
    .join('\n');

  return `Your previous answer did not follow the protected entity marker rules. Return only the corrected English translation.

The Japanese source contains these protected game entities:
${entityLines}

Previous answer:
${previousOutput}

Japanese:
${sourceText}`;
}
```

Update `translateDialogueText()` so it accepts `entities`, uses the entity-aware cache key, parses markers, and retries once:

```js
export async function translateDialogueText({
  text,
  entities = [],
  cache,
  chatFn,
  config = buildDialogueTranslationConfig()
}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const normalizedEntities = normalizeDialogueEntities(entities);
  const entitySignature = buildEntitySignature(normalizedEntities);
  const cacheKey = cache.constructor.keyFor(sourceText, entitySignature);
  const cached = cache.get(cacheKey);
  if (cached?.translation) {
    return { ok: true, translation: cached.translation, entities: cached.entities || [], cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }

  const requiredEntities = requiredEntitiesForSource(sourceText, normalizedEntities);
  const { systemPrompt, userPrompt } = buildDialogueTranslationPrompts(sourceText, normalizedEntities);

  try {
    const raw = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      purpose: 'dialogue-translation',
      ...modelArgsForProvider(config.provider, config.model)
    });

    let parsed = parseEntityMarkedTranslation(raw, normalizedEntities);
    if (parsed.ok && hasRequiredEntityMarkers(parsed, requiredEntities)) {
      cache.set(cacheKey, parsed.translation, {
        sourceText,
        entitySignature,
        entities: parsed.entities,
        provider: config.provider,
        model: config.model
      });
      return { ok: true, translation: parsed.translation, entities: parsed.entities, cached: false };
    }

    if (requiredEntities.length) {
      const retryRaw = await chatFn({
        provider: config.provider,
        apiKey: config.apiKey,
        messages: [{ role: 'user', content: buildEntityRetryPrompt({ sourceText, entities: normalizedEntities, previousOutput: raw }) }],
        customSystemPrompt: systemPrompt,
        purpose: 'dialogue-translation',
        ...modelArgsForProvider(config.provider, config.model)
      });

      parsed = parseEntityMarkedTranslation(retryRaw, normalizedEntities);
      if (parsed.ok && hasRequiredEntityMarkers(parsed, requiredEntities)) {
        cache.set(cacheKey, parsed.translation, {
          sourceText,
          entitySignature,
          entities: parsed.entities,
          provider: config.provider,
          model: config.model
        });
        return { ok: true, translation: parsed.translation, entities: parsed.entities, cached: false };
      }
    }

    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  } catch (error) {
    logger.warn('[DialogueTranslation] Translation failed:', error.message);
    return { ok: false, error: TRANSLATION_UNAVAILABLE };
  }
}
```

- [ ] **Step 5: Run service tests**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/service.test.js
```

Expected: PASS.

- [ ] **Step 6: Run cache tests again**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/cache.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit service marker validation**

```bash
git add src/dialogue-translation/service.js tests/unit/dialogue-translation/service.test.js
git commit -m "feat(dialogue): validate entity markers deterministically"
```

## Task 4: Route And Client API Contract

**Files:**
- Modify: `src/routes/dialogue.js`
- Modify: `public/js/api.js`
- Test: `tests/unit/routes/dialogue-translate.test.js`

- [ ] **Step 1: Write failing route tests**

Append this test inside `tests/unit/routes/dialogue-translate.test.js`:

```js
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

    const res = await request(app)
      .post('/api/dialogue/translate')
      .send({
        text: '花は強い！',
        entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }]
      })
      .expect(200);

    assert.deepEqual(res.body, {
      ok: true,
      translation: 'Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }],
      cached: false
    });
  });
```

- [ ] **Step 2: Update existing route assertions for empty entity spans**

In `tests/unit/routes/dialogue-translate.test.js`, update existing successful response expectations so no-entity translations include `entities: []`.

Change:

```js
    assert.deepEqual(res.body, { ok: true, translation: 'Wait!', cached: true });
```

to:

```js
    assert.deepEqual(res.body, { ok: true, translation: 'Wait!', entities: [], cached: true });
```

Change:

```js
    assert.deepEqual(first.body, { ok: true, translation: "Let's go.", cached: false });
    assert.deepEqual(second.body, { ok: true, translation: "Let's go.", cached: true });
```

to:

```js
    assert.deepEqual(first.body, { ok: true, translation: "Let's go.", entities: [], cached: false });
    assert.deepEqual(second.body, { ok: true, translation: "Let's go.", entities: [], cached: true });
```

- [ ] **Step 3: Run route tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-translate.test.js
```

Expected: FAIL because `src/routes/dialogue.js` does not pass `entities` into `translateDialogueText()`.

- [ ] **Step 4: Pass request entities into the service**

Update `src/routes/dialogue.js` inside the `/translate` handler:

```js
    const result = await translateDialogueText({
      text,
      entities: req.body?.entities,
      cache: dialogueTranslationCache,
      chatFn: dialogueTranslationChatFn,
      config: getDialogueTranslationConfig()
    });
```

- [ ] **Step 5: Update API helper request body**

Change `translateDialogue()` in `public/js/api.js`:

```js
export async function translateDialogue(text, entities = []) {
  try {
    const body = { text };
    if (Array.isArray(entities) && entities.length) body.entities = entities;

    const response = await fetch(apiUrl('/api/dialogue/translate'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
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

- [ ] **Step 6: Verify route tests pass**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-translate.test.js
```

Expected: PASS.

- [ ] **Step 7: Run syntax checks for changed JS**

Run:

```bash
node --check src/routes/dialogue.js && node --check public/js/api.js
```

Expected: both commands exit with code 0 and print no syntax errors.

- [ ] **Step 8: Commit API contract change**

```bash
git add src/routes/dialogue.js public/js/api.js tests/unit/routes/dialogue-translate.test.js
git commit -m "feat(dialogue): send protected entities to translation API"
```

## Task 5: Dialogue Card Entity Context And Green Span Rendering

**Files:**
- Modify: `public/js/ui/npc-dialogue-card.js`
- Modify: `public/game.css`
- Test: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Update the API mock in UI tests**

Change the mock state near the top of `tests/unit/ui/npc-dialogue-card.test.js`:

```js
let translatedRequests = [];
```

Replace the mocked `translateDialogue` function with:

```js
    translateDialogue: async (text, entities = []) => {
      translatedRequests.push({ text, entities });
      return translationResponse;
    }
```

In `beforeEach()`, replace `translatedTexts = [];` with:

```js
    translatedRequests = [];
```

In the existing translation test, replace:

```js
    assert.deepEqual(translatedTexts, ['待って！']);
```

with:

```js
    assert.deepEqual(translatedRequests, [{ text: '待って！', entities: [] }]);
```

- [ ] **Step 2: Write failing UI tests for entity context and green spans**

Append these tests inside `describe('npc dialogue card', ...)`:

```js
  it('sends protected speaker entity context with translation requests', async () => {
    showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower', pos: 'noun', entity: true },
        { surface: 'は', baseForm: 'は', reading: 'は', pos: 'particle' },
        { surface: '強い', baseForm: '強い', reading: 'つよい', meaning: 'strong', pos: 'adjective' },
        { surface: '！', pos: 'punctuation' }
      ],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(translatedRequests, [{
      text: '花は強い！',
      entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }]
    }]);
  });

  it('renders validated translation entity spans without raw marker syntax', async () => {
    translationResponse = {
      ok: true,
      translation: 'Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }]
    };

    showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      tokens: [{ surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower', pos: 'noun', entity: true }],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /npc-dialogue-translation-entity/);
    assert.match(actionArea.innerHTML, />Flower<\/span> is strong!/);
    assert.doesNotMatch(actionArea.innerHTML, /\[\[entity:/);
  });
```

- [ ] **Step 3: Run UI test to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: FAIL because `showNpcDialogueCard()` does not build entity context or render span ranges.

- [ ] **Step 4: Add entity context helpers and safe span renderer**

In `public/js/ui/npc-dialogue-card.js`, add these helpers after `getDialogueSourceText()`:

```js
function cleanEntityValue(value) {
  return String(value || '').trim();
}

export function normalizeTranslationEntity(entity) {
  const id = cleanEntityValue(entity?.id);
  const type = cleanEntityValue(entity?.type) || 'entity';
  const surface = cleanEntityValue(entity?.surface || entity?.name || entity?.baseWord);
  const displayName = cleanEntityValue(entity?.displayName || entity?.nameEn);
  if (!id || !surface || !displayName) return null;
  return { id, type, surface, displayName };
}

export function getTranslationEntities(options = {}, pageTokens = []) {
  const entities = [];
  const seen = new Set();
  const addEntity = entity => {
    const normalized = normalizeTranslationEntity(entity);
    if (!normalized) return;
    const key = `${normalized.type}:${normalized.id}:${normalized.surface}:${normalized.displayName}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push(normalized);
  };

  addEntity(options.speakerEntity);
  for (const token of pageTokens || []) {
    if (token?.entity) addEntity(token);
  }
  return entities;
}

export function renderTranslationWithEntities(translation = '', entities = []) {
  const text = String(translation || '');
  const spans = Array.isArray(entities)
    ? entities
        .filter(span => Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= text.length)
        .sort((a, b) => a.start - b.start)
    : [];

  let html = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    html += esc(text.slice(cursor, span.start));
    html += `<span class="npc-dialogue-translation-entity" data-entity-type="${esc(span.type || 'entity')}" data-entity-id="${esc(span.id || '')}">${esc(text.slice(span.start, span.end))}</span>`;
    cursor = span.end;
  }
  html += esc(text.slice(cursor));
  return html;
}
```

Update `renderTranslationSheet()` success rendering:

```js
function renderTranslationSheet({ sourceText, state, translation = '', entities = [] }) {
  const body = state === 'loading'
    ? '<div class="npc-dialogue-translation-status">Translating...</div>'
    : state === 'success'
      ? `<p class="npc-dialogue-translation-en">${renderTranslationWithEntities(translation, entities)}</p>`
      : `
        <p class="npc-dialogue-translation-error">Translation is unavailable right now.</p>
        <button class="npc-dialogue-translation-retry" type="button">Try again</button>
      `;
```

Inside `render()`, after `sourceText` is computed, add:

```js
      const translationEntities = pageTokens?.length ? getTranslationEntities(options, pageTokens) : [];
```

Update `setTranslationSheet()`:

```js
      const setTranslationSheet = (state, translation = '', entities = []) => {
        closeTranslationSheet();
        actionArea.insertAdjacentHTML(
          'beforeend',
          renderTranslationSheet({ sourceText, state, translation, entities })
        );
        actionArea.querySelector('.npc-dialogue-translation-close')?.addEventListener('click', closeTranslationSheet);
        actionArea.querySelector('.npc-dialogue-translation-backdrop')?.addEventListener('click', closeTranslationSheet);
        actionArea.querySelector('.npc-dialogue-translation-retry')?.addEventListener('click', requestTranslation);
      };
```

Update the request call and success state:

```js
        const result = await translateDialogue(sourceText, translationEntities);
        if (resolved) return;
        if (result?.ok && result.translation) {
          setTranslationSheet('success', result.translation, result.entities || []);
          return;
        }
```

- [ ] **Step 5: Add green entity CSS**

Add this block after `.npc-dialogue-translation-en, .npc-dialogue-translation-error, .npc-dialogue-translation-status` styles in `public/game.css`:

```css
.npc-dialogue-translation-entity {
  color: #1f8f4a;
  font-weight: 900;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
}
```

- [ ] **Step 6: Wire speaker entity at current creature dialogue call sites**

Update `dialogueOptionsForCreatureSpeaker()` in `public/js/ui/befriend.js` so it returns `speakerEntity` for creature speakers:

```js
function dialogueOptionsForCreatureSpeaker(speaker) {
  const speakerName = typeof speaker === 'string' ? speaker : (speaker?.name || '');
  const speakerReading = typeof speaker === 'object' ? speaker?.reading : '';
  const creatureId = typeof speaker === 'object' ? speaker?.id : '';
  const speakerEntity = typeof speaker === 'object' && creatureId
    ? {
        id: creatureId,
        type: 'creature',
        surface: speaker?.name || speaker?.baseWord || '',
        displayName: speaker?.nameEn || speakerName,
      }
    : null;
  return {
    speaker: speakerName,
    speakerReading: speakerReading && speakerReading !== speakerName ? speakerReading : speakerReading || undefined,
    ...(speakerEntity ? { speakerEntity } : {}),
    ...(creatureId ? {
      speakerPortrait: creatureStaticPath(creatureId),
      portraitKind: 'creature',
    } : {}),
  };
}
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 8: Run syntax checks for changed browser files**

Run:

```bash
node --check public/js/ui/npc-dialogue-card.js && node --check public/js/ui/befriend.js && node --check public/js/api.js
```

Expected: all commands exit with code 0 and print no syntax errors.

- [ ] **Step 9: Commit UI entity rendering**

```bash
git add public/js/ui/npc-dialogue-card.js public/js/ui/befriend.js public/game.css tests/unit/ui/npc-dialogue-card.test.js
git commit -m "feat(dialogue): highlight translated entity names"
```

## Task 6: Full Verification And Visual Check

**Files:**
- Verify: all changed files
- Read: `docs/playtest-guide.md`

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-translation/cache.test.js tests/unit/dialogue-translation/service.test.js tests/unit/routes/dialogue-translate.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check src/dialogue-translation/cache.js && node --check src/dialogue-translation/service.js && node --check src/routes/dialogue.js && node --check public/js/api.js && node --check public/js/ui/npc-dialogue-card.js && node --check public/js/ui/befriend.js
```

Expected: all commands exit with code 0 and print no syntax errors.

- [ ] **Step 3: Run the full required test gate**

Run:

```bash
npm test
```

Expected: PASS for Tier 1 and Tier 2.

- [ ] **Step 4: Read playtest guide before visual verification**

Run no command. Read `docs/playtest-guide.md` and follow the dialogue-card interaction guidance. Use `npm run dev` and `http://localhost:5173`, not `npm start` or port `3000`.

- [ ] **Step 5: Start dev server if one is not already running**

First inspect terminals for an existing dev server. If none is running, run:

```bash
npm run dev
```

Expected: Vite reports a local URL on port `5173`.

- [ ] **Step 6: Verify local server responds**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 7: Ask before opening Playwright**

Because project rules require asking before launching Playwright, ask the user for permission to open the browser for visual verification. Do not launch browser tooling until the user agrees.

- [ ] **Step 8: Visual verify translated entity highlighting**

After user approval, use the browser tooling to reach a dialogue-card screen that can translate a creature entity line. If test data does not naturally produce `花は強い！`, use an authenticated local state or existing debug setup that produces a tokenized creature dialogue line with `speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }`. Click `Translate` and capture a screenshot showing the bottom sheet with `Flower` highlighted green.

Expected: the English line shows `Flower` in green, no raw `[[entity:...]]` marker is visible, and closing the sheet does not advance the dialogue.

- [ ] **Step 9: Remove any screenshot files**

If browser tooling or manual screenshot capture writes a file into the repo, delete the exact screenshot path returned by the tool. For example, if the screenshot path is `tmp/dialogue-entity-translation.png`, run:

```bash
rm tmp/dialogue-entity-translation.png
```

Expected: `git status --short` shows no screenshot files.

- [ ] **Step 10: Final git status review**

Run:

```bash
git status --short
```

Expected: only intentional source, test, CSS, spec, and plan files are modified.

- [ ] **Step 11: Commit final verification/doc state**

If the spec and plan files are not already committed, commit them with the final implementation state:

```bash
git add docs/superpowers/specs/2026-05-05-dialogue-translate-bottom-sheet-design.md docs/superpowers/plans/2026-05-05-dialogue-entity-translation.md
git commit -m "docs(dialogue): plan entity-aware translation"
```

If all implementation changes are already committed and only verification was performed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: entity-aware cache keys, marker prompt, deterministic parser validation, retry, API contract, client entity context, green highlighting, and visual verification are covered.
- Placeholder scan: this plan contains concrete file paths, commands, expected results, and code snippets for each code-changing step.
- Type consistency: request entities use `{ id, type, surface, displayName }`; response spans use `{ id, type, text, start, end }`; cache entries store `sourceText`, `entitySignature`, `translation`, `entities`, `provider`, `model`, `createdAt`, and `updatedAt`.
