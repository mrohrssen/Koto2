# Bootstrap Language System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Teach absolute beginners their first ~100 Japanese words through hand-authored narration with progressive word replacement, before transitioning to AI-generated narration.

**Architecture:** A three-phase narration model — Phase 1 (Bootstrap) uses hand-authored English narration with tagged Japanese word replacements `{english|kanji|hiragana|romaji}`, Phase 2 (Transition) uses AI narration with mixed English/Japanese, Phase 3 (Full Japanese) uses the existing i+1 system. A per-player word tracker records exposures and determines scaffolding stages (furigana + romaji + English → furigana + English → furigana only). The tagged text is parsed server-side, scaffolding is resolved per-word based on exposure count, and the result is sent as HTML with `<ruby>` annotations for the frontend narration box to render.

**Tech Stack:** Node.js ES modules, Express REST API, Node.js native test runner + c8 coverage, HTML `<ruby>` elements for furigana, vanilla JS frontend

**Design doc:** `language/docs/future-plans/Bootstrap Language System.md`

---

## Task 1: Word Tracker — Data Model & Persistence

The word tracker is the foundation everything else builds on. It stores per-player, per-word exposure counts and determines what scaffolding to show.

**Files:**
- Create: `src/game/word-tracker.js`
- Test: `tests/unit/game/word-tracker.test.js`
- Create: `tests/helpers/word-tracker-fixtures.js`

**Step 1: Write test fixtures**

Create `tests/helpers/word-tracker-fixtures.js` with shared constants:

```javascript
export const SCAFFOLD_STAGES = {
  FULL: 1,      // furigana + romaji + English (exposures 1-3)
  NO_ROMAJI: 2, // furigana + English (exposures 4-9)
  FURIGANA: 3,  // furigana only (exposures 10+)
  BARE: 4       // no annotations (future FSRS)
};

export const PHASES = {
  BOOTSTRAP: 'bootstrap',
  TRANSITION: 'transition',
  FULL_JAPANESE: 'full-japanese'
};

export const PHASE_THRESHOLDS = {
  TRANSITION_MIN_WORDS: 100,  // words at stage 2+ to enter transition
  FULL_JAPANESE_MIN_WORDS: 250 // words to enter full-japanese
};

export const SAMPLE_TRACKER = {
  userId: 'test-user-1',
  words: {
    '水': { exposures: 7, stage: 2, firstSeen: '2026-03-01', lastSeen: '2026-03-01' },
    '森': { exposures: 3, stage: 1, firstSeen: '2026-03-01', lastSeen: '2026-03-01' },
    '火': { exposures: 12, stage: 3, firstSeen: '2026-02-28', lastSeen: '2026-03-01' }
  },
  totalWordsIntroduced: 3,
  phase: 'bootstrap'
};
```

**Step 2: Write failing tests for word tracker core**

Create `tests/unit/game/word-tracker.test.js`:

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWordTracker,
  recordExposure,
  recordExposures,
  getWordStage,
  getPhase,
  getKnownWords,
  getWordsAtStage
} from '../../../src/game/word-tracker.js';
import { SCAFFOLD_STAGES, PHASES } from '../../helpers/word-tracker-fixtures.js';

describe('Word Tracker - createWordTracker', () => {
  it('creates empty tracker for new user', () => {
    const tracker = createWordTracker('user-1');
    assert.strictEqual(tracker.userId, 'user-1');
    assert.deepStrictEqual(tracker.words, {});
    assert.strictEqual(tracker.totalWordsIntroduced, 0);
    assert.strictEqual(tracker.phase, PHASES.BOOTSTRAP);
  });
});

describe('Word Tracker - recordExposure', () => {
  let tracker;

  beforeEach(() => {
    tracker = createWordTracker('user-1');
  });

  it('creates new word entry on first exposure', () => {
    recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].exposures, 1);
    assert.strictEqual(tracker.words['水'].stage, SCAFFOLD_STAGES.FULL);
    assert.strictEqual(tracker.totalWordsIntroduced, 1);
  });

  it('increments exposure count on repeated exposure', () => {
    recordExposure(tracker, '水');
    recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].exposures, 2);
    assert.strictEqual(tracker.totalWordsIntroduced, 1);
  });

  it('transitions from stage 1 to stage 2 at 4 exposures', () => {
    for (let i = 0; i < 4; i++) recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].stage, SCAFFOLD_STAGES.NO_ROMAJI);
  });

  it('transitions from stage 2 to stage 3 at 10 exposures', () => {
    for (let i = 0; i < 10; i++) recordExposure(tracker, '水');
    assert.strictEqual(tracker.words['水'].stage, SCAFFOLD_STAGES.FURIGANA);
  });

  it('accepts multiplier for combat exposures (2x)', () => {
    recordExposure(tracker, '水', 2);
    assert.strictEqual(tracker.words['水'].exposures, 2);
  });
});

describe('Word Tracker - recordExposures (batch)', () => {
  it('records multiple words from a narration', () => {
    const tracker = createWordTracker('user-1');
    recordExposures(tracker, ['水', '火', '水']);
    assert.strictEqual(tracker.words['水'].exposures, 2);
    assert.strictEqual(tracker.words['火'].exposures, 1);
    assert.strictEqual(tracker.totalWordsIntroduced, 2);
  });
});

describe('Word Tracker - getWordStage', () => {
  it('returns stage for tracked word', () => {
    const tracker = createWordTracker('user-1');
    for (let i = 0; i < 5; i++) recordExposure(tracker, '森');
    assert.strictEqual(getWordStage(tracker, '森'), SCAFFOLD_STAGES.NO_ROMAJI);
  });

  it('returns null for unknown word', () => {
    const tracker = createWordTracker('user-1');
    assert.strictEqual(getWordStage(tracker, '森'), null);
  });
});

