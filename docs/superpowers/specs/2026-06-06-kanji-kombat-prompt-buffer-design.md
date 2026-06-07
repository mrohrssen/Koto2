# Kanji Kombat Prompt Buffer Design

**Date:** 2026-06-06
**Status:** Draft for user review
**Feature:** Server-prepared prompt buffering for faster Kanji Kombat card flow

## Summary

Kanji Kombat should stop waiting on the server to choose the next script prompt after every answer or intro choice. The server will prepare a rolling buffer of fully built prompts, and the browser will consume that buffer locally while commits sync in the background.

The design follows the Speed Review performance pattern: Speed Review fetches a queue once, fills visible cards from local memory, commits reviews later, and periodically refreshes. Kanji Kombat needs a stricter version because prompt selection depends on FSRS state, daily new-card limits, no-due discovery batches, intro cadence, completion prompts, and combat action verification. The server therefore remains the only prompt selector, but the client gets a short local runway.

## Goals

- Keep five fully built Kanji Kombat prompts ready on the client.
- Refill the prompt buffer in the background when fewer than three prompts remain.
- Let the client validate and teach quiz answers instantly from server-prepared choices.
- Keep FSRS grading, daily new-card count, intro cadence, completion state, streaks, and combat state server-authoritative.
- Preserve existing optimistic Kanji Kombat combat answer prediction.
- Preserve the current server-owned combat seed/state-version gate between combat turns.
- Preserve optimistic commit behavior for intro known/unknown and completion keep-going/stop choices.
- Avoid user-visible waits for the next due card or next new card on the happy path.

## Non-Goals

- Do not implement client-owned FSRS scheduling.
- Do not let the client choose new cards, due cards, intro cadence, or completion state.
- Do not change Speed Review behavior.
- Do not change the script deck curriculum or kanji dictionary.
- Do not edit `data/dictionary.json`.
- Do not make Kanji Kombat leaderboard security worse than the current visible-quiz correctness exposure.
- Do not implement multi-turn optimistic combat pipelining in this phase.

## Current Behavior

The current server state exposes one visible Kanji Kombat work item:

- `run.kanjiKombat.currentQuiz`
- `run.kanjiKombat.pendingIntro`
- `run.kanjiKombat.completionChoicePending`

Quiz answers already support predictive optimistic combat. The browser uses the visible quiz choices, including correctness flags, to build a deterministic combat prediction and send an envelope to `/kanji-kombat/answer`.

Intro and completion choices already use optimistic action ids. The browser clears the choice locally, sends the selection in the background, and reconciles to the accepted or corrected server response.

The slow path is prompt selection after an accepted action. The next quiz, intro, or completion prompt is selected by the server and returned with the committed state. If that request is slow, the player waits for the next card.

Speed Review feels fast because it starts from a local queue. It renders three visible slots, refills each slot from `state.queue`, sends review commits in the background after an undo window, and refreshes the queue after batches. Kanji Kombat should adopt the local runway idea without copying Speed Review's looser authority model.

## Recommended Approach

Use a server-prepared prompt buffer.

The server owns prompt selection and builds fully formed prompt entries. The client consumes prompt entries locally, validates quiz choices locally, and sends commits in the background with prompt identity and action identity. The server accepts only commits for the canonical buffer head.

This gives the UI the no-wait feel of Speed Review while preserving canonical learning and combat state.

Rejected alternatives:

- A shallow batch endpoint that is not integrated into canonical run state. This is easier to add but can drift when FSRS, daily caps, no-due practice, or completion state changes.
- A client-local selector from an exported SRS snapshot. This maximizes responsiveness but duplicates learning logic in browser code and risks teaching or reviewing in a different order than the server persists.

## Prompt Buffer Shape

Add a rolling buffer to `run.kanjiKombat`:

```js
{
  promptBuffer: [
    {
      promptId: 'kkp_...',
      sequence: 12,
      kind: 'quiz',
      cardId: 'kanji:人',
      quiz: {
        cardId: 'kanji:人',
        type: 'kanji',
        prompt: '人',
        reading: 'ひと',
        keyword: 'person',
        choices: [
          { id: '...', answer: 'person', correct: true },
          { id: '...', answer: 'say', correct: false },
          { id: '...', answer: 'see', correct: false },
          { id: '...', answer: 'one', correct: false }
        ]
      },
      source: 'due',
      stateVersion: 1
    }
  ],
  promptBufferSeq: 12
}
```

Prompt kinds:

- `quiz`: a fully built quiz with choices and correctness flags.
- `intro`: a fully built card-introduction prompt with card display fields and intro source.
- `completePrompt`: a prepared daily-completion prompt.

Only the first prompt is rendered as active. Future quiz entries may include correctness flags because current visible Kanji Kombat quizzes already expose correctness for optimistic combat prediction. The buffer depth is intentionally small to limit future-answer exposure.

## Buffer Policy

- Target ready depth: 5 prompts.
- Refill threshold: fewer than 3 prompts.
- Refill requests are single-flight and bypass the global loading gate.
- The server returns the refreshed authoritative buffer with every successful commit.
- The client can request refill explicitly when local depth drops below the threshold.

