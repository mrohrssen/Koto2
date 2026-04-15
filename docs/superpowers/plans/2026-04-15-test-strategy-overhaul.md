# Test Strategy Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock-heavy unit tests with integration tests that boot a real Express app, add Playwright DOM assertions that catch stale frontends, and add E2E smoke tests for golden paths.

**Architecture:** A `createTestApp()` factory boots a real Express instance with only AI providers and TTS mocked at the boundary. Integration tests hit real HTTP endpoints. Playwright tests assert DOM state matches `window.store.get('gameState')`. E2E smoke tests play through critical user flows.

**Tech Stack:** node:test, node:assert/strict, Express (real), Playwright, c8 (coverage)

**Spec:** `docs/superpowers/specs/2026-04-15-test-strategy-overhaul-design.md`

---

## File Map

```
tests/
  integration/
    helpers/
      test-app.js         ← NEW: factory that boots real Express with mocked externals
      api-client.js        ← NEW: HTTP client with auth, convenience methods
    flows/
      auth.test.js         ← NEW: register → login → token → protected routes
      game-state.test.js   ← NEW: new game → save → load → verify persistence
      exploration.test.js  ← NEW: start run → navigate rooms → trigger events
      combat.test.js       ← NEW: enter combat → select moves → win → get rewards
      vocab-review.test.js ← NEW: speed review → answer words → state updates
      meta-progression.test.js ← NEW: gain XP → level up → unlock content
  visual/
      playwright.config.js ← NEW: Playwright config for visual regression
      helpers/
        visual-test-app.js ← NEW: starts dev server for Playwright tests
        dom-assertions.js  ← NEW: state-synchronized DOM assertion helpers
      screens/
        exploration.test.js ← NEW: DOM assertions for exploration screen
        combat.test.js      ← NEW: DOM assertions for combat screen
        transitions.test.js ← NEW: DOM assertions for phase transitions
  smoke/
      golden-path.test.js  ← NEW: full E2E flow through the game
  helpers/
    mocks.js               ← MODIFY: add createMockAIChat(), createMockTTS()
    fixtures.js            ← MODIFY: add area/room/combat fixtures
```

**Key existing files referenced:**
- `src/routes/index.js:19` — `createRoutes(deps)` factory, accepts all route deps
- `src/routes/game/index.js:30` — `createGameRoutes(deps)` factory, applies auth + manager middleware
- `src/auth/middleware.js:42` — `requireAuth` bypasses auth when `NODE_ENV=test`
- `src/game/manager-registry.js:19` — `getManager(userId)` creates per-user GameManager
- `src/game/manager-registry.js:134` — `removeManager(userId)` cleanup for tests
- `src/data-dir.js:11` — `DATA_DIR` const, needs override for tests
- `server.js:349-390` — how deps are wired in production
- `tests/unit/routes/dev-content-api.test.js:11` — existing pattern: real Express + HTTP per test

---

## Chunk 1: Test Infrastructure Foundation

### Task 1: Add test data directory override to data-dir.js

`manager-registry.js` imports `DATA_DIR` at module level. Tests need a per-test temp directory. Add an override mechanism.

**Files:**
- Modify: `src/data-dir.js:11`
- Test: `tests/unit/data-dir-override.test.js` (throwaway verification)

- [ ] **Step 1: Read current data-dir.js**

Current code at line 11:
```js
export const DATA_DIR = existsSync(RAILWAY_DATA_DIR) ? RAILWAY_DATA_DIR : PROJECT_ROOT;
```

- [ ] **Step 2: Add setDataDirForTest override function**

In `src/data-dir.js`, change `DATA_DIR` to a `let` and add getter/setter. Also update `dataPath()` to use the getter so callers like `auth/routes.js` that call `dataPath()` at module load time will still pick up the override when the actual file operations happen at request time:

```js
let _dataDir = existsSync(RAILWAY_DATA_DIR) ? RAILWAY_DATA_DIR : PROJECT_ROOT;

/** Get current data directory (respects test overrides). */
export function getDataDir() {
  return _dataDir;
}

/** Test-only: override the data directory. */
export function setDataDirForTest(dir) {
  _dataDir = dir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Keep backward compat — but note this is a snapshot, not live.
// Prefer getDataDir() in code that runs after module load.
export const DATA_DIR = _dataDir;

export function dataPath(filename) {
  return join(getDataDir(), filename);  // uses getter, not stale const
}
```

**Important:** `dataPath()` must use `getDataDir()` (not the const `DATA_DIR`) so that `auth/routes.js` line 15 (`const DEFAULT_USERS_FILE = dataPath(...)`) resolves to the test directory at call time. However, `DEFAULT_USERS_FILE` is set once at import time — so the test-app factory must still pass `usersFile` explicitly to `createAuthRoutes()` (already done above).

