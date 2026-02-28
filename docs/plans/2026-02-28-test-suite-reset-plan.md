# Test Suite Reset — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform an untrusted, ungated test suite into a 3-tier system (unit/integration/smoke) with shared helpers, CI gating, and coverage tracking.

**Architecture:** Keep `node:test` framework. Reorganize tests into domain-based subdirectories under `tests/unit/` and `tests/integration/`. Add shared mock factories and temp dir helpers in `tests/helpers/`. Gate PRs with GitHub Actions running Tier 1 + 2. Track coverage with `c8`.

**Tech Stack:** node:test, c8, GitHub Actions, Node v22

**Design doc:** `docs/plans/2026-02-28-test-suite-reset-design.md`

---

### Task 1: Install c8 and delete dead files

**Files:**
- Modify: `package.json` (add c8 devDependency)
- Delete: `tests/integration/pipeline-chip-effects.test.js`
- Delete: `tests/e2e/` (entire directory)

**Step 1: Install c8**

Run: `npm install --save-dev c8`

**Step 2: Delete the empty chip effects test**

Run: `rm tests/integration/pipeline-chip-effects.test.js`

**Step 3: Delete the abandoned e2e directory**

Run: `rm -rf tests/e2e/`

**Step 4: Verify tests still pass**

Run: `node --experimental-test-module-mocks --test tests/unit/*.test.js`
Expected: All pass (154 tests)

**Step 5: Commit**

```bash
git add package.json package-lock.json tests/
git commit -m "chore: install c8, delete dead test files"
```

---

### Task 2: Create temp directory helper

**Files:**
- Create: `tests/helpers/tmp.js`
- Test: manual verification via existing vocab tests

This replaces the raw `/tmp/test-vocab-cache/` pattern that causes permission errors across test files.

**Step 1: Create `tests/helpers/tmp.js`**

```js
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Creates an isolated temp directory for a test.
 * Call cleanup() in afterEach/after to remove it.
 */
export async function createTestTmpDir(prefix = 'koto-test-') {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    async cleanup() {
      await rm(path, { recursive: true, force: true });
    }
  };
}
```

**Step 2: Verify it works**

Run: `node -e "import('./tests/helpers/tmp.js').then(m => m.createTestTmpDir().then(t => { console.log(t.path); return t.cleanup(); }).then(() => console.log('OK')))"`
Expected: prints a temp path, then "OK"

**Step 3: Commit**

```bash
git add tests/helpers/tmp.js
git commit -m "test: add shared temp directory helper"
```

---

### Task 3: Create test fixtures

**Files:**
- Create: `tests/helpers/fixtures.js`

Centralizes hardcoded test data scattered across 39 files.

**Step 1: Create `tests/helpers/fixtures.js`**

```js
// Robot IDs used across test files
export const TEST_ROBOTS = {
  KAZENOKO: 'kazenoko',
  KAMEDOR: 'kamedor',
  HIKARIBON: 'hikaribon',
  KAMINARION: 'kaminarion',
};

// Vocab words used across test files
export const TEST_VOCAB = {
  TABERU: { word: '食べる', meaning: 'eat' },
  NOMU: { word: '飲む', meaning: 'drink' },
  MIRU: { word: '見る', meaning: 'see' },
  KIKU: { word: '聞く', meaning: 'hear' },
  SHIRABERU: { word: '調べる', meaning: 'investigate' },
};

// NPC IDs
export const TEST_NPCS = {
  NAGI: 'nagi',
  MAKOTO: 'makoto',
  SORA: 'sora',
  KATSURO: 'katsuro',
  YUKIE: 'yukie',
};

// User IDs for integration tests
export const TEST_USERS = {
  USER1: 'test-user-1',
  USER2: 'test-user-2',
  INTEGRATION: 'integration_user',
};

// First area for game tests
export const TEST_AREA = 'okunomori';
```

**Step 2: Verify it imports cleanly**

Run: `node -e "import('./tests/helpers/fixtures.js').then(m => console.log(Object.keys(m)))"`
Expected: prints the export names

**Step 3: Commit**

