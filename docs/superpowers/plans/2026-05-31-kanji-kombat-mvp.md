# Kanji Kombat MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hub-accessible Kanji Kombat mode for FSRS-backed hiragana, katakana, and kanji practice inside reusable creature combat.

**Architecture:** Kanji Kombat is a special run mode (`run.mode = 'kanjiKombat'`) with a mode service that owns script deck selection, daily new-card cadence, quiz state, streak rewards, wave spawning, and report stats. The implementation adds a separate `script` SRS deck while leaving Speed Review on the existing `vocab` deck, and it routes correct/wrong quiz answers through server-owned combat actions instead of client-supplied move ids.

**Tech Stack:** Node.js ES modules, Express routes, `ts-fsrs`, existing Koto combat services, vanilla frontend JS, Node test runner.

---

## File Structure

Create focused files:

- `src/game/script-decks.js` — static hiragana/katakana/kanji curriculum and script card normalization.
- `src/game/script-srs.js` — seeding, legacy kana migration, active script selection, due/new card selection, grading, and daily counters for the `script` deck.
- `src/game/services/kanji-kombat-service.js` — Kanji Kombat run setup, quiz state, intro modal state, wave spawning, answer handling, streak rewards, and report construction.
- `src/routes/game/kanji-kombat.js` — API endpoints for starting the mode, intro modal grading, and quiz answers.
- `public/js/ui/kanji-kombat.js` — frontend action-area quiz and new-card modal UI.
- `data/script-kanji-wanikani-pleasant-100.json` — attributed snapshot of the first 100 WaniKani Pleasant entries from the design spec.

Modify integration points:

- `src/game/internal-srs.js` — no planned change; `loadSrsData`, `saveSrsData`, `getDeckCards`, `createCard`, and `gradeCard` already provide the generic deck access this plan needs.
- `src/game/services/creature-combat-service.js` — add synthetic single-actor action support.
- `src/game/services/combat-cycle-service.js` — add Kanji Kombat current-actor action handling and wave completion branch.
- `src/game/loop.js` — instantiate `KanjiKombatService`, expose delegates, include mode state in enriched game state.
- `src/game/phase-machine.js` — keep Kanji Kombat combat in `combat`; expose daily-complete/report state through existing run-ended/report flow.
- `src/routes/game/index.js` — mount Kanji Kombat routes.
- `public/js/api.js` — add Kanji Kombat API wrappers.
- `public/js/ui/exploration.js` — add hub button and launch flow.
- `public/game.js` — initialize Kanji Kombat UI and route combat action-area rendering to quizzes for Kanji Kombat ally cursors.
- Adventure report UI module used by `exploration.js` — add Kanji Kombat report variant.
- Tests under `tests/unit/game`, `tests/unit/combat`, `tests/unit/routes`, and `tests/unit/ui`.

## Task 1: Static Script Decks And Script SRS Storage

**Files:**
- Create: `data/script-kanji-wanikani-pleasant-100.json`
- Create: `src/game/script-decks.js`
- Create: `src/game/script-srs.js`
- Test: `tests/unit/game/script-decks.test.js`
- Test: `tests/unit/game/script-srs.test.js`

- [ ] **Step 1: Create static kanji snapshot**

Create `data/script-kanji-wanikani-pleasant-100.json` using the exact 100 rows listed in `docs/superpowers/specs/2026-05-31-kanji-kombat-mvp-design.md`. The file shape is:

```json
{
  "sourceName": "WaniKani Pleasant Kanji",
  "sourceUrl": "https://www.wanikani.com/kanji?difficulty=pleasant",
  "snapshotDate": "2026-05-31",
  "licenseNote": "Character-keyword recognition snapshot for Kanji Kombat; not dictionary definitions.",
  "entries": [
    { "kanji": "上", "reading": "じょう", "keyword": "Above" },
    { "kanji": "下", "reading": "か", "keyword": "Below" },
    { "kanji": "大", "reading": "たい", "keyword": "Big" },
    { "kanji": "工", "reading": "こう", "keyword": "Construction" },
    { "kanji": "八", "reading": "はち", "keyword": "Eight" },
    { "kanji": "虫", "reading": "むし", "keyword": "Insect" }
  ]
}
```

The `entries` array must contain all 100 entries from the design spec in order. The short JSON block above documents the object shape; the implementation is incomplete until the full list is present. The tests in Step 2 assert length, first card, `々`, and last card so an incomplete copy fails.

- [ ] **Step 2: Write failing static deck tests**

Create `tests/unit/game/script-decks.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIRAGANA_SCRIPT_CARDS,
  KATAKANA_SCRIPT_CARDS,
  KANJI_SCRIPT_CARDS,
  SCRIPT_CARD_TYPES,
  getStaticScriptCards,
} from '../../../src/game/script-decks.js';

describe('script-decks static data', () => {
  it('defines the three allowed script card types', () => {
    assert.deepEqual(SCRIPT_CARD_TYPES, ['hiragana', 'katakana', 'kanji']);
  });

  it('normalizes hiragana cards with stable ids and romaji answers', () => {
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].id, 'hiragana:あ');
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].type, 'hiragana');
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].prompt, 'あ');
    assert.equal(HIRAGANA_SCRIPT_CARDS[0].answer, 'a');
  });

  it('provides katakana cards independently of hiragana', () => {
    const first = KATAKANA_SCRIPT_CARDS[0];
    assert.equal(first.id, 'katakana:ア');
    assert.equal(first.type, 'katakana');
    assert.equal(first.prompt, 'ア');
    assert.equal(first.answer, 'a');
  });

  it('loads the first 100 WaniKani Pleasant kanji entries in order', () => {
    assert.equal(KANJI_SCRIPT_CARDS.length, 100);
    assert.deepEqual(KANJI_SCRIPT_CARDS[0], {
      id: 'kanji:上',
      type: 'kanji',
      prompt: '上',
      answer: 'Above',
      reading: 'じょう',
      keyword: 'Above',
      sortIndex: 1,
      source: 'wanikani-pleasant-100',
    });
    assert.equal(KANJI_SCRIPT_CARDS[37].id, 'kanji:々');
    assert.equal(KANJI_SCRIPT_CARDS[99].id, 'kanji:虫');
    assert.equal(KANJI_SCRIPT_CARDS[99].answer, 'Insect');
  });

  it('returns cards by script type only', () => {
    assert.equal(getStaticScriptCards('hiragana'), HIRAGANA_SCRIPT_CARDS);
    assert.equal(getStaticScriptCards('katakana'), KATAKANA_SCRIPT_CARDS);
    assert.equal(getStaticScriptCards('kanji'), KANJI_SCRIPT_CARDS);
    assert.deepEqual(getStaticScriptCards('vocab'), []);
  });
});
```

- [ ] **Step 3: Run static deck tests to verify failure**

Run:

```bash
node --test tests/unit/game/script-decks.test.js
```

Expected: FAIL because `src/game/script-decks.js` does not exist.

- [ ] **Step 4: Implement static script deck module**

Create `src/game/script-decks.js`:

```javascript
import kanjiSnapshot from '../../data/script-kanji-wanikani-pleasant-100.json' assert { type: 'json' };
import { HIRAGANA_DECK } from './hiragana-deck.js';

export const SCRIPT_CARD_TYPES = ['hiragana', 'katakana', 'kanji'];

const KATAKANA_BASE = [
  ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
  ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
  ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
  ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
  ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
  ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
  ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
  ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
  ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
  ['ワ', 'wa'], ['ヲ', 'wo'], ['ン', 'n'],
  ['ガ', 'ga'], ['ギ', 'gi'], ['グ', 'gu'], ['ゲ', 'ge'], ['ゴ', 'go'],
  ['ザ', 'za'], ['ジ', 'ji'], ['ズ', 'zu'], ['ゼ', 'ze'], ['ゾ', 'zo'],
  ['ダ', 'da'], ['ヂ', 'ji'], ['ヅ', 'zu'], ['デ', 'de'], ['ド', 'do'],
  ['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo'],
  ['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po'],
];

function scriptCard({ type, prompt, answer, reading = prompt, keyword = null, sortIndex, source }) {
  return {
    id: `${type}:${prompt}`,
    type,
    prompt,
    answer,
    reading,
    keyword,
    sortIndex,
    source,
  };
}

export const HIRAGANA_SCRIPT_CARDS = HIRAGANA_DECK.map((entry, index) => scriptCard({
  type: 'hiragana',
  prompt: entry.char,
  answer: entry.romaji,
  reading: entry.char,
  sortIndex: index + 1,
  source: 'builtin-hiragana',
}));

export const KATAKANA_SCRIPT_CARDS = KATAKANA_BASE.map(([char, romaji], index) => scriptCard({
  type: 'katakana',
  prompt: char,
  answer: romaji,
  reading: char,
  sortIndex: index + 1,
  source: 'builtin-katakana',
}));

export const KANJI_SCRIPT_CARDS = kanjiSnapshot.entries.map((entry, index) => scriptCard({
  type: 'kanji',
  prompt: entry.kanji,
  answer: entry.keyword,
  reading: entry.reading,
  keyword: entry.keyword,
  sortIndex: index + 1,
  source: 'wanikani-pleasant-100',
}));

export function getStaticScriptCards(type) {
  if (type === 'hiragana') return HIRAGANA_SCRIPT_CARDS;
  if (type === 'katakana') return KATAKANA_SCRIPT_CARDS;
  if (type === 'kanji') return KANJI_SCRIPT_CARDS;
  return [];
}

export function isScriptCardType(type) {
  return SCRIPT_CARD_TYPES.includes(type);
}
```

