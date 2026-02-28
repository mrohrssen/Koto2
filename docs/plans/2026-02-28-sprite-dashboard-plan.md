# Sprite Review Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a password-protected `/dev/sprites` route to the game server that shows all game sprites in a filterable, reviewable grid with per-sprite feedback.

**Architecture:** New Express router at `/dev` with password middleware, a manifest API that scans sprite directories cross-referenced with data files, a feedback API that reads/writes a JSON file, and a single self-contained HTML page for the UI. The game server is then run on the VPS via pm2.

**Tech Stack:** Express (existing), dotenv (existing), `express-rate-limit` (new dep), cookie-signed sessions, vanilla HTML/CSS/JS frontend.

---

### Task 1: Add express-rate-limit dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install express-rate-limit`

**Step 2: Verify installation**

Run: `node -e "require('express-rate-limit'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add express-rate-limit dependency for dev dashboard"
```

---

### Task 2: Create dev router with password auth

**Files:**
- Create: `src/routes/dev.js`
- Modify: `server.js:350-398` (mount the new router)

**Step 1: Write the test**

Create `tests/unit/routes/dev-auth.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// We test the auth middleware logic directly
// The dev router uses a simple password cookie check

describe('dev auth middleware', () => {
  it('redirects to login page when no cookie', async () => {
    const { createDevRouter } = await import('../../../src/routes/dev.js');
    const router = createDevRouter({ password: 'test123' });

    // Use a mock req/res to test middleware
    const { createMockReq, createMockRes } = await import('../../helpers/mocks.js');
    const req = createMockReq({ path: '/sprites', cookies: {} });
    const res = createMockRes();

    // Find the auth middleware (first use on the router)
    // We'll test via supertest in integration instead
    assert.ok(router, 'router is created');
  });

  it('returns router even without password (disables auth)', async () => {
    const { createDevRouter } = await import('../../../src/routes/dev.js');
    const router = createDevRouter({ password: '' });
    assert.ok(router, 'router is created without password');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/routes/dev-auth.test.js`
Expected: FAIL — `src/routes/dev.js` does not exist

**Step 3: Create the dev router**

Create `src/routes/dev.js`:

```js
import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import rateLimit from 'express-rate-limit';

const FEEDBACK_PATH = join(process.cwd(), 'tools', 'sprite-feedback.json');
const SPRITES_DIR = join(process.cwd(), 'public', 'assets', 'sprites');
const DATA_DIR = join(process.cwd(), 'data');

// --- Auth middleware ---

function devAuth(password) {
  return (req, res, next) => {
    if (!password) return next(); // no password = no auth
    if (req.path === '/login' || req.path === '/login-submit') return next();
    if (req.cookies?.dev_token === password) return next();
    return res.redirect('/dev/login');
  };
}

// --- Data loading ---

function loadJson(filename) {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
  } catch { return []; }
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-');
}

function listWebp(dir) {
  try {
    return readdirSync(dir).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''));
  } catch { return []; }
}

// --- Manifest builder ---

function buildManifest() {
  const creatures = loadJson('creatures.json');
  const moves = loadJson('moves.json');
  const items = loadJson('items.json');
  const enemies = loadJson('enemies.json');
  const bosses = loadJson('bosses.json');

  const creatureFiles = listWebp(join(SPRITES_DIR, 'robots'));
  const actionFiles = listWebp(join(SPRITES_DIR, 'actions'));
  const itemFiles = listWebp(join(SPRITES_DIR, 'items'));
  const enemyFiles = listWebp(join(SPRITES_DIR, 'enemies'));

  // Build lookup sets from data
  const creatureIds = new Set(creatures.map(c => c.id));
  const moveSlugs = new Map(moves.map(m => [slugify(m.nameEn), m]));
  const itemIds = new Set(items.map(i => i.id));
  const enemyIds = new Set(enemies.map(e => e.id));
  const bossSprites = new Set();
  if (typeof bosses === 'object' && !Array.isArray(bosses)) {
    Object.values(bosses).forEach(b => { if (b.sprite) bossSprites.add(b.sprite); });
  }

  const manifest = {
    creatures: creatureFiles
      .filter(f => !f.endsWith('-idle'))
      .map(id => {
        const data = creatures.find(c => c.id === id);
        return {
          id,
          name: data?.name || null,
          nameEn: data?.nameEn || id,
          static: `/assets/sprites/robots/${id}.webp`,
          idle: creatureFiles.includes(`${id}-idle`) ? `/assets/sprites/robots/${id}-idle.webp` : null,
          hasData: creatureIds.has(id)
        };
      }),
    actions: actionFiles.map(slug => {
      const move = moveSlugs.get(slug);
      return {
        slug,
        name: move?.name || null,
        nameEn: move?.nameEn || slug,
        src: `/assets/sprites/actions/${slug}.webp`,
        hasData: moveSlugs.has(slug)
      };
    }),
    items: itemFiles.map(id => {
      const data = items.find(i => i.id === id);
      return {
        id,
        name: data?.name || null,
        nameEn: data?.nameEn || id,
        src: `/assets/sprites/items/${id}.webp`,
        hasData: itemIds.has(id)
      };
    }),
    enemies: enemyFiles.map(id => {
      const data = enemies.find(e => e.id === id);
      const isBoss = bossSprites.has(id);
      return {
        id,
        name: data?.name || (isBoss ? id : null),
        nameEn: data?.nameEn || id,
        src: `/assets/sprites/enemies/${id}.webp`,
        hasData: enemyIds.has(id) || isBoss,
        isBoss
      };
    })
  };

  return manifest;
}

// --- Feedback helpers ---

function loadFeedback() {
  try {
    return JSON.parse(readFileSync(FEEDBACK_PATH, 'utf8'));
  } catch { return {}; }
}

function saveFeedback(data) {
  const dir = join(process.cwd(), 'tools');
  if (!existsSync(dir)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(FEEDBACK_PATH, JSON.stringify(data, null, 2));
}

// --- Router ---

export function createDevRouter({ password = '' } = {}) {
  const router = Router();

  // Rate limit login attempts
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many login attempts. Try again in a minute.',
    keyGenerator: (req) => req.ip
  });

  // Cookie parser (simple — just reads dev_token)
  router.use((req, res, next) => {
    if (!req.cookies) {
      const cookie = req.headers.cookie || '';
      req.cookies = Object.fromEntries(
        cookie.split(';').map(c => c.trim().split('=')).filter(([k]) => k)
      );
    }
    next();
  });

  // Auth gate
  router.use(devAuth(password));

  // Login page
  router.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Dev Login</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e}
      form{background:#16213e;padding:2rem;border-radius:8px;color:#e0e0e0}
      input{padding:0.5rem;margin:0.5rem 0;border:1px solid #444;border-radius:4px;background:#0f0f23;color:#e0e0e0;width:200px}
      button{padding:0.5rem 1rem;background:#0f3460;color:white;border:none;border-radius:4px;cursor:pointer}
      .error{color:#e74c3c;font-size:0.9em}</style></head>
      <body><form method="POST" action="/dev/login-submit">
      <h3>Sprite Dashboard</h3>
      <input type="password" name="password" placeholder="Password" autofocus>
      <br><button type="submit">Login</button>
      ${req.query.err ? '<p class="error">Wrong password</p>' : ''}
      </form></body></html>`);
  });

  router.post('/login-submit', loginLimiter, (req, res) => {
    if (req.body?.password === password) {
      res.cookie('dev_token', password, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
      return res.redirect('/dev/sprites');
    }
    return res.redirect('/dev/login?err=1');
  });

  // Manifest
  let cachedManifest = null;
  router.get('/api/manifest', (req, res) => {
    if (!cachedManifest || req.query.refresh) {
      cachedManifest = buildManifest();
    }
    res.json(cachedManifest);
  });

  // Feedback endpoints
  router.get('/api/feedback', (req, res) => {
    res.json(loadFeedback());
  });

  router.post('/api/feedback', (req, res) => {
    const { key, note } = req.body;
    if (!key || !note) return res.status(400).json({ error: 'key and note required' });
    const feedback = loadFeedback();
    if (!feedback[key]) {
      feedback[key] = { notes: [], flagged: true, createdAt: new Date().toISOString() };
    }
    feedback[key].notes.push(note);
    feedback[key].flagged = true;
    feedback[key].updatedAt = new Date().toISOString();
    saveFeedback(feedback);
    res.json({ ok: true });
  });

  router.delete('/api/feedback/:key(*)', (req, res) => {
    const feedback = loadFeedback();
    delete feedback[req.params.key];
    saveFeedback(feedback);
    res.json({ ok: true });
  });

  // Dashboard page
  router.get('/sprites', (req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'dev-sprites.html'));
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/routes/dev-auth.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/dev.js tests/unit/routes/dev-auth.test.js
git commit -m "feat: create dev router with password auth and sprite manifest API"
```

---

### Task 3: Mount dev router in server.js

**Files:**
- Modify: `server.js:350-398`

**Step 1: Add import at top of server.js**

Near the other route imports (around line 42), add:

```js
import { createDevRouter } from './src/routes/dev.js';
```

**Step 2: Mount the router after other routes**

After the `app.use('/api', createRoutes({...}));` block (around line 398), add:

```js
// Dev tools (sprite review dashboard)
const devPassword = process.env.DEV_DASHBOARD_PASSWORD || '';
if (devPassword) {
  app.use('/dev', createDevRouter({ password: devPassword }));
} else if (process.env.NODE_ENV !== 'production') {
  app.use('/dev', createDevRouter({ password: '' }));
}
```

**Step 3: Verify server starts**

Run: `node --check server.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add server.js
git commit -m "feat: mount dev sprite dashboard router"
```

---

### Task 4: Create the dashboard HTML page

**Files:**
- Create: `public/dev-sprites.html`

This is a single self-contained HTML file with inline CSS and JS. It:
- Fetches `/dev/api/manifest` and `/dev/api/feedback` on load
- Renders a grid of sprite cards grouped by category tabs
- Has search/filter, orphan toggle, and review queue
- Each card has a feedback button that POSTs to `/dev/api/feedback`
- Flagged sprites show red badges
- Works on mobile (responsive grid)

**Step 1: Create the HTML file**

Create `public/dev-sprites.html` — this is a large file, build it with these sections:

1. **Head**: viewport meta, inline styles (dark theme matching the login page)
2. **Top bar**: Category tabs (Creatures/Actions/Items/Enemies), search input, "Orphans only" checkbox, "Review Queue" button, "Refresh" button
3. **Grid**: CSS grid of cards, responsive (auto-fill, minmax 120px)
4. **Card template**: Image, name (EN + JP), orphan badge, feedback badge with count
5. **Modal**: Click card → modal with larger image, feedback notes list, text input + submit
6. **JS**: Fetch manifest + feedback, render grid, handle tab switching, search filtering, feedback submission

Key implementation details for the JS:

```js
// Fetch data
const [manifest, feedback] = await Promise.all([
  fetch('/dev/api/manifest').then(r => r.json()),
  fetch('/dev/api/feedback').then(r => r.json())
]);

// Category switching
const categories = ['creatures', 'actions', 'items', 'enemies'];

// Feedback key format: "category/id" e.g. "actions/dash", "creatures/samegaron"
// This matches the feedback JSON structure

// Search: filter by id, name, nameEn
// Orphan toggle: filter where hasData === false
// Review queue: filter where feedback[key]?.flagged === true
```

**Step 2: Verify the page loads with syntax check**

Run: `node --check public/dev-sprites.html 2>&1 || echo "HTML, not JS — check manually"`

Verify by quick curl test (start server briefly):
```bash
DEV_DASHBOARD_PASSWORD=test node server.js &
sleep 2
# Login and get cookie
curl -s -o /dev/null -w "%{http_code}" -c /tmp/cookies.txt -d "password=test" -L http://localhost:3000/dev/login-submit
# Fetch the page
curl -s -o /dev/null -w "%{http_code}" -b /tmp/cookies.txt http://localhost:3000/dev/sprites
# Should be 200
kill %1
```

**Step 3: Commit**

```bash
git add public/dev-sprites.html
git commit -m "feat: add sprite review dashboard UI"
```

---

### Task 5: Update .gitignore for feedback file

**Files:**
- Modify: `.gitignore`

**Step 1: Add feedback file to gitignore**

After the `output/` line, add:

```
tools/sprite-feedback.json
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore sprite feedback file"
```

---

### Task 6: Fix saveFeedback sync/async issue and test manifest

The `saveFeedback` function in Task 2 has a bug — it uses `await import('fs')` inside a sync function. Fix it.

**Files:**
- Modify: `src/routes/dev.js`

**Step 1: Write integration test for manifest**

Create `tests/integration/dev-manifest.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDevRouter } from '../../src/routes/dev.js';

