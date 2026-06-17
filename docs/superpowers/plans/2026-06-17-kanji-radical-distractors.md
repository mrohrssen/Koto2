# Kanji Radical Distractors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KANJIDIC2 classical radical metadata to Koto's curated kanji cards and use it to prefer harder, same-radical Kanji Kombat quiz distractors from the user's introduced kanji pool.

**Architecture:** Keep the curated kanji dictionary as the meaning source of truth and add only structural `radicals.classical` metadata from KANJIDIC2. Propagate that metadata into script cards through the existing static-card seeding path, then make `buildQuizForCard()` use a kanji-only three-tier distractor selector: introduced same-radical, introduced other kanji, unintroduced fallback. Kana quizzes keep random active-pool selection and remain independent of reps/radicals, while still enforcing the existing no-duplicate-answer-label rule.

**Tech Stack:** Node.js ES modules, `fast-xml-parser`, built-in `node:test`, existing FSRS-backed script deck, JSON data files.

---

## Scope Check

This is one subsystem: Kanji Kombat quiz distractor quality. It includes a data-enrichment tool, one dictionary data migration, runtime schema/card propagation, and quiz selection logic. It does not add visual component decomposition, radical teaching UI, FSRS scheduling changes, or combat balance changes.

## File Structure

- Create `scripts/enrich-kanji-radicals.mjs`
  - Parses valid KANJIDIC2 classical radical numbers, resolves known source variants such as `髙` via `高`, and enriches existing curated dictionary entries without changing meanings/readings/examples.
- Create `tests/unit/scripts/kanji-radical-enrichment.test.js`
  - Covers radical parsing, non-Koto malformed KANJIDIC2 tolerance, variant alias resolution, missing requested radicals, and curated-field preservation.
- Modify `data/kanji/koto-kanji-dictionary.json`
  - Add `radicals.classical` to each of the 4000 entries. Do not hand-edit meanings.
- Modify `src/game/koto-kanji-dictionary.js`
  - Validate `radicals.classical` as required metadata for each kanji entry.
- Modify `tests/unit/game/koto-kanji-dictionary.test.js`
  - Assert loaded entries expose valid classical radical metadata and exported validation rejects invalid radical metadata.
- Modify `src/game/script-decks.js`
  - Copy radical metadata from dictionary entries into `KANJI_SCRIPT_CARDS`.
- Modify `tests/unit/game/script-decks.test.js`
  - Assert kanji script cards include radicals while kana cards remain unchanged.
- Modify `tests/unit/game/script-srs.test.js`
  - Assert existing persisted kanji cards gain static radical metadata while preserving FSRS progress.
- Modify `src/game/services/kanji-kombat-service.js`
  - Add the kanji-specific tiered distractor selector inside `buildQuizForCard()`.
- Modify `tests/unit/game/kanji-kombat-deck.test.js`
  - Cover same-radical preference, introduced fallback, unintroduced fallback, and kana selection remaining random/reps-independent.
- Modify `docs/data-sources.md`
  - Document that `radicals.classical` is stored as compact structural metadata.
- Modify `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`
  - Update the Quiz Rules distractor description.

---

### Task 1: Add Radical Enrichment Tool

**Files:**
- Create: `scripts/enrich-kanji-radicals.mjs`
- Create: `tests/unit/scripts/kanji-radical-enrichment.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/scripts/kanji-radical-enrichment.test.js` with this content:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichDictionaryWithClassicalRadicals,
  parseKanjidic2ClassicalRadicals,
  summarizeRadicalChanges,
} from '../../../scripts/enrich-kanji-radicals.mjs';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <character>
    <literal>海</literal>
    <radical><rad_value rad_type="classical">85</rad_value></radical>
  </character>
  <character>
    <literal>泳</literal>
    <radical><rad_value rad_type="classical">85</rad_value></radical>
  </character>
  <character>
    <literal>人</literal>
    <radical>
      <rad_value rad_type="classical">9</rad_value>
      <rad_value rad_type="nelson_c">11</rad_value>
    </radical>
  </character>
  <character>
    <literal>高</literal>
    <radical><rad_value rad_type="classical">189</rad_value></radical>
  </character>
