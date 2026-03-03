# Stage System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a three-layer stage system (guidelines + outlier budget + median tracking) with a validation utility and stage tags on all existing content.

**Architecture:** A `data/stage-definitions.json` rules file defines 10 stages mapped to WaniKani levels and JPDB frequency bands. A `language/stage-utils.js` utility module loads WK vocab data + stage rules and provides functions to assign words to stages, validate content, and generate stage reports. Existing content files (creatures, moves, items, areas) get `"stage": N` tags.

**Tech Stack:** Node.js ESM modules, `node:test` for testing, JSON data files

**Design doc:** `docs/plans/2026-03-03-stage-system-design.md`

---

### Task 1: Create Stage Definitions Data File

**Files:**
- Create: `data/stage-definitions.json`

**Step 1: Create the stage definitions file**

```json
{
  "version": 1,
  "maxOutlierPercent": 20,
  "stages": [
    { "stage": 1, "wkLevels": [1, 6], "jpdbKanaCap": 500 },
    { "stage": 2, "wkLevels": [7, 12], "jpdbKanaCap": 1200 },
    { "stage": 3, "wkLevels": [13, 18], "jpdbKanaCap": 2000 },
    { "stage": 4, "wkLevels": [19, 24], "jpdbKanaCap": 3000 },
    { "stage": 5, "wkLevels": [25, 30], "jpdbKanaCap": 4500 },
    { "stage": 6, "wkLevels": [31, 36], "jpdbKanaCap": 6500 },
    { "stage": 7, "wkLevels": [37, 42], "jpdbKanaCap": 9000 },
    { "stage": 8, "wkLevels": [43, 48], "jpdbKanaCap": 12000 },
    { "stage": 9, "wkLevels": [49, 54], "jpdbKanaCap": 16000 },
    { "stage": 10, "wkLevels": [55, 60], "jpdbKanaCap": null }
  ]
}
```

**Step 2: Commit**

```bash
git add data/stage-definitions.json
git commit -m "feat: add stage definitions data file (10 stages, WK + JPDB bands)"
```

---

### Task 2: Write Tests for `getWordStrictStage()`

**Files:**
- Create: `tests/unit/stages/stage-utils.test.js`

**Step 1: Write failing tests for `getWordStrictStage`**

This function takes a word and its JPDB rank, looks up the word in WaniKani data, and returns the strict stage number.

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWordStrictStage } from '../../../language/stage-utils.js';

