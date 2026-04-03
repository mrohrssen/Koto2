# Vocab Exposure Mastery — Port to Current Dev

**Date:** 2026-04-03
**Branch:** `feature/vocab-exposure-mastery` (worktree at `/root/koto-wt-vocab-mastery`)
**Approach:** Cherry-pick backend, rebuild frontend wiring

## Summary

Port the vocab exposure mastery system from the stale `feature/vocab-exposure-mastery` worktree to current `dev`. The backend (FSRS generic deck ops, word-knowledge changes, route handlers) applies cleanly since dev hasn't touched those files. The frontend wiring must be rebuilt against current code (pixi.js battle stage, formation system, etc.).

**Core loop:** Player sees a word's English 5 times → FSRS vocab card auto-created → card becomes due → hub speed review grades it → mastery gates future English display. Failed review un-masters the word and resets exposures.

## What Changes

### 1. Backend — Cherry-pick from worktree (clean apply)

**`src/game/internal-srs.js`** — Add generic deck operations alongside existing kana functions:
- `getDeckCards(userId, deckName)` — get/initialize cards for any deck
- `createCard(userId, deckName, cardId, metadata)` — idempotent card creation with FSRS defaults
- `gradeCard(userId, deckName, cardId, grade)` — grade card, preserve non-FSRS metadata
- `getDueCards(userId, deckName)` — filter cards where `due <= now`
- `getDueCount(userId, deckName)` — count of due cards
- `buildFsrsCard(card)` — helper to extract/default FSRS fields from stored card
- `FSRS_FIELDS` Set — separates scheduler fields from card metadata
- **Modify `loadSrsData`/`saveSrsData`** — currently hardcode `data.kana.cards.map(serializeCard)`. Change to generic `Object.keys()` loop over all deck keys. Backward compatible — existing kana-only files load identically, but new vocab deck also gets serialized.

**`src/game/bootstrap/word-knowledge.js`** — Add `unmarkKnown(wk, wordId)`:
- Removes word from `wk.known` map (mastery reversal on failed review)

**`src/routes/game/known-words.js`** — Expand from 2 routes to 5:
- `POST /expose` — enhanced: accept `{ word, meaning }` objects (backward-compat with plain strings), auto-create FSRS vocab card at 5 exposures
- `POST /review` — **new**: grade vocab card (`good`/`again`), trigger mastery/un-mastery side effects
- `GET /due-count` — **new**: return `{ count }` for hub badge
- `GET /due-words` — **new**: return `{ words: [{ word, reading, meanings }] }` for speed review UI

### 2. Frontend — Rebuild against current code

**`public/js/ui/bootstrap-client.js`** — Minimal changes:
- `_pendingExposures`: `Set` → `Map<word, meaning>` (track meaning alongside word)
- `renderJpFirst()`: when showing English for unknown word, `_pendingExposures.set(kanji, english)`
- `renderEnFirst()`: same — `_pendingExposures.set(kanji, english)` instead of `.add(kanji)`
- `flushExposures()`: send `[{ word, meaning }]` instead of `["word"]`
- Export `addKnownWord(word)` — `_knownWords.add(word)` (client-side only, no server call)
- Export `removeKnownWord(word)` — `_knownWords.delete(word)` (client-side only, no server call)
- These keep the in-memory known-words set in sync after review responses so English hiding/showing updates immediately

**`public/js/api.js`** — Add 3 new API functions:
- `getVocabDueWords()` → `GET /api/game/known-words/due-words`
- `getVocabDueCount()` → `GET /api/game/known-words/due-count`
- `reviewVocabWord(word, grade)` → `POST /api/game/known-words/review`

**`public/game.js`** — Swap hub speed review data source:
- `sendReview` callback: currently `(vid, sid, grade, wordText) => apiSendJpdbReview(...)`. Change to call `reviewVocabWord(word, grade)` instead, mapping the numeric grade (1-4) to `'good'`/`'again'`. Then call `addKnownWord`/`removeKnownWord` based on response `mastered` field.
- `refreshQueue` callback: currently `apiGetDueWords(reviewedWords)`. Change to `getVocabDueWords()`.
- Hub button: `apiGetDueWords()` in exploration.js → `getVocabDueWords()`

