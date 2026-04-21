import { toRomaji } from './romaji.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning
} from '../shared/exposure-extractor.js';
import { record as recordExposure } from './exposure-buffer.js';

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
      }
      html += '</span>';
      return html;
    }

    return esc(english);
  });
}

/**
 * Render a tokenized Japanese sentence with known/unknown word display.
 *
 * Known words: inline hiragana (Areas 1-3) or kanji (Area 4+).
 * Unknown words: vertical stack — hiragana reading on top, English below.
 * Punctuation: rendered as-is.
 *
 * @param {Array<{surface: string, baseForm: string, pos: string, reading: string}>} tokens
 * @param {Set<string>} knownWords - baseForm strings the player knows
 * @param {Map<string, {reading: string, definitions: Array<{en: string, primary?: boolean}>}>} wordDict
 * @param {Object<string, string>} overrides - baseForm → English override
 * @param {boolean} useKanji - false for Areas 1-3 (hiragana), true for Area 4+
 * @returns {string} HTML string
 */
export function renderJpSentence(tokens, knownWords, wordDict, overrides = {}, useKanji = false) {
  if (!tokens || tokens.length === 0) return '';

  recordExposure(tokens, wordDict, overrides);

  return tokens.map(token => {
    const { surface } = token;

    const baseForm = getTokenBaseForm(token);
    const reading = token.reading;

    if (!isContentExposureToken(token)) {
      return `<span class="jp-punct">${esc(surface)}</span>`;
    }

    const isKnown = knownWords.has(baseForm);
    const displayReading = reading || surface;

    // Look up meaning for data attribute (needed for both known and unknown)
    const meaning = resolveExposureMeaning(token, wordDict, overrides);

    const pos = token.pos || '';
    const dataAttrs = ` data-base="${esc(baseForm)}" data-reading="${esc(displayReading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"`;

    if (isKnown) {
      const display = useKanji ? surface : displayReading;
      return `<span class="jp-word jp-known"${dataAttrs}>`
        + `<ruby>${esc(display)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
        + `</span>`;
    }

    // Unknown word
    const typeClass = token.entity ? 'jp-entity' : 'jp-unknown';
    return `<span class="jp-word ${typeClass}"${dataAttrs}>`
      + `<ruby>${esc(displayReading)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
      + `<span class="jp-stack-en">${esc(meaning.split('/')[0].trim())}</span>`
      + `</span>`;
  }).join('');
}

/**
 * Convert a game entity to a universal token for rendering.
 * Works with moves, items, creatures, NPC roles, speakers.
 */
export function entityToToken(entity) {
  const surface = entity.word || entity.baseWord || entity.name;
  const reading = entity.reading || entity.baseReading;
  const meaning = entity.nameEn || entity.baseMeaning || entity.meaning;
  return { surface, base: surface, reading, meaning, entity: true };
}

/** Add a word to known set (client-side only, no server call). */
export function addKnownWord(word) {
  _knownWords.add(word);
}

/** Remove a word from known set (client-side only, no server call). */
export function removeKnownWord(word) {
  _knownWords.delete(word);
}

/** HTML-escape a string. Exported for use by other UI modules. */
export function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
