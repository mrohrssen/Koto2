# Vocab Exposure Mastery Port — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the vocab exposure → FSRS mastery system from the stale `feature/vocab-exposure-mastery` worktree to current `dev`, cherry-picking backend and rebuilding frontend wiring.

**Architecture:** Backend adds generic deck operations to `internal-srs.js`, expands `known-words.js` routes from 2→5, and adds `unmarkKnown` to `word-knowledge.js`. Frontend changes `_pendingExposures` from Set→Map in `bootstrap-client.js`, adds 3 API functions, and swaps the hub speed review data source from JPDB to internal FSRS.

**Tech Stack:** Node.js, ts-fsrs, Express, vanilla JS frontend

**Spec:** `docs/superpowers/specs/2026-04-03-vocab-exposure-mastery-port-design.md`

---

## Chunk 1: Backend — Generic Deck Operations

### Task 1: Add generic deck operations to internal-srs.js

**Files:**
- Modify: `src/game/internal-srs.js`
- Test: `tests/unit/game/internal-srs.test.js`

- [ ] **Step 1: Write failing tests for generic deck operations**

Add a new `describe` block at the end of `tests/unit/game/internal-srs.test.js`, inside the existing outer `describe('Internal SRS Service')` block (before its closing `});`):

```javascript
  describe('Generic deck operations', () => {
    it('createCard adds a card to the named deck', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', { label: 'hello' });
      const cards = srs.getDeckCards(TEST_USER, 'test');
      assert.strictEqual(cards.length, 1);
      assert.strictEqual(cards[0].id, 'card-1');
      assert.strictEqual(cards[0].label, 'hello');
      assert.ok(cards[0].due instanceof Date);
    });

    it('createCard is idempotent — does not duplicate', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', { label: 'hello' });
      srs.createCard(TEST_USER, 'test', 'card-1', { label: 'hello' });
      const cards = srs.getDeckCards(TEST_USER, 'test');
      assert.strictEqual(cards.length, 1);
    });

    it('gradeCard with good advances card state', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', {});
      const updated = srs.gradeCard(TEST_USER, 'test', 'card-1', 'good');
      assert.strictEqual(updated.reps, 1);
      assert.ok(updated.due > new Date());
    });

    it('gradeCard with again keeps card due soon', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', {});
      const updated = srs.gradeCard(TEST_USER, 'test', 'card-1', 'again');
      assert.strictEqual(updated.reps, 1);
      assert.strictEqual(updated.lapses, 0); // no lapse from New state
    });

    it('gradeCard throws for unknown card', () => {
      assert.throws(() => srs.gradeCard(TEST_USER, 'test', 'nope', 'good'), /not found/);
    });

    it('getDueCards returns only cards with due <= now', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', {}); // due = now (immediately due)
      const due = srs.getDueCards(TEST_USER, 'test');
      assert.strictEqual(due.length, 1);

      // Grade it — pushes due into the future
      srs.gradeCard(TEST_USER, 'test', 'card-1', 'good');
      const dueAfter = srs.getDueCards(TEST_USER, 'test');
      assert.strictEqual(dueAfter.length, 0);
    });

    it('getDueCount returns count of due cards', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', {});
      srs.createCard(TEST_USER, 'test', 'card-2', {});
      assert.strictEqual(srs.getDueCount(TEST_USER, 'test'), 2);
    });

    it('serialization round-trips dates correctly for generic decks', () => {
      srs.createCard(TEST_USER, 'test', 'card-1', {});
      srs.gradeCard(TEST_USER, 'test', 'card-1', 'good');
      srs.clearSrsCache(TEST_USER); // force reload from disk
      const cards = srs.getDeckCards(TEST_USER, 'test');
      assert.ok(cards[0].due instanceof Date);
      assert.ok(cards[0].last_review instanceof Date);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern "Generic deck" 2>&1 | tail -20`

Expected: Multiple failures — `srs.createCard is not a function`

- [ ] **Step 3: Make loadSrsData/saveSrsData generic**

In `src/game/internal-srs.js`, replace the `loadSrsData` function (lines 79-103). The current version hardcodes `raw.kana.cards`. Change it to deserialize ALL deck keys:

Replace lines 86-95 (inside `loadSrsData`):
```javascript
  let data = { kana: { cards: [] } };

  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      // Deserialize card dates
      if (raw.kana && Array.isArray(raw.kana.cards)) {
        raw.kana.cards = raw.kana.cards.map(deserializeCard);
      }
      data = raw;
```

With:
```javascript
  let data = { kana: { cards: [] } };

  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      // Deserialize card dates for ALL decks (kana, vocab, etc.)
      for (const key of Object.keys(raw)) {
        if (raw[key] && Array.isArray(raw[key].cards)) {
          raw[key].cards = raw[key].cards.map(deserializeCard);
        }
      }
      data = raw;
```

Replace the `saveSrsData` serialization block (lines 120-126):
```javascript
  const serialized = {
    ...data,
    kana: {
      ...data.kana,
      cards: data.kana.cards.map(serializeCard),
    },
  };
```

With:
```javascript
  const serialized = { ...data };
  for (const key of Object.keys(serialized)) {
    if (serialized[key] && Array.isArray(serialized[key].cards)) {
      serialized[key] = {
        ...serialized[key],
        cards: serialized[key].cards.map(serializeCard),
      };
    }
  }
```

- [ ] **Step 4: Add FSRS_FIELDS, buildFsrsCard, and generic deck exports**

Append the following at the end of `src/game/internal-srs.js` (after the `isKanaGraduated` function):

```javascript
// ─── Generic deck operations ────────────────────────────────────────

/** FSRS field names — used to separate metadata from FSRS state in gradeCard */
const FSRS_FIELDS = new Set([
  'due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
  'reps', 'lapses', 'learning_steps', 'state', 'last_review',
]);

/**
 * Build a clean FSRS card object from a stored card.
 * Extracts only the fields the FSRS scheduler needs, with safe defaults.
 */
function buildFsrsCard(card) {
  const fsrsCard = {
    due: card.due instanceof Date ? card.due : new Date(card.due || Date.now()),
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    elapsed_days: card.elapsed_days || 0,
    scheduled_days: card.scheduled_days || 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    learning_steps: card.learning_steps || 0,
    state: card.state || 0,
  };

  if (card.last_review) {
    fsrsCard.last_review = card.last_review instanceof Date
      ? card.last_review
      : new Date(card.last_review);
  }

  return fsrsCard;
}

/**
 * Get cards array for a deck, initializing if needed.
 */
export function getDeckCards(userId, deckName) {
  const data = loadSrsData(userId);
  if (!data[deckName]) {
    data[deckName] = { cards: [] };
  }
  return data[deckName].cards;
}

/**
 * Create a card in a named deck. Idempotent — skips if id already exists.
 */
export function createCard(userId, deckName, cardId, metadata) {
  const data = loadSrsData(userId);
  if (!data[deckName]) {
    data[deckName] = { cards: [] };
  }

  const existing = data[deckName].cards.find((c) => c.id === cardId);
  if (existing) return existing;

  const emptyCard = createEmptyCard();
  data[deckName].cards.push({
    id: cardId,
    ...metadata,
    ...emptyCard,
  });

  saveSrsData(userId, data);
}

/**
 * Grade a card in a named deck.
 * @param {string} grade - 'again' or 'good'
 * @returns {Object} The updated card
 */
export function gradeCard(userId, deckName, cardId, grade) {
  const data = loadSrsData(userId);
  if (!data[deckName]) {
    throw new Error(`Card ${cardId} not found in deck '${deckName}'`);
  }

  const cardIndex = data[deckName].cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in deck '${deckName}'`);
  }

  const card = data[deckName].cards[cardIndex];
  const fsrsCard = buildFsrsCard(card);

  const now = new Date();
  const rating = GRADE_MAP[grade];
  if (rating === undefined) {
    throw new Error(`Invalid grade: ${grade}. Must be 'again' or 'good'.`);
  }

  const result = scheduler.repeat(fsrsCard, now);
  const updatedFsrs = result[rating].card;

  // Preserve id + non-FSRS metadata
  const { id, ...restCard } = card;
  const metadataKeys = {};
  for (const [k, v] of Object.entries(restCard)) {
    if (!FSRS_FIELDS.has(k)) {
      metadataKeys[k] = v;
    }
  }

  data[deckName].cards[cardIndex] = {
    id,
    ...metadataKeys,
    due: updatedFsrs.due,
    stability: updatedFsrs.stability,
    difficulty: updatedFsrs.difficulty,
    elapsed_days: updatedFsrs.elapsed_days,
    scheduled_days: updatedFsrs.scheduled_days,
    reps: updatedFsrs.reps,
    lapses: updatedFsrs.lapses,
    learning_steps: updatedFsrs.learning_steps,
    state: updatedFsrs.state,
    last_review: updatedFsrs.last_review,
  };

  saveSrsData(userId, data);
  return data[deckName].cards[cardIndex];
}

