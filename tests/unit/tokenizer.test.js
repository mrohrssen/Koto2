// tests/unit/tokenizer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/tokenizer.js';

describe('tokenizer', () => {
  it('tokenizes a simple greeting', () => {
    const tokens = tokenize('こんにちは');
    assert.ok(Array.isArray(tokens));
    assert.ok(tokens.length >= 1);
    const greeting = tokens.find(t => t.surface === 'こんにちは');
    assert.ok(greeting, 'should find こんにちは token');
    assert.equal(typeof greeting.baseForm, 'string');
    assert.equal(typeof greeting.pos, 'string');
    assert.equal(typeof greeting.reading, 'string');
  });

  it('resolves conjugated forms to dictionary form', () => {
    const tokens = tokenize('遊んで');
    const verb = tokens.find(t => t.baseForm === '遊ぶ');
    assert.ok(verb, 'should resolve 遊んで to baseForm 遊ぶ');
  });

  it('separates particles from content words', () => {
    const tokens = tokenize('一緒に遊ぶ');
    const surfaces = tokens.map(t => t.surface);
    assert.ok(surfaces.includes('一緒'), 'should have 一緒');
    assert.ok(surfaces.includes('に'), 'should have に');
    assert.ok(surfaces.includes('遊ぶ'), 'should have 遊ぶ');
  });

  it('handles punctuation', () => {
    const tokens = tokenize('すごい！');
    const punct = tokens.find(t => t.surface === '！');
    assert.ok(punct, 'should have punctuation token');
  });

  it('returns empty array for empty string', () => {
    const tokens = tokenize('');
    assert.deepEqual(tokens, []);
  });

  it('returns empty array for whitespace-only string', () => {
    const tokens = tokenize('   ');
    assert.deepEqual(tokens, []);
  });

  it('provides hiragana readings (not katakana)', () => {
    const tokens = tokenize('遊ぶ');
    const verb = tokens.find(t => t.surface === '遊ぶ');
    assert.ok(verb, 'should find 遊ぶ');
    assert.equal(verb.reading, 'あそぶ', 'reading should be hiragana');
  });

  it('provides correct POS for different word types', () => {
    const tokens = tokenize('猫が走る');
    const noun = tokens.find(t => t.surface === '猫');
    const particle = tokens.find(t => t.surface === 'が');
    const verb = tokens.find(t => t.surface === '走る');
    assert.ok(noun, 'should find noun 猫');
    assert.equal(noun.pos, '名詞');
    assert.ok(particle, 'should find particle が');
    assert.equal(particle.pos, '助詞');
    assert.ok(verb, 'should find verb 走る');
    assert.equal(verb.pos, '動詞');
  });
});
