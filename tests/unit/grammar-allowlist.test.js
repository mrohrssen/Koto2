import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadGrammarAllowlist,
  clearGrammarAllowlistCache,
  isGrammarToken,
  getAllowedSurfaceSet
} from '../../src/game/grammar-allowlist.js';

describe('grammar allowlist data', () => {
  beforeEach(() => clearGrammarAllowlistCache());

  it('loads the three lists', () => {
    const list = loadGrammarAllowlist();
    assert.ok(list.demotedPos.includes('接尾辞'));
    assert.ok(list.demotedBaseForms.includes('くださる'));
    assert.ok(list.allowedSurfaces.includes('こと'));
  });

  it('question words 何/どう/どこ/誰/いつ are NOT free; なぜ/どれ/どの still are', () => {
    const surfaces = getAllowedSurfaceSet();
    for (const w of ['何', 'なに', 'どう', 'どこ', 'いつ', '誰', 'だれ']) {
      assert.equal(surfaces.has(w), false, `${w} must not be free`);
    }
    for (const w of ['なぜ', 'どれ', 'どの']) {
      assert.equal(surfaces.has(w), true, `${w} stays free`);
    }
  });
});

describe('isGrammarToken', () => {
  it('demotes by POS (incl. honorific suffixes)', () => {
    assert.equal(isGrammarToken({ surface: 'さん', baseForm: 'さん', pos: '接尾辞' }), true);
    assert.equal(isGrammarToken({ surface: 'を', baseForm: 'を', pos: '助詞' }), true);
  });

  it('demotes kana auxiliaries and くださる by base form', () => {
    assert.equal(isGrammarToken({ surface: 'ください', baseForm: 'くださる', pos: '動詞' }), true);
    assert.equal(isGrammarToken({ surface: 'みて', baseForm: 'みる', pos: '動詞' }), true);
    assert.equal(isGrammarToken({ surface: 'なった', baseForm: 'なる', pos: '動詞' }), true);
  });

  it('demotes by surface or base match against allowedSurfaces', () => {
    assert.equal(isGrammarToken({ surface: 'ああ', baseForm: 'ああ', pos: '感動詞' }), true);
    assert.equal(isGrammarToken({ surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞' }), true);
  });

  it('keeps real vocabulary as content', () => {
    assert.equal(isGrammarToken({ surface: '猫', baseForm: '猫', pos: '名詞' }), false);
    assert.equal(isGrammarToken({ surface: '何', baseForm: '何', pos: '代名詞' }), false);
    assert.equal(isGrammarToken({ surface: 'ごめん', baseForm: 'ごめん', pos: '感動詞' }), false);
    assert.equal(isGrammarToken({ surface: '行く', baseForm: '行く', pos: '動詞' }), false);
    assert.equal(isGrammarToken({ surface: '来る', baseForm: '来る', pos: '動詞' }), false);
  });
});