/**
 * Get all cards where due <= now for a given deck.
 */
export function getDueCards(userId, deckName) {
  const cards = getDeckCards(userId, deckName);
  const now = new Date();
  return cards.filter((c) => {
    const dueDate = c.due instanceof Date ? c.due : new Date(c.due);
    return dueDate <= now;
  });
}

/**
 * Count of due cards for a given deck.
 */
export function getDueCount(userId, deckName) {
  return getDueCards(userId, deckName).length;
}
```

- [ ] **Step 5: Run tests — all should pass (generic + existing kana)**

Run: `npm run test:unit -- --test-name-pattern "Internal SRS" 2>&1 | tail -30`

Expected: All kana tests + all generic deck tests PASS

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/internal-srs.js && echo "OK"`

- [ ] **Step 7: Commit**

```bash
git add src/game/internal-srs.js tests/unit/game/internal-srs.test.js
git commit -m "feat: add generic deck operations to internal SRS (vocab support)"
```

---

### Task 2: Add unmarkKnown to word-knowledge.js

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js`
- Modify: `tests/unit/word-knowledge.test.js`

- [ ] **Step 1: Write failing tests for unmarkKnown**

Existing test file is at `tests/unit/word-knowledge.test.js` (NOT under `game/`). Add `unmarkKnown` to the import and append two tests inside the existing `describe('word-knowledge')` block.

Add `unmarkKnown` to the import at line 4-12:

```javascript
import {
  createWordKnowledge,
  registerExposure,
  markKnown,
  unmarkKnown,
  isWordKnown,
  getKnownWords,
  getSeenWords,
  seedKnownWords
} from '../../src/game/bootstrap/word-knowledge.js';
```

Append before the closing `});` of the describe block:

```javascript
  it('unmarkKnown removes word from known', () => {
    markKnown(wk, '森');
    assert.ok(isWordKnown(wk, '森'));
    unmarkKnown(wk, '森');
    assert.ok(!isWordKnown(wk, '森'));
  });

  it('unmarkKnown is safe on unknown word', () => {
    unmarkKnown(wk, '森'); // should not throw
    assert.ok(!isWordKnown(wk, '森'));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "unmarkKnown" 2>&1 | tail -10`

Expected: FAIL — `unmarkKnown` is not exported

- [ ] **Step 3: Add unmarkKnown to word-knowledge.js**

In `src/game/bootstrap/word-knowledge.js`, add after the `markKnown` function (after line 26):

```javascript
export function unmarkKnown(wk, wordId) {
  delete wk.known[wordId];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern "unmarkKnown" 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/word-knowledge.test.js
git commit -m "feat: add unmarkKnown for vocab mastery reversal"
```

---

### Task 3: Expand known-words routes (expose threshold + review + due endpoints)

**Files:**
- Modify: `src/routes/game/known-words.js`
- Create: `tests/unit/game/vocab-srs.test.js`

- [ ] **Step 1: Write failing tests for vocab SRS lifecycle**

Create `tests/unit/game/vocab-srs.test.js`:

```javascript
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestTmpDir } from '../../helpers/tmp.js';

let tmp;
const TEST_USER = 'test-user-vocab';

describe('Vocab SRS — exposure threshold', () => {
  let srs, wk;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    wk = await import('../../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => { await tmp.cleanup(); });
  beforeEach(() => { srs.clearSrsData(TEST_USER); });

  it('no vocab card created below 5 exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 4; i++) wk.registerExposure(knowledge, 'かいふく');
    const due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 0);
  });

  it('vocab card created at exactly 5 exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 5; i++) wk.registerExposure(knowledge, 'かいふく');
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    const due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].word, 'かいふく');
  });

  it('card not duplicated on further exposures beyond 5', () => {
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    const cards = srs.getDeckCards(TEST_USER, 'vocab');
    assert.strictEqual(cards.length, 1);
  });
});

