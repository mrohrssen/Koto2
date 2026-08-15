# Explore Sync Consolidation Design

**Date:** 2026-08-15
**Status:** Ready for user review
**Branch:** `fix/explore-sync-stop-bleeding` at `dc3ca1f4`
**Scope:** Consolidate the branch's async ownership fences, transport contract, and pause/recovery ownership before merge

## Problem

The branch correctly replaces the permanent `syncRejected` dead end with recoverable Explore outcomes, validates sync responses strictly, and adds deterministic protocol coverage. It also introduces four variations of the same async-currentness rule, retains a test-only bare-response compatibility path in production, splits protocol and retry policy across layers, and duplicates pause/recovery ownership.

The resulting defects are structural rather than cosmetic:

1. A guarded combat recovery can invalidate its own state-identity fence when it intentionally calls `updateGameState()`, leaving adopted state without scene synchronization or input finalization.
2. `createExploreSession()` accepts two incompatible `syncRequest` return shapes. Bare test fixtures bypass the strict production classifier.
3. Valid V2 responses are called `settled` and then retried as unsupported. A V2 conflict can also be followed by a V1 success without tripping the no-downgrade ratchet.
4. Pause metadata claims to configure recovery, but production largely ignores it. Equal-severity pause churn and generic action-area replacement changed behavior without an explicit product decision.
5. Explore sync duplicates low-level fetch plumbing and disguises a client-side auth-binding mismatch as an HTTP 401.
6. Auth and writer-conflict recovery each have duplicate notification or orchestration paths.
7. Mutable entry-point exports and DOM-optional production idioms exist solely for unit tests.

The repair must preserve the branch's core outcome for the supported V1 protocol: no V1 sync outcome may permanently strand or silently discard the pending Explore log. A validated future protocol that this client cannot adopt must fail closed, retain the in-memory log for the lifetime of the page, and state clearly that a compatible client is required.

## Chosen Approach

Introduce one lease-based async ownership primitive, one strict transport boundary, and one pause/recovery controller. Migrate the four fences implicated by this branch and consolidate the adjacent policy paths needed to make those migrations truthful. Do not attempt a repo-wide concurrency rewrite or implement V2 adoption.

This is preferred over:

- **Blocker-only patching:** fixing the ownerless combat comparison and stale fixtures would unblock the immediate examples but retain the hand-placed fence pattern and duplicated ownership that caused them.
- **A fully declarative pause-policy engine:** booleans such as `automaticRecovery` cannot truthfully describe which subsystem owns an asynchronous retry. A focused controller with observed behavioral tests is clearer and smaller.

## Required Invariants

1. Every async continuation migrated by this repair verifies all captured ownership leases before starting and after each suspension point.
2. An operation's permitted synchronous mutation is declared and validated; it cannot trip its own fence or silently bless a reentrant successor.
3. A stale continuation performs no later state, scene, callback, or input-finalization work.
4. `syncRequest` returns one transport envelope shape in production and tests.
5. Only a fully valid V1 envelope may enter V1 checkpoint/correction adoption.
6. Any validated V2 response promotes the no-downgrade ratchet, including conflicts, but V2 success/correction remains unsupported and non-adoptable.
7. Indeterminate V1 responses retain the exact pending log and use one bounded retry/degrade policy. A validated unsupported protocol retains the log but stops retrying because the no-downgrade ratchet makes in-session recovery impossible.
8. Client-side auth supersession is distinguishable from a server HTTP 401.
9. A pause reason changes only when a strictly higher-severity reason supersedes it.
10. Only transport degradation or an unsupported-protocol compatibility block may replace ordinary room actions with transport/version UI. Writer conflict has its dedicated manual-review UI; auth UI remains owned by authentication.
11. One subsystem owns each recovery mechanism: the session owns pending-log transport retries, the controller owns empty-log runway refresh and auth orchestration, and writer conflicts remain paused after explicit latest-progress review because this codebase has no writer-lease acquisition API.
12. Combat mechanics and visuals retain PvE/PvP parity; this work changes only standard Explore PvE recovery coordination.

