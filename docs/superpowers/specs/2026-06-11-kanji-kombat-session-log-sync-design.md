# Kanji Kombat Session Log Sync Design

**Date:** 2026-06-11
**Status:** Approved, pending implementation plan
**Feature:** Subway-resilient Kanji Kombat via session event log, seed-chain simulation, and batch checkpoint sync

## Problem

The goal is unchanged from the subway-sync design: a player on a subway train who loses internet for 1-2 minutes at a time, with brief windows of slow but working internet in between, should complete an entire Kanji Kombat session without ever feeling that the game lagged or stopped responding.

The prompt-buffer (2026-06-06) and subway-sync (2026-06-07) implementations did not achieve this, for two reasons found in the 2026-06-11 code review:

1. **Quiz answers cannot proceed offline.** The optimistic combat contract is one turn at a time: the client needs the server's `nextTurnSeed` and `stateVersion` from turn N's verification before it can build turn N+1's envelope. `kanjiKombatQueuedVerificationPending` in `combat-loop.js` therefore blocks every quiz answer until the previous answer's server verification completes. During an outage the player answers one quiz card and every later tap is silently ignored. The 30-prompt buffer and 60-item sync queue never get used for quiz cards — the majority of cards. The prompt-buffer spec explicitly deferred multi-turn pipelining; the subway-sync spec assumed quiz turns could continue through the prediction path. The two specs contradict each other and the subway goal lost. The dev iOS network benchmark (2026-06-07 report) confirms it: combat API requests took ~1.4s while turn totals reached 42-91s stuck in `awaiting_verification`.
2. **Five overlapping state layers destabilized the happy path.** Legacy `currentQuiz`/`pendingIntro`/`completionChoicePending` mirrors, `promptBuffer`, optimistic run-action drafts, predictive combat envelopes, and the in-memory sync queue each have their own recovery path. The observed symptoms — ignored taps, jumping/replayed state, stuck recovery screens, and glitches on good networks — span all of them, and a week of recovery-fix commits ("Fix answer recovery", "Fix retry panel recovery", "Fix stale prompt recovery", "Fix menu flash", "Fix recovery states") shows the whack-a-mole pattern.

This design replaces those client layers with one model and changes the combat contract so quiz turns can be simulated ahead of the server.

## Decisions Made During Brainstorm

