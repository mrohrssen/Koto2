# iOS Network Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared Koto web app feel responsive and recoverable for iOS app users on weak-but-available internet, while the separate dev/prod Capacitor app split is built in another worktree.

**Architecture:** Keep network behavior centralized in `public/js/api.js`: auth headers, retries, request dedupe, timeouts, connection health, and error shape should live in one layer. Move the highest-impact boot and combat paths onto that layer first, then validate through the dev iOS app before promoting the same shared code to production.

**Tech Stack:** ES modules, browser `fetch`, `AbortController`, Node test runner, Capacitor iOS shell consuming the deployed web app.

---

## Scope Boundaries

This plan intentionally does not modify the parallel iOS app split.

- Do not edit `capacitor.config.ts`.
- Do not edit iOS bundle IDs, app names, schemes, Xcode project files, or signing settings.
- Do not introduce offline/local app-shell packaging in this pass.
- Do not change Japanese dialogue/content pipelines.
- Do not alter PvE/PvP combat mechanics. Network request transport can change, but server-authoritative combat results stay authoritative.

The separate iOS worktree should provide:

- A dev iOS app pointed at the dev web deployment.
- A production iOS app pointed at the production web deployment.
- A safe path to test this branch in the dev iOS app before production promotion.

## File Structure

- Modify `public/js/api.js`: central request timeout support, connection-failure classification, test hooks, `getGameState()` unification, and `creatureCombatCycle()` behavior.
- Modify `public/game.js`: boot-state handling so transient network failures do not become fake `no_save` state.
- Modify `public/js/ui/combat-loop.js`: creature attack/defend requests use injected `apiCreatureCombatCycle()` instead of raw `fetch()`, with in-flight UI protection.
- Create `tests/unit/api-network-hardening.test.js`: focused tests for timeout, retry, connection callbacks, and game-state transient failure.
- Create or extend `tests/unit/ui/combat-network-hardening.test.js`: focused test for combat-loop using injected API instead of raw fetch, if the module can be loaded with the existing fake DOM style.
- Optionally modify `public/js/pvp-socket.js` in a separate follow-up PR after REST hardening is validated.

---

### Task 1: Add API Timeout And Failure Classification

**Files:**
- Modify: `public/js/api.js`
- Create: `tests/unit/api-network-hardening.test.js`

- [ ] **Step 1: Write failing timeout and connection callback tests**

Create `tests/unit/api-network-hardening.test.js`:

```js
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(async () => {
  mock.reset();
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  globalThis.window = { location: { href: '' } };
  const api = await import('../../public/js/api.js');
  api.__networkTest.reset();
  api.setConnectionCallbacks({ onOffline: null, onOnline: null });
});

describe('api network hardening', () => {
  it('aborts a hung request after the configured timeout', async () => {
    const api = await import('../../public/js/api.js');
    globalThis.fetch = mock.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const result = await api.__networkTest.apiCall('/state', 'GET', null, null, {
      timeoutMs: 5,
      maxAttempts: 1,
    });

    assert.equal(result, null);
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('shows offline after repeated timeout or network failures', async () => {
    const api = await import('../../public/js/api.js');
    let offlineCount = 0;
    api.setConnectionCallbacks({ onOffline: () => offlineCount++, onOnline: null });
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError('Network request failed');
    });

    await api.__networkTest.apiCall('/state', 'GET', null, null, {
      timeoutMs: 5,
      maxAttempts: 1,
    });
    await api.__networkTest.apiCall('/state', 'GET', null, null, {
      timeoutMs: 5,
      maxAttempts: 1,
      bypassLoadingGate: true,
    });

    assert.equal(offlineCount, 1);
  });

  it('does not mark HTTP 500 as offline because the server responded', async () => {
    const api = await import('../../public/js/api.js');
    let offlineCount = 0;
    api.setConnectionCallbacks({ onOffline: () => offlineCount++, onOnline: null });
    globalThis.fetch = mock.fn(async () => jsonResponse({ error: 'server_error' }, 500));

    const result = await api.__networkTest.apiCall('/state', 'GET', null, null, {
      returnErrorBody: true,
      maxAttempts: 1,
    });

    assert.deepEqual(result, { error: 'server_error' });
    assert.equal(offlineCount, 0);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/api-network-hardening.test.js
```

Expected: FAIL because `__networkTest`, timeout support, and `maxAttempts` override do not exist yet.

- [ ] **Step 3: Add timeout helpers and test hooks**

In `public/js/api.js`, near the connection state declarations, add:

```js
const DEFAULT_API_TIMEOUT_MS = 10000;

function isConnectionFailure(error) {
  return error instanceof TypeError || error?.name === 'AbortError';
}

async function fetchJsonWithTimeout(url, options = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function resetNetworkStateForTest() {
  consecutiveFailures = 0;
  hasRedirectedFor401 = false;
  inFlightRequests.clear();
}
```

Then update `apiCall()`:

```js
const maxAttempts = opts.maxAttempts ?? ((method === 'GET' || opts.retryable) ? 3 : 1);
```

Replace the raw fetch/json block inside `apiCall()`:

```js
const { response, data } = await fetchJsonWithTimeout(
  `${PLATFORM.apiBase}/api/game${endpoint}`,
  options,
  { timeoutMs: opts.timeoutMs }
);
```

Replace connection failure checks:

```js
if (isConnectionFailure(error)) onApiFailure();
```

At the bottom export list, include a test-only namespace:

```js
export const __networkTest = {
  apiCall,
  fetchJsonWithTimeout,
  isConnectionFailure,
  reset: resetNetworkStateForTest,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/unit/api-network-hardening.test.js
```

Expected: PASS for the new timeout/failure tests.

- [ ] **Step 5: Run syntax check**

Run:

```bash
node --check public/js/api.js && echo "OK"
```

Expected: `OK`.

---

### Task 2: Make Game-State Boot Failure Transient, Not `no_save`

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/game.js`
- Test: `tests/unit/api-network-hardening.test.js`

- [ ] **Step 1: Add failing game-state fallback test**

Append to `tests/unit/api-network-hardening.test.js`:

```js
it('returns a transient error when game state cannot be fetched', async () => {
  const api = await import('../../public/js/api.js');
  globalThis.fetch = mock.fn(async () => {
    throw new TypeError('Network request failed');
  });

  const result = await api.getGameState();

  assert.equal(result.error, 'network_unavailable');
  assert.equal(result.transient, true);
  assert.notEqual(result.phase, 'no_save');
});
```

Also add a pure boot-decision test so the default local state cannot fall through to `no_save` rendering:

```js
it('treats transient game state as a blocked boot instead of a no-save state', async () => {
  const api = await import('../../public/js/api.js');

  assert.equal(api.isTransientGameStateFailure({
    error: 'network_unavailable',
    transient: true,
  }), true);
  assert.equal(api.isTransientGameStateFailure({
    phase: 'no_save',
  }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/api-network-hardening.test.js
```

Expected: FAIL because `getGameState()` currently returns `{ phase: 'no_save' }` on fetch failure and `isTransientGameStateFailure()` does not exist yet.

- [ ] **Step 3: Move `getGameState()` through `apiCall()`**

Replace `getGameState()` in `public/js/api.js` with:

```js
async function getGameState() {
  const data = await apiCall('/state', 'GET', null, null, {
    returnErrorBody: true,
    timeoutMs: 10000,
  });

  if (!data) {
    return {
      error: 'network_unavailable',
      transient: true,
    };
  }

  return data;
}
```

Add this exported predicate in `public/js/api.js`:

```js
function isTransientGameStateFailure(data) {
  return data?.transient === true && data?.error === 'network_unavailable';
}
```

Include `isTransientGameStateFailure` in the bottom export list.

- [ ] **Step 4: Preserve existing UI state on transient boot failure**

Update `loadGameState()` in `public/game.js`:

```js
async function loadGameState() {
  const data = await apiGetGameState();

  if (isTransientGameStateFailure(data)) {
    scene.showToast?.('Connection is slow. Retrying...', 3000);
    return null;
  }

  if (data.player) {
    updateGameState(data);
    const allCreatureIds = [
      ...(data.creatureParty?.active || []),
      ...(data.creatureParty?.reserves || []),
    ].filter(Boolean).map(r => r.id);
    probeIdleSprites(allCreatureIds);
    return data;
  }

  updateGameState({
    ...data,
    player: null,
    run: null,
    combat: null,
    phase: data.phase || 'no_save'
  });
  return data;
}
```

This keeps legitimate server-provided `no_save` behavior intact, but stops network failure from impersonating a missing save.

Import `isTransientGameStateFailure` from `public/js/api.js` in `public/game.js`, then update the boot sequence in `initGame()` so transient failure stops normal boot rendering:

```js
  const loadedState = await loadGameState();
  if (loadedState === null) {
    scene.showToast?.('Connection is slow. Check your connection and reload.', 5000);
    return;
  }
  await claimDailyCrystalBonus();
```

This prevents `initGame()` from continuing to `claimDailyCrystalBonus()`, prologue checks, and `updateUI()` while the only available state is the default local `phase: 'no_save'`.

- [ ] **Step 5: Run focused tests and syntax checks**

Run:

```bash
npm run test:unit -- tests/unit/api-network-hardening.test.js
node --check public/js/api.js && node --check public/game.js && echo "OK"
```

Expected: tests PASS and `OK`.

---

### Task 3: Unify Creature Combat Requests

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Test: `tests/unit/ui/combat-network-hardening.test.js`

- [ ] **Step 1: Add a tiny combat request helper for testability**

In `public/js/ui/combat-loop.js`, near the module state section after `const API_BASE = PLATFORM.apiBase;`, add this helper:

```js
async function requestCreatureCombatCycle(actionType, moveChoices = []) {
  if (typeof apiCreatureCombatCycle !== 'function') {
    throw new Error('Creature combat API is not configured');
  }
  return apiCreatureCombatCycle(actionType, moveChoices);
}

export const __combatNetworkTest = {
  setCreatureCombatApi(fn) {
    apiCreatureCombatCycle = fn;
  },
  requestCreatureCombatCycle,
};
```

- [ ] **Step 2: Write failing helper test**

Create `tests/unit/ui/combat-network-hardening.test.js`:

```js
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __intentLog: null,
};

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    remove() {},
  }),
};

