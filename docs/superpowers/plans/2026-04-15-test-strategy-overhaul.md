# Test Strategy Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock-heavy unit tests with integration tests that boot the same app factory production uses, add Playwright DOM assertions that catch stale frontends, and add E2E smoke tests for golden paths.

**Architecture:** Extract a shared `createApp()` factory from `server.js` so production and tests use the same route/dependency wiring. Integration tests boot that shared app with only AI providers and TTS mocked at the boundary, and auth enforced normally under test. Playwright tests assert DOM state through a stable browser hook (`window.__gameState()` backed by `window.__inspector`) instead of reaching into module-local store internals. E2E smoke tests use Playwright's runner and share the same WebKit mobile config as the visual suite.

**Tech Stack:** node:test, node:assert/strict, Express (real), Playwright, c8 (coverage)

**Spec:** `docs/superpowers/specs/2026-04-15-test-strategy-overhaul-design.md`

---

## File Map

```
tests/
  integration/
    auth/
      flow.test.js         ← MODIFY existing auth integration to use real HTTP + JWT coverage
    helpers/
      test-app.js         ← NEW: boots shared createApp() with mocked externals
      api-client.js        ← NEW: HTTP client with auth, convenience methods
      game-flow.js         ← NEW: deterministic setup helpers using real debug endpoints
    flows/
      bootstrap.test.js    ← NEW: proves shared app factory + auth model works
      game-state.test.js   ← NEW: new game → save → load → verify persistence
      exploration.test.js  ← NEW: start run → queue deterministic rooms → proceed
      combat.test.js       ← NEW: start deterministic combat → execute turns → rewards
      vocab-review.test.js ← NEW: queue speed-review room → answer words → state updates
      meta-progression.test.js ← NEW: reward/meta persistence after repeated victories
    pvp/
      flow.test.js         ← KEEP existing PvP integration coverage; do not duplicate yet
  visual/
      playwright.config.js ← NEW: Playwright config for visual regression
      helpers/
        auth.js            ← NEW: register/login once and seed browser auth token
        dom-assertions.js  ← NEW: state-synchronized DOM assertion helpers
      screens/
        exploration.test.js ← NEW: DOM assertions for exploration screen
        combat.test.js      ← NEW: DOM assertions for combat screen
        transitions.test.js ← NEW: DOM assertions for phase transitions
  smoke/
      golden-path.test.js  ← NEW: full E2E flow through the game
      narration-live.test.js ← KEEP existing live-AI smoke placeholder
  helpers/
    mocks.js               ← MODIFY: add createMockTTS(), createMockTTSDialogue(), no-op narration deps
    fixtures.js            ← MODIFY: add area/room/combat fixtures
    tmp.js                 ← REUSE existing temp-dir helper; do not invent another one
src/
  app.js                   ← NEW: shared production/test app factory extracted from server.js
  auth/middleware.js       ← MODIFY: explicit `SKIP_AUTH=true` bypass only
public/
  game.js                  ← MODIFY: expose stable browser test hook (`window.__gameState`)
```

**Key existing files referenced:**
- `src/routes/index.js:19` — `createRoutes(deps)` factory, accepts all route deps
- `src/routes/game/index.js:30` — `createGameRoutes(deps)` factory, applies auth + manager middleware
- `src/auth/middleware.js:42` — `requireAuth` currently bypasses auth when `NODE_ENV=test` (must change first)
- `src/game/manager-registry.js:19` — `getManager(userId)` creates per-user GameManager
- `src/game/manager-registry.js:134` — `removeManager(userId)` cleanup for tests
- `src/data-dir.js:11` — `DATA_DIR` const, needs live getter/setter for tests
- `server.js:349-390` — how deps are wired in production
- `src/routes/game/misc.js:200-226` — `debug-queue-rooms` / `debug-clear-room-queue` already support deterministic test setup in `NODE_ENV=test`
- `tests/helpers/tmp.js:9` — existing temp directory helper; use this instead of hand-rolled tmp paths
- `tests/integration/auth/flow.test.js` — existing auth integration file to upgrade, not duplicate
- `tests/integration/pvp/flow.test.js` — existing PvP flow coverage to keep as-is for this plan
- `tests/smoke/narration-live.test.js` — existing smoke placeholder to leave alone
- `tests/unit/routes/dev-content-api.test.js:11` — existing pattern: real Express + HTTP per test

## Execution Guardrails

- **Integration auth must be real.** Tier 2 tests should verify JWT issuance, invalid-token rejection, and per-user state isolation. Do not rely on `NODE_ENV=test` bypass.
- **Do not hand-wire a fake production app.** Extract `createApp()` from `server.js` first, then have tests boot that shared factory with overrides.
- **Reuse what already exists.** Upgrade existing files under `tests/integration/` and `tests/smoke/` where possible instead of duplicating coverage under new paths.
- **Use existing temp-dir infrastructure.** `tests/helpers/tmp.js` is the project standard; do not create ad hoc `tmp/test-*` folders by hand.
- **No placeholder tests.** Do not leave `TODO`, "fill this in later", or assertions that accept multiple unrelated outcomes like `200` or `400`.
- **Prefer deterministic setup over randomness.** Use `debug-queue-rooms`, `debug-force-combat`, and `debug-set-enemy-hp` to make flow tests stable.

---

## Chunk 1: Test Infrastructure Foundation

### Task 0: Extract shared app factory and make auth bypass explicit

The current plan assumes integration tests can boot a "production-like" app by hand and still verify auth. That is false in the current codebase. Fix the app/test seam first.

