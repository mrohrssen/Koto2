# Hardcoded Dialogue Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tokenizer, word dictionary, sentence renderer, dialogue data, filtering system, and integration layer that makes the first few hours of gameplay feel like a real Japanese-speaking world — even when the player knows zero words.

**Architecture:** A local WASM morphological analyzer (`lindera-wasm-unidic-nodejs`) tokenizes Japanese text into morphemes. A 30-50k entry word dictionary (built from JMdict) maps each morpheme to readings and English definitions. A sentence renderer displays known words inline and unknown words as vertical stacks (hiragana + English). Handcrafted dialogue pools (CID scripts, NPC lines, barks) are pre-tokenized at authoring time and word-gated at runtime via i+1 filtering against the player's FSRS-tracked known vocabulary.

**Tech Stack:** lindera-wasm-unidic-nodejs (WASM tokenizer), jmdict-simplified (dictionary source from GitHub releases), ts-fsrs (existing SRS), node:test (testing), Express (existing server)

**Spec:** [docs/superpowers/specs/2026-04-05-hardcoded-dialogue-bootstrap-design.md](../specs/2026-04-05-hardcoded-dialogue-bootstrap-design.md)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/tokenizer.js` | Wraps lindera-wasm-unidic-nodejs, normalizes output to `[{surface, baseForm, pos, reading}]` |
| `src/game/word-dictionary.js` | Loads `data/dictionary.json` + overlays game data at startup, exports `Map<baseForm, {reading, definitions[]}>` |
| `src/game/dialogue-filter.js` | i+1 filtering, CID script ranking, NPC line selection, bark selection |
| `data/dictionary.json` | Base word dictionary (30-50k entries, built from JMdict) |
| `data/glue-words.json` | 50 functional words with priority ordering |
| `data/grammar-words.json` | ~50-60 grammar words with stage-based introduction schedule |
| `data/dialogue/cid-scripts.json` | CID run-start scripts (~15-20, pre-tokenized) |
| `data/dialogue/npc-lines.json` | NPC per-slot dialogue pools (pre-tokenized) |
| `data/dialogue/barks.json` | Bark pool by trigger category (pre-tokenized) |
| `scripts/build-dictionary.js` | JMdict JSON → `data/dictionary.json` conversion (dev-time) |
| `scripts/pre-tokenize-dialogue.js` | Adds `_tokens` and `_contentWords` to dialogue JSON files |
| `scripts/validate-dialogue.js` | Validates dialogue against dictionary, grammar constraints, bark length |
| `tests/unit/tokenizer.test.js` | Tokenizer unit tests |
| `tests/unit/word-dictionary.test.js` | Word dictionary loader tests |
| `tests/unit/dialogue-filter.test.js` | Dialogue filter tests |
| `tests/unit/sentence-renderer.test.js` | renderJpSentence tests |

### Modified Files

| File | Change |
|------|--------|
| `public/js/ui/bootstrap-client.js` | Add `renderJpSentence()` function |
| `public/game.css` | Add `.jp-word`, `.jp-unknown`, `.jp-stack-reading`, `.jp-stack-en` styles |
| `public/js/ui/narration-box.js` | Pass dialogue data to renderJpSentence for CID/NPC lines |
| `public/js/ui/speech-bubble.js` | Use new bark pool format with client-side i+1 filtering |
| `src/routes/game/run.js` | Include CID dialogue script in start-run response |
| `src/routes/game/combat.js` | Return word-gated NPC dialogue in encounter response |
| `src/routes/game/known-words.js` | Phase 5: query FSRS instead of word-knowledge.known |
| `src/game/bootstrap/word-knowledge.js` | Phase 5: deprecate known map, add migration helpers |
| `package.json` | Add `lindera-wasm-unidic-nodejs` dependency |

---

## Chunk 1: Foundation (Tokenizer + Dictionary)

### Task 1: Tokenizer Wrapper

**Files:**
- Create: `src/tokenizer.js`
- Test: `tests/unit/tokenizer.test.js`
- Modify: `package.json` (add dependency)

- [ ] **Step 1: Install lindera-wasm-unidic-nodejs**

```bash
npm install lindera-wasm-unidic-nodejs
```

Verify install succeeded — this package is ~54MB (bundles UniDic dictionary as WASM):

```bash
node -e "import('lindera-wasm-unidic-nodejs').then(m => console.log(Object.keys(m)))"
```

Note the exported names. The package should export a `Lindera` class or `tokenize` function. Adapt step 3 based on what you find.

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/tokenizer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/tokenizer.js';

describe('tokenizer', () => {
  it('tokenizes a simple greeting', async () => {
    const tokens = await tokenize('こんにちは');
    assert.ok(Array.isArray(tokens));
    assert.ok(tokens.length >= 1);
    // こんにちは should be recognized as a single token
    const greeting = tokens.find(t => t.surface === 'こんにちは');
    assert.ok(greeting, 'should find こんにちは token');
    assert.equal(typeof greeting.baseForm, 'string');
    assert.equal(typeof greeting.pos, 'string');
    assert.equal(typeof greeting.reading, 'string');
  });

  it('resolves conjugated forms to dictionary form', async () => {
    const tokens = await tokenize('遊んで');
    // 遊んで → baseForm: 遊ぶ
    const verb = tokens.find(t => t.baseForm === '遊ぶ');
    assert.ok(verb, 'should resolve 遊んで to baseForm 遊ぶ');
  });

  it('separates particles from content words', async () => {
    const tokens = await tokenize('一緒に遊ぶ');
    const surfaces = tokens.map(t => t.surface);
    assert.ok(surfaces.includes('一緒'), 'should have 一緒');
    assert.ok(surfaces.includes('に'), 'should have に');
    assert.ok(surfaces.includes('遊ぶ'), 'should have 遊ぶ');
  });

  it('handles punctuation', async () => {
    const tokens = await tokenize('すごい！');
    const punct = tokens.find(t => t.surface === '！');
    assert.ok(punct, 'should have punctuation token');
  });

  it('returns empty array for empty string', async () => {
    const tokens = await tokenize('');
    assert.deepEqual(tokens, []);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test tests/unit/tokenizer.test.js
```

Expected: FAIL — `src/tokenizer.js` does not exist.

- [ ] **Step 4: Implement the tokenizer wrapper**

Create `src/tokenizer.js`. The exact lindera API call may need adjustment based on what step 1 revealed. This is the expected shape — adapt the `linderaTokenize` call and field extraction to match the actual API:

```js
// src/tokenizer.js

/**
 * Wraps lindera-wasm-unidic-nodejs to provide a normalized tokenization interface.
 * Returns: [{ surface, baseForm, pos, reading }]
 *
 * UniDic detail fields (CSV order):
 * 0:pos1 1:pos2 2:pos3 3:pos4 4:cType 5:cForm
 * 6:lForm 7:lemma 8:orth 9:pron 10:orthBase 11:pronBase
 * ...additional fields vary by UniDic version
 */

let _lindera = null;

async function getLindera() {
  if (_lindera) return _lindera;
  const mod = await import('lindera-wasm-unidic-nodejs');
  // Adapt this initialization to the actual API:
  // Option A: mod.Lindera is a class
  // Option B: mod.tokenize is a function
  // Option C: mod.default needs .init() or similar
  _lindera = mod;
  return _lindera;
}

/**
 * Tokenize Japanese text into morphemes.
 * @param {string} text
 * @returns {Promise<Array<{surface: string, baseForm: string, pos: string, reading: string}>>}
 */
export async function tokenize(text) {
  if (!text || text.trim().length === 0) return [];

  const lindera = await getLindera();

  // Call lindera — adapt to actual API shape discovered in step 1
  const rawTokens = lindera.tokenize(text);

  return rawTokens.map(token => {
    // Adapt field extraction to match actual lindera output.
    // For UniDic WASM, tokens typically have:
    //   token.text (surface) and token.detail (CSV array)
    const surface = token.text ?? token.surface ?? '';
    const detail = token.detail ?? [];

    // UniDic CSV: [pos1, pos2, pos3, pos4, cType, cForm, lForm, lemma, orth, pron, orthBase, pronBase, ...]
    const pos = detail[0] ?? '';
    const lemma = detail[7] ?? surface;  // dictionary form
    // Reading: try pronBase (field 11), fall back to lForm (field 6), then surface
    const reading = katakanaToHiragana(detail[11] ?? detail[6] ?? surface);

    return {
      surface,
      baseForm: lemma,
      pos,
      reading,
    };
  });
}

/**
 * Convert katakana to hiragana (UniDic readings are in katakana).
 */
function katakanaToHiragana(str) {
  if (!str) return '';
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
```

**Important:** The exact lindera API may differ from this template. After installing in step 1, explore the API with:

```bash
node -e "
  import('lindera-wasm-unidic-nodejs').then(async m => {
    console.log('Exports:', Object.keys(m));
    // Try different initialization patterns:
    // const t = new m.Lindera(); const result = t.tokenize('テスト');
    // const result = m.tokenize('テスト');
    // const result = await m.default.tokenize('テスト');
    // Log the first token to see its shape:
    // console.log('Token shape:', JSON.stringify(result[0], null, 2));
  });
"
```

Adapt `getLindera()` and the field extraction in `tokenize()` to match.

- [ ] **Step 5: Run tests and verify they pass**

```bash
node --test tests/unit/tokenizer.test.js
```

Expected: all 5 tests PASS. If any fail due to API differences, adapt the wrapper and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/tokenizer.js tests/unit/tokenizer.test.js package.json package-lock.json
git commit -m "feat: add tokenizer wrapper around lindera-wasm-unidic-nodejs"
```

---

### Task 2: Dictionary Build Script

**Files:**
- Create: `scripts/build-dictionary.js`
- Output: `data/dictionary.json`

This is a dev-time script, not a runtime module. It converts JMdict JSON data into the game's runtime dictionary format.

- [ ] **Step 1: Download jmdict-simplified data**

The `jmdict-simplified` project provides pre-parsed JMdict in JSON format. Download the latest English-only release:

```bash
mkdir -p tmp
curl -L "https://github.com/scriptin/jmdict-simplified/releases/latest/download/jmdict-eng-3.6.1.json.tgz" -o tmp/jmdict-eng.tgz 2>/dev/null || \
curl -L "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.1%2B20250506/jmdict-eng-3.6.1.json.tgz" -o tmp/jmdict-eng.tgz
cd tmp && tar xzf jmdict-eng.tgz && cd ..
ls -lh tmp/jmdict-eng-*.json
```

If the exact URL fails, go to `https://github.com/scriptin/jmdict-simplified/releases` and find the latest `jmdict-eng-*.json.tgz` asset. The JSON file is ~150-200MB.

- [ ] **Step 2: Write the build script**