- [ ] **Step 3: Update all direct DATA_DIR consumers to use getDataDir()**

In `src/game/manager-registry.js`, change:
```js
import { DATA_DIR } from '../data-dir.js';
```
to:
```js
import { getDataDir } from '../data-dir.js';
```

Replace all `DATA_DIR` usages with `getDataDir()` (lines 26, 118).

Also grep for other direct `DATA_DIR` imports and update them:
```bash
grep -rn "import.*DATA_DIR" src/
```
Update each to use `getDataDir()` where the value is used at function-call time (not module load time). Files that only use `dataPath()` are already covered by the `dataPath()` fix above.

- [ ] **Step 4: Verify nothing breaks**

Run: `npm test`
Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/data-dir.js src/game/manager-registry.js
git commit -m "refactor: add setDataDirForTest() to data-dir for integration tests"
```

---

### Task 2: Create the test-app factory

The foundation for all integration tests. Creates a real Express app with production routes, mocking only AI and TTS at the boundary.

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
 * Integration tests don't test AI generation — they test game logic.
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
import express from 'express';
import { createServer } from 'http';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import createRoutes from '../../../src/routes/index.js';
import createAuthRoutes from '../../../src/auth/routes.js';
import { setDataDirForTest, getDataDir } from '../../../src/data-dir.js';
import { removeManager } from '../../../src/game/manager-registry.js';
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
  // Isolated temp directory per test
  const tmpDir = join(import.meta.dirname, '../../../tmp/test-' + randomUUID());
  mkdirSync(tmpDir, { recursive: true });
  setDataDirForTest(tmpDir);

  const settings = {
    gameTtsEnabled: false,
    voiceGender: 'boy',
    dailyWordLimit: 10,
    debugSuperAttack: false,
    reviewType: 'typing'
  };

  const narration = createNoOpNarration();

  const app = express();
  app.use(express.json());

  // Auth routes (public) — pass usersFile so tests get isolated user storage
  app.use('/api/auth', createAuthRoutes({ usersFile: join(tmpDir, '.jrpg-users.json') }));

  // Main routes with real game logic, mocked externals
  app.use('/api', createRoutes({
    getSettings: () => settings,
    saveSettings: (newSettings) => { Object.assign(settings, newSettings); },
    ttsCache: createMockTTS(),
    ttsDialogueCache: createMockTTSDialogue(),
    enrichGameState: (gm) => gm.getState(),
    cancelPendingPrefetches: () => {},
    clearPrefetchCache: () => {},
    updateGameStatsWithEvent: () => {},
    saveGameStats: () => {},
    getGameStats: () => ({}),
    setGameStats: () => {},
    getDebugMode: () => false,
    setDebugMode: () => {},
    vocabCacheFile: join(tmpDir, 'vocab-cache.json'),
    staticWordList: [],
    getUserVocabulary: async () => [],
    ...narration
  }));

  // Start server on random port
  const server = createServer(app);
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  function cleanup() {
    server.close();
    removeManager('test-user');
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  return { app, server, port, tmpDir, cleanup };
}
```

- [ ] **Step 3: Verify import works**

Run:
```bash
NODE_ENV=test node -e "import('./tests/integration/helpers/test-app.js').then(() => console.log('OK'))"
```
Expected: `OK` (no import errors)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/helpers/test-app.js tests/helpers/mocks.js
git commit -m "feat: add test-app factory for integration tests"
```

---

### Task 3: Create the API client helper

Thin wrapper for making authenticated HTTP requests in tests.

**Files:**
- Create: `tests/integration/helpers/api-client.js`

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

- [ ] **Step 2: Commit**

```bash
git add tests/integration/helpers/api-client.js
git commit -m "feat: add API client helper for integration tests"
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

### Task 5: Auth flow integration tests

Test the real auth system: register, login, token validation, protected routes.