const combatLoop = await import('../../../public/js/ui/combat-loop.js');

describe('combat network hardening', () => {
  beforeEach(() => {
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
  });

  it('uses the injected creature combat API for attack requests', async () => {
    const calls = [];
    combatLoop.__combatNetworkTest.setCreatureCombatApi(async (actionType, choices) => {
      calls.push({ actionType, choices });
      return { ok: true, state: { phase: 'combat' } };
    });

    const result = await combatLoop.__combatNetworkTest.requestCreatureCombatCycle('attack', [
      { creatureIndex: 0, moveId: 'tackle', targetIndex: 0 },
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{
      actionType: 'attack',
      choices: [{ creatureIndex: 0, moveId: 'tackle', targetIndex: 0 }],
    }]);
  });

  it('throws a clear setup error when the injected API is missing', async () => {
    await assert.rejects(
      () => combatLoop.__combatNetworkTest.requestCreatureCombatCycle('defend', []),
      /Creature combat API is not configured/
    );
  });
});
```

- [ ] **Step 3: Run test to verify helper behavior**

Run:

```bash
npm run test:unit -- tests/unit/ui/combat-network-hardening.test.js
```

Expected: PASS after Step 1. If import setup fails because `combat-loop.js` has more browser globals than this fake DOM provides, add only the missing globals required by the import error.

- [ ] **Step 4: Replace raw creature attack fetch with injected API**

In `public/js/ui/combat-loop.js`, inside the player creature attack submit path, replace:

```js
const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({ actionType: 'attack', moveChoices: choices })
});
const result = await response.json();
```

with:

```js
const result = await requestCreatureCombatCycle('attack', choices);
if (!result) {
  throw new Error('Combat sync failed');
}
```

- [ ] **Step 5: Replace raw creature defend fetch with injected API**

In `public/js/ui/combat-loop.js`, inside the creature defend path, replace:

```js
const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({ actionType: 'defend' })
});
const result = await response.json();
```

with:

```js
const result = await requestCreatureCombatCycle('defend', []);
if (!result) {
  throw new Error('Combat sync failed');
}
```

- [ ] **Step 6: Remove unused combat-loop imports/constants if they become dead**

After the two replacements, check whether `API_BASE` or `getAuthHeaders` is still used in `public/js/ui/combat-loop.js` for other legacy combat-cycle or learn-move paths. If either one is still used, keep it. If either one is no longer used, remove only that unused import or constant.

- [ ] **Step 7: Run tests and syntax check**

Run:

```bash
npm run test:unit -- tests/unit/ui/combat-network-hardening.test.js
node --check public/js/ui/combat-loop.js && echo "OK"
```

Expected: test PASS and `OK`.

---

### Task 4: Add Combat In-Flight Feedback And Duplicate Submission Guard

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Test: `tests/unit/ui/combat-network-hardening.test.js`

- [ ] **Step 1: Add failing duplicate-guard test**

Append to `tests/unit/ui/combat-network-hardening.test.js`:

```js
it('dedupes creature combat submissions while one is in flight', async () => {
  let resolveRequest;
  let callCount = 0;
  combatLoop.__combatNetworkTest.setCreatureCombatApi(async () => {
    callCount++;
    return new Promise(resolve => {
      resolveRequest = resolve;
    });
  });

  const first = combatLoop.__combatNetworkTest.runCreatureCombatRequest('defend', []);
  const second = combatLoop.__combatNetworkTest.runCreatureCombatRequest('defend', []);

  assert.equal(callCount, 1);
  assert.equal(await second, null);

  resolveRequest({ ok: true });
  assert.deepEqual(await first, { ok: true });
});
```

Expected: this fails because `runCreatureCombatRequest()` does not exist yet.

- [ ] **Step 2: Add request guard helper**

In `public/js/ui/combat-loop.js`, add module state:

```js
let creatureCombatRequestInFlight = false;
```

Add helper:

```js
async function runCreatureCombatRequest(actionType, moveChoices = []) {
  if (creatureCombatRequestInFlight) return null;
  creatureCombatRequestInFlight = true;
  setActiveLabel?.(tPlain('combat.syncingTurn') || 'Syncing turn...');

  try {
    return await requestCreatureCombatCycle(actionType, moveChoices);
  } finally {
    creatureCombatRequestInFlight = false;
  }
}
```

Extend `__combatNetworkTest`:

```js
runCreatureCombatRequest,
```

- [ ] **Step 3: Route attack and defend through guarded helper**

Replace the attack call from Task 3:

```js
const result = await requestCreatureCombatCycle('attack', choices);
```

with:

```js
const result = await runCreatureCombatRequest('attack', choices);
```

Replace the defend call:

```js
const result = await requestCreatureCombatCycle('defend', []);
```

with:

```js
const result = await runCreatureCombatRequest('defend', []);
```

Keep the `if (!result) throw new Error('Combat sync failed');` guard so duplicate submissions do not continue the turn.

- [ ] **Step 4: Add i18n fallback only if existing i18n keys require it**

If `tPlain('combat.syncingTurn')` returns the key itself when missing, use a literal fallback check:

```js
const syncingLabel = tPlain('combat.syncingTurn');
setActiveLabel?.(syncingLabel === 'combat.syncingTurn' ? 'Syncing turn...' : syncingLabel);
```

Do not add Japanese static text for this task.

- [ ] **Step 5: Run tests and syntax check**

Run:

```bash
npm run test:unit -- tests/unit/ui/combat-network-hardening.test.js
node --check public/js/ui/combat-loop.js && echo "OK"
```

Expected: test PASS and `OK`.

---

### Task 5: Audit High-Frequency Raw Fetches Without Broad Refactor

**Files:**
- Inspect: `public/game.js`
- Inspect: `public/js/api.js`
- Inspect: `public/js/ui/exploration.js`
- Inspect: `public/js/ui/speed-review.js`
- Inspect: `public/js/ui/chests.js`
- Inspect: `public/js/ui/crests-equip.js`

- [ ] **Step 1: Generate raw fetch inventory**

Run:

```bash
rg "fetch\\(" public/js public/game.js
```

Expected: list of remaining raw `fetch()` calls.

- [ ] **Step 2: Classify each remaining raw fetch**

Create a temporary note in the implementation chat, not a repo file, with this classification:

```text
Must unify now:
- boot-critical
- combat turn-critical
- repeated travel/action tap