```js
// scripts/build-dictionary.js

/**
 * Converts jmdict-simplified JSON into the game's runtime word dictionary.
 *
 * Usage: node scripts/build-dictionary.js <path-to-jmdict-eng.json>
 * Output: data/dictionary.json (~30-50k entries)
 *
 * Filtering: includes entries where at least one kanji or kana form is marked common.
 * Each entry maps baseForm → { reading, definitions[] }.
 */

import { readFileSync, writeFileSync } from 'fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/build-dictionary.js <jmdict-eng.json>');
  process.exit(1);
}

console.log(`Reading ${inputPath}...`);
const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
const words = raw.words || raw;

console.log(`Total JMdict entries: ${Array.isArray(words) ? words.length : 'unknown format'}`);

const dictionary = {};
let included = 0;

for (const entry of words) {
  // Filter: at least one common kanji or kana form
  const hasCommonKanji = entry.kanji?.some(k => k.common);
  const hasCommonKana = entry.kana?.some(k => k.common);
  if (!hasCommonKanji && !hasCommonKana) continue;

  // Get primary kanji and kana forms
  const kanjiForm = entry.kanji?.[0]?.text;
  const kanaForm = entry.kana?.[0]?.text;
  if (!kanaForm) continue;

  // Extract English definitions from all senses
  const definitions = [];
  for (const sense of (entry.sense || [])) {
    const glosses = sense.gloss
      ?.filter(g => g.lang === 'eng')
      ?.map(g => g.text) || [];
    if (glosses.length > 0) {
      definitions.push({
        en: glosses.join(' / '),
        ...(definitions.length === 0 ? { primary: true } : {}),
      });
    }
  }

  if (definitions.length === 0) continue;

  // Store under kanji form (if available) and kana form
  const dictEntry = { reading: kanaForm, definitions };

  if (kanjiForm && !dictionary[kanjiForm]) {
    dictionary[kanjiForm] = dictEntry;
    included++;
  }
  // Also store under kana form (for words written in kana only, or as fallback)
  if (!dictionary[kanaForm]) {
    dictionary[kanaForm] = { reading: kanaForm, definitions };
    if (!kanjiForm) included++;
  }
}

const outputPath = 'data/dictionary.json';
writeFileSync(outputPath, JSON.stringify(dictionary, null, 0));

const sizeMB = (Buffer.byteLength(JSON.stringify(dictionary)) / 1024 / 1024).toFixed(1);
console.log(`Written ${outputPath}: ${included} entries (${Object.keys(dictionary).length} keys), ${sizeMB}MB`);
```

- [ ] **Step 3: Run the build script**

```bash
node scripts/build-dictionary.js tmp/jmdict-eng-*.json
```

Expected output: `Written data/dictionary.json: ~20000-40000 entries, ~X MB`

Verify the output makes sense:

```bash
node -e "
  const d = JSON.parse(require('fs').readFileSync('data/dictionary.json', 'utf-8'));
  const keys = Object.keys(d);
  console.log('Total keys:', keys.length);
  console.log('Sample - 遊ぶ:', JSON.stringify(d['遊ぶ']));
  console.log('Sample - こんにちは:', JSON.stringify(d['こんにちは']));
  console.log('Sample - 一緒:', JSON.stringify(d['一緒']));
"
```

Ensure entries have `reading` and `definitions` with a `primary: true` first definition.

- [ ] **Step 4: Add dictionary.json to .gitignore if too large, or commit if reasonable**

If `data/dictionary.json` is under ~10MB, commit it. If larger, add to `.gitignore` and document the build step.

```bash
ls -lh data/dictionary.json
# If under 10MB:
git add scripts/build-dictionary.js data/dictionary.json
# If over 10MB, add to .gitignore instead:
# echo "data/dictionary.json" >> .gitignore
# git add scripts/build-dictionary.js .gitignore
git commit -m "feat: add dictionary build script and base dictionary from JMdict"
```

---

### Task 3: Word Dictionary Runtime Loader

**Files:**
- Create: `src/game/word-dictionary.js`
- Test: `tests/unit/word-dictionary.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/word-dictionary.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createTestTmpDir } from '../helpers/tmp.js';

// We'll test with a small fixture dictionary and game data
describe('word-dictionary', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await createTestTmpDir();

    // Write a minimal base dictionary
    writeFileSync(join(tmpDir.path, 'dictionary.json'), JSON.stringify({
      '遊ぶ': { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] },
      '火': { reading: 'ひ', definitions: [{ en: 'fire', primary: true }, { en: 'Tuesday' }] },
      '一緒': { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] },
    }));

    // Write minimal game data that overlays
    writeFileSync(join(tmpDir.path, 'creatures.json'), JSON.stringify({
      hi: { id: 'hi', name: '火', nameEn: 'Hi', baseWord: '火', baseReading: 'ひ', baseMeaning: 'fire' }
    }));
  });

  afterEach(async () => {
    await tmpDir.cleanup();
  });

  it('loads base dictionary entries', async () => {
    const { loadWordDictionary } = await import('../../src/game/word-dictionary.js');
    const dict = loadWordDictionary(tmpDir.path);
    assert.ok(dict.has('遊ぶ'));
    assert.equal(dict.get('遊ぶ').reading, 'あそぶ');
    assert.equal(dict.get('遊ぶ').definitions[0].en, 'to play');
  });

  it('overlays game data definitions over base dictionary', async () => {
    const { loadWordDictionary } = await import('../../src/game/word-dictionary.js');
    const dict = loadWordDictionary(tmpDir.path);
    // Game creature defines 火 as "fire" — should take priority
    const hi = dict.get('火');
    assert.ok(hi);
    assert.equal(hi.definitions[0].en, 'fire');
    assert.equal(hi.definitions[0].primary, true);
  });

  it('returns empty map if dictionary file missing', async () => {
    const { loadWordDictionary } = await import('../../src/game/word-dictionary.js');
    const dict = loadWordDictionary(join(tmpDir.path, 'nonexistent'));
    assert.equal(dict.size, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/word-dictionary.test.js
```

Expected: FAIL — `src/game/word-dictionary.js` does not exist.

- [ ] **Step 3: Implement the word dictionary loader**

```js
// src/game/word-dictionary.js

/**
 * Loads the word dictionary at server startup.
 *
 * 1. Load base dictionary (data/dictionary.json, 30-50k entries from JMdict)
 * 2. Overlay game data: creatures, moves, items, npcs, npc-skills, areas, glue-words, grammar-words
 * 3. Game entries replace base entries for their words
 *
 * Returns Map<baseForm, { reading: string, definitions: [{ en: string, primary?: boolean }] }>
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Load and return the word dictionary.
 * @param {string} dataDir - Path to the data/ directory
 * @returns {Map<string, {reading: string, definitions: Array<{en: string, primary?: boolean}>}>}
 */
export function loadWordDictionary(dataDir) {
  const dict = new Map();

  // 1. Load base dictionary
  const basePath = join(dataDir, 'dictionary.json');
  if (existsSync(basePath)) {
    try {
      const base = JSON.parse(readFileSync(basePath, 'utf-8'));
      for (const [word, entry] of Object.entries(base)) {
        dict.set(word, entry);
      }
    } catch (e) {
      console.warn('[WordDictionary] Failed to load base dictionary:', e.message);
    }
  }

  // 2. Overlay game data files
  const overlayConfigs = [
    { file: 'creatures.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'moves.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'items.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'npcs.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'npc-skills.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'areas.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'creature-speech.json', wordField: 'jp', readingField: 'reading', meaningField: 'en', nested: true },
  ];

  for (const config of overlayConfigs) {
    overlayGameData(dict, join(dataDir, config.file), config);
  }

  // 3. Overlay curriculum files (glue-words, grammar-words)
  for (const file of ['glue-words.json', 'grammar-words.json']) {
    const filePath = join(dataDir, file);
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
    // Handle object-of-objects, array, or nested-array formats
    let entries;
    if (config.nested) {
      // creature-speech.json: { trigger: [{ jp, reading, en }] }
      entries = Object.values(raw).flat();
    } else {
      entries = Array.isArray(raw) ? raw : Object.values(raw);
    }
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

- [ ] **Step 4: Run tests and verify they pass**

```bash
node --test tests/unit/word-dictionary.test.js
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/word-dictionary.js tests/unit/word-dictionary.test.js
git commit -m "feat: add word dictionary runtime loader with game data overlays"
```

---

## Chunk 2: Renderer

### Task 4: Sentence Renderer

**Files:**
- Modify: `public/js/ui/bootstrap-client.js` (add `renderJpSentence` export)
- Test: `tests/unit/sentence-renderer.test.js`

- [ ] **Step 1: Write the failing test**

`renderJpSentence` is a pure function that takes tokens + known words + dictionary and returns HTML. It runs client-side but can be tested server-side since it's pure string manipulation.

```js
// tests/unit/sentence-renderer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We test the renderer logic directly since it's pure functions.
// Import from the source file — it uses browser globals minimally.
// We'll extract the renderer into a testable form.
import { renderJpSentence } from '../../public/js/ui/bootstrap-client.js';

const wordDict = new Map([
  ['こんにちは', { reading: 'こんにちは', definitions: [{ en: 'hello', primary: true }] }],
  ['一緒', { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] }],
  ['遊ぶ', { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] }],
  ['に', { reading: 'に', definitions: [{ en: 'to/at', primary: true }] }],
]);