**Files:**
- Create: `src/app.js`
- Modify: `server.js`
- Modify: `src/auth/middleware.js`
- Modify: tests that currently depend on implicit `NODE_ENV=test` auth bypass (discover via grep)

- [ ] **Step 1: Read current production app wiring**

Read:
- `server.js` — route wiring, app middleware, shared helpers like `enrichGameState`
- `src/auth/middleware.js` — `requireAuth()` / `optionalAuth()`

- [ ] **Step 2: Extract `createApp()` from `server.js`**

Create `src/app.js` that exports the shared app bootstrap used by both production and tests.

Target shape:

```js
export function createApp({
  dataDir,
  usersFile,
  routeOverrides = {},
  authBypass = false
} = {}) {
  // Move app/bootstrap logic here from server.js.
  // Keep production defaults, but allow tests to override only the true externals.
}
```

Requirements:
- `server.js` becomes a thin entrypoint that calls `createApp()` and then `listen()`
- shared helpers like enriched game-state shaping live beside `createApp()` and are reused by tests instead of being reimplemented in `tests/`
- test overrides are limited to data paths, user file path, auth bypass flag, and external-boundary deps (AI/TTS)

- [ ] **Step 3: Remove implicit auth bypass from `NODE_ENV=test`**

In `src/auth/middleware.js`, change both `requireAuth()` and `optionalAuth()` to bypass auth **only** when `process.env.SKIP_AUTH === 'true'`.

Rules:
- `NODE_ENV=test` must still enforce JWT auth
- smoke/dev helpers that genuinely need bypass can set `SKIP_AUTH=true` explicitly
- integration tests must run with auth on

- [ ] **Step 4: Update tests that depended on implicit bypass**

Grep for tests that assumed auth was skipped under `NODE_ENV=test`. Update only those tests to opt in explicitly:

```bash
rg "NODE_ENV=test|SKIP_AUTH|requireAuth|optionalAuth" tests/
```

If a test truly does not care about auth, set `process.env.SKIP_AUTH = 'true'` in that test setup. Do **not** set it globally for Tier 2.

- [ ] **Step 5: Verify the seam before moving on**

Run:
- `npm test`

Expected:
- existing tests still pass
- there is now one shared app bootstrap path for both production and tests

- [ ] **Step 6: Commit**

```bash
git add src/app.js server.js src/auth/middleware.js tests/
git commit -m "refactor: extract shared app factory and make auth bypass explicit"
```

---

### Task 1: Add live data-dir override and registry cleanup helpers

`manager-registry.js` and `socket-handler.js` currently snapshot `DATA_DIR` at module load. Tests need a per-test temp directory and a way to clear in-memory managers between cases.

**Files:**
- Modify: `src/data-dir.js:11`
- Modify: `src/game/manager-registry.js`
- Modify: `src/pvp/socket-handler.js`
- Test: `tests/unit/data-dir-override.test.js`

- [ ] **Step 1: Read current data-dir.js**

Current code at line 11:
```js
export const DATA_DIR = existsSync(RAILWAY_DATA_DIR) ? RAILWAY_DATA_DIR : PROJECT_ROOT;
```

- [ ] **Step 2: Replace the static export with a live getter/setter**

In `src/data-dir.js`, remove the stale exported snapshot and expose a live getter/setter/reset API:

```js
const DEFAULT_DATA_DIR = existsSync(RAILWAY_DATA_DIR) ? RAILWAY_DATA_DIR : PROJECT_ROOT;
let testDataDir = null;

/** Get current data directory (respects test overrides). */
export function getDataDir() {
  return testDataDir || DEFAULT_DATA_DIR;
}

/** Test-only: override the data directory. */
export function setDataDirForTest(dir) {
  testDataDir = dir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Clear any test override after each test/app cleanup. */
export function resetDataDirForTest() {
  testDataDir = null;
}

export function dataPath(filename) {
  return join(getDataDir(), filename);
}
```

Do **not** keep `export const DATA_DIR = ...` around for backward compatibility. A stale snapshot defeats the whole point of the override.

- [ ] **Step 3: Update all direct consumers and add registry cleanup**

Change direct `DATA_DIR` imports to `getDataDir()` in:
- `src/game/manager-registry.js`
- `src/pvp/socket-handler.js`

Also add `clearManagersForTest()` in `src/game/manager-registry.js` so the integration test app can fully reset in-memory state between cases.

Grep first:
```bash
rg "import.*DATA_DIR" src/
```
For this task, keep the diff minimal:
- update direct `data-dir.js` importers now
- leave unrelated `process.cwd()/data` call sites alone unless a failing test proves they also need to move

- [ ] **Step 4: Verify nothing breaks**

Run:
- `node --test tests/unit/data-dir-override.test.js`
- `npm test`

Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/data-dir.js src/game/manager-registry.js src/pvp/socket-handler.js tests/unit/data-dir-override.test.js
git commit -m "refactor: add live data-dir override for shared app tests"
```

---

### Task 2: Create the test-app factory on top of `src/app.js`

The foundation for all integration tests. This must boot the **same** app factory production uses, not a hand-rolled near-production clone.

**Files:**
- Create: `tests/integration/helpers/test-app.js`
- Modify: `tests/helpers/mocks.js` (add new mock factories)

- [ ] **Step 1: Add mock factories to tests/helpers/mocks.js**

Add `createMockTTS()` and `createNoOpNarration()`:

```js
/**
 * Creates a mock TTS cache that returns empty audio.
 */
export function createMockTTS() {
  return {
    load() {},
    generateIfMissing() {},
    get() { return null; },
    set() {},
    has() { return false; }
  };
}

/**
 * Creates a mock TTS dialogue cache.
 */
