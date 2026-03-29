// public/js/ui/bootstrap-client.js

import { apiUrl } from '../platform.js';
import { toRomaji } from './romaji.js';

const TAG_RE = /\{([^|{}]*)\|([^|{}]*)\|([^|}]*)\}/g;

let _knownWords = new Set();
const _pendingExposures = new Set();

/** Set the player's known words (called on game load). */
export function setKnownWords(words) {
  _knownWords = new Set(words);
}

/** Get current known words set. */
export function getKnownWords() {
  return _knownWords;
}

/**
 * Render tagged text in en-first mode (i+1).
 * Known words → Japanese with ruby (reinforcement).
 * One unknown word → Japanese with ruby + English annotation (teaching).
 * Remaining unknown words → plain English.
 */
export function renderEnFirst(taggedText) {
  if (!taggedText) return '';

  // Two-pass: find first unknown word to teach (i+1)
  const unknowns = [];
  let idx = 0;
  taggedText.replace(TAG_RE, (_, _e, kanji) => {
    if (!_knownWords.has(kanji)) unknowns.push(idx);
    idx++;
  });
  const teachIdx = unknowns.length > 0 ? unknowns[0] : -1;

  let wordIndex = 0;
  return taggedText.replace(TAG_RE, (_, english, kanji, reading) => {
    const i = wordIndex++;
    const isKnown = _knownWords.has(kanji);

    if (isKnown || i === teachIdx) {
      let html = '<span class="bs-word">';
      if (reading) {
        html += `<ruby>${esc(reading)}<rt>${esc(toRomaji(reading))}</rt></ruby>`;
      } else {
        html += esc(reading || kanji);
      }
      if (!isKnown) {
        html += `<span class="bs-word-en">${esc(english)}</span>`;
        _pendingExposures.add(kanji);
      }
      html += '</span>';
      return html;
    }

    return esc(english);
  });
}

/**
 * Render a single word in jp-first mode.
 * Always shows kanji + furigana. Shows English if word is unknown.
 */
export function renderJpFirst(kanji, reading, english) {
  let html = '<span class="bs-word">';
  if (reading) {
    html += `<ruby>${esc(reading)}<rt>${esc(toRomaji(reading))}</rt></ruby>`;
  } else {
    html += esc(reading || kanji);
  }
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
  }
  html += '</span>';
  return html;
}

/**
 * Flush pending i+1 word exposures to the server.
 * Call after rendering a batch of UI (e.g. after shop items are displayed).
 */
export function flushExposures() {
  if (_pendingExposures.size === 0) return;
  const words = [..._pendingExposures];
  _pendingExposures.clear();
  const token = localStorage.getItem('authToken');
  if (!token) return;
  fetch(apiUrl('/api/game/known-words/expose'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ words })
  }).catch(() => {});
}

/** HTML-escape a string. Exported for use by other UI modules. */
export function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
