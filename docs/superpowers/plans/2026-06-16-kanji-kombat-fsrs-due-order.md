# Kanji Kombat FSRS Due Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kanji Kombat choose the earliest FSRS-due eligible script card before introducing any new hiragana, katakana, or kanji cards.

**Architecture:** Keep FSRS grading unchanged and fix only script-card selection. Add focused script scheduler helpers in `src/game/script-srs.js`, then have `chooseNextScriptWork()` consume a global eligible due queue while retaining curriculum-ordered new-card introductions.

**Tech Stack:** Node.js ES modules, `node:test`, `ts-fsrs@5.2.3`, existing JSON-backed SRS storage.

---

## File Structure

- Modify `src/game/script-srs.js`: add reusable helpers for eligible script types, deterministic due sorting, global due queues, and curriculum-ordered new-card queues.
- Modify `src/game/services/kanji-kombat-service.js`: replace active-type-only scheduling with global due-first scheduling and update completion-buffer authority checks.
- Modify `tests/unit/game/script-srs.test.js`: cover due sorting, onboarding filters, and curriculum new-card selection at the script scheduler boundary.
- Modify `tests/unit/game/kanji-kombat-deck.test.js`: cover end-to-end Kanji Kombat prompt selection, prompt-buffer ordering, skip preferences, and changed due-before-intro behavior.

## Behavior Changes To Preserve Deliberately

- Any eligible due card blocks new-card introductions, even if the intro cadence interval has fired. This is intentional: FSRS `due <= now` is the scheduling source of truth.
- Learning-step cards due minutes ago are treated exactly like other due cards and should preempt new-card introductions. Cards due a few minutes in the future are not due yet.
- `reviewsSinceIntro`, `nextIntroAfter`, and `rollIntroInterval()` become less important after removing due-plus-intro cadence, but they are left in this patch because existing state payloads, prompt-buffer planning, and no-due discovery flow still write them. Cleanup belongs in a separate refactor.
- Daily-complete reporting should preserve the last real script deck when available. Do not overwrite completion state with `hiragana` just because it is the first eligible type.

## Task 1: Add Script Scheduler Tests

**Files:**
- Modify: `tests/unit/game/script-srs.test.js`
- Test: `tests/unit/game/script-srs.test.js`

- [ ] **Step 1: Import the new helper names before they exist**

Change the existing import from `../../../src/game/script-srs.js` to include the new exports:

```javascript
import {
  ensureScriptDeckSeeded,
  getActiveScriptType,
  getDueScriptCards,
  getDueScriptCardsForTypes,
  getEligibleScriptTypes,
  getNewScriptCards,
  getNextNewScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  recordScriptIntro,
} from '../../../src/game/script-srs.js';
```

- [ ] **Step 2: Add scheduler boundary tests**

Append these tests inside the existing `describe('script-srs', () => { ... })` block:

```javascript
  it('returns eligible script types with onboarding kana skips applied', () => {
    assert.deepEqual(getEligibleScriptTypes({ knowsHiragana: false, knowsKatakana: false }), [
      'hiragana',
      'katakana',
      'kanji',
    ]);
    assert.deepEqual(getEligibleScriptTypes({ knowsHiragana: true, knowsKatakana: false }), [
      'katakana',
      'kanji',
    ]);
    assert.deepEqual(getEligibleScriptTypes({ knowsHiragana: false, knowsKatakana: true }), [
      'hiragana',
      'kanji',
    ]);
    assert.deepEqual(getEligibleScriptTypes({ knowsHiragana: true, knowsKatakana: true }), [
      'kanji',
    ]);
  });

  it('returns due script cards across requested types in earliest due order', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    for (const card of data.script.cards) {
      card.reps = 0;
      card.state = State.New;
      card.due = new Date('2099-01-01T00:00:00Z');
    }

    const hiragana = data.script.cards.find(card => card.id === 'hiragana:あ');
    const katakana = data.script.cards.find(card => card.id === 'katakana:イ');
    const kanji = data.script.cards.find(card => card.id === 'kanji:人');
    hiragana.reps = 1;
    hiragana.state = State.Review;
    hiragana.due = new Date('2026-05-30T00:00:00Z');
    katakana.reps = 1;
    katakana.state = State.Review;
    katakana.due = new Date('2026-05-01T00:00:00Z');
    kanji.reps = 1;
    kanji.state = State.Review;
    kanji.due = new Date('2026-05-15T00:00:00Z');
    saveSrsData(userId, data);

    const due = getDueScriptCardsForTypes(
      userId,
      ['hiragana', 'katakana', 'kanji'],
      new Date('2026-05-31T00:00:00Z')
    );

    assert.deepEqual(due.map(card => card.id), [
      'katakana:イ',
      'kanji:人',
      'hiragana:あ',
    ]);
  });

  it('uses curriculum tie-breakers when due dates match exactly', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    for (const card of data.script.cards) {
      card.reps = 0;
      card.state = State.New;
      card.due = new Date('2099-01-01T00:00:00Z');
    }

    const cards = [
      data.script.cards.find(card => card.id === 'kanji:人'),
      data.script.cards.find(card => card.id === 'katakana:ア'),
      data.script.cards.find(card => card.id === 'hiragana:あ'),
    ];
    for (const card of cards) {
      card.reps = 1;
      card.state = State.Review;
      card.due = new Date('2026-05-01T00:00:00Z');
    }
    saveSrsData(userId, data);

    const due = getDueScriptCardsForTypes(
      userId,
      ['hiragana', 'katakana', 'kanji'],
      new Date('2026-05-31T00:00:00Z')
    );

    assert.deepEqual(due.slice(0, 3).map(card => card.id), [
      'hiragana:あ',
      'katakana:ア',
      'kanji:人',
    ]);
  });

  it('returns new script cards from the first non-skipped type with unreviewed cards', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(card => card.type === 'hiragana')) {
      card.reps = 1;
      card.state = State.Review;
    }
    saveSrsData(userId, data);

    assert.equal(getNextNewScriptCards(userId, { knowsHiragana: false, knowsKatakana: false })[0].id, 'katakana:ア');
    assert.equal(getNextNewScriptCards(userId, { knowsHiragana: true, knowsKatakana: false })[0].id, 'katakana:ア');
    assert.equal(getNextNewScriptCards(userId, { knowsHiragana: false, knowsKatakana: true })[0].id, 'kanji:人');
  });
```

- [ ] **Step 3: Run the scheduler tests and verify they fail for missing exports**

Run:

```bash
node --test tests/unit/game/script-srs.test.js
```

Expected: FAIL with an import error mentioning at least one of `getDueScriptCardsForTypes`, `getEligibleScriptTypes`, or `getNextNewScriptCards`.

- [ ] **Step 4: Commit the failing tests**

```bash
/usr/bin/git add tests/unit/game/script-srs.test.js
/usr/bin/git commit -m "test: cover script FSRS due ordering"
```

## Task 2: Implement Script Scheduler Helpers

**Files:**
- Modify: `src/game/script-srs.js`
- Test: `tests/unit/game/script-srs.test.js`

- [ ] **Step 1: Add deterministic sorting and eligibility helpers**

In `src/game/script-srs.js`, after `export const DAILY_NEW_LIMIT = 20;`, add:

```javascript
const SCRIPT_TYPE_ORDER = new Map(SCRIPT_CARD_TYPES.map((type, index) => [type, index]));

function dueTime(card) {
  const due = card.due instanceof Date ? card.due : new Date(card.due);
  return due.getTime();
}

function scriptTypeOrder(type) {
  return SCRIPT_TYPE_ORDER.get(type) ?? SCRIPT_TYPE_ORDER.size;
}

function compareScriptCardsByDue(a, b) {
  return dueTime(a) - dueTime(b)
    || scriptTypeOrder(a.type) - scriptTypeOrder(b.type)
    || (a.sortIndex || 0) - (b.sortIndex || 0)
    || String(a.id).localeCompare(String(b.id));
}

function compareScriptCardsByCurriculum(a, b) {
  return scriptTypeOrder(a.type) - scriptTypeOrder(b.type)
    || (a.sortIndex || 0) - (b.sortIndex || 0)
    || String(a.id).localeCompare(String(b.id));
}

export function getEligibleScriptTypes(onboarding = {}) {
  return SCRIPT_CARD_TYPES.filter(type => {
    if (type === 'hiragana' && onboarding?.knowsHiragana === true) return false;
    if (type === 'katakana' && onboarding?.knowsKatakana === true) return false;
    return true;
  });
}
```

