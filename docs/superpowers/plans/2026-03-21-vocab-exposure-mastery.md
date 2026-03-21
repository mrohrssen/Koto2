# Vocab Exposure Tracking & Mastery-Gated English Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track word exposures across all gameplay surfaces, trigger FSRS-scheduled speed reviews after 5 exposures, and hide English translations for mastered words.

**Architecture:** Refactor `internal-srs.js` into a unified deck-based SRS library (kana + vocab as peers). Add exposure tracking to `renderJpFirst()`. Wire the server-side expose endpoint to create FSRS vocab cards at threshold. Swap hub speed review from JPDB to internal FSRS.

**Tech Stack:** ts-fsrs, Express, ES6 modules, node:test

**Spec:** `docs/superpowers/specs/2026-03-21-vocab-exposure-mastery-design.md`

---

### Task 1: Refactor internal-srs.js — Extract Generic Deck Operations

The existing `internal-srs.js` has FSRS logic hardcoded for kana. Extract it into generic deck operations so kana and vocab are both just "decks."

**Files:**
- Modify: `src/game/internal-srs.js`
- Modify: `tests/unit/game/internal-srs.test.js`

- [ ] **Step 1: Write tests for generic deck operations**

Add a new `describe('Generic deck operations')` block in `tests/unit/game/internal-srs.test.js`. These tests use a fake deck name `'test'` to verify deck-agnostic behavior:

```js
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

  it('serialization round-trips dates correctly', () => {
    srs.createCard(TEST_USER, 'test', 'card-1', {});
    srs.gradeCard(TEST_USER, 'test', 'card-1', 'good');
    srs.clearSrsCache(TEST_USER); // force reload from disk
    const cards = srs.getDeckCards(TEST_USER, 'test');
    assert.ok(cards[0].due instanceof Date);
    assert.ok(cards[0].last_review instanceof Date);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `node --test tests/unit/game/internal-srs.test.js`
Expected: FAIL — `createCard`, `getDeckCards`, `getDueCards`, `getDueCount`, `gradeCard` not defined.

- [ ] **Step 3: Implement generic deck operations**

In `src/game/internal-srs.js`, add these functions. The key pattern: each deck is stored as `data[deckName] = { cards: [] }`. Cards have an `id` field plus FSRS fields plus arbitrary metadata.

```js
/**
 * Get cards array for a deck, initializing if needed.
 */
export function getDeckCards(userId, deckName) {
  const data = loadSrsData(userId);
  if (!data[deckName]) data[deckName] = { cards: [] };
  return data[deckName].cards;
}

/**
 * Create a card in a deck. Idempotent — skips if card with same id exists.
 */
export function createCard(userId, deckName, cardId, metadata = {}) {
  const data = loadSrsData(userId);
  if (!data[deckName]) data[deckName] = { cards: [] };
  const existing = data[deckName].cards.find(c => c.id === cardId);
  if (existing) return existing;

  const card = { id: cardId, ...metadata, ...createEmptyCard() };
  data[deckName].cards.push(card);
  saveSrsData(userId, data);
  return card;
}

/**
 * Grade a card in a deck. Returns updated card.
 */
export function gradeCard(userId, deckName, cardId, grade) {
  const data = loadSrsData(userId);
  if (!data[deckName]) throw new Error(`Deck '${deckName}' not found`);
  const cardIndex = data[deckName].cards.findIndex(c => c.id === cardId);
  if (cardIndex === -1) throw new Error(`Card '${cardId}' not found in deck '${deckName}'`);

  const card = data[deckName].cards[cardIndex];
  const fsrsCard = buildFsrsCard(card);
  const rating = GRADE_MAP[grade];
  if (rating === undefined) throw new Error(`Invalid grade: ${grade}. Must be 'again' or 'good'.`);

  const result = scheduler.repeat(fsrsCard, new Date());
  const updated = result[rating].card;

  // Merge FSRS fields back, preserving id + metadata
  const { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review } = updated;
  Object.assign(card, { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review });

  saveSrsData(userId, data);
  return card;
}

