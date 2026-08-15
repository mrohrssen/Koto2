# Explore Sync Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Explore sync ownership, transport classification, pause recovery, and rejected-combat recovery so stale async work cannot mutate a successor and no supported V1 failure path loses pending progress.

**Architecture:** Add one small lease-based async fence, expose one revision-based fence capture from the Explore session, and make the API return one strict transport envelope. Move pause rendering/recovery into a lifecycle-owned controller, then compose Explore, game-state, and combat-owner leases in rejected-combat recovery. Keep V2 non-adoptable and fail closed once V2 is observed.

**Tech Stack:** Browser ES modules, Node.js `node:test`, Express integration tests, deterministic protocol harness, PixiJS scene classes.

**Spec:** `docs/superpowers/specs/2026-08-15-explore-sync-consolidation-design.md`

## Global Constraints

- Work only on branch `fix/explore-sync-stop-bleeding` in `/Users/michiarohrssen/Documents/Claude/koto-dev/.worktrees/explore-sync-stop`.
- Every production behavior change follows red-green TDD. A focused test must fail for the intended reason before implementation is written.
- Preserve the approved behavior changes: unsupported protocol is terminal with no retry, and writer-conflict review never reposts or resumes.
- A transport result always has every key in this exact shape: `{ transport, httpStatus, body, parseError, networkError, aborted, clientAuthMismatch, authRevision }`, using `0`, `null`, or `false` defaults.
- Only a fully valid V1 envelope can settle. Valid V2 success/correction is `unsupportedProtocol`; valid V2 conflict is `conflict`; every validated V2 result promotes the no-downgrade ratchet.
- Keep `EXPLORE_SYNC_DEGRADE_AFTER_ATTEMPTS = 12` as the single named degradation threshold.
- Pending V1 work is retained on indeterminate, auth, conflict, and unsupported-protocol paths. A correction may clear speculative work only while supplying exact `discardedEntries` evidence to `onCorrection`.
- Pause replacement is strictly higher-priority only. Temporary reasons share a priority, warning reasons share a priority, and blocking order is `writerConflict < authRequired < unsupportedProtocol`.
- Only `transportDegraded`, `unsupportedProtocol`, and `writerConflict` can replace ordinary room actions. Auth owns its own UI; all other pauses preserve the action area.
- Standard Explore PvE is the only combat recovery mode changed. Shared scene plumbing must remain behavior-compatible for Kanji Kombat and PvP.
- Do not modify `data/dictionary.json`, dialogue frames, Japanese content, combat math, balance, resolver output, PvP mechanics, or animations.
- Do not add production debug hooks or DOM-optional production branches solely for tests.
- Preserve the pre-existing uncommitted approved-spec edit; commit only files belonging to the task being implemented.
- Local Node is 24.15.0 while CI is Node 22. The baseline wildcard integration runner reproduces a Node 24 native assertion, and Sudachi-backed tests fail because `sudachipy` is absent. Direct `tests/integration/flows/explore-session-sync.test.js` passes 5/5; compare final failures against this baseline.

---

### Task 1: Add the shared async ownership fence

**Files:**
- Create: `public/js/async-ownership-fence.js`
- Create: `tests/unit/ui/async-ownership-fence.test.js`

**Interfaces:**
- Produces: `FenceSuperseded`, `FenceContractViolation`, and `createAsyncOwnershipFence(leases)`.
- A captured lease has `{ label, isCurrent() }`.
- `fence.step(label, operation)` verifies all leases before invocation and after promise fulfillment or rejection.
- `fence.commit(label, descriptor)` accepts the spec's minimal descriptor form only: `{ apply, transitions }`, where every transition is `{ lease, verify, advance }` and references a lease captured by this fence.
- `fence.isCurrent()` is the predicate passed into downstream scene synchronization.
- A commit descriptor is synchronous: returning a thenable, omitting functions, declaring the same lease twice, or declaring an uncaptured lease raises `FenceContractViolation`.

- [ ] **Step 1: Write the failing primitive tests**

```js
test('stale-before-start skips the operation', async () => {
  let ran = false;
  const fence = createAsyncOwnershipFence([{ label: 'session', isCurrent: () => false }]);
  await assert.rejects(() => fence.step('fetch', async () => { ran = true; }), FenceSuperseded);
  assert.equal(ran, false);
});

test('invalidation during resolve or reject becomes FenceSuperseded', async () => {
  // Run one fulfillment case and one rejection case; both flip the captured
  // revision inside the operation and must reject as FenceSuperseded rather
  // than returning a value or leaking the operation's original error.
});

test('declared exact replacement advances only its lease', () => {
  // apply changes revision 1 -> 2 and state A -> exact state B; verify checks
  // both facts; advance updates the captured expectation; the next step runs.
});

test('invalid descriptor and broken postconditions stop later work', () => {
  // Cover wrong revision delta, wrong post-state, undeclared mutation,
  // uncaptured transition, asynchronous apply, and missing descriptor fields.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/async-ownership-fence.test.js`

Expected: FAIL because `public/js/async-ownership-fence.js` does not exist.

- [ ] **Step 3: Implement the minimal fence contract**

