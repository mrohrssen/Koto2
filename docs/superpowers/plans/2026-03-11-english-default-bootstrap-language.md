# English-Default Bootstrap Language System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default the game to English for new players with a bootstrap renderer that gradually converts static text to Japanese as the player learns words.

**Architecture:** A bootstrap renderer with two display modes (`jp-first`, `en-first`) processes pre-tagged static text against a player's known-words set. Dialogue remains Japanese (i+1). New users upload a word list at registration. Features that don't fit the MVP (narration, Chippy, doors, quizzes) are stubbed out.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, existing i18n system, interim word-knowledge service (FSRS replacement comes later)

**Spec:** `docs/superpowers/specs/2026-03-11-english-default-bootstrap-language-design.md`

**Revision notes (v2):** This plan corrects issues found in v1 review:
- Fixed XSS risk in `t()` when returning HTML with interpolated arguments
- Fixed registration endpoint to handle both JSON and multipart requests
- Removed false-premise Task 14 (NPCs don't have static greeting/defeatLine/postCombat fields)
- Added tasks for speed review → markKnown() bridge and combat → registerExposure() bridge
- Added migration handling for existing runs with `pendingBranch: true`
- Fixed duplicate Task 12 numbering
- Expanded cleanup task to include all old bootstrap files (routes, curriculum, tests)
- Added known-words loading to game init flow via Store pattern
- Clarified pre-tagging scope and translation accuracy requirements

---

## Chunk 1: Core Systems

### Task 1: Bootstrap Tag Parser

Build the parser that converts `{english|kanji|reading}` tagged strings into structured segments.

**Files:**
- Create: `src/game/bootstrap/parser.js`
- Create: `tests/unit/bootstrap-parser.test.js`

- [ ] **Step 1: Write failing tests for the parser**

```js
// tests/unit/bootstrap-parser.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaggedText } from '../../src/game/bootstrap/parser.js';

describe('parseTaggedText', () => {
  it('returns plain text as a single segment', () => {
    const result = parseTaggedText('Hello world');
    assert.deepStrictEqual(result, [
      { type: 'text', content: 'Hello world' }
    ]);
  });

  it('parses a single tagged word with all fields', () => {
    const result = parseTaggedText('Choose a {monster|モンスター|もんすたー} to train');
    assert.deepStrictEqual(result, [
      { type: 'text', content: 'Choose a ' },
      { type: 'word', english: 'monster', kanji: 'モンスター', reading: 'もんすたー' },
      { type: 'text', content: ' to train' }
    ]);
  });

  it('parses tagged word with empty reading (katakana words)', () => {
    const result = parseTaggedText('{CRITICAL HIT|クリティカル|}');
    assert.deepStrictEqual(result, [
      { type: 'word', english: 'CRITICAL HIT', kanji: 'クリティカル', reading: '' }
    ]);
  });

  it('parses multiple tagged words', () => {
    const result = parseTaggedText('{heal|回復|かいふく} all {creatures|生き物|いきもの}');
    assert.equal(result.length, 3);
    assert.equal(result[0].type, 'word');
    assert.equal(result[0].english, 'heal');
    assert.equal(result[1].type, 'text');
    assert.equal(result[1].content, ' all ');
    assert.equal(result[2].type, 'word');
    assert.equal(result[2].english, 'creatures');
  });

  it('returns empty array for empty string', () => {
    const result = parseTaggedText('');
    assert.deepStrictEqual(result, []);
  });

  it('handles adjacent tags with no separator', () => {
    const result = parseTaggedText('{fire|火|ひ}{water|水|みず}');
    assert.equal(result.length, 2);
    assert.equal(result[0].kanji, '火');
    assert.equal(result[1].kanji, '水');
  });

  it('does not match interpolation tokens like {0} or {1}', () => {
    const result = parseTaggedText('{0} deals {1} {damage|ダメージ|}');
    assert.equal(result.length, 3);
    assert.equal(result[0].type, 'text');
    assert.equal(result[0].content, '{0} deals {1} ');
    assert.equal(result[1].type, 'word');
    assert.equal(result[1].english, 'damage');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/bootstrap-parser.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the parser**

```js
// src/game/bootstrap/parser.js

// Matches {english|kanji|reading} — requires exactly 2 pipes.
// Does NOT match {0}, {1} interpolation tokens (no pipes).
const TAG_RE = /\{([^|{}]*)\|([^|{}]*)\|([^|}]*)\}/g;

/**
 * Parse text with {english|kanji|reading} tags into segments.
 * @param {string} text - Tagged text string
 * @returns {Array<{type: 'text', content: string} | {type: 'word', english: string, kanji: string, reading: string}>}
 */
export function parseTaggedText(text) {
  if (!text) return [];
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_RE)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'word',
      english: match[1],
      kanji: match[2],
      reading: match[3]
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/bootstrap-parser.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/parser.js tests/unit/bootstrap-parser.test.js
git commit -m "feat: bootstrap tag parser for {english|kanji|reading} format"
```

---

### Task 2: Bootstrap Renderer

Build the renderer that resolves parsed segments against a player's known-words set and outputs HTML.

**Files:**
- Create: `src/game/bootstrap/renderer.js`
- Create: `tests/unit/bootstrap-renderer.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/bootstrap-renderer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpFirst, renderEnFirst } from '../../src/game/bootstrap/renderer.js';

describe('renderJpFirst', () => {
  it('shows English annotation when word is unknown', () => {
    const html = renderJpFirst('森', 'もり', 'forest', new Set());
    assert.ok(html.includes('<ruby>'));
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(html.includes('forest'));
  });

  it('hides English annotation when word is known', () => {
    const html = renderJpFirst('森', 'もり', 'forest', new Set(['森']));
    assert.ok(html.includes('<ruby>'));
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(!html.includes('forest'));
  });

  it('handles empty reading (katakana words)', () => {
    const html = renderJpFirst('クリティカル', '', 'critical', new Set());
    assert.ok(html.includes('クリティカル'));
    assert.ok(html.includes('critical'));
    assert.ok(!html.includes('<rt>'));
  });
});