- [ ] **Step 5: Run static deck tests**

Run:

```bash
node --test tests/unit/game/script-decks.test.js
```

Expected: PASS.

- [ ] **Step 6: Write failing script SRS tests**

Create `tests/unit/game/script-srs.test.js`:

```javascript
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { State, createEmptyCard } from 'ts-fsrs';
import {
  clearSrsCache,
  configureSrs,
  getDeckCards,
  loadSrsData,
  saveSrsData,
} from '../../../src/game/internal-srs.js';
import {
  ensureScriptDeckSeeded,
  getActiveScriptType,
  getDueScriptCards,
  getNewScriptCards,
  gradeScriptCard,
  getScriptDailyState,
  recordScriptIntro,
} from '../../../src/game/script-srs.js';

describe('script-srs', () => {
  let tempDir;
  const userId = 'script-user';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-script-srs-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache(userId);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('seeds a separate script deck without touching vocab', () => {
    ensureScriptDeckSeeded(userId);
    const script = getDeckCards(userId, 'script');
    const vocab = getDeckCards(userId, 'vocab');
    assert.equal(script.some(c => c.type === 'hiragana'), true);
    assert.equal(script.some(c => c.type === 'katakana'), true);
    assert.equal(script.some(c => c.type === 'kanji'), true);
    assert.equal(vocab.length, 0);
  });

  it('migrates legacy kana FSRS state into matching hiragana script cards once', () => {
    const data = loadSrsData(userId);
    const reviewed = { ...createEmptyCard(), char: 'あ', romaji: 'a', row: 0, reps: 3, state: State.Learning };
    data.kana = { cards: [reviewed] };
    saveSrsData(userId, data);

    ensureScriptDeckSeeded(userId);
    const card = getDeckCards(userId, 'script').find(c => c.id === 'hiragana:あ');
    assert.equal(card.reps, 3);
    assert.equal(card.state, State.Learning);
    assert.equal(loadSrsData(userId).scriptMigration?.kanaToScript, true);
  });

  it('selects hiragana until all hiragana script cards are Review', () => {
    ensureScriptDeckSeeded(userId);
    assert.equal(getActiveScriptType(userId), 'hiragana');
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.state = State.Review;
    }
    saveSrsData(userId, data);
    assert.equal(getActiveScriptType(userId), 'katakana');
  });

  it('returns due script cards for active type only', () => {
    ensureScriptDeckSeeded(userId);
    const due = getDueScriptCards(userId);
    assert.ok(due.length > 0);
    assert.equal(due.every(c => c.type === 'hiragana'), true);
  });

  it('tracks daily introduced count by local date', () => {
    ensureScriptDeckSeeded(userId);
    const today = '2026-05-31';
    assert.deepEqual(getScriptDailyState(userId, today), { date: today, introducedCount: 0, completed: false });
    recordScriptIntro(userId, today);
    assert.equal(getScriptDailyState(userId, today).introducedCount, 1);
  });

  it('grades script cards through FSRS', () => {
    ensureScriptDeckSeeded(userId);
    const card = getNewScriptCards(userId, 'hiragana')[0];
    const graded = gradeScriptCard(userId, card.id, 'good');
    assert.equal(graded.id, card.id);
    assert.equal(graded.reps > 0, true);
  });
});
```

- [ ] **Step 7: Run script SRS tests to verify failure**

Run:

```bash
node --test tests/unit/game/script-srs.test.js
```

Expected: FAIL because `script-srs.js` does not exist.

- [ ] **Step 8: Implement script SRS module**

Create `src/game/script-srs.js`:

```javascript
import { State } from 'ts-fsrs';
import {
  getDeckCards,
  gradeCard,
  loadSrsData,
  saveSrsData,
} from './internal-srs.js';
import { getStaticScriptCards, SCRIPT_CARD_TYPES } from './script-decks.js';

export const SCRIPT_DECK = 'script';
export const DAILY_NEW_LIMIT = 20;

function fsrsFieldsFrom(card) {
  const fields = {};
  for (const key of ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_steps', 'state', 'last_review']) {
    if (card[key] !== undefined) fields[key] = card[key];
  }
  return fields;
}

function mergeStaticCard(existing, staticCard) {
  return {
    ...staticCard,
    ...fsrsFieldsFrom(existing || {}),
  };
}

export function ensureScriptDeckSeeded(userId) {
  const data = loadSrsData(userId);
  if (!data[SCRIPT_DECK]) data[SCRIPT_DECK] = { cards: [] };

  const byId = new Map(data[SCRIPT_DECK].cards.map(card => [card.id, card]));
  const seeded = [];
  for (const type of SCRIPT_CARD_TYPES) {
    for (const staticCard of getStaticScriptCards(type)) {
      seeded.push(mergeStaticCard(byId.get(staticCard.id), staticCard));
    }
  }

  data[SCRIPT_DECK].cards = seeded;
  migrateLegacyKanaData(data);
  saveSrsData(userId, data);
  return data[SCRIPT_DECK].cards;
}

function migrateLegacyKanaData(data) {
  if (data.scriptMigration?.kanaToScript) return;
  const legacyCards = data.kana?.cards || [];
  if (!legacyCards.length) {
    data.scriptMigration = { ...(data.scriptMigration || {}), kanaToScript: true };
    return;
  }

  const legacyByChar = new Map(legacyCards.map(card => [card.char, card]));
  data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map(card => {
    if (card.type !== 'hiragana') return card;
    const legacy = legacyByChar.get(card.prompt);
    return legacy ? { ...card, ...fsrsFieldsFrom(legacy) } : card;
  });
  data.scriptMigration = { ...(data.scriptMigration || {}), kanaToScript: true };
}

export function getScriptCards(userId, type = null) {
  ensureScriptDeckSeeded(userId);
  const cards = getDeckCards(userId, SCRIPT_DECK);
  return type ? cards.filter(card => card.type === type) : cards;
}

export function isScriptTypeGraduated(userId, type) {
  const cards = getScriptCards(userId, type);
  return cards.length > 0 && cards.every(card => card.state === State.Review);
}

export function getActiveScriptType(userId) {
  for (const type of SCRIPT_CARD_TYPES) {
    if (!isScriptTypeGraduated(userId, type)) return type;
  }
  return 'kanji';
}

export function getDueScriptCards(userId, type = getActiveScriptType(userId), now = new Date()) {
  return getScriptCards(userId, type).filter(card => {
    const due = card.due instanceof Date ? card.due : new Date(card.due);
    return due <= now;
  });
}

export function getNewScriptCards(userId, type = getActiveScriptType(userId)) {
  return getScriptCards(userId, type).filter(card => (card.reps || 0) === 0);
}

export function gradeScriptCard(userId, cardId, grade) {
  ensureScriptDeckSeeded(userId);
  return gradeCard(userId, SCRIPT_DECK, cardId, grade);
}

export function getScriptDailyState(userId, localDate) {
  const data = loadSrsData(userId);
  const daily = data.kanjiKombatDaily;
  if (daily?.date === localDate) return daily;
  return { date: localDate, introducedCount: 0, completed: false };
}

export function saveScriptDailyState(userId, state) {
  const data = loadSrsData(userId);
  data.kanjiKombatDaily = {
    date: state.date,
    introducedCount: state.introducedCount || 0,
    completed: state.completed === true,
  };
  saveSrsData(userId, data);
  return data.kanjiKombatDaily;
}

export function recordScriptIntro(userId, localDate) {
  const daily = getScriptDailyState(userId, localDate);
  return saveScriptDailyState(userId, {
    ...daily,
    introducedCount: Math.min(DAILY_NEW_LIMIT, (daily.introducedCount || 0) + 1),
  });
}

export function markScriptDailyComplete(userId, localDate) {
  const daily = getScriptDailyState(userId, localDate);
  return saveScriptDailyState(userId, { ...daily, completed: true });
}
```

- [ ] **Step 9: Run script deck and SRS tests**

Run:

```bash
node --test tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
/usr/bin/git add data/script-kanji-wanikani-pleasant-100.json src/game/script-decks.js src/game/script-srs.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add script SRS deck foundations

EOF
)"
```

## Task 2: Kanji Kombat Deck Controller And Quiz Selection

**Files:**
- Create: `src/game/services/kanji-kombat-service.js`
- Test: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Write failing deck-controller tests**