describe('getWordStrictStage', () => {
  it('assigns WK level 1-6 words to stage 1', () => {
    // 山 is WK level 1
    assert.strictEqual(getWordStrictStage('山', 2000), 1);
  });

  it('assigns WK level 7-12 words to stage 2', () => {
    // 魚 is WK level 11
    assert.strictEqual(getWordStrictStage('魚', 1800), 2);
  });

  it('assigns WK level 55-60 words to stage 10', () => {
    // 蝶 is WK level 56
    assert.strictEqual(getWordStrictStage('蝶', 8600), 10);
  });

  it('uses JPDB rank for words not in WaniKani', () => {
    // カエル is not in WK, rank 9900 → stage 8 (cap 12000)
    assert.strictEqual(getWordStrictStage('カエル', 9900), 8);
  });

  it('uses JPDB rank for kana-only words', () => {
    // おにぎり rank 9100 → stage 8 (cap 12000)
    assert.strictEqual(getWordStrictStage('おにぎり', 9100), 8);
  });

  it('assigns stage 1 for JPDB rank <= 500 when not in WK', () => {
    assert.strictEqual(getWordStrictStage('する', 1), 1);
  });

  it('assigns stage 10 for words beyond jpdbKanaCap 16000 when not in WK', () => {
    assert.strictEqual(getWordStrictStage('ペンギン', 19500), 10);
  });

  it('returns null for unknown words with no rank', () => {
    assert.strictEqual(getWordStrictStage('???', null), null);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: FAIL — module `../../../language/stage-utils.js` not found

**Step 3: Commit the test file**

```bash
git add tests/unit/stages/stage-utils.test.js
git commit -m "test: add failing tests for getWordStrictStage"
```

---

### Task 3: Implement `getWordStrictStage()`

**Files:**
- Create: `language/stage-utils.js`

**Step 1: Implement the module with `getWordStrictStage`**

The module loads WK vocab data and stage definitions at import time. `getWordStrictStage(word, jpdbRank)` checks WK first, falls back to JPDB rank bands.

```javascript
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load data at module init
const stageDefsPath = join(__dirname, '..', 'data', 'stage-definitions.json');
const stageDefs = JSON.parse(readFileSync(stageDefsPath, 'utf8'));

const wkVocabPath = join(__dirname, 'dictionaries', 'wanikani-vocab.json');
const wkData = JSON.parse(readFileSync(wkVocabPath, 'utf8'));

// Build WK word → level lookup
const wkWordToLevel = new Map();
for (const v of wkData.vocabulary) {
  wkWordToLevel.set(v.characters, v.level);
}

/**
 * Get the strict stage for a word based on WK level or JPDB rank.
 * @param {string} word - Japanese word (kanji, hiragana, or katakana)
 * @param {number|null} jpdbRank - JPDB frequency rank (lower = more common)
 * @returns {number|null} Stage 1-10, or null if unassignable
 */
export function getWordStrictStage(word, jpdbRank) {
  // Check WK first
  const wkLevel = wkWordToLevel.get(word);
  if (wkLevel) {
    return Math.ceil(wkLevel / 6);
  }

  // Fall back to JPDB rank
  if (jpdbRank == null) return null;

  for (const s of stageDefs.stages) {
    if (s.jpdbKanaCap === null) return s.stage; // Stage 10: no cap
    if (jpdbRank <= s.jpdbKanaCap) return s.stage;
  }
  return 10;
}
```

**Step 2: Run tests to verify they pass**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: All 8 tests PASS

**Step 3: Commit**

```bash
git add language/stage-utils.js
git commit -m "feat: implement getWordStrictStage with WK + JPDB lookup"
```

---

### Task 4: Write Tests for `getContentWords()`

**Files:**
- Modify: `tests/unit/stages/stage-utils.test.js`

**Step 1: Add failing tests for `getContentWords`**

This function extracts all vocabulary words from a game object (creature, move, item, area). Returns an array of `{ word, rank, source }` objects.

```javascript
import { getContentWords } from '../../../language/stage-utils.js';

describe('getContentWords', () => {
  it('extracts base word and modifier from a creature', () => {
    const creature = {
      id: 'nekotto',
      baseWord: '猫', baseMeaning: 'cat', baseRank: 1600,
      modifier: { word: '鉄', meaning: 'Iron', rank: 2200 }
    };
    const words = getContentWords(creature, 'creature');
    assert.strictEqual(words.length, 2);
    assert.deepStrictEqual(words[0], { word: '猫', rank: 1600, source: 'baseWord' });
    assert.deepStrictEqual(words[1], { word: '鉄', rank: 2200, source: 'modifier' });
  });

  it('extracts move name', () => {
    const move = { id: 'hashiru', name: '走る', meaning: 'to run', rank: 400 };
    const words = getContentWords(move, 'move');
    assert.strictEqual(words.length, 1);
    assert.deepStrictEqual(words[0], { word: '走る', rank: 400, source: 'name' });
  });

  it('extracts item components', () => {
    const item = {
      id: 'green-tea', word: '緑茶', meaning: 'green tea',
      components: [
        { word: '緑', rank: 2300 },
        { word: '茶', rank: 4100 }
      ]
    };
    const words = getContentWords(item, 'item');
    assert.strictEqual(words.length, 2);
    assert.strictEqual(words[0].word, '緑');
    assert.strictEqual(words[1].word, '茶');
  });

  it('extracts single-component items', () => {
    const item = {
      id: 'sake', word: '酒', meaning: 'sake',
      components: [{ word: '酒', rank: 1600 }]
    };
    const words = getContentWords(item, 'item');
    assert.strictEqual(words.length, 1);
  });

  it('handles creature with no modifier', () => {
    const creature = {
      id: 'test', baseWord: '犬', baseMeaning: 'dog', baseRank: 1500
    };
    const words = getContentWords(creature, 'creature');
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '犬');
  });
});
```

**Step 2: Run tests to verify new tests fail**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: `getContentWords` tests FAIL (not yet exported)

**Step 3: Commit**

```bash
git add tests/unit/stages/stage-utils.test.js
git commit -m "test: add failing tests for getContentWords"
```

---

### Task 5: Implement `getContentWords()`

**Files:**
- Modify: `language/stage-utils.js`

**Step 1: Add `getContentWords` to the module**

```javascript
/**
 * Extract all vocabulary words from a game content object.
 * @param {Object} obj - The game object (creature, move, item, area)
 * @param {string} type - 'creature' | 'move' | 'item' | 'area'
 * @returns {Array<{word: string, rank: number, source: string}>}
 */
export function getContentWords(obj, type) {
  const words = [];

  switch (type) {
    case 'creature':
      words.push({ word: obj.baseWord, rank: obj.baseRank, source: 'baseWord' });
      if (obj.modifier) {
        words.push({ word: obj.modifier.word, rank: obj.modifier.rank, source: 'modifier' });
      }
      break;
    case 'move':
      words.push({ word: obj.name, rank: obj.rank, source: 'name' });
      break;
    case 'item':
      for (const comp of (obj.components || [])) {
        words.push({ word: comp.word, rank: comp.rank, source: 'component' });
      }
      break;
    case 'area':
      // Area vocab words if present
      for (const vw of (obj.vocabWords || [])) {
        words.push({ word: vw.word, rank: vw.rank, source: 'areaVocab' });
      }
      break;
  }

  return words;
}
```

**Step 2: Run tests to verify they pass**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add language/stage-utils.js tests/unit/stages/stage-utils.test.js
git commit -m "feat: implement getContentWords for creature/move/item/area"
```

---

### Task 6: Write Tests for `suggestStage()`

**Files:**
- Modify: `tests/unit/stages/stage-utils.test.js`

**Step 1: Add failing tests for `suggestStage`**

This function takes a content object and type, extracts all its words, computes strict stages for each, and returns the best-fit stage (lowest stage where outlier % ≤ 20%).

```javascript
import { suggestStage } from '../../../language/stage-utils.js';

describe('suggestStage', () => {
  it('suggests stage 1 for all-stage-1 creature', () => {
    const creature = {
      baseWord: '犬', baseRank: 1500,
      modifier: { word: '大きい', rank: 700 }
    };
    const result = suggestStage(creature, 'creature');
    assert.strictEqual(result.stage, 1);
    assert.strictEqual(result.outlierPercent, 0);
  });

  it('suggests higher stage when words span multiple stages', () => {
    // 猫 = WK15 = stage 3, 鉄 = not in WK, rank 2200 = stage 3
    const creature = {
      baseWord: '猫', baseRank: 1600,
      modifier: { word: '鉄', rank: 2200 }
    };
    const result = suggestStage(creature, 'creature');
    assert.ok(result.stage >= 3);
    assert.ok(result.outlierPercent <= 20);
  });

  it('returns outlier percent for the suggested stage', () => {
    const creature = {
      baseWord: '山', baseRank: 2000,
      modifier: { word: '大きい', rank: 700 }
    };
    const result = suggestStage(creature, 'creature');
    assert.strictEqual(typeof result.outlierPercent, 'number');
    assert.strictEqual(typeof result.stage, 'number');
    assert.strictEqual(typeof result.medianRank, 'number');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: `suggestStage` tests FAIL

**Step 3: Commit**

```bash
git add tests/unit/stages/stage-utils.test.js
git commit -m "test: add failing tests for suggestStage"
```

---

### Task 7: Implement `suggestStage()`

**Files:**
- Modify: `language/stage-utils.js`

**Step 1: Add `suggestStage` to the module**

```javascript
/**
 * Suggest the best-fit stage for a content object.
 * Returns the lowest stage where outlier % <= maxOutlierPercent.
 * @param {Object} obj - The game object
 * @param {string} type - 'creature' | 'move' | 'item' | 'area'
 * @returns {{ stage: number, outlierPercent: number, medianRank: number, wordStages: Array }}
 */
export function suggestStage(obj, type) {
  const words = getContentWords(obj, type);
  const wordStages = words.map(w => ({
    ...w,
    strictStage: getWordStrictStage(w.word, w.rank)
  }));

  const ranks = words.map(w => w.rank).filter(r => r > 0).sort((a, b) => a - b);
  const medianRank = ranks.length > 0 ? ranks[Math.floor(ranks.length / 2)] : 0;

  // Find lowest stage where outlier % <= budget
  for (let s = 1; s <= 10; s++) {
    const inBand = wordStages.filter(w => w.strictStage !== null && w.strictStage <= s).length;
    const total = wordStages.filter(w => w.strictStage !== null).length;
    if (total === 0) return { stage: 1, outlierPercent: 0, medianRank, wordStages };
    const outlierPercent = Math.round((1 - inBand / total) * 100);
    if (outlierPercent <= stageDefs.maxOutlierPercent) {
      return { stage: s, outlierPercent, medianRank, wordStages };
    }
  }

  return { stage: 10, outlierPercent: 0, medianRank, wordStages };
}
```

**Step 2: Run tests to verify they pass**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add language/stage-utils.js
git commit -m "feat: implement suggestStage with outlier budget calculation"
```

---

### Task 8: Write Tests for `getStageReport()` and `getFullReport()`

**Files:**
- Modify: `tests/unit/stages/stage-utils.test.js`

**Step 1: Add failing tests for reporting functions**

These functions scan all content data files and produce stage-level statistics.

```javascript
import { getStageReport, getFullReport } from '../../../language/stage-utils.js';

describe('getStageReport', () => {
  it('returns report with expected shape for a valid stage', () => {
    const report = getStageReport(1);
    assert.strictEqual(typeof report.stage, 'number');
    assert.strictEqual(typeof report.totalWords, 'number');
    assert.strictEqual(typeof report.outlierCount, 'number');
    assert.strictEqual(typeof report.outlierPercent, 'number');
    assert.strictEqual(typeof report.medianRank, 'number');
    assert.ok(Array.isArray(report.creatures));
    assert.ok(Array.isArray(report.moves));
    assert.ok(Array.isArray(report.items));
    assert.ok(Array.isArray(report.areas));
  });

  it('returns stage number matching input', () => {
    const report = getStageReport(5);
    assert.strictEqual(report.stage, 5);
  });
});

describe('getFullReport', () => {
  it('returns array of 10 stage reports', () => {
    const reports = getFullReport();
    assert.strictEqual(reports.length, 10);
    assert.strictEqual(reports[0].stage, 1);
    assert.strictEqual(reports[9].stage, 10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: FAIL — functions not exported

**Step 3: Commit**

```bash
git add tests/unit/stages/stage-utils.test.js
git commit -m "test: add failing tests for getStageReport and getFullReport"
```

---

### Task 9: Implement `getStageReport()` and `getFullReport()`

**Files:**
- Modify: `language/stage-utils.js`

**Step 1: Implement reporting functions**

These load creatures.json, moves.json, items.json, and areas data, filter by `"stage"` tag, and compute statistics.

```javascript
// Load game content data
const dataDir = join(__dirname, '..', 'data');

function loadJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return []; }
}

function loadAllContent() {
  return {
    creatures: loadJsonSafe(join(dataDir, 'creatures.json')),
    moves: loadJsonSafe(join(dataDir, 'moves.json')),
    items: loadJsonSafe(join(dataDir, 'items.json')),
    areas: loadJsonSafe(join(dataDir, 'new-areas-staging.json')),
  };
}

/**
 * Generate a stage report for a specific stage number.
 * Scans all content tagged with that stage and computes metrics.
 * @param {number} stageNumber - 1-10
 * @returns {{ stage, totalWords, outlierCount, outlierPercent, medianRank, creatures, moves, items, areas }}
 */
export function getStageReport(stageNumber) {
  const content = loadAllContent();

  const stageCreatures = content.creatures.filter(c => c.stage === stageNumber);
  const stageMoves = content.moves.filter(m => m.stage === stageNumber);
  const stageItems = content.items.filter(i => i.stage === stageNumber);
  const stageAreas = content.areas.filter(a => a.stage === stageNumber);

  // Collect all words across all content in this stage
  const allWords = [];
  for (const c of stageCreatures) allWords.push(...getContentWords(c, 'creature'));
  for (const m of stageMoves) allWords.push(...getContentWords(m, 'move'));
  for (const i of stageItems) allWords.push(...getContentWords(i, 'item'));
  for (const a of stageAreas) allWords.push(...getContentWords(a, 'area'));

  const wordStages = allWords.map(w => ({
    ...w,
    strictStage: getWordStrictStage(w.word, w.rank)
  }));

  const scorable = wordStages.filter(w => w.strictStage !== null);
  const outliers = scorable.filter(w => w.strictStage > stageNumber);
  const ranks = allWords.map(w => w.rank).filter(r => r > 0).sort((a, b) => a - b);
  const medianRank = ranks.length > 0 ? ranks[Math.floor(ranks.length / 2)] : 0;

  return {
    stage: stageNumber,
    totalWords: allWords.length,
    outlierCount: outliers.length,
    outlierPercent: scorable.length > 0 ? Math.round((outliers.length / scorable.length) * 100) : 0,
    medianRank,
    creatures: stageCreatures.map(c => c.id),
    moves: stageMoves.map(m => m.id),
    items: stageItems.map(i => i.id),
    areas: stageAreas.map(a => a.id),
  };
}

/**
 * Generate reports for all 10 stages.
 * @returns {Array} Array of 10 stage reports
 */
export function getFullReport() {
  return stageDefs.stages.map(s => getStageReport(s.stage));
}
```

Note: Move the data-loading code (`loadJsonSafe`, `loadAllContent`) to the top of the module near the other file-loading code.

**Step 2: Run tests to verify they pass**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add language/stage-utils.js
git commit -m "feat: implement getStageReport and getFullReport"
```

---

### Task 10: Tag Existing Creatures with Stage

**Files:**
- Modify: `data/creatures.json`

**Step 1: Write a tagging script (run once, then discard)**

```bash
node -e "
import { readFileSync, writeFileSync } from 'fs';
import { suggestStage } from './language/stage-utils.js';

const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf8'));
for (const c of creatures) {
  const result = suggestStage(c, 'creature');
  c.stage = result.stage;
  console.log(c.id + ': stage ' + result.stage + ' (' + result.outlierPercent + '% outliers, median rank ' + result.medianRank + ')');
}
writeFileSync('data/creatures.json', JSON.stringify(creatures, null, 2) + '\n', 'utf8');
console.log('\nTagged ' + creatures.length + ' creatures');
" --input-type=module
```

**Step 2: Review the output — verify assignments look reasonable**

Check that simple creatures (hikaribon, honmo) get low stages and complex ones (samegaron, karasume) get high stages.

**Step 3: Commit**

```bash
git add data/creatures.json
git commit -m "feat: tag all 37 creatures with stage assignments"
```

---

### Task 11: Tag Existing Moves with Stage

**Files:**
- Modify: `data/moves.json`

**Step 1: Write a tagging script**

```bash
node -e "
import { readFileSync, writeFileSync } from 'fs';
import { suggestStage } from './language/stage-utils.js';

const moves = JSON.parse(readFileSync('data/moves.json', 'utf8'));
for (const m of moves) {
  const result = suggestStage(m, 'move');
  m.stage = result.stage;
}

// Summary
const byStage = {};
for (const m of moves) { byStage[m.stage] = (byStage[m.stage] || 0) + 1; }
for (let s = 1; s <= 10; s++) console.log('Stage ' + s + ': ' + (byStage[s] || 0) + ' moves');

writeFileSync('data/moves.json', JSON.stringify(moves, null, 2) + '\n', 'utf8');
console.log('\nTagged ' + moves.length + ' moves');
" --input-type=module
```

**Step 2: Review — verify distribution looks reasonable across stages**

**Step 3: Commit**

```bash
git add data/moves.json
git commit -m "feat: tag all 150 moves with stage assignments"
```

---

### Task 12: Tag Existing Items and Areas with Stage

**Files:**
- Modify: `data/items.json`
- Modify: `data/new-areas-staging.json`

**Step 1: Tag items**

```bash
node -e "
import { readFileSync, writeFileSync } from 'fs';
import { suggestStage } from './language/stage-utils.js';

const items = JSON.parse(readFileSync('data/items.json', 'utf8'));
for (const i of items) {
  const result = suggestStage(i, 'item');
  i.stage = result.stage;
  console.log(i.id + ': stage ' + result.stage + ' (' + result.outlierPercent + '% outliers)');
}
writeFileSync('data/items.json', JSON.stringify(items, null, 2) + '\n', 'utf8');
" --input-type=module
```

**Step 2: Tag areas**

Areas are more complex — their stage should consider all creatures assigned to the area. Use the area's creature list, cross-reference creature stages, and pick the dominant stage.

```bash
node -e "
import { readFileSync, writeFileSync } from 'fs';
import { getWordStrictStage } from './language/stage-utils.js';

const areas = JSON.parse(readFileSync('data/new-areas-staging.json', 'utf8'));
const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf8'));
const creatureMap = Object.fromEntries(creatures.map(c => [c.id, c]));

for (const a of areas) {
  const creatureStages = (a.creatures || [])
    .map(id => creatureMap[id]?.stage)
    .filter(s => s != null);
  // Area stage = median of its creature stages
  creatureStages.sort((a, b) => a - b);
  a.stage = creatureStages.length > 0
    ? creatureStages[Math.floor(creatureStages.length / 2)]
    : 1;
  console.log(a.nameEn + ': stage ' + a.stage + ' (creature stages: ' + creatureStages.join(',') + ')');
}
writeFileSync('data/new-areas-staging.json', JSON.stringify(areas, null, 2) + '\n', 'utf8');
" --input-type=module
```

**Step 3: Review both outputs**

**Step 4: Commit**

```bash
git add data/items.json data/new-areas-staging.json
git commit -m "feat: tag all items and areas with stage assignments"
```

---

### Task 13: Run Full Report and Verify

**Files:**
- None (verification only)

**Step 1: Run the full stage report to verify everything works end-to-end**

```bash
node -e "
import { getFullReport } from './language/stage-utils.js';

const reports = getFullReport();
console.log('Stage | Creatures | Moves | Items | Areas | Words | Outlier% | Median Rank');
console.log('------|-----------|-------|-------|-------|-------|----------|------------');
for (const r of reports) {
  console.log(
    String(r.stage).padStart(5) + ' | ' +
    String(r.creatures.length).padStart(9) + ' | ' +
    String(r.moves.length).padStart(5) + ' | ' +
    String(r.items.length).padStart(5) + ' | ' +
    String(r.areas.length).padStart(5) + ' | ' +
    String(r.totalWords).padStart(5) + ' | ' +
    String(r.outlierPercent + '%').padStart(8) + ' | ' +
    String(r.medianRank).padStart(11)
  );
}
" --input-type=module
```

**Step 2: Run all tests to make sure nothing is broken**

Run: `npm test`
Expected: All existing tests + new stage tests PASS

**Step 3: Commit any fixes if needed**

---

### Task 14: Final Commit and Cleanup

**Step 1: Run syntax check on all new/modified files**

```bash
node --check language/stage-utils.js && echo "OK"
```

**Step 2: Run full test suite**

```bash
npm test
```

**Step 3: Final commit with all changes if any stragglers**

```bash
git add -A
git status
# Only commit if there are unstaged changes
git commit -m "chore: stage system implementation complete"
```
