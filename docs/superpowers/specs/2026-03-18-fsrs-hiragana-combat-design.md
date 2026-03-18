# FSRS Hiragana Combat Mode — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Problem

Players who don't know hiragana can't meaningfully interact with the vocabulary combat system. The game currently assumes kana literacy — there's no onramp for true beginners. These players need to learn the ~71 hiragana characters before Japanese vocabulary has any meaning.

## Solution

A separate FSRS-powered hiragana learning track integrated into a simplified auto-attack combat mode. Players review one hiragana flash card per creature per round; the Translator device handles combat commands automatically until the player graduates.

---

## Components

### 1. FSRS Service (`src/game/internal-srs.js`)

New file wrapping the `ts-fsrs` npm package. Manages hiragana card scheduling and persistence.

**Responsibilities:**
- `loadSrsData(userId)` / `saveSrsData(userId)` — read/write `data/srs-{userId}.json`
- `initKanaDeck(userId)` — seed all 71 hiragana cards as FSRS "new" cards
- `getNextKanaCard(userId)` — return most overdue card via FSRS retrievability. If no cards are due, return the card with lowest retrievability. Always returns a card (combat needs one).
- `reviewKanaCard(userId, char, grade)` — feed rating to ts-fsrs, update card scheduling, persist
- `getKanaStats(userId)` — mastery %, cards due, unlocked count

**Persistence:** `data/srs-{userId}.json`

```javascript
{
  kana: {
    cards: [
      {
        char: "か",
        romaji: "ka",
        row: 1,              // unlock group (0=あ row, 1=か row, etc.)
        // All ts-fsrs Card fields stored directly:
        due, stability, difficulty, elapsed_days,
        scheduled_days, reps, lapses, state, last_review
      }
    ]
  }
  // Future: vocab section for when FSRS replaces JPDB
}
```

**Grade mapping:** Swipe left → `Rating.Again` (1), swipe right → `Rating.Good` (3). Binary only — no Hard/Easy distinction.

**Row-based unlock:** Cards unlock in rows of 5. Row 0 (あ row) is always unlocked. Subsequent rows unlock when all cards in the previous row have been reviewed at least once (FSRS state >= Learning). This prevents dumping 71 new cards on day one.

### 2. Hiragana Deck Data

71 cards organized by row. Static data embedded in the service or a small data file.

```
Row 0:  あa いi うu えe おo
Row 1:  かka きki くku けke こko
Row 2:  さsa しshi すsu せse そso
Row 3:  たta ちchi つtsu てte とto
Row 4:  なna にni ぬnu ねne のno
Row 5:  はha ひhi ふfu へhe ほho
Row 6:  まma みmi むmu めme もmo
Row 7:  やya ゆyu よyo (3 cards)
Row 8:  らra りri るru れre ろro
Row 9:  わwa をwo んn (3 cards)
Row 10: がga ぎgi ぐgu げge ごgo
Row 11: ざza じji ずzu ぜze ぞzo
Row 12: だda ぢji づzu でde どdo
Row 13: ばba びbi ぶbu べbe ぼbo
Row 14: ぱpa ぴpi ぷpu ぺpe ぽpo
```

**Not in MVP:** Combination kana (きゃ kya, しゅ shu, etc.). Can be added as a second deck later.

### 3. Onboarding — Cid Dialogue

Hardcoded branch in the Cid intro sequence (not AI-generated — this gates a mechanical system).

```
Cid: "Do you know our local alphabet, Hiragana?"

  → "Yes, I already know Hiragana"
      → normal combat (current behavior)

  → "No, teach it to me!"
      → Cid: "Ah...I see. Here, let me set up your Translator!
         In the future you'll be able to command your creatures
         using native Japanese, but right now I've just set the
         Translator to prioritize teaching you Hiragana. Now you'll
         just worry about learning Hiragana and your Translator will
         handle the commands until you get the hang of things."
      → sets player.kanaMode = true
```

**State:** `kanaMode` added to meta-progression state (`createMetaProgression()` in `src/game/state.js`). This is a cross-run preference — a player who chooses "teach me hiragana" stays in kana mode across runs. Defaults to `false`.

**Trigger point:** The hiragana question is a new branching scene appended to the prologue sequence. The prologue is served from `/api/game/prologue` as a JSON array of scenes — the hiragana question is added as a scene with a `choices` array. The `playPrologue()` frontend loop needs a branch to handle choice scenes (display buttons, send selection back, apply state change). This is the only branching scene in the prologue for now.

### 4. Combat Integration

When `player.kanaMode === true`, the combat loop replaces move selection + vocab cards with the kana review flow.

