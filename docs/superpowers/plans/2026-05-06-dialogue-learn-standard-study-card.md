# Dialogue Learn Standard Study Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the dialogue-card `Learn` button to open a full-screen, globally cached Standard Study Card lesson generated as strict validated JSON.

**Architecture:** Add a new `src/dialogue-learn/` service layer parallel to `src/dialogue-translation/`, but keep Learn's schema validation separate because it returns structured lesson JSON instead of a string translation. The server normalizes source text, tokens, and protected entities, checks a global cache keyed by source text + entity signature + schema version, calls the master AI provider on misses, validates strict JSON, caches valid lessons, and returns them to the client. The dialogue card sends current-page token metadata, renders the fixed Standard Study Card section order, and closes without advancing dialogue.

**Tech Stack:** Express routes, ES modules, Node `node:test`, `supertest`, existing `chat()` AI provider helper, browser DOM APIs, `public/game.css`, Vite dev server for visual verification.

---

## File Structure

- Create `src/dialogue-learn/cache.js`: file-backed global lesson cache, schema-version-aware key builder, `get()`, `set()`, `getAll()`.
- Create `src/dialogue-learn/schema.js`: strict Learn lesson constants, tokenizer/entity normalization, JSON parsing, schema validation, Japanese-string safety checks.
- Create `src/dialogue-learn/service.js`: environment config, model argument mapping, prompt builder, cache lookup, AI call, validation, and public `generateDialogueLearnLesson()`.
- Modify `src/routes/dialogue.js`: add `POST /api/dialogue/learn`, dependency injection for Learn cache/chat/config.
- Modify `src/routes/index.js`: pass Learn dependencies into dialogue routes.
- Modify `src/app.js`: add default Learn route dependencies.
- Modify `.env.example`: document `DIALOGUE_LEARN_*` server config.
- Modify `public/js/api.js`: add `learnDialogue(text, tokens, entities)`.
- Modify `public/js/ui/npc-dialogue-card.js`: enable Learn for tokenized dialogue, build current-page payload, render full-screen Learn takeover.
- Modify `public/game.css`: add Standard Study Card full-screen Learn styles.
- Create `tests/unit/dialogue-learn/cache.test.js`: cache key, persistence, schema version separation.
- Create `tests/unit/dialogue-learn/schema.test.js`: strict validation and safety rules.
- Create `tests/unit/dialogue-learn/service.test.js`: config, prompt, cache hit/miss, invalid output failure.
- Create `tests/unit/routes/dialogue-learn.test.js`: auth, route success/failure, dependency forwarding.
- Modify `tests/unit/ui/npc-dialogue-card.test.js`: Learn API mock, button enablement, payload, rendering, close/retry behavior.

## Task 1: Learn Lesson Cache

**Files:**
- Create: `src/dialogue-learn/cache.js`
- Create: `tests/unit/dialogue-learn/cache.test.js`

- [ ] **Step 1: Write failing cache tests**

Create `tests/unit/dialogue-learn/cache.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { DialogueLearnCache } from '../../../src/dialogue-learn/cache.js';

const SAMPLE_LESSON = {
  schemaVersion: 1,
  sourceText: '花は森で光を見た。',
  pronunciation: { kana: 'はな は もり で ひかり を みた', romaji: 'hana wa mori de hikari o mita' },
  translation: 'Flower saw a light in the forest.',
  tokens: [],
  grammarHints: [{ title: 'Verb goes last.', body: 'Read to the end first to find 見た, saw.' }],
  otherTips: [{ title: 'Entity vs ordinary noun.', body: 'In Koto, 花 is Flower. In ordinary Japanese, 花 means flower / blossom.' }]
};

describe('DialogueLearnCache', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dialogue-learn-cache-'));
    setDataDirForTest(tempDir);
  });

  afterEach(() => {
    resetDataDirForTest();
  });

  it('builds schema-versioned keys from source text and entity signature', () => {
    assert.equal(
      DialogueLearnCache.keyFor('花は森で光を見た。', 'creature:hana:花:Flower:flower / blossom', 1),
      'v1::花は森で光を見た。\n::entities::creature:hana:花:Flower:flower / blossom'
    );
    assert.equal(DialogueLearnCache.keyFor('待って！', '', 2), 'v2::待って！');
  });

  it('stores and reloads valid lessons', () => {
    const cache = new DialogueLearnCache();
    const key = DialogueLearnCache.keyFor('花は森で光を見た。', '', 1);
    cache.set(key, SAMPLE_LESSON, { sourceText: '花は森で光を見た。', entitySignature: '', provider: 'openai', model: 'gpt-5-mini' });

    const filePath = join(tempDir, 'dialogue-learn-cache.json');
    assert.equal(existsSync(filePath), true);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(raw[key].lesson.translation, 'Flower saw a light in the forest.');

    const reloaded = new DialogueLearnCache();
    assert.equal(reloaded.get(key).lesson.translation, 'Flower saw a light in the forest.');
  });

  it('keeps schema versions and entity signatures separate', () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    const plainKey = DialogueLearnCache.keyFor('花は森で光を見た。', '', 1);
    const entityKey = DialogueLearnCache.keyFor('花は森で光を見た。', 'creature:hana:花:Flower:flower / blossom', 1);
    const v2Key = DialogueLearnCache.keyFor('花は森で光を見た。', '', 2);

    cache.set(plainKey, { ...SAMPLE_LESSON, translation: 'The flower saw a light in the forest.' });
    cache.set(entityKey, SAMPLE_LESSON);
    cache.set(v2Key, { ...SAMPLE_LESSON, schemaVersion: 2, translation: 'Version two.' });

    assert.equal(cache.get(plainKey).lesson.translation, 'The flower saw a light in the forest.');
    assert.equal(cache.get(entityKey).lesson.translation, 'Flower saw a light in the forest.');
    assert.equal(cache.get(v2Key).lesson.translation, 'Version two.');
  });

  it('does not write files in memory mode', () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    cache.set(DialogueLearnCache.keyFor('待って！', '', 1), { ...SAMPLE_LESSON, sourceText: '待って！' });
    assert.equal(existsSync(join(tempDir, 'dialogue-learn-cache.json')), false);
  });
});
```

- [ ] **Step 2: Run cache tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/cache.test.js
```

Expected: FAIL because `src/dialogue-learn/cache.js` does not exist.

- [ ] **Step 3: Implement Learn cache**

Create `src/dialogue-learn/cache.js`:

```js
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dataPath } from '../data-dir.js';

const DEFAULT_CACHE_FILE = 'dialogue-learn-cache.json';

export class DialogueLearnCache {
  static keyFor(sourceText, entitySignature = '', schemaVersion = 1) {
    const version = Number.isInteger(schemaVersion) && schemaVersion > 0 ? schemaVersion : 1;
    const text = String(sourceText || '').trim();
    const signature = String(entitySignature || '').trim();
    const base = `v${version}::${text}`;
    return signature ? `${base}\n::entities::${signature}` : base;
  }

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

  get(cacheKey) {
    return this._data[cacheKey] || null;
  }