## Server Semantics

The server maintains the canonical prompt buffer inside the run state. It validates all prompt-consuming actions against the buffer head.

Commit validation requires:

- Active run mode is `kanjiKombat`.
- Onboarding is complete.
- Submitted `promptId` and `sequence` match the canonical buffer head.
- Submitted `cardId` matches the head card id when present.
- Submitted answer or intro choice is valid for that head.
- Combat optimistic envelope still matches combat id, seed, and state version for quiz answers.

On accepted quiz answer:

1. Validate the prompt head and selected answer.
2. Recompute and verify the optimistic combat transcript as today.
3. Grade the script card as `good` or `again`.
4. Update streak, report counts, and combat state.
5. Remove the consumed prompt head.
6. Reconcile and refill the buffer to five prompts.
7. Return the accepted/corrected combat response plus authoritative state and buffer.

On accepted intro choice:

1. Validate the prompt head.
2. Grade the card as `easy` for known or `again` for unknown, matching current behavior.
3. Increment daily introduced count only for unknown.
4. Update no-due practice queue when appropriate.
5. Remove the consumed prompt head.
6. Reconcile and refill the buffer to five prompts.
7. Return the accepted optimistic action response plus state and buffer.

On accepted completion choice:

1. Validate the completion prompt head or existing completion-pending state during migration.
2. If `keepGoing` is false, finalize daily completion.
3. If `keepGoing` is true, enter endless mode, spawn a wave if needed, and refill with early-review prompts when available.
4. Return the accepted response plus state and buffer.

## Prepared Runway, Not Irreversible Schedule

The server cannot know the perfect next five prompts without knowing how the player will answer. A quiz answer can change FSRS due timing; an intro choice can change daily introduced count and no-due practice; completion choice can end or enter endless mode.

The buffer is therefore a prepared runway, not an irreversible schedule.

The planner should:

- Reserve distinct card ids while building the buffer so a card does not appear twice in the prepared window.
- Preserve due-first behavior, intro cadence, no-due discovery batching, daily cap, and endless early-review behavior.
- Avoid mutating FSRS or daily counters while previewing future entries.
- Treat future entries as invalidatable after each commit.

After every accepted commit, the server reconciles the remaining buffer:

1. Keep buffered prompts that are still legal under canonical state.
2. Drop prompts that became stale because the committed outcome changed the true path.
3. Refill to five prompts from authoritative state.
4. Return the reconciled buffer to the client.

The first implementation should use a conservative reconciliation rule after each accepted commit: validate any remaining buffered prompt before keeping it, and drop/rebuild future entries when validation cannot cheaply prove legality. It is acceptable to rebuild most or all future entries after each accepted commit as long as the client had at least one prepared next prompt during the player's current action. This keeps phase one focused on removing prompt-selection latency rather than proving a perfect non-mutating FSRS planner.

## Client Flow

Rendering priority:

1. Kanji Kombat onboarding.
2. First entry in `run.kanjiKombat.promptBuffer`.
3. Legacy `completionChoicePending`, `pendingIntro`, and `currentQuiz` fields during migration.
4. Loading or retry panel when no prompt is available.

For quiz prompts, the browser:

1. Renders the prompt head.
2. Marks the selected choice correct or wrong immediately.
3. Plays the teaching audio for the prompt.
4. Builds the existing optimistic Kanji Kombat answer envelope from the prepared quiz.
5. Plays the predicted combat turn.
6. Sends the commit with `promptId`, `sequence`, `answerId`, `actionId`, and the optimistic combat envelope while playback runs.
7. Reconciles the combat seed and state version through the existing optimistic answer verification path.
8. Consumes the prompt head and reveals the next buffered prompt when combat control returns.
9. Reconciles silently to the accepted server state, or replaces with authoritative correction.

Quiz answers should not allow a second combat answer before the previous answer has reconciled. The prompt buffer removes next-card selection latency at return-to-control time; it does not introduce multi-turn optimistic combat pipelining.

For intro prompts, the browser:

1. Renders the intro head.
2. Plays the teaching audio.
3. On known/unknown choice, clears the prompt immediately.
4. Locally consumes the prompt head and reveals the next buffered prompt.
5. Sends `promptId`, `sequence`, `cardId`, `choice`, and `actionId`.
6. Reconciles to the accepted or corrected state.

Intro and completion prompt commits should be serialized locally. The UI may optimistically advance to the next prepared prompt, but commit delivery must preserve prompt sequence order. If an earlier prompt commit is corrected, discard later local pending prompt commits and reconcile to the authoritative buffer.

For completion prompts, the browser:

1. Renders the completion choice.
2. On choice, clears the prompt immediately.
3. Sends `promptId`, `sequence`, `keepGoing`, and `actionId`.
4. If stopping, waits for the final report response before showing the report.
5. If continuing, consumes the prompt and renders from the refreshed endless buffer.

When local buffer length drops below three, the browser requests a refill. Only one refill request may be in flight at a time.

## Error Handling

Happy-path reconciliation is silent.

If a commit returns `accepted`, the client replaces its local state and buffer with the server state.

