import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createTestTmpDir } from '../helpers/tmp.js';
import { loadWordDictionary } from '../../src/game/word-dictionary.js';

describe('word-dictionary', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await createTestTmpDir();
    // Write a minimal live dictionary
    writeFileSync(join(tmpDir.path, 'live-dictionary.json'), JSON.stringify({
      '遊ぶ': { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] },
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }, { en: 'Tuesday' }] },
      '一緒': { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] },
    }));
    // Write minimal game data that overlays
    writeFileSync(join(tmpDir.path, 'creatures.json'), JSON.stringify({
      hi: { id: 'hi', name: '火', nameEn: 'Hi', reading: 'ひ', meaning: 'fire' }
    }));
    mkdirSync(join(tmpDir.path, 'cooking'));
    writeFileSync(join(tmpDir.path, 'cooking', 'ingredients.json'), JSON.stringify([
      { id: 'saba', word: 'サバ', reading: 'サバ', nameEn: 'Mackerel', meaning: 'mackerel' }
    ]));
  });

  afterEach(async () => { await tmpDir.cleanup(); });

  function loadFixture() {
    return loadWordDictionary({
      overlayDir: tmpDir.path,
      liveDictPath: join(tmpDir.path, 'live-dictionary.json'),
    });
  }

  it('loads base dictionary entries from liveDictPath', () => {
    const dict = loadFixture();
    assert.ok(dict.has('遊ぶ'));
    assert.equal(dict.get('遊ぶ').reading, 'あそぶ');
    assert.equal(dict.get('遊ぶ').definitions[0].en, 'to play');
  });

  it('overlays game data definitions over base dictionary', () => {
    const dict = loadFixture();
    const hi = dict.get('火');
    assert.ok(hi);
    assert.equal(hi.definitions[0].en, 'fire');
    assert.equal(hi.definitions[0].primary, true);
  });

  it('returns empty map if liveDictPath missing', () => {
    const dict = loadWordDictionary({
      overlayDir: tmpDir.path,
      liveDictPath: join(tmpDir.path, 'nonexistent.json'),
    });
    assert.equal(dict.size, 2); // still loads overlays from game data files
  });

  it('loads glue-words overlay', () => {
    writeFileSync(join(tmpDir.path, 'glue-words.json'), JSON.stringify([
      { word: 'わたし', reading: 'わたし', en: 'I/me', priority: 1 }
    ]));
    const dict = loadFixture();
    assert.ok(dict.has('わたし'));
    assert.equal(dict.get('わたし').definitions[0].en, 'I/me');
  });

  it('loads cooking ingredients as game data overlays', () => {
    const dict = loadFixture();
    assert.deepEqual(dict.get('サバ'), {
      reading: 'サバ',
      definitions: [{ en: 'mackerel', primary: true }],
    });
  });

  it('does not load creature-speech (dialogue, not entity data)', () => {
    writeFileSync(join(tmpDir.path, 'creature-speech.json'), JSON.stringify({
      onHit: [{ jp: '痛い', reading: 'いたい', en: 'Ouch!', romaji: 'itai' }]
    }));
    const dict = loadFixture();
    assert.ok(!dict.has('痛い'), 'creature-speech entries should not be in word dictionary');
  });
});
