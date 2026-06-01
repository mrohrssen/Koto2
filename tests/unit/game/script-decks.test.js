import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIRAGANA_SCRIPT_CARDS,
  KATAKANA_SCRIPT_CARDS,
  KANJI_SCRIPT_CARDS,
  SCRIPT_CARD_TYPES,
  getStaticScriptCards,
} from '../../../src/game/script-decks.js';

describe('script-decks static data', () => {
  it('defines the three allowed script card types', () => {
    assert.deepEqual(SCRIPT_CARD_TYPES, ['hiragana', 'katakana', 'kanji']);
  });

  it('normalizes hiragana cards with stable ids and romaji answers', () => {
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].id, 'hiragana:あ');
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].type, 'hiragana');
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].prompt, 'あ');
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].answer, 'a');
  });

  it('provides katakana cards independently of hiragana', () => {
    const first = KATAKANA_SCRIPT_CARDS[0];
    assert.equal(first.id, 'katakana:ア');
    assert.equal(first.type, 'katakana');
    assert.equal(first.prompt, 'ア');
    assert.equal(first.answer, 'a');
  });

  it('loads the Koto top-4000 kanji entries in frequency order', () => {
    assert.equal(KANJI_SCRIPT_CARDS.length, 4000);
    assert.deepEqual(KANJI_SCRIPT_CARDS[0], {
      id: 'kanji:人',
      type: 'kanji',
      prompt: '人',
      answer: 'person',
      reading: 'ひと',
      keyword: 'person',
      sortIndex: 1,
      source: 'koto-kanji-dictionary',
      frequencyRank: 1,
    });
    assert.deepEqual(KANJI_SCRIPT_CARDS.slice(0, 4).map(card => card.prompt), ['人', '言', '見', '一']);
    assert.equal(KANJI_SCRIPT_CARDS.some(card => card.source === 'wanikani-pleasant-100'), false);
  });

  it('returns cards by script type only', () => {
    assert.equal(getStaticScriptCards('hiragana'), HIRAGANA_SCRIPT_CARDS);
    assert.equal(getStaticScriptCards('katakana'), KATAKANA_SCRIPT_CARDS);
    assert.equal(getStaticScriptCards('kanji'), KANJI_SCRIPT_CARDS);
    assert.deepEqual(getStaticScriptCards('vocab'), []);
  });
});
