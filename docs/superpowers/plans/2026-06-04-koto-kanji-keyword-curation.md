# Koto Kanji Keyword Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `data/kanji/koto-kanji-dictionary.json` into Koto's hand-curated kanji source of truth, generate a 4000-row keyword review CSV from JPDB/WaniKani evidence, and provide a safe importer for the user's reviewed CSV.

**Architecture:** Runtime reads a compact curated JSON dictionary directly. Separate script tooling fetches and caches JPDB/WaniKani evidence under ignored output paths, assembles review CSVs, and later imports user-approved keyword changes into only `primaryMeaning`. The legacy generator is archived so it cannot overwrite curated data.

**Tech Stack:** Node.js ES modules, built-in `node:test`, built-in `fetch`, JSON, CSV, existing SRS/Kanji Kombat modules, gitignored `output/` and `tmp/` caches.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-06-04-koto-kanji-keyword-curation-design.md`
- Current dictionary: `data/kanji/koto-kanji-dictionary.json`
- Current loader: `src/game/koto-kanji-dictionary.js`
- Current deck bridge: `src/game/script-decks.js`
- Current SRS merge behavior: `src/game/script-srs.js`

## File Structure

- Modify `data/kanji/koto-kanji-dictionary.json`
  - Convert top-level metadata from generated schema v1 to curated schema v2.
  - Keep all 4000 entries in the same order.
- Move `data/kanji/manual-overrides.json`
  - To `data/kanji/sources/manual-overrides-legacy-2026-06-04.json`.
  - It becomes historical reference only.
- Modify `src/game/koto-kanji-dictionary.js`
  - Validate schema v2 curated metadata.
  - Export compact metadata with no JPDB/WaniKani references.
- Modify `src/game/script-srs.js`
  - No production change expected, but add regression coverage proving existing users receive new static keyword metadata while FSRS progress stays intact.
- Move `scripts/build-koto-kanji-dictionary.mjs`
  - To `scripts/archive/build-koto-kanji-dictionary-legacy.mjs`.
  - Remove default writes to `data/kanji/koto-kanji-dictionary.json`.
- Create `scripts/lib/kanji-keyword-review.mjs`
  - Pure CSV, validation, review-row, and import helpers.
- Create `scripts/fetch-wanikani-kanji-keywords.mjs`
  - Fetch and cache WaniKani kanji primary meanings.
- Create `scripts/fetch-jpdb-kanji-keywords.mjs`
  - Fetch and cache JPDB kanji keywords, with respectful public-page fallback.
- Create `scripts/build-kanji-keyword-review-csv.mjs`
  - Assemble the full CSV and curation slices.
- Create `scripts/import-kanji-keyword-review.mjs`
  - Import the user-reviewed CSV into the curated dictionary.
- Modify `docs/data-sources.md`
  - State that Koto owns the kanji dictionary and JPDB/WaniKani stay in temporary review artifacts only.
- Modify tests:
  - `tests/unit/game/koto-kanji-dictionary.test.js`
  - `tests/unit/game/script-srs.test.js`
  - `tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js`
  - `tests/unit/scripts/kanji-keyword-review.test.js`
  - `tests/unit/scripts/kanji-keyword-fetchers.test.js`

## Subagent Ownership

- **Agent A: Dictionary Promotion**
  - Owns `data/kanji/koto-kanji-dictionary.json`, `src/game/koto-kanji-dictionary.js`, `tests/unit/game/koto-kanji-dictionary.test.js`, and `docs/data-sources.md`.
- **Agent B: Legacy Generator Retirement**
  - Owns `scripts/archive/build-koto-kanji-dictionary-legacy.mjs`, legacy generator tests, and the manual-overrides archival move.
- **Agent C: Review Library And Importer**
  - Owns `scripts/lib/kanji-keyword-review.mjs`, `scripts/import-kanji-keyword-review.mjs`, and related unit tests.
- **Agent D: Source Fetchers**
  - Owns WaniKani and JPDB fetch scripts, parser/cache helpers, and fetcher tests.
- **Agent E: CSV Assembly And Curation Slices**
  - Owns `scripts/build-kanji-keyword-review-csv.mjs`, slice output behavior, and CSV assembly tests.
- **Coordinator: Curation Batch Dispatch**
  - Runs read-only curation subagents over generated slices after source caches exist.
  - Assembles their structured outputs into the final review CSV.

---

### Task 1: Promote The Dictionary Schema

**Files:**
- Modify: `data/kanji/koto-kanji-dictionary.json`
- Modify: `src/game/koto-kanji-dictionary.js`
- Modify: `tests/unit/game/koto-kanji-dictionary.test.js`

- [ ] **Step 1: Write the failing curated-schema tests**

Replace the source-metadata test in `tests/unit/game/koto-kanji-dictionary.test.js` with curated metadata assertions:

```js
import {
  getKotoKanjiEntries,
  getKotoKanjiEntry,
  getKotoKanjiMetadata,
} from '../../../src/game/koto-kanji-dictionary.js';

// Keep the existing assertNoField helper and the existing entry/rank tests.

