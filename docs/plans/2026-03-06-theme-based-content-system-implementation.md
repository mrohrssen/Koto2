# Theme-Based Content System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the theme-based content authoring pipeline described in `docs/plans/2026-03-04-theme-based-content-system-design.md` — theme pool files, discovery integration, generation script, and forge skill updates.

**Architecture:** Three layers — (1) a theme-utils library for reading/writing/validating theme pool JSON files, (2) integration into forge-discovery.mjs for `--theme` and `--theme-status` CLI modes, and (3) a generate-theme-pool Claude Code skill that orchestrates AI-powered category scanning via subagents + a Node.js helper script for JPDB enrichment and file I/O.

**Tech Stack:** Node.js ES modules, JPDB API (via `scripts/lib/jpdb-helpers.mjs`), node:test for unit tests, Claude Code skills (SKILL.md) for AI orchestration.

**Design doc:** `docs/plans/2026-03-04-theme-based-content-system-design.md`

---

### Task 1: Theme Utils Module

**Files:**
- Create: `scripts/lib/theme-utils.mjs`
- Create: `tests/unit/scripts/theme-utils.test.js`

This module handles all theme pool file I/O and validation. Every other component imports from here.

**Step 1: Write the failing tests**

```javascript
// tests/unit/scripts/theme-utils.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

let loadTheme, saveTheme, listThemes, validateTheme, getThemeWords, markAssigned;

before(async () => {
  const mod = await import('../../../scripts/lib/theme-utils.mjs');
  loadTheme = mod.loadTheme;
  saveTheme = mod.saveTheme;
  listThemes = mod.listThemes;
  validateTheme = mod.validateTheme;
  getThemeWords = mod.getThemeWords;
  markAssigned = mod.markAssigned;
});

// ── Fixture ─────────────────────────────────────────────────────────

const FIXTURE_THEME = {
  themeId: 'test-school',
  areaWord: '学校',
  areaReading: 'がっこう',
  areaMeaning: 'school',
  areaRank: 952,
  avgRank: 2340,
  computedStage: 3,
  generatedAt: '2026-03-06',
  words: [
    {
      word: '先生',
      reading: 'せんせい',
      meaning: 'teacher',
      rank: 452,
      roles: ['creature', 'npc'],
      source: 'occupations',
      assigned: null,
      existingUses: []
    },
    {
      word: '机',
      reading: 'つくえ',
      meaning: 'desk',
      rank: 2100,
      roles: ['item'],
      source: 'objects',
      assigned: 'item:tsukue-desk',
      existingUses: ['item:tsukue-desk']
    },
    {
      word: '教室',
      reading: 'きょうしつ',
      meaning: 'classroom',
      rank: 3200,
      roles: ['sub-area'],
      source: 'locations',
      assigned: null,
      existingUses: []
    },
    {
      word: '厳しい',
      reading: 'きびしい',
      meaning: 'strict; severe',
      rank: 3400,
      roles: ['modifier'],
      source: 'ai-generated',
      assigned: null,
      existingUses: []
    }
  ]
};

// ── validateTheme ───────────────────────────────────────────────────

describe('validateTheme', () => {
  it('returns empty array for valid theme', () => {
    const errors = validateTheme(FIXTURE_THEME);
    assert.deepStrictEqual(errors, []);
  });

  it('reports missing themeId', () => {
    const errors = validateTheme({ ...FIXTURE_THEME, themeId: undefined });
    assert.ok(errors.some(e => e.includes('themeId')));
  });

  it('reports missing areaWord', () => {
    const errors = validateTheme({ ...FIXTURE_THEME, areaWord: undefined });
    assert.ok(errors.some(e => e.includes('areaWord')));
  });

  it('reports non-array words', () => {
    const errors = validateTheme({ ...FIXTURE_THEME, words: 'not-array' });
    assert.ok(errors.some(e => e.includes('words must be array')));
  });

  it('reports word entry missing required fields', () => {
    const bad = { ...FIXTURE_THEME, words: [{ word: '犬' }] };
    const errors = validateTheme(bad);
    assert.ok(errors.some(e => e.includes('reading')));
    assert.ok(errors.some(e => e.includes('meaning')));
    assert.ok(errors.some(e => e.includes('rank')));
    assert.ok(errors.some(e => e.includes('roles')));
  });
});

// ── saveTheme / loadTheme / listThemes ──────────────────────────────

describe('saveTheme + loadTheme', () => {
  it('round-trips a theme through save and load', () => {
    saveTheme(FIXTURE_THEME);
    const loaded = loadTheme('test-school');
    assert.deepStrictEqual(loaded, FIXTURE_THEME);
  });

  it('returns null for non-existent theme', () => {
    assert.strictEqual(loadTheme('nonexistent-theme-xyz'), null);
  });
});

describe('listThemes', () => {
  it('includes saved theme in list', () => {
    saveTheme(FIXTURE_THEME);
    const themes = listThemes();
    assert.ok(themes.includes('test-school'));
  });
});

// ── getThemeWords ───────────────────────────────────────────────────

describe('getThemeWords', () => {
  before(() => saveTheme(FIXTURE_THEME));

  it('returns all words when no filters', () => {
    const words = getThemeWords('test-school');
    assert.strictEqual(words.length, 4);
  });

  it('filters by role', () => {
    const words = getThemeWords('test-school', { role: 'creature' });
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '先生');
  });

  it('filters by unassigned only', () => {
    const words = getThemeWords('test-school', { unassignedOnly: true });
    // 机 is assigned, the other 3 are not
    assert.strictEqual(words.length, 3);
    assert.ok(words.every(w => w.assigned === null));
  });

  it('combines role + unassigned filters', () => {
    const words = getThemeWords('test-school', { role: 'item', unassignedOnly: true });
    // 机 has role=item but is assigned → excluded
    assert.strictEqual(words.length, 0);
  });

  it('returns empty for non-existent theme', () => {
    const words = getThemeWords('nonexistent-xyz');
    assert.deepStrictEqual(words, []);
  });
});

// ── markAssigned ────────────────────────────────────────────────────

describe('markAssigned', () => {
  before(() => saveTheme(FIXTURE_THEME));

  it('marks a word as assigned and persists', () => {
    markAssigned('test-school', '先生', 'creature:sensei');
    const loaded = loadTheme('test-school');
    const entry = loaded.words.find(w => w.word === '先生');
    assert.strictEqual(entry.assigned, 'creature:sensei');
  });

  it('throws for non-existent theme', () => {
    assert.throws(
      () => markAssigned('nonexistent-xyz', '先生', 'creature:x'),
      /not found/
    );
  });

  it('throws for non-existent word in theme', () => {
    assert.throws(
      () => markAssigned('test-school', '宇宙', 'creature:x'),
      /not found/
    );
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────

after(() => {
  // Remove test theme file
  const themePath = join(process.cwd(), 'language', 'themes', 'test-school.json');
  try { rmSync(themePath); } catch { /* ok */ }
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/scripts/theme-utils.test.js`
Expected: FAIL — module `scripts/lib/theme-utils.mjs` does not exist

**Step 3: Implement theme-utils.mjs**

