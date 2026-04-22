# Custom Live Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork `dictionary.json` into a curated `live-dictionary.json` owned by the game, add an admin edit surface on the word-exposure page, store the authoritative file on the Railway persistent volume, lazy-resolve FSRS card meanings from the live dictionary on every read, and auto-commit edits to a `dictionary` branch for repo sync.

**Architecture:** Three files replace the single `data/dictionary.json`: (1) `data/live-dictionary.json` — committed snapshot, used by local/dev/CI and as prod first-boot seed; (2) `/app/persist/live-dictionary.json` — authoritative on prod at runtime after first write; (3) `data/latest-jm-dict.json` — frozen JMdict baseline, read only by the admin UI for the reference column. The loader resolves which base-dict path to use at boot via a new helper. FSRS vocab cards stop baking `meaning`/`reading` — a `hydrateCard()` helper resolves them on read. A `DICTIONARY_READONLY` env flag locks non-prod environments to read-only. A background worker commits every successful save to a `dictionary` branch via a bot token.

**Tech Stack:** Node 20, Express, `fs/promises`, `node:test` + `assert`, `simple-git` (new dependency for git auto-commit), existing admin auth pattern.

---

## File Structure

**New files:**
- `src/game/live-dict-path.js` — path resolver + first-boot seeding helper
- `src/routes/admin-dictionary-edit.js` — PUT/GET/export endpoints for dictionary entries
- `src/routes/admin-dictionary-sync.js` — background git commit worker
- `data/live-dictionary.json` — initial copy of dictionary.json
- `data/latest-jm-dict.json` — frozen copy of dictionary.json
- `tests/unit/live-dict-path.test.js`
- `tests/unit/hydrate-card.test.js`
- `tests/unit/admin-dictionary-edit.test.js`
- `tests/unit/admin-dictionary-sync.test.js`
- `.github/workflows/dictionary-nightly-sync.yml`

**Modified files:**
- `src/game/word-dictionary.js` — new signature `{ overlayDir, liveDictPath }`
- `src/game/bootstrap/word-knowledge.js` — add `hydrateCard`/`hydrateCards`/`invalidateWordDict`; use path resolver
- `src/routes/game/known-words.js` — simplify `createCard`; hydrate on read
- `src/routes/admin.js` — simplify `createCard` calls; hydrate on read
- `src/auth/routes.js` — simplify `createCard` call
- `src/game/services/exploration-service.js` — hydrate due cards
- `src/game/vocab-manager.js` — hydrate new cards
- `src/routes/admin-word-exposures.js` — add `jmdictDefinition` / `overlayOwner` fields; mount new sub-router
- `public/admin-word-exposures.html` — JMDict column, Edit button, edit modal, sync banner
- `server.js` — no code change expected (path resolution happens inside loaders)
- `tests/unit/word-dictionary.test.js` — update fixtures to use `live-dictionary.json`
- `tests/unit/admin-word-exposures.test.js` — assert new fields
- `package.json` — add `simple-git` dep
- `.gitignore` — add `/app/persist/.dictionary-repo` (local dev fallback path), `/data/dictionary.json.bak` (one-shot safety copy during bootstrap)
- `data/dictionary.json` — deleted

---

## Phase 1: Bootstrap the two new dictionary files

### Task 1: Copy dictionary.json into live + baseline files, delete original

**Files:**
- Create: `data/live-dictionary.json` (copy of `data/dictionary.json`)
- Create: `data/latest-jm-dict.json` (copy of `data/dictionary.json`)
- Delete: `data/dictionary.json`

- [ ] **Step 1: Make safety backup**

Run:
```bash
cp "data/dictionary.json" "data/dictionary.json.bak"
```

- [ ] **Step 2: Create live-dictionary.json and latest-jm-dict.json from current dictionary**

Run:
```bash
cp "data/dictionary.json" "data/live-dictionary.json"
cp "data/dictionary.json" "data/latest-jm-dict.json"
```

- [ ] **Step 3: Verify sizes match**

Run:
```bash
wc -c data/dictionary.json data/live-dictionary.json data/latest-jm-dict.json
```

Expected: all three files report the same byte count (~5.5MB).

- [ ] **Step 4: Delete dictionary.json and the backup**

Run:
```bash
rm data/dictionary.json data/dictionary.json.bak
```

- [ ] **Step 5: Stage all three changes and commit**

Run:
```bash
git add data/live-dictionary.json data/latest-jm-dict.json
git rm data/dictionary.json
git commit -m "feat(dict): bootstrap live-dictionary.json + latest-jm-dict.json

Fork data/dictionary.json into two files: live-dictionary.json (the
authored dictionary going forward) and latest-jm-dict.json (frozen
JMdict snapshot kept as an admin-UI reference only)."
```

Expected: commit succeeds with 3 files changed. (Three, because `git rm` is tracked as a rename+delete.)

---

## Phase 2: Live-dict path resolver

### Task 2: Add `src/game/live-dict-path.js`

**Files:**
- Create: `src/game/live-dict-path.js`
- Test: `tests/unit/live-dict-path.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live-dict-path.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from './helpers/tmp.js';

describe('live-dict-path', () => {
  let tmp;
  let originalCwd;

  beforeEach(async () => {
    tmp = await createTestTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmp.path);
    mkdirSync(join(tmp.path, 'data'), { recursive: true });
    writeFileSync(join(tmp.path, 'data', 'live-dictionary.json'), '{"repo":true}');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await tmp.cleanup();
  });

  it('returns repo path when volume dir is absent', async () => {
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    const resolved = resolveLiveDictPath({ volumeDir: join(tmp.path, 'no-such-dir') });
    assert.equal(resolved, join(tmp.path, 'data', 'live-dictionary.json'));
  });

  it('seeds volume file from repo on first boot when volume dir exists but file does not', async () => {
    const volumeDir = join(tmp.path, 'volume');
    mkdirSync(volumeDir);
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    const resolved = resolveLiveDictPath({ volumeDir });
    assert.equal(resolved, join(volumeDir, 'live-dictionary.json'));
    assert.ok(existsSync(join(volumeDir, 'live-dictionary.json')), 'volume file should be seeded');
    assert.equal(readFileSync(resolved, 'utf-8'), '{"repo":true}');
  });

  it('returns existing volume file without re-seeding', async () => {
    const volumeDir = join(tmp.path, 'volume');
    mkdirSync(volumeDir);
    writeFileSync(join(volumeDir, 'live-dictionary.json'), '{"volume":true}');
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    const resolved = resolveLiveDictPath({ volumeDir });
    assert.equal(resolved, join(volumeDir, 'live-dictionary.json'));
    assert.equal(readFileSync(resolved, 'utf-8'), '{"volume":true}');
  });

  it('throws if neither volume nor repo file exists', async () => {
    const volumeDir = join(tmp.path, 'no-such-dir');
    const { resolveLiveDictPath } = await import('../../src/game/live-dict-path.js?t=' + Date.now());
    // remove repo file
    const fs = await import('node:fs');
    fs.unlinkSync(join(tmp.path, 'data', 'live-dictionary.json'));
    assert.throws(() => resolveLiveDictPath({ volumeDir }), /No live-dictionary/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm run test:unit -- --test-name-pattern="live-dict-path"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/game/live-dict-path.js`**

Create the file:

```javascript
import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_VOLUME_DIR = '/app/persist';

/**
 * Resolve which live-dictionary.json path to use.
 *
 * - If the volume file already exists, return it.
 * - Else if the volume DIRECTORY exists (prod first-boot), seed the volume
 *   file from the committed repo copy, then return the volume path.
 * - Else fall back to the committed repo path (local dev, CI).
 * - Throw if neither the volume file nor the repo file exists.
 *
 * @param {object} [opts]
 * @param {string} [opts.volumeDir='/app/persist']
 * @param {string} [opts.repoDir=process.cwd()/data]
 * @returns {string} resolved absolute path to live-dictionary.json
 */
export function resolveLiveDictPath({ volumeDir = DEFAULT_VOLUME_DIR, repoDir = join(process.cwd(), 'data') } = {}) {
  const volumeFile = join(volumeDir, 'live-dictionary.json');
  const repoFile = join(repoDir, 'live-dictionary.json');

  if (existsSync(volumeFile)) return volumeFile;

  if (existsSync(volumeDir)) {
    if (!existsSync(repoFile)) {
      throw new Error(`No live-dictionary.json at ${volumeFile} and no seed at ${repoFile}`);
    }
    copyFileSync(repoFile, volumeFile);
    return volumeFile;
  }

  if (existsSync(repoFile)) return repoFile;

  throw new Error(`No live-dictionary.json at ${volumeFile} or ${repoFile}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run test:unit -- --test-name-pattern="live-dict-path"
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/game/live-dict-path.js tests/unit/live-dict-path.test.js
git commit -m "feat(dict): resolveLiveDictPath helper with volume/repo fallback"
```

---

## Phase 3: Refactor word-dictionary loader

### Task 3: Change `loadWordDictionary` signature to `{ overlayDir, liveDictPath }`

**Files:**
- Modify: `src/game/word-dictionary.js`
- Modify: `tests/unit/word-dictionary.test.js`

- [ ] **Step 1: Update the existing test to use new signature and new file name**

Edit `tests/unit/word-dictionary.test.js`. Replace the file content with:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createTestTmpDir } from '../helpers/tmp.js';
import { loadWordDictionary } from '../../src/game/word-dictionary.js';

describe('word-dictionary', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await createTestTmpDir();
    // Write a minimal live dictionary
    writeFileSync(join(tmpDir.path, 'live-dictionary.json'), JSON.stringify({
      '遊ぶ': { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] },
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }, { en: 'Tuesday' }] },
      '一緒': { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] },
    }));
    // Write minimal game data that overlays
    writeFileSync(join(tmpDir.path, 'creatures.json'), JSON.stringify({
      hi: { id: 'hi', name: '火', nameEn: 'Hi', baseWord: '火', baseReading: 'ひ', baseMeaning: 'fire' }
    }));
  });

  afterEach(async () => { await tmpDir.cleanup(); });

  function loadFixture() {
    return loadWordDictionary({
      overlayDir: tmpDir.path,
      liveDictPath: join(tmpDir.path, 'live-dictionary.json'),
    });
  }

  it('loads base dictionary entries from liveDictPath', () => {
    const dict = loadFixture();
    assert.ok(dict.has('遊ぶ'));
    assert.equal(dict.get('遊ぶ').reading, 'あそぶ');
    assert.equal(dict.get('遊ぶ').definitions[0].en, 'to play');
  });

  it('overlays game data definitions over base dictionary', () => {
    const dict = loadFixture();
    const hi = dict.get('火');
    assert.ok(hi);
    assert.equal(hi.definitions[0].en, 'fire');
    assert.equal(hi.definitions[0].primary, true);
  });

  it('returns empty map if liveDictPath missing', () => {
    const dict = loadWordDictionary({
      overlayDir: tmpDir.path,
      liveDictPath: join(tmpDir.path, 'nonexistent.json'),
    });
    assert.equal(dict.size, 1); // still loads the overlay (fire via creatures.json)
  });

  it('loads glue-words overlay', () => {
    writeFileSync(join(tmpDir.path, 'glue-words.json'), JSON.stringify([
      { word: 'わたし', reading: 'わたし', en: 'I/me', priority: 1 }
    ]));
    const dict = loadFixture();
    assert.ok(dict.has('わたし'));
    assert.equal(dict.get('わたし').definitions[0].en, 'I/me');
  });

  it('does not load creature-speech (dialogue, not entity data)', () => {
    writeFileSync(join(tmpDir.path, 'creature-speech.json'), JSON.stringify({
      onHit: [{ jp: '痛い', reading: 'いたい', en: 'Ouch!', romaji: 'itai' }]
    }));
    const dict = loadFixture();
    assert.ok(!dict.has('痛い'), 'creature-speech entries should not be in word dictionary');
  });
});
```

- [ ] **Step 2: Run test to see it fails (signature mismatch)**

Run:
```bash
npm run test:unit -- --test-name-pattern="word-dictionary"
```

Expected: FAIL — `loadWordDictionary` still accepts a single string and does not find `live-dictionary.json`.

- [ ] **Step 3: Update `src/game/word-dictionary.js`**

Replace file contents with:

```javascript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Load the word dictionary.
 *
 * @param {object} opts
 * @param {string} opts.overlayDir - directory containing creatures.json, moves.json, etc.
 * @param {string} opts.liveDictPath - absolute path to the live dictionary JSON file
 * @returns {Map<string, {reading: string, definitions: {en: string, primary?: boolean}[]}>}
 */
export function loadWordDictionary({ overlayDir, liveDictPath }) {
  const dict = new Map();

  // 1. Load base live dictionary
  if (liveDictPath && existsSync(liveDictPath)) {
    try {
      const base = JSON.parse(readFileSync(liveDictPath, 'utf-8'));
      for (const [word, entry] of Object.entries(base)) {
        dict.set(word, entry);
      }
    } catch (e) {
      console.warn('[WordDictionary] Failed to load base dictionary:', e.message);
    }
  }

  // 2. Overlay game data files (always read from overlayDir)
  const overlayConfigs = [
    { file: 'creatures.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'moves.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'items.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'npcs.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'npc-skills.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'areas.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
  ];

  for (const config of overlayConfigs) {
    overlayGameData(dict, join(overlayDir, config.file), config);
  }

  // 3. Overlay curriculum files
  for (const file of ['glue-words.json', 'grammar-words.json']) {
    const filePath = join(overlayDir, file);
    if (!existsSync(filePath)) continue;
    try {
      const entries = JSON.parse(readFileSync(filePath, 'utf-8'));
      for (const entry of entries) {
        dict.set(entry.word, {
          reading: entry.reading,
          definitions: [{ en: entry.en, primary: true }],
        });
      }
    } catch (e) {
      console.warn(`[WordDictionary] Failed to load ${file}:`, e.message);
    }
  }

  return dict;
}

function overlayGameData(dict, filePath, config) {
  if (!existsSync(filePath)) return;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const entries = Array.isArray(raw) ? raw : Object.values(raw);
    for (const entry of entries) {
      const word = entry[config.wordField];
      const reading = entry[config.readingField];
      const meaning = entry[config.meaningField];
      if (!word || !meaning) continue;
      dict.set(word, {
        reading: reading || word,
        definitions: [{ en: meaning, primary: true }],
      });
    }
  } catch (e) {
    console.warn(`[WordDictionary] Failed to load ${filePath}:`, e.message);
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run:
```bash
npm run test:unit -- --test-name-pattern="word-dictionary"
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/game/word-dictionary.js tests/unit/word-dictionary.test.js
git commit -m "feat(dict): loadWordDictionary takes {overlayDir, liveDictPath}

Base dictionary now resolves from a separate path so prod can read it
from the persistent volume while overlays still come from the repo."
```

---

### Task 4: Update word-knowledge.js to use the path resolver

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js`

- [ ] **Step 1: Replace top-of-file dictionary loading with path resolver**

Edit `src/game/bootstrap/word-knowledge.js`. Replace the top of the file (lines 1-15) with:

```javascript
import fs from 'fs';
import path from 'path';
import { getDeckCards, createCard } from '../internal-srs.js';
import { State } from 'ts-fsrs';
import { loadWordDictionary } from '../word-dictionary.js';
import { resolveLiveDictPath } from '../live-dict-path.js';
import { getDataDir } from '../../data-dir.js';

// Overlay data (creatures.json, moves.json, ...) lives in the repo.
const OVERLAY_DIR = path.join(process.cwd(), 'data');

let _wordDict = null;
function getWordDict() {
  if (!_wordDict) {
    _wordDict = loadWordDictionary({
      overlayDir: OVERLAY_DIR,
      liveDictPath: resolveLiveDictPath(),
    });
  }
  return _wordDict;
}

/** Clear the in-memory dictionary cache so the next read reloads from disk. */
export function invalidateWordDict() {
  _wordDict = null;
}
```

Delete the old `const DICT_DIR` line and the old `getWordDict()` that used `loadWordDictionary(DICT_DIR)`.

- [ ] **Step 2: Run the full unit suite to catch any caller that broke**

Run:
```bash
npm run test:unit
```

Expected: all tests pass. `loadWordDictionary` has only one non-test caller (`word-knowledge.js`); other mentions are in tests that construct their own fixtures.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/game/bootstrap/word-knowledge.js
git commit -m "feat(dict): word-knowledge uses resolveLiveDictPath and exposes invalidateWordDict"
```

---

## Phase 4: Lazy card hydration (stop baking meaning/reading)

### Task 5: Add `hydrateCard` / `hydrateCards` helpers

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js`
- Test: `tests/unit/hydrate-card.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hydrate-card.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hydrateCard, hydrateCards } from '../../src/game/bootstrap/word-knowledge.js';

describe('hydrateCard', () => {
  const dict = new Map();
  dict.set('火', {
    reading: 'ひ',
    definitions: [{ en: 'fire', primary: true }, { en: 'Tuesday' }],
  });
  dict.set('遊ぶ', {
    reading: 'あそぶ',
    definitions: [{ en: 'to play', primary: true }],
  });

  it('returns current meaning and reading regardless of stale fields', () => {
    const card = { id: '火', meaning: 'OLD', reading: 'OLD', state: 1 };
    const hydrated = hydrateCard(card, dict);
    assert.equal(hydrated.meaning, 'fire');
    assert.equal(hydrated.reading, 'ひ');
    assert.equal(hydrated.state, 1, 'FSRS fields preserved');
  });

  it('returns empty strings when word not in dict', () => {
    const card = { id: '未知の単語', meaning: 'whatever' };
    const hydrated = hydrateCard(card, dict);
    assert.equal(hydrated.meaning, '');
    assert.equal(hydrated.reading, '未知の単語');
  });

  it('hydrateCards maps over an array', () => {
    const cards = [{ id: '火' }, { id: '遊ぶ' }];
    const out = hydrateCards(cards, dict);
    assert.equal(out[0].meaning, 'fire');
    assert.equal(out[1].meaning, 'to play');
  });

  it('returns card unchanged if null/undefined', () => {
    assert.equal(hydrateCard(null, dict), null);
    assert.equal(hydrateCard(undefined, dict), undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm run test:unit -- --test-name-pattern="hydrateCard"
```

