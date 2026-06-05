import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  JAPANESE_DISPLAY_MODES,
  normalizeJapaneseDisplayMode,
  resolveJapaneseDisplay,
} from '../../../public/js/ui/japanese-display-resolver.js';

describe('japanese display resolver', () => {
  it('defaults to hiragana mode', () => {
    assert.equal(normalizeJapaneseDisplayMode(), JAPANESE_DISPLAY_MODES.HIRAGANA);
    assert.equal(normalizeJapaneseDisplayMode({}), JAPANESE_DISPLAY_MODES.HIRAGANA);
  });

  it('normalizes legacy kanaMode and useKanji hints', () => {
    assert.equal(normalizeJapaneseDisplayMode({ kanaMode: true }), 'hiragana');
    assert.equal(normalizeJapaneseDisplayMode({ kanaMode: false }), 'hiragana');
    assert.equal(normalizeJapaneseDisplayMode({ useKanji: false }), 'hiragana');
    assert.equal(normalizeJapaneseDisplayMode({ useKanji: true }), 'natural');
  });

  it('normalizes explicit japaneseDisplayMode first', () => {
    assert.equal(normalizeJapaneseDisplayMode({ japaneseDisplayMode: 'natural', kanaMode: true }), 'natural');
    assert.equal(normalizeJapaneseDisplayMode({ japaneseDisplayMode: 'hiragana', useKanji: true }), 'hiragana');
  });

  it('resolves hiragana mode to reading plus romaji guide', () => {
    const display = resolveJapaneseDisplay({
      surface: '森',
      base: '森',
      reading: 'もり',
      preferredSurface: '森',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(display.mode, 'hiragana');
    assert.equal(display.mainText, 'もり');
    assert.equal(display.guideText, 'mori');
    assert.equal(display.guideKind, 'romaji');
    assert.equal(display.lookupHeadword, 'もり');
  });

  it('uses spoken guides for lexicalized final は greetings', () => {
    const display = resolveJapaneseDisplay({
      surface: 'こんにちは',
      base: 'こんにちは',
      reading: 'こんにちは',
      pos: 'Interjection',
      normalizedForm: '今日は',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(display.mainText, 'こんにちは');
    assert.equal(display.guideText, 'konnichiwa');
    assert.equal(display.reading, 'こんにちは');

    const evening = resolveJapaneseDisplay({
      surface: 'こんばんは',
      base: 'こんばんは',
      reading: 'こんばんは',
      pos0: '感動詞',
      normalizedForm: '今晩は',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(evening.mainText, 'こんばんは');
    assert.equal(evening.guideText, 'konbanwa');
    assert.equal(evening.reading, 'こんばんは');

    const kanjiGreeting = resolveJapaneseDisplay({
      surface: '今日は',
      base: '今日は',
      reading: 'こんにちは',
      pos: 'Noun',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(kanjiGreeting.mainText, 'こんにちは');
    assert.equal(kanjiGreeting.guideText, 'konnichiwa');
    assert.equal(kanjiGreeting.reading, 'こんにちは');
  });

  it('does not treat final は as wa for ordinary words or standalone kana lessons', () => {
    const flower = resolveJapaneseDisplay({
      surface: '花',
      base: '花',
      reading: 'はな',
      pos: 'Noun',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(flower.guideText, 'hana');

    const kanaCard = resolveJapaneseDisplay({
      surface: 'は',
      reading: 'は',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(kanaCard.guideText, 'ha');
  });

  it('uses spoken guides for kana-only greetings even without tokenizer metadata', () => {
    const hello = resolveJapaneseDisplay({
      surface: 'こんにちは',
      reading: 'こんにちは',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(hello.guideText, 'konnichiwa');

    const evening = resolveJapaneseDisplay({
      surface: 'こんばんは',
      reading: 'こんばんは',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(evening.guideText, 'konbanwa');
  });

  it('uses particle pronunciation when token metadata identifies particles', () => {
    const wa = resolveJapaneseDisplay({
      surface: 'は',
      reading: 'は',
      pos0: '助詞',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(wa.mainText, 'は');
    assert.equal(wa.guideText, 'wa');

    const e = resolveJapaneseDisplay({
      surface: 'へ',
      reading: 'へ',
      pos0: '助詞',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(e.guideText, 'e');

    const o = resolveJapaneseDisplay({
      surface: 'を',
      reading: 'を',
      pos0: '助詞',
    }, { japaneseDisplayMode: 'hiragana' });
    assert.equal(o.guideText, 'o');
  });

  it('preserves katakana readings in hiragana mode', () => {
    const display = resolveJapaneseDisplay({
      surface: 'コーヒー',
      base: 'コーヒー',
      reading: 'コーヒー',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(display.mainText, 'コーヒー');
    assert.equal(display.guideText, 'koohii');
  });

  it('resolves natural mode from precomputed or surface fields without deriving conjugation', () => {
    const explicit = resolveJapaneseDisplay({
      surface: 'みた',
      base: '見る',
      reading: 'みた',
      naturalSurface: '見た',
      preferredSurface: '見る',
    }, { japaneseDisplayMode: 'natural' });
    assert.equal(explicit.mainText, '見た');
    assert.equal(explicit.guideText, 'みた');
    assert.equal(explicit.guideKind, 'hiragana');
    assert.equal(explicit.lookupHeadword, '見る');

    const fallback = resolveJapaneseDisplay({
      surface: 'みた',
      base: '見る',
      reading: 'みた',
    }, { japaneseDisplayMode: 'natural' });
    assert.equal(fallback.mainText, 'みた');
    assert.equal(fallback.guideText, 'みた');
  });

  it('uses spoken kana for natural-mode pronunciation guides', () => {
    const display = resolveJapaneseDisplay({
      surface: 'は',
      reading: 'は',
      pos0: '助詞',
    }, { japaneseDisplayMode: 'natural' });

    assert.equal(display.mainText, 'は');
    assert.equal(display.guideText, 'わ');
    assert.equal(display.reading, 'は');
  });

  it('supports grammar reading overrides', () => {
    const display = resolveJapaneseDisplay({
      surface: 'は',
      reading: 'わ',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(display.mainText, 'わ');
    assert.equal(display.guideText, 'wa');
  });
});
