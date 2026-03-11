// tests/unit/bootstrap-parser.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaggedText } from '../../src/game/bootstrap/parser.js';

describe('parseTaggedText', () => {
  it('returns plain text as a single segment', () => {
    const result = parseTaggedText('Hello world');
    assert.deepStrictEqual(result, [
      { type: 'text', content: 'Hello world' }
    ]);
  });

  it('parses a single tagged word with all fields', () => {
    const result = parseTaggedText('Choose a {monster|モンスター|もんすたー} to train');
    assert.deepStrictEqual(result, [
      { type: 'text', content: 'Choose a ' },
      { type: 'word', english: 'monster', kanji: 'モンスター', reading: 'もんすたー' },
      { type: 'text', content: ' to train' }
    ]);
  });

  it('parses tagged word with empty reading (katakana words)', () => {
    const result = parseTaggedText('{CRITICAL HIT|クリティカル|}');
    assert.deepStrictEqual(result, [
      { type: 'word', english: 'CRITICAL HIT', kanji: 'クリティカル', reading: '' }
    ]);
  });

  it('parses multiple tagged words', () => {
    const result = parseTaggedText('{heal|回復|かいふく} all {creatures|生き物|いきもの}');
    assert.equal(result.length, 3);
    assert.equal(result[0].type, 'word');
    assert.equal(result[0].english, 'heal');
    assert.equal(result[1].type, 'text');
    assert.equal(result[1].content, ' all ');
    assert.equal(result[2].type, 'word');
    assert.equal(result[2].english, 'creatures');
  });

  it('returns empty array for empty string', () => {
    const result = parseTaggedText('');
    assert.deepStrictEqual(result, []);
  });

  it('handles adjacent tags with no separator', () => {
    const result = parseTaggedText('{fire|火|ひ}{water|水|みず}');
    assert.equal(result.length, 2);
    assert.equal(result[0].kanji, '火');
    assert.equal(result[1].kanji, '水');
  });

  it('does not match interpolation tokens like {0} or {1}', () => {
    const result = parseTaggedText('{0} deals {1} {damage|ダメージ|}');
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'text');
    assert.equal(result[0].content, '{0} deals {1} ');
    assert.equal(result[1].type, 'word');
    assert.equal(result[1].english, 'damage');
  });
});