describe('renderEnFirst', () => {
  it('renders tagged text with all words unknown as English', () => {
    const html = renderEnFirst('Heal all {creatures|生き物|いきもの}', new Set());
    assert.ok(html.includes('creatures'));
    assert.ok(!html.includes('生き物'));
    assert.ok(html.includes('Heal all'));
  });

  it('swaps known words to Japanese with ruby', () => {
    const html = renderEnFirst('Heal all {creatures|生き物|いきもの}', new Set(['生き物']));
    assert.ok(!html.includes('>creatures<'));
    assert.ok(html.includes('生き物'));
    assert.ok(html.includes('いきもの'));
  });

  it('renders untagged text as-is', () => {
    const html = renderEnFirst('Hello world', new Set());
    assert.equal(html, 'Hello world');
  });

  it('handles mixed tagged and untagged text', () => {
    const html = renderEnFirst(
      '{monster|モンスター|もんすたー} deals 28 {damage|ダメージ|}',
      new Set(['ダメージ'])
    );
    assert.ok(html.includes('monster'));
    assert.ok(html.includes('ダメージ'));
    assert.ok(html.includes(' deals 28 '));
  });

  it('HTML-escapes all output', () => {
    const html = renderEnFirst('{<script>|悪|あく}', new Set());
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/bootstrap-renderer.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the renderer**

```js
// src/game/bootstrap/renderer.js
import { parseTaggedText } from './parser.js';

/**
 * Render a single word in jp-first mode.
 * Always shows kanji + furigana. Shows English annotation if word is unknown.
 * @param {string} kanji - Japanese display form
 * @param {string} reading - Furigana reading (empty for katakana)
 * @param {string} english - English meaning
 * @param {Set<string>} knownWords - Player's known word set
 * @returns {string} HTML string
 */
export function renderJpFirst(kanji, reading, english, knownWords) {
  const isKnown = knownWords.has(kanji);
  let html = '<span class="bs-word">';

  if (reading) {
    html += `<ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby>`;
  } else {
    html += esc(kanji);
  }

  if (!isKnown && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
  }

  html += '</span>';
  return html;
}

/**
 * Render a tagged string in en-first mode.
 * Known words show as Japanese with ruby, unknown words show as English.
 * @param {string} taggedText - Text with {english|kanji|reading} tags
 * @param {Set<string>} knownWords - Player's known word set
 * @returns {string} HTML string
 */
export function renderEnFirst(taggedText, knownWords) {
  const segments = parseTaggedText(taggedText);
  return segments.map(seg => {
    if (seg.type === 'text') return esc(seg.content);
    const isKnown = knownWords.has(seg.kanji);
    if (!isKnown) return esc(seg.english);
    if (seg.reading) {
      return `<span class="bs-word"><ruby>${esc(seg.kanji)}<rt>${esc(seg.reading)}</rt></ruby></span>`;
    }
    return `<span class="bs-word">${esc(seg.kanji)}</span>`;
  }).join('');
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

**Note:** CSS classes use `bs-word` / `bs-word-en` prefix to avoid colliding with any existing `.word` class in the codebase.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/bootstrap-renderer.test.js`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/renderer.js tests/unit/bootstrap-renderer.test.js
git commit -m "feat: bootstrap renderer with jp-first and en-first display modes"
```

---

### Task 3: Word Knowledge Service (Interim)

Build the interim word knowledge tracker that will later be replaced by FSRS. Tracks words as "seen" (exposed) or "known" (recalled in speed review).

**Context:** The old `word-tracker.js` uses a 4-stage exposure system. This replaces it with a simpler binary seen/known model per the spec.

**Files:**
- Create: `src/game/bootstrap/word-knowledge.js`
- Create: `tests/unit/word-knowledge.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/word-knowledge.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWordKnowledge,
  registerExposure,
  markKnown,
  isWordKnown,
  getKnownWords,
  getSeenWords,
  seedKnownWords
} from '../../src/game/bootstrap/word-knowledge.js';

describe('word-knowledge', () => {
  let wk;

  beforeEach(() => {
    wk = createWordKnowledge('test-user');
  });

  it('creates empty knowledge for new user', () => {
    assert.equal(getKnownWords(wk).size, 0);
    assert.equal(getSeenWords(wk).size, 0);
  });

  it('registerExposure marks word as seen but not known', () => {
    registerExposure(wk, '森');
    assert.ok(getSeenWords(wk).has('森'));
    assert.ok(!isWordKnown(wk, '森'));
  });

  it('markKnown transitions word from seen to known', () => {
    registerExposure(wk, '森');
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
  });

  it('markKnown works even without prior exposure', () => {
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
  });

  it('seedKnownWords bulk-adds words as known', () => {
    seedKnownWords(wk, ['森', '火', '水']);
    assert.equal(getKnownWords(wk).size, 3);
    assert.ok(isWordKnown(wk, '森'));
    assert.ok(isWordKnown(wk, '火'));
    assert.ok(isWordKnown(wk, '水'));
  });

  it('getKnownWords returns a Set', () => {
    seedKnownWords(wk, ['森']);
    const known = getKnownWords(wk);
    assert.ok(known instanceof Set);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/word-knowledge.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

```js
// src/game/bootstrap/word-knowledge.js
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Create a new word knowledge tracker for a user.
 * @param {string} userId
 * @returns {object} Word knowledge state
 */
export function createWordKnowledge(userId) {
  return {
    userId,
    seen: {},    // { wordId: { exposures: number, firstSeen: ISO } }
    known: {}    // { wordId: { knownSince: ISO } }
  };
}

/** Register that a word was shown to the player. */
export function registerExposure(wk, wordId) {
  if (!wk.seen[wordId]) {
    wk.seen[wordId] = { exposures: 0, firstSeen: new Date().toISOString() };
  }
  wk.seen[wordId].exposures++;
}

/** Mark a word as known (successfully recalled in speed review). */
export function markKnown(wk, wordId) {
  if (!wk.known[wordId]) {
    wk.known[wordId] = { knownSince: new Date().toISOString() };
  }
}

/** Check if a word is known. */
export function isWordKnown(wk, wordId) {
  return !!wk.known[wordId];
}

/** Get all known words as a Set. */
export function getKnownWords(wk) {
  return new Set(Object.keys(wk.known));
}

/** Get all seen words as a Set. */
export function getSeenWords(wk) {
  return new Set(Object.keys(wk.seen));
}

/** Bulk-add words as known (for seeding from uploaded word list). */
export function seedKnownWords(wk, words) {
  const now = new Date().toISOString();
  for (const word of words) {
    if (!wk.known[word]) {
      wk.known[word] = { knownSince: now };
    }
  }
}

/** Load word knowledge from disk. Returns null if not found. */
export function loadWordKnowledge(userId) {
  const filePath = path.join(DATA_DIR, `word-knowledge-${userId}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Save word knowledge to disk. */
export function saveWordKnowledge(wk) {
  const filePath = path.join(DATA_DIR, `word-knowledge-${wk.userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wk, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/word-knowledge.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/word-knowledge.test.js
git commit -m "feat: interim word knowledge service (seen/known tracking)"
```

---

### Task 4: Word List Upload — Server Endpoint

Add a server endpoint for uploading a `.txt` word list during registration, and a helper to parse it.

**Compatibility note:** Adding `multer` middleware to the register route does NOT break JSON requests. Multer only activates for `multipart/form-data` Content-Type. For `application/json` requests, multer is a no-op and `express.json()` (already configured globally) populates `req.body` as usual. Both JSON and multipart registration requests will work.

**Files:**
- Create: `src/game/bootstrap/word-list-parser.js`
- Create: `tests/unit/word-list-parser.test.js`
- Modify: `src/auth/routes.js` — add word list handling to POST /api/auth/register

- [ ] **Step 1: Write failing tests for the word list parser**

```js
// tests/unit/word-list-parser.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWordList } from '../../src/game/bootstrap/word-list-parser.js';

describe('parseWordList', () => {
  it('parses one word per line', () => {
    const words = parseWordList('森\n火\n水\n');
    assert.deepStrictEqual(words, ['森', '火', '水']);
  });

  it('handles Windows line endings', () => {
    const words = parseWordList('森\r\n火\r\n水\r\n');
    assert.deepStrictEqual(words, ['森', '火', '水']);
  });

  it('skips blank lines', () => {
    const words = parseWordList('森\n\n火\n\n');
    assert.deepStrictEqual(words, ['森', '火']);
  });

  it('trims whitespace', () => {
    const words = parseWordList('  森  \n  火  \n');
    assert.deepStrictEqual(words, ['森', '火']);
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(parseWordList(''), []);
  });

  it('deduplicates words', () => {
    const words = parseWordList('森\n森\n火\n');
    assert.deepStrictEqual(words, ['森', '火']);
  });

  it('skips lines with only ASCII (likely comments or headers)', () => {
    const words = parseWordList('# My word list\n森\nknown words:\n火\n');
    assert.deepStrictEqual(words, ['森', '火']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/word-list-parser.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the parser**

```js
// src/game/bootstrap/word-list-parser.js

// Matches any CJK, hiragana, or katakana character
const HAS_JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

/**
 * Parse a text file of Japanese words (one per line) into a deduplicated array.
 * Skips blank lines and lines with no Japanese characters.
 * @param {string} text - Raw text content
 * @returns {string[]} Array of unique words
 */
export function parseWordList(text) {
  if (!text) return [];
  const seen = new Set();
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim();
    if (word && HAS_JAPANESE_RE.test(word) && !seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/word-list-parser.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Install multer dependency**

Run: `npm install multer`

- [ ] **Step 6: Add word list upload to registration endpoint**

Modify `src/auth/routes.js`. Add imports at the top:

```js
import multer from 'multer';
import { parseWordList } from '../game/bootstrap/word-list-parser.js';
import { createWordKnowledge, seedKnownWords, saveWordKnowledge } from '../game/bootstrap/word-knowledge.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
```

Add `upload.single('wordList')` middleware to the register route (line ~42):

```js
// Change from:
//   router.post('/register', async (req, res) => {
// To:
router.post('/register', upload.single('wordList'), async (req, res) => {
```

After the existing user creation success block (around line ~73), add word knowledge seeding:

```js
// Seed word knowledge from uploaded word list
const wk = createWordKnowledge(user.id);
if (req.file) {
  const words = parseWordList(req.file.buffer.toString('utf-8'));
  if (words.length > 0) {
    seedKnownWords(wk, words);
  }
}
saveWordKnowledge(wk);
```

- [ ] **Step 7: Run existing auth tests to check for regressions**

Run: `npm test`
Expected: Existing tests still pass (multer is a no-op for JSON requests)

- [ ] **Step 8: Commit**

```bash
git add src/game/bootstrap/word-list-parser.js tests/unit/word-list-parser.test.js src/auth/routes.js package.json package-lock.json
git commit -m "feat: word list upload at registration with parsing and seeding"
```

---

### Task 5: Word List Upload — Frontend UI

Add a file upload input to the registration form.

**Files:**
- Modify: `public/game.html` — add file input to register form
- Modify: `public/js/ui/auth.js` — send file with registration request

- [ ] **Step 1: Add file input to the registration form HTML**

Modify `public/game.html`. Find the auth form area (search for `invite` to find the invite code field). Add after the invite code field:

```html
<div id="wordListField" class="auth-field" style="display:none;">
  <label for="word-list-upload" class="auth-label">Known Words (.txt)</label>
  <input type="file" id="word-list-upload" accept=".txt" class="auth-input">
  <small class="auth-hint">Optional: one Japanese word per line</small>
</div>
```

- [ ] **Step 2: Show/hide the file input based on active tab**

Modify `public/js/ui/auth.js` around line 46-52 where tab switching happens:

```js
// In the register tab click handler, add:
document.getElementById('wordListField').style.display = '';

// In the login tab click handler, add:
document.getElementById('wordListField').style.display = 'none';
```

- [ ] **Step 3: Send the file with the registration request**

Modify `public/js/ui/auth.js` in `handleSubmit()` (around line 109-151). When registering, use `FormData` instead of JSON to support file upload:

```js
// Replace the existing fetch call for registration with:
if (currentTab === 'register') {
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  formData.append('inviteCode', inviteCode);
  const fileInput = document.getElementById('word-list-upload');
  if (fileInput.files.length > 0) {
    formData.append('wordList', fileInput.files[0]);
  }
  const resp = await fetch('/api/auth/register', {
    method: 'POST',
    body: formData  // No Content-Type header — browser sets multipart boundary
  });
  // ... rest of response handling unchanged
}
```

**Note:** The login path continues to send JSON as before — only registration changes.

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/auth.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/game.html public/js/ui/auth.js
git commit -m "feat: word list file upload in registration UI"
```

---

## Chunk 2: Feature Stubs

### Task 6: Remove Door Branching — Auto-Advance

Remove the door selection UI and Chippy hints. Rooms auto-advance without player choice.

**Migration for existing saves:** Players mid-run may have `pendingBranch: true` in their saved state. The phase machine (line 147 of `src/game/phase-machine.js`) checks this field and transitions to `BRANCH_SELECTION` phase. We must handle this gracefully: if `pendingBranch` is true, auto-select door 0 (first room) and clear the flag, rather than crashing or showing a removed UI.

**Files:**
- Modify: `src/game/rooms.js` — stop generating branch pairs, generate single rooms only
- Modify: `src/game/phase-machine.js` — remove BRANCH_SELECTION phase, auto-resolve pendingBranch
- Modify: `src/game/services/exploration-service.js` — remove branch selection handling
- Modify: `src/routes/game/run.js` — remove select-branch and door-hints endpoints
- Modify: `public/js/ui/exploration.js` — remove `renderBranchSelection()` and DOOR_INTROS
- Modify: `public/js/api.js` — remove selectBranch/doorHints calls
- Modify: `src/game/state.js` — remove `pendingBranch` from `createNewRun()`

- [ ] **Step 1: Modify room generation to produce single rooms only**

In `src/game/rooms.js`, modify `generateAreaRooms()` (lines 184-212). Replace the branch-pair logic (lines 193-208) with single room generation:

```js
// Replace the for-loop that generates branch pairs with:
for (let i = 0; i < roomCount; i++) {
  const room = generateSingleRoom(areaId, i + 1, roomCount, lastSpecialType, encountersOnly, forceRoomType);
  if (room.type !== 'encounter') lastSpecialType = room.type;
  rooms.push(room);
}
```

Remove `generateBranchPair()` function (lines 167-178).

- [ ] **Step 2: Auto-resolve pendingBranch in phase machine**

In `src/game/phase-machine.js`, find the `BRANCH_SELECTION` phase check (line ~147):

```js
// Replace:
//   if (run.pendingBranch) return PHASES.BRANCH_SELECTION;
// With:
if (run.pendingBranch) {
  // Migration: auto-select first door for saves created before door removal.
  // When pendingBranch is true, the rooms array already contains all generated
  // rooms (including branch pairs). The flag just means the player hadn't
  // chosen a door yet. Clearing the flag lets the phase machine fall through
  // to the normal EXPLORING phase, which advances to the next room in the array.
  // The first room of each branch pair is at the current index, so no room
  // selection logic is needed — the player simply continues forward.
  run.pendingBranch = false;
}
```

Remove `BRANCH_SELECTION` from the `PHASES` enum (line ~33).

- [ ] **Step 3: Remove select-branch and door-hints API endpoints**

In `src/routes/game/run.js`:
- Remove `POST /select-branch` handler (lines ~155-168)
- Remove `POST /door-hints` handler (lines ~171-193)

In `public/js/api.js`:
- Remove `selectBranch()` and `doorHints()` exported functions

- [ ] **Step 4: Remove branch selection UI**

In `public/js/ui/exploration.js`:
- Delete the `DOOR_INTROS` array (lines 52-73)
- Remove `renderBranchSelection()` function (lines 406-520+)
- In `renderExploring()`, remove any conditional that checks for pending branches

- [ ] **Step 5: Remove pendingBranch from new run state**

In `src/game/state.js`, `createNewRun()` (line ~150), remove the `pendingBranch: false` field.

- [ ] **Step 6: Delete branching test file and run tests**

Delete `tests/unit/game/branching-rooms.test.js` — this file tests `generateBranchPair()` and branch selection logic which no longer exist:

```bash
rm -f tests/unit/game/branching-rooms.test.js
```

Then search for any other test files referencing branching:

```bash
grep -rln 'pendingBranch\|selectBranch\|generateBranchPair\|BRANCH_SELECTION' tests/ --include='*.js'
```

For each file found: if the entire test file is about branching, delete it. If only some tests reference branching, remove those specific test cases.

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/game/rooms.js src/game/phase-machine.js src/game/services/exploration-service.js src/routes/game/run.js public/js/ui/exploration.js public/js/api.js src/game/state.js
git commit -m "feat: remove door branching, auto-advance to next room"
```

---

### Task 7: Stub Out Narration, Chippy, and Quiz Rooms

Remove DM narration boxes, Chippy references, and quiz rooms from the room pool.

**Files:**
- Modify: `src/game/rooms.js` — remove quiz from room type pool
- Modify: `public/js/ui/exploration.js` — remove narration box calls during exploration
- Modify: `src/game/dm.js` — stub narration generation (keep file, just short-circuit)

- [ ] **Step 1: Remove quiz from room generation**

In `src/game/rooms.js`, `generateSingleRoom()` (lines ~119-166), remove `quiz` from the special room type chances:

```js
// Change the special room chance rates to exclude quiz:
// Before: shrine 10%, quiz 10%, wordDiscovery 10%, dealer 10%, whackAMole 5%
// After:  shrine 10%, wordDiscovery 10%, dealer 10%, whackAMole 5%
```

- [ ] **Step 2: Delete narration calls from room entry**

In `public/js/ui/exploration.js`, search for these patterns and **delete the call sites** (not the called functions — those live in other modules):

```bash
grep -n 'showNarration\|narration-box\|getRoomEntryNarration' public/js/ui/exploration.js
```

For each match: delete the function call and any surrounding conditional that exists only to trigger narration. If the narration call is inside an `async` block that `await`s it, remove the entire await statement. The goal is that room transitions skip directly to rendering the room content without showing a narration overlay.

- [ ] **Step 3: Delete Chippy speaker references**

In `public/js/ui/exploration.js`, search for Chippy-related code:

```bash
grep -n "チッピー\|showChippy\|chippy" public/js/ui/exploration.js
```

For each match: delete the Chippy sprite setup code, the speaker name assignment, and any TTS calls that specifically use `'チッピー'` as the speaker. These are all within `renderBranchSelection()` which was already removed in Task 6 Step 4. Verify no other functions reference Chippy — if they do, delete those references too.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Tests pass

- [ ] **Step 5: Commit**

```bash
git add src/game/rooms.js public/js/ui/exploration.js src/game/dm.js
git commit -m "feat: stub out narration boxes, Chippy, and quiz rooms"
```

---

## Chunk 3: Data Changes

**Note on content authoring scope:** Tasks 9-10 require pre-tagging strings with `{english|kanji|reading}` markers. This is a significant manual effort. Each tagged word **must use dictionary-accurate Japanese** per project CLAUDE.md rules — verify against JPDB or a dictionary. When in doubt, leave the word untagged (English-only) rather than tag it with an inaccurate translation.

**Tagging guidelines:**
- Only tag content words (nouns, verbs, adjectives) — not function words (the, a, for, of)
- Only tag words where the Japanese equivalent is natural and commonly used
- For katakana loanwords (ダメージ, クリティカル), leave reading field empty: `{damage|ダメージ|}`
- For kanji words, always include the reading: `{heal|回復|かいふく}`
- Leave numbers, stats (HP, ATK, %), and proper nouns untagged

### Task 8: Add NPC Role Field

Add a `role` field to each NPC in npcs.json with a Japanese word for their occupation/role.

**Files:**
- Modify: `data/character-cards/npcs.json` — add `role` to each NPC

- [ ] **Step 1: Read current NPC data to understand the full schema**

Run: `node -e "const d = JSON.parse(require('fs').readFileSync('./data/character-cards/npcs.json','utf-8')); console.log(Object.keys(d).length, 'NPCs'); console.log(JSON.stringify(d[Object.keys(d)[0]], null, 2).slice(0, 500))"`

Review the full list of NPCs and determine appropriate role words for each.

- [ ] **Step 2: Add role field to each NPC**

For each NPC, add a `role` object with `word`, `reading`, and `meaning`. Choose roles that match the NPC's personality and area. Use JPDB-verified words with accurate translations.

Example roles:
```json
{ "role": { "word": "隠者", "reading": "いんじゃ", "meaning": "hermit" } }
{ "role": { "word": "商人", "reading": "しょうにん", "meaning": "merchant" } }
{ "role": { "word": "学者", "reading": "がくしゃ", "meaning": "scholar" } }
```

**Translation accuracy:** Show the exact JPDB `meanings` array for each word you look up. Do not paraphrase.

- [ ] **Step 3: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('./data/character-cards/npcs.json','utf-8')); console.log('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add data/character-cards/npcs.json
git commit -m "data: add role field to all NPCs for bootstrap name display"
```

---

### Task 9: Pre-Tag i18n Strings

Add `{english|kanji|reading}` tags to i18n strings so the en-first renderer can swap learned words.

**Files:**
- Modify: `public/js/ui/i18n.js` — add a `tagged` field alongside `en`/`ja` for each string

- [ ] **Step 1: Read the current i18n strings**

Read `public/js/ui/i18n.js` to see all entries in the `strings` object (lines ~22-96).

- [ ] **Step 2: Add tagged versions**

For each i18n entry, add a `tagged` key containing the English text with `{english|kanji|reading}` tags. Only tag words that have clear, dictionary-verified Japanese equivalents.

```js
criticalHit: {
  en: 'CRITICAL HIT!',
  ja: 'クリティカル！',
  tagged: '{CRITICAL HIT|クリティカル|}!'
},
dealsDamage: {
  en: '{0} deals {1} damage!',
  ja: '{0}が{1}ダメージ！',
  tagged: '{0} deals {1} {damage|ダメージ|}!'
},
```

**Important:** `{0}`, `{1}` interpolation tokens do NOT conflict with `{english|kanji|reading}` tags because interpolation tokens have no `|` pipes. The parser regex requires exactly 2 pipes. Interpolation is performed first (replacing `{0}` with the argument value), then the result is passed to `renderEnFirst()`.

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/i18n.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/i18n.js
git commit -m "feat: add tagged i18n strings for bootstrap en-first rendering"
```

---

### Task 10: Pre-Tag Item and Move Descriptions

Add `{english|kanji|reading}` tags to `description` fields in items.json and moves.json.

**Files:**
- Modify: `data/items.json` — add `descriptionTagged` field to each item
- Modify: `data/moves.json` — add `descriptionTagged` field to each move

- [ ] **Step 1: Add descriptionTagged to items**

For each item in items.json, add a `descriptionTagged` field. Tag English words that have Japanese equivalents. Leave mechanical terms (HP, %, numbers) untagged.

```json
{
  "description": "Heal all creatures for 10% of max HP",
  "descriptionTagged": "{Heal|回復|かいふく} all {creatures|生き物|いきもの} for 10% of max HP"
}
```

- [ ] **Step 2: Add descriptionTagged to moves**

Same approach for moves.json:

```json
{
  "description": "Rushes forward at full speed, gaining an extra action.",
  "descriptionTagged": "Rushes forward at full {speed|速度|そくど}, gaining an extra {action|行動|こうどう}."
}
```

- [ ] **Step 3: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('./data/items.json','utf-8')); JSON.parse(require('fs').readFileSync('./data/moves.json','utf-8')); console.log('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add data/items.json data/moves.json
git commit -m "data: add tagged descriptions for bootstrap en-first rendering"
```

---

## Chunk 4: UI Wiring

### Task 11: CSS for Bootstrap Word Rendering

Add CSS styles for the bootstrap word display classes used by the renderer. **Must be done before Tasks 12-15** which output these CSS classes.

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Add bootstrap word styles**

```css
/* Bootstrap language scaffolding */
.bs-word {
  display: inline;
  white-space: nowrap;
}

.bs-word ruby {
  ruby-position: over;
}

.bs-word rt {
  font-size: 0.55em;
  color: var(--text-muted, #8ab4d8);
  font-weight: normal;
}

.bs-word-en {
  font-size: 0.6em;
  color: var(--text-dim, #a0a0a0);
  display: block;
  text-align: center;
  line-height: 1.1;
}

.creature-subtitle {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/game.css
git commit -m "style: add CSS for bootstrap word rendering (ruby + english annotations)"
```

---

### Task 12: Client-Side Bootstrap Renderer Module

Create a browser-compatible bootstrap renderer. The server-side renderer (Task 2) uses Node imports; the client needs a standalone version with module-level known-words state.

**Files:**
- Create: `public/js/ui/bootstrap-client.js`

- [ ] **Step 1: Create client-side bootstrap renderer**

```js
// public/js/ui/bootstrap-client.js

const TAG_RE = /\{([^|{}]*)\|([^|{}]*)\|([^|}]*)\}/g;

let _knownWords = new Set();

/** Set the player's known words (called on game load). */
export function setKnownWords(words) {
  _knownWords = new Set(words);
}

/** Get current known words set. */
export function getKnownWords() {
  return _knownWords;
}

/**
 * Render tagged text in en-first mode.
 * Known words show as Japanese with ruby, unknown stay English.
 */
export function renderEnFirst(taggedText) {
  if (!taggedText) return '';
  return taggedText.replace(TAG_RE, (_, english, kanji, reading) => {
    if (!_knownWords.has(kanji)) return esc(english);
    if (reading) {
      return `<span class="bs-word"><ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby></span>`;
    }
    return `<span class="bs-word">${esc(kanji)}</span>`;
  });
}

/**
 * Render a single word in jp-first mode.
 * Always shows kanji + furigana. Shows English if word is unknown.
 */
export function renderJpFirst(kanji, reading, english) {
  let html = '<span class="bs-word">';
  if (reading) {
    html += `<ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby>`;
  } else {
    html += esc(kanji);
  }
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
  }
  html += '</span>';
  return html;
}

/** HTML-escape a string. Exported for use by other UI modules that mix bootstrap output with plain text. */
export function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/bootstrap-client.js
git commit -m "feat: client-side bootstrap renderer module"
```

---

### Task 13: Wire Bootstrap into i18n System

Connect the bootstrap renderer to the i18n `t()` function so combat text and UI strings use the en-first renderer.

**XSS safety:** `t()` now returns HTML. Interpolated arguments (`{0}`, `{1}`) are player-visible data like creature names and damage numbers. These must be HTML-escaped before insertion to prevent XSS. The `renderEnFirst()` function escapes its own output, but interpolation happens *before* rendering, so raw args could inject HTML.

**Files:**
- Modify: `public/js/ui/i18n.js` — add bootstrap rendering path to `t()`

- [ ] **Step 1: Read current t() implementation**

Read `public/js/ui/i18n.js` to see the exact `t()` function signature and implementation (lines ~98-129).

- [ ] **Step 2: Modify t() to use bootstrap rendering**

```js
import { renderEnFirst } from './bootstrap-client.js';

// Add this helper at module level:
function escHtml(s) {
  if (typeof s !== 'string') return String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Modify the t() function:
export function t(key, ...args) {
  const entry = strings[key];
  if (!entry) return key;

  // If tagged version exists, render through bootstrap
  if (entry.tagged) {
    let str = entry.tagged;
    // Escape interpolation args to prevent XSS — args may contain
    // user-visible data (creature names, numbers, etc.)
    args.forEach((a, i) => { str = str.replace(`{${i}}`, escHtml(a)); });
    return renderEnFirst(str);
  }

  // Fallback to current behavior
  const str = entry[lang] || entry.en || key;
  let result = str;
  args.forEach((a, i) => { result = result.replace(`{${i}}`, a); });
  return result;
}
```

- [ ] **Step 3: Audit t() call sites for innerHTML vs textContent**

Search for how `t()` output is used in the DOM:

Run: `grep -rn '\.textContent.*\bt(' public/js/ --include='*.js'`
Run: `grep -rn '\.innerText.*\bt(' public/js/ --include='*.js'`
Run: `grep -rn 'innerHTML.*\bt(' public/js/ --include='*.js'`

Based on code exploration, `t()` output is used in template literals for `innerHTML` assignment (not `textContent`), so no changes needed at call sites. But verify this by running the grep — if any `textContent` assignments exist, change them to `innerHTML`.

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/i18n.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/i18n.js
git commit -m "feat: wire bootstrap en-first renderer into i18n t() function"
```

---

### Task 14: Update Creature Card to Show Full Name

Modify creature display to show the full creature identity (English name + Japanese base word + modifier subtitle).

**Data fields available** (from `data/creatures.json`):
- `creature.nameEn` — English name (e.g., "Kamedor")
- `creature.baseWord` — Base kanji (e.g., "亀")
- `creature.baseReading` — Base reading (e.g., "かめ")
- `creature.baseMeaning` — Base English meaning (e.g., "turtle")
- `creature.modifier.word` — Modifier kanji (e.g., "古代")
- `creature.modifier.reading` — Modifier reading (e.g., "こだい")
- `creature.modifier.meaning` — Modifier English meaning (e.g., "Ancient")

**Files:**
- Modify: `public/js/ui/creature-row.js` — update `render()` and `showPopup()` to show subtitle

- [ ] **Step 1: Read creature-row.js**

Read `public/js/ui/creature-row.js` to understand the current rendering (focus on lines 71-129 for `render()` and lines 141-230 for `showPopup()`).

- [ ] **Step 2: Add import and subtitle rendering**

```js
import { renderJpFirst } from './bootstrap-client.js';

// In the creature slot HTML (around line 96 where creature.nameEn is shown),
// add the Japanese subtitle below the English name:
const subtitle = creature.modifier
  ? renderJpFirst(creature.modifier.word, creature.modifier.reading, creature.modifier.meaning)
    + 'の'
    + renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning)
  : renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning);

// Add to the slot HTML after the creature name span:
// <span class="creature-subtitle">${subtitle}</span>
```

- [ ] **Step 3: Update creature popup with same subtitle**

In `showPopup()` (lines 141-230), add the same subtitle to the popup header area.

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/creature-row.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/creature-row.js
git commit -m "feat: show full creature name with jp-first bootstrap subtitle"
```

---

### Task 15: Update Move, Item, and NPC Displays

Wire bootstrap rendering into move-select, post-combat-shop, and NPC name displays.

**Files:**
- Modify: `public/js/ui/move-select.js` — render move names with jp-first, descriptions with en-first
- Modify: `public/js/ui/post-combat-shop.js` — render item names with jp-first, descriptions with en-first
- Modify: `public/js/ui/scene.js` — render NPC names with role using jp-first

- [ ] **Step 1: Read move-select.js**

Read `public/js/ui/move-select.js` (lines 31-83, `buildMoveCell()`).

- [ ] **Step 2: Update move name display**

```js
import { renderJpFirst, renderEnFirst } from './bootstrap-client.js';

// In buildMoveCell() around line 65, the move name is already displayed as Japanese.
// Add jp-first rendering for the move name to include English annotation for unknown words:
// Replace direct move.name usage with:
const moveNameHtml = renderJpFirst(move.name, move.reading, move.meaning);

// For move description, use en-first with tagged text if available:
const moveDescHtml = move.descriptionTagged
  ? renderEnFirst(move.descriptionTagged)
  : move.description;
```

Note: `move.name` is already Japanese (kanji), `move.reading` is the furigana, and `move.meaning` is the English translation. These field names are confirmed from `data/moves.json`.

- [ ] **Step 3: Read and update post-combat-shop.js**

Read `public/js/ui/post-combat-shop.js` (lines 42-83).

```js
import { renderJpFirst, renderEnFirst } from './bootstrap-client.js';

// Item name (around line 58, where item.word is displayed):
const itemNameHtml = renderJpFirst(item.word, item.reading, item.meaning);

// Item description (around line 60):
const itemDescHtml = item.descriptionTagged
  ? renderEnFirst(item.descriptionTagged)
  : item.description;
```

- [ ] **Step 4: Read and update scene.js for NPC names**

Read `public/js/ui/scene.js` — find `showNpcTrainer` (around line 282).

```js
import { renderJpFirst, esc as escHtml } from './bootstrap-client.js';

// NPC name display — add role if available:
const roleHtml = npc.role
  ? ' — ' + renderJpFirst(npc.role.word, npc.role.reading, npc.role.meaning)
  : '';
const npcNameHtml = `${escHtml(npc.nameEn)}${roleHtml}`;
```

Note: `esc` is exported from `bootstrap-client.js` (as `escHtml` via named import) for HTML-escaping plain text. The NPC's `role` field is added in Task 8. If a session doesn't have Task 8 data yet, `npc.role` will be undefined and this gracefully falls back to showing just the name.

- [ ] **Step 5: Ensure all display assignments use innerHTML**

Since bootstrap rendering outputs HTML (`<ruby>`, `<span>`), verify that all places where rendered output is inserted use `innerHTML` (not `textContent`). These UI modules already use template literals in `innerHTML` assignment, so this should be a no-op verification.

- [ ] **Step 6: Syntax check all modified files**

Run: `node --check public/js/ui/move-select.js && node --check public/js/ui/post-combat-shop.js && node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/move-select.js public/js/ui/post-combat-shop.js public/js/ui/scene.js
git commit -m "feat: wire bootstrap renderer into move, item, and NPC displays"
```

---

## Chunk 5: System Integration

### Task 16: Known-Words API + Game Init Loading

Add a server endpoint to fetch the player's known words, and load them into the client-side bootstrap renderer on game start.

**Context:** The frontend uses a Store pattern (`public/js/store.js`) with `store.subscribe()` for reactive rendering. Known words must be loaded before any rendering that uses the bootstrap renderer. The game init flow is:
1. Auth → token in localStorage
2. `getGameState()` → fetches `/api/game/state`
3. Store subscribers re-render based on phase

Known words must load between steps 1 and 3.

**Files:**
- Create: `src/routes/game/known-words.js` — new route module for known-words endpoint
- Modify: `src/routes/game/index.js` — mount the new route module
- Modify: `public/js/game.js` — load known words before first render

- [ ] **Step 1: Read src/routes/game/index.js to understand route structure**

Read `src/routes/game/index.js` to see how sub-route modules are mounted (e.g., `router.use('/state', ...)`, `router.use('/run', ...)`).

- [ ] **Step 2: Create known-words route module**

Create `src/routes/game/known-words.js` following the pattern of existing sub-route files:

```js
// src/routes/game/known-words.js
import { Router } from 'express';
import { loadWordKnowledge, createWordKnowledge } from '../../game/bootstrap/word-knowledge.js';

export function createKnownWordsRoutes() {
  const router = Router();

  // GET /api/game/known-words
  router.get('/', (req, res) => {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    res.json({ words: Object.keys(wk.known) });
  });

  return router;
}
```

- [ ] **Step 3: Mount in game route index**

In `src/routes/game/index.js`, add:

```js
import { createKnownWordsRoutes } from './known-words.js';

// Add alongside other route mountings:
router.use('/known-words', createKnownWordsRoutes());
```

- [ ] **Step 4: Read game.js to understand init flow**

Read `public/js/game.js` (focus on the initialization sequence — imports, auth callbacks, first `getGameState()` call).

- [ ] **Step 5: Load known words on game start**

In `public/js/game.js`, after auth succeeds but before the first game state fetch/render:

```js
import { setKnownWords } from './ui/bootstrap-client.js';

// After auth is confirmed, before first render:
async function loadKnownWords() {
  try {
    const resp = await fetch('/api/game/known-words', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      setKnownWords(data.words);
    }
  } catch (e) {
    console.warn('Failed to load known words:', e);
    // Non-fatal — bootstrap renderer will treat all words as unknown
  }
}
```

Call `loadKnownWords()` in the init flow, awaiting it before the first `getGameState()` call.

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/game.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/known-words.js src/routes/game/index.js public/js/game.js
git commit -m "feat: known-words API endpoint and client-side loading on game start"
```

---

### Task 17: Bridge Speed Review → markKnown()

When a player successfully recalls a word in speed review, mark it as "known" in the word-knowledge service. This is what drives the bootstrap renderer to hide English annotations.

**Context:** Speed review currently goes through JPDB (`POST /api/vocab/jpdb/review` in `src/routes/vocab.js` lines 69-117). When a review grade indicates successful recall, we also call `markKnown()` in the new word-knowledge service.

**Files:**
- Modify: `src/routes/vocab.js` — add markKnown call after successful JPDB review
- Modify: `public/js/game.js` or relevant UI — refresh known words after speed review session

- [ ] **Step 1: Read the JPDB review endpoint**

Read `src/routes/vocab.js` lines 69-117 to understand how grades are processed.

- [ ] **Step 2: Add `wordText` to the frontend review request**

The JPDB review endpoint (`POST /api/jpdb/review`) currently receives only `{ vid, sid, grade, isDiscovery }` — no word text. The frontend speed review UI (`public/js/ui/speed-review.js`) already has the full word object (with `word` field) from the due-words response. The simplest approach is to include the word text in the review request.

In `public/js/ui/speed-review.js`, find where `sendReview(word.vid, word.sid, grade)` is called (around line 48). Change it to also pass the word text:

```js
// Change from:
const reviewPromise = state.callbacks?.sendReview(word.vid, word.sid, grade);
// To:
const reviewPromise = state.callbacks?.sendReview(word.vid, word.sid, grade, word.word);
```

In `public/js/game.js`, update the callback (around line 1000):

```js
// Change from:
sendReview: (vid, sid, grade) => apiSendJpdbReview(vid, sid, grade),
// To:
sendReview: (vid, sid, grade, wordText) => apiSendJpdbReview(vid, sid, grade, false, wordText),
```

In `public/js/api.js`, update `apiSendJpdbReview` to include `wordText` in the request body:

```js
// Add wordText to the POST body:
body: JSON.stringify({ vid, sid, grade, isDiscovery, wordText })
```

- [ ] **Step 3: Add markKnown call to the server review endpoint**

In `src/routes/vocab.js`, add import at top:

```js
import { loadWordKnowledge, createWordKnowledge, markKnown, saveWordKnowledge } from '../game/bootstrap/word-knowledge.js';
```

In the review handler (lines 69-117), after the successful `reviewVocabulary()` call and before the response, add:

```js
// Mark word as known in bootstrap system on successful recall
// Grade mapping: 1=nothing, 2=hard, 3=okay, 4=easy, 5=perfect
// Grade >= 3 means the player successfully recalled the word
const { wordText } = req.body;
if (grade >= 3 && wordText) {
  const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
  markKnown(wk, wordText);
  saveWordKnowledge(wk);
}
```

- [ ] **Step 4: Refresh known words on client after speed review session ends**


In `public/js/ui/speed-review.js`, find the function that runs when the speed review session finishes (the "done" or "close" handler). Add a call to reload known words:

```js
import { setKnownWords } from './bootstrap-client.js';

// At the end of the speed review session (when modal closes or cards exhausted):
try {
  const resp = await fetch('/api/game/known-words', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  if (resp.ok) {
    const data = await resp.json();
    setKnownWords(data.words);
  }
} catch (e) {
  // Non-fatal
}
```

This ensures the UI immediately reflects newly learned words after speed review.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: Tests pass

- [ ] **Step 6: Commit**

```bash
git add src/routes/vocab.js public/js/ui/speed-review.js public/js/game.js public/js/api.js
git commit -m "feat: bridge speed review to word-knowledge markKnown"
```

---

### Task 18: Bridge Combat/Gameplay → registerExposure()

When words are shown to the player during gameplay (combat vocab cards), register them as "seen" in the word-knowledge service. This feeds the speed review queue with words to quiz.

**Context:** The primary word exposure point is `POST /api/vocab/due-words` in `src/routes/vocab.js` (lines 33-49). This endpoint returns full word objects with a `word` field (the kanji/kana text) via `getDueWordsWithMeanings()` from `src/jpdb.js`. Every word returned here is about to be shown to the player as a flashcard.

**Files:**
- Modify: `src/routes/vocab.js` — register exposures when vocab cards are served

- [ ] **Step 1: Read the due-words endpoint**

Read `src/routes/vocab.js` lines 33-49 to confirm the response structure. The endpoint calls `getDueWordsWithMeanings()` which returns `{ words: [{ word, reading, meanings, vid, sid }, ...], source }`.

- [ ] **Step 2: Add exposure registration to the due-words endpoint**

In `src/routes/vocab.js`, add import at top (may already be added from Task 17):

```js
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge } from '../game/bootstrap/word-knowledge.js';
```

In the `POST /api/vocab/due-words` handler, after `getDueWordsWithMeanings()` returns successfully and before `res.json(result)`, add:

```js
// Register word exposures in bootstrap system
if (result.words && result.words.length > 0) {
  try {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    for (const w of result.words) {
      if (w.word) registerExposure(wk, w.word);
    }
    saveWordKnowledge(wk);
  } catch (e) {
    // Non-fatal — don't break card serving if exposure tracking fails
    console.warn('[vocab/due-words] Failed to record exposures:', e.message);
  }
}
```

This registers every vocab card word as "seen" when the server sends it to the client. The `registerExposure()` call is idempotent — calling it multiple times for the same word just increments the exposure count.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: Tests pass

- [ ] **Step 4: Commit**

```bash
git add src/routes/vocab.js
git commit -m "feat: register word exposures when serving vocab cards"
```

---

## Chunk 6: Cleanup & Verification

### Task 19: Remove Old Bootstrap System Code

Remove the old bootstrap files that are incompatible with the new system.

**Files to delete:**
- `src/game/bootstrap-renderer.js` (81 lines — old 4-field renderer)
- `src/game/bootstrap-parser.js` (56 lines — old 4-field parser)
- `src/game/bootstrap-api.js` (95 lines — old API handlers)
- `src/game/bootstrap-narrations.js` (30 lines — prologue scene loader)
- `src/game/bootstrap-curriculum.js` (44 lines — word curriculum)
- `src/game/word-tracker.js` (146 lines — old exposure tracker)
- `src/routes/game/bootstrap.js` (32 lines — old route definitions)
- `data/bootstrap-narrations/prologue.json` (narration data)
- `data/bootstrap-curriculum.json` (curriculum data)

**Test files to delete:**
- `tests/unit/game/bootstrap-parser.test.js`
- `tests/unit/game/bootstrap-renderer.test.js`
- `tests/unit/game/bootstrap-narrations.test.js`
- `tests/unit/game/bootstrap-curriculum.test.js`
- `tests/unit/game/bootstrap-api.test.js`
- `tests/unit/game/word-tracker.test.js`
- `tests/unit/game/word-tracker-persistence.test.js`
- `tests/integration/game/bootstrap-narration-flow.test.js`

**Files to modify:**
- `src/routes/game/index.js` — remove bootstrap route mounting (line ~104)

- [ ] **Step 1: Remove bootstrap route mounting**

In `src/routes/game/index.js`, find and remove the line:
```js
router.use('/bootstrap', createBootstrapRoutes());
```
And its import.

- [ ] **Step 2: Search for remaining imports of deleted modules**

Run: `grep -rn 'bootstrap-renderer\|bootstrap-parser\|bootstrap-api\|word-tracker\|bootstrap-narrations\|bootstrap-curriculum' src/ server.js public/ tests/ --include='*.js'`

Remove all references found.

- [ ] **Step 3: Delete old files**

```bash
rm -f src/game/bootstrap-renderer.js src/game/bootstrap-parser.js src/game/bootstrap-api.js src/game/bootstrap-narrations.js src/game/bootstrap-curriculum.js src/game/word-tracker.js
rm -f src/routes/game/bootstrap.js
rm -rf data/bootstrap-narrations/
rm -f data/bootstrap-curriculum.json
rm -f tests/unit/game/bootstrap-parser.test.js tests/unit/game/bootstrap-renderer.test.js tests/unit/game/bootstrap-narrations.test.js tests/unit/game/bootstrap-curriculum.test.js tests/unit/game/bootstrap-api.test.js tests/unit/game/word-tracker.test.js tests/unit/game/word-tracker-persistence.test.js
rm -f tests/integration/game/bootstrap-narration-flow.test.js
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Tests pass (old bootstrap tests were deleted, no remaining references)

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove old bootstrap system code (replaced by new bootstrap/)"
```

Note: `git add -u` stages only modifications and deletions of tracked files — it will NOT stage untracked files. This is safer than `git add -A` which would stage everything.

---

### Task 20: Update .gitignore

Ensure per-user word knowledge files aren't committed. Update existing patterns.

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read current .gitignore**

Read `.gitignore` to see existing patterns (including `data/word-tracker-*.json` on line ~27).

- [ ] **Step 2: Add/update patterns**

```
# Per-user word knowledge (runtime-generated, replaces word-tracker)
data/word-knowledge-*.json
```

The existing `data/word-tracker-*.json` pattern can be removed once all users have migrated (leave it for now as old files may still exist on disk).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore per-user word knowledge files"
```

---

### Task 21: Integration Tests

Write integration tests that validate the full bootstrap flow.

**Files:**
- Create: `tests/integration/bootstrap-integration.test.js`

- [ ] **Step 1: Write the integration test**

```js
// tests/integration/bootstrap-integration.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaggedText } from '../../src/game/bootstrap/parser.js';
import { renderJpFirst, renderEnFirst } from '../../src/game/bootstrap/renderer.js';
import {
  createWordKnowledge, seedKnownWords, getKnownWords,
  registerExposure, markKnown, isWordKnown
} from '../../src/game/bootstrap/word-knowledge.js';

describe('bootstrap integration', () => {
  it('en-first: fully unknown player sees all English', () => {
    const wk = createWordKnowledge('test');
    const known = getKnownWords(wk); // Returns Set<string> — see Task 3 implementation
    const html = renderEnFirst(
      '{Heal|回復|かいふく} all {creatures|生き物|いきもの} for 10% of max HP',
      known
    );
    assert.ok(html.includes('Heal'));
    assert.ok(html.includes('creatures'));
    assert.ok(!html.includes('回復'));
    assert.ok(!html.includes('生き物'));
  });

  it('en-first: known words render as Japanese', () => {
    const wk = createWordKnowledge('test');
    seedKnownWords(wk, ['回復']);
    const known = getKnownWords(wk);
    const html = renderEnFirst(
      '{Heal|回復|かいふく} all {creatures|生き物|いきもの} for 10% of max HP',
      known
    );
    assert.ok(html.includes('回復'));
    assert.ok(html.includes('かいふく'));
    assert.ok(html.includes('creatures'));
  });

  it('jp-first: unknown word shows English annotation', () => {
    const known = new Set();
    const html = renderJpFirst('森', 'もり', 'forest', known);
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(html.includes('forest'));
  });

  it('jp-first: known word hides English annotation', () => {
    const known = new Set(['森']);
    const html = renderJpFirst('森', 'もり', 'forest', known);
    assert.ok(html.includes('森'));
    assert.ok(html.includes('もり'));
    assert.ok(!html.includes('forest'));
  });

  it('word knowledge lifecycle: seen → reviewed → known', () => {
    const wk = createWordKnowledge('test');
    registerExposure(wk, '森');
    assert.ok(!isWordKnown(wk, '森'));
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
  });

  it('interpolation tokens {0} coexist with tagged words', () => {
    const known = new Set(['ダメージ']);
    // Simulate what t() does: interpolate first, then render
    let str = '{0} deals {1} {damage|ダメージ|}!';
    str = str.replace('{0}', 'Kamedor').replace('{1}', '28');
    const html = renderEnFirst(str, known);
    assert.ok(html.includes('Kamedor'));
    assert.ok(html.includes('28'));
    assert.ok(html.includes('ダメージ'));
    assert.ok(!html.includes('damage'));
  });

  it('XSS in interpolated args is escaped', () => {
    const known = new Set();
    // Simulate t() with escaping (as implemented in Task 13)
    let str = '{0} deals {1} {damage|ダメージ|}!';
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    str = str.replace('{0}', escHtml('<script>alert(1)</script>')).replace('{1}', escHtml('28'));
    const html = renderEnFirst(str, known);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `node --test tests/integration/bootstrap-integration.test.js`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/bootstrap-integration.test.js
git commit -m "test: bootstrap integration tests for full render pipeline"
```

---

### Task 22: Final Verification

Run full test suite and syntax check all new/modified JS files.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Syntax check all new frontend files**

```bash
node --check public/js/ui/bootstrap-client.js && \
node --check public/js/ui/i18n.js && \
node --check public/js/ui/auth.js && \
node --check public/js/ui/creature-row.js && \
node --check public/js/ui/move-select.js && \
node --check public/js/ui/post-combat-shop.js && \
node --check public/js/ui/scene.js && \
node --check public/js/ui/speed-review.js && \
node --check public/js/ui/exploration.js && \
node --check public/js/game.js && \
echo "All OK"
```
Expected: All OK

- [ ] **Step 3: Syntax check backend files**

```bash
node --check src/game/bootstrap/parser.js && \
node --check src/game/bootstrap/renderer.js && \
node --check src/game/bootstrap/word-knowledge.js && \
node --check src/game/bootstrap/word-list-parser.js && \
node --check src/routes/game/known-words.js && \
node --check src/routes/vocab.js && \
echo "All OK"
```
Expected: All OK

- [ ] **Step 4: Verify server starts**

Run: `npm start &` then `sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: 200

Kill the background process after verification.

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git status
# Only commit if there are changes
```
