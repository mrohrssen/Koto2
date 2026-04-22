import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpSentence, entityToToken } from '../../public/js/ui/bootstrap-client.js';
import { init as initExposureBuffer, flushNow as flushExposureBufferNow } from '../../public/js/ui/exposure-buffer.js';

const wordDict = new Map([
  ['こんにちは', { reading: 'こんにちは', definitions: [{ en: 'hello', primary: true }] }],
  ['一緒', { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] }],
  ['遊ぶ', { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] }],
  ['に', { reading: 'に', definitions: [{ en: 'to/at', primary: true }] }],
  ['お茶', { reading: 'おちゃ', definitions: [{ en: 'tea (esp. green or barley)', primary: true }] }],
  ['お産', { reading: 'おさん', definitions: [{ en: '(giving) birth / childbirth', primary: true }] }],
]);

function createEventTarget() {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    }
  };
}

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

  it('clips parenthetical qualifier from unknown-word gloss', () => {
    const tokens = [{ surface: 'お茶', baseForm: 'お茶', pos: '名詞', reading: 'おちゃ' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    const gloss = html.match(/<span class="jp-stack-en">([^<]*)<\/span>/)?.[1];
    assert.equal(gloss, 'tea', 'gloss should be just "tea", not "tea (esp. green or barley)"');
    assert.ok(html.includes('data-meaning="tea (esp. green or barley)"'), 'full meaning should remain on data-meaning');
  });

  it('keeps leading parenthetical when stripping would leave nothing', () => {
    const tokens = [{ surface: 'お産', baseForm: 'お産', pos: '名詞', reading: 'おさん' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('(giving) birth'), 'leading paren definition should be preserved');
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

  it('renders unknown content word with meaning from dictionary (new format)', () => {
    const tokens = [
      { surface: 'お茶', base: 'お茶', reading: 'おちゃ', meaning: 'Tea' },
    ];
    // Meaning comes from the live dictionary, not token.meaning.
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('jp-unknown'));
    assert.ok(html.includes('tea'));  // dict value: 'tea (esp. green or barley)'
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
    assert.ok(html.includes('data-meaning="Fire Dragon"'), 'entity fallback should populate data-meaning attribute');
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
    assert.ok(!html.includes('jp-stack-en'), 'known entity should NOT have jp-stack-en gloss span');
  });
});

describe('renderJpSentence — data attributes for word lookup', () => {
  it('adds data-override="1" on spans whose meaning came from overrides', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }];
    const knownWords = new Set();
    const wordDict = new Map([['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }]]);
    const html = renderJpSentence(tokens, knownWords, wordDict, { '犬': 'pup' }, false);
    assert.match(html, /data-override="1"/);
    assert.match(html, /data-meaning="pup"/);
  });

  it('does not add data-override when meaning came from the dictionary', () => {
    const tokens = [{ surface: '犬', base: '犬', reading: 'いぬ', pos: 'Noun' }];
    const knownWords = new Set();
    const wordDict = new Map([['犬', { reading: 'いぬ', definitions: [{ en: 'dog', primary: true }] }]]);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.doesNotMatch(html, /data-override/);
    assert.match(html, /data-meaning="dog"/);
  });

  it('adds data-base, data-reading, data-meaning, data-pos to known words', () => {
    const tokens = [{ surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello', pos: 'Interjection' }];
    const html = renderJpSentence(tokens, new Set(['こんにちは']), wordDict, {}, false);
    assert.ok(html.includes('data-base="こんにちは"'), 'missing data-base');
    assert.ok(html.includes('data-reading="こんにちは"'), 'missing data-reading');
    assert.ok(html.includes('data-pos="Interjection"'), 'missing data-pos');
    assert.ok(html.includes('data-meaning="hello"'), 'missing data-meaning');
  });

  it('adds data attributes to unknown words', () => {
    const tokens = [{ surface: '遊ぶ', base: '遊ぶ', reading: 'あそぶ', meaning: 'to play', pos: 'Verb' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('data-base="遊ぶ"'), 'missing data-base');
    assert.ok(html.includes('data-reading="あそぶ"'), 'missing data-reading');
    assert.ok(html.includes('data-meaning="to play"'), 'missing data-meaning');
    assert.ok(html.includes('data-pos="Verb"'), 'missing data-pos');
  });

  it('does NOT add data attributes to punctuation', () => {
    const tokens = [{ surface: '！' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(!html.includes('data-base'), 'punctuation should not have data-base');
  });

  it('looks up meaning from wordDict for known words without token meaning', () => {
    const tokens = [{ surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', pos: 'Interjection' }];
    const html = renderJpSentence(tokens, new Set(['こんにちは']), wordDict, {}, false);
    assert.ok(html.includes('data-meaning="hello"'), 'should fall back to wordDict for known word meaning');
  });
});

describe('renderJpSentence — exposure buffer integration', () => {
  it('records content-word exposures when rendering', async () => {
    const posts = [];
    const doc = createEventTarget();
    const win = createEventTarget();
    const cleanup = initExposureBuffer({
      debounceMs: 1000,
      postFn: async (words) => posts.push(words),
      document: doc,
      window: win,
      onlineTarget: win
    });

    const tokens = [
      { surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' },
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' }
    ];

    renderJpSentence(tokens, new Set(), wordDict, {}, false);
    await flushExposureBufferNow();

    assert.deepEqual(posts, [[
      { word: 'こんにちは', meaning: 'hello' },
      { word: '遊ぶ', meaning: 'to play' }
    ]]);

    cleanup();
  });

  it('does not record punctuation-only renders', async () => {
    const posts = [];
    const doc = createEventTarget();
    const win = createEventTarget();
    const cleanup = initExposureBuffer({
      debounceMs: 1000,
      postFn: async (words) => posts.push(words),
      document: doc,
      window: win,
      onlineTarget: win
    });

    renderJpSentence([{ surface: '！', baseForm: '！', pos: '記号', reading: '' }], new Set(), wordDict, {}, false);
    await flushExposureBufferNow();

    assert.deepEqual(posts, []);

    cleanup();
  });
});