describe('Word Tracker - getPhase', () => {
  it('returns bootstrap when few words learned', () => {
    const tracker = createWordTracker('user-1');
    recordExposure(tracker, '水');
    assert.strictEqual(getPhase(tracker), PHASES.BOOTSTRAP);
  });

  it('returns transition at 100 words at stage 2+', () => {
    const tracker = createWordTracker('user-1');
    for (let i = 0; i < 100; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    assert.strictEqual(getPhase(tracker), PHASES.TRANSITION);
  });

  it('returns full-japanese at 250 words at stage 2+', () => {
    const tracker = createWordTracker('user-1');
    for (let i = 0; i < 250; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    assert.strictEqual(getPhase(tracker), PHASES.FULL_JAPANESE);
  });
});

describe('Word Tracker - getKnownWords', () => {
  it('returns array of all tracked words', () => {
    const tracker = createWordTracker('user-1');
    recordExposure(tracker, '水');
    recordExposure(tracker, '火');
    const known = getKnownWords(tracker);
    assert.deepStrictEqual(known.sort(), ['水', '火'].sort());
  });
});

describe('Word Tracker - getWordsAtStage', () => {
  it('filters words by stage', () => {
    const tracker = createWordTracker('user-1');
    recordExposure(tracker, '水'); // stage 1
    for (let i = 0; i < 5; i++) recordExposure(tracker, '火'); // stage 2
    const stage2 = getWordsAtStage(tracker, SCAFFOLD_STAGES.NO_ROMAJI);
    assert.deepStrictEqual(stage2, ['火']);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/word-tracker.test.js`
Expected: FAIL — module `src/game/word-tracker.js` not found

**Step 4: Implement word tracker**

Create `src/game/word-tracker.js`:

```javascript
/**
 * @fileoverview Per-player word exposure tracker for bootstrap language system
 * @module src/game/word-tracker
 *
 * Tracks how many times a player has seen each Japanese word and determines
 * scaffolding stage (furigana + romaji + English → furigana + English → furigana only).
 */

// Scaffolding stage thresholds (exposure counts)
const STAGE_THRESHOLDS = {
  NO_ROMAJI: 4,   // Drop romaji at 4+ exposures
  FURIGANA: 10    // Drop English at 10+ exposures
};

const STAGES = { FULL: 1, NO_ROMAJI: 2, FURIGANA: 3, BARE: 4 };

const PHASE_THRESHOLDS = {
  TRANSITION_MIN_WORDS: 100,
  FULL_JAPANESE_MIN_WORDS: 250
};

/**
 * Create a fresh word tracker for a player
 */
export function createWordTracker(userId) {
  return {
    userId,
    words: {},
    totalWordsIntroduced: 0,
    phase: 'bootstrap'
  };
}

/**
 * Compute stage from exposure count
 */
function computeStage(exposures) {
  if (exposures >= STAGE_THRESHOLDS.FURIGANA) return STAGES.FURIGANA;
  if (exposures >= STAGE_THRESHOLDS.NO_ROMAJI) return STAGES.NO_ROMAJI;
  return STAGES.FULL;
}

/**
 * Record a single word exposure. Multiplier allows combat (2x) or TTS (1x) weighting.
 */
export function recordExposure(tracker, word, multiplier = 1) {
  const now = new Date().toISOString().slice(0, 10);
  if (!tracker.words[word]) {
    tracker.words[word] = {
      exposures: 0,
      stage: STAGES.FULL,
      firstSeen: now,
      lastSeen: now
    };
    tracker.totalWordsIntroduced++;
  }

  const entry = tracker.words[word];
  entry.exposures += multiplier;
  entry.lastSeen = now;
  entry.stage = computeStage(entry.exposures);

  // Auto-update phase
  tracker.phase = computePhase(tracker);
}

/**
 * Record exposures for multiple words (e.g., all tagged words in a narration)
 */
export function recordExposures(tracker, words, multiplier = 1) {
  for (const word of words) {
    recordExposure(tracker, word, multiplier);
  }
}

/**
 * Get the scaffolding stage for a word (null if never seen)
 */
export function getWordStage(tracker, word) {
  return tracker.words[word]?.stage ?? null;
}

/**
 * Compute the player's language phase based on word mastery
 */
function computePhase(tracker) {
  const stage2Plus = Object.values(tracker.words)
    .filter(w => w.stage >= STAGES.NO_ROMAJI).length;

  if (stage2Plus >= PHASE_THRESHOLDS.FULL_JAPANESE_MIN_WORDS) return 'full-japanese';
  if (stage2Plus >= PHASE_THRESHOLDS.TRANSITION_MIN_WORDS) return 'transition';
  return 'bootstrap';
}

/**
 * Get the current language phase
 */
export function getPhase(tracker) {
  return computePhase(tracker);
}

/**
 * Get array of all tracked words
 */
export function getKnownWords(tracker) {
  return Object.keys(tracker.words);
}

/**
 * Get words filtered to a specific stage
 */
export function getWordsAtStage(tracker, stage) {
  return Object.entries(tracker.words)
    .filter(([, data]) => data.stage === stage)
    .map(([word]) => word);
}
```

**Step 5: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/word-tracker.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/game/word-tracker.js tests/unit/game/word-tracker.test.js tests/helpers/word-tracker-fixtures.js
git commit -m "feat: add word tracker for bootstrap language system"
```

---

## Task 2: Word Tracker — Persistence (Load/Save)

**Files:**
- Modify: `src/game/word-tracker.js`
- Test: `tests/unit/game/word-tracker-persistence.test.js`

**Step 1: Write failing tests for persistence**

Create `tests/unit/game/word-tracker-persistence.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  loadWordTracker,
  saveWordTracker,
  TRACKER_DIR
} from '../../../src/game/word-tracker.js';

describe('Word Tracker - Persistence', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-word-tracker');
  let originalDir;

  beforeEach(() => {
    originalDir = TRACKER_DIR;
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('saves tracker to JSON file', () => {
    const tracker = { userId: 'u1', words: { '水': { exposures: 3, stage: 1, firstSeen: '2026-03-01', lastSeen: '2026-03-01' } }, totalWordsIntroduced: 1, phase: 'bootstrap' };
    saveWordTracker(tracker, testDir);
    const filePath = join(testDir, 'word-tracker-u1.json');
    assert.ok(existsSync(filePath));
    const loaded = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    assert.strictEqual(loaded.words['水'].exposures, 3);
  });

  it('loads existing tracker from file', () => {
    const data = { userId: 'u2', words: { '火': { exposures: 5, stage: 2, firstSeen: '2026-03-01', lastSeen: '2026-03-01' } }, totalWordsIntroduced: 1, phase: 'bootstrap' };
    writeFileSync(join(testDir, 'word-tracker-u2.json'), JSON.stringify(data));
    const tracker = loadWordTracker('u2', testDir);
    assert.strictEqual(tracker.words['火'].exposures, 5);
    assert.strictEqual(tracker.phase, 'bootstrap');
  });

  it('returns fresh tracker when file does not exist', () => {
    const tracker = loadWordTracker('nonexistent', testDir);
    assert.strictEqual(tracker.userId, 'nonexistent');
    assert.deepStrictEqual(tracker.words, {});
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/word-tracker-persistence.test.js`
Expected: FAIL — `loadWordTracker` / `saveWordTracker` not exported

**Step 3: Add persistence functions to word-tracker.js**

Add to `src/game/word-tracker.js`:

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export const TRACKER_DIR = join(import.meta.dirname, '../../data');

/**
 * Load a player's word tracker from disk (or create fresh)
 */
export function loadWordTracker(userId, dir = TRACKER_DIR) {
  const filePath = join(dir, `word-tracker-${userId}.json`);
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`[WordTracker] Failed to load for ${userId}:`, e.message);
  }
  return createWordTracker(userId);
}

/**
 * Save a player's word tracker to disk
 */
export function saveWordTracker(tracker, dir = TRACKER_DIR) {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `word-tracker-${tracker.userId}.json`);
  writeFileSync(filePath, JSON.stringify(tracker, null, 2));
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/word-tracker-persistence.test.js`
Expected: All tests PASS

**Step 5: Update .gitignore**

Add to `/root/Koto/.gitignore`:

```
# Word tracker (per-user, runtime-generated)
data/word-tracker-*.json
```

**Step 6: Commit**

```bash
git add src/game/word-tracker.js tests/unit/game/word-tracker-persistence.test.js .gitignore
git commit -m "feat: add word tracker persistence (load/save per user)"
```

---

## Task 3: Tagged Text Parser

Parse the `{english|kanji|hiragana|romaji}` format used in hand-authored bootstrap narration.

**Files:**
- Create: `src/game/bootstrap-parser.js`
- Test: `tests/unit/game/bootstrap-parser.test.js`

**Step 1: Write failing tests**

Create `tests/unit/game/bootstrap-parser.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBootstrapText, extractTaggedWords } from '../../../src/game/bootstrap-parser.js';

describe('Bootstrap Parser - parseBootstrapText', () => {
  it('parses tagged word into segments', () => {
    const result = parseBootstrapText('A cold {wind|風|かぜ|kaze} blew.');
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { type: 'text', content: 'A cold ' });
    assert.deepStrictEqual(result[1], {
      type: 'word',
      english: 'wind',
      kanji: '風',
      hiragana: 'かぜ',
      romaji: 'kaze'
    });
    assert.deepStrictEqual(result[2], { type: 'text', content: ' blew.' });
  });

  it('handles multiple tagged words', () => {
    const result = parseBootstrapText('{water|水|みず|mizu} and {fire|火|ひ|hi}');
    const words = result.filter(s => s.type === 'word');
    assert.strictEqual(words.length, 2);
    assert.strictEqual(words[0].kanji, '水');
    assert.strictEqual(words[1].kanji, '火');
  });

  it('handles text with no tags', () => {
    const result = parseBootstrapText('Just plain English.');
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], { type: 'text', content: 'Just plain English.' });
  });

  it('handles hiragana-only words (kanji = hiragana)', () => {
    const result = parseBootstrapText('You {go|いく|いく|iku} now.');
    const word = result.find(s => s.type === 'word');
    assert.strictEqual(word.kanji, 'いく');
    assert.strictEqual(word.hiragana, 'いく');
  });

  it('handles adjacent tags', () => {
    const result = parseBootstrapText('{big|大きい|おおきい|ookii}{mountain|山|やま|yama}');
    const words = result.filter(s => s.type === 'word');
    assert.strictEqual(words.length, 2);
  });

  it('ignores malformed tags (missing fields)', () => {
    const result = parseBootstrapText('A {broken|tag} here.');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'text');
    assert.strictEqual(result[0].content, 'A {broken|tag} here.');
  });
});

