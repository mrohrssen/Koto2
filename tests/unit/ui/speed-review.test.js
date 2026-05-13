import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function createClassList() {
  const classes = new Set();
  return {
    add: className => classes.add(className),
    remove: className => classes.delete(className),
    contains: className => classes.has(className),
  };
}

function createElement(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    style: {},
    disabled: false,
    classList: createClassList(),
    addEventListener: () => {},
    setAttribute: () => {},
    querySelector: selector => {
      if (selector === '.flash-card' && id.startsWith('speed-review-slot-')) {
        return {
          style: {},
          classList: createClassList(),
          addEventListener: () => {},
          querySelector: () => null,
        };
      }
      return null;
    },
    remove: () => {},
  };
}

let elements;

await mock.module('animejs', {
  namedExports: { animate: () => {} },
});
await mock.module('../../../public/js/audio.js', {
  namedExports: {
    playSFX: () => {},
    playBGMRandomStart: () => {},
    playBGM: () => {},
  },
});
await mock.module('../../../public/js/ui/takeover.js', {
  namedExports: {
    open: () => {},
    close: () => {},
  },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { setKnownWords: () => {} },
});
await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: { showWordLevelUp: () => {} },
});

const { start } = await import('../../../public/js/ui/speed-review.js');

describe('speed review word display', () => {
  beforeEach(() => {
    elements = new Map();
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};
    globalThis.document = {
      body: { appendChild: () => {} },
      createElement: () => {
        let html = '';
        return {
          set textContent(value) {
            html = String(value || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          },
          get innerHTML() {
            return html;
          },
        };
      },
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, createElement(id));
        return elements.get(id);
      },
    };
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  });

  it('shows romaji above hiragana on both sides when romaji annotations are enabled', () => {
    const started = start([
      { word: '食べる', reading: 'たべる', meanings: ['eat'] },
    ], { showRomaji: true });

    assert.equal(started, true);
    const slotHtml = elements.get('speed-review-slot-0').innerHTML;
    assert.match(
      slotHtml,
      /<div class="flash-card-front"><ruby>たべる<rt>taberu<\/rt><\/ruby><\/div>/
    );
    assert.match(
      slotHtml,
      /<div class="flash-card-word"><ruby>たべる<rt>taberu<\/rt><\/ruby><\/div>/
    );
  });
});
