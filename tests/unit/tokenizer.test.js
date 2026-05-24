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

  it('preserves top-level pos while adding full Sudachi POS fields', () => {
    const tokens = tokenize('読んでいる。');
    const verb = tokens.find(t => t.surface === '読ん');
    assert.ok(verb, 'should find conjugated verb token');
    assert.equal(verb.pos, '動詞');
    assert.equal(verb.pos0, '動詞');
    assert.equal(verb.pos1, '一般');
    assert.equal(verb.pos4, '五段-マ行');
    assert.equal(verb.pos5, '連用形-撥音便');
    assert.equal(verb.conjugationType, '五段-マ行');
    assert.equal(verb.conjugationForm, '連用形-撥音便');
    assert.equal(verb.normalizedForm, '読む');
    assert.equal(verb.index, 0);
  });

  it('keeps raw particle readings for grammar UI overrides', () => {
    const tokens = tokenize('本を読んでいる。');
    const wo = tokens.find(t => t.surface === 'を');
    assert.ok(wo, 'should find を');
    assert.equal(wo.pos0, '助詞');
    assert.equal(wo.reading, 'を');

    const heTokens = tokenize('東京へ行く。');
    const he = heTokens.find(t => t.surface === 'へ');
    assert.ok(he, 'should find へ');
    assert.equal(he.reading, 'へ');
  });

  it('produces correct baseForm for こんにちは (not 今日は)', () => {
    const tokens = tokenize('こんにちは');
    const greeting = tokens.find(t => t.surface === 'こんにちは');
    assert.equal(greeting.baseForm, 'こんにちは', 'baseForm should be こんにちは, not 今日は');
  });

  it('produces correct baseForm for 好き (not 隙)', () => {
    const tokens = tokenize('私はここが好き');
    const suki = tokens.find(t => t.surface === '好き');
    assert.equal(suki.baseForm, '好き', 'baseForm should be 好き, not 隙');
  });

  it('produces correct baseForm for おはよう (not 御早う)', () => {
    const tokens = tokenize('おはよう');
    const greeting = tokens.find(t => t.surface === 'おはよう');
    assert.equal(greeting.baseForm, 'おはよう', 'baseForm should be おはよう, not 御早う');
  });

  // ── Complex sentence tests ──

  it('handles katakana loanwords', () => {
    const tokens = tokenize('コーヒーを飲みたい');
    const coffee = tokens.find(t => t.surface === 'コーヒー');
    assert.ok(coffee, 'should find katakana loanword コーヒー');
    assert.equal(coffee.pos, '名詞');
    assert.equal(coffee.baseForm, 'コーヒー');
    const drink = tokens.find(t => t.baseForm === '飲む');
    assert.ok(drink, 'should resolve 飲み to baseForm 飲む');
  });

  it('splits compound verb 追いかける in Mode A', () => {
    const tokens = tokenize('大きい猫が小さい犬を追いかけている');
    const chase1 = tokens.find(t => t.baseForm === '追う');
    const chase2 = tokens.find(t => t.baseForm === 'かける');
    assert.ok(chase1, 'Mode A should split 追いかけ into 追う');
    assert.ok(chase2, 'Mode A should split 追いかけ into かける');
  });

  it('identifies い-adjectives as 形容詞', () => {
    const tokens = tokenize('大きい猫が小さい犬を追いかけている');
    const big = tokens.find(t => t.surface === '大きい');
    const small = tokens.find(t => t.surface === '小さい');
    assert.equal(big.pos, '形容詞');
    assert.equal(small.pos, '形容詞');
  });

  it('resolves past tense to dictionary form', () => {
    const tokens = tokenize('昨日友達と映画を見に行った');
    const go = tokens.find(t => t.baseForm === '行く');
    assert.ok(go, 'should resolve 行った to baseForm 行く');
    const see = tokens.find(t => t.baseForm === '見る');
    assert.ok(see, 'should resolve 見 to baseForm 見る');
  });

  it('handles quoted speech with な-adjective', () => {
    const tokens = tokenize('「ここは静かですね」と彼女が言った');
    const quiet = tokens.find(t => t.surface === '静か');
    assert.ok(quiet, 'should find な-adjective 静か');
    assert.equal(quiet.pos, '形状詞', 'な-adjective should be 形状詞');
    const say = tokens.find(t => t.baseForm === '言う');
    assert.ok(say, 'should resolve 言った to baseForm 言う');
    const openQuote = tokens.find(t => t.surface === '「');
    assert.equal(openQuote.pos, '補助記号', 'quote marks should be 補助記号');
  });

  it('handles potential form and conditional', () => {
    const tokens = tokenize('食べられる花もあれば食べられない花もある');
    const eatTokens = tokens.filter(t => t.baseForm === '食べる');
    assert.equal(eatTokens.length, 2, 'should find 食べる twice');
    const flower = tokens.filter(t => t.surface === '花');
    assert.equal(flower.length, 2, 'should find 花 twice');
    const exist = tokens.find(t => t.baseForm === 'ある' && t.pos === '動詞');
    assert.ok(exist, 'should find ある as 動詞');
  });

  it('handles counters and location phrases', () => {
    const tokens = tokenize('三匹の猫が屋根の上で寝ている');
    const three = tokens.find(t => t.surface === '三');
    assert.equal(three.pos, '名詞');
    const counter = tokens.find(t => t.surface === '匹');
    assert.equal(counter.pos, '接尾辞', 'counter 匹 should be 接尾辞');
    const roof = tokens.find(t => t.surface === '屋根');
    assert.equal(roof.pos, '名詞');
    assert.equal(roof.reading, 'やね');
    const sleep = tokens.find(t => t.baseForm === '寝る');
    assert.ok(sleep, 'should resolve 寝 to baseForm 寝る');
  });
});