- [ ] **Step 2: Add global due and next-new selectors**

Replace the existing `getDueScriptCards()` and `getNewScriptCards()` definitions with:

```javascript
export function getDueScriptCards(userId, type = getActiveScriptType(userId), now = new Date()) {
  return getScriptCards(userId, type)
    .filter(card => {
      if ((card.reps || 0) === 0) return false;
      return dueTime(card) <= now.getTime();
    })
    .sort(compareScriptCardsByDue);
}

export function getDueScriptCardsForTypes(userId, types = SCRIPT_CARD_TYPES, now = new Date()) {
  const allowedTypes = new Set(types);
  return getScriptCards(userId)
    .filter(card => allowedTypes.has(card.type))
    .filter(card => {
      if ((card.reps || 0) === 0) return false;
      return dueTime(card) <= now.getTime();
    })
    .sort(compareScriptCardsByDue);
}

export function getNewScriptCards(userId, type = getActiveScriptType(userId)) {
  return getScriptCards(userId, type)
    .filter(card => (card.reps || 0) === 0)
    .sort(compareScriptCardsByCurriculum);
}

export function getNextNewScriptCards(userId, onboarding = {}) {
  for (const type of getEligibleScriptTypes(onboarding)) {
    const cards = getNewScriptCards(userId, type);
    if (cards.length > 0) return cards;
  }
  return [];
}
```

- [ ] **Step 3: Run scheduler tests and verify they pass**

Run:

```bash
node --test tests/unit/game/script-srs.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit the scheduler helpers**

```bash
/usr/bin/git add src/game/script-srs.js
/usr/bin/git commit -m "fix: add script FSRS due queue helpers"
```

## Task 3: Add Kanji Kombat Due-First Controller Tests

**Files:**
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`
- Test: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Add a local helper for marking cards reviewed**

Inside `describe('kanji-kombat deck controller', () => { ... })`, after `summarizePrompts()`, add:

```javascript
  function markCardsReviewed(cards, { due = '2099-01-01T00:00:00Z' } = {}) {
    for (const card of cards) {
      card.reps = Math.max(1, card.reps || 0);
      card.state = State.Review;
      card.due = new Date(due);
    }
  }
```

- [ ] **Step 2: Add due-first selection tests**

Append these tests near the existing due-card tests:

```javascript
  it('chooses the earliest due script card across all non-skipped script types', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards) {
      card.reps = 0;
      card.state = State.New;
      card.due = new Date('2099-01-01T00:00:00Z');
    }

    const hiragana = data.script.cards.find(card => card.id === 'hiragana:あ');
    const katakana = data.script.cards.find(card => card.id === 'katakana:イ');
    const kanji = data.script.cards.find(card => card.id === 'kanji:人');
    hiragana.reps = 1;
    hiragana.state = State.Review;
    hiragana.due = new Date('2026-05-30T00:00:00Z');
    katakana.reps = 1;
    katakana.state = State.Review;
    katakana.due = new Date('2026-05-01T00:00:00Z');
    kanji.reps = 1;
    kanji.state = State.Review;
    kanji.due = new Date('2026-05-15T00:00:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.quiz.cardId, 'katakana:イ');
    assert.equal(work.card.type, 'katakana');
    assert.equal(state.report.scriptDeck, 'katakana');
  });

  it('keeps due hiragana eligible after all hiragana cards have reached Review', () => {
    const data = loadSrsData(userId);
    const hiragana = data.script.cards.filter(card => card.type === 'hiragana');
    markCardsReviewed(hiragana);
    data.script.cards.find(card => card.id === 'hiragana:あ').due = new Date('2026-05-01T00:00:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.quiz.cardId, 'hiragana:あ');
    assert.equal(state.report.scriptDeck, 'hiragana');
  });

  it('keeps due katakana eligible after all katakana cards have reached Review', () => {
    const data = loadSrsData(userId);
    markCardsReviewed(data.script.cards.filter(card => card.type === 'hiragana'));
    markCardsReviewed(data.script.cards.filter(card => card.type === 'katakana'));
    data.script.cards.find(card => card.id === 'katakana:ア').due = new Date('2026-05-01T00:00:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.quiz.cardId, 'katakana:ア');
    assert.equal(state.report.scriptDeck, 'katakana');
  });

  it('honors onboarding skips while choosing due cards', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards) {
      card.reps = 0;
      card.state = State.New;
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    const hiragana = data.script.cards.find(card => card.id === 'hiragana:あ');
    const katakana = data.script.cards.find(card => card.id === 'katakana:ア');
    hiragana.reps = 1;
    hiragana.state = State.Review;
    hiragana.due = new Date('2026-05-01T00:00:00Z');
    katakana.reps = 1;
    katakana.state = State.Review;
    katakana.due = new Date('2026-05-15T00:00:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: true, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.quiz.cardId, 'katakana:ア');
  });

  it('a learning-step card due minutes ago preempts new-card introductions', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards) {
      card.reps = 0;
      card.state = State.New;
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    const learningCard = data.script.cards.find(card => card.id === 'hiragana:あ');
    learningCard.reps = 1;
    learningCard.state = State.Learning;
    learningCard.due = new Date('2026-05-31T00:03:00Z');
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    state.reviewsSinceIntro = state.nextIntroAfter;
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:05:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.quiz.cardId, 'hiragana:あ');
  });

  it('introduces new cards in curriculum order only after no eligible cards are due', () => {
    const data = loadSrsData(userId);
    markCardsReviewed(data.script.cards.filter(card => card.type === 'hiragana'));
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'intro');
    assert.equal(work.card.id, 'katakana:ア');
    assert.equal(state.report.scriptDeck, 'katakana');
  });
```

- [ ] **Step 3: Add a prompt-buffer ordering regression test**

Append this test near the existing prompt-buffer tests:

```javascript
  it('fills the prompt buffer in earliest due order without duplicate due cards', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards) {
      card.reps = 0;
      card.state = State.New;
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    const dueCards = [
      ['hiragana:あ', '2026-05-30T00:00:00Z'],
      ['katakana:ア', '2026-05-01T00:00:00Z'],
      ['kanji:人', '2026-05-15T00:00:00Z'],
    ];
    for (const [id, due] of dueCards) {
      const card = data.script.cards.find(candidate => candidate.id === id);
      card.reps = 1;
      card.state = State.Review;
      card.due = new Date(due);
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      target: 3,
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.deepEqual(prompts.map(prompt => prompt.cardId), [
      'katakana:ア',
      'kanji:人',
      'hiragana:あ',
    ]);
    assert.equal(new Set(prompts.map(prompt => prompt.cardId)).size, 3);
  });

  it('preserves the last real script deck when daily completion is already recorded', () => {
    const data = loadSrsData(userId);
    data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: DAILY_NEW_LIMIT, completed: true };
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    state.report.scriptDeck = 'katakana';
    const work = chooseNextScriptWork(userId, state, {
      onboarding: { knowsHiragana: false, knowsKatakana: false },
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'complete');
    assert.equal(state.report.scriptDeck, 'katakana');
  });
```

- [ ] **Step 4: Run Kanji Kombat deck tests and verify failures describe old behavior**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: FAIL. The new tests should fail because `chooseNextScriptWork()` still uses one active script type and static order.

- [ ] **Step 5: Commit the failing controller tests**

```bash
/usr/bin/git add tests/unit/game/kanji-kombat-deck.test.js
/usr/bin/git commit -m "test: cover Kanji Kombat earliest due selection"
```

## Task 4: Implement Due-First Kanji Kombat Selection

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Test: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Update imports**

In `src/game/services/kanji-kombat-service.js`, replace the `script-srs.js` import list with:

```javascript
import {
  DAILY_NEW_LIMIT,
  getDueScriptCardsForTypes,
  getEligibleScriptTypes,
  getNextNewScriptCards,
  getScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  markScriptDailyComplete,
  recordScriptIntro,
} from '../script-srs.js';
```

