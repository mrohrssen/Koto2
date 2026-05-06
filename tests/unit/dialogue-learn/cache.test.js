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
