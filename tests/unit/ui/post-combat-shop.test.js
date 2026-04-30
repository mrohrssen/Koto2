import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let renderChoicesArgs = null;

await mock.module('../../../public/js/dom.js', {
  namedExports: { dom: { actionArea: { innerHTML: '' } } },
});
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} },
});
await mock.module('../../../public/js/tts.js', {
  namedExports: { prefetchWord: () => {}, playWord: () => {} },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '',
    renderEnFirst: () => '',
    getKnownWords: () => new Set(),
    entityToToken: value => value,
  },
});
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureSpriteHtml: () => '',
    itemSpriteHtml: () => '',
  },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: { renderChoices: args => { renderChoicesArgs = args; } },
});

const { showTargetPicker } = await import('../../../public/js/ui/post-combat-shop.js');

describe('post-combat shop target picker', () => {
  beforeEach(() => {
    renderChoicesArgs = null;
  });

  it('labels item target selection with Choose target', () => {
    showTargetPicker([
      { id: 'neko', baseWord: '猫', name: '猫', nameEn: 'Cat', element: 'fire', level: 1, hp: 10, maxHp: 12 },
    ], () => {});

    assert.equal(renderChoicesArgs?.heading, 'Choose target');
  });
});
