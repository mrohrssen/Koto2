# English-Default Bootstrap Language System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default the game to English for new players with a bootstrap renderer that gradually converts static text to Japanese as the player learns words.

**Architecture:** A bootstrap renderer with two display modes (`jp-first`, `en-first`) processes pre-tagged static text against a player's known-words set. Dialogue remains Japanese (i+1). New users upload a word list at registration. Features that don't fit the MVP (narration, Chippy, doors, quizzes) are stubbed out.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, existing i18n system, FSRS (future — interim word tracker for now)

**Spec:** `docs/superpowers/specs/2026-03-11-english-default-bootstrap-language-design.md`

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

  it('parses tagged word with empty kanji (kana-only)', () => {
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/bootstrap-parser.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the parser**

```js
// src/game/bootstrap/parser.js

const TAG_RE = /\{([^|]*)\|([^|]*)\|([^}]*)\}/g;

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
Expected: All 6 tests PASS

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
    // No ruby rt if reading is empty
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
    assert.ok(html.includes('monster')); // unknown, stays English
    assert.ok(html.includes('ダメージ')); // known, swapped
    assert.ok(html.includes(' deals 28 ')); // untagged stays
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
  let html = '<span class="word">';

  if (reading) {
    html += `<ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby>`;
  } else {
    html += esc(kanji);
  }

  if (!isKnown && english) {
    html += `<span class="word-en">${esc(english)}</span>`;
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
    // Known: show Japanese with ruby
    if (seg.reading) {
      return `<span class="word"><ruby>${esc(seg.kanji)}<rt>${esc(seg.reading)}</rt></ruby></span>`;
    }
    return `<span class="word">${esc(seg.kanji)}</span>`;
  }).join('');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/bootstrap-renderer.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/renderer.js tests/unit/bootstrap-renderer.test.js
git commit -m "feat: bootstrap renderer with jp-first and en-first display modes"
```

---

### Task 3: Word Knowledge Service (Interim)

Build the interim word knowledge tracker that will later be replaced by FSRS. Tracks words as "seen" (exposed) or "known" (recalled in speed review).

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
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/word-knowledge.test.js
git commit -m "feat: interim word knowledge service (seen/known tracking)"
```

---

### Task 4: Word List Upload — Server Endpoint

Add a server endpoint for uploading a `.txt` word list during registration, and a helper to parse it.

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/word-list-parser.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the parser**

```js
// src/game/bootstrap/word-list-parser.js

/**
 * Parse a text file of Japanese words (one per line) into a deduplicated array.
 * @param {string} text - Raw text content
 * @returns {string[]} Array of unique words
 */
export function parseWordList(text) {
  if (!text) return [];
  const seen = new Set();
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim();
    if (word && !seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/word-list-parser.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Add word list upload to registration endpoint**

Modify `src/auth/routes.js` — add `multer` for file upload handling on the register endpoint. After successful registration, parse the uploaded file and seed the player's word knowledge.

```js
// At top of src/auth/routes.js, add:
import multer from 'multer';
import { parseWordList } from '../game/bootstrap/word-list-parser.js';
import { createWordKnowledge, seedKnownWords, saveWordKnowledge } from '../game/bootstrap/word-knowledge.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } }); // 1MB max
```

Modify the POST /api/auth/register handler (line 42 in routes.js):
- Add `upload.single('wordList')` middleware
- After successful user creation, check `req.file`
- If file exists, parse it and seed word knowledge

```js
// Change the register route from:
//   router.post('/register', async (req, res) => {
// To:
//   router.post('/register', upload.single('wordList'), async (req, res) => {

// After the existing user creation success block (around line 73), add:
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

- [ ] **Step 6: Install multer dependency**

Run: `npm install multer`

- [ ] **Step 7: Run existing auth tests to check for regressions**

Run: `npm test -- --grep auth`
Expected: Existing tests still pass

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

Modify `public/game.html`. Find the auth form area. Add a file input that's only visible on the register tab:

```html
<!-- Add after the invite code field in the auth form -->
<div id="wordListField" class="auth-field" style="display:none;">
  <label for="word-list-upload" class="auth-label">Known Words (.txt)</label>
  <input type="file" id="word-list-upload" accept=".txt" class="auth-input">
  <small class="auth-hint">Optional: one Japanese word per line</small>
</div>
```

- [ ] **Step 2: Show/hide the file input based on active tab**

Modify `public/js/ui/auth.js` around line 46-52 where tab switching happens. Show the wordListField when register tab is active, hide on login tab:

```js
// In the register tab handler, add:
document.getElementById('wordListField').style.display = '';

// In the login tab handler, add:
document.getElementById('wordListField').style.display = 'none';
```

- [ ] **Step 3: Send the file with the registration request**

Modify `public/js/ui/auth.js` in `handleSubmit()` (around line 109-151). When registering, use `FormData` instead of JSON to support file upload:

```js
// In handleSubmit, replace the fetch call for registration with:
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
  // ... rest of response handling
}
```

Note: The server register endpoint now receives multipart form data instead of JSON. Multer populates `req.body` with text fields from multipart, so existing `req.body.username` etc. still work. However, **existing auth tests** that send JSON bodies to `/api/auth/register` will break because multer doesn't parse JSON. Those tests must be updated to send `multipart/form-data` or the route needs conditional middleware (check Content-Type and use multer only for multipart). The simpler approach: use `upload.single('wordList')` which is a no-op when no file field is present, and ensure the frontend always sends FormData for registration (even without a file).

- [ ] **Step 4: Update existing auth tests to use FormData**

Find auth tests that POST to `/api/auth/register` with JSON bodies and update them to send multipart form data, or add the `multer` middleware conditionally.

- [ ] **Step 5: Test manually — register with and without a word file**

Run: `node --check public/js/ui/auth.js && echo "OK"`
Expected: OK (syntax check passes)

- [ ] **Step 5: Commit**

```bash
git add public/game.html public/js/ui/auth.js
git commit -m "feat: word list file upload in registration UI"
```

---

## Chunk 2: Stub Out Features

### Task 6: Remove Door Branching — Auto-Advance

Remove the door selection UI and Chippy hints. Rooms auto-advance without player choice.

**Files:**
- Modify: `src/game/rooms.js` — stop generating branch pairs, generate single rooms only
- Modify: `public/js/ui/exploration.js` — remove `renderBranchSelection()` calls and DOOR_INTROS
- Modify: `src/game/loop.js` — remove branch/door selection logic
- Modify: `src/game/services/exploration-service.js` — remove branch selection handling
- Modify: `src/game/phase-machine.js` — remove pendingBranch phase transitions if present
- Modify: `src/routes/game/run.js` — remove choose-door/selectBranch route
- Modify: `public/js/api.js` — remove apiSelectBranch/apiDoorHints calls
- Delete or update: `tests/unit/game/branching-rooms.test.js`

- [ ] **Step 1: Modify room generation to produce single rooms only**

In `src/game/rooms.js`, modify `generateAreaRooms()` (lines 184-212). Currently it generates branch pairs for rooms after the first. Change it to generate single rooms for all positions:

```js
// In generateAreaRooms(), replace the branch-pair logic (lines 193-208) with:
// Generate single rooms for all positions
for (let i = 0; i < roomCount; i++) {
  const room = generateSingleRoom(areaId, i + 1, roomCount, lastSpecialType, encountersOnly, forceRoomType);
  if (room.type !== 'encounter') lastSpecialType = room.type;
  rooms.push(room);
}
```

Remove `generateBranchPair()` function (lines 167-178) — it's no longer called.

- [ ] **Step 2: Remove branch selection rendering from exploration.js**

In `public/js/ui/exploration.js`:
- Delete the `DOOR_INTROS` array (lines 51-73)
- Remove or stub `renderBranchSelection()` (lines 406-520) — replace with a no-op that auto-advances
- In `renderExploring()`, remove any conditional that checks for pending branches and calls `renderBranchSelection()`

The room advancement flow should be: finish current room → auto-advance to next room in the rooms array.

- [ ] **Step 3: Remove pendingBranch from run state**

In `src/game/state.js`, `createNewRun()` (line 132+), remove the `pendingBranch` field if present.

- [ ] **Step 4: Remove choose-door API endpoint references**

Search `server.js` for `/api/game/choose-door` or `selectBranch` and remove or stub the endpoint. Search `loop.js` for branch selection handling.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: Tests pass (some may need updating if they reference branching)

- [ ] **Step 6: Commit**

```bash
git add src/game/rooms.js public/js/ui/exploration.js src/game/state.js src/game/loop.js server.js
git commit -m "feat: remove door branching, auto-advance to next room"
```

---

### Task 7: Stub Out Narration, Chippy, and Quiz Rooms

Remove DM narration boxes, Chippy references, and quiz rooms from the room pool.

**Files:**
- Modify: `src/game/rooms.js` — remove quiz from room type pool
- Modify: `public/js/ui/exploration.js` — remove narration box calls during exploration
- Modify: `src/game/dm.js` — stub or skip narration generation
- Modify: `public/js/ui/scene.js` — remove Chippy sprite references if any

- [ ] **Step 1: Remove quiz from room generation**

In `src/game/rooms.js`, `generateSingleRoom()` (lines 119-178), remove `quiz` from the special room type selection. It should no longer appear in the room chance rates (line 120-124).

```js
// Change the special room chance rates to exclude quiz:
// Before: shrine 10%, quiz 10%, wordDiscovery 10%, dealer 10%, whackAMole 5%
// After:  shrine 10%, wordDiscovery 10%, dealer 10%, whackAMole 5%
```

- [ ] **Step 2: Remove narration from room entry**

In `public/js/ui/exploration.js`, find where `sceneModule.showNarration()` or `narration-box` is called during room transitions. Remove these calls so rooms load directly without narration text.

The room entry narration from `getRoomEntryNarration()` in rooms.js should no longer be displayed. Either skip the call or don't pass it to the narration box.

- [ ] **Step 3: Remove Chippy speaker references**

Search exploration.js for `'チッピー'` speaker references and remove them. The Chippy sprite setup in scene rendering should be skipped.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Tests pass (update any quiz-related tests)

- [ ] **Step 5: Commit**

```bash
git add src/game/rooms.js public/js/ui/exploration.js src/game/dm.js
git commit -m "feat: stub out narration boxes, Chippy, and quiz rooms"
```

---

## Chunk 3: Data Changes

**Note on content authoring scope:** Tasks 9-10 require pre-tagging i18n strings and item/move descriptions with `{english|kanji|reading}` markers. This is a significant manual effort — each tagged word must use dictionary-accurate Japanese per project rules. The implementer should verify translations against JPDB or a dictionary. Expect ~30 i18n strings and ~300+ item/move descriptions to tag.

### Task 8: Add NPC Role Field

Add a `role` field to each NPC in npcs.json with a Japanese word for their occupation/role.

**Files:**
- Modify: `data/character-cards/npcs.json` — add `role` to each NPC

- [ ] **Step 1: Read current NPC data to understand the full schema**

Run: `node -e "const d = require('./data/character-cards/npcs.json'); console.log(Object.keys(d).length, 'NPCs'); console.log(Object.keys(d[Object.keys(d)[0]]))"`

Review the full list of NPCs and determine appropriate role words for each.

- [ ] **Step 2: Add role field to each NPC**

For each NPC, add a `role` object with `word`, `reading`, and `meaning`. Example roles:

```json
{
  "role": { "word": "隠者", "reading": "いんじゃ", "meaning": "hermit" }
}
```

Choose roles that match the NPC's personality and area. Use JPDB-verified words with accurate translations.

- [ ] **Step 3: Validate JSON syntax**

Run: `node -e "require('./data/character-cards/npcs.json'); console.log('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add data/character-cards/npcs.json
git commit -m "data: add role field to all NPCs for bootstrap name display"
```

---

### Task 9: Pre-Tag i18n Strings

Add `{english|kanji|reading}` tags to all i18n strings in `public/js/ui/i18n.js` so the en-first renderer can swap them.

**Files:**
- Modify: `public/js/ui/i18n.js` — add a `tagged` field alongside `en`/`ja` for each string

- [ ] **Step 1: Design the tagged string storage**

Add a `tagged` key to each entry in the `strings` object. This contains the English text with `{english|kanji|reading}` tags. The renderer will use `tagged` when available, falling back to `en`.

```js
// Example:
criticalHit: {
  en: 'CRITICAL HIT!',
  ja: 'クリティカル！',
  tagged: '{CRITICAL HIT|クリティカル|}!'
},
dealsDamage: {
  en: '{0} deals {1} damage!',
  ja: '{0}が{1}ダメージ！',
  tagged: '{0} {deals|与える|あたえる} {1} {damage|ダメージ|}!'
},
```

- [ ] **Step 2: Add tagged versions of all i18n strings**

Go through every entry in the `strings` object (lines 22-96 of i18n.js) and add a `tagged` field. Only tag words that have clear Japanese equivalents. Leave function words and formatting tokens (`{0}`, `{1}`) as-is.

Note: No separate `tTagged()` function needed — Task 11 modifies `t()` directly to handle tagged strings via the bootstrap renderer.

Note: The `{0}` interpolation tokens do not conflict with the `{english|kanji|reading}` tag format because interpolation tokens have no `|` pipes, so the parser regex won't match them. Interpolation is performed first (replacing `{0}` with the argument), then the result is passed to `renderEnFirst()`. Interpolated arguments must be plain text (no `{` or `|` characters).

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/i18n.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/i18n.js
git commit -m "feat: add tagged i18n strings for bootstrap en-first rendering"
```

---

### Task 10: Pre-Tag Item and Move Descriptions

Add `{english|kanji|reading}` tags to `description` fields in items.json and moves.json.

**Files:**
- Modify: `data/items.json` — add `descriptionTagged` field
- Modify: `data/moves.json` — add `descriptionTagged` field

- [ ] **Step 1: Add descriptionTagged to items**

For each item in items.json, add a `descriptionTagged` field. Tag English words that have Japanese equivalents in the game vocabulary. Leave mechanical terms (HP, %, numbers) untagged.

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
  "descriptionTagged": "{Rushes|突進|とっしん} forward at full {speed|速度|そくど}, gaining an extra {action|行動|こうどう}."
}
```

- [ ] **Step 3: Validate JSON syntax**

Run: `node -e "require('./data/items.json'); require('./data/moves.json'); console.log('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add data/items.json data/moves.json
git commit -m "data: add tagged descriptions for bootstrap en-first rendering"
```

---

## Chunk 4: UI Wiring

### Task 11: CSS for Bootstrap Word Rendering

Add CSS styles for the bootstrap word display classes used by the renderer. **Must be done before Tasks 12-14** which output these CSS classes.

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Add bootstrap word styles**

```css
/* Bootstrap language scaffolding */
.word {
  display: inline;
  white-space: nowrap;
}

.word ruby {
  ruby-position: over;
}

.word rt {
  font-size: 0.55em;
  color: var(--text-muted, #8ab4d8);
  font-weight: normal;
}

.word-en {
  font-size: 0.6em;
  color: var(--text-dim, #a0a0a0);
  display: block;
  text-align: center;
  line-height: 1.1;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/game.css
git commit -m "style: add CSS for bootstrap word rendering (ruby + english annotations)"
```

---

### Task 12: Wire Bootstrap Renderer into i18n System

Connect the bootstrap renderer to the i18n `t()` function so combat text, prompts, and labels use the en-first renderer.

**Files:**
- Modify: `public/js/ui/i18n.js` — add bootstrap rendering path
- Create: `public/js/ui/bootstrap-client.js` — client-side renderer (browser version)

- [ ] **Step 1: Create client-side bootstrap renderer**

The server-side renderer (`src/game/bootstrap/renderer.js`) uses Node imports. Create a browser-compatible version:

```js
// public/js/ui/bootstrap-client.js

const TAG_RE = /\{([^|]*)\|([^|]*)\|([^}]*)\}/g;

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
      return `<span class="word"><ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby></span>`;
    }
    return `<span class="word">${esc(kanji)}</span>`;
  });
}

/**
 * Render a single word in jp-first mode.
 * Always shows kanji + furigana. Shows English if word is unknown.
 */
export function renderJpFirst(kanji, reading, english) {
  let html = '<span class="word">';
  if (reading) {
    html += `<ruby>${esc(kanji)}<rt>${esc(reading)}</rt></ruby>`;
  } else {
    html += esc(kanji);
  }
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="word-en">${esc(english)}</span>`;
  }
  html += '</span>';
  return html;
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 2: Add an API endpoint to fetch the player's known words**

In `server.js`, add a GET endpoint that returns the player's known words:

```js
// GET /api/game/known-words
app.get('/api/game/known-words', authMiddleware, (req, res) => {
  const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
  res.json({ words: Object.keys(wk.known) });
});
```

- [ ] **Step 3: Load known words on game start**

In `public/js/game.js`, after authentication, fetch the known words and set them in the client renderer:

```js
import { setKnownWords } from './ui/bootstrap-client.js';

// After auth, before rendering:
const kwResp = await fetch('/api/game/known-words', { headers: authHeaders() });
const kwData = await kwResp.json();
setKnownWords(kwData.words);
```

- [ ] **Step 4: Integrate with i18n t() function**

Modify `public/js/ui/i18n.js` — update `t()` to use the bootstrap renderer when tagged strings are available:

```js
import { renderEnFirst } from './bootstrap-client.js';

export function t(key, ...args) {
  const entry = strings[key];
  if (!entry) return key;

  // If tagged version exists, render through bootstrap
  if (entry.tagged) {
    let str = entry.tagged;
    args.forEach((a, i) => { str = str.replace(`{${i}}`, a); });
    return renderEnFirst(str);
  }

  // Fallback to current behavior
  const str = entry[lang] || entry.en || key;
  let result = str;
  args.forEach((a, i) => { result = result.replace(`{${i}}`, a); });
  return result;
}
```

- [ ] **Step 5: Audit and fix all `t()` callers that use textContent**

Since `t()` can now return HTML (with `<ruby>` tags), every call site that assigns `t()` output to `textContent` will break (showing raw HTML to the user). Run:

```bash
grep -rn '\.textContent.*\bt(' public/js/ --include='*.js'
grep -rn '\.innerText.*\bt(' public/js/ --include='*.js'
```

For each match, change `textContent` to `innerHTML`. Be careful not to introduce XSS — `t()` output is from trusted static strings, so `innerHTML` is safe here.

- [ ] **Step 6: Ensure known words load before rendering**

In `public/js/game.js`, the known-words fetch (`/api/game/known-words`) must complete before any UI rendering that uses the bootstrap renderer. Structure the init flow as:

```js
// 1. Authenticate
// 2. Fetch known words → setKnownWords()
// 3. Fetch game state → render UI
```

If the game currently renders immediately after auth, add an await for the known-words fetch before the first render call.

- [ ] **Step 7: Syntax check all modified files**

Run: `node --check public/js/ui/i18n.js && node --check public/js/ui/bootstrap-client.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/bootstrap-client.js public/js/ui/i18n.js public/js/game.js server.js
git commit -m "feat: wire bootstrap renderer into i18n system"
```

---

### Task 12: Update Creature Card to Show Full Name

Modify creature display to show the full creature identity (English name + Japanese base word + modifier subtitle).

**Files:**
- Modify: `public/js/ui/creature-row.js` — update `render()` and `showPopup()` to show subtitle

- [ ] **Step 1: Update creature slot rendering**

In `public/js/ui/creature-row.js`, `render()` (lines 71-129). Currently line 96 shows `creature.nameEn`. Add the Japanese subtitle below using jp-first rendering:

```js
import { renderJpFirst } from './bootstrap-client.js';

// In the creature slot HTML (around line 96), change the name display:
// Before: <span class="creature-name">${creature.nameEn}</span>
// After:
const subtitle = creature.modifier
  ? renderJpFirst(creature.modifier.word, creature.modifier.reading, creature.modifier.meaning)
    + 'の'
    + renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning)
  : renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning);

