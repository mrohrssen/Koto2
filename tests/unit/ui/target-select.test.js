import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let renderChoicesArgs = null;
let entityToTokenCalls = [];
let renderJpSentenceCalls = [];
let playWordCalls = [];
let prefetchWordCalls = [];
let selectedTargets = [];

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
    renderJpSentence: (tokens, knownWords, wordDict) => {
      renderJpSentenceCalls.push({ tokens, knownWords, wordDict });
      return tokens.map(t => t.surface || '').join('');
    },
    entityToToken: value => {
      entityToTokenCalls.push(value);
      return {
        surface: value.word || value.name || '',
        reading: value.reading || '',
        meaning: value.meaning || value.nameEn || '',
      };
    },
    getKnownWords: () => new Set(),
  },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderChoices: args => { renderChoicesArgs = args; },
    renderButtons: () => {},
  },
});
await mock.module('../../../public/js/tts.js', {
  namedExports: {
    playWord: word => { playWordCalls.push(word); },
    prefetchWord: word => { prefetchWordCalls.push(word); },
  },
});

const { init, showEnemies } = await import('../../../public/js/ui/target-select.js');

describe('target-select', () => {
  beforeEach(() => {
    renderChoicesArgs = null;
    entityToTokenCalls = [];
    renderJpSentenceCalls = [];
    playWordCalls = [];
    prefetchWordCalls = [];
    selectedTargets = [];
    init({
      onTargetSelectCb: targetIndex => { selectedTargets.push(targetIndex); },
      onCancelCb: () => {},
    });
  });

  it('labels attack target selection with Choose target', () => {
    showEnemies([
      { id: 'neko', name: '猫', nameEn: 'Cat', reading: 'ねこ', element: 'fire', level: 1, hp: 10 },
    ], { element: 'fire' });

    assert.equal(renderChoicesArgs?.heading, 'Choose target');
  });

  it('renders target creature entity names through Japanese sentence tokens', () => {
    showEnemies([
      {
        id: 'neko',
        name: '猫獣',
        nameEn: 'Cat Beast',
        reading: 'ねこじゅう',
        meaning: 'cat',
        element: 'fire',
        level: 1,
        hp: 10,
      },
    ], { element: 'fire' });

    assert.equal(entityToTokenCalls[0].name, '猫獣');
    assert.equal(entityToTokenCalls[0].reading, 'ねこじゅう');
    assert.equal(entityToTokenCalls[0].nameEn, 'Cat Beast');
    assert.equal(renderJpSentenceCalls.length, 1);
    assert.equal(renderChoicesArgs?.cards?.[0]?.title, '猫獣');
  });

  it('prefetches target names and speaks the selected target on explicit target click', () => {
    showEnemies([
      { id: 'hi', name: '火', nameEn: 'Fire', reading: 'ひ', element: 'fire', level: 1, hp: 10 },
      { id: 'neko', name: '猫獣', nameEn: 'Cat Beast', reading: 'ねこじゅう', element: 'fire', level: 2, hp: 12 },
    ], { element: 'fire' });

    assert.deepEqual(prefetchWordCalls, ['火', '猫獣']);

    renderChoicesArgs.onSelect(1);

    assert.deepEqual(playWordCalls, ['猫獣']);
    assert.deepEqual(selectedTargets, [1]);
  });
});
