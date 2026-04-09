import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpSentence, entityToToken } from '../../public/js/ui/bootstrap-client.js';

const wordDict = new Map([
  ['こんにちは', { reading: 'こんにちは', definitions: [{ en: 'hello', primary: true }] }],
  ['一緒', { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] }],
  ['遊ぶ', { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] }],
  ['に', { reading: 'に', definitions: [{ en: 'to/at', primary: true }] }],
]);

describe('renderJpSentence', () => {
  it('renders known words with romaji ruby annotation (useKanji=false)', () => {
    const tokens = [{ surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' }];
    const knownWords = new Set(['こんにちは']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.ok(html.includes('jp-known'));
    assert.ok(html.includes('<ruby>'));
    assert.ok(html.includes('こんにちは'));
    assert.ok(html.includes('<rt>konnichiha</rt>'));
    assert.ok(!html.includes('jp-unknown'));
  });

  it('renders unknown words with romaji and English', () => {
    const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('jp-unknown'));
    assert.ok(html.includes('<ruby>'));
    assert.ok(html.includes('いっしょ'));
    assert.ok(html.includes('<rt>issho</rt>'));
    assert.ok(html.includes('jp-stack-en'));
    assert.ok(html.includes('together'));
  });

  it('renders punctuation as-is', () => {
    const tokens = [{ surface: '！', baseForm: '！', pos: '記号', reading: '' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('jp-punct'));
    assert.ok(html.includes('！'));
  });

  it('uses kanji surface form when useKanji=true', () => {
    const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
    const html = renderJpSentence(tokens, new Set(['一緒']), wordDict, {}, true);
    assert.ok(html.includes('<ruby>一緒<'));
    assert.ok(html.includes('<rt>issho</rt>'));
    assert.ok(html.includes('jp-known'));
  });

  it('applies definition overrides', () => {
    const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, { '一緒': 'at the same time' }, false);
    assert.ok(html.includes('at the same time'));
    assert.ok(!html.includes('together'));
  });

  it('renders a mixed sentence correctly', () => {
    const tokens = [
      { surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' },
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
      { surface: 'に', baseForm: 'に', pos: '助詞', reading: 'に' },
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
    ];
    const knownWords = new Set(['こんにちは', 'に']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.equal((html.match(/jp-known/g) || []).length, 2);
    assert.equal((html.match(/jp-unknown/g) || []).length, 2);
    assert.equal((html.match(/jp-punct/g) || []).length, 1);
    // All non-punctuation tokens get ruby
    assert.equal((html.match(/<ruby>/g) || []).length, 4);
  });

  it('returns empty string for empty tokens', () => {
    assert.equal(renderJpSentence([], new Set(), wordDict), '');
    assert.equal(renderJpSentence(null, new Set(), wordDict), '');
  });
});

describe('renderJpSentence — universal token format', () => {
  it('renders known content word with ruby (new format)', () => {
    const tokens = [
      { surface: 'お茶', base: 'お茶', reading: 'おちゃ', meaning: 'Tea' },
    ];
    const html = renderJpSentence(tokens, new Set(['お茶']), new Map(), {}, false);
    assert.ok(html.includes('jp-known'));
    assert.ok(html.includes('おちゃ'));
  });

  it('renders unknown content word with meaning from token (new format)', () => {
    const tokens = [
      { surface: 'お茶', base: 'お茶', reading: 'おちゃ', meaning: 'Tea' },
    ];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.ok(html.includes('jp-unknown'));
    assert.ok(html.includes('Tea'));
  });

  it('renders surface-only token as punctuation (new format)', () => {
    const tokens = [{ surface: 'を' }];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.ok(html.includes('jp-punct'));
    assert.ok(html.includes('を'));
  });

  it('renders entity tokens with jp-entity class', () => {
    const tokens = [
      { surface: '火竜', base: '火竜', reading: 'かりゅう', meaning: 'Fire Dragon', entity: true },
    ];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.ok(html.includes('jp-entity'), 'should have jp-entity class');
    assert.ok(!html.includes('jp-unknown'), 'should NOT have jp-unknown class');
    assert.ok(html.includes('Fire Dragon'));
  });
});

describe('renderJpSentence — attack card entity tokens via entityToToken', () => {
  it('renders unknown attack base word with English gloss', () => {
    const token = entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' });
    const html = renderJpSentence([token], new Set(), new Map());
    assert.ok(html.includes('jp-entity'), 'unknown entity should have jp-entity class');
    assert.ok(html.includes('get lost / hesitate'), 'unknown entity should show English gloss');
    assert.ok(html.includes('まよう'), 'should show reading');
  });

  it('renders known attack base word WITHOUT English gloss', () => {
    const token = entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' });
    const html = renderJpSentence([token], new Set(['迷う']), new Map());
    assert.ok(html.includes('jp-known'), 'known entity should have jp-known class');
    assert.ok(!html.includes('get lost / hesitate'), 'known entity should NOT show English gloss');
  });
});
