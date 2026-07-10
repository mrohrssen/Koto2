# Explore Online/Offline Sync Reliability Repair

**Date:** 2026-07-09
**Status:** Approved (amended 2026-07-10 after code-verification audit)
**Feature:** Restore correctness and automatic recovery across standard Explore mode's online/offline boundary
**Base:** `origin/dev` at `67edd31e`

## Problem

The July Explore reliability work added the right large-scale pieces—prepared room runways, an in-memory action log, deterministic combat replay, and batched sync—but the pieces do not currently enforce one coherent commit protocol. Focused Explore tests are green while real failure paths still fork or strand the client.

The audit confirmed these independent defects:

1. Session combat plays and commits a predicted turn before checking whether `recordRoomAction()` accepted the corresponding log entry. A paused or capped session can therefore advance HP, seeds, and `stateVersion` without any replayable action.
2. A runway pause entered while `navigator.onLine === false` and with an empty log never resumes automatically. The `online` listener drains the empty log, which is a no-op, and never refreshes the runway; today recovery requires another user tap to re-surface the soft pause.
3. A timed-out sync may commit on the server and later return its ledgered result with `replayed: true`. The client treats `replayed` as “already handled by this browser,” skips terminal combat or befriend handling, and can remain frozen on a pending-combat shell.
4. `GET /state` error bodies are truthy and can be normalized into `phase: "no_save"`, erasing the live client run. A state request that began before a new local action can also return after that action and overwrite newer optimistic state.
5. Initial skill choice receives a rebuilt runway but does not adopt it before room 0 may automatically start combat.
6. The action-effect contract omits real party mutations. Room entry heals and clears effects (undeclared on `proceed`), party-skill choices affect combat (`partySkills` does not intersect combat's `partyStats` dependency, so no fence trips), and word-discovery/whack completion award XP (whack declares only its credits). Shrine and friendly-NPC choices already declare `partyStats` and are correctly fenced — they are the model, not part of the defect. The client and server can therefore start the same prepared fight from different ally state; the divergence surfaces as a transcript-mismatch correction rather than silent corruption.
7. Whack-a-mole completion/skip both mark the room complete and implicitly proceed inside one action, bypassing the session's explicit cursor and dependency checks.
8. The client-side empty NPC reward escape clears only its draft. The current server correctly blocks proceeding while the canonical reward is pending, so accounts with no eligible reward are stuck.
9. Server sync accepts non-contiguous entry sequences and does not verify that an entry kind is canonically advertised for the current room. Most kinds are type-checked inside their individual performers; `proceed` is the concrete hole — `proceedToNextRoom()` has no boss-completion or active-combat guard, so a forged `proceed` can skip an unfinished boss and set area/game victory.
10. A transcript mismatch that committed server state is ledgered as corrected, but a lost-response retry replays that ledger result as an ordinary success and may continue later entries.
11. Building correction response context snapshots the shared `GameManager`, awaits runway work, then restores the snapshot. That can erase a concurrent mutation and breaks object aliases such as `combat.allies === run.creatureParty.active`.
12. Rebuilding the runway during an active combat can prepare a second combat roll for the still-current room because the original prepared roll was consumed at combat start. Every sync response rebuilds the runway (`ok` and `corrected`, plus `GET /state?adoptSession=1`), so an ordinary mid-combat sync already ships the phantom roll.

Recent dev bug reports—blank move selection after an NPC battle began and an NPC victory with no delivered reward—match these state-transition failures. The existing smoke harness does not falsify them because it aborts requests while `navigator.onLine` remains true, reloads after setup, avoids support choices during offline windows, and weakly checks final reconciliation.

## Chosen Approach

Repair the protocol around explicit invariants instead of adding more room-specific retries. Keep the runway/session architecture, legacy compatibility endpoints, and deterministic combat resolver. Fix the ownership and ordering rules at their shared boundaries, then make the tests exercise genuine browser offline/online transitions.

Rejected alternatives:

- **P0-only patch:** faster, but leaves known party-parity, replay, and server-ordering failures that would continue surfacing as transcript corrections.
- **Roll back offline optimism:** likely stabilizes online play, but removes the intended poor-connection experience and discards the recent architecture rather than making it coherent.

## Required Invariants

1. **Log before mutation:** every speculative client mutation has exactly one accepted session entry before playback or state commit. A rejected append changes no combat, room, seed, or cursor state.
2. **One ordered stream:** entries in a batch are unique, strictly increasing, and contiguous by `seq`. The server validates the complete batch shape before applying entry 1.
3. **Canonical action authority:** the server derives accepted actions from canonical room/combat state. Client runway data is a capability hint, never authorization.
4. **Retry-safe server and client effects:** `actionId` dedupes server mutation. Separately, the browser tracks which returned terminal/befriend results it has consumed. `replayed` says only that the server deduped the mutation.
5. **No stale adoption:** an error response, a response fetched while a newer local action was recorded, or a response that predates a pending optimistic suffix cannot replace live client state.
6. **No shared-state snapshot restore across an await:** correction/response construction may not roll the shared `GameManager` backward or sever internal aliases.
7. **One combat roll per room:** preparing, starting, refreshing, correcting, and retrying a combat room never produces a second enemy/seed-chain roll.
8. **Deterministic state is mirrored; non-mirrorable state is fenced:** browser-safe deterministic party mutations run through shared code on client and server. Server-only XP/item/stat mutations declare honest effects and pause before a dependent room until checkpointed.
9. **Every pause has an automatic exit:** pending-log pauses resume after a successful drain; empty-log runway pauses refresh and resume after connectivity returns. No second tap is required.
10. **Session and legacy transports do not race:** a compatibility endpoint may run only after the session log is confirmed empty and unchanged since the fetch/flush began.

## Client Design

### Commit combat turns safely

`runSessionCreatureCombatTurn()` will build the deterministic prediction, then append `combat.cycle`. Only an accepted append may start playback and commit `localStateAfterSessionPveTurn()`. A rejected append clears the attack-pending flag, leaves the current state and seed chain untouched, and lets the session's existing soft-pause UI own recovery. Rejects that do not enter a session pause (`actionNotAccepted`, `noPreparedRoom`) must surface the same soft-pause/recovery path — every rejected turn has a recovery owner, not only the pausing reasons.

An entry that reaches the hard cap is still accepted and may be played; the loop must not offer another move while `session.isPaused()` is true. If the remaining seed runway is unsafe, the client must await a session drain before invoking the legacy per-turn verifier. It may not fire `/explore/sync` and `/creature-combat-cycle` concurrently.

### Consume checkpoint results idempotently

Terminal combat and befriend handling will use an in-memory set of handled session-result `actionId`s. An unseen result is handled whether or not the server marks it `replayed`; a seen action is skipped. The set resets at the same run/session boundary as the Explore session. This covers the “server committed, response was lost” case without double-opening victory or befriend UI.

The session adopts `exploreRunway` before calling checkpoint/correction callbacks, so any callback-driven render reads the response's runway rather than the previous cursor.

### Recover pauses automatically

The session exposes its current pause reason and a monotonic local revision. The `online` and visible-page recovery path performs one serialized operation:

1. Drain pending entries if any.
2. If the log is empty and the session remains paused for `currentRoomNotReady`, `nextRoomNotReady`, `runwayExhausted`, or missing payload, fetch `GET /state?adoptSession=1`.
3. Adopt the returned valid state/runway only if no local action was recorded after the fetch token was captured.
4. Resume and re-drive the current phase after runway adoption.

Failures retain the pause and use bounded retry/backoff. Multiple online/visibility/tap signals share the same in-flight recovery promise.

### Protect state refreshes

State loading will classify responses before mutation:

- `null` because a fetch was intentionally skipped: keep current state.
- transport failure or any `{ error }` HTTP body: keep current state and surface retry state; never synthesize `no_save`.
- valid fresh-account state: preserve the existing explicit no-save flow.
- valid game state: adopt only when the session has no pending suffix and its local revision is unchanged since request start.

All in-session callers continue using `adoptSession=1`. A regression test enforces the discipline: no in-session code path may issue a bare `GET /state`, which rotates the session epoch by design and strands any offline log. Initial skill choice adopts `result.state.run.exploreRunway` before `updateUI()` can enter room 0. The post-combat-shop path must not assign a raw error body after `loadGameState()` rejects it.

### Mirror deterministic party mutations

Extract browser-safe room-entry party recovery into one shared function used by `ExplorationService` and the optimistic room advance. It will:

- synchronize HP Master max-HP bonuses;
- heal living active/reserve creatures by the existing room-entry percentage and recovery multiplier without reviving KOs;
- reset `statStages` and `activeEffects` on active/reserve creatures.

Skill Master and NPC reward selection will optimistically call the existing browser-safe `applyPartySkillChoice()` and `syncPartySkillHpBonuses()` while marking the room complete. At prepared combat start, enemies and seed-chain data come from `combatStart`, but allies come from the current run party so deterministic support mutations made after the runway was first prepared are preserved. Server-only support mutations such as shrine items/levels remain dependency-fenced until checkpointed.

The server already binds combat allies to the live canonical party at combat start, so the ally-sourcing rule above is bilateral rather than a client-only change. It also makes checkpoint party adoption load-bearing: with allies no longer read from the runway snapshot, a dependency-fenced pause for a server-only effect may lift only after the client's run party has adopted the checkpoint's authoritative party state. Concretely, an `ok` checkpoint that empties the log adopts the response's authoritative party (the sync response already carries full state) before the pause resumes. Skipping this adoption would re-create the exact whack/word-discovery→combat transcript fork this repair removes, because the boosted allies used to arrive via `combatStart.allies` and no longer do.

### Make room advancement explicit

`whackAMole.complete` and `whackAMole.skip` will only resolve the current room. Auto-render may immediately record a separate `proceed`, but the session cursor and server cursor advance through that explicit entry. Whack completion declares `credits` and `partyStats`; word-discovery completion declares `credits` and `partyStats`. These server-only XP effects block entry into dependent combat until a checkpoint refreshes authoritative allies.

Legacy proceed first awaits `syncNow()`, then verifies the log is empty, the session is unpaused, and the local revision has not changed. Otherwise it stays paused instead of racing the compatibility endpoint. The final-room/no-next-room handoff uses the same retryable recovery path.

### Resolve empty NPC rewards canonically

The server's offer operation becomes idempotent. If no skills are eligible, it marks `skillSelectionPending = false`, marks the room interacted, persists and returns the resolved state/runway. A retry after a lost response returns the same resolved state rather than a 400. The client adopts that state and then proceeds normally; it never clears the guard only in a local draft.

## Server Design

### Validate a batch before mutation

Before replay, validate that entries are a non-empty array whose `seq` values are positive integers, unique, strictly increasing, and contiguous; action IDs are valid and unique within the batch. Reject malformed order with a correction before applying any entry.

For each entry, validate position and derive accepted kinds from the canonical current room/combat state through one shared contract function also used by the runway builder. Reject unadvertised kinds. Add defense-in-depth completion guards to `proceedToNextRoom()` for boss and NPC/encounter states so compatibility endpoints cannot advance an unfinished combat.

### Preserve corrections across retries

When replay commits an authoritative combat turn but its transcript mismatches, store the correction reason with the ledger response. If the same action is retried, immediately return `status: "corrected"` with that confirmed/rejected sequence and stop; never treat it as an ordinary result or apply trailing entries.

### Separate mutation from response materialization

Replay/rollback is synchronous and bounded to the mutation phase. After a result has committed, runway/state response construction may fall back to the current canonical runway if decoration fails, but may not restore a pre-request snapshot.

Stale-epoch corrections do not rebuild the runway by mutating the live manager and restoring it. They serialize existing canonical state/runway or build on a detached clone. Internal aliases remain intact, and an awaited vocabulary/audio lookup cannot erase a concurrent committed mutation.

The same snapshot/restore-across-await pattern exists in the shared legacy optimistic-action error runner used by compatibility endpoints. Its full replacement is out of scope here; this repair only requires its restore path to re-establish canonical aliases after a rollback (as the manager registry already does after deserialization), with invariant 10's fencing keeping live session work from racing it. The remaining exposure on non-Explore endpoints is accepted and documented, not repaired.

### Keep active combat canonical

Runway construction distinguishes three combat-room states:

- **not started:** create/reuse the room's one persisted `preparedCombat` roll;
- **active current combat:** serialize the live combat ID, remaining seed chain, state version, allies, and enemies and advertise `combat.cycle`, never a second start;
- **resolved/interacted:** do not prepare another fight; advertise only the canonical post-combat action, such as NPC reward selection, when applicable.

Starting a prepared fight transfers ownership to live combat without making the room eligible for another preparation. Rebuilding the runway is idempotent in all three states.

## Reconciliation and Error Semantics

- **Checkpoint (`ok`):** confirm only the greatest contiguous applied sequence, adopt runway first, then consume unseen results and re-drive UI when safe.
- **Correction (`corrected`):** clear speculative suffix, adopt authoritative state/runway, consume no trailing entries, and render only after current animation/dialogue safely yields.
- **Timed-out-but-landed request:** resend the same action IDs; server mutation is ledger-deduped and unseen browser results are still consumed once.
- **Transient transport/5xx/429:** retain the log and back off.
- **Permanent malformed/auth response:** stop blind retry, preserve local state, and enter the existing recoverable pause/auth flow.
- **Reload:** unsynced in-memory entries remain intentionally lossy, as specified previously. This repair does not add persistent offline storage.

## Test and Verification Design

Every production change follows red-green TDD. Required deterministic regressions:

### Client unit tests

- rejected/capped combat append leaves HP, state version, seeds, and UI playback unchanged;
- cap-reaching accepted turn commits once but does not reopen move selection;
- unseen replayed terminal and befriend results run once; duplicate delivery of the same action ID does not;
- a genuine offline empty-log pause refreshes/adopts/resumes on `online` without a retap;
- runway is adopted before checkpoint/correction callback re-drive;
- HTTP 500/429/error bodies preserve the current run;
- a state response is ignored when the session revision changed while its GET was in flight;
- initial skill response adopts its runway before room-0 combat dispatch;
- shared room-entry recovery and skill choice produce byte-equivalent party state on client and server;
- whack completion/skip records a separate proceed and does not move the session cursor implicitly;
- legacy fallback never runs with pending or newly appended session work;
- a server-only XP effect (whack/word-discovery) ahead of a combat room pauses the proceed, the draining checkpoint adopts authoritative party state, and the resumed fight starts hash-converged on both sides;
- no in-session code path issues a bare `GET /state` (epoch-rotation discipline).

### Server unit/integration tests

- reordered, duplicate, and gapped sequence batches correct before any mutation;
- an unadvertised boss `proceed` is rejected and cannot set area/game victory;
- corrected ledger replay returns correction and ignores trailing entries;
- stale-epoch response construction neither erases a concurrent mutation nor breaks party/combat aliases;
- active-combat runway refresh preserves combat ID/enemies/seeds and creates no `preparedCombat` replacement, including on an ordinary mid-combat `ok` sync (not only adoptSession/correction paths);
- empty NPC offers resolve canonically and are idempotent across a lost response;
- whack/word-discovery effect declarations match actual XP/credit mutations;
- support choice + proceed + combat batches either mirror deterministic state exactly or pause before a server-only dependency;
- timed-out terminal/befriend resend converges without double rewards.

### Full and browser verification

1. Run focused Explore client/server unit and integration suites after each repair group.
2. Run `npm test`, recording pre-existing baseline failures separately from regressions introduced by this branch.
3. Update the Explore subway harness to use Playwright's real offline context so `navigator.onLine` and browser events change; start tap timing before the click; require both offline windows; allow support interactions offline; and assert final room, support, reward, combat, log, and correction counts.
4. Run the approved Playwright session against `npm run dev`, following `docs/playtest-guide.md`, through support rooms, regular combat, NPC battle/reward, and boss with multiple online/offline transitions.
5. Capture screenshots only if a visual state changed or is needed as evidence, and delete them immediately after inspection.

## Scope Boundaries

- Standard Explore PvE only. PvP mechanics, resolver behavior, and visuals remain shared and unchanged.
- No persistent offline queue or reload-proof unsynced progress.
- No offline AI befriend conversation.
- No dictionary edits, Japanese copy changes, content generation, combat balance changes, or new rewards.
- No broad storage-engine rewrite. Server changes are limited to Explore replay validation, response safety, canonical runway state, the NPC reward transition, the shared-contract effect redeclarations, and extracting browser-safe room-entry party recovery out of `ExplorationService`. The legacy optimistic-action runner keeps its snapshot/rollback error path (gaining only alias re-establishment after restore); its full replacement is deferred.
- Existing compatibility endpoints remain until this repair is verified; they are fenced from live session work rather than removed.

## Success Criteria

- No client state mutation exists without an accepted replayable entry.
- Reconnect automatically drains or refreshes every supported pause without another tap.
- Lost responses are safe for ordinary, terminal, befriend, corrected, and empty-reward outcomes.
- Client/server party and combat hashes converge across support-to-combat transitions.
- A runway refresh never rerolls active combat or restores stale shared state.
- Genuine browser offline/online windows complete a standard Explore run without blank action areas, skipped NPC rewards, duplicate rewards, unexpected corrections, or loss of the active run.
