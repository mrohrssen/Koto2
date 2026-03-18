// tests/unit/game/hiragana-deck.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HIRAGANA_DECK, getRowCards } from '../../../src/game/hiragana-deck.js';

describe('Hiragana Deck', () => {
  it('has exactly 71 cards', () => {
    assert.strictEqual(HIRAGANA_DECK.length, 71);
  });

  it('every card has char, romaji, and row', () => {
    for (const card of HIRAGANA_DECK) {
      assert.ok(card.char, `missing char`);
      assert.ok(card.romaji, `missing romaji for ${card.char}`);
      assert.ok(card.row >= 0, `missing row for ${card.char}`);
    }
  });

  it('has 15 rows (0-14)', () => {
    const rows = new Set(HIRAGANA_DECK.map(c => c.row));
    assert.strictEqual(rows.size, 15);
  });

  it('row 0 is the あ row with 5 vowels', () => {
    const row0 = getRowCards(0);
    assert.strictEqual(row0.length, 5);
    assert.deepStrictEqual(row0.map(c => c.char), ['あ', 'い', 'う', 'え', 'お']);
  });

  it('rows 7 and 9 have 3 cards each', () => {
    assert.strictEqual(getRowCards(7).length, 3);
    assert.strictEqual(getRowCards(9).length, 3);
  });

  it('uses Hepburn romanization for ぢ and づ', () => {
    const ji = HIRAGANA_DECK.find(c => c.char === 'ぢ');
    const zu = HIRAGANA_DECK.find(c => c.char === 'づ');
    assert.strictEqual(ji.romaji, 'ji');
    assert.strictEqual(zu.romaji, 'zu');
  });

  it('has no duplicate chars', () => {
    const chars = HIRAGANA_DECK.map(c => c.char);
    assert.strictEqual(new Set(chars).size, chars.length);
  });
});
