import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichTokens } from '../../src/game/enrich-tokens.js';

const dict = new Map([
  ['遊ぶ', { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] }],
  ['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }, { en: 'hound' }] }],
  ['茶', { reading: 'ちゃ', definitions: [{ en: 'tea', primary: true }] }],
]);

describe('enrichTokens', () => {
  it('stamps .meaning on each content token via the priority chain', () => {
    const tokens = [
      { surface: '遊ぶ', base: '遊ぶ', reading: 'あそぶ', pos: '動詞' },
      { surface: '！', pos: '記号' },
    ];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, 'to play');
    assert.equal(out[1].meaning, undefined, 'punctuation untouched');
  });

  it('stamps .meanings (full definitions) on content tokens with a dict entry', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, dict);
    assert.deepEqual(out[0].meanings, [{ en: 'dog', primary: true }, { en: 'hound' }]);
  });

  it('omits .meanings when no dict entry exists', () => {
    const tokens = [{ surface: 'XYZ', base: 'XYZ', reading: 'XYZ', pos: '名詞' }];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, '');
    assert.equal('meanings' in out[0], false);
  });

  it('honors overrides over dict', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }];
    const out = enrichTokens(tokens, { 犬: 'pup (context)' }, dict);
    assert.equal(out[0].meaning, 'pup (context)');
  });

  it('preserves entity.meaning over dict', () => {
    const tokens = [
      { surface: '茶', base: '茶', reading: 'ちゃ', meaning: 'Chachamaru', entity: true },
    ];
    const out = enrichTokens(tokens, {}, dict);
    assert.equal(out[0].meaning, 'Chachamaru');
  });

  it('does not mutate the input tokens', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' }];
    const frozen = tokens.map(t => Object.freeze({ ...t }));
    enrichTokens(frozen, {}, dict);
    assert.equal(frozen[0].meaning, undefined);
  });

  it('returns non-array input unchanged', () => {
    assert.equal(enrichTokens(null, {}, dict), null);
    assert.equal(enrichTokens(undefined, {}, dict), undefined);
  });

  it('tolerates an undefined dict (meaning stays from token.meaning or empty)', () => {
    const tokens = [
      { surface: '犬', base: '犬', reading: 'いぬ', pos: '名詞' },
      { surface: '茶', base: '茶', reading: 'ちゃ', meaning: 'Tea-mon', entity: true },
    ];
    const out = enrichTokens(tokens, {}, undefined);
    assert.equal(out[0].meaning, '');
    assert.equal(out[1].meaning, 'Tea-mon');
  });
});