  set(cacheKey, lesson, {
    sourceText = lesson?.sourceText || cacheKey,
    entitySignature = '',
    provider = '',
    model = ''
  } = {}) {
    const now = new Date().toISOString();
    const previous = this._data[cacheKey] || {};
    const entry = {
      sourceText,
      entitySignature,
      lesson,
      provider,
      model,
      createdAt: previous.createdAt || now,
      updatedAt: now
    };
    this._data[cacheKey] = entry;
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
npm run test:unit -- tests/unit/dialogue-learn/cache.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit cache task**

```bash
git add src/dialogue-learn/cache.js tests/unit/dialogue-learn/cache.test.js
git commit -m "feat(dialogue): cache learn lessons"
```

## Task 2: Strict Learn Schema Validation

**Files:**
- Create: `src/dialogue-learn/schema.js`
- Create: `tests/unit/dialogue-learn/schema.test.js`

- [ ] **Step 1: Write failing schema tests**

Create `tests/unit/dialogue-learn/schema.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARN_LESSON_SCHEMA_VERSION,
  buildLearnEntitySignature,
  normalizeLearnEntities,
  normalizeLearnTokens,
  parseLearnLessonJson,
  validateLearnLesson
} from '../../../src/dialogue-learn/schema.js';

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

function validLesson(overrides = {}) {
  return {
    schemaVersion: LEARN_LESSON_SCHEMA_VERSION,
    sourceText: '花は森で光を見た。',
    pronunciation: { kana: 'はな は もり で ひかり を みた', romaji: 'hana wa mori de hikari o mita' },
    translation: 'Flower saw a light in the forest.',
    tokens: [
      {
        surface: '花',
        reading: 'はな',
        romaji: 'hana',
        baseForm: '花',
        role: 'noun · subject',
        meaning: 'the creature Flower',
        detail: 'Marked as a Koto creature in this sentence.',
        entity: {
          id: 'hana',
          type: 'creature',
          displayName: 'Flower',
          kotoMeaning: 'the creature Flower',
          ordinaryMeaning: 'flower / blossom'
        }
      },
      { surface: 'は', reading: 'は', romaji: 'wa', baseForm: 'は', role: 'topic marker', meaning: 'marks the topic', detail: 'Read 花は as as for Flower.' },
      { surface: '森', reading: 'もり', romaji: 'mori', baseForm: '森', role: 'place noun', meaning: 'forest' },
      { surface: 'で', reading: 'で', romaji: 'de', baseForm: 'で', role: 'location particle', meaning: 'marks where the action happens' },
      { surface: '光', reading: 'ひかり', romaji: 'hikari', baseForm: '光', role: 'object noun', meaning: 'light' },
      { surface: 'を', reading: 'を', romaji: 'o', baseForm: 'を', role: 'object marker', meaning: 'marks what was seen' },
      { surface: '見た', reading: 'みた', romaji: 'mita', baseForm: '見る', role: 'past verb', meaning: 'saw' },
      { surface: '。', reading: '。', romaji: '.', baseForm: '。', role: 'punctuation', meaning: 'sentence ending punctuation' }
    ],
    grammarHints: [
      { title: 'Verb goes last.', body: 'Japanese sentences put the verb at the end. Read to the end first to find 見た, saw.' },
      { title: 'を marks the object.', body: '光を tells you 光 is what got seen.' }
    ],
    otherTips: [
      { title: 'Entity vs ordinary noun.', body: 'In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom.' }
    ],
    ...overrides
  };
}

describe('dialogue learn schema', () => {
  it('normalizes tokens and entities for prompting and validation', () => {
    assert.deepEqual(normalizeLearnTokens(tokens).map(token => token.surface), ['花', 'は', '森', 'で', '光', 'を', '見た', '。']);
    assert.deepEqual(normalizeLearnEntities(entities), [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }]);
  });

  it('builds order-independent entity signatures with ordinary meanings when available', () => {
    const normalizedTokens = normalizeLearnTokens(tokens);
    assert.equal(
      buildLearnEntitySignature(entities, normalizedTokens),
      'creature:hana:花:Flower:flower / blossom'
    );
  });

  it('parses strict JSON without markdown wrappers', () => {
    assert.deepEqual(parseLearnLessonJson(JSON.stringify(validLesson())).sourceText, '花は森で光を見た。');
    assert.equal(parseLearnLessonJson('```json\n{}\n```'), null);
    assert.equal(parseLearnLessonJson('Here is the JSON: {}'), null);
  });

  it('accepts a valid Standard Study Card lesson', () => {
    const result = validateLearnLesson(validLesson(), {
      sourceText: '花は森で光を見た。',
      tokens: normalizeLearnTokens(tokens),
      entities: normalizeLearnEntities(entities)
    });
    assert.deepEqual(result, { ok: true, lesson: validLesson() });
  });

  it('rejects missing, extra, or wrong top-level schema fields', () => {
    const missing = validLesson();
    delete missing.translation;
    assert.equal(validateLearnLesson(missing, { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ extra: true }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ schemaVersion: 999 }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
  });

  it('rejects token mismatches and token count mismatches', () => {
    const badSurface = validLesson();
    badSurface.tokens[0] = { ...badSurface.tokens[0], surface: '猫' };
    assert.equal(validateLearnLesson(badSurface, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities }).ok, false);

    const shortLesson = validLesson({ tokens: validLesson().tokens.slice(0, 2) });
    assert.equal(validateLearnLesson(shortLesson, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities }).ok, false);
  });

  it('rejects extra Japanese examples not present in trusted source data', () => {
    const bad = validLesson({
      grammarHints: [{ title: 'Example.', body: '猫は走った means the cat ran.' }]
    });
    assert.equal(validateLearnLesson(bad, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, false);
  });

  it('requires protected entity lesson data and an entity tip', () => {
    const noEntity = validLesson();
    delete noEntity.tokens[0].entity;
    assert.equal(validateLearnLesson(noEntity, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, false);

    const noTip = validLesson({ otherTips: [{ title: 'Reading habit.', body: 'Scan to 見た first.' }] });
    assert.equal(validateLearnLesson(noTip, { sourceText: '花は森で光を見た。', tokens: normalizeLearnTokens(tokens), entities: normalizeLearnEntities(entities) }).ok, false);
  });

  it('rejects markdown, HTML, filler, quizzes, and SRS instructions in strings', () => {
    assert.equal(validateLearnLesson(validLesson({ translation: '<b>Flower</b> saw a light.' }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ otherTips: [{ title: 'Quiz.', body: 'What does 光 mean?' }] }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
    assert.equal(validateLearnLesson(validLesson({ grammarHints: [{ title: 'N/A', body: 'No notes' }] }), { sourceText: '花は森で光を見た。', tokens, entities }).ok, false);
  });
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/schema.test.js
```

Expected: FAIL because `src/dialogue-learn/schema.js` does not exist.

- [ ] **Step 3: Implement schema constants, normalization, parsing, and validation**

Create `src/dialogue-learn/schema.js`:

```js
export const LEARN_LESSON_SCHEMA_VERSION = 1;
export const LEARN_LESSON_UNAVAILABLE = 'learn_lesson_unavailable';

const TOP_LEVEL_KEYS = ['grammarHints', 'otherTips', 'pronunciation', 'schemaVersion', 'sourceText', 'tokens', 'translation'];
const TOKEN_REQUIRED_KEYS = ['baseForm', 'meaning', 'reading', 'role', 'romaji', 'surface'];
const TOKEN_ALLOWED_KEYS = ['baseForm', 'detail', 'entity', 'meaning', 'reading', 'role', 'romaji', 'surface'];
const ENTITY_KEYS = ['displayName', 'id', 'kotoMeaning', 'ordinaryMeaning', 'type'];
const NOTE_KEYS = ['body', 'title'];
const MAX_TOKENS = 20;
const MAX_ENTITIES = 12;
const MAX_FIELD = 120;
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const JAPANESE_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff]+/gu;
const MARKDOWN_OR_HTML_RE = /```|<\/?[a-z][\s\S]*>|^\s*#{1,6}\s|\[[^\]]+\]\([^)]+\)/i;
const FILLER_RE = /^(?:n\/a|na|none|no notes|tbd|null)$/i;
const QUIZ_OR_SRS_RE = /\b(?:what does|which word|choose|quiz|question|mark .*known|mark .*forgot|srs|flashcard)\b/i;

function clean(value, max = MAX_FIELD) {
  return String(value || '').trim().slice(0, max);
}

function sameKeys(value, expectedKeys) {
  const keys = Object.keys(value || {}).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function hasRequiredAndAllowedKeys(value, requiredKeys, allowedKeys) {
  const keys = Object.keys(value || {});
  return requiredKeys.every(key => keys.includes(key)) && keys.every(key => allowedKeys.includes(key));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeLearnTokens(tokens = []) {
  if (!Array.isArray(tokens)) return [];
  return tokens.slice(0, MAX_TOKENS).map(token => ({
    surface: clean(token?.surface, 80),
    reading: clean(token?.reading || token?.surface, 80),
    baseForm: clean(token?.baseForm || token?.surface, 80),
    pos: clean(token?.pos, 40),
    meaning: clean(token?.meaning, 160),
    entity: token?.entity === true
  })).filter(token => token.surface);
}

export function normalizeLearnEntities(entities = []) {
  if (!Array.isArray(entities)) return [];
  const normalized = [];
  const seen = new Set();
  for (const entity of entities.slice(0, MAX_ENTITIES)) {
    const id = clean(entity?.id, 80);
    const type = clean(entity?.type || 'entity', 40).toLowerCase();
    const surface = clean(entity?.surface, 80);
    const displayName = clean(entity?.displayName, 80);
    if (!id || !surface || !displayName) continue;
    const key = `${type}:${id}:${surface}:${displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ id, type, surface, displayName });
  }
  return normalized;
}

function ordinaryMeaningForEntity(entity, tokens) {
  const token = tokens.find(item => item.surface === entity.surface && item.meaning);
  return token?.meaning || '';
}

export function buildLearnEntitySignature(entities = [], tokens = []) {
  const normalizedTokens = normalizeLearnTokens(tokens);
  return normalizeLearnEntities(entities)
    .map(entity => `${entity.type}:${entity.id}:${entity.surface}:${entity.displayName}:${ordinaryMeaningForEntity(entity, normalizedTokens)}`)
    .sort()
    .join('|');
}

export function parseLearnLessonJson(output) {
  const raw = String(output || '').trim();
  if (!raw || !raw.startsWith('{') || !raw.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function invalid(error) {
  return { ok: false, error: LEARN_LESSON_UNAVAILABLE, reason: error };
}

function validString(value, { min = 1, max = 300, allowJapanese = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) return false;
  if (FILLER_RE.test(text)) return false;
  if (MARKDOWN_OR_HTML_RE.test(text)) return false;
  if (QUIZ_OR_SRS_RE.test(text)) return false;
  if (!allowJapanese && JAPANESE_RE.test(text)) return false;
  return true;
}

function trustedJapaneseRuns(context) {
  const trusted = new Set([context.sourceText]);
  for (const token of context.tokens) {
    trusted.add(token.surface);
    trusted.add(token.reading);
    trusted.add(token.baseForm);
  }
  for (const entity of context.entities) trusted.add(entity.surface);
  return trusted;
}

function hasUntrustedJapanese(text, trusted) {
  const runs = String(text || '').match(JAPANESE_RUN_RE) || [];
  return runs.some(run => !Array.from(trusted).some(value => value && value.includes(run)));
}

function validateJapaneseSafety(lesson, context) {
  const trusted = trustedJapaneseRuns(context);
  const strings = [lesson.translation];
  for (const token of lesson.tokens) strings.push(token.role, token.meaning, token.detail || '');
  for (const hint of lesson.grammarHints) strings.push(hint.title, hint.body);
  for (const tip of lesson.otherTips) strings.push(tip.title, tip.body);
  return strings.every(text => !hasUntrustedJapanese(text, trusted));
}

function entityForToken(token, entities) {
  return entities.find(entity => entity.surface === token.surface);
}

function validateToken(token, trustedToken, context) {
  if (!hasRequiredAndAllowedKeys(token, TOKEN_REQUIRED_KEYS, TOKEN_ALLOWED_KEYS)) return false;
  if (token.surface !== trustedToken.surface || token.reading !== trustedToken.reading || token.baseForm !== trustedToken.baseForm) return false;
  if (!validString(token.romaji, { max: 80, allowJapanese: false })) return false;
  if (!validString(token.role, { max: 60 })) return false;
  if (!validString(token.meaning, { max: 120 })) return false;
  if (token.detail !== undefined && !validString(token.detail, { max: 180 })) return false;

  const entity = entityForToken(trustedToken, context.entities);
  if (entity || trustedToken.entity) {
    if (!isObject(token.entity) || !sameKeys(token.entity, ENTITY_KEYS)) return false;
    if (token.entity.id !== entity?.id || token.entity.type !== entity?.type || token.entity.displayName !== entity?.displayName) return false;
    if (!validString(token.entity.kotoMeaning, { max: 120 }) || !token.entity.kotoMeaning.includes(entity.displayName)) return false;
    const ordinary = ordinaryMeaningForEntity(entity, context.tokens);
    if (ordinary && token.entity.ordinaryMeaning !== ordinary) return false;
  } else if (token.entity !== undefined) {
    return false;
  }
  return true;
}

function validateNotes(notes, { min, max }) {
  if (!Array.isArray(notes) || notes.length < min || notes.length > max) return false;
  return notes.every(note => (
    isObject(note) &&
    sameKeys(note, NOTE_KEYS) &&
    validString(note.title, { max: 80 }) &&
    validString(note.body, { max: 300 })
  ));
}

function hasRequiredEntityTip(lesson, context) {
  if (!context.entities.length) return true;
  return context.entities.every(entity => lesson.otherTips.some(tip => (
    tip.body.includes(entity.surface) &&
    tip.body.includes(entity.displayName) &&
    tip.body.toLowerCase().includes('ordinary')
  )));
}

export function validateLearnLesson(lesson, { sourceText, tokens = [], entities = [] } = {}) {
  const context = {
    sourceText: clean(sourceText, 500),
    tokens: normalizeLearnTokens(tokens),
    entities: normalizeLearnEntities(entities)
  };

  if (!isObject(lesson)) return invalid('not_object');
  if (!sameKeys(lesson, TOP_LEVEL_KEYS)) return invalid('top_level_keys');
  if (lesson.schemaVersion !== LEARN_LESSON_SCHEMA_VERSION) return invalid('schema_version');
  if (lesson.sourceText !== context.sourceText) return invalid('source_text');
  if (!isObject(lesson.pronunciation) || !sameKeys(lesson.pronunciation, ['kana', 'romaji'])) return invalid('pronunciation');
  if (!validString(lesson.pronunciation.kana, { max: 240 })) return invalid('kana');
  if (!validString(lesson.pronunciation.romaji, { max: 240, allowJapanese: false })) return invalid('romaji');
  if (!validString(lesson.translation, { max: 240, allowJapanese: false })) return invalid('translation');
  if (!Array.isArray(lesson.tokens) || lesson.tokens.length !== context.tokens.length) return invalid('tokens_length');
  for (let index = 0; index < context.tokens.length; index += 1) {
    if (!validateToken(lesson.tokens[index], context.tokens[index], context)) return invalid(`token_${index}`);
  }
  if (!validateNotes(lesson.grammarHints, { min: 1, max: 6 })) return invalid('grammar_hints');
  if (!validateNotes(lesson.otherTips, { min: 1, max: 5 })) return invalid('other_tips');
  if (!validateJapaneseSafety(lesson, context)) return invalid('japanese_safety');
  if (!hasRequiredEntityTip(lesson, context)) return invalid('entity_tip');
  return { ok: true, lesson };
}
```

- [ ] **Step 4: Verify schema tests pass**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/schema.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit schema task**

```bash
git add src/dialogue-learn/schema.js tests/unit/dialogue-learn/schema.test.js
git commit -m "feat(dialogue): validate learn lesson schema"
```

## Task 3: Learn Generation Service

**Files:**
- Create: `src/dialogue-learn/service.js`
- Create: `tests/unit/dialogue-learn/service.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/dialogue-learn/service.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueLearnCache } from '../../../src/dialogue-learn/cache.js';
import { LEARN_LESSON_SCHEMA_VERSION } from '../../../src/dialogue-learn/schema.js';
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
    tokens: [
      { surface: '花', reading: 'はな', romaji: 'hana', baseForm: '花', role: 'noun · subject', meaning: 'the creature Flower', detail: 'Marked as a Koto creature in this sentence.', entity: { id: 'hana', type: 'creature', displayName: 'Flower', kotoMeaning: 'the creature Flower', ordinaryMeaning: 'flower / blossom' } },
      { surface: 'は', reading: 'は', romaji: 'wa', baseForm: 'は', role: 'topic marker', meaning: 'marks the topic' },
      { surface: '森', reading: 'もり', romaji: 'mori', baseForm: '森', role: 'place noun', meaning: 'forest' },
      { surface: 'で', reading: 'で', romaji: 'de', baseForm: 'で', role: 'location particle', meaning: 'marks where the action happens' },
      { surface: '光', reading: 'ひかり', romaji: 'hikari', baseForm: '光', role: 'object noun', meaning: 'light' },
      { surface: 'を', reading: 'を', romaji: 'o', baseForm: 'を', role: 'object marker', meaning: 'marks what was seen' },
      { surface: '見た', reading: 'みた', romaji: 'mita', baseForm: '見る', role: 'past verb', meaning: 'saw' },
      { surface: '。', reading: '。', romaji: '.', baseForm: '。', role: 'punctuation', meaning: 'sentence ending punctuation' }
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

  it('builds strict JSON prompts with source, tokens, entities, and schema version', () => {
    const prompts = buildDialogueLearnPrompts({ sourceText: '花は森で光を見た。', tokens, entities });
    assert.match(prompts.systemPrompt, /Return only valid JSON/);
    assert.match(prompts.userPrompt, /schemaVersion/);
    assert.match(prompts.userPrompt, /花は森で光を見た。/);
    assert.match(prompts.userPrompt, /Flower/);
    assert.match(prompts.userPrompt, /Do not add Japanese examples/);
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

  it('fails closed for empty text, missing tokens, missing config, and invalid AI output', async () => {
    const cache = new DialogueLearnCache({ inMemory: true });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '', tokens, entities, cache, chatFn: async () => '{}', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_unavailable' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens: [], entities, cache, chatFn: async () => '{}', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_unavailable' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens, entities, cache, chatFn: async () => JSON.stringify(lesson()), config: null }), { ok: false, error: 'learn_lesson_unavailable' });
    assert.deepEqual(await generateDialogueLearnLesson({ text: '花は森で光を見た。', tokens, entities, cache, chatFn: async () => '{"bad":true}', config: { provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' } }), { ok: false, error: 'learn_lesson_unavailable' });
  });
});
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/service.test.js
```

Expected: FAIL because `src/dialogue-learn/service.js` does not exist.

- [ ] **Step 3: Implement Learn service**

Create `src/dialogue-learn/service.js`:

```js
import { logger } from '../logger.js';
import { DialogueLearnCache } from './cache.js';
import {
  LEARN_LESSON_SCHEMA_VERSION,
  LEARN_LESSON_UNAVAILABLE,
  buildLearnEntitySignature,
  normalizeLearnEntities,
  normalizeLearnTokens,
  parseLearnLessonJson,
  validateLearnLesson
} from './schema.js';

export { LEARN_LESSON_UNAVAILABLE };

export function buildDialogueLearnConfig(env = process.env) {
  const provider = env.DIALOGUE_LEARN_PROVIDER?.trim();
  const apiKey = env.DIALOGUE_LEARN_API_KEY?.trim();
  const model = env.DIALOGUE_LEARN_MODEL?.trim();
  if (!provider || !apiKey || !model) return null;
  return { provider, apiKey, model };
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

export function buildDialogueLearnPrompts({ sourceText, tokens = [], entities = [] }) {
  const normalizedTokens = normalizeLearnTokens(tokens);
  const normalizedEntities = normalizeLearnEntities(entities);
  const schemaTemplate = {
    schemaVersion: LEARN_LESSON_SCHEMA_VERSION,
    sourceText,
    pronunciation: { kana: '', romaji: '' },
    translation: '',
    tokens: normalizedTokens.map(token => ({
      surface: token.surface,
      reading: token.reading,
      romaji: '',
      baseForm: token.baseForm,
      role: '',
      meaning: '',
      detail: ''
    })),
    grammarHints: [{ title: '', body: '' }],
    otherTips: [{ title: '', body: '' }]
  };

  return {
    systemPrompt: 'You are a careful Japanese sentence tutor for a language-learning RPG. Return only valid JSON matching the provided schema. Explain how the given sentence works using concise English. Do not add Japanese examples beyond the provided sentence, token surfaces, readings, base forms, and protected entity surfaces.',
    userPrompt: `Create a Standard Study Card lesson for this Japanese dialogue sentence.

Rules:
- Return JSON only.
- Use schemaVersion ${LEARN_LESSON_SCHEMA_VERSION}.
- Do not include markdown, code fences, HTML, comments, or labels outside JSON.
- Do not add Japanese examples beyond the source sentence, token surfaces, readings, base forms, and protected entity surfaces.
- Do not personalize to known/new word state.
- Do not ask quiz questions or request SRS actions.
- Preserve protected game entities as game entities and explain their ordinary Japanese meaning when supplied by token data.

Source sentence:
${sourceText}

Trusted tokens:
${JSON.stringify(normalizedTokens, null, 2)}

Protected entities:
${JSON.stringify(normalizedEntities, null, 2)}

Required JSON shape:
${JSON.stringify(schemaTemplate, null, 2)}`
  };
}

export async function generateDialogueLearnLesson({
  text,
  tokens = [],
  entities = [],
  cache = new DialogueLearnCache(),
  chatFn,
  config = buildDialogueLearnConfig()
}) {
  const sourceText = String(text || '').trim();
  const normalizedTokens = normalizeLearnTokens(tokens);
  const normalizedEntities = normalizeLearnEntities(entities);
  if (!sourceText || normalizedTokens.length === 0) {
    return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
  }

  const entitySignature = buildLearnEntitySignature(normalizedEntities, normalizedTokens);
  const cacheKey = cache.constructor.keyFor(sourceText, entitySignature, LEARN_LESSON_SCHEMA_VERSION);
  const cached = cache.get(cacheKey);
  if (cached?.lesson?.schemaVersion === LEARN_LESSON_SCHEMA_VERSION) {
    return { ok: true, lesson: cached.lesson, cached: true };
  }

  if (!config?.provider || !config?.apiKey || !config?.model || !chatFn) {
    return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
  }

  const { systemPrompt, userPrompt } = buildDialogueLearnPrompts({ sourceText, tokens: normalizedTokens, entities: normalizedEntities });

  try {
    const raw = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      purpose: 'dialogue-learn',
      ...modelArgsForProvider(config.provider, config.model)
    });

    const parsed = parseLearnLessonJson(raw);
    const validation = validateLearnLesson(parsed, {
      sourceText,
      tokens: normalizedTokens,
      entities: normalizedEntities
    });
    if (!validation.ok) {
      return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
    }

    cache.set(cacheKey, validation.lesson, {
      sourceText,
      entitySignature,
      provider: config.provider,
      model: config.model
    });
    return { ok: true, lesson: validation.lesson, cached: false };
  } catch (error) {
    logger.warn('[DialogueLearn] Lesson generation failed:', error.message);
    return { ok: false, error: LEARN_LESSON_UNAVAILABLE };
  }
}
```

- [ ] **Step 4: Verify service tests pass**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/service.test.js
```

Expected: PASS.

- [ ] **Step 5: Run all Learn backend tests**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/cache.test.js tests/unit/dialogue-learn/schema.test.js tests/unit/dialogue-learn/service.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit service task**

```bash
git add src/dialogue-learn tests/unit/dialogue-learn
git commit -m "feat(dialogue): generate learn lesson JSON"
```

## Task 4: Route And App Wiring

**Files:**
- Modify: `src/routes/dialogue.js`
- Modify: `src/routes/index.js`
- Modify: `src/app.js`
- Modify: `.env.example`
- Create: `tests/unit/routes/dialogue-learn.test.js`

- [ ] **Step 1: Write failing route tests**

Create `tests/unit/routes/dialogue-learn.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { DialogueLearnCache } from '../../../src/dialogue-learn/cache.js';
import { LEARN_LESSON_SCHEMA_VERSION } from '../../../src/dialogue-learn/schema.js';

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
  tokens: [
    { surface: '花', reading: 'はな', romaji: 'hana', baseForm: '花', role: 'noun · subject', meaning: 'the creature Flower', detail: 'Marked as a Koto creature in this sentence.', entity: { id: 'hana', type: 'creature', displayName: 'Flower', kotoMeaning: 'the creature Flower', ordinaryMeaning: 'flower / blossom' } },
    { surface: 'は', reading: 'は', romaji: 'wa', baseForm: 'は', role: 'topic marker', meaning: 'marks the topic' },
    { surface: '森', reading: 'もり', romaji: 'mori', baseForm: '森', role: 'place noun', meaning: 'forest' },
    { surface: 'で', reading: 'で', romaji: 'de', baseForm: 'で', role: 'location particle', meaning: 'marks where the action happens' },
    { surface: '光', reading: 'ひかり', romaji: 'hikari', baseForm: '光', role: 'object noun', meaning: 'light' },
    { surface: 'を', reading: 'を', romaji: 'o', baseForm: 'を', role: 'object marker', meaning: 'marks what was seen' },
    { surface: '見た', reading: 'みた', romaji: 'mita', baseForm: '見る', role: 'past verb', meaning: 'saw' },
    { surface: '。', reading: '。', romaji: '.', baseForm: '。', role: 'punctuation', meaning: 'sentence ending punctuation' }
  ],
  grammarHints: [{ title: 'Verb goes last.', body: 'Japanese sentences put the verb at the end. Read to the end first to find 見た, saw.' }],
  otherTips: [{ title: 'Entity vs ordinary noun.', body: 'In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom.' }]
};

describe('POST /api/dialogue/learn', () => {
  it('requires authentication', async () => {
    const app = createApp({
      routeOverrides: {
        dialogueLearnCache: new DialogueLearnCache({ inMemory: true }),
        dialogueLearnChatFn: async () => JSON.stringify(lesson),
        getDialogueLearnConfig: () => ({ provider: 'openai', apiKey: 'key', model: 'gpt-5-mini' })
      }
    });
    await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities }).expect(401);
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

    const first = await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities }).expect(200);
    const second = await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities }).expect(200);

    assert.equal(first.body.ok, true);
    assert.equal(first.body.cached, false);
    assert.equal(first.body.lesson.translation, 'Flower saw a light in the forest.');
    assert.equal(second.body.cached, true);
    assert.equal(calls, 1);
  });