export function createMockTTSDialogue() {
  const cache = new Map();
  return {
    get(key) { return cache.get(key) || null; },
    set(key, val) { cache.set(key, val); },
    has(key) { return cache.has(key); },
    delete(key) { cache.delete(key); }
  };
}

/**
 * No-op functions for narration engine deps that need AI.
 * Integration tests don't test AI generation — they test route + state logic.
 */
export function createNoOpNarration() {
  return {
    queueMissingCreatureDialoguesFn: async () => {},
    regenCreatureDialogueFn: async () => {},
    queueMissingNpcDialoguesFn: async () => {},
    regenNpcDialogueFn: async () => {},
    getCreatureDialogueFromCache: () => null,
    getAllCreatureDialogueCache: () => ({}),
    getNpcDialogueFromCache: () => null,
    getAllNpcDialogueCache: () => ({}),
    clearNpcDialogueCache: () => {},
    clearCreatureDialogueCache: () => {},
    logNpcEncounterFn: () => {},
    setNpcMemoryFlagFn: () => {},
    updateNpcMemoryBondFn: () => {},
    checkSentenceViolations: () => []
  };
}
```

- [ ] **Step 2: Create tests/integration/helpers/test-app.js**

```js
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApp } from '../../../src/app.js';
import { resetDataDirForTest } from '../../../src/data-dir.js';
import { clearManagersForTest } from '../../../src/game/manager-registry.js';
import { createTestTmpDir } from '../../helpers/tmp.js';
import {
  createMockTTS,
  createMockTTSDialogue,
  createNoOpNarration
} from '../../helpers/mocks.js';

/**
 * Boot a real Express app for integration testing.
 * Mocks only AI providers and TTS at the boundary.
 * Every call returns a fresh app with isolated temp data.
 *
 * @returns {Promise<{ app, server, port, tmpDir, cleanup }>}
 */
export async function createTestApp() {
  const tmp = await createTestTmpDir('koto-integration-');

  const settings = {
    gameTtsEnabled: false,
    voiceGender: 'boy',
    dailyWordLimit: 10,
    debugSuperAttack: false,
    reviewType: 'typing'
  };

  const narration = createNoOpNarration();

  const app = createApp({
    dataDir: tmp.path,
    usersFile: join(tmp.path, '.jrpg-users.json'),
    authBypass: false,
    routeOverrides: {
      getSettings: () => settings,
      saveSettings: (nextSettings) => { Object.assign(settings, nextSettings); },
      ttsCache: createMockTTS(),
      ttsDialogueCache: createMockTTSDialogue(),
      getUserVocabulary: () => ({ words: [], vidSet: new Set() }),
      ...narration
    }
  });

  // Start server on random port
  const server = createServer(app);
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  async function cleanup() {
    await new Promise(resolve => server.close(resolve));
    clearManagersForTest();
    resetDataDirForTest();
    await tmp.cleanup();
  }

  return { app, server, port, tmpDir: tmp.path, cleanup };
}
```

Rules:
- do **not** reimplement `enrichGameState` in the test helper, reuse the shared version from `src/app.js`
- do **not** hardcode cleanup to `removeManager('test-user')`; integration auth is real now, so tests create real user IDs
- do **not** hand-roll temp dirs; use `createTestTmpDir()`

- [ ] **Step 3: Verify import works**

Run:
```bash
NODE_ENV=test node -e "import('./tests/integration/helpers/test-app.js').then(({ createTestApp }) => createTestApp().then(app => app.cleanup()).then(() => console.log('OK')))"
```
Expected: `OK` (no import errors)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/helpers/test-app.js tests/helpers/mocks.js
git commit -m "feat: add test-app factory for integration tests"
```

---

### Task 3: Create the API client and deterministic game-flow helpers

Thin wrappers for making authenticated HTTP requests and deterministic game setup in tests.

**Files:**
- Create: `tests/integration/helpers/api-client.js`
- Create: `tests/integration/helpers/game-flow.js`

- [ ] **Step 1: Create api-client.js**

```js
import http from 'http';

/**
 * HTTP client for integration tests.
 * Makes real HTTP requests to a test app instance.
 */
export function createApiClient(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  let authToken = null;

  async function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const headers = {};
      let payload;

      if (body !== undefined) {
        payload = JSON.stringify(body);
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(payload);
      }

      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
    getState: () => request('GET', '/api/game/state'),
    createPlayer: (name = 'TestPlayer') => request('POST', '/api/game/create-player', { name }),

    /** Set auth token for subsequent requests */
    setToken(token) { authToken = token; },

    /** Register + login, store token for subsequent requests */
    async loginAsNewUser(username = 'test-user', password = 'test-pass-123') {
      await request('POST', '/api/auth/register', {
        username, password, inviteCode: 'neo-tokyo-friends'
      });
      const res = await request('POST', '/api/auth/login', { username, password });
      if (res.body?.token) authToken = res.body.token;
      return res;
    }
  };
}
```

- [ ] **Step 2: Create game-flow.js**

Add deterministic helpers built on real endpoints:

```js
export async function createReadyPlayer(client) {
  await client.loginAsNewUser();
  const createRes = await client.createPlayer();
  if (createRes.status !== 200) throw new Error('create-player failed');
  return createRes;
}

export async function queueRooms(client, rooms) {
  const res = await client.post('/api/game/debug-queue-rooms', { rooms });
  if (res.status !== 200) throw new Error('debug-queue-rooms failed');
}

export async function clearQueuedRooms(client) {
  await client.post('/api/game/debug-clear-room-queue', {});
}

export async function startExplorationRun(client) {
  await createReadyPlayer(client);
  const startRes = await client.post('/api/game/start-run', {});
  if (startRes.status !== 200) throw new Error('start-run failed');

  const areaOptions = await client.get('/api/game/area-options');
  const areaId = areaOptions.body?.[0]?.id;
  const selectRes = await client.post('/api/game/select-area', { areaId });
  if (selectRes.status !== 200) throw new Error('select-area failed');

  const collection = await client.get('/api/game/creature-collection');
  const starterIds = (collection.body?.collection || []).slice(0, 3);
  const confirmRes = await client.post('/api/game/confirm-creatures', { starterIds });
  if (confirmRes.status !== 200) throw new Error('confirm-creatures failed');

  return confirmRes.body.state;
}
```

This helper is the shared setup path for Tasks 6-10. Do not duplicate the run-start chain inside every test file.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/helpers/api-client.js tests/integration/helpers/game-flow.js
git commit -m "feat: add integration test HTTP and flow helpers"
```

---

### Task 4: Verify infrastructure with a bootstrap test

Prove the test-app factory and API client work end-to-end before building real tests on top.

**Files:**
- Create: `tests/integration/flows/bootstrap.test.js`

- [ ] **Step 1: Write the bootstrap test**

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('integration test infrastructure', () => {
  let app, client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp;
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('boots the app and responds to health check', async () => {
    // Settings endpoint doesn't require auth
    const res = await client.get('/api/settings');
    assert.equal(res.status, 200);
  });

  it('rejects unauthenticated game requests', async () => {
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 401);
  });

  it('allows authenticated game requests after login', async () => {
    await client.loginAsNewUser();
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 200);
    assert.ok(res.body);
  });
});
```

Keep the existing `tests/integration/bootstrap-integration.test.js` file untouched. This new bootstrap test is for the shared app/auth seam only.

- [ ] **Step 2: Run the test**

Run: `NODE_ENV=test node --test tests/integration/flows/bootstrap.test.js`
Expected: 3 tests pass.

- [ ] **Step 3: Fix any issues**

The test-app factory will likely need adjustments based on missing deps or import issues. Debug and fix until all 3 pass. This is expected — the factory was written against the code structure but hasn't been run yet.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/bootstrap.test.js
git commit -m "test: bootstrap integration test — verifies test-app factory works"
```

---

## Chunk 2: API Integration Tests — Core Game Flows

### Task 5: Upgrade the existing auth integration flow tests

Test the real auth system: register, login, token validation, protected routes.

**Files:**
- Modify: `tests/integration/auth/flow.test.js`

- [ ] **Step 1: Write auth flow tests**

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('auth flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('registers a new user and returns a token', async () => {
    const res = await client.post('/api/auth/register', {
      username: 'newuser', password: 'password123', inviteCode: 'neo-tokyo-friends'
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('rejects duplicate registration', async () => {
    await client.post('/api/auth/register', {
      username: 'dupe', password: 'password123', inviteCode: 'neo-tokyo-friends'
    });
    const res = await client.post('/api/auth/register', {
      username: 'dupe', password: 'password123', inviteCode: 'neo-tokyo-friends'
    });
    assert.equal(res.status, 400);
  });

  it('logs in with valid credentials', async () => {
    await client.post('/api/auth/register', {
      username: 'logintest', password: 'password123', inviteCode: 'neo-tokyo-friends'
    });
    const res = await client.post('/api/auth/login', {
      username: 'logintest', password: 'password123'
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('rejects login with wrong password', async () => {
    await client.post('/api/auth/register', {
      username: 'wrongpw', password: 'password123', inviteCode: 'neo-tokyo-friends'
    });
    const res = await client.post('/api/auth/login', {
      username: 'wrongpw', password: 'wrongpassword'
    });
    assert.notEqual(res.status, 200);
  });

  it('uses token to access protected routes', async () => {
    const reg = await client.post('/api/auth/register', {
      username: 'authuser', password: 'password123', inviteCode: 'neo-tokyo-friends'
    });
    client.setToken(reg.body.token);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 200);
  });

  it('rejects invalid JWT on protected routes', async () => {
    client.setToken('not-a-real-token');
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 401);
  });
});
```

- [ ] **Step 2: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/auth/flow.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/auth/flow.test.js
git commit -m "test: upgrade auth integration flow to real HTTP + JWT coverage"
```

---

### Task 6: Game state lifecycle integration tests

Test creating a game, saving state, reloading — the persistence layer that causes "only works after refresh" bugs.

**Files:**
- Create: `tests/integration/flows/game-state.test.js`

- [ ] **Step 1: Write game state lifecycle tests**

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('game state lifecycle', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('creates a player and returns initial game state', async () => {
    await client.loginAsNewUser();
    await client.createPlayer('StateTest');
    const res = await client.getState();
    assert.equal(res.status, 200);
    assert.equal(res.body.player?.name, 'StateTest');
  });

  it('starts a run via the real route chain', async () => {
    await client.loginAsNewUser();
    await client.createPlayer();
    const startRes = await client.post('/api/game/start-run', {});
    assert.equal(startRes.status, 200);

    const areaOptions = await client.get('/api/game/area-options');
    assert.equal(areaOptions.status, 200);
    assert.ok(areaOptions.body.length > 0);

    const selectRes = await client.post('/api/game/select-area', {
      areaId: areaOptions.body[0].id
    });
    assert.equal(selectRes.status, 200);

    const collection = await client.get('/api/game/creature-collection');
    const starterIds = collection.body.collection.slice(0, 3);
    const confirmRes = await client.post('/api/game/confirm-creatures', { starterIds });
    assert.equal(confirmRes.status, 200);
    assert.ok(confirmRes.body.state.run?.currentArea);
  });

  it('game state persists across requests', async () => {
    await client.loginAsNewUser();
    await client.createPlayer();
    const state1 = await client.getState();
    const state2 = await client.getState();
    assert.deepStrictEqual(state1.body, state2.body,
      'same state returned on consecutive reads');
  });
});
```

