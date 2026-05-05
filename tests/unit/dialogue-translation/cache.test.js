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
});