  it('returns learn_lesson_unavailable for empty text, missing tokens, or missing config', async () => {
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        dialogueLearnCache: new DialogueLearnCache({ inMemory: true }),
        dialogueLearnChatFn: async () => JSON.stringify(lesson),
        getDialogueLearnConfig: () => null
      }
    });

    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: ' ', tokens, entities }).expect(400)).body, { ok: false, error: 'learn_lesson_unavailable' });
    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens: [], entities }).expect(400)).body, { ok: false, error: 'learn_lesson_unavailable' });
    assert.deepEqual((await request(app).post('/api/dialogue/learn').send({ text: '花は森で光を見た。', tokens, entities }).expect(503)).body, { ok: false, error: 'learn_lesson_unavailable' });
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-learn.test.js
```

Expected: FAIL because the route is not wired.

- [ ] **Step 3: Add Learn dependencies to app defaults**

Modify `src/app.js` imports:

```js
import { DialogueLearnCache } from './dialogue-learn/cache.js';
import { buildDialogueLearnConfig } from './dialogue-learn/service.js';
```

Add to `DEFAULT_ROUTE_DEPS` after translation deps:

```js
  dialogueLearnCache: new DialogueLearnCache(),
  dialogueLearnChatFn: chat,
  getDialogueLearnConfig: buildDialogueLearnConfig,
