import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichTokens } from '../../src/game/enrich-tokens.js';

describe('dict edit propagation', () => {
  it('enrichTokens reflects the current dict primary definition', () => {
    const dict = new Map([
      ['雨', { reading: 'あめ', definitions: [{ en: 'rain', primary: true }] }],
    ]);
    const tokens = [{ surface: '雨', base: '雨', reading: 'あめ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, 'rain');
  });

  it('a subsequent dict with a changed primary yields the new meaning', () => {
    const tokens = [{ surface: '雨', base: '雨', reading: 'あめ', pos: '名詞' }];
    const newDict = new Map([
      ['雨', { reading: 'あめ', definitions: [{ en: 'precipitation', primary: true }] }],
    ]);
    const out = enrichTokens(tokens, {}, newDict);
    assert.equal(out[0].meaning, 'precipitation');
  });

  it('live-dict-only word (not in any frame) gets enriched', () => {
    const obscureDict = new Map([
      ['碑', { reading: 'ひ', definitions: [{ en: 'monument', primary: true }] }],
    ]);
    const tokens = [{ surface: '碑', base: '碑', reading: 'ひ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, obscureDict);
    assert.equal(out[0].meaning, 'monument');
  });
});
