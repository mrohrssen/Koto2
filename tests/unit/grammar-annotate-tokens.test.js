import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { annotateRenderTokens } from '../../src/game/grammar/annotate-tokens.js';

describe('annotateRenderTokens', () => {
  it('attaches grammar hints to surface-only particle render tokens without adding base', () => {
    const rawTokens = [
      { surface: '犬', index: 0 },
      { surface: 'は', index: 1, reading: 'は' },
      { surface: '走る', index: 2 },
    ];
    const renderTokens = [
      { surface: '犬', base: '犬', reading: 'いぬ', rawTokenStart: 0, rawTokenEnd: 0 },
      { surface: 'は', reading: 'は', rawTokenStart: 1, rawTokenEnd: 1 },
      { surface: '走る', base: '走る', reading: 'はしる', rawTokenStart: 2, rawTokenEnd: 2 },
    ];
    const matches = [{
      grammarId: 'n5-wa-topic',
      title: 'は',
      meaning: 'as for',
      shortExplanation: 'Marks what the sentence is talking about.',
      readingOverride: 'わ',
      matchedText: 'は',
      tokenStart: 1,
      tokenEnd: 1,
    }];
    const out = annotateRenderTokens(renderTokens, rawTokens, matches);
    assert.equal(out[1].base, undefined);
    assert.equal(out[1].reading, 'は');
    assert.equal(out[1].grammarHints.length, 1);
    assert.equal(out[1].grammarHints[0].grammarId, 'n5-wa-topic');
    assert.equal(out[1].grammarHints[0].readingOverride, 'わ');
  });

  it('attaches phrase grammar hints to every render token covered by raw span', () => {
    const rawTokens = [
      { surface: '読ん', index: 0 },
      { surface: 'で', index: 1 },
      { surface: 'いる', index: 2 },
    ];
    const renderTokens = [
      { surface: '読ん', base: '読む', rawTokenStart: 0, rawTokenEnd: 0 },
      { surface: 'で', rawTokenStart: 1, rawTokenEnd: 1 },
      { surface: 'いる', rawTokenStart: 2, rawTokenEnd: 2 },
    ];
    const matches = [{
      grammarId: 'n5-te-iru-progressive',
      title: '～ている',
      matchedText: '読んでいる',
      tokenStart: 0,
      tokenEnd: 2,
    }];
    const out = annotateRenderTokens(renderTokens, rawTokens, matches);
    assert.equal(out[0].grammarHints[0].matchedText, '読んでいる');
    assert.equal(out[1].grammarHints[0].matchedText, '読んでいる');
    assert.equal(out[2].grammarHints[0].matchedText, '読んでいる');
  });
});
