import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJapaneseTokenCells,
  grammarHintsAttr,
  tokenDataAttrs,
} from '../../../public/js/ui/japanese-token-cells.js';

const desuHint = {
  grammarId: 'n5-desu-copula',
  title: 'です',
  meaning: 'to be / is',
  shortExplanation: 'Marks a polite statement that something is something.',
  displayPattern: 'Noun + です',
  readingOverride: '',
  matchedText: 'です',
  tokenStart: 1,
  tokenEnd: 1,
};

const waHint = {
  grammarId: 'n5-wa-topic',
  title: 'は',
  meaning: 'as for',
  shortExplanation: 'Marks what the sentence is talking about.',
  displayPattern: 'Noun + は',
  readingOverride: 'わ',
  matchedText: 'は',
  tokenStart: 1,
  tokenEnd: 1,
};

describe('japanese token cells', () => {
  it('classifies content and grammar tokens with the shared matrix', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [
        { surface: '友達', base: '友達', reading: 'ともだち', meaning: 'friend', pos: 'Noun' },
        { surface: 'です', reading: 'です', grammarHints: [desuHint] },
        { surface: '！', reading: '!' },
      ],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.equal(cells.length, 2);
    assert.equal(cells[0].kind, 'word');
    assert.equal(cells[0].lookupClass, 'jp-word');
    assert.equal(cells[0].base, '友達');
    assert.equal(cells[0].display, 'ともだち');
    assert.equal(cells[0].romaji, 'tomodachi');
    assert.equal(cells[0].mainText, 'ともだち');
    assert.equal(cells[0].guideText, 'tomodachi');
    assert.equal(cells[0].lookupHeadword, 'ともだち');
    assert.equal(cells[0].guideKind, 'romaji');
    assert.equal(cells[0].meaning, 'friend');
    assert.equal(cells[0].trailingPunct, '');

    assert.equal(cells[1].kind, 'grammar');
    assert.equal(cells[1].lookupClass, 'jp-grammar');
    assert.equal(cells[1].base, '');
    assert.equal(cells[1].display, 'です！');
    assert.equal(cells[1].surface, 'です');
    assert.equal(cells[1].reading, 'です');
    assert.equal(cells[1].romaji, 'desu');
    assert.equal(cells[1].trailingPunct, '！');
    assert.deepEqual(cells[1].grammarHints, [desuHint]);
  });

  it('applies grammar readingOverride without hardcoding particles', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [
        { surface: '道', base: '道', reading: 'みち', meaning: 'road', pos: 'Noun' },
        { surface: 'は', reading: 'は', grammarHints: [waHint] },
      ],
      knownWords: new Set(['道']),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.equal(cells[1].kind, 'grammar');
    assert.equal(cells[1].surface, 'は');
    assert.equal(cells[1].reading, 'わ');
    assert.equal(cells[1].romaji, 'wa');
    assert.equal(cells[1].display, 'は');
    assert.equal(cells[1].mainText, 'は');
    assert.equal(cells[1].guideText, 'wa');
  });

  it('keeps content tokens as word cells even when they also carry grammar hints', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [
        {
          surface: '強い',
          base: '強い',
          reading: 'つよい',
          meaning: 'strong',
          pos: 'Adjective',
          grammarHints: [{
            grammarId: 'n5-i-adjective-predicate',
            title: 'い-Adjective + です',
            meaning: 'is adjective',
            shortExplanation: 'Lets an i-adjective end a polite sentence.',
            matchedText: '強いです',
          }],
        },
      ],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.equal(cells.length, 1);
    assert.equal(cells[0].kind, 'word');
    assert.equal(cells[0].lookupClass, 'jp-word');
    assert.equal(cells[0].base, '強い');
    assert.equal(cells[0].grammarHints.length, 1);
  });

  it('merges small-tsu continuations only when requested', () => {
    const tokens = [
      { surface: '待っ', base: '待つ', reading: 'まっ', meaning: 'wait', pos: 'Verb' },
      { surface: 'て' },
      { surface: '！' },
    ];

    const inlineCells = buildJapaneseTokenCells({
      tokens,
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
      mergeSmallTsuContinuation: false,
    });

    assert.equal(inlineCells.length, 2);
    assert.equal(inlineCells[0].display, 'まっ');
    assert.equal(inlineCells[1].kind, 'punctuation');
    assert.equal(inlineCells[1].display, 'て！');

    const gridCells = buildJapaneseTokenCells({
      tokens,
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
      mergeSmallTsuContinuation: true,
    });

    assert.equal(gridCells.length, 1);
    assert.equal(gridCells[0].kind, 'word');
    assert.equal(gridCells[0].reading, 'まって');
    assert.equal(gridCells[0].display, 'まって！');
    assert.equal(gridCells[0].surfaceWithContinuation, '待って');
  });

  it('marks natural-mode cells for lookup compatibility', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [{
        surface: '森',
        base: '森',
        reading: 'もり',
        meaning: 'forest & woods',
        meanings: [{ en: 'forest & woods' }],
        pos: 'Noun',
        preferredSurface: '森',
      }],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      japaneseDisplayMode: 'natural',
    });

    assert.equal(cells[0].mainText, '森');
    assert.equal(cells[0].guideText, 'もり');
    const attrs = tokenDataAttrs(cells[0]);

    assert.match(attrs, /data-base="森"/);
    assert.match(attrs, /data-reading="もり"/);
    assert.match(attrs, /data-meaning="forest &amp; woods"/);
    assert.match(attrs, /data-pos="Noun"/);
    assert.match(attrs, /data-display-mode="natural"/);
    assert.match(attrs, /data-kanji-mode="1"/);
    assert.match(attrs, /data-meanings="/);
    assert.doesNotMatch(attrs, /data-audio-text/);
  });

  it('serializes grammar hints for lookup attrs', () => {
    const cells = buildJapaneseTokenCells({
      tokens: [{ surface: 'です', reading: 'です', grammarHints: [desuHint] }],
      knownWords: new Set(),
      wordDict: null,
      overrides: {},
      useKanji: false,
    });

    assert.match(grammarHintsAttr(cells[0]), /data-grammar-hints="/);
    assert.match(grammarHintsAttr(cells[0]), /n5-desu-copula/);
    assert.equal(tokenDataAttrs(cells[0]).includes('data-base='), false);
    assert.match(tokenDataAttrs(cells[0]), /data-reading="です"/);
    assert.match(tokenDataAttrs(cells[0]), /data-grammar-hints="/);
  });
});
