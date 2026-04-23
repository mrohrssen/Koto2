import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExposureEntries,
  resolveExposureMeaning,
  lookupDictPrimary,
} from '../../public/js/shared/exposure-extractor.js';

const wordDict = new Map([
  ['遊ぶ', { definitions: [{ en: 'to play', primary: true }] }],
  ['一緒', { definitions: [{ en: 'together' }, { en: 'togetherness', primary: true }] }],
  ['犬', { definitions: [{ en: 'dog' }] }],
  ['茶', { definitions: [{ en: 'tea', primary: true }] }],
]);

describe('lookupDictPrimary', () => {
  it('returns the primary definition from a dict entry', () => {
    assert.equal(lookupDictPrimary(wordDict, '遊ぶ'), 'to play');
  });

  it('falls back to definitions[0] when no entry is marked primary', () => {
    assert.equal(lookupDictPrimary(wordDict, '犬'), 'dog');
  });

  it('returns empty string when word is absent', () => {
    assert.equal(lookupDictPrimary(wordDict, '未知'), '');
  });

  it('accepts a plain object as a dict-shaped map', () => {
    const dictObj = { 火: { definitions: [{ en: 'fire', primary: true }] } };
    assert.equal(lookupDictPrimary(dictObj, '火'), 'fire');
  });

  it('returns empty string for null/undefined dict', () => {
    assert.equal(lookupDictPrimary(null, '火'), '');
    assert.equal(lookupDictPrimary(undefined, '火'), '');
  });
});

describe('resolveExposureMeaning priority', () => {
  it('override beats entity beats token.meaning beats dict', () => {
    const token = { base: '茶', entity: true, meaning: 'Chachamaru' };
    assert.equal(
      resolveExposureMeaning(token, wordDict, { 茶: 'tea (override)' }),
      'tea (override)'
    );
  });

  it('entity wins over dict when no override', () => {
    const token = { base: '茶', entity: true, meaning: 'Chachamaru' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'Chachamaru');
  });

  it('entity without meaning falls through to dict', () => {
    const token = { base: '茶', entity: true };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'tea');
  });

  it('token.meaning (no entity flag) is honored before dict', () => {
    const token = { base: '茶', meaning: 'server-enriched tea' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'server-enriched tea');
  });

  it('dict primary is used when token carries no meaning', () => {
    const token = { base: '遊ぶ' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), 'to play');
  });

  it('returns empty string when nothing resolves', () => {
    const token = { base: '未知' };
    assert.equal(resolveExposureMeaning(token, wordDict, {}), '');
  });

  it('returns empty string when token has no base form', () => {
    assert.equal(resolveExposureMeaning({}, wordDict, {}), '');
  });
});

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

  it('honors token.meaning (server-enriched) over dict', () => {
    const tokens = [
      { surface: '犬', base: '犬', pos: '名詞', meaning: 'puppy (enriched)' },
    ];
    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, {}),
      [{ word: '犬', meaning: 'puppy (enriched)' }]
    );
  });

  it('override beats token.meaning and dict', () => {
    const tokens = [
      { surface: '犬', base: '犬', pos: '名詞', meaning: 'puppy (enriched)' },
    ];
    assert.deepEqual(
      extractExposureEntries(tokens, wordDict, { 犬: 'pup (context)' }),
      [{ word: '犬', meaning: 'pup (context)' }]
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