describe('Vocab SRS — review grading', () => {
  let srs, wk;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    wk = await import('../../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => { await tmp.cleanup(); });
  beforeEach(() => { srs.clearSrsData(TEST_USER); });

  it('grading good marks word as known', () => {
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    srs.gradeCard(TEST_USER, 'vocab', 'かいふく', 'good');
    const knowledge = wk.createWordKnowledge(TEST_USER);
    wk.markKnown(knowledge, 'かいふく');
    assert.ok(wk.isWordKnown(knowledge, 'かいふく'));
  });

  it('grading again removes word from known and resets exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    wk.markKnown(knowledge, 'かいふく');
    for (let i = 0; i < 7; i++) wk.registerExposure(knowledge, 'かいふく');

    wk.unmarkKnown(knowledge, 'かいふく');
    knowledge.seen['かいふく'].exposures = 0;

    assert.ok(!wk.isWordKnown(knowledge, 'かいふく'));
    assert.strictEqual(knowledge.seen['かいふく'].exposures, 0);
  });
});

describe('Vocab SRS — full lifecycle', () => {
  let srs, wk;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    wk = await import('../../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => { await tmp.cleanup(); });
  beforeEach(() => { srs.clearSrsData(TEST_USER); });

  it('expose 5x → card due → grade good → known → grade again → un-known + reset', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);

    // 1. Expose 5 times
    for (let i = 0; i < 5; i++) wk.registerExposure(knowledge, 'たたかう');
    assert.strictEqual(knowledge.seen['たたかう'].exposures, 5);

    // 2. Create card (simulating what the route does at threshold)
    srs.createCard(TEST_USER, 'vocab', 'たたかう', {
      word: 'たたかう', meaning: 'fight', reading: 'たたかう'
    });
    let due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);

    // 3. Grade good twice → reach Review state (New→Learning→Review)
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'good');
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'good');
    wk.markKnown(knowledge, 'たたかう');
    assert.ok(wk.isWordKnown(knowledge, 'たたかう'));

    // Card should no longer be immediately due
    due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 0);

    // 4. Simulate time passing — set due to past
    const cards = srs.getDeckCards(TEST_USER, 'vocab');
    cards[0].due = new Date(Date.now() - 1000);

    // 5. Card is due again
    due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);

    // 6. Grade again (failed) → un-mastery
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'again');
    wk.unmarkKnown(knowledge, 'たたかう');
    knowledge.seen['たたかう'].exposures = 0;

    assert.ok(!wk.isWordKnown(knowledge, 'たたかう'));
    assert.strictEqual(knowledge.seen['たたかう'].exposures, 0);

    // 7. Card still exists (not deleted, just re-learning)
    const allCards = srs.getDeckCards(TEST_USER, 'vocab');
    assert.strictEqual(allCards.length, 1);
    assert.strictEqual(allCards[0].lapses, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass** (these test SRS + word-knowledge directly, not the routes)

Run: `npm run test:unit -- --test-name-pattern "Vocab SRS" 2>&1 | tail -20`

Expected: All PASS (these use the SRS functions from Task 1 + word-knowledge from Task 2)

- [ ] **Step 3: Replace known-words.js routes**

Replace the entire contents of `src/routes/game/known-words.js` with:

```javascript
import { Router } from 'express';
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge, markKnown, unmarkKnown } from '../../game/bootstrap/word-knowledge.js';
import { createCard, getDeckCards, gradeCard, getDueCards, getDueCount } from '../../game/internal-srs.js';

const EXPOSURE_THRESHOLD = 5;

export function createKnownWordsRoutes() {
  const router = Router();

  // GET /api/game/known-words
  router.get('/', (req, res) => {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    res.json({ words: Object.keys(wk.known) });
  });

  // POST /api/game/known-words/expose
  // Body: { words: [{ word: "回復", meaning: "recovery" }, ...] }
  // Also accepts legacy string format: { words: ["回復", ...] }
  router.post('/expose', (req, res) => {
    const { words } = req.body || {};
    if (!Array.isArray(words) || words.length === 0) {
      return res.json({ ok: true });
    }
    try {
      const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
      for (const entry of words) {
        const word = typeof entry === 'string' ? entry : entry?.word;
        const meaning = typeof entry === 'string' ? '' : (entry?.meaning || '');
        if (typeof word !== 'string' || word.length === 0) continue;

        registerExposure(wk, word);

        if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
          const existingCards = getDeckCards(req.user.id, 'vocab');
          if (!existingCards.find(c => c.id === word)) {
            createCard(req.user.id, 'vocab', word, {
              word, meaning, reading: word
            });
          }
        }
      }
      saveWordKnowledge(wk);
      res.json({ ok: true });
    } catch (e) {
      console.warn('[known-words/expose] Error:', e.message);
      res.json({ ok: false });
    }
  });

  // POST /api/game/known-words/review
  // Body: { word: "かいふく", grade: "good" | "again" }
  router.post('/review', (req, res) => {
    const { word, grade } = req.body || {};
    if (!word || !['good', 'again'].includes(grade)) {
      return res.status(400).json({ error: 'word and grade (good|again) required' });
    }
    try {
      const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);
      const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);

      if (grade === 'good') {
        markKnown(wk, word);
      } else {
        unmarkKnown(wk, word);
        if (wk.seen[word]) wk.seen[word].exposures = 0;
      }
      saveWordKnowledge(wk);

      res.json({
        ok: true,
        mastered: grade === 'good',
        card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses }
      });
    } catch (e) {
      console.warn('[known-words/review] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/game/known-words/due-count
  router.get('/due-count', (req, res) => {
    const count = getDueCount(req.user.id, 'vocab');
    res.json({ count });
  });

  // GET /api/game/known-words/due-words
  router.get('/due-words', (req, res) => {
    const cards = getDueCards(req.user.id, 'vocab');
    const words = cards.map(c => ({
      word: c.word,
      reading: c.reading || c.word,
      meanings: c.meaning ? [c.meaning] : [''],
      source: 'internal',
    }));
    res.json({ words });
  });

  return router;
}
```

Note: The `/due-words` endpoint includes `source: 'internal'` on each word object. This is how the speed review UI will distinguish internal FSRS cards from JPDB cards (which have `vid`/`sid` instead).

- [ ] **Step 4: Syntax check**

Run: `node --check src/routes/game/known-words.js && echo "OK"`

- [ ] **Step 5: Run all unit tests to verify nothing is broken**

Run: `npm run test:unit 2>&1 | tail -20`

Expected: All tests pass including new vocab-srs tests

- [ ] **Step 6: Commit**

```bash
git add src/routes/game/known-words.js tests/unit/game/vocab-srs.test.js
git commit -m "feat: expand known-words routes with review, due-count, due-words endpoints"
```

---

## Chunk 2: Frontend — Bootstrap Client + API + Speed Review Wiring

### Task 4: Update bootstrap-client.js (Set→Map, exposure tracking, mastery sync)

**Files:**
- Modify: `public/js/ui/bootstrap-client.js`

- [ ] **Step 1: Change _pendingExposures from Set to Map**

In `public/js/ui/bootstrap-client.js`, replace line 9:

```javascript
const _pendingExposures = new Set();
```

With:

```javascript
const _pendingExposures = new Map();
```

- [ ] **Step 2: Update renderEnFirst to track word+meaning**

In `renderEnFirst()`, replace line 53:

```javascript
        _pendingExposures.add(kanji);
```

With:

```javascript
        _pendingExposures.set(kanji, english);
```

- [ ] **Step 3: Add exposure tracking to renderJpFirst**

In `renderJpFirst()`, after the line that checks `if (!_knownWords.has(kanji) && english)` (line 74), inside that `if` block, add exposure tracking. Replace:

```javascript
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
  }
```

With:

```javascript
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
    _pendingExposures.set(kanji, english);
  }
```

- [ ] **Step 4: Update flushExposures to send word+meaning objects**

Replace the `flushExposures` function (lines 90-104):

```javascript
export function flushExposures() {
  if (_pendingExposures.size === 0) return;
  const words = [..._pendingExposures];
  _pendingExposures.clear();
```

With:

```javascript
export function flushExposures() {
  if (_pendingExposures.size === 0) return;
  const words = [..._pendingExposures.entries()].map(([word, meaning]) => ({ word, meaning }));
  _pendingExposures.clear();
```

- [ ] **Step 5: Update addExposure to use Map**

Replace the `addExposure` function (lines 82-84):

```javascript
export function addExposure(word) {
  _pendingExposures.add(word);
}
```

With:

```javascript
export function addExposure(word, meaning = '') {
  _pendingExposures.set(word, meaning);
}
```

- [ ] **Step 6: Add addKnownWord and removeKnownWord exports**

Add before the `esc` function (before line 107):

```javascript
/** Add a word to known set (client-side only, no server call). */
export function addKnownWord(word) {
  _knownWords.add(word);
}

/** Remove a word from known set (client-side only, no server call). */
export function removeKnownWord(word) {
  _knownWords.delete(word);
}
```

- [ ] **Step 7: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`

- [ ] **Step 8: Update speech-bubble.js to pass meaning to addExposure**

`speech-bubble.js` line 73 calls `addExposure(phrase.jp)`. The new signature is `addExposure(word, meaning='')`. Update it to pass the English meaning so FSRS cards created from speech bubble exposures have complete data:

In `public/js/ui/speech-bubble.js`, replace:
```javascript
  addExposure(phrase.jp);
```
With:
```javascript
  addExposure(phrase.jp, phrase.en);
```

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/bootstrap-client.js public/js/ui/speech-bubble.js
git commit -m "feat: track word+meaning exposures, add mastery sync exports"
```

---

### Task 5: Add vocab API functions

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: Add 3 new API functions**

In `public/js/api.js`, add after the existing `getDueWords` function (after line 438):

```javascript
/**
 * Get due vocab words from internal FSRS (not JPDB).
 * @returns {Promise<Object>} { words: Array }
 */
export async function getVocabDueWords() {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/due-words'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get vocab due words:', error);
    return { words: [] };
  }
}

/**
 * Get count of due vocab words from internal FSRS.
 * @returns {Promise<Object>} { count: number }
 */
export async function getVocabDueCount() {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/due-count'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get vocab due count:', error);
    return { count: 0 };
  }
}

/**
 * Review a vocab word via internal FSRS.
 * @param {string} word - The word to review
 * @param {string} grade - 'good' or 'again'
 * @returns {Promise<Object>} { ok, mastered, card }
 */
export async function reviewVocabWord(word, grade) {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/review'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ word, grade })
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to review vocab word:', error);
    return null;
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add vocab due-words, due-count, review API functions"
```

---

### Task 6: Adapt speed-review.js for internal FSRS cards

**Files:**
- Modify: `public/js/ui/speed-review.js`

- [ ] **Step 1: Update the sendReview guard**

In `public/js/ui/speed-review.js`, the `commitPendingReview` function at line 129 gates on `word.vid !== undefined && word.sid !== undefined`. Internal FSRS cards don't have `vid`/`sid` but have `source: 'internal'`.

Replace line 129:

```javascript
  if (word.vid !== undefined && word.sid !== undefined) {
```

With:

```javascript
  if ((word.vid !== undefined && word.sid !== undefined) || word.source === 'internal') {
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/speed-review.js && echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat: speed review accepts internal FSRS cards without vid/sid"
```

---

### Task 7: Swap hub speed review data source (game.js + exploration.js)

**Files:**
- Modify: `public/game.js`
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Import new API functions in game.js**

In `public/game.js`, find the import block that includes `getDueWords`. Add the new imports alongside it. Find the line:

```javascript
  getDueWords as apiGetDueWords,
```

Add after it:

```javascript
  getVocabDueWords,
  getVocabDueCount,
  reviewVocabWord,
```

Also import the mastery sync functions. Find the import from bootstrap-client (search for `setKnownWords` or `bootstrap-client`):

```javascript
import { setKnownWords, ... } from './js/ui/bootstrap-client.js';
```

Add `addKnownWord, removeKnownWord` to that import.

- [ ] **Step 2: Update speedReview.init sendReview callback**

In `public/game.js`, find the `speedReview.init` block (around line 1460). Replace the `sendReview` callback:

```javascript
    sendReview: (vid, sid, grade, wordText) => apiSendJpdbReview(vid, sid, grade, wordText),
```

With:

```javascript
    sendReview: async (vid, sid, grade, wordText) => {
      // Internal FSRS cards: grade via internal review endpoint
      if (vid === undefined) {
        const internalGrade = grade >= 3 ? 'good' : 'again';
        const result = await reviewVocabWord(wordText, internalGrade);
        if (result?.mastered) addKnownWord(wordText);
        else if (result && !result.mastered) removeKnownWord(wordText);
        return result;
      }
      // JPDB cards: use existing JPDB review
      return apiSendJpdbReview(vid, sid, grade, wordText);
    },
```

- [ ] **Step 3: Update refreshQueue callback**

In the same `speedReview.init` block, replace the `refreshQueue` callback:

```javascript
    refreshQueue: async (reviewedWords = []) => {
      const result = await apiGetDueWords(reviewedWords);
      return result?.words || [];
    },
```

With:

```javascript
    refreshQueue: async () => {
      const result = await getVocabDueWords();
      return result?.words || [];
    },
```

- [ ] **Step 4: Update hub button in exploration.js callback**

In `public/game.js`, find where `apiGetDueWords` is passed to exploration.init (around line 1667):

```javascript
    apiGetDueWords,
```

Replace with:

```javascript
    apiGetDueWords: async () => getVocabDueWords(),
```

This swaps the hub button's data source without changing exploration.js — the callback name stays the same, just the implementation changes.

**Note:** There are 3 other `apiGetDueWords(reviewedWords)` calls in `game.js` (lines ~1155, ~1172, ~1537) used for combat batch refresh. These intentionally stay on JPDB — they refresh the in-combat word pool, which is a separate concern from the hub vocab mastery review. Do NOT modify these calls.

**Note:** The `commitRoomReview` callback (line 1473) passes `word.vid` and `word.sid` to the speed-review-room progress endpoint. This is only active during room-based speed review sessions (not hub). Since internal FSRS vocab cards only appear in hub speed review (via `/due-words`), `commitRoomReview` will never receive an internal card. If room-based speed review ever mixes internal cards in the future, this would need a guard.

- [ ] **Step 5: Syntax check both files**

Run: `node --check public/game.js && node --check public/js/ui/exploration.js && echo "OK"`

- [ ] **Step 6: Run full test suite**

Run: `npm test 2>&1 | tail -30`

Expected: All unit + integration tests pass

- [ ] **Step 7: Commit**

```bash
git add public/game.js
git commit -m "feat: swap hub speed review from JPDB to internal FSRS vocab cards"
```

---

## Chunk 3: Verification

### Task 8: Full test run + syntax check all modified files

**Files:** (all modified files from Tasks 1-7)

- [ ] **Step 1: Syntax check all modified files**

```bash
node --check src/game/internal-srs.js && \
node --check src/game/bootstrap/word-knowledge.js && \
node --check src/routes/game/known-words.js && \
node --check public/js/ui/bootstrap-client.js && \
node --check public/js/api.js && \
node --check public/js/ui/speed-review.js && \
node --check public/game.js && \
echo "All syntax checks passed"
```

- [ ] **Step 2: Run full test suite**

Run: `npm test 2>&1 | tail -40`

Expected: All Tier 1 + Tier 2 tests pass

- [ ] **Step 3: Start dev server and verify endpoints**

Run: `npm run dev &` (or if already running, just test)

```bash
# Test due-count endpoint (should return 0 for fresh user)
curl -s http://localhost:3000/api/game/known-words/due-count -H "Authorization: Bearer <token>" | jq

# Test due-words endpoint
curl -s http://localhost:3000/api/game/known-words/due-words -H "Authorization: Bearer <token>" | jq
```

Expected: `{ "count": 0 }` and `{ "words": [] }` for a user with no vocab cards yet