Create `tests/unit/game/kanji-kombat-deck.test.js`:

```javascript
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureSrs, clearSrsCache, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded, getScriptDailyState } from '../../../src/game/script-srs.js';
import {
  buildQuizForCard,
  chooseNextScriptWork,
  createInitialKanjiKombatState,
  getLocalDateKey,
  resolveIntroChoice,
} from '../../../src/game/services/kanji-kombat-service.js';

describe('kanji-kombat deck controller', () => {
  let tempDir;
  const userId = 'kanji-kombat-user';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-deck-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache(userId);
    ensureScriptDeckSeeded(userId);
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('builds four unique choices from the active script answer pool', () => {
    const data = loadSrsData(userId);
    const card = data.script.cards.find(c => c.id === 'hiragana:あ');
    const quiz = buildQuizForCard(card, data.script.cards.filter(c => c.type === 'hiragana'), () => 0.5);
    assert.equal(quiz.cardId, 'hiragana:あ');
    assert.equal(quiz.prompt, 'あ');
    assert.equal(quiz.choices.length, 4);
    assert.equal(new Set(quiz.choices.map(c => c.answer)).size, 4);
    assert.equal(quiz.choices.some(c => c.correct), true);
  });

  it('chooses a due card before introducing a new card when interval has not fired', () => {
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'quiz');
    assert.equal(work.card.type, 'hiragana');
  });

  it('introduces a new card when no due cards exist and daily cap remains', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'intro');
    assert.equal(work.card.type, 'hiragana');
  });

  it('stops for the day when no due cards exist and daily cap is exhausted', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
      card.reps = 1;
    }
    data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: 20, completed: false };
    saveSrsData(userId, data);
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const work = chooseNextScriptWork(userId, state, { random: () => 0.5, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(work.kind, 'complete');
  });

  it('intro choice grades the card and increments daily count without returning a quiz for same presentation', () => {
    const state = createInitialKanjiKombatState({ localDate: '2026-05-31' });
    const card = chooseNextScriptWork(userId, state, { now: new Date('2099-01-01T00:00:00Z') }).card;
    const result = resolveIntroChoice(userId, state, card.id, 'known');
    assert.equal(result.graded.id, card.id);
    assert.equal(result.next.kind === 'quiz' || result.next.kind === 'intro' || result.next.kind === 'complete', true);
    assert.notEqual(result.next.card?.id, card.id);
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 1);
  });
});
```

- [ ] **Step 2: Run deck-controller tests to verify failure**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: FAIL because `kanji-kombat-service.js` does not exist.

- [ ] **Step 3: Implement deck-controller exports**

Start `src/game/services/kanji-kombat-service.js` with pure helpers first:

```javascript
import { randomUUID } from 'crypto';
import { State } from 'ts-fsrs';
import {
  DAILY_NEW_LIMIT,
  getActiveScriptType,
  getDueScriptCards,
  getNewScriptCards,
  getScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  markScriptDailyComplete,
  recordScriptIntro,
} from '../script-srs.js';

export function getLocalDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA');
}

export function createInitialKanjiKombatState({ localDate = getLocalDateKey(), random = Math.random } = {}) {
  return {
    wave: 1,
    streak: 0,
    highestStreak: 0,
    reviewsSinceIntro: 0,
    nextIntroAfter: rollIntroInterval(random),
    localDate,
    currentQuiz: null,
    pendingIntro: null,
    report: {
      wavesCleared: 0,
      minibossesDefeated: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      cardsReviewed: 0,
      newCardsIntroduced: 0,
      scriptDeck: null,
      completedDaily: false,
    },
  };
}

export function rollIntroInterval(random = Math.random) {
  return 3 + Math.floor(random() * 3);
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQuizForCard(card, answerPool, random = Math.random) {
  const distractors = shuffle(
    answerPool.filter(candidate => candidate.id !== card.id && candidate.answer !== card.answer),
    random
  ).slice(0, 3);

  if (distractors.length < 3) {
    throw new Error(`Not enough distinct answers for script quiz: ${card.type}`);
  }

  const choices = shuffle([
    { id: randomUUID(), answer: card.answer, correct: true },
    ...distractors.map(candidate => ({ id: randomUUID(), answer: candidate.answer, correct: false })),
  ], random);

  return {
    cardId: card.id,
    type: card.type,
    prompt: card.prompt,
    reading: card.reading,
    keyword: card.keyword,
    choices,
  };
}

export function chooseNextScriptWork(userId, state, opts = {}) {
  const now = opts.now || new Date();
  const random = opts.random || Math.random;
  const activeType = getActiveScriptType(userId);
  state.report.scriptDeck = activeType;
  const daily = getScriptDailyState(userId, state.localDate);
  const dueCards = getDueScriptCards(userId, activeType, now);
  const newCards = getNewScriptCards(userId, activeType);
  const canIntroduce = daily.introducedCount < DAILY_NEW_LIMIT && newCards.length > 0;

  if (dueCards.length > 0 && state.reviewsSinceIntro >= state.nextIntroAfter && canIntroduce) {
    const card = newCards[0];
    state.pendingIntro = { cardId: card.id };
    return { kind: 'intro', card };
  }

  if (dueCards.length > 0) {
    const card = dueCards[0];
    const quiz = buildQuizForCard(card, getScriptCards(userId, activeType), random);
    state.currentQuiz = quiz;
    return { kind: 'quiz', card, quiz };
  }

  if (canIntroduce) {
    const card = newCards[0];
    state.pendingIntro = { cardId: card.id };
    return { kind: 'intro', card };
  }

  markScriptDailyComplete(userId, state.localDate);
  state.report.completedDaily = true;
  return { kind: 'complete' };
}

export function resolveIntroChoice(userId, state, cardId, choice, opts = {}) {
  const grade = choice === 'known' ? 'good' : 'again';
  const graded = gradeScriptCard(userId, cardId, grade);
  recordScriptIntro(userId, state.localDate);
  state.pendingIntro = null;
  state.report.newCardsIntroduced += 1;
  const next = chooseNextScriptWork(userId, state, opts);
  return { graded, next };
}
```

- [ ] **Step 4: Run deck-controller tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-deck.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add Kanji Kombat script work selection

EOF
)"
```

## Task 3: Kanji Kombat Run Setup, Waves, And Streak Rewards

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `src/game/loop.js`
- Modify: `src/game/services/index.js`
- Test: `tests/unit/game/kanji-kombat-run.test.js`

- [ ] **Step 1: Write failing service run tests**

Create `tests/unit/game/kanji-kombat-run.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';
import { createNewRun } from '../../../src/game/state.js';

function fakeCreature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 20,
    maxHp: 20,
    mp: 10,
    maxMp: 10,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

function buildGm() {
  const player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
  const gm = {
    userId: 'kk-run-user',
    player,
    run: null,
    combat: null,
    meta: {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi', 'neko', 'inu'],
      creatureCounts: { hi: 1, neko: 1, inu: 1 },
    },
    emitState() {},
  };
  gm.run = createNewRun(player);
  gm.run.creatureParty.active = [fakeCreature('hi')];
  return gm;
}

describe('KanjiKombatService run lifecycle helpers', () => {
  it('marks a run as Kanji Kombat and starts with one selected creature', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('neko'));
    assert.equal(gm.run.mode, 'kanjiKombat');
    assert.equal(gm.run.creatureParty.active.length, 1);
    assert.equal(gm.run.creatureParty.active[0].id, 'neko');
    assert.equal(gm.run.initialSkillPick.chosenId, 'kanjiKombat');
  });

  it('applies streak thresholds and resets after 20', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi', { hp: 10, maxHp: 20 }));
    for (let i = 0; i < 20; i++) service.recordCorrectAnswer();
    assert.equal(gm.run.kanjiKombat.streak, 0);
    assert.equal(gm.run.creatureParty.active.length > 1 || gm.run.creatureParty.active[0].hp === 20, true);
  });

  it('records wave completion without room fields', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.currentAreaEncounters = 0;
    gm.run.rooms = [{ type: 'encounter', interacted: false }];
    service.recordWaveClear({ miniboss: true });
    assert.equal(gm.run.kanjiKombat.wave, 2);
    assert.equal(gm.run.kanjiKombat.report.wavesCleared, 1);
    assert.equal(gm.run.kanjiKombat.report.minibossesDefeated, 1);
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.rooms[0].interacted, false);
  });
});
```

- [ ] **Step 2: Run run lifecycle tests to verify failure**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js
```

Expected: FAIL because `KanjiKombatService` class is not exported.

- [ ] **Step 3: Extend service with run lifecycle methods**

Append to `src/game/services/kanji-kombat-service.js`:

```javascript
import { createNewRun } from '../state.js';
import { AREAS } from '../rooms.js';
import { generateEnemyCreature, generateEnemyCreatures, getEnemyLevel } from '../creatures.js';
import { createCombatState } from '../state.js';
import { createPveOpeningCursor } from '../combat/action-cursor.js';

function cloneCreature(creature) {
  return JSON.parse(JSON.stringify(creature));
}

function healAll(allies, percent) {
  for (const ally of allies || []) {
    if (!ally || ally.hp <= 0) continue;
    ally.hp = Math.min(ally.maxHp, ally.hp + Math.ceil(ally.maxHp * percent));
  }
}

export class KanjiKombatService {
  constructor(gm) {
    this.gm = gm;
  }

  startRunWithCreature(creature) {
    this.gm.run = createNewRun(this.gm.player);
    this.gm.run.mode = 'kanjiKombat';
    this.gm.run.areaSelectionRequired = false;
    this.gm.run.initialSkillPick.chosenId = 'kanjiKombat';
    this.gm.run.creatureParty.active = [cloneCreature(creature)];
    this.gm.run.creatureParty.reserves = [];
    this.gm.run.creatureParty.maxTotal = 3;
    this.gm.run.kanjiKombat = createInitialKanjiKombatState();
    this.spawnNextWave();
    this.gm.emitState();
    return this.gm.run.kanjiKombat;
  }

  startRunWithCreatureId(creatureId) {
    const collection = this.gm.meta?.creatureCollection || [];
    if (!collection.includes(creatureId)) {
      throw new Error('Selected creature is not unlocked');
    }
    const starter = generateEnemyCreature(1, [creatureId]);
    return this.startRunWithCreature(starter);
  }

  getUnlockedAreas() {
    const highest = this.gm.meta?.levels?.highestUnlocked || 1;
    return AREAS.filter((_, index) => index < highest);
  }

  buildEnemyPool() {
    const pool = this.getUnlockedAreas().flatMap(area => area.creatures || []);
    return [...new Set(pool)];
  }

  buildBossPool() {
    return this.getUnlockedAreas().map(area => area.bossCreatureId).filter(Boolean);
  }

  spawnNextWave() {
    const kk = this.gm.run.kanjiKombat;
    const wave = kk.wave || 1;
    const isMiniboss = wave % 10 === 0;
    const highestLevel = Math.max(1, ...this.gm.run.creatureParty.active.map(c => c.level || 1));
    const areas = this.getUnlockedAreas();
    const stage = Math.max(1, ...areas.map(area => area.stage || 1));
    let enemies;

    if (isMiniboss && this.buildBossPool().length > 0) {
      const bossIds = this.buildBossPool();
      const bossId = bossIds[Math.floor(Math.random() * bossIds.length)];
      const bossLevel = Math.round(getEnemyLevel({ totalEncounters: wave, enemyCount: 1 }) * 1.25);
      const boss = generateEnemyCreature(Math.max(highestLevel, bossLevel), [bossId], stage);
      boss.hp = boss.maxHp = Math.max(boss.maxHp * 2, boss.hp * 2);
      enemies = [boss];
      kk.currentWaveIsMiniboss = true;
    } else {
      enemies = generateEnemyCreatures(highestLevel, {
        maxEnemies: 3,
        creaturePool: this.buildEnemyPool(),
        stage,
        encounterIndex: wave - 1,
        totalEncounters: wave,
      });
      kk.currentWaveIsMiniboss = false;
    }

    this.gm.combat = createCombatState(enemies[0]);
    this.gm.combat.mode = 'kanjiKombat';
    this.gm.combat.isCreatureCombat = true;
    this.gm.combat.isBoss = kk.currentWaveIsMiniboss;
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this.gm.combat.enemies = enemies;
    this.gm.combat.actionCursor = createPveOpeningCursor({ allies: this.gm.combat.allies, enemies });
    this.gm.combat.actionCount = 0;
    this.gm.combat.cycleCount = 0;
    return enemies;
  }

  recordCorrectAnswer() {
    const kk = this.gm.run.kanjiKombat;
    kk.streak = (kk.streak || 0) + 1;
    kk.highestStreak = Math.max(kk.highestStreak || 0, kk.streak);
    kk.report.correctAnswers += 1;
    kk.report.cardsReviewed += 1;
    kk.reviewsSinceIntro += 1;

    if (kk.streak === 5) healAll(this.gm.run.creatureParty.active, 0.10);
    if (kk.streak === 15) healAll(this.gm.run.creatureParty.active, 0.35);
    if (kk.streak === 20) {
      this.addRandomUnlockedAllyOrFullHeal();
      kk.streak = 0;
      kk.reviewsSinceIntro = 0;
      kk.nextIntroAfter = rollIntroInterval();
    }
  }

  recordWrongAnswer() {
    const kk = this.gm.run.kanjiKombat;
    kk.streak = 0;
    kk.report.wrongAnswers += 1;
    kk.report.cardsReviewed += 1;
  }

  addRandomUnlockedAllyOrFullHeal() {
    const active = this.gm.run.creatureParty.active;
    if (active.length >= 3) {
      healAll(active, 1);
      return null;
    }
    const activeIds = new Set(active.map(c => c.id));
    const candidates = (this.gm.meta?.creatureCollection || []).filter(id => !activeIds.has(id));
    if (candidates.length === 0) {
      healAll(active, 1);
      return null;
    }
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    const ally = generateEnemyCreature(Math.max(1, active[0]?.level || 1), [id]);
    active.push(ally);
    this.gm.combat.allies = active;
    return ally;
  }

  recordWaveClear({ miniboss = false } = {}) {
    const kk = this.gm.run.kanjiKombat;
    kk.report.wavesCleared += 1;
    if (miniboss) kk.report.minibossesDefeated += 1;
    kk.wave = (kk.wave || 1) + 1;
  }
}
```

- [ ] **Step 4: Wire GameManager delegates**

Modify `src/game/loop.js` imports and constructor. Add `KanjiKombatService` to the service import line:

```javascript
import { ExplorationService, CombatCycleService, KanjiKombatService } from './services/index.js';
```

In `GameManager` constructor after `this.combatCycleService = ...`:

```javascript
this.kanjiKombatService = new KanjiKombatService(this);
```

Add delegates near other service delegates:

```javascript
startKanjiKombat(creature) { return this.kanjiKombatService.startRunWithCreature(creature); }
submitKanjiKombatIntro(cardId, choice) { return this.kanjiKombatService.submitIntroChoice(cardId, choice); }
submitKanjiKombatAnswer(answerId) { return this.kanjiKombatService.submitAnswer(answerId); }
```

Modify `src/game/services/index.js`:

```javascript
export { KanjiKombatService } from './kanji-kombat-service.js';
```

- [ ] **Step 5: Run run lifecycle tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js src/game/loop.js src/game/services/index.js tests/unit/game/kanji-kombat-run.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add Kanji Kombat run lifecycle service

EOF
)"
```

## Task 4: Synthetic Combat Action And No-Op Actor Advance

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/game/services/kanji-kombat-service.js`
- Test: `tests/unit/combat/kanji-kombat-action.test.js`

- [ ] **Step 1: Write failing synthetic action tests**

Create `tests/unit/combat/kanji-kombat-action.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSyntheticActorAction,
  resolveNoopActorAction,
} from '../../../src/game/services/creature-combat-service.js';

function creature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 30,
    maxHp: 30,
    mp: 0,
    maxMp: 0,
    attack: 10,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

describe('Kanji Kombat synthetic combat actions', () => {
  it('resolves a synthetic move even when the creature has no matching move', () => {
    const ally = creature('ally', { element: 'water' });
    const enemy = creature('enemy', { hp: 20, maxHp: 20, element: 'fire' });
    const result = resolveSyntheticActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [enemy],
      syntheticMove: {
        id: 'kanji-kombat-strike',
        name: 'Kanji Kombat Strike',
        power: 15,
        element: 'water',
        target: 'single_enemy',
        mpCost: 0,
      },
      targetIndex: 0,
    });
    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].attacks.length > 0, true);
    assert.equal(enemy.hp < 20, true);
  });

  it('resolves a no-op segment with no attacks', () => {
    const ally = creature('ally');
    const enemy = creature('enemy');
    const result = resolveNoopActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [enemy],
    });
    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].attacks.length, 0);
    assert.equal(result.actionSegments[0].noop, true);
    assert.equal(enemy.hp, 30);
  });
});
```

