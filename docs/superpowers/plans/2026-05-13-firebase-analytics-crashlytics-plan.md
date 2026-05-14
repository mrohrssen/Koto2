# Firebase Analytics & Crashlytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-gated Firebase Analytics and native Crashlytics support for a small first-run funnel, using pseudonymous account-linked identity and no username/content payloads.

**Architecture:** Server auth responses expose a stable HMAC-based `analyticsId`. The client owns a thin analytics facade that sanitizes params, dedupes first-run milestones, selects Firebase Web vs Capacitor Firebase transports, and no-ops when Railway production env vars are absent. Existing diagnostics and central game state hooks feed sanitized crash context and funnel milestones.

**Tech Stack:** Node.js ES modules, Express auth routes, vanilla browser modules, Firebase Web SDK, Capawesome Capacitor Firebase Analytics/Crashlytics plugins, Node `node:test`, `supertest`, Vite env vars.

**Commit Policy:** Do not create git commits unless the user explicitly asks for commits during execution. The commit snippets in this plan are only for that explicit case.

---

## File Structure

Create:

- `src/auth/analytics-id.js` — server-only HMAC helper for pseudonymous Firebase IDs.
- `public/js/analytics-core.js` — pure browser-safe helpers: env gate, sanitizer, milestone storage, context extraction.
- `public/js/analytics.js` — Firebase-facing facade and transport selection.
- `tests/unit/auth/analytics-id.test.js` — server identity helper tests.
- `tests/unit/ui/analytics-core.test.js` — pure client helper tests.
- `tests/unit/ui/analytics-facade.test.js` — facade behavior with fake transports.

Modify:

- `src/auth/routes.js` — include `analyticsId` in register/login/me responses.
- `public/js/ui/auth.js` — initialize account identity and log auth events after successful auth.
- `public/game.js` — initialize analytics, set user properties/current context, log onboarding/run milestones.
- `public/js/diagnostics.js` — feed phase changes and non-fatal JS errors into analytics facade.
- `public/js/ui/combat-loop.js` — log first combat end from combat result.
- `public/privacy.html` — disclose pseudonymous analytics and Crashlytics use.
- `package.json` / lockfile — add Firebase dependencies.
- Native Capacitor project files only after Firebase app files are available and approved.

Primary verification commands:

- `node --test tests/unit/auth/analytics-id.test.js`
- `node --test tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js`
- `node --test tests/unit/auth/routes.test.js tests/integration/auth/flow.test.js`
- `node --check public/js/analytics-core.js && node --check public/js/analytics.js && node --check public/game.js && node --check public/js/diagnostics.js && node --check public/js/ui/auth.js && node --check public/js/ui/combat-loop.js`
- `npm test`

---

### Task 1: Add Pseudonymous Analytics ID Helper

**Files:**
- Create: `src/auth/analytics-id.js`
- Create: `tests/unit/auth/analytics-id.test.js`

- [ ] **Step 1: Write failing unit tests for the server identity helper**

Create `tests/unit/auth/analytics-id.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAnalyticsId } from '../../../src/auth/analytics-id.js';

describe('analytics ID helper', () => {
  it('returns a stable pseudonymous ID when a secret is configured', () => {
    const env = { ANALYTICS_ID_SECRET: 'test-secret-for-analytics' };
    const first = getAnalyticsId('u_abc123', env);
    const second = getAnalyticsId('u_abc123', env);

    assert.equal(first, second);
    assert.match(first, /^ka_[a-f0-9]{32}$/);
    assert.equal(first.includes('u_abc123'), false);
  });

  it('returns different IDs for different users', () => {
    const env = { ANALYTICS_ID_SECRET: 'test-secret-for-analytics' };

    assert.notEqual(
      getAnalyticsId('u_one', env),
      getAnalyticsId('u_two', env)
    );
  });

  it('returns null when no secret is configured', () => {
    assert.equal(getAnalyticsId('u_abc123', {}), null);
  });

  it('returns null for missing user IDs', () => {
    const env = { ANALYTICS_ID_SECRET: 'test-secret-for-analytics' };

    assert.equal(getAnalyticsId('', env), null);
    assert.equal(getAnalyticsId(null, env), null);
    assert.equal(getAnalyticsId(undefined, env), null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/unit/auth/analytics-id.test.js
```

Expected: fails because `src/auth/analytics-id.js` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `src/auth/analytics-id.js`:

```js
import { createHmac } from 'node:crypto';

const ANALYTICS_ID_PREFIX = 'ka_';
const ANALYTICS_ID_LENGTH = 32;

export function getAnalyticsId(userId, env = process.env) {
  if (!userId || typeof userId !== 'string') return null;

  const secret = env?.ANALYTICS_ID_SECRET;
  if (!secret || typeof secret !== 'string') return null;

  const digest = createHmac('sha256', secret)
    .update(userId)
    .digest('hex')
    .slice(0, ANALYTICS_ID_LENGTH);

  return `${ANALYTICS_ID_PREFIX}${digest}`;
}
```

- [ ] **Step 4: Run the helper test**

Run:

```bash
node --test tests/unit/auth/analytics-id.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add src/auth/analytics-id.js tests/unit/auth/analytics-id.test.js
git commit -m "$(cat <<'EOF'
Add pseudonymous analytics ID helper

EOF
)"
```

---

### Task 2: Expose `analyticsId` From Auth Routes

**Files:**
- Modify: `src/auth/routes.js`
- Modify: `tests/unit/auth/routes.test.js`
- Modify: `tests/integration/auth/flow.test.js`

- [ ] **Step 1: Add failing route tests for register, login, and `/me`**

