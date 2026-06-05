import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pronunciationReading,
  toPronunciationRomaji,
  toRomaji,
} from '../../../public/js/ui/romaji.js';

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
    assert.equal(toRomaji('ぢ'), 'ji');
    assert.equal(toRomaji('づ'), 'zu');
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

  it('marks terminal small tsu without leaking kana into romaji', () => {
    assert.equal(toRomaji('くっ'), "ku'");
    assert.equal(toRomaji('えいっ'), "ei'");
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

  it('handles extended katakana loanword combos after kana normalization', () => {
    assert.equal(toRomaji('てぃー'), 'tii');
    assert.equal(toRomaji('でぃー'), 'dii');
    assert.equal(toRomaji('ふぁ'), 'fa');
    assert.equal(toRomaji('ふぃ'), 'fi');
    assert.equal(toRomaji('ふぇ'), 'fe');
    assert.equal(toRomaji('ふぉ'), 'fo');
    assert.equal(toRomaji('ちぇ'), 'che');
    assert.equal(toRomaji('じぇ'), 'je');
    assert.equal(toRomaji('うぃ'), 'wi');
    assert.equal(toRomaji('うぇ'), 'we');
    assert.equal(toRomaji('うぉ'), 'wo');
    assert.equal(toRomaji('つぁ'), 'tsa');
    assert.equal(toRomaji('つぃ'), 'tsi');
    assert.equal(toRomaji('つぇ'), 'tse');
    assert.equal(toRomaji('つぉ'), 'tso');
  });

  it('does not collapse full-size kana that only look like extended combos', () => {
    assert.equal(toRomaji('てい'), 'tei');
    assert.equal(toRomaji('でい'), 'dei');
    assert.equal(toRomaji('ふあ'), 'fua');
    assert.equal(toRomaji('うえ'), 'ue');
    assert.equal(toRomaji('うお'), 'uo');
  });

  it('disambiguates moraic n before vowels and y sounds', () => {
    assert.equal(toRomaji('ほんや'), "hon'ya");
    assert.equal(toRomaji('げんいん'), "gen'in");
    assert.equal(toRomaji('しんよう'), "shin'you");
    assert.equal(toRomaji('こんな'), 'konna');
    assert.equal(toRomaji('さん'), 'san');
  });

  it('converts particle pronunciation only when token metadata says particle', () => {
    assert.equal(toPronunciationRomaji('は', { surface: 'は', pos0: '助詞' }), 'wa');
    assert.equal(toPronunciationRomaji('へ', { surface: 'へ', pos0: '助詞' }), 'e');
    assert.equal(toPronunciationRomaji('を', { surface: 'を', pos0: '助詞' }), 'o');

    assert.equal(toPronunciationRomaji('は', { surface: 'は' }), 'ha');
    assert.equal(toPronunciationRomaji('へ', { surface: 'へ' }), 'he');
    assert.equal(toPronunciationRomaji('を', { surface: 'を' }), 'wo');
  });

  it('converts lexicalized final は guides without changing raw readings', () => {
    const greeting = {
      surface: 'こんにちは',
      reading: 'こんにちは',
      pos: 'Interjection',
      normalizedForm: '今日は',
    };

    assert.equal(pronunciationReading(greeting.reading, greeting), 'こんにちわ');
    assert.equal(toPronunciationRomaji(greeting.reading, greeting), 'konnichiwa');
    assert.equal(toPronunciationRomaji('こんばんは', { surface: 'こんばんは' }), 'konbanwa');
    assert.equal(toPronunciationRomaji('はな', { surface: '花', pos: 'Noun' }), 'hana');
  });
});