```bash
git add tests/helpers/fixtures.js
git commit -m "test: add shared test fixtures"
```

---

### Task 4: Create mock factories

**Files:**
- Create: `tests/helpers/mocks.js`

**Step 1: Create `tests/helpers/mocks.js`**

```js
import { createNewPlayer, createNewRun } from '../../src/game/state.js';
import { instantiateRobot } from '../../src/game/robots.js';

/**
 * Creates a mock AI provider that returns canned responses.
 * Records all calls for assertion.
 */
export function createMockAIProvider(responses = ['{"line":"テスト","emotion":"neutral"}']) {
  let callIndex = 0;
  const calls = [];

  async function chatFn(messages, _opts) {
    calls.push(messages);
    const response = responses[callIndex % responses.length];
    callIndex++;
    return typeof response === 'string' ? response : JSON.stringify(response);
  }

  return { chatFn, calls };
}

/**
 * Creates a mock fetch that intercepts JPDB API calls.
 * Non-JPDB URLs pass through (or throw).
 */
export function createMockJPDB({ vocabList = [], parseResults = [] } = {}) {
  const calls = [];

  function mockFetch(url, opts) {
    calls.push({ url, opts });

    if (url.includes('/api/v1/list-vocabulary')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ vocabulary: vocabList }),
      });
    }
    if (url.includes('/api/v1/parse')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(parseResults.shift() || { tokens: [] }),
      });
    }

    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  }

  return { mockFetch, calls };
}

/**
 * Creates a test player state with optional overrides.
 */
export function createTestPlayer(overrides = {}) {
  const player = createNewPlayer('test-user');
  return { ...player, ...overrides };
}

/**
 * Creates a test run state with optional overrides.
 */
export function createTestRun(overrides = {}) {
  const player = createTestPlayer();
  const run = createNewRun(player, 'okunomori');
  return { ...run, ...overrides };
}

/**
 * Creates a mock Express request object.
 */
export function createMockReq(overrides = {}) {
  return {
    headers: {},
    cookies: {},
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

/**
 * Creates a mock Express response object with spy methods.
 */
export function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    cookies: {},
    _redirectUrl: null,

    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    send(data) { res.body = data; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
    cookie(name, val, opts) { res.cookies[name] = { val, opts }; return res; },
    clearCookie(name) { delete res.cookies[name]; return res; },
    redirect(url) { res._redirectUrl = url; return res; },
  };
  return res;
}
```

**Step 2: Verify it imports cleanly**

Run: `node -e "import('./tests/helpers/mocks.js').then(m => console.log(Object.keys(m)))"`
Expected: prints export names without errors

**Step 3: Commit**

```bash
git add tests/helpers/mocks.js
git commit -m "test: add shared mock factories"
```

---

### Task 5: Reorganize unit test directory structure

Move tests from flat `tests/unit/` into domain subdirectories. The narration-engine subdirectory already exists — do the same for combat, game, vocab, robot, item, auth, and infra.

**Files:**
- Move: all `tests/unit/*.test.js` into subdirectories
- Modify: `package.json` test:unit glob

**Step 1: Create subdirectories**

```bash
mkdir -p tests/unit/{combat,game,vocab,robot,item,auth,infra}
```

**Step 2: Move files into domain directories**