In `tests/unit/auth/routes.test.js`, import the environment helpers:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
```

Inside the existing `describe('auth routes', { concurrency: false }, () => { ... })`, add `originalAnalyticsSecret` state:

```js
  let originalAnalyticsSecret;

  beforeEach(() => {
    originalAnalyticsSecret = process.env.ANALYTICS_ID_SECRET;
    process.env.ANALYTICS_ID_SECRET = 'unit-test-analytics-secret';
    dataDir = join(tmpdir(), `koto-auth-routes-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dataDir, { recursive: true });
    usersFile = join(dataDir, '.jrpg-users.json');
  });

  afterEach(() => {
    if (originalAnalyticsSecret === undefined) {
      delete process.env.ANALYTICS_ID_SECRET;
    } else {
      process.env.ANALYTICS_ID_SECRET = originalAnalyticsSecret;
    }
    resetDataDirForTest();
    rmSync(dataDir, { recursive: true, force: true });
  });
```

Replace the existing `beforeEach`/`afterEach` bodies rather than adding duplicate hooks.

Add this test near the existing registration tests:

```js
  it('returns a pseudonymous analytics id on register, login, and me', async () => {
    const app = createApp({ dataDir, usersFile });

    const register = await request(app)
      .post('/api/auth/register')
      .field('username', 'analyticsuser')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    assert.match(register.body.user.analyticsId, /^ka_[a-f0-9]{32}$/);
    assert.equal(register.body.user.analyticsId.includes(register.body.user.id), false);
    assert.equal(register.body.user.analyticsId.includes('analyticsuser'), false);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'analyticsuser', password: 'pass123' })
      .expect(200);

    assert.equal(login.body.user.analyticsId, register.body.user.analyticsId);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .expect(200);

    assert.equal(me.body.analyticsId, register.body.user.analyticsId);
  });
```

Add this test to preserve fail-closed behavior:

```js
  it('omits analytics id when analytics secret is not configured', async () => {
    delete process.env.ANALYTICS_ID_SECRET;
    const app = createApp({ dataDir, usersFile });

    const register = await request(app)
      .post('/api/auth/register')
      .field('username', 'nosecret')
      .field('password', 'pass123')
      .field('aiDataSharingConsent', 'true')
      .expect(200);

    assert.equal(Object.hasOwn(register.body.user, 'analyticsId'), false);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)
      .expect(200);

    assert.equal(Object.hasOwn(me.body, 'analyticsId'), false);
  });
```

In `tests/integration/auth/flow.test.js`, add env setup:

```js
  let originalAnalyticsSecret;

  beforeEach(async () => {
    originalAnalyticsSecret = process.env.ANALYTICS_ID_SECRET;
    process.env.ANALYTICS_ID_SECRET = 'integration-test-analytics-secret';
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => {
    if (originalAnalyticsSecret === undefined) {
      delete process.env.ANALYTICS_ID_SECRET;
    } else {
      process.env.ANALYTICS_ID_SECRET = originalAnalyticsSecret;
    }
    cleanup();
  });
```

Update the existing assertions:

```js
    assert.match(res.body.user.analyticsId, /^ka_[a-f0-9]{32}$/);
    assert.equal(res.body.user.analyticsId.includes('newuser'), false);
```

and:

```js
    assert.match(res.body.user.analyticsId, /^ka_[a-f0-9]{32}$/);
```

and:

```js
    assert.match(meRes.body.analyticsId, /^ka_[a-f0-9]{32}$/);
```

- [ ] **Step 2: Run auth tests to verify failure**

Run:

```bash
node --test tests/unit/auth/routes.test.js tests/integration/auth/flow.test.js
```

Expected: tests fail because auth responses do not include `analyticsId`.

- [ ] **Step 3: Add a response helper in auth routes**

Modify `src/auth/routes.js` imports:

```js
import { getAnalyticsId } from './analytics-id.js';
```

Add helper near the top of the file:

```js
function publicUser(user) {
  const analyticsId = getAnalyticsId(user?.id);
  return {
    id: user.id,
    username: user.username,
    ...(analyticsId ? { analyticsId } : {})
  };
}
```

Replace auth response user objects:

```js
res.json({ token, user: publicUser(user) });
```

for both register and login.

In `me(req, res)`, replace:

```js
res.json({ id: user.id, username: user.username, apiKeys: apiKeysInfo });
```

with:

```js
res.json({ ...publicUser(user), apiKeys: apiKeysInfo });
```

For the explicit test/auth-bypass branch, keep no analytics ID unless a real user exists:

```js
return res.json({ id: req.user.id, username: req.user.username, apiKeys: {} });
```

- [ ] **Step 4: Run auth tests**

Run:

```bash
node --test tests/unit/auth/analytics-id.test.js tests/unit/auth/routes.test.js tests/integration/auth/flow.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add src/auth/analytics-id.js src/auth/routes.js tests/unit/auth/analytics-id.test.js tests/unit/auth/routes.test.js tests/integration/auth/flow.test.js
git commit -m "$(cat <<'EOF'
Expose pseudonymous analytics IDs from auth

EOF
)"
```

---

### Task 3: Add Analytics Core Helpers

**Files:**
- Create: `public/js/analytics-core.js`
- Create: `tests/unit/ui/analytics-core.test.js`

- [ ] **Step 1: Write failing tests for env gating, sanitization, context, and dedupe**

Create `tests/unit/ui/analytics-core.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_EVENTS,
  MILESTONE_ORDER,
  buildFirebaseConfig,
  isAnalyticsEnabled,
  sanitizeParams,
  createMilestoneStore,
  extractGameContext,
  nextFurthestStep
} from '../../../public/js/analytics-core.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); }
  };
}

describe('analytics core helpers', () => {
  let env;

  beforeEach(() => {
    env = {
      VITE_FIREBASE_ANALYTICS_ENABLED: 'true',
      VITE_FIREBASE_API_KEY: 'api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'koto-prod',
      VITE_FIREBASE_APP_ID: 'app-id',
      VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST'
    };
  });

  it('enables analytics only when flag and required Firebase config are present', () => {
    assert.equal(isAnalyticsEnabled(env), true);
    assert.deepEqual(buildFirebaseConfig(env), {
      apiKey: 'api-key',
      authDomain: 'example.firebaseapp.com',
      projectId: 'koto-prod',
      appId: 'app-id',
      measurementId: 'G-TEST'
    });

    assert.equal(isAnalyticsEnabled({ ...env, VITE_FIREBASE_ANALYTICS_ENABLED: 'false' }), false);
    assert.equal(isAnalyticsEnabled({ ...env, VITE_FIREBASE_API_KEY: '' }), false);
  });

  it('sanitizes params to approved primitive keys only', () => {
    assert.deepEqual(sanitizeParams({
      area_id: 'hajimari-no-hiroba',
      room_number: 1,
      is_boss: false,
      username: 'michia',
      dialogue: 'こんにちは',
      nested: { value: true },
      long_value: 'x'.repeat(120)
    }), {
      area_id: 'hajimari-no-hiroba',
      room_number: 1,
      is_boss: false
    });
  });

  it('dedupes milestones per analytics id', () => {
    const storage = createMemoryStorage();
    const store = createMilestoneStore(storage, 'ka_abc');

    assert.equal(store.has('koto_first_run_started'), false);
    store.mark('koto_first_run_started');
    assert.equal(store.has('koto_first_run_started'), true);

    const reloaded = createMilestoneStore(storage, 'ka_abc');
    assert.equal(reloaded.has('koto_first_run_started'), true);
  });

  it('extracts only safe game context fields', () => {
    const context = extractGameContext({
      phase: 'combat',
      run: {
        currentArea: { id: 'hajimari-no-hiroba', name: 'はじまりの広場' },
        currentRoom: 2,
        roomsExplored: 3,
        stats: { startTime: Date.now() - 5000 },
      },
      combat: {
        isBoss: true,
        turnCount: 4
      },
      meta: {
        tutorialStep: 2,
        lifetimeStats: { totalRuns: 1 },
        levels: { highestUnlocked: 3 }
      },
      player: { name: 'Hacker' }
    });

    assert.deepEqual(context, {
      phase: 'combat',
      area_id: 'hajimari-no-hiroba',
      room_number: 3,
      rooms_reached: 3,
      is_boss: true,
      turn_count: 4,
      tutorial_step: 2,
      run_number: 1,
      highest_area: 3
    });
  });

  it('keeps furthest step monotonic', () => {
    assert.equal(nextFurthestStep(null, 'first_run_started'), 'first_run_started');
    assert.equal(nextFurthestStep('first_combat_started', 'first_room_seen'), 'first_combat_started');
    assert.equal(nextFurthestStep('first_room_seen', 'first_combat_started'), 'first_combat_started');
    assert.ok(MILESTONE_ORDER.includes('first_run_ended'));
    assert.equal(ANALYTICS_EVENTS.firstRunStarted, 'koto_first_run_started');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js
```

Expected: fails because `analytics-core.js` does not exist.

- [ ] **Step 3: Implement pure analytics helpers**

Create `public/js/analytics-core.js`:

```js
export const ANALYTICS_EVENTS = Object.freeze({
  login: 'koto_login',
  signUp: 'koto_sign_up',
  playerCreated: 'koto_player_created',
  prologueStarted: 'koto_prologue_started',
  prologueCompleted: 'koto_prologue_completed',
  firstRunStarted: 'koto_first_run_started',
  areaSelected: 'koto_area_selected',
  partyConfirmed: 'koto_party_confirmed',
  firstRoomSeen: 'koto_first_room_seen',
  firstCombatStarted: 'koto_first_combat_started',
  firstCombatEnded: 'koto_first_combat_ended',
  firstRunEnded: 'koto_first_run_ended'
});

export const MILESTONE_ORDER = Object.freeze([
  'sign_up',
  'player_created',
  'prologue_started',
  'prologue_completed',
  'first_run_started',
  'area_selected',
  'party_confirmed',
  'first_room_seen',
  'first_combat_started',
  'first_combat_ended',
  'first_run_ended'
]);

const ALLOWED_PARAM_KEYS = new Set([
  'method',
  'area_id',
  'party_size',
  'room_number',
  'rooms_reached',
  'duration_sec',
  'is_boss',
  'outcome',
  'turn_count',
  'phase',
  'tutorial_step',
  'run_number',
  'highest_area',
  'platform'
]);

const REQUIRED_FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID'
];

export function isAnalyticsEnabled(env = {}) {
  if (env.VITE_FIREBASE_ANALYTICS_ENABLED !== 'true') return false;
  return REQUIRED_FIREBASE_KEYS.every(key => typeof env[key] === 'string' && env[key].length > 0);
}

export function buildFirebaseConfig(env = {}) {
  if (!isAnalyticsEnabled(env)) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
  };
}

export function sanitizeParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!ALLOWED_PARAM_KEYS.has(key)) continue;
    if (typeof value === 'string' && value.length <= 80) out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export function createMilestoneStore(storage, analyticsId) {
  const key = analyticsId ? `koto_analytics_milestones:${analyticsId}` : 'koto_analytics_milestones:anonymous';

  function read() {
    try {
      const raw = storage?.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function write(set) {
    try {
      storage?.setItem(key, JSON.stringify([...set]));
    } catch {
      // Analytics storage must never break gameplay.
    }
  }

  return {
    has(eventName) {
      return read().has(eventName);
    },
    mark(eventName) {
      const set = read();
      set.add(eventName);
      write(set);
    }
  };
}

export function extractGameContext(state = {}) {
  const run = state.run || {};
  const combat = state.combat || {};
  const meta = state.meta || {};
  const areaId = run.currentArea?.id || run.areaId || null;
  const roomNumber = Number.isFinite(run.currentRoom) ? run.currentRoom + 1 : null;

  return sanitizeParams({
    phase: state.phase,
    area_id: areaId,
    room_number: roomNumber,
    rooms_reached: run.roomsExplored,
    is_boss: combat.isBoss === true,
    turn_count: combat.turnCount,
    tutorial_step: meta.tutorialStep,
    run_number: meta.lifetimeStats?.totalRuns,
    highest_area: meta.levels?.highestUnlocked
  });
}

export function nextFurthestStep(currentStep, candidateStep) {
  const currentIdx = MILESTONE_ORDER.indexOf(currentStep);
  const candidateIdx = MILESTONE_ORDER.indexOf(candidateStep);
  if (candidateIdx < 0) return currentStep || null;
  if (currentIdx < 0 || candidateIdx > currentIdx) return candidateStep;
  return currentStep;
}
```

- [ ] **Step 4: Run core helper test**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add public/js/analytics-core.js tests/unit/ui/analytics-core.test.js
git commit -m "$(cat <<'EOF'
Add analytics core helpers

EOF
)"
```

---

### Task 4: Add Firebase Analytics Facade

**Files:**
- Create: `public/js/analytics.js`
- Create: `tests/unit/ui/analytics-facade.test.js`
- Modify: `package.json`
- Modify: `package-lock.json` if present

- [ ] **Step 1: Add dependencies**

Run:

```bash
npm install firebase @capacitor-firebase/analytics @capacitor-firebase/crashlytics
```

Expected: dependencies are added to `package.json` and the lockfile.

- [ ] **Step 2: Write failing facade tests with fake transports**

Create `tests/unit/ui/analytics-facade.test.js`:

```js
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnalyticsClient
} from '../../../public/js/analytics.js';

function env(enabled = true) {
  return enabled ? {
    VITE_FIREBASE_ANALYTICS_ENABLED: 'true',
    VITE_FIREBASE_API_KEY: 'api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'koto-prod',
    VITE_FIREBASE_APP_ID: 'app-id',
    VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST'
  } : {
    VITE_FIREBASE_ANALYTICS_ENABLED: 'false'
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => { map.set(key, String(value)); }
  };
}

describe('analytics facade', () => {
  let transport;

  beforeEach(() => {
    transport = {
      init: mock.fn(async () => {}),
      setUserId: mock.fn(async () => {}),
      setUserProperty: mock.fn(async () => {}),
      logEvent: mock.fn(async () => {}),
      setCrashKey: mock.fn(async () => {}),
      recordException: mock.fn(async () => {})
    };
  });

  it('no-ops when analytics env gate is disabled', async () => {
    const client = createAnalyticsClient({
      env: env(false),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.trackEvent('koto_login', { method: 'password' });

    assert.equal(transport.init.mock.callCount(), 0);
    assert.equal(transport.logEvent.mock.callCount(), 0);
  });

  it('sets user id and safe user properties when configured', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.setAnalyticsUser({ analyticsId: 'ka_abc123' });

    assert.equal(transport.setUserId.mock.callCount(), 1);
    assert.deepEqual(transport.setUserId.mock.calls[0].arguments, ['ka_abc123']);
    assert.equal(transport.setUserProperty.mock.callCount() >= 1, true);
  });

  it('sanitizes event params before logging', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.trackEvent('koto_area_selected', {
      area_id: 'hajimari-no-hiroba',
      username: 'do-not-send'
    });

    assert.deepEqual(transport.logEvent.mock.calls[0].arguments, [
      'koto_area_selected',
      { area_id: 'hajimari-no-hiroba' }
    ]);
  });

  it('logs a milestone only once for the same analytics id', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.setAnalyticsUser({ analyticsId: 'ka_abc123' });
    await client.trackMilestone('koto_first_run_started');
    await client.trackMilestone('koto_first_run_started');

    assert.equal(transport.logEvent.mock.callCount(), 1);
  });

  it('records non-fatal errors without throwing', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: true },
      transportFactory: async () => transport
    });

    await client.init();
    await client.recordNonFatal(new Error('Boom'), { phase: 'combat', dialogue: 'こんにちは' });

    assert.equal(transport.recordException.mock.callCount(), 1);
    assert.equal(transport.setCrashKey.mock.callCount() >= 1, true);
  });
});
```

- [ ] **Step 3: Run facade test to verify failure**

Run:

```bash
node --test tests/unit/ui/analytics-facade.test.js
```

Expected: fails because `analytics.js` does not exist.

- [ ] **Step 4: Implement facade with injectable transports**

Create `public/js/analytics.js`:

```js
import { PLATFORM } from './platform.js';
import {
  buildFirebaseConfig,
  extractGameContext,
  sanitizeParams,
  createMilestoneStore,
  nextFurthestStep
} from './analytics-core.js';