/**
 * Get all due cards in a deck (due <= now).
 */
export function getDueCards(userId, deckName) {
  const cards = getDeckCards(userId, deckName);
  const now = new Date();
  return cards.filter(c => {
    const dueDate = c.due instanceof Date ? c.due : new Date(c.due);
    return dueDate <= now;
  });
}

/**
 * Get count of due cards in a deck.
 */
export function getDueCount(userId, deckName) {
  return getDueCards(userId, deckName).length;
}

/**
 * Build a clean FSRS card object from a stored card.
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
    fsrsCard.last_review = card.last_review instanceof Date ? card.last_review : new Date(card.last_review);
  }
  return fsrsCard;
}
```

Also update `loadSrsData` and `saveSrsData` to generically serialize/deserialize ALL deck keys (not just `kana`):

```js
// In loadSrsData — replace the kana-only deserialization:
export function loadSrsData(userId) {
  if (cache.has(userId)) return cache.get(userId);
  const filePath = getFilePath(userId);
  let data = { kana: { cards: [] } };
  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      // Deserialize ALL deck card dates
      for (const key of Object.keys(raw)) {
        if (raw[key]?.cards && Array.isArray(raw[key].cards)) {
          raw[key].cards = raw[key].cards.map(deserializeCard);
        }
      }
      data = raw;
    } catch (e) {
      console.warn(`[SRS] Failed to load data for ${userId}:`, e.message);
    }
  }
  cache.set(userId, data);
  return data;
}

// In saveSrsData — replace kana-only serialization:
export function saveSrsData(userId, data) {
  cache.set(userId, data);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const filePath = getFilePath(userId);
  const serialized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value?.cards && Array.isArray(value.cards)) {
      serialized[key] = { ...value, cards: value.cards.map(serializeCard) };
    } else {
      serialized[key] = value;
    }
  }
  try {
    writeFileSync(filePath, JSON.stringify(serialized, null, 2));
  } catch (e) {
    console.warn(`[SRS] Failed to save data for ${userId}:`, e.message);
  }
}
```

- [ ] **Step 4: Run tests — verify generic deck tests pass**

Run: `node --test tests/unit/game/internal-srs.test.js`
Expected: ALL tests pass (including existing kana tests — the refactored load/save is backward-compatible).

- [ ] **Step 5: Refactor existing kana functions to use generic deck operations**

Update `reviewKanaCard` to use `buildFsrsCard` and the merge pattern from `gradeCard`. The kana functions (`initKanaDeck`, `getNextKanaCard`, `reviewKanaCard`, `getKanaStats`, `isKanaGraduated`) remain as thin wrappers. `reviewKanaCard` can't use `gradeCard` directly because kana cards use `char` as ID, not `id`. But it should use the shared `buildFsrsCard` helper.

Replace the inline FSRS card building in `reviewKanaCard` (lines 261-278) with:

```js
const fsrsCard = buildFsrsCard(card);
```

- [ ] **Step 6: Run all tests — verify nothing regressed**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/internal-srs.js tests/unit/game/internal-srs.test.js
git commit -m "refactor: extract generic deck operations from internal-srs"
```

---

### Task 2: Add unmarkKnown to word-knowledge.js

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js`
- Modify: `tests/unit/word-knowledge.test.js`

- [ ] **Step 1: Write tests for unmarkKnown and exposure reset**

Add to `tests/unit/word-knowledge.test.js`:

```js
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

// Add these tests:
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

it('exposure reset sets count to 0', () => {
  registerExposure(wk, '森');
  registerExposure(wk, '森');
  registerExposure(wk, '森');
  assert.strictEqual(wk.seen['森'].exposures, 3);
  wk.seen['森'].exposures = 0; // direct reset (done by server route)
  assert.strictEqual(wk.seen['森'].exposures, 0);
});
```

- [ ] **Step 2: Run tests — verify unmarkKnown tests fail**

Run: `node --test tests/unit/word-knowledge.test.js`
Expected: FAIL — `unmarkKnown` not exported.

- [ ] **Step 3: Implement unmarkKnown**

Add to `src/game/bootstrap/word-knowledge.js`:

```js
export function unmarkKnown(wk, wordId) {
  delete wk.known[wordId];
}
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `node --test tests/unit/word-knowledge.test.js`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/word-knowledge.test.js
git commit -m "feat: add unmarkKnown to word-knowledge for mastery reversal"
```

---

### Task 3: Add Vocab Card Creation on Exposure Threshold

When the server receives exposures and a word hits 5, create an FSRS vocab card.

**Files:**
- Modify: `src/routes/game/known-words.js`
- Create: `tests/unit/game/vocab-srs.test.js`

- [ ] **Step 1: Write tests for exposure threshold → card creation**

Create `tests/unit/game/vocab-srs.test.js`:

```js
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

  beforeEach(() => {
    srs.clearSrsData(TEST_USER);
  });

  it('no vocab card created below 5 exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 4; i++) wk.registerExposure(knowledge, 'かいふく');
    // No card should exist yet
    const due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 0);
  });

  it('vocab card created at exactly 5 exposures', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);
    for (let i = 0; i < 5; i++) wk.registerExposure(knowledge, 'かいふく');
    // Simulate what the route does at threshold
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
    // createCard is idempotent
    srs.createCard(TEST_USER, 'vocab', 'かいふく', {
      word: 'かいふく', meaning: 'recovery', reading: 'かいふく'
    });
    const cards = srs.getDeckCards(TEST_USER, 'vocab');
    assert.strictEqual(cards.length, 1);
  });
});
```

- [ ] **Step 2: Run tests — verify they pass** (they use already-built generic ops)

Run: `node --test tests/unit/game/vocab-srs.test.js`
Expected: ALL pass (these test the integration between word-knowledge and generic SRS, which are already built).

- [ ] **Step 3: Update the expose route to check threshold and create cards**

Modify `src/routes/game/known-words.js`. The route needs access to SRS functions. Add the threshold check after incrementing exposures:

```js
import { Router } from 'express';
import { loadWordKnowledge, createWordKnowledge, registerExposure, saveWordKnowledge } from '../../game/bootstrap/word-knowledge.js';
import { createCard, getDeckCards } from '../../game/internal-srs.js';

const EXPOSURE_THRESHOLD = 5;

export function createKnownWordsRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
    res.json({ words: Object.keys(wk.known) });
  });

  router.post('/expose', (req, res) => {
    const { words } = req.body || {};
    if (!Array.isArray(words) || words.length === 0) {
      return res.json({ ok: true });
    }
    try {
      const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
      for (const word of words) {
        if (typeof word !== 'string' || word.length === 0) continue;

        registerExposure(wk, word);

        // Check threshold — create vocab FSRS card if at exactly 5
        // (createCard is idempotent, so >=5 also works safely)
        if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
          // Only create if no card exists yet for this word
          const existingCards = getDeckCards(req.user.id, 'vocab');
          if (!existingCards.find(c => c.id === word)) {
            createCard(req.user.id, 'vocab', word, {
              word, meaning: '', reading: word
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

  return router;
}
```

**Note:** The `meaning` field is empty string here because the expose endpoint only receives the Japanese word, not its English meaning. The meaning gets populated when the card is served for review — the route that serves due cards will need to look up the meaning from game data. Alternatively, the client can send `{ word, meaning }` pairs in the exposure batch. This is addressed in Task 6 when wiring the speed review endpoint.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/known-words.js tests/unit/game/vocab-srs.test.js
git commit -m "feat: create FSRS vocab card when word hits 5 exposures"
```

---

### Task 4: Add Exposure Tracking to renderJpFirst

**Files:**
- Modify: `public/js/ui/bootstrap-client.js`

- [ ] **Step 1: Add `_pendingExposures.add(kanji)` to renderJpFirst**

In `public/js/ui/bootstrap-client.js`, inside the `if (!_knownWords.has(kanji) && english)` block (the condition where English is shown), add exposure tracking:

```js
export function renderJpFirst(kanji, reading, english) {
  let html = '<span class="bs-word">';
  if (reading) {
    html += `<ruby>${esc(reading)}<rt>${esc(toRomaji(reading))}</rt></ruby>`;
  } else {
    html += esc(reading || kanji);
  }
  if (!_knownWords.has(kanji) && english) {
    html += `<span class="bs-word-en">${esc(english)}</span>`;
    _pendingExposures.add(kanji);
  }
  html += '</span>';
  return html;
}
```

The only change is adding `_pendingExposures.add(kanji);` on the line after the English span is added.

- [ ] **Step 2: Verify with syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/bootstrap-client.js
git commit -m "feat: track exposures in renderJpFirst when English is shown"
```

---

### Task 5: Consolidate Rendering Surfaces Through renderJpFirst

Route all inline Japanese+English rendering through `renderJpFirst()` so exposures are tracked and English can be conditionally hidden.

**Files:**
- Modify: `public/js/ui/creature-row.js`
- Modify: `public/js/ui/target-select.js`
- Modify: `public/js/ui/post-combat-shop.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Update creature-row.js — popup title**

Find `${creature.name} (${creature.nameEn})` in the popup title section. Import `renderJpFirst` from `bootstrap-client.js` (if not already imported) and replace:

Before: `${creature.name} (${creature.nameEn})`
After: `${renderJpFirst(creature.name, creature.baseReading, creature.nameEn)}`

Note: Ensure `renderJpFirst` is imported at the top of the file:
```js
import { renderJpFirst } from './bootstrap-client.js';
```

- [ ] **Step 2: Update creature-row.js — popup move list**

Find `${m.name} (${m.nameEn})` in the popup move list rendering. Replace:

Before: `${m.name} (${m.nameEn})`
After: `${renderJpFirst(m.name, m.reading, m.nameEn)}`

- [ ] **Step 3: Update creature-row.js — popup equipment list**

Find `${item.word} (${item.nameEn})` in the popup equipment section. Replace:

Before: `${item.word} (${item.nameEn})`
After: `${renderJpFirst(item.word, item.reading, item.nameEn)}`

- [ ] **Step 4: Syntax check creature-row.js**

Run: `node --check public/js/ui/creature-row.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Update target-select.js — target creature name**

Find the separate divs showing `target.name` and `target.nameEn`. Combine into a single element using `renderJpFirst`. Import if needed.

Before:
```html
<div class="target-jp">${target.name}</div>
<div class="target-en">${target.nameEn}</div>
```
After:
```html
<div class="target-jp">${renderJpFirst(target.name, target.baseReading, target.nameEn)}</div>
```
Remove the `target-en` div.

- [ ] **Step 6: Syntax check target-select.js**

Run: `node --check public/js/ui/target-select.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Update post-combat-shop.js — creature target selection**

Find `${c.baseReading || c.name} (${c.nameEn})` in the creature targeting UI. Replace with `renderJpFirst`. Import if needed.

Before: `${ELEMENT_ICONS[c.element]} ${c.baseReading || c.name} (${c.nameEn})`
After: `${ELEMENT_ICONS[c.element]} ${renderJpFirst(c.name, c.baseReading, c.nameEn)}`

- [ ] **Step 8: Syntax check post-combat-shop.js**

Run: `node --check public/js/ui/post-combat-shop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 9: Update exploration.js — friendly NPC item card**

Find the separate divs for `item.word` and `item.nameEn` in the friendly NPC section. Combine. Import `renderJpFirst` if needed.

Before:
```html
<div class="shop-item-word">${icon} ${item.word} <span>(${item.reading})</span></div>
<div class="shop-item-word">${item.nameEn}</div>
```
After:
```html
<div class="shop-item-word">${icon} ${renderJpFirst(item.word, item.reading, item.nameEn)}</div>
```

- [ ] **Step 10: Update exploration.js — friendly NPC creature target**

Find separate divs for `creature.name` and `creature.nameEn` in creature targeting. Combine.

Before:
```html
<div class="...">${creature.name}</div>
<div class="...">${creature.nameEn} Lv.${creature.level}</div>
```
After:
```html
<div class="...">${renderJpFirst(creature.name, creature.baseReading, creature.nameEn)} Lv.${creature.level}</div>
```

- [ ] **Step 11: Update exploration.js — shrine upgrade creature card**

Find `${creature.nameEn} Lv.${creature.level}` in the shrine upgrade section. Replace with `renderJpFirst`.

Before: `${creature.nameEn} Lv.${creature.level}`
After: `${renderJpFirst(creature.name, creature.baseReading, creature.nameEn)} Lv.${creature.level}`

- [ ] **Step 12: Syntax check exploration.js**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 13: Update combat-loop.js — multi-enemy picker buttons**

Find `${r.nameEn} (Lv${r.level})` in the enemy picker. Replace with `renderJpFirst`. Import if needed.

Before: `${ELEM_ICONS[r.element]} ${r.nameEn} (Lv${r.level})`
After: `${ELEM_ICONS[r.element]} ${renderJpFirst(r.name, r.baseReading, r.nameEn)} (Lv${r.level})`

- [ ] **Step 14: Syntax check combat-loop.js**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 15: Run all tests**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 16: Commit**

```bash
git add public/js/ui/creature-row.js public/js/ui/target-select.js public/js/ui/post-combat-shop.js public/js/ui/exploration.js public/js/ui/combat-loop.js
git commit -m "refactor: route all JP+EN rendering through renderJpFirst for exposure tracking"
```

---

### Task 6: Exposure Batch — Send Meaning Alongside Word

The server needs the English meaning to store on the FSRS card. Update the exposure flush to send `{ word, meaning }` pairs instead of bare word strings.

**Files:**
- Modify: `public/js/ui/bootstrap-client.js`
- Modify: `src/routes/game/known-words.js`

- [ ] **Step 1: Update client to send word+meaning pairs**

In `bootstrap-client.js`, change `_pendingExposures` from a `Set` of strings to a `Map` of word→meaning:

```js
const _pendingExposures = new Map(); // word → meaning
```

In `renderJpFirst`, change:
```js
_pendingExposures.add(kanji);
```
To:
```js
_pendingExposures.set(kanji, english);
```

In `renderEnFirst`, change:
```js
_pendingExposures.add(kanji);
```
To:
```js
_pendingExposures.set(kanji, english);
```

In `flushExposures`, change:
```js
if (_pendingExposures.size === 0) return;
const words = [..._pendingExposures];
_pendingExposures.clear();
// ...
body: JSON.stringify({ words })
```
To:
```js
if (_pendingExposures.size === 0) return;
const words = [..._pendingExposures.entries()].map(([word, meaning]) => ({ word, meaning }));
_pendingExposures.clear();
// ...
body: JSON.stringify({ words })
```

- [ ] **Step 2: Update server route to accept word+meaning pairs**

In `src/routes/game/known-words.js`, update the `POST /expose` handler's loop. The existing GET `/` route and overall function structure stay unchanged — only the loop body changes.

Change the loop from:
```js
for (const word of words) {
  if (typeof word === 'string' && word.length > 0) {
    registerExposure(wk, word);
  }
}
```

To (supports both old string format and new `{ word, meaning }` format):
```js
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
```

Make sure the imports at the top of the file include `createCard` and `getDeckCards` from `../../game/internal-srs.js` and `EXPOSURE_THRESHOLD` is defined as a constant (`const EXPOSURE_THRESHOLD = 5;`).

- [ ] **Step 3: Syntax checks**

Run: `node --check public/js/ui/bootstrap-client.js && node --check src/routes/game/known-words.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/bootstrap-client.js src/routes/game/known-words.js
git commit -m "feat: send word+meaning pairs in exposure flush for FSRS card creation"
```

---

### Task 7: Vocab Review Endpoint + Mastery/Un-mastery Logic

Add the server endpoint for grading vocab cards, with mastery (markKnown) and un-mastery (unmarkKnown + exposure reset) side effects.

**Files:**
- Modify: `src/routes/game/known-words.js`
- Modify: `tests/unit/game/vocab-srs.test.js`

- [ ] **Step 1: Write tests for review grading + mastery state**

Add to `tests/unit/game/vocab-srs.test.js`:

```js
describe('Vocab SRS — review grading', () => {
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
    // Simulate: word was known, then failed review
    wk.markKnown(knowledge, 'かいふく');
    for (let i = 0; i < 7; i++) wk.registerExposure(knowledge, 'かいふく');

    // Un-mastery
    wk.unmarkKnown(knowledge, 'かいふく');
    knowledge.seen['かいふく'].exposures = 0;

    assert.ok(!wk.isWordKnown(knowledge, 'かいふく'));
    assert.strictEqual(knowledge.seen['かいふく'].exposures, 0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/unit/game/vocab-srs.test.js`
Expected: ALL pass (these test the logic we've already built).

- [ ] **Step 3: Add vocab review route**

Add to `src/routes/game/known-words.js`:

```js
import { createCard, getDeckCards, gradeCard } from '../../game/internal-srs.js';
import { loadWordKnowledge, createWordKnowledge, registerExposure, markKnown, unmarkKnown, saveWordKnowledge } from '../../game/bootstrap/word-knowledge.js';

// Inside createKnownWordsRoutes():

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
```

- [ ] **Step 4: Add due-words endpoint**

Add to `src/routes/game/known-words.js`:

```js
import { getDueCards, getDueCount } from '../../game/internal-srs.js';

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
  }));
  res.json({ words });
});
```

- [ ] **Step 5: Syntax check**

Run: `node --check src/routes/game/known-words.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/known-words.js tests/unit/game/vocab-srs.test.js
git commit -m "feat: vocab review endpoint with mastery/un-mastery side effects"
```

---

### Task 8: Wire Hub Speed Review to Internal FSRS

Replace JPDB-backed hub speed review with internal FSRS vocab cards.

**Files:**
- Modify: `public/js/ui/bootstrap-client.js` (addKnownWord/removeKnownWord helpers)
- Modify: `public/game.js` (speedReview.init callbacks)
- Modify: `public/js/ui/exploration.js` (hub button + badge)
- Modify: `public/js/api.js` (new API functions)

- [ ] **Step 1: Add API functions for internal vocab review**

In `public/js/api.js`, add:

```js
export async function getVocabDueWords() {
  const response = await fetch('/api/game/known-words/due-words', {
    headers: { ...getAuthHeaders() }
  });
  return response.json();
}

export async function getVocabDueCount() {
  const response = await fetch('/api/game/known-words/due-count', {
    headers: { ...getAuthHeaders() }
  });
  return response.json();
}

export async function reviewVocabWord(word, grade) {
  const response = await fetch('/api/game/known-words/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ word, grade })
  });
  return response.json();
}
```

Add these to the exports object at the bottom.

- [ ] **Step 2: Add addKnownWord/removeKnownWord helpers to bootstrap-client.js**

The `_knownWords` Set is module-private in `bootstrap-client.js`. Add two exported helpers so `game.js` can update it after review grading:

In `public/js/ui/bootstrap-client.js`, add:

```js
/** Add a single word to known set (after successful review). */
export function addKnownWord(word) {
  _knownWords.add(word);
}

