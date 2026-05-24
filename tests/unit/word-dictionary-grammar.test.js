import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadWordDictionary } from '../../src/game/word-dictionary.js';

describe('word dictionary grammar migration', () => {
  it('does not load grammar-words.json as vocabulary definitions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-dict-'));
    const liveDictPath = join(dir, 'dictionary.json');
    writeFileSync(liveDictPath, '{}', 'utf-8');
    writeFileSync(join(dir, 'grammar-words.json'), JSON.stringify([
      { word: 'は', reading: 'は', en: 'topic marker' }
    ]), 'utf-8');

    const dict = loadWordDictionary({ overlayDir: dir, liveDictPath });
    assert.equal(dict.has('は'), false);
  });

  it('still loads non-grammar curriculum words from curriculum-words.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koto-dict-'));
    const liveDictPath = join(dir, 'dictionary.json');
    writeFileSync(liveDictPath, '{}', 'utf-8');
    writeFileSync(join(dir, 'curriculum-words.json'), JSON.stringify([
      { word: 'こんにちは', reading: 'こんにちは', en: 'hello' }
    ]), 'utf-8');

    const dict = loadWordDictionary({ overlayDir: dir, liveDictPath });
    assert.equal(dict.get('こんにちは')?.definitions?.[0]?.en, 'hello');
  });
});