function getDefaultEnv() {
  return typeof import.meta !== 'undefined' ? import.meta.env || {} : {};
}

async function createWebTransport(config) {
  const [{ initializeApp }, { getAnalytics, logEvent, setUserId, setUserProperties }] = await Promise.all([
    import('firebase/app'),
    import('firebase/analytics')
  ]);
  const app = initializeApp(config);
  const analytics = getAnalytics(app);
  return {
    init: async () => {},
    logEvent: async (name, params) => logEvent(analytics, name, params),
    setUserId: async (userId) => setUserId(analytics, userId),
    setUserProperty: async (key, value) => setUserProperties(analytics, { [key]: value }),
    setCrashKey: async () => {},
    recordException: async () => {}
  };
}

async function createNativeTransport(config) {
  const [{ FirebaseAnalytics }, { FirebaseCrashlytics }] = await Promise.all([
    import('@capacitor-firebase/analytics'),
    import('@capacitor-firebase/crashlytics').catch(() => ({ FirebaseCrashlytics: null }))
  ]);
  return {
    init: async () => {},
    logEvent: async (name, params) => FirebaseAnalytics.logEvent({ name, params }),
    setUserId: async (userId) => FirebaseAnalytics.setUserId({ userId }),
    setUserProperty: async (key, value) => FirebaseAnalytics.setUserProperty({ key, value }),
    setCrashKey: async (key, value) => FirebaseCrashlytics?.setCustomKey?.({ key, value }),
    recordException: async (error, context) => FirebaseCrashlytics?.recordException?.({
      message: error?.message || String(error),
      stacktrace: error?.stack || '',
      keys: context || {}
    })
  };
}

