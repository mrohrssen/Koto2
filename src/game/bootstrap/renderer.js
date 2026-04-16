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
 * Render a tagged string in en-first mode (i+1).
 * Known words → Japanese with ruby (reinforcement).
 * One unknown word → Japanese with ruby + English annotation (teaching).
 * Remaining unknown words → plain English.
 */
export function renderEnFirst(taggedText, knownWords) {
  const segments = parseTaggedText(taggedText);

  // Find the first unknown word to teach (i+1)
  const wordSegs = segments.filter(s => s.type === 'word');
  const teachKanji = wordSegs.find(s => !knownWords.has(s.kanji))?.kanji || null;

  return segments.map(seg => {
    if (seg.type === 'text') return esc(seg.content);
    const isKnown = knownWords.has(seg.kanji);

    if (isKnown || seg.kanji === teachKanji) {
      let html = '<span class="bs-word">';
      if (seg.reading) {
        html += `<ruby>${esc(seg.kanji)}<rt>${esc(seg.reading)}</rt></ruby>`;
      } else {
        html += esc(seg.kanji);
      }
      if (!isKnown) {
        html += `<span class="bs-word-en">${esc(seg.english)}</span>`;
      }
      html += '</span>';
      return html;
    }

    return esc(seg.english);
  }).join('');
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