Expected: FAIL — `hydrateCard` and `hydrateCards` are not exported.

- [ ] **Step 3: Add helpers + supporting lookup-from-dict functions in word-knowledge.js**

Append to `src/game/bootstrap/word-knowledge.js` (below the existing `lookupReading` function, near line 39):

```javascript
/** Look up primary English meaning from a given dict Map. */
export function lookupMeaningFrom(dict, baseForm) {
  const entry = dict.get(baseForm);
  if (!entry?.definitions?.length) return '';
  const primary = entry.definitions.find(d => d.primary);
  return primary?.en || entry.definitions[0]?.en || '';
}

/** Look up hiragana reading from a given dict Map. */
export function lookupReadingFrom(dict, baseForm) {
  const entry = dict.get(baseForm);
  return entry?.reading || baseForm;
}

/**
 * Return a card with meaning/reading resolved from the current live dictionary.
 * FSRS fields are preserved verbatim. Stale baked meaning/reading on the input
 * card are ignored.
 */
export function hydrateCard(card, dict = getWordDict()) {
  if (!card) return card;
  return {
    ...card,
    meaning: lookupMeaningFrom(dict, card.id),
    reading: lookupReadingFrom(dict, card.id),
  };
}

/** Hydrate an array of cards. */
export function hydrateCards(cards, dict = getWordDict()) {
  return cards.map(c => hydrateCard(c, dict));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run test:unit -- --test-name-pattern="hydrateCard"
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/hydrate-card.test.js
git commit -m "feat(dict): hydrateCard resolves meaning/reading from live dictionary on read"
```

---

### Task 6: Stop baking `meaning` / `reading` at `createCard` call sites

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js` (~line 73-78)
- Modify: `src/auth/routes.js` (~line 85)
- Modify: `src/routes/admin.js` (~line 107)
- Modify: `src/routes/game/known-words.js` (~line 65)

- [ ] **Step 1: Update word-knowledge.js `createCard` call**

Edit `src/game/bootstrap/word-knowledge.js`. Find the block around line 67-78 that looks like:

```javascript
      if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
        const reading = lookupReading(word);
        if (wasBelowThreshold) {
          newlyMastered.push({ word, reading, meaning, exposures: wk.seen[word].exposures });
        }
        const existingCards = getDeckCards(userId, 'vocab');
        if (!existingCards.find(c => c.id === word)) {
          const dictMeaning = lookupMeaning(word);
          createCard(userId, 'vocab', word, {
            word, meaning: dictMeaning || meaning, reading
          });
        }
      }
```

Replace with:

```javascript
      if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
        const reading = lookupReading(word);
        if (wasBelowThreshold) {
          newlyMastered.push({ word, reading, meaning, exposures: wk.seen[word].exposures });
        }
        const existingCards = getDeckCards(userId, 'vocab');
        if (!existingCards.find(c => c.id === word)) {
          createCard(userId, 'vocab', word, { word });
        }
      }
```

Rationale: `meaning`/`reading` resolve lazily via `hydrateCard()` on any future read; baking them here has become dead metadata. The `newlyMastered` event still carries them because that is a one-shot notification payload, not persisted card state.

- [ ] **Step 2: Update `src/auth/routes.js`**

Find the line (~85):

```javascript
          createCard(user.id, 'vocab', word, { word, meaning: '', reading: lookupReading(word) });
```

Replace with:

```javascript
          createCard(user.id, 'vocab', word, { word });
```

- [ ] **Step 3: Update `src/routes/admin.js`**

Find the line (~107):

```javascript
        createCard(userId, 'vocab', word, { word, meaning: '', reading: lookupReading(word) });
```

Replace with:

```javascript
        createCard(userId, 'vocab', word, { word });
```

- [ ] **Step 4: Update `src/routes/game/known-words.js`**

Find the block around line 60-66:

```javascript
        const dict = getWordDict();
        const entry = dict.get(word);
        const meaning = entry?.definitions?.find(d => d.primary)?.en
          || entry?.definitions?.[0]?.en || '';
        const reading = entry?.reading || word;
        createCard(req.user.id, 'vocab', word, { word, meaning, reading });
```

Replace with:

```javascript
        createCard(req.user.id, 'vocab', word, { word });
```

- [ ] **Step 5: Run the full unit suite**

Run:
```bash
npm run test:unit
```

Expected: all tests pass. (The existing `known-words-review.test.js` creates cards with explicit `meaning`/`reading` — those cards continue to work because hydration overrides their stale values, and no hydration is wired in yet, so tests that assert on raw `card.meaning` still see the test's own baked values.)

- [ ] **Step 6: Commit**

Run:
```bash
git add src/game/bootstrap/word-knowledge.js src/auth/routes.js src/routes/admin.js src/routes/game/known-words.js
git commit -m "feat(dict): stop baking meaning/reading at createCard call sites

Cards written going forward carry only {word}. Meaning and reading are
resolved lazily from the live dictionary via hydrateCard() at read."
```

---

### Task 7: Hydrate cards at the three surfacing sites

**Files:**
- Modify: `src/routes/game/known-words.js` (~line 104-114)
- Modify: `src/game/services/exploration-service.js` (~line 1109-1114)
- Modify: `src/game/vocab-manager.js` (~line 315-326)

- [ ] **Step 1: Hydrate in `known-words.js` `/due-words` endpoint**

Find the block around line 102-114 in `src/routes/game/known-words.js`:

```javascript
  router.get('/due-words', (req, res) => {
    const dict = getWordDict();
    const cards = getDueCards(req.user.id, 'vocab');
    const words = cards.map(c => {
      const entry = dict.get(c.word);
      return {
        word: c.word,
        reading: entry?.reading || c.reading || c.word,
        meanings: c.meaning ? [c.meaning] : [''],
        source: 'internal',
      };
    });
    res.json({ words });
  });
```

Replace with:

```javascript
  router.get('/due-words', (req, res) => {
    const cards = hydrateCards(getDueCards(req.user.id, 'vocab'));
    const words = cards.map(c => ({
      word: c.id,
      reading: c.reading,
      meanings: c.meaning ? [c.meaning] : [''],
      source: 'internal',
    }));
    res.json({ words });
  });
```

Update the imports at the top of the file — add `hydrateCards` to the import from `word-knowledge.js`:

```javascript
import { getWordDict, hydrateCards } from '../../game/bootstrap/word-knowledge.js';
```

(If `getWordDict` isn't currently imported by name in this file, leave the rest of that import unchanged and add `hydrateCards` to whatever the existing import statement is.)

- [ ] **Step 2: Hydrate in `exploration-service.js` speed-review snapshot**

Find the block around line 1108-1115 in `src/game/services/exploration-service.js`:

```javascript
    } else if (userId) {
      const dueCards = getDueCards(userId, 'vocab');
      dueWords = dueCards.map(c => ({
        word: c.word || c.id,
        reading: c.reading || c.word || c.id,
        meanings: c.meaning ? [c.meaning] : []
      }));
    }
```

Replace with:

```javascript
    } else if (userId) {
      const dueCards = hydrateCards(getDueCards(userId, 'vocab'));
      dueWords = dueCards.map(c => ({
        word: c.id,
        reading: c.reading,
        meanings: c.meaning ? [c.meaning] : [],
      }));
    }
```

Add `hydrateCards` to the import from `word-knowledge.js` at the top of the file. If no such import exists yet, add:

```javascript
import { hydrateCards } from '../bootstrap/word-knowledge.js';
```

- [ ] **Step 3: Hydrate in `vocab-manager.js` discovery path**

Find the block around line 315-326 in `src/game/vocab-manager.js`:

```javascript
  const newWords = [];

  for (const card of cards) {
    if (card.state === State.New) {
      newWords.push({
        word: card.id,
        reading: card.reading || card.id,
        meanings: card.meaning ? [card.meaning] : (card.meanings || []),
        rank: card.rank || Infinity
      });
    }
  }
```

Wrap the card loop to hydrate first. Replace the above with:

```javascript
  const newWords = [];
  const hydrated = hydrateCards(cards);

  for (const card of hydrated) {
    if (card.state === State.New) {
      newWords.push({
        word: card.id,
        reading: card.reading,
        meanings: card.meaning ? [card.meaning] : (card.meanings || []),
        rank: card.rank || Infinity,
      });
    }
  }
```

Add `hydrateCards` to the imports at the top of the file:

```javascript
import { hydrateCards } from './bootstrap/word-knowledge.js';
```

- [ ] **Step 4: Run the full unit + integration suite**

Run:
```bash
npm test
```

Expected: all tests pass. Hydration swaps the source of `meaning` but produces the same outward shape `{ word, reading, meanings }` these call sites already emitted.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/routes/game/known-words.js src/game/services/exploration-service.js src/game/vocab-manager.js
git commit -m "feat(dict): hydrate cards at known-words, exploration, vocab-manager surfaces"
```

---

## Phase 5: Admin backend — JMDict column, overlay owner, edit endpoints

### Task 8: Add `jmdictDefinition` + `overlayOwner` fields to aggregate response