export function createAnalyticsClient({
  env = getDefaultEnv(),
  platform = PLATFORM,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  transportFactory = null
} = {}) {
  const config = buildFirebaseConfig(env);
  let transport = null;
  let analyticsId = null;
  let milestoneStore = null;
  let initialized = false;
  let furthestStep = null;

  async function ensureTransport() {
    if (!config) return null;
    if (transport) return transport;
    const factory = transportFactory || (platform.isNative ? createNativeTransport : createWebTransport);
    try {
      transport = await factory(config, { platform });
      await transport.init?.();
      return transport;
    } catch (err) {
      console.warn('[Analytics] init failed:', err?.message || err);
      transport = null;
      return null;
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await ensureTransport();
  }

  async function setAnalyticsUser(user = {}) {
    analyticsId = user.analyticsId || null;
    milestoneStore = createMilestoneStore(storage, analyticsId);
    const t = await ensureTransport();
    if (!t || !analyticsId) return;
    await t.setUserId?.(analyticsId);
    await t.setUserProperty?.('koto_platform', platform.isNative ? 'native' : 'web');
  }

  async function setUserProperty(key, value) {
    if (value === null || value === undefined) return;
    const t = await ensureTransport();
    if (!t) return;
    await t.setUserProperty?.(key, String(value));
  }

  async function trackEvent(name, params = {}) {
    const t = await ensureTransport();
    if (!t) return;
    await t.logEvent?.(name, sanitizeParams(params));
  }

  async function trackMilestone(name, params = {}, step = null) {
    if (!milestoneStore) milestoneStore = createMilestoneStore(storage, analyticsId);
    if (milestoneStore.has(name)) return;
    await trackEvent(name, params);
    milestoneStore.mark(name);
    if (step) {
      furthestStep = nextFurthestStep(furthestStep, step);
      if (furthestStep) await setUserProperty('koto_furthest_step', furthestStep);
    }
  }

  async function setCrashContext(stateOrContext = {}) {
    const context = stateOrContext.run || stateOrContext.combat || stateOrContext.meta
      ? extractGameContext(stateOrContext)
      : sanitizeParams(stateOrContext);
    const t = await ensureTransport();
    if (!t) return;
    for (const [key, value] of Object.entries(context)) {
      await t.setCrashKey?.(key, String(value));
    }
  }

  async function updateCurrentUserProperties(state = {}) {
    const context = extractGameContext(state);
    await setUserProperty('koto_tutorial_step', context.tutorial_step);
    await setUserProperty('koto_highest_area', context.highest_area);
  }

  async function recordNonFatal(error, context = {}) {
    const t = await ensureTransport();
    if (!t) return;
    const safeContext = sanitizeParams(context);
    for (const [key, value] of Object.entries(safeContext)) {
      await t.setCrashKey?.(key, String(value));
    }
    await t.recordException?.(error, safeContext);
  }

  return {
    init,
    setAnalyticsUser,
    setUserProperty,
    updateCurrentUserProperties,
    trackEvent,
    trackMilestone,
    setCrashContext,
    recordNonFatal
  };
}

export const analytics = createAnalyticsClient();
export const initAnalytics = (...args) => analytics.init(...args);
export const setAnalyticsUser = (...args) => analytics.setAnalyticsUser(...args);
export const updateCurrentUserProperties = (...args) => analytics.updateCurrentUserProperties(...args);
export const trackEvent = (...args) => analytics.trackEvent(...args);
export const trackMilestone = (...args) => analytics.trackMilestone(...args);
export const setCrashContext = (...args) => analytics.setCrashContext(...args);
export const recordNonFatal = (...args) => analytics.recordNonFatal(...args);
```

If Capawesome Crashlytics method names differ after installing the package, adjust only the native transport and keep the facade API unchanged.

- [ ] **Step 5: Run facade and syntax tests**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js
node --check public/js/analytics-core.js && node --check public/js/analytics.js
```

Expected: all tests pass and syntax checks print no errors.

- [ ] **Step 6: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add package.json package-lock.json public/js/analytics-core.js public/js/analytics.js tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js
git commit -m "$(cat <<'EOF'
Add Firebase analytics facade

EOF
)"
```

---

### Task 5: Wire Auth and App Initialization

**Files:**
- Modify: `public/js/ui/auth.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/analytics-facade.test.js`

- [ ] **Step 1: Add auth-event tests at facade level**

Append to `tests/unit/ui/analytics-facade.test.js`:

```js
  it('logs auth events through the sanitized event path', async () => {
    const client = createAnalyticsClient({
      env: env(true),
      storage: memoryStorage(),
      platform: { isNative: false },
      transportFactory: async () => transport
    });

    await client.init();
    await client.trackEvent('koto_login', { method: 'password', username: 'nope' });
    await client.trackEvent('koto_sign_up', { method: 'password', username: 'nope' });

    assert.deepEqual(transport.logEvent.mock.calls[0].arguments, [
      'koto_login',
      { method: 'password' }
    ]);
    assert.deepEqual(transport.logEvent.mock.calls[1].arguments, [
      'koto_sign_up',
      { method: 'password' }
    ]);
  });
