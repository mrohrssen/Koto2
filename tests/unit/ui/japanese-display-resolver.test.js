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

  it('supports grammar reading overrides', () => {
    const display = resolveJapaneseDisplay({
      surface: 'は',
      reading: 'わ',
    }, { japaneseDisplayMode: 'hiragana' });

    assert.equal(display.mainText, 'わ');
    assert.equal(display.guideText, 'wa');
  });
});