```js
export class FenceSuperseded extends Error {
  constructor(label, leaseLabel) {
    super(`${label} superseded by ${leaseLabel}`);
    this.name = 'FenceSuperseded';
  }
}

export class FenceContractViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'FenceContractViolation';
  }
}

export function createAsyncOwnershipFence(leases = []) {
  const current = lease => {
    try { return lease.isCurrent() === true; } catch { return false; }
  };
  const assertCurrent = label => {
    const stale = leases.find(lease => !current(lease));
    if (stale) throw new FenceSuperseded(label, stale.label || 'lease');
  };

  return {
    isCurrent: () => leases.every(current),
    async step(label, operation) {
      assertCurrent(label);
      try {
        const value = await operation();
        assertCurrent(label);
        return value;
      } catch (error) {
        assertCurrent(label);
        throw error;
      }
    },
    commit(label, descriptor = {}) {
      assertCurrent(label);
      const { apply, transitions } = descriptor;
      if (typeof apply !== 'function' || !Array.isArray(transitions)) {
        throw new FenceContractViolation(`${label} has an invalid descriptor`);
      }
      const declared = new Set();
      for (const transition of transitions) {
        if (!leases.includes(transition?.lease) || declared.has(transition.lease)) {
          throw new FenceContractViolation(`${label} declares an invalid lease`);
        }
        if (typeof transition.verify !== 'function' || typeof transition.advance !== 'function') {
          throw new FenceContractViolation(`${label} has an invalid transition`);
        }
        declared.add(transition.lease);
      }
      const value = apply();
      if (value && typeof value.then === 'function') {
        throw new FenceContractViolation(`${label} apply must be synchronous`);
      }
      for (const lease of leases) {
        if (!declared.has(lease) && !current(lease)) {
          throw new FenceContractViolation(`${label} mutated undeclared ${lease.label || 'lease'}`);
        }
      }
      for (const transition of transitions) {
        if (transition.verify() !== true) {
          throw new FenceContractViolation(`${label} failed ${transition.lease.label || 'lease'} postcondition`);
        }
      }
      transitions.forEach(transition => transition.advance());
      if (!leases.every(current)) {
        throw new FenceContractViolation(`${label} did not advance to the verified lease state`);
      }
      return value;
    },
  };
}
```

Keep the module near the spec's roughly 150-line budget. Do not add domain knowledge or a `commit(label, callback)` overload.

- [ ] **Step 4: Run focused verification**

Run: `node --test tests/unit/ui/async-ownership-fence.test.js && node --check public/js/async-ownership-fence.js`

Expected: all primitive tests pass with no warnings from this module.

- [ ] **Step 5: Commit**

```bash
git add public/js/async-ownership-fence.js tests/unit/ui/async-ownership-fence.test.js
git commit -m "refactor: add async ownership fence"
```

---

### Task 2: Replace Explore recovery tokens with one session fence capture

**Files:**
- Modify: `public/js/ui/explore-session.js`
- Modify: `public/js/ui/explore-session-recovery.js`
- Modify: `public/js/ui/game-state-adoption.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/explore-session.test.js`
- Modify: `tests/unit/ui/explore-session-recovery.test.js`
- Modify: `tests/unit/ui/game-state-adoption.test.js`
- Modify: `tests/unit/ui/explore-legacy-fence.test.js`

**Interfaces:**
- Consumes: `createAsyncOwnershipFence()` from Task 1.
- Produces: `session.captureFence({ pending, leases = [] })`, where `pending` is exactly `'empty'` or `'preserve'`.
- The return value is `{ fence, sessionLease, expectRunwayAdoption(nextRunway) }`.
- `expectRunwayAdoption(nextRunway)` creates a descriptor that requires exactly one ownership-revision advance, exact requested epoch/runway adoption, and unchanged captured pending entries.
- Removes recovery-only `getGeneration()`, `getRunwayRevision()`, and `getSessionEpoch()` exports and JSON-stringified token comparison.

- [ ] **Step 1: Write failing ownership-revision tests**

```js
test('empty session fence rejects append then drain during a GET', async () => {
  // Capture with pending:'empty', append and drain back to empty while fetch is
  // pending, then prove the response remains stale despite the final count 0.
});

test('empty session fence rejects same-epoch adoption, pause change, reset, and replacement', async () => {
  // Each logical transition advances ownership once and invalidates the fetch.
});

test('preserve fence rejects any pending-stream change', async () => {
  // Append a second action after capture and prove preserved recovery cannot adopt.
});

test('declared same-epoch runway adoption advances without self-superseding', async () => {
  // Recovery adopts actionSeq 10 -> 11, retains the exact pending action, and a
  // fenced next step still runs.
});

test('legacy session action uses the shared ownership fence', async () => {
  // Replace the active session while the action is suspended; the old action
  // returns the existing superseded result without state, scene, or callback work.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-recovery.test.js tests/unit/ui/game-state-adoption.test.js tests/unit/ui/explore-legacy-fence.test.js`

Expected: new cases fail because `captureFence()` and declared runway adoption do not exist.

- [ ] **Step 3: Implement one monotonic ownership revision**

```js
let ownershipRevision = 0;

function completeOwnershipTransaction(mutator) {
  const result = mutator();
  ownershipRevision += 1;
  return result;
}

function captureFence({ pending, leases = [] } = {}) {
  // Capture concrete session identity, ownershipRevision, and either empty or
  // the exact cloned pending stream; return the shared fence plus the session's
  // exact-runway commit descriptor factory.
}
```

Advance once for each logical append, confirmation/correction clear, runway/cursor adoption, pause owner change/resume, protocol promotion, reset, or active-session replacement. Nested helpers must not double-increment.

- [ ] **Step 4: Migrate ordinary and preserved state adoption**

```js
const capture = session.captureFence({ pending: 'preserve' });
const data = await capture.fence.step('fetch recovery state', () => fetchState({ adoptSession: true }));
capture.fence.commit('adopt recovery runway', capture.expectRunwayAdoption(data.run.exploreRunway));
```

Use `pending:'empty'` in ordinary in-session state refresh. `FenceSuperseded` maps to `null`/`false`; other errors keep their existing meaning. Keep `isGameStateErrorResponse()` as the pure response helper.

- [ ] **Step 5: Run focused verification**

Run: `node --test tests/unit/ui/async-ownership-fence.test.js tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-recovery.test.js tests/unit/ui/game-state-adoption.test.js tests/unit/ui/explore-legacy-fence.test.js`

Run: `node --check public/js/ui/explore-session.js && node --check public/js/ui/explore-session-recovery.js && node --check public/js/ui/game-state-adoption.js && node --check public/game.js`

