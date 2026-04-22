import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hydrateCard, hydrateCards } from '../../src/game/bootstrap/word-knowledge.js';

describe('hydrateCard', () => {
  const dict = new Map();
  dict.set('火', {
    reading: 'ひ',
    definitions: [{ en: 'fire', primary: true }, { en: 'Tuesday' }],
  });
  dict.set('遊ぶ', {
    reading: 'あそぶ',
    definitions: [{ en: 'to play', primary: true }],
  });

  it('returns current meaning and reading regardless of stale fields', () => {
    const card = { id: '火', meaning: 'OLD', reading: 'OLD', state: 1 };
    const hydrated = hydrateCard(card, dict);
    assert.equal(hydrated.meaning, 'fire');
    assert.equal(hydrated.reading, 'ひ');
    assert.equal(hydrated.state, 1, 'FSRS fields preserved');
  });

  it('returns empty strings when word not in dict', () => {
    const card = { id: '未知の単語', meaning: 'whatever' };
    const hydrated = hydrateCard(card, dict);
    assert.equal(hydrated.meaning, '');
    assert.equal(hydrated.reading, '未知の単語');
  });

  it('hydrateCards maps over an array', () => {
    const cards = [{ id: '火' }, { id: '遊ぶ' }];
    const out = hydrateCards(cards, dict);
    assert.equal(out[0].meaning, 'fire');
    assert.equal(out[1].meaning, 'to play');
  });

  it('returns card unchanged if null/undefined', () => {
    assert.equal(hydrateCard(null, dict), null);
    assert.equal(hydrateCard(undefined, dict), undefined);
  });
});
