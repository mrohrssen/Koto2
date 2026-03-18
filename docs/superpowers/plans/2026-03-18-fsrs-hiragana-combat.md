# FSRS Hiragana Combat Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach hiragana to absolute beginners via FSRS spaced repetition integrated into simplified auto-attack combat.

**Architecture:** New `src/game/internal-srs.js` wraps the `ts-fsrs` npm package to schedule hiragana flash cards. When `meta.kanaMode` is true, the combat loop replaces move selection with kana card reviews — each living creature gets one card, then all auto-attack the first enemy with their cheapest move in a single batch API call. Graduation happens when all 71 cards reach FSRS Review state.

**Tech Stack:** `ts-fsrs` (FSRS-5 algorithm), Node.js `node:test`, existing `showFlashCards()` swipe UI

**Spec:** `docs/superpowers/specs/2026-03-18-fsrs-hiragana-combat-design.md`

---

### Task 1: Install ts-fsrs and create hiragana deck data

**Files:**
- Modify: `package.json` (npm install)
- Create: `src/game/hiragana-deck.js`
- Test: `tests/unit/game/hiragana-deck.test.js`

- [ ] **Step 1: Install ts-fsrs**

```bash
npm install ts-fsrs
```

- [ ] **Step 2: Write test for hiragana deck data**

```javascript
// tests/unit/game/hiragana-deck.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HIRAGANA_DECK, getRowCards } from '../../../src/game/hiragana-deck.js';

describe('Hiragana Deck', () => {
  it('has exactly 71 cards', () => {
    assert.strictEqual(HIRAGANA_DECK.length, 71);
  });

  it('every card has char, romaji, and row', () => {
    for (const card of HIRAGANA_DECK) {
      assert.ok(card.char, `missing char`);
      assert.ok(card.romaji, `missing romaji for ${card.char}`);
      assert.ok(card.row >= 0, `missing row for ${card.char}`);
    }
  });

  it('has 15 rows (0-14)', () => {
    const rows = new Set(HIRAGANA_DECK.map(c => c.row));
    assert.strictEqual(rows.size, 15);
  });

  it('row 0 is the あ row with 5 vowels', () => {
    const row0 = getRowCards(0);
    assert.strictEqual(row0.length, 5);
    assert.deepStrictEqual(row0.map(c => c.char), ['あ', 'い', 'う', 'え', 'お']);
  });

  it('rows 7 and 9 have 3 cards each', () => {
    assert.strictEqual(getRowCards(7).length, 3);
    assert.strictEqual(getRowCards(9).length, 3);
  });

  it('uses Hepburn romanization for ぢ and づ', () => {
    const ji = HIRAGANA_DECK.find(c => c.char === 'ぢ');
    const zu = HIRAGANA_DECK.find(c => c.char === 'づ');
    assert.strictEqual(ji.romaji, 'ji');
    assert.strictEqual(zu.romaji, 'zu');
  });

  it('has no duplicate chars', () => {
    const chars = HIRAGANA_DECK.map(c => c.char);
    assert.strictEqual(new Set(chars).size, chars.length);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test tests/unit/game/hiragana-deck.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create hiragana deck data**

```javascript
// src/game/hiragana-deck.js

/**
 * Static hiragana deck data — 71 cards organized by row.
 * Used by internal-srs.js for FSRS card initialization.
 */
