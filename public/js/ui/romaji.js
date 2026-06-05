const COMBOS = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja',  'じゅ': 'ju',  'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  // Extended katakana loanword sounds after katakana->hiragana normalization.
  'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo',
  'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo',
  'しぇ': 'she', 'じぇ': 'je', 'ちぇ': 'che',
  'てぃ': 'ti', 'でぃ': 'di',
  'とぅ': 'tu', 'どぅ': 'du',
  'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso',
  'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
};

const SINGLES = {
  'あ': 'a',  'い': 'i',  'う': 'u',  'え': 'e',  'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi','す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi','つ': 'tsu','て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya',             'ゆ': 'yu',             'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'ゐ': 'wi',             'ゑ': 'we', 'を': 'wo',
  'ん': 'n',
  // Dakuten
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ゔ': 'vu',
  // Handakuten
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  // Small vowels (standalone, rare but pass through as vowel)
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
  'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo',
};

/**
 * Get the last vowel character from a romaji string.
 * Returns the vowel character or null if none found.
 */
function lastVowel(str) {
  for (let i = str.length - 1; i >= 0; i--) {
    if ('aeiou'.includes(str[i])) return str[i];
  }
  return null;
}

export function katakanaToHiragana(text = '') {
  return Array.from(String(text)).map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) return String.fromCharCode(code - 0x60);
    return ch;
  }).join('');
}

function tokenText(token = {}) {
  return token.surface || token.base || token.baseForm || token.word || token.name || '';
}

function tokenPos(token = {}) {
  return token.pos0 || token.pos || '';
}

function isParticleToken(token = {}) {
  const pos = tokenPos(token);
  return pos === '助詞' || pos === 'Particle';
}

function hasKanjiBeforeFinalKanaWa(text = '') {
  return /[\u4E00-\u9FFF].*は$/u.test(String(text));
}

function isKanaOnlyGreetingFinalWa(surface = '', reading = '') {
  if (!surface || surface !== reading) return false;
  return /^([ぁ-ゖ]+)(ちは|ばんは)$/u.test(surface);
}

function isLexicalizedFinalWaToken(token = {}, reading = '') {
  if (!reading.endsWith('は')) return false;

  const surface = tokenText(token);
  const normalized = token.normalizedForm || token.normalized || '';
  const pos = tokenPos(token);

  if (
    hasKanjiBeforeFinalKanaWa(surface)
    || hasKanjiBeforeFinalKanaWa(normalized)
    || isKanaOnlyGreetingFinalWa(surface, reading)
  ) {
    return true;
  }

  return (pos === '感動詞' || pos === 'Interjection')
    && surface.endsWith('は')
    && reading === katakanaToHiragana(surface)
    && reading.length >= 4;
}

/**
 * Resolve the spoken kana used for pronunciation guides while preserving raw
 * tokenizer/dictionary readings for lookup and study data.
 *
 * @param {string} reading - Raw token or dictionary reading.
 * @param {object} token - Optional token metadata such as surface, pos0, pos, normalizedForm.
 * @returns {{ reading: string, reasons: string[] }}
 */
export function pronunciationReadingInfo(reading = '', token = {}) {
  const raw = katakanaToHiragana(reading || token.reading || '');
  if (!raw) return { reading: raw, reasons: [] };

  const surface = tokenText(token);
  if (isParticleToken(token)) {
    if (surface === 'は') return { reading: 'わ', reasons: ['particle-wa'] };
    if (surface === 'へ') return { reading: 'え', reasons: ['particle-e'] };
    if (surface === 'を') return { reading: 'お', reasons: ['particle-o'] };
  }

  if (isLexicalizedFinalWaToken(token, raw)) {
    return { reading: `${raw.slice(0, -1)}わ`, reasons: ['lexicalized-final-wa'] };
  }

  return { reading: raw, reasons: [] };
}

export function pronunciationReading(reading = '', token = {}) {
  return pronunciationReadingInfo(reading, token).reading;
}

export function toPronunciationRomaji(reading = '', token = {}) {
  return toRomaji(pronunciationReading(reading, token));
}

