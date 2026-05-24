import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpSentence } from '../../../public/js/ui/bootstrap-client.js';

describe('renderJpSentence grammar hints', () => {
  it('renders grammar-only particles as clickable without data-base', () => {
    const html = renderJpSentence([
      { surface: '本', base: '本', reading: 'ほん', meaning: 'book', pos: 'Noun' },
      {
        surface: 'を',
        reading: 'を',
        grammarHints: [{
          grammarId: 'n5-wo-object',
          title: 'を',
          meaning: 'object marker',
          shortExplanation: 'Marks the thing that receives the action.',
          matchedText: 'を',
          readingOverride: 'を',
        }],
      },
      { surface: '読む', base: '読む', reading: 'よむ', meaning: 'read', pos: 'Verb' },
    ], new Set(['本', '読む']), null, {}, false);

    assert.match(html, /class="jp-grammar/);
    assert.match(html, /data-grammar-hints=/);
    assert.doesNotMatch(html, /class="jp-grammar[^"]*"[^>]*data-base=/);
    assert.match(html, /<rt>wo<\/rt>/);
  });

  it('adds grammar hint data to normal vocabulary word spans', () => {
    const html = renderJpSentence([
      {
        surface: '読ん',
        base: '読む',
        reading: 'よん',
        meaning: 'read',
        pos: 'Verb',
        grammarHints: [{
          grammarId: 'n5-te-iru-progressive',
          title: '～ている',
          meaning: 'is/am/are doing',
          shortExplanation: 'Shows an action happening right now.',
          matchedText: '読んでいる',
        }],
      },
    ], new Set(), null, {}, false);

    assert.match(html, /class="jp-word jp-unknown"/);
    assert.match(html, /data-grammar-hints=/);
  });
});