```

- [ ] **Step 4: Pass Learn deps through route index**

Modify `src/routes/index.js` dialogue route wiring:

```js
  router.use('/dialogue', createDialogueRoutes({
    dialogueTranslationCache: deps.dialogueTranslationCache,
    dialogueTranslationChatFn: deps.dialogueTranslationChatFn,
    getDialogueTranslationConfig: deps.getDialogueTranslationConfig,
    dialogueLearnCache: deps.dialogueLearnCache,
    dialogueLearnChatFn: deps.dialogueLearnChatFn,
    getDialogueLearnConfig: deps.getDialogueLearnConfig
  }));
```

- [ ] **Step 5: Add `/api/dialogue/learn` route**

Modify `src/routes/dialogue.js` imports:

```js
import { DialogueLearnCache } from '../dialogue-learn/cache.js';
import {
  LEARN_LESSON_UNAVAILABLE,
  buildDialogueLearnConfig,
  generateDialogueLearnLesson
} from '../dialogue-learn/service.js';
```

Modify `createDialogueRoutes()` signature:

```js
export default function createDialogueRoutes({
  dialogueTranslationCache = new DialogueTranslationCache(),
  dialogueTranslationChatFn = chat,
  getDialogueTranslationConfig = buildDialogueTranslationConfig,
  dialogueLearnCache = new DialogueLearnCache(),
  dialogueLearnChatFn = chat,
  getDialogueLearnConfig = buildDialogueLearnConfig
} = {}) {
```

Add this handler after `/translate`:

```js
  router.post('/learn', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens : [];
    if (!text || tokens.length === 0) {
      return res.status(400).json({ ok: false, error: LEARN_LESSON_UNAVAILABLE });
    }

    const result = await generateDialogueLearnLesson({
      text,
      tokens,
      entities: req.body?.entities,
      cache: dialogueLearnCache,
      chatFn: dialogueLearnChatFn,
      config: getDialogueLearnConfig()
    });

    if (!result.ok) {
      return res.status(503).json(result);
    }

    return res.json(result);
  });
