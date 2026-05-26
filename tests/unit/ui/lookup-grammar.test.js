import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.document = {
  createElement() {
    return {
      _text: '',
      set textContent(value) {
        this._text = String(value || '');
      },
      get innerHTML() {
        return this._text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
    };
  },
};

const lookup = await import('../../../public/js/ui/lookup.js');

describe('lookup grammar rendering', () => {
  it('renders standalone grammar particles with pronunciation ruby', () => {
    assert.equal(typeof lookup.buildHtmlFromTokens, 'function');

    const html = lookup.buildHtmlFromTokens([
      {
        spelling: 'です',
        word: 'です',
        reading: 'です',
        lookupable: false,
        grammarHints: [{
          grammarId: 'n5-desu-copula',
          title: 'です',
          meaning: 'to be / is',
          shortExplanation: 'Marks a polite statement that something is something.',
          matchedText: 'です',
        }],
      },
      {
        spelling: 'ね',
        word: 'ね',
        reading: 'ね',
        lookupable: false,
        grammarHints: [{
          grammarId: 'n5-ne-confirmation',
          title: 'ね',
          meaning: "right? / isn't it?",
          shortExplanation: 'Invites agreement or shared feeling from the listener.',
          matchedText: 'ね',
        }],
      },
      {
        spelling: 'が',
        word: 'が',
        reading: 'が',
        lookupable: false,
        grammarHints: [{
          grammarId: 'n5-ga-subject',
          title: 'が',
          meaning: 'subject marker',
          shortExplanation: 'Marks the subject or the thing being identified.',
          matchedText: 'が',
        }],
      },
    ], 'ですねが');

    assert.match(html, /class="lookup-grammar jp-grammar"/);
    assert.match(html, /<ruby>です<rt>desu<\/rt><\/ruby>/);
    assert.match(html, /<ruby>ね<rt>ne<\/rt><\/ruby>/);
    assert.match(html, /<ruby>が<rt>ga<\/rt><\/ruby>/);
    assert.match(html, /data-reading="です"/);
    assert.match(html, /data-grammar-hints="/);
    assert.match(html, /n5-desu-copula/);
  });
});
