# Kanji Kombat Daily Boundary Runway Design

**Date:** 2026-06-15
**Status:** Draft for implementation planning

## Problem

Kanji Kombat currently treats the daily-complete prompt as a terminal prompt-buffer item. When the player finishes their normal reviews and chooses **Yes** to keep going, the client consumes the completion prompt, records a pending `completionChoice`, and briefly has no local prompt to render while it waits for the server to enable endless mode and queue an early review.

That empty-buffer plus pending-sync state triggers Cid's generic spotty-connection copy:

`Connection is spotty. Your reviews will sync when you reconnect.`

This is misleading on healthy connections. The player did not lose connectivity; they crossed a normal learning boundary and are waiting for more prepared work.

## Goal

Keep the prompt runway filled across the daily-completion boundary. The player should still be asked whether they want to continue after finishing normal daily reviews, but choosing **Yes** should immediately advance into already-buffered endless/early-review prompts without showing the spotty-connection pause.

## Non-Goals

- Do not change Kanji Kombat SRS grading, FSRS scheduling, or early-review selection rules.
- Do not let the client invent prompts. The client may only render prompts prepared by the server.
- Do not remove the real spotty-connection pause for true runway exhaustion or the hard pending-log cap.
- Do not redesign the completion screen UI beyond the state handling needed for correctness.

## Recommended Design

Make the daily-complete question a boundary marker inside the existing `promptBuffer`, not the terminal end of the buffer.

The prompt buffer remains a single ordered runway. It can contain normal due/new work, one daily-complete marker, and then endless early-review work. The client renders only the head prompt, so the player still sees the completion question at the right moment. The difference is that prompts after the marker are already available if the player chooses to continue.

## Server Semantics

### Prompt Generation

`fillKanjiKombatPromptBuffer` should no longer stop permanently when it creates or sees the daily-complete marker.

The fill flow should become:

1. Generate normal due-card quizzes, new-card intros, and no-due discovery/practice prompts under the existing rules.
2. When normal daily work is exhausted, insert one daily-complete marker prompt.
3. Continue filling the same buffer after that marker using endless-mode early-review selection rules for planning purposes.
4. Preserve ordering: all prompts after the marker are reachable only if the marker is consumed with `keepGoing: true`.

Use a distinct prompt kind, `dailyCompletePrompt`, for the boundary marker. Keeping the old `completePrompt` name would preserve today's terminal meaning and make the new non-terminal behavior easy to misread. The important invariant is that this marker is a prompt-buffer item, not a separate side-channel flag.

### Daily Completion State

Buffering the marker should not by itself make the user's day complete in a way that prevents filling post-marker runway.

The server should distinguish:

- **Boundary reached:** normal daily work is exhausted and the marker has been queued or reached.
- **Daily accepted/finished:** the player has consumed the marker by choosing **No**, or has chosen **Yes** and entered endless mode after acknowledging completion.

Set `report.completedDaily = true` when the daily marker becomes the active/head prompt or when the completion choice is committed, whichever is simpler for the existing report flow. Do not set durable daily SRS completion merely because a marker was pre-buffered behind other prompts. Prompt planning must be able to fill after the marker without being blocked by daily completion state.

### Completion Choice Commit

When the server commits a `completionChoice` entry:

- `keepGoing: true`
  - Consume the marker.
  - Set `kk.endlessMode = true`.
  - Leave following early-review prompts in the buffer.
  - Refill the buffer tail if it is below target.
  - Return a normal non-terminal Kanji Kombat result.

- `keepGoing: false`
  - Consume the marker.
  - Finalize the daily-complete run as today.
  - Return the combat-ended daily report.

The server must still validate `promptId`, `sequence`, `kind`, and `cardId` against the buffer head before accepting the completion choice.

## Client Semantics

### Rendering

When the buffer head is the daily-complete marker, render the existing completion question:

`Your reviews are done for the day! Would you like to keep going?`

### Choosing Yes

The `Yes` path should behave like other locally consumed Kanji Kombat actions:

1. Check the pending session log hard cap.
2. Locally consume the marker from the buffer.
3. Set local `kk.endlessMode = true`.
4. Record a `completionChoice` session entry with `keepGoing: true`.
5. Immediately render the next buffered prompt.

This path must not call the spotty-connection pause simply because the completion choice is pending. The next prompt should already exist in the local buffer.

If the buffer is unexpectedly empty after choosing **Yes**, then the existing runway-exhaustion pause is still correct.

### Choosing No

The `No` path should:

1. Locally consume the marker.
2. Record a `completionChoice` session entry with `keepGoing: false`.
3. Render the existing saving/finalizing state.
4. Let the server checkpoint finalize the run and show the daily report.

### Spotty-Connection Copy

Cid's spotty-connection copy should remain reserved for the two real pause conditions from the session-log design:

- runway exhausted while there is pending work or no safe local wave/prompt to continue with;
- pending session log at the hard cap.

Crossing the normal daily boundary is not a pause condition.

## Reconciliation

The existing append-only prompt-buffer merge by sequence remains the right model. Since the server continues to prepare prompt-buffer tail entries after the marker, successful checkpoints and explicit refill responses can append those entries to the local runway exactly like any other tail prompts.

Corrections should snap to the authoritative state as today. If a correction lands on the daily marker, the client renders the completion question. If it lands after a confirmed `keepGoing: true`, the client renders the next authoritative endless prompt.

## Testing Plan

Add or update tests at these levels:

- Server prompt-buffer tests:
  - Filling a buffer with exhausted normal daily work inserts one daily marker and then early-review prompts after it.
  - The marker is not duplicated on refill.
  - Post-marker prompts use early-review rules and do not introduce new daily cards.

- Server completion-choice tests:
  - `keepGoing: true` consumes the marker, enables endless mode, and leaves/renders the next early-review prompt.
  - `keepGoing: false` still finalizes the run.
  - Prompt-head validation rejects stale or mismatched marker choices.

- Client UI/session tests:
  - Clicking **Yes** consumes the marker and immediately renders the next buffered prompt without calling `showKanjiKombatSyncPause`.
  - Clicking **No** renders the pending-completion state and syncs.
  - True empty-runway and hard-cap cases still show the spotty-connection copy.

- Integration flow test:
  - Finish normal daily reviews, accept keep-going, answer an early-review prompt, and confirm SRS review count updates.

## Acceptance Criteria

- A player with a healthy connection never sees the spotty-connection copy solely because they clicked **Yes** at the daily-complete prompt.
- The completion question still appears exactly once at the transition between normal daily work and endless practice.
- Choosing **Yes** immediately continues to an already-buffered early-review prompt.
- Choosing **No** still ends the run and shows the daily report.
- True offline/runway-exhaustion behavior is unchanged.