**Normal flow (unchanged):**
```
startMoveSelection() → player picks moves for each creature
  → vocab card flip/swipe
  → executeCreatureMovesTurn(moveChoices)
  → split attack cards → enemy turn → next round
```

**Kana mode flow:**
```
Round start:
  Phase 1 — Kana reviews (replaces startMoveSelection):
    New function startKanaCombatRound() replaces startMoveSelection().
    For each living creature (index 0, 1, 2):
      → fetch next due kana card from FSRS
      → showFlashCards([{word: "か", reading: "ka", meanings: ["ka"]}])
        (existing single-card swipe UI)
      → on swipe: record review via FSRS (again or good)
      → collect moveChoice: creature index, cheapest move, first living enemy

  Phase 2 — Execute all attacks (single API call):
    → executeCreatureMovesTurn(allMoveChoices)
      (one POST to /api/game/creature-combat-cycle with all choices)
    → display split attack cards sequentially (normal rendering)
    → enemy turn runs in same API response (normal)

  Next round
```

**Integration point:** `startKanaCombatRound()` is a new function in `combat-loop.js`. The existing round-start logic checks `meta.kanaMode` — if true, calls `startKanaCombatRound()` instead of `startMoveSelection()`. Everything downstream of `executeCreatureMovesTurn()` is unchanged.

**Key behaviors:**
- 1 kana review = 1 creature attack. Reviews match party size (1-3 per round).
- All reviews happen first, then all attacks execute in one batch API call. Split attack cards display sequentially after.
- KO'd creatures are skipped (no review, no attack).
- Target is always the first living enemy. Deterministic, no targeting UI.
- If a creature can't afford any single-target move (out of MP), it defends instead (existing defend action — `executeCreatureDefendThenPause()` pattern).

**Cheapest move selection:**
```javascript
function pickCheapestSingleTargetMove(creature) {
  return creature.moves
    .filter(m => m.target === 'single_enemy' && creature.mp >= m.mpCost)
    .sort((a, b) => a.mpCost - b.mpCost)[0];
}
```

**Reuse from existing code:**
- `showFlashCards([word])` single-card mode (actions.js) — feed kana shaped as word object
- Auto-target selection logic (combat-loop.js:680-689)
- `executeCreatureDefendThenPause()` pattern (combat-loop.js:1772-1844) — template for auto-attack
- Backend combat cycle endpoint — unchanged, receives moveChoices as normal
- Defend action fallback when out of MP

### 5. API Endpoints

Two new endpoints under `/api/game/`. Thin wrappers around `ts-fsrs` — request/response shapes follow the library's API surface. Auth via existing JWT middleware.

**`GET /api/game/kana-card`** — Returns next due hiragana card for review.

**`POST /api/game/kana-review`** — Records a review result (`char` + `grade`). Returns updated card scheduling from ts-fsrs plus kana stats.

### 6. Graduation

**Trigger:** All 71 cards reach FSRS state `Review` (exited learning phase, on stable review intervals).

**What happens:** After combat ends, check kana stats. If all cards graduated:

> Cid: "Incredible progress! You've learned the entire Hiragana alphabet. I've upgraded your Translator — from now on, you'll be able to command your creatures directly using Japanese vocabulary!"

- `meta.kanaMode` set to `false`
- Normal combat activates from next encounter
- Kana cards continue on FSRS schedule in the background. A dedicated kana practice mode is **out of scope for this MVP** — it can be added later as a standalone review screen.

**Manual exit:** Toggle kanaMode off in settings anytime. No dialogue, immediate switch.

**Re-entry:** Toggle back on in settings if desired.

---

## FSRS ↔ JPDB Relationship

FSRS runs as a **separate kana track** alongside JPDB:

| Concern | FSRS | JPDB |
|---|---|---|
| Hiragana scheduling | Primary | — |
| Vocab scheduling (future) | Not yet | Primary |
| In-game content selection | Not yet | Via vocab-manager |
| External flashcard review | — | Primary |

This is a stepping stone. FSRS may eventually absorb JPDB's vocab role, but that's a separate design.

---

## What Doesn't Change

- Backend combat cycle endpoint (receives moveChoices as normal)
- Split attack card rendering
- Enemy AI / enemy turn logic
- Creature stats, XP, leveling
- Move data structures
- Normal combat mode (kanaMode=false)
- JPDB integration
- Vocab-manager / word-practice systems

---

## Dependencies

- `ts-fsrs` npm package (TypeScript FSRS-5 implementation from open-spaced-repetition) — must be installed: `npm install ts-fsrs`
