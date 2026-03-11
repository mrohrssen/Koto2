// public/js/ui/bootstrap-client.js

const TAG_RE = /\{([^|{}]*)\|([^|{}]*)\|([^|}]*)\}/g;

let _knownWords = new Set();

/** Set the player's known words (called on game load). */
export function setKnownWords(words) {
  _knownWords = new Set(words);
}

/** Get current known words set. */
export function getKnownWords() {
  return _knownWords;
}

/**
 * Render tagged text in en-first mode.
 * Known words show as Japanese with ruby, unknown stay English.
 */
export function renderEnFirst(taggedText) {
  if (!taggedText) return '';
  return taggedText.replace(TAG_RE, (_, english, kanji, reading) => {
    if (!_knownWords.has(kanji)) return esc(english);
    if (reading) {
      return `<span class="bs-word"><ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby></span>`;
    }
    return `<span class="bs-word">${esc(kanji)}</span>`;
  });
}

/**
 * Render a single word in jp-first mode.
 * Always shows kanji + furigana. Shows English if word is unknown.
 */
export function renderJpFirst(kanji, reading, english) {
  let html = '<span class="bs-word">';
  if (reading) {
    html += `<ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby>`;
  } else {
    html += esc(kanji);
  }
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
  }
  html += '</span>';
  return html;
}

/** HTML-escape a string. Exported for use by other UI modules. */
export function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