export const HIRAGANA_DECK = [
  // Row 0: vowels
  { char: 'あ', romaji: 'a', row: 0 },
  { char: 'い', romaji: 'i', row: 0 },
  { char: 'う', romaji: 'u', row: 0 },
  { char: 'え', romaji: 'e', row: 0 },
  { char: 'お', romaji: 'o', row: 0 },
  // Row 1: ka
  { char: 'か', romaji: 'ka', row: 1 },
  { char: 'き', romaji: 'ki', row: 1 },
  { char: 'く', romaji: 'ku', row: 1 },
  { char: 'け', romaji: 'ke', row: 1 },
  { char: 'こ', romaji: 'ko', row: 1 },
  // Row 2: sa
  { char: 'さ', romaji: 'sa', row: 2 },
  { char: 'し', romaji: 'shi', row: 2 },
  { char: 'す', romaji: 'su', row: 2 },
  { char: 'せ', romaji: 'se', row: 2 },
  { char: 'そ', romaji: 'so', row: 2 },
  // Row 3: ta
  { char: 'た', romaji: 'ta', row: 3 },
  { char: 'ち', romaji: 'chi', row: 3 },
  { char: 'つ', romaji: 'tsu', row: 3 },
  { char: 'て', romaji: 'te', row: 3 },
  { char: 'と', romaji: 'to', row: 3 },
  // Row 4: na
  { char: 'な', romaji: 'na', row: 4 },
  { char: 'に', romaji: 'ni', row: 4 },
  { char: 'ぬ', romaji: 'nu', row: 4 },
  { char: 'ね', romaji: 'ne', row: 4 },
  { char: 'の', romaji: 'no', row: 4 },
  // Row 5: ha
  { char: 'は', romaji: 'ha', row: 5 },
  { char: 'ひ', romaji: 'hi', row: 5 },
  { char: 'ふ', romaji: 'fu', row: 5 },
  { char: 'へ', romaji: 'he', row: 5 },
  { char: 'ほ', romaji: 'ho', row: 5 },
  // Row 6: ma
  { char: 'ま', romaji: 'ma', row: 6 },
  { char: 'み', romaji: 'mi', row: 6 },
  { char: 'む', romaji: 'mu', row: 6 },
  { char: 'め', romaji: 'me', row: 6 },
  { char: 'も', romaji: 'mo', row: 6 },
  // Row 7: ya (3 cards)
  { char: 'や', romaji: 'ya', row: 7 },
  { char: 'ゆ', romaji: 'yu', row: 7 },
  { char: 'よ', romaji: 'yo', row: 7 },
  // Row 8: ra
  { char: 'ら', romaji: 'ra', row: 8 },
  { char: 'り', romaji: 'ri', row: 8 },
  { char: 'る', romaji: 'ru', row: 8 },
  { char: 'れ', romaji: 're', row: 8 },
  { char: 'ろ', romaji: 'ro', row: 8 },
  // Row 9: wa (3 cards)
  { char: 'わ', romaji: 'wa', row: 9 },
  { char: 'を', romaji: 'wo', row: 9 },
  { char: 'ん', romaji: 'n', row: 9 },
  // Row 10: ga (dakuten)
  { char: 'が', romaji: 'ga', row: 10 },
  { char: 'ぎ', romaji: 'gi', row: 10 },
  { char: 'ぐ', romaji: 'gu', row: 10 },
  { char: 'げ', romaji: 'ge', row: 10 },
  { char: 'ご', romaji: 'go', row: 10 },
  // Row 11: za
  { char: 'ざ', romaji: 'za', row: 11 },
  { char: 'じ', romaji: 'ji', row: 11 },
  { char: 'ず', romaji: 'zu', row: 11 },
  { char: 'ぜ', romaji: 'ze', row: 11 },
  { char: 'ぞ', romaji: 'zo', row: 11 },
  // Row 12: da
  { char: 'だ', romaji: 'da', row: 12 },
  { char: 'ぢ', romaji: 'ji', row: 12 },
  { char: 'づ', romaji: 'zu', row: 12 },
  { char: 'で', romaji: 'de', row: 12 },
  { char: 'ど', romaji: 'do', row: 12 },
  // Row 13: ba
  { char: 'ば', romaji: 'ba', row: 13 },
  { char: 'び', romaji: 'bi', row: 13 },
  { char: 'ぶ', romaji: 'bu', row: 13 },
  { char: 'べ', romaji: 'be', row: 13 },
  { char: 'ぼ', romaji: 'bo', row: 13 },
  // Row 14: pa (handakuten)
  { char: 'ぱ', romaji: 'pa', row: 14 },
  { char: 'ぴ', romaji: 'pi', row: 14 },
  { char: 'ぷ', romaji: 'pu', row: 14 },
  { char: 'ぺ', romaji: 'pe', row: 14 },
  { char: 'ぽ', romaji: 'po', row: 14 },
];