```bash
# Auth
mv tests/unit/auth-crypto.test.js tests/unit/auth/crypto.test.js
mv tests/unit/auth-middleware.test.js tests/unit/auth/middleware.test.js
mv tests/unit/auth-users.test.js tests/unit/auth/users.test.js
mv tests/unit/auth-routes.test.js tests/unit/auth/routes.test.js

# Combat
mv tests/unit/combat-effects.test.js tests/unit/combat/effects.test.js
mv tests/unit/robot-combat-service.test.js tests/unit/combat/robot-combat-service.test.js

# Game
mv tests/unit/rooms-word-discovery.test.js tests/unit/game/rooms-word-discovery.test.js
mv tests/unit/branching-rooms.test.js tests/unit/game/branching-rooms.test.js
mv tests/unit/npc-service.test.js tests/unit/game/npc-service.test.js
mv tests/unit/exploration-xp.test.js tests/unit/game/exploration-xp.test.js
mv tests/unit/manager-registry.test.js tests/unit/game/manager-registry.test.js

# Vocab
mv tests/unit/vocab-manager-per-user.test.js tests/unit/vocab/manager-per-user.test.js
mv tests/unit/vocab-manager-cache.test.js tests/unit/vocab/manager-cache.test.js
mv tests/unit/vocab-manager-new-words.test.js tests/unit/vocab/manager-new-words.test.js
mv tests/unit/vocab-repair-vid.test.js tests/unit/vocab/repair-vid.test.js
mv tests/unit/vocab-repair-vid-integration.test.js tests/unit/vocab/repair-vid-integration.test.js
mv tests/unit/phase-word-discovery.test.js tests/unit/vocab/phase-word-discovery.test.js

# Robot
mv tests/unit/robots.test.js tests/unit/robot/robots.test.js
mv tests/unit/robot-party.test.js tests/unit/robot/party.test.js
mv tests/unit/robot-swap.test.js tests/unit/robot/swap.test.js
mv tests/unit/robot-collection-service.test.js tests/unit/robot/collection-service.test.js

# Item
mv tests/unit/item-service.test.js tests/unit/item/service.test.js
mv tests/unit/item-xp.test.js tests/unit/item/xp.test.js

# JPDB (stays under vocab since it's the vocab data source)
mv tests/unit/jpdb-circuit-breaker.test.js tests/unit/vocab/jpdb-circuit-breaker.test.js
mv tests/unit/jpdb-batch-parse.test.js tests/unit/vocab/jpdb-batch-parse.test.js
mv tests/unit/jpdb-helpers.test.js tests/unit/vocab/jpdb-helpers.test.js

# Infra
mv tests/unit/logger.test.js tests/unit/infra/logger.test.js
```

**Step 3: Fix import paths in moved files**

Every moved file has relative imports like `../../src/...`. Moving one level deeper means these become `../../../src/...`. Update every moved file's imports.

For example, in `tests/unit/auth/crypto.test.js`, change:
```js
// OLD
import { ... } from '../../src/auth/crypto.js';
// NEW
import { ... } from '../../../src/auth/crypto.js';
```

Do this for ALL moved files. Each file's relative path to the project root gains one extra `../`.

**Step 4: Update package.json test:unit glob**

Change from:
```json
"test:unit": "node --experimental-test-module-mocks --test tests/unit/*.test.js"
```
To:
```json
"test:unit": "c8 node --experimental-test-module-mocks --test 'tests/unit/**/*.test.js'"
```

This now finds tests in subdirectories AND wraps with c8 for coverage.

**Step 5: Run tests to verify nothing broke**

Run: `npm run test:unit`
Expected: All tests pass (same count as before), plus c8 coverage summary printed

**Step 6: Commit**

```bash
git add tests/ package.json
git commit -m "refactor: reorganize tests into domain subdirectories"
```

---

### Task 6: Migrate vocab tests to use shared tmp helper

**Files:**
- Modify: `tests/unit/vocab/manager-per-user.test.js`
- Modify: `tests/unit/vocab/manager-new-words.test.js`
- Modify: `tests/unit/vocab/manager-cache.test.js`

These files currently hardcode `/tmp/test-vocab-cache/` with manual `mkdirSync`/`unlinkSync` cleanup that causes permission errors.

**Step 1: Update `manager-per-user.test.js`**

Replace the top of the file:
```js
// OLD
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
const TEST_CACHE_DIR = '/tmp/test-vocab-cache/';

describe('Per-user vocab cache', () => {
  let vm;
  before(async () => {
    try { mkdirSync(TEST_CACHE_DIR, { recursive: true }); } catch {}
    vm = await import('../../../src/game/vocab-manager.js');
  });
  after(() => {
    ['user1', 'user2'].forEach(userId => {
      const file = `${TEST_CACHE_DIR}vocab-cache-${userId}.json`;
      if (existsSync(file)) unlinkSync(file);
    });
  });
```