May remain raw:
- diagnostics/bug-report uploads
- keepalive exposure posts
- low-frequency settings/admin calls
- endpoints needing special multipart/body handling
```

- [ ] **Step 3: Move only high-frequency gameplay calls that already have API wrappers**

For each "must unify now" call, prefer an existing exported function from `public/js/api.js`. If no wrapper exists, add the smallest wrapper around `apiCall()`.

Use this exact wrapper style:

```js
async function tutorialAdvance(expectedStep) {
  return apiCall('/tutorial-advance', 'POST', { expectedStep }, null, { retryable: true });
}
```

Do not refactor unrelated UI modules in this pass.

- [ ] **Step 4: Run unit and syntax checks**

Run:

```bash
npm run test:unit
node --check public/js/api.js
node --check public/game.js
```

Expected: unit tests PASS and syntax checks PASS.

---

### Task 6: Dev iOS Validation Checklist

**Files:**
- Modify if needed: `docs/playtest-guide.md`

- [ ] **Step 1: Confirm the parallel iOS split branch has landed or is available for test**

Confirm with the other worktree owner:

```text
Dev iOS app points at the dev web deployment.
Prod iOS app points at the production web deployment.
This network-hardening branch is deployed only to dev first.
```

- [ ] **Step 2: Deploy this branch to the dev web environment**

Use the project's normal dev deploy path. Do not push to production or `master` from this branch during validation.

- [ ] **Step 3: Test weak network launch in dev iOS app**

Manual test matrix:

```text
Scenario: app cold launch on weak network
Expected:
- no false "new game" or empty-save state
- shell becomes visibly alive as soon as possible
- connection/slow retry state appears if state fetch fails
- retry/reload recovers without logout
```

- [ ] **Step 4: Test weak network combat in dev iOS app**

Manual test matrix:

```text
Scenario: enter creature combat, choose attack, then throttle network
Expected:
- tap is acknowledged immediately
- duplicate taps do not submit duplicate turns
- timeout restores a usable action state
- successful retry applies exactly one server-authoritative turn
```

- [ ] **Step 5: Test travel/exploration taps**

Manual test matrix:

```text
Scenario: proceed/travel through several rooms on weak network
Expected:
- current room remains visible while syncing
- failure does not advance client-only state
- retry works after connection recovers
```

- [ ] **Step 6: Update playtest guide only with new patterns discovered**

If testing reveals a repeatable iOS weak-network test pattern, add a short section to `docs/playtest-guide.md`:

```md
### iOS Weak Network Check