**Files:**
- Modify: `src/routes/admin-word-exposures.js`
- Modify: `tests/unit/admin-word-exposures.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/unit/admin-word-exposures.test.js`, add a new `describe` block at the end (or extend an existing one). Insert before the final closing `}`:

```javascript
describe('aggregateWordExposures enrichment', () => {
  it('adds jmdictDefinition and overlayOwner fields', async () => {
    const { createTestTmpDir } = await import('./helpers/tmp.js');
    const tmp = await createTestTmpDir();
    try {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      mkdirSync(join(tmp.path, 'data'));
      // Live dictionary entry for 火 (edited)
      const liveDict = new Map();
      liveDict.set('火', { reading: 'ひ', definitions: [{ en: 'EDITED gloss', primary: true }] });
      // JMdict baseline
      const jmdictBaseline = { '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }] } };
      writeFileSync(join(tmp.path, 'data', 'latest-jm-dict.json'), JSON.stringify(jmdictBaseline));
      // Overlay: 火 is a creature baseWord
      const overlayOwners = new Map([['火', 'creatures.json']]);
      // Word-knowledge fixture
      writeFileSync(join(tmp.path, 'word-knowledge-u_test.json'), JSON.stringify({
        userId: 'u_test', seen: { '火': { exposures: 3 } }, known: {},
      }));

      const { aggregateWordExposures } = await import('../../src/routes/admin-word-exposures.js?t=' + Date.now());
      const result = aggregateWordExposures(tmp.path, liveDict, {
        jmdictPath: join(tmp.path, 'data', 'latest-jm-dict.json'),
        overlayOwners,
      });
      const row = result.words.find(w => w.word === '火');
      assert.ok(row);
      assert.equal(row.definition, 'EDITED gloss');
      assert.equal(row.jmdictDefinition, 'fire');
      assert.equal(row.overlayOwner, 'creatures.json');
    } finally {
      await tmp.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm run test:unit -- --test-name-pattern="aggregateWordExposures enrichment"
```

Expected: FAIL — either `jmdictDefinition` is undefined or the optional third argument isn't accepted.

- [ ] **Step 3: Extend `aggregateWordExposures` to accept options and emit new fields**

Edit `src/routes/admin-word-exposures.js`. Find the `aggregateWordExposures` function (starts around line 15). Change its signature and body:

```javascript
export function aggregateWordExposures(dataDir, dictionary, opts = {}) {
  const { jmdictPath = null, overlayOwners = new Map() } = opts;

  // Load frozen JMdict baseline once, if provided
  let jmdict = null;
  if (jmdictPath && existsSync(jmdictPath)) {
    try {
      jmdict = JSON.parse(readFileSync(jmdictPath, 'utf-8'));
    } catch { jmdict = null; }
  }

  const wordMap = new Map();
  let totalUsers = 0;

  let files;
  try {
    files = readdirSync(dataDir).filter(f => f.startsWith('word-knowledge-') && f.endsWith('.json'));
  } catch {
    files = [];
  }

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
      if (!raw.seen) continue;
      totalUsers++;
      for (const [word, data] of Object.entries(raw.seen)) {
        const existing = wordMap.get(word);
        if (existing) {
          existing.totalExposures += data.exposures || 0;
          existing.users.add(raw.userId || file);
        } else {
          wordMap.set(word, {
            totalExposures: data.exposures || 0,
            users: new Set([raw.userId || file]),
          });
        }
      }
    } catch {
      /* skip malformed files */
    }
  }

  const words = [];
  for (const [word, data] of wordMap) {
    const entry = dictionary.get(word);
    const primaryDef = entry?.definitions?.find(d => d.primary) || entry?.definitions?.[0];
    const jmEntry = jmdict ? jmdict[word] : null;
    const jmPrimary = jmEntry?.definitions?.find(d => d.primary) || jmEntry?.definitions?.[0];
    words.push({
      word,
      reading: entry?.reading || null,
      definition: primaryDef?.en || null,
      jmdictDefinition: jmPrimary?.en || null,
      overlayOwner: overlayOwners.get(word) || null,
      totalExposures: data.totalExposures,
      userCount: data.users.size,
    });
  }
  words.sort((a, b) => b.totalExposures - a.totalExposures);

  return { words, totalUniqueWords: words.length, totalUsers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run test:unit -- --test-name-pattern="aggregateWordExposures enrichment"
```

