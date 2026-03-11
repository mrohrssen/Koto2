// src/game/bootstrap/renderer.js
import { parseTaggedText } from './parser.js';

/**
 * Render a single word in jp-first mode.
 * Always shows kanji + furigana. Shows English annotation if word is unknown.
 */
export function renderJpFirst(kanji, reading, english, knownWords) {
  const isKnown = knownWords.has(kanji);
  let html = '<span class="bs-word">';

  if (reading) {
    html += `<ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby>`;
  } else {
    html += esc(kanji);
  }

  if (!isKnown && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
  }

  html += '</span>';
  return html;
}

/**
 * Render a tagged string in en-first mode.
 * Known words show as Japanese with ruby, unknown words show as English.
 */
export function renderEnFirst(taggedText, knownWords) {
  const segments = parseTaggedText(taggedText);
  return segments.map(seg => {
    if (seg.type === 'text') return esc(seg.content);
    const isKnown = knownWords.has(seg.kanji);
    if (!isKnown) return esc(seg.english);
    if (seg.reading) {
      return `<span class="bs-word"><ruby>${esc(seg.kanji)}<rt>${esc(seg.reading)}</rt></ruby></span>`;
    }
    return `<span class="bs-word">${esc(seg.kanji)}</span>`;
  }).join('');
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
