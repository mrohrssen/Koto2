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
    const matcher = grammarId => ({
      grammarId,
      priority: 10,
      tokens: [
        { pos0: '動詞', conjugationFormPrefix: '連用形' },
        { surfaceOneOf: ['て', 'で'], pos0: '助詞' },
        { baseForm: 'いる', pos0: '動詞' },
      ],
    });

    const matches = findGrammarMatches(tokens, { catalog, matchers: [matcher('test-te-iru-a'), matcher('test-te-iru-b')] });
    assert.deepEqual(matches.map(match => match.grammarId), ['test-te-iru-a', 'test-te-iru-b']);
  });
});