Expected: PASS. Existing `admin-word-exposures.test.js` tests should still pass since the new options default to empty / null.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/routes/admin-word-exposures.js tests/unit/admin-word-exposures.test.js
git commit -m "feat(dict): add jmdictDefinition and overlayOwner fields to word-exposure rows"
```

---

### Task 9: Wire overlayOwners and jmdictPath into the route factory

**Files:**
- Modify: `src/routes/admin-word-exposures.js` (route factory + getDictionary + GET /word-exposures)

- [ ] **Step 1: Build `overlayOwners` and expose the jmdict path from the factory**

Edit `src/routes/admin-word-exposures.js`. Find the route factory (around line 236). Replace the beginning of the factory with:

```javascript
export default function createWordExposureRoutes({ dataDir, framesPath }) {
  const router = Router();
  router.use(adminAuth);

  const overlayDir = join(process.cwd(), 'data');
  const jmdictPath = join(overlayDir, 'latest-jm-dict.json');

  let dictionary = null;
  let overlayOwners = null;

  function getDictionary() {
    if (!dictionary) {
      dictionary = loadWordDictionary({
        overlayDir,
        liveDictPath: resolveLiveDictPath(),
      });
    }
    return dictionary;
  }

  function getOverlayOwners() {
    if (!overlayOwners) {
      overlayOwners = buildOverlayOwners(overlayDir);
    }
    return overlayOwners;
  }

  function invalidate() {
    dictionary = null;
    // overlayOwners derives only from static overlay files; don't invalidate.
  }

  // Expose invalidation so the edit endpoint can reset after writes.
  router.invalidateDictionary = invalidate;

  const jpdbCachePath = join(dataDir, 'jpdb-tokenization-cache.json');
  const frameCachePath = join(dataDir, 'jpdb-frame-compare-cache.json');

  // GET /word-exposures
  router.get('/word-exposures', (req, res) => {
    try {
      res.json(aggregateWordExposures(dataDir, getDictionary(), {
        jmdictPath,
        overlayOwners: getOverlayOwners(),
      }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
```

Add these imports at the top of the file (after existing imports):

```javascript
import { resolveLiveDictPath } from '../game/live-dict-path.js';
```

If `loadWordDictionary` is imported from `../game/word-dictionary.js`, that stays.

- [ ] **Step 2: Add `buildOverlayOwners` helper at the top-of-file exports**

Near the other exports, add:

```javascript
/**
 * Scan overlay JSON files and return Map<word, filename> of which overlay
 * defines each word. Used to warn the admin that edits will be shadowed.
 */
export function buildOverlayOwners(overlayDir) {
  const owners = new Map();

  const gameOverlays = [
    'creatures.json',
    'moves.json',
    'items.json',
    'npcs.json',
    'npc-skills.json',
    'areas.json',
  ];
  for (const file of gameOverlays) {
    const p = join(overlayDir, file);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      const entries = Array.isArray(raw) ? raw : Object.values(raw);
      for (const entry of entries) {
        if (entry?.baseWord) owners.set(entry.baseWord, file);
      }
    } catch { /* skip malformed */ }
  }

  for (const file of ['glue-words.json', 'grammar-words.json']) {
    const p = join(overlayDir, file);
    if (!existsSync(p)) continue;
    try {
      const entries = JSON.parse(readFileSync(p, 'utf-8'));
      for (const entry of entries) {
        if (entry?.word) owners.set(entry.word, file);
      }
    } catch { /* skip malformed */ }
  }

  return owners;
}
```

- [ ] **Step 3: Run unit tests**

Run:
```bash
npm run test:unit -- --test-name-pattern="admin-word-exposures"
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:
```bash
git add src/routes/admin-word-exposures.js
git commit -m "feat(dict): wire overlayOwners + jmdict baseline into word-exposure factory"
```

---

### Task 10: Add dictionary edit endpoints (GET/PUT/export + read-only guard)

**Files:**
- Create: `src/routes/admin-dictionary-edit.js`
- Test: `tests/unit/admin-dictionary-edit.test.js`
- Modify: `src/routes/admin-word-exposures.js` (mount the sub-router)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-dictionary-edit.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createTestTmpDir } from './helpers/tmp.js';

describe('admin-dictionary-edit', () => {
  let tmp;
  let app;
  let liveDictPath;
  let jmdictPath;
  const ADMIN_SECRET = 'test-secret';

  beforeEach(async () => {
    tmp = await createTestTmpDir();
    liveDictPath = join(tmp.path, 'live-dictionary.json');
    jmdictPath = join(tmp.path, 'latest-jm-dict.json');
    writeFileSync(liveDictPath, JSON.stringify({
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }] },
    }));
    writeFileSync(jmdictPath, JSON.stringify({
      '火': { reading: 'ひ', definitions: [{ en: 'fire (JMdict)', primary: true }] },
    }));

    process.env.ADMIN_SECRET = ADMIN_SECRET;
    delete process.env.DICTIONARY_READONLY;

    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now());
    app = express();
    app.use(express.json());
    app.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners: new Map(),
      onChange: () => {},
      enqueueSync: () => {},
    }));
  });

  afterEach(async () => {
    await tmp.cleanup();
    delete process.env.ADMIN_SECRET;
    delete process.env.DICTIONARY_READONLY;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/dictionary/火');
    assert.equal(res.status, 403);
  });

  it('GET /:word returns live + jmdict + overlayOwner', async () => {
    const res = await request(app)
      .get('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET);
    assert.equal(res.status, 200);
    assert.equal(res.body.word, '火');
    assert.equal(res.body.live.reading, 'ひ');
    assert.equal(res.body.live.definitions[0].en, 'fire');
    assert.equal(res.body.jmdict.definitions[0].en, 'fire (JMdict)');
    assert.equal(res.body.overlayOwner, null);
  });

  it('PUT /:word writes and triggers onChange', async () => {
    let changed = false;
    let synced = null;
    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now() + 'a');
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners: new Map(),
      onChange: () => { changed = true; },
      enqueueSync: (word) => { synced = word; },
    }));
    const res = await request(app2)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({
        reading: 'ひ',
        definitions: [{ en: 'flame', primary: true }, { en: 'Tuesday' }],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.overlayOverridden, false);
    assert.equal(res.body.gitCommitStatus, 'queued');
    assert.equal(changed, true);
    assert.equal(synced, '火');

    const disk = JSON.parse(readFileSync(liveDictPath, 'utf-8'));
    assert.equal(disk['火'].definitions[0].en, 'flame');
    assert.equal(disk['火'].definitions[0].primary, true);
    assert.equal(disk['火'].definitions[1].en, 'Tuesday');
  });

  it('PUT returns 400 when no definition is primary', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame' }] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /primary/);
  });

  it('PUT returns 400 when multiple definitions are primary', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [
        { en: 'flame', primary: true },
        { en: 'Tuesday', primary: true },
      ] });
    assert.equal(res.status, 400);
  });

  it('PUT returns 400 when reading is empty', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: '', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 400);
  });

  it('PUT returns 400 when any en value is blank', async () => {
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: '  ', primary: true }] });
    assert.equal(res.status, 400);
  });

  it('PUT returns 403 skipped-readonly when DICTIONARY_READONLY=true', async () => {
    process.env.DICTIONARY_READONLY = 'true';
    const res = await request(app)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 403);
    assert.equal(res.body.gitCommitStatus, 'skipped-readonly');
  });

  it('PUT response reports overlayOverridden when overlayOwners has the word', async () => {
    const overlayOwners = new Map([['火', 'creatures.json']]);
    const { default: createDictEditRoutes } = await import('../../src/routes/admin-dictionary-edit.js?t=' + Date.now() + 'b');
    const app3 = express();
    app3.use(express.json());
    app3.use('/api/admin/dictionary', createDictEditRoutes({
      liveDictPath,
      jmdictPath,
      overlayOwners,
      onChange: () => {},
      enqueueSync: () => {},
    }));
    const res = await request(app3)
      .put('/api/admin/dictionary/' + encodeURIComponent('火'))
      .set('x-admin-secret', ADMIN_SECRET)
      .send({ reading: 'ひ', definitions: [{ en: 'flame', primary: true }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.overlayOverridden, true);
  });

  it('GET /-export returns JSON download', async () => {
    const res = await request(app)
      .get('/api/admin/dictionary/-export')
      .set('x-admin-secret', ADMIN_SECRET);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'] || '', /attachment/);
    // supertest parses JSON when content-type is application/json; the export endpoint
    // writes the body via res.send() so content-type comes from setHeader above.
    const parsed = JSON.parse(res.text);
    assert.equal(parsed['火'].reading, 'ひ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm run test:unit -- --test-name-pattern="admin-dictionary-edit"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/routes/admin-dictionary-edit.js`**

```javascript
import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { adminAuth } from './admin.js';

/**
 * Mount dictionary edit endpoints under a router.
 *
 * Routes (mounted under whatever prefix the caller chooses):
 *   GET  /:word            — current live entry + jmdict baseline + overlayOwner
 *   PUT  /:word            — write a new entry; returns {ok, overlayOverridden, gitCommitStatus}
 *   GET  /-export          — download full live dictionary (break-glass)
 *
 * `-export` is used instead of `/export` because `:word` would otherwise
 * match the string `export` as a word.
 *
 * @param {object} opts
 * @param {string} opts.liveDictPath
 * @param {string} opts.jmdictPath
 * @param {Map<string,string>} opts.overlayOwners
 * @param {() => void} opts.onChange  called after a successful write
 * @param {(word: string) => void} opts.enqueueSync  called after a successful write
 */
export default function createDictEditRoutes({ liveDictPath, jmdictPath, overlayOwners, onChange, enqueueSync }) {
  const router = Router();
  router.use(adminAuth);

  function readLive() {
    if (!existsSync(liveDictPath)) return {};
    try { return JSON.parse(readFileSync(liveDictPath, 'utf-8')); }
    catch { return {}; }
  }

  function readJm() {
    if (!existsSync(jmdictPath)) return {};
    try { return JSON.parse(readFileSync(jmdictPath, 'utf-8')); }
    catch { return {}; }
  }

  function writeLiveAtomic(data) {
    const tmp = join(dirname(liveDictPath), 'live-dictionary.json.tmp');
    writeFileSync(tmp, JSON.stringify(data, null, 0));
    renameSync(tmp, liveDictPath);
  }

  function isReadOnly() {
    return process.env.DICTIONARY_READONLY === 'true' || process.env.DICTIONARY_READONLY === '1';
  }

  router.get('/-export', (req, res) => {
    const data = readLive();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="live-dictionary.json"');
    res.send(JSON.stringify(data, null, 2));
  });

  router.get('/:word', (req, res) => {
    const word = req.params.word;
    const live = readLive()[word] || null;
    const jmdict = readJm()[word] || null;
    const overlayOwner = overlayOwners.get(word) || null;
    res.json({ word, live, jmdict, overlayOwner });
  });

  router.put('/:word', (req, res) => {
    const word = req.params.word;
    const { reading, definitions } = req.body || {};

    if (typeof reading !== 'string' || reading.trim().length === 0) {
      return res.status(400).json({ error: 'reading must be a non-empty string' });
    }
    if (!Array.isArray(definitions) || definitions.length === 0) {
      return res.status(400).json({ error: 'definitions must be a non-empty array' });
    }
    const primaryCount = definitions.filter(d => d?.primary).length;
    if (primaryCount !== 1) {
      return res.status(400).json({ error: 'exactly one definition must have primary:true' });
    }
    for (const d of definitions) {
      if (!d || typeof d.en !== 'string' || d.en.trim().length === 0) {
        return res.status(400).json({ error: 'every definition must have a non-empty en string' });
      }
    }

    if (isReadOnly()) {
      return res.status(403).json({
        error: 'Dictionary editing is disabled in this environment',
        gitCommitStatus: 'skipped-readonly',
      });
    }

    const cleanDefs = definitions.map(d => ({
      en: d.en.trim(),
      ...(d.primary ? { primary: true } : {}),
    }));

    const current = readLive();
    current[word] = { reading: reading.trim(), definitions: cleanDefs };
    writeLiveAtomic(current);

    onChange?.();
    enqueueSync?.(word);

    res.json({
      ok: true,
      word,
      overlayOverridden: overlayOwners.has(word),
      gitCommitStatus: 'queued',
    });
  });

  return router;
}
```

- [ ] **Step 4: Install supertest as a dev dep (if missing)**

Run:
```bash
node -e "console.log(require('./package.json').devDependencies?.supertest || 'missing')"
```

If it prints `missing`, run:
```bash
npm install --save-dev supertest
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm run test:unit -- --test-name-pattern="admin-dictionary-edit"
```

Expected: PASS, all 9 tests.

- [ ] **Step 6: Mount the sub-router from `admin-word-exposures.js`**

Edit `src/routes/admin-word-exposures.js`. Inside the `createWordExposureRoutes` factory, after the existing route definitions but before `return router`, add:

```javascript
  // Mount dictionary edit sub-router. `/api/admin/dictionary/-export` is used
  // rather than `/export` so it does not collide with the `:word` route.
  router.use('/dictionary', createDictEditRoutes({
    liveDictPath: resolveLiveDictPath(),
    jmdictPath,
    overlayOwners: getOverlayOwners(),
    onChange: () => invalidate(),
    enqueueSync: (word) => enqueueDictionarySync(word),
  }));
```

Add the imports at the top of the file:

```javascript
import createDictEditRoutes from './admin-dictionary-edit.js';
import { enqueueDictionarySync } from './admin-dictionary-sync.js';
```

(The `enqueueDictionarySync` function will be defined in Task 12. For now, create a stub export in the file we're about to write — Step 7.)

- [ ] **Step 7: Create a minimal stub for the sync module**

Create `src/routes/admin-dictionary-sync.js` with a placeholder that logs and does nothing. It'll be expanded in Task 12.

```javascript
/**
 * Background worker for committing live-dictionary edits to the `dictionary`
 * branch. Implementation added in the git auto-commit phase; this stub lets
 * the admin-word-exposures wiring compile.
 */
export function enqueueDictionarySync(word) {
  console.log(`[dict-sync] enqueue ${word} — worker not yet implemented`);
}

export function getSyncStatus() {
  return { lastCommit: null, lastError: null, queueDepth: 0 };
}
```

- [ ] **Step 8: Run the full unit suite**

Run:
```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:
```bash
git add src/routes/admin-dictionary-edit.js src/routes/admin-dictionary-sync.js src/routes/admin-word-exposures.js tests/unit/admin-dictionary-edit.test.js package.json package-lock.json
git commit -m "feat(dict): admin edit endpoints (GET/PUT/export) with read-only guard"
```

---

## Phase 6: Admin frontend — JMDict column, Edit button, modal

### Task 11: Update `public/admin-word-exposures.html`

**Files:**
- Modify: `public/admin-word-exposures.html`

- [ ] **Step 1: Read the current file structure**

Run:
```bash
node -e "const c = require('fs').readFileSync('public/admin-word-exposures.html','utf-8'); const m = c.match(/<table[\s\S]*?<\/table>/); console.log(m ? m[0].slice(0,500) : 'no table'); console.log('---'); console.log('length:', c.length);"
```

Use the output to locate where rows are rendered.

- [ ] **Step 2: Add the JMDict column and overlay badge to the word table**

The exact edit depends on the current rendering code. Apply these changes:

1. In the `<thead>` row for the word-exposures table, insert a new `<th>JMDict Definition</th>` cell immediately after the existing **Definition** cell, and a `<th>Overlay</th>` cell after that, and an empty `<th></th>` cell at the end for the Edit button.
2. In the client-side row-building JS (search for `.definition` or the place that emits `<td>` cells for each row), after the cell that renders `row.definition`:
   - append `<td class="jmdict-cell">${row.jmdictDefinition || ''}</td>`
   - append `<td class="overlay-cell">${row.overlayOwner ? '<span class="overlay-badge">'+row.overlayOwner+'</span>' : ''}</td>`
   - append `<td><button class="edit-dict-btn" data-word="${row.word}">Edit</button></td>`

Add CSS in the existing `<style>` block:

```css
.overlay-badge {
  background: #3a2f00;
  color: #f0a500;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.edit-dict-btn {
  padding: 4px 10px;
  font-size: 12px;
}
.edit-dict-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dict-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.dict-modal {
  background: #16213e;
  border: 1px solid #7fdbca;
  border-radius: 6px;
  padding: 20px;
  width: min(720px, 90vw);
  max-height: 90vh;
  overflow-y: auto;
  color: #e0e0e0;
}
.dict-modal h2 { color: #7fdbca; margin-bottom: 12px; }
.dict-modal label { display: block; margin: 10px 0 4px; color: #aaa; font-size: 12px; }
.dict-modal input, .dict-modal textarea {
  width: 100%;
  background: #0f3460;
  border: 1px solid #333;
  color: #e0e0e0;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
}
.dict-modal .def-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.dict-modal .def-row input[type="text"] { min-width: 0; }
.dict-modal .def-row input[type="radio"] { width: auto; }
.dict-modal .baseline {
  background: #0f3460;
  border-left: 3px solid #7fdbca;
  padding: 10px;
  margin: 12px 0;
  font-size: 12px;
}
.dict-modal .overlay-warning {
  background: #3a0000;
  border: 1px solid #ff6666;
  color: #ffcccc;
  padding: 10px;
  margin: 12px 0;
  border-radius: 4px;
  font-size: 12px;
}
.dict-modal .actions {
  display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;
}
.readonly-banner {
  background: #3a2f00; color: #f0a500; padding: 8px 12px;
  border-radius: 4px; margin-bottom: 10px; font-size: 12px;
}
```

- [ ] **Step 3: Add the edit modal logic**

Before the closing `</body>` tag, add a `<script>` block that:

1. Checks a global `DICTIONARY_READONLY` flag read from a new `GET /api/admin/dictionary-config` endpoint (we'll add that in Step 4 below).
2. Listens for `click` on `.edit-dict-btn` (event delegation on the table body).
3. On click: `fetch('/api/admin/dictionary/' + encodeURIComponent(word))` with the admin header, builds the modal, shows JMdict baseline on the side, renders editable def rows.
4. Save button → PUTs back. On 200 with `overlayOverridden: true`, show a toast: *"Saved. Note: this word is defined in `${overlayOwner}` and that overlay will still override your edit on next boot."*
5. On Cancel or Esc, close the modal.

```javascript
<script>
(function() {
  const secret = () => document.querySelector('input[type="password"]')?.value || '';

  async function dictConfig() {
    const r = await fetch('/api/admin/dictionary-config', { headers: { 'x-admin-secret': secret() } });
    if (!r.ok) return { readOnly: false };
    return r.json();
  }

  async function openEditModal(word) {
    const r = await fetch('/api/admin/dictionary/' + encodeURIComponent(word), { headers: { 'x-admin-secret': secret() } });
    if (!r.ok) { alert('Failed to load entry: ' + r.status); return; }
    const data = await r.json();
    const cfg = await dictConfig();

    const backdrop = document.createElement('div');
    backdrop.className = 'dict-modal-backdrop';
    backdrop.innerHTML = `
      <div class="dict-modal" role="dialog" aria-modal="true">
        <h2>Edit: ${word}</h2>
        ${cfg.readOnly ? '<div class="readonly-banner">Dictionary editing is disabled in this environment. Use production.</div>' : ''}
        ${data.overlayOwner ? `<div class="overlay-warning">This word is also defined in <code>${data.overlayOwner}</code>. Your edit will save to the live dictionary but will be overridden by the overlay on next boot. To change the player-facing gloss, edit <code>${data.overlayOwner}</code> instead.</div>` : ''}
        <label>Reading</label>
        <input type="text" id="dm-reading" value="${(data.live?.reading || '').replace(/"/g,'&quot;')}">
        <label>Definitions (exactly one must be primary)</label>
        <div id="dm-defs"></div>
        <button type="button" id="dm-add">+ Add definition</button>
        <div class="baseline">
          <strong>JMDict baseline:</strong><br>
          Reading: ${data.jmdict?.reading || '—'}<br>
          ${(data.jmdict?.definitions || []).map(d => '• ' + d.en + (d.primary ? ' (primary)' : '')).join('<br>') || '—'}
        </div>
        <div class="actions">
          <button type="button" id="dm-cancel">Cancel</button>
          <button type="button" id="dm-save" ${cfg.readOnly ? 'disabled' : ''}>Save</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const defs = Array.isArray(data.live?.definitions) ? data.live.definitions.map(d => ({ ...d })) : [{ en: '', primary: true }];
    const defsContainer = backdrop.querySelector('#dm-defs');
    function renderDefs() {
      defsContainer.innerHTML = '';
      defs.forEach((d, i) => {
        const row = document.createElement('div');
        row.className = 'def-row';
        row.innerHTML = `
          <input type="text" value="${(d.en || '').replace(/"/g,'&quot;')}" data-idx="${i}" class="dm-en">
          <label title="primary"><input type="radio" name="dm-primary" ${d.primary ? 'checked' : ''} data-idx="${i}"> P</label>
          <button type="button" class="dm-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="dm-down" data-idx="${i}" ${i === defs.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="dm-del" data-idx="${i}" ${defs.length === 1 ? 'disabled' : ''}>✕</button>`;
        defsContainer.appendChild(row);
      });
    }
    renderDefs();

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('#dm-cancel').addEventListener('click', close);
    backdrop.querySelector('#dm-add').addEventListener('click', () => {
      defs.push({ en: '' });
      renderDefs();
    });
    defsContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('dm-en')) {
        defs[+e.target.dataset.idx].en = e.target.value;
      }
    });
    defsContainer.addEventListener('change', (e) => {
      if (e.target.type === 'radio') {
        defs.forEach((d, j) => { d.primary = (j === +e.target.dataset.idx); });
      }
    });
    defsContainer.addEventListener('click', (e) => {
      const idx = +e.target.dataset.idx;
      if (e.target.classList.contains('dm-up')) {
        [defs[idx - 1], defs[idx]] = [defs[idx], defs[idx - 1]];
        renderDefs();
      } else if (e.target.classList.contains('dm-down')) {
        [defs[idx], defs[idx + 1]] = [defs[idx + 1], defs[idx]];
        renderDefs();
      } else if (e.target.classList.contains('dm-del')) {
        if (defs.length > 1) {
          const wasPrimary = defs[idx].primary;
          defs.splice(idx, 1);
          if (wasPrimary) defs[0].primary = true;
          renderDefs();
        }
      }
    });

    backdrop.querySelector('#dm-save').addEventListener('click', async () => {
      const reading = backdrop.querySelector('#dm-reading').value.trim();
      const body = {
        reading,
        definitions: defs.map(d => ({
          en: (d.en || '').trim(),
          ...(d.primary ? { primary: true } : {}),
        })),
      };
      const r = await fetch('/api/admin/dictionary/' + encodeURIComponent(word), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret() },
        body: JSON.stringify(body),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) { alert('Save failed: ' + (payload.error || r.status)); return; }
      if (payload.overlayOverridden) {
        alert('Saved. Note: this word is defined in an overlay file — your edit will be overridden on next boot.');
      }
      close();
      // Refresh the table if the page exposes a refresh hook
      if (typeof window.refreshWordExposures === 'function') window.refreshWordExposures();
    });

    function close() { backdrop.remove(); }
  }

  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('edit-dict-btn')) {
      openEditModal(e.target.dataset.word);
    }
  });
})();
</script>
```

- [ ] **Step 4: Add a `GET /api/admin/dictionary-config` endpoint**

Edit `src/routes/admin-dictionary-edit.js`. Inside `createDictEditRoutes`, before `return router`, add:

```javascript
  // Not mounted under /dictionary — mounted by the parent router at /dictionary-config
