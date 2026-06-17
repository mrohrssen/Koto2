# Kanji Kombat FSRS Due Order Design

**Date:** 2026-06-16
**Status:** Draft for user review
**Feature:** Correct Kanji Kombat script-card scheduling

## Summary

Kanji Kombat already uses FSRS to grade script cards and write each card's next `due` timestamp. The bug is in prompt selection: due cards are filtered but then consumed in static deck order, and the active deck can advance past hiragana or katakana once every card has been reviewed once. That means FSRS can mark a kana card due while Kanji Kombat shows a later static card, a new card, or a later script deck instead.

The fix is to make Kanji Kombat selection consume FSRS scheduling directly: build one eligible due queue across all non-skipped script cards, sort by earliest `due`, and show the earliest due card first. New-card introductions happen only when that due queue is empty.

## Goals

- Always show the eligible script card with the earliest FSRS `due` timestamp.
- Include due hiragana, katakana, and kanji cards in the same due queue.
- Keep onboarding skip preferences as hard exclusions for hiragana and katakana.
- Preserve curriculum order for introducing new cards when no eligible cards are due.
- Cover prompt-buffer planning so prefilled Kanji Kombat prompts follow the same ordering.

## Non-Goals

- Do not change FSRS parameters or the FSRS grading algorithm.
- Do not replace `ts-fsrs` or add another scheduler dependency.
- Do not change quiz UI, combat resolution, streaks, rewards, or prompt-buffer protocol.
- Do not edit Japanese dictionary or static card content.
- Do not change Speed Review scheduling.

## Findings

The installed package is `ts-fsrs@5.2.3`. It provides card-level scheduling APIs such as `repeat`, `next`, `get_retrievability`, `forget`, `rollback`, and `reschedule`, but it does not provide a deck-level "choose next card" helper.

Kanji Kombat should therefore use the FSRS-owned card fields already stored in the script deck. The key field for this bug is `due`: FSRS writes it after every review, and earliest due is the selection rule the mode should honor.

`get_retrievability(card, now, false)` is not part of this fix. It answers a different question: estimated recall probability. The desired behavior is earliest due.

## Current Failure Modes

Due cards are not sorted by FSRS due time. `getDueScriptCards()` filters by `due <= now`, but returns cards in persisted static deck order. `chooseNextScriptWork()` takes `dueCards[0]`, so `hiragana:あ` can appear before `hiragana:い` even when `い` is more overdue.

Kana due reviews can be skipped after every card has been reviewed once. `getActiveScriptType()` treats a script type as complete when every card is in FSRS `State.Review`. For kana, that can move the active type to katakana or kanji, so later-due hiragana or katakana cards no longer participate in selection.

## Scheduling Design

Kanji Kombat should separate "which cards are eligible for due review" from "which deck should introduce the next new card."

Eligible due-review types:

1. Start with `hiragana`, `katakana`, and `kanji`.
2. Remove `hiragana` if onboarding has `knowsHiragana === true`.
3. Remove `katakana` if onboarding has `knowsKatakana === true`.
4. Never remove a type because it is graduated or because all cards have been reviewed once.

Due card selection:

1. Gather cards from all eligible types.
2. Keep cards with `reps > 0` and `due <= now`.
3. Exclude cards already reserved in the prompt buffer.
4. Sort by `due` ascending.
5. Use `type` curriculum order, then `sortIndex`, then `id` only as deterministic tie-breakers.
6. Return the first card as the next quiz.

This means a due hiragana card can appear while the player is also learning katakana or kanji. That is intentional: FSRS due reviews outrank script-deck progression.

## New-Card Design

New cards are still introduced only when no eligible card is due.

New-card type selection remains curriculum ordered:

1. Hiragana, unless skipped by `knowsHiragana`.
2. Katakana, unless skipped by `knowsKatakana`.
3. Kanji.

Within the chosen type, use the first unreviewed card by static curriculum order. A card is new when `reps === 0`.

This keeps first exposure simple and predictable while allowing earlier decks to return later through the global due queue.

Daily new-card limits are unchanged. The existing `DAILY_NEW_LIMIT` applies across Kanji Kombat introductions for the local day.

## Data Flow

`chooseNextScriptWork()` becomes the single scheduling caller for Kanji Kombat:

1. Resolve onboarding preferences.
2. Ask `script-srs` for eligible due cards across all non-skipped script types.
3. If due cards exist, build a quiz for the earliest due card.
4. If due cards do not exist, apply the existing intro cadence and daily limit.
5. If an intro is allowed, choose the next new card in curriculum order.
6. If no due or new work is available, show the daily completion prompt.

`fillKanjiKombatPromptBuffer()` keeps passing excluded card ids into scheduling. The new due selector must respect those exclusions so a runway does not duplicate a reserved card before it has been answered.

## Edge Cases

If the user said they already know hiragana, hiragana cards are excluded from due and new-card selection. The same applies to katakana. This is a preference-level skip, not a mutation of SRS data.

If old SRS data exists for a skipped deck, the skipped deck still does not appear while the preference remains true. If the preference later becomes false, the existing SRS data can participate again.

If all non-skipped cards are future-due and the daily new-card cap is exhausted, Kanji Kombat shows the existing completion prompt.

If two cards have the exact same `due`, deterministic tie-breakers keep tests stable without changing the main FSRS behavior.

## Testing Plan

Add unit coverage for the script scheduler and Kanji Kombat deck controller:

- Two due cards in reverse static order choose the earliest `due`.
- Due hiragana is chosen even when every hiragana card is in `State.Review` and katakana would otherwise be active.
- Due katakana is chosen after katakana has been fully reviewed once.
- `knowsHiragana === true` excludes hiragana due cards.
- `knowsKatakana === true` excludes katakana due cards.
- When no due cards exist, new cards are introduced in curriculum order with onboarding skips respected.
- Prompt-buffer fill reserves card ids and continues earliest-due ordering without duplicates.

Run focused tests first:

```bash
node --test tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Then run the broader unit suite:

```bash
npm run test:unit
```