// HTML:
// <span class="creature-name">${creature.nameEn}</span>
// <span class="creature-subtitle">${subtitle}</span>
```

- [ ] **Step 2: Update creature popup**

In `showPopup()` (lines 141-230), add the same subtitle to the popup header.

- [ ] **Step 3: Add CSS for creature subtitle**

In `public/game.css`, add (the `.word` and `.word-en` base styles are already added in Task 11):

```css
.creature-subtitle {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/creature-row.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/creature-row.js public/game.css
git commit -m "feat: show full creature name with jp-first bootstrap subtitle"
```

---

### Task 13: Update Move, Item, and NPC Displays

Wire bootstrap rendering into move-select, post-combat-shop, and NPC name displays.

**Files:**
- Modify: `public/js/ui/move-select.js` — render move names with jp-first, descriptions with en-first
- Modify: `public/js/ui/post-combat-shop.js` — render item names with jp-first, descriptions with en-first
- Modify: `public/js/ui/scene.js` — render NPC names with role using jp-first

- [ ] **Step 1: Update move name display**

In `public/js/ui/move-select.js`, `buildMoveCell()` (lines 56-74). Use jp-first for the move name:

```js
import { renderJpFirst } from './bootstrap-client.js';
import { renderEnFirst } from './bootstrap-client.js';

// Replace the move name display (around line 65) with:
const moveName = renderJpFirst(move.name, move.reading, move.meaning);

// For move description, use en-first with tagged text:
const moveDesc = move.descriptionTagged
  ? renderEnFirst(move.descriptionTagged)
  : move.description;
```

- [ ] **Step 2: Update item display in post-combat shop**

In `public/js/ui/post-combat-shop.js` (lines 50-63). Use jp-first for item name, en-first for description:

```js
import { renderJpFirst, renderEnFirst } from './bootstrap-client.js';

// Item name (around line 58):
const itemName = renderJpFirst(item.word, item.reading, item.meaning);

// Item description (around line 60):
const itemDesc = item.descriptionTagged
  ? renderEnFirst(item.descriptionTagged)
  : item.description;
```

- [ ] **Step 3: Update NPC name display**

In `public/js/ui/scene.js`, where NPC names are shown (showNpcTrainer around line 343). Add role display:

```js
import { renderJpFirst } from './bootstrap-client.js';

// NPC name display:
const roleHtml = npc.role
  ? ' — ' + renderJpFirst(npc.role.word, npc.role.reading, npc.role.meaning)
  : '';
const npcNameHtml = `${esc(npc.nameEn)}${roleHtml}`;
```

- [ ] **Step 4: Audit innerHTML vs textContent**

Since bootstrap rendering outputs HTML (`<ruby>`, `<span>`), all places that set `textContent` with bootstrap output must switch to `innerHTML`. Search for all locations where creature names, move names, item names, or i18n strings are set via `textContent` and update them.

- [ ] **Step 5: Syntax check all modified files**

Run: `node --check public/js/ui/move-select.js && node --check public/js/ui/post-combat-shop.js && node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/move-select.js public/js/ui/post-combat-shop.js public/js/ui/scene.js
git commit -m "feat: wire bootstrap renderer into move, item, and NPC displays"
```

---

## Chunk 5: NPC Dialogue Changes

### Task 14: Replace Static NPC Strings with Dynamic Generation

Remove static `greeting`, `defeatLine`, and `postCombat` strings from NPC data. These should be dynamically generated by the AI dialogue system, i+1 constrained.

**Files:**
- Modify: `data/character-cards/npcs.json` — remove static dialogue strings
- Modify: `src/narration-engine/index.js` — ensure greeting/defeatLine/postCombat are generated dynamically
- Check: `src/game/loop.js` — ensure NPC encounters fetch dynamic dialogue

- [ ] **Step 1: Audit where greeting/defeatLine/postCombat are used**

Search the codebase for references to these fields:

Run: `grep -rn 'greeting\|defeatLine\|postCombat' src/ public/ --include='*.js'`

Identify every place these are read from NPC data.

- [ ] **Step 2: Replace static string reads with dynamic dialogue fetches**

For each usage found, replace the static field access with a call to the narration engine. The narration engine already generates NPC dialogue via `queueMissingDialogues()` and `getDialogueFromCache()` (see `src/narration-engine/index.js` lines 43-100).

The key integration point: wherever the game reads `npc.greeting` or `npc.defeatLine`, replace with:
```js
const dialogue = getDialogueFromCache(userId, npcId, 'npc');
// Use dialogue.greeting / dialogue.defeatLine if available
// If not cached yet, skip dialogue (don't block on generation)
```

The narration engine's prompt assembly already receives `vocabContext` with the player's known words for i+1 constraint. Ensure the greeting/defeatLine/postCombat dialogue types are included in the `queueMissingDialogues()` batch so they're pre-generated.

- [ ] **Step 3: Remove static dialogue strings from npcs.json**

Remove `greeting`, `defeatLine`, and `postCombat` fields from each NPC entry. **Keep `exampleDialogue`** — it's used as few-shot examples in the AI prompt for dialogue generation, not for direct display to the player.

- [ ] **Step 4: Validate JSON**

Run: `node -e "require('./data/character-cards/npcs.json'); console.log('OK')"`
Expected: OK

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: Tests pass

- [ ] **Step 6: Commit**

```bash
git add data/character-cards/npcs.json src/narration-engine/index.js src/game/loop.js
git commit -m "feat: replace static NPC dialogue strings with dynamic i+1 generation"
```

---

## Chunk 6: Cleanup and Integration

### Task 15: Remove Old Bootstrap System Code

Remove the old bootstrap files that are incompatible with the new system.

**Files:**
- Delete: `src/game/bootstrap-renderer.js`
- Delete: `src/game/bootstrap-parser.js`
- Delete: `src/game/bootstrap-api.js`
- Delete: `src/game/word-tracker.js`
- Delete: `src/game/bootstrap-narrations.js`
- Delete: `data/bootstrap-narrations/prologue.json`
- Delete: corresponding test files
- Modify: `server.js` — remove old bootstrap API routes

- [ ] **Step 1: Find and remove old bootstrap route registrations**

Search server.js for bootstrap API endpoint registrations:

Run: `grep -n 'bootstrap' server.js`

Remove the route handlers for `/api/game/bootstrap/*`.

- [ ] **Step 2: Delete old files**

```bash
rm src/game/bootstrap-renderer.js src/game/bootstrap-parser.js src/game/bootstrap-api.js src/game/word-tracker.js src/game/bootstrap-narrations.js
rm -rf data/bootstrap-narrations/
```

Find and delete corresponding test files:

```bash
find tests/ -name '*bootstrap*' -o -name '*word-tracker*' | head -20
# Then delete them
```

- [ ] **Step 3: Remove imports of deleted modules**

Search for any remaining imports of the deleted modules:

Run: `grep -rn 'bootstrap-renderer\|bootstrap-parser\|bootstrap-api\|word-tracker\|bootstrap-narrations' src/ server.js`

Remove all references.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: Tests pass (old bootstrap tests were deleted, no remaining references)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old bootstrap system code (replaced by new bootstrap/)"
```

---

### Task 16: Add word-knowledge files to .gitignore

Ensure per-user word knowledge files aren't committed.

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add pattern to .gitignore**

```
# Per-user word knowledge (runtime-generated)
data/word-knowledge-*.json
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore per-user word knowledge files"
```

---

### Task 17: Integration Test — Full Bootstrap Flow

Write an integration test that validates the full flow: parse tagged text → check against known words → render correct HTML.

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
    const known = getKnownWords(wk);
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
    assert.ok(html.includes('回復')); // known word swapped
    assert.ok(html.includes('かいふく')); // furigana
    assert.ok(html.includes('creatures')); // unknown stays English
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
    assert.ok(!isWordKnown(wk, '森')); // seen but not known
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森')); // known after review
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `node --test tests/integration/bootstrap-integration.test.js`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/bootstrap-integration.test.js
git commit -m "test: bootstrap integration tests for full render pipeline"
```

---

### Task 18: Final Verification

Run full test suite and do a syntax check on all modified JS files.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Syntax check all new/modified frontend files**

```bash
node --check public/js/ui/bootstrap-client.js && \
node --check public/js/ui/i18n.js && \
node --check public/js/ui/auth.js && \
node --check public/js/ui/creature-row.js && \
node --check public/js/ui/move-select.js && \
node --check public/js/ui/post-combat-shop.js && \
node --check public/js/ui/scene.js && \
node --check public/js/ui/exploration.js && \
echo "All OK"
```
Expected: All OK

- [ ] **Step 3: Syntax check backend files**

```bash
node --check src/game/bootstrap/parser.js && \
node --check src/game/bootstrap/renderer.js && \
node --check src/game/bootstrap/word-knowledge.js && \
node --check src/game/bootstrap/word-list-parser.js && \
echo "All OK"
```
Expected: All OK

- [ ] **Step 4: Verify server starts**

Run: `npm start &` then `sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: 200

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A && git status
# Only commit if there are changes
```
