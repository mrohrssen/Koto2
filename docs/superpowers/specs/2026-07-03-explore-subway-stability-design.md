# Explore Subway Stability — Harness, Rooms Hardening, Offline PvE Combat

**Date:** 2026-07-03
**Status:** Approved
**Feature:** Make regular explore mode as stable on unstable connections as Kanji Kombat, including combat rooms

## Problem

Kanji Kombat is now subway-stable: a full session completes through 60–120s connectivity drops, verified by a full-session Playwright harness and backed by the 2026-07-02 server reliability work. Regular explore mode received the same architecture on 2026-06-16 — server-prepared room runway, client action log, batched `/api/game/explore/sync` — but it is still unreliable in play.

The audit of the 2026-06-16 work shows why:

1. **Combat rooms never joined the model.** `encounter.start`, `npcBattle.start`, and `boss.start` are hard online checkpoints, and every PvE combat turn blocks on per-turn server verification (`stateVersion` + single `nextTurnSeed` handoff — the same one-turn-at-a-time contract that kept Kanji Kombat unstable until the seed-chain rebuild). Explore runs are combat-dense, so real subway play stalls at the first encounter regardless of how good the room runway is. An uncommitted worktree (`fix/offline-combat-sync`) adds per-turn verification retry — the exact pattern the 2026-06-11 KK design evaluated and rejected as insufficient.
2. **The acceptance test was never built.** `tests/smoke/explore-subway-runway.test.js` is a 77-line stub asserting one tap, gated off with "on-demand until explore session cutover is complete." Kanji Kombat's equivalent is a 489-line full-session harness that became the merge gate. Without it, "stable" was never falsifiable, and roughly half of the ~20 explore-session commits are `fix:` hardening patches — the same whack-a-mole signature KK had before its rebuild.
3. **The cutover never finished.** The legacy `revealedRooms` current-plus-one buffer is still maintained in parallel with `exploreRunway` (readers: `src/game/phase-machine.js`, `public/js/ui/room-transition.js`); `public/js/ui/optimistic-run-action.js` is orphaned; room-entry narration is absent from the runway (`narrationFrame: null` everywhere); the implementation plan is untracked with zero boxes ticked and spec edits sit uncommitted.

## Lessons Adopted From Kanji Kombat

These are the transferable conclusions from the KK arc (2026-06-06 prompt buffer → 2026-06-07 subway sync → 2026-06-11 session log rebuild → 2026-07-02 reliability):

1. **The runway must cover everything consumed offline.** KK needed prompts *plus* a pre-committed seed chain *plus* a pre-rolled wave before offline play was real. Explore needs rooms *plus* per-room payloads *plus* combat-start state *plus* seed chains.
2. **One log, one sync, one reconciliation rule, exactly two pauses.** Overlapping recovery layers each with their own retry/rollback path are the root cause of whack-a-mole instability.
3. **Delete superseded layers; never wrap them.** KK's rebuild deleted five client layers at cutover.
4. **Harness first.** The executable acceptance test is committed red before the fixes, turns green at cutover, and joins the merge gate.
5. **Per-turn retry is not offline play.** If turn N+1 needs the server's answer to turn N, the player stalls after one action. Only pre-committed determinism (seed chain + shared resolvers + batched replay) lets the client run ahead.
6. **The server underneath is shared infra and already fixed.** Write-behind atomic saves, slim action ledger, crash guards, and SQLite shared data shipped 2026-07-03 apply to explore automatically. This arc is protocol/client work, not another storage pass.

## Decisions From Brainstorm (2026-07-03)

- **Priority:** in-play reliability. The dominant pain is that explore still misbehaves on spotty connections, not the code mess per se — but the cleanup rides along because leftover layers are a proven source of the misbehavior.
- **Scope:** full arc including offline PvE combat. Without it, "subway-stable explore" has a hard ceiling at every combat door.
- **Structure:** harness-first, staged. Stage 0 harness (red) → Stage 1 rooms hardening + cleanup → Stage 2 offline combat. Each stage lands on dev independently.
- **One log, one endpoint:** combat entries interleave with room entries in the existing explore action log and sync through `/api/game/explore/sync`. Combat happens inside a room; one ordered log avoids cross-log ordering bugs.
- **Befriend/talk is online-only.** It is live AI-generated i+1 conversation; pre-generating it in the runway would burn AI calls for content that is usually unused. Offline, the talk option shows calm "connection needed" copy and combat continues.
- **PvP is untouched.** Resolvers, mechanics, visuals, and features stay shared (parity rule preserved). Only the PvE transport changes: per-turn verification becomes batched replay. PvP keeps its live per-turn path because the opponent is remote.
- **The `fix/offline-combat-sync` worktree is superseded** by Stage 2 and should be closed without merging.