```

- [ ] **Step 6: Add env example entries**

Add to `.env.example` after `DIALOGUE_TRANSLATION_MODEL=`:

```bash

# Dialogue Learn button (master-level server config; set in Railway dev/prod)
DIALOGUE_LEARN_PROVIDER=
DIALOGUE_LEARN_API_KEY=
DIALOGUE_LEARN_MODEL=
```

- [ ] **Step 7: Verify route tests pass**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-learn.test.js
```

Expected: PASS.

- [ ] **Step 8: Run syntax checks**

Run:

```bash
node --check src/app.js && node --check src/routes/index.js && node --check src/routes/dialogue.js
```

Expected: all commands exit with code 0.

- [ ] **Step 9: Commit route task**

```bash
git add src/app.js src/routes/index.js src/routes/dialogue.js .env.example tests/unit/routes/dialogue-learn.test.js
git commit -m "feat(dialogue): add learn lesson endpoint"
```

## Task 5: Client API And Dialogue Card Learn Renderer

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/ui/npc-dialogue-card.js`
- Modify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Update UI test API mock and imports**

Modify `tests/unit/ui/npc-dialogue-card.test.js` mock state near `translationResponse`:

```js
const DEFAULT_LEARN_RESPONSE = {
  ok: true,
  lesson: {
    schemaVersion: 1,
    sourceText: '花は森で光を見た。',
    pronunciation: { kana: 'はな は もり で ひかり を みた', romaji: 'hana wa mori de hikari o mita' },
    translation: 'Flower saw a light in the forest.',
    tokens: [
      { surface: '花', reading: 'はな', romaji: 'hana', baseForm: '花', role: 'noun · subject', meaning: 'the creature Flower', detail: 'Marked as a Koto creature in this sentence.', entity: { id: 'hana', type: 'creature', displayName: 'Flower', kotoMeaning: 'the creature Flower', ordinaryMeaning: 'flower / blossom' } },
      { surface: 'は', reading: 'は', romaji: 'wa', baseForm: 'は', role: 'topic marker', meaning: 'marks the topic' },
      { surface: '森', reading: 'もり', romaji: 'mori', baseForm: '森', role: 'place noun', meaning: 'forest' },
      { surface: 'で', reading: 'で', romaji: 'de', baseForm: 'で', role: 'location particle', meaning: 'marks where the action happens' },
      { surface: '光', reading: 'ひかり', romaji: 'hikari', baseForm: '光', role: 'object noun', meaning: 'light' },
      { surface: 'を', reading: 'を', romaji: 'o', baseForm: 'を', role: 'object marker', meaning: 'marks what was seen' },
      { surface: '見た', reading: 'みた', romaji: 'mita', baseForm: '見る', role: 'past verb', meaning: 'saw' },
      { surface: '。', reading: '。', romaji: '.', baseForm: '。', role: 'punctuation', meaning: 'sentence ending punctuation' }
    ],
    grammarHints: [{ title: 'Verb goes last.', body: 'Japanese sentences put the verb at the end. Read to the end first to find 見た, saw.' }],
    otherTips: [{ title: 'Entity vs ordinary noun.', body: 'In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom.' }]
  },
  cached: false
};
let learnResponse = JSON.parse(JSON.stringify(DEFAULT_LEARN_RESPONSE));
let learnRequests = [];
```

Modify the `public/js/api.js` mock:

```js
    learnDialogue: async (text, tokens = [], entities = []) => {
      learnRequests.push({ text, tokens, entities });
      return learnResponse;
    },