it('exposes compact Koto-owned curation metadata', () => {
  const metadata = getKotoKanjiMetadata();
  assert.equal(metadata.schemaVersion, 2);
  assert.equal(metadata.maintainer, 'Koto');
  assert.equal(metadata.status, 'hand-curated');
  assert.equal(typeof metadata.curationVersion, 'string');
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'sources'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'referenceSources'), false);
  assert.equal(JSON.stringify(metadata).toLowerCase().includes('jpdb'), false);
  assert.equal(JSON.stringify(metadata).toLowerCase().includes('wanikani'), false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js
```

Expected: FAIL because `getKotoKanjiMetadata` is not exported and the dictionary is still schema v1.

- [ ] **Step 3: Update dictionary top-level metadata**

Edit only the top-level fields in `data/kanji/koto-kanji-dictionary.json`:

```json
{
  "schemaVersion": 2,
  "curationVersion": "2026-06-04",
  "maintainer": "Koto",
  "status": "hand-curated",
  "entries": [
    {
      "kanji": "人",
      "frequencyRank": 1
    }
  ]
}
```

Preserve every existing entry object and its order. Remove only top-level `generatedAt` and `sources`.

- [ ] **Step 4: Update the loader validation**

In `src/game/koto-kanji-dictionary.js`, replace `getKotoKanjiSources()` with `getKotoKanjiMetadata()` and validate schema v2:

```js
function validateDictionary(data) {
  if (data.schemaVersion !== 2) {
    throw new Error('Invalid Koto kanji dictionary: schemaVersion must be 2');
  }
  assertString(data.curationVersion, 'curationVersion');
  if (data.maintainer !== 'Koto') {
    throw new Error('Invalid Koto kanji dictionary: maintainer must be Koto');
  }
  if (data.status !== 'hand-curated') {
    throw new Error('Invalid Koto kanji dictionary: status must be hand-curated');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'generatedAt')) {
    throw new Error('Invalid Koto kanji dictionary: generatedAt must not be stored');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sources')) {
    throw new Error('Invalid Koto kanji dictionary: sources must not be stored');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'referenceSources')) {
    throw new Error('Invalid Koto kanji dictionary: referenceSources must not be stored');
  }
  assertArray(data.entries, 'entries');

  const seenKanji = new Set();
  const seenRanks = new Set();
  data.entries.forEach((entry, index) => {
    validateEntry(entry, index);
    if (seenKanji.has(entry.kanji)) throw new Error(`Duplicate Koto kanji entry: ${entry.kanji}`);
    if (seenRanks.has(entry.frequencyRank)) throw new Error(`Duplicate Koto kanji rank: ${entry.frequencyRank}`);
    seenKanji.add(entry.kanji);
    seenRanks.add(entry.frequencyRank);
  });
}

const metadata = Object.freeze({
  schemaVersion: dictionary.schemaVersion,
  curationVersion: dictionary.curationVersion,
  maintainer: dictionary.maintainer,
  status: dictionary.status,
});

export function getKotoKanjiMetadata() {
  return metadata;
}
```

Remove the `sources` constant and `getKotoKanjiSources()` export.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add data/kanji/koto-kanji-dictionary.json src/game/koto-kanji-dictionary.js tests/unit/game/koto-kanji-dictionary.test.js
/usr/bin/git commit -m "feat: promote koto kanji dictionary to curated source"
```

---

### Task 2: Preserve Existing User SRS Progress While Refreshing Keywords

**Files:**
- Modify: `tests/unit/game/script-srs.test.js`
- Optional modify only if test fails: `src/game/script-srs.js`

- [ ] **Step 1: Add the regression test**

Add this test near the existing script SRS seeding tests:

```js
it('refreshes kanji answer metadata while preserving existing FSRS progress', () => {
  const userId = 'script-kanji-refresh-user';
  const cards = ensureScriptDeckSeeded(userId);
  const staticCard = KANJI_SCRIPT_CARDS[0];
  const saved = loadSrsData(userId);
  const old = saved.script.cards.find(card => card.id === staticCard.id);
  old.answer = 'old keyword';
  old.keyword = 'old keyword';
  old.reps = 7;
  old.lapses = 1;
  old.state = State.Review;
  old.due = new Date('2099-01-01T00:00:00.000Z');
  saveSrsData(userId, saved);

  const refreshed = ensureScriptDeckSeeded(userId).find(card => card.id === staticCard.id);

  assert.equal(refreshed.answer, staticCard.answer);
  assert.equal(refreshed.keyword, staticCard.keyword);
  assert.equal(refreshed.reps, 7);
  assert.equal(refreshed.lapses, 1);
  assert.equal(refreshed.state, State.Review);
  assert.equal(new Date(refreshed.due).toISOString(), '2099-01-01T00:00:00.000Z');
  assert.equal(cards.some(card => card.id === staticCard.id), true);
});
```

If `loadSrsData`, `saveSrsData`, `ensureScriptDeckSeeded`, `KANJI_SCRIPT_CARDS`, or `State` are not imported in the test file, add imports from their existing module paths.

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test tests/unit/game/script-srs.test.js
```

Expected: PASS with current merge behavior. If it fails, inspect `mergeStaticCard()` in `src/game/script-srs.js`.

- [ ] **Step 3: Fix only if needed**

If the test fails because old `answer` or `keyword` wins over static data, change `mergeStaticCard()` to preserve only FSRS fields from the existing card:

```js
function mergeStaticCard(existing, staticCard) {
  return {
    ...staticCard,
    ...createEmptyCard(),
    ...fsrsFieldsFrom(existing),
  };
}
```

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add tests/unit/game/script-srs.test.js src/game/script-srs.js
/usr/bin/git commit -m "test: prove kanji keyword refresh preserves srs progress"
```

---

### Task 3: Retire The Legacy Generator

**Files:**
- Move: `scripts/build-koto-kanji-dictionary.mjs` to `scripts/archive/build-koto-kanji-dictionary-legacy.mjs`
- Move: `data/kanji/manual-overrides.json` to `data/kanji/sources/manual-overrides-legacy-2026-06-04.json`
- Move/modify: `tests/unit/scripts/build-koto-kanji-dictionary.test.js` to `tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js`

- [ ] **Step 1: Move the files**

Run:

```bash
mkdir -p scripts/archive
/usr/bin/git mv scripts/build-koto-kanji-dictionary.mjs scripts/archive/build-koto-kanji-dictionary-legacy.mjs
/usr/bin/git mv data/kanji/manual-overrides.json data/kanji/sources/manual-overrides-legacy-2026-06-04.json
/usr/bin/git mv tests/unit/scripts/build-koto-kanji-dictionary.test.js tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js
```

- [ ] **Step 2: Update the legacy test import path**

In `tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js`, update the import:

```js
} from '../../../scripts/archive/build-koto-kanji-dictionary-legacy.mjs';
```

Also update the describe title:

```js
describe('legacy build-koto-kanji-dictionary', () => {
```

- [ ] **Step 3: Make the legacy CLI unable to overwrite curated data**

In `scripts/archive/build-koto-kanji-dictionary-legacy.mjs`, change the defaults and CLI guard:

```js
const DEFAULT_OVERRIDES_PATH = 'data/kanji/sources/manual-overrides-legacy-2026-06-04.json';
const DEFAULT_OUT_PATH = 'output/kanji-keyword-review/koto-kanji-dictionary-legacy-build.json';
const CURATED_DICTIONARY_PATH = 'data/kanji/koto-kanji-dictionary.json';
```

Add this helper near `parseArgs()`:

```js
function assertSafeLegacyOutput(path) {
  if (path === CURATED_DICTIONARY_PATH) {
    throw new Error('Refusing to write legacy generated output over curated Koto kanji dictionary');
  }
}
```

Call it in `runCli()` immediately after parsing args:

```js
const args = parseArgs(process.argv.slice(2));
assertSafeLegacyOutput(args.out);
```

- [ ] **Step 4: Add a CLI guard unit test**

Add this test to `tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js` if exported helpers make it practical. If `assertSafeLegacyOutput` is not exported, export it:

```js
import { assertSafeLegacyOutput } from '../../../scripts/archive/build-koto-kanji-dictionary-legacy.mjs';

it('refuses to write legacy output over the curated dictionary', () => {
  assert.throws(
    () => assertSafeLegacyOutput('data/kanji/koto-kanji-dictionary.json'),
    /Refusing to write legacy generated output/
  );
  assert.doesNotThrow(() => assertSafeLegacyOutput('output/kanji-keyword-review/legacy.json'));
});
```

- [ ] **Step 5: Run the legacy focused tests**

Run:

```bash
node --test tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add scripts/archive/build-koto-kanji-dictionary-legacy.mjs data/kanji/sources/manual-overrides-legacy-2026-06-04.json tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js
/usr/bin/git add -u scripts/build-koto-kanji-dictionary.mjs data/kanji/manual-overrides.json tests/unit/scripts/build-koto-kanji-dictionary.test.js
/usr/bin/git commit -m "chore: archive kanji dictionary generator"
```

---

### Task 4: Add Pure Review CSV And Import Helpers

**Files:**
- Create: `scripts/lib/kanji-keyword-review.mjs`
- Create/modify: `tests/unit/scripts/kanji-keyword-review.test.js`

- [ ] **Step 1: Write the helper tests**

Create `tests/unit/scripts/kanji-keyword-review.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_COLUMNS,
  applyReviewedKeywords,
  buildReviewRows,
  csvEscape,
  parseCsv,
  rowsToCsv,
  validateReviewedRows,
} from '../../../scripts/lib/kanji-keyword-review.mjs';

describe('kanji keyword review helpers', () => {
  it('escapes CSV fields', () => {
    assert.equal(csvEscape('plain'), 'plain');
    assert.equal(csvEscape('a,b'), '"a,b"');
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
    assert.equal(csvEscape('line\nbreak'), '"line\nbreak"');
  });

  it('round trips review rows in column order', () => {
    const rows = [{
      rank: 1,
      kanji: '人',
      kind: 'Kyōiku (1st grade)',
      currentPrimaryKeyword: 'person',
      jpdbPrimaryKeyword: 'person',
      wanikaniPrimaryDefinition: 'Person',
      proposedFinalKeyword: 'NO CHANGE',
      proposalSource: 'no_change',
      proposalNotes: '',
      jpdbStatus: 'matched',
      wanikaniStatus: 'matched',
    }];
    const parsed = parseCsv(rowsToCsv(rows));
    assert.deepEqual(Object.keys(parsed[0]), REVIEW_COLUMNS);
    assert.equal(parsed[0].kanji, '人');
    assert.equal(parsed[0].proposedFinalKeyword, 'NO CHANGE');
  });

  it('builds one review row per dictionary entry', () => {
    const rows = buildReviewRows({
      entries: [{ kanji: '人', frequencyRank: 1, kind: 'grade', primaryMeaning: 'person' }],
      jpdbByKanji: new Map([['人', { keyword: 'person', status: 'matched' }]]),
      wanikaniByKanji: new Map([['人', { meaning: 'Person', status: 'matched' }]]),
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rank, 1);
    assert.equal(rows[0].proposedFinalKeyword, 'NO CHANGE');
  });

  it('imports changed primary meanings only', () => {
    const dictionary = {
      schemaVersion: 2,
      curationVersion: '2026-06-04',
      maintainer: 'Koto',
      status: 'hand-curated',
      entries: [
        { kanji: '人', frequencyRank: 1, kind: 'grade', primaryMeaning: 'person', primaryReading: 'ひと', secondaryMeanings: [], secondaryReadings: [], examples: [], mnemonic: null, notes: null },
        { kanji: '言', frequencyRank: 2, kind: 'grade', primaryMeaning: 'say', primaryReading: 'げん', secondaryMeanings: [], secondaryReadings: [], examples: [], mnemonic: null, notes: null },
      ],
    };
    const rows = [
      { rank: '1', kanji: '人', currentPrimaryKeyword: 'person', proposedFinalKeyword: 'NO CHANGE' },
      { rank: '2', kanji: '言', currentPrimaryKeyword: 'say', proposedFinalKeyword: 'word' },
    ];
    const result = applyReviewedKeywords(dictionary, rows, { curationVersion: '2026-06-05' });
    assert.equal(result.dictionary.entries[0].primaryMeaning, 'person');
    assert.equal(result.dictionary.entries[1].primaryMeaning, 'word');
    assert.equal(result.changed.length, 1);
    assert.equal(result.dictionary.curationVersion, '2026-06-05');
  });

  it('rejects malformed reviewed rows', () => {
    const entries = [
      { kanji: '人', frequencyRank: 1, primaryMeaning: 'person' },
    ];
    assert.throws(
      () => validateReviewedRows(entries, [{ rank: '2', kanji: '人', proposedFinalKeyword: 'human' }]),
      /rank mismatch/
    );
    assert.throws(
      () => validateReviewedRows(entries, [{ rank: '1', kanji: '人', proposedFinalKeyword: 'ひと' }]),
      /English keyword/
    );
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-review.test.js
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the helper module**

Create `scripts/lib/kanji-keyword-review.mjs`:

```js
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

const NO_CHANGE = new Set(['', 'NO CHANGE']);