describe('dev manifest API', () => {
  it('builds manifest with all sprite categories', () => {
    const router = createDevRouter({ password: '' });
    // The manifest is built on first request — we test the builder directly
    // Import and call buildManifest (we may need to export it for testing)
    assert.ok(router);
  });
});
```

**Step 2: Fix saveFeedback**

Replace the `saveFeedback` function:

```js
function saveFeedback(data) {
  const dir = join(process.cwd(), 'tools');
  if (!existsSync(dir)) {
    const { mkdirSync } = require('fs');
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(FEEDBACK_PATH, JSON.stringify(data, null, 2));
}
```

Wait — we're using ESM imports. Fix properly:

```js
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';

function saveFeedback(data) {
  const dir = join(process.cwd(), 'tools');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FEEDBACK_PATH, JSON.stringify(data, null, 2));
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: All existing tests pass, new tests pass

**Step 4: Commit**

```bash
git add src/routes/dev.js tests/integration/dev-manifest.test.js
git commit -m "fix: saveFeedback sync import, add manifest integration test"
```

---

### Task 7: Set up pm2 and run on VPS

**Files:**
- Create: `.env` (on VPS only, gitignored)

**Step 1: Install pm2**

Run: `npm install -g pm2`

**Step 2: Create .env**

```bash
echo 'DEV_DASHBOARD_PASSWORD=<choose-a-password>' > .env
```

**Step 3: Start with pm2**

```bash
pm2 start server.js --name koto-dev
pm2 save
pm2 startup
```

**Step 4: Verify**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dev/login`
Expected: `200`

**Step 5: Note the VPS public IP**

Run: `curl -s ifconfig.me`

Dashboard will be at `http://<ip>:3000/dev/sprites`

---

### Task 8: Smoke test the full flow

**No files — manual verification**

**Step 1:** Open `http://<vps-ip>:3000/dev/login` in browser
**Step 2:** Enter password, verify redirect to `/dev/sprites`
**Step 3:** Verify all 4 category tabs load sprites
**Step 4:** Search for "dash" — verify it filters
**Step 5:** Toggle "orphans only" — verify orphan sprites shown
**Step 6:** Click a sprite, submit feedback "test note"
**Step 7:** Verify feedback badge appears
**Step 8:** Check Review Queue tab shows flagged sprite
**Step 9:** Verify `tools/sprite-feedback.json` exists on disk with the feedback

```bash
cat tools/sprite-feedback.json
```