Expected: focused tests pass; searches for `getGeneration`, `getRunwayRevision`, `captureExploreRecoveryToken`, and `isExploreRecoveryCurrent` return no production references.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/explore-session.js public/js/ui/explore-session-recovery.js public/js/ui/game-state-adoption.js public/game.js tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-recovery.test.js tests/unit/ui/game-state-adoption.test.js tests/unit/ui/explore-legacy-fence.test.js
git commit -m "refactor: unify explore session ownership"
```

---

### Task 3: Extract auth binding and enforce one strict transport envelope

**Files:**
- Create: `public/js/explore-sync-auth-binding.js`
- Create: `tests/helpers/explore-sync-transport.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/auth.js`
- Modify: `tests/unit/api-network-hardening.test.js`
- Modify: `tests/unit/ui/auth-reauth.test.js`
- Modify: `tests/protocol/helpers/fault-link.js`

**Interfaces:**
- Produces/re-exports: `bindExploreSyncAuthPrincipal`, `clearExploreSyncAuthPrincipal`, `captureExploreSyncAuthLease`, and `isExploreSyncResponseAuthCurrent`.
- `syncExploreSession(payload, transportOptions = {})` accepts `timeoutMs` only in its second argument.
- `makeExploreTransport(overrides)` returns the exact eight-key envelope for every test fixture.
- Removes `exploreSyncResponseBindings` and every synthetic client-side HTTP 401.

- [ ] **Step 1: Write failing transport/auth tests**

```js
const ENVELOPE_KEYS = [
  'transport', 'httpStatus', 'body', 'parseError', 'networkError',
  'aborted', 'clientAuthMismatch', 'authRevision',
];

test('every Explore transport path returns the complete envelope', async () => {
  // Cover 2xx JSON, server 401, parse failure, network failure, abort, and
  // binding mismatch; compare Object.keys(result).sort() to ENVELOPE_KEYS.sort().
});

test('client auth mismatch is not reported as server 401', async () => {
  assert.equal(result.httpStatus, 0);
  assert.equal(result.clientAuthMismatch, true);
  assert.equal(result.body, null);
});