```

Reset in `beforeEach()`:

```js
    learnResponse = JSON.parse(JSON.stringify(DEFAULT_LEARN_RESPONSE));
    learnRequests = [];
```

- [ ] **Step 2: Write failing Learn UI tests**

Append these tests to `tests/unit/ui/npc-dialogue-card.test.js`:

```js
  it('enables Learn for tokenized dialogue and sends source tokens plus entities', async () => {
    showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower / blossom', pos: 'noun', entity: true },
        { surface: 'は', baseForm: 'は', reading: 'は', pos: 'particle' },
        { surface: '森', baseForm: '森', reading: 'もり', meaning: 'forest', pos: 'noun' },
        { surface: 'で', baseForm: 'で', reading: 'で', pos: 'particle' },
        { surface: '光', baseForm: '光', reading: 'ひかり', meaning: 'light', pos: 'noun' },
        { surface: 'を', baseForm: 'を', reading: 'を', pos: 'particle' },
        { surface: '見た', baseForm: '見る', reading: 'みた', meaning: 'saw', pos: 'verb' },
        { surface: '。', pos: 'punctuation' }
      ],
      knownWords: new Set(),
    });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(learnButton.disabled, false);
    learnButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(learnRequests.length, 1);
    assert.equal(learnRequests[0].text, '花は森で光を見た。');
    assert.equal(learnRequests[0].tokens.length, 8);
    assert.deepEqual(learnRequests[0].entities, [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }]);
  });

  it('renders Standard Study Card sections without resolving dialogue', async () => {
    let resolved = false;
    const promise = showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      tokens: [{ surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower / blossom', pos: 'noun', entity: true }],
      knownWords: new Set(),
    }).then(() => { resolved = true; });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    const [continueButton] = actionArea.querySelectorAll('.npc-dialogue-continue');
    learnButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(resolved, false);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn-takeover/);
    assert.match(actionArea.innerHTML, /Sentence/);
    assert.match(actionArea.innerHTML, /Pronunciation/);
    assert.match(actionArea.innerHTML, /Translation/);
    assert.match(actionArea.innerHTML, /Word by word/);
    assert.match(actionArea.innerHTML, /Grammar hints/);
    assert.match(actionArea.innerHTML, /Other tips/);
    assert.match(actionArea.innerHTML, /Flower saw a light in the forest/);
    assert.doesNotMatch(actionArea.innerHTML, /<script/);

    continueButton.click();
    await promise;
  });

  it('renders unavailable Learn state with retry control', async () => {
    learnResponse = { ok: false, error: 'learn_lesson_unavailable' };
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    learnButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /Learn lesson is unavailable right now/);
    assert.match(actionArea.innerHTML, /Try again/);
  });
