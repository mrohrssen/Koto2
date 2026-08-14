import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeBatch } from '../../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../../src/game/grammar/grammar-matcher.js';

function tokenized(text) {
  return tokenizeBatch([text])[0];
}

function ids(text) {
  return findGrammarMatches(tokenized(text), {
    catalog: loadGrammarCatalog(),
    matchers: loadGrammarMatchers(),
  }).map(m => m.grammarId);
}

describe('grammar-matcher', () => {
  it('matches topic は only with a noun before it', () => {
    assert.ok(ids('犬は走る。').includes('n5-wa-topic'));
    assert.ok(!ids('雨ではない。').includes('n5-wa-topic'));
  });

  it('matches object を with noun before and verb after', () => {
    assert.ok(ids('本を読む。').includes('n5-wo-object'));
    assert.ok(!ids('本を。').includes('n5-wo-object'));
  });

  it('matches がある as a longer phrase and suppresses nested generic conflicts', () => {
    const matches = findGrammarMatches(tokenized('本がある。'), {
      catalog: loadGrammarCatalog(),
      matchers: loadGrammarMatchers(),
    });
    assert.ok(matches.some(m => m.grammarId === 'n5-ga-aru-existence'));
    const gaAru = matches.find(m => m.grammarId === 'n5-ga-aru-existence');
    assert.equal(gaAru.matchedText, 'がある');
    assert.equal(gaAru.tokenStart, 1);
    assert.equal(gaAru.tokenEnd, 2);
  });

  it('matches ている with both て and sound-change で connector tokens', () => {
    assert.ok(ids('見ている。').includes('n5-te-iru-progressive'));
    assert.ok(ids('読んでいる。').includes('n5-te-iru-progressive'));
  });

  it('does not match ている when いる is not the auxiliary continuation', () => {
    assert.ok(!ids('犬がいる。').includes('n5-te-iru-progressive'));
  });

  it('matches 的 across supported analyses without matching lexical nouns', () => {
    const cases = [
      { name: 'split suffix', tokens: tokenized('彼は論理的に話す。'), expected: true },
      { name: 'fused 形状詞', tokens: tokenized('静的なページを作る。'), expected: true },
      { name: 'fused 名詞 / 形状詞可能', tokens: tokenized('日本的な雰囲気がある。'), expected: true },
      { name: '目的 with particle に', tokens: tokenized('目的に進む。'), expected: false },
      { name: '多目的 with particle に', tokens: tokenized('多目的に使う。'), expected: false },
      { name: '標的 with particle に', tokens: tokenized('標的にする。'), expected: false },
      {
        name: 'the lexical noun 的 with particle に',
        tokens: [
          { surface: '的', pos0: '名詞', pos2: '形状詞可能' },
          { surface: 'に', baseForm: 'に', pos0: '助詞' },
        ],
        expected: false,
      },
      {
        name: 'a non-形状詞可能 noun with copular に',
        tokens: [
          { surface: '目的', pos0: '名詞', pos2: '一般' },
          { surface: 'に', baseForm: 'だ', pos0: '助動詞' },
        ],
        expected: false,
      },
    ];

    for (const { name, tokens, expected } of cases) {
      const matched = findGrammarMatches(tokens, {
        catalog: loadGrammarCatalog(),
        matchers: loadGrammarMatchers(),
      }).some(match => match.grammarId === 'n3-l02-15');
      assert.equal(matched, expected, name);
    }
  });

  it('supports optional matcher tokens for reusable particle families', () => {
    const catalog = [{
      id: 'test-topic-with-optional-suffix',
      title: 'topic',
      meaning: 'topic',
      shortExplanation: 'test',
      displayPattern: 'Noun + は',
    }];
    const matchers = [{
      grammarId: 'test-topic-with-optional-suffix',
      priority: 1,
      tokens: [
        { pos0: '名詞' },
        { optional: true, pos0: '接尾辞', pos1: '名詞的' },
        { surface: 'は', pos0: '助詞' },
      ],
      display: { startTokenOffset: 1, endTokenOffset: 2 },
    }];

    assert.ok(findGrammarMatches(tokenized('田中さんは先生です。'), { catalog, matchers })
      .some(match => match.grammarId === 'test-topic-with-optional-suffix'));
    assert.ok(findGrammarMatches(tokenized('犬は走る。'), { catalog, matchers })
      .some(match => match.grammarId === 'test-topic-with-optional-suffix'));
  });

  it('supports bounded gaps between grammar anchors', () => {
    const catalog = [{
      id: 'test-yori-no-hou-ga',
      title: 'より～の方が',
      meaning: 'more than',
      shortExplanation: 'test',
      displayPattern: 'AよりBの方が',
    }];
    const matchers = [{
      grammarId: 'test-yori-no-hou-ga',
      priority: 1,
      tokens: [
        { surface: 'より', pos0: '助詞' },
        { gap: { min: 1, max: 4 } },
        { surface: 'の', pos0: '助詞' },
        { surface: '方', pos0: '名詞' },
        { surface: 'が', pos0: '助詞' },
      ],
      display: { startTokenOffset: 0, endTokenOffset: 4 },
    }];

    const matches = findGrammarMatches(tokenized('犬より猫の方が好きです。'), { catalog, matchers });
    assert.ok(matches.some(match => match.grammarId === 'test-yori-no-hou-ga'));
    assert.equal(matches[0].matchedText, 'より猫の方が');
  });

  it('supports disallowing punctuation inside bounded gaps', () => {
    const catalog = [{
      id: 'test-adverb-negative',
      title: 'adverb negative',
      meaning: 'not really',
      shortExplanation: 'test',
      displayPattern: 'adverb〜ない',
    }];
    const matchers = [{
      grammarId: 'test-adverb-negative',
      priority: 1,
      tokens: [
        { surface: 'なかなか' },
        { gap: { min: 0, max: 4, disallow: { pos0: '補助記号' } } },
        { baseForm: 'ない' },
      ],
      display: { startTokenOffset: 0, endTokenOffset: 2 },
    }];

    assert.ok(findGrammarMatches(tokenized('なかなか覚えられない。'), { catalog, matchers })
      .some(match => match.grammarId === 'test-adverb-negative'));
    assert.equal(
      findGrammarMatches(tokenized('なかなかおいしい。問題はない。'), { catalog, matchers })
        .some(match => match.grammarId === 'test-adverb-negative'),
      false
    );
  });

  it('keeps equal-priority exact-span matches for shared surface grammar senses', () => {
    const catalog = [
      { id: 'test-te-iru-a', title: 'ている A' },
      { id: 'test-te-iru-b', title: 'ている B' },
    ];
    const tokens = [
      { surface: '読ん', baseForm: '読む', pos0: '動詞', conjugationForm: '連用形-撥音便' },
      { surface: 'で', baseForm: 'で', pos0: '助詞', pos1: '接続助詞' },
      { surface: 'いる', baseForm: 'いる', pos0: '動詞' },
    ];
    const matcher = (grammarId, priority) => ({
      grammarId,
      priority,
      tokens: [
        { pos0: '動詞', conjugationFormPrefix: '連用形' },
        { surfaceOneOf: ['て', 'で'], pos0: '助詞' },
        { baseForm: 'いる', pos0: '動詞' },
      ],
    });

    const matches = findGrammarMatches(tokens, { catalog, matchers: [matcher('test-te-iru-a', 10), matcher('test-te-iru-b', 10)] });
    assert.deepEqual(matches.map(match => match.grammarId), ['test-te-iru-a', 'test-te-iru-b']);
  });

  it('keeps overlapping matches from different grammar levels', () => {
    const catalog = [
      { id: 'n5-test-te', title: 'て' },
      { id: 'n4-test-te-iku', title: 'ていく' },
    ];
    const tokens = [
      { surface: '読ん', baseForm: '読む', pos0: '動詞', conjugationForm: '連用形-撥音便' },
      { surface: 'で', baseForm: 'で', pos0: '助詞', pos1: '接続助詞' },
      { surface: 'いく', baseForm: 'いく', pos0: '動詞' },
    ];
    const matchers = [
      {
        grammarId: 'n5-test-te',
        priority: 30,
        tokens: [
          { pos0: '動詞', conjugationFormPrefix: '連用形' },
          { surfaceOneOf: ['て', 'で'], pos0: '助詞' },
        ],
      },
      {
        grammarId: 'n4-test-te-iku',
        priority: 5,
        tokens: [
          { pos0: '動詞', conjugationFormPrefix: '連用形' },
          { surfaceOneOf: ['て', 'で'], pos0: '助詞' },
          { baseForm: 'いく', pos0: '動詞' },
        ],
      },
    ];

    const matches = findGrammarMatches(tokens, { catalog, matchers });
    assert.deepEqual(matches.map(match => match.grammarId), ['n5-test-te', 'n4-test-te-iku']);
  });

  it('does not emit cataloged-not-detectable grammar points', () => {
    const catalog = [
      { id: 'test-disabled-grammar', title: 'disabled', status: 'cataloged-not-detectable' },
    ];
    const matchers = [{
      grammarId: 'test-disabled-grammar',
      priority: 1,
      tokens: [
        { surface: '猫', pos0: '名詞' },
      ],
    }];

    const matches = findGrammarMatches(tokenized('猫です。'), { catalog, matchers });
    assert.deepEqual(matches, []);
  });

  it('dedupes duplicate matcher rows for the same grammar span', () => {
    const catalog = [
      { id: 'test-duplicate-row', title: 'duplicate' },
    ];
    const matcher = {
      grammarId: 'test-duplicate-row',
      priority: 1,
      tokens: [
        { surface: '猫', pos0: '名詞' },
        { surface: 'は', pos0: '助詞' },
      ],
    };

    const matches = findGrammarMatches(tokenized('猫は走る。'), { catalog, matchers: [matcher, matcher] });
    assert.deepEqual(matches.map(match => match.grammarId), ['test-duplicate-row']);
  });

  it('preserves grammar matches inside live quoted speech', () => {
    assert.ok(ids('昨日、友達は「本を読む」と言いました。').includes('n5-wo-object'));
    assert.ok(ids('友達は「読んでいる」と言いました。').includes('n5-te-iru-progressive'));
    assert.ok(ids('昨日、友達は「行くって」と言いました。').includes('n5-tte-quotation'));
    assert.ok(ids('店員は「学生です」と説明した。').includes('n5-desu-copula'));
    assert.ok(ids('祖母は「行くね」と笑った。').includes('n5-ne-confirmation'));
  });

  it('suppresses grammar matches inside copied or mentioned quoted text', () => {
    assert.ok(!ids('ノートに「本を読む」とだけ書きました。').includes('n5-wo-object'));
    assert.ok(!ids('例文として「本を読む」を読んだ。').includes('n5-wo-object'));
    assert.ok(!ids('ノートに「「犬」は名詞です」とだけ書きました。').includes('n5-wa-topic'));
    assert.ok(!ids('ノートに「行きます」とだけ書きました。').includes('n5-masu-polite'));
  });
});