**Files:**
- Create: `tests/integration/flows/auth.test.js`

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
    assert.equal(res.status, 409);
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
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 200);
  });
});
```

- [ ] **Step 2: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/auth.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/flows/auth.test.js
git commit -m "test: auth flow integration tests"
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
    await client.loginAsNewUser();
  });

  afterEach(() => cleanup());

  it('returns initial game state for new user', async () => {
    const res = await client.get('/api/game/state');
    assert.equal(res.status, 200);
    assert.ok(res.body.player || res.body.meta, 'should have player or meta state');
  });

  it('starts a new run and state reflects it', async () => {
    // Get available areas first
    const state = await client.get('/api/game/state');
    assert.equal(state.status, 200);

    // Start a run (use first available area or default)
    const startRes = await client.post('/api/game/start-run');
    // May need area param — adapt based on actual API
    assert.ok([200, 400].includes(startRes.status),
      'should either start or require area selection');
  });

  it('game state persists across requests', async () => {
    const state1 = await client.get('/api/game/state');
    const state2 = await client.get('/api/game/state');
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

- [ ] **Step 1: Read the exploration API endpoints**

Read these files to understand the exact request/response shapes:
- `src/routes/game/run.js` — start-run, explore, room navigation endpoints
- `src/game/rooms.js` — room generation, room types
- `src/game/services/exploration-service.js` — exploration logic

Document the endpoint signatures (method, path, body, response) before writing tests.

- [ ] **Step 2: Write exploration flow tests**

Write tests that exercise the real exploration flow through HTTP. The exact assertions depend on what Step 1 reveals. At minimum:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('exploration flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    await client.loginAsNewUser();
  });

  afterEach(() => cleanup());

  it('starts a run and enters exploration phase', async () => {
    // Start run — read actual endpoint from run.js
    // Assert state.phase === 'exploration' or equivalent
  });

  it('navigates between rooms', async () => {
    // Start run, then navigate
    // Assert room changes, different room content
  });

  it('encounters a creature and enters combat', async () => {
    // Navigate until a combat encounter triggers
    // Assert state transitions to combat phase
  });
});
```

Fill in the exact endpoint calls and assertions based on what you learn in Step 1. The tests should exercise real route handlers and real game logic.

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

- [ ] **Step 1: Read the combat API endpoints**

Read these files:
- `src/routes/game/combat.js` — combat endpoints (move selection, turn execution)
- `src/game/services/creature-combat-service.js` — combat logic
- `src/game/combat/effects.js` — status effects

Document the endpoint signatures.

- [ ] **Step 2: Write combat flow tests**

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('combat flow', () => {
  let client, cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    await client.loginAsNewUser();
  });

  afterEach(() => cleanup());

  it('executes a combat turn and updates state', async () => {
    // Navigate to combat encounter
    // Select a move
    // Assert: HP changes, turn counter advances
  });

  it('winning combat grants rewards', async () => {
    // Play through combat to completion
    // Assert: XP granted, items/skills awarded, state returns to exploration
  });

  it('combat state is consistent after each turn', async () => {
    // Execute multiple turns
    // After each turn: GET /api/game/state
    // Assert: no stale data, all creatures have valid HP
  });
});
```

Fill in based on Step 1 findings. The key assertion: after combat ends, the game state cleanly transitions back and rewards persist.

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

- [ ] **Step 1: Read the vocab/speed-review endpoints**

Read `src/routes/game/run.js` for speed-review-room endpoints.

- [ ] **Step 2: Write vocab review flow tests**

Test: enter speed review room, answer words, state updates correctly, returns to exploration.

- [ ] **Step 3: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/vocab-review.test.js`

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/vocab-review.test.js
git commit -m "test: vocab review flow integration tests"
```

---

### Task 10: Meta-progression integration tests

**Files:**
- Create: `tests/integration/flows/meta-progression.test.js`

- [ ] **Step 1: Read the meta-progression endpoints**

Read `src/routes/game/player.js` and `src/routes/game/economy.js` for XP, leveling, unlocks.

- [ ] **Step 2: Write meta-progression tests**

Test: gain XP, level up, unlock new areas/creatures, state persists.

- [ ] **Step 3: Run and verify**

Run: `NODE_ENV=test node --test tests/integration/flows/meta-progression.test.js`

- [ ] **Step 4: Commit**

```bash
git add tests/integration/flows/meta-progression.test.js
git commit -m "test: meta-progression integration tests"
```

---

## Chunk 3: Visual Regression Infrastructure

### Task 11: Create Playwright config for visual regression

**Files:**
- Create: `tests/visual/playwright.config.js`

- [ ] **Step 1: Create Playwright config**

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './screens',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    // Match the existing .mcp.json WebKit iPhone config
    browserName: 'webkit',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 15000,
    cwd: '../..',
  },
});
```

- [ ] **Step 2: Add npm script**

In `package.json`, add:
```json
"test:visual": "npx playwright test --config tests/visual/playwright.config.js"
```

- [ ] **Step 3: Commit**

```bash
git add tests/visual/playwright.config.js package.json
git commit -m "feat: add Playwright config for visual regression tests"
```

---

### Task 12: Create DOM assertion helpers

State-synchronized helpers that read game state from the browser and assert the DOM matches.

**Files:**
- Create: `tests/visual/helpers/dom-assertions.js`

