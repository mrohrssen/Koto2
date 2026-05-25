import { toRomaji } from './romaji.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning,
} from '../shared/exposure-extractor.js';

const ATTACHABLE_PUNCT_RE = /^[\p{P}\p{S}]+$/u;
const HIRAGANA_RE = /^[\u3040-\u309F]+$/u;

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function hasGrammarHints(token) {
  return Array.isArray(token?.grammarHints) && token.grammarHints.length > 0;
}

export function grammarReading(token) {
  return token?.grammarHints?.find(hint => hint.readingOverride)?.readingOverride
    || token?.reading
    || token?.surface
    || '';
}

export function grammarHintsAttr(cellOrToken) {
  const grammarHints = cellOrToken?.grammarHints || [];
  if (!Array.isArray(grammarHints) || grammarHints.length === 0) return '';
  return ` data-grammar-hints="${esc(JSON.stringify(grammarHints))}"`;
}

export function tokenDataAttrs(cell) {
  if (!cell || cell.kind === 'punctuation') return '';

  let attrs = '';
  if (cell.kind === 'word') {
    attrs += ` data-base="${esc(cell.base)}"`;
  }
  attrs += ` data-reading="${esc(cell.reading)}"`;

  if (cell.kind === 'word') {
    attrs += ` data-meaning="${esc(cell.meaning)}" data-pos="${esc(cell.pos)}"`;
    if (cell.isFromOverride) attrs += ' data-override="1"';
    if (Array.isArray(cell.meanings) && cell.meanings.length > 0) {
      attrs += ` data-meanings="${esc(JSON.stringify(cell.meanings))}"`;
    }
    if (cell.useKanji) attrs += ' data-kanji-mode="1"';
  }

  attrs += grammarHintsAttr(cell);
  return attrs;
}

export function buildJapaneseTokenCells({
  tokens = [],
  knownWords = new Set(),
  wordDict = null,
  overrides = {},
  useKanji = false,
  mergeSmallTsuContinuation = false,
} = {}) {
  const cells = [];

  for (const token of tokens || []) {
    const previousCell = cells[cells.length - 1];
    if (mergeSmallTsuContinuation && isSmallTsuContinuation(token, previousCell)) {
      previousCell.continuationSurface += token.surface || '';
      previousCell.continuationReading += token.reading || token.surface || '';
      finalizeCell(previousCell, { useKanji });
      continue;
    }

    if (isAttachablePunctuation(token) && cells.length > 0) {
      previousCell.trailingPunct += token.surface || '';
      finalizeCell(previousCell, { useKanji });
      continue;
    }

    const cell = createCell(token, { knownWords, wordDict, overrides, useKanji });
    finalizeCell(cell, { useKanji });
    cells.push(cell);
  }

  return cells;
}

function createCell(token, { knownWords, wordDict, overrides, useKanji }) {
  const content = isContentExposureToken(token);
  if (content) {
    const base = getTokenBaseForm(token);
    const meaning = resolveExposureMeaning(token, wordDict, overrides);
    const meanings = Array.isArray(token.meanings) ? token.meanings : [];
    return {
      kind: 'word',
      lookupClass: 'jp-word',
      token,
      surface: token.surface || '',
      surfaceWithContinuation: token.surface || '',
      base,
      reading: token.reading || token.surface || base,
      meaning,
      meanings,
      pos: token.pos || '',
      grammarHints: Array.isArray(token.grammarHints) ? token.grammarHints : [],
      isKnown: knownWords?.has?.(base) || false,
      isFromOverride: !!overrides?.[base],
      useKanji,
      clickable: true,
      continuationSurface: '',
      continuationReading: '',
      trailingPunct: '',
    };
  }

  if (hasGrammarHints(token)) {
    return {
      kind: 'grammar',
      lookupClass: 'jp-grammar',
      token,
      surface: token.surface || '',
      surfaceWithContinuation: token.surface || '',
      base: '',
      reading: grammarReading(token),
      meaning: '',
      meanings: [],
      pos: token.pos || '',
      grammarHints: token.grammarHints,
      isKnown: false,
      isFromOverride: false,
      useKanji,
      clickable: true,
      continuationSurface: '',
      continuationReading: '',
      trailingPunct: '',
    };
  }

  return {
    kind: 'punctuation',
    lookupClass: 'jp-punct',
    token,
    surface: token?.surface || '',
    surfaceWithContinuation: token?.surface || '',
    base: '',
    reading: token?.reading || token?.surface || '',
    meaning: '',
    meanings: [],
    pos: token?.pos || '',
    grammarHints: [],
    isKnown: false,
    isFromOverride: false,
    useKanji,
    clickable: false,
    continuationSurface: '',
    continuationReading: '',
    trailingPunct: '',
  };
}

function finalizeCell(cell, { useKanji }) {
  const continuationSurface = cell.continuationSurface || '';
  const continuationReading = cell.continuationReading || continuationSurface;

  if (cell.kind === 'word') {
    const readingBase = baseReading(cell);
    const baseDisplay = useKanji ? cell.surface : readingBase;
    const continuation = useKanji ? continuationSurface : continuationReading;
    cell.reading = `${readingBase}${continuationReading}`;
    cell.surfaceWithContinuation = `${cell.surface}${continuationSurface}`;
    cell.displayBase = `${baseDisplay}${continuation}`;
    cell.display = `${cell.displayBase}${cell.trailingPunct || ''}`;
    cell.romaji = toRomaji(cell.reading);
    return;
  }

  if (cell.kind === 'grammar') {
    cell.surfaceWithContinuation = cell.surface;
    cell.displayBase = cell.surface;
    cell.display = `${cell.surface}${cell.trailingPunct || ''}`;
    cell.romaji = toRomaji(cell.reading);
    return;
  }

  cell.surfaceWithContinuation = cell.surface;
  cell.displayBase = cell.surface;
  cell.display = `${cell.surface}${cell.trailingPunct || ''}`;
  cell.romaji = '';
}

function baseReading(cell) {
  const raw = cell.token?.reading || cell.token?.surface || cell.base || '';
  const continuationReading = cell.continuationReading || cell.continuationSurface || '';
  if (continuationReading && raw.endsWith(continuationReading)) return raw.slice(0, -continuationReading.length);
  return raw;
}

function isAttachablePunctuation(token) {
  const surface = token?.surface || '';
  return !!surface && !isContentExposureToken(token) && !hasGrammarHints(token) && ATTACHABLE_PUNCT_RE.test(surface);
}

function isSmallTsuContinuation(token, previousCell) {
  if (!previousCell || previousCell.kind !== 'word') return false;
  if (isContentExposureToken(token) || hasGrammarHints(token)) return false;

  const previousReading = previousCell.reading || previousCell.surface || previousCell.base || '';
  const continuationReading = token?.reading || token?.surface || '';
  return previousReading.endsWith('っ') && HIRAGANA_RE.test(continuationReading);
}