describe('Bootstrap Parser - extractTaggedWords', () => {
  it('extracts kanji from all tagged words', () => {
    const words = extractTaggedWords('A {wind|風|かぜ|kaze} and {water|水|みず|mizu}.');
    assert.deepStrictEqual(words, ['風', '水']);
  });

  it('returns empty array for text with no tags', () => {
    const words = extractTaggedWords('Plain text.');
    assert.deepStrictEqual(words, []);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-parser.test.js`
Expected: FAIL — module not found

**Step 3: Implement bootstrap parser**

Create `src/game/bootstrap-parser.js`:

```javascript
/**
 * @fileoverview Parse bootstrap narration tagged text format
 * @module src/game/bootstrap-parser
 *
 * Parses {english|kanji|hiragana|romaji} tags in hand-authored narration.
 * Returns an array of segments: plain text or tagged word objects.
 */

// Match {english|kanji|hiragana|romaji} — exactly 4 pipe-separated fields
const TAG_RE = /\{([^|{}]+)\|([^|{}]+)\|([^|{}]+)\|([^|{}]+)\}/g;

/**
 * Parse bootstrap text into segments.
 * Returns array of { type: 'text', content } or { type: 'word', english, kanji, hiragana, romaji }
 */
export function parseBootstrapText(text) {
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_RE)) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'word',
      english: match[1],
      kanji: match[2],
      hiragana: match[3],
      romaji: match[4]
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  // If no tags found, return entire text as one segment
  if (segments.length === 0) {
    segments.push({ type: 'text', content: text });
  }

  return segments;
}

/**
 * Extract just the kanji/word strings from tagged text (for exposure tracking)
 */
export function extractTaggedWords(text) {
  return [...text.matchAll(TAG_RE)].map(m => m[2]);
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-parser.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/bootstrap-parser.js tests/unit/game/bootstrap-parser.test.js
git commit -m "feat: add tagged text parser for bootstrap narration"
```

---

## Task 4: Scaffold Renderer (Server-Side HTML Generation)

Converts parsed segments + player's word tracker into HTML with appropriate `<ruby>` annotations based on each word's scaffolding stage.

**Files:**
- Create: `src/game/bootstrap-renderer.js`
- Test: `tests/unit/game/bootstrap-renderer.test.js`

**Step 1: Write failing tests**

Create `tests/unit/game/bootstrap-renderer.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderBootstrapNarration } from '../../../src/game/bootstrap-renderer.js';
import { createWordTracker, recordExposure } from '../../../src/game/word-tracker.js';

describe('Bootstrap Renderer - renderBootstrapNarration', () => {
  it('renders stage 1 word with furigana + romaji + English', () => {
    const tracker = createWordTracker('u1');
    // 風 is brand new (0 exposures) — will be stage 1 after this render
    const html = renderBootstrapNarration('A cold {wind|風|かぜ|kaze} blew.', tracker);
    // Stage 1: kanji with furigana above, romaji + English below
    assert.ok(html.includes('<ruby>風<rt>かぜ</rt></ruby>'));
    assert.ok(html.includes('kaze'));
    assert.ok(html.includes('wind'));
    assert.ok(html.includes('A cold'));
    assert.ok(html.includes('blew.'));
  });

  it('renders stage 2 word without romaji', () => {
    const tracker = createWordTracker('u1');
    for (let i = 0; i < 4; i++) recordExposure(tracker, '水');
    const html = renderBootstrapNarration('Some {water|水|みず|mizu} here.', tracker);
    assert.ok(html.includes('<ruby>水<rt>みず</rt></ruby>'));
    assert.ok(html.includes('water'));
    assert.ok(!html.includes('mizu'));
  });

  it('renders stage 3 word with furigana only', () => {
    const tracker = createWordTracker('u1');
    for (let i = 0; i < 10; i++) recordExposure(tracker, '火');
    const html = renderBootstrapNarration('The {fire|火|ひ|hi} burns.', tracker);
    assert.ok(html.includes('<ruby>火<rt>ひ</rt></ruby>'));
    assert.ok(!html.includes('>fire<'));
    assert.ok(!html.includes('hi'));
  });

  it('skips furigana when kanji equals hiragana', () => {
    const tracker = createWordTracker('u1');
    const html = renderBootstrapNarration('You {go|いく|いく|iku} now.', tracker);
    // Should NOT have ruby (would duplicate いく over いく)
    assert.ok(!html.includes('<ruby>いく<rt>いく</rt></ruby>'));
    assert.ok(html.includes('いく'));
  });

  it('escapes HTML in plain text segments', () => {
    const tracker = createWordTracker('u1');
    const html = renderBootstrapNarration('The <b>bold</b> {wind|風|かぜ|kaze}.', tracker);
    assert.ok(html.includes('&lt;b&gt;'));
  });

  it('returns array of exposed words for tracking', () => {
    const tracker = createWordTracker('u1');
    const { html, exposedWords } = renderBootstrapNarration('A {wind|風|かぜ|kaze} and {water|水|みず|mizu}.', tracker, { returnMeta: true });
    assert.deepStrictEqual(exposedWords.sort(), ['水', '風'].sort());
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-renderer.test.js`
Expected: FAIL — module not found

**Step 3: Implement bootstrap renderer**

Create `src/game/bootstrap-renderer.js`:

```javascript
/**
 * @fileoverview Render bootstrap narration with progressive scaffolding
 * @module src/game/bootstrap-renderer
 *
 * Converts parsed bootstrap text + word tracker into HTML with <ruby> annotations.
 * Scaffolding stages:
 *   1: <ruby>kanji<rt>hiragana</rt></ruby> <span class="scaffold-romaji">romaji</span> <span class="scaffold-english">(english)</span>
 *   2: <ruby>kanji<rt>hiragana</rt></ruby> <span class="scaffold-english">(english)</span>
 *   3: <ruby>kanji<rt>hiragana</rt></ruby>
 */

import { parseBootstrapText, extractTaggedWords } from './bootstrap-parser.js';
import { getWordStage } from './word-tracker.js';

const STAGES = { FULL: 1, NO_ROMAJI: 2, FURIGANA: 3, BARE: 4 };

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render a single tagged word with appropriate scaffolding
 */
function renderWord(wordSeg, stage) {
  const { english, kanji, hiragana, romaji } = wordSeg;
  const needsFurigana = kanji !== hiragana;

  let html = '<span class="bootstrap-word">';

  // Kanji with optional furigana
  if (needsFurigana) {
    html += `<ruby>${escapeHtml(kanji)}<rt>${escapeHtml(hiragana)}</rt></ruby>`;
  } else {
    html += escapeHtml(kanji);
  }

  // Stage 1: add romaji
  if (stage <= STAGES.FULL) {
    html += `<span class="scaffold-romaji">${escapeHtml(romaji)}</span>`;
  }

  // Stage 1-2: add English
  if (stage <= STAGES.NO_ROMAJI) {
    html += `<span class="scaffold-english">(${escapeHtml(english)})</span>`;
  }

  html += '</span>';
  return html;
}

/**
 * Render bootstrap narration text into HTML with scaffolding.
 *
 * @param {string} text - Raw bootstrap narration with {english|kanji|hiragana|romaji} tags
 * @param {Object} tracker - Player's word tracker
 * @param {Object} [options] - Options
 * @param {boolean} [options.returnMeta] - If true, return { html, exposedWords } instead of just html
 * @returns {string|Object} HTML string, or { html, exposedWords } if returnMeta is true
 */
export function renderBootstrapNarration(text, tracker, options = {}) {
  const segments = parseBootstrapText(text);
  const exposedWords = extractTaggedWords(text);

  const htmlParts = segments.map(seg => {
    if (seg.type === 'text') {
      return escapeHtml(seg.content);
    }

    // Determine stage: use tracker if word exists, otherwise stage 1 (new word)
    const stage = getWordStage(tracker, seg.kanji) ?? STAGES.FULL;
    return renderWord(seg, stage);
  });

  const html = htmlParts.join('');

  if (options.returnMeta) {
    return { html, exposedWords };
  }
  return html;
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-renderer.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/bootstrap-renderer.js tests/unit/game/bootstrap-renderer.test.js
git commit -m "feat: add scaffold renderer for bootstrap narration HTML"
```

---

## Task 5: Bootstrap Curriculum Data

The curated ~100-word list. This is a static data file with the first 20 prologue words and slots for guided-run words.

**Files:**
- Create: `data/bootstrap-curriculum.json`
- Create: `src/game/bootstrap-curriculum.js` (loader + validation)
- Test: `tests/unit/game/bootstrap-curriculum.test.js`

**Step 1: Write failing tests**

Create `tests/unit/game/bootstrap-curriculum.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCurriculum, getPrologueWords, getRunWords, getWordInfo } from '../../../src/game/bootstrap-curriculum.js';

describe('Bootstrap Curriculum', () => {
  it('loads curriculum with words array', () => {
    const curriculum = getCurriculum();
    assert.ok(Array.isArray(curriculum));
    assert.ok(curriculum.length >= 20, 'curriculum should have at least 20 words');
  });

  it('each word has required fields', () => {
    const curriculum = getCurriculum();
    for (const word of curriculum) {
      assert.ok(word.kanji, `word missing kanji: ${JSON.stringify(word)}`);
      assert.ok(word.hiragana, `word missing hiragana: ${JSON.stringify(word)}`);
      assert.ok(word.english, `word missing english: ${JSON.stringify(word)}`);
      assert.ok(word.romaji, `word missing romaji: ${JSON.stringify(word)}`);
      assert.ok(word.introducedIn, `word missing introducedIn: ${JSON.stringify(word)}`);
    }
  });

  it('getPrologueWords returns only prologue words', () => {
    const words = getPrologueWords();
    assert.ok(words.length >= 15);
    for (const w of words) {
      assert.strictEqual(w.introducedIn, 'prologue');
    }
  });

  it('getRunWords returns words for a specific run', () => {
    const words = getRunWords(1);
    for (const w of words) {
      assert.strictEqual(w.introducedIn, 'run-1');
    }
  });

  it('getWordInfo looks up by kanji', () => {
    const info = getWordInfo('水');
    assert.ok(info);
    assert.strictEqual(info.english, 'water');
  });

  it('getWordInfo returns null for unknown word', () => {
    assert.strictEqual(getWordInfo('鬱'), null);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-curriculum.test.js`
Expected: FAIL — module not found

**Step 3: Create curriculum data file**

Create `data/bootstrap-curriculum.json`. This is the initial seed — the full 100 words will be expanded later by cross-referencing WaniKani/JPDB data. Start with prologue words and run-1 words:

```json
[
  { "kanji": "水", "hiragana": "みず", "english": "water", "romaji": "mizu", "introducedIn": "prologue", "category": "nature", "rank": 627 },
  { "kanji": "火", "hiragana": "ひ", "english": "fire", "romaji": "hi", "introducedIn": "prologue", "category": "nature", "rank": 497 },
  { "kanji": "風", "hiragana": "かぜ", "english": "wind", "romaji": "kaze", "introducedIn": "prologue", "category": "nature", "rank": 1652 },
  { "kanji": "光", "hiragana": "ひかり", "english": "light", "romaji": "hikari", "introducedIn": "prologue", "category": "nature", "rank": 459 },
  { "kanji": "森", "hiragana": "もり", "english": "forest", "romaji": "mori", "introducedIn": "prologue", "category": "nature", "rank": 1245 },
  { "kanji": "山", "hiragana": "やま", "english": "mountain", "romaji": "yama", "introducedIn": "prologue", "category": "nature", "rank": 579 },
  { "kanji": "人", "hiragana": "ひと", "english": "person", "romaji": "hito", "introducedIn": "prologue", "category": "social", "rank": 21 },
  { "kanji": "名前", "hiragana": "なまえ", "english": "name", "romaji": "namae", "introducedIn": "prologue", "category": "social", "rank": 602 },
  { "kanji": "友達", "hiragana": "ともだち", "english": "friend", "romaji": "tomodachi", "introducedIn": "prologue", "category": "social", "rank": 1430 },
  { "kanji": "大きい", "hiragana": "おおきい", "english": "big", "romaji": "ookii", "introducedIn": "prologue", "category": "adjective", "rank": 508 },
  { "kanji": "小さい", "hiragana": "ちいさい", "english": "small", "romaji": "chiisai", "introducedIn": "prologue", "category": "adjective", "rank": 872 },
  { "kanji": "新しい", "hiragana": "あたらしい", "english": "new", "romaji": "atarashii", "introducedIn": "prologue", "category": "adjective", "rank": 410 },
  { "kanji": "見る", "hiragana": "みる", "english": "to see / to look", "romaji": "miru", "introducedIn": "prologue", "category": "verb", "rank": 67 },
  { "kanji": "行く", "hiragana": "いく", "english": "to go", "romaji": "iku", "introducedIn": "prologue", "category": "verb", "rank": 57 },
  { "kanji": "来る", "hiragana": "くる", "english": "to come", "romaji": "kuru", "introducedIn": "prologue", "category": "verb", "rank": 58 },
  { "kanji": "空", "hiragana": "そら", "english": "sky", "romaji": "sora", "introducedIn": "prologue", "category": "nature", "rank": 798 },
  { "kanji": "星", "hiragana": "ほし", "english": "star", "romaji": "hoshi", "introducedIn": "prologue", "category": "nature", "rank": 1509 },
  { "kanji": "強い", "hiragana": "つよい", "english": "strong", "romaji": "tsuyoi", "introducedIn": "prologue", "category": "adjective", "rank": 636 },
  { "kanji": "はい", "hiragana": "はい", "english": "yes", "romaji": "hai", "introducedIn": "prologue", "category": "social", "rank": 268 },
  { "kanji": "ありがとう", "hiragana": "ありがとう", "english": "thank you", "romaji": "arigatou", "introducedIn": "prologue", "category": "social", "rank": 1800 },

  { "kanji": "食べる", "hiragana": "たべる", "english": "to eat", "romaji": "taberu", "introducedIn": "run-1", "category": "verb", "rank": 619 },
  { "kanji": "飲む", "hiragana": "のむ", "english": "to drink", "romaji": "nomu", "introducedIn": "run-1", "category": "verb", "rank": 814 },
  { "kanji": "聞く", "hiragana": "きく", "english": "to hear / to ask", "romaji": "kiku", "introducedIn": "run-1", "category": "verb", "rank": 148 },
  { "kanji": "使う", "hiragana": "つかう", "english": "to use", "romaji": "tsukau", "introducedIn": "run-1", "category": "verb", "rank": 258 },
  { "kanji": "走る", "hiragana": "はしる", "english": "to run", "romaji": "hashiru", "introducedIn": "run-1", "category": "verb", "rank": 400 },
  { "kanji": "町", "hiragana": "まち", "english": "town", "romaji": "machi", "introducedIn": "run-1", "category": "location", "rank": 510 },
  { "kanji": "道", "hiragana": "みち", "english": "road / path", "romaji": "michi", "introducedIn": "run-1", "category": "location", "rank": 388 },
  { "kanji": "月", "hiragana": "つき", "english": "moon", "romaji": "tsuki", "introducedIn": "run-1", "category": "nature", "rank": 63 },
  { "kanji": "雨", "hiragana": "あめ", "english": "rain", "romaji": "ame", "introducedIn": "run-1", "category": "nature", "rank": 894 },
  { "kanji": "赤い", "hiragana": "あかい", "english": "red", "romaji": "akai", "introducedIn": "run-1", "category": "adjective", "rank": 2046 },
  { "kanji": "白い", "hiragana": "しろい", "english": "white", "romaji": "shiroi", "introducedIn": "run-1", "category": "adjective", "rank": 1900 },
  { "kanji": "戦う", "hiragana": "たたかう", "english": "to fight", "romaji": "tatakau", "introducedIn": "run-1", "category": "action", "rank": 1280 },
  { "kanji": "守る", "hiragana": "まもる", "english": "to protect", "romaji": "mamoru", "introducedIn": "run-1", "category": "action", "rank": 895 },
  { "kanji": "逃げる", "hiragana": "にげる", "english": "to escape / to run away", "romaji": "nigeru", "introducedIn": "run-1", "category": "action", "rank": 1419 },
  { "kanji": "探す", "hiragana": "さがす", "english": "to search / to look for", "romaji": "sagasu", "introducedIn": "run-1", "category": "action", "rank": 863 },
  { "kanji": "の", "hiragana": "の", "english": "(possessive particle)", "romaji": "no", "introducedIn": "run-1", "category": "particle", "rank": 1 },
  { "kanji": "は", "hiragana": "は", "english": "(topic particle)", "romaji": "wa", "introducedIn": "run-1", "category": "particle", "rank": 2 },
  { "kanji": "を", "hiragana": "を", "english": "(object particle)", "romaji": "wo", "introducedIn": "run-1", "category": "particle", "rank": 3 },
  { "kanji": "に", "hiragana": "に", "english": "(direction/location particle)", "romaji": "ni", "introducedIn": "run-1", "category": "particle", "rank": 4 },
  { "kanji": "と", "hiragana": "と", "english": "(and / with particle)", "romaji": "to", "introducedIn": "run-1", "category": "particle", "rank": 5 }
]
```

**Step 4: Create curriculum loader**

Create `src/game/bootstrap-curriculum.js`:

```javascript
/**
 * @fileoverview Bootstrap curriculum loader and lookup
 * @module src/game/bootstrap-curriculum
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const CURRICULUM_PATH = join(import.meta.dirname, '../../data/bootstrap-curriculum.json');

let _curriculum = null;
let _kanjiIndex = null;

function ensureLoaded() {
  if (!_curriculum) {
    _curriculum = JSON.parse(readFileSync(CURRICULUM_PATH, 'utf8'));
    _kanjiIndex = new Map(_curriculum.map(w => [w.kanji, w]));
  }
}

/** Get the full curriculum array */
export function getCurriculum() {
  ensureLoaded();
  return _curriculum;
}

/** Get words introduced in the prologue */
export function getPrologueWords() {
  ensureLoaded();
  return _curriculum.filter(w => w.introducedIn === 'prologue');
}

/** Get words introduced in a specific run (1, 2, or 3) */
export function getRunWords(runNumber) {
  ensureLoaded();
  return _curriculum.filter(w => w.introducedIn === `run-${runNumber}`);
}

/** Look up word info by kanji */
export function getWordInfo(kanji) {
  ensureLoaded();
  return _kanjiIndex.get(kanji) ?? null;
}
```

**Step 5: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-curriculum.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add data/bootstrap-curriculum.json src/game/bootstrap-curriculum.js tests/unit/game/bootstrap-curriculum.test.js
git commit -m "feat: add bootstrap curriculum data and loader (40 initial words)"
```

---

## Task 6: Bootstrap Narration Content — Prologue

Hand-authored narration scripts for the prologue sequence. Each scene is a JSON object with narrative text using the tagged format.

**Files:**
- Create: `data/bootstrap-narrations/prologue.json`
- Create: `src/game/bootstrap-narrations.js` (narration selector)
- Test: `tests/unit/game/bootstrap-narrations.test.js`

**Step 1: Write failing tests**

Create `tests/unit/game/bootstrap-narrations.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPrologueScene, getPrologueSceneCount } from '../../../src/game/bootstrap-narrations.js';
import { extractTaggedWords } from '../../../src/game/bootstrap-parser.js';
import { getPrologueWords } from '../../../src/game/bootstrap-curriculum.js';

describe('Bootstrap Narrations - Prologue', () => {
  it('loads prologue scenes', () => {
    const count = getPrologueSceneCount();
    assert.ok(count >= 3, 'prologue should have at least 3 scenes');
  });

  it('each scene has required fields', () => {
    const count = getPrologueSceneCount();
    for (let i = 0; i < count; i++) {
      const scene = getPrologueScene(i);
      assert.ok(scene.id, `scene ${i} missing id`);
      assert.ok(scene.narration, `scene ${i} missing narration`);
      assert.ok(typeof scene.narration === 'string');
    }
  });

  it('prologue scenes only use curriculum words', () => {
    const prologueWords = new Set(getPrologueWords().map(w => w.kanji));
    const count = getPrologueSceneCount();
    for (let i = 0; i < count; i++) {
      const scene = getPrologueScene(i);
      const taggedWords = extractTaggedWords(scene.narration);
      for (const word of taggedWords) {
        assert.ok(
          prologueWords.has(word),
          `scene ${scene.id} uses word "${word}" not in prologue curriculum`
        );
      }
    }
  });

  it('each scene introduces at most 5 new words', () => {
    const seenWords = new Set();
    const count = getPrologueSceneCount();
    for (let i = 0; i < count; i++) {
      const scene = getPrologueScene(i);
      const taggedWords = extractTaggedWords(scene.narration);
      const newWords = taggedWords.filter(w => !seenWords.has(w));
      assert.ok(
        newWords.length <= 5,
        `scene ${scene.id} introduces ${newWords.length} new words (max 5)`
      );
      taggedWords.forEach(w => seenWords.add(w));
    }
  });

  it('returns null for out-of-range scene index', () => {
    assert.strictEqual(getPrologueScene(999), null);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-narrations.test.js`
Expected: FAIL — module not found

**Step 3: Create prologue narration data**

Create `data/bootstrap-narrations/prologue.json`:

```json
[
  {
    "id": "prologue-1-awakening",
    "narration": "You open your eyes. A strange {light|光|ひかり|hikari} fills the {sky|空|そら|sora}. {Star|星|ほし|hoshi}s are falling."
  },
  {
    "id": "prologue-2-world",
    "narration": "You stand up and {see|見る|みる|miru} a vast {forest|森|もり|mori}. In the distance, a tall {mountain|山|やま|yama} rises above the trees. The {wind|風|かぜ|kaze} carries a warm scent."
  },
  {
    "id": "prologue-3-creature",
    "narration": "A {small|小さい|ちいさい|chiisai} creature appears from the tall grass. It looks up at you with {big|大きい|おおきい|ookii} eyes. It seems {strong|強い|つよい|tsuyoi}, despite its size."
  },
  {
    "id": "prologue-4-meeting",
    "narration": "The creature chirps: \"{Yes|はい|はい|hai}!\" A {person|人|ひと|hito} steps out from behind a tree. \"That creature chose you,\" they say. \"What is your {name|名前|なまえ|namae}?\""
  },
  {
    "id": "prologue-5-bond",
    "narration": "\"You are {friend|友達|ともだち|tomodachi}s now,\" the {person|人|ひと|hito} says. \"Take care of each other. {Thank you|ありがとう|ありがとう|arigatou} for coming to this world.\" The {light|光|ひかり|hikari} around you glows {new|新しい|あたらしい|atarashii} and bright."
  },
  {
    "id": "prologue-6-departure",
    "narration": "You {go|行く|いく|iku} toward the {mountain|山|やま|yama}. The {wind|風|かぜ|kaze} pushes at your back. {Water|水|みず|mizu} trickles down from the rocks. A {fire|火|ひ|hi} glows in the valley below. Your {friend|友達|ともだち|tomodachi} {come|来る|くる|kuru}s along."
  }
]
```

**Step 4: Create narration loader**

Create `src/game/bootstrap-narrations.js`:

```javascript
/**
 * @fileoverview Load and serve hand-authored bootstrap narration scenes
 * @module src/game/bootstrap-narrations
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const NARRATIONS_DIR = join(import.meta.dirname, '../../data/bootstrap-narrations');

let _prologue = null;

function loadPrologue() {
  if (!_prologue) {
    _prologue = JSON.parse(readFileSync(join(NARRATIONS_DIR, 'prologue.json'), 'utf8'));
  }
  return _prologue;
}

/** Get the number of prologue scenes */
export function getPrologueSceneCount() {
  return loadPrologue().length;
}

/** Get a specific prologue scene by index (0-based), or null if out of range */
export function getPrologueScene(index) {
  const scenes = loadPrologue();
  return scenes[index] ?? null;
}
```

**Step 5: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-narrations.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add data/bootstrap-narrations/prologue.json src/game/bootstrap-narrations.js tests/unit/game/bootstrap-narrations.test.js
git commit -m "feat: add prologue narration scenes for bootstrap language system"
```

---

## Task 7: Frontend CSS for Bootstrap Scaffolding

Add CSS styles for the bootstrap word annotations (romaji, English glosses) displayed inline in narration text.

**Files:**
- Modify: `public/game.css`

**Step 1: Add bootstrap scaffolding styles**

Add these styles to `public/game.css` after the existing `.narration-text` styles:

```css
/* Bootstrap language scaffolding */
.bootstrap-word {
  display: inline;
  white-space: nowrap;
}

.bootstrap-word ruby {
  ruby-position: over;
}

.bootstrap-word ruby rt {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 400;
}

.scaffold-romaji {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
  margin-left: 1px;
}

.scaffold-english {
  font-size: 10px;
  color: var(--accent-primary, #64b5f6);
  margin-left: 2px;
}
```

**Step 2: Verify narration-box supports HTML rendering**

Read `public/js/ui/narration-box.js` to confirm `textEl.innerHTML` is used (not `textContent`). The narration box already uses `innerHTML` for setting text — this is needed for `<ruby>` tags to render. If it uses `textContent`, change it to `innerHTML`.

**Step 3: Syntax-check CSS**

Run: `node --check public/game.css 2>&1 || echo "CSS is not JS-checkable, visual verify needed"`

Verify visually by checking the game renders correctly.

**Step 4: Commit**

```bash
git add public/game.css
git commit -m "feat: add CSS styles for bootstrap scaffolding annotations"
```

---

## Task 8: Server API — Word Tracker Endpoints

Expose word tracker state and bootstrap narration to the frontend.

**Files:**
- Modify: `server.js` (add new endpoints)
- Test: `tests/unit/game/bootstrap-api.test.js`

**Step 1: Write failing tests for API handlers**

Create `tests/unit/game/bootstrap-api.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  handleGetBootstrapState,
  handleGetBootstrapNarration,
  handleRecordExposures
} from '../../../src/game/bootstrap-api.js';
import { createMockReq, createMockRes } from '../../helpers/mocks.js';

describe('Bootstrap API - handleGetBootstrapState', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-api');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('returns tracker state for user', async () => {
    const req = createMockReq({ user: { id: 'test-user' } });
    const res = createMockRes();
    await handleGetBootstrapState(req, res, testDir);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.phase, 'bootstrap');
    assert.strictEqual(res.body.totalWordsIntroduced, 0);
  });
});

describe('Bootstrap API - handleGetBootstrapNarration', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-api-2');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('returns rendered prologue scene', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      query: { type: 'prologue', index: '0' }
    });
    const res = createMockRes();
    await handleGetBootstrapNarration(req, res, testDir);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.html);
    assert.ok(Array.isArray(res.body.exposedWords));
  });

  it('returns 404 for invalid scene index', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      query: { type: 'prologue', index: '999' }
    });
    const res = createMockRes();
    await handleGetBootstrapNarration(req, res, testDir);
    assert.strictEqual(res.statusCode, 404);
  });
});

