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

  it('loads the first 100 WaniKani Pleasant kanji entries in order', () => {
    assert.equal(KANJI_SCRIPT_CARDS.length, 100);
    assert.deepEqual(KANJI_SCRIPT_CARDS[0], {
      id: 'kanji:上',
      type: 'kanji',
      prompt: '上',
      answer: 'Above',
      reading: 'じょう',
      keyword: 'Above',
      sortIndex: 1,
      source: 'wanikani-pleasant-100',
    });
    assert.equal(KANJI_SCRIPT_CARDS[37].id, 'kanji:々');
    assert.equal(KANJI_SCRIPT_CARDS[99].id, 'kanji:虫');
    assert.equal(KANJI_SCRIPT_CARDS[99].answer, 'Insect');
  });

  it('returns cards by script type only', () => {
    assert.equal(getStaticScriptCards('hiragana'), HIRAGANA_SCRIPT_CARDS);
    assert.equal(getStaticScriptCards('katakana'), KATAKANA_SCRIPT_CARDS);
    assert.equal(getStaticScriptCards('kanji'), KANJI_SCRIPT_CARDS);
    assert.deepEqual(getStaticScriptCards('vocab'), []);
  });
});
