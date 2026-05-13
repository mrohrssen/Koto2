import { toRomaji } from './romaji.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning
} from '../shared/exposure-extractor.js';
import { record as recordExposure } from './exposure-buffer.js';

const TAG_RE = /\{([^|{}]*)\|([^|{}]*)\|([^|}]*)\}/g;
const ATTACHABLE_PUNCT_RE = /^[\p{P}\p{S}]+$/u;

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
 * @param {Array<{surface: string, baseForm: string, pos: string, reading: string, meaning?: string, meanings?: Array}>} tokens
 *   Tokens are expected to arrive pre-enriched by the server (meaning + meanings stamped).
 * @param {Set<string>} knownWords - baseForm strings the player knows
 * @param {Map|null} wordDict - legacy fallback dict. Pass null in production; tokens
 *   now carry their own meaning. Kept in the signature for compatibility with the
 *   shared resolver's final fallback and unit-test convenience.
 * @param {Object<string, string>} overrides - baseForm → English override
 * @param {boolean} useKanji - false for Areas 1-3 (hiragana), true for Area 4+
 * @param {{recordExposure?: boolean}} options - pass recordExposure:false for display-only labels
 * @returns {string} HTML string
 */
export function renderJpSentence(tokens, knownWords, wordDict, overrides = {}, useKanji = false, options = {}) {
  if (!tokens || tokens.length === 0) return '';

  if (options.recordExposure !== false) {
    recordExposure(tokens, wordDict, overrides);
  }

  const isAttachablePunctuation = token => {
    const surface = token?.surface || '';
    return !!surface && !isContentExposureToken(token) && ATTACHABLE_PUNCT_RE.test(surface);
  };

  const rendered = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const { surface } = token;

    const baseForm = getTokenBaseForm(token);
    const reading = token.reading;

    if (!isContentExposureToken(token)) {
      rendered.push(`<span class="jp-punct">${esc(surface)}</span>`);
      continue;
    }

    let trailingPunct = '';
    while (i + 1 < tokens.length && isAttachablePunctuation(tokens[i + 1])) {
      i += 1;
      trailingPunct += tokens[i].surface || '';
    }

    const isKnown = knownWords.has(baseForm);
    const displayReading = reading || surface;

    const meaning = resolveExposureMeaning(token, wordDict, overrides);
    const isFromOverride = !!overrides?.[baseForm];

    const pos = token.pos || '';
    const meaningsJson = Array.isArray(token.meanings)
      ? JSON.stringify(token.meanings)
      : '';

    let dataAttrs = ` data-base="${esc(baseForm)}" data-reading="${esc(displayReading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"`;
    if (isFromOverride) dataAttrs += ' data-override="1"';
    if (meaningsJson) dataAttrs += ` data-meanings="${esc(meaningsJson)}"`;
    if (useKanji) dataAttrs += ' data-kanji-mode="1"';

    if (isKnown) {
      const display = useKanji ? surface : displayReading;
      rendered.push(`<span class="jp-word jp-known"${dataAttrs}>`
        + `<ruby>${esc(display)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
        + `${esc(trailingPunct)}</span>`);
      continue;
    }

    const typeClass = token.entity ? 'jp-entity' : 'jp-unknown';
    const firstSense = meaning.split('/')[0].trim();
    const parenIdx = firstSense.indexOf('(');
    const primaryEn = parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
    rendered.push(`<span class="jp-word ${typeClass}"${dataAttrs}>`
      + `<ruby>${esc(displayReading)}<rt>${esc(toRomaji(displayReading))}</rt></ruby>`
      + `${esc(trailingPunct)}`
      + `<span class="jp-stack-en">${esc(primaryEn)}</span>`
      + `</span>`);
  }

  return rendered.join('');
}

/**
 * Convert a game entity to a universal token for rendering.
 * Works with moves, items, creatures, NPC roles, speakers.
 */
export function entityToToken(entity) {
  const surface = entity.word || entity.name;
  const reading = entity.reading;
  const meaning = entity.nameEn || entity.meaning;
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