```

- [ ] **Step 3: Run UI tests to verify failure**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: FAIL because Learn is disabled and `learnDialogue()` does not exist.

- [ ] **Step 4: Add client API helper**

Modify `public/js/api.js` after `translateDialogue()`:

```js
export async function learnDialogue(text, tokens = [], entities = []) {
  try {
    const body = { text, tokens };
    if (Array.isArray(entities) && entities.length) body.entities = entities;

    const response = await fetch(apiUrl('/api/dialogue/learn'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'learn_lesson_unavailable' };
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) onApiFailure();
    return { ok: false, error: 'learn_lesson_unavailable' };
  }
}
```

- [ ] **Step 5: Add Learn helpers to dialogue card**

Modify the import in `public/js/ui/npc-dialogue-card.js`:

```js
import { learnDialogue, translateDialogue } from '../api.js';
```

Add these helpers after `renderTranslationSheet()`:

```js
function renderLessonToken(token = {}) {
  const entity = token.entity ? `
    <div class="npc-dialogue-learn-entity-note">
      <strong>In Koto:</strong> ${esc(token.entity.kotoMeaning || token.entity.displayName || '')}
      <br>
      <strong>Ordinary Japanese:</strong> ${esc(token.entity.ordinaryMeaning || '')}
    </div>
  ` : '';
  return `
    <div class="npc-dialogue-learn-token">
      <div class="npc-dialogue-learn-token-head">
        <span class="npc-dialogue-learn-token-jp">${esc(token.surface || '')}</span>
        <span class="npc-dialogue-learn-token-reading">${esc(token.reading || '')}${token.romaji ? ` · ${esc(token.romaji)}` : ''}</span>
      </div>
      <div class="npc-dialogue-learn-token-body">
        <span class="npc-dialogue-learn-token-role">${esc(token.role || '')}</span>
        <span class="npc-dialogue-learn-token-meaning">${esc(token.meaning || '')}</span>
        ${token.detail ? `<span class="npc-dialogue-learn-token-detail">${esc(token.detail)}</span>` : ''}
        ${entity}
      </div>
    </div>
  `;
}

function renderLessonNotes(notes = []) {
  return (notes || []).map(note => `
    <div class="npc-dialogue-learn-note">
      <h4>${esc(note.title || '')}</h4>
      <p>${esc(note.body || '')}</p>
    </div>
  `).join('');
}

function renderLearnTakeover({ state, sourceText, lesson = null }) {
  const body = state === 'loading'
    ? '<div class="npc-dialogue-learn-status">Building lesson...</div>'
    : state === 'success' && lesson
      ? `
        <section class="npc-dialogue-learn-section">
          <h3>Sentence</h3>
          <p class="npc-dialogue-learn-source">${esc(lesson.sourceText || sourceText)}</p>
        </section>
        <section class="npc-dialogue-learn-section">
          <h3>Pronunciation</h3>
          <p>${esc(lesson.pronunciation?.kana || '')}</p>
          <p class="npc-dialogue-learn-secondary">${esc(lesson.pronunciation?.romaji || '')}</p>
        </section>
        <section class="npc-dialogue-learn-section">
          <h3>Translation</h3>
          <p class="npc-dialogue-learn-translation">${esc(lesson.translation || '')}</p>
        </section>
        <section class="npc-dialogue-learn-section">
          <h3>Word by word</h3>
          <div class="npc-dialogue-learn-token-list">${(lesson.tokens || []).map(renderLessonToken).join('')}</div>
        </section>
        <section class="npc-dialogue-learn-section">
          <h3>Grammar hints</h3>
          ${renderLessonNotes(lesson.grammarHints)}
        </section>
        <section class="npc-dialogue-learn-section">
          <h3>Other tips</h3>
          ${renderLessonNotes(lesson.otherTips)}
        </section>
      `
      : `
        <section class="npc-dialogue-learn-section">
          <p class="npc-dialogue-learn-error">Learn lesson is unavailable right now.</p>
          <button class="npc-dialogue-learn-retry" type="button">Try again</button>
        </section>
      `;

  return `
    <section class="npc-dialogue-learn-takeover" role="dialog" aria-modal="true" aria-label="Learn this sentence">
      <header class="npc-dialogue-learn-header">
        <div>
          <h2>学ぶ / Learn</h2>
          <p>Sentence lesson</p>
        </div>
        <button class="npc-dialogue-learn-close" type="button" aria-label="Close Learn">Done</button>
      </header>
      <div class="npc-dialogue-learn-body">${body}</div>
    </section>
  `;
}
```

- [ ] **Step 6: Wire Learn state and click handler**

Inside `render()`, after `translationEntities`:

```js
      const canLearn = !!sourceText && pageTokens?.length;
```

Change the Learn button disabled attribute:

```js
            <button class="npc-dialogue-utility npc-dialogue-learn" type="button" ${canLearn ? '' : 'disabled'}>
```

After translation helpers, add:

```js
      const closeLearnTakeover = () => {
        actionArea.querySelector('.npc-dialogue-learn-takeover')?.remove();
      };

      const setLearnTakeover = (state, lesson = null) => {
        closeTranslationSheet();
        closeLearnTakeover();
        actionArea.insertAdjacentHTML('beforeend', renderLearnTakeover({ state, sourceText, lesson }));
        actionArea.querySelector('.npc-dialogue-learn-close')?.addEventListener('click', closeLearnTakeover);
        actionArea.querySelector('.npc-dialogue-learn-retry')?.addEventListener('click', requestLearnLesson);
      };

      const requestLearnLesson = async () => {
        if (!sourceText || !pageTokens?.length) return;
        setLearnTakeover('loading');
        const result = await learnDialogue(sourceText, pageTokens, translationEntities);
        if (resolved) return;
        if (result?.ok && result.lesson) {
          setLearnTakeover('success', result.lesson);
          return;
        }
        setLearnTakeover('unavailable');
      };
```

Add the Learn click handler after Translate:

```js
      actionArea.querySelector('.npc-dialogue-learn')?.addEventListener('click', requestLearnLesson);
```

Update Continue click handler to close Learn:

```js
        closeLearnTakeover();