- [ ] **Step 2: Run synthetic action tests to verify failure**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-action.test.js
```

Expected: FAIL because the synthetic resolver exports do not exist.

- [ ] **Step 3: Implement synthetic/no-op resolvers**

Modify `src/game/services/creature-combat-service.js`. Add these exports near `resolveSingleActorAction` so they can reuse local helpers:

```javascript
export function resolveSyntheticActorAction({
  actorSide,
  actorIndex,
  allies,
  enemies,
  syntheticMove,
  targetIndex,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  combat = null,
  playbackStart = 0,
}) {
  const isAlly = actorSide === 'ally' || actorSide === 'sideA';
  const actorList = isAlly ? allies : enemies;
  const defenderList = isAlly ? enemies : allies;
  const actor = actorList[actorIndex];
  let playbackIndex = playbackStart;
  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: false,
    synthetic: true,
  };

  if (!actor || actor.hp <= 0) {
    segment.skipped = true;
    return { actionSegments: [segment], attacks: [], xpEvents: [], playbackNext: playbackIndex };
  }

  const result = executeMove(
    actor,
    actorIndex,
    syntheticMove,
    targetIndex,
    actorList,
    defenderList,
    isAlly ? itemBuffs : null,
    isAlly ? creatureParty : null,
    new Set(),
    isAlly ? metaMults : null,
    isAlly ? null : itemBuffs
  );

  for (const atk of result.attacks) {
    atk.playbackIndex = playbackIndex++;
    atk.combatSide = isAlly ? 'player' : 'enemy';
    atk.synthetic = true;
    segment.attacks.push(atk);
  }
  segment.xpEvents.push(...(result.xpEvents || []));
  return {
    actionSegments: [segment],
    attacks: segment.attacks,
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: segment.xpEvents,
    effectEvents: [],
    mpRegens: [],
    playbackNext: playbackIndex,
  };
}

export function resolveNoopActorAction({ actorSide, actorIndex, allies, enemies, playbackStart = 0 }) {
  const actor = actorSide === 'ally' ? allies?.[actorIndex] : enemies?.[actorIndex];
  return {
    actionSegments: [{
      actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
      attacks: [],
      counterAttacks: [],
      effectEvents: [],
      mpRegens: [],
      xpEvents: [],
      skipped: !actor || actor.hp <= 0,
      noop: true,
    }],
    attacks: [],
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: [],
    effectEvents: [],
    mpRegens: [],
    playbackNext: playbackStart,
  };
}
```

- [ ] **Step 4: Add Kanji Kombat current-actor resolver**

Modify imports in `src/game/services/combat-cycle-service.js`:

```javascript
import {
  resolveSingleActorAction,
  resolveSyntheticActorAction,
  resolveNoopActorAction,
} from './creature-combat-service.js';
```

Add a method to `CombatCycleService`:

```javascript
resolveKanjiKombatCursorAction({ correct, targetIndex = 0 } = {}) {
  const cursor = this.gm.combat?.actionCursor;
  if (!this.gm.run || this.gm.run.mode !== 'kanjiKombat') throw new Error('Not in Kanji Kombat');
  if (!cursor || cursor.side !== 'ally') throw new Error('Kanji Kombat answer requires ally action cursor');

  const actor = this.gm.combat.allies[cursor.index];
  const result = correct
    ? resolveSyntheticActorAction({
        actorSide: 'ally',
        actorIndex: cursor.index,
        allies: this.gm.combat.allies,
        enemies: this.gm.combat.enemies,
        targetIndex,
        syntheticMove: {
          id: 'kanji-kombat-strike',
          name: 'Kanji Kombat Strike',
          nameEn: 'Kanji Kombat Strike',
          power: 15,
          element: actor.element,
          target: 'single_enemy',
          mpCost: 0,
        },
        itemBuffs: this.gm.run.itemBuffs,
        creatureParty: this.gm.run.creatureParty,
        metaMults: this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
        combat: this.gm.combat,
      })
    : resolveNoopActorAction({
        actorSide: 'ally',
        actorIndex: cursor.index,
        allies: this.gm.combat.allies,
        enemies: this.gm.combat.enemies,
      });

  this.gm.combat.actionCount = (this.gm.combat.actionCount || 0) + 1;
  this.gm.combat.turnCount = this.gm.combat.actionCount;
  this.gm.combat.actionCursor = getNextActionCursor({
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies,
    previousCursor: cursor,
  });

  while (
    this.gm.combat.active &&
    this.gm.combat.actionCursor?.side === 'enemy' &&
    !checkAllDefeated(this.gm.combat.enemies) &&
    !checkAllDefeated(this.gm.combat.allies)
  ) {
    const enemyResult = this._resolveCurrentPveCursor(null, result.playbackNext || 0);
    result.actionSegments.push(...enemyResult.actionSegments);
  }

  return this._finalizeKanjiKombatActionResult(result);
}
```

Add `_finalizeKanjiKombatActionResult(result)` beside `_handleCreatureActionCursorTurn`. It mirrors the existing flattening payload but branches to Kanji Kombat service when all enemies are down:

```javascript
_finalizeKanjiKombatActionResult(result) {
  const actionSegments = result.actionSegments || [];
  const flatPlayerAttacks = actionSegments.flatMap(segment => segment.actor.side === 'ally' ? segment.attacks : []);
  const flatEnemyAttacks = actionSegments.flatMap(segment => segment.actor.side === 'enemy' ? segment.attacks : []);
  const xpEvents = actionSegments.flatMap(segment => segment.xpEvents || []);
  const allEnemiesDown = checkAllDefeated(this.gm.combat.enemies);
  const allAlliesDown = checkAllDefeated(this.gm.combat.allies);

  if (allAlliesDown) {
    return this.gm.kanjiKombatService.finalizeDefeat({ actionSegments, flatPlayerAttacks, flatEnemyAttacks, xpEvents });
  }

  if (allEnemiesDown) {
    return this.gm.kanjiKombatService.completeWaveAndMaybeStartNext({ actionSegments, flatPlayerAttacks, flatEnemyAttacks, xpEvents });
  }

  this.gm.emitState();
  return {
    actionType: 'kanjiKombat',
    actionSegments,
    playerAttacks: flatPlayerAttacks,
    enemyAttacks: flatEnemyAttacks,
    xpEvents,
    combatEnded: false,
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies,
    creatureParty: this.gm.run.creatureParty,
    kanjiKombat: this.gm.run.kanjiKombat,
  };
}
```

- [ ] **Step 5: Implement service answer bridge**

Add to `KanjiKombatService`:

```javascript
submitAnswer(answerId) {
  const kk = this.gm.run?.kanjiKombat;
  const quiz = kk?.currentQuiz;
  if (!quiz) throw new Error('No active Kanji Kombat quiz');
  const choice = quiz.choices.find(option => option.id === answerId);
  if (!choice) throw new Error('Invalid Kanji Kombat answer');

  gradeScriptCard(this.gm.userId, quiz.cardId, choice.correct ? 'good' : 'again');
  if (choice.correct) this.recordCorrectAnswer();
  else this.recordWrongAnswer();

  kk.currentQuiz = null;
  return this.gm.combatCycleService.resolveKanjiKombatCursorAction({
    correct: choice.correct,
    targetIndex: 0,
  });
}
```

- [ ] **Step 6: Run synthetic action tests**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-action.test.js
```

Expected: PASS.

- [ ] **Step 7: Run existing action cursor tests**

Run:

```bash
node --test tests/unit/combat/combat-cycle-action-cursor.test.js tests/unit/combat/creature-combat-service.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
/usr/bin/git add src/game/services/creature-combat-service.js src/game/services/combat-cycle-service.js src/game/services/kanji-kombat-service.js tests/unit/combat/kanji-kombat-action.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add server-owned Kanji Kombat combat actions

EOF
)"
```

## Task 5: Kanji Kombat Wave Completion And Report Finalization

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `src/game/loop.js`
- Test: `tests/unit/game/kanji-kombat-wave.test.js`

- [ ] **Step 1: Write failing wave lifecycle tests**

Create `tests/unit/game/kanji-kombat-wave.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNewRun } from '../../../src/game/state.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';

function gmWithMode() {
  const gm = {
    userId: 'wave-user',
    player: { name: 'Tester', hp: 100, maxHp: 100, credits: 0 },
    meta: { levels: { highestUnlocked: 1 }, creatureCollection: ['hi'], creatureCounts: { hi: 1 } },
    emitState() {},
  };
  gm.run = createNewRun(gm.player);
  gm.run.mode = 'kanjiKombat';
  gm.run.areaSelectionRequired = false;
  gm.run.currentAreaEncounters = 0;
  gm.run.rooms = [{ type: 'encounter', interacted: false }];
  gm.run.creatureParty.active = [{
    id: 'hi', uid: 'hi-1', element: 'fire', level: 1, hp: 20, maxHp: 20, mp: 10, maxMp: 10, attack: 5, defense: 5, dex: 5, moves: [],
  }];
  gm.run.kanjiKombat = {
    wave: 1,
    currentWaveIsMiniboss: false,
    report: { wavesCleared: 0, minibossesDefeated: 0, correctAnswers: 0, wrongAnswers: 0, cardsReviewed: 0, newCardsIntroduced: 0, completedDaily: false },
  };
  gm.combat = { active: true, allies: gm.run.creatureParty.active, enemies: [{ hp: 0, id: 'enemy' }] };
  return gm;
}

describe('Kanji Kombat wave completion', () => {
  it('does not mark room interacted or increment area counters on wave clear', () => {
    const gm = gmWithMode();
    gm.kanjiKombatService = new KanjiKombatService(gm);
    const result = gm.kanjiKombatService.completeWaveAndMaybeStartNext({ actionSegments: [], flatPlayerAttacks: [], flatEnemyAttacks: [], xpEvents: [] });
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.rooms[0].interacted, false);
    assert.equal(gm.run.kanjiKombat.report.wavesCleared, 1);
    assert.equal(result.actionType, 'kanjiKombat');
  });

  it('finalizes defeat as Kanji Kombat report without pending capture flush', () => {
    const gm = gmWithMode();
    gm.run.creatureParty.pendingCaptures = [{ id: 'neko' }];
    gm.kanjiKombatService = new KanjiKombatService(gm);
    const result = gm.kanjiKombatService.finalizeDefeat({ actionSegments: [], flatPlayerAttacks: [], flatEnemyAttacks: [], xpEvents: [] });
    assert.equal(gm.run.active, false);
    assert.equal(gm.run.creatureParty.pendingCaptures.length, 1);
    assert.equal(result.kanjiKombatReport.wavesCleared, 0);
  });
});
```