```js
// NEW
import { readFileSync, existsSync } from 'fs';
import { createTestTmpDir } from '../../helpers/tmp.js';

describe('Per-user vocab cache', () => {
  let vm, tmp;
  before(async () => {
    tmp = await createTestTmpDir('koto-vocab-');
    vm = await import('../../../src/game/vocab-manager.js');
  });
  after(async () => {
    await tmp.cleanup();
  });
```

Then replace all references to `TEST_CACHE_DIR` with `tmp.path + '/'`.

**Step 2: Apply same pattern to `manager-new-words.test.js` and `manager-cache.test.js`**

Same replacement: remove manual `/tmp` creation/cleanup, use `createTestTmpDir()`.

**Step 3: Run the vocab tests**

Run: `node --experimental-test-module-mocks --test 'tests/unit/vocab/**/*.test.js'`
Expected: All pass, no permission errors

**Step 4: Commit**

```bash
git add tests/unit/vocab/ tests/helpers/
git commit -m "fix: use shared tmp helper in vocab tests"
```

---

### Task 7: Reorganize integration tests

**Files:**
- Move: `tests/integration/auth-flow.test.js` → `tests/integration/auth/flow.test.js`
- Move: `tests/integration/discovery-words.test.js` → `tests/integration/vocab/discovery-words.test.js`
- Modify: `package.json` test:integration glob

**Step 1: Create subdirectories**

```bash
mkdir -p tests/integration/{auth,vocab}
```

**Step 2: Move files**

```bash
mv tests/integration/auth-flow.test.js tests/integration/auth/flow.test.js
mv tests/integration/discovery-words.test.js tests/integration/vocab/discovery-words.test.js
```

**Step 3: Fix import paths (add one more `../`)**

**Step 4: Update package.json**

```json
"test:integration": "node --test 'tests/integration/**/*.test.js'"
```

**Step 5: Run to verify**

Run: `npm run test:integration`
Expected: All pass

**Step 6: Commit**

```bash
git add tests/ package.json
git commit -m "refactor: reorganize integration tests into domain subdirectories"
```

---

### Task 8: Create smoke test directory with placeholder

**Files:**
- Create: `tests/smoke/narration-live.test.js`

**Step 1: Create the smoke directory and placeholder test**

```js
import { describe, it } from 'node:test';

describe('Narration smoke tests (live AI)', () => {
  it.todo('generates parseable dialogue with real AI provider');
  it.todo('JPDB batch parse works against live API');
});
```

**Step 2: Add npm script**

Add to package.json scripts:
```json
"test:smoke": "node --test 'tests/smoke/**/*.test.js'"
```

**Step 3: Update the default `test` script**

Change from:
```json
"test": "npm run test:unit && npm run test:integration && npm run test:e2e"
```
To:
```json
"test": "npm run test:unit && npm run test:integration"
```

This removes the broken e2e reference and makes `npm test` run only Tier 1 + 2.

**Step 4: Remove legacy e2e scripts**

Delete these from package.json scripts:
- `test:e2e`
- `test:e2e:headed`
- `test:e2e:ui`
- `test:e2e:debug`

**Step 5: Verify**

Run: `npm test`
Expected: Unit + integration tests all pass

Run: `npm run test:smoke`
Expected: Shows the todo tests (0 pass, 0 fail, 2 todo)

**Step 6: Commit**

```bash
git add tests/smoke/ package.json
git commit -m "chore: add smoke test tier, clean up npm scripts"
```

---

### Task 9: Set up c8 coverage floor

**Files:**
- Create: `.c8rc.json`

**Step 1: Run coverage to see the current baseline**

Run: `npm run test:unit`
Note the line coverage percentage printed by c8.

**Step 2: Create `.c8rc.json` with a floor rounded down to nearest 5%**

For example, if coverage is 47%, set floor at 45%:

```json
{
  "check-coverage": true,
  "lines": 45,
  "reporter": ["text", "html"],
  "report-dir": "tmp/coverage",
  "all": false,
  "exclude": [
    "tests/**",
    "scripts/**",
    "public/**"
  ]
}
```