```

- [ ] **Step 2: Run facade test**

Run:

```bash
node --test tests/unit/ui/analytics-facade.test.js
```

Expected: passes after Task 4; this confirms auth event names can be logged safely.

- [ ] **Step 3: Initialize analytics in `public/game.js`**

Add import near existing imports:

```js
import {
  initAnalytics,
  setAnalyticsUser,
  updateCurrentUserProperties,
  setCrashContext,
  trackMilestone
} from './js/analytics.js';
```

In `DOMContentLoaded`, immediately after `await initNative();`, add:

```js
  await initAnalytics();
```

Change auth init callback:

```js
  auth.init({
    onAuthenticated: async (user) => {
      await setAnalyticsUser(user);
      await initGame();
    }
  });
```

After `const isAuth = await auth.checkAuth();`, if authenticated, fetch `/api/auth/me` through existing auth flow. The smallest implementation is to let `initGame()` set identity after `settings.loadServerSettings()` or add a `getCurrentUser` helper in `auth.js`:

```js
export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(apiUrl('/api/auth/me'), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}
```

Then in `initGame()`, before `await loadKnownWords();`, add:

```js
  const currentUser = await auth.getCurrentUser();
  if (currentUser) await setAnalyticsUser(currentUser);
```

- [ ] **Step 4: Log auth events in `public/js/ui/auth.js`**

Add import:

```js
import { setAnalyticsUser, trackEvent } from '../analytics.js';
```

After successful auth response and before `callbacks.onAuthenticated`, add:

```js
    await setAnalyticsUser(data.user);
    await trackEvent(currentTab === 'login' ? 'koto_login' : 'koto_sign_up', {
      method: 'password'
    });
```

Do not store username in localStorage as part of this task.

- [ ] **Step 5: Keep current user properties and crash context fresh**

In `updateGameState(newState)` in `public/game.js`, after `store.set('gameState', gameState);`, add:

```js
  setCrashContext(gameState);
  updateCurrentUserProperties(gameState);