```

Since it's mounted under `/dictionary` in the parent, the config endpoint needs to live somewhere the parent can mount separately. The simplest approach: export a second factory. Add after the default export:

```javascript
export function createDictConfigRoute() {
  const router = Router();
  router.use(adminAuth);
  router.get('/', (req, res) => {
    res.json({
      readOnly: process.env.DICTIONARY_READONLY === 'true' || process.env.DICTIONARY_READONLY === '1',
    });
  });
  return router;
}
```

Mount it from `admin-word-exposures.js`. Add to the imports:

```javascript
import createDictEditRoutes, { createDictConfigRoute } from './admin-dictionary-edit.js';
```

Add to the factory, alongside the existing `router.use('/dictionary', ...)`:

```javascript
  router.use('/dictionary-config', createDictConfigRoute());
```

- [ ] **Step 5: Visual verification via Playwright**

Ask the user before launching Playwright. Then:

Run:
```bash
npm run dev
```

Once up, navigate to `http://localhost:5173/admin-word-exposures.html`. With `DICTIONARY_READONLY` unset locally (default), expect:

1. Every row has JMDict Definition + Edit button columns.
2. Rows whose word is defined in a game overlay (e.g. a creature base word) show the overlay badge.
3. Clicking Edit opens a modal with reading + definitions editable, JMDict baseline on the side.
4. Save roundtrips; refresh table shows the new definition.