- **Combat model:** client simulates ahead with full fidelity using a server-pre-committed seed chain. Combat stays real offline; anti-cheat (deterministic replay + transcript hash verification) is preserved, just batched.
- **Scope:** consolidate the Kanji Kombat client flow into one session state machine. Old layers are deleted, not wrapped. The server prompt buffer and persisted action ledger stay.
- **Persistence:** in-memory only. Reload or WebView kill loses unsynced reviews safely (the server re-serves those cards later). Persistence can be a later phase on top of this model.
- **Verification:** an automated Playwright "subway harness" is built first, fails against current code (reproducing today's bugs), and becomes the acceptance gate. The mitmproxy network-bench toolkit (currently reverted; restorable from git history, e.g. commit `378ad5e6`) is used for a final manual real-device pass only.

## Goals

- A full Kanji Kombat session (intros, quizzes, waves, streak rewards, daily completion) completes on a connection that drops for 1-2 minutes at a time.
- Every tap produces visible acknowledgment within 250ms regardless of network state.
- No prompt the player answered is ever shown again during the active session, except after a genuine server correction.
- One client reconciliation path and one pause state replace the current five-layer recovery sprawl.
- Brief slow-network windows sync the maximum accumulated progress (one batched request, not one request per action).
- Anti-cheat strength is unchanged: the server deterministically replays every combat turn and verifies transcript hashes before committing anything durable.

## Non-Goals

- No persistent offline queue (no IndexedDB/localStorage survival of reload).
- No Speed Review changes.
- No changes to the PvE/PvP creature-combat optimistic contract. Shared playback and VFX systems are consumed unchanged, preserving parity.
- No multi-device concurrent Kanji Kombat sessions.
- No client authority over durable SRS state, rewards, daily completion, or leaderboards.

## Architecture

A Kanji Kombat session becomes three things.

### 1. Runway (server → client)

Everything the client needs to keep playing without asking the server again:

- **Prompt buffer** — exists today (`PROMPT_BUFFER_TARGET = 30`, refill at 10). Unchanged selection rules: due-first, intro cadence, daily new-card cap, no-due discovery chains, completion prompts.
- **Seed chain** — the server pre-commits seeds for the next N combat cycles (N matches the prompt-buffer quiz capacity, so the chain never limits the buffer). This replaces the one-at-a-time `nextTurnSeed` handoff. The chain is stored in run state alongside the buffer; each quiz turn consumes the next seed in order, both in client simulation and in server replay.
- **Pre-rolled next wave** — `spawnNextWave()` uses `Math.random()` and mints a fresh combat envelope, so waves cannot be client-simulated. The server pre-generates one upcoming wave (enemies, combat id, its own seed-chain segment) and ships it in the runway. The client applies it locally when the current wave's last enemy is KO'd. If the player clears the pre-rolled wave too while still offline, the session soft-pauses at the second wave boundary (rare: requires clearing two waves inside one outage).

The runway carries a `sessionEpoch` (see Reconciliation).

### 2. Action log (client)

An ordered, append-only, in-memory list of everything the player did:

```js
{
  seq: 7,                       // client-local monotonic
  actionId: 'run_...',          // ledger idempotency key
  kind: 'intro' | 'quiz' | 'completionChoice',
  promptId: 'kkp_...',
  sequence: 12,                 // server prompt sequence
  cardId: 'kanji:人',
  choice: 'known',              // intro
  answerId: 'choice_...',       // quiz
  keepGoing: true,              // completionChoice
  predictedHash: '...',         // quiz transcript hash
  createdAt: 1780000000000
}
```

The log replaces the sync queue, the optimistic run-action drafts for intro/completion, and the per-answer verification flag.

**Client flow per card:** render head prompt from local state → player taps → simulate the turn locally with the next chain seed (full fidelity: damage, KOs, streak heals deterministic from streak count, wave transition via the pre-rolled wave) → play the transcript → append to log → advance to the next prompt. No step waits on the network.

### 3. Checkpoint sync (client ↔ server)

One new endpoint:

```
POST /api/game/kanji-kombat/sync
{ sessionEpoch, entries: [ ...unsynced log entries in order... ] }
```

The server replays each entry in order through the same deterministic combat logic with the same stored seed chain, verifies quiz transcript hashes, grades cards, updates streaks/waves/rewards/daily counts, consumes prompt heads, then refills the buffer, extends the seed chain, replenishes the pre-rolled wave, and responds with one checkpoint:

```
{ status: 'ok' | 'corrected',
  confirmedThroughSeq,
  results: [ ...per-entry outcomes, including server-owned rewards... ],
  state, runway }
```

Idempotency rides on the existing persisted action ledger: entries whose `actionId` was already committed replay their recorded outcome instead of double-grading. A request that timed out client-side but landed server-side is harmless to re-send.

**Syncer behavior (client):** single-flight, debounced ~300ms after each action so rapid answers batch naturally. Additional triggers: `online` event, visibility restore, retry backoff `[500, 1000, 2000, 4000, 8000, then 15000ms repeating]`. Batching is the point: a 20-second connectivity window drains 25 queued answers in one round trip instead of 25.

### Pause conditions

Exactly two, both showing the existing soft copy `Connection is spotty. Your reviews will sync when you reconnect.` and both auto-resuming:

1. Runway exhausted — no prompts left, or a second wave boundary crossed while offline. Resumes when a sync/refill succeeds.
2. Unsynced log at the hard cap (50 entries). Resumes when a sync drains it below 40.

### Server-owned vs locally predicted

Predicted locally (and corrected if the server disagrees): combat damage/KOs/HP, wave transition into the pre-rolled wave, answer correctness feedback, streak count and streak-milestone banners (deterministic from streak count).

Confirmed only by checkpoint (never predicted): XP events, move learns, item rewards, daily-complete finalization and the final report, leaderboard effects.

### Deletions

- `public/js/ui/kanji-kombat-sync-queue.js` (entire module).
- `kanjiKombatQueuedVerificationPending` and the per-answer queued-verification callbacks in `combat-loop.js`.
- Legacy `currentQuiz` / `pendingIntro` / `completionChoicePending` rendering paths (client, at Phase 3 cutover) and server-side mirroring of them (Phase 4, once no client reads them); the client renders only from the runway.
- `consumedPromptIds` tracking and `recoverFromNullKanjiKombatResponse` in `kanji-kombat.js`.
- `createKanjiKombatPendingAction` usage of the optimistic run-action contract for intro/completion (the log subsumes it).

One new module, `public/js/ui/kanji-kombat-session.js`, owns runway, log, local state, and the syncer. The Kanji Kombat path in `combat-loop.js` shrinks to "build local transcript from the session module, play it." The session module exposes a small interface (approximate): `start(state)`, `headPrompt()`, `applyAction(action)`, `sync()`, `pendingCount()`, `isPaused()`, `reset()`.

## Reconciliation

One rule. Every sync response carries `confirmedThroughSeq`:

- **Checkpoint (status `ok`):** drop confirmed log entries, absorb server-owned reward results, replace runway with the refreshed one. Silent.
- **Correction (status `corrected`):** the response identifies the first rejected entry and includes authoritative state + fresh runway. The client truncates the log at that entry, snaps state and battle sprites to authoritative, and continues from the server's head prompt.

Consumed-prompt protection falls out structurally: the server never re-serves prompts consumed by confirmed entries, and the client never renders behind its own log. No consumed-prompt bookkeeping.

**Session epoch:** sync requests echo the runway's `sessionEpoch`. A reload or a second device obtains a new epoch via state fetch; the server rejects batches from an old epoch with a correction. Reload-wipes-the-log is therefore safe and explicit: server state wins, unsynced reviews reappear in a later session.

## Error Handling

- **Sync timeout that landed server-side:** re-send is idempotent; the next `confirmedThroughSeq` dedupes.
- **Offline daily-complete stop:** the completion choice appends to the log like any entry; the UI shows a pending "saving your session…" shell; the final report renders only after checkpoint confirmation. No fake durability.
- **Sync response arrives mid-playback:** checkpoints apply quietly in the background; corrections wait for the current transcript playback to finish before snapping, so the player never sees a mid-animation teleport.
- **Repeated correction or unreconcilable state:** fall back to a full state fetch and re-enter the session from server truth. This is the only remaining hard-recovery path.
- **Reload with unsynced log:** log is lost by design; server state wins.

Forbidden copy on ordinary drops (unchanged from subway-sync design): no "did not save, try again", no "Invalid choice", no "Synced with server".

## Testing

### Phase 0: Playwright subway harness (built first, red against current code)

- Drives a scripted full Kanji Kombat session with the `devtester` account on local dev.
- Injects offline windows of 60-120s via Playwright route aborts, and slow windows (1-2s per request) between them.
- Asserts: every tap produces visible acknowledgment within 250ms; the session reaches daily completion; final server-side review count equals cards answered; no prompt renders twice; no retry panel or blank action area ever appears.
- Reproducing the current bugs with this harness is the project baseline; the rebuild must turn it green.

### Unit tests

- Seed-chain issuance, consumption order, and extension on sync.
- Pre-rolled wave generation, client application at KO boundary, replenishment on sync, and soft-pause at a second offline wave boundary.
- Batch replay: ordering, per-entry validation, idempotent duplicate `actionId` replay, mid-batch correction truncation, no double-grading.
- Session module: log append/drop, debounce batching, single-flight, backoff schedule, pause/resume at 50/40, epoch rejection handling.
- Daily new-card caps, intro cadence, and no-due chains unaffected by batched commits.

### Integration tests

- Several answers under delayed/failed responses → UI advances, one batch drains on recovery.
- Timed-out-but-landed sync → re-send confirms without double commits.
- Mid-batch hash mismatch → truncate, snap, continue from server head.
- Reload during outage → new epoch, server state wins, no corruption.
- Existing Kanji Kombat tests migrated to the session model; `npm test` remains the merge gate.

### Manual validation

- Restore the mitmproxy network-bench toolkit from git history for one real-device pass against the finished build (real TLS, real WebView, real iOS networking).
- Manual throttled playtest per the playtest guide.

## Rollout Phases

1. **Phase 0:** Playwright subway harness — committed red (skipped/expected-fail in CI until cutover) as the executable success criterion.
2. **Phase 1:** Server — seed chain in runway, pre-rolled wave, `/api/game/kanji-kombat/sync` batch replay endpoint. Existing endpoints untouched and still serving the current client.
3. **Phase 2:** Client — `kanji-kombat-session.js`, fully unit-tested against a fake server.
4. **Phase 3:** Cutover — UI renders from the session module; old client layers deleted; harness goes green and joins the merge gate.
5. **Phase 4:** Real-device mitmproxy validation; remove the now-unused kanji-specific optimistic paths from the old endpoints.

## Relationship to Prior Specs

- Supersedes `2026-06-07-kanji-kombat-subway-sync-design.md` (in-memory sync queue) on the client side.
- Builds on `2026-06-06-kanji-kombat-prompt-buffer-design.md`: the server prompt buffer, selection rules, and head validation survive; the phase-one "no multi-turn pipelining" boundary is deliberately removed by the seed chain.
- Narrows `2026-06-03-tiered-optimistic-game-actions-design.md` for Kanji Kombat: intro/completion choices move from the per-action optimistic commit contract into the session log. The persisted action ledger is still the idempotency mechanism. Other game flows are unaffected.