```

These calls intentionally are not awaited so UI rendering is never blocked by analytics.

- [ ] **Step 6: Run syntax and selected tests**

Run:

```bash
node --test tests/unit/ui/analytics-facade.test.js
node --check public/js/ui/auth.js && node --check public/game.js
```

Expected: selected tests pass and syntax checks print no errors.

- [ ] **Step 7: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add public/game.js public/js/ui/auth.js tests/unit/ui/analytics-facade.test.js
git commit -m "$(cat <<'EOF'
Wire analytics identity into auth startup

EOF
)"
```

---

### Task 6: Track Onboarding and First-Run Milestones

**Files:**
- Modify: `public/game.js`
- Modify: `public/js/diagnostics.js`
- Modify: `tests/unit/ui/analytics-core.test.js`

- [ ] **Step 1: Add a context test for duration seconds**

Extend `tests/unit/ui/analytics-core.test.js` with a duration-specific test if `extractGameContext` is extended, or add a pure helper `extractRunEndContext(state, outcome)`:

```js
import { extractRunEndContext } from '../../../public/js/analytics-core.js';
```

Test:

```js
  it('extracts safe run-end context with duration seconds', () => {
    const startedAt = Date.now() - 12_500;
    assert.deepEqual(extractRunEndContext({
      run: {
        currentArea: { id: 'hajimari-no-hiroba' },
        roomsExplored: 4,
        stats: { startTime: startedAt, endTime: startedAt + 12_500 }
      }
    }, 'victory'), {
      outcome: 'victory',
      area_id: 'hajimari-no-hiroba',
      rooms_reached: 4,
      duration_sec: 13
    });
  });
```

- [ ] **Step 2: Run core test to verify failure**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js
```

Expected: fails until `extractRunEndContext` exists.

- [ ] **Step 3: Add run-end context helper**

In `public/js/analytics-core.js`, add:

```js
export function extractRunEndContext(state = {}, outcome = 'unknown') {
  const run = state.run || {};
  const startedAt = run.stats?.startTime;
  const endedAt = run.stats?.endTime || Date.now();
  const durationSec = Number.isFinite(startedAt)
    ? Math.max(0, Math.round((endedAt - startedAt) / 1000))
    : null;

  return sanitizeParams({
    outcome,
    area_id: run.currentArea?.id || run.areaId,
    rooms_reached: run.roomsExplored,
    duration_sec: durationSec
  });
}
```

- [ ] **Step 4: Track onboarding milestones in `public/game.js`**

Add import:

```js
import { extractGameContext, extractRunEndContext } from './js/analytics-core.js';
```

In `createCharacter()`, before and after prologue:

```js
    await trackMilestone('koto_player_created', extractGameContext(result.state), 'player_created');
    updateGameState(result.state);
    await trackMilestone('koto_prologue_started', extractGameContext(gameState), 'prologue_started');
    await playPrologue();
    await trackMilestone('koto_prologue_completed', extractGameContext(gameState), 'prologue_completed');
```

Keep `updateUI();` after prologue as it is now.

In `playPrologue()`, after first-run auto-start and each successful state update:

```js
    if (runResult?.state) {
      updateGameState(runResult.state);
      await trackMilestone('koto_first_run_started', extractGameContext(runResult.state), 'first_run_started');
    }
    if (areaResult?.state) {
      updateGameState(areaResult.state);
      await trackMilestone('koto_area_selected', extractGameContext(areaResult.state), 'area_selected');
    }
    if (confirmResult?.state) {
      updateGameState(confirmResult.state);
      await trackMilestone('koto_party_confirmed', {
        ...extractGameContext(confirmResult.state),
        party_size: confirmResult.state.run?.creatureParty?.active?.length || 0
      }, 'party_confirmed');
    }
```

In `startNewRun()`, after successful state update:

```js
    await trackMilestone('koto_first_run_started', extractGameContext(result.state), 'first_run_started');
```

In `triggerCreatureSelect()`, after `apiConfirmCreatures` state update:

```js
    await trackMilestone('koto_party_confirmed', {
      ...extractGameContext(result.state),
      party_size: starterIds.length
    }, 'party_confirmed');
```

Where area selection succeeds in `public/game.js` or `public/js/ui/exploration.js`, log:

```js
await trackMilestone('koto_area_selected', extractGameContext(result.state), 'area_selected');
```

- [ ] **Step 5: Track first room and first combat from phase changes**

In `public/js/diagnostics.js`, add import:

```js
import { extractGameContext } from './analytics-core.js';
import { setCrashContext, trackMilestone, recordNonFatal } from './analytics.js';
```

In the `store.subscribe` callback, after `logAction('phase_change', ...)`:

```js
      const context = extractGameContext(state.gameState || {});
      setCrashContext(context);
      if (phase === 'room') {
        trackMilestone('koto_first_room_seen', context, 'first_room_seen');
      }
      if (phase === 'combat') {
        trackMilestone('koto_first_combat_started', context, 'first_combat_started');
      }
```

Because the facade dedupes milestones, this can safely run on repeated phase changes.

- [ ] **Step 6: Forward non-fatal browser errors to native Crashlytics**

In `initConsoleCapture()`, inside `console.error` after the buffer push, add:

```js
      const firstError = args.find(arg => arg instanceof Error);
      if (firstError) {
        recordNonFatal(firstError, extractGameContext(store.get('gameState') || {}));
      }
```

In `init()` after existing init calls, add global handlers once:

```js
  window.addEventListener('error', (event) => {
    recordNonFatal(event.error || new Error(event.message || 'window.error'), extractGameContext(store.get('gameState') || {}));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'unhandled rejection'));
    recordNonFatal(reason, extractGameContext(store.get('gameState') || {}));
  });
```

The facade no-ops outside configured Firebase/native support.

- [ ] **Step 7: Run core and syntax checks**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js
node --check public/js/analytics-core.js && node --check public/game.js && node --check public/js/diagnostics.js
```

Expected: all selected tests pass and syntax checks print no errors.

- [ ] **Step 8: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add public/game.js public/js/diagnostics.js public/js/analytics-core.js tests/unit/ui/analytics-core.test.js
git commit -m "$(cat <<'EOF'
Track onboarding and first-run analytics milestones

