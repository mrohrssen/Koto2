/**
 * @fileoverview Render bootstrap narration with progressive scaffolding
 * @module src/game/bootstrap-renderer
 *
 * Converts parsed bootstrap text + word tracker into HTML with <ruby> annotations.
 * Scaffolding stages:
 *   1: <ruby>kanji<rt>hiragana</rt></ruby> <span class="scaffold-romaji">romaji</span> <span class="scaffold-english">(english)</span>
 *   2: <ruby>kanji<rt>hiragana</rt></ruby> <span class="scaffold-english">(english)</span>
 *   3: <ruby>kanji<rt>hiragana</rt></ruby>
 */

import { parseBootstrapText, extractTaggedWords } from './bootstrap-parser.js';
import { getWordStage } from './word-tracker.js';

const STAGES = { FULL: 1, NO_ROMAJI: 2, FURIGANA: 3, BARE: 4 };

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render a single tagged word with appropriate scaffolding
 */
function renderWord(wordSeg, stage) {
  const { english, kanji, hiragana, romaji } = wordSeg;
  const needsFurigana = kanji !== hiragana;

  let html = '<span class="bootstrap-word">';

  // Kanji with optional furigana
  if (needsFurigana) {
    html += `<ruby>${escapeHtml(kanji)}<rt>${escapeHtml(hiragana)}</rt></ruby>`;
  } else {
    html += escapeHtml(kanji);
  }

  // Stage 1: add romaji
  if (stage <= STAGES.FULL) {
    html += `<span class="scaffold-romaji">${escapeHtml(romaji)}</span>`;
  }

  // Stage 1-2: add English
  if (stage <= STAGES.NO_ROMAJI) {
    html += `<span class="scaffold-english">(${escapeHtml(english)})</span>`;
  }

  html += '</span>';
  return html;
}

/**
 * Render bootstrap narration text into HTML with scaffolding.
 *
 * @param {string} text - Raw bootstrap narration with {english|kanji|hiragana|romaji} tags
 * @param {Object} tracker - Player's word tracker
 * @param {Object} [options] - Options
 * @param {boolean} [options.returnMeta] - If true, return { html, exposedWords } instead of just html
 * @returns {string|Object} HTML string, or { html, exposedWords } if returnMeta is true
 */
export function renderBootstrapNarration(text, tracker, options = {}) {
  const segments = parseBootstrapText(text);
  const exposedWords = extractTaggedWords(text);

  const htmlParts = segments.map(seg => {
    if (seg.type === 'text') {
      return escapeHtml(seg.content);
    }

    // Determine stage: use tracker if word exists, otherwise stage 1 (new word)
    const stage = getWordStage(tracker, seg.kanji) ?? STAGES.FULL;
    return renderWord(seg, stage);
  });

  const html = htmlParts.join('');

  if (options.returnMeta) {
    return { html, exposedWords };
  }
  return html;
}
