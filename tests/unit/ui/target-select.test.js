import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let renderChoicesArgs = null;

await mock.module('../../../public/js/dom.js', {
  namedExports: { dom: { actionArea: { innerHTML: '' } } },
});
await mock.module('../../../public/js/ui/creature-row.js', {
  namedExports: { ELEMENT_COLORS: { fire: '#f00' } },
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: { creatureStaticPath: id => `/sprites/${id}.webp` },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: tokens => tokens.map(t => t.name || t.word || '').join(''),
    entityToToken: value => value,
    getKnownWords: () => new Set(),
  },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderChoices: args => { renderChoicesArgs = args; },
    renderButtons: () => {},
  },
});

const { showEnemies } = await import('../../../public/js/ui/target-select.js');

describe('target-select', () => {
  beforeEach(() => {
    renderChoicesArgs = null;
  });

  it('labels attack target selection with Choose target', () => {
    showEnemies([
      { id: 'neko', name: '猫', nameEn: 'Cat', baseReading: 'ねこ', element: 'fire', level: 1, hp: 10 },
    ], { element: 'fire' });

    assert.equal(renderChoicesArgs?.heading, 'Choose target');
  });
});