export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows) {
  return [
    REVIEW_COLUMNS.join(','),
    ...rows.map(row => REVIEW_COLUMNS.map(column => csvEscape(row[column])).join(',')),
  ].join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map(values => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ''])));
}

export function buildReviewRows({ entries, jpdbByKanji = new Map(), wanikaniByKanji = new Map() }) {
  return entries.map(entry => {
    const jpdb = jpdbByKanji.get(entry.kanji) || {};
    const wanikani = wanikaniByKanji.get(entry.kanji) || {};
    return {
      rank: entry.frequencyRank,
      kanji: entry.kanji,
      kind: entry.kind,
      currentPrimaryKeyword: entry.primaryMeaning,
      jpdbPrimaryKeyword: jpdb.keyword || '',
      wanikaniPrimaryDefinition: wanikani.meaning || '',
      proposedFinalKeyword: 'NO CHANGE',
      proposalSource: 'no_change',
      proposalNotes: '',
      jpdbStatus: jpdb.status || 'not_checked',
      wanikaniStatus: wanikani.status || 'not_checked',
    };
  });
}

function isNoChange(value) {
  return NO_CHANGE.has(String(value || '').trim());
}

function assertEnglishKeyword(value, label) {
  const text = String(value || '').trim();
  if (!text) return;
  if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)) {
    throw new Error(`${label}: English keyword must not contain Japanese text`);
  }
  if (/^(?:\?+|unknown|same)$/iu.test(text)) {
    throw new Error(`${label}: invalid placeholder keyword`);
  }
  if (text.split('/').some(part => part.trim() === '')) {
    throw new Error(`${label}: slash-separated keyword has an empty segment`);
  }
}

export function validateReviewedRows(entries, rows) {
  const byKanji = new Map(entries.map(entry => [entry.kanji, entry]));
  const seen = new Set();
  for (const row of rows) {
    const kanji = row.kanji;
    const entry = byKanji.get(kanji);
    if (!entry) throw new Error(`Unknown kanji in review CSV: ${kanji}`);
    if (seen.has(kanji)) throw new Error(`Duplicate kanji in review CSV: ${kanji}`);
    seen.add(kanji);
    if (Number(row.rank) !== entry.frequencyRank) {
      throw new Error(`rank mismatch for ${kanji}: expected ${entry.frequencyRank}, got ${row.rank}`);
    }
    if (!isNoChange(row.proposedFinalKeyword)) {
      assertEnglishKeyword(row.proposedFinalKeyword, kanji);
    }
  }
  return true;
}