## Architecture

### 1. Shared async ownership fence

Create `public/js/async-ownership-fence.js` with a small browser-safe API:

- `createAsyncOwnershipFence(leases)` captures one or more domain leases.
- `fence.step(label, operation)` checks every lease before invocation and after the returned promise resolves or rejects.
- Staleness throws a distinct `FenceSuperseded` error so callers cannot confuse supersession with transport failure. Callers catch that exact type and map it to their domain outcome; all other errors retain their original meaning.
- `fence.commit(label, descriptor)` accepts only a branded, domain-owned synchronous commit descriptor created by a captured lease. A descriptor contains prevalidated expected input, a synchronous `apply()` operation, and exact postcondition/revision checks for every lease it advances. The fence verifies all leases before apply, runs apply, advances only the declared leases after exact verification, and then verifies every undeclared lease stayed current.

The primitive does not know about game state, Explore sessions, auth, or combat IDs. Each domain supplies its own captured lease and exact comparison/advance semantics. It must never recapture arbitrary live state after a mutation, because doing so could adopt a reentrant successor as if it belonged to the old operation.

Production code cannot pass arbitrary callbacks to `commit()`: only a lease—constructed with its domain updater—can create a branded descriptor such as `stateLease.expectReplacement(merged)`. Descriptor implementations are synchronous by contract and covered directly by unit tests. If a broken descriptor mutates and then fails its postcondition, the fence throws `FenceContractViolation` and guarantees that no later continuation runs; it does not claim to roll back an already-performed JavaScript side effect.

### 2. Explore-session lease

`createExploreSession()` gains one monotonic ownership revision and exposes one `captureFence()` entry point instead of recovery-specific generation/runway/epoch getters and serialized pending-log comparisons. The revision advances once at the end of each public logical mutation transaction; nested helpers do not independently increment it.

The ownership revision advances for every logical transition that can invalidate a continuation:

- pending-log append, confirmation, correction clear, or reset;
- runway/epoch/cursor adoption;
- pause owner change or resume;
- protocol-version promotion;
- session reset or replacement.

`captureFence()` captures the concrete session object, its current-session provider, and its ownership revision. It supports two explicit pending policies:

- `empty`: the captured session must remain active and empty. This replaces the ordinary state-fetch token.
- `preserve`: the captured session and exact pending stream must remain unchanged. This replaces the auth/writer recovery token.

An intentional runway adoption advances the lease through an exact postcondition: the ownership revision changes by the expected transition, the requested epoch/runway is active, and the preserved pending stream is unchanged.

`getLocalRevision()` and `getCorrectionRevision()` remain where they encode business behavior outside ownership fencing. The recovery-only `getGeneration()`, `getRunwayRevision()`, and `getSessionEpoch()` exports are removed.

### 3. Game-state and combat recovery lease

`public/game.js` tracks a monotonic game-state revision updated by every `updateGameState()` call and exposes a captured lease callback to modules that coordinate recovery. This is one ownership interface, not a collection of raw revision getters.

Combat recovery composes:

- the active Explore-session lease;
- a game-state revision/reference lease;
- captured combat-owner metadata (`combatId`, room index, and room ID when present).

The fetch runs through `fence.step()`. Merging remains synchronous and side-effect free. `updateGameState(merged)` runs through `fence.commit()` with an exact replacement descriptor.

Scene synchronization receives the fence's `isCurrent` predicate. `syncCombatSceneToState()` and the Battle/Exploration scene diff used by this recovery check it before mutation, after each internal await, between ally/enemy phases, and before installing spawned-sprite references or final inputs. Stale spawned sprites are discarded rather than attached. The helper returns `true` only when synchronization completed while current; `false` for an unavailable/disposed/stale scene prevents combat input finalization.

