import { toRomaji } from './romaji.js';

export const JAPANESE_DISPLAY_MODES = Object.freeze({
  HIRAGANA: 'hiragana',
  NATURAL: 'natural',
});

export function normalizeJapaneseDisplayMode(options = {}) {
  const explicit = options.japaneseDisplayMode || options.mode;
  if (explicit === JAPANESE_DISPLAY_MODES.NATURAL) return JAPANESE_DISPLAY_MODES.NATURAL;
  if (explicit === JAPANESE_DISPLAY_MODES.HIRAGANA) return JAPANESE_DISPLAY_MODES.HIRAGANA;

  // Compatibility only. Current production defaults to hiragana; natural mode
  // is not user-facing until display metadata exists.
  if (options.useKanji === true) return JAPANESE_DISPLAY_MODES.NATURAL;
  return JAPANESE_DISPLAY_MODES.HIRAGANA;
}

function katakanaToHiragana(text = '') {
  return Array.from(String(text)).map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) return String.fromCharCode(code - 0x60);
    return ch;
  }).join('');
}

function tokenReading(token = {}) {
  return token.reading || token.hiraganaSurface || token.surface || token.base || token.baseForm || '';
}

function hiraganaMainText(token = {}, reading = '') {
  return token.hiraganaSurface || reading || token.surface || '';
}

function naturalMainText(token = {}, reading = '') {
  return token.naturalSurface || token.hiraganaSurface || reading || token.surface || '';
}

export function resolveJapaneseDisplay(token = {}, options = {}) {
  const mode = normalizeJapaneseDisplayMode(options);
  const reading = tokenReading(token);

  if (mode === JAPANESE_DISPLAY_MODES.NATURAL) {
    const mainText = naturalMainText(token, reading);
    return {
      mode,
      mainText,
      guideText: reading,
      guideKind: 'hiragana',
      lookupHeadword: token.preferredSurface || token.base || token.baseForm || mainText,
      reading,
    };
  }

  const mainText = hiraganaMainText(token, reading);
  return {
    mode: JAPANESE_DISPLAY_MODES.HIRAGANA,
    mainText,
    guideText: toRomaji(katakanaToHiragana(reading)),
    guideKind: 'romaji',
    lookupHeadword: token.preferredReading || mainText,
    reading,
  };
}