export function applyReviewedKeywords(dictionary, rows, options = {}) {
  validateReviewedRows(dictionary.entries, rows);
  const rowByKanji = new Map(rows.map(row => [row.kanji, row]));
  const changed = [];
  const entries = dictionary.entries.map(entry => {
    const row = rowByKanji.get(entry.kanji);
    if (!row) return entry;
    const proposed = String(row.proposedFinalKeyword || '').trim();
    if (isNoChange(proposed) || proposed === entry.primaryMeaning) return entry;
    changed.push({ kanji: entry.kanji, from: entry.primaryMeaning, to: proposed });
    return { ...entry, primaryMeaning: proposed };
  });
  return {
    dictionary: {
      ...dictionary,
      curationVersion: options.curationVersion || dictionary.curationVersion,
      entries,
    },
    changed,
  };
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-review.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add scripts/lib/kanji-keyword-review.mjs tests/unit/scripts/kanji-keyword-review.test.js
/usr/bin/git commit -m "feat: add kanji keyword review helpers"
```

---

### Task 5: Add WaniKani Fetcher

**Files:**
- Create: `scripts/fetch-wanikani-kanji-keywords.mjs`
- Modify: `tests/unit/scripts/kanji-keyword-fetchers.test.js`

- [ ] **Step 1: Write WaniKani extraction tests**

Create `tests/unit/scripts/kanji-keyword-fetchers.test.js` with WaniKani tests first:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWaniKaniKanjiSubjects,
  normalizeWaniKaniSubjects,
} from '../../../scripts/fetch-wanikani-kanji-keywords.mjs';

describe('kanji keyword fetchers', () => {
  it('extracts WaniKani primary kanji meanings', () => {
    const subjects = extractWaniKaniKanjiSubjects({
      data: [{
        id: 440,
        data_updated_at: '2026-01-01T00:00:00.000Z',
        data: {
          characters: '一',
          level: 1,
          document_url: 'https://www.wanikani.com/kanji/%E4%B8%80',
          meanings: [
            { meaning: 'One', primary: true },
            { meaning: 'One Radical', primary: false },
          ],
        },
      }],
    });
    assert.deepEqual(subjects, [{
      kanji: '一',
      meaning: 'One',
      status: 'matched',
      level: 1,
      subjectId: 440,
      dataUpdatedAt: '2026-01-01T00:00:00.000Z',
      documentUrl: 'https://www.wanikani.com/kanji/%E4%B8%80',
    }]);
  });

  it('marks WaniKani subjects with no primary meaning', () => {
    const result = extractWaniKaniKanjiSubjects({
      data: [{
        id: 441,
        data: {
          characters: '二',
          level: 1,
          meanings: [{ meaning: 'Two', primary: false }],
        },
      }],
    });
    assert.equal(result[0].kanji, '二');
    assert.equal(result[0].meaning, '');
    assert.equal(result[0].status, 'no_primary_meaning');
  });

  it('normalizes WaniKani subjects by kanji and marks missing dictionary entries', () => {
    const map = normalizeWaniKaniSubjects(
      [{ kanji: '一', meaning: 'One', status: 'matched' }],
      [{ kanji: '一' }, { kanji: '人' }]
    );
    assert.equal(map.get('一').meaning, 'One');
    assert.equal(map.get('人').status, 'missing_from_wanikani');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-fetchers.test.js
```

Expected: FAIL because the fetcher module does not exist.

- [ ] **Step 3: Implement WaniKani extraction and cache-aware CLI**

Create `scripts/fetch-wanikani-kanji-keywords.mjs`:

```js
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';

const DEFAULT_CACHE = 'output/kanji-keyword-review/wanikani-kanji-cache.json';
const DEFAULT_OUT = 'output/kanji-keyword-review/wanikani-kanji-keywords.json';
const BASE_URL = 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false';
const HEADERS = Object.freeze({ 'Wanikani-Revision': '20170710' });

function ensureDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJsonAtomic(path, data) {
  ensureDir(path);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function extractWaniKaniKanjiSubjects(page) {
  return (page.data || []).map(subject => {
    const primary = subject.data?.meanings?.find(meaning => meaning.primary === true);
    return {
      kanji: subject.data?.characters || '',
      meaning: primary?.meaning || '',
      status: primary?.meaning ? 'matched' : 'no_primary_meaning',
      level: subject.data?.level ?? null,
      subjectId: subject.id,
      dataUpdatedAt: subject.data_updated_at || null,
      documentUrl: subject.data?.document_url || null,
    };
  }).filter(entry => entry.kanji);
}

export function normalizeWaniKaniSubjects(subjects, entries) {
  const byKanji = new Map(subjects.map(subject => [subject.kanji, subject]));
  for (const entry of entries) {
    if (!byKanji.has(entry.kanji)) {
      byKanji.set(entry.kanji, { kanji: entry.kanji, meaning: '', status: 'missing_from_wanikani' });
    }
  }
  return byKanji;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllSubjects(token, fetchFn = fetch) {
  const pages = [];
  let url = BASE_URL;
  while (url) {
    const response = await fetchFn(url, {
      headers: {
        ...HEADERS,
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || 60);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!response.ok) {
      throw new Error(`WaniKani API failed (${response.status}): ${await response.text()}`);
    }
    const page = await response.json();
    pages.push(page);
    url = page.pages?.next_url || null;
  }
  return pages;
}

function parseArgs(argv) {
  const args = { cache: DEFAULT_CACHE, out: DEFAULT_OUT, refresh: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--refresh') args.refresh = true;
    else if (arg === '--cache') args.cache = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.WANIKANI_API_TOKEN;
  if (!token) throw new Error('Set WANIKANI_API_TOKEN');
  const pages = !args.refresh && existsSync(args.cache)
    ? readJson(args.cache)
    : await fetchAllSubjects(token);
  writeJsonAtomic(args.cache, pages);
  const subjects = pages.flatMap(extractWaniKaniKanjiSubjects);
  const normalized = normalizeWaniKaniSubjects(subjects, getKotoKanjiEntries());
  writeJsonAtomic(args.out, Object.fromEntries(normalized));
  console.log(`Wrote WaniKani keyword cache for ${normalized.size} Koto kanji to ${args.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-fetchers.test.js
```

Expected: PASS for WaniKani tests.

- [ ] **Step 5: Run syntax check**

Run:

```bash
node --check scripts/fetch-wanikani-kanji-keywords.mjs
```

Expected: no output and exit 0.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add scripts/fetch-wanikani-kanji-keywords.mjs tests/unit/scripts/kanji-keyword-fetchers.test.js
/usr/bin/git commit -m "feat: fetch wanikani kanji keyword evidence"
```

---

### Task 6: Add JPDB Keyword Fetcher

**Files:**
- Create: `scripts/fetch-jpdb-kanji-keywords.mjs`
- Modify: `tests/unit/scripts/kanji-keyword-fetchers.test.js`

- [ ] **Step 1: Add JPDB parser and normalization tests**

Append these tests to `tests/unit/scripts/kanji-keyword-fetchers.test.js`:

```js
import {
  extractJpdbKeywordFromHtml,
  normalizeJpdbResults,
} from '../../../scripts/fetch-jpdb-kanji-keywords.mjs';

it('extracts JPDB keyword text from public kanji page HTML', () => {
  const html = `
    <html>
      <body>
        <h6>Keyword</h6>
        <div>front side</div>
        <h6>Info</h6>
      </body>
    </html>
  `;
  assert.equal(extractJpdbKeywordFromHtml(html), 'front side');
});

it('returns an empty keyword when the JPDB keyword block is absent', () => {
  assert.equal(extractJpdbKeywordFromHtml('<html><body><h6>Info</h6></body></html>'), '');
});

it('normalizes JPDB results by kanji and marks missing rows', () => {
  const map = normalizeJpdbResults(
    [{ kanji: '表', keyword: 'front side', status: 'matched' }],
    [{ kanji: '表' }, { kanji: '人' }]
  );
  assert.equal(map.get('表').keyword, 'front side');
  assert.equal(map.get('人').status, 'missing');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-fetchers.test.js
```

Expected: FAIL because the JPDB module does not exist.

- [ ] **Step 3: Implement JPDB public-page fetcher**

Create `scripts/fetch-jpdb-kanji-keywords.mjs`:

```js
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';

const DEFAULT_CACHE = 'output/kanji-keyword-review/jpdb-kanji-keywords.json';

function ensureDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJsonAtomic(path, data) {
  ensureDir(path);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

export function extractJpdbKeywordFromHtml(html) {
  const match = String(html).match(/<h6[^>]*>\s*Keyword\s*<\/h6>([\s\S]*?)(?:<h6|<\/body|<\/html)/iu);
  return match ? stripHtml(match[1]) : '';
}

export function normalizeJpdbResults(results, entries) {
  const byKanji = new Map(results.map(result => [result.kanji, result]));
  for (const entry of entries) {
    if (!byKanji.has(entry.kanji)) {
      byKanji.set(entry.kanji, { kanji: entry.kanji, keyword: '', status: 'missing' });
    }
  }
  return byKanji;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchKeyword(kanji, fetchFn = fetch) {
  const url = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
  const response = await fetchFn(url);
  if (response.status === 429) {
    return { kanji, keyword: '', status: 'rate_limited', sourceUrl: url };
  }
  if (response.status === 404) {
    return { kanji, keyword: '', status: 'missing', sourceUrl: url };
  }
  if (!response.ok) {
    return { kanji, keyword: '', status: 'fetch_failed', sourceUrl: url, error: String(response.status) };
  }
  const keyword = extractJpdbKeywordFromHtml(await response.text());
  return { kanji, keyword, status: keyword ? 'matched' : 'parse_failed', sourceUrl: url };
}

function parseArgs(argv) {
  const args = { cache: DEFAULT_CACHE, refresh: false, limit: null, delayMs: 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--refresh') args.refresh = true;
    else if (arg === '--cache') args.cache = argv[++i];
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const entries = getKotoKanjiEntries().slice(0, args.limit || undefined);
  const cached = !args.refresh && existsSync(args.cache) ? readJson(args.cache) : {};
  const results = new Map(Object.entries(cached));
  for (const entry of entries) {
    if (results.has(entry.kanji)) continue;
    const result = await fetchKeyword(entry.kanji);
    results.set(entry.kanji, { ...result, fetchedAt: new Date().toISOString() });
    writeJsonAtomic(args.cache, Object.fromEntries(results));
    if (result.status === 'rate_limited') await sleep(60000);
    else await sleep(args.delayMs);
  }
  writeJsonAtomic(args.cache, Object.fromEntries(normalizeJpdbResults([...results.values()], getKotoKanjiEntries())));
  console.log(`Wrote JPDB keyword cache to ${args.cache}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run fetcher tests and checks**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-fetchers.test.js
node --check scripts/fetch-jpdb-kanji-keywords.mjs
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add scripts/fetch-jpdb-kanji-keywords.mjs tests/unit/scripts/kanji-keyword-fetchers.test.js
/usr/bin/git commit -m "feat: fetch jpdb kanji keyword evidence"
```

---

### Task 7: Build The Review CSV And Curation Slices

**Files:**
- Create: `scripts/build-kanji-keyword-review-csv.mjs`
- Modify: `tests/unit/scripts/kanji-keyword-review.test.js`

- [ ] **Step 1: Add slice-writing helper tests**

Extend `tests/unit/scripts/kanji-keyword-review.test.js`:

```js
import { buildSliceManifests } from '../../../scripts/build-kanji-keyword-review-csv.mjs';

it('builds stable curation slice manifests', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    rank: index + 1,
    kanji: String(index + 1),
  }));
  const slices = buildSliceManifests(rows, 2);
  assert.deepEqual(slices.map(slice => [slice.index, slice.startRank, slice.endRank, slice.rows.length]), [
    [1, 1, 2, 2],
    [2, 3, 4, 2],
    [3, 5, 5, 1],
  ]);
});
```

- [ ] **Step 2: Implement the assembler**

Create `scripts/build-kanji-keyword-review-csv.mjs`:

```js
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';
import { buildReviewRows, rowsToCsv } from './lib/kanji-keyword-review.mjs';

