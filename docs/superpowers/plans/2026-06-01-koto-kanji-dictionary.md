# Koto Kanji Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` before implementation, then use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WaniKani first-100 Kanji Kombat seed with a maintained internal Koto kanji dictionary containing 4000 kanji in JPDB frequency order, with Koto-owned primary/secondary meanings, readings, examples, and future mnemonic fields.

**Architecture:** Keep JPDB rank order as a separate dated source snapshot, not as dictionary source metadata. Build a validated `data/kanji/koto-kanji-dictionary.json` from the rank snapshot plus dictionary enrichment data, then make `script-decks.js` consume that Koto dictionary instead of the WaniKani snapshot. The game card schema stays small: Kanji Kombat only needs a prompt, primary meaning, primary reading, source id, and stable ordering.

**Tech Stack:** Node.js ES modules, `node:test`, JSON/TSV data files, `fast-xml-parser` for KANJIDIC2 XML parsing, existing Kanji Kombat SRS/deck modules.

---

## Source Rules

- JPDB is an ordering input only.
  - Store the manual or permissioned top-4000 snapshot in `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv`.
  - Do not include JPDB in `koto-kanji-dictionary.json.sources`.
  - Do not add runtime, test, CI, cron, or build-time requests to `jpdb.io`.
- KANJIDIC2 can seed kanji meanings and readings, subject to EDRDG attribution and license obligations.
- JMdict/Koto dictionary data can seed example vocabulary, subject to attribution and dictionary-accuracy rules.
- WaniKani data must not ship in the replacement dictionary.
- Mnemonics must be Koto-authored later. The first implementation stores `mnemonic: null`.

## Final Dictionary Shape

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-01T00:00:00.000Z",
  "sources": [
    {
      "id": "kanjidic2",
      "name": "KANJIDIC2",
      "url": "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
      "license": "EDRDG / CC BY-SA 4.0"
    },
    {
      "id": "jmdict",
      "name": "JMdict / Koto dictionary-derived examples",
      "url": "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
      "license": "EDRDG / CC BY-SA 4.0"
    }
  ],
  "entries": [
    {
      "kanji": "人",
      "frequencyRank": 1,
      "kind": "Kyōiku (1st grade)",
      "primaryMeaning": "person",
      "secondaryMeanings": ["human being", "people"],
      "primaryReading": "ひと",
      "secondaryReadings": ["ジン", "ニン"],
      "examples": [
        {
          "word": "人",
          "reading": "ひと",
          "meaning": "person",
          "source": "jmdict"
        }
      ],
      "mnemonic": null,
      "notes": null
    }
  ]
}
```

## File Structure

- Create `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv`
  - Static rank input with columns `rank`, `kanji`, `kind`.
- Create `data/kanji/sources/kanjidic2-sample.xml`
  - Tiny test fixture for the builder. Do not use this as runtime data.
- Create `data/kanji/manual-overrides.json`
  - Manual corrections for primary meaning, secondary meanings, readings, examples, and notes.
- Create `data/kanji/koto-kanji-dictionary.json`
  - Generated but reviewed dictionary consumed by the game.
- Create `src/game/koto-kanji-dictionary.js`
  - Validates and exposes `getKotoKanjiEntries()` and `getKotoKanjiEntry(kanji)`.
- Create `scripts/build-koto-kanji-dictionary.mjs`
  - Generates the dictionary from the rank snapshot, KANJIDIC2, existing Koto dictionary data, and manual overrides.
- Modify `src/game/script-decks.js`
  - Replace WaniKani snapshot loading with Koto dictionary loading.
- Modify `tests/unit/game/script-decks.test.js`
  - Update Kanji Kombat expectations from WaniKani 100 to Koto 4000.
- Modify `tests/unit/game/script-srs.test.js`
  - Prove the script SRS seeds all 4000 kanji and exposes new kanji in rank order after kana graduation.
- Modify `tests/unit/game/kanji-kombat-deck.test.js`
  - Prove normal Kanji Kombat play introduces the next unlearned kanji in rank order.
- Create `tests/unit/game/koto-kanji-dictionary.test.js`
  - Loader and dictionary contract tests.
- Create `tests/unit/scripts/build-koto-kanji-dictionary.test.js`
  - Builder behavior tests against tiny fixtures.
- Modify `package.json` and `package-lock.json`
  - Add explicit `fast-xml-parser` dependency.
- Create or modify `docs/data-sources.md`
  - Record attribution and maintenance rules.
- Modify `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`
  - Replace WaniKani MVP source language with Koto dictionary source language.
- Delete `data/script-kanji-wanikani-pleasant-100.json`
  - Only after `script-decks.js` and tests no longer need it.

## Task 1: Add Rank Snapshot And Dictionary Contract Tests

**Files:**
- Create: `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv`
- Create: `tests/unit/game/koto-kanji-dictionary.test.js`

- [ ] **Step 1: Add the dated rank snapshot**

Create `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv` with this header and 4000 rows from the manual or permissioned JPDB snapshot:

```tsv
rank	kanji	kind
1	人	Kyōiku (1st grade)
2	言	Kyōiku (2nd grade)
3	見	Kyōiku (1st grade)
4	一	Kyōiku (1st grade)
```

Keep the file sorted by `rank`. The implementation is incomplete until the file has exactly 4000 data rows.

- [ ] **Step 2: Write the failing dictionary contract test**

Create `tests/unit/game/koto-kanji-dictionary.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getKotoKanjiEntries,
  getKotoKanjiEntry,
  getKotoKanjiSources,
} from '../../../src/game/koto-kanji-dictionary.js';