- [ ] **Step 2: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/game-state.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/flows/game-state.test.js
git commit -m "test: game state lifecycle integration tests"
```

---

### Task 7: Exploration flow integration tests

Test the core exploration loop: start run, navigate rooms, encounter events.

**Files:**
- Create: `tests/integration/flows/exploration.test.js`

- [ ] **Step 1: Use deterministic room setup instead of random exploration**

Use the helper from Task 3 plus the existing debug room queue:
- `POST /api/game/debug-queue-rooms`
- `POST /api/game/debug-clear-room-queue`
- `POST /api/game/proceed`

Do **not** write tests that "navigate until something happens".

- [ ] **Step 2: Write exploration flow tests**

Write tests that exercise the real exploration flow through HTTP:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { startExplorationRun, queueRooms, clearQueuedRooms } from '../helpers/game-flow.js';

describe('exploration flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    await startExplorationRun(client);
  });

  afterEach(async () => {
    await clearQueuedRooms(client);
    await cleanup();
  });

  it('starts a run and enters exploration phase', async () => {
    const state = await client.getState();
    assert.equal(state.status, 200);
    assert.ok(state.body.run?.currentArea);
  });

  it('proceeds into a queued encounter room', async () => {
    await queueRooms(client, ['encounter']);
    const proceed = await client.post('/api/game/proceed', {});
    assert.equal(proceed.status, 200);
    assert.equal(proceed.body.room.type, 'encounter');
  });

  it('proceeds into a queued friendly NPC room without leaking combat state', async () => {
    await queueRooms(client, ['friendlyNpc']);
    const proceed = await client.post('/api/game/proceed', {});
    assert.equal(proceed.status, 200);
    assert.equal(proceed.body.room.type, 'friendlyNpc');
    assert.equal(proceed.body.state.phase, 'exploration');
  });
});
```

The tests above should be implemented exactly against the current route contract. No TODOs, no "fill this in later" comments.

- [ ] **Step 3: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/exploration.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/exploration.test.js
git commit -m "test: exploration flow integration tests"
```

---

### Task 8: Combat flow integration tests

Test the combat loop: enter combat, select moves, execute turns, win, get rewards (items/skills).

**Files:**
- Create: `tests/integration/flows/combat.test.js`

- [ ] **Step 1: Use the existing debug helpers to make combat deterministic**

For setup, use:
- `POST /api/game/debug-mode` with `{ enabled: true }`
- `POST /api/game/debug-force-combat`
- `POST /api/game/debug-set-enemy-hp`

This is preferable to random room traversal.

- [ ] **Step 2: Write combat flow tests**

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { startExplorationRun } from '../helpers/game-flow.js';

describe('combat flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    await startExplorationRun(client);
    await client.post('/api/game/debug-mode', { enabled: true });
  });

  afterEach(() => cleanup());

  it('executes a combat turn and updates state', async () => {
    await client.post('/api/game/debug-force-combat', {});
    const before = await client.getState();
    const moveId = before.body.combat.allies[0].moves[0].id;

    const turn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId, targetIndex: 0 }]
    });

    assert.equal(turn.status, 200);
    assert.ok(turn.body.state.combat);
  });

  it('winning combat grants rewards', async () => {
    await client.post('/api/game/debug-force-combat', {});
    await client.post('/api/game/debug-set-enemy-hp', { hp: 1 });
    const state = await client.getState();
    const moveId = state.body.combat.allies[0].moves[0].id;

    const result = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId, targetIndex: 0 }]
    });

    assert.equal(result.status, 200);
    assert.ok(result.body.state);
  });

  it('combat state is consistent after each turn', async () => {
    await client.post('/api/game/debug-force-combat', {});
    const state = await client.getState();
    const moveId = state.body.combat.allies[0].moves[0].id;

    for (let i = 0; i < 2; i++) {
      await client.post('/api/game/creature-combat-cycle', {
        actionType: 'attack',
        moveChoices: [{ creatureIndex: 0, moveId, targetIndex: 0 }]
      });
      const snapshot = await client.getState();
      const allCreatures = [
        ...(snapshot.body.combat?.allies || []),
        ...(snapshot.body.combat?.enemies || [])
      ];
      assert.ok(allCreatures.every(c => c.hp >= 0));
    }
  });
});
```

Key rule: derive `moveId` from live state, not hardcoded fixture guesses.