If the authoritative state intentionally hands ownership to a different combat, the new state is adopted once and the result is `recovery_handoff`; the old combat does not restart move selection or finalize its input owner. If the same owner remains active, normal scene synchronization and finalization continue. External supersession before adoption performs no state update; supersession during scene synchronization prevents finalization.

### 4. Auth lease and transport binding

Extract auth-binding state from `public/js/api.js` into `public/js/explore-sync-auth-binding.js`. The module owns:

- binding and clearing the verified `{ principalId, token }`;
- the monotonic auth revision;
- capture/currentness of an auth lease, including the current storage token;
- validation of a returned envelope's plain `authRevision`.

`syncExploreSession()` wraps fetch plus JSON parsing in the shared ownership fence. A binding change before fetch, during fetch, or during parsing returns an honest envelope with `clientAuthMismatch: true`; it does not fabricate a server response.

The WeakMap from transport-object identity to revision is removed. Transport envelopes carry the non-secret `authRevision` directly. The Explore session still verifies that revision after combat-playback adoption, because authentication may change during that separate await.

### 5. One strict transport contract

Every `syncRequest` result has this in-memory shape:

```js
{
  transport: true,
  httpStatus,
  body,
  parseError,
  networkError,
  aborted,
  clientAuthMismatch,
  authRevision,
}
```

Every key is present on every envelope, using `0`, `null`, or `false` defaults as appropriate. Bare response bodies are never normalized inside `drainOnce()`.

`fetchJsonWithTimeout()` remains the canonical low-level fetch implementation and is extended to preserve `parseError`. `syncExploreSession(payload, transportOptions)` may accept a timeout in the second options argument for deterministic tests; no production payload field implies a transport timeout.

A shared test helper builds transport envelopes so unit fixtures mirror the real boundary. Fixtures that are supposed to test malformed responses still use envelopes with deliberately malformed bodies.

### 6. Explicit classifier and protocol ratchet

`classifyExploreTransport()` returns one of:

- `v1Settled`
- `unsupportedProtocol`
- `conflict`
- `authRequired`
- `indeterminate`

Classification rules:

- A valid V1 `ok` response may settle on HTTP 2xx; a valid V1 `corrected` response may settle on HTTP 2xx or 409. Both settle only while the expected protocol is V1.
- Valid V2 `ok`/`corrected` envelopes on HTTP 2xx are `unsupportedProtocol` and are never adopted by this branch.
- A valid V2 conflict on HTTP 409 is `conflict`.
- Every validated V2 result, including conflict, calls one protocol-promotion helper before outcome handling.
- Adopting a V2 runway calls that same promotion helper; there is no second direct assignment site.
- Once promoted to V2, a later V1 response is indeterminate and cannot downgrade the session.
- Network, abort, parse, malformed body, 429, 5xx, unexpected 4xx, and unexpected-version cases are indeterminate.
- Server 401 and `clientAuthMismatch` both enter auth recovery, while retaining distinct transport evidence.

`retryOrDegrade()` owns scheduling and the named `EXPLORE_SYNC_DEGRADE_AFTER_ATTEMPTS = 12` threshold. It is used by indeterminate and thrown-request paths. There is no second retry block in the consumer. `unsupportedProtocol` instead enters an immediate blocking `unsupportedProtocol` pause: once the ratchet has observed V2, accepting a later V1 response would be unsafe and retrying cannot make this V1-only client compatible.

### 7. Pause severity and recovery controller

Shrink `src/shared/explore/pause-reasons.js` to authoritative reason/severity data plus exported comparison helpers. Remove the unused `storageUnavailable` reason and the untruthful `automaticRecovery`, `manualRecovery`, and `resumeWhen` fields.

The registry contains an authoritative numeric replacement priority derived from severity. Temporary and warning reasons share their severity priority; the three blocking owners have explicit order `writerConflict < authRequired < unsupportedProtocol`. `enterPause(reason)` behaves as follows:

- same reason: no-op;
- equal or lower priority: no-op;
- strictly higher priority: replace once and notify once.

This preserves dependency ownership when a hard-cap condition appears at the same severity, while still allowing `transportDegraded` or a blocking owner to escalate. Authentication is a prerequisite for conflict review, so it may temporarily replace writer conflict. After successful reauthentication/adoption, the controller explicitly resolves `authRequired` before draining; a still-valid writer conflict is then redelivered by the server and becomes visible. `unsupportedProtocol` is terminal for this client and cannot be replaced. Both auth→conflict and conflict→auth orderings are regression-tested.

Extract the pause/recovery block from `public/js/ui/exploration.js` into `public/js/ui/explore-session-pause-controller.js`. The controller receives session/auth/adopt/refresh/render/timer/event dependencies instead of reading mutable module globals or optional global DOM.

The controller centralizes concrete behavior:

- `transportDegraded`: connection-loss narration and action-area Retry when pending work exists;
- `unsupportedProtocol`: replace the action area with `A newer version of Koto is required to continue this run.` and no fake Retry action;
- `writerConflict`: Review latest progress / Keep paused; Review fetches and displays the authoritative same-epoch runway but does not repost, resume, or claim writer ownership; online/visibility events remain inert;
- `authRequired`: one coalesced same-account reauthentication, same-epoch adoption, then drain; authentication UI owns the action area;
- runway-ready reasons with an empty log: one coalesced refresh and bounded backoff;
- dependency, hard-cap, combat-playback, and other pending-log pauses: preserve the current action area; the session drain owns progress and resume.

Non-transport temporary pauses use truthful passive narration rather than connection copy: `Syncing your progress. Please wait…` when pending work exists and `Preparing the next room. Please wait…` for an empty runway. They never replace the action area.

The controller always reads `session.getPauseReason()` after a pause attempt, so a stale caller cannot render lower-severity UI over the authoritative reason.

The controller has an explicit lifecycle revision and `dispose()` operation. Construction installs at most one online and visibility listener; disposal removes those listeners, cancels timers, and invalidates every in-flight controller fence. Auth recovery captures both the controller lifecycle lease and the session's `preserve` lease before awaiting reauthentication, then checks after reauthentication, same-epoch adoption, and the post-adoption drain. Session reset/replacement or controller disposal therefore prevents an old auth flow, timer, or event from adopting or draining a successor session.

### 8. Remove duplicate channels and test-only seams

- Remove `onWriterConflict`; `onPause(writerConflict)` is the single notification channel. Rename the manual handler around what it actually does—review latest progress—and leave the session paused after a successful refresh.
- Remove session-level `onAuthRequired`; `onPause(authRequired)` starts the controller's coalesced auth flow.
- Do not arm controller backoff when pending transport work remains; the session already owns that timer.
- Remove ignored `{ reason }` arguments from `syncNow()` call sites.
- Remove the `retryNow: syncNow` identity alias and call the explicit operation used by the controller.
- Extract the combat-phase recovery decision from `public/game.js` into a focused coordinator with injected dependencies. Test that coordinator directly, then remove `setCombatRecoveryStarter`, the mutable function pointer, and the entry-point-only exports of `updateGameState()` / `updateGameContent()`.
- Consolidate `auth.js`'s duplicated resolve-and-clear logic in one `settleReauthentication(result)` helper.
- Remove `automaticRecovery`, `manualRecovery`, and `resumeWhen` policy-shape assertions. The protocol oracle retains registered severity and observed reason checks, but replaces `pausePolicyViolations` / `unrecoverablePauses` with `unknownPauseReasons`; recovery tests assert actual end state and side effects.
- Remove `duplicateExternalEffects: 0` from the protocol oracle because it measures nothing. Existing integration assertions remain the evidence for external-effect idempotency.

