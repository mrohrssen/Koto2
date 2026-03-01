import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBootstrapText, extractTaggedWords } from '../../../src/game/bootstrap-parser.js';

describe('Bootstrap Parser - parseBootstrapText', () => {
  it('parses tagged word into segments', () => {
    const result = parseBootstrapText('A cold {wind|風|かぜ|kaze} blew.');
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { type: 'text', content: 'A cold ' });
    assert.deepStrictEqual(result[1], {
      type: 'word',
      english: 'wind',
      kanji: '風',
      hiragana: 'かぜ',
      romaji: 'kaze'
    });
    assert.deepStrictEqual(result[2], { type: 'text', content: ' blew.' });
  });

  it('handles multiple tagged words', () => {
    const result = parseBootstrapText('{water|水|みず|mizu} and {fire|火|ひ|hi}');
    const words = result.filter(s => s.type === 'word');
    assert.strictEqual(words.length, 2);
    assert.strictEqual(words[0].kanji, '水');
    assert.strictEqual(words[1].kanji, '火');
  });

  it('handles text with no tags', () => {
    const result = parseBootstrapText('Just plain English.');
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { type: 'text', content: 'Just plain English.' });
  });

  it('handles hiragana-only words (kanji = hiragana)', () => {
    const result = parseBootstrapText('You {go|いく|いく|iku} now.');
    const word = result.find(s => s.type === 'word');
    assert.strictEqual(word.kanji, 'いく');
    assert.strictEqual(word.hiragana, 'いく');
  });

  it('handles adjacent tags', () => {
    const result = parseBootstrapText('{big|大きい|おおきい|ookii}{mountain|山|やま|yama}');
    const words = result.filter(s => s.type === 'word');
    assert.strictEqual(words.length, 2);
  });

  it('ignores malformed tags (missing fields)', () => {
    const result = parseBootstrapText('A {broken|tag} here.');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'text');
    assert.strictEqual(result[0].content, 'A {broken|tag} here.');
  });
});

describe('Bootstrap Parser - extractTaggedWords', () => {
  it('extracts kanji from all tagged words', () => {
    const words = extractTaggedWords('A {wind|風|かぜ|kaze} and {water|水|みず|mizu}.');
    assert.deepStrictEqual(words, ['風', '水']);
  });

  it('returns empty array for text with no tags', () => {
    const words = extractTaggedWords('Plain text.');
    assert.deepStrictEqual(words, []);
  });
});