describe('renderJpSentence', () => {
  it('renders known words as inline hiragana (useKanji=false)', () => {
    const tokens = [
      { surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' },
    ];
    const knownWords = new Set(['こんにちは']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.ok(html.includes('jp-known'), 'should have jp-known class');
    assert.ok(html.includes('こんにちは'), 'should display hiragana reading');
    assert.ok(!html.includes('jp-unknown'), 'should not have jp-unknown class');
  });

  it('renders unknown words as vertical stacks', () => {
    const tokens = [
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
    ];
    const knownWords = new Set();
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.ok(html.includes('jp-unknown'), 'should have jp-unknown class');
    assert.ok(html.includes('jp-stack-reading'), 'should have reading span');
    assert.ok(html.includes('jp-stack-en'), 'should have English span');
    assert.ok(html.includes('いっしょ'), 'should show hiragana reading');
    assert.ok(html.includes('together'), 'should show English definition');
  });

  it('renders punctuation as-is', () => {
    const tokens = [
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
    ];
    const knownWords = new Set();
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.ok(html.includes('jp-punct'), 'should have jp-punct class');
    assert.ok(html.includes('！'), 'should contain punctuation');
  });

  it('uses kanji surface form when useKanji=true', () => {
    const tokens = [
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
    ];
    const knownWords = new Set(['一緒']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, true);
    assert.ok(html.includes('一緒'), 'should display kanji surface form');
    assert.ok(html.includes('jp-known'), 'should be known');
  });

  it('applies definition overrides', () => {
    const tokens = [
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
    ];
    const knownWords = new Set();
    const overrides = { '一緒': 'at the same time' };
    const html = renderJpSentence(tokens, knownWords, wordDict, overrides, false);
    assert.ok(html.includes('at the same time'), 'should use override definition');
    assert.ok(!html.includes('together'), 'should not use default definition');
  });

  it('renders a mixed sentence correctly', () => {
    const tokens = [
      { surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' },
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
      { surface: 'に', baseForm: 'に', pos: '助詞', reading: 'に' },
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
    ];
    const knownWords = new Set(['こんにちは', 'に']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    // こんにちは = known (inline), ！ = punct, 一緒 = unknown (stack), に = known, 遊ぶ = unknown (stack)
    const knownCount = (html.match(/jp-known/g) || []).length;
    const unknownCount = (html.match(/jp-unknown/g) || []).length;
    const punctCount = (html.match(/jp-punct/g) || []).length;
    assert.equal(knownCount, 2, 'should have 2 known words');
    assert.equal(unknownCount, 2, 'should have 2 unknown words');
    assert.equal(punctCount, 1, 'should have 1 punctuation');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/sentence-renderer.test.js
```

Expected: FAIL — `renderJpSentence` is not exported from bootstrap-client.js.

- [ ] **Step 3: Implement renderJpSentence**

Add to `public/js/ui/bootstrap-client.js` (after the existing `renderJpFirst` function, before `addExposure`). Note: `esc()` (line 118) and `_pendingExposures` (line 9) already exist in this file — the new function uses them directly:

```js
/**
 * Punctuation POS values from UniDic that should render as-is.
 */
const PUNCT_POS = new Set(['記号', '補助記号', '空白']);

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

  return tokens.map(token => {
    const { surface, baseForm, pos, reading } = token;

    // Punctuation: render as-is
    if (PUNCT_POS.has(pos) || /^[\p{P}\p{S}\s]+$/u.test(surface)) {
      return `<span class="jp-punct">${esc(surface)}</span>`;
    }

    const isKnown = knownWords.has(baseForm);
    const dictEntry = wordDict.get(baseForm);
    const displayReading = reading || dictEntry?.reading || surface;

    if (isKnown) {
      // Known word: inline, no decoration
      const display = useKanji ? surface : displayReading;
      return `<span class="jp-word jp-known">${esc(display)}</span>`;
    }

    // Unknown word: vertical stack with English
    const enDef = overrides[baseForm]
      || dictEntry?.definitions?.find(d => d.primary)?.en
      || dictEntry?.definitions?.[0]?.en
      || '';

    // Queue exposure for SRS tracking
    if (baseForm && enDef) {
      _pendingExposures.set(baseForm, enDef);
    }

    return `<span class="jp-word jp-unknown">`
      + `<span class="jp-stack-reading">${esc(displayReading)}</span>`
      + `<span class="jp-stack-en">${esc(enDef)}</span>`
      + `</span>`;
  }).join('');
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
node --test tests/unit/sentence-renderer.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Syntax-check the modified file**

```bash
node --check public/js/ui/bootstrap-client.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/bootstrap-client.js tests/unit/sentence-renderer.test.js
git commit -m "feat: add renderJpSentence for tokenized dialogue display"
```

---

### Task 5: CSS Vertical Stacks

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Add CSS classes for sentence rendering**

Add to the end of `public/game.css` (or in a logical section near existing `.bs-word` styles):

```css
/* ── Sentence renderer (dialogue bootstrap) ──────────────────── */
.jp-word { display: inline-block; margin: 0 1px; }
.jp-known { /* no special styling — blends into sentence flow */ }
.jp-unknown {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  border: 1.5px solid var(--accent-blue, #4a9eff);
  border-radius: 6px;
  padding: 2px 6px;
  margin: 0 2px;
  background: rgba(74, 158, 255, 0.08);
}
.jp-stack-reading { font-size: 1em; }
.jp-stack-en { font-size: 0.7em; opacity: 0.8; color: var(--accent-blue, #4a9eff); }
.jp-punct { display: inline; }
```

- [ ] **Step 2: Syntax check**

```bash
# No CSS linter installed, just verify file parses
node -e "require('fs').readFileSync('public/game.css', 'utf-8'); console.log('CSS reads OK')"
```

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat: add CSS for sentence renderer vertical stacks"
```

---

### Task 6: Narration Box Dialogue Integration

**Files:**
- Modify: `public/js/ui/narration-box.js`

The narration box already supports `html: true` mode (line 179, `narration-box.js`). CID/NPC dialogue will be pre-rendered via `renderJpSentence` before being passed to `show()`. No structural change to narration-box is needed for basic rendering — the caller builds the HTML and passes `{ html: true }`.

However, we need a helper function that the game UI code can call to render a dialogue line (tokens + overrides) into HTML and show it via the narration box.

- [ ] **Step 1: Create dialogue display helper**

Add a new file that coordinates rendering dialogue lines through the narration box. This is the bridge between the server's dialogue data and the client's rendering:

```js
// public/js/ui/dialogue-display.js

/**
 * Renders and displays dialogue lines (CID scripts, NPC greetings, etc.)
 * using the sentence renderer and narration box.
 */

import { renderJpSentence, getKnownWords, flushExposures } from './bootstrap-client.js';
import * as narrationBox from './narration-box.js';

let _wordDict = new Map();

/**
 * Set the client-side word dictionary (called once at game init).
 * @param {Object} dictObj - { word: { reading, definitions[] } }
 */
export function setWordDictionary(dictObj) {
  _wordDict = new Map(Object.entries(dictObj));
}

/**
 * Display a sequence of dialogue lines in the narration box.
 * Each line has pre-tokenized data from the server.
 *
 * @param {Array<{text: string, tokens: Array, overrides?: Object}>} lines
 * @param {Object} options
 * @param {string|Object} [options.speaker] - Speaker label for narration box
 * @param {boolean} [options.useKanji] - false for Areas 1-3
 * @returns {Promise<void>} Resolves when all lines dismissed
 */
export async function showDialogueLines(lines, options = {}) {
  const { speaker, useKanji = false } = options;
  const knownWords = getKnownWords();

  for (const line of lines) {
    const html = renderJpSentence(
      line.tokens,
      knownWords,
      _wordDict,
      line.overrides || {},
      useKanji
    );
    await narrationBox.show(html, { speaker, html: true });
  }

  flushExposures();
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/ui/dialogue-display.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/dialogue-display.js
git commit -m "feat: add dialogue display helper for tokenized sentences"
```

---

## Chunk 3: Data + Filtering

### Task 7: Curriculum Data Files

**Files:**
- Create: `data/glue-words.json`
- Create: `data/grammar-words.json`

These are data-only files. The content is defined in the spec (sections 3.7 and 3.8).

- [ ] **Step 1: Create glue-words.json**

Copy the 50 glue words from the spec section 3.7 exactly:

```json
[
  { "word": "私", "reading": "わたし", "en": "I/me", "priority": 1 },
  { "word": "一緒", "reading": "いっしょ", "en": "together", "priority": 1 },
  { "word": "とても", "reading": "とても", "en": "very", "priority": 1 },
  { "word": "今", "reading": "いま", "en": "now", "priority": 1 },
  { "word": "知る", "reading": "しる", "en": "to know", "priority": 1 },
  { "word": "思う", "reading": "おもう", "en": "to think", "priority": 1 },
  { "word": "これ", "reading": "これ", "en": "this", "priority": 1 },
  { "word": "それ", "reading": "それ", "en": "that", "priority": 1 },
  { "word": "まだ", "reading": "まだ", "en": "still/yet", "priority": 1 },
  { "word": "言う", "reading": "いう", "en": "to say", "priority": 1 },
  { "word": "この", "reading": "この", "en": "this (adj)", "priority": 2 },
  { "word": "あの", "reading": "あの", "en": "that (adj)", "priority": 2 },
  { "word": "来る", "reading": "くる", "en": "to come", "priority": 2 },
  { "word": "友達", "reading": "ともだち", "en": "friend", "priority": 2 },
  { "word": "嬉しい", "reading": "うれしい", "en": "happy", "priority": 2 },
  { "word": "今日", "reading": "きょう", "en": "today", "priority": 2 },
  { "word": "少し", "reading": "すこし", "en": "a little", "priority": 2 },
  { "word": "出る", "reading": "でる", "en": "to go out", "priority": 2 },
  { "word": "入る", "reading": "はいる", "en": "to enter", "priority": 2 },
  { "word": "上手", "reading": "じょうず", "en": "skilled", "priority": 2 },
  { "word": "食べる", "reading": "たべる", "en": "to eat", "priority": 3 },
  { "word": "小さい", "reading": "ちいさい", "en": "small", "priority": 3 },
  { "word": "大きい", "reading": "おおきい", "en": "big", "priority": 3 },
  { "word": "新しい", "reading": "あたらしい", "en": "new", "priority": 3 },
  { "word": "人", "reading": "ひと", "en": "person", "priority": 3 },
  { "word": "前", "reading": "まえ", "en": "before/front", "priority": 3 },
  { "word": "後", "reading": "あと", "en": "after/behind", "priority": 3 },
  { "word": "時", "reading": "とき", "en": "when/time", "priority": 3 },
  { "word": "話", "reading": "はなし", "en": "story/talk", "priority": 3 },
  { "word": "方", "reading": "ほう", "en": "direction/way", "priority": 3 },
  { "word": "気", "reading": "き", "en": "spirit/feeling", "priority": 4 },
  { "word": "手", "reading": "て", "en": "hand", "priority": 4 },
  { "word": "目", "reading": "め", "en": "eye", "priority": 4 },
  { "word": "声", "reading": "こえ", "en": "voice", "priority": 4 },
  { "word": "心", "reading": "こころ", "en": "heart/mind", "priority": 4 },
  { "word": "力", "reading": "ちから", "en": "power/strength", "priority": 4 },
  { "word": "道", "reading": "みち", "en": "road/path", "priority": 4 },
  { "word": "明日", "reading": "あした", "en": "tomorrow", "priority": 4 },
  { "word": "分かる", "reading": "わかる", "en": "to understand", "priority": 4 },
  { "word": "教える", "reading": "おしえる", "en": "to teach", "priority": 4 },
  { "word": "持つ", "reading": "もつ", "en": "to hold/have", "priority": 5 },
  { "word": "使う", "reading": "つかう", "en": "to use", "priority": 5 },
  { "word": "作る", "reading": "つくる", "en": "to make", "priority": 5 },
  { "word": "出来る", "reading": "できる", "en": "to be able to", "priority": 5 },
  { "word": "世界", "reading": "せかい", "en": "world", "priority": 5 },
  { "word": "場所", "reading": "ばしょ", "en": "place", "priority": 5 },
  { "word": "初めて", "reading": "はじめて", "en": "first time", "priority": 5 },
  { "word": "元気", "reading": "げんき", "en": "healthy/energetic", "priority": 5 },
  { "word": "名前", "reading": "なまえ", "en": "name", "priority": 5 },
  { "word": "色", "reading": "いろ", "en": "color", "priority": 5 }
]
```

Write to `data/glue-words.json`.

- [ ] **Step 2: Create grammar-words.json**

Content from spec section 3.8. Include all grammar words with their stage:

```json
[
  { "word": "は", "reading": "は", "en": "topic marker", "stage": "area1-early" },
  { "word": "が", "reading": "が", "en": "subject marker", "stage": "area1-early" },
  { "word": "を", "reading": "を", "en": "object marker", "stage": "area1-early" },
  { "word": "に", "reading": "に", "en": "to/at/in", "stage": "area1-early" },
  { "word": "です", "reading": "です", "en": "is/am/are", "stage": "area1-early" },
  { "word": "こんにちは", "reading": "こんにちは", "en": "hello", "stage": "area1-early" },
  { "word": "おはよう", "reading": "おはよう", "en": "good morning", "stage": "area1-early" },
  { "word": "ありがとう", "reading": "ありがとう", "en": "thank you", "stage": "area1-early" },
  { "word": "はい", "reading": "はい", "en": "yes", "stage": "area1-early" },
  { "word": "いいえ", "reading": "いいえ", "en": "no", "stage": "area1-early" },
  { "word": "ね", "reading": "ね", "en": "right? (confirmation)", "stage": "area1-early" },
  { "word": "よ", "reading": "よ", "en": "(emphasis)", "stage": "area1-early" },
  { "word": "か", "reading": "か", "en": "(question)", "stage": "area1-early" },
  { "word": "で", "reading": "で", "en": "at/by (location/means)", "stage": "area1-early" },
  { "word": "へ", "reading": "へ", "en": "toward", "stage": "area1-early" },
  { "word": "と", "reading": "と", "en": "and/with", "stage": "area1-early" },
  { "word": "も", "reading": "も", "en": "also/too", "stage": "area1-early" },
  { "word": "の", "reading": "の", "en": "of/'s (possessive)", "stage": "area1-early" },
  { "word": "なに", "reading": "なに", "en": "what", "stage": "area1-early" },
  { "word": "どこ", "reading": "どこ", "en": "where", "stage": "area1-early" },
  { "word": "ます", "reading": "ます", "en": "(polite verb ending)", "stage": "area1-early" },
  { "word": "ください", "reading": "ください", "en": "please", "stage": "area1-early" },
  { "word": "すみません", "reading": "すみません", "en": "excuse me/sorry", "stage": "area1-early" },
  { "word": "うん", "reading": "うん", "en": "yeah (casual yes)", "stage": "area1-early" },
  { "word": "から", "reading": "から", "en": "from/because", "stage": "area1-mid" },
  { "word": "まで", "reading": "まで", "en": "until/up to", "stage": "area1-mid" },
  { "word": "けど", "reading": "けど", "en": "but/however", "stage": "area1-mid" },
  { "word": "でも", "reading": "でも", "en": "but/however", "stage": "area1-mid" },
  { "word": "だけ", "reading": "だけ", "en": "only/just", "stage": "area1-mid" },
  { "word": "ない", "reading": "ない", "en": "not (negation)", "stage": "area1-mid" },
  { "word": "ある", "reading": "ある", "en": "to exist (things)", "stage": "area1-mid" },
  { "word": "いる", "reading": "いる", "en": "to exist (living)", "stage": "area1-mid" },
  { "word": "する", "reading": "する", "en": "to do", "stage": "area1-mid" },
  { "word": "なる", "reading": "なる", "en": "to become", "stage": "area1-mid" },
  { "word": "ですか", "reading": "ですか", "en": "is it? (polite question)", "stage": "area1-mid" },
  { "word": "ますか", "reading": "ますか", "en": "(polite verb question)", "stage": "area1-mid" },
  { "word": "でしょう", "reading": "でしょう", "en": "probably/right?", "stage": "area1-mid" },
  { "word": "こと", "reading": "こと", "en": "thing/fact (abstract)", "stage": "area1-mid" },
  { "word": "もの", "reading": "もの", "en": "thing (physical)", "stage": "area1-mid" },
  { "word": "よう", "reading": "よう", "en": "appearance/way", "stage": "area1-mid" }
]
```

Write to `data/grammar-words.json`.

- [ ] **Step 3: Validate JSON syntax**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/glue-words.json')); console.log('glue-words OK')"
node -e "JSON.parse(require('fs').readFileSync('data/grammar-words.json')); console.log('grammar-words OK')"
```

Expected: both print OK.

- [ ] **Step 4: Commit**

```bash
git add data/glue-words.json data/grammar-words.json
git commit -m "feat: add glue word curriculum and grammar word introduction schedule"
```

---

### Task 8: Dialogue Content Authoring

**Files:**
- Create: `data/dialogue/cid-scripts.json`
- Create: `data/dialogue/npc-lines.json`
- Create: `data/dialogue/barks.json`

This task is content authoring — writing ~200 lines of Japanese dialogue. The content must follow these constraints from the spec:
- N5 grammar only (light N4 where unavoidable)
- All words must exist in the word dictionary
- Barks: 1-3 words maximum
- Lines must be tokenizable by lindera

**Important:** This task should be done AFTER Tasks 1-3 (tokenizer + dictionary available) so lines can be validated. Write the JSON structure now with a representative subset. The full content will be validated in Task 9-10.

- [ ] **Step 1: Create data/dialogue/ directory and cid-scripts.json**

```bash
mkdir -p data/dialogue
```

Write `data/dialogue/cid-scripts.json` with ~15-20 scripts. Each script has an `id` and `lines` array. The text is plain Japanese — pre-tokenization happens in Task 9.

```json
[
  {
    "id": "cid-welcome-0",
    "lines": ["こんにちは！"]
  },
  {
    "id": "cid-welcome-1",
    "lines": ["こんにちは！", "いっしょに いく？"]
  },
  {
    "id": "cid-welcome-2",
    "lines": ["おはよう！", "たのしい ところだよ！"]
  },
  {
    "id": "cid-welcome-3",
    "lines": ["こんにちは！", "きょうは とても いい ひだね！"]
  },
  {
    "id": "cid-welcome-4",
    "lines": ["おはよう！きょうは たのしい ところを しってるよ！", "わたしと いっしょに いく？"]
  },
  {
    "id": "cid-welcome-5",
    "lines": ["こんにちは！わたしと いっしょに いく？", "すごい ものを みせたい！"]
  },
  {
    "id": "cid-welcome-6",
    "lines": ["おはよう！", "ここは ひろばだよ！たのしいよ！"]
  },
  {
    "id": "cid-welcome-7",
    "lines": ["こんにちは！げんきですか？", "きょうも がんばろう！"]
  },
  {
    "id": "cid-welcome-8",
    "lines": ["おはよう！きょうも いっしょに あそぶ？", "わたしは ここが すき！"]
  },
  {
    "id": "cid-welcome-9",
    "lines": ["こんにちは！", "わたしは とても うれしい！いっしょに いこう！"]
  },
  {
    "id": "cid-welcome-10",
    "lines": ["おはよう！", "きょうは あたらしい ともだちに あえるかな？"]
  },
  {
    "id": "cid-welcome-11",
    "lines": ["こんにちは！いま どこに いく？", "わたしも いきたい！"]
  },
  {
    "id": "cid-welcome-12",
    "lines": ["おはよう！きょうは すこし さむいね。", "でも たのしいよ！いっしょに いこう！"]
  },
  {
    "id": "cid-welcome-13",
    "lines": ["こんにちは！", "まえに ここに きたことが ある？たのしい ところだよ！"]
  },
  {
    "id": "cid-welcome-14",
    "lines": ["おはよう！きょうは とても たのしい ところに いく！", "わたしは ここが すき。いっしょに いくと たのしいと おもう！"]
  },
  {
    "id": "cid-welcome-15",
    "lines": ["こんにちは！", "この ばしょ、しってる？わたしが まえに きた！", "きれいな はなが あるよ！"]
  }
]
```

- [ ] **Step 2: Create npc-lines.json**

Write `data/dialogue/npc-lines.json` — 4 NPCs (kodomo, otona, otokonoko, onnanoko), 3 slots each (shopGreeting, fightStart, defeatLine), 5-8 lines per slot:

```json
{
  "kodomo": {
    "shopGreeting": [
      "こんにちは！",
      "こんにちは！あそぶ？",
      "こんにちは！わたしも あそぶのが すき！",
      "いっしょに あそぶ？たのしいよ！",
      "おはよう！きょうも あそぶ？",
      "すごい！また きた！"
    ],
    "fightStart": [
      "がんばれ！",
      "まけないよ！",
      "いくよ！たのしい！",
      "わたしは つよいよ！"
    ],
    "defeatLine": [
      "つよい！",
      "すごい！",
      "まけた！でも たのしい！",
      "また あそぼう！"
    ]
  },
  "otona": {
    "shopGreeting": [
      "こんにちは。",
      "こんにちは。じゅんびは いいですか。",
      "ここは ひろばです。",
      "きょうも がんばりましょう。",
      "なにか ほしいものは ありますか。",
      "ゆっくり みてください。"
    ],
    "fightStart": [
      "はじめましょう。",
      "じゅんびは いいですか。",
      "しっかり がんばりましょう。"
    ],
    "defeatLine": [
      "つよいですね。",
      "いい しあいでした。",
      "すばらしい。"
    ]
  },
  "otokonoko": {
    "shopGreeting": [
      "おはよう！",
      "おはよう！はやい！",
      "きょうも はやいね！",
      "もっと つよく なりたい！",
      "おはよう！いっしょに がんばろう！",
      "きょうは つよいやつに あいたい！"
    ],
    "fightStart": [
      "いくぞ！",
      "まけないぞ！",
      "はやく はじめよう！",
      "おれは つよいぞ！"
    ],
    "defeatLine": [
      "はやい！",
      "つよい！",
      "くやしい！でも また やる！",
      "つぎは まけない！"
    ]
  },
  "onnanoko": {
    "shopGreeting": [
      "あ…こんにちは。",
      "こんにちは…。",
      "あ…こんにちは。ここの はな、きれいですね。",
      "きょうは いい てんきですね。",
      "すこし みていきますか。",
      "あ…また きてくれた。うれしい。"
    ],
    "fightStart": [
      "がんばります…。",
      "あ…はじめます。",
      "すこし こわいけど…がんばる。"
    ],
    "defeatLine": [
      "すごい…。",
      "つよいですね…。",
      "あ…まけました。でも たのしかった。"
    ]
  }
}
```

- [ ] **Step 3: Create barks.json**

Write `data/dialogue/barks.json` — migrate existing `creature-speech.json` entries + expand to ~50-100 barks. Each bark is 1-3 words. All plain Japanese:

```json
{
  "onHit": [
    "いたい！",
    "つよい！",
    "いやだ！",
    "うわ！",
    "くっ！",
    "ああ！",
    "いたた！",
    "やめて！",
    "つらい！",
    "ひどい！"
  ],
  "onVictory": [
    "すごい！",
    "かった！",
    "やった！",
    "よかった！",
    "つよい！",
    "うれしい！",
    "やったね！",
    "すばらしい！",
    "かちだ！",
    "いえーい！"
  ],
  "onExplore": [
    "たのしい！",
    "いくよ！",
    "みて！",
    "きれい！",
    "すごい！",
    "ここ すき！",
    "なにか ある！",
    "いこう！",
    "あたらしい！",
    "おもしろい！"
  ],
  "onHeal": [
    "ありがとう！",
    "たすかる！",
    "だいじょうぶ！",
    "げんき！",
    "うれしい！",
    "よかった！"
  ],
  "onKO": [
    "ごめん…",
    "むり…",
    "まけた…",
    "つかれた…",
    "だめだ…",
    "くやしい…"
  ],
  "onStatusEffect": [
    "しまった！",
    "まって！",
    "やめて！",
    "うごけない！",
    "なにこれ！",
    "いやだ！"
  ],
  "onLowHP": [
    "あぶない！",
    "たすけて！",
    "こわい！",
    "やばい！",
    "だめだ！",
    "ピンチ！"
  ],
  "onAttack": [
    "がんばれ！",
    "まけないぞ！",
    "いくぞ！",
    "やるぞ！",
    "それ！",
    "いけ！",
    "とりゃ！",
    "えいっ！",
    "くらえ！"
  ]
}
```

- [ ] **Step 4: Validate JSON syntax**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/dialogue/cid-scripts.json')); console.log('cid-scripts OK')"
node -e "JSON.parse(require('fs').readFileSync('data/dialogue/npc-lines.json')); console.log('npc-lines OK')"
node -e "JSON.parse(require('fs').readFileSync('data/dialogue/barks.json')); console.log('barks OK')"
```

Expected: all OK.

- [ ] **Step 5: Commit**

```bash
git add data/dialogue/
git commit -m "feat: add Area 1 dialogue content (CID scripts, NPC lines, barks)"
```

---

### Task 9: Pre-tokenize Script

**Files:**
- Create: `scripts/pre-tokenize-dialogue.js`

This script reads all `data/dialogue/*.json` files, runs each line through `tokenize()`, and writes back with `_tokens` and `_contentWords` inline.

- [ ] **Step 1: Write the script**

```js
// scripts/pre-tokenize-dialogue.js

/**
 * Pre-tokenizes all dialogue JSON files.
 * Adds _tokens and _contentWords to each dialogue line.
 *
 * Usage: node scripts/pre-tokenize-dialogue.js
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tokenize } from '../src/tokenizer.js';

const DIALOGUE_DIR = join(process.cwd(), 'data', 'dialogue');
const PUNCT_POS = new Set(['記号', '補助記号', '空白']);

async function pretokenizeLine(text) {
  const tokens = await tokenize(text);
  const contentWords = tokens
    .filter(t => !PUNCT_POS.has(t.pos) && !/^[\p{P}\p{S}\s]+$/u.test(t.surface))
    .map(t => t.baseForm);
  return { _tokens: tokens, _contentWords: contentWords };
}

async function processFile(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  let lineCount = 0;

  if (Array.isArray(raw)) {
    // CID scripts format: [{ id, lines: [string] }]
    for (const script of raw) {
      if (!script.lines) continue;
      const newLines = [];
      for (const line of script.lines) {
        const text = typeof line === 'string' ? line : line.text;
        const { _tokens, _contentWords } = await pretokenizeLine(text);
        newLines.push({
          text,
          ...(typeof line === 'object' && line.overrides ? { overrides: line.overrides } : {}),
          _tokens,
          _contentWords,
        });
        lineCount++;
      }
      script.lines = newLines;
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    // NPC lines or barks format
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        // Barks: { trigger: [string] }
        const newLines = [];
        for (const line of value) {
          const text = typeof line === 'string' ? line : line.text;
          const { _tokens, _contentWords } = await pretokenizeLine(text);
          newLines.push({ text, _tokens, _contentWords });
          lineCount++;
        }
        raw[key] = newLines;
      } else if (typeof value === 'object') {
        // NPC: { npcId: { slot: [string] } }
        for (const [slot, lines] of Object.entries(value)) {
          if (!Array.isArray(lines)) continue;
          const newLines = [];
          for (const line of lines) {
            const text = typeof line === 'string' ? line : line.text;
            const { _tokens, _contentWords } = await pretokenizeLine(text);
            newLines.push({ text, _tokens, _contentWords });
            lineCount++;
          }
          value[slot] = newLines;
        }
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(raw, null, 2));
  return lineCount;
}

async function main() {
  const files = readdirSync(DIALOGUE_DIR).filter(f => f.endsWith('.json'));
  let totalLines = 0;

  for (const file of files) {
    const filePath = join(DIALOGUE_DIR, file);
    console.log(`Processing ${file}...`);
    const count = await processFile(filePath);
    totalLines += count;
    console.log(`  → ${count} lines tokenized`);
  }

  console.log(`\nDone. ${totalLines} lines pre-tokenized across ${files.length} files.`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the script**

```bash
node scripts/pre-tokenize-dialogue.js
```

Expected: each file processed, lines tokenized, files overwritten with `_tokens` and `_contentWords`.

- [ ] **Step 3: Verify output**

```bash
node -e "
  const d = JSON.parse(require('fs').readFileSync('data/dialogue/cid-scripts.json'));
  const firstLine = d[0].lines[0];
  console.log('First CID line:', JSON.stringify(firstLine, null, 2));
  console.log('Has _tokens:', Array.isArray(firstLine._tokens));
  console.log('Has _contentWords:', Array.isArray(firstLine._contentWords));
"
```

Expected: first line should have `text`, `_tokens` array, and `_contentWords` array.

- [ ] **Step 4: Commit**

```bash
git add scripts/pre-tokenize-dialogue.js data/dialogue/
git commit -m "feat: add pre-tokenize script and tokenize all dialogue"
```

---

### Task 10: Validate Dialogue Script

**Files:**
- Create: `scripts/validate-dialogue.js`

- [ ] **Step 1: Write the validation script**

```js
// scripts/validate-dialogue.js

/**
 * Validates dialogue files against the word dictionary and authoring constraints.
 *
 * Checks:
 * - All _contentWords baseForm entries exist in data/dictionary.json
 * - Barks have ≤ 3 content words
 * - Definition overrides reference real dictionary entries
 *
 * Usage: node scripts/validate-dialogue.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadWordDictionary } from '../src/game/word-dictionary.js';

const DATA_DIR = join(process.cwd(), 'data');
const DIALOGUE_DIR = join(DATA_DIR, 'dialogue');

const dict = loadWordDictionary(DATA_DIR);
let errors = 0;
let warnings = 0;

function checkLine(line, context) {
  if (!line._contentWords) {
    console.warn(`  WARN: ${context} — no _contentWords (run pre-tokenize first)`);
    warnings++;
    return;
  }

  for (const word of line._contentWords) {
    if (!dict.has(word)) {
      console.error(`  ERROR: ${context} — word "${word}" not in dictionary`);
      errors++;
    }
  }

  if (line.overrides) {
    for (const word of Object.keys(line.overrides)) {
      if (!dict.has(word)) {
        console.error(`  ERROR: ${context} — override word "${word}" not in dictionary`);
        errors++;
      }
    }
  }
}

function validateBarks(data) {
  for (const [trigger, lines] of Object.entries(data)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ctx = `barks.${trigger}[${i}]`;
      checkLine(line, ctx);
      if (line._contentWords && line._contentWords.length > 3) {
        console.error(`  ERROR: ${ctx} — bark has ${line._contentWords.length} content words (max 3)`);
        errors++;
      }
    }
  }
}

function validateCidScripts(data) {
  for (const script of data) {
    for (let i = 0; i < script.lines.length; i++) {
      checkLine(script.lines[i], `cid:${script.id}[${i}]`);
    }
  }
}

function validateNpcLines(data) {
  for (const [npcId, slots] of Object.entries(data)) {
    for (const [slot, lines] of Object.entries(slots)) {
      for (let i = 0; i < lines.length; i++) {
        checkLine(lines[i], `npc:${npcId}.${slot}[${i}]`);
      }
    }
  }
}

console.log(`Dictionary loaded: ${dict.size} entries\n`);

// Validate each dialogue file
const barksPath = join(DIALOGUE_DIR, 'barks.json');
console.log('Validating barks.json...');
validateBarks(JSON.parse(readFileSync(barksPath, 'utf-8')));

const cidPath = join(DIALOGUE_DIR, 'cid-scripts.json');
console.log('Validating cid-scripts.json...');
validateCidScripts(JSON.parse(readFileSync(cidPath, 'utf-8')));

const npcPath = join(DIALOGUE_DIR, 'npc-lines.json');
console.log('Validating npc-lines.json...');
validateNpcLines(JSON.parse(readFileSync(npcPath, 'utf-8')));

console.log(`\n${errors} errors, ${warnings} warnings`);
if (errors > 0) {
  console.error('\nValidation FAILED — fix missing dictionary entries before proceeding.');
  process.exit(1);
}
console.log('Validation PASSED.');
```

- [ ] **Step 2: Run validation**

```bash
node scripts/validate-dialogue.js
```

Expected: should report any words missing from the dictionary. Fix missing entries by either:
1. Adding them to `glue-words.json` or `grammar-words.json` (if they're curriculum words)
2. Re-running `scripts/build-dictionary.js` with updated filters
3. Adjusting dialogue to use words that exist

- [ ] **Step 3: Iterate until validation passes**

Fix any missing words and re-run until output shows: `Validation PASSED.`

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-dialogue.js
git commit -m "feat: add dialogue validation script"
```

---

### Task 11: Dialogue Filter

**Files:**
- Create: `src/game/dialogue-filter.js`
- Test: `tests/unit/dialogue-filter.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/dialogue-filter.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLineEligible,
  filterEligibleScripts,
  selectNpcLine,
  selectBark,
} from '../../src/game/dialogue-filter.js';

describe('dialogue-filter', () => {
  // Helper: make a pre-tokenized line
  const line = (text, contentWords) => ({ text, _contentWords: contentWords });

  describe('isLineEligible', () => {
    it('passes a line with 0 unknown words', () => {
      const result = isLineEligible(line('すごい！', ['すごい']), new Set(['すごい']));
      assert.equal(result, true);
    });

    it('passes a line with exactly 1 unknown word (i+1)', () => {
      const result = isLineEligible(
        line('こんにちは！いっしょに いく？', ['こんにちは', '一緒', '行く']),
        new Set(['こんにちは', '行く'])
      );
      assert.equal(result, true);
    });

    it('rejects a line with 2+ unknown words', () => {
      const result = isLineEligible(
        line('こんにちは！いっしょに いく？', ['こんにちは', '一緒', '行く']),
        new Set()
      );
      assert.equal(result, false);
    });

    it('passes an empty content words line', () => {
      const result = isLineEligible(line('！', []), new Set());
      assert.equal(result, true);
    });
  });

  describe('filterEligibleScripts', () => {
    const scripts = [
      { id: 's0', lines: [line('こんにちは！', ['こんにちは'])] },
      { id: 's1', lines: [
        line('こんにちは！', ['こんにちは']),
        line('いっしょに いく？', ['一緒', '行く']),
      ]},
      { id: 's2', lines: [
        line('おはよう！きょうは いい ひだね！', ['おはよう', '今日', '良い', '日']),
      ]},
    ];

    it('returns only scripts where ALL lines are eligible', () => {
      const known = new Set(['こんにちは', '行く']);
      // s0: 0 unknowns — eligible
      // s1: line 2 has 1 unknown (一緒) — eligible (i+1)
      // s2: line 1 has 3 unknowns — not eligible
      const eligible = filterEligibleScripts(scripts, known);
      const ids = eligible.map(s => s.id);
      assert.ok(ids.includes('s0'));
      assert.ok(ids.includes('s1'));
      assert.ok(!ids.includes('s2'));
    });

    it('at 0 known words, only single-word scripts are eligible', () => {
      const eligible = filterEligibleScripts(scripts, new Set());
      // s0: こんにちは is 1 unknown — passes i+1
      // s1: line 2 has 2 unknowns — fails
      // s2: 4 unknowns — fails
      const ids = eligible.map(s => s.id);
      assert.ok(ids.includes('s0'));
      assert.ok(!ids.includes('s1'));
    });
  });

  describe('selectNpcLine', () => {
    const lines = [
      line('こんにちは！', ['こんにちは']),
      line('いっしょに あそぶ？', ['一緒', '遊ぶ']),
      line('また きた！', ['また', '来る']),
    ];

    it('returns an eligible line', () => {
      const known = new Set(['こんにちは', '遊ぶ']);
      const selected = selectNpcLine(lines, known);
      assert.ok(selected);
      assert.ok(typeof selected.text === 'string');
    });

    it('returns null when no lines are eligible', () => {
      const selected = selectNpcLine(lines, new Set(), { lastSeenText: null });
      // At 0 known: only line 0 (1 unknown) is eligible
      // Actually line 0 has 1 unknown = eligible at i+1
      // But lines 1 and 2 have 2 unknowns each = ineligible
      assert.ok(selected !== null);
      assert.equal(selected.text, 'こんにちは！');
    });
  });

  describe('selectBark', () => {
    const barkPool = {
      onHit: [
        line('いたい！', ['痛い']),
        line('つよい！', ['強い']),
        line('いやだ！', ['嫌']),
      ],
    };

    it('returns a bark from the specified trigger', () => {
      const known = new Set(['痛い', '強い']);
      const bark = selectBark(barkPool, 'onHit', known);
      assert.ok(bark);
      assert.ok(typeof bark.text === 'string');
    });

    it('returns null for unknown trigger', () => {
      const bark = selectBark(barkPool, 'nonexistent', new Set());
      assert.equal(bark, null);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/unit/dialogue-filter.test.js
```

Expected: FAIL — `src/game/dialogue-filter.js` does not exist.

- [ ] **Step 3: Implement the dialogue filter**

```js
// src/game/dialogue-filter.js

/**
 * Word-gated dialogue filtering and selection.
 *
 * Implements i+1 rule: each sentence may contain at most 1 unknown word.
 * Lines with 2+ unknown words are filtered out.
 */

/**
 * Check if a single dialogue line is eligible for the player.
 * A line is eligible if it has at most 1 unknown content word.
 * @param {{_contentWords: string[]}} line - Pre-tokenized line
 * @param {Set<string>} knownWords - Player's known baseForm set
 * @returns {boolean}
 */
export function isLineEligible(line, knownWords) {
  const unknowns = (line._contentWords || []).filter(w => !knownWords.has(w));
  return unknowns.length <= 1;
}

/**
 * Count how many teaching words (unknowns) a line has.
 */
function teachingWordCount(line, knownWords) {
  return (line._contentWords || []).filter(w => !knownWords.has(w)).length;
}

/**
 * Filter CID scripts to those where ALL lines pass i+1.
 * @param {Array<{id: string, lines: Array}>} scripts
 * @param {Set<string>} knownWords
 * @returns {Array<{id: string, lines: Array}>}
 */
export function filterEligibleScripts(scripts, knownWords) {
  return scripts.filter(script =>
    script.lines.every(line => isLineEligible(line, knownWords))
  );
}

/**
 * Rank and select the best CID script.
 * Priority: most teaching words > least recently seen > first in list.
 * @param {Array} eligible - Filtered eligible scripts
 * @param {Set<string>} knownWords
 * @param {string[]} seenScriptIds - Script IDs the player has seen (most recent last)
 * @returns {Object|null} Selected script, or null if none eligible
 */
export function selectCidScript(eligible, knownWords, seenScriptIds = []) {
  if (eligible.length === 0) return null;

  const seenSet = new Set(seenScriptIds);

  // Score each script: teaching words count (higher = better)
  const scored = eligible.map(script => {
    const totalTeaching = script.lines.reduce(
      (sum, line) => sum + teachingWordCount(line, knownWords), 0
    );
    const wasSeen = seenSet.has(script.id);
    // Seen index: lower = seen longer ago (better for replay)
    const seenIndex = seenScriptIds.indexOf(script.id);
    return { script, totalTeaching, wasSeen, seenIndex };
  });

  // Sort: unseen first, then by teaching words (desc), then by seen order (asc = oldest first)
  scored.sort((a, b) => {
    if (a.wasSeen !== b.wasSeen) return a.wasSeen ? 1 : -1;
    if (a.totalTeaching !== b.totalTeaching) return b.totalTeaching - a.totalTeaching;
    if (a.wasSeen && b.wasSeen) return a.seenIndex - b.seenIndex;
    return 0;
  });

  return scored[0].script;
}

/**
 * Select an NPC dialogue line from a pool.
 * @param {Array<{text: string, _contentWords: string[]}>} lines
 * @param {Set<string>} knownWords
 * @param {Object} [options]
 * @param {string} [options.lastSeenText] - Text of last shown line (avoid repeat)
 * @param {string[]} [options.curriculumWords] - Next glue words to teach (prefer these)
 * @returns {Object|null} Selected line, or null
 */
export function selectNpcLine(lines, knownWords, options = {}) {
  const { lastSeenText, curriculumWords = [] } = options;
  const eligible = lines.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;

  // Prefer lines that teach a curriculum glue word
  const curriculumSet = new Set(curriculumWords);
  const teaching = eligible.filter(line =>
    (line._contentWords || []).some(w => !knownWords.has(w) && curriculumSet.has(w))
  );

  const pool = teaching.length > 0 ? teaching : eligible;

  // Avoid repeating last line
  const nonRepeat = pool.filter(l => l.text !== lastSeenText);
  const finalPool = nonRepeat.length > 0 ? nonRepeat : pool;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/**
 * Select a bark from the pool for a trigger category.
 * 80% reinforcement (all known), 20% teaching (1 unknown).
 * @param {Object} barkPool - { triggerType: [line] }
 * @param {string} trigger - e.g. 'onHit'
 * @param {Set<string>} knownWords
 * @param {Object} [options]
 * @param {Set<string>} [options.usedThisCombat] - Texts already used (avoid repeats)
 * @returns {Object|null}
 */
export function selectBark(barkPool, trigger, knownWords, options = {}) {
  const { usedThisCombat = new Set() } = options;
  const pool = barkPool[trigger];
  if (!pool || pool.length === 0) return null;

  const eligible = pool.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;

  const reinforcement = eligible.filter(line =>
    (line._contentWords || []).every(w => knownWords.has(w))
  );
  const teachable = eligible.filter(line =>
    (line._contentWords || []).some(w => !knownWords.has(w))
  );

  // 80/20 roll
  const useTeaching = teachable.length > 0 && Math.random() < 0.2;
  const selectedPool = useTeaching ? teachable : (reinforcement.length > 0 ? reinforcement : eligible);

  // Avoid repeats within same combat
  const nonRepeat = selectedPool.filter(l => !usedThisCombat.has(l.text));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
node --test tests/unit/dialogue-filter.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/dialogue-filter.js tests/unit/dialogue-filter.test.js
git commit -m "feat: add dialogue filter with i+1 word-gating and selection logic"
```

---

## Chunk 4: Integration

### Task 12: CID Run-Start Hook

**Files:**
- Modify: `src/routes/game/run.js` (start-run endpoint, line ~109)
- Modify: `src/game/loop.js` (GameManager, add seenCidScripts tracking)

- [ ] **Step 1: Add CID script loading to server startup**

The dialogue pools need to be loaded at server startup. Create a dialogue loader that the server calls during init.

Add to an appropriate server initialization file (or `src/game/dialogue-loader.js`):

```js
// src/game/dialogue-loader.js

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let cidScripts = [];
let npcLines = {};
let barkPool = {};

export function loadDialoguePools(dataDir) {
  const dialogueDir = join(dataDir, 'dialogue');

  const cidPath = join(dialogueDir, 'cid-scripts.json');
  if (existsSync(cidPath)) {
    cidScripts = JSON.parse(readFileSync(cidPath, 'utf-8'));
    console.log(`[Dialogue] Loaded ${cidScripts.length} CID scripts`);
  }

  const npcPath = join(dialogueDir, 'npc-lines.json');
  if (existsSync(npcPath)) {
    npcLines = JSON.parse(readFileSync(npcPath, 'utf-8'));
    console.log(`[Dialogue] Loaded NPC lines for ${Object.keys(npcLines).length} NPCs`);
  }

  const barksPath = join(dialogueDir, 'barks.json');
  if (existsSync(barksPath)) {
    barkPool = JSON.parse(readFileSync(barksPath, 'utf-8'));
    console.log(`[Dialogue] Loaded bark pool with ${Object.keys(barkPool).length} triggers`);
  }
}

export function getCidScripts() { return cidScripts; }
export function getNpcLines() { return npcLines; }
export function getBarkPool() { return barkPool; }
```

- [ ] **Step 2: Call loadDialoguePools at server startup**

In `server.js` (find where other data is loaded at startup), add:

```js
import { loadDialoguePools } from './src/game/dialogue-loader.js';

// During server initialization, after other data loads:
loadDialoguePools(join(process.cwd(), 'data'));
```

- [ ] **Step 3: Modify start-run endpoint to include CID script**

In `src/routes/game/run.js`, after `gameManager.startRun()` succeeds (~line 124), add CID script selection:

```js
import { getCidScripts } from '../../game/dialogue-loader.js';
import { filterEligibleScripts, selectCidScript } from '../../game/dialogue-filter.js';
import { loadWordKnowledge, createWordKnowledge } from '../../game/bootstrap/word-knowledge.js';

// Inside the start-run handler, after gameManager.startRun():
// Select CID dialogue script
let cidScript = null;
try {
  const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
  const knownWords = new Set(Object.keys(wk.known));
  const seenScripts = gameManager.getMeta()?.seenCidScripts || [];
  const eligible = filterEligibleScripts(getCidScripts(), knownWords);
  const selected = selectCidScript(eligible, knownWords, seenScripts);
  if (selected) {
    cidScript = {
      scriptId: selected.id,
      lines: selected.lines,
    };
    // Track seen script in meta
    const meta = gameManager.getMeta();
    if (!meta.seenCidScripts) meta.seenCidScripts = [];
    meta.seenCidScripts.push(selected.id);
  }
} catch (e) {
  console.warn('[CID] Script selection failed:', e.message);
}
```

Add `cidScript` and `useKanji` to the response:

```js
res.json({
  state: req.getEnrichedGameState(),
  narration,
  cidScript,
  useKanji: false, // Areas 1-3
});
```

- [ ] **Step 4: Add seenCidScripts to meta state**

In `src/game/state.js`, find `createMetaProgression()` (the meta state factory) and add `seenCidScripts: []` to the returned object.

- [ ] **Step 5: Syntax check modified files**

```bash
node --check src/game/dialogue-loader.js && echo "OK"
node --check src/routes/game/run.js && echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add src/game/dialogue-loader.js src/routes/game/run.js src/game/state.js
# Also add server.js if modified
git commit -m "feat: add CID run-start dialogue selection to start-run endpoint"
```

---

### Task 13: NPC Word-Gated Dialogue

**Files:**
- Modify: `src/routes/game/combat.js` (NPC encounter/dialogue endpoints)

- [ ] **Step 1: Modify NPC encounter to return word-gated greeting**

In `src/routes/game/combat.js`, find the `POST /api/game/start-creature-encounter` handler (~line 56) or the NPC dialogue start endpoint. When an NPC encounter is detected, add word-gated greeting selection:

```js
import { getNpcLines } from '../../game/dialogue-loader.js';
import { selectNpcLine } from '../../game/dialogue-filter.js';
import { loadWordKnowledge, createWordKnowledge } from '../../game/bootstrap/word-knowledge.js';

// When returning NPC data in the encounter response:
let npcDialogueBootstrap = null;
if (npcData && getNpcLines()[npcData.id]) {
  try {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    const knownWords = new Set(Object.keys(wk.known));
    const npcPool = getNpcLines()[npcData.id];

    const greeting = selectNpcLine(npcPool.shopGreeting || [], knownWords);
    const fightStart = selectNpcLine(npcPool.fightStart || [], knownWords);
    const defeatLine = selectNpcLine(npcPool.defeatLine || [], knownWords);

    npcDialogueBootstrap = {
      greeting: greeting || null,
      fightStart: fightStart || null,
      defeatLine: defeatLine || null,
      useKanji: false,
    };
  } catch (e) {
    console.warn('[NPC] Bootstrap dialogue selection failed:', e.message);
  }
}
```

Add `npcDialogueBootstrap` to the encounter response.

- [ ] **Step 2: Syntax check**

```bash
node --check src/routes/game/combat.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "feat: add word-gated NPC dialogue to encounter endpoint"
```

---

### Task 14: Bark Pool Integration

**Files:**
- Modify: `public/js/ui/speech-bubble.js`

The bark pool moves from the old `{jp, reading, en}` format to the new pre-tokenized format. Barks are filtered client-side for latency.

- [ ] **Step 1: Update speech-bubble.js to use new bark format**

The new barks come from `window.gameState.barkPool` (pre-tokenized format) instead of `window.gameState.creatureSpeech`. The client needs the known words set and word dictionary for rendering.

```js
// public/js/ui/speech-bubble.js — updated

import { renderJpFirst, renderJpSentence, getKnownWords, addExposure, flushExposures } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

const TRIGGER_CHANCE = 0.25;
const DISPLAY_MS = 2500;
const FADE_MS = 300;

let _activeBubble = null;
let _randomFn = Math.random;
let _barkPool = null;
let _wordDict = null;
let _usedThisCombat = new Set();

function getBarkPool() {
  if (_barkPool) return _barkPool;
  _barkPool = window.gameState?.barkPool || null;
  return _barkPool;
}

function getWordDict() {
  if (_wordDict) return _wordDict;
  _wordDict = window.gameState?.wordDictionary
    ? new Map(Object.entries(window.gameState.wordDictionary))
    : new Map();
  return _wordDict;
}

/**
 * Select a bark using i+1 filtering.
 * 80% reinforcement, 20% teaching.
 */
function pickBark(triggerType) {
  const pool = getBarkPool();
  if (!pool) return pickLegacyPhrase(triggerType);

  const barks = pool[triggerType];
  if (!barks || barks.length === 0) return null;

  const knownWords = getKnownWords();

  // Filter to eligible (i+1: at most 1 unknown)
  const eligible = barks.filter(b => {
    const unknowns = (b._contentWords || []).filter(w => !knownWords.has(w));
    return unknowns.length <= 1;
  });
  if (eligible.length === 0) return null;

  const reinforcement = eligible.filter(b =>
    (b._contentWords || []).every(w => knownWords.has(w))
  );
  const teachable = eligible.filter(b =>
    (b._contentWords || []).some(w => !knownWords.has(w))
  );

  const useTeaching = teachable.length > 0 && _randomFn() < 0.2;
  const selectedPool = useTeaching ? teachable : (reinforcement.length > 0 ? reinforcement : eligible);

  // Avoid repeats within same combat
  const nonRepeat = selectedPool.filter(b => !_usedThisCombat.has(b.text));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;

  const bark = finalPool[Math.floor(_randomFn() * finalPool.length)];
  if (bark) _usedThisCombat.add(bark.text);
  return bark;
}

/** Fallback: pick from legacy creature-speech format. */
function pickLegacyPhrase(triggerType) {
  const phrases = window.gameState?.creatureSpeech;
  if (!phrases) return null;
  const pool = phrases[triggerType];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(_randomFn() * pool.length)];
}

function randomPlayerSlot() {
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  const alive = [...slots].filter(s => {
    const sprite = s.querySelector('.formation-sprite');
    return sprite && !sprite.classList.contains('ko');
  });
  if (alive.length === 0) return null;
  return alive[Math.floor(_randomFn() * alive.length)];
}

function showBubble(slotEl, bark) {
  if (!slotEl || !bark) return;
  if (_activeBubble) return;

  const rect = slotEl.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';

  // Render using new tokenized format or legacy format
  if (bark._tokens) {
    const knownWords = getKnownWords();
    const wordDict = getWordDict();
    bubble.innerHTML = renderJpSentence(bark._tokens, knownWords, wordDict, {}, false);
    // Track exposures for unknown words (handled inside renderJpSentence)
    flushExposures();
  } else if (bark.jp) {
    // Legacy format fallback (renderJpFirst already imported at top of file)
    bubble.innerHTML = renderJpFirst(bark.jp, bark.reading, bark.en);
    addExposure(bark.jp, bark.en);
    flushExposures();
  }

  bubble.style.position = 'fixed';
  bubble.style.left = `${rect.left + rect.width / 2}px`;
  bubble.style.top = `${rect.top - 8}px`;

  document.body.appendChild(bubble);
  _activeBubble = bubble;

  setTimeout(() => {
    bubble.classList.add('speech-bubble-exit');
    setTimeout(() => {
      bubble.remove();
      if (_activeBubble === bubble) _activeBubble = null;
    }, FADE_MS);
  }, DISPLAY_MS);
}

export function dismissBubble() {
  if (_activeBubble) {
    _activeBubble.remove();
    _activeBubble = null;
  }
}

/** Reset used barks (call at start of each combat). */
export function resetCombatBarks() {
  _usedThisCombat.clear();
}

export function init(opts = {}) {
  if (opts.randomFn) _randomFn = opts.randomFn;

  combatEvents.on('creatureHit', (detail) => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = pickBark('onHit');
    showBubble(detail?.slotEl, bark);
  });

  combatEvents.on('victory', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = pickBark('onVictory');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });

  combatEvents.on('explore', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = pickBark('onExplore');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });
}
```

**Note:** `renderJpFirst` is imported at the top of the file alongside `renderJpSentence`, so both paths work without dynamic imports.

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/ui/speech-bubble.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/speech-bubble.js
git commit -m "feat: update speech bubbles to use tokenized bark pool with i+1 filtering"
```

---

### Task 15: Word Dictionary API Endpoint

**Files:**
- Create new route or add to existing routes
- Modify: `server.js` or route registration

- [ ] **Step 1: Add the endpoint**

Add `GET /api/game/word-dictionary` to the game routes. This returns the word dictionary entries relevant to the current area's dialogue pools. For simplicity, initially return all entries from curriculum files + dialogue pool words.

In `src/routes/game/known-words.js` (or a new route file):

```js
// Add to existing known-words routes or create new route file

// At the top of the route file, add these imports:
// import { getDialogueWordSet } from '../../game/dialogue-loader.js';
// import { loadWordDictionary } from '../../game/word-dictionary.js';
//
// And load the dictionary once at module scope:
// const wordDict = loadWordDictionary(join(process.cwd(), 'data'));

// GET /api/game/word-dictionary
router.get('/word-dictionary', (req, res) => {
  try {
    const dialogueWords = getDialogueWordSet();

    const filtered = {};
    for (const word of dialogueWords) {
      if (wordDict.has(word)) {
        filtered[word] = wordDict.get(word);
      }
    }

    res.json({ dictionary: filtered });
  } catch (e) {
    console.warn('[word-dictionary] Error:', e.message);
    res.json({ dictionary: {} });
  }
});
```

Also add `getDialogueWordSet()` to `src/game/dialogue-loader.js`:

```js
/** Get the set of all words used in dialogue pools. */
export function getDialogueWordSet() {
  const words = new Set();
  // CID scripts
  for (const script of cidScripts) {
    for (const line of script.lines) {
      for (const w of (line._contentWords || [])) words.add(w);
    }
  }
  // NPC lines
  for (const npc of Object.values(npcLines)) {
    for (const slot of Object.values(npc)) {
      if (!Array.isArray(slot)) continue;
      for (const line of slot) {
        for (const w of (line._contentWords || [])) words.add(w);
      }
    }
  }
  // Barks
  for (const trigger of Object.values(barkPool)) {
    if (!Array.isArray(trigger)) continue;
    for (const line of trigger) {
      for (const w of (line._contentWords || [])) words.add(w);
    }
  }
  return words;
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check src/routes/game/known-words.js && echo "OK"
node --check src/game/dialogue-loader.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/game/known-words.js src/game/dialogue-loader.js
git commit -m "feat: add word dictionary API endpoint for client-side rendering"
```

---

### Task 16: Integration Tests

**Files:**
- Create: `tests/integration/dialogue-bootstrap.test.js`

- [ ] **Step 1: Write integration test**

```js
// tests/integration/dialogue-bootstrap.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestTmpDir } from '../helpers/tmp.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('dialogue bootstrap integration', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await createTestTmpDir();
  });

  after(async () => {
    await tmpDir.cleanup();
  });

  it('tokenizer + filter pipeline works end-to-end', async () => {
    const { tokenize } = await import('../../src/tokenizer.js');
    const { isLineEligible, filterEligibleScripts } = await import('../../src/game/dialogue-filter.js');

    // Tokenize a line
    const tokens = await tokenize('こんにちは！');
    const contentWords = tokens
      .filter(t => !/^[\p{P}\p{S}\s]+$/u.test(t.surface))
      .map(t => t.baseForm);

    const line = { text: 'こんにちは！', _contentWords: contentWords };

    // At 0 known words, a single-word line should be eligible (i+1)
    assert.equal(isLineEligible(line, new Set()), true);

    // Build a script and filter
    const scripts = [{ id: 'test', lines: [line] }];
    const eligible = filterEligibleScripts(scripts, new Set());
    assert.equal(eligible.length, 1);
  });

  it('word dictionary loads and overlays game data', async () => {
    const { loadWordDictionary } = await import('../../src/game/word-dictionary.js');

    // Create test data
    const dataDir = join(tmpDir.path, 'data');
    mkdirSync(dataDir, { recursive: true });

    writeFileSync(join(dataDir, 'dictionary.json'), JSON.stringify({
      '猫': { reading: 'ねこ', definitions: [{ en: 'cat', primary: true }] },
    }));

    writeFileSync(join(dataDir, 'glue-words.json'), JSON.stringify([
      { word: 'わたし', reading: 'わたし', en: 'I/me', priority: 1 },
    ]));

    const dict = loadWordDictionary(dataDir);
    assert.ok(dict.has('猫'), 'should have base dictionary entry');
    assert.ok(dict.has('わたし'), 'should have glue word overlay');
    assert.equal(dict.get('わたし').definitions[0].en, 'I/me');
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
node --test tests/integration/dialogue-bootstrap.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all existing tests still pass, plus the new tests.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/dialogue-bootstrap.test.js
git commit -m "test: add dialogue bootstrap integration tests"
```

---

## Chunk 5: FSRS Migration

### Task 17: FSRS Migration Script

**Files:**
- Create: `scripts/migrate-word-knowledge-to-fsrs.js`

This script reads existing `word-knowledge-{userId}.json` files and seeds FSRS `vocab` deck cards from the `known` entries.

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-word-knowledge-to-fsrs.js

/**
 * Migrates word-knowledge known entries into FSRS vocab deck cards.
 *
 * For each user's word-knowledge file:
 * - Reads all entries from the `known` map
 * - Creates FSRS cards in the `vocab` deck (if not already present)
 * - Grades each card as 'good' so it starts in Review state
 *
 * Usage: node scripts/migrate-word-knowledge-to-fsrs.js
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import {
  loadWordKnowledge,
} from '../src/game/bootstrap/word-knowledge.js';
import {
  createCard,
  getDeckCards,
  gradeCard,
} from '../src/game/internal-srs.js';

const DATA_DIR = join(process.cwd(), 'data');

const wkFiles = readdirSync(DATA_DIR)
  .filter(f => f.startsWith('word-knowledge-') && f.endsWith('.json'));

console.log(`Found ${wkFiles.length} word-knowledge files to migrate.\n`);

let totalMigrated = 0;
let totalSkipped = 0;

for (const file of wkFiles) {
  const userId = file.replace('word-knowledge-', '').replace('.json', '');
  console.log(`Migrating user: ${userId}`);

  const wk = loadWordKnowledge(userId);
  if (!wk || !wk.known) {
    console.log(`  No known words, skipping.`);
    continue;
  }

  const knownWords = Object.keys(wk.known);
  const existingCards = getDeckCards(userId, 'vocab');
  const existingIds = new Set(existingCards.map(c => c.id));

  let migrated = 0;
  let skipped = 0;

  for (const word of knownWords) {
    if (existingIds.has(word)) {
      skipped++;
      continue;
    }

    // Create card and immediately grade as 'good' to put it in Review state
    createCard(userId, 'vocab', word, {
      word,
      meaning: wk.known[word].meaning || '',
      reading: word,
    });
    gradeCard(userId, 'vocab', word, 'good');
    migrated++;
  }

  console.log(`  Migrated: ${migrated}, Skipped (already exist): ${skipped}`);
  totalMigrated += migrated;
  totalSkipped += skipped;
}

console.log(`\nDone. Total migrated: ${totalMigrated}, skipped: ${totalSkipped}`);
```

- [ ] **Step 2: Test with a sample user**

```bash
# Create a test word-knowledge file
node -e "
  const fs = require('fs');
  fs.writeFileSync('data/word-knowledge-test-migration.json', JSON.stringify({
    userId: 'test-migration',
    seen: { '猫': { exposures: 5, firstSeen: '2026-01-01' } },
    known: { '猫': { knownSince: '2026-01-15' } }
  }));
"

# Run migration
node scripts/migrate-word-knowledge-to-fsrs.js

# Verify FSRS card was created
node -e "
  const { getDeckCards } = require('./src/game/internal-srs.js');
  const cards = getDeckCards('test-migration', 'vocab');
  console.log('Cards:', cards.map(c => c.id));
"

# Cleanup test file
rm data/word-knowledge-test-migration.json data/srs-test-migration.json
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-word-knowledge-to-fsrs.js
git commit -m "feat: add word-knowledge to FSRS migration script"
```

---

### Task 18: Update Known-Words Endpoint to Use FSRS

**Files:**
- Modify: `src/routes/game/known-words.js` (line ~10-14)
- Test: `tests/unit/routes/known-words-fsrs.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/routes/known-words-fsrs.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestTmpDir } from '../../helpers/tmp.js';
import { configureSrs, clearSrsData, createCard, gradeCard } from '../../../src/game/internal-srs.js';

describe('GET /api/game/known-words (FSRS)', () => {
  let tmpDir;
  const userId = 'test-fsrs-known';

  beforeEach(async () => {
    tmpDir = await createTestTmpDir();
    configureSrs({ dataDir: tmpDir.path });
    clearSrsData(userId);
  });

  afterEach(async () => {
    await tmpDir.cleanup();
  });

  it('returns words from FSRS vocab deck that have been reviewed', () => {
    // Create and grade a card
    createCard(userId, 'vocab', '猫', { word: '猫', meaning: 'cat', reading: 'ねこ' });
    gradeCard(userId, 'vocab', '猫', 'good');

    // Create an unreviewed card
    createCard(userId, 'vocab', '犬', { word: '犬', meaning: 'dog', reading: 'いぬ' });

    // Import the function that will query FSRS
    const { getKnownWordsFromFsrs } = require('../../../src/game/bootstrap/word-knowledge.js');
    const known = getKnownWordsFromFsrs(userId);

    assert.ok(known.includes('猫'), 'reviewed word should be known');
    // Unreviewed cards may or may not be "known" depending on FSRS state
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/routes/known-words-fsrs.test.js
```

Expected: FAIL — `getKnownWordsFromFsrs` doesn't exist yet.

- [ ] **Step 3: Add getKnownWordsFromFsrs to word-knowledge.js**

Add to `src/game/bootstrap/word-knowledge.js`:

```js
import { getDeckCards } from '../internal-srs.js';
import { State } from 'ts-fsrs';

/**
 * Get known words from FSRS vocab deck.
 * A word is "known" when its FSRS card has state === Review (has been successfully reviewed).
 * @param {string} userId
 * @returns {string[]} Array of known word IDs
 */
export function getKnownWordsFromFsrs(userId) {
  const cards = getDeckCards(userId, 'vocab');
  return cards
    .filter(c => c.state === State.Review)
    .map(c => c.id);
}
```

- [ ] **Step 4: Update the GET /api/game/known-words endpoint**

In `src/routes/game/known-words.js`, change the GET handler to query FSRS:

```js
// At the top of src/routes/game/known-words.js, the import already exists:
// import { loadWordKnowledge, ... } from '../../game/bootstrap/word-knowledge.js';
// Add getKnownWordsFromFsrs to that import.

// GET /api/game/known-words — now uses FSRS as source of truth
router.get('/', (req, res) => {
  const words = getKnownWordsFromFsrs(req.user.id);
  res.json({ words });
});
```

The old `loadWordKnowledge(req.user.id)` path stays in other endpoints (`/expose`, `/review`) for backwards compatibility during migration.

- [ ] **Step 5: Run tests**

```bash
node --test tests/unit/routes/known-words-fsrs.test.js
npm test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js src/routes/game/known-words.js tests/unit/routes/known-words-fsrs.test.js
git commit -m "feat: switch known-words endpoint to FSRS as source of truth"
```

---

### Task 19: Client-Side Known Words from FSRS

**Files:**
- Modify: `public/js/game.js` (or wherever `setKnownWords` is called at game init)

- [ ] **Step 1: Verify client already calls GET /api/game/known-words**

Search for where `setKnownWords` is called in the client code:

```bash
grep -rn "setKnownWords" public/js/
```

The client should already call `GET /api/game/known-words` at game init and pass the result to `setKnownWords()`. Since Task 18 changed the server endpoint to return FSRS data, the client gets FSRS-sourced known words automatically — **no client change needed**.

- [ ] **Step 2: Also load the word dictionary at game init**

Find where the game state is initialized (likely in `public/js/game.js` or similar). Add a call to load the word dictionary:

```js
// At game init, after loading known words:
try {
  const dictRes = await fetch(apiUrl('/api/game/word-dictionary'), {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const dictData = await dictRes.json();
  if (dictData.dictionary) {
    // Make available for speech-bubble.js and dialogue-display.js
    window.gameState.wordDictionary = dictData.dictionary;
  }
} catch (e) {
  console.warn('[Game] Failed to load word dictionary:', e.message);
}
```

- [ ] **Step 3: Load bark pool at game init**

Also load the bark pool for client-side bark filtering:

```js
// At game init, load bark pool for client-side filtering
try {
  const barksRes = await fetch(apiUrl('/api/game/bark-pool'), {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const barksData = await barksRes.json();
  if (barksData.barkPool) {
    window.gameState.barkPool = barksData.barkPool;
  }
} catch (e) {
  console.warn('[Game] Failed to load bark pool:', e.message);
}
```

Add the corresponding server endpoint in the game routes:

```js
// GET /api/game/bark-pool
// Add to the game routes file. Import getBarkPool from dialogue-loader.js at the top.
router.get('/bark-pool', (req, res) => {
  res.json({ barkPool: getBarkPool() });
});
```

- [ ] **Step 4: Syntax check**

```bash
node --check public/js/game.js && echo "OK"
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/game.js src/routes/game/run.js
git commit -m "feat: load word dictionary and bark pool at game init, complete FSRS migration"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Run full test suite**: `npm test`
- [ ] **Syntax check all new/modified JS files**: `node --check <file>`
- [ ] **Start dev server**: `npm run dev` — verify no startup errors
- [ ] **Validate dialogue**: `node scripts/validate-dialogue.js` — should pass
- [ ] **Manual smoke test** (with Playwright, ask user first): Start a new run and verify CID dialogue appears with vertical stacks