describe('Bootstrap API - handleRecordExposures', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-api-3');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('records word exposures and saves', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      body: { words: ['水', '火'], multiplier: 1 }
    });
    const res = createMockRes();
    await handleRecordExposures(req, res, testDir);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.totalWordsIntroduced, 2);
  });

  it('rejects empty words array', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      body: { words: [] }
    });
    const res = createMockRes();
    await handleRecordExposures(req, res, testDir);
    assert.strictEqual(res.statusCode, 400);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-api.test.js`
Expected: FAIL — module not found

**Step 3: Implement API handlers**

Create `src/game/bootstrap-api.js`:

```javascript
/**
 * @fileoverview API handlers for bootstrap language system
 * @module src/game/bootstrap-api
 */

import { loadWordTracker, saveWordTracker, recordExposures, getPhase } from './word-tracker.js';
import { renderBootstrapNarration } from './bootstrap-renderer.js';
import { getPrologueScene, getPrologueSceneCount } from './bootstrap-narrations.js';

/**
 * GET /api/game/bootstrap/state
 * Returns the player's word tracker state
 */
export async function handleGetBootstrapState(req, res, trackerDir) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const tracker = loadWordTracker(userId, trackerDir);
  res.status(200).json({
    phase: getPhase(tracker),
    totalWordsIntroduced: tracker.totalWordsIntroduced,
    words: tracker.words
  });
}