- [ ] **Step 3: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/combat.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/combat.test.js
git commit -m "test: combat flow integration tests"
```

---

### Task 9: Vocab review integration tests

**Files:**
- Create: `tests/integration/flows/vocab-review.test.js`

- [ ] **Step 1: Use the deterministic room queue**

Queue a `speedReviewRoom` room via `debug-queue-rooms`, then drive the exact route contract:
- `POST /api/game/proceed`
- `POST /api/game/speed-review-room/start`
- `POST /api/game/speed-review-room/progress`
- `POST /api/game/speed-review-room/complete`

- [ ] **Step 2: Write vocab review flow tests**

Test shape:
- start exploration run
- queue `['speedReviewRoom']`
- proceed into the room and capture `room.id`
- call `/speed-review-room/start` with that `roomId`
- read the returned snapshot/cards and submit `commitIndex`, `vid`, and `sid` in order
- complete the room and assert the player returns to exploration with updated room state

- [ ] **Step 3: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/vocab-review.test.js`

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/vocab-review.test.js
git commit -m "test: vocab review flow integration tests"
```

---

### Task 10: Meta-progression / reward persistence integration tests

**Files:**
- Create: `tests/integration/flows/meta-progression.test.js`

- [ ] **Step 1: Define a deterministic XP-gain loop**

Use repeated forced combats instead of hoping one random fight levels the player:
- `startExplorationRun(client)`
- `debug-mode`
- `debug-force-combat`
- `debug-set-enemy-hp` to `1`
- finish combat with `creature-combat-cycle`

- [ ] **Step 2: Write meta-progression tests**

Test at minimum:
- XP or equivalent progression value increases after repeated victories
- the updated meta/run state persists across subsequent `GET /api/game/state`
- if a level/unlock threshold is crossed during the loop, the unlock state also persists

Do **not** write a flaky single-fight assumption like "one combat always levels the player up".

- [ ] **Step 3: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/meta-progression.test.js`

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/meta-progression.test.js
git commit -m "test: meta-progression integration tests"
```

---

## Chunk 3: Visual Regression Infrastructure

### Task 11: Expose a stable browser test hook and create Playwright config for visual regression

**Files:**
- Modify: `public/game.js`
- Create: `tests/visual/playwright.config.js`

- [ ] **Step 1: Expose a stable browser game-state hook**

In `public/game.js`, after `window.__inspector = inspector`, expose stable helpers for tests:

```js
window.__gameState = () => window.__inspector?.getState?.() || null;
window.__gamePhase = () => window.__inspector?.getPhase?.() || 'unknown';
```

Playwright helpers must read these hooks, not `window.store`.

- [ ] **Step 2: Create Playwright config**

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '..',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Match the existing .mcp.json WebKit iPhone config
    browserName: 'webkit',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 15000,
    cwd: '../..',
  },
});
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, add:
```json
"test:visual": "npx playwright test --config tests/visual/playwright.config.js tests/visual/screens",
"test:smoke": "npx playwright test --config tests/visual/playwright.config.js tests/smoke --workers=1"
```

- [ ] **Step 4: Commit**

```bash
git add public/game.js tests/visual/playwright.config.js package.json
git commit -m "feat: add stable browser test hook and Playwright config"
```

---

### Task 12: Create Playwright auth and DOM assertion helpers

State-synchronized helpers that read game state from the browser and assert the DOM matches.

**Files:**
- Create: `tests/visual/helpers/auth.js`
- Create: `tests/visual/helpers/dom-assertions.js`

- [ ] **Step 1: Create auth.js**

Create a helper that registers/logs in via HTTP and seeds the browser token before `page.goto('/')`:

```js
export async function authenticatePage(page, request, {
  username = `visual-${Date.now()}`,
  password = 'password123'
} = {}) {
  let token = null;

  const register = await request.post('/api/auth/register', {
    data: { username, password, inviteCode: 'neo-tokyo-friends' }
  });
  const registerBody = await register.json().catch(() => null);
  token = registerBody?.token || null;

  if (!token) {
    const login = await request.post('/api/auth/login', {
      data: { username, password }
    });
    const loginBody = await login.json();
    token = loginBody.token;
  }

  await page.addInitScript((authToken) => {
    localStorage.setItem('authToken', authToken);
  }, token);

  return token;
}
```

This keeps the visual suite out of the login UI unless the login UI itself is what the test is about.

- [ ] **Step 2: Create dom-assertions.js**

```js
import { expect } from '@playwright/test';

/**
 * Read game state from the browser.
 * @param {import('@playwright/test').Page} page
 */
export async function getGameState(page) {
  return page.evaluate(() => window.__gameState?.());
}

/**
 * Get current game phase.
 */
export async function getPhase(page) {
  return page.evaluate(() => window.__gamePhase?.());
}

/**
 * Assert: exploration screen is showing correctly.
 * No combat UI leaking, background rendered, correct creatures visible.
 */
export async function assertExplorationScreen(page) {
  // Scene area visible
  await expect(page.locator('#scene-area')).toBeVisible();

  // No combat UI present
  await expect(page.locator('#action-area')).not.toBeVisible();

  // Background is rendered
  await expect(page.locator('#scene-background')).toBeVisible();
}

/**
 * Assert: combat screen matches game state.
 * Correct number of enemies, HP bars present, move UI visible.
 */
export async function assertCombatScreen(page) {
  const state = await getGameState(page);
  if (!state?.combat) throw new Error('Not in combat state');

  // Action area (move buttons) visible
  await expect(page.locator('#action-area')).toBeVisible();

  // Battle stage visible
  await expect(page.locator('#battle-stage')).toBeVisible();

  // Enemy formation has correct number of visible sprites
  const enemyCount = state.combat.enemies?.filter(e => e.hp > 0).length ?? 0;
  if (enemyCount > 0) {
    const enemySlots = page.locator('#enemy-formation .formation-slot .formation-sprite:visible');
    await expect(enemySlots).toHaveCount(enemyCount);
  }

  // Player formation has visible sprites
  const allyCount = state.combat.allies?.filter(a => a.hp > 0).length ?? 0;
  if (allyCount > 0) {
    const allySlots = page.locator('#player-formation .formation-slot .formation-sprite:visible');
    await expect(allySlots).toHaveCount(allyCount);
  }
}

/**
 * Assert: no stale UI from a previous phase.
 * Call after any phase transition to verify cleanup.
 */
