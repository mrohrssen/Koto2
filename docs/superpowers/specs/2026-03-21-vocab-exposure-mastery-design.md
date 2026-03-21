# Vocab Exposure Tracking & Mastery-Gated English Display

**Date:** 2026-03-21
**Status:** Design

## Problem

Players see Japanese words with English translations throughout gameplay but have no structured path from "seeing a word with training wheels" to "knowing it without English." English translations are always shown for unknown words with no mechanism to test recall or remove the crutch.

## Solution

Track every time a Japanese word is shown alongside its English meaning. After 5 exposures, queue the word for speed review using FSRS scheduling. If the player passes the review, hide English for that word going forward. If they fail, re-expose 5 more times and test again. FSRS manages increasing review intervals so mastered words resurface at optimal spacing.

## Design

### Exposure Tracking (Client)

**Existing infrastructure (already built):**
- `bootstrap-client.js` has `_pendingExposures` Set and `flushExposures()` that POSTs to `/api/game/known-words/expose`
- `renderEnFirst()` already adds words to `_pendingExposures` when it shows English for an unknown word
- `_knownWords` Set already gates whether English is shown in both `renderJpFirst()` and `renderEnFirst()`

**Change needed:**
- `renderJpFirst()` must also add words to `_pendingExposures` when it renders English (line 73-75 shows the condition `!_knownWords.has(kanji) && english` — when this is true, add `kanji` to `_pendingExposures`)
- Route the ~14 remaining surfaces that bypass `renderJpFirst()` through it (creature names in popups, target select, shop cards, etc. — see "Rendering Surfaces" section below)

**Flush triggers (no change needed):** `flushExposures()` is already called at appropriate points. Any new call sites added as rendering surfaces are consolidated will naturally flush.

### Exposure Tracking (Server)

**Existing infrastructure (already built):**
- `POST /api/game/known-words/expose` receives word arrays and calls `registerExposure(wk, word)` for each
- `word-knowledge-{userId}.json` stores `seen[word].exposures` count per word

**Change needed:**
- After incrementing exposures, check if `exposures >= 5` (or `>= 5` since last failed review — see "Exposure Reset" below)
- If threshold met and no FSRS vocab card exists (or card needs reactivation after failure), create/update an FSRS vocab card with `due: now`

### FSRS Vocab Cards

**Existing infrastructure:** `internal-srs.js` implements FSRS for hiragana using `ts-fsrs` library. The data lives in `srs-{userId}.json` under a `kana` key.

**Storage:** Add a `vocab` key alongside `kana` in the same file:

```js
// srs-{userId}.json
{
  "kana": { "cards": [ /* existing hiragana cards */ ] },
  "vocab": { "cards": [ /* new vocabulary cards */ ] }
}
```

**Important: `loadSrsData()` and `saveSrsData()` must be extended.** The existing functions only serialize/deserialize `data.kana.cards` dates. They must also handle `data.vocab.cards` — serialize `due` and `last_review` Date objects to ISO strings on save, and deserialize them back on load. Without this, vocab card dates will be lost on server restart.

**Vocab card shape:**

```js
{
  word: "かいふく",           // The Japanese word (hiragana at this stage)
  meaning: "recovery",       // English meaning (for display on review card back)
  reading: "かいふく",        // Reading (same as word at this stage, no kanji)
  // --- FSRS fields (from createEmptyCard()) ---
  due: Date,
  stability: number,
  difficulty: number,
  elapsed_days: number,
  scheduled_days: number,
  reps: number,
  lapses: number,
  learning_steps: number,
  state: 0|1|2,              // State.New | State.Learning | State.Review
  last_review: Date
}
```

**FSRS interaction patterns** (following the existing kana implementation in `internal-srs.js`):