**`public/js/ui/speed-review.js`** — Word shape adaptation:
- Line 129 gates `sendReview` on `word.vid !== undefined && word.sid !== undefined`. Internal FSRS cards don't have `vid`/`sid`.
- Change the guard to also fire for internal vocab cards. The simplest approach: internal cards set a `source: 'internal'` field, and the commit check becomes `word.vid !== undefined || word.source === 'internal'`.
- The `/due-words` endpoint must return words shaped for the speed review UI: `{ word, reading, meanings, source: 'internal' }` (no `vid`/`sid`).

### 3. Exposure Tracking Audit — All current rendering surfaces

These files already call `renderJpFirst()` and will automatically track exposures once the Set→Map change is made:

| File | What it renders |
|------|----------------|
| `combat-loop.js` | Move names, move descriptions, NPC dialogue |
| `move-select.js` | Move picker during combat |
| `creature-row.js` | Creature names (modifier + base word) |
| `post-combat-shop.js` | Shop item names/descriptions |
| `scene.js` | NPC role words, skill names |
| `speech-bubble.js` | Creature battle speech (already calls `addExposure` + `flushExposures`) |
| `narration-box.js` | Speaker names |
| `pvp-lobby.js` | PvP creature names |
| `move-learn.js` | Move learning screen |
| `room-transition.js` | NPC greetings |
| `i18n.js` | All `renderEnFirst` tagged text |
| `game.js` | Prologue narration, dialogue choices (`renderEnFirst`) |

**Flush points** (call `flushExposures()` but don't render words themselves):
- `economy.js` — flushes after shop rendering
- `speech-bubble.js` — flushes after bubble display

**Missing exposure tracking (needs adding):**
- `renderJpFirst()` currently does NOT add to `_pendingExposures` — this is the key fix. The worktree added this.
- `addExposure()` exists but is only used by `speech-bubble.js` — other `renderJpFirst` callers don't explicitly call it. Once `renderJpFirst` itself tracks, all callers get exposure tracking for free.

## Data Model

No new files — extends existing persistence:

**`data/srs-{userId}.json`** — adds `vocab` deck alongside `kana`:
```json
{
  "kana": { "cards": [...] },
  "vocab": {
    "cards": [
      {
        "id": "かいふく",
        "word": "かいふく",
        "meaning": "recovery",
        "reading": "かいふく",
        "due": "2026-04-03T...",
        "stability": 2.5,
        "difficulty": 5.2,
        "reps": 2,
        "lapses": 0,
        "state": 2,
        "last_review": "2026-04-03T..."
      }
    ]
  }
}
```

**`data/word-knowledge-{userId}.json`** — no schema change, just `unmarkKnown` removes entries from `known` map.

## Mastery Lifecycle

```
Word unseen
  ↓ (English displayed in any renderJpFirst/renderEnFirst call)
Word exposed (exposures: 1..4)
  ↓ (5th English exposure)
FSRS vocab card created (due: now)
  ↓ (player opens hub speed review)
Card reviewed: grade "good"
  → markKnown(word) → English hidden in future renders
  → FSRS schedules next review (stability grows, interval lengthens)
Card reviewed: grade "again"
  → unmarkKnown(word) → English shown again
  → exposures reset to 0 → must see 5x again before card becomes due
  → FSRS card is NOT deleted — it persists with incremented lapses
  → createCard() is idempotent, so hitting 5 exposures again reuses the existing card

Subsequent review cycle (card comes due again after successful review):
  grade "good" → markKnown stays, FSRS extends interval further
  grade "again" → same un-mastery flow as above (reset exposures, show English)
```

## Testing

Port the 3 test suites from the worktree:
- `tests/unit/game/internal-srs.test.js` — generic deck ops (create, grade, due, serialization)
- `tests/unit/game/vocab-srs.test.js` — exposure threshold, review grading, full lifecycle
- `tests/unit/word-knowledge.test.js` — `unmarkKnown`, exposure reset

## Non-Goals

- **Minimal changes to speed-review.js** — only the `vid`/`sid` guard at line 129 needs to also accept `source: 'internal'` cards
- **No JPDB removal** — JPDB remains for word suggestion/vocab sourcing; internal FSRS handles review scheduling
- **No new pixi.js rendering** — exposure tracking hooks into existing `renderJpFirst`/`renderEnFirst` text helpers, not the pixi canvas