function assertNoField(entry, field) {
  assert.equal(Object.prototype.hasOwnProperty.call(entry, field), false, `${field} should not be stored`);
}

describe('koto kanji dictionary', () => {
  it('loads exactly 4000 ranked entries', () => {
    const entries = getKotoKanjiEntries();
    assert.equal(entries.length, 4000);
    assert.deepEqual(entries.slice(0, 4).map(entry => entry.kanji), ['人', '言', '見', '一']);
    assert.deepEqual(entries.slice(0, 4).map(entry => entry.frequencyRank), [1, 2, 3, 4]);
  });

  it('keeps dictionary source metadata separate from JPDB ordering metadata', () => {
    const sourceIds = getKotoKanjiSources().map(source => source.id);
    assert.equal(sourceIds.includes('jpdb-kanji-frequency'), false);
    assert.equal(sourceIds.some(id => id.toLowerCase().includes('wanikani')), false);
  });

  it('validates the compact entry schema used by Kanji Kombat', () => {
    const entry = getKotoKanjiEntry('人');
    assert.equal(entry.kanji, '人');
    assert.equal(entry.frequencyRank, 1);
    assert.equal(typeof entry.kind, 'string');
    assert.equal(typeof entry.primaryMeaning, 'string');
    assert.equal(Array.isArray(entry.secondaryMeanings), true);
    assert.equal(typeof entry.primaryReading, 'string');
    assert.equal(Array.isArray(entry.secondaryReadings), true);
    assert.equal(Array.isArray(entry.examples), true);
    assertNoField(entry, 'onYomi');
    assertNoField(entry, 'kunYomi');
    assertNoField(entry, 'strokeCount');
  });

  it('has unique contiguous ranks and unique kanji literals', () => {
    const entries = getKotoKanjiEntries();
    assert.equal(new Set(entries.map(entry => entry.kanji)).size, entries.length);
    assert.deepEqual(entries.map(entry => entry.frequencyRank), Array.from({ length: 4000 }, (_, index) => index + 1));
  });

  it('looks up entries by kanji literal', () => {
    assert.equal(getKotoKanjiEntry('人').primaryMeaning, 'person');
    assert.throws(() => getKotoKanjiEntry('🌀'), /Unknown Koto kanji/);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js
```

Expected: FAIL with `Cannot find module '../../../src/game/koto-kanji-dictionary.js'`.

## Task 2: Add Loader And Temporary Dictionary Fixture

**Files:**
- Create: `src/game/koto-kanji-dictionary.js`
- Create: `data/kanji/koto-kanji-dictionary.json`
- Modify: `tests/unit/game/koto-kanji-dictionary.test.js`

- [ ] **Step 1: Add a tiny temporary dictionary fixture**

Create `data/kanji/koto-kanji-dictionary.json`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-01T00:00:00.000Z",
  "sources": [
    {
      "id": "kanjidic2",
      "name": "KANJIDIC2",
      "url": "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
      "license": "EDRDG / CC BY-SA 4.0"
    },
    {
      "id": "jmdict",
      "name": "JMdict / Koto dictionary-derived examples",
      "url": "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
      "license": "EDRDG / CC BY-SA 4.0"
    }
  ],
  "entries": [
    {
      "kanji": "人",
      "frequencyRank": 1,
      "kind": "Kyōiku (1st grade)",
      "primaryMeaning": "person",
      "secondaryMeanings": ["human being", "people"],
      "primaryReading": "ひと",
      "secondaryReadings": ["ジン", "ニン"],
      "examples": [
        {
          "word": "人",
          "reading": "ひと",
          "meaning": "person",
          "source": "jmdict"
        }
      ],
      "mnemonic": null,
      "notes": null
    }
  ]
}
```

- [ ] **Step 2: Temporarily relax the count test**

In `tests/unit/game/koto-kanji-dictionary.test.js`, temporarily change the first test to assert `entries.length >= 1` while building the loader. Add a comment that Task 5 restores the exact 4000-entry assertion:

```js
assert.equal(entries.length >= 1, true);
```

- [ ] **Step 3: Implement the loader**

Create `src/game/koto-kanji-dictionary.js`:

```js
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictionaryPath = join(__dirname, '../../data/kanji/koto-kanji-dictionary.json');
const dictionary = JSON.parse(readFileSync(dictionaryPath, 'utf8'));

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an array`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid Koto kanji dictionary: ${label} is required`);
  }
}

function validateExample(example, label) {
  if (!example || typeof example !== 'object') {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an object`);
  }
  assertString(example.word, `${label}.word`);
  assertString(example.reading, `${label}.reading`);
  assertString(example.meaning, `${label}.meaning`);
  assertString(example.source, `${label}.source`);
}

function validateEntry(entry, index) {
  const label = `entries[${index}]`;
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an object`);
  }
  assertString(entry.kanji, `${label}.kanji`);
  if ([...entry.kanji].length !== 1) {
    throw new Error(`Invalid Koto kanji dictionary: ${label}.kanji must be one character`);
  }
  if (!Number.isInteger(entry.frequencyRank) || entry.frequencyRank < 1) {
    throw new Error(`Invalid Koto kanji dictionary: ${label}.frequencyRank must be a positive integer`);
  }
  assertString(entry.primaryMeaning, `${label}.primaryMeaning`);
  assertArray(entry.secondaryMeanings, `${label}.secondaryMeanings`);
  assertString(entry.primaryReading, `${label}.primaryReading`);
  assertArray(entry.secondaryReadings, `${label}.secondaryReadings`);
  assertArray(entry.examples, `${label}.examples`);
  entry.examples.forEach((example, exampleIndex) => validateExample(example, `${label}.examples[${exampleIndex}]`));

  for (const forbidden of ['onYomi', 'kunYomi', 'strokeCount']) {
    if (Object.prototype.hasOwnProperty.call(entry, forbidden)) {
      throw new Error(`Invalid Koto kanji dictionary: ${label}.${forbidden} must not be stored`);
    }
  }
}

function validateDictionary(data) {
  if (data.schemaVersion !== 1) {
    throw new Error('Invalid Koto kanji dictionary: schemaVersion must be 1');
  }
  assertArray(data.sources, 'sources');
  assertArray(data.entries, 'entries');

  const sourceIds = data.sources.map(source => source.id);
  if (sourceIds.includes('jpdb-kanji-frequency') || sourceIds.some(id => id.toLowerCase().includes('wanikani'))) {
    throw new Error('Invalid Koto kanji dictionary: sources must not include JPDB or WaniKani');
  }

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

validateDictionary(dictionary);

const entries = Object.freeze([...dictionary.entries].sort((a, b) => a.frequencyRank - b.frequencyRank));
const sources = Object.freeze([...dictionary.sources]);
const entriesByKanji = new Map(entries.map(entry => [entry.kanji, entry]));

export function getKotoKanjiEntries() {
  return entries;
}

export function getKotoKanjiSources() {
  return sources;
}

export function getKotoKanjiEntry(kanji) {
  const entry = entriesByKanji.get(kanji);
  if (!entry) throw new Error(`Unknown Koto kanji: ${kanji}`);
  return entry;
}
```

- [ ] **Step 4: Run the loader test**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js
```

Expected: PASS with the temporary relaxed count assertion.

## Task 3: Add Builder Fixtures And Builder Tests

**Files:**
- Create: `data/kanji/sources/kanjidic2-sample.xml`
- Create: `data/kanji/manual-overrides.json`
- Create: `tests/unit/scripts/build-koto-kanji-dictionary.test.js`
- Create: `scripts/build-koto-kanji-dictionary.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add `fast-xml-parser` explicitly**

Run:

```bash
npm install fast-xml-parser
```

Expected: `package.json` and `package-lock.json` include `fast-xml-parser`.

- [ ] **Step 2: Add a tiny KANJIDIC2 fixture**

Create `data/kanji/sources/kanjidic2-sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <character>
    <literal>人</literal>
    <misc>
      <grade>1</grade>
    </misc>
    <reading_meaning>
      <rmgroup>
        <reading r_type="ja_on">ジン</reading>
        <reading r_type="ja_on">ニン</reading>
        <reading r_type="ja_kun">ひと</reading>
        <meaning>person</meaning>
        <meaning>human being</meaning>
        <meaning>people</meaning>
      </rmgroup>
    </reading_meaning>
  </character>
  <character>
    <literal>言</literal>
    <misc>
      <grade>2</grade>
    </misc>
    <reading_meaning>
      <rmgroup>
        <reading r_type="ja_on">ゲン</reading>
        <reading r_type="ja_on">ゴン</reading>
        <reading r_type="ja_kun">い.う</reading>
        <meaning>say</meaning>
        <meaning>word</meaning>
      </rmgroup>
    </reading_meaning>
  </character>
</kanjidic2>
```

- [ ] **Step 3: Add manual overrides**

Create `data/kanji/manual-overrides.json`:

```json
{
  "人": {
    "primaryReading": "ひと",
    "examples": [
      {
        "word": "人",
        "reading": "ひと",
        "meaning": "person",
        "source": "jmdict"
      }
    ]
  }
}
```

- [ ] **Step 4: Write builder tests**

Create `tests/unit/scripts/build-koto-kanji-dictionary.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildKotoKanjiDictionary,
  parseRankSnapshot,
  parseKanjidic2,
} from '../../../scripts/build-koto-kanji-dictionary.mjs';

describe('build-koto-kanji-dictionary', () => {
  it('parses the compact rank snapshot format', () => {
    const rows = parseRankSnapshot('rank\tkanji\tkind\n1\t人\tKyōiku (1st grade)\n2\t言\tKyōiku (2nd grade)\n');
    assert.deepEqual(rows, [
      { rank: 1, kanji: '人', kind: 'Kyōiku (1st grade)' },
      { rank: 2, kanji: '言', kind: 'Kyōiku (2nd grade)' },
    ]);
  });

  it('rejects duplicate kanji in the rank snapshot', () => {
    assert.throws(
      () => parseRankSnapshot('rank\tkanji\tkind\n1\t人\tKyōiku (1st grade)\n2\t人\tKyōiku (1st grade)\n'),
      /Duplicate rank snapshot kanji: 人/
    );
  });

  it('parses KANJIDIC2 meanings and readings', () => {
    const xml = readFileSync('data/kanji/sources/kanjidic2-sample.xml', 'utf8');
    const parsed = parseKanjidic2(xml);
    assert.equal(parsed.get('人').meanings[0], 'person');
    assert.deepEqual(parsed.get('人').readings, ['ジン', 'ニン', 'ひと']);
  });

  it('builds compact dictionary entries without JPDB source metadata or raw on/kun fields', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'koto-kanji-builder-'));
    const outputPath = join(outputDir, 'dictionary.json');
    const rankSnapshot = 'rank\tkanji\tkind\n1\t人\tKyōiku (1st grade)\n2\t言\tKyōiku (2nd grade)\n';
    const kanjidicXml = readFileSync('data/kanji/sources/kanjidic2-sample.xml', 'utf8');
    const overrides = {
      人: {
        primaryReading: 'ひと',
        examples: [{ word: '人', reading: 'ひと', meaning: 'person', source: 'jmdict' }],
      },
    };

    const dictionary = buildKotoKanjiDictionary({ rankSnapshot, kanjidicXml, overrides, generatedAt: '2026-06-01T00:00:00.000Z' });
    writeFileSync(outputPath, `${JSON.stringify(dictionary, null, 2)}\n`);

    assert.deepEqual(dictionary.sources.map(source => source.id), ['kanjidic2', 'jmdict']);
    assert.equal(dictionary.entries[0].kanji, '人');
    assert.equal(dictionary.entries[0].frequencyRank, 1);
    assert.equal(dictionary.entries[0].primaryMeaning, 'person');
    assert.equal(dictionary.entries[0].primaryReading, 'ひと');
    assert.equal(Object.prototype.hasOwnProperty.call(dictionary.entries[0], 'onYomi'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dictionary.entries[0], 'kunYomi'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dictionary.entries[0], 'strokeCount'), false);
  });
});
```

- [ ] **Step 5: Add a minimal builder module**

Create `scripts/build-koto-kanji-dictionary.mjs` with exported pure helpers first. The CLI write path is added in Task 4.

- [ ] **Step 6: Run the builder tests**

Run:

```bash
node --test tests/unit/scripts/build-koto-kanji-dictionary.test.js
```

Expected: PASS.

## Task 4: Implement Full Builder CLI

**Files:**
- Modify: `scripts/build-koto-kanji-dictionary.mjs`
- Read: `data/latest-jm-dict.json`
- Read: `data/live-dictionary.json`
- Read: `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv`
- Write: `data/kanji/koto-kanji-dictionary.json`

- [ ] **Step 1: Add deterministic entry generation**

In `scripts/build-koto-kanji-dictionary.mjs`, implement:

```js
export function buildKotoKanjiDictionary({ rankSnapshot, kanjidicXml, overrides = {}, generatedAt = new Date().toISOString() }) {
  const ranks = parseRankSnapshot(rankSnapshot);
  const kanjidic = parseKanjidic2(kanjidicXml);
  return {
    schemaVersion: 1,
    generatedAt,
    sources: [
      {
        id: 'kanjidic2',
        name: 'KANJIDIC2',
        url: 'https://www.edrdg.org/kanjidic/kanjidic2.xml.gz',
        license: 'EDRDG / CC BY-SA 4.0',
      },
      {
        id: 'jmdict',
        name: 'JMdict / Koto dictionary-derived examples',
        url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
        license: 'EDRDG / CC BY-SA 4.0',
      },
    ],
    entries: ranks.map(row => buildEntry(row, kanjidic.get(row.kanji), overrides[row.kanji] ?? {})),
  };
}
```

`buildEntry()` must:
- Throw `Missing KANJIDIC2 entry for <kanji>` if the literal is absent.
- Use override `primaryMeaning` when present.
- Otherwise use the first KANJIDIC2 English meaning.
- Use override `secondaryMeanings` when present.
- Otherwise use remaining KANJIDIC2 English meanings.
- Use override `primaryReading` when present.
- Otherwise use the first kana reading if available, then the first reading.
- Use override `secondaryReadings` when present.
- Otherwise use remaining readings.
- Use override `examples` when present.
- Otherwise use `[]`.
- Always emit `mnemonic: null` unless override supplies a Koto-authored mnemonic.
- Always emit `notes: null` unless override supplies notes.

- [ ] **Step 2: Add CLI args**

The script must accept optional flags and default paths:

```bash
node scripts/build-koto-kanji-dictionary.mjs \
  --rank data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv \
  --kanjidic data/kanji/sources/kanjidic2.xml \
  --overrides data/kanji/manual-overrides.json \
  --out data/kanji/koto-kanji-dictionary.json
```

If `--kanjidic` is missing, print:

```text
Missing KANJIDIC2 source file: data/kanji/sources/kanjidic2.xml
Download it from https://www.edrdg.org/kanjidic/kanjidic2.xml.gz, decompress it, and rerun this script.
```

Then exit with code 1.

- [ ] **Step 3: Enforce 4000 entries in CLI mode**

After building in CLI mode, assert:

```js
if (dictionary.entries.length !== 4000) {
  throw new Error(`Expected 4000 Koto kanji entries, got ${dictionary.entries.length}`);
}
```

- [ ] **Step 4: Generate the full dictionary**

Run:

```bash
node scripts/build-koto-kanji-dictionary.mjs
```

Expected: `data/kanji/koto-kanji-dictionary.json` is rewritten with 4000 entries.

- [ ] **Step 5: Restore the exact 4000-entry loader assertion**

Undo the temporary relaxed assertion from Task 2:

```js
assert.equal(entries.length, 4000);
```

- [ ] **Step 6: Run builder and loader tests**

Run:

```bash
node --test tests/unit/scripts/build-koto-kanji-dictionary.test.js tests/unit/game/koto-kanji-dictionary.test.js
```

Expected: PASS.

## Task 5: Wire Kanji Kombat To The Koto Dictionary

**Files:**
- Modify: `src/game/script-decks.js`
- Modify: `tests/unit/game/script-decks.test.js`

- [ ] **Step 1: Update the failing script deck test**

Replace the WaniKani test in `tests/unit/game/script-decks.test.js` with:

```js
it('loads the Koto top-4000 kanji entries in frequency order', () => {
  assert.equal(KANJI_SCRIPT_CARDS.length, 4000);
  assert.deepEqual(KANJI_SCRIPT_CARDS[0], {
    id: 'kanji:人',
    type: 'kanji',
    prompt: '人',
    answer: 'person',
    reading: 'ひと',
    keyword: 'person',
    sortIndex: 1,
    source: 'koto-kanji-dictionary',
    frequencyRank: 1,
  });
  assert.deepEqual(KANJI_SCRIPT_CARDS.slice(0, 4).map(card => card.prompt), ['人', '言', '見', '一']);
  assert.equal(KANJI_SCRIPT_CARDS.some(card => card.source === 'wanikani-pleasant-100'), false);
});
```

- [ ] **Step 2: Run the failing script deck test**

Run:

```bash
node --test tests/unit/game/script-decks.test.js
```

Expected: FAIL because `script-decks.js` still loads the WaniKani snapshot.

- [ ] **Step 3: Update `script-decks.js` imports and card shape**

In `src/game/script-decks.js`, remove `readFileSync`, `dirname`, `join`, `fileURLToPath`, and `kanjiSnapshot`. Add:

```js
import { getKotoKanjiEntries } from './koto-kanji-dictionary.js';
```

Update `scriptCard()` to preserve optional `frequencyRank`:

```js
function scriptCard({ type, prompt, answer, reading = prompt, keyword = null, sortIndex, source, frequencyRank = null }) {
  const card = {
    id: `${type}:${prompt}`,
    type,
    prompt,
    answer,
    reading,
    keyword,
    sortIndex,
    source,
  };
  if (frequencyRank !== null) card.frequencyRank = frequencyRank;
  return card;
}
```

Replace `KANJI_SCRIPT_CARDS` with:

```js
export const KANJI_SCRIPT_CARDS = getKotoKanjiEntries().map((entry, index) => scriptCard({
  type: 'kanji',
  prompt: entry.kanji,
  answer: entry.primaryMeaning,
  reading: entry.primaryReading,
  keyword: entry.primaryMeaning,
  sortIndex: index + 1,
  source: 'koto-kanji-dictionary',
  frequencyRank: entry.frequencyRank,
}));
```

- [ ] **Step 4: Run script deck tests**

Run:

```bash
node --test tests/unit/game/script-decks.test.js
```

Expected: PASS.

## Task 6: Prove Users Learn All 4000 Kanji In Order Through Kanji Kombat

**Files:**
- Modify: `tests/unit/game/script-srs.test.js`
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Add script SRS ordering imports**

In `tests/unit/game/script-srs.test.js`, add this import below the existing `script-srs.js` import block:

```js
import { KANJI_SCRIPT_CARDS } from '../../../src/game/script-decks.js';
```

- [ ] **Step 2: Add a seeding regression test**

In `tests/unit/game/script-srs.test.js`, add:

```js
it('seeds all 4000 Koto kanji cards in frequency order', () => {
  const cards = ensureScriptDeckSeeded(userId);
  const kanji = cards.filter(card => card.type === 'kanji');

  assert.equal(kanji.length, 4000);
  assert.deepEqual(kanji.map(card => card.id), KANJI_SCRIPT_CARDS.map(card => card.id));
  assert.deepEqual(kanji.slice(0, 4).map(card => card.id), ['kanji:人', 'kanji:言', 'kanji:見', 'kanji:一']);
  assert.deepEqual(kanji.slice(0, 4).map(card => card.frequencyRank), [1, 2, 3, 4]);
  assert.equal(kanji[0].sortIndex, 1);
  assert.equal(kanji[3999].sortIndex, 4000);
});
```

- [ ] **Step 3: Add a new-card order regression test**

In `tests/unit/game/script-srs.test.js`, add:

```js
it('returns new kanji in frequency order after hiragana and katakana graduate', () => {
  ensureScriptDeckSeeded(userId);
  const data = loadSrsData(userId);
  for (const card of data.script.cards.filter(card => card.type === 'hiragana' || card.type === 'katakana')) {
    card.state = State.Review;
  }
  saveSrsData(userId, data);

  assert.equal(getActiveScriptType(userId), 'kanji');
  const newKanji = getNewScriptCards(userId);
  assert.equal(newKanji.length, 4000);
  assert.deepEqual(newKanji.slice(0, 6).map(card => card.id), [
    'kanji:人',
    'kanji:言',
    'kanji:見',
    'kanji:一',
    KANJI_SCRIPT_CARDS[4].id,
    KANJI_SCRIPT_CARDS[5].id,
  ]);
});
```

- [ ] **Step 4: Run the failing SRS tests if implementation has not been wired yet**

Run:

```bash
node --test tests/unit/game/script-srs.test.js
```

Expected before Task 5 implementation: FAIL because only the WaniKani 100-card deck exists. Expected after Task 5 implementation: PASS.

- [ ] **Step 5: Add a Kanji Kombat chooser regression test**

In `tests/unit/game/kanji-kombat-deck.test.js`, add this import near the other imports:

```js
import { State } from 'ts-fsrs';
```

In `tests/unit/game/kanji-kombat-deck.test.js`, add:

```js
it('introduces the first unlearned kanji by frequency order once kana are graduated', () => {
  const data = loadSrsData(userId);
  for (const card of data.script.cards.filter(card => card.type === 'hiragana' || card.type === 'katakana')) {
    card.state = State.Review;
  }
  saveSrsData(userId, data);

  const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
  const first = chooseNextScriptWork(userId, state, {
    random: () => 0,
    now: new Date('2026-05-31T00:00:00Z'),
  });

  assert.equal(first.kind, 'intro');
  assert.equal(first.card.id, 'kanji:人');
  assert.equal(first.card.frequencyRank, 1);

  const result = resolveIntroChoice(userId, state, first.card.id, 'unknown', {
    random: () => 0,
    now: new Date('2026-05-31T00:00:00Z'),
  });

  assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 1);
  assert.notEqual(result.next.card?.id, 'kanji:人');
});
```

- [ ] **Step 6: Add a next-unlearned kanji regression test**

In `tests/unit/game/kanji-kombat-deck.test.js`, add:

```js
it('skips learned kanji and introduces the next frequency-ranked kanji', () => {
  const data = loadSrsData(userId);
  for (const card of data.script.cards.filter(card => card.type === 'hiragana' || card.type === 'katakana')) {
    card.state = State.Review;
  }
  const firstKanji = data.script.cards.find(card => card.id === 'kanji:人');
  firstKanji.reps = 1;
  firstKanji.state = State.Learning;
  firstKanji.due = new Date('2099-01-01T00:00:00Z');
  saveSrsData(userId, data);

  const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
  const work = chooseNextScriptWork(userId, state, {
    random: () => 0,
    now: new Date('2026-05-31T00:00:00Z'),
  });

  assert.equal(work.kind, 'intro');
  assert.equal(work.card.id, 'kanji:言');
  assert.equal(work.card.frequencyRank, 2);
});
```

- [ ] **Step 7: Run the focused behavior tests**

Run:

```bash
node --test tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS. This is the proof that normal Kanji Kombat play can introduce all 4000 kanji, in rank order, after hiragana and katakana are graduated.

## Task 7: Remove WaniKani Runtime Data And Update Docs

**Files:**
- Delete: `data/script-kanji-wanikani-pleasant-100.json`
- Modify: `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`
- Create or modify: `docs/data-sources.md`

- [ ] **Step 1: Delete the WaniKani snapshot file**

Use `apply_patch` to delete:

```text
data/script-kanji-wanikani-pleasant-100.json
```

- [ ] **Step 2: Search for stale runtime references**

Run:

```bash
rg "script-kanji-wanikani-pleasant-100|wanikani-pleasant-100|WaniKani Pleasant" src tests data docs/superpowers
```

Expected: only historical mentions in older plans/specs remain. No `src`, `tests`, or `data` references should remain.

- [ ] **Step 3: Update the Kanji Kombat MVP spec**

In `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`, replace MVP source claims with:

```md
Kanji cards are sourced from Koto's internal kanji dictionary at `data/kanji/koto-kanji-dictionary.json`. The dictionary is ordered by a dated top-4000 JPDB frequency snapshot, while card meanings/readings/examples come from Koto-maintained dictionary fields. WaniKani data is not used for the shipping Kanji Kombat kanji deck.
```

- [ ] **Step 4: Add data-source attribution**

Create or update `docs/data-sources.md` with:

```md
# Data Sources

## Koto Kanji Dictionary

`data/kanji/koto-kanji-dictionary.json` is Koto's maintained kanji dictionary for Kanji Kombat.

- Ordering input: a dated static top-4000 snapshot from JPDB Kanji by Frequency. JPDB is not listed in dictionary source metadata because it is only an ordering input.
- Dictionary enrichment: KANJIDIC2 and JMdict-derived data under EDRDG license terms.
- Mnemonics: Koto-authored only.
- WaniKani: not used for the shipping Kanji Kombat dictionary.
```

## Task 8: Verify Kanji Kombat SRS Still Works

**Files:**
- Read: `tests/unit/game/kanji-kombat-deck.test.js`
- Read: `tests/unit/game/script-srs.test.js`
- Read: `tests/integration/flows/kanji-kombat.test.js`

- [ ] **Step 1: Run focused deck and SRS tests**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js tests/unit/scripts/build-koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS.

- [ ] **Step 2: Run Kanji Kombat integration tests**

Run:

```bash
node --test tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks for changed JS**

Run:

```bash
node --check src/game/koto-kanji-dictionary.js
node --check src/game/script-decks.js
node --check scripts/build-koto-kanji-dictionary.mjs
```

Expected: all commands complete without output.

- [ ] **Step 4: Run the normal test gate**

Run:

```bash
npm test
```

Expected: PASS.

## Task 9: Review The Generated Data Before Merge

**Files:**
- Read: `data/kanji/koto-kanji-dictionary.json`
- Read: `data/kanji/manual-overrides.json`
- Read: `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv`

- [ ] **Step 1: Inspect the first 25 generated entries**

Run:

```bash
node -e "const d=require('./data/kanji/koto-kanji-dictionary.json'); console.table(d.entries.slice(0,25).map(e=>({rank:e.frequencyRank,kanji:e.kanji,meaning:e.primaryMeaning,reading:e.primaryReading,secondary:e.secondaryReadings.join(', ')})))"
```

Expected: first entries are in the checked-in rank snapshot order and meanings/readings are dictionary-accurate.

- [ ] **Step 2: Search for empty teachable fields**

Run:

```bash
node -e "const d=require('./data/kanji/koto-kanji-dictionary.json'); const bad=d.entries.filter(e=>!e.primaryMeaning||!e.primaryReading); console.log(bad.length); if (bad.length) console.table(bad.slice(0,20)); process.exit(bad.length?1:0)"
```

Expected: `0`.

- [ ] **Step 3: Inspect git diff size and generated files**

Run:

```bash
/usr/bin/git diff --stat
/usr/bin/git status --short
```

Expected: only intended source, data, docs, tests, and package files changed. No runtime caches, NPC memories, screenshots, or root throwaway files appear.

## Open Decisions Before Implementation

- Confirm whether accepting EDRDG CC BY-SA obligations is fine for this generated dictionary. If not, Task 3 must switch from adapted KANJIDIC2/JMdict output to Koto-authored manual entries.
- Confirm how the full `kanjidic2.xml` source file should be stored. If it is too large for the repo, keep it out of Git and document the download path; the generated dictionary still ships.
- Confirm whether examples can be empty for rare kanji in the first pass. The plan allows `examples: []`, but the UI should filter before showing examples as learning content.