test('auth changes before fetch, during fetch, and during parse remain distinguishable', async () => {
  // Each case returns clientAuthMismatch:true with the captured authRevision and
  // does not expose a parsed body as adoptable.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/api-network-hardening.test.js tests/unit/ui/auth-reauth.test.js`

Expected: new envelope-shape and client-mismatch assertions fail against the partial/synthetic-401 implementation.

- [ ] **Step 3: Implement the binding module and canonical envelope builder**

```js
export function makeExploreTransport(overrides = {}) {
  return {
    transport: true,
    httpStatus: 0,
    body: null,
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
    ...overrides,
  };
}
```

Production uses the same shape directly. Extend `fetchJsonWithTimeout()` to return `parseError` rather than flattening invalid JSON to `{}`. Wrap fetch and JSON parsing in the shared fence created from the captured auth lease.

- [ ] **Step 4: Rewire auth and fixtures**

`auth.js` imports binding operations from `explore-sync-auth-binding.js`. `api.js` may re-export the old public names for stable imports, but it must not own binding state. Protocol fault fixtures use `tests/helpers/explore-sync-transport.js`; deliberately malformed bodies still live inside complete envelopes.

- [ ] **Step 5: Run focused verification**

Run: `node --test tests/unit/api-network-hardening.test.js tests/unit/ui/auth-reauth.test.js`

Run: `node --check public/js/explore-sync-auth-binding.js && node --check public/js/api.js && node --check public/js/ui/auth.js`

Expected: complete envelopes on every path, preserved parse errors, and no `WeakMap` response binding.

- [ ] **Step 6: Commit**

```bash
git add public/js/explore-sync-auth-binding.js public/js/api.js public/js/ui/auth.js tests/helpers/explore-sync-transport.js tests/unit/api-network-hardening.test.js tests/unit/ui/auth-reauth.test.js tests/protocol/helpers/fault-link.js
git commit -m "refactor: enforce explore sync transport boundary"
```

---

### Task 4: Make classification, protocol ratcheting, retry, and pause priority explicit

**Files:**
- Modify: `src/shared/explore/sync-outcome.js`
- Modify: `src/shared/explore/pause-reasons.js`
- Modify: `public/js/ui/explore-session.js`
- Modify: `tests/unit/shared/explore-sync-outcome.test.js`
- Modify: `tests/unit/ui/explore-session.test.js`
- Modify: `tests/unit/ui/auth-reauth.test.js`

**Interfaces:**
- `classifyExploreTransport()` returns exactly `v1Settled`, `unsupportedProtocol`, `conflict`, `authRequired`, or `indeterminate`.
- Produces: `EXPLORE_SYNC_DEGRADE_AFTER_ATTEMPTS = 12`, one `promoteProtocolVersion(version)` assignment site, and one `retryOrDegrade()` scheduling path.
- Produces: `pausePriority(reason)` and `shouldReplacePauseReason(currentReason, nextReason)` from `pause-reasons.js`.
- Produces: `session.resolvePause(reason)` for controller-owned prerequisite resolution.
- Removes session-level `onAuthRequired` and `onWriterConflict` callbacks.

- [ ] **Step 1: Write the failing classifier and pause tests**

```js
test('classifies strict V1, unsupported V2, conflict, auth, and indeterminate envelopes', () => {
  // V1 ok/corrected => v1Settled only with required fields and allowed status.
  // V2 ok/corrected => unsupportedProtocol.
  // V2 409 conflict => conflict.
  // HTTP 401 or clientAuthMismatch => authRequired, with evidence distinguishable.
});

test('equal-priority pauses do not replace or notify', () => {
  // dependency -> hardCap remains dependency; writerConflict -> writerConflict is
  // a no-op; a strictly higher reason notifies exactly once.
});

test('V2 conflict promotes the ratchet and later V1 cannot settle', async () => {
  // First envelope is valid V2 conflict; second is valid V1 ok. Pending log
  // remains exact, current pause is writerConflict, and checkpoint never fires.
});

test('unsupported protocol pauses immediately without retry', async () => {
  // Valid V2 ok and corrected each promote once, retain the exact log, enter
  // unsupportedProtocol, schedule zero retries, and ignore later V1 success.
});

test('auth and writer conflict orderings surface the authoritative owner', async () => {
  // authRequired supersedes writerConflict; resolving auth allows a redelivered
  // conflict to become visible. writerConflict cannot hide authRequired, and
  // unsupportedProtocol supersedes both and remains terminal.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/shared/explore-sync-outcome.test.js tests/unit/ui/explore-session.test.js`

Expected: V2 is still called `settled`, conflict does not ratchet, equal-priority pause churns, and unsupported responses retry.

- [ ] **Step 3: Implement final reason priorities**

```js
const PRIORITY = Object.freeze({
  temporary: 10,
  warning: 20,
  writerConflict: 30,
  authRequired: 40,
  unsupportedProtocol: 50,
});
```

Remove `storageUnavailable`, `automaticRecovery`, `manualRecovery`, and `resumeWhen`. The registry retains only authoritative reason, severity, and numeric replacement priority. Same, equal, or lower priority is a no-op.

- [ ] **Step 4: Consolidate the session outcome paths**

```js
function retryOrDegrade() {
  scheduleRetry();
  if (attempts >= EXPLORE_SYNC_DEGRADE_AFTER_ATTEMPTS) enterPause('transportDegraded');
}

function promoteProtocolVersion(version) {
  if (version === 2 && expectedProtocolVersion < 2) {
    expectedProtocolVersion = 2;
    advanceOwnershipRevision();
  }
}
```

Consume only complete transport envelopes. Promote before handling every validated V2 result. Auth/conflict only enter their pause and return; their orchestration belongs to the controller. Unsupported protocol enters its terminal pause and never calls retry. Thrown requests and every indeterminate result use `retryOrDegrade()`.

- [ ] **Step 5: Run focused verification**

Run: `node --test tests/unit/shared/explore-sync-outcome.test.js tests/unit/ui/explore-session.test.js tests/unit/ui/auth-reauth.test.js`

Run: `node --check src/shared/explore/sync-outcome.js && node --check src/shared/explore/pause-reasons.js && node --check public/js/ui/explore-session.js`

Expected: all new behavior is green and no production branch uses the string `settled` for V2.

- [ ] **Step 6: Commit**

```bash
git add src/shared/explore/sync-outcome.js src/shared/explore/pause-reasons.js public/js/ui/explore-session.js tests/unit/shared/explore-sync-outcome.test.js tests/unit/ui/explore-session.test.js tests/unit/ui/auth-reauth.test.js
git commit -m "fix: make explore sync outcomes deterministic"
```

---

### Task 5: Preserve correction evidence for every discarded entry

**Files:**
- Modify: `public/js/ui/explore-session.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `tests/unit/ui/explore-session.test.js`
- Modify: `tests/unit/ui/explore-session-cutover.test.js`

**Interfaces:**
- A correction callback receives `{ ...response, discardedEntries }`.
- `discardedEntries` is an exact cloned ordered list of every pending entry not confirmed by the correction, including actions appended after the request snapshot.
- The retryable log is cleared only after this list is built; the callback receives the evidence before any re-drive can occur.

- [ ] **Step 1: Write the failing suffix-correction test**

```js
test('correction reports an appended-after-snapshot suffix before invalidating it', async () => {
  // Start seq 1 sync, append seq 2 while response is pending, resolve correction
  // rejecting seq 1, then assert onCorrection sees [seq 1, seq 2] verbatim,
  // pendingCount becomes 0, and no later request retries seq 2.
});

test('ok confirmation preserves an appended-after-snapshot suffix', async () => {
  // Start seq 1 sync, append seq 2, confirm through seq 1, and assert seq 2 stays
  // pending and is the only entry in the next request.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-cutover.test.js`

Expected: correction currently clears the log without `discardedEntries`.

- [ ] **Step 3: Implement ordered correction evidence**

```js
const discardedEntries = log
  .filter(entry => entry.seq > confirmedThroughSeq)
  .map(entry => cloneValue(entry));
const correction = { ...response, discardedEntries };
log = [];
notify(onCorrection, correction);
```

Use the response's validated `confirmedThroughSeq` semantics, including `null`. Do not mutate the transport body object in place.

- [ ] **Step 4: Run focused verification**

Run: `node --test tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-cutover.test.js`

Run: `node --check public/js/ui/explore-session.js && node --check public/js/ui/exploration.js`

Expected: suffix evidence is exact and no invalidated entry is retried.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/explore-session.js public/js/ui/exploration.js tests/unit/ui/explore-session.test.js tests/unit/ui/explore-session-cutover.test.js
git commit -m "fix: report discarded explore correction entries"
```

---

### Task 6: Extract the pause controller and centralize non-auth recovery

**Files:**
- Create: `public/js/ui/explore-session-pause-controller.js`
- Create: `tests/unit/ui/explore-session-pause-controller.test.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/explore-session-cutover.test.js`

**Interfaces:**
- Produces: `createExploreSessionPauseController(dependencies)` returning `{ handlePause, triggerRecovery, reviewLatestProgress, dispose }`.
- Dependencies are explicit: `getSession`, `refreshRunwayState`, `reviewAuthoritativeState({ capture })`, `renderNarration`, `renderActions`, `showToast`, `schedule`, `cancel`, `windowTarget`, and `documentTarget`.
- Writer review captures `pending:'preserve'`; `reviewAuthoritativeState({ capture })` performs a fenced same-epoch fetch/adoption/display through that supplied capture and never calls `syncNow()` or `resolvePause()`.
- Controller lifecycle is revision-owned; `dispose()` removes exactly the listeners it installed, cancels timers, and invalidates in-flight work.
- Task 7 adds auth dependencies without changing the core interface shape.

- [ ] **Step 1: Write failing controller behavior tests**

```js
test('only transport, unsupported protocol, and writer conflict replace actions', async () => {
  // Assert transport gets Retry, unsupported gets the exact version message and
  // no Retry, writer conflict gets exactly two review/pause actions, auth and
  // all temporary reasons call renderActions zero times.
});

test('writer review adopts authoritative progress without reposting or resuming', async () => {
  // Click Review latest progress; assert one review fetch/display, zero syncNow,
  // zero resolvePause, pending log retained, writerConflict still current.
});

test('pending transport and empty runway use different timer owners', async () => {
  // Pending work arms no controller timer; empty runway-ready pause coalesces one
  // refresh and uses bounded delays [500,1000,2000,4000,8000,15000].
});

test('dispose removes listeners, cancels timers, and stops stale completion', async () => {
  // At most one online and visibility listener are installed; after dispose an
  // old refresh resolution cannot render, adopt, or schedule again.
});

test('a stale caller cannot render below the authoritative pause reason', async () => {
  // Attempt to handle dependency after the session has already promoted itself
  // to authRequired; assert auth orchestration runs and passive dependency copy
  // is never rendered over it.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/explore-session-pause-controller.test.js tests/unit/ui/explore-session-cutover.test.js`

Expected: controller module is missing and existing writer review reposts/resumes.

- [ ] **Step 3: Implement authoritative rendering and recovery routing**

```js
function handlePause() {
  const session = getSession();
  const reason = session?.getPauseReason?.();
  // Re-read after any pause attempt; render only this authoritative reason.
}
```

Use exact copy `A newer version of Koto is required to continue this run.` for unsupported protocol. Use `Syncing your progress. Please wait…` for non-transport pauses with pending work and `Preparing the next room. Please wait…` for an empty runway. These passive paths never clear or replace actions.

- [ ] **Step 4: Wire the controller and remove the embedded block**

Delete `showExploreSoftPause`, `showExploreWriterConflict`, generic `runExploreSessionRecovery`, listener globals, and duplicate recovery timers from `exploration.js`. Construction happens during exploration initialization; replacement/reset disposes the previous controller.

- [ ] **Step 5: Run focused verification**

Run: `node --test tests/unit/ui/explore-session-pause-controller.test.js tests/unit/ui/explore-session-cutover.test.js tests/unit/ui/auto-proceed-room-transition.test.js`

Run: `node --check public/js/ui/explore-session-pause-controller.js && node --check public/js/ui/exploration.js && node --check public/game.js`

Expected: writer conflict remains paused after review, events remain inert for conflict, and only empty-log runway recovery uses controller backoff.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/explore-session-pause-controller.js public/js/ui/exploration.js public/game.js tests/unit/ui/explore-session-pause-controller.test.js tests/unit/ui/explore-session-cutover.test.js
git commit -m "refactor: centralize explore pause recovery"
```

---

### Task 7: Give auth recovery one fenced lifecycle owner

**Files:**
- Modify: `public/js/ui/explore-session-pause-controller.js`
- Modify: `public/js/ui/explore-session-recovery.js`
- Modify: `public/js/ui/auth.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/explore-session-pause-controller.test.js`
- Modify: `tests/unit/ui/explore-session-recovery.test.js`
- Modify: `tests/unit/ui/auth-reauth.test.js`
- Modify: `tests/unit/ui/explore-session-cutover.test.js`

**Interfaces:**
- Adds controller dependencies `reauthenticate` and `adoptRecoveryState({ capture })`; adoption must use the supplied capture's fenced fetch and exact runway commit instead of recapturing.
- Auth recovery captures both controller lifecycle and `session.captureFence({ pending:'preserve' })` before awaiting.
- `session.resolvePause(reason, { owner })` and `session.syncNow({ owner })` advance that captured session owner only for their exact built-in pause/drain transitions. The options replace ignored `{ reason }` metadata; they are not arbitrary callbacks.
- Produces internal `settleReauthentication(result)` in `auth.js`; every success, refusal, and logout path resolves/clears through it once.

- [ ] **Step 1: Write failing coalescing and supersession tests**

```js
test('concurrent auth pause, online, and visibility signals recover once', async () => {
  // Assert one reauthentication, one same-epoch adoption, one resolvePause, and
  // one post-adoption syncNow.
});

test('session change during login stops the old flow and permits a fresh attempt', async () => {
  // First login succeeds after the preserve lease trips. Assert no old adoption
  // or drain, authoritative reason is re-rendered, and second recovery adopts and
  // drains without invoking reauthenticate a second time.
});

test('controller disposal at every auth await prevents successor mutation', async () => {
  // Cover disposal during login, adoption, and drain completion.
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/explore-session-pause-controller.test.js tests/unit/ui/explore-session-recovery.test.js tests/unit/ui/auth-reauth.test.js tests/unit/ui/explore-session-cutover.test.js`

Expected: auth still has duplicate orchestration and no lifecycle/session composite fence.

- [ ] **Step 3: Implement the fenced auth sequence**

```js
const capture = session.captureFence({ pending: 'preserve', leases: [lifecycleLease] });
await capture.fence.step('reauthenticate', reauthenticate);
await adoptRecoveryState({ capture });
session.resolvePause('authRequired', { owner: capture.sessionLease });
await session.syncNow({ owner: capture.sessionLease });
if (!capture.fence.isCurrent() || getSession() !== session) {
  throw new FenceSuperseded('post-auth drain', 'session');
}
```

If `FenceSuperseded` occurs, perform no later side effects, re-read and render the authoritative pause, clear only the controller's in-flight promise, and allow a fresh attempt. The completed login remains bound.

- [ ] **Step 4: Consolidate auth settlement**

```js
function settleReauthentication(result) {
  const request = reauthenticationRequest;
  reauthenticationRequest = null;
  request?.resolve(result);
}
```

Use the helper from successful same-account login, logout, and refusal/terminal paths. Do not resolve the same request twice.

- [ ] **Step 5: Run focused verification**

Run: `node --test tests/unit/ui/explore-session-pause-controller.test.js tests/unit/ui/explore-session-recovery.test.js tests/unit/ui/auth-reauth.test.js tests/unit/ui/explore-session-cutover.test.js`

Run: `node --check public/js/ui/explore-session-pause-controller.js && node --check public/js/ui/explore-session-recovery.js && node --check public/js/ui/auth.js && node --check public/game.js`

Expected: auth recovery is coalesced, same-account only, stale-safe at every await, and owns no action-area UI.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/explore-session-pause-controller.js public/js/ui/explore-session-recovery.js public/js/ui/auth.js public/game.js tests/unit/ui/explore-session-pause-controller.test.js tests/unit/ui/explore-session-recovery.test.js tests/unit/ui/auth-reauth.test.js tests/unit/ui/explore-session-cutover.test.js
git commit -m "fix: fence explore auth recovery lifecycle"
```

---

### Task 8: Fence rejected-combat recovery through state, scene, and input finalization

**Files:**
- Create: `public/js/ui/combat-recovery-coordinator.js`
- Create: `tests/unit/ui/combat-recovery-coordinator.test.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/scenes/battle-scene.js`
- Modify: `public/js/scenes/exploration-scene.js`
- Modify: `tests/unit/ui/combat-network-hardening.test.js`
- Modify: `tests/unit/ui/combat-session-local.test.js`
- Modify: `tests/unit/scenes/exploration-scene.test.js`

**Interfaces:**
- `public/game.js` owns monotonic `gameStateRevision`; every `updateGameState()` advances it.
- Produces injected `captureGameStateLease()` whose `expectReplacement(merged)` descriptor requires exact reference replacement and revision `+1`.
- `createCombatRecoveryCoordinator(dependencies).recover({ actionType, capturedOwner })` composes the standard Explore session fence, game-state lease, and combat owner (`combatId`, room index, room ID when present).
- `syncCombatSceneToState(state, { initial, isCurrent })` and scene `syncCreatures()` accept a default-true currentness predicate.

- [ ] **Step 1: Write failing recovery ownership tests**

```js
test('ownerless and same-owner replacement adopts, syncs, and finalizes once', async () => {
  const harness = makeRecoveryHarness({ capturedCombatId: null, authoritativeCombatId: 'combat-a' });
  const result = await harness.coordinator.recover({ actionType: 'defend', capturedOwner: harness.owner });
  assert.equal(result.outcome, 'null_post_state_recovered');
  assert.equal(harness.updateCount(), 1);
  assert.equal(harness.sceneSyncCount(), 1);
  assert.equal(harness.finalizeCount(), 1);
});

test('successor-owner replacement adopts once and returns recovery_handoff', async () => {
  const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-b' });
  const result = await harness.coordinator.recover({ actionType: 'defend', capturedOwner: harness.owner });
  assert.equal(result.outcome, 'recovery_handoff');
  assert.equal(harness.updateCount(), 1);
  assert.equal(harness.finalizeCount(), 0);
});

test('external replacement before adoption performs no commit', async () => {
  const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a' });
  const recovery = harness.coordinator.recover({ actionType: 'attack', capturedOwner: harness.owner });
  await harness.fetchStarted;
  harness.replaceExternally('combat-c');
  harness.resolveFetch();
  assert.equal((await recovery).outcome, 'recovery_superseded');
  assert.equal(harness.updateCount(), 0);
  assert.equal(harness.sceneSyncCount(), 0);
  assert.equal(harness.finalizeCount(), 0);
});

test('replacement during scene synchronization prevents finalization', async () => {
  const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a' });
  harness.invalidateDuringEnemyPhase('combat-c');
  const result = await harness.coordinator.recover({ actionType: 'attack', capturedOwner: harness.owner });
  assert.equal(result.outcome, 'recovery_superseded');
  assert.equal(harness.attachedStaleSprites(), 0);
  assert.equal(harness.finalizeCount(), 0);
});

test('disposed or unavailable scene returns false and blocks finalization', async () => {
  const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a', disposedScene: true });
  const result = await harness.coordinator.recover({ actionType: 'attack', capturedOwner: harness.owner });
  assert.equal(result.outcome, 'recovery_scene_unavailable');
  assert.equal(harness.finalizeCount(), 0);
});
```

Implement `makeRecoveryHarness()` in the test file with deferred fetch/scene promises and literal state objects. Its counters must record real injected dependency calls; do not assert on a mock component's rendered placeholder.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/combat-recovery-coordinator.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/combat-session-local.test.js tests/unit/scenes/exploration-scene.test.js`

Expected: current recovery can self-invalidate around `updateGameState()` and scene sync cannot stop between internal awaits.

- [ ] **Step 3: Implement the composite recovery fence**

```js
const stateLease = captureGameStateLease();
const combatLease = captureCombatOwnerLease(capturedOwner);
const capture = session.captureFence({
  pending: 'preserve',
  leases: [stateLease, combatLease],
});
const fetched = await capture.fence.step('fetch authoritative combat', fetchState);
const merged = mergeAuthoritativeCombatState(getState(), { state: fetched });
capture.fence.commit('adopt authoritative combat', stateLease.expectReplacement(merged));
const synced = await capture.fence.step('sync combat scene', () => (
  syncScene(merged, { isCurrent: capture.fence.isCurrent })
));
```

Map `FenceSuperseded` to `recovery_superseded`. Detect owner handoff after the exact state commit and before input finalization. Do not restart old-owner selection on handoff.

- [ ] **Step 4: Make scene diffs currentness-aware**

Check `isCurrent()` before mutation, after every await, between ally and enemy phases, and before assigning spawned-sprite references or final inputs. Destroy/discard stale spawned sprites instead of attaching them. Default predicates keep ordinary PvE, Kanji Kombat, and PvP callers unchanged.

- [ ] **Step 5: Run focused parity verification**

Run: `node --test tests/unit/ui/combat-recovery-coordinator.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/combat-session-local.test.js tests/unit/scenes/exploration-scene.test.js tests/unit/ui/pvp-battle-battlefield-parity.test.js tests/unit/pvp/pvp-combat.test.js`

Run: `node --check public/js/ui/combat-recovery-coordinator.js && node --check public/js/ui/combat-loop.js && node --check public/js/scenes/battle-scene.js && node --check public/js/scenes/exploration-scene.js && node --check public/game.js`

Expected: all ownership outcomes are explicit; PvP and Kanji Kombat defaults remain green.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-recovery-coordinator.js public/game.js public/js/ui/combat-loop.js public/js/scenes/battle-scene.js public/js/scenes/exploration-scene.js tests/unit/ui/combat-recovery-coordinator.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/combat-session-local.test.js tests/unit/scenes/exploration-scene.test.js
git commit -m "fix: fence rejected combat recovery"
```

---

### Task 9: Extract combat-phase recovery and remove mutable entry-point seams

**Files:**
- Create: `public/js/ui/combat-phase-recovery-coordinator.js`
- Create: `tests/unit/ui/combat-phase-recovery-coordinator.test.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/combat-playback-adoption-serialization.test.js`
- Modify: `tests/unit/ui/combat-recovery-gate.test.js`

**Interfaces:**
- Produces: `createCombatPhaseRecoveryCoordinator({ getSession, gate, isCombatActive, getPlaybackRecoveryState, consumePlaybackRecovery, startCombat })`.
- `handle(state)` starts only for active standard Explore combat, preserves the one-shot gate, and honors the existing ready/held playback-recovery contract.
- Removes `setCombatRecoveryStarter`, mutable `combatRecoveryStarter`, and entry-point-only exports of `updateGameState()` and `updateGameContent()`.

- [ ] **Step 1: Write failing coordinator tests**

```js
test('starts recovery once for active standard Explore combat', () => {
  let starts = 0;
  const coordinator = createCombatPhaseRecoveryCoordinator({
    getSession: () => ({ isPaused: () => false }),
    gate: { shouldRecover: () => true, markDone: () => {} },
    isCombatActive: () => false,
    getPlaybackRecoveryState: () => 'none',
    consumePlaybackRecovery: () => false,
    startCombat: ({ recovery }) => { assert.equal(recovery, true); starts += 1; },
  });
  coordinator.handle({ phase: 'combat', run: { active: true, mode: 'standard' }, combat: { active: true } });
  assert.equal(starts, 1);
});

test('does not start for Kanji Kombat, PvP, inactive run, or non-combat phase', () => {
  const states = [
    { phase: 'combat', run: { active: true, mode: 'kanjiKombat' }, combat: { active: true } },
    { phase: 'pvp_combat', run: { active: true, mode: 'standard' }, combat: { active: true } },
    { phase: 'combat', run: { active: false, mode: 'standard' }, combat: { active: true } },
    { phase: 'exploring', run: { active: true, mode: 'standard' }, combat: null },
  ];
  let starts = 0;
  const coordinator = createCombatPhaseRecoveryCoordinator(makePhaseDependencies({
    startCombat: () => { starts += 1; },
  }));
  states.forEach(state => coordinator.handle(state));
  assert.equal(starts, 0);
});

test('ready playback recovery bypasses the consumed reload gate once', () => {
  let starts = 0;
  const coordinator = createCombatPhaseRecoveryCoordinator(makePhaseDependencies({
    gateShouldRecover: ({ playbackRecovery }) => playbackRecovery,
    playbackState: 'ready',
    consumePlaybackRecovery: () => true,
    startCombat: () => { starts += 1; },
  }));
  coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);
  coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);
  assert.equal(starts, 1);
});

test('held playback recovery does not unlock ordinary recovery', () => {
  let starts = 0;
  const coordinator = createCombatPhaseRecoveryCoordinator(makePhaseDependencies({
    gateShouldRecover: ({ playbackRecoveryHeld }) => !playbackRecoveryHeld,
    playbackState: 'held',
    startCombat: () => { starts += 1; },
  }));
  coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);
  assert.equal(starts, 0);
});
```

Define `STANDARD_EXPLORE_COMBAT_STATE` and `makePhaseDependencies()` as literal test fixtures in this new test file so every branch above runs through the real coordinator.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/unit/ui/combat-phase-recovery-coordinator.test.js tests/unit/ui/combat-playback-adoption-serialization.test.js tests/unit/ui/combat-recovery-gate.test.js`

Expected: coordinator module is absent and serialization tests still require mutable `game.js` exports.

- [ ] **Step 3: Implement and wire the focused coordinator**

Move only the combat-phase decision from `updateGameContent()`; leave rendering in `game.js`. Inject real `combatLoopUI.startCombatLoop` during construction. Tests target the coordinator directly rather than importing/mutating the entry point.

- [ ] **Step 4: Remove the old seams and comments**

Delete `setCombatRecoveryStarter`, `defaultCombatRecoveryStarter`, mutable starter state, and test-only export annotations. Keep `window.__gameState` because it is the documented browser playtest state seam, not a mutable module export.

- [ ] **Step 5: Run focused verification**

Run: `node --test tests/unit/ui/combat-phase-recovery-coordinator.test.js tests/unit/ui/combat-playback-adoption-serialization.test.js tests/unit/ui/combat-recovery-gate.test.js tests/unit/ui/combat-session-local.test.js`

Run: `node --check public/js/ui/combat-phase-recovery-coordinator.js && node --check public/game.js`

Expected: standard Explore gating is direct-tested and no test imports mutable game entry points.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-phase-recovery-coordinator.js public/game.js tests/unit/ui/combat-phase-recovery-coordinator.test.js tests/unit/ui/combat-playback-adoption-serialization.test.js tests/unit/ui/combat-recovery-gate.test.js
git commit -m "refactor: isolate combat phase recovery"
```

---

### Task 10: Remove obsolete recovery channels and update protocol evidence

**Files:**
- Modify: `public/js/ui/explore-session.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/game.js`
- Modify: `tests/protocol/helpers/oracle.js`
- Modify: `tests/protocol/helpers/run-driver.js`
- Modify: `tests/protocol/explore-v1-safety.test.js`
- Modify: `tests/unit/ui/explore-session-wiring.test.js`
- Modify: `tests/unit/ui/explore-session-cutover.test.js`

**Interfaces:**
- `onPause(reason)` is the only session notification channel for auth and writer conflict.
- `syncNow()` is the only explicit drain operation; removes `retryNow: syncNow` and ignored `{ reason }` arguments.
- Protocol oracle reports `unknownPauseReasons`; removes `pausePolicyViolations`, `unrecoverablePauses`, and `duplicateExternalEffects`.

- [ ] **Step 1: Write failing protocol assertions**

```js
test('protocol oracle reports only unknown registered pause reasons', async () => {
  assert.deepEqual(report.unknownPauseReasons, []);
  assert.equal(Object.hasOwn(report, 'pausePolicyViolations'), false);
  assert.equal(Object.hasOwn(report, 'unrecoverablePauses'), false);
  assert.equal(Object.hasOwn(report, 'duplicateExternalEffects'), false);
});

test('V2 conflict and unsupported responses cannot be followed by accepted V1', async () => {
  // Drive both sequences through the deterministic fault link and assert exact
  // pending log retention, no callbacks, no repost after conflict review, and no
  // retry after unsupported protocol.
});
```

- [ ] **Step 2: Run the protocol test and verify RED**

Run: `node --experimental-test-module-mocks --test tests/protocol/explore-v1-safety.test.js`

Expected: old oracle fields and old channel/alias assumptions remain.

- [ ] **Step 3: Remove obsolete production and test seams**

Delete `onAuthRequired`, `onWriterConflict`, `retryNow`, reason arguments to `syncNow`, stale listener wiring exports, and DOM-optional branches used only by the old unit harness. Route all notification through the controller's `handlePause` binding.

- [ ] **Step 4: Update deterministic protocol evidence**

Use complete transport envelopes from `tests/helpers/explore-sync-transport.js`. Keep the existing real-route idempotency assertions. Replace policy-shape checks with observed final pause reason, pending log, callback counts, request counts, and `unknownPauseReasons`.

- [ ] **Step 5: Run focused and direct-file integration verification**

Run: `node --experimental-test-module-mocks --test tests/protocol/explore-v1-safety.test.js`

Run: `node --test tests/unit/ui/explore-session-wiring.test.js tests/unit/ui/explore-session-cutover.test.js tests/unit/ui/explore-session.test.js tests/integration/flows/explore-session-sync.test.js`

Run: `node --check public/js/ui/explore-session.js && node --check public/js/ui/exploration.js && node --check public/game.js && node --check tests/protocol/helpers/oracle.js && node --check tests/protocol/helpers/run-driver.js`

Expected: protocol and direct-file Explore integration pass; no old channel or policy-shape symbol remains.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/explore-session.js public/js/ui/exploration.js public/game.js tests/protocol/helpers/oracle.js tests/protocol/helpers/run-driver.js tests/protocol/explore-v1-safety.test.js tests/unit/ui/explore-session-wiring.test.js tests/unit/ui/explore-session-cutover.test.js
git commit -m "test: consolidate explore recovery evidence"
```

---

## Final Verification

After all ten task reviews are clean:

1. Run `node --check` for every changed JavaScript module.
2. Run the full affected unit slice:

   ```bash
   node --test \
     tests/unit/ui/async-ownership-fence.test.js \
     tests/unit/shared/explore-sync-outcome.test.js \
     tests/unit/api-network-hardening.test.js \
     tests/unit/ui/game-state-adoption.test.js \
     tests/unit/ui/explore-session.test.js \
     tests/unit/ui/explore-session-recovery.test.js \
     tests/unit/ui/explore-session-pause-controller.test.js \
     tests/unit/ui/auth-reauth.test.js \
     tests/unit/ui/explore-session-cutover.test.js \
     tests/unit/ui/combat-recovery-coordinator.test.js \
     tests/unit/ui/combat-phase-recovery-coordinator.test.js \
     tests/unit/ui/combat-network-hardening.test.js \
     tests/unit/ui/combat-session-local.test.js \
     tests/unit/ui/combat-playback-adoption-serialization.test.js \
     tests/unit/ui/pvp-battle-battlefield-parity.test.js \
     tests/unit/pvp/pvp-combat.test.js
   ```

3. Run `node --test tests/integration/flows/explore-session-sync.test.js tests/integration/flows/combat.test.js tests/integration/pvp/flow.test.js` directly under local Node 24.
4. Run `npm run test:protocol`; if the Node 24 wildcard runner asserts natively, run `node --experimental-test-module-mocks --test tests/protocol/explore-v1-safety.test.js` and record both results.
5. Run `npm test` and compare only the known local Node 24/Sudachi baseline failures; CI remains authoritative on Node 22.
6. Before opening Playwright, ask the user for permission as required by `AGENTS.md`. After approval, read `docs/playtest-guide.md`, run `npm run dev`, inject `public/dev-safe-area.css`, and verify mobile states for:
   - transport degradation with pending work and Retry;
   - writer conflict with Review latest progress / Keep paused and no repost;
   - unsupported protocol with exact version-required copy and no Retry;
   - ordinary pending and empty-runway passive pauses with preserved actions;
   - active standard Explore combat recovery without stale sprite attachment or duplicate input finalization.
7. Show each checkpoint screenshot, then delete it in the same tool-call block. Do not leave screenshots or logs in the repository.