EOF
)"
```

---

### Task 7: Track First Combat End and First Run End

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/analytics-core.test.js`

- [ ] **Step 1: Add outcome normalization helper tests**

In `tests/unit/ui/analytics-core.test.js`, import and test `normalizeCombatOutcome`:

```js
import { normalizeCombatOutcome } from '../../../public/js/analytics-core.js';
```

Add:

```js
  it('normalizes combat outcomes from server result shape', () => {
    assert.equal(normalizeCombatOutcome({ victory: true, befriend: { success: true } }), 'befriend');
    assert.equal(normalizeCombatOutcome({ victory: true }), 'victory');
    assert.equal(normalizeCombatOutcome({ victory: false, combatEnded: true }), 'defeat');
    assert.equal(normalizeCombatOutcome({}), 'unknown');
  });
```

- [ ] **Step 2: Run core test to verify failure**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js
```

Expected: fails until `normalizeCombatOutcome` exists.

- [ ] **Step 3: Implement outcome helper**

In `public/js/analytics-core.js`, add:

```js
export function normalizeCombatOutcome(result = {}) {
  if (result.befriend?.success === true) return 'befriend';
  if (result.victory === true) return 'victory';
  if (result.combatEnded === true && result.victory === false) return 'defeat';
  return 'unknown';
}
```

- [ ] **Step 4: Wire combat end in `public/js/ui/combat-loop.js`**

Add imports:

```js
import { trackMilestone } from '../analytics.js';
import { extractGameContext, normalizeCombatOutcome } from '../analytics-core.js';
```

Where combat-ended server results are handled, just before or after `stopCombatLoop(result)` is called, add:

```js
await trackMilestone('koto_first_combat_ended', {
  ...extractGameContext(getGameState()),
  outcome: normalizeCombatOutcome(result),
  turn_count: result.turnCount || getGameState()?.combat?.turnCount
}, 'first_combat_ended');
```

If the existing function is not async at the exact call site, call without awaiting:

```js
trackMilestone('koto_first_combat_ended', {
  ...extractGameContext(getGameState()),
  outcome: normalizeCombatOutcome(result),
  turn_count: result.turnCount || getGameState()?.combat?.turnCount
}, 'first_combat_ended');
```

Do not block combat UI or victory/defeat transitions on analytics.

- [ ] **Step 5: Wire run end in `public/game.js`**

In `returnToHub()`, capture current state before `apiForfeitRun()`:

```js
  const endingState = gameState;
  const response = await apiForfeitRun();
  await trackMilestone('koto_first_run_ended', extractRunEndContext({
    ...endingState,
    run: {
      ...(endingState.run || {}),
      stats: {
        ...(endingState.run?.stats || {}),
        endTime: Date.now()
      }
    }
  }, 'forfeit'), 'first_run_ended');
```

In `showAdventureReport(isVictory)`, after:

```js
  const summary = response?.runSummary || {};
```

add:

```js
  await trackMilestone('koto_first_run_ended', {
    outcome: isVictory ? 'victory' : 'defeat',
    area_id: gameState.run?.currentArea?.id,
    rooms_reached: summary.roomsReached || summary.roomsExplored || gameState.run?.roomsExplored,
    duration_sec: Math.round((summary.durationMs || 0) / 1000)
  }, 'first_run_ended');
```

If `summary` uses different property names, prefer the already available `gameState.run` values and the run stats start/end times.

- [ ] **Step 6: Run selected checks**

Run:

```bash
node --test tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js
node --check public/js/ui/combat-loop.js && node --check public/game.js
```

Expected: all selected tests pass and syntax checks print no errors.

- [ ] **Step 7: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add public/js/analytics-core.js public/js/ui/combat-loop.js public/game.js tests/unit/ui/analytics-core.test.js
git commit -m "$(cat <<'EOF'
Track first combat and run completion analytics

EOF
)"
```

---

### Task 8: Update Privacy Policy and Configuration Documentation

**Files:**
- Modify: `public/privacy.html`
- Modify: `.env.example` if it exists
- Modify: `docs/superpowers/specs/2026-05-13-firebase-analytics-crashlytics-design.md` only if implementation reveals a design correction

- [ ] **Step 1: Check for existing env example files**

Run:

```bash
rg -n "VITE_|FIREBASE|ANALYTICS_ID_SECRET" .env* docs README.md
```

Expected: either no matches or existing env docs to update.

- [ ] **Step 2: Update privacy copy**

In `public/privacy.html`, replace the “Data We Collect” and “Third-Party AI And Learning Services” body with copy equivalent to:

```html
<h2>Data We Collect</h2>
<p>Koto stores your username, password hash, game progress, creature collection, learning progress, known words, review history, and settings.</p>
<p>Koto also collects minimal pseudonymous analytics events to understand app usage, retention, onboarding progress, and crash diagnostics. These analytics events do not include usernames, dialogue text, vocabulary content, screenshots, or bug report notes.</p>
<p>If you submit a bug report, Koto may collect your note, screenshot, account identifier, device/browser details, game state, and recent server diagnostics needed to investigate the issue.</p>

<h2>Third-Party AI, Analytics, And Learning Services</h2>
<p>When AI features are enabled, Koto may send gameplay text, vocabulary context, dialogue requests, and related learning context to the AI provider configured for the service.</p>
<p>Koto uses Firebase/Google Analytics and Crashlytics as service providers for pseudonymous usage analytics, retention reporting, and crash diagnostics.</p>
<p>Koto does not sell your personal data or use it for third-party advertising.</p>
```

Update “Retention And Deletion” with:

```html
<p>You can delete your account inside Koto from Settings. Deletion removes your login, saved progress, learning data, settings, and bug reports associated with your account, unless we are legally required to retain specific records. Pseudonymous Firebase analytics and crash diagnostic data follows Firebase/Google retention and deletion processes.</p>
```

- [ ] **Step 3: Add env docs if an env example exists**

If `.env.example` or similar exists, add:

```bash
VITE_FIREBASE_ANALYTICS_ENABLED=false
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
ANALYTICS_ID_SECRET=
```

If no env example exists, do not create one unless the user asks.

- [ ] **Step 4: Run syntax/static checks**

Run:

```bash
node --check public/js/analytics.js && node --check public/js/analytics-core.js
```

Expected: syntax checks print no errors.

- [ ] **Step 5: Commit checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add public/privacy.html .env.example
git commit -m "$(cat <<'EOF'
Document analytics and crash diagnostics privacy

EOF
)"
```

If `.env.example` does not exist, omit it from `git add`.

---

### Task 9: Native Firebase Setup and Build Guardrails

**Files:**
- Modify: `capacitor.config.ts` only if plugin config is required after installing packages
- Modify: `ios/` and `android/` only after Firebase files are provided and approved
- No tests required beyond build/sync checks

- [ ] **Step 1: Sync Capacitor after dependency install**

Run:

```bash
npx cap sync
```

Expected: Capacitor updates native plugin state without errors.

- [ ] **Step 2: Confirm native service files policy**

Before adding either file, ask the user to provide and approve:

- `ios/App/App/GoogleService-Info.plist`
- `android/app/google-services.json`

Do not create placeholder service files.

- [ ] **Step 3: If files are approved, add them to the native projects**

Add the user-provided Firebase files to the exact native paths expected by Firebase/Capacitor. Do not invent contents. After adding them, run:

```bash
npx cap sync ios
npx cap sync android
```

Expected: sync completes without plugin errors.

- [ ] **Step 4: Verify build metadata does not enable analytics outside prod env**

Confirm the web app still gates analytics on:

```js
VITE_FIREBASE_ANALYTICS_ENABLED === 'true'
```

and required Firebase config. No hostname allowlist is added.

- [ ] **Step 5: Commit checkpoint if explicitly requested**

Only if the user requested commits and approved the native files:

```bash
git add package.json package-lock.json capacitor.config.ts ios android
git commit -m "$(cat <<'EOF'
Add native Firebase plugin setup

EOF
)"
```

If native files were not provided, commit only dependency and config changes if requested:

```bash
git add package.json package-lock.json capacitor.config.ts
git commit -m "$(cat <<'EOF'
Add Firebase Capacitor dependencies

EOF
)"
```

---

### Task 10: Final Verification

**Files:**
- All files changed by Tasks 1-9

- [ ] **Step 1: Run focused unit and integration tests**

Run:

```bash
node --test tests/unit/auth/analytics-id.test.js tests/unit/auth/routes.test.js tests/integration/auth/flow.test.js
node --test tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js
```

Expected: all selected tests pass.

- [ ] **Step 2: Run JavaScript syntax checks**

Run:

```bash
node --check public/js/analytics-core.js && node --check public/js/analytics.js && node --check public/js/ui/auth.js && node --check public/js/diagnostics.js && node --check public/js/ui/combat-loop.js && node --check public/game.js
```

Expected: no syntax errors.

- [ ] **Step 3: Run the standard test gate**

Run:

```bash
npm test
```

Expected: unit and integration tests pass.

- [ ] **Step 4: Run a no-config browser smoke check**

Start dev server:

```bash
npm run dev
```

After it starts, verify:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

Open the app only if the user approves browser playtesting. With no Firebase env vars, confirm there are no analytics initialization errors in the browser console and the app still reaches the auth screen.

- [ ] **Step 5: Firebase DebugView manual verification**

In a Firebase dev/prod project with Railway production env vars set:

1. Deploy to the target Railway environment.
2. Create or log into a test account.
3. Complete enough flow to reach first combat.
4. Check Firebase DebugView or Realtime events for:
   - `koto_login` or `koto_sign_up`
   - `koto_player_created`
   - `koto_prologue_started`
   - `koto_prologue_completed`
   - `koto_first_run_started`
   - `koto_area_selected`
   - `koto_party_confirmed`
   - `koto_first_room_seen`
   - `koto_first_combat_started`
5. Confirm no event params include username, Japanese text, dialogue, screenshots, notes, or raw user IDs.

- [ ] **Step 6: Native Crashlytics manual verification**

Only after native Firebase files are approved and present:

1. Build a native dev/release test app pointing at production Railway or a Firebase-enabled staging equivalent.
2. Trigger a controlled JS non-fatal using a temporary dev-only console call or a short local patch that calls `recordNonFatal(new Error('Crashlytics test'), { phase: 'hub' })`.
3. Confirm Crashlytics receives the non-fatal with sanitized keys:
   - `phase`
   - `platform`
   - `tutorial_step` if available
4. Remove any temporary test trigger before finishing.

- [ ] **Step 7: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional source, test, dependency, and docs files are changed.

- [ ] **Step 8: Commit final checkpoint if explicitly requested**

Only if the user requested commits:

```bash
git add package.json package-lock.json src/auth/analytics-id.js src/auth/routes.js public/js/analytics-core.js public/js/analytics.js public/js/ui/auth.js public/js/diagnostics.js public/js/ui/combat-loop.js public/game.js public/privacy.html tests/unit/auth/analytics-id.test.js tests/unit/auth/routes.test.js tests/integration/auth/flow.test.js tests/unit/ui/analytics-core.test.js tests/unit/ui/analytics-facade.test.js docs/superpowers/specs/2026-05-13-firebase-analytics-crashlytics-design.md docs/superpowers/plans/2026-05-13-firebase-analytics-crashlytics-plan.md
git commit -m "$(cat <<'EOF'
Add Firebase analytics and Crashlytics MVP

EOF
)"
```

If native Firebase files were approved and added, include those exact native files in `git add`.

---

## Self-Review

Spec coverage:

- Pseudonymous identity is implemented by Tasks 1-2.
- Env-only production gating is implemented by Tasks 3-4 and verified in Tasks 9-10.
- Funnel MVP events are implemented by Tasks 5-7.
- Crash context and JS non-fatal forwarding are implemented by Tasks 4, 6, and 9.
- Privacy disclosure is implemented by Task 8.
- No historical backfill is preserved by dedupe/current-property-only rollout behavior in Tasks 3, 5, and 6.

Known execution notes:

- Capawesome Crashlytics method names should be verified after dependency install. Keep any plugin-specific adjustment inside `public/js/analytics.js`.
- Do not add native Firebase service files unless the user provides and approves them.
- Do not commit unless the user explicitly requests commits.