/**
 * Convert a hiragana string to romaji.
 * Non-hiragana characters are passed through unchanged.
 *
 * @param {string} str - Input string (may contain hiragana and other characters)
 * @returns {string} Romaji representation
 */
export function toRomaji(str) {
  if (!str) return str;

  const chars = [...str]; // Unicode-safe split
  let result = '';
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    // Long vowel mark: repeat the last vowel of current output
    if (ch === 'ー') {
      const v = lastVowel(result);
      if (v) result += v;
      else result += 'ー'; // no preceding vowel, pass through
      i++;
      continue;
    }

    // Small tsu (っ): double the consonant of the next character
    if (ch === 'っ') {
      // Peek at next char's romaji to get its first consonant
      let nextRomaji = '';
      if (i + 1 < chars.length) {
        const next = chars[i + 1];
        const nextNext = i + 2 < chars.length ? chars[i + 2] : null;
        const combo = nextNext ? COMBOS[next + nextNext] : null;
        nextRomaji = combo || SINGLES[next] || next;
      }
      if (nextRomaji && /[a-z]/.test(nextRomaji[0]) && nextRomaji[0] !== 'n') {
        result += nextRomaji[0]; // double the consonant
      } else {
        result += "'"; // terminal/unsupported small tsu marks an abrupt cutoff
      }
      i++;
      continue;
    }

    // Moraic n before a vowel or y-sound needs a separator (e.g. ほんや -> hon'ya).
    if (ch === 'ん') {
      let nextRomaji = '';
      if (i + 1 < chars.length) {
        const next = chars[i + 1];
        const nextNext = i + 2 < chars.length ? chars[i + 2] : null;
        const combo = nextNext ? COMBOS[next + nextNext] : null;
        nextRomaji = combo || SINGLES[next] || next;
      }
      result += nextRomaji && /^[aeiouy]/.test(nextRomaji) ? "n'" : 'n';
      i++;
      continue;
    }

    // Check two-character combos first
    if (i + 1 < chars.length) {
      const two = ch + chars[i + 1];
      if (COMBOS[two]) {
        result += COMBOS[two];
        i += 2;
        continue;
      }
    }

    // Single hiragana character
    if (SINGLES[ch] !== undefined) {
      result += SINGLES[ch];
      i++;
      continue;
    }

    // Pass through anything else (Latin, numbers, kanji, katakana, punctuation)
    result += ch;
    i++;
  }

  return result;
}

/**
 * Escape HTML-special characters for safe insertion into innerHTML.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the popup headword HTML.
 *
 * Pronunciation-above-headword rule:
 *   - Beginner mode: <ruby>hiragana<rt>romaji</rt></ruby>
 *   - Kanji mode (kanji word): <ruby>kanji<rt>hiragana</rt></ruby>
 *   - Kanji mode (kana-only word): bare hiragana (kanji-mode players have graduated past romaji)
 *   - Empty reading: bare base (fallback)
 *
 * Inputs are HTML-escaped to prevent injection from dictionary data.
 *
 * @param {string} base - dictionary headword (kanji form where available)
 * @param {string} reading - hiragana reading
 * @param {boolean} useKanji - true for Area 4+, false for Areas 1-3
 * @param {object} metadata - Optional token metadata for pronunciation rules.
 * @returns {string} HTML string
 */
export function buildHeadwordRuby(base, reading, useKanji, metadata = {}) {
  const b = base || '';
  const r = reading || '';

  if (!r) return escapeHtml(b);
  if (!useKanji) {
    const token = { surface: b, base: b, ...metadata };
    return `<ruby>${escapeHtml(r)}<rt>${escapeHtml(toPronunciationRomaji(r, token))}</rt></ruby>`;
  }
  if (b === r) return escapeHtml(r);
  return `<ruby>${escapeHtml(b)}<rt>${escapeHtml(r)}</rt></ruby>`;
}

export function buildResolvedHeadwordRuby(headword, guideText, guideKind = 'romaji') {
  const h = headword || '';
  const guide = guideText || '';
  if (!guide || guideKind === 'none') return escapeHtml(h);
  return `<ruby>${escapeHtml(h)}<rt>${escapeHtml(guide)}</rt></ruby>`;
}