Take a screenshot after Edit modal is open, show the user, then `rm` the screenshot.

- [ ] **Step 6: Commit**

Run:
```bash
git add public/admin-word-exposures.html src/routes/admin-dictionary-edit.js src/routes/admin-word-exposures.js
git commit -m "feat(dict): admin edit modal + JMDict column + overlay warning + readonly guard"
```

---

## Phase 7: Git auto-commit background worker

### Task 12: Install simple-git and build the worker

**Files:**
- Modify: `package.json` (add `simple-git`)
- Modify: `src/routes/admin-dictionary-sync.js` (real implementation)
- Test: `tests/unit/admin-dictionary-sync.test.js`

- [ ] **Step 1: Install simple-git**

Run:
```bash
npm install simple-git
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/admin-dictionary-sync.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from './helpers/tmp.js';
import { simpleGit } from 'simple-git';

describe('admin-dictionary-sync', () => {
  let tmp;
  let originRepo;
  let workingRepo;
  let liveDictPath;

  beforeEach(async () => {
    tmp = await createTestTmpDir();

    // Create a bare "origin" repo
    originRepo = join(tmp.path, 'origin.git');
    mkdirSync(originRepo);
    await simpleGit(originRepo).init(true);

    // Create the working repo that the app will clone
    workingRepo = join(tmp.path, 'app-repo');

    // Live dict path (what the prod volume would hold)
    liveDictPath = join(tmp.path, 'live-dictionary.json');
    writeFileSync(liveDictPath, JSON.stringify({
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }] },
    }, null, 2));

    // Seed origin with an initial commit on `dictionary`
    const seedDir = join(tmp.path, 'seed');
    mkdirSync(seedDir);
    const seedGit = simpleGit(seedDir);
    await seedGit.init();
    await seedGit.addConfig('user.email', 'seed@example.com');
    await seedGit.addConfig('user.name', 'seed');
    mkdirSync(join(seedDir, 'data'));
    writeFileSync(join(seedDir, 'data', 'live-dictionary.json'), '{}');
    await seedGit.add('.');
    await seedGit.commit('seed');
    await seedGit.addRemote('origin', originRepo);
    await seedGit.branch(['-m', 'dictionary']);
    await seedGit.push('origin', 'dictionary');
  });

  afterEach(async () => {
    await tmp.cleanup();
  });

  it('runs a sync: clones if missing, writes live dict, commits, pushes', async () => {
    const { runDictionarySync } = await import('../../src/routes/admin-dictionary-sync.js?t=' + Date.now());
    const result = await runDictionarySync({
      liveDictPath,
      workingRepoDir: workingRepo,
      remoteUrl: originRepo,
      branch: 'dictionary',
      word: '火',
      authorName: 'test-bot',
      authorEmail: 'bot@test',
    });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(workingRepo, 'data', 'live-dictionary.json')));

    // Verify origin has the commit
    const verifyDir = join(tmp.path, 'verify');
    mkdirSync(verifyDir);
    await simpleGit(verifyDir).clone(originRepo, verifyDir, ['--branch', 'dictionary']);
    const content = JSON.parse(
      (await import('node:fs')).readFileSync(join(verifyDir, 'data', 'live-dictionary.json'), 'utf-8')
    );
    assert.equal(content['火'].definitions[0].en, 'fire');
    const log = await simpleGit(verifyDir).log();
    assert.match(log.latest.message, /dict: edit 火/);
  });

  it('reports failure when remote url is invalid', async () => {
    const { runDictionarySync } = await import('../../src/routes/admin-dictionary-sync.js?t=' + Date.now());
    const result = await runDictionarySync({
      liveDictPath,
      workingRepoDir: workingRepo,
      remoteUrl: 'file:///nonexistent/origin.git',
      branch: 'dictionary',
      word: '火',
      authorName: 'test-bot',
      authorEmail: 'bot@test',
    });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npm run test:unit -- --test-name-pattern="admin-dictionary-sync"
```

Expected: FAIL — `runDictionarySync` is not exported.

- [ ] **Step 4: Implement the sync worker**

Replace `src/routes/admin-dictionary-sync.js`:

```javascript
import { simpleGit } from 'simple-git';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEFAULT_WORKING_REPO = '/app/persist/.dictionary-repo';
const DEFAULT_BRANCH = 'dictionary';
const IN_REPO_PATH = 'data/live-dictionary.json';
const AUTHOR_NAME = 'koto-dictionary-bot';
const AUTHOR_EMAIL = 'bot@koto.invalid';

const status = {
  lastCommit: null,  // { word, sha, at }
  lastError: null,   // { word, error, at }
  queueDepth: 0,
};

let queue = Promise.resolve();

function remoteUrlFromToken(token, repoSlug) {
  return `https://x-access-token:${token}@github.com/${repoSlug}.git`;
}

async function ensureWorkingRepo({ workingRepoDir, remoteUrl, branch }) {
  if (!existsSync(workingRepoDir)) {
    mkdirSync(dirname(workingRepoDir), { recursive: true });
    await simpleGit().clone(remoteUrl, workingRepoDir, ['--branch', branch, '--depth', '1']);
  }
  return simpleGit(workingRepoDir);
}

/**
 * Perform a single sync:
 *   - ensure working repo exists (clone if absent)
 *   - fetch + reset hard to latest branch tip
 *   - copy liveDictPath into the repo at IN_REPO_PATH
 *   - commit + push
 *
 * @param {object} opts
 * @param {string} opts.liveDictPath
 * @param {string} opts.workingRepoDir
 * @param {string} opts.remoteUrl
 * @param {string} opts.branch
 * @param {string} opts.word
 * @param {string} [opts.authorName]
 * @param {string} [opts.authorEmail]
 * @returns {Promise<{ ok: boolean, sha?: string, error?: string }>}
 */
export async function runDictionarySync({
  liveDictPath,
  workingRepoDir,
  remoteUrl,
  branch,
  word,
  authorName = AUTHOR_NAME,
  authorEmail = AUTHOR_EMAIL,
}) {
  try {
    const git = await ensureWorkingRepo({ workingRepoDir, remoteUrl, branch });
    await git.addConfig('user.email', authorEmail);
    await git.addConfig('user.name', authorName);

    await git.fetch('origin', branch);
    await git.reset(['--hard', `origin/${branch}`]);

    const targetPath = join(workingRepoDir, IN_REPO_PATH);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(liveDictPath, targetPath);

    await git.add(IN_REPO_PATH);
    const commitResult = await git.commit(`dict: edit ${word}`);
    if (!commitResult.commit) {
      // Nothing to commit (identical contents). Treat as success no-op.
      return { ok: true, sha: null };
    }
    await git.push('origin', branch);
    return { ok: true, sha: commitResult.commit };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Enqueue a sync. Runs serially. Retries up to 3 times with exponential backoff.
 */
export function enqueueDictionarySync(word, overrides = {}) {
  const token = process.env.DICTIONARY_BOT_GITHUB_TOKEN;
  const repoSlug = process.env.DICTIONARY_REPO_SLUG; // e.g. "anthropic/jrpg"
  const workingRepoDir = overrides.workingRepoDir || DEFAULT_WORKING_REPO;
  const branch = overrides.branch || DEFAULT_BRANCH;
  const liveDictPath = overrides.liveDictPath || '/app/persist/live-dictionary.json';

  if (!token || !repoSlug) {
    status.lastError = { word, error: 'DICTIONARY_BOT_GITHUB_TOKEN or DICTIONARY_REPO_SLUG not set', at: new Date().toISOString() };
    return;
  }

  const remoteUrl = overrides.remoteUrl || remoteUrlFromToken(token, repoSlug);

  status.queueDepth++;
  queue = queue.then(async () => {
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await runDictionarySync({ liveDictPath, workingRepoDir, remoteUrl, branch, word });
        if (r.ok) {
          status.lastCommit = { word, sha: r.sha, at: new Date().toISOString() };
          status.lastError = null;
          return;
        }
        if (attempt === 3) {
          status.lastError = { word, error: r.error, at: new Date().toISOString() };
          return;
        }
        await new Promise(res => setTimeout(res, 500 * 2 ** (attempt - 1)));
      }
    } finally {
      status.queueDepth--;
    }
  });
}