/**
 * GET /api/game/bootstrap/narration?type=prologue&index=0
 * Returns rendered narration HTML with scaffolding
 */
export async function handleGetBootstrapNarration(req, res, trackerDir) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { type, index } = req.query;
  const idx = parseInt(index, 10);

  let scene;
  if (type === 'prologue') {
    scene = getPrologueScene(idx);
  }
  // Future: add 'run' type for guided run narrations

  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }

  const tracker = loadWordTracker(userId, trackerDir);
  const { html, exposedWords } = renderBootstrapNarration(
    scene.narration,
    tracker,
    { returnMeta: true }
  );

  res.status(200).json({
    sceneId: scene.id,
    html,
    exposedWords,
    sceneIndex: idx,
    totalScenes: type === 'prologue' ? getPrologueSceneCount() : 0
  });
}

/**
 * POST /api/game/bootstrap/record-exposures
 * Records word exposures after a narration is shown
 * Body: { words: string[], multiplier?: number }
 */
export async function handleRecordExposures(req, res, trackerDir) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { words, multiplier = 1 } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array required' });
  }

  const tracker = loadWordTracker(userId, trackerDir);
  recordExposures(tracker, words, multiplier);
  saveWordTracker(tracker, trackerDir);

  res.status(200).json({
    phase: getPhase(tracker),
    totalWordsIntroduced: tracker.totalWordsIntroduced
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `node --experimental-test-module-mocks --test tests/unit/game/bootstrap-api.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/bootstrap-api.js tests/unit/game/bootstrap-api.test.js
git commit -m "feat: add bootstrap API handlers for word tracker and narration"
```

---

## Task 9: Wire API Endpoints into Server

Register the bootstrap API endpoints in `server.js`.

**Files:**
- Modify: `server.js`

**Step 1: Add imports and routes**

At the top of `server.js`, add the import:

```javascript
import { handleGetBootstrapState, handleGetBootstrapNarration, handleRecordExposures } from './src/game/bootstrap-api.js';
```

Find the section where game API routes are registered (near other `/api/game/` routes) and add:

```javascript
// Bootstrap language system
app.get('/api/game/bootstrap/state', requireAuth, (req, res) => {
  handleGetBootstrapState(req, res);
});

app.get('/api/game/bootstrap/narration', requireAuth, (req, res) => {
  handleGetBootstrapNarration(req, res);
});

app.post('/api/game/bootstrap/record-exposures', requireAuth, (req, res) => {
  handleRecordExposures(req, res);
});
```

**Step 2: Syntax-check server**

Run: `node --check server.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: wire bootstrap API endpoints into server"
```

---

## Task 10: Integration into Narration Flow

Modify `generateGameNarration()` in `server.js` to check if a user is in bootstrap/transition phase and adjust narration accordingly.

**Files:**
- Modify: `server.js` (modify `generateGameNarration`)
- Test: `tests/integration/game/bootstrap-narration-flow.test.js`

**Step 1: Write failing integration test**

Create `tests/integration/game/bootstrap-narration-flow.test.js`:

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadWordTracker, saveWordTracker, recordExposure } from '../../../src/game/word-tracker.js';
import { getBootstrapPhaseForNarration } from '../../../src/game/bootstrap-api.js';

describe('Bootstrap Narration Flow Integration', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-flow');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('bootstrap phase user gets bootstrap narration flag', () => {
    const tracker = loadWordTracker('flow-test', testDir);
    recordExposure(tracker, '水');
    saveWordTracker(tracker, testDir);

    const phase = getBootstrapPhaseForNarration('flow-test', testDir);
    assert.strictEqual(phase, 'bootstrap');
  });

  it('transition phase user gets transition flag', () => {
    const tracker = loadWordTracker('flow-test-2', testDir);
    for (let i = 0; i < 100; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    saveWordTracker(tracker, testDir);

    const phase = getBootstrapPhaseForNarration('flow-test-2', testDir);
    assert.strictEqual(phase, 'transition');
  });

  it('full-japanese phase user gets null (use existing system)', () => {
    const tracker = loadWordTracker('flow-test-3', testDir);
    for (let i = 0; i < 250; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    saveWordTracker(tracker, testDir);

    const phase = getBootstrapPhaseForNarration('flow-test-3', testDir);
    assert.strictEqual(phase, 'full-japanese');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/integration/game/bootstrap-narration-flow.test.js`
Expected: FAIL — `getBootstrapPhaseForNarration` not exported

**Step 3: Add phase lookup helper to bootstrap-api.js**

Add to `src/game/bootstrap-api.js`:

```javascript
/**
 * Quick phase check for narration flow decisions.
 * Returns 'bootstrap', 'transition', or 'full-japanese'.
 */
export function getBootstrapPhaseForNarration(userId, trackerDir) {
  const tracker = loadWordTracker(userId, trackerDir);
  return getPhase(tracker);
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/integration/game/bootstrap-narration-flow.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/bootstrap-api.js tests/integration/game/bootstrap-narration-flow.test.js
git commit -m "feat: add bootstrap phase detection for narration flow"
```

---

## Task 11: Modify Narration Box to Accept HTML

Ensure the frontend narration box renders HTML (for `<ruby>` tags and scaffold annotations) when receiving bootstrap narration.

**Files:**
- Modify: `public/js/ui/narration-box.js`
- No test (visual; verify with Playwright)

**Step 1: Inspect narration-box.js text rendering**

Read `public/js/ui/narration-box.js` and find where text is set on the DOM. If it already uses `innerHTML`, this step is a no-op. If it uses `textContent`, change it to `innerHTML` — but ONLY for the specific rendering path, not for user-generated content (to avoid XSS). Since all bootstrap narration is server-generated from hand-authored content, this is safe.

Look for lines like:
```javascript
textEl.textContent = text;
// change to:
textEl.innerHTML = text;
```

**Step 2: Syntax-check**

Run: `node --check public/js/ui/narration-box.js && echo "OK"`
Expected: `OK`

**Step 3: Commit (only if changes were needed)**

```bash
git add public/js/ui/narration-box.js
git commit -m "fix: narration box renders HTML for bootstrap scaffolding"
```

---

## Task 12: Run Full Test Suite

Verify nothing is broken.

**Step 1: Run all tests**

Run: `npm test`
Expected: All Tier 1 + Tier 2 tests PASS

**Step 2: Check coverage floor**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: Coverage meets or exceeds current floor (55%)

**Step 3: Commit if any adjustments needed**

No commit expected unless tests revealed issues that needed fixing.

---

## Future Tasks (Not in This Plan)

These are documented for future implementation but not part of this initial plan:

1. **Run narration content** — Hand-author narration for guided runs 1-3 (data files + narration selector)
2. **Phase 2 AI prompt** — Modify `buildDmSystemPrompt()` for transition phase mixed English/Japanese
3. **Frontend bootstrap flow** — UI for prologue sequence (scene-by-scene progression)
4. **Expand curriculum to 100 words** — Cross-reference WaniKani L1-5 + JPDB frequency data
5. **Combat exposure tracking** — Hook word tracker into combat move usage (2x multiplier)
6. **TTS exposure tracking** — Hook word tracker into TTS playback events
7. **Skip bootstrap** — Allow players with existing JPDB vocab to skip directly to transition/full-japanese
8. **FSRS integration** — Replace fixed exposure thresholds with spaced repetition scheduling