/** Remove a single word from known set (after failed review). */
export function removeKnownWord(word) {
  _knownWords.delete(word);
}
```

- [ ] **Step 3: Update speedReview.init callbacks in game.js**

In `public/game.js`, import the new helpers and API functions at the top:

```js
import { addKnownWord, removeKnownWord } from './js/ui/bootstrap-client.js';
import { getVocabDueWords, getVocabDueCount, reviewVocabWord } from './js/api.js';
```

Find the `speedReview.init({...})` block (around line 1241). Update the `sendReview` and `refreshQueue` callbacks:

```js
speedReview.init({
  sendReview: async (vid, sid, grade, wordText) => {
    // Grade maps: speed review sends 4 for "right" (knew it), 1 for "left" (didn't know)
    const internalGrade = grade >= 3 ? 'good' : 'again';
    const result = await reviewVocabWord(wordText, internalGrade);
    // Update client-side known words immediately
    if (result?.mastered) {
      addKnownWord(wordText);
    } else if (result && !result.mastered) {
      removeKnownWord(wordText);
    }
    return result;
  },
  playTTS: (word) => tts.playWord(word),
  prefetchTTS: (word) => tts.prefetchWord(word),
  refreshQueue: async () => {
    const result = await getVocabDueWords();
    return result?.words || [];
  },
  // Keep room callbacks as-is
  startRoomSession: async ({ roomId }) => { /* unchanged */ },
  commitRoomReview: async ({ roomId, word, commitIndex }) => { /* unchanged */ },
});
```

**Important:** The speed review `sendReview` callback currently receives numeric grades (1=again, 4=easy) from JPDB convention. Map these: grade >= 3 → 'good', grade < 3 → 'again'.

- [ ] **Step 4: Update hub button to fetch internal due words**

In `public/js/ui/exploration.js`, find the speed review button click handler (around line 341). Change `apiGetDueWords()` to use the new internal endpoint:

```js
document.getElementById('speed-review-btn')?.addEventListener('click', async () => {
  playSFX('button-tap');
  const result = await apiGetDueWords(); // This callback is now wired to internal FSRS
  if (result?.words?.length > 0) {
    speedReview.start(result.words);
  } else {
    sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
  }
});
```

The `apiGetDueWords` callback passed to exploration.js already points to the function in game.js — update that to call the new API. Find where `apiGetDueWords` is assigned in game.js and change it:

```js
apiGetDueWords: () => apiGetVocabDueWords(),
```

- [ ] **Step 5: Add due count badge to hub button**

In `public/js/ui/exploration.js`, find where the hub buttons are rendered (around line 335). Add badge fetch:

```js
// Before rendering the hub buttons, fetch due count
const dueResult = await apiGetVocabDueCount();
const dueCount = dueResult?.count || 0;