Adjust the `lines` value to match the actual baseline.

**Step 3: Add `tmp/coverage/` to `.gitignore`**

Append to `.gitignore`:
```
tmp/coverage/
```

**Step 4: Verify coverage check passes**

Run: `npm run test:unit`
Expected: Tests pass AND coverage check passes (above floor)

**Step 5: Commit**

```bash
git add .c8rc.json .gitignore
git commit -m "chore: add c8 coverage floor"
```

---

### Task 10: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1: Create the workflow file**

```yaml
name: Tests

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  unit:
    name: Unit Tests (Tier 1)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:unit

  integration:
    name: Integration Tests (Tier 2)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:integration
```

**Step 2: Verify the YAML is valid**

Run: `node -e "const yaml = require('yaml'); yaml.parse(require('fs').readFileSync('.github/workflows/test.yml','utf8')); console.log('valid')"`

If `yaml` isn't installed, just check syntax manually — the YAML is straightforward.

**Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add GitHub Actions for Tier 1 + Tier 2 tests"
```

---

### Task 11: Create tests/README.md

**Files:**
- Create: `tests/README.md`

**Step 1: Write the conventions doc**

```markdown
# Test Conventions

## Three Tiers

| Tier | Dir | Speed | Runs on | Gates PRs? |
|------|-----|-------|---------|------------|
| 1 - Unit | `tests/unit/` | <30s | every commit | yes |
| 2 - Integration | `tests/integration/` | <2min | every PR | yes |
| 3 - Smoke | `tests/smoke/` | varies | on-demand | no |

## Rules

- **Mock all external boundaries** in Tier 1 and 2 (AI providers, JPDB API, network)
- **Use `createTestTmpDir()`** from `tests/helpers/tmp.js` for any file I/O — never raw `/tmp`
- **Use fixtures** from `tests/helpers/fixtures.js` for test data constants
- **Use mock factories** from `tests/helpers/mocks.js` for AI, JPDB, Express req/res
- **Test names:** present-tense behavior — `it('applies poison damage at end of turn')`
- **Max nesting:** `describe('module')` → `it('does thing')`. One level of grouping max.

## Keep-or-delete rule

> If this test didn't exist and the code it tests broke, would a user notice?

If yes: keep. If no: delete.

## Commands

```bash
npm test              # Tier 1 + 2 (default)
npm run test:unit     # Tier 1 only (with coverage)
npm run test:integration  # Tier 2 only
npm run test:smoke    # Tier 3 (on-demand, not a gate)
npm run test:coverage # View coverage report
```
```

**Step 2: Commit**

```bash
git add tests/README.md
git commit -m "docs: add test conventions README"
```

---

### Task 12: Update CLAUDE.md testing section

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Replace the Testing section**

Find the current `## Testing` section and replace with:

```markdown
## Testing

**Three-tier test system** — see `tests/README.md` for full conventions.

```bash
npm test              # Tier 1 (unit) + Tier 2 (integration) — must pass before merge
npm run test:unit     # Unit tests with c8 coverage
npm run test:integration  # Integration tests
npm run test:smoke    # On-demand smoke tests (real AI calls, not a gate)
npm run test:coverage # View HTML coverage report
```

**Syntax check after editing JS** (catches errors fast):
```bash
node --check public/js/yourfile.js && echo "OK"
```

CI runs Tier 1 + 2 on every push and PR via GitHub Actions. Coverage has a ratcheting floor — it can only go up.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md testing section for 3-tier system"
```

---

### Task 13: Final verification

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All unit tests pass with coverage, all integration tests pass.

**Step 2: Verify coverage report**

Run: `npm run test:coverage`
Expected: HTML report generated at `tmp/coverage/index.html`

**Step 3: Verify directory structure**

Run: `find tests/ -name '*.test.js' | sort`
Expected: All tests in domain subdirectories, no stray files at `tests/unit/` root

**Step 4: Final commit if any loose ends**

```bash
git status
# If clean, done. If not, commit remaining changes.
```