```js
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

const scheduler = fsrs();

// --- Creating a new vocab card ---
const emptyCard = createEmptyCard();  // Returns { due: now, stability: 0, ... }
const vocabCard = {
  word: "かいふく",
  meaning: "recovery",
  reading: "かいふく",
  ...emptyCard,   // Spread FSRS fields: due, stability, difficulty, etc.
};
// Card is immediately due (due = now), state = State.New

// --- Grading a review ---
const GRADE_MAP = {
  again: Rating.Again,   // Failed — FSRS resets to learning, increments lapses
  good: Rating.Good,     // Passed — FSRS advances interval
};

// Build clean FSRS card object for scheduler
const fsrsCard = {
  due: card.due instanceof Date ? card.due : new Date(card.due),
  stability: card.stability || 0,
  difficulty: card.difficulty || 0,
  elapsed_days: card.elapsed_days || 0,
  scheduled_days: card.scheduled_days || 0,
  reps: card.reps || 0,
  lapses: card.lapses || 0,
  learning_steps: card.learning_steps || 0,
  state: card.state || 0,
  last_review: card.last_review ? new Date(card.last_review) : undefined,
};

const result = scheduler.repeat(fsrsCard, new Date());
const updatedCard = result[Rating.Good].card;   // or result[Rating.Again].card
// Merge updatedCard fields back, preserving word/meaning/reading

// --- Querying due cards ---
const now = new Date();
const dueCards = data.vocab.cards.filter(c => {
  const dueDate = c.due instanceof Date ? c.due : new Date(c.due);
  return dueDate <= now;
});

// --- Serialization (same pattern as kana) ---
// Dates must be serialized to ISO strings for JSON storage
// and deserialized back to Date objects on load
```

**Key FSRS behaviors (verified against ts-fsrs library):**

Rating enum: `Again=1, Hard=2, Good=3, Easy=4` (numeric values, also used as result keys).
State enum: `New=0, Learning=1, Review=2, Relearning=3`.

Card lifecycle (verified simulation):
```
Step 0: createEmptyCard()     → state=New,        due=now
Step 1: grade Good            → state=Learning,   due=+10min,   reps=1, lapses=0
Step 2: grade Good            → state=Review,     due=+2 days,  reps=2, lapses=0
Step 3: grade Good            → state=Review,     due=+11 days, reps=3, lapses=0
Step 4: grade Again (fail!)   → state=Relearning, due=+10min,   reps=4, lapses=1
Step 5: grade Good (recover)  → state=Review,     due=+2 days,  reps=5, lapses=1
```

Key details:
- `scheduler.repeat(card, now)` returns object keyed by Rating numeric value. Access as `result[Rating.Good].card`.
- `Rating.Again` → card goes to Learning (from New) or Relearning (from Review). `lapses` increments only from Review→Relearning.
- `Rating.Good` from New → Learning (NOT directly to Review). Needs **two** Good grades to reach Review state.
- A newly created card (`createEmptyCard()`) has `state: State.New`, `due: now` — immediately available for review.
- `card.lapses` tracks total lifetime failures.
- `card.learning_steps` increments with each grade (starts at 0, becomes 1 after first grade).
- Dates must be serialized to ISO strings for JSON storage and deserialized back to Date objects on load (same pattern as kana).

**Existing kana code patterns are verified correct:** `GRADE_MAP = { again: Rating.Again, good: Rating.Good }` works because `result[1]` and `result[Rating.Again]` reference the same object.

### Unified SRS Library

**Do NOT create separate SRS systems for kana and vocab.** Refactor `internal-srs.js` into a single generalized system where kana and vocab are both "decks" — collections of FSRS cards with deck-specific metadata. The core FSRS operations (create card, grade card, query due cards, serialize/deserialize) should be deck-agnostic.

**Architecture:**