## Goals

- A player completes a full area run — travel, support rooms, encounters, NPC battles, boss — on a connection that drops for 60–120s at a time with brief slow windows in between.
- Every eligible tap acknowledges within 250ms regardless of network state.
- No answered prompt or completed room replays during an active session except after a genuine server correction.
- One reconciliation path; exactly two pause conditions; no room- or combat-specific failure panels for ordinary drops.
- After reconnect, one batched sync drains accumulated progress, and server state matches the number and kind of actions taken.
- Anti-cheat strength unchanged: the server deterministically replays every combat turn and verifies transcript hashes before committing anything durable.

## Non-Goals

- No persistent offline queue (no IndexedDB/localStorage; reload loses the unsynced log by design).
- No PvP transport changes and no changes to shared combat mechanics, resolvers, or visuals.
- No offline befriending/AI dialogue.
- No new static Japanese outside the frames pipeline; no dictionary changes.
- No server storage-engine changes (the 2026-07-02 reliability pass already covers the server).

## Stage 0 — Full-Session Subway Harness

Replace the stub at `tests/smoke/explore-subway-runway.test.js` with a harness mirroring `tests/smoke/kanji-kombat-subway.test.js`:

- Drives a scripted full area run as `devtester` on local dev: proceed through rooms, complete every support room encountered (friendly NPC, shrine, skill master, whack-a-mole, speed review, word discovery, dealer, campfire), fight encounters and the boss.
- Injects scripted offline windows (60–120s via Playwright route aborts) with slow windows (1–2s/request) between them, using the same window-scheduling pattern as the KK harness (never overlap windows; ensure runway refill between windows).
- Asserts throughout: every eligible tap acknowledges < 250ms; no blank action area; no forbidden copy (`did not save`, `Invalid choice`, retry panels); prepared rooms render offline including i+1 greetings; soft pause appears only at genuine runway exhaustion or log cap and auto-resumes.
- Asserts at the end: one or few batched syncs drained the log; server room index, support-room completion flags, and combat outcomes match what was played; zero corrected syncs on the happy path.
- **Two assertion tiers:** a rooms tier (combat doors may soft-pause and wait for a connectivity window to enter combat) and a combat tier (fights proceed offline). Tier selection via env flag. Stage 1 exit = rooms tier green. Stage 2 exit = combat tier green.
- Gating follows the KK precedent: on-demand (`EXPLORE_SUBWAY_SMOKE=1`) and allowed-red until the matching stage's cutover, then it joins the merge gate.

The harness is committed first, red where dev fails today. Its failure list is the Stage 1 bug list — no speculative fixing.

## Stage 1 — Rooms Hardening + Cleanup

### Harness-driven fixes

Fix what the rooms tier flags in travel and support rooms. The 2026-06-16 `fix:` commit trail (null runway adoption, epoch invalidation, proceed-effects preflight, client concurrency) shows the edge classes; the harness decides what is still broken. No fixes without a red assertion first.

### Runway payload completion

- **Entry narration:** wire `entryPayload.narrationFrame` through the frames pipeline where suitable frame categories exist, selected against the player's known vocabulary like the shrine/NPC greetings already are. Where no frame category exists, the room renders without entry narration offline (never fall back to unvalidated static text). Authoring new frame-sources entries is optional content work, not a blocker.
- **Audio metadata:** attach dialogue audio metadata to prepared frames via the existing dialogue-card TTS cache path (cached keys immediately, or requestable metadata while synthesis continues) so audio buttons work without blocking room render.
- `offlineReady` and `missingPayloadReasons` stay the contract for incomplete rooms; the harness asserts prepared rooms in the window are `offlineReady`.

### One soft pause