## Data Flows

### Ordinary in-session state refresh

1. Drain pending Explore entries.
2. Require an active empty-session lease.
3. Fetch state through a fenced step.
4. If the session changed—even if it appended and later drained, adopted a same-epoch runway, paused, reset, or was replaced—discard the response.
5. Adopt only a valid current response.

### In-flight drain batch ownership

1. `drainOnce()` captures the exact requested entries and `snapshotMaxSeq`; later local appends remain permitted.
2. A V1 `ok` response removes only entries through its validated `confirmedThroughSeq`. Entries appended after the snapshot remain pending and trigger the next drain, preserving current prefix behavior.
3. A V1 correction invalidates speculative work derived from the rejected state, including entries appended after the request snapshot. Those entries are removed from the retryable log only while being delivered verbatim as `discardedEntries` metadata to `onCorrection`; no entry disappears without confirmation or explicit invalidation evidence.
4. Correction UI adopts authoritative state/runway before re-driving. Tests prove a correction for in-flight seq 1 cannot silently erase a later seq 2: seq 2 must appear in `discardedEntries`, and it must never be retried as though it were valid against the corrected state.

### Auth recovery with pending work

1. Sync response classifies as server 401 or client auth mismatch.
2. Session enters `authRequired` once and retains its exact log.
3. Pause controller captures its lifecycle lease and the session's `preserve` lease, then coalesces reauthentication signals.
4. Both leases are checked after reauthentication; recovery then fetches and adopts only a same-epoch runway through a declared commit.
5. The controller resolves the auth pause and starts one fenced fresh drain. Successful V1 settlement clears/resumes normally; replacement/disposal at any await stops the old flow.

### Unsupported protocol

1. Classifier validates a V2 response and promotes the protocol ratchet.
2. Session retains the exact pending log and enters `unsupportedProtocol` without scheduling another request.
3. Controller renders the version-required message and no Retry button.
4. The page remains safely paused. Loading a compatible client is an external recovery boundary and intentionally out of scope; this V1-only code never accepts a downgraded V1 response in the same session.

### Writer conflict review

1. A validated V2 conflict promotes the ratchet and enters `writerConflict` once.
2. Online and visibility events do nothing.
3. Review latest progress performs the fenced same-epoch state/runway refresh so the player can inspect authoritative progress.
4. The controller does not repost the retained log or resume the session because no writer-lease takeover/acquisition contract exists in this codebase.

### Rejected combat append recovery

1. Capture Explore, game-state, and combat-owner leases.
2. Fetch authoritative state through a fenced step.
3. Merge without mutation.
4. Adopt the exact merged state through a declared lease advance.
5. Synchronize the scene through a fenced step.
6. Finalize only if the same recovery still owns the continuation; otherwise hand off or report supersession explicitly.

## Error Handling

- `FenceSuperseded` is an expected concurrency outcome, not logged as a network failure.
- A request rejection is returned to retry policy only when all ownership leases remain current.
- A malformed or unexpected transport response never clears pending work.
- A client auth mismatch never claims a server HTTP status.
- Recovery failures retain the authoritative pause reason and pending log.
- An unsupported protocol is a deliberate compatibility block, not reported as a recoverable connection failure.
- Three failed implementation hypotheses in the same area trigger architecture review rather than layered patches.

## Test Strategy

Every production change follows red-green TDD.

### Fence primitive

- stale-before-start skips the operation;
- invalidation during resolve or reject becomes `FenceSuperseded`;
- a branded declared exact replacement permits the next step;
- wrong revision delta, wrong post-state, undeclared mutation, and an invalid descriptor raise `FenceContractViolation` and permit no later continuation.

### State/session fencing

- append then drain during a GET remains stale;
- same-epoch runway adoption, pause-owner change, reset, and session replacement during a GET remain stale;
- preserved-log recovery rejects any pending-stream change;
- its own declared runway adoption does not self-trip.
- OK confirmation preserves an appended-after-snapshot suffix; correction reports that suffix in `discardedEntries` before invalidating it.