```javascript
// scripts/lib/theme-utils.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const THEMES_DIR = join(process.cwd(), 'language', 'themes');

const VALID_ROLES = ['creature', 'modifier', 'item', 'npc', 'sub-area', 'move'];

/**
 * Validate a theme object. Returns array of error strings (empty = valid).
 */
export function validateTheme(theme) {
  const errors = [];
  if (!theme.themeId) errors.push('missing themeId');
  if (!theme.areaWord) errors.push('missing areaWord');
  if (!theme.areaReading) errors.push('missing areaReading');
  if (!theme.areaMeaning) errors.push('missing areaMeaning');
  if (!Array.isArray(theme.words)) {
    errors.push('words must be array');
    return errors;
  }
  for (const [i, w] of theme.words.entries()) {
    if (!w.word) errors.push(`words[${i}]: missing word`);
    if (!w.reading) errors.push(`words[${i}]: missing reading`);
    if (!w.meaning) errors.push(`words[${i}]: missing meaning`);
    if (typeof w.rank !== 'number') errors.push(`words[${i}]: rank must be number`);
    if (!Array.isArray(w.roles)) errors.push(`words[${i}]: roles must be array`);
  }
  return errors;
}

/**
 * Load a theme by ID. Returns null if not found.
 */
export function loadTheme(themeId) {
  const path = join(THEMES_DIR, `${themeId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Save a theme object to disk. Creates the themes directory if needed.
 * Returns the file path written.
 */
export function saveTheme(theme) {
  if (!existsSync(THEMES_DIR)) mkdirSync(THEMES_DIR, { recursive: true });
  const path = join(THEMES_DIR, `${theme.themeId}.json`);
  writeFileSync(path, JSON.stringify(theme, null, 2) + '\n');
  return path;
}

/**
 * List all theme IDs (filenames without .json extension).
 */
export function listThemes() {
  if (!existsSync(THEMES_DIR)) return [];
  return readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Get words from a theme, optionally filtered by role and assignment status.
 */
export function getThemeWords(themeId, { role, unassignedOnly = false } = {}) {
  const theme = loadTheme(themeId);
  if (!theme) return [];
  let words = theme.words;
  if (role) words = words.filter(w => w.roles.includes(role));
  if (unassignedOnly) words = words.filter(w => w.assigned === null);
  return words;
}

/**
 * Mark a word in a theme as assigned. Persists to disk.
 */
export function markAssigned(themeId, word, assignment) {
  const theme = loadTheme(themeId);
  if (!theme) throw new Error(`Theme "${themeId}" not found`);
  const entry = theme.words.find(w => w.word === word);
  if (!entry) throw new Error(`Word "${word}" not found in theme "${themeId}"`);
  entry.assigned = assignment;
  saveTheme(theme);
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/scripts/theme-utils.test.js`
Expected: All tests PASS

**Step 5: Syntax check**

Run: `node --check scripts/lib/theme-utils.mjs && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
git add scripts/lib/theme-utils.mjs tests/unit/scripts/theme-utils.test.js
git commit -m "feat: add theme-utils module for theme pool file I/O and validation"
```

---

### Task 2: getThemeStage() in stage-utils.js

**Files:**
- Modify: `language/stage-utils.js` (add ~15 lines at end)
- Modify: `tests/unit/stages/stage-utils.test.js` (add ~25 lines at end)

**Step 1: Write the failing test**

Append to `tests/unit/stages/stage-utils.test.js`:

```javascript
// ── getThemeStage ───────────────────────────────────────────────────

describe('getThemeStage', () => {
  // Import is already at top: import { ..., getThemeStage } from '...'

  it('returns computedStage from a theme file', () => {
    // Requires the test-school theme from Task 1 to exist, or use a known theme
    // For unit testing, we test the computation logic directly
    const stage = getThemeStage.__computeFromAvgRank(2340);
    assert.strictEqual(stage, 3); // avgRank 2340 → stage 3 (cap 2000 < 2340 <= 3000)
  });

  it('returns stage 1 for avgRank <= 500', () => {
    assert.strictEqual(getThemeStage.__computeFromAvgRank(400), 1);
  });

  it('returns stage 10 for very high avgRank', () => {
    assert.strictEqual(getThemeStage.__computeFromAvgRank(50000), 10);
  });
});
```

Wait — the design doc says `getThemeStage(themeId)` reads the theme file. But for testability, we should also expose the pure computation. Let me revise:

The function `getThemeStage(themeId)` reads the theme file and returns `computedStage`. If the file has no `computedStage`, it computes it from `avgRank`. We'll also export `computeStageFromAvgRank(avgRank)` for pure testing.

Append to `tests/unit/stages/stage-utils.test.js`:

```javascript
// ── computeStageFromAvgRank ─────────────────────────────────────────

describe('computeStageFromAvgRank', () => {
  it('returns stage 1 for avgRank <= 500', () => {
    assert.strictEqual(computeStageFromAvgRank(400), 1);
    assert.strictEqual(computeStageFromAvgRank(500), 1);
  });

  it('returns stage 2 for avgRank 501-1200', () => {
    assert.strictEqual(computeStageFromAvgRank(800), 2);
    assert.strictEqual(computeStageFromAvgRank(1200), 2);
  });

  it('returns stage 3 for avgRank 1201-2000', () => {
    assert.strictEqual(computeStageFromAvgRank(1500), 3);
  });

  it('returns stage 4 for avgRank 2001-3000', () => {
    assert.strictEqual(computeStageFromAvgRank(2340), 4);
  });

  it('returns stage 10 for avgRank beyond stage 9 cap', () => {
    assert.strictEqual(computeStageFromAvgRank(50000), 10);
  });

  it('returns null for null avgRank', () => {
    assert.strictEqual(computeStageFromAvgRank(null), null);
  });
});
```

Note: Update the import at top of test file to include `computeStageFromAvgRank`.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: FAIL — `computeStageFromAvgRank` is not exported

**Step 3: Implement computeStageFromAvgRank in stage-utils.js**

Add to `language/stage-utils.js` (after existing exports):

```javascript
/**
 * Compute game stage from an average JPDB frequency rank.
 * Uses the same jpdbKanaCap thresholds as word stage computation.
 * Used by theme pool generation to determine area difficulty.
 *
 * @param {number|null} avgRank - Average frequency rank of theme words
 * @returns {number|null} Stage 1-10, or null if avgRank is null
 */
export function computeStageFromAvgRank(avgRank) {
  if (avgRank == null) return null;
  for (const s of stageDefs.stages) {
    if (s.jpdbKanaCap === null) return s.stage;
    if (avgRank <= s.jpdbKanaCap) return s.stage;
  }
  return 10;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/stages/stage-utils.test.js`
Expected: All tests PASS (old + new)

**Step 5: Commit**

```bash
git add language/stage-utils.js tests/unit/stages/stage-utils.test.js
git commit -m "feat: add computeStageFromAvgRank to stage-utils for theme pool staging"
```

---

### Task 3: forge-discovery --theme Mode

**Files:**
- Modify: `scripts/forge-discovery.mjs` (add ~40 lines)
- Modify: `tests/unit/scripts/forge-discovery.test.js` (add ~50 lines)

Adds a new `discoverFromTheme({ themeId, role, limit })` export and `--theme` CLI flag.

**Step 1: Write the failing tests**

Append to `tests/unit/scripts/forge-discovery.test.js`:

```javascript
// Need to save a test theme first
import { saveTheme } from '../../../scripts/lib/theme-utils.mjs';
import { rmSync } from 'fs';
import { join } from 'path';

let discoverFromTheme;

before(async () => {
  // ... (existing before block already loads discoverWords, getStageGaps)
  const mod = await import('../../../scripts/forge-discovery.mjs');
  discoverFromTheme = mod.discoverFromTheme;

  // Save a fixture theme for testing
  saveTheme({
    themeId: 'test-forge-discovery',
    areaWord: '学校',
    areaReading: 'がっこう',
    areaMeaning: 'school',
    areaRank: 952,
    avgRank: 2340,
    computedStage: 3,
    generatedAt: '2026-03-06',
    words: [
      { word: '先生', reading: 'せんせい', meaning: 'teacher', rank: 452,
        roles: ['creature', 'npc'], source: 'occupations', assigned: null, existingUses: [] },
      { word: '机', reading: 'つくえ', meaning: 'desk', rank: 2100,
        roles: ['item'], source: 'objects', assigned: 'item:tsukue-desk', existingUses: [] },
      { word: '教室', reading: 'きょうしつ', meaning: 'classroom', rank: 3200,
        roles: ['sub-area'], source: 'locations', assigned: null, existingUses: [] },
      { word: '厳しい', reading: 'きびしい', meaning: 'strict', rank: 3400,
        roles: ['modifier'], source: 'ai-generated', assigned: null, existingUses: [] },
      { word: '黒板', reading: 'こくばん', meaning: 'blackboard', rank: 8500,
        roles: ['item'], source: 'objects', assigned: null, existingUses: [] },
    ]
  });
});

after(() => {
  try { rmSync(join(process.cwd(), 'language', 'themes', 'test-forge-discovery.json')); } catch {}
});
```

```javascript
// ── discoverFromTheme ───────────────────────────────────────────────

describe('discoverFromTheme', () => {
  it('exports discoverFromTheme function', () => {
    assert.strictEqual(typeof discoverFromTheme, 'function');
  });

  it('returns all unassigned words when no role filter', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery' });
    // 机 is assigned → excluded. 4 unassigned words remain.
    assert.strictEqual(results.length, 4);
  });

  it('filters by role', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery', role: 'creature' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].word, '先生');
  });

  it('respects limit', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery', limit: 2 });
    assert.strictEqual(results.length, 2);
  });

  it('results are sorted by rank ascending', () => {
    const results = discoverFromTheme({ themeId: 'test-forge-discovery' });
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i].rank >= results[i - 1].rank);
    }
  });

  it('returns empty array for non-existent theme', () => {
    const results = discoverFromTheme({ themeId: 'nonexistent-xyz' });
    assert.deepStrictEqual(results, []);
  });

  it('includes assigned words when includeAssigned is true', () => {
    const results = discoverFromTheme({
      themeId: 'test-forge-discovery',
      role: 'item',
      includeAssigned: true
    });
    // Both 机 (assigned) and 黒板 (unassigned) have role=item
    assert.strictEqual(results.length, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/scripts/forge-discovery.test.js`
Expected: FAIL — `discoverFromTheme` is not exported

**Step 3: Implement discoverFromTheme**

Add to `scripts/forge-discovery.mjs` (after the existing imports, add):

```javascript
import { getThemeWords } from './lib/theme-utils.mjs';
```

Add the function (after `getStageGaps`, before CLI section):

```javascript
/**
 * Discover candidate words from a theme pool file.
 *
 * @param {Object} opts
 * @param {string} opts.themeId - Theme ID (matches filename in language/themes/)
 * @param {string} [opts.role] - Filter by role (creature, modifier, item, npc, sub-area, move)
 * @param {number} [opts.limit=20] - Max results
 * @param {boolean} [opts.includeAssigned=false] - Include already-assigned words
 * @returns {Array<{word, reading, meaning, rank, roles, assigned, source}>}
 */
export function discoverFromTheme({ themeId, role, limit = 20, includeAssigned = false }) {
  const words = getThemeWords(themeId, {
    role,
    unassignedOnly: !includeAssigned,
  });
  // Already sorted by rank in theme file, but ensure it
  words.sort((a, b) => a.rank - b.rank);
  return words.slice(0, limit);
}
```

Update the CLI `main()` function to handle `--theme`:

Add to `parseArgs` options:
```javascript
theme: { type: 'string' },
role:  { type: 'string', short: 'r' },
```

Add a new CLI branch (after gap analysis, before word discovery):
```javascript
// Theme discovery mode
if (values.theme && values.theme !== 'true') {
  const results = discoverFromTheme({
    themeId: values.theme,
    role: values.role,
    limit,
    includeAssigned: false,
  });

  console.log(`\nTheme: ${values.theme} (role: ${values.role || 'all'}, limit ${limit})`);
  console.log('─'.repeat(70));
  console.log('Rank   Word        Reading       Roles              Meaning');
  console.log('─'.repeat(70));

  for (const r of results) {
    console.log(
      `${String(r.rank).padStart(5)}  ${r.word.padEnd(10)}  ${r.reading.padEnd(12)}  ${r.roles.join(',').padEnd(18)}  ${r.meaning}`
    );
  }

  console.log('─'.repeat(70));
  console.log(`${results.length} candidates found`);
  return;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/scripts/forge-discovery.test.js`
Expected: All tests PASS (old + new)

**Step 5: Commit**

```bash
git add scripts/forge-discovery.mjs tests/unit/scripts/forge-discovery.test.js
git commit -m "feat: add --theme mode to forge-discovery for theme pool word selection"
```

---

### Task 4: forge-discovery --theme-status Mode

**Files:**
- Modify: `scripts/forge-discovery.mjs` (add ~40 lines)
- Modify: `tests/unit/scripts/forge-discovery.test.js` (add ~20 lines)

**Step 1: Write the failing test**

```javascript
let getThemeStatus;

before(async () => {
  // ... existing
  getThemeStatus = mod.getThemeStatus;
});

describe('getThemeStatus', () => {
  it('exports getThemeStatus function', () => {
    assert.strictEqual(typeof getThemeStatus, 'function');
  });

  it('returns an array of theme status objects', () => {
    // test-forge-discovery theme was saved in Task 3 before() hook
    const statuses = getThemeStatus();
    assert.ok(Array.isArray(statuses));
    const testTheme = statuses.find(s => s.themeId === 'test-forge-discovery');
    assert.ok(testTheme, 'test-forge-discovery should appear in status');
    assert.strictEqual(testTheme.totalWords, 5);
    assert.strictEqual(testTheme.assignedCount, 1); // 机 is assigned
    assert.strictEqual(testTheme.unassignedCount, 4);
    assert.strictEqual(typeof testTheme.computedStage, 'number');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/scripts/forge-discovery.test.js`
Expected: FAIL — `getThemeStatus` is not exported

**Step 3: Implement getThemeStatus**

Add to `scripts/forge-discovery.mjs`:

```javascript
import { listThemes, loadTheme } from './lib/theme-utils.mjs';
```

(Merge with existing theme-utils import from Task 3.)

```javascript
/**
 * Get status summary for all theme pool files.
 * @returns {Array<{themeId, areaWord, areaMeaning, computedStage, totalWords, assignedCount, unassignedCount, roleBreakdown}>}
 */
export function getThemeStatus() {
  const themeIds = listThemes();
  return themeIds.map(themeId => {
    const theme = loadTheme(themeId);
    const assigned = theme.words.filter(w => w.assigned !== null);
    const roles = {};
    for (const w of theme.words) {
      for (const r of w.roles) {
        roles[r] = (roles[r] || 0) + 1;
      }
    }
    return {
      themeId,
      areaWord: theme.areaWord,
      areaMeaning: theme.areaMeaning,
      computedStage: theme.computedStage,
      totalWords: theme.words.length,
      assignedCount: assigned.length,
      unassignedCount: theme.words.length - assigned.length,
      roleBreakdown: roles,
    };
  });
}
```

Add CLI branch for `--theme-status` (in `main()`, after the `--gaps` branch):

Add to `parseArgs`:
```javascript
'theme-status': { type: 'boolean' },
```

```javascript
// Theme status mode
if (values['theme-status']) {
  const statuses = getThemeStatus();
  if (statuses.length === 0) {
    console.log('\nNo theme pools found. Generate one with: /generate-theme-pool <theme>');
    return;
  }
  console.log(`\nTheme Pool Status (${statuses.length} themes)`);
  console.log('─'.repeat(80));
  console.log('Theme          Area     Stage  Words  Assigned  Available');
  console.log('─'.repeat(80));
  for (const s of statuses) {
    console.log(
      `${s.themeId.padEnd(15)}${s.areaWord.padEnd(8)} S${s.computedStage}     ${String(s.totalWords).padStart(4)}    ${String(s.assignedCount).padStart(4)}       ${String(s.unassignedCount).padStart(4)}`
    );
  }
  console.log('─'.repeat(80));
  return;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/scripts/forge-discovery.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add scripts/forge-discovery.mjs tests/unit/scripts/forge-discovery.test.js
git commit -m "feat: add --theme-status mode to forge-discovery for theme pool overview"
```

---

### Task 5: Theme Pool Enrichment Helpers

**Files:**
- Create: `scripts/lib/theme-pool-helpers.mjs`
- Create: `tests/unit/scripts/theme-pool-helpers.test.js`

Pure functions for processing theme pool candidates: cross-referencing existing data, filtering, role assignment, and avgRank computation. No JPDB API calls (those are handled by the orchestrator).

**Step 1: Write failing tests**

```javascript
// tests/unit/scripts/theme-pool-helpers.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let crossReferenceExisting, filterCandidates, assignRoles, computeThemeStats;

before(async () => {
  const mod = await import('../../../scripts/lib/theme-pool-helpers.mjs');
  crossReferenceExisting = mod.crossReferenceExisting;
  filterCandidates = mod.filterCandidates;
  assignRoles = mod.assignRoles;
  computeThemeStats = mod.computeThemeStats;
});

// ── crossReferenceExisting ──────────────────────────────────────────

describe('crossReferenceExisting', () => {
  it('annotates words found in creatures.json', () => {
    // 亀 is baseWord for kamedor in creatures.json
    const candidates = [
      { word: '亀', reading: 'かめ', meaning: 'turtle', rank: 9300 },
      { word: '未知の単語', reading: 'みちのたんご', meaning: 'unknown word', rank: 5000 },
    ];
    const result = crossReferenceExisting(candidates);
    const kame = result.find(w => w.word === '亀');
    assert.ok(kame.existingUses.length > 0, '亀 should have existing uses');
    assert.ok(kame.existingUses.some(u => u.includes('creature')));
  });

  it('returns empty existingUses for words not in any data file', () => {
    const candidates = [
      { word: '存在しない', reading: 'そんざいしない', meaning: 'does not exist', rank: 99999 },
    ];
    const result = crossReferenceExisting(candidates);
    assert.deepStrictEqual(result[0].existingUses, []);
  });
});

// ── filterCandidates ────────────────────────────────────────────────

describe('filterCandidates', () => {
  it('removes words with rank > 30000', () => {
    const candidates = [
      { word: 'a', rank: 1000 },
      { word: 'b', rank: 31000 },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].word, 'a');
  });

  it('removes words with null rank', () => {
    const candidates = [
      { word: 'a', rank: 1000 },
      { word: 'b', rank: null },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
  });

  it('deduplicates by word', () => {
    const candidates = [
      { word: '犬', rank: 1351 },
      { word: '犬', rank: 1351 },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result.length, 1);
  });

  it('sorts by rank ascending', () => {
    const candidates = [
      { word: 'b', rank: 5000 },
      { word: 'a', rank: 1000 },
    ];
    const result = filterCandidates(candidates);
    assert.strictEqual(result[0].word, 'a');
  });
});

// ── assignRoles ─────────────────────────────────────────────────────

describe('assignRoles', () => {
  it('assigns creature/item/npc/sub-area roles to nouns', () => {
    const candidates = [{ word: '犬', pos: ['noun'], rank: 1351 }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('creature'));
    assert.ok(result[0].roles.includes('item'));
  });

  it('assigns modifier role to adjectives', () => {
    const candidates = [{ word: '大きい', pos: ['adjective'], rank: 500 }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('modifier'));
  });

  it('assigns move/creature role to verbs', () => {
    const candidates = [{ word: '走る', pos: ['verb'], rank: 800 }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.includes('move'));
    assert.ok(result[0].roles.includes('creature'));
  });

  it('assigns broad roles when no pos info', () => {
    const candidates = [{ word: '何か', rank: 500 }];
    const result = assignRoles(candidates);
    assert.ok(result[0].roles.length > 0);
  });
});

// ── computeThemeStats ───────────────────────────────────────────────

describe('computeThemeStats', () => {
  it('computes avgRank from word ranks', () => {
    const words = [{ rank: 1000 }, { rank: 2000 }, { rank: 3000 }];
    const stats = computeThemeStats(words);
    assert.strictEqual(stats.avgRank, 2000);
  });

  it('computes computedStage from avgRank', () => {
    const words = [{ rank: 1000 }, { rank: 2000 }, { rank: 3000 }];
    const stats = computeThemeStats(words);
    // avgRank=2000 → stage 3 (cap 2000)
    assert.strictEqual(stats.computedStage, 3);
  });

  it('counts role distribution', () => {
    const words = [
      { roles: ['creature', 'npc'] },
      { roles: ['item'] },
      { roles: ['creature'] },
    ];
    const stats = computeThemeStats(words);
    assert.strictEqual(stats.roleCounts.creature, 2);
    assert.strictEqual(stats.roleCounts.item, 1);
    assert.strictEqual(stats.roleCounts.npc, 1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/scripts/theme-pool-helpers.test.js`
Expected: FAIL — module does not exist

**Step 3: Implement theme-pool-helpers.mjs**

```javascript
// scripts/lib/theme-pool-helpers.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeStageFromAvgRank } from '../../language/stage-utils.js';

const ROOT = process.cwd();

function loadJsonSafe(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) return Object.values(data);
    return [];
  } catch { return []; }
}

/**
 * Cross-reference candidate words against all existing game data files.
 * Annotates each candidate with `existingUses` array (e.g., ["creature:kamedor"]).
 * Does NOT filter — just annotates for visibility.
 */
export function crossReferenceExisting(candidates) {
  // Build lookup: word → array of usage strings
  const usageMap = new Map();

  const creatures = loadJsonSafe(join(ROOT, 'data', 'creatures.json'));
  for (const c of creatures) {
    if (c.baseWord) {
      if (!usageMap.has(c.baseWord)) usageMap.set(c.baseWord, []);
      usageMap.get(c.baseWord).push(`creature:${c.id}`);
    }
    if (c.modifier?.word) {
      if (!usageMap.has(c.modifier.word)) usageMap.set(c.modifier.word, []);
      usageMap.get(c.modifier.word).push(`creature-mod:${c.id}`);
    }
  }

  const moves = loadJsonSafe(join(ROOT, 'data', 'moves.json'));
  for (const m of moves) {
    if (m.name) {
      if (!usageMap.has(m.name)) usageMap.set(m.name, []);
      usageMap.get(m.name).push(`move:${m.id}`);
    }
  }

  const items = loadJsonSafe(join(ROOT, 'data', 'items.json'));
  for (const item of items) {
    for (const comp of (item.components || [])) {
      if (comp.word) {
        if (!usageMap.has(comp.word)) usageMap.set(comp.word, []);
        usageMap.get(comp.word).push(`item:${item.id}`);
      }
    }
  }

  const areas = [
    ...loadJsonSafe(join(ROOT, 'data', 'areas.json')),
    ...loadJsonSafe(join(ROOT, 'data', 'new-areas-staging.json')),
  ];
  for (const area of areas) {
    for (const sa of (area.subAreas || [])) {
      if (sa.modifier?.word) {
        if (!usageMap.has(sa.modifier.word)) usageMap.set(sa.modifier.word, []);
        usageMap.get(sa.modifier.word).push(`area-mod:${area.id}`);
      }
      if (sa.location?.word) {
        if (!usageMap.has(sa.location.word)) usageMap.set(sa.location.word, []);
        usageMap.get(sa.location.word).push(`area-loc:${area.id}`);
      }
    }
  }

  const npcs = [
    ...loadJsonSafe(join(ROOT, 'data', 'npcs.json')),
    ...loadJsonSafe(join(ROOT, 'data', 'new-npcs-staging.json')),
  ];
  for (const npc of npcs) {
    if (npc.baseWord) {
      if (!usageMap.has(npc.baseWord)) usageMap.set(npc.baseWord, []);
      usageMap.get(npc.baseWord).push(`npc:${npc.id}`);
    }
  }

  return candidates.map(c => ({
    ...c,
    existingUses: usageMap.get(c.word) || [],
  }));
}

/**
 * Filter and deduplicate candidates:
 * - Remove rank > 30000
 * - Remove null rank
 * - Deduplicate by word
 * - Sort by rank ascending
 */
export function filterCandidates(candidates) {
  const seen = new Set();
  const filtered = [];
  for (const c of candidates) {
    if (c.rank == null || c.rank > 30000) continue;
    if (seen.has(c.word)) continue;
    seen.add(c.word);
    filtered.push(c);
  }
  filtered.sort((a, b) => a.rank - b.rank);
  return filtered;
}

// POS tag patterns for role assignment
const NOUN_PATTERNS = ['noun', 'independent noun', 'proper noun'];
const ADJ_PATTERNS = ['adjective', 'い adjective', 'な adjective', 'の adjective'];
const VERB_PATTERNS = ['godan verb', 'ichidan verb', 'する verb', 'transitive verb', 'intransitive verb', 'verb'];

/**
 * Assign suggested roles to candidates based on POS tags.
 * Nouns → creature, item, npc, sub-area
 * Adjectives → modifier
 * Verbs → move, creature
 * Unknown POS → creature, item (safe defaults)
 */
export function assignRoles(candidates) {
  return candidates.map(c => {
    const pos = c.pos || [];
    const posLower = pos.map(p => p.toLowerCase());
    const roles = [];

    const isNoun = posLower.some(p => NOUN_PATTERNS.some(n => p.includes(n)));
    const isAdj = posLower.some(p => ADJ_PATTERNS.some(a => p.includes(a)));
    const isVerb = posLower.some(p => VERB_PATTERNS.some(v => p.includes(v)));

    if (isNoun) roles.push('creature', 'item', 'npc', 'sub-area');
    if (isAdj) roles.push('modifier');
    if (isVerb) roles.push('move', 'creature');

    // Default: if no POS matched, assign broad roles
    if (roles.length === 0) roles.push('creature', 'item');

    return { ...c, roles: [...new Set(roles)] };
  });
}

/**
 * Compute aggregate stats for a theme word list.
 * @param {Array<{rank: number, roles?: string[]}>} words
 * @returns {{ avgRank: number, computedStage: number, roleCounts: Object }}
 */
export function computeThemeStats(words) {
  const rankedWords = words.filter(w => typeof w.rank === 'number');
  const avgRank = rankedWords.length > 0
    ? Math.round(rankedWords.reduce((sum, w) => sum + w.rank, 0) / rankedWords.length)
    : 0;

  const roleCounts = {};
  for (const w of words) {
    for (const r of (w.roles || [])) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }
  }

  return {
    avgRank,
    computedStage: computeStageFromAvgRank(avgRank),
    roleCounts,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/scripts/theme-pool-helpers.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add scripts/lib/theme-pool-helpers.mjs tests/unit/scripts/theme-pool-helpers.test.js
git commit -m "feat: add theme-pool-helpers for cross-referencing, filtering, and role assignment"
```

---

### Task 6: generate-theme-pool.mjs Script

**Files:**
- Create: `scripts/generate-theme-pool.mjs`

This is the Node.js helper script called by the generate-theme-pool skill. It handles the non-AI data pipeline: takes a JSON file of candidate words (produced by subagent orchestration), runs JPDB enrichment, cross-references, filters, and writes the final theme file.

The script has **two modes**:
1. `--process` mode: takes a candidates JSON file, enriches with JPDB, cross-refs, writes theme file
2. `--validate` mode: validates an existing theme file

**Step 1: Create the script**

```javascript
#!/usr/bin/env node

/**
 * generate-theme-pool.mjs — Data pipeline for theme pool generation.
 *
 * Called by the generate-theme-pool Claude Code skill after subagent
 * category scanning produces a candidate list.
 *
 * Usage:
 *   # Process candidates into a theme file (JPDB enrichment + cross-ref + filter)
 *   node scripts/generate-theme-pool.mjs --process /tmp/candidates.json \
 *     --theme school --area-word 学校 --area-reading がっこう --area-meaning school
 *
 *   # Validate an existing theme file
 *   node scripts/generate-theme-pool.mjs --validate school
 */

import { readFileSync } from 'fs';
import { parseArgs } from 'util';
import { parseBatch, lookupVocab } from './lib/jpdb-helpers.mjs';
import { crossReferenceExisting, filterCandidates, assignRoles, computeThemeStats } from './lib/theme-pool-helpers.mjs';
import { saveTheme, loadTheme, validateTheme } from './lib/theme-utils.mjs';

function loadApiKey() {
  try {
    return readFileSync('data/.creature-forge-jpdb-key', 'utf8').trim();
  } catch {
    throw new Error('JPDB API key not found at data/.creature-forge-jpdb-key');
  }
}

/**
 * Enrich candidates with JPDB frequency rank and verified readings.
 * Input: array of { word, reading?, meaning?, source }
 * Output: same array with rank, reading, meaning filled in from JPDB
 */
async function enrichWithJpdb(candidates, apiKey) {
  // Step 1: Parse all candidate words to get vid/sid
  const words = candidates.map(c => c.word);
  console.log(`  JPDB parse: ${words.length} words...`);
  const parseResult = await parseBatch(words, apiKey, {
    vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
    batchSize: 30,
    interBatchDelayMs: 1000,
  });

  // Map parsed results back to candidates
  const vidSidPairs = [];
  const validIndices = [];
  for (let i = 0; i < candidates.length; i++) {
    const entry = parseResult.vocabulary.find(v => v[0] === candidates[i].word);
    if (entry && entry[2] != null) {
      vidSidPairs.push([entry[2], entry[3]]);
      validIndices.push(i);
      candidates[i]._vid = entry[2];
      candidates[i]._sid = entry[3];
      candidates[i].reading = candidates[i].reading || entry[1];
      candidates[i].meaning = candidates[i].meaning || (entry[4] || []).flat().join('; ');
    }
  }

  if (vidSidPairs.length === 0) return candidates;

  // Step 2: Lookup frequency ranks
  console.log(`  JPDB lookup: ${vidSidPairs.length} valid entries...`);
  const lookupResult = await lookupVocab(vidSidPairs, apiKey,
    ['spelling', 'reading', 'frequency_rank', 'meanings', 'part_of_speech'],
    { batchSize: 500, interBatchDelayMs: 1000 }
  );

  for (let j = 0; j < validIndices.length; j++) {
    const i = validIndices[j];
    const info = lookupResult.vocabulary_info[j];
    // Fields: [spelling, reading, frequency_rank, meanings, part_of_speech]
    candidates[i].reading = info[1] || candidates[i].reading;
    candidates[i].rank = info[2];
    candidates[i].meaning = candidates[i].meaning || (info[3] || []).flat().join('; ');
    candidates[i].pos = info[4] || [];
  }

  return candidates;
}

async function processMode(candidatesPath, themeId, areaWord, areaReading, areaMeaning) {
  const apiKey = loadApiKey();

  // Load candidates (from subagent output)
  const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  console.log(`Loaded ${candidates.length} candidates from ${candidatesPath}`);

  // Step 1: JPDB enrichment
  console.log('\n1. JPDB enrichment...');
  await enrichWithJpdb(candidates, apiKey);

  // Step 2: Filter (rank > 30000, null rank, dedup)
  console.log('\n2. Filtering...');
  const filtered = filterCandidates(candidates);
  console.log(`  ${candidates.length} → ${filtered.length} after filtering`);

  // Step 3: Assign roles
  console.log('\n3. Assigning roles...');
  const roled = assignRoles(filtered);

  // Step 4: Cross-reference existing data
  console.log('\n4. Cross-referencing existing data...');
  const crossRefed = crossReferenceExisting(roled);

  // Step 5: Compute stats
  const stats = computeThemeStats(crossRefed);
  console.log(`\n5. Stats: avgRank=${stats.avgRank}, stage=${stats.computedStage}`);

  // Step 6: Look up area word rank
  console.log('\n6. Looking up area word rank...');
  let areaRank = null;
  try {
    const areaResult = await parseBatch([areaWord], apiKey, {
      vocabularyFields: ['spelling', 'reading', 'vid', 'sid'],
      batchSize: 1,
    });
    if (areaResult.vocabulary.length > 0 && areaResult.vocabulary[0][2] != null) {
      const areaLookup = await lookupVocab(
        [[areaResult.vocabulary[0][2], areaResult.vocabulary[0][3]]],
        apiKey, ['frequency_rank'], { batchSize: 1 }
      );
      areaRank = areaLookup.vocabulary_info[0]?.[0] || null;
    }
  } catch (err) {
    console.warn(`  Warning: could not look up area word rank: ${err.message}`);
  }
  console.log(`  Area word "${areaWord}" rank: ${areaRank}`);

  // Step 7: Build and save theme
  const theme = {
    themeId,
    areaWord,
    areaReading,
    areaMeaning,
    areaRank,
    avgRank: stats.avgRank,
    computedStage: stats.computedStage,
    generatedAt: new Date().toISOString().split('T')[0],
    words: crossRefed.map(w => ({
      word: w.word,
      reading: w.reading,
      meaning: w.meaning,
      rank: w.rank,
      roles: w.roles,
      source: w.source || 'unknown',
      assigned: null,
      existingUses: w.existingUses,
    })),
  };

  const errors = validateTheme(theme);
  if (errors.length > 0) {
    console.error('\nValidation errors:', errors);
    process.exit(1);
  }

  const path = saveTheme(theme);
  console.log(`\nTheme saved to: ${path}`);

  // Summary
  console.log(`\nTheme: ${themeId} (${areaWord})`);
  console.log(`Pool: ${theme.words.length} words`);
  console.log(`Avg rank: ${stats.avgRank} → Stage ${stats.computedStage}`);
  console.log(`Roles: ${Object.entries(stats.roleCounts).map(([r, c]) => `${c} ${r}`).join(', ')}`);
  const withUses = theme.words.filter(w => w.existingUses.length > 0);
  if (withUses.length > 0) {
    console.log(`Already used: ${withUses.length} words (annotated, not filtered)`);
  }
}

function validateMode(themeId) {
  const theme = loadTheme(themeId);
  if (!theme) {
    console.error(`Theme "${themeId}" not found`);
    process.exit(1);
  }
  const errors = validateTheme(theme);
  if (errors.length > 0) {
    console.error('Validation errors:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Theme "${themeId}" is valid (${theme.words.length} words, stage ${theme.computedStage})`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      process:      { type: 'string' },
      validate:     { type: 'string' },
      theme:        { type: 'string' },
      'area-word':  { type: 'string' },
      'area-reading': { type: 'string' },
      'area-meaning': { type: 'string' },
    },
    strict: false,
  });

  if (values.validate) {
    validateMode(values.validate);
    return;
  }

  if (values.process) {
    if (!values.theme || !values['area-word'] || !values['area-reading'] || !values['area-meaning']) {
      console.error('--process requires --theme, --area-word, --area-reading, --area-meaning');
      process.exit(1);
    }
    await processMode(
      values.process,
      values.theme,
      values['area-word'],
      values['area-reading'],
      values['area-meaning']
    );
    return;
  }

  console.error('Usage:');
  console.error('  node scripts/generate-theme-pool.mjs --process /tmp/candidates.json \\');
  console.error('    --theme school --area-word 学校 --area-reading がっこう --area-meaning school');
  console.error('  node scripts/generate-theme-pool.mjs --validate school');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Syntax check**

Run: `node --check scripts/generate-theme-pool.mjs && echo "OK"`
Expected: OK

**Step 3: Verify --validate mode works (requires a theme from earlier tests)**

Run: `node scripts/generate-theme-pool.mjs --validate nonexistent-theme`
Expected: Error message `Theme "nonexistent-theme" not found`

**Step 4: Commit**

```bash
git add scripts/generate-theme-pool.mjs
git commit -m "feat: add generate-theme-pool script for JPDB enrichment and theme file creation"
```

---

### Task 7: generate-theme-pool Skill

**Files:**
- Create: `.claude/plugins/koto-forge/1.1.0/skills/generate-theme-pool/SKILL.md`
- Create symlink: `.claude/commands/generate-theme-pool.md` → skill

This is the Claude Code skill that orchestrates the full theme pool generation. It dispatches subagents for category scanning and AI gap-fill, then calls the Node script for data processing.

**Step 1: Create the SKILL.md**

Write to `.claude/plugins/koto-forge/1.1.0/skills/generate-theme-pool/SKILL.md`:

````markdown
---
name: generate-theme-pool
description: Generate a theme pool file from category scanning + AI gap-fill + JPDB enrichment. Usage: /generate-theme-pool <theme-concept> [area-word]
---

# Generate Theme Pool

Generates a `language/themes/<themeId>.json` file using the 3-filter thematic-frequency hybrid algorithm from the design doc.

## Input

- **Theme concept** (required): English concept word, e.g., "school", "ocean", "kitchen"
- **Area word** (optional): Japanese location word, e.g., "学校". If not provided, the user picks from AI suggestions.

## Phase 0: Setup

1. Parse args: theme concept and optional area word.
2. If no area word provided, brainstorm 3-5 Japanese location words that match the theme. Present to user with JPDB rank and meanings. User picks one.
3. Look up the area word via JPDB API (use `scripts/lib/jpdb-helpers.mjs` patterns — `parseBatch` then `lookupVocab`) to confirm rank and reading.
4. Set `themeId` = lowercase English concept (e.g., "school", "ocean").

## Phase 1: Category Scanning (Parallel Subagents)

**IMPORTANT: Use subagents, NOT paid AI APIs.**

The 17 category files in `language/categories/` are too large for a single context. Dispatch **parallel subagents** to scan them.

Split the 17 category files into 5-6 batches of 2-3 files each:

| Batch | Files |
|-------|-------|
| 1 | `animals.json`, `nature.json`, `foods.json` |
| 2 | `objects.json`, `clothing.json`, `body-parts.json` |
| 3 | `actions.json`, `movement.json`, `combat.json` |
| 4 | `descriptors.json`, `emotions.json`, `colors.json` |
| 5 | `locations.json`, `occupations.json`, `social.json` |
| 6 | `abstract.json`, `numbers-time.json` |

For each batch, dispatch a **sonnet subagent** with this prompt:

```
You are scanning Japanese vocabulary category files for words thematically
associated with the concept: "{THEME_CONCEPT}"

Read these category files:
{LIST_OF_FILE_PATHS}

For each file, identify words that would naturally appear in or be associated
with a {THEME_CONCEPT} setting. Include words that:
- Name things found in this setting (objects, creatures, people, places)
- Describe qualities of this setting (adjectives, modifiers)
- Represent actions that happen in this setting (verbs)

Be INCLUSIVE — cast a wide net. It's better to include borderline words
(they'll be filtered later) than to miss good ones.

Return a JSON array of objects, each with: { word, reading, meaning, rank, source }
where source is the filename (without .json).
Return ONLY the JSON array, no other text.
```

Each subagent reads its batch files using the Read tool and returns JSON.

## Phase 2: AI Gap-Fill (Subagent)

Dispatch one **opus subagent** to generate 20-30 additional thematic words NOT found in any category file:

```
Generate 20-30 Japanese words thematically associated with "{THEME_CONCEPT}"
that would NOT typically appear in general vocabulary category files.

Think about:
- Specialized terminology for this setting
- Compound words specific to this context
- Less common but highly thematic words

For each word, provide: { word, reading, meaning, source: "ai-generated" }
Do NOT include rank (it will be looked up via JPDB).
Return ONLY the JSON array, no other text.
```

## Phase 3: Merge & Process

1. Collect all subagent results into a single candidates array.
2. Deduplicate by `word` field.
3. Write merged candidates to `/tmp/theme-pool-{themeId}-candidates.json`.
4. Run the processing script:

```bash
node scripts/generate-theme-pool.mjs --process /tmp/theme-pool-{themeId}-candidates.json \
  --theme {themeId} \
  --area-word {areaWord} \
  --area-reading {areaReading} \
  --area-meaning {areaMeaning}
```

This script:
- Enriches all candidates with JPDB frequency ranks
- Filters out rank > 30,000 and null-rank words
- Assigns roles based on POS (noun → creature/item/npc/sub-area, adj → modifier, verb → move/creature)
- Cross-references against existing game data (creatures.json, moves.json, items.json, areas.json, npcs.json)
- Computes avgRank and computedStage
- Writes `language/themes/{themeId}.json`

## Phase 4: Review & Present

1. Read the generated theme file.
2. Present summary to user:
   - Theme name, area word, computed stage
   - Total word count, role breakdown
   - Words with existing uses (already in game data)
   - Top 10 creature candidates, top 10 item candidates, etc.
3. Ask user if adjustments are needed.
4. Run validation: `node scripts/generate-theme-pool.mjs --validate {themeId}`

## Output

The theme pool file at `language/themes/{themeId}.json` is ready for use by forge skills:
- `/creature-forge --theme {themeId}` to forge creatures from this pool
- `/area-forge --theme {themeId}` to forge the area
- `/item-forge --theme {themeId}` to forge items
- `/npc-forge --theme {themeId}` to forge NPCs
- `node scripts/forge-discovery.mjs --theme {themeId} --role creature` to browse candidates
- `node scripts/forge-discovery.mjs --theme-status` to see all theme statuses
````

**Step 2: Create the symlink**

```bash
ln -sf "$(pwd)/.claude/plugins/koto-forge/1.1.0/skills/generate-theme-pool/SKILL.md" \
  .claude/commands/generate-theme-pool.md
```

**Step 3: Verify symlink works**

```bash
ls -la .claude/commands/generate-theme-pool.md
```

**Step 4: Commit**

```bash
git add .claude/plugins/koto-forge/1.1.0/skills/generate-theme-pool/SKILL.md
git add .claude/commands/generate-theme-pool.md
git commit -m "feat: add generate-theme-pool skill for AI-powered theme pool creation"
```

---

### Task 8: Update creature-forge Skill

**Files:**
- Modify: `.claude/plugins/koto-forge/1.1.0/skills/creature-forge/SKILL.md`

Add `--theme` mode to Phase 0 (Foundation). When `--theme <themeId>` is provided, skip forge-discovery and instead use theme pool words.

**Step 1: Edit the SKILL.md**

Add a new input mode section alongside existing "Direct mode" and "Discovery mode":

```markdown
### Theme Mode: `/creature-forge --theme school`

1. Run `node scripts/forge-discovery.mjs --theme school --role creature --limit 10`
2. Present the candidates to the user (these are unassigned creature-role words from the theme pool).
3. User picks one.
4. Continue with Phase 0 JPDB lookup as normal.
5. **After Phase 5 (Save):** Mark the word as assigned in the theme file:
   - Read `language/themes/school.json`
   - Find the word entry, set `assigned` to `"creature:<creature-id>"`
   - Save the theme file back
```

Also add a "Move Thematic Discovery" sub-step after the creature concept is locked (Phase 2), as specified in the design doc:

```markdown
### Move Thematic Discovery (Theme Mode only)

After the creature's concept and element are locked, suggest thematically fitting
verb concepts for its learnset:

1. Read `data/moves.json` for existing moves.
2. Based on the creature's concept (e.g., fox → bite, sneak, howl, trick), identify
   verbs that match thematically.
3. Cross-reference against existing moves — if matches exist, prioritize them.
4. If gaps exist (needed verbs don't have moves), flag them for future `/move-forge`.
5. Pass the suggested move list to the learnset-builder subagent via the baton.
```

**Step 2: Commit**

```bash
git add .claude/plugins/koto-forge/1.1.0/skills/creature-forge/SKILL.md
git commit -m "feat: add --theme mode to creature-forge skill"
```

---

### Task 9: Update area-forge Skill

**Files:**
- Modify: `.claude/plugins/koto-forge/1.1.0/skills/area-forge/SKILL.md`

When `--theme <themeId>` is provided, the area word, rank, and stage come from the theme file. Sub-areas draw modifier + location words from the theme pool.

**Step 1: Edit the SKILL.md**

Add theme mode section:

```markdown
### Theme Mode: `/area-forge --theme school`

1. Read `language/themes/school.json` for area word, reading, meaning, rank, stage.
2. Skip JPDB lookup (already in theme file).
3. Skip forge-discovery for the area word (already determined by theme).
4. For creature matching (Phase 1): prefer creatures whose `baseWord` appears in the
   theme pool's creature-role words.
5. For sub-area generation (Phase 2.5):
   - Run `node scripts/forge-discovery.mjs --theme school --role modifier --limit 10`
     for modifier candidates.
   - Run `node scripts/forge-discovery.mjs --theme school --role sub-area --limit 10`
     for location noun candidates.
   - Draw sub-area modifiers and locations from theme pool words first, falling back
     to forge-discovery category mode if not enough candidates.
6. **After save:** Mark used modifier and location words as assigned in the theme file.
```

**Step 2: Commit**

```bash
git add .claude/plugins/koto-forge/1.1.0/skills/area-forge/SKILL.md
git commit -m "feat: add --theme mode to area-forge skill"
```

---

### Task 10: Update item-forge and npc-forge Skills

**Files:**
- Modify: `.claude/plugins/koto-forge/1.1.0/skills/item-forge/SKILL.md`
- Modify: `.claude/plugins/koto-forge/1.1.0/skills/npc-forge/SKILL.md`

**Step 1: Edit item-forge SKILL.md**

Add theme mode section:

```markdown
### Theme Mode: `/item-forge --theme school`

1. Run `node scripts/forge-discovery.mjs --theme school --role item --limit 20`
   to get item candidates from the theme pool.
2. Use these words as seeds for compound item brainstorming (Phase 1).
3. Prioritize items whose component words come from the theme pool.
4. **After save:** Mark used words as assigned in the theme file.
```

**Step 2: Edit npc-forge SKILL.md**

Add theme mode section:

```markdown
### Theme Mode: `/npc-forge --theme school`

1. Area is determined by the theme — skip area selection.
2. Run `node scripts/forge-discovery.mjs --theme school --role npc --limit 20`
   for NPC base word candidates from the theme pool.
3. Continue with Phase 1 (Concept & Naming) using theme pool candidates.
4. **After save:** Mark used words as assigned in the theme file.
```

**Step 3: Commit**

```bash
git add .claude/plugins/koto-forge/1.1.0/skills/item-forge/SKILL.md \
        .claude/plugins/koto-forge/1.1.0/skills/npc-forge/SKILL.md
git commit -m "feat: add --theme mode to item-forge and npc-forge skills"
```

---

### Task 11: Run Full Test Suite

**Files:** None (verification only)

**Step 1: Run all unit tests**

Run: `npm run test:unit`
Expected: All PASS, including new theme-utils, theme-pool-helpers, forge-discovery, and stage-utils tests.

**Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: All PASS (no integration tests changed, but verify no regressions).

**Step 3: Syntax check all new/modified files**

```bash
node --check scripts/lib/theme-utils.mjs && \
node --check scripts/lib/theme-pool-helpers.mjs && \
node --check scripts/generate-theme-pool.mjs && \
node --check scripts/forge-discovery.mjs && \
node --check language/stage-utils.js && \
echo "All OK"
```

Expected: "All OK"

**Step 4: Verify forge-discovery CLI still works**

```bash
node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 5
node scripts/forge-discovery.mjs --gaps creature
node scripts/forge-discovery.mjs --theme-status
```

Expected: All three produce formatted output without errors.

---

## File Summary

| Action | File | Description |
|--------|------|-------------|
| Create | `scripts/lib/theme-utils.mjs` | Theme pool file I/O and validation |
| Create | `tests/unit/scripts/theme-utils.test.js` | Tests for theme-utils |
| Create | `scripts/lib/theme-pool-helpers.mjs` | Cross-referencing, filtering, role assignment |
| Create | `tests/unit/scripts/theme-pool-helpers.test.js` | Tests for theme-pool-helpers |
| Create | `scripts/generate-theme-pool.mjs` | JPDB enrichment + theme file pipeline script |
| Create | `.claude/plugins/koto-forge/1.1.0/skills/generate-theme-pool/SKILL.md` | AI orchestration skill |
| Create | `.claude/commands/generate-theme-pool.md` | Symlink to skill |
| Modify | `language/stage-utils.js` | Add `computeStageFromAvgRank()` |
| Modify | `tests/unit/stages/stage-utils.test.js` | Tests for new function |
| Modify | `scripts/forge-discovery.mjs` | Add `--theme`, `--theme-status`, `discoverFromTheme()`, `getThemeStatus()` |
| Modify | `tests/unit/scripts/forge-discovery.test.js` | Tests for new modes |
| Modify | `.claude/plugins/.../creature-forge/SKILL.md` | Add `--theme` mode docs |
| Modify | `.claude/plugins/.../area-forge/SKILL.md` | Add `--theme` mode docs |
| Modify | `.claude/plugins/.../item-forge/SKILL.md` | Add `--theme` mode docs |
| Modify | `.claude/plugins/.../npc-forge/SKILL.md` | Add `--theme` mode docs |
| Create | `language/themes/` | Directory (created by theme-utils on first save) |

**Unchanged:** Runtime game code, data file schemas, move-forge, existing forge-discovery modes.
