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
  'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
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
        result += 'っ'; // fallback: can't double, pass through
      }
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
 * @returns {string} HTML string
 */
export function buildHeadwordRuby(base, reading, useKanji) {
  const b = base || '';
  const r = reading || '';

  if (!r) return escapeHtml(b);
  if (!useKanji) return `<ruby>${escapeHtml(r)}<rt>${escapeHtml(toRomaji(r))}</rt></ruby>`;
  if (b === r) return escapeHtml(r);
  return `<ruby>${escapeHtml(b)}<rt>${escapeHtml(r)}</rt></ruby>`;
}