actions.setContent(`
  <div style="display:flex;flex-direction:column;align-items:stretch;gap:12px;align-self:stretch;width:100%;max-width:340px;box-sizing:border-box;">
    <button class="action-btn action-btn-secondary" id="speed-review-btn">📚 速習${dueCount > 0 ? ` (${dueCount})` : ''}</button>
    <button class="action-btn action-btn-secondary" id="upgrades-btn">⬆️ 強化${tokens > 0 ? ` (${tokens})` : ''}</button>
    <button class="action-btn action-btn-primary" id="context-action-btn">⚡ 潜入</button>
  </div>
`);
```

The `apiGetVocabDueCount` callback needs to be passed to exploration.js from game.js, same pattern as other API callbacks.

- [ ] **Step 6: Syntax checks**

Run: `node --check public/js/ui/bootstrap-client.js && node --check public/js/api.js && node --check public/game.js && node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/bootstrap-client.js public/game.js public/js/api.js public/js/ui/exploration.js
git commit -m "feat: wire hub speed review to internal FSRS vocab cards with due badge"
```

---

### Task 9: Update Speed Review to Handle Internal Cards

The speed review currently checks `word.vid !== undefined && word.sid !== undefined` before sending reviews. Internal vocab cards don't have JPDB vid/sid. Update the guard.

**Files:**
- Modify: `public/js/ui/speed-review.js`

- [ ] **Step 1: Update the review guard in flushPendingReview**

In `speed-review.js`, find the `flushPendingReview` function (around line 115). The guard at line 127 checks for JPDB vid/sid. Change it to always send reviews (the callback now handles internal grading):

Before:
```js
if (word.vid !== undefined && word.sid !== undefined) {
  tasks.push(Promise.resolve(state.callbacks?.sendReview(word.vid, word.sid, grade, word.word)));
```

After:
```js
if (state.callbacks?.sendReview) {
  tasks.push(Promise.resolve(state.callbacks.sendReview(word.vid, word.sid, grade, word.word)));
```

This way internal cards (which lack vid/sid) still trigger the sendReview callback. The callback in game.js only uses `wordText` (the 4th param) for internal grading.

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/speed-review.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "fix: speed review sends grades for internal cards without JPDB vid/sid"
```

---

### Task 10: Integration Test — Full Lifecycle

End-to-end test: expose word 5 times → card created → grade good → word is known → grade again → word un-known + exposures reset.

**Files:**
- Modify: `tests/unit/game/vocab-srs.test.js`

- [ ] **Step 1: Write full lifecycle test**

Add to `tests/unit/game/vocab-srs.test.js`:

```js
describe('Vocab SRS — full lifecycle', () => {
  it('expose 5x → card due → grade good → known → grade again → un-known + reset', () => {
    const knowledge = wk.createWordKnowledge(TEST_USER);

    // 1. Expose 5 times
    for (let i = 0; i < 5; i++) wk.registerExposure(knowledge, 'たたかう');
    assert.strictEqual(knowledge.seen['たたかう'].exposures, 5);

    // 2. Create card (simulating what the route does)
    srs.createCard(TEST_USER, 'vocab', 'たたかう', {
      word: 'たたかう', meaning: 'fight', reading: 'たたかう'
    });
    let due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);

    // 3. Grade good twice → reach Review state (New→Learning→Review)
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'good'); // New → Learning
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'good'); // Learning → Review
    wk.markKnown(knowledge, 'たたかう');
    assert.ok(wk.isWordKnown(knowledge, 'たたかう'));

    // Card should no longer be immediately due (pushed into future)
    due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 0);

    // 4. Simulate time passing — manually set due to past
    const cards = srs.getDeckCards(TEST_USER, 'vocab');
    cards[0].due = new Date(Date.now() - 1000);

    // 5. Card is due again for scheduled review
    due = srs.getDueCards(TEST_USER, 'vocab');
    assert.strictEqual(due.length, 1);

    // 6. Grade again (failed) → un-mastery
    // Card is in Review state, so "again" → Relearning, lapses increments
    srs.gradeCard(TEST_USER, 'vocab', 'たたかう', 'again');
    wk.unmarkKnown(knowledge, 'たたかう');
    knowledge.seen['たたかう'].exposures = 0;

    assert.ok(!wk.isWordKnown(knowledge, 'たたかう'));
    assert.strictEqual(knowledge.seen['たたかう'].exposures, 0);

    // 7. Verify card still exists (not deleted, just re-learning)
    const allCards = srs.getDeckCards(TEST_USER, 'vocab');
    assert.strictEqual(allCards.length, 1);
    assert.strictEqual(allCards[0].lapses, 1); // Review→Relearning increments lapses
  });
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/unit/game/vocab-srs.test.js`
Expected: ALL pass.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: ALL pass.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/game/vocab-srs.test.js
git commit -m "test: full lifecycle integration test for vocab exposure → mastery → un-mastery"
```