- [ ] **Step 2: Add local selection helpers**

After `function getEarlyReviewCards(cards, excludedIds = []) { ... }`, add:

```javascript
function getAnswerPoolForCard(userId, card) {
  return getScriptCards(userId, card.type);
}

function fallbackScriptDeck(eligibleTypes, dueCards, newCards) {
  return dueCards[0]?.type || newCards[0]?.type || eligibleTypes[0] || 'kanji';
}

function completionScriptDeck(userId, state, onboarding, eligibleTypes) {
  return state.report?.scriptDeck
    || getNextNewScriptCards(userId, onboarding)[0]?.type
    || eligibleTypes[eligibleTypes.length - 1]
    || 'kanji';
}
```

- [ ] **Step 3: Replace active-type scheduling in `chooseNextScriptWork()`**

Inside `chooseNextScriptWork()`, replace the block from `const activeType = ...` through `const allCards = ...` with:

```javascript
  const eligibleTypes = getEligibleScriptTypes(opts.onboarding);
  if (!Array.isArray(state.noDuePracticeQueue)) state.noDuePracticeQueue = [];
  state.endlessMode = state.endlessMode === true;

  const daily = opts.previewDailyState || getScriptDailyState(userId, state.localDate);
  if (daily.completed === true && !state.endlessMode) {
    state.report.completedDaily = true;
    state.report.scriptDeck = completionScriptDeck(userId, state, opts.onboarding, eligibleTypes);
    return { kind: 'complete' };
  }

  const dueCards = excludeCards(getDueScriptCardsForTypes(userId, eligibleTypes, now), excludedIds);
  const newCards = excludeCards(getNextNewScriptCards(userId, opts.onboarding), excludedIds);
  state.report.scriptDeck = fallbackScriptDeck(eligibleTypes, dueCards, newCards);
  const canIntroduce = !state.endlessMode
    && daily.completed !== true
    && daily.introducedCount < DAILY_NEW_LIMIT
    && newCards.length > 0;
  const allEligibleCards = getScriptCards(userId)
    .filter(card => eligibleTypes.includes(card.type));
```

- [ ] **Step 4: Remove due-plus-intro cadence branch**

Delete this branch from `chooseNextScriptWork()`:

```javascript
  if (dueCards.length > 0 && state.reviewsSinceIntro >= state.nextIntroAfter && canIntroduce) {
    state.noDueDiscoveryChainCount = 0;
    const card = newCards[0];
    return { kind: 'intro', card, source: 'reviewCadence' };
  }
```

Then replace the due-card branch with:

```javascript
  if (dueCards.length > 0) {
    state.noDueDiscoveryChainCount = 0;
    const card = dueCards[0];
    state.report.scriptDeck = card.type;
    const quiz = buildQuizForCard(card, getAnswerPoolForCard(userId, card), random);
    return { kind: 'quiz', card, quiz };
  }
```

- [ ] **Step 5: Update no-due practice and endless early-review lookups**

In the `while (state.noDuePracticeQueue.length > 0)` block, replace the card lookup and quiz creation with:

```javascript
    const card = allEligibleCards.find(candidate => candidate.id === practiceCardId);
    if (!card) continue;
    state.report.scriptDeck = card.type;
    const quiz = buildQuizForCard(card, getAnswerPoolForCard(userId, card), random);
    return { kind: 'quiz', card, quiz };
```

In the endless-mode branch, replace `allCards` with `allEligibleCards` and build the quiz from the selected card's own type:

```javascript
  if (state.endlessMode) {
    const earlyReviewCards = getEarlyReviewCards(allEligibleCards, excludedIds);
    if (earlyReviewCards.length > 0) {
      const card = earlyReviewCards[0];
      state.report.scriptDeck = card.type;
      const quiz = buildQuizForCard(card, getAnswerPoolForCard(userId, card), random);
      return { kind: 'quiz', card, quiz, source: 'earlyReview' };
    }
  }
```

- [ ] **Step 6: Update `isBufferedCompletionAuthoritative()`**

Replace the active-type checks inside `isBufferedCompletionAuthoritative()` with:

```javascript
  const eligibleTypes = getEligibleScriptTypes(opts.onboarding);
  const now = opts.now || new Date();
  const hasDueCards = getDueScriptCardsForTypes(userId, eligibleTypes, now).length > 0;
  const hasNewCards = getNextNewScriptCards(userId, opts.onboarding).length > 0;
  const hasPracticeCards = Array.isArray(state.noDuePracticeQueue) && state.noDuePracticeQueue.length > 0;
  return !hasDueCards && !hasNewCards && !hasPracticeCards;
```

- [ ] **Step 7: Run Kanji Kombat deck tests and note remaining expectation failures**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: Some new tests should pass. Existing tests that relied on review-cadence intros or state-only graduation may still fail and will be updated in Task 5.

- [ ] **Step 8: Commit the controller implementation**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js
/usr/bin/git commit -m "fix: choose Kanji Kombat prompts by earliest FSRS due"
```

## Task 5: Update Existing Tests for the New Scheduling Contract

**Files:**
- Modify: `tests/unit/game/script-srs.test.js`
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`
- Inspect and modify on fixture or expectation failure: `tests/integration/flows/kanji-kombat.test.js`

- [ ] **Step 1: Make state-only graduation fixtures realistic**

In any test setup that currently marks kana or kanji as `State.Review` to mean "already reviewed", also set `reps = 1`.

Use this replacement pattern in `tests/unit/game/script-srs.test.js`:

```javascript
    for (const card of data.script.cards.filter(c => c.type === 'hiragana' || c.type === 'katakana')) {
      card.reps = 1;
      card.state = State.Review;
      card.due = new Date('2099-01-01T00:00:00Z');
    }
```

Use the same pattern in `tests/unit/game/kanji-kombat-deck.test.js` for kanji-introduction tests that graduate kana before expecting `kanji:人`.

- [ ] **Step 2: Pre-audit the scheduling-sensitive existing tests**

Before editing expectations, inspect these existing tests because they are sensitive to the global due queue, no due-plus-intro cadence, or `State.Review` plus `reps` semantics:

- `tests/unit/game/script-srs.test.js`: `selects hiragana until all hiragana script cards are Review`
- `tests/unit/game/script-srs.test.js`: `returns new kanji in frequency order after hiragana and katakana graduate`
- `tests/unit/game/kanji-kombat-deck.test.js`: `resets intro spacing after a discovery so discoveries do not chain`
- `tests/unit/game/kanji-kombat-deck.test.js`: `introduces the first unlearned kanji by frequency order once kana are graduated`
- `tests/unit/game/kanji-kombat-deck.test.js`: `skips learned kanji and introduces the next frequency-ranked kanji`
- `tests/unit/game/kanji-kombat-deck.test.js`: `places one daily complete marker before endless early-review runway`
- `tests/unit/game/kanji-kombat-deck.test.js`: `does not duplicate the daily complete marker when refilling after the boundary`
- `tests/unit/game/kanji-kombat-deck.test.js`: `builds intro prompts in the buffer without recording daily intro counts`
- `tests/unit/game/kanji-kombat-deck.test.js`: `refills by replaying buffered prompts so partial planning matches a fresh full fill`
- `tests/unit/game/kanji-kombat-deck.test.js`: `reserves virtual daily intro budget while previewing prompts`
- `tests/unit/game/kanji-kombat-deck.test.js`: `does not fill the larger runway with new-card intros beyond the daily cap`
- `tests/unit/game/kanji-kombat-deck.test.js`: `does not duplicate an existing daily complete marker while appending endless review prompts`

For each failure in these tests, classify it before editing:

- Fixture bug: the test meant "reviewed" but did not set `reps > 0`.
- Expected behavior change: the old expectation relied on active-deck-only scheduling or review-cadence intros.
- Real regression: the failure contradicts the spec and should be fixed in implementation, not papered over in the test.

- [ ] **Step 3: Replace the review-cadence intro expectation**

In `tests/unit/game/kanji-kombat-deck.test.js`, replace the existing `it('resets intro spacing after a discovery so discoveries do not chain', ...)` body with:

```javascript
  it('due cards preempt review-cadence intros even when the intro interval has fired', () => {
    const data = loadSrsData(userId);
    const dueCard = data.script.cards.find(c => c.id === 'hiragana:あ');
    dueCard.due = new Date('2026-05-30T00:00:00Z');
    dueCard.reps = 1;
    dueCard.state = State.Review;
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    state.reviewsSinceIntro = state.nextIntroAfter;
    const work = chooseNextScriptWork(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(work.kind, 'quiz');
    assert.equal(work.quiz.cardId, 'hiragana:あ');
    assert.equal(state.noDueDiscoveryChainCount, 0);
  });
```

- [ ] **Step 4: Update prompt-buffer sequence expectations**

In the `refills by replaying buffered prompts so partial planning matches a fresh full fill` test, replace:

```javascript
    assert.deepEqual(refilled.map(prompt => prompt.kind), ['intro', 'quiz', 'quiz', 'quiz', 'intro']);
```

with:

```javascript
    assert.deepEqual(refilled.map(prompt => prompt.kind), ['quiz', 'quiz', 'quiz', 'quiz', 'intro']);
```

- [ ] **Step 5: Run focused unit tests and iterate until green**

Run:

```bash
node --test tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS.

If this command fails, do not defer the failures to the full suite. Apply the classification from Step 2 and repeat this exact command until it passes.

- [ ] **Step 6: Run the Kanji Kombat integration flow and treat expectation failures seriously**

Run:

```bash
node --test tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

Do not assume failures are trivial fixture updates. These integration tests assert prompt-buffer ordering, `source: 'earlyReview'`, completion prompts, and `report.scriptDeck`. If any of those fail, compare the observed result against the spec:

- Due-first ordering and per-type answer pools are intended behavior.
- A completion prompt should still appear when no eligible due cards, no no-due practice cards, and no allowed new cards remain.
- Endless-mode early reviews should still use `source: 'earlyReview'`.
- `report.scriptDeck` should preserve the last real selected deck when available, not reset to the first eligible type.

Use this exact fixture shape in `tests/integration/flows/kanji-kombat.test.js` when a script card is intended to be previously reviewed but not currently due:

```javascript
{
  ...card,
  reps: 1,
  state: State.Review,
  due: new Date('2100-01-01T00:00:00Z'),
}
```

- [ ] **Step 7: Commit test expectation updates**

```bash
/usr/bin/git add tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js tests/integration/flows/kanji-kombat.test.js
/usr/bin/git commit -m "test: align Kanji Kombat fixtures with due-first scheduling"
```

## Task 6: Final Verification

**Files:**
- Verify: `src/game/script-srs.js`
- Verify: `src/game/services/kanji-kombat-service.js`
- Verify: `tests/unit/game/script-srs.test.js`
- Verify: `tests/unit/game/kanji-kombat-deck.test.js`
- Verify: `tests/integration/flows/kanji-kombat.test.js`

The focused `node --test` commands are used because these specific files do not rely on module mocks. If a focused command fails because of runner configuration rather than test assertions, immediately rerun through the project wrapper with `npm run test:unit` and investigate the real failing assertion from that output.

- [ ] **Step 1: Syntax-check changed JS files**

Run:

```bash
node --check src/game/script-srs.js
node --check src/game/services/kanji-kombat-service.js
```

Expected: both commands print no syntax errors and exit 0.

- [ ] **Step 2: Run focused unit and integration tests**

Run:

```bash
node --test tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
/usr/bin/git diff --stat origin/dev...HEAD
/usr/bin/git diff origin/dev...HEAD -- src/game/script-srs.js src/game/services/kanji-kombat-service.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js tests/integration/flows/kanji-kombat.test.js
```

Expected: diff only contains scheduler helpers, Kanji Kombat selection changes, and matching tests.

- [ ] **Step 5: Commit final verification notes if new changes were needed**

If Task 6 required edits, commit them:

```bash
/usr/bin/git add src/game/script-srs.js src/game/services/kanji-kombat-service.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js tests/integration/flows/kanji-kombat.test.js
/usr/bin/git commit -m "fix: verify Kanji Kombat FSRS due ordering"
```

If Task 6 required no edits, do not create an empty commit.
