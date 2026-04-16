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
    // Write a minimal base dictionary
    writeFileSync(join(tmpDir.path, 'dictionary.json'), JSON.stringify({
      '遊ぶ': { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] },
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }, { en: 'Tuesday' }] },
      '一緒': { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] },
    }));
    // Write minimal game data that overlays
    writeFileSync(join(tmpDir.path, 'creatures.json'), JSON.stringify({
      hi: { id: 'hi', name: '火', nameEn: 'Hi', baseWord: '火', baseReading: 'ひ', baseMeaning: 'fire' }
    }));
  });

  afterEach(async () => { await tmpDir.cleanup(); });

  it('loads base dictionary entries', () => {
    const dict = loadWordDictionary(tmpDir.path);
    assert.ok(dict.has('遊ぶ'));
    assert.equal(dict.get('遊ぶ').reading, 'あそぶ');
    assert.equal(dict.get('遊ぶ').definitions[0].en, 'to play');
  });

  it('overlays game data definitions over base dictionary', () => {
    const dict = loadWordDictionary(tmpDir.path);
    const hi = dict.get('火');
    assert.ok(hi);
    assert.equal(hi.definitions[0].en, 'fire');
    assert.equal(hi.definitions[0].primary, true);
  });

  it('returns empty map if dictionary file missing', () => {
    const dict = loadWordDictionary(join(tmpDir.path, 'nonexistent'));
    assert.equal(dict.size, 0);
  });

  it('loads glue-words overlay', () => {
    writeFileSync(join(tmpDir.path, 'glue-words.json'), JSON.stringify([
      { word: 'わたし', reading: 'わたし', en: 'I/me', priority: 1 }
    ]));
    const dict = loadWordDictionary(tmpDir.path);
    assert.ok(dict.has('わたし'));
    assert.equal(dict.get('わたし').definitions[0].en, 'I/me');
  });

  it('does not load creature-speech (dialogue, not entity data)', () => {
    writeFileSync(join(tmpDir.path, 'creature-speech.json'), JSON.stringify({
      onHit: [{ jp: '痛い', reading: 'いたい', en: 'Ouch!', romaji: 'itai' }]
    }));
    const dict = loadWordDictionary(tmpDir.path);
    assert.ok(!dict.has('痛い'), 'creature-speech entries should not be in word dictionary');
  });
});