A single calm pause pattern (matching KK's `Connection is spotty…` copy) for: runway exhausted, required payload missing, log at hard cap, and dependency pause. No room-specific failure panels.

### Deletions (after the rooms tier is green)

- Migrate the remaining `revealedRooms` readers (`src/game/phase-machine.js`, `public/js/ui/room-transition.js`, `public/js/ui/exploration.js` remnants) to the runway, then stop exposing the parallel legacy reveal buffer from `GameManager.getState()`.
- ~~Delete `public/js/ui/optimistic-run-action.js` (orphaned — no importers)~~ **CORRECTION (Task 5, 2026-07-04):** the file is LIVE — `public/game.js` imports all four exports for the post-combat-shop optimistic path (the audit grep missed `public/game.js`, searching only `public/js/`). It stays until the post-combat shop migrates off it.
- Mark legacy room-mutation endpoints as compatibility paths server-side; remove client callers.
- Delete the old stub harness (replaced in Stage 0).

### Land the docs

Commit the untracked `docs/superpowers/plans/2026-06-16-explore-session-runway-sync.md` and the uncommitted spec-status edits (`2026-06-03-tiered-optimistic-game-actions-design.md`, `2026-06-15-explore-session-runway-sync-design.md`) with status notes pointing at this spec as the successor for the remaining work.

## Stage 2 — Offline PvE Combat via the Session

### Runway: prepared combat rooms

A prepared `encounter` / `npcBattle` / `boss` room carries everything `/api/game/start-creature-encounter` would return, plus determinism runway:

```js
interactionPayload: {
  kind: 'encounter',            // or 'npcBattle', 'boss'
  combatStart: { /* initial combat state: enemies (already server-rolled), formation, npc metadata */ },
  seedChain: ['s1', 's2', ...], // ~40 pre-committed turn seeds — ample for one fight
  initialStateVersion: 0
}
```

- The seed chain is stored in run state alongside the prepared room, exactly as KK stores its chain: each combat cycle consumes the next seed in order, both in client simulation and in server replay.
- Checkpoints refresh consumed chains and extend them if a fight runs long. If a chain is somehow exhausted mid-fight while offline (≫40 turns), the session soft-pauses — same class as runway exhaustion.
- Boss and NPC-battle rooms carry the same contract with their fixed enemies/NPC metadata.

### Log entries

Combat becomes ordinary session-log entries in the existing explore log:

```js
{ seq, actionId, kind: 'encounter.start',  roomIndex, roomId, actionSeq, payload: {} }
{ seq, actionId, kind: 'combat.cycle',     roomIndex, roomId, actionSeq,
  payload: { actionType: 'attack' | 'defend', moveChoices, seedIndex, predictedHash } }
```

`encounter.start` / `npcBattle.start` / `boss.start` stop being checkpoint boundaries: the client applies the prepared `combatStart` locally and enters combat immediately. Each turn simulates through the existing shared deterministic resolver path (`previewCreatureCombatCycle` / the optimistic-combat-turn builder), consuming `seedChain[seedIndex]`, plays the predicted transcript, appends the entry, and moves on. No step waits on the network. Rest and other action-cursor choices ride inside `attack` cycles as they do today.

### Server replay

`applyExploreSessionSync` gains combat entry kinds. For each in order: validate room/seq/epoch as today, check the action ledger for idempotent replay, then replay the turn through `CombatCycleService` with the stored seed chain and verify the transcript hash — the same verification that runs per-turn today, just batched. Hash mismatch or invalid entry → correction truncating at that entry, exactly like support rooms. Anti-cheat is unchanged in strength.

### Server-owned vs locally predicted

Predicted locally (corrected if the server disagrees): damage, KOs, HP, status effects, vocab-card grade feedback, victory/defeat playback, predicted level-up display.

Checkpoint-confirmed only (never predicted durable): XP application and level-up persistence, move-learn prompts (appear after the checkpoint that confirms the level-up), item drops and rewards, befriended-creature persistence, room completion, run victory/defeat consequences, meta progression. The existing `pendingCombatEnd` shell covers the gap between predicted victory playback and confirmed rewards.

Defeat mid-offline plays out locally (deterministic), then soft-pauses on the defeat screen until a sync confirms run consequences — rare and acceptable.

### Befriend boundary

Talk/befriend actions call live AI endpoints (`/api/game/befriend-talk`, `/api/game/befriend-quiz-answer`) and stay online-only. Offline, the talk option is disabled with calm copy (frames-pipeline-safe, no raw Japanese outside the pipeline); attack/defend continue. When connectivity returns mid-fight, talk re-enables. Befriending during a slow-but-working window behaves as today.

### PvE/PvP parity statement

The parity rule ("never modify PvE combat in ways that disconnect it from PvP") is satisfied as follows: mechanics, resolvers, transcripts, VFX, and playback stay one shared system. What changes is PvE's *commit transport* — from per-turn verify to batched log replay. PvP cannot batch (remote opponent) and keeps its live per-turn exchange. Any future combat feature still lands in the shared resolver/playback layer and therefore reaches both modes; the transport difference is documented here deliberately rather than introduced silently.

## Reconciliation

One rule, unchanged from KK and the existing explore session: every sync response carries `confirmedThroughSeq`.

- **Checkpoint (`ok`):** drop confirmed entries, absorb server-owned results (XP, drops, befriend persistence, room completion), merge the refreshed runway (append-only where possible; seed chains refreshed). Silent.
- **Correction (`corrected`):** truncate the log at the rejected entry, snap state and battle sprites to authoritative after the current playback/dialogue finishes, continue from the server's head. Never mid-animation.
- **Epoch mismatch:** correction; server truth wins.
- **Reload with unsynced log:** lost by design; server re-serves anything not durably committed.
- **Timed-out-but-landed sync:** safe to resend; `actionId` ledger dedupes.
- The client drains the explore log (`syncNow()`) before any reconnect/recovery `/api/game/state` refetch, so epoch rotation cannot orphan a drainable log.

Exactly two pause conditions, both auto-resuming, both using the existing soft copy: (1) runway exhausted — no prepared room, required payload missing, dependency not satisfied, or seed chain exhausted mid-fight; (2) unsynced log at hard cap. Forbidden copy on ordinary drops: `did not save`, `Invalid choice`, `Synced with server`.

## Testing

- **Unit:** seed-chain issuance/consumption-order/refresh; combat entry replay incl. hash verification, idempotent duplicate `actionId`, mid-batch correction truncation, no double-grant; runway combat-payload builder (`offlineReady` only with full combat start + chain); client session combat simulation ordering; pause/resume conditions.
- **Integration:** multi-turn offline combat batch drains in one request with correct final server combat/room state; timed-out-but-landed resend; mid-batch hash mismatch → truncate/snap/continue; support-room + combat interleaved batches; existing exploration and combat suites stay green (`npm test` merge gate).
- **Harness:** rooms tier green ends Stage 1; combat tier green (fights through encounters and the boss inside offline windows) ends Stage 2 and joins the merge gate.
- **Manual:** throttled playtest per `docs/playtest-guide.md`; screenshots for any visual states (soft pause, disabled talk, pending victory shell); one real-device pass with the mitmproxy network-bench toolkit (restorable from git history, e.g. `378ad5e6`).
- **Load watchpoint:** batched combat replay runs many deterministic turns in one request; the existing KK load-harness pattern (`tests/load/`) is the template for a spot-check if sync-batch latency regresses. The 2026-07-02 write-behind/ledger fixes make new pathologies unlikely; measure rather than assume if p95 moves.

## Rollout

1. **Stage 0:** commit the full harness red (on-demand, out of the default gate).
2. **Stage 1:** rooms-tier fixes → runway payload completion → rooms tier green → deletions → docs landed. Lands on dev.
3. **Stage 2 server:** combat payload + seed chain in the runway builder; combat replay in the sync service. Legacy per-turn endpoints untouched and still serving the live client.
4. **Stage 2 client:** combat simulation through the session; cutover of `encounter/npcBattle/boss.start`; combat tier green; harness joins the merge gate.
5. Close `fix/offline-combat-sync` (superseded). Real-device validation. Legacy per-turn combat verification path for explore PvE is retired after one release of soak, PvP path untouched.

## Relationship to Prior Specs

- Builds on and completes `2026-06-15-explore-session-runway-sync-design.md` (rooms architecture is kept; its deferred combat boundary is deliberately removed, mirroring how the KK seed chain removed the prompt-buffer spec's "no multi-turn pipelining" boundary).
- Mirrors `2026-06-11-kanji-kombat-session-log-sync-design.md` (session log, seed chain, batched checkpoint, correction semantics).
- Inherits server foundations from `2026-07-02-kanji-kombat-reliability-design.md` (write-behind saves, slim ledger, atomic writes, crash guards, SQLite shared data).
- Narrows `2026-06-03-tiered-optimistic-game-actions-design.md` further for explore: remaining per-action optimistic room commits fold into the session log; the persisted action ledger remains the idempotency mechanism. Hub/meta actions (crystals, chests, crests, fusion) stay outside this arc.