### Combat recovery

- ownerless and same-owner authoritative replacements update state, synchronize the scene, and finalize once;
- successor-owner response adopts once and hands off without old-owner input finalization;
- external replacement before adoption performs no commit;
- replacement during scene synchronization prevents finalization.

### Transport/auth/protocol

- bare V1 bodies cannot settle;
- full V1 transport success/correction settles, while missing required fields does not;
- V2 success/correction is unsupported and preserves the log;
- V2 success/correction immediately enters the version-required pause, schedules no retry, and a following V1 response cannot settle;
- V2 conflict promotes the ratchet; review refreshes authoritative progress but performs no repost/resume, and a following V1 response cannot settle;
- exception, malformed, abort, and network paths share the named degradation threshold;
- auth changes before fetch, during fetch, during parse, and during playback adoption preserve the exact log and suppress callbacks;
- real 401 and client auth mismatch recover once but remain distinguishable.

### Pause/recovery/UI

- equal-priority reasons never replace/notify; strictly higher priority escalates once;
- auth→writer and writer→auth both surface the correct current owner without a deadlocked hidden pause;
- dependency-at-cap remains dependency;
- the controller always renders the authoritative session reason;
- only transport degradation, unsupported protocol, and writer conflict take over the action area;
- concurrent auth pause, online, and visibility signals cause one reauth, one adoption, and one post-adoption drain;
- conflict online/visibility signals remain inert until explicit review;
- pending transport uses only the session retry timer; empty-log runway recovery uses only the controller timer.
- disposal/session replacement cancels old timers/listeners and prevents stale auth adoption or drain.

### Verification

Run focused unit suites after each task, then:

1. syntax checks for every edited JavaScript module;
2. all affected unit suites;
3. Explore integration suites;
4. existing standard Explore, Kanji Kombat, and PvP combat/coordinator suites, including an assertion that the new recovery coordinator gates itself to an active standard Explore session;
5. protocol test under the CI Node 22 runtime, plus direct-file execution if the local Node 24 wildcard runner reproduces its known native assertion;
6. `npm test`, comparing any unavoidable local SudachiPy failure set with the recorded clean baseline;
7. the approved Playwright mobile visual check for transport retry, writer conflict, unsupported protocol, and ordinary non-transport pauses, following `docs/playtest-guide.md`. The visual states are injected only from Playwright with browser-side imports against the real configured session/DOM; no production debug hook is added. Reload/reset separates each state, and screenshots are deleted immediately after display.

## Out of Scope

- V2 response adoption or server V2 implementation;
- writer-lease takeover/acquisition or automatic recovery from a genuine V2 writer conflict;
- persistent/reload-safe offline queues;
- a repo-wide migration of every pre-existing `isCurrent` callback;
- changes to combat math, balance, resolver output, PvP mechanics, or animations;
- Japanese dialogue, dictionary, curriculum, or content changes;
- CSS redesign beyond verifying the existing pause controls are routed to the correct reason.

## Success Criteria

- The four branch-related ownership fences use the shared primitive and no guarded mutation can invalidate itself.
- Production and tests use the same strict transport envelope.
- No protocol layer calls an unsupported response settled.
- No V2 observation can be followed by accepted V1 downgrade.
- Pause severity, rendering, and recovery ownership are deterministic and covered by observed behavior rather than policy-shape assertions.
- Auth recovery, writer-conflict handling, and transport recovery each execute through one owner.
- Pending Explore work is never silently cleared or overwritten. Supported V1 failure paths recover; unsupported V2 paths retain the in-memory log and present a truthful compatibility block rather than retrying forever or accepting a downgrade.
- Focused, integration, protocol, and approved visual verification pass, with unrelated baseline environment failures reported separately.
