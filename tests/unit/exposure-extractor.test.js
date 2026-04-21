import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractExposureEntries } from '../../public/js/shared/exposure-extractor.js';

const wordDict = new Map([
  ['遊ぶ', { definitions: [{ en: 'to play', primary: true }] }],
  ['一緒', { definitions: [{ en: 'together' }, { en: 'togetherness', primary: true }] }],
  ['犬', { definitions: [{ en: 'dog' }] }],
]);

describe('extractExposureEntries', () => {
  it('extracts one exposure per qualifying content token', () => {
    const tokens = [
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
      { surface: '一緒', base: '一緒', pos: '名詞', reading: 'いっしょ' },
    ];

    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, {}),
      [
        { word: '遊ぶ', meaning: 'to play' },
        { word: '一緒', meaning: 'togetherness' },
      ]
    );
  });

  it('resolves meaning from token, then override, then dictionary, then empty string', () => {
    const tokens = [
      { surface: '猫', base: '猫', pos: '名詞', meaning: 'cat from token' },
      { surface: '犬', baseForm: '犬', pos: '名詞' },
      { surface: '鳥', base: '鳥', pos: '名詞' },
    ];

    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, { 犬: 'dog from override' }),
      [
        { word: '猫', meaning: 'cat from token' },
        { word: '犬', meaning: 'dog from override' },
        { word: '鳥', meaning: '' },
      ]
    );
  });

  it('skips tokens with no base or baseForm', () => {
    const tokens = [
      { surface: 'を' },
      { surface: '！', pos: '補助記号' },
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
    ];

    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, {}),
      [{ word: '遊ぶ', meaning: 'to play' }]
    );
  });
});
