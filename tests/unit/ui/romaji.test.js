import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toRomaji } from '../../../public/js/ui/romaji.js';

describe('hiragana to romaji', () => {
  it('converts basic hiragana', () => {
    assert.equal(toRomaji('かめ'), 'kame');
    assert.equal(toRomaji('みず'), 'mizu');
    assert.equal(toRomaji('ひ'), 'hi');
    assert.equal(toRomaji('き'), 'ki');
  });

  it('converts dakuten', () => {
    assert.equal(toRomaji('が'), 'ga');
    assert.equal(toRomaji('ざ'), 'za');
    assert.equal(toRomaji('だ'), 'da');
  });

  it('converts combo characters', () => {
    assert.equal(toRomaji('きゃ'), 'kya');
    assert.equal(toRomaji('しょ'), 'sho');
    assert.equal(toRomaji('ちゅ'), 'chu');
  });

  it('handles double consonant (っ)', () => {
    assert.equal(toRomaji('まって'), 'matte');
    assert.equal(toRomaji('がっこう'), 'gakkou');
  });

  it('handles long vowel (ー) in hiragana context', () => {
    assert.equal(toRomaji('おかーさん'), 'okaasan');
  });

  it('passes through non-hiragana unchanged', () => {
    assert.equal(toRomaji('hello'), 'hello');
    assert.equal(toRomaji('123'), '123');
  });

  it('handles mixed content', () => {
    assert.equal(toRomaji('かめdor'), 'kamedor');
  });
});