export async function assertNoStaleUI(page, currentPhase) {
  if (currentPhase !== 'combat') {
    // Combat UI should be gone
    await expect(page.locator('#action-area')).not.toBeVisible();
    await expect(page.locator('#battle-stage')).not.toBeVisible();
  }

  // No orphaned popups
  const popup = page.locator('#creature-popup.visible');
  await expect(popup).toHaveCount(0);
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/visual/helpers/auth.js tests/visual/helpers/dom-assertions.js
git commit -m "feat: add Playwright auth and DOM assertion helpers"
```

---

## Chunk 4: Visual Regression Tests

### Task 13: Exploration screen visual assertions

**Files:**
- Create: `tests/visual/screens/exploration.test.js`

- [ ] **Step 1: Write exploration screen test**

```js
import { test, expect } from '@playwright/test';
import { authenticatePage } from '../helpers/auth.js';
import { assertExplorationScreen, assertNoStaleUI, getPhase } from '../helpers/dom-assertions.js';

test.describe('exploration screen', () => {
  test.beforeEach(async ({ page, request }) => {
    await authenticatePage(page, request);
    await page.goto('/');
    // Create a player and land in exploration via deterministic setup helpers.
    // Do not click through the login modal in every test.
  });

  test('shows exploration UI with no combat elements', async ({ page }) => {
    await assertExplorationScreen(page);
    await assertNoStaleUI(page, 'exploration');
  });

  test('creature sprites in party slots match game state', async ({ page }) => {
    const state = await page.evaluate(() => window.__gameState?.());
    const partyCount = state?.run?.creatureParty?.active?.length ?? 0;
    await expect(page.locator('#player-formation .formation-slot .formation-sprite:visible')).toHaveCount(partyCount);
  });
});
```

- [ ] **Step 2: Run with dev server**

Run: `npm run test:visual`
Expected: Tests pass (or fail with real UI issues to fix).

- [ ] **Step 3: Commit**

```bash
git add tests/visual/screens/exploration.test.js
git commit -m "test: exploration screen visual regression assertions"
```

---

### Task 14: Combat screen visual assertions

**Files:**
- Create: `tests/visual/screens/combat.test.js`

- [ ] **Step 1: Write combat screen tests**

Tests that enter combat via deterministic setup and assert:
- Correct number of enemy sprites match `state.combat.enemies`
- HP bars visible and present for each creature
- Move/action buttons visible
- No exploration UI leaking into combat

- [ ] **Step 2: Run and verify**

Run: `npm run test:visual`

- [ ] **Step 3: Commit**

```bash
git add tests/visual/screens/combat.test.js
git commit -m "test: combat screen visual regression assertions"
```

---

### Task 15: Phase transition visual assertions

The most critical tests — verify UI cleanup when transitioning between phases.

**Files:**
- Create: `tests/visual/screens/transitions.test.js`

- [ ] **Step 1: Write phase transition tests**

Use deterministic setup only:
- auth helper from Task 12
- API seeding to land in exploration/combat
- no "click around until combat happens" loops

```js
import { test, expect } from '@playwright/test';
import { assertNoStaleUI, getPhase, assertExplorationScreen, assertCombatScreen } from '../helpers/dom-assertions.js';

test.describe('phase transitions', () => {
  test('exploration → combat: combat UI appears, exploration UI hidden', async ({ page }) => {
    // Navigate to exploration, trigger combat
    // Assert combat screen is correct
    await assertCombatScreen(page);
    // Assert no exploration-only elements visible
  });

  test('combat → exploration: combat UI fully removed', async ({ page }) => {
    // Navigate into combat, win the fight
    // Assert exploration screen is clean
    await assertExplorationScreen(page);
    await assertNoStaleUI(page, 'exploration');
  });

  test('no stale sprites after creature faints', async ({ page }) => {
    // In combat, defeat an enemy
    // Assert fainted enemy sprite is not visible
    // Assert remaining enemies still correct
  });
});
```

- [ ] **Step 2: Run and verify**

Run: `npm run test:visual`

- [ ] **Step 3: Commit**

```bash
git add tests/visual/screens/transitions.test.js
git commit -m "test: phase transition visual regression assertions"
```

---

## Chunk 5: E2E Smoke Tests

### Task 16: Golden path E2E smoke tests

5 smoke tests that play through the game like a real user.

**Files:**
- Create: `tests/smoke/golden-path.test.js`

- [ ] **Step 1: Write the E2E smoke test file**

```js
import { test, expect } from '@playwright/test';
import { authenticatePage } from '../visual/helpers/auth.js';

// These tests run through Playwright's runner and share the visual config.
// Use the auth helper from tests/visual/helpers/auth.js.

test.describe.serial('golden path smoke tests', () => {
  // Serial because each test builds on the previous game state

  test('new player: register → login → see initial screen', async ({ page, request }) => {
    await authenticatePage(page, request);
    await page.goto('/');
    // Create or load the initial player state
    const phase = await page.evaluate(() => window.__gamePhase?.());
    expect(phase).toBeTruthy();
  });

  test('exploration + loot: navigate rooms → find item → equip', async ({ page }) => {
    // Navigate through rooms
    // Pick up an item
    // Equip equipment or use consumable
    // Assert: inventory state updated
  });

  test('combat + rewards: fight → win → receive drop → skill learned', async ({ page }) => {
    // Enter combat encounter
    // Select moves each turn until victory
    // Assert: reward received, creature state updated
  });

  test('speed review: enter → answer vocab → return to exploration', async ({ page }) => {
    // Enter speed review room
    // Answer vocab questions
    // Assert: returns to exploration with updated vocab state
  });

  test('meta-progression: gain XP → level up → unlock content', async ({ page }) => {
    // Accumulate enough XP
    // Assert: level increases, new content available
  });
});
```

Rule: do not leave these tests skeletal. Before committing Task 16, play through each flow once, record the exact selectors/gestures, and replace every comment with a real assertion.

- [ ] **Step 2: Run against dev server**

Start dev server in another terminal: `npm run dev`
Run: `npm run test:smoke`

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/golden-path.test.js
git commit -m "test: golden path E2E smoke tests"
```

---

## Chunk 6: Unit Test Triage + CI Update

### Task 17: Triage existing unit tests

Delete tests that are mostly mock-wiring. Keep tests for pure logic.

**Files:**
- Delete: ~60% of files in `tests/unit/` (specific files determined by triage rule)

- [ ] **Step 1: Identify tests to keep**

Apply the triage rule from the spec: "If removing all mocks from a test leaves nothing to assert, the test dies."

**Likely keepers** (pure logic, no/minimal mocks):
- `tests/unit/tokenizer.test.js`
- `tests/unit/sentence-renderer.test.js`
- `tests/unit/word-dictionary.test.js`
- `tests/unit/word-knowledge.test.js`
- `tests/unit/combat/effects.test.js`
- `tests/unit/game/kana-state.test.js`
- `tests/unit/game/hiragana-deck.test.js`
- `tests/unit/game/phase-machine.test.js`
- `tests/unit/game/internal-srs.test.js`
- `tests/unit/game/vocab-srs.test.js`
- `tests/unit/ui/romaji.test.js`
- `tests/unit/bootstrap-parser.test.js`
- `tests/unit/stages/stage-utils.test.js`
- `tests/unit/item/xp.test.js`
- `tests/unit/creature/enemy-scaling.test.js`

**Likely kills** (mock-heavy or replaced by integration tests):
- route tests that hand-roll fake `req`/`res`
- `tests/unit/vocab/manager-*.test.js` — mock-heavy cache tests
- `tests/unit/narration-engine/*.test.js` — most mock the AI provider
- `tests/unit/services/tts-*.test.js` — mock TTS

**Important keepers even if they live under `tests/unit/routes/`:**
- files like `tests/unit/routes/dev-content-api.test.js` that boot real Express and make real HTTP requests

- [ ] **Step 2: Read each candidate test file**

For each test file not in the "likely keepers" list, read it and apply the triage rule. Build the final delete list.

- [ ] **Step 3: Delete the condemned tests**

```bash
git rm tests/unit/path/to/condemned-test.test.js
# ... repeat for each
```

- [ ] **Step 4: Run remaining tests**

Run: `npm test`
Expected: All remaining tests pass. Coverage number drops — this is expected.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: triage unit tests — remove mock-heavy tests replaced by integration suite"
```

---

### Task 18: Update package scripts and CI configuration

Ensure CI runs the new test tiers correctly.

**Files:**
- Modify: `.github/workflows/` (CI config, find the actual file)
- Modify: `package.json` scripts

- [ ] **Step 1: Find and read CI config**

```bash
ls .github/workflows/
```

Read the CI workflow file.

- [ ] **Step 2: Update test scripts in package.json**

Ensure scripts are:
```json
"test": "npm run test:unit && npm run test:integration",
"test:unit": "c8 node --experimental-test-module-mocks --test 'tests/unit/**/*.test.js'",
"test:integration": "NODE_ENV=test node --test 'tests/integration/**/*.test.js'",
"test:visual": "npx playwright test --config tests/visual/playwright.config.js tests/visual/screens",
"test:smoke": "npx playwright test --config tests/visual/playwright.config.js tests/smoke --workers=1"
```

- [ ] **Step 3: Update CI to run both integration and visual tests**

Keep the existing unit + integration jobs, and add a visual job:

```yaml
visual:
  name: Visual Regression (Tier 3 DOM assertions)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npx playwright install --with-deps webkit
    - run: npm run test:visual
```

Do **not** add `test:smoke` to CI. It remains manual/on-demand.

- [ ] **Step 4: Verify CI locally**

Run: `npm test`
Run: `npm run test:visual`
Expected: Unit + integration + visual tests all pass locally.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/
git commit -m "ci: add integration and visual test jobs"
```

---

## Implementation Order

Tasks are designed to be executed in order. Dependencies:

```
Task 0 (shared app factory + auth split)
  └→ Task 1 (data-dir override + registry cleanup)
       └→ Task 2 (test-app factory)
            └→ Task 3 (API client + deterministic flow helpers)
                 └→ Task 4 (bootstrap test — proves infra works)
                      ├→ Task 5 (auth tests)
                      ├→ Task 6 (game state tests)
                      ├→ Task 7 (exploration tests)
                      ├→ Task 8 (combat tests)
                      ├→ Task 9 (vocab review tests)
                      └→ Task 10 (meta-progression tests)

Task 11 (browser hook + Playwright config)
  └→ Task 12 (auth + DOM assertion helpers)
       ├→ Task 13 (exploration screen tests)
       ├→ Task 14 (combat screen tests)
       └→ Task 15 (phase transition tests)

Task 16 (E2E smoke tests) — depends on Tasks 11-12 (same Playwright runtime + auth helper)

Task 17 (unit test triage) — do after integration tests prove the replacement coverage
  └→ Task 18 (CI update)

Note: PvP integration tests are deferred. The existing `tests/integration/pvp/flow.test.js` covers
the basic PvP flow. Add PvP to the integration suite after the core flows are solid.
```

Tasks 5-10 can be parallelized once Tasks 0-4 land. Tasks 11-12 can start in parallel with Tasks 5-10. Task 17 should wait until integration and visual coverage are solid.