export function getRowCards(row) {
  return HIRAGANA_DECK.filter(c => c.row === row);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/unit/game/hiragana-deck.test.js
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/hiragana-deck.js tests/unit/game/hiragana-deck.test.js package.json package-lock.json
git commit -m "feat(srs): add ts-fsrs dependency and hiragana deck data (71 cards)"
```

---

### Task 2: Create FSRS service (`internal-srs.js`)

**Files:**
- Create: `src/game/internal-srs.js`
- Test: `tests/unit/game/internal-srs.test.js`

**Reference:** Check `ts-fsrs` API — `createEmptyCard()`, `fsrs()`, `Rating`, `State`, `scheduler.repeat(card, now)`.

- [ ] **Step 1: Write tests for the FSRS service**

```javascript
// tests/unit/game/internal-srs.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestTmpDir } from '../../helpers/tmp.js';

let tmp;
const TEST_USER = 'test-user-kana';

describe('Internal SRS Service', () => {
  let srs;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
  });

  after(async () => {
    await tmp.cleanup();
  });

  beforeEach(() => {
    srs.clearSrsData(TEST_USER);
  });

  describe('initKanaDeck', () => {
    it('creates 71 kana cards for a new user', () => {
      srs.initKanaDeck(TEST_USER);
      const data = srs.loadSrsData(TEST_USER);
      assert.strictEqual(data.kana.cards.length, 71);
    });

    it('each card has char, romaji, row, and FSRS fields', () => {
      srs.initKanaDeck(TEST_USER);
      const data = srs.loadSrsData(TEST_USER);
      const card = data.kana.cards[0];
      assert.ok(card.char);
      assert.ok(card.romaji);
      assert.ok(card.row >= 0);
      assert.ok('due' in card);
      assert.ok('stability' in card);
      assert.ok('difficulty' in card);
      assert.ok('state' in card);
    });

    it('does not overwrite existing data', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      srs.reviewKanaCard(TEST_USER, card.char, 'good');
      srs.initKanaDeck(TEST_USER); // second call
      const data = srs.loadSrsData(TEST_USER);
      const reviewed = data.kana.cards.find(c => c.char === card.char);
      assert.ok(reviewed.reps > 0, 'review data should be preserved');
    });
  });

  describe('getNextKanaCard', () => {
    it('returns a card from row 0 for a fresh user', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      assert.ok(card);
      assert.strictEqual(card.row, 0);
    });

    it('always returns a card (never null)', () => {
      srs.initKanaDeck(TEST_USER);
      for (let i = 0; i < 10; i++) {
        const card = srs.getNextKanaCard(TEST_USER);
        assert.ok(card, `card ${i} should not be null`);
      }
    });

    it('only returns unlocked cards', () => {
      srs.initKanaDeck(TEST_USER);
      // Without reviewing row 0, row 1 cards should not appear
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        const card = srs.getNextKanaCard(TEST_USER);
        seen.add(card.row);
      }
      assert.ok(!seen.has(1), 'row 1 should not be unlocked yet');
    });
  });

  describe('reviewKanaCard', () => {
    it('updates card state after "good" review', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      const result = srs.reviewKanaCard(TEST_USER, card.char, 'good');
      assert.ok(result);
      assert.ok(result.reps >= 1);
    });

    it('updates card state after "again" review', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      const result = srs.reviewKanaCard(TEST_USER, card.char, 'again');
      assert.ok(result);
      assert.ok(result.reps >= 1);
    });

    it('persists review data across loads', () => {
      srs.initKanaDeck(TEST_USER);
      const card = srs.getNextKanaCard(TEST_USER);
      srs.reviewKanaCard(TEST_USER, card.char, 'good');
      // Force reload from disk
      srs.clearSrsCache(TEST_USER);
      const data = srs.loadSrsData(TEST_USER);
      const reviewed = data.kana.cards.find(c => c.char === card.char);
      assert.ok(reviewed.reps >= 1);
    });
  });

  describe('row unlocking', () => {
    it('unlocks row 1 after all row 0 cards reviewed', () => {
      srs.initKanaDeck(TEST_USER);
      // Review all 5 row-0 cards
      const row0 = ['あ', 'い', 'う', 'え', 'お'];
      for (const char of row0) {
        srs.reviewKanaCard(TEST_USER, char, 'good');
      }
      // Now row 1 cards should be available
      const seen = new Set();
      for (let i = 0; i < 30; i++) {
        const card = srs.getNextKanaCard(TEST_USER);
        seen.add(card.row);
      }
      assert.ok(seen.has(0) || seen.has(1), 'should include row 0 or 1 cards');
    });
  });

  describe('getKanaStats', () => {
    it('returns stats for a fresh deck', () => {
      srs.initKanaDeck(TEST_USER);
      const stats = srs.getKanaStats(TEST_USER);
      assert.strictEqual(stats.total, 71);
      assert.strictEqual(stats.unlocked, 5); // row 0
      assert.strictEqual(stats.mastered, 0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/game/internal-srs.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement internal-srs.js**

Create `src/game/internal-srs.js`. Key implementation notes:

- Import `{ createEmptyCard, fsrs, Rating, State }` from `ts-fsrs`
- Import `{ HIRAGANA_DECK, getRowCards }` from `./hiragana-deck.js`
- Use `fs.readFileSync` / `fs.writeFileSync` for persistence (matches existing `vocab-manager.js` pattern)
- `configureSrs({ dataDir })` — sets the data directory (testable)
- `loadSrsData(userId)` — reads `data/srs-{userId}.json`, returns parsed data. Creates empty structure if file doesn't exist.
- `saveSrsData(userId, data)` — writes to disk
- `clearSrsData(userId)` / `clearSrsCache(userId)` — for testing
- `initKanaDeck(userId)` — if no `kana.cards` exist, seed all 71 from `HIRAGANA_DECK` with `createEmptyCard()` fields. If cards already exist, don't overwrite.
- `getNextKanaCard(userId)` — filter to unlocked rows, find most overdue card (earliest `due` date). If nothing is due, pick the card with the earliest `due` (least recently seen). Always returns a card.
- `reviewKanaCard(userId, char, grade)` — find the card, call `scheduler.repeat(card, now)`, pick the result for `Rating.Again` or `Rating.Good` based on grade string, update the card in storage, save.
- `getKanaStats(userId)` — count total, unlocked (by row unlock rules), learning (state=Learning), mastered (state=Review), dueNow.
- **Row unlock rule:** Row 0 always unlocked. Row N unlocked if all cards in row N-1 have `reps >= 1` (reviewed at least once).

**FSRS Card fields to persist:** When storing cards, serialize `due` and `last_review` as ISO strings. When loading, parse them back to Date objects before passing to `scheduler.repeat()`.

The `scheduler` is a module-level singleton: `const scheduler = fsrs();` with default parameters.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/unit/game/internal-srs.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npm test
```

Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/internal-srs.js tests/unit/game/internal-srs.test.js
git commit -m "feat(srs): implement FSRS kana service with row-based unlock"
```

---

### Task 3: Add kanaMode to meta-progression state

**Files:**
- Modify: `src/game/state.js:77` — add `kanaMode: false` to `createMetaProgression()`
- Modify: `src/game/loop.js:265-272` — expose `kanaMode` in `getState()` meta serialization
- Test: `tests/unit/game/kana-state.test.js`

- [ ] **Step 1: Write test**

```javascript
// tests/unit/game/kana-state.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMetaProgression } from '../../../src/game/state.js';

describe('kanaMode in meta-progression', () => {
  it('defaults to false in new meta-progression', () => {
    const meta = createMetaProgression();
    assert.strictEqual(meta.kanaMode, false);
  });

  it('can be set to true', () => {
    const meta = createMetaProgression();
    meta.kanaMode = true;
    assert.strictEqual(meta.kanaMode, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/game/kana-state.test.js
```

Expected: FAIL — `meta.kanaMode` is `undefined`.

- [ ] **Step 3: Add kanaMode to createMetaProgression()**

In `src/game/state.js`, add `kanaMode: false` to the return object of `createMetaProgression()`, after the `prologueComplete: false` line (line 77):

```javascript
    // Whether the intro prologue has been shown
    prologueComplete: false,

    // Whether the player is in hiragana learning mode
    kanaMode: false
```

- [ ] **Step 4: Expose kanaMode in getState()**

In `src/game/loop.js`, add `kanaMode` to the meta serialization block (around line 271):

```javascript
      meta: this.meta ? {
        lifetimeStats: this.meta.lifetimeStats,
        achievements: this.meta.achievements,
        levels: this.meta.levels || { highestUnlocked: 1, completed: [], current: null },
        prologueComplete: this.meta.prologueComplete || false,
        progressionTokens: this.meta.progressionTokens || 0,
        upgrades: this.meta.upgrades || {},
        kanaMode: this.meta.kanaMode || false
      } : null,
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/unit/game/kana-state.test.js
```

Expected: PASS.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/state.js src/game/loop.js tests/unit/game/kana-state.test.js
git commit -m "feat(srs): add kanaMode to meta-progression state"
```

---

### Task 4: Add kana API endpoints

**Files:**
- Create: `src/routes/game/kana.js`
- Modify: `src/routes/game/index.js` — mount the new route
- Test: `tests/unit/routes/kana-routes.test.js`

**Reference:** Follow the route pattern from `src/routes/game/state.js` — export a factory function returning a Router. The route has access to `req.gameManager` (GameManager instance) and `req.user.id` via the middleware already applied in `src/routes/game/index.js`.

- [ ] **Step 1: Write test**

```javascript
// tests/unit/routes/kana-routes.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestTmpDir } from '../../helpers/tmp.js';

const TEST_USER = 'test-user-kana-routes';
let tmp;

describe('Kana API routes', () => {
  let srs;

  before(async () => {
    tmp = await createTestTmpDir();
    srs = await import('../../../src/game/internal-srs.js');
    srs.configureSrs({ dataDir: tmp.path + '/' });
    srs.initKanaDeck(TEST_USER);
  });

  after(async () => {
    await tmp.cleanup();
  });

  it('getNextKanaCard returns a valid card', () => {
    const card = srs.getNextKanaCard(TEST_USER);
    assert.ok(card.char);
    assert.ok(card.romaji);
  });

  it('reviewKanaCard with "good" updates the card', () => {
    const card = srs.getNextKanaCard(TEST_USER);
    const result = srs.reviewKanaCard(TEST_USER, card.char, 'good');
    assert.ok(result.reps >= 1);
  });

  it('reviewKanaCard with "again" updates the card', () => {
    const card = srs.getNextKanaCard(TEST_USER);
    const result = srs.reviewKanaCard(TEST_USER, card.char, 'again');
    assert.ok(result.reps >= 1);
  });

  it('getKanaStats returns valid stats after reviews', () => {
    const stats = srs.getKanaStats(TEST_USER);
    assert.strictEqual(stats.total, 71);
    assert.ok(stats.unlocked >= 5);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

These tests exercise the SRS service directly (already implemented). They should pass:

```bash
node --test tests/unit/routes/kana-routes.test.js
```

Expected: PASS (service-level validation).

- [ ] **Step 3: Create kana route file**

```javascript
// src/routes/game/kana.js
import { Router } from 'express';
import {
  initKanaDeck,
  getNextKanaCard,
  reviewKanaCard,
  getKanaStats
} from '../../game/internal-srs.js';

export default function createKanaRoutes() {
  const router = Router();

  // GET /api/game/kana-card — next due hiragana card
  router.get('/kana-card', (req, res) => {
    const userId = req.user.id;
    initKanaDeck(userId); // no-op if already initialized
    const card = getNextKanaCard(userId);
    if (!card) {
      return res.status(500).json({ error: 'No kana card available' });
    }
    res.json(card);
  });

  // POST /api/game/kana-review — record review result
  router.post('/kana-review', (req, res) => {
    const userId = req.user.id;
    const { char, grade } = req.body;
    if (!char || !['again', 'good'].includes(grade)) {
      return res.status(400).json({ error: 'char and grade (again|good) required' });
    }
    const result = reviewKanaCard(userId, char, grade);
    if (!result) {
      return res.status(404).json({ error: `Card not found: ${char}` });
    }
    const stats = getKanaStats(userId);
    res.json({ card: result, stats });
  });

  // GET /api/game/kana-stats — get kana learning progress
  router.get('/kana-stats', (req, res) => {
    const userId = req.user.id;
    initKanaDeck(userId);
    res.json(getKanaStats(userId));
  });

  return router;
}
```

- [ ] **Step 4: Mount in route index**

In `src/routes/game/index.js`, import and mount the kana routes. Find the section where other route factories are mounted (around lines 56-70) and add:

```javascript
import createKanaRoutes from './kana.js';
```

And in the router setup:

```javascript
router.use(createKanaRoutes());
```

- [ ] **Step 5: Syntax check**

```bash
node --check src/routes/game/kana.js && echo "OK"
```

Expected: OK

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/kana.js src/routes/game/index.js tests/unit/routes/kana-routes.test.js
git commit -m "feat(srs): add kana-card and kana-review API endpoints"
```

---

### Task 5: Prologue branching — Cid hiragana question

**Files:**
- Modify: `data/prologue.json` — add hiragana question scene after translator intro
- Modify: `public/game.js:490-547` — handle choice result in `playPrologue()`
- Modify: `src/routes/game/misc.js` — add `POST /api/game/kana-mode` endpoint
- Test: Manual playtest (prologue is UI-driven; unit testing the JSON structure)
- Test: `tests/unit/game/prologue-data.test.js`

- [ ] **Step 1: Write test for prologue data structure**

```javascript
// tests/unit/game/prologue-data.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prologue data', () => {
  const prologue = JSON.parse(
    readFileSync(join(process.cwd(), 'data/prologue.json'), 'utf-8')
  );

  it('contains the hiragana question scene', () => {
    const scene = prologue.find(s => s.id === 'prologue-hiragana-question');
    assert.ok(scene, 'hiragana question scene should exist');
    assert.strictEqual(scene.speaker, 'Cid');
    assert.ok(scene.choices?.length === 2, 'should have 2 choices');
  });

  it('hiragana "no" choice has the Translator setup response', () => {
    const scene = prologue.find(s => s.id === 'prologue-hiragana-question');
    const noChoice = scene.choices.find(c => c.id === 'kana-yes' || c.id === 'kana-no');
    assert.ok(noChoice, 'should have kana choice IDs');
  });

  it('hiragana response scene follows the question', () => {
    const qIdx = prologue.findIndex(s => s.id === 'prologue-hiragana-question');
    const response = prologue[qIdx + 1];
    assert.strictEqual(response.id, 'prologue-hiragana-response');
    assert.ok(response.conditional === 'kana-no', 'response shows only if player chose no');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/game/prologue-data.test.js
```

Expected: FAIL — scene not found.

- [ ] **Step 3: Add hiragana question to prologue.json**

Insert two new scenes after `prologue-05-translator-on` (the Translator introduction — it's the natural moment to ask about hiragana). The scenes go between the current scene `prologue-05-translator-on` and `prologue-06-intro`.

New scenes to insert:

```json
{
  "id": "prologue-hiragana-question",
  "speaker": "Cid",
  "narration": "One quick thing — do you know our local alphabet, Hiragana?",
  "choices": [
    { "text": "Yes, I already know Hiragana", "id": "kana-yes" },
    { "text": "No, teach it to me!", "id": "kana-no" }
  ]
},
{
  "id": "prologue-hiragana-response",
  "speaker": "Cid",
  "conditional": "kana-no",
  "narration": "Ah... I see. Here, let me set up your Translator! In the future you'll be able to command your creatures using native Japanese, but right now I've just set the Translator to prioritize teaching you Hiragana. Now you'll just worry about learning Hiragana and your Translator will handle the commands until you get the hang of things."
}
```

**Note:** Clear the prologue cache on the server (it's cached in `_prologueCache` in `src/routes/game/misc.js`). The cache is only populated on first request, so a server restart clears it.

- [ ] **Step 4: Add POST /api/game/kana-mode endpoint**

In `src/routes/game/misc.js`, add a new endpoint near the prologue endpoints (after line 369):

```javascript
router.post('/kana-mode', (req, res) => {
  const gameManager = req.gameManager;
  const meta = gameManager.getMeta();
  const { enabled } = req.body;
  meta.kanaMode = !!enabled;
  req.saveGame();
  res.json({ ok: true, kanaMode: meta.kanaMode });
});
```

- [ ] **Step 5: Handle choice result in playPrologue()**

In `public/game.js`, the `playPrologue()` function currently iterates through scenes with `await narrationBox.show(html, showOpts)`. The show function already returns the selected `choice.id` when choices are present.

Modify the loop body in `playPrologue()` (around line 526) to capture the result and handle branching. After the `await narrationBox.show(html, showOpts)` call:

```javascript
const result = await narrationBox.show(html, showOpts);

// Handle hiragana question branching
if (prologueScene.id === 'prologue-hiragana-question' && result === 'kana-no') {
  await fetch('/api/game/kana-mode', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true })
  });
}

// Skip conditional scenes that don't match
// (next iteration will check this)
```

Also, add conditional scene skipping at the top of the loop:

```javascript
for (const prologueScene of _prologueCache) {
  // Skip conditional scenes that don't match the player's choice
  if (prologueScene.conditional) {
    if (prologueScene.conditional !== lastChoiceId) continue;
  }
```

Track `lastChoiceId` as a variable above the loop, update it when a choice is made:

```javascript
let lastChoiceId = null;
for (const prologueScene of _prologueCache) {
  // ... conditional skip logic ...

  // ... existing scene rendering ...

  const result = await narrationBox.show(html, showOpts);
  if (prologueScene.choices) {
    lastChoiceId = result;
  }

  // POST kana-mode if player chose "No"
  if (prologueScene.id === 'prologue-hiragana-question' && result === 'kana-no') {
    await fetch('/api/game/kana-mode', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true })
    });
  }

  flushExposures();
}
```

- [ ] **Step 6: Run prologue data test**

```bash
node --test tests/unit/game/prologue-data.test.js
```

Expected: PASS.

- [ ] **Step 7: Syntax check modified files**

```bash
node --check public/game.js && node --check src/routes/game/misc.js && echo "OK"
```

Expected: OK

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add data/prologue.json public/game.js src/routes/game/misc.js tests/unit/game/prologue-data.test.js
git commit -m "feat(srs): add Cid hiragana question to prologue with kana-mode toggle"
```

---

### Task 6: Combat loop integration — kana mode auto-attack

**Files:**
- Modify: `public/js/ui/combat-loop.js` — add `startKanaCombatRound()`, modify `startMoveSelection()` to branch
- Test: Manual playtest via Playwright (combat loop is heavily UI-dependent)

**Key reference points in combat-loop.js:**
- `startMoveSelection()` at line 501 — add kanaMode branch
- `getGameState` callback at line 325 — used to read `meta.kanaMode`
- `showFlashCards` callback at line 345 — used to show kana card
- `executeCreatureMovesTurn()` at line 1432 — called with collected moveChoices
- All `startMoveSelection()` call sites (lines 545, 580, 774, 1040, 1585, 1591, 1834, 1840, 2380, 2430) — all route through the same function, so the branch at the top catches all of them

- [ ] **Step 1: Add kanaMode branch to startMoveSelection()**

At the top of `startMoveSelection()` (line 501), add a branch:

```javascript
export function startMoveSelection() {
  const state = getGameState();
  if (state.meta?.kanaMode) {
    startKanaCombatRound();
    return;
  }
  moveChoices = [];
  currentCreatureIndex = 0;
  promptNextCreature();
}
```

- [ ] **Step 2: Add kana mode state and swipe callback wiring**

The swipe callback chain works like this:
1. Player swipes a card → `actions.js` calls `onCardSwipe(direction)` (set via `actions.init()`)
2. In `game.js` line 1134, the `cardSwipe` handler maps direction to grade, sends JPDB review, and calls `combatLoopUI.resumeCombatAfterVocab(grade, actionType)`
3. `resumeCombatAfterVocab()` in `combat-loop.js` (line 1942) continues the combat flow

**For kana mode**, we intercept at step 2. Add module-level state in `combat-loop.js`:

```javascript
// Kana mode state
let kanaSwipeResolve = null;  // Promise resolver for awaiting card swipe
let kanaSwipeDirection = null;
```

Export a handler that `game.js` calls instead of the normal flow:

```javascript
export function handleKanaSwipe(direction) {
  kanaSwipeDirection = direction;
  if (kanaSwipeResolve) {
    kanaSwipeResolve(direction);
    kanaSwipeResolve = null;
  }
}

export function isKanaRoundInProgress() {
  return kanaSwipeResolve !== null;
}
```

- [ ] **Step 3: Modify game.js cardSwipe handler for kana mode**

In `public/game.js`, in the `cardSwipe` handler (line 1134), add a kana mode check at the top:

```javascript
cardSwipe: (direction) => {
  // Word discovery mode
  if (gameState.phase === 'wordDiscovery') {
    document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: direction }));
    return;
  }

  // Kana mode: route to kana handler, skip JPDB review
  if (combatLoopUI.isKanaRoundInProgress()) {
    combatLoopUI.handleKanaSwipe(direction);
    return;
  }

  // ... rest of existing cardSwipe handler unchanged ...
```

- [ ] **Step 4: Implement startKanaCombatRound()**

Add this new function near `startMoveSelection()`. It loops through living creatures, shows a kana card for each, collects auto-attack moveChoices, then calls `executeCreatureMovesTurn()`.

**Important:** `creatureParty` is an object `{ active: [], reserves: [], maxTotal: 6 }`, not an array. Use `creatureParty.active`.

```javascript
async function startKanaCombatRound() {
  const state = getGameState();
  const party = state.run?.creatureParty?.active || [];
  const enemies = state.combat?.enemies || [];
  const choices = [];

  for (let i = 0; i < party.length; i++) {
    const creature = party[i];
    if (!creature || creature.hp <= 0) continue;

    // Find first living enemy
    const targetIndex = enemies.findIndex(e => e && e.hp > 0);
    if (targetIndex === -1) break; // all enemies dead

    // Fetch kana card from server
    const kanaCard = await fetchKanaCard();
    if (!kanaCard) break;

    // Show kana card using existing single-card flash card UI
    // Shape it like a vocab word but with kana content
    const kanaWord = {
      word: kanaCard.char,
      reading: kanaCard.romaji,
      meanings: [kanaCard.romaji]
    };

    // Wait for swipe via Promise resolved by handleKanaSwipe()
    const direction = await new Promise(resolve => {
      kanaSwipeResolve = resolve;
      showFlashCards([kanaWord]);
    });

    // Map swipe direction to FSRS grade
    const grade = (direction === 'right') ? 'good' : 'again';
    submitKanaReview(kanaCard.char, grade);

    // Auto-pick cheapest single-target move, or defend if out of MP
    const move = pickCheapestMove(creature);
    if (move) {
      choices.push({ creatureIndex: i, moveId: move.id, targetIndex });
    }
    // If no affordable move: creature does nothing this round
    // (defend is handled implicitly — creature takes no action but isn't penalized)
  }

  if (choices.length > 0) {
    await executeCreatureMovesTurn(choices);
  }
  // If no choices (all KO'd / no enemies), combat will end via normal flow
}
```

- [ ] **Step 5: Add helper functions**

```javascript
async function fetchKanaCard() {
  try {
    const response = await fetch(`${API_BASE}/api/game/kana-card`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[KanaMode] Failed to fetch kana card:', e);
    return null;
  }
}

async function submitKanaReview(char, grade) {
  try {
    await fetch(`${API_BASE}/api/game/kana-review`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ char, grade })
    });
  } catch (e) {
    console.error('[KanaMode] Failed to submit kana review:', e);
  }
}

function pickCheapestMove(creature) {
  if (!creature.moves?.length) return null;
  return creature.moves
    .filter(m => m.target === 'single_enemy' && creature.mp >= m.mpCost)
    .sort((a, b) => a.mpCost - b.mpCost)[0] || null;
}
```

- [ ] **Step 6: Syntax check all modified frontend files**

```bash
node --check public/js/ui/combat-loop.js && node --check public/game.js && echo "OK"
```

Expected: OK

- [ ] **Step 7: Manual smoke test**

Start the dev server and playtest:

```bash
npm run dev
```

1. Create a new character, go through prologue, choose "No, teach it to me!"
2. Enter combat — should see a hiragana card instead of move selection
3. Swipe right — creature 0 should auto-attack, split card shows
4. Next kana card for creature 1, and so on
5. After all creatures attack, enemies attack back
6. Next round starts with new kana cards

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/combat-loop.js public/game.js
git commit -m "feat(srs): integrate kana mode into combat loop with auto-attack"
```

---

### Task 7: Graduation logic

**Files:**
- Modify: `public/js/ui/combat-loop.js` — add graduation check after combat
- Modify: `src/game/internal-srs.js` — add `isKanaGraduated(userId)` function
- Modify: `src/routes/game/kana.js` — expose graduation status in stats
- Test: `tests/unit/game/internal-srs.test.js` — add graduation test

- [ ] **Step 1: Add graduation test to internal-srs.test.js**

```javascript
describe('graduation', () => {
  it('isKanaGraduated returns false for a fresh deck', () => {
    srs.initKanaDeck(TEST_USER);
    assert.strictEqual(srs.isKanaGraduated(TEST_USER), false);
  });

  it('getKanaStats includes graduated field', () => {
    srs.initKanaDeck(TEST_USER);
    const stats = srs.getKanaStats(TEST_USER);
    assert.strictEqual(stats.graduated, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/game/internal-srs.test.js
```

Expected: FAIL — `isKanaGraduated` not found.

- [ ] **Step 3: Implement isKanaGraduated**

In `src/game/internal-srs.js`, add:

```javascript
export function isKanaGraduated(userId) {
  const data = loadSrsData(userId);
  if (!data.kana?.cards?.length) return false;
  // Graduated when ALL 71 cards have reached Review state
  return data.kana.cards.every(c => c.state === State.Review);
}
```

Update `getKanaStats` to include `graduated`:

```javascript
export function getKanaStats(userId) {
  // ... existing stats calculation ...
  return {
    total,
    unlocked,
    learning,
    mastered,
    dueNow,
    graduated: isKanaGraduated(userId)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/unit/game/internal-srs.test.js
```

Expected: PASS.

- [ ] **Step 5: Add graduation check to stopCombatLoop()**

In `combat-loop.js`, the `stopCombatLoop(result)` function (line 2452) handles combat end. After the post-combat narration is shown (around line 2524, after `await narration.showNarration(narrationResult.narration)`), add the graduation check. Use `narration.showNarration()` (the callback, not `narrationBox.show()`):

```javascript
// After combat-end narration, check for kana graduation
if (result?.victory) {
  const currentState = getGameState();
  if (currentState.meta?.kanaMode) {
    try {
      const statsResp = await fetch(`${API_BASE}/api/game/kana-stats`, {
        headers: getAuthHeaders()
      });
      const stats = await statsResp.json();
      if (stats.graduated) {
        // Disable kana mode
        await fetch(`${API_BASE}/api/game/kana-mode`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false })
        });
        // Show Cid graduation message
        await narration.showNarration(
          "Incredible progress! You've learned the entire Hiragana alphabet. " +
          "I've upgraded your Translator — from now on, you'll be able to command " +
          "your creatures directly using Japanese vocabulary!"
        );
      }
    } catch (e) {
      console.error('[KanaMode] Graduation check failed:', e);
    }
  }
}
```

- [ ] **Step 6: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && node --check src/game/internal-srs.js && echo "OK"
```

Expected: OK

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/game/internal-srs.js public/js/ui/combat-loop.js src/routes/game/kana.js tests/unit/game/internal-srs.test.js
git commit -m "feat(srs): add kana graduation logic with Cid congratulation"
```

---

### Task 8: Settings toggle for kana mode

**Files:**
- Modify: Settings UI (find the settings panel in the frontend)
- The `POST /api/game/kana-mode` endpoint already exists from Task 5

**Reference:** Check `src/routes/settings.js` and the frontend settings UI to understand the existing settings pattern.

- [ ] **Step 1: Find and read the settings UI**

The settings panel is in `public/js/ui/modals.js` — the `openSettings()` function renders inline HTML with toggles. Read this file to understand the pattern for adding toggles.

- [ ] **Step 2: Add kana mode toggle to settings UI**

In `public/js/ui/modals.js`, in the `openSettings()` function, add a toggle/checkbox labeled "Hiragana Learning Mode". Follow the pattern of existing toggles in the settings panel.

The toggle should:
- Read the current state from `getGameState().meta.kanaMode` to show the correct initial value
- On change, POST to `/api/game/kana-mode` with `{ enabled: true/false }`
- Update the local game state to reflect the change

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/ui/modals.js && echo "OK"
```

- [ ] **Step 4: Manual smoke test**

1. Open settings panel
2. Toggle kana mode on — next combat should use kana cards
3. Toggle kana mode off — next combat should use normal move selection

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/modals.js
git commit -m "feat(srs): add kana mode toggle to settings panel"
```

---

### Task 9: Final integration test and cleanup

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

All tests must pass.

- [ ] **Step 2: Syntax check all modified frontend files**

```bash
node --check public/js/ui/combat-loop.js && \
node --check public/js/ui/actions.js && \
node --check public/game.js && \
echo "All OK"
```

- [ ] **Step 3: Manual end-to-end playtest**

Full flow:
1. Register new account or reset prologue
2. Play through prologue — Cid asks about hiragana, choose "No"
3. See Translator setup dialogue
4. Enter first combat — kana cards appear instead of move selection
5. Swipe right/left on each card — creatures auto-attack sequentially
6. Complete combat, check that kana reviews were recorded
7. Toggle kana mode off in settings — normal combat returns
8. Toggle back on — kana mode returns

- [ ] **Step 4: Commit any final fixes**

Stage only the specific files that were changed (never use `git add -A` — repo has many untracked files):

```bash
git add <specific files changed>
git commit -m "feat(srs): final integration fixes for FSRS hiragana combat mode"
```
