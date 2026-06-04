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
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/u;
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

function hasMeaningfulValue(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function hasJapaneseText(value) {
  return JAPANESE_TEXT_PATTERN.test(toText(value));
}

function hasControlCharacters(value) {
  return CONTROL_CHAR_PATTERN.test(toText(value));
}

function splitSlashSegments(value) {
  const text = normalizeMarker(value);
  if (!text.includes('/')) return [text];
  return text.split('/').map(segment => segment.trim());
}

function hasPlaceholderValue(value) {
  return splitSlashSegments(value).some(segment => PLACEHOLDERS.has(segment.toLowerCase()));
}

function hasEmptySlashSegment(value) {
  return splitSlashSegments(value).some(segment => segment.length === 0);
}

function validateReviewColumns(columns) {
  if (columns.length !== REVIEW_COLUMNS.length) return false;
  return columns.every((column, index) => column === REVIEW_COLUMNS[index]);
}

function lookupByKanji(source, kanji) {
  if (!source) return {};
  if (source instanceof Map) return source.get(kanji) || {};
  if (typeof source === 'object') return source[kanji] || {};
  return {};
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
  if (!source) {
    throw new Error('CSV text is empty');
  }

  const rows = [];
  let row = [];
  let cell = '';
  let state = 'start';
  let rowNumber = 1;

  const csvError = (message) => new Error(`${message} (row ${rowNumber}, column ${row.length + 1})`);

  const pushRow = () => {
    rows.push(row);
    row = [];
    cell = '';
    rowNumber++;
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'quoted') {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        state = 'afterQuote';
        continue;
      }
      cell += ch;
      continue;
    }

    if (state === 'afterQuote') {
      if (ch === ',') {
        row.push(cell);
        cell = '';
        state = 'start';
        continue;
      }

      if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++;
        row.push(cell);
        pushRow();
        state = 'start';
        continue;
      }

      throw csvError('Illegal quote placement after closing quote');
    }

    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      pushRow();
      state = 'start';
      continue;
    }

    if (ch === '"') {
      if (cell.length > 0) {
        throw csvError('Illegal quote placement inside an unquoted field');
      }
      state = 'quoted';
      continue;
    }

    cell += ch;
    state = 'unquoted';
  }

  if (state === 'quoted') {
    throw csvError('Unclosed quoted field');
  }

  if (state === 'afterQuote' || cell.length > 0 || row.length > 0) {
    row.push(cell);
    pushRow();
  }

  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  if (rows.length === 0) {
    throw new Error('CSV text is empty');
  }

  const [header, ...dataRows] = rows;
  if (!validateReviewColumns(header)) {
    throw new Error(`CSV header must match REVIEW_COLUMNS: ${REVIEW_COLUMNS.join(',')}`);
  }

  return dataRows.map((values, index) => {
    const rowNumberForData = index + 2;
    if (values.length < REVIEW_COLUMNS.length) {
      throw new Error(`Missing columns in CSV row ${rowNumberForData}: expected ${REVIEW_COLUMNS.length}, received ${values.length}`);
    }
    if (values.length > REVIEW_COLUMNS.length) {
      throw new Error(`Extra trailing columns in CSV row ${rowNumberForData}: expected ${REVIEW_COLUMNS.length}, received ${values.length}`);
    }
    return Object.fromEntries(REVIEW_COLUMNS.map((column, columnIndex) => [column, values[columnIndex] ?? '']));
  });
}

export function buildReviewRows({ entries = [], jpdbByKanji = {}, wanikaniByKanji = {} } = {}) {
  return entries.map(entry => {
    const jpdb = lookupByKanji(jpdbByKanji, entry.kanji);
    const wanikani = lookupByKanji(wanikaniByKanji, entry.kanji);

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

    const proposedRaw = toText(row?.proposedFinalKeyword);
    const proposed = normalizeMarker(proposedRaw);
    if (!proposed || isNoChangeValue(proposed)) return;

    if (hasControlCharacters(proposedRaw)) {
      throw new Error(`Control characters are not allowed in proposed English keywords for ${kanji}: ${proposedRaw}`);
    }

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

  if (seenKanji.size !== entryByKanji.size) {
    const missing = [...entryByKanji.keys()].filter(kanji => !seenKanji.has(kanji));
    throw new Error(`Missing reviewed rows for: ${missing.join(', ')}`);
  }

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

  if (hasMeaningfulValue(options.curationVersion)) {
    updatedDictionary.curationVersion = options.curationVersion;
  }

  return { dictionary: updatedDictionary, changed };
}