</kanjidic2>`;

function stripRadicals(entry) {
  const { radicals, ...rest } = entry;
  return rest;
}

describe('kanji radical enrichment', () => {
  it('parses exactly one KANJIDIC2 classical radical per kanji', () => {
    const radicals = parseKanjidic2ClassicalRadicals(SAMPLE_XML);
    assert.equal(radicals.get('海'), 85);
    assert.equal(radicals.get('泳'), 85);
    assert.equal(radicals.get('人'), 9);
    assert.equal(radicals.get('高'), 189);
  });

  it('ignores nonconforming KANJIDIC2 entries unless Koto requests them', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <character>
    <literal>海</literal>
    <radical><rad_value rad_type="classical">85</rad_value></radical>
  </character>
  <character>
    <literal>欠</literal>
    <radical><rad_value rad_type="nelson_c">76</rad_value></radical>
  </character>
  <character>
    <literal>水</literal>
    <radical>
      <rad_value rad_type="classical">85</rad_value>
      <rad_value rad_type="classical">86</rad_value>
    </radical>
  </character>
</kanjidic2>`;
    const radicals = parseKanjidic2ClassicalRadicals(xml);
    assert.equal(radicals.get('海'), 85);
    assert.equal(radicals.has('欠'), false);
    assert.equal(radicals.has('水'), false);
  });

  it('adds radicals while preserving curated dictionary fields', () => {
    const dictionary = {
      schemaVersion: 2,
      curationVersion: '2026-06-05',
      maintainer: 'Koto',
      status: 'hand-curated',
      entries: [
        {
          kanji: '海',
          frequencyRank: 1,
          kind: 'Kyōiku (2nd grade)',
          primaryMeaning: 'sea',
          secondaryMeanings: ['ocean'],
          primaryReading: 'うみ',
          secondaryReadings: ['カイ'],
          examples: [{ word: '海', reading: 'うみ', meaning: 'sea', source: 'jmdict' }],
          mnemonic: 'blue horizon',
          notes: 'curated note',
        },
        {
          kanji: '人',
          frequencyRank: 2,
          kind: 'Kyōiku (1st grade)',
          primaryMeaning: 'person',
          secondaryMeanings: ['human being'],
          primaryReading: 'ひと',
          secondaryReadings: ['ジン', 'ニン'],
          examples: [],
          mnemonic: null,
          notes: null,
        },
      ],
    };
    const radicals = parseKanjidic2ClassicalRadicals(SAMPLE_XML);

    const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

    assert.deepEqual(result.changed, [
      { kanji: '海', from: null, to: 85 },
      { kanji: '人', from: null, to: 9 },
    ]);
    assert.equal(result.dictionary.schemaVersion, 2);
    assert.equal(result.dictionary.curationVersion, '2026-06-05');
    assert.deepEqual(
      result.dictionary.entries.map(stripRadicals),
      dictionary.entries.map(stripRadicals)
    );
    assert.deepEqual(result.dictionary.entries.map(entry => entry.radicals), [
      { classical: 85 },
      { classical: 9 },
    ]);
  });

  it('refreshes only the classical radical when metadata already exists', () => {
    const dictionary = {
      entries: [
        {
          kanji: '海',
          primaryMeaning: 'sea',
          radicals: { classical: 1, custom: 999 },
        },
      ],
    };
    const radicals = new Map([['海', 85]]);

    const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

    assert.deepEqual(result.changed, [{ kanji: '海', from: 1, to: 85 }]);
    assert.deepEqual(result.dictionary.entries[0], {
      kanji: '海',
      primaryMeaning: 'sea',
      radicals: { custom: 999, classical: 85 },
    });
  });

  it('resolves a Koto kanji through a known KANJIDIC2 source variant alias', () => {
    const dictionary = {
      entries: [
        {
          kanji: '髙',
          frequencyRank: 3421,
          kind: 'Hyōgai',
          primaryMeaning: 'tall / high',
          secondaryMeanings: [],
          primaryReading: 'たか',
          secondaryReadings: ['コウ'],
          examples: [{ word: '髙い', reading: 'たかい', meaning: 'tall / high', source: 'manual' }],
          mnemonic: null,
          notes: 'Variant of 高.',
        },
      ],
    };
    const radicals = parseKanjidic2ClassicalRadicals(SAMPLE_XML);

    const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

    assert.deepEqual(result.changed, [{ kanji: '髙', from: null, to: 189 }]);
    assert.equal(result.dictionary.entries[0].primaryMeaning, 'tall / high');
    assert.equal(result.dictionary.entries[0].notes, 'Variant of 高.');
    assert.deepEqual(result.dictionary.entries[0].radicals, { classical: 189 });
  });

  it('fails when a Koto dictionary kanji is missing from KANJIDIC2 radicals', () => {
    const dictionary = { entries: [{ kanji: '謎', primaryMeaning: 'mystery' }] };
    const radicals = new Map([['海', 85]]);

    assert.throws(
      () => enrichDictionaryWithClassicalRadicals(dictionary, radicals),
      /Missing KANJIDIC2 classical radical for 謎/
    );
  });

  it('summarizes radical changes without printing the dictionary', () => {
    assert.equal(summarizeRadicalChanges([]), '0 kanji radical changes');
    assert.equal(
      summarizeRadicalChanges([
        { kanji: '海', from: null, to: 85 },
        { kanji: '人', from: 1, to: 9 },
      ]),
      '2 kanji radical changes: 海: none -> 85; 人: 1 -> 9'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/scripts/kanji-radical-enrichment.test.js
```

Expected: FAIL with `Cannot find module` for `scripts/enrich-kanji-radicals.mjs`.

- [ ] **Step 3: Create the enrichment script**

Create `scripts/enrich-kanji-radicals.mjs` with this content:

```javascript
#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

export const DEFAULT_DICTIONARY_PATH = 'data/kanji/koto-kanji-dictionary.json';
export const DEFAULT_KANJIDIC_PATH = 'data/kanji/sources/kanjidic2.xml';
export const KANJIDIC2_VARIANT_ALIASES = Object.freeze({
  髙: '高',
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value?.['#text'] == null ? '' : String(value['#text']);
}

function radicalType(value) {
  return typeof value === 'object' && value !== null ? value['@_rad_type'] : null;
}

export function parseKanjidic2ClassicalRadicals(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
  const parsed = parser.parse(xml);
  const characters = asArray(parsed?.kanjidic2?.character);
  const radicals = new Map();

  for (const character of characters) {
    const literal = character?.literal;
    if (!literal) continue;

    const classicalValues = asArray(character?.radical?.rad_value)
      .filter(value => radicalType(value) === 'classical')
      .map(value => Number(textValue(value)));

    if (
      classicalValues.length === 1
      && Number.isInteger(classicalValues[0])
      && classicalValues[0] >= 1
      && classicalValues[0] <= 214
    ) {
      radicals.set(literal, classicalValues[0]);
    }
  }

  return radicals;
}

function resolveClassicalRadical(kanji, radicalByKanji, aliases = KANJIDIC2_VARIANT_ALIASES) {
  const direct = radicalByKanji.get(kanji);
  if (Number.isInteger(direct)) return direct;

  const alias = aliases[kanji];
  if (alias) {
    const aliased = radicalByKanji.get(alias);
    if (Number.isInteger(aliased)) return aliased;
  }

  throw new Error(`Missing KANJIDIC2 classical radical for ${kanji}`);
}

export function enrichDictionaryWithClassicalRadicals(dictionary, radicalByKanji) {
  const entries = asArray(dictionary?.entries);
  const changed = [];

  const enrichedEntries = entries.map(entry => {
    const radical = resolveClassicalRadical(entry.kanji, radicalByKanji);

    const existing = entry.radicals?.classical;
    if (existing === radical) return entry;

    changed.push({ kanji: entry.kanji, from: existing ?? null, to: radical });
    return {
      ...entry,
      radicals: {
        ...(entry.radicals || {}),
        classical: radical,
      },
    };
  });

  return {
    dictionary: {
      ...dictionary,
      entries: enrichedEntries,
    },
    changed,
  };
}

function valueLabel(value) {
  return value == null ? 'none' : String(value);
}

export function summarizeRadicalChanges(changed) {
  const changes = Array.isArray(changed) ? changed : [];
  if (changes.length === 0) return '0 kanji radical changes';

  const preview = changes.slice(0, 10).map(change =>
    `${change.kanji}: ${valueLabel(change.from)} -> ${valueLabel(change.to)}`
  );
  const suffix = changes.length > preview.length ? `; ${changes.length - preview.length} more` : '';
  return `${changes.length} kanji radical changes: ${preview.join('; ')}${suffix}`;
}

function parseArgs(argv) {
  const args = {
    dictionary: resolve(REPO_ROOT, DEFAULT_DICTIONARY_PATH),
    kanjidic: resolve(REPO_ROOT, DEFAULT_KANJIDIC_PATH),
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dictionary') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --dictionary');
      args.dictionary = resolve(value);
      continue;
    }
    if (arg === '--kanjidic') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --kanjidic');
      args.kanjidic = resolve(value);
      continue;
    }
    if (arg === '--write') {
      args.write = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dictionary = await readJson(args.dictionary);
  const kanjidicXml = await readFile(args.kanjidic, 'utf8');
  const radicals = parseKanjidic2ClassicalRadicals(kanjidicXml);
  const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

  console.log(summarizeRadicalChanges(result.changed));

  if (args.write) {
    await writeJsonAtomic(args.dictionary, result.dictionary);
    console.log(`Updated ${args.dictionary}`);
    return;
  }

  console.log('Dry run only; pass --write to update the dictionary');
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --check scripts/enrich-kanji-radicals.mjs
node --test tests/unit/scripts/kanji-radical-enrichment.test.js
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
/usr/bin/git add scripts/enrich-kanji-radicals.mjs tests/unit/scripts/kanji-radical-enrichment.test.js
/usr/bin/git commit -m "feat: add kanji radical enrichment tool"
```

---

### Task 2: Enrich Curated Kanji Dictionary Data

**Files:**
- Modify: `data/kanji/koto-kanji-dictionary.json`

- [ ] **Step 1: Run the enrichment script as a dry run**

Run:

```bash
node scripts/enrich-kanji-radicals.mjs
```

Expected: output starts with `4000 kanji radical changes:` and ends with `Dry run only; pass --write to update the dictionary`.

- [ ] **Step 2: Write radical metadata into the dictionary**

Run:

```bash
node scripts/enrich-kanji-radicals.mjs --write
```

Expected: output starts with `4000 kanji radical changes:` and includes `Updated /Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/kanji-radical-distractors/data/kanji/koto-kanji-dictionary.json`.

- [ ] **Step 3: Verify the first entries have classical radicals**

Run:

```bash
node --input-type=module -e 'import { readFileSync } from "node:fs"; const dict = JSON.parse(readFileSync("data/kanji/koto-kanji-dictionary.json", "utf8")); console.log(dict.entries.slice(0, 4).map(e => [e.kanji, e.primaryMeaning, e.radicals?.classical])); const hashigo = dict.entries.find(e => e.kanji === "髙"); console.log([hashigo.kanji, hashigo.primaryMeaning, hashigo.radicals?.classical]);'
```

Expected:

```text
[ [ '人', 'person', 9 ], [ '言', 'say', 149 ], [ '見', 'see', 147 ], [ '一', 'one', 1 ] ]
[ '髙', 'tall / high', 189 ]
```

- [ ] **Step 4: Verify the enrichment is idempotent**

Run:

```bash
node scripts/enrich-kanji-radicals.mjs
```

Expected:

```text
0 kanji radical changes
Dry run only; pass --write to update the dictionary
```

- [ ] **Step 5: Commit**

Run:

```bash
/usr/bin/git add data/kanji/koto-kanji-dictionary.json
/usr/bin/git commit -m "data: add classical radicals to kanji dictionary"
```

---

### Task 3: Validate And Propagate Radical Metadata

**Files:**
- Modify: `src/game/koto-kanji-dictionary.js`
- Modify: `src/game/script-decks.js`
- Modify: `tests/unit/game/koto-kanji-dictionary.test.js`
- Modify: `tests/unit/game/script-decks.test.js`
- Modify: `tests/unit/game/script-srs.test.js`

- [ ] **Step 1: Write failing dictionary and script-card tests**

In `tests/unit/game/koto-kanji-dictionary.test.js`, add `validateKotoKanjiDictionary` to the import list:

```javascript
import {
  getKotoKanjiEntries,
  getKotoKanjiEntry,
  getKotoKanjiMetadata,
  validateKotoKanjiDictionary,
} from '../../../src/game/koto-kanji-dictionary.js';
```

In `tests/unit/game/koto-kanji-dictionary.test.js`, inside `it('validates the compact entry schema used by Kanji Kombat', ...)`, add these assertions after the `examples` assertion:

```javascript
    assert.equal(typeof entry.radicals, 'object');
    assert.equal(Number.isInteger(entry.radicals.classical), true);
    assert.equal(entry.radicals.classical, 9);
```

In `tests/unit/game/koto-kanji-dictionary.test.js`, add this test after `it('validates the compact entry schema used by Kanji Kombat', ...)`:

```javascript
  it('rejects invalid radical metadata', () => {
    const entry = getKotoKanjiEntry('人');
    const dictionary = {
      schemaVersion: 2,
      curationVersion: 'test',
      maintainer: 'Koto',
      status: 'hand-curated',
      entries: [
        {
          ...entry,
          radicals: { classical: 0 },
        },
      ],
    };

    assert.throws(
      () => validateKotoKanjiDictionary(dictionary),
      /entries\[0\]\.radicals\.classical must be an integer from 1 to 214/
    );
  });
```

In `tests/unit/game/script-decks.test.js`, update the expected first kanji card to include `radicals`:

```javascript
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
      radicals: { classical: 9 },
    });
```

In `tests/unit/game/script-srs.test.js`, add this test after `it('refreshes kanji answer and keyword while preserving reviewed SRS progress', ...)`:

```javascript
  it('refreshes kanji radical metadata while preserving reviewed SRS progress', () => {
    ensureScriptDeckSeeded(userId);
    const staticCard = KANJI_SCRIPT_CARDS[0];
    const data = loadSrsData(userId);
    const savedCard = data.script.cards.find(card => card.id === staticCard.id);

    delete savedCard.radicals;
    savedCard.stability = 8.5;
    savedCard.difficulty = 3.25;
    savedCard.reps = 4;
    savedCard.state = State.Review;
    savedCard.due = new Date('2099-01-01T00:00:00.000Z');
    saveSrsData(userId, data);

    ensureScriptDeckSeeded(userId);

    const refreshed = loadSrsData(userId).script.cards.find(card => card.id === staticCard.id);
    assert.deepEqual(refreshed.radicals, staticCard.radicals);
    assert.equal(refreshed.stability, 8.5);
    assert.equal(refreshed.difficulty, 3.25);
    assert.equal(refreshed.reps, 4);
    assert.equal(refreshed.state, State.Review);
    assert.equal(refreshed.due.toISOString(), '2099-01-01T00:00:00.000Z');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/game/koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js
```

Expected: FAIL because `validateKotoKanjiDictionary` is not exported yet, `KANJI_SCRIPT_CARDS[0]` does not yet include `radicals`, and persisted script cards do not yet include `radicals`.

- [ ] **Step 3: Add dictionary radical validation**

In `src/game/koto-kanji-dictionary.js`, add this helper after `validateExample()`:

```javascript
function validateRadicals(radicals, label) {
  if (!radicals || typeof radicals !== 'object' || Array.isArray(radicals)) {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an object`);
  }
  if (
    !Number.isInteger(radicals.classical)
    || radicals.classical < 1
    || radicals.classical > 214
  ) {
    throw new Error(`Invalid Koto kanji dictionary: ${label}.classical must be an integer from 1 to 214`);
  }
}
```

In `validateEntry()`, add this call after example validation:

```javascript
  validateRadicals(entry.radicals, `${label}.radicals`);
```

Replace the module-load validation call:

```javascript
validateDictionary(dictionary);
```

with this exported wrapper and call:

```javascript
export function validateKotoKanjiDictionary(data) {
  validateDictionary(data);
  return true;
}

validateKotoKanjiDictionary(dictionary);
```

- [ ] **Step 4: Propagate radicals onto script cards**

In `src/game/script-decks.js`, replace the `scriptCard()` signature and body with:

```javascript
function scriptCard({
  type,
  prompt,
  answer,
  reading = prompt,
  keyword = null,
  sortIndex,
  source,
  frequencyRank = null,
  radicals = null,
}) {
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
  if (radicals) card.radicals = { ...radicals };
  return card;
}
```

In the `KANJI_SCRIPT_CARDS` mapping, add the `radicals` property:

```javascript
export const KANJI_SCRIPT_CARDS = getKotoKanjiEntries().map((entry, index) => scriptCard({
  type: 'kanji',
  prompt: entry.kanji,
  answer: entry.primaryMeaning,
  reading: entry.primaryReading,
  keyword: entry.primaryMeaning,
  sortIndex: index + 1,
  source: 'koto-kanji-dictionary',
  frequencyRank: entry.frequencyRank,
  radicals: entry.radicals,
}));
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --check src/game/koto-kanji-dictionary.js
node --check src/game/script-decks.js
node --test tests/unit/game/koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

Run:

```bash
/usr/bin/git add src/game/koto-kanji-dictionary.js src/game/script-decks.js tests/unit/game/koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js
/usr/bin/git commit -m "feat: propagate kanji radical metadata"
```

---

### Task 4: Add Radical-Aware Kanji Distractors

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Add quiz selection test helpers**

In `tests/unit/game/kanji-kombat-deck.test.js`, after `summarizePrompts()`, add:

```javascript
  function wrongAnswers(quiz) {
    return quiz.choices
      .filter(choice => !choice.correct)
      .map(choice => choice.answer)
      .sort();
  }
```

- [ ] **Step 2: Add failing tests for the three-tier kanji selection**

In `tests/unit/game/kanji-kombat-deck.test.js`, after `it('builds four unique choices from the active script answer pool', ...)`, add these tests:

```javascript
  it('prefers introduced same-radical kanji distractors when enough exist', () => {
    const prompt = { id: 'kanji:海', type: 'kanji', prompt: '海', answer: 'sea', reps: 5, radicals: { classical: 85 } };
    const pool = [
      prompt,
      { id: 'kanji:河', type: 'kanji', prompt: '河', answer: 'river', reps: 2, radicals: { classical: 85 } },
      { id: 'kanji:泳', type: 'kanji', prompt: '泳', answer: 'swim', reps: 1, radicals: { classical: 85 } },
      { id: 'kanji:湖', type: 'kanji', prompt: '湖', answer: 'lake', reps: 3, radicals: { classical: 85 } },
      { id: 'kanji:人', type: 'kanji', prompt: '人', answer: 'person', reps: 8, radicals: { classical: 9 } },
      { id: 'kanji:言', type: 'kanji', prompt: '言', answer: 'say', reps: 8, radicals: { classical: 149 } },
      { id: 'kanji:見', type: 'kanji', prompt: '見', answer: 'see', reps: 0, radicals: { classical: 147 } },
    ];

    const quiz = buildQuizForCard(prompt, pool, () => 0);

    assert.deepEqual(wrongAnswers(quiz), ['lake', 'river', 'swim']);
    assert.equal(quiz.choices.length, 4);
    assert.equal(new Set(quiz.choices.map(choice => choice.answer)).size, 4);
  });

  it('falls back to introduced other kanji before unintroduced kanji', () => {
    const prompt = { id: 'kanji:海', type: 'kanji', prompt: '海', answer: 'sea', reps: 5, radicals: { classical: 85 } };
    const pool = [
      prompt,
      { id: 'kanji:河', type: 'kanji', prompt: '河', answer: 'river', reps: 2, radicals: { classical: 85 } },
      { id: 'kanji:人', type: 'kanji', prompt: '人', answer: 'person', reps: 8, radicals: { classical: 9 } },
      { id: 'kanji:言', type: 'kanji', prompt: '言', answer: 'say', reps: 8, radicals: { classical: 149 } },
      { id: 'kanji:見', type: 'kanji', prompt: '見', answer: 'see', reps: 0, radicals: { classical: 147 } },
      { id: 'kanji:一', type: 'kanji', prompt: '一', answer: 'one', reps: 0, radicals: { classical: 1 } },
    ];

    const quiz = buildQuizForCard(prompt, pool, () => 0);

    assert.deepEqual(wrongAnswers(quiz), ['person', 'river', 'say']);
  });

  it('uses unintroduced kanji only when introduced kanji cannot fill three wrong answers', () => {
    const prompt = { id: 'kanji:海', type: 'kanji', prompt: '海', answer: 'sea', reps: 5, radicals: { classical: 85 } };
    const pool = [
      prompt,
      { id: 'kanji:河', type: 'kanji', prompt: '河', answer: 'river', reps: 2, radicals: { classical: 85 } },
      { id: 'kanji:人', type: 'kanji', prompt: '人', answer: 'person', reps: 8, radicals: { classical: 9 } },
      { id: 'kanji:見', type: 'kanji', prompt: '見', answer: 'see', reps: 0, radicals: { classical: 147 } },
      { id: 'kanji:一', type: 'kanji', prompt: '一', answer: 'one', reps: 0, radicals: { classical: 1 } },
    ];

    const quiz = buildQuizForCard(prompt, pool, () => 0);

    assert.equal(wrongAnswers(quiz).includes('river'), true);
    assert.equal(wrongAnswers(quiz).includes('person'), true);
    assert.equal(wrongAnswers(quiz).some(answer => answer === 'one' || answer === 'see'), true);
    assert.equal(wrongAnswers(quiz).length, 3);
  });

  it('keeps kana distractor selection independent of reps and radicals', () => {
    const prompt = { id: 'hiragana:あ', type: 'hiragana', prompt: 'あ', answer: 'a', reps: 5 };
    const pool = [
      prompt,
      { id: 'hiragana:い', type: 'hiragana', prompt: 'い', answer: 'i', reps: 0, radicals: { classical: 85 } },
      { id: 'hiragana:う', type: 'hiragana', prompt: 'う', answer: 'u', reps: 0, radicals: { classical: 85 } },
      { id: 'hiragana:え', type: 'hiragana', prompt: 'え', answer: 'e', reps: 0, radicals: { classical: 85 } },
    ];

    const quiz = buildQuizForCard(prompt, pool, () => 0);

    assert.deepEqual(wrongAnswers(quiz), ['e', 'i', 'u']);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: FAIL because the existing random distractor selector can choose introduced non-matching radicals before same-radical kanji.

- [ ] **Step 4: Implement the tiered distractor selector**

In `src/game/services/kanji-kombat-service.js`, replace the current `buildQuizForCard()` helper area with this code, keeping the existing `shuffle()` function above it:

```javascript
function isIntroducedScriptCard(card) {
  return (card?.reps || 0) > 0;
}

function sameClassicalRadical(a, b) {
  const aRadical = a?.radicals?.classical;
  const bRadical = b?.radicals?.classical;
  return Number.isInteger(aRadical) && Number.isInteger(bRadical) && aRadical === bRadical;
}

function selectUniqueDistractors(candidates, selected, usedAnswers, limit, random) {
  for (const candidate of shuffle(candidates, random)) {
    if (selected.length >= limit) break;
    if (!candidate?.id || usedAnswers.has(candidate.answer)) continue;
    selected.push(candidate);
    usedAnswers.add(candidate.answer);
  }
}

function baseDistractorCandidates(card, answerPool) {
  return answerPool.filter(candidate =>
    candidate.id !== card.id
    && candidate.answer !== card.answer
  );
}

function buildDefaultDistractors(card, answerPool, random) {
  const selected = [];
  const usedAnswers = new Set([card.answer]);
  selectUniqueDistractors(baseDistractorCandidates(card, answerPool), selected, usedAnswers, 3, random);
  return selected;
}

function buildKanjiDistractors(card, answerPool, random) {
  const selected = [];
  const usedAnswers = new Set([card.answer]);
  const candidates = baseDistractorCandidates(card, answerPool)
    .filter(candidate => candidate.type === 'kanji');

  selectUniqueDistractors(
    candidates.filter(candidate => isIntroducedScriptCard(candidate) && sameClassicalRadical(candidate, card)),
    selected,
    usedAnswers,
    3,
    random
  );

  selectUniqueDistractors(
    candidates.filter(candidate => isIntroducedScriptCard(candidate) && !sameClassicalRadical(candidate, card)),
    selected,
    usedAnswers,
    3,
    random
  );

  selectUniqueDistractors(
    candidates.filter(candidate => !isIntroducedScriptCard(candidate)),
    selected,
    usedAnswers,
    3,
    random
  );

  return selected;
}

export function buildQuizForCard(card, answerPool, random = Math.random) {
  const distractors = card.type === 'kanji'
    ? buildKanjiDistractors(card, answerPool, random)
    : buildDefaultDistractors(card, answerPool, random);

  if (distractors.length < 3) {
    throw new Error(`Not enough distinct answers for script quiz: ${card.type}`);
  }

  const choices = shuffle([
    { id: randomUUID(), answer: card.answer, correct: true },
    ...distractors.map(candidate => ({ id: randomUUID(), answer: candidate.answer, correct: false })),
  ], random);

  return {
    cardId: card.id,
    type: card.type,
    prompt: card.prompt,
    reading: card.reading,
    keyword: card.keyword,
    choices,
  };
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --check src/game/services/kanji-kombat-service.js
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-deck.test.js
/usr/bin/git commit -m "feat: prefer same-radical kanji distractors"
```

---

### Task 5: Update Documentation

**Files:**
- Modify: `docs/data-sources.md`
- Modify: `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`

- [ ] **Step 1: Update data source docs**

In `docs/data-sources.md`, replace the compact fields sentence with:

```markdown
The runtime dictionary intentionally stores only compact gameplay fields: `primaryMeaning`, `secondaryMeanings`, `primaryReading`, `secondaryReadings`, `examples`, `mnemonic`, `notes`, and `radicals.classical`. KANJIDIC2 supplies only the structural `radicals.classical` number; known source variants such as `髙` are resolved through explicit enrichment aliases; Koto's curated dictionary remains the source of truth for player-facing meanings.
```

- [ ] **Step 2: Update Kanji Kombat MVP quiz rule wording**

In `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`, replace the `Distractors:` bullets in the Quiz Rules section with:

```markdown
Distractors:

- Hiragana/katakana: pull the other three answers randomly from the active kana answer pool.
- Kanji: prefer wrong answers from introduced kanji (`reps > 0`) sharing the prompt kanji's KANJIDIC2 classical radical.
- If fewer than three same-radical introduced kanji answers exist, fill from other introduced kanji answers.
- If fewer than three introduced kanji answers exist, fill the remaining slots from unintroduced kanji answers.
- The correct answer appears once.
- Duplicate answer labels are not allowed in the same quiz.
```

- [ ] **Step 3: Run doc grep**

Run:

```bash
rg -n "full possible answer list|radicals.classical|classical radical|runtime dictionary intentionally stores|known source variants" docs/data-sources.md docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md
```

Expected: no `full possible answer list` hit remains in `2026-05-31-kanji-kombat-mvp-design.md`; the new radical wording appears in `docs/data-sources.md` and `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`.

- [ ] **Step 4: Commit**

Run:

```bash
/usr/bin/git add docs/data-sources.md docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md
/usr/bin/git commit -m "docs: describe radical-aware kanji distractors"
```

---

### Task 6: Final Verification

**Files:**
- Test-only task.

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check scripts/enrich-kanji-radicals.mjs
node --check src/game/koto-kanji-dictionary.js
node --check src/game/script-decks.js
node --check src/game/services/kanji-kombat-service.js
```

Expected: all commands exit with code 0.

- [ ] **Step 2: Run focused unit tests**

Run:

```bash
node --test tests/unit/scripts/kanji-radical-enrichment.test.js tests/unit/game/koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Run the merge gate**

Run:

```bash
npm test
```

Expected: Tier 1 and Tier 2 test suites pass.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
/usr/bin/git diff --stat dev..HEAD
/usr/bin/git diff -- data/kanji/koto-kanji-dictionary.json
```

Expected: the JSON diff shows `radicals.classical` additions and no `primaryMeaning`, `primaryReading`, `secondaryMeanings`, `secondaryReadings`, `examples`, `mnemonic`, or `notes` changes.

- [ ] **Step 5: Report completion**

Summarize:

```text
Implemented radical-aware Kanji Kombat distractors. Classical radical metadata was added from KANJIDIC2 only; curated kanji meanings/readings/examples were preserved. Focused unit tests and npm test passed.
```
