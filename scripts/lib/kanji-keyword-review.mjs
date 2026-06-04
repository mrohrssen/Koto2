export const REVIEW_COLUMNS = Object.freeze([
  'rank',
  'kanji',
  'kind',
  'currentPrimaryKeyword',
  'jpdbPrimaryKeyword',
  'wanikaniPrimaryDefinition',
  'proposedFinalKeyword',
  'proposalSource',
  'proposalNotes',
  'jpdbStatus',
  'wanikaniStatus',
]);

const NO_CHANGE = 'NO CHANGE';
const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const PLACEHOLDERS = new Set(['?', 'unknown', 'same']);

function toText(value) {
  return value == null ? '' : String(value);
}

function normalizeMarker(value) {
  return toText(value).trim();
}

function isNoChangeValue(value) {
  return normalizeMarker(value).toUpperCase() === NO_CHANGE;
}

function hasJapaneseText(value) {
  return JAPANESE_TEXT_PATTERN.test(toText(value));
}

function hasPlaceholderValue(value) {
  return PLACEHOLDERS.has(normalizeMarker(value).toLowerCase());
}

function hasEmptySlashSegment(value) {
  const text = normalizeMarker(value);
  if (!text.includes('/')) return false;
  return text.split('/').some(segment => segment.trim().length === 0);
}

function validateReviewColumns(columns) {
  if (columns.length !== REVIEW_COLUMNS.length) return false;
  return columns.every((column, index) => column === REVIEW_COLUMNS[index]);
}

export function csvEscape(value) {
  const text = toText(value);
  if (text === '') return '';
  if (!/[",\r\n]/u.test(text)) return text;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function rowsToCsv(rows) {
  const lines = [REVIEW_COLUMNS.join(',')];

  for (const row of rows) {
    const values = REVIEW_COLUMNS.map(column => csvEscape(row?.[column] ?? ''));
    lines.push(values.join(','));
  }

  return `${lines.join('\n')}\n`;
}

export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error('CSV text is empty');
  }

  const [header, ...dataRows] = rows;
  if (!validateReviewColumns(header)) {
    throw new Error(`CSV header must match REVIEW_COLUMNS: ${REVIEW_COLUMNS.join(',')}`);
  }

  return dataRows.map(values =>
    Object.fromEntries(REVIEW_COLUMNS.map((column, index) => [column, values[index] ?? '']))
  );
}

export function buildReviewRows({ entries = [], jpdbByKanji = {}, wanikaniByKanji = {} } = {}) {
  return entries.map(entry => {
    const jpdb = jpdbByKanji[entry.kanji] || {};
    const wanikani = wanikaniByKanji[entry.kanji] || {};

    return {
      rank: toText(entry.frequencyRank ?? ''),
      kanji: toText(entry.kanji ?? ''),
      kind: toText(entry.kind ?? ''),
      currentPrimaryKeyword: toText(entry.primaryMeaning ?? ''),
      jpdbPrimaryKeyword: toText(jpdb.keyword ?? ''),
      wanikaniPrimaryDefinition: toText(wanikani.meaning ?? ''),
      proposedFinalKeyword: NO_CHANGE,
      proposalSource: 'no_change',
      proposalNotes: '',
      jpdbStatus: toText(jpdb.status ?? 'not_checked'),
      wanikaniStatus: toText(wanikani.status ?? 'not_checked'),
    };
  });
}

export function validateReviewedRows(entries, rows) {
  const entryByKanji = new Map(entries.map(entry => [toText(entry.kanji ?? ''), entry]));
  const seenKanji = new Set();

  rows.forEach((row, index) => {
    const kanji = normalizeMarker(row?.kanji);
    if (!kanji) {
      throw new Error(`Missing kanji in reviewed row ${index + 2}`);
    }

    const entry = entryByKanji.get(kanji);
    if (!entry) {
      throw new Error(`Unknown kanji in reviewed row ${index + 2}: ${kanji}`);
    }

    if (seenKanji.has(kanji)) {
      throw new Error(`Duplicate reviewed kanji: ${kanji}`);
    }
    seenKanji.add(kanji);

    const rank = normalizeMarker(row?.rank);
    if (rank !== toText(entry.frequencyRank ?? '')) {
      throw new Error(`Rank mismatch for ${kanji}: expected ${entry.frequencyRank}, received ${row?.rank}`);
    }

    const proposed = normalizeMarker(row?.proposedFinalKeyword);
    if (!proposed || isNoChangeValue(proposed)) return;

    if (hasJapaneseText(proposed)) {
      throw new Error(`Japanese text is not allowed in proposed English keywords for ${kanji}: ${proposed}`);
    }

    if (hasPlaceholderValue(proposed)) {
      throw new Error(`Rejected placeholder proposed keyword for ${kanji}: ${proposed}`);
    }

    if (hasEmptySlashSegment(proposed)) {
      throw new Error(`Rejected proposed keyword with empty slash-separated segments for ${kanji}: ${proposed}`);
    }
  });

  return true;
}

export function applyReviewedKeywords(dictionary, rows, options = {}) {
  validateReviewedRows(dictionary?.entries ?? [], rows);

  const proposedByKanji = new Map();
  for (const row of rows) {
    const proposed = normalizeMarker(row?.proposedFinalKeyword);
    if (!proposed || isNoChangeValue(proposed)) continue;
    proposedByKanji.set(normalizeMarker(row?.kanji), proposed);
  }

  const changed = [];
  const entries = (dictionary?.entries ?? []).map(entry => {
    const proposed = proposedByKanji.get(toText(entry.kanji ?? ''));
    if (!proposed || proposed === toText(entry.primaryMeaning ?? '')) {
      return entry;
    }

    changed.push({
      kanji: entry.kanji,
      from: entry.primaryMeaning,
      to: proposed,
    });

    return {
      ...entry,
      primaryMeaning: proposed,
    };
  });

  const updatedDictionary = {
    ...dictionary,
    entries,
  };

  if (Object.prototype.hasOwnProperty.call(options, 'curationVersion')) {
    updatedDictionary.curationVersion = options.curationVersion;
  }

  return { dictionary: updatedDictionary, changed };
}