Use the dev iOS app against the dev web deployment. Confirm boot, combat attack/defend, and room travel show retryable UI instead of false no-save or frozen controls.
```

---

### Task 7: Full Verification Before Merge

**Files:**
- All modified files

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check public/js/api.js
node --check public/game.js
node --check public/js/ui/combat-loop.js
```

Expected: no syntax errors.

- [ ] **Step 2: Run focused unit tests**

Run:

```bash
npm run test:unit -- tests/unit/api-network-hardening.test.js tests/unit/ui/combat-network-hardening.test.js
```

Expected: all focused tests PASS.

- [ ] **Step 3: Run full unit tests**

Run:

```bash
npm run test:unit
```

Expected: all unit tests PASS.

- [ ] **Step 4: Run integration tests if unit tests pass**

Run:

```bash
npm run test:integration
```

Expected: all integration tests PASS.

- [ ] **Step 5: Review diff for scope creep**

Run:

```bash
/usr/bin/git diff --stat
/usr/bin/git diff -- public/js/api.js public/game.js public/js/ui/combat-loop.js tests/unit/api-network-hardening.test.js tests/unit/ui/combat-network-hardening.test.js docs/playtest-guide.md
```

Expected:

```text
No Capacitor config changes.
No iOS project changes.
No dialogue/dictionary changes.
No combat mechanics changes beyond request transport and in-flight UI.
```

---

### Task 8: Optional Follow-Up PR For PvP Socket Transport

**Files:**
- Modify: `public/js/pvp-socket.js`
- Test manually in dev iOS app

Do this after Tasks 1-7 are validated. Keep it separate because PvP has different correctness risks than PvE REST actions.

- [ ] **Step 1: Test whether Socket.IO polling fallback works on dev**

Temporarily change:

```js
transports: ['websocket'],
```

to:

```js
transports: ['websocket', 'polling'],
```

Run a dev PvP match on weak cellular/Wi-Fi.

- [ ] **Step 2: Keep or revert based on observed behavior**

Keep the fallback only if:

```text
PvP connects successfully on normal network.
PvP reconnects after short network interruption.
No duplicate round submissions occur.
Server logs do not show transport errors.
```

If any condition fails, revert this change and document PvP as a separate investigation.

---

## Rollout Order

1. Keep this work isolated from the Capacitor dev/prod split branch.
2. Implement Tasks 1-4 first and run focused tests.
3. Do Task 5 only for high-frequency calls discovered during implementation.
4. Deploy to the dev web environment.
5. Test through the dev iOS app.
6. Fix any dev iOS regressions in this branch.
7. Merge into `dev` only after tests and dev iOS validation pass.
8. Promote to production/master only after the same shared code has been validated in dev iOS.

## Self-Review

- Spec coverage: The plan covers central API ownership, boot-state transient failure, combat request unification, high-frequency raw-fetch audit, and dev iOS rollout.
- Placeholder scan: No placeholder tasks remain; optional PvP is explicitly scoped as a follow-up with keep/revert criteria.
- Type consistency: The plan consistently uses `apiCall(endpoint, method, body, onError, opts)`, `apiCreatureCombatCycle(actionType, moveChoices)`, and transient game-state failure shape `{ error: 'network_unavailable', transient: true }`.