- [ ] **Step 2: Run wave lifecycle tests to verify failure**

Run:

```bash
node --test tests/unit/game/kanji-kombat-wave.test.js
```

Expected: FAIL because methods are missing or incomplete.

- [ ] **Step 3: Implement wave completion methods**

Add to `KanjiKombatService`:

```javascript
buildReport() {
  const kk = this.gm.run.kanjiKombat;
  const report = kk.report;
  const total = report.correctAnswers + report.wrongAnswers;
  return {
    ...report,
    highestStreak: kk.highestStreak || 0,
    accuracy: total > 0 ? Math.round((report.correctAnswers / total) * 100) : 0,
    temporaryLevels: this.gm.run.creatureParty.active.map(c => ({ id: c.id, nameEn: c.nameEn, level: c.level || 1 })),
  };
}

completeWaveAndMaybeStartNext({ actionSegments = [], flatPlayerAttacks = [], flatEnemyAttacks = [], xpEvents = [] } = {}) {
  const wasMiniboss = this.gm.run.kanjiKombat.currentWaveIsMiniboss === true;
  this.recordWaveClear({ miniboss: wasMiniboss });
  const work = chooseNextScriptWork(this.gm.userId, this.gm.run.kanjiKombat);
  if (work.kind === 'complete') {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    this.gm.run.kanjiKombat.report.completedDaily = true;
    this.gm.run.kanjiKombat.finalReport = this.buildReport();
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      combatEnded: true,
      victory: true,
      kanjiKombatReport: this.gm.run.kanjiKombat.finalReport,
      creatureParty: this.gm.run.creatureParty,
      enemies: this.gm.combat.enemies,
    };
  }
  this.spawnNextWave();
  this.gm.run.kanjiKombat.currentQuiz = work.quiz || null;
  this.gm.run.kanjiKombat.pendingIntro = work.kind === 'intro' ? { card: work.card } : null;
  this.gm.emitState();
  return {
    actionType: 'kanjiKombat',
    actionSegments,
    playerAttacks: flatPlayerAttacks,
    enemyAttacks: flatEnemyAttacks,
    xpEvents,
    combatEnded: false,
    nextWave: true,
    kanjiKombat: this.gm.run.kanjiKombat,
    allies: this.gm.combat.allies,
    enemies: this.gm.combat.enemies,
    creatureParty: this.gm.run.creatureParty,
  };
}

finalizeDefeat({ actionSegments = [], flatPlayerAttacks = [], flatEnemyAttacks = [], xpEvents = [] } = {}) {
  this.gm.combat.active = false;
  this.gm.run.active = false;
  this.gm.run.stats.endTime = Date.now();
  this.gm.run.kanjiKombat.finalReport = this.buildReport();
  this.gm.emitState();
  return {
    actionType: 'kanjiKombat',
    actionSegments,
    playerAttacks: flatPlayerAttacks,
    enemyAttacks: flatEnemyAttacks,
    xpEvents,
    combatEnded: true,
    victory: false,
    kanjiKombatReport: this.gm.run.kanjiKombat.finalReport,
    creatureParty: this.gm.run.creatureParty,
  };
}
```

- [ ] **Step 4: Include Kanji Kombat state in enriched state**

Modify `src/game/loop.js` inside the `run` state object:

```javascript
mode: this.run.mode || null,
kanjiKombat: this.run.kanjiKombat || null,
```

Modify the `combat` state object:

```javascript
mode: this.combat.mode || null,
```

- [ ] **Step 5: Run wave lifecycle tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-wave.test.js
```

Expected: PASS.

- [ ] **Step 6: Run action cursor regression tests**

Run:

```bash
node --test tests/unit/combat/combat-cycle-action-cursor.test.js tests/unit/combat/combat-cycle-payload.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js src/game/loop.js tests/unit/game/kanji-kombat-wave.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add Kanji Kombat wave lifecycle

EOF
)"
```

## Task 6: API Routes

**Files:**
- Create: `src/routes/game/kanji-kombat.js`
- Modify: `src/routes/game/index.js`
- Modify: `public/js/api.js`
- Test: `tests/unit/routes/kanji-kombat-routes.test.js`

- [ ] **Step 1: Write failing route tests**

Create `tests/unit/routes/kanji-kombat-routes.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createKanjiKombatRoutes from '../../../src/routes/game/kanji-kombat.js';

function appWithManager(manager) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'route-user' };
    req.gameManager = manager;
    req.saveGame = () => { manager.saved = true; };
    req.getEnrichedGameState = () => ({ run: manager.run, combat: manager.combat });
    next();
  });
  app.use('/kanji-kombat', createKanjiKombatRoutes());
  return app;
}