- [ ] **Step 1: Create dom-assertions.js**

```js
import { expect } from '@playwright/test';

/**
 * Read game state from the browser.
 * @param {import('@playwright/test').Page} page
 */
export async function getGameState(page) {
  return page.evaluate(() => window.store?.get('gameState'));
}

/**
 * Get current game phase.
 */
export async function getPhase(page) {
  return page.evaluate(() => window.store?.get('gameState')?.phase);
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

- [ ] **Step 2: Commit**

```bash
git add tests/visual/helpers/dom-assertions.js
git commit -m "feat: add state-synchronized DOM assertion helpers"
```

---

## Chunk 4: Visual Regression Tests

### Task 13: Exploration screen visual assertions

**Files:**
- Create: `tests/visual/screens/exploration.test.js`

- [ ] **Step 1: Write exploration screen test**

```js
import { test } from '@playwright/test';
import { assertExplorationScreen, assertNoStaleUI, getPhase } from '../helpers/dom-assertions.js';

test.describe('exploration screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login and navigate to exploration
    // (Fill in exact interaction based on the game's login flow)
  });

  test('shows exploration UI with no combat elements', async ({ page }) => {
    await assertExplorationScreen(page);
    await assertNoStaleUI(page, 'exploration');
  });

  test('creature sprites in party slots match game state', async ({ page }) => {
    // Read party from game state, assert each slot has correct sprite
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

Tests that navigate into combat and assert:
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

// These tests require the dev server running: npm run dev
// Run via: npx playwright test --config tests/visual/playwright.config.js tests/smoke/

test.describe.serial('golden path smoke tests', () => {
  // Serial because each test builds on the previous game state

  test('new player: register → login → see initial screen', async ({ page }) => {
    await page.goto('/');
    // Register and login through the UI
    // Assert: initial game screen loads
    const phase = await page.evaluate(() => window.store?.get('gameState')?.phase);
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

Note: These tests are intentionally skeletal. Each one needs to be filled in with exact UI interactions based on the game's actual flow. The implementer should play through the game once in Playwright to discover the exact click/swipe sequences needed.

- [ ] **Step 2: Add npm script**

In `package.json`, update the smoke script to use Playwright's runner:
```json
"test:smoke": "npx playwright test --config tests/visual/playwright.config.js tests/smoke/"
```

- [ ] **Step 3: Run against dev server**

Start dev server in another terminal: `npm run dev`
Run: `npm run test:smoke`

- [ ] **Step 4: Commit**

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
- `tests/unit/routes/*.test.js` — replaced by integration tests
- `tests/unit/vocab/manager-*.test.js` — mock-heavy cache tests
- `tests/unit/narration-engine/*.test.js` — most mock the AI provider
- `tests/unit/services/tts-*.test.js` — mock TTS

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

### Task 18: Update CI configuration

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
"test:visual": "npx playwright test --config tests/visual/playwright.config.js",
"test:smoke": "node --test 'tests/smoke/**/*.test.js'"
```

- [ ] **Step 3: Update CI to run integration tests**

Add `NODE_ENV=test npm run test:integration` to the CI pipeline after unit tests.

- [ ] **Step 4: Verify CI locally**

Run: `npm test`
Expected: Unit + integration tests all pass.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/
git commit -m "ci: add integration tests to CI pipeline"
```

---

## Implementation Order

Tasks are designed to be executed in order. Dependencies:

```
Task 1 (data-dir override)
  └→ Task 2 (test-app factory)
       └→ Task 3 (API client)
            └→ Task 4 (bootstrap test — proves infra works)
                 ├→ Task 5 (auth tests)
                 ├→ Task 6 (game state tests)
                 ├→ Task 7 (exploration tests)
                 ├→ Task 8 (combat tests)
                 ├→ Task 9 (vocab review tests)
                 └→ Task 10 (meta-progression tests)

Task 11 (Playwright config) — independent of above
  └→ Task 12 (DOM assertion helpers)
       ├→ Task 13 (exploration screen tests)
       ├→ Task 14 (combat screen tests)
       └→ Task 15 (phase transition tests)

Task 16 (E2E smoke tests) — depends on Task 11 (reuses same Playwright config)

Task 17 (unit test triage) — do after integration tests prove the replacement coverage
  └→ Task 18 (CI update)

Note: PvP integration tests are deferred. The existing `tests/integration/pvp/flow.test.js` covers
the basic PvP flow. Add PvP to the integration suite after the core flows are solid.
```

Tasks 5-10 can be parallelized (independent flows). Tasks 11-12 can start in parallel with Tasks 5-10. Task 17 should wait until integration tests are solid.