If a commit returns `corrected`, the client replaces local state and buffer with the authoritative state. If the player must repeat a choice, show:

`Kanji Kombat choice did not save. Please try again.`

If an answer commit fails after local prompt consumption, the client should recover using the existing optimistic combat recovery path where possible. If no authoritative state is available, show a stable retry/sync panel rather than leaving the action area empty.

If refill fails but the local buffer still has prompts, continue playing and try again when the threshold is crossed or after a short backoff.

If refill fails and the buffer is empty, show a compact syncing/retry state in the action area. Do not show a global blocking spinner.

Duplicate `actionId` commits must replay idempotently. Duplicate prompt commits with a mismatched payload must return a correction rather than double-grading a card.

If a later locally queued prompt commit is invalidated by an earlier correction, do not attempt to replay it against the corrected state. Drop the queued commit, replace the buffer from the authoritative state, and let the player retry from the corrected prompt.

## Migration Strategy

Keep legacy fields during migration:

- `currentQuiz`
- `pendingIntro`
- `completionChoicePending`

The first phase can mirror the buffer head into the legacy fields so existing UI and tests continue to pass. Once the UI renders directly from `promptBuffer`, the legacy fields can remain as compatibility aliases until a cleanup pass removes them.

The answer route should continue accepting the existing answer-only shape for compatibility, but buffered clients should send prompt metadata. Legacy requests validate against the current visible prompt as before.

Intro and completion routes should continue accepting legacy action-id requests, but buffered clients should include prompt metadata.

## Components

Server:

- `src/game/services/kanji-kombat-service.js`
  - Add prompt buffer initialization, refill, validation, consumption, and reconciliation helpers.
  - Keep `chooseNextScriptWork` as the canonical selector.
  - Add a conservative refill strategy that reserves distinct card ids while preparing prompts and rebuilds future entries after commits when legality is not obvious.
- `src/routes/game/kanji-kombat.js`
  - Add `POST /kanji-kombat/prompt-buffer/refill`.
  - Extend answer, intro, and completion routes to accept prompt metadata.
- `src/game/script-srs.js`
  - Avoid changes unless implementation proves a read-only card snapshot helper is needed.

Client:

- `public/js/api.js`
  - Add prompt metadata fields to Kanji Kombat answer, intro, and completion calls.
  - Add refill API.
- `public/js/ui/kanji-kombat.js`
  - Render from `promptBuffer`.
  - Consume local prompt heads.
  - Trigger single-flight refill.
  - Reconcile accepted/corrected responses.
- `public/js/ui/optimistic-combat-turn.js`
  - Keep the existing answer prediction contract and include prompt metadata in the envelope payload for buffered answer commits.
- `public/js/ui/combat-loop.js`
  - Keep predictive playback behavior, but allow return-to-selection to use the next buffered prompt without waiting for server prompt selection.

## Testing

Server unit tests:

- Buffer initializes with up to five prompt entries when Kanji Kombat starts.
- Buffer avoids duplicate card ids within one prepared window.
- Refill tops up to five after consuming prompts.
- Prompt commits reject stale or mismatched `promptId`/`sequence`.
- Quiz commit grades exactly one card and consumes exactly one prompt.
- Intro commit preserves known/unknown daily-count behavior.
- No-due discovery batch still chains up to three intros and then practices that batch.
- Completion prompt still finalizes or enters endless mode correctly.
- Duplicate action ids replay without double grading.

Client unit tests:

- Kanji Kombat UI renders from `promptBuffer` before legacy fields.
- Quiz answer sends `promptId` and `sequence`.
- Intro choice sends `promptId` and `sequence`.
- Completion choice sends `promptId` and `sequence`.
- Intro and completion choices consume the local head and render the next prompt before server response.
- Quiz answers consume the local head and render the next prompt after combat verification returns control.
- Quiz answers do not allow a second combat answer before the previous answer reconciles.
- Intro and completion commits preserve prompt sequence order when sent in the background.
- Refill fires once when buffer length drops below three.
- Correction replaces local buffer with authoritative state and shows retry copy only when needed.

Integration and regression tests:

- Existing Kanji Kombat optimistic answer tests continue to pass.
- Existing Kanji Kombat intro/completion optimistic action tests continue to pass.
- Existing Speed Review tests continue to pass unchanged.
- `npm test` remains the merge gate.

Manual verification:

- Play Kanji Kombat locally with the default dev user.
- Confirm that answering a quiz immediately shows teaching feedback, then returns to the next buffered prompt after combat verification without an additional prompt-selection wait.
- Confirm that intro known/unknown choices immediately advance to the next buffered prompt.
- Confirm that daily completion still prompts correctly.
- Confirm that a forced slow refill does not interrupt play while prompts remain.

## Phase One Boundary

Phase one implements the server-prepared prompt buffer, conservative buffer reconciliation, and client-side local consumption. It does not pipeline multiple combat turns ahead of server verification.

A later phase can explore deeper optimistic pipelining by pre-allocating multiple combat seeds and validating a chain of predicted combat states. That is intentionally out of scope here because the current shared combat optimistic contract is built around one server-owned seed and one state version at a time.