describe('Kanji Kombat routes', () => {
  it('starts a run for a selected creature', async () => {
    const manager = {
      meta: { creatureCollection: ['hi'] },
      kanjiKombatService: {
        getAvailability: () => ({ available: true }),
        startRunWithCreature: creature => ({ started: true, creatureId: creature.id }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/start')
      .send({ creatureId: 'hi' });
    assert.equal(res.status, 200);
    assert.equal(res.body.started, true);
    assert.equal(manager.saved, true);
  });

  it('submits an intro choice', async () => {
    const manager = {
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice) => ({ cardId, choice }),
      },
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({ cardId: 'hiragana:あ', choice: 'known' });
    assert.equal(res.status, 200);
    assert.equal(res.body.cardId, 'hiragana:あ');
    assert.equal(res.body.choice, 'known');
  });

  it('submits a quiz answer', async () => {
    const manager = {
      submitKanjiKombatAnswer: answerId => ({ answerId, actionType: 'kanjiKombat' }),
    };
    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/answer')
      .send({ answerId: 'answer-1' });
    assert.equal(res.status, 200);
    assert.equal(res.body.actionType, 'kanjiKombat');
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
node --test tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: FAIL because route file does not exist.

- [ ] **Step 3: Implement backend routes**

Create `src/routes/game/kanji-kombat.js`:

```javascript
import { Router } from 'express';

export default function createKanjiKombatRoutes() {
  const router = Router();

  router.get('/availability', (req, res) => {
    try {
      res.json(req.gameManager.kanjiKombatService.getAvailability());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/start', (req, res) => {
    try {
      const { creatureId } = req.body || {};
      const collection = req.gameManager.meta?.creatureCollection || [];
      if (!creatureId || !collection.includes(creatureId)) {
        return res.status(400).json({ error: 'Selected creature is not unlocked' });
      }
      const result = req.gameManager.kanjiKombatService.startRunWithCreatureId(creatureId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/intro', (req, res) => {
    try {
      const { cardId, choice } = req.body || {};
      if (!cardId || !['known', 'unknown'].includes(choice)) {
        return res.status(400).json({ error: 'cardId and choice (known|unknown) required' });
      }
      const result = req.gameManager.submitKanjiKombatIntro(cardId, choice);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/answer', (req, res) => {
    try {
      const { answerId } = req.body || {};
      if (!answerId) return res.status(400).json({ error: 'answerId required' });
      const result = req.gameManager.submitKanjiKombatAnswer(answerId);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
```

Modify `src/routes/game/index.js`:

```javascript
import createKanjiKombatRoutes from './kanji-kombat.js';
```

Mount before PvP routes:

```javascript
router.use('/kanji-kombat', createKanjiKombatRoutes());
```

- [ ] **Step 4: Add frontend API wrappers**

Modify `public/js/api.js`:

```javascript
export async function getKanjiKombatAvailability() {
  return apiCall('/kanji-kombat/availability', 'GET');
}

export async function startKanjiKombat(creatureId) {
  return apiCall('/kanji-kombat/start', 'POST', { creatureId }, null, { bypassLoadingGate: true });
}

export async function submitKanjiKombatIntro(cardId, choice) {
  return apiCall('/kanji-kombat/intro', 'POST', { cardId, choice }, null, { bypassLoadingGate: true });
}

export async function submitKanjiKombatAnswer(answerId) {
  return apiCall('/kanji-kombat/answer', 'POST', { answerId }, null, {
    bypassLoadingGate: true,
    timeoutMs: COMBAT_CYCLE_TIMEOUT_MS,
  });
}
```

- [ ] **Step 5: Run route tests**

Run:

```bash
node --test tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: PASS.

- [ ] **Step 6: Syntax check touched JS files**

Run:

```bash
node --check src/routes/game/kanji-kombat.js && node --check public/js/api.js
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 6**

```bash
/usr/bin/git add src/routes/game/kanji-kombat.js src/routes/game/index.js public/js/api.js tests/unit/routes/kanji-kombat-routes.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add Kanji Kombat API routes

EOF
)"
```

## Task 7: Frontend Hub Entry, Quiz UI, And Intro Modal

**Files:**
- Create: `public/js/ui/kanji-kombat.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/game.js`
- Modify: `public/game.css`
- Test: `tests/unit/ui/kanji-kombat-ui.test.js`

- [ ] **Step 1: Write failing UI tests**

Create `tests/unit/ui/kanji-kombat-ui.test.js`:

```javascript
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  renderKanjiKombatQuiz,
  renderKanjiKombatIntro,
} from '../../../public/js/ui/kanji-kombat.js';

describe('kanji-kombat ui', () => {
  beforeEach(() => {
    const dom = new JSDOM('<div id="action-area"></div>');
    global.document = dom.window.document;
    global.window = dom.window;
  });

  it('renders prompt and four quiz choices', () => {
    const quiz = {
      prompt: 'あ',
      type: 'hiragana',
      choices: [
        { id: 'a', answer: 'a' },
        { id: 'i', answer: 'i' },
        { id: 'u', answer: 'u' },
        { id: 'e', answer: 'e' },
      ],
    };
    renderKanjiKombatQuiz(quiz, { onAnswer: () => {} });
    assert.equal(document.querySelector('.kanji-kombat-prompt').textContent, 'あ');
    assert.equal(document.querySelectorAll('.kanji-kombat-choice').length, 4);
  });

  it('renders intro modal actions', () => {
    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });
    assert.equal(document.querySelector('.kanji-kombat-intro-card').textContent.includes('上'), true);
    assert.equal(document.querySelectorAll('.kanji-kombat-intro-action').length, 2);
  });
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL because UI file does not exist.

- [ ] **Step 3: Implement action-area UI module**

Create `public/js/ui/kanji-kombat.js`:

```javascript
import { escapeHtml } from './html-utils.js';

let api = {
  submitAnswer: null,
  submitIntro: null,
  updateGameState: null,
  updateUI: null,
};

export function initKanjiKombatUI(deps) {
  api = { ...api, ...deps };
}

function actionArea() {
  return document.getElementById('action-area');
}

export function renderKanjiKombatQuiz(quiz, { onAnswer } = {}) {
  const root = actionArea();
  if (!root || !quiz) return;
  root.innerHTML = `
    <div class="kanji-kombat-panel">
      <div class="kanji-kombat-label">Kanji Kombat</div>
      <div class="kanji-kombat-prompt">${escapeHtml(quiz.prompt)}</div>
      <div class="kanji-kombat-choices">
        ${quiz.choices.map(choice => `
          <button class="kanji-kombat-choice" data-answer-id="${escapeHtml(choice.id)}">
            ${escapeHtml(choice.answer)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  for (const button of root.querySelectorAll('.kanji-kombat-choice')) {
    button.addEventListener('click', () => onAnswer?.(button.dataset.answerId));
  }
}

export function renderKanjiKombatIntro(card, { onChoice } = {}) {
  const root = actionArea();
  if (!root || !card) return;
  root.innerHTML = `
    <div class="kanji-kombat-intro">
      <div class="kanji-kombat-intro-card">
        <div class="kanji-kombat-prompt">${escapeHtml(card.prompt)}</div>
        <div class="kanji-kombat-reading">${escapeHtml(card.reading || card.prompt)}</div>
        <div class="kanji-kombat-answer">${escapeHtml(card.answer)}</div>
      </div>
      <div class="kanji-kombat-intro-actions">
        <button class="kanji-kombat-intro-action" data-choice="known">I knew it</button>
        <button class="kanji-kombat-intro-action" data-choice="unknown">I didn't know it</button>
      </div>
    </div>
  `;
  for (const button of root.querySelectorAll('.kanji-kombat-intro-action')) {
    button.addEventListener('click', () => onChoice?.(button.dataset.choice));
  }
}

export function showKanjiKombatCreatureChooser(gameState, { onConfirm } = {}) {
  const root = actionArea();
  const collection = gameState.meta?.creatureCollection || [];
  if (!root) return;
  root.innerHTML = `
    <div class="kanji-kombat-panel">
      <div class="kanji-kombat-label">Choose One Creature</div>
      <div class="kanji-kombat-choices">
        ${collection.map(id => `
          <button class="kanji-kombat-choice" data-creature-id="${escapeHtml(id)}">
            ${escapeHtml(id)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  for (const button of root.querySelectorAll('.kanji-kombat-choice')) {
    button.addEventListener('click', () => onConfirm?.(button.dataset.creatureId));
  }
}

export function renderKanjiKombatAction(gameState) {
  const kk = gameState.run?.kanjiKombat;
  const cursor = gameState.combat?.actionCursor;
  if (!kk || cursor?.side !== 'ally') return false;

  if (kk.pendingIntro?.card) {
    renderKanjiKombatIntro(kk.pendingIntro.card, {
      onChoice: async choice => {
        const result = await api.submitIntro(kk.pendingIntro.card.id, choice);
        if (result?.state) api.updateGameState(result.state);
        api.updateUI();
      },
    });
    return true;
  }

  if (kk.currentQuiz) {
    renderKanjiKombatQuiz(kk.currentQuiz, {
      onAnswer: async answerId => {
        const result = await api.submitAnswer(answerId);
        if (result?.state) api.updateGameState(result.state);
        api.updateUI();
      },
    });
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Add CSS**

Append to `public/game.css`:

```css
.kanji-kombat-panel,
.kanji-kombat-intro {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: stretch;
  padding: 0.75rem;
}

.kanji-kombat-label {
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.kanji-kombat-prompt {
  font-size: clamp(3rem, 14vw, 5.5rem);
  font-weight: 800;
  line-height: 1;
  text-align: center;
  color: var(--text-primary);
}

.kanji-kombat-choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.kanji-kombat-choice,
.kanji-kombat-intro-action {
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 14px;
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
  min-height: 52px;
  font-weight: 700;
}

.kanji-kombat-intro-card {
  text-align: center;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 18px;
  padding: 1rem;
  background: rgba(0,0,0,0.20);
}

.kanji-kombat-reading,
.kanji-kombat-answer {
  color: var(--text-secondary);
  margin-top: 0.35rem;
}
```

- [ ] **Step 5: Wire hub button**

Modify `public/js/ui/exploration.js` imports/callback init to accept:

```javascript
let apiGetKanjiKombatAvailability = null;
let startKanjiKombatSetup = null;
```

In `init(callbacks)`, assign:

```javascript
apiGetKanjiKombatAvailability = callbacks.apiGetKanjiKombatAvailability;
startKanjiKombatSetup = callbacks.startKanjiKombatSetup;
```

In `renderHub()`, fetch availability:

```javascript
const kanjiKombat = apiGetKanjiKombatAvailability
  ? await apiGetKanjiKombatAvailability().catch(() => ({ available: false }))
  : { available: false };
```

Add button after Knowledge Review:

```javascript
{ label: 'Kanji Kombat', onClick: () => startKanjiKombatSetup?.(), disabled: kanjiKombat.available === false },
```

- [ ] **Step 6: Wire `public/game.js`**

Import API and UI functions:

```javascript
import {
  getKanjiKombatAvailability,
  startKanjiKombat,
  submitKanjiKombatIntro,
  submitKanjiKombatAnswer,
} from './js/api.js';
import * as kanjiKombatUI from './js/ui/kanji-kombat.js';
```

Initialize UI:

```javascript
kanjiKombatUI.initKanjiKombatUI({
  submitIntro: submitKanjiKombatIntro,
  submitAnswer: submitKanjiKombatAnswer,
  updateGameState,
  updateUI,
});
```

Add callback into `explorationUI.init`:

```javascript
apiGetKanjiKombatAvailability: getKanjiKombatAvailability,
startKanjiKombatSetup,
```

Implement setup with the Kanji Kombat-specific one-creature chooser:

```javascript
async function startKanjiKombatSetup() {
  const collection = gameState.meta?.creatureCollection || [];
  if (collection.length === 0) {
    scene.showNarration('Befriend a creature before entering Kanji Kombat.', { autoDismiss: 2000 });
    return;
  }
  kanjiKombatUI.showKanjiKombatCreatureChooser(gameState, {
    onConfirm: async creatureId => {
      const result = await startKanjiKombat(creatureId);
      if (result?.state) updateGameState(result.state);
      combatLoopUI.startCombatLoop();
      updateUI();
    },
  });
}
```

In combat action rendering, before regular move selection, check:

```javascript
if (getGameState().run?.mode === 'kanjiKombat' && kanjiKombatUI.renderKanjiKombatAction(getGameState())) {
  return;
}
```

- [ ] **Step 7: Run UI tests and syntax checks**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
node --check public/js/ui/kanji-kombat.js
node --check public/game.js
```

Expected: all pass.

- [ ] **Step 8: Commit Task 7**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js public/js/ui/exploration.js public/game.js public/game.css tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add Kanji Kombat frontend flow

EOF
)"
```

## Task 8: Adapted Adventure Report

**Files:**
- Modify: existing adventure report frontend module used by `public/js/ui/exploration.js`
- Modify: `src/game/adventure-report.js`
- Test: `tests/unit/game/kanji-kombat-report.test.js`

- [ ] **Step 1: Write failing report test**

Create `tests/unit/game/kanji-kombat-report.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummary } from '../../../src/game/adventure-report.js';

describe('Kanji Kombat report summary', () => {
  it('returns Kanji Kombat report when run mode is kanjiKombat', () => {
    const run = {
      mode: 'kanjiKombat',
      kanjiKombat: {
        finalReport: {
          wavesCleared: 4,
          highestStreak: 8,
          correctAnswers: 12,
          wrongAnswers: 3,
          accuracy: 80,
          newCardsIntroduced: 5,
          cardsReviewed: 15,
          scriptDeck: 'hiragana',
          minibossesDefeated: 0,
          temporaryLevels: [{ id: 'hi', nameEn: 'Hi', level: 3 }],
        },
      },
    };
    const summary = buildRunSummary(run, {});
    assert.equal(summary.mode, 'kanjiKombat');
    assert.equal(summary.kanjiKombat.wavesCleared, 4);
    assert.equal(summary.kanjiKombat.accuracy, 80);
  });
});
```

- [ ] **Step 2: Run report test to verify failure**

Run:

```bash
node --test tests/unit/game/kanji-kombat-report.test.js
```

Expected: FAIL because `buildRunSummary` does not include Kanji Kombat report data.

- [ ] **Step 3: Add report summary support**

Modify `src/game/adventure-report.js`:

```javascript
if (run.mode === 'kanjiKombat') {
  return {
    mode: 'kanjiKombat',
    isVictory: run.kanjiKombat?.finalReport?.completedDaily === true,
    kanjiKombat: run.kanjiKombat?.finalReport || run.kanjiKombat?.report || {},
  };
}
```

Place this before regular run summary logic so Kanji Kombat does not expect normal area/run fields.

- [ ] **Step 4: Add frontend report rendering**

In the adventure report UI module, branch on `summary.mode === 'kanjiKombat'`:

```javascript
function renderKanjiKombatReport(summary) {
  const report = summary.kanjiKombat || {};
  return `
    <div class="adventure-report kanji-kombat-report">
      <h2>Kanji Kombat Report</h2>
      <div class="report-stat">Waves Cleared: ${report.wavesCleared || 0}</div>
      <div class="report-stat">Highest Streak: ${report.highestStreak || 0}</div>
      <div class="report-stat">Accuracy: ${report.accuracy || 0}%</div>
      <div class="report-stat">Cards Reviewed: ${report.cardsReviewed || 0}</div>
      <div class="report-stat">New Cards: ${report.newCardsIntroduced || 0}</div>
      <div class="report-stat">Script: ${report.scriptDeck || 'script'}</div>
      <div class="report-stat">Minibosses: ${report.minibossesDefeated || 0}</div>
    </div>
  `;
}
```

- [ ] **Step 5: Run report tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-report.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

```bash
/usr/bin/git add src/game/adventure-report.js public/js/ui/adventure-report.js tests/unit/game/kanji-kombat-report.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add Kanji Kombat adventure report

EOF
)"
```

## Task 9: Integration And Regression Verification

**Files:**
- Test: `tests/integration/flows/kanji-kombat.test.js`
- The tests from earlier tasks should remain green with the final API shapes.

- [ ] **Step 1: Write integration flow test**

Create `tests/integration/flows/kanji-kombat.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Kanji Kombat integration flow', () => {
  it('starts, answers a quiz, and keeps normal room state untouched', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const gm = new GameManager();
    gm.userId = 'kk-integration-user';
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
    };
    gm.kanjiKombatService.startRunWithCreatureId('hi');
    assert.equal(gm.run.mode, 'kanjiKombat');
    assert.equal(gm.combat.mode, 'kanjiKombat');

    const quiz = gm.run.kanjiKombat.currentQuiz;
    const correct = quiz.choices.find(choice => choice.correct);
    const result = gm.submitKanjiKombatAnswer(correct.id);

    assert.equal(result.actionType, 'kanjiKombat');
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.areasCompleted, 0);
    assert.equal(gm.run.postCombatShop == null, true);
  });
});
```

- [ ] **Step 2: Run Kanji Kombat test suite**

Run:

```bash
node --test \
  tests/unit/game/script-decks.test.js \
  tests/unit/game/script-srs.test.js \
  tests/unit/game/kanji-kombat-deck.test.js \
  tests/unit/game/kanji-kombat-run.test.js \
  tests/unit/game/kanji-kombat-wave.test.js \
  tests/unit/combat/kanji-kombat-action.test.js \
  tests/unit/routes/kanji-kombat-routes.test.js \
  tests/unit/ui/kanji-kombat-ui.test.js \
  tests/unit/game/kanji-kombat-report.test.js \
  tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 3: Run combat and Speed Review regressions**

Run:

```bash
node --test \
  tests/unit/combat/combat-cycle-action-cursor.test.js \
  tests/unit/combat/combat-cycle-payload.test.js \
  tests/unit/combat/creature-combat-service.test.js \
  tests/unit/known-words-review.test.js
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit Task 9**

```bash
/usr/bin/git add tests/integration/flows/kanji-kombat.test.js tests/unit
/usr/bin/git commit -m "$(cat <<'EOF'
Cover Kanji Kombat integration flow

EOF
)"
```

## Task 10: Visual Verification

**Files:**
- No planned source edits unless visual verification reveals a defect.
- If CSS changes are needed, modify `public/game.css` and rerun visual verification.

- [ ] **Step 1: Ask before launching Playwright**

Ask the user for permission to open Playwright, because project rules require asking before browser sessions.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev
```

Expected: Vite dev server starts and serves `http://localhost:5173`.

- [ ] **Step 3: Verify server health**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 4: Playtest visible flow**

Using Playwright after user approval:

1. Navigate to `http://localhost:5173`.
2. Inject safe-area CSS:

```javascript
await page.addStyleTag({ path: 'public/dev-safe-area.css' });
```

3. Reach hub.
4. Confirm `Kanji Kombat` button is visible.
5. Start Kanji Kombat with one unlocked creature.
6. Confirm the action area shows either a new-card modal or 4-choice quiz.
7. Answer a quiz correctly and verify an ally attack animates.
8. Answer a quiz incorrectly and verify no ally attack occurs before turn order advances.
9. Force or play to wave clear and verify next wave starts without post-combat shop.
10. Capture screenshots at the hub button, quiz, and report states.

- [ ] **Step 5: Delete screenshots immediately**

Run:

```bash
rm -f tmp/kanji-kombat-*.png
```

Expected: no screenshot files remain in the repo.

- [ ] **Step 6: Final verification**

Run:

```bash
node --check public/js/ui/kanji-kombat.js
node --check public/game.js
npm test
```

Expected: all pass.

- [ ] **Step 7: Commit visual fixes if any**

Only if visual verification required source changes:

```bash
/usr/bin/git add public/game.css public/js/ui/kanji-kombat.js public/game.js
/usr/bin/git commit -m "$(cat <<'EOF'
Polish Kanji Kombat visual flow

EOF
)"
```

## Self-Review Checklist

- Spec coverage:
  - `script` deck separation: Task 1.
  - Legacy `kana` migration: Task 1.
  - FSRS due/new cadence and no double grading: Task 2.
  - Special run mode and suppressed run side effects: Tasks 3 and 5.
  - Server-owned synthetic/no-op combat actions: Task 4.
  - Wave lifecycle without normal victory cleanup: Task 5.
  - API routes: Task 6.
  - Hub button, new-card modal, and quiz UI: Task 7.
  - Adapted adventure report: Task 8.
  - Regression and visual verification: Tasks 9 and 10.
- Type consistency:
  - Mode marker is `kanjiKombat`.
  - SRS deck name is `script`.
  - Public service entry points are `startRunWithCreatureId`, `submitIntroChoice`, and `submitAnswer` on `KanjiKombatService`, with `GameManager` delegates wrapping them.
  - API endpoints live under `/api/game/kanji-kombat`.
- Required verification before completion:
  - Kanji Kombat targeted tests.
  - Combat action cursor regressions.
  - `npm test`.
  - Visual verification screenshots after user approves Playwright.