```

- [ ] **Step 7: Verify UI tests pass**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 8: Run syntax checks**

Run:

```bash
node --check public/js/api.js && node --check public/js/ui/npc-dialogue-card.js
```

Expected: both commands exit with code 0.

- [ ] **Step 9: Commit client logic task**

```bash
git add public/js/api.js public/js/ui/npc-dialogue-card.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "feat(dialogue): render learn study card"
```

## Task 6: Learn Full-Screen CSS

**Files:**
- Modify: `public/game.css`
- Test: `tests/unit/ui/npc-dialogue-card.test.js` indirectly verifies class names.

- [ ] **Step 1: Add full-screen Learn styles**

Add this block after the existing `.npc-dialogue-translation-*` styles in `public/game.css`:

```css
.npc-dialogue-learn-takeover {
  position: fixed;
  inset: 0;
  z-index: 2200;
  width: min(100vw, 430px);
  margin: 0 auto;
  background: #fff4dd;
  color: #2c241d;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.38);
}

.npc-dialogue-learn-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: max(14px, env(safe-area-inset-top)) 16px 12px;
  background: #2a2119;
  color: #fff4dd;
  border-bottom: 3px solid #f4d9a5;
}

.npc-dialogue-learn-header h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 22px);
}

.npc-dialogue-learn-header p {
  margin: 2px 0 0;
  color: #e5c98d;
  font-size: 12px;
  font-weight: 800;
}

.npc-dialogue-learn-close,
.npc-dialogue-learn-retry {
  border: 2px solid #f4d9a5;
  border-radius: 12px;
  background: #fff4dd;
  color: #2a2119;
  font-weight: 900;
  padding: 9px 13px;
}

.npc-dialogue-learn-body {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 14px calc(18px + env(safe-area-inset-bottom));
}

.npc-dialogue-learn-section {
  border: 2px solid #d2a85f;
  border-radius: 18px;
  background: #fffaf0;
  padding: 13px;
  margin-bottom: 12px;
}

.npc-dialogue-learn-section h3 {
  margin: 0 0 8px;
  color: #1f1712;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.npc-dialogue-learn-source {
  margin: 0;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1.25;
  font-weight: 900;
  text-align: center;
}

.npc-dialogue-learn-secondary,
.npc-dialogue-learn-status {
  color: rgba(44, 36, 29, 0.72);
}

.npc-dialogue-learn-translation {
  font-size: clamp(17px, 5vw, 21px);
  line-height: 1.35;
  font-weight: 900;
}

.npc-dialogue-learn-token-list {
  display: grid;
  gap: 8px;
}

.npc-dialogue-learn-token {
  border: 1px solid rgba(90, 63, 29, 0.22);
  border-radius: 14px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.55);
}

.npc-dialogue-learn-token-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}

.npc-dialogue-learn-token-jp {
  font-size: 22px;
  font-weight: 900;
}

.npc-dialogue-learn-token-reading,
.npc-dialogue-learn-token-detail {
  color: rgba(44, 36, 29, 0.68);
  font-size: 12px;
}

.npc-dialogue-learn-token-body {
  display: grid;
  gap: 4px;
}

.npc-dialogue-learn-token-role {
  color: #1f5f9e;
  font-weight: 900;
  font-size: 12px;
}

.npc-dialogue-learn-token-meaning {
  font-weight: 800;
}

.npc-dialogue-learn-entity-note {
  margin-top: 4px;
  border-radius: 10px;
  background: #e8f6ea;
  border: 1px solid #9fceb0;
  padding: 8px;
  color: #1f4d31;
  font-size: 12px;
}

.npc-dialogue-learn-note {
  border-left: 3px solid #2d71a8;
  padding-left: 10px;
  margin: 10px 0 0;
}

.npc-dialogue-learn-note h4 {
  margin: 0 0 3px;
  color: #1f1712;
  font-size: 14px;
}

.npc-dialogue-learn-note p,
.npc-dialogue-learn-error {
  margin: 0;
  line-height: 1.45;
}

.npc-dialogue-learn-error {
  margin-bottom: 12px;
  color: #78401f;
  font-weight: 800;
}
```

- [ ] **Step 2: Run UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit CSS task**

```bash
git add public/game.css tests/unit/ui/npc-dialogue-card.test.js
git commit -m "style(dialogue): add learn study card layout"
```

## Task 7: Full Verification And Visual Check

**Files:**
- Verify: all changed files.
- Read before browser work: `docs/playtest-guide.md`.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
npm run test:unit -- tests/unit/dialogue-learn/cache.test.js tests/unit/dialogue-learn/schema.test.js tests/unit/dialogue-learn/service.test.js tests/unit/routes/dialogue-learn.test.js
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend test**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check src/dialogue-learn/cache.js && node --check src/dialogue-learn/schema.js && node --check src/dialogue-learn/service.js && node --check src/routes/dialogue.js && node --check src/routes/index.js && node --check src/app.js && node --check public/js/api.js && node --check public/js/ui/npc-dialogue-card.js
```

Expected: all commands exit with code 0.

- [ ] **Step 4: Run full required test gate**

Run:

```bash
npm test
```

Expected: PASS for Tier 1 and Tier 2.

- [ ] **Step 5: Read playtest guide**

Read `docs/playtest-guide.md` and follow the dialogue-card guidance. Use `npm run dev` and `http://localhost:5173`, not `npm start` or port `3000`.

- [ ] **Step 6: Start dev server if needed**

Inspect the terminals folder for an existing `npm run dev`. If none is running, run:

```bash
npm run dev
```

Expected: Vite reports a local URL on port `5173`.

- [ ] **Step 7: Verify local server responds**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 8: Ask before opening browser tooling**

Project rules require asking before launching Playwright/browser automation. Ask the user for permission before opening a browser.

- [ ] **Step 9: Visual verify Learn takeover**

After user approval, use browser tooling to reach a tokenized dialogue card. Click `Learn`.

Expected:

- full-screen Learn takeover opens,
- section order is `Sentence`, `Pronunciation`, `Translation`, `Word by word`, `Grammar hints`, `Other tips`,
- protected entity note distinguishes Koto meaning from ordinary Japanese meaning,
- `Done` returns to the same dialogue card,
- `Continue` remains the only action that advances dialogue.

- [ ] **Step 10: Remove screenshots if any are written**

If screenshot files are written into the repo, delete the exact returned paths before ending the task.

- [ ] **Step 11: Final git status review**

Run:

```bash
git status --short
```

Expected: only intentional source, test, CSS, spec, and plan files are modified.

## Self-Review Notes

- Spec coverage: This plan covers Standard Study Card section order, strict JSON validation, no extra Japanese examples, protected entity handling, global cache keying by source/entity/schema, route wiring, client rendering, tests, and visual verification.
- Placeholder scan: This plan contains exact file paths, code snippets, commands, expected results, and commit messages. It does not use incomplete implementation placeholders.
- Type consistency: Request entities use `{ id, type, surface, displayName }`; Learn cache entries store `{ sourceText, entitySignature, lesson, provider, model, createdAt, updatedAt }`; Learn lessons use `schemaVersion`, `sourceText`, `pronunciation`, `translation`, `tokens`, `grammarHints`, and `otherTips` throughout.