```
internal-srs.js (unified)
├── Generic deck operations (work with any deck)
│   ├── createCard(userId, deckName, cardId, metadata)
│   ├── gradeCard(userId, deckName, cardId, grade)
│   ├── getDueCards(userId, deckName)
│   ├── getDueCount(userId, deckName)
│   └── getCard(userId, deckName, cardId)
│
├── Kana-specific helpers (thin wrappers)
│   ├── initKanaDeck(userId)        — seeds 71 hiragana cards
│   ├── getNextKanaCard(userId)     — filters by unlocked rows
│   └── getKanaStats(userId)        — includes graduation logic
│
└── Vocab-specific helpers (thin wrappers)
    ├── createVocabCard(userId, word, meaning, reading)
    └── reviewVocabCard(userId, word, grade)
        → On 'again': also resets exposure counter in word-knowledge
        → On 'good': marks word as mastered in word-knowledge
```

**Storage stays the same** — `srs-{userId}.json` with deck keys:

```js
{
  "kana": { "cards": [ ... ] },
  "vocab": { "cards": [ ... ] },
  // future decks (kanji, grammar, etc.) just add keys
}
```

**The refactor:** Extract the common FSRS patterns from the existing kana functions (`reviewKanaCard`'s card-building, grading, and merging logic) into generic deck operations. The kana-specific logic (row unlocking, graduation checks) stays as thin wrappers that call the generic layer. Vocab functions are also thin wrappers. This means adding a third deck type in the future is just adding a new key and optional helpers — no new FSRS plumbing.

**Card identity:** Each deck uses its own ID field — kana uses `char`, vocab uses `word`. The generic layer takes a `cardId` parameter and a `findFn` to locate cards in the deck's array.

### Mastery State

A word is **mastered** after its first "good" grade in speed review — English is hidden immediately. The FSRS learning steps will bring the card back quickly (~10 min) for reinforcement, and if the player fails the follow-up, English returns. This means:
- English is hidden in `renderJpFirst()` and `renderEnFirst()`
- The word is added to `_knownWords` on the client

**Implementation:** The simplest approach — when a vocab card is graded "good", add the word to the `known` map in `word-knowledge-{userId}.json` via `markKnown(wk, word)`. This is already the mechanism that `_knownWords` is populated from. No new mastery tracking field needed.

**Un-mastery on failure:** When a vocab card is graded "again" in a future review:
- Remove the word from the `known` map in word-knowledge (requires a new `unmarkKnown(wk, wordId)` function in `word-knowledge.js` — `delete wk.known[wordId]`)
- Reset `seen[word].exposures` to 0 (or add an `exposuresSinceLastReview` field)
- English starts showing again in gameplay
- After 5 more exposures, card becomes due again

### Exposure Reset Strategy

Two options for tracking "5 exposures since last failure":

**Option A (simpler): Reset `exposures` to 0 on failure.** Total lifetime exposure count is lost, but we don't need it. The exposure field becomes "exposures since last review."

**Option B: Add `exposuresSinceLastReview` field.** Keep total `exposures` for analytics, use new field for the threshold check.

**Recommendation: Option A.** We don't currently use total lifetime exposures for anything, and FSRS `lapses` already tells us how many times a word was failed. Keep it simple.

### Speed Review Changes

**Data source swap:**
- Replace `/api/vocab/due-words` (JPDB) → new endpoint `/api/vocab/due-words` (internal FSRS)
- The endpoint calls `getVocabDueCards(userId)` and returns cards in the same shape the speed review UI expects: `{ word, reading, meanings }`
- `meanings` becomes `[card.meaning]` (array with single string, matching existing format)

**Grading swap:**
- Replace JPDB grade submission → call `reviewVocabCard(userId, word, grade)`
- On success: server marks word as known, client adds to `_knownWords`
- On failure: server resets exposures, client removes from `_knownWords`

**Stub out JPDB:** Keep existing JPDB review code but don't call it. The speed review UI itself (`speed-review.js`) needs minimal changes — just different callbacks for fetching words and submitting grades.

### Hub Badge

- New endpoint `GET /api/vocab/due-count` → returns `{ count: N }` from `getVocabDueCount(userId)`
- Hub UI fetches on load and displays `(N)` next to speed review button when N > 0
- Same visual pattern as the upgrades tab badge

### Client-Side Known Words Loading

**Existing flow:** Game state load → `GET /api/game/known-words` → returns `Object.keys(wk.known)` → client calls `setKnownWords(words)`.

**Change:** The `known` map now includes words mastered through speed review (via `markKnown()`). No change needed to this loading flow — it already works.

**Change on review completion:** After a successful speed review grade, the client must add the word to `_knownWords` immediately (don't wait for full game state reload). After a failed review grade, remove it.

### Rendering Surfaces to Consolidate

These locations currently render Japanese + English without going through `renderJpFirst()` and need to be updated. Search for the pattern described to find the exact lines (line numbers drift):

| File | Context | Current Pattern | What to Change |
|------|---------|-----------------|----------------|
| `creature-row.js` | Creature popup title | `${creature.name} (${creature.nameEn})` | Use `renderJpFirst(creature.name, creature.baseReading, creature.nameEn)` |
| `creature-row.js` | Popup move list | `${m.name} (${m.nameEn})` | Use `renderJpFirst(m.name, m.reading, m.nameEn)` |
| `creature-row.js` | Popup equipment list | `${item.word} (${item.nameEn})` | Use `renderJpFirst(item.word, item.reading, item.nameEn)` |
| `target-select.js` | Target creature name | Separate divs: `target.name` + `target.nameEn` | Use `renderJpFirst()` in single element |
| `post-combat-shop.js` | Creature target selection | `${c.baseReading} (${c.nameEn})` | Use `renderJpFirst()` |
| `exploration.js` | Friendly NPC item card | Separate divs: `item.word` + `item.nameEn` | Use `renderJpFirst()` |
| `exploration.js` | Friendly NPC creature target | Separate divs: `creature.name` + `creature.nameEn` | Use `renderJpFirst()` |
| `exploration.js` | Shrine upgrade creature card | `${creature.nameEn} Lv.${creature.level}` | Use `renderJpFirst()` + level |
| `combat-loop.js` | Multi-enemy picker buttons | `${r.nameEn} (Lv${r.level})` | Use `renderJpFirst()` + level |

**Surfaces that show English-only (no Japanese alongside) — no change needed:**
- `creature-row.js` — reserve swap and rearrange buttons (`nameEn` only)
- `economy.js` — dealer buy/sell cards (`nameEn` only)
- `move-select.js` — active creature turn label (`nameEn` only)
- `combat-loop.js` — befriend confirmation text (`nameEn` only)

**Surfaces already using `renderJpFirst()` — just need exposure tracking added (already covered by the `renderJpFirst` change):**
- `move-select.js` — move cells
- `move-learn.js` — move learn prompt, replacement list
- `target-select.js` — move target header
- `combat-loop.js` — split attack cards (base word + skill name)
- `post-combat-shop.js` — shop item cards, item help popup
- `creature-row.js` — popup subtitle (base word + modifier)

### What's NOT Changing

- **Speed review UI/UX** — flashcard flip, swipe, undo window, 3-card layout all stay the same
- **Room-mode speed review** — untouched, hub-mode only
- **Kana FSRS** — completely independent, no changes
- **Word discovery tracking** (`word-tracking.js`) — separate system for daily limits, untouched
- **Whack-a-mole** — shows word + reading only (no English), not an exposure surface
- **Combat flashcards** (`actions.js`) — these are the JPDB vocab cards in combat, separate system

## Testing Strategy

- **Unit tests:** FSRS vocab card creation, grading, due-date queries, exposure threshold triggering, mastery/un-mastery state transitions, exposure reset on failure
- **Integration tests:** Expose endpoint → threshold check → card creation flow; review endpoint → mastery state → known-words response
- **Manual playtest:** Verify English hides after 5 exposures + successful review; verify English returns after failed future review