export function getSyncStatus() {
  return { ...status };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm run test:unit -- --test-name-pattern="admin-dictionary-sync"
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

Run:
```bash
git add package.json package-lock.json src/routes/admin-dictionary-sync.js tests/unit/admin-dictionary-sync.test.js
git commit -m "feat(dict): git auto-commit worker with retry + status tracking"
```

---

### Task 13: Add `GET /api/admin/dictionary/sync-status` and admin banner

**Files:**
- Modify: `src/routes/admin-dictionary-edit.js` (add status factory)
- Modify: `src/routes/admin-word-exposures.js` (mount status route)
- Modify: `public/admin-word-exposures.html` (status banner poll)

- [ ] **Step 1: Add sync-status route factory**

Edit `src/routes/admin-dictionary-edit.js`. Add a third exported factory:

```javascript
export function createDictSyncStatusRoute({ getSyncStatus }) {
  const router = Router();
  router.use(adminAuth);
  router.get('/', (req, res) => {
    res.json(getSyncStatus());
  });
  return router;
}
```

- [ ] **Step 2: Mount it from `admin-word-exposures.js`**

In the same factory alongside `router.use('/dictionary', ...)` and `router.use('/dictionary-config', ...)`, add:

```javascript
  router.use('/dictionary-sync-status', createDictSyncStatusRoute({ getSyncStatus }));
```

Add to the imports at the top of `admin-word-exposures.js`:

```javascript
import createDictEditRoutes, { createDictConfigRoute, createDictSyncStatusRoute } from './admin-dictionary-edit.js';
import { enqueueDictionarySync, getSyncStatus } from './admin-dictionary-sync.js';
```

- [ ] **Step 3: Add a banner in the admin HTML**

Append to the inline script in `public/admin-word-exposures.html` (inside the existing `<script>` block added in Task 11):

```javascript
async function pollSyncStatus() {
  try {
    const r = await fetch('/api/admin/dictionary-sync-status', { headers: { 'x-admin-secret': secret() } });
    if (!r.ok) return;
    const s = await r.json();
    let banner = document.getElementById('dict-sync-banner');
    if (s.lastError) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'dict-sync-banner';
        banner.className = 'readonly-banner';
        document.body.insertBefore(banner, document.body.firstChild);
      }
      banner.textContent = `Last dictionary edit not committed to git: ${s.lastError.error} (${s.lastError.word}, ${s.lastError.at}). Click to retry.`;
      banner.style.cursor = 'pointer';
      banner.onclick = () => { /* re-PUT the last-errored word handled out of scope for v1 */ alert('Retry: re-save the word via Edit.'); };
    } else if (banner) {
      banner.remove();
    }
  } catch { /* swallow */ }
}
setInterval(pollSyncStatus, 15000);
pollSyncStatus();
```

- [ ] **Step 4: Smoke-test locally (no git push actually attempted — env vars absent)**

Run:
```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/routes/admin-dictionary-edit.js src/routes/admin-word-exposures.js public/admin-word-exposures.html
git commit -m "feat(dict): sync-status endpoint + banner for auto-commit failures"
```

---

## Phase 8: Environment wiring + nightly reconciliation

### Task 14: Document env vars in `.env.example`

**Files:**
- Modify: `.env.example` (or create if missing)

- [ ] **Step 1: Append dictionary-related env docs**

Append to `.env.example`:

```
# Dictionary authoring (set on prod only)
DICTIONARY_READONLY=true               # "true" to disable the admin dictionary edit button. Unset or "false" on prod.
DICTIONARY_BOT_GITHUB_TOKEN=           # GitHub PAT with push access to the dictionary branch. Prod only.
DICTIONARY_REPO_SLUG=owner/repo        # GitHub slug for the auto-commit target. Prod only.
```

- [ ] **Step 2: Commit**

Run:
```bash
git add .env.example
git commit -m "docs(dict): document DICTIONARY_READONLY, bot token, repo slug env vars"
```

---

### Task 15: Nightly GitHub Action reconciliation

**Files:**
- Create: `.github/workflows/dictionary-nightly-sync.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Dictionary nightly sync

on:
  schedule:
    - cron: '23 4 * * *'  # 04:23 UTC daily
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: dictionary
          fetch-depth: 1
          token: ${{ secrets.DICTIONARY_BOT_GITHUB_TOKEN }}

      - name: Fetch live dictionary from prod
        run: |
          curl -fsSL -H "x-admin-secret: ${ADMIN_SECRET}" \
            "${PROD_URL}/api/admin/dictionary/-export" \
            -o data/live-dictionary.json
        env:
          ADMIN_SECRET: ${{ secrets.ADMIN_SECRET }}
          PROD_URL: ${{ secrets.PROD_URL }}

      - name: Commit if changed
        run: |
          git config user.email bot@koto.invalid
          git config user.name koto-dictionary-bot
          if git diff --quiet data/live-dictionary.json; then
            echo "no changes"; exit 0
          fi
          git add data/live-dictionary.json
          git commit -m "dict: nightly sync"
          git push origin dictionary
```

- [ ] **Step 2: Add repo secrets manually**

Document for the user: in the GitHub repo settings, add three secrets:
- `DICTIONARY_BOT_GITHUB_TOKEN` — PAT with `contents:write` on this repo
- `ADMIN_SECRET` — matches prod's `ADMIN_SECRET` env var
- `PROD_URL` — `https://jrpg-production.up.railway.app`

- [ ] **Step 3: Commit**

Run:
```bash
git add .github/workflows/dictionary-nightly-sync.yml
git commit -m "ci(dict): nightly GitHub Action to reconcile dictionary branch with prod"
```

---

## Phase 9: Final verification

### Task 16: Full test run + integration smoke

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: all tier 1 + tier 2 tests pass. Coverage floor unchanged or better.

- [ ] **Step 2: Boot locally and hit the admin page**

Run:
```bash
npm run dev
```

In a second terminal, curl the word-exposures endpoint (replace `<secret>` with the value from `.env`):

```bash
curl -s -H "x-admin-secret: <secret>" http://localhost:5173/api/admin/word-exposures | head -c 400
```

Expected: JSON includes `jmdictDefinition` and `overlayOwner` fields on rows.

- [ ] **Step 3: Manual Playwright walkthrough (ask user first)**

Ask the user before launching. Then with DICTIONARY_READONLY unset locally:

1. Navigate to `/admin-word-exposures.html`.
2. Enter admin secret.
3. Observe JMDict Definition column and Edit buttons.
4. Click Edit on any word — modal opens with reading + definitions + baseline panel.
5. Change the primary definition, click Save.
6. Refresh word-exposures — the definition column reflects the edit.
7. Visit `/api/admin/dictionary/-export` with the admin header — download succeeds.

Screenshot each checkpoint, show to user, `rm` after.

- [ ] **Step 4: Final commit if anything adjusted during smoke**

If anything needed adjusting, commit the fixes. If not, done.

---

## Acceptance Criteria Cross-Reference

| Spec criterion | Tasks |
|---|---|
| 1. `data/live-dictionary.json` is sole dictionary source; `data/dictionary.json` removed | Task 1 |
| 2. `data/latest-jm-dict.json` frozen, admin-only | Task 1, 8, 9 |
| 3. Prod stores live dict on volume; survives deploys; first-boot seeds from repo | Task 2 |
| 4. Admin edits reading + full definitions, including overlay-shadowed words with warning | Task 10, 11 |
| 5. `createCard()` stops writing meaning/reading; `hydrateCard()` resolves on read | Task 5, 6, 7 |
| 6. Edits take effect without migration | Task 6, 7 (cache invalidation in Task 9/10) |
| 7. Local/dev/CI boot from committed snapshot; save disabled via `DICTIONARY_READONLY` | Task 10, 11 |
| 8. Every prod save auto-commits to `dictionary` branch; failures surface as banner | Task 12, 13 |
| 9. Nightly GitHub Action reconciles | Task 15 |
| 10. JMdict never loaded by runtime | Task 3, 4 (only `latest-jm-dict.json` read in admin route) |