const DEFAULT_DIR = 'output/kanji-keyword-review';

function readJsonIfExists(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

function objectToMap(value, keywordField) {
  return new Map(Object.entries(value).map(([kanji, item]) => [
    kanji,
    keywordField === 'keyword'
      ? { keyword: item.keyword || '', status: item.status || 'not_checked' }
      : { meaning: item.meaning || '', status: item.status || 'not_checked' },
  ]));
}

function writeTextAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function buildSliceManifests(rows, size) {
  const slices = [];
  for (let i = 0; i < rows.length; i += size) {
    const sliceRows = rows.slice(i, i + size);
    slices.push({
      index: slices.length + 1,
      startRank: Number(sliceRows[0].rank),
      endRank: Number(sliceRows[sliceRows.length - 1].rank),
      rows: sliceRows,
    });
  }
  return slices;
}

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, sliceSize: 100 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--slice-size') args.sliceSize = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const jpdb = readJsonIfExists(join(args.dir, 'jpdb-kanji-keywords.json'));
  const wanikani = readJsonIfExists(join(args.dir, 'wanikani-kanji-keywords.json'));
  const rows = buildReviewRows({
    entries: getKotoKanjiEntries(),
    jpdbByKanji: objectToMap(jpdb, 'keyword'),
    wanikaniByKanji: objectToMap(wanikani, 'meaning'),
  });
  writeTextAtomic(join(args.dir, 'koto-kanji-keyword-review.csv'), rowsToCsv(rows));
  for (const slice of buildSliceManifests(rows, args.sliceSize)) {
    const name = `slice-${String(slice.index).padStart(2, '0')}-r${slice.startRank}-${slice.endRank}.csv`;
    writeTextAtomic(join(args.dir, 'slices', name), rowsToCsv(slice.rows));
  }
  console.log(`Wrote ${rows.length} review rows to ${args.dir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
```

- [ ] **Step 3: Run tests and syntax check**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-review.test.js
node --check scripts/build-kanji-keyword-review-csv.mjs
```

Expected: PASS and syntax check exits 0.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add scripts/build-kanji-keyword-review-csv.mjs tests/unit/scripts/kanji-keyword-review.test.js
/usr/bin/git commit -m "feat: assemble kanji keyword review csv"
```

---

### Task 8: Add Reviewed CSV Importer

**Files:**
- Create: `scripts/import-kanji-keyword-review.mjs`
- Modify: `tests/unit/scripts/kanji-keyword-review.test.js`

- [ ] **Step 1: Add importer command test coverage**

Keep import behavior covered through `applyReviewedKeywords()` from Task 4, add a syntax check for the script, and add this test for dry-run summary formatting:

```js
import { summarizeImportChanges } from '../../../scripts/import-kanji-keyword-review.mjs';

it('summarizes import changes without leaking full dictionary data', () => {
  assert.equal(
    summarizeImportChanges([{ kanji: '言', from: 'say', to: 'word' }]),
    '1 kanji keyword change: 言: say -> word'
  );
  assert.equal(summarizeImportChanges([]), '0 kanji keyword changes');
});
```

- [ ] **Step 2: Implement importer CLI**

Create `scripts/import-kanji-keyword-review.mjs`:

```js
import { readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import {
  applyReviewedKeywords,
  parseCsv,
} from './lib/kanji-keyword-review.mjs';

const DEFAULT_DICTIONARY = 'data/kanji/koto-kanji-dictionary.json';

function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

export function summarizeImportChanges(changed) {
  if (changed.length === 0) return '0 kanji keyword changes';
  const preview = changed.slice(0, 10).map(change => `${change.kanji}: ${change.from} -> ${change.to}`).join('; ');
  const suffix = changed.length > 10 ? `; ${changed.length - 10} more` : '';
  return `${changed.length} kanji keyword change${changed.length === 1 ? '' : 's'}: ${preview}${suffix}`;
}

function parseArgs(argv) {
  const args = {
    dictionary: DEFAULT_DICTIONARY,
    csv: null,
    write: false,
    curationVersion: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dictionary') args.dictionary = argv[++i];
    else if (arg === '--csv') args.csv = argv[++i];
    else if (arg === '--write') args.write = true;
    else if (arg === '--curation-version') args.curationVersion = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.csv) throw new Error('Provide --csv output/kanji-keyword-review/user-reviewed.csv');
  return args;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const dictionary = JSON.parse(readFileSync(args.dictionary, 'utf8'));
  const rows = parseCsv(readFileSync(args.csv, 'utf8'));
  const result = applyReviewedKeywords(dictionary, rows, { curationVersion: args.curationVersion });
  console.log(summarizeImportChanges(result.changed));
  if (args.write) {
    writeJsonAtomic(args.dictionary, result.dictionary);
    console.log(`Updated ${args.dictionary}`);
  } else {
    console.log('Dry run only; pass --write to update the dictionary');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
```

- [ ] **Step 3: Run tests and syntax check**

Run:

```bash
node --test tests/unit/scripts/kanji-keyword-review.test.js
node --check scripts/import-kanji-keyword-review.mjs
```

Expected: PASS and syntax check exits 0.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add scripts/import-kanji-keyword-review.mjs tests/unit/scripts/kanji-keyword-review.test.js
/usr/bin/git commit -m "feat: import reviewed kanji keyword csv"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `docs/data-sources.md`
- Modify if needed: `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`

- [ ] **Step 1: Update data source docs**

Replace the Koto Kanji Dictionary section in `docs/data-sources.md` with:

```md
## Koto Kanji Dictionary

`data/kanji/koto-kanji-dictionary.json` is Koto's hand-curated proprietary kanji dictionary for Kanji Kombat.

- Koto owns the shipped primary keyword choices.
- The dictionary is not generated from a single upstream dictionary.
- JPDB and WaniKani are used only as temporary curation evidence in ignored review CSVs and caches.
- KANJIDIC2, JMdict, and the old JPDB frequency snapshot remain historical/reference inputs.
- API tokens and source-fetch caches must not be committed.

The runtime dictionary intentionally stores only compact gameplay fields: `primaryMeaning`, `secondaryMeanings`, `primaryReading`, `secondaryReadings`, `examples`, `mnemonic`, and `notes`.
```

- [ ] **Step 2: Update Kanji Kombat MVP source wording**

In `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`, change any line that says meanings/readings are generated or enriched from KANJIDIC2/JMdict as the current source of truth. Use:

```md
Kanji cards are sourced from Koto's curated kanji dictionary at `data/kanji/koto-kanji-dictionary.json`. The dictionary contains 4000 entries in the established Koto frequency order. Primary meanings are Koto-owned curated keywords.
```

- [ ] **Step 3: Run doc grep**

Run:

```bash
rg -n "generated dictionary|build-koto-kanji-dictionary|manual-overrides|WaniKani: not used|sources metadata" docs data scripts src tests
```

Expected: hits only where legacy generator archival references or old plans are intentionally historical.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add docs/data-sources.md docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md
/usr/bin/git commit -m "docs: describe curated koto kanji dictionary"
```

---

### Task 10: Generate The Review Evidence Caches And CSV

**Files:**
- Runtime outputs only under `output/kanji-keyword-review/`
- Do not commit output files unless the user explicitly asks for the review CSV to be committed.

- [ ] **Step 1: Create a tiny JPDB smoke cache**

Run:

```bash
node scripts/fetch-jpdb-kanji-keywords.mjs --limit 3 --delay-ms 1000
```

Expected:

```text
Wrote JPDB keyword cache to output/kanji-keyword-review/jpdb-kanji-keywords.json
```

Open the cache and verify the first three kanji have either `matched` or explicit non-match statuses:

```bash
node -e "const d=require('./output/kanji-keyword-review/jpdb-kanji-keywords.json'); console.log(Object.fromEntries(Object.entries(d).slice(0,3)))"
```

- [ ] **Step 2: Fetch full WaniKani cache**

Run with the user's token in the environment. Do not paste the token into the shell history if your shell saves history; prefer a one-shot environment from a secure local source when available.

```bash
WANIKANI_API_TOKEN="$WANIKANI_API_TOKEN" node scripts/fetch-wanikani-kanji-keywords.mjs --refresh
```

Expected:

```text
Wrote WaniKani keyword cache for 4000 Koto kanji to output/kanji-keyword-review/wanikani-kanji-keywords.json
```

- [ ] **Step 3: Fetch full JPDB cache**

If a documented JPDB batch kanji-keyword endpoint has been added before this task, use its batch mode with 250 kanji per call and a 1 second inter-call delay. If not, run the public-page fallback:

```bash
node scripts/fetch-jpdb-kanji-keywords.mjs --delay-ms 1000
```

Expected:

```text
Wrote JPDB keyword cache to output/kanji-keyword-review/jpdb-kanji-keywords.json
```

This may take over an hour with public-page fallback. It is resumable because the script writes after each kanji.

- [ ] **Step 4: Build base CSV and slices**

Run:

```bash
node scripts/build-kanji-keyword-review-csv.mjs --slice-size 100
```

Expected:

```text
Wrote 4000 review rows to output/kanji-keyword-review
```

Verify files:

```bash
ls output/kanji-keyword-review/koto-kanji-keyword-review.csv output/kanji-keyword-review/slices
```

- [ ] **Step 5: Commit only code/docs, not generated review output**

Run:

```bash
/usr/bin/git status --short
```

Expected: no `output/` files appear. If they appear, update `.gitignore` before proceeding.

---

### Task 11: Dispatch Curation Batch Subagents

**Files:**
- Read: `output/kanji-keyword-review/slices/*.csv`
- Create locally ignored: `output/kanji-keyword-review/proposals/*.csv`
- Final user artifact: `output/kanji-keyword-review/koto-kanji-keyword-review-curated.csv`

- [ ] **Step 1: Confirm slice count**

Run:

```bash
find output/kanji-keyword-review/slices -name 'slice-*.csv' | sort | wc -l
```

Expected: `40` when using slice size 100, or `80` when using slice size 50.

- [ ] **Step 2: Dispatch curation agents in waves**

Use `multi_agent_v1.spawn_agent` with `agent_type: "explorer"` for read-only curation. Dispatch 4-8 slices per wave so review remains manageable.

Use this prompt template for each slice:

```text
You are curating Koto kanji keywords for a Japanese learning game.

Input CSV slice path: output/kanji-keyword-review/slices/<slice-file>.csv

Rules:
- Return CSV rows with the same columns.
- Fill proposedFinalKeyword with NO CHANGE or a replacement keyword.
- Fill proposalSource with no_change, jpdb, wanikani, or koto_curated.
- Fill proposalNotes with a short rationale when changing or uncertain.
- Prioritize dictionary accuracy over mnemonic flavor.
- Prefer natural concise English.
- Do not invent game-flavored meanings.
- Use NO CHANGE when unsure.
- Do not edit files.

Return only the completed rows for this slice.
```

- [ ] **Step 3: Save each completed slice**

For each agent result, save its CSV response to:

```text
output/kanji-keyword-review/proposals/<slice-file>
```

Do not commit these proposal files unless the user explicitly requests it.

- [ ] **Step 4: Assemble curation proposal CSV**

After all slices return, concatenate rows with a single header into:

```text
output/kanji-keyword-review/koto-kanji-keyword-review-curated.csv
```

Use a small Node script or spreadsheet tooling, but preserve the exact header:

```csv
rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus
```

- [ ] **Step 5: Validate the curated CSV as dry run**

Run:

```bash
node scripts/import-kanji-keyword-review.mjs --csv output/kanji-keyword-review/koto-kanji-keyword-review-curated.csv
```

Expected:

```text
<N> kanji keyword changes: ...
Dry run only; pass --write to update the dictionary
```

If validation fails, inspect the named row and repair the proposal CSV before giving it to the user.

---

### Task 12: User Review Handoff

**Files:**
- Deliver: `output/kanji-keyword-review/koto-kanji-keyword-review-curated.csv`

- [ ] **Step 1: Confirm CSV shape**

Run:

```bash
node -e "const fs=require('fs'); const lines=fs.readFileSync('output/kanji-keyword-review/koto-kanji-keyword-review-curated.csv','utf8').trimEnd().split('\\n'); console.log(lines[0]); console.log(lines.length - 1);"
```

Expected:

```text
rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus
4000
```

- [ ] **Step 2: Give the user the CSV path**

Tell the user:

```text
The review CSV is ready at output/kanji-keyword-review/koto-kanji-keyword-review-curated.csv.
Edit proposedFinalKeyword. Leave NO CHANGE or blank for rows you do not want changed.
```

- [ ] **Step 3: Pause for user edits**

Do not import changes until the user returns the edited CSV or explicitly approves the curated proposal.

---

### Task 13: Import The User-Reviewed CSV

**Files:**
- Modify: `data/kanji/koto-kanji-dictionary.json`
- Test: `tests/unit/game/koto-kanji-dictionary.test.js`
- Test: `tests/unit/game/script-decks.test.js`
- Test: `tests/unit/game/script-srs.test.js`

- [ ] **Step 1: Dry-run the returned CSV**

Run:

```bash
node scripts/import-kanji-keyword-review.mjs --csv output/kanji-keyword-review/user-reviewed.csv --curation-version 2026-06-04
```

Expected:

```text
<N> kanji keyword changes: ...
Dry run only; pass --write to update the dictionary
```

- [ ] **Step 2: Import with write flag**

Run:

```bash
node scripts/import-kanji-keyword-review.mjs --csv output/kanji-keyword-review/user-reviewed.csv --curation-version 2026-06-04 --write
```

Expected:

```text
<N> kanji keyword changes: ...
Updated data/kanji/koto-kanji-dictionary.json
```

- [ ] **Step 3: Run focused dictionary and SRS tests**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js
node --test tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS.

- [ ] **Step 4: Inspect dictionary diff**

Run:

```bash
/usr/bin/git diff -- data/kanji/koto-kanji-dictionary.json
```

Expected: only `primaryMeaning` values and top-level `curationVersion` changed.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add data/kanji/koto-kanji-dictionary.json
/usr/bin/git commit -m "data: curate koto kanji primary keywords"
```

---

### Task 14: Final Verification

**Files:**
- Entire repo

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check src/game/koto-kanji-dictionary.js
node --check scripts/fetch-wanikani-kanji-keywords.mjs
node --check scripts/fetch-jpdb-kanji-keywords.mjs
node --check scripts/build-kanji-keyword-review-csv.mjs
node --check scripts/import-kanji-keyword-review.mjs
node --check scripts/archive/build-koto-kanji-dictionary-legacy.mjs
```

Expected: all exit 0.

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js tests/unit/scripts/kanji-keyword-review.test.js tests/unit/scripts/kanji-keyword-fetchers.test.js tests/unit/scripts/build-koto-kanji-dictionary-legacy.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full gate**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Audit secrets and generated outputs**

Run:

```bash
/usr/bin/git status --short
rg -n "WANIKANI_API_TOKEN|Authorization: Bearer|jpdb.*api.*key" .
```

Expected:

- `git status --short` shows only intended tracked changes.
- `rg` does not find token variable names used as values, bearer headers, or any committed API key.
- Ignored output files under `output/kanji-keyword-review/` are not staged.

---

## Execution Notes

- Do not run live WaniKani or JPDB fetches until the fetcher unit tests pass.
- Do not put API tokens in command text that will be committed, logged, or saved to shell history.
- Do not edit `data/dictionary.json`.
- Do not change Kanji Kombat mechanics.
- Do not change `frequencyRank` or kanji ordering.
- Treat curation proposals as review suggestions until the user approves or edits the final CSV.
