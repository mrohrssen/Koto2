import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stub — node:test runs in Node so we simulate the popup handler's
// inputs by directly calling the function under test with a fake span + dict.
// We test the *meaning-list-building* logic in isolation by extracting it.

await mock.module('../../public/js/tts.js', {
  namedExports: {
    playDialogueWordAudio: () => {}
  }
});

const {
  buildLookupHeadwordHtml,
  buildPopupMeanings,
  parseGrammarHints,
} = await import('../../public/js/ui/dialogue-word-lookup.js');

describe('buildPopupMeanings', () => {
  const dictEntry = { definitions: [{ en: 'dog', primary: true }, { en: 'hound' }] };

  it('returns only dict definitions when no override', () => {
    const result = buildPopupMeanings({
      dataMeaning: 'dog',
      dataOverride: null,
      dictEntry,
    });
    assert.deepEqual(result, [
      { text: 'dog', contextual: false },
      { text: 'hound', contextual: false },
    ]);
  });

  it('returns override first with contextual flag, then dict definitions', () => {
    const result = buildPopupMeanings({
      dataMeaning: 'pup',
      dataOverride: '1',
      dictEntry,
    });
    assert.deepEqual(result, [
      { text: 'pup', contextual: true },
      { text: 'dog', contextual: false },
      { text: 'hound', contextual: false },
    ]);
  });

  it('handles missing dict entry with override gracefully', () => {
    const result = buildPopupMeanings({
      dataMeaning: 'boing',
      dataOverride: '1',
      dictEntry: null,
    });
    assert.deepEqual(result, [{ text: 'boing', contextual: true }]);
  });

  it('returns empty list when no meaning and no dict entry', () => {
    const result = buildPopupMeanings({
      dataMeaning: '',
      dataOverride: null,
      dictEntry: null,
    });
    assert.deepEqual(result, []);
  });
});

describe('parseGrammarHints', () => {
  it('parses grammar hints from data attribute JSON', () => {
    const hints = parseGrammarHints(JSON.stringify([
      {
        grammarId: 'n5-wo-object',
        title: 'を',
        meaning: 'object marker',
        shortExplanation: 'Marks the thing that receives the action.',
        matchedText: 'を',
      }
    ]));
    assert.equal(hints.length, 1);
    assert.equal(hints[0].grammarId, 'n5-wo-object');
  });

  it('returns empty array for invalid grammar JSON', () => {
    assert.deepEqual(parseGrammarHints('{bad json'), []);
  });
});

describe('buildLookupHeadwordHtml', () => {
  it('uses resolved lookup fields instead of deciding from kanji mode', () => {
    const html = buildLookupHeadwordHtml({
      lookupHeadword: '森',
      guideText: 'もり',
      guideKind: 'hiragana',
      base: '森',
      reading: 'もり',
      kanjiMode: '1',
    });

    assert.equal(html, '<ruby>森<rt>もり</rt></ruby>');
  });

  it('uses romaji guide text for hiragana-mode headwords', () => {
    const html = buildLookupHeadwordHtml({
      lookupHeadword: 'もり',
      guideText: 'mori',
      guideKind: 'romaji',
      base: '森',
      reading: 'もり',
    });

    assert.equal(html, '<ruby>もり<rt>mori</rt></ruby>');
  });
});
