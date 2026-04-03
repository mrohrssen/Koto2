// tests/unit/word-knowledge.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWordKnowledge,
  registerExposure,
  markKnown,
  unmarkKnown,
  isWordKnown,
  getKnownWords,
  getSeenWords,
  seedKnownWords
} from '../../src/game/bootstrap/word-knowledge.js';

describe('word-knowledge', () => {
  let wk;

  beforeEach(() => {
    wk = createWordKnowledge('test-user');
  });

  it('creates empty knowledge for new user', () => {
    assert.equal(getKnownWords(wk).size, 0);
    assert.equal(getSeenWords(wk).size, 0);
  });

  it('registerExposure marks word as seen but not known', () => {
    registerExposure(wk, '森');
    assert.ok(getSeenWords(wk).has('森'));
    assert.ok(!isWordKnown(wk, '森'));
  });

  it('markKnown transitions word from seen to known', () => {
    registerExposure(wk, '森');
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
  });

  it('markKnown works even without prior exposure', () => {
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
  });

  it('seedKnownWords bulk-adds words as known', () => {
    seedKnownWords(wk, ['森', '火', '水']);
    assert.equal(getKnownWords(wk).size, 3);
    assert.ok(isWordKnown(wk, '森'));
    assert.ok(isWordKnown(wk, '火'));
    assert.ok(isWordKnown(wk, '水'));
  });

  it('getKnownWords returns a Set', () => {
    seedKnownWords(wk, ['森']);
    const known = getKnownWords(wk);
    assert.ok(known instanceof Set);
  });

  it('unmarkKnown removes word from known', () => {
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
    unmarkKnown(wk, '森');
    assert.ok(!isWordKnown(wk, '森'));
  });

  it('unmarkKnown is safe on unknown word', () => {
    unmarkKnown(wk, '森'); // should not throw
    assert.ok(!isWordKnown(wk, '森'));
  });
});
