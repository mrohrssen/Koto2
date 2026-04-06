# Learning Simulator Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone web dashboard that simulates player learning journeys by driving the real Koto game APIs, then visualizes word acquisition over time.

**Architecture:** Separate Express app (`simulator/`) that creates test users on the game server, plays through runs room-by-room via HTTP calls, logs every word exposure and dialogue event to SQLite, and serves a Chart.js dashboard for comparing profiles.

**Tech Stack:** Express, better-sqlite3, Chart.js, vanilla HTML/CSS/JS, node:test

**Spec:** `docs/superpowers/specs/2026-04-06-learning-simulator-design.md`

---

## File Structure

### Game Server Additions (2 files)

| File | Responsibility |
|---|---|
| `src/routes/admin.js` | Admin endpoints: advance-time, cleanup-sim-user, seed-vocab. Gated behind ADMIN_SECRET. |
| `tests/unit/admin-routes.test.js` | Tests for admin endpoints |

### Simulator App (new `simulator/` directory)

| File | Responsibility |
|---|---|
| `simulator/package.json` | Dependencies: express, better-sqlite3, chart.js |
| `simulator/server.js` | Express app on port 3100, mounts routes, serves static |
| `simulator/db/schema.sql` | SQLite table definitions |
| `simulator/db/store.js` | Database access layer — all SQL in one place |
| `simulator/engine/sim-call.js` | Resilient HTTP wrapper — try/catch, error logging, returns `{ok, data}` |
| `simulator/engine/auth.js` | Test user lifecycle — register, login, cleanup |
| `simulator/engine/runner.js` | Main simulation loop — days → runs → rooms |
| `simulator/engine/combat.js` | Move-by-move combat loop |
| `simulator/engine/decisions.js` | Move selection strategy based on combatSkill |
| `simulator/engine/rooms/index.js` | Room type registry + dispatch |
| `simulator/engine/rooms/encounter.js` | Combat encounter handler |
| `simulator/engine/rooms/boss.js` | Boss fight handler (reuses combat.js) |
| `simulator/engine/rooms/friendly-npc.js` | NPC dialogue + item interaction |
| `simulator/engine/rooms/npc-battle.js` | NPC battle + dialogue |
| `simulator/engine/rooms/word-discovery.js` | Word discovery room |
| `simulator/engine/rooms/speed-review.js` | Speed review room |
| `simulator/engine/rooms/whack-a-mole.js` | Minigame handler |
| `simulator/engine/rooms/skip-room.js` | Known types without handlers (shrine, quiz, dealer, skillMaster) |
| `simulator/engine/rooms/unknown.js` | Fallback for truly unknown room types |
| `simulator/routes/profiles.js` | Profile CRUD API |
| `simulator/routes/simulations.js` | Start/pause/resume/delete simulation API |
| `simulator/routes/results.js` | Query snapshots, events, comparisons |
| `simulator/public/index.html` | Dashboard SPA shell |
| `simulator/public/css/dashboard.css` | Dashboard styles |
| `simulator/public/js/app.js` | Client-side router + state |
| `simulator/public/js/api.js` | Fetch wrapper for simulator API |
| `simulator/public/js/profiles.js` | Profile CRUD UI |
| `simulator/public/js/results.js` | Charts + tables |
| `simulator/public/js/compare.js` | Multi-profile comparison |
| `simulator/public/js/dialogue-viewer.js` | Dialogue transcript renderer |

### Simulator Tests

| File | Responsibility |
|---|---|
| `simulator/tests/unit/store.test.js` | SQLite store operations |
| `simulator/tests/unit/sim-call.test.js` | Resilient HTTP wrapper |
| `simulator/tests/unit/decisions.test.js` | Combat move selection |
| `simulator/tests/unit/room-dispatch.test.js` | Room type registry |
| `simulator/tests/integration/simulation.test.js` | End-to-end simulation (requires game server) |

---

## Chunk 1: Foundation — Admin Endpoints + Simulator Skeleton

### Task 1: Game Server Admin Route File

**Files:**
- Create: `src/routes/admin.js`
- Modify: `server.js` (mount admin routes)
- Test: `tests/unit/admin-routes.test.js`

- [ ] **Step 1: Write failing test for advance-time endpoint**

```javascript
// tests/unit/admin-routes.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('admin routes', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'admin-test-'));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('shiftFsrsTimestamps', () => {
    it('shifts due and last_review dates backward by N days', async () => {
      // Create a mock SRS file
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 86400000);
      const srsData = {
        vocab: {
          cards: [{
            id: 'word1',
            due: tomorrow.toISOString(),
            last_review: now.toISOString(),
            state: 1,
            stability: 1,
            difficulty: 5,
            reps: 1,
            lapses: 0,
          }]
        }
      };
      const filePath = join(tmpDir, 'srs-test-user.json');
      writeFileSync(filePath, JSON.stringify(srsData));

      // Import and call the shift function
      // This will fail because the function doesn't exist yet
      const { shiftFsrsTimestamps } = await import('../../src/routes/admin.js');
      const result = shiftFsrsTimestamps(filePath, 1);

      assert.equal(result.shifted, 1);

      const updated = JSON.parse(readFileSync(filePath, 'utf-8'));
      const shiftedDue = new Date(updated.vocab.cards[0].due);
      // Due was tomorrow, shifted back 1 day = roughly now
      assert.ok(shiftedDue.getTime() < tomorrow.getTime());
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/admin-routes.test.js`
Expected: FAIL — cannot import `shiftFsrsTimestamps`

- [ ] **Step 3: Implement admin routes**

```javascript
// src/routes/admin.js
import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { clearSrsCache, loadSrsData, saveSrsData, createCard, gradeCard } from '../game/internal-srs.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET) return res.status(404).json({ error: 'Not found' });
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

export function shiftFsrsTimestamps(filePath, days) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const shiftMs = days * 86400000;
  let shifted = 0;

  for (const deckName of Object.keys(data)) {
    const deck = data[deckName];
    if (!deck.cards) continue;
    for (const card of deck.cards) {
      if (card.due) {
        card.due = new Date(new Date(card.due).getTime() - shiftMs).toISOString();
        shifted++;
      }
      if (card.last_review) {
        card.last_review = new Date(new Date(card.last_review).getTime() - shiftMs).toISOString();
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { shifted };
}

export default function createAdminRoutes({ dataDir }) {
  const router = Router();
  router.use(requireAdminSecret);

  // Shift FSRS timestamps for time compression
  router.post('/advance-time', (req, res) => {
    const { userId, days } = req.body;
    if (!userId || !days) return res.status(400).json({ error: 'userId and days required' });

    const filePath = join(dataDir, `srs-${userId}.json`);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'SRS data not found' });

    const result = shiftFsrsTimestamps(filePath, days);
    clearSrsCache(userId);
    res.json(result);
  });

  // Bulk seed FSRS vocab deck
  router.post('/seed-vocab', (req, res) => {
    const { userId, words } = req.body;
    if (!userId || !Array.isArray(words)) return res.status(400).json({ error: 'userId and words[] required' });

    let seeded = 0;
    for (const word of words) {
      createCard(userId, 'vocab', word, { word, meaning: '', reading: word });
      gradeCard(userId, 'vocab', word, 'good');
      seeded++;
    }
    res.json({ seeded });
  });

  // Delete all data for a sim user
  router.post('/cleanup-sim-user', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!userId.startsWith('sim-')) return res.status(400).json({ error: 'Can only clean up sim- users' });

    let deleted = [];

    // Delete SRS file
    const srsPath = join(dataDir, `srs-${userId}.json`);
    if (existsSync(srsPath)) { unlinkSync(srsPath); deleted.push('srs'); }

    // Delete word-knowledge file
    const wkPath = join(dataDir, `word-knowledge-${userId}.json`);
    if (existsSync(wkPath)) { unlinkSync(wkPath); deleted.push('word-knowledge'); }

    // Delete text-cache files
    const files = readdirSync(dataDir).filter(f => f.includes(userId));
    for (const f of files) {
      unlinkSync(join(dataDir, f));
      deleted.push(f);
    }

    clearSrsCache(userId);
    res.json({ deleted });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/admin-routes.test.js`
Expected: PASS

- [ ] **Step 5: Mount admin routes in server.js**

Add to `server.js` near other route mounts:

```javascript
import createAdminRoutes from './src/routes/admin.js';

// After other route mounts:
app.use('/api/admin', createAdminRoutes({ dataDir: dataPath('') }));
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin.js tests/unit/admin-routes.test.js server.js
git commit -m "feat: add admin endpoints for simulator (advance-time, seed-vocab, cleanup)"
```

---

### Task 2: Simulator Project Initialization

**Files:**
- Create: `simulator/package.json`
- Create: `simulator/server.js`
- Create: `simulator/db/schema.sql`
- Create: `simulator/db/store.js`

- [ ] **Step 1: Create simulator/package.json**

```json
{
  "name": "koto-simulator",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test 'tests/**/*.test.js'",
    "test:unit": "node --test 'tests/unit/**/*.test.js'",
    "test:integration": "node --test 'tests/integration/**/*.test.js'"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "express": "^4.21.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd simulator && npm install`

- [ ] **Step 3: Create SQLite schema**

```sql
-- simulator/db/schema.sql

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL,  -- JSON blob of all profile variables
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, paused, complete, errored
  test_user_id TEXT,
  jwt_token TEXT,
  current_day INTEGER DEFAULT 0,
  current_run INTEGER DEFAULT 0,
  current_room INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_id INTEGER NOT NULL REFERENCES simulations(id),
  day INTEGER NOT NULL,
  total_known_words INTEGER DEFAULT 0,
  new_words_today INTEGER DEFAULT 0,
  words_exposed_today INTEGER DEFAULT 0,
  dialogue_lines_encountered INTEGER DEFAULT 0,
  runs_completed INTEGER DEFAULT 0,
  runs_wiped INTEGER DEFAULT 0,
  rooms_explored INTEGER DEFAULT 0,
  speed_reviews_completed INTEGER DEFAULT 0,
  unknown_words_in_dialogue INTEGER DEFAULT 0,
  snapshot_data TEXT,  -- JSON blob for extensible metrics
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(simulation_id, day)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_id INTEGER NOT NULL REFERENCES simulations(id),
  day INTEGER NOT NULL,
  run INTEGER NOT NULL,
  room INTEGER,
  event_type TEXT NOT NULL,  -- word_exposure, word_learned, dialogue_seen, combat_round, room_entered, run_summary, api_error
  data TEXT NOT NULL,  -- JSON blob
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_sim_day ON events(simulation_id, day);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(simulation_id, event_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_sim ON daily_snapshots(simulation_id);
```

- [ ] **Step 4: Write failing test for SQLite store**

```javascript
// simulator/tests/unit/store.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('store', () => {
  let tmpDir, store;

  before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sim-store-'));
    const { createStore } = await import('../../db/store.js');
    store = createStore(join(tmpDir, 'test.db'));
  });

  after(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and retrieves a profile', () => {
    const config = { durationDays: 30, runsPerDay: 2, speedReviewAccuracy: 0.7 };
    const id = store.createProfile('Test Player', config);
    const profile = store.getProfile(id);
    assert.equal(profile.name, 'Test Player');
    assert.deepEqual(JSON.parse(profile.config), config);
  });

  it('creates a simulation for a profile', () => {
    const profileId = store.createProfile('Sim Test', { durationDays: 7 });
    const simId = store.createSimulation(profileId);
    const sim = store.getSimulation(simId);
    assert.equal(sim.profile_id, profileId);
    assert.equal(sim.status, 'pending');
  });

  it('logs and retrieves events', () => {
    const profileId = store.createProfile('Event Test', {});
    const simId = store.createSimulation(profileId);
    store.logEvent(simId, 1, 1, 3, 'word_exposure', { word: '犬', source: 'bark' });
    store.logEvent(simId, 1, 1, 3, 'word_exposure', { word: '猫', source: 'npc' });
    const events = store.getEvents(simId, { day: 1 });
    assert.equal(events.length, 2);
  });

  it('saves and retrieves daily snapshots', () => {
    const profileId = store.createProfile('Snapshot Test', {});
    const simId = store.createSimulation(profileId);
    store.saveDailySnapshot(simId, 1, {
      total_known_words: 10, new_words_today: 5,
      words_exposed_today: 20, dialogue_lines_encountered: 8,
      runs_completed: 2, runs_wiped: 0, rooms_explored: 55,
      speed_reviews_completed: 3, unknown_words_in_dialogue: 4
    });
    const snapshots = store.getDailySnapshots(simId);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].total_known_words, 10);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd simulator && node --test tests/unit/store.test.js`
Expected: FAIL — cannot import `store.js`

- [ ] **Step 6: Implement SQLite store**

```javascript
// simulator/db/store.js
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  return {
    // Profiles
    createProfile(name, config) {
      const stmt = db.prepare('INSERT INTO profiles (name, config) VALUES (?, ?)');
      return stmt.run(name, JSON.stringify(config)).lastInsertRowid;
    },

    getProfile(id) {
      return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    },

    getAllProfiles() {
      return db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
    },

    updateProfile(id, name, config) {
      db.prepare('UPDATE profiles SET name = ?, config = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(name, JSON.stringify(config), id);
    },

    deleteProfile(id) {
      db.prepare('DELETE FROM events WHERE simulation_id IN (SELECT id FROM simulations WHERE profile_id = ?)').run(id);
      db.prepare('DELETE FROM daily_snapshots WHERE simulation_id IN (SELECT id FROM simulations WHERE profile_id = ?)').run(id);
      db.prepare('DELETE FROM simulations WHERE profile_id = ?').run(id);
      db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    },

    // Simulations
    createSimulation(profileId) {
      const stmt = db.prepare('INSERT INTO simulations (profile_id) VALUES (?)');
      return stmt.run(profileId).lastInsertRowid;
    },

    getSimulation(id) {
      return db.prepare('SELECT * FROM simulations WHERE id = ?').get(id);
    },

    getSimulationsForProfile(profileId) {
      return db.prepare('SELECT * FROM simulations WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
    },

    updateSimulation(id, fields) {
      const allowed = ['status', 'test_user_id', 'jwt_token', 'current_day', 'current_run', 'current_room', 'started_at', 'completed_at', 'error_message'];
      const sets = [];
      const values = [];
      for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); values.push(v); }
      }
      if (sets.length === 0) return;
      values.push(id);
      db.prepare(`UPDATE simulations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    // Events
    logEvent(simId, day, run, room, eventType, data) {
      db.prepare('INSERT INTO events (simulation_id, day, run, room, event_type, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(simId, day, run, room, eventType, JSON.stringify(data));
    },

    getEvents(simId, filters = {}) {
      let sql = 'SELECT * FROM events WHERE simulation_id = ?';
      const params = [simId];
      if (filters.day !== undefined) { sql += ' AND day = ?'; params.push(filters.day); }
      if (filters.event_type) { sql += ' AND event_type = ?'; params.push(filters.event_type); }
      sql += ' ORDER BY id ASC';
      if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
      return db.prepare(sql).all(...params);
    },

    getEventCounts(simId) {
      return db.prepare('SELECT event_type, COUNT(*) as count FROM events WHERE simulation_id = ? GROUP BY event_type')
        .all(simId);
    },

    // Daily Snapshots
    saveDailySnapshot(simId, day, metrics) {
      db.prepare(`INSERT OR REPLACE INTO daily_snapshots
        (simulation_id, day, total_known_words, new_words_today, words_exposed_today,
         dialogue_lines_encountered, runs_completed, runs_wiped, rooms_explored,
         speed_reviews_completed, unknown_words_in_dialogue, snapshot_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(simId, day,
          metrics.total_known_words || 0, metrics.new_words_today || 0,
          metrics.words_exposed_today || 0, metrics.dialogue_lines_encountered || 0,
          metrics.runs_completed || 0, metrics.runs_wiped || 0,
          metrics.rooms_explored || 0, metrics.speed_reviews_completed || 0,
          metrics.unknown_words_in_dialogue || 0,
          JSON.stringify(metrics.extra || {}));
    },

    getDailySnapshots(simId) {
      return db.prepare('SELECT * FROM daily_snapshots WHERE simulation_id = ? ORDER BY day ASC').all(simId);
    },

    // Comparison query
    getComparisonData(simIds) {
      const placeholders = simIds.map(() => '?').join(',');
      return db.prepare(`SELECT s.simulation_id, s.day, s.total_known_words, s.new_words_today,
        sim.profile_id, p.name as profile_name
        FROM daily_snapshots s
        JOIN simulations sim ON sim.id = s.simulation_id
        JOIN profiles p ON p.id = sim.profile_id
        WHERE s.simulation_id IN (${placeholders})
        ORDER BY s.day ASC`).all(...simIds);
    },

    close() {
      db.close();
    }
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd simulator && node --test tests/unit/store.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add simulator/package.json simulator/db/ simulator/tests/unit/store.test.js
git commit -m "feat(simulator): project init with SQLite schema and store"
```

---

### Task 3: Resilient HTTP Wrapper (sim-call)

**Files:**
- Create: `simulator/engine/sim-call.js`
- Test: `simulator/tests/unit/sim-call.test.js`

- [ ] **Step 1: Write failing test for simCall**

```javascript
// simulator/tests/unit/sim-call.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('simCall', () => {
  it('returns ok:true with data on success', async () => {
    const { createSimCaller } = await import('../../engine/sim-call.js');
    // We'll test against a non-existent server — expect ok:false
    const simCall = createSimCaller('http://localhost:99999', 'fake-token', () => {});
    const result = await simCall('GET', '/api/game/state', null, { day: 1, run: 1, room: 0 });
    assert.equal(result.ok, false);
    assert.ok(result.error); // Should have error message, not throw
  });

  it('calls logFn on error', async () => {
    const { createSimCaller } = await import('../../engine/sim-call.js');
    const logged = [];
    const logFn = (event) => logged.push(event);
    const simCall = createSimCaller('http://localhost:99999', 'fake-token', logFn);
    await simCall('GET', '/test', null, { day: 1, run: 1, room: 0 });
    assert.equal(logged.length, 1);
    assert.equal(logged[0].type, 'api_error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd simulator && node --test tests/unit/sim-call.test.js`
Expected: FAIL — cannot import

- [ ] **Step 3: Implement sim-call**

```javascript
// simulator/engine/sim-call.js
export function createSimCaller(baseUrl, jwtToken, logFn) {
  return async function simCall(method, path, body, context) {
    const url = baseUrl + path;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logFn({ type: 'api_error', path, status: res.status, body: text, context });
        return { ok: false, status: res.status, error: text };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      logFn({ type: 'api_error', path, error: err.message, context });
      return { ok: false, error: err.message };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd simulator && node --test tests/unit/sim-call.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add simulator/engine/sim-call.js simulator/tests/unit/sim-call.test.js
git commit -m "feat(simulator): add resilient HTTP call wrapper"
```

---

### Task 4: Test User Auth Helper

**Files:**
- Create: `simulator/engine/auth.js`

- [ ] **Step 1: Implement auth helper**

```javascript
// simulator/engine/auth.js
export async function createTestUser(baseUrl, profileName, adminSecret) {
  // Username must be ≤20 chars (game server limit). Use short prefix + base36 timestamp.
  const slug = profileName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const username = `s-${slug}-${Date.now().toString(36)}`;
  const password = `sim-pass-${Math.random().toString(36).slice(2)}`;

  // Register
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, inviteCode: 'neo-tokyo-friends' }),
  });
  if (!regRes.ok) {
    const err = await regRes.text();
    throw new Error(`Registration failed: ${err}`);
  }
  const { token, user } = await regRes.json();

  return { userId: user.id, username, token };
}

export async function seedStartingVocab(baseUrl, adminSecret, userId, words) {
  if (!words || words.length === 0) return;
  const res = await fetch(`${baseUrl}/api/admin/seed-vocab`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({ userId, words }),
  });
  if (!res.ok) throw new Error(`Seed vocab failed: ${await res.text()}`);
  return res.json();
}

export async function cleanupTestUser(baseUrl, adminSecret, userId) {
  const res = await fetch(`${baseUrl}/api/admin/cleanup-sim-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`Cleanup failed: ${await res.text()}`);
  return res.json();
}

export async function advanceTime(baseUrl, adminSecret, userId, days) {
  const res = await fetch(`${baseUrl}/api/admin/advance-time`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({ userId, days }),
  });
  if (!res.ok) throw new Error(`Advance time failed: ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add simulator/engine/auth.js
git commit -m "feat(simulator): add test user auth helpers"
```

---

### Task 5: Move Selection Logic (decisions.js)

**Files:**
- Create: `simulator/engine/decisions.js`
- Test: `simulator/tests/unit/decisions.test.js`

- [ ] **Step 1: Write failing test for move selection**

```javascript
// simulator/tests/unit/decisions.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('decisions', () => {
  it('high combatSkill picks type-advantaged move', async () => {
    const { pickMove } = await import('../../engine/decisions.js');
    const allies = [{ moves: [
      { id: 'fire-blast', element: 'fire', power: 30 },
      { id: 'water-jet', element: 'water', power: 25 },
    ]}];
    const enemies = [{ element: 'fire' }]; // Water is strong vs fire
    const move = pickMove(allies, 0, enemies, 0, 1.0); // combatSkill = 1.0
    assert.equal(move.moveId, 'water-jet');
  });

  it('low combatSkill picks randomly (not always optimal)', async () => {
    const { pickMove } = await import('../../engine/decisions.js');
    const allies = [{ moves: [
      { id: 'fire-blast', element: 'fire', power: 30 },
      { id: 'water-jet', element: 'water', power: 25 },
    ]}];
    const enemies = [{ element: 'fire' }];
    // With skill 0, should sometimes pick suboptimal
    let pickedFire = false;
    for (let i = 0; i < 50; i++) {
      const move = pickMove(allies, 0, enemies, 0, 0.0);
      if (move.moveId === 'fire-blast') pickedFire = true;
    }
    assert.ok(pickedFire, 'Low skill should sometimes pick suboptimal moves');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd simulator && node --test tests/unit/decisions.test.js`
Expected: FAIL

- [ ] **Step 3: Implement decisions**

```javascript
// simulator/engine/decisions.js

// Simplified element effectiveness (matches game's system)
const EFFECTIVENESS = {
  fire: { strong: 'nature', weak: 'water' },
  water: { strong: 'fire', weak: 'electric' },
  electric: { strong: 'water', weak: 'nature' },
  nature: { strong: 'electric', weak: 'fire' },
  light: { strong: 'dark', weak: 'dark' },
  dark: { strong: 'light', weak: 'light' },
};

function getMoveScore(move, targetElement) {
  const eff = EFFECTIVENESS[move.element];
  if (!eff) return move.power || 10;
  if (eff.strong === targetElement) return (move.power || 10) * 1.5;
  if (eff.weak === targetElement) return (move.power || 10) * 0.5;
  return move.power || 10;
}

export function pickMove(allies, creatureIndex, enemies, targetIndex, combatSkill) {
  const creature = allies[creatureIndex];
  if (!creature || !creature.moves || creature.moves.length === 0) {
    return { creatureIndex, moveId: null, targetIndex };
  }

  const targetElement = enemies[targetIndex]?.element;

  // Score all moves
  const scored = creature.moves.map(m => ({
    moveId: m.id,
    score: getMoveScore(m, targetElement),
  }));
  scored.sort((a, b) => b.score - a.score);

  // combatSkill = probability of picking the best move
  if (Math.random() < combatSkill) {
    return { creatureIndex, moveId: scored[0].moveId, targetIndex };
  }

  // Otherwise pick randomly
  const pick = scored[Math.floor(Math.random() * scored.length)];
  return { creatureIndex, moveId: pick.moveId, targetIndex };
}

export function pickTarget(enemies) {
  // Pick first alive enemy
  const alive = enemies.filter((e, i) => e.hp > 0).map((e, i) => i);
  if (alive.length === 0) return 0;
  return alive[0];
}

export function pickSwap(allies) {
  // Pick first alive reserve creature
  for (let i = 0; i < allies.length; i++) {
    if (allies[i].hp > 0) return i;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd simulator && node --test tests/unit/decisions.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add simulator/engine/decisions.js simulator/tests/unit/decisions.test.js
git commit -m "feat(simulator): add combat move selection logic"
```

---

## Chunk 2: Room Handlers + Combat Loop

### Task 6: Room Type Registry

**Files:**
- Create: `simulator/engine/rooms/index.js`
- Create: `simulator/engine/rooms/unknown.js`
- Create: `simulator/engine/rooms/skip-room.js`
- Test: `simulator/tests/unit/room-dispatch.test.js`

- [ ] **Step 1: Write failing test for room dispatch**

```javascript
// simulator/tests/unit/room-dispatch.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('room dispatch', () => {
  it('dispatches encounter to encounter handler', async () => {
    const { getRoomHandler } = await import('../../engine/rooms/index.js');
    const handler = getRoomHandler('encounter');
    assert.equal(handler.name, 'handleEncounter');
  });

  it('returns skip handler for shrine', async () => {
    const { getRoomHandler } = await import('../../engine/rooms/index.js');
    const handler = getRoomHandler('shrine');
    assert.equal(handler.name, 'handleSkipRoom');
  });

  it('returns unknown handler for new room types', async () => {
    const { getRoomHandler } = await import('../../engine/rooms/index.js');
    const handler = getRoomHandler('totallyNewType');
    assert.equal(handler.name, 'handleUnknownRoom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd simulator && node --test tests/unit/room-dispatch.test.js`
Expected: FAIL

- [ ] **Step 3: Implement room registry and fallback handlers**

```javascript
// simulator/engine/rooms/unknown.js
export async function handleUnknownRoom(simCall, room, context, logEvent) {
  logEvent('room_entered', {
    roomType: room.type,
    roomIndex: context.roomIndex,
    outcome: 'unknown_type',
    message: `Unknown room type: ${room.type} — skipped`,
  });
}

// simulator/engine/rooms/skip-room.js
export async function handleSkipRoom(simCall, room, context, logEvent) {
  logEvent('room_entered', {
    roomType: room.type,
    roomIndex: context.roomIndex,
    outcome: 'skipped',
    message: `Known room type without handler: ${room.type}`,
  });
}
```

```javascript
// simulator/engine/rooms/index.js
import { handleUnknownRoom } from './unknown.js';
import { handleSkipRoom } from './skip-room.js';

// Handlers will be added as they're implemented
const handlers = {
  // Full handlers (added in subsequent tasks)
  encounter: null,
  boss: null,
  friendlyNpc: null,
  npcBattle: null,
  wordDiscovery: null,
  speedReviewRoom: null,
  whackAMole: null,
  // Known types without full handlers
  shrine: handleSkipRoom,
  quiz: handleSkipRoom,
  dealer: handleSkipRoom,
  skillMaster: handleSkipRoom,
};

export function getRoomHandler(roomType) {
  if (roomType in handlers) {
    return handlers[roomType] || handleSkipRoom;
  }
  return handleUnknownRoom;
}

export function registerHandler(roomType, handler) {
  handlers[roomType] = handler;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd simulator && node --test tests/unit/room-dispatch.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add simulator/engine/rooms/
git commit -m "feat(simulator): add room type registry with skip/unknown fallbacks"
```

---

### Task 7: Combat Loop

**Files:**
- Create: `simulator/engine/combat.js`

- [ ] **Step 1: Implement combat loop**

This drives the move-by-move combat via real API calls. Not unit-testable in isolation (needs game server), so tested via integration test later.

```javascript
// simulator/engine/combat.js
import { pickMove, pickTarget, pickSwap } from './decisions.js';

export async function runCombat(simCall, encounter, combatSkill, context, logEvent) {
  const result = {
    rounds: 0,
    won: false,
    wiped: false,
    barks: [],
    wordsExposed: [],
    dialogueSeen: [],
  };

  let allies = encounter.allies || [];
  let enemies = encounter.enemies || [];
  let combatActive = true;
  const MAX_ROUNDS = 100; // Safety valve

  // Log any NPC dialogue from encounter start
  if (encounter.npcDialogue) {
    for (const [slot, line] of Object.entries(encounter.npcDialogue)) {
      if (line && line.text) {
        result.dialogueSeen.push({ source: `npc_${slot}`, text: line.text, tokens: line.tokens });
        logEvent('dialogue_seen', { source: `npc_${slot}`, text: line.text, ...context });
      }
    }
  }

  while (combatActive && result.rounds < MAX_ROUNDS) {
    result.rounds++;

    // Find first alive ally and enemy
    const aliveAllyIdx = allies.findIndex(a => a.hp > 0);
    const aliveEnemyIdx = enemies.findIndex(e => e.hp > 0);

    if (aliveAllyIdx === -1) { result.wiped = true; break; }
    if (aliveEnemyIdx === -1) { result.won = true; break; }

    // Pick move
    const move = pickMove(allies, aliveAllyIdx, enemies, aliveEnemyIdx, combatSkill);

    if (!move.moveId && allies[aliveAllyIdx].moves?.length > 0) {
      move.moveId = allies[aliveAllyIdx].moves[0].id;
    }

    // Execute combat cycle
    const cycleResult = await simCall('POST', '/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [move],
    }, context);

    if (!cycleResult.ok) {
      result.wiped = true; // Treat API error as wipe
      break;
    }

    const cycle = cycleResult.data;

    // Log combat round
    logEvent('combat_round', {
      round: result.rounds,
      moveUsed: move.moveId,
      playerAttacks: cycle.playerAttacks,
      enemyAttacks: cycle.enemyAttacks,
      ...context,
    });

    // Update local state from response
    if (cycle.allies) allies = cycle.allies;
    if (cycle.enemies) enemies = cycle.enemies;

    // Check for combat end
    if (cycle.combatEnded) {
      const allEnemiesDead = enemies.every(e => e.hp <= 0);
      result.won = allEnemiesDead;
      result.wiped = !allEnemiesDead;
      combatActive = false;
    }

    // Handle KO swaps
    if (cycle.koSwaps && cycle.koSwaps.length > 0) {
      // Server auto-swaps, just log it
    }

    // If ally KO'd and no auto-swap, try manual swap
    if (combatActive && allies[aliveAllyIdx]?.hp <= 0) {
      const swapIdx = pickSwap(allies);
      if (swapIdx !== null && swapIdx !== aliveAllyIdx) {
        await simCall('POST', '/api/game/swap-creature', {
          activeIndex: aliveAllyIdx,
          reserveIndex: swapIdx,
        }, context);
      } else {
        result.wiped = true;
        break;
      }
    }
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add simulator/engine/combat.js
git commit -m "feat(simulator): add move-by-move combat loop"
```

---

### Task 8: Room Handlers — Encounter + Boss

**Files:**
- Create: `simulator/engine/rooms/encounter.js`
- Create: `simulator/engine/rooms/boss.js`
- Modify: `simulator/engine/rooms/index.js` (register handlers)

- [ ] **Step 1: Implement encounter handler**

```javascript
// simulator/engine/rooms/encounter.js
import { runCombat } from '../combat.js';

export async function handleEncounter(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'encounter', roomIndex: context.roomIndex, outcome: 'started' });

  // Start the encounter
  const startResult = await simCall('POST', '/api/game/start-creature-encounter', {}, context);
  if (!startResult.ok) return { outcome: 'error', error: startResult.error };

  const encounter = startResult.data.encounter || startResult.data;

  // Run combat
  const combat = await runCombat(simCall, startResult.data, context.combatSkill, context, logEvent);

  logEvent('room_entered', {
    roomType: 'encounter',
    roomIndex: context.roomIndex,
    outcome: combat.won ? 'cleared' : 'wiped',
    rounds: combat.rounds,
  });

  return { outcome: combat.won ? 'cleared' : 'wiped', combat };
}
```

- [ ] **Step 2: Implement boss handler (reuses combat)**

```javascript
// simulator/engine/rooms/boss.js
import { runCombat } from '../combat.js';

export async function handleBoss(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'boss', roomIndex: context.roomIndex, outcome: 'started' });

  const startResult = await simCall('POST', '/api/game/start-creature-encounter', {}, context);
  if (!startResult.ok) return { outcome: 'error', error: startResult.error };

  const combat = await runCombat(simCall, startResult.data, context.combatSkill, context, logEvent);

  logEvent('room_entered', {
    roomType: 'boss',
    roomIndex: context.roomIndex,
    outcome: combat.won ? 'cleared' : 'wiped',
    rounds: combat.rounds,
  });

  return { outcome: combat.won ? 'cleared' : 'wiped', combat };
}
```

- [ ] **Step 3: Register handlers in index.js**

Update `simulator/engine/rooms/index.js`:

```javascript
import { handleEncounter } from './encounter.js';
import { handleBoss } from './boss.js';
// ... existing imports

const handlers = {
  encounter: handleEncounter,
  boss: handleBoss,
  // ... rest unchanged
};
```

- [ ] **Step 4: Commit**

```bash
git add simulator/engine/rooms/
git commit -m "feat(simulator): add encounter and boss room handlers"
```

---

### Task 9: Room Handlers — NPC, Word Discovery, Speed Review, Whack-a-Mole

**Files:**
- Create: `simulator/engine/rooms/friendly-npc.js`
- Create: `simulator/engine/rooms/npc-battle.js`
- Create: `simulator/engine/rooms/word-discovery.js`
- Create: `simulator/engine/rooms/speed-review.js`
- Create: `simulator/engine/rooms/whack-a-mole.js`
- Modify: `simulator/engine/rooms/index.js`

- [ ] **Step 1: Implement friendly NPC handler**

```javascript
// simulator/engine/rooms/friendly-npc.js
export async function handleFriendlyNpc(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'friendlyNpc', roomIndex: context.roomIndex, outcome: 'entered' });

  // The encounter data comes from the room/proceed response — NPC dialogue
  // may already be in the room data. Log any dialogue present.
  if (room.npc || room.encounter?.npc) {
    const npc = room.npc || room.encounter?.npc;
    if (npc.greeting) {
      logEvent('dialogue_seen', { source: 'friendly_npc', text: npc.greeting, npcId: npc.id, ...context });
    }
  }

  // Friendly NPCs offer items — we skip buying for simplicity
  // The room is auto-completed when we proceed to the next room
  return { outcome: 'cleared' };
}
```

- [ ] **Step 2: Implement NPC battle handler**

```javascript
// simulator/engine/rooms/npc-battle.js
import { runCombat } from '../combat.js';

export async function handleNpcBattle(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'npcBattle', roomIndex: context.roomIndex, outcome: 'started' });

  const startResult = await simCall('POST', '/api/game/start-creature-encounter', {}, context);
  if (!startResult.ok) return { outcome: 'error', error: startResult.error };

  // Log NPC dialogue if present
  const npcDialogue = startResult.data.npcDialogue;
  if (npcDialogue) {
    for (const [slot, line] of Object.entries(npcDialogue)) {
      if (line?.text) {
        logEvent('dialogue_seen', { source: `npc_battle_${slot}`, text: line.text, tokens: line.tokens, ...context });
      }
    }
  }

  const combat = await runCombat(simCall, startResult.data, context.combatSkill, context, logEvent);

  logEvent('room_entered', {
    roomType: 'npcBattle',
    roomIndex: context.roomIndex,
    outcome: combat.won ? 'cleared' : 'wiped',
    rounds: combat.rounds,
  });

  return { outcome: combat.won ? 'cleared' : 'wiped', combat };
}
```

- [ ] **Step 3: Implement word discovery handler**

```javascript
// simulator/engine/rooms/word-discovery.js
export async function handleWordDiscovery(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'wordDiscovery', roomIndex: context.roomIndex, outcome: 'started' });

  // Get discovery words
  const wordsResult = await simCall('GET', '/api/game/discovery-words?limit=2', null, context);
  if (!wordsResult.ok) return { outcome: 'error' };

  const words = wordsResult.data.words || [];
  for (const w of words) {
    logEvent('word_exposure', { word: w.word, source: 'discovery', reading: w.reading, meanings: w.meanings, ...context });
  }

  // complete-discovery takes no body — it completes the entire room at once.
  // The accuracy check simulates whether the player bothers to engage.
  if (Math.random() < context.wordDiscoveryAccuracy) {
    const completeResult = await simCall('POST', '/api/game/complete-discovery', {}, context);
    if (completeResult.ok) {
      for (const w of words) {
        logEvent('word_learned', { word: w.word, source: 'discovery', ...context });
      }
    }
  }

  return { outcome: 'cleared', wordsOffered: words.length };
}
```

- [ ] **Step 4: Implement speed review handler**

```javascript
// simulator/engine/rooms/speed-review.js
export async function handleSpeedReview(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'speedReviewRoom', roomIndex: context.roomIndex, outcome: 'started' });

  // Start speed review
  const startResult = await simCall('POST', '/api/game/speed-review-room/start', { roomId: room.id || context.roomIndex }, context);
  if (!startResult.ok) return { outcome: 'error' };

  let reviewed = 0;
  let completed = false;

  // Review loop
  while (!completed) {
    const progressResult = await simCall('POST', '/api/game/speed-review-room/progress', {
      roomId: room.id || context.roomIndex,
    }, context);

    if (!progressResult.ok) break;
    const wordData = progressResult.data;

    if (wordData.completed || !wordData.word) {
      completed = true;
      break;
    }

    // Grade based on speedReviewAccuracy
    const grade = Math.random() < context.speedReviewAccuracy ? 'good' : 'again';

    // Submit review via known-words/review endpoint
    const reviewResult = await simCall('POST', '/api/game/known-words/review', {
      word: wordData.word,
      grade,
    }, context);

    logEvent('word_exposure', { word: wordData.word, source: 'speed_review', grade, ...context });

    if (reviewResult.ok && reviewResult.data.mastered) {
      logEvent('word_learned', { word: wordData.word, source: 'speed_review', ...context });
    }

    reviewed++;
    if (reviewed > 20) break; // Safety valve
  }

  // Complete the room
  await simCall('POST', '/api/game/speed-review-room/complete', { roomId: room.id || context.roomIndex }, context);

  logEvent('room_entered', {
    roomType: 'speedReviewRoom',
    roomIndex: context.roomIndex,
    outcome: 'cleared',
    wordsReviewed: reviewed,
  });

  return { outcome: 'cleared', reviewed };
}
```

- [ ] **Step 5: Implement whack-a-mole handler**

```javascript
// simulator/engine/rooms/whack-a-mole.js
export async function handleWhackAMole(simCall, room, context, logEvent) {
  logEvent('room_entered', { roomType: 'whackAMole', roomIndex: context.roomIndex, outcome: 'started' });

  // Simulate a basic score based on combatSkill
  const score = Math.floor(5 + context.combatSkill * 15); // 5-20 range

  const result = await simCall('POST', '/api/game/whack-a-mole-complete', { score }, context);

  logEvent('room_entered', {
    roomType: 'whackAMole',
    roomIndex: context.roomIndex,
    outcome: result.ok ? 'cleared' : 'skipped',
    score,
  });

  return { outcome: 'cleared' };
}
```

- [ ] **Step 6: Register all handlers in index.js**

```javascript
// simulator/engine/rooms/index.js
import { handleUnknownRoom } from './unknown.js';
import { handleSkipRoom } from './skip-room.js';
import { handleEncounter } from './encounter.js';
import { handleBoss } from './boss.js';
import { handleFriendlyNpc } from './friendly-npc.js';
import { handleNpcBattle } from './npc-battle.js';
import { handleWordDiscovery } from './word-discovery.js';
import { handleSpeedReview } from './speed-review.js';
import { handleWhackAMole } from './whack-a-mole.js';

const handlers = {
  encounter: handleEncounter,
  boss: handleBoss,
  friendlyNpc: handleFriendlyNpc,
  npcBattle: handleNpcBattle,
  wordDiscovery: handleWordDiscovery,
  speedReviewRoom: handleSpeedReview,
  whackAMole: handleWhackAMole,
  shrine: handleSkipRoom,
  quiz: handleSkipRoom,
  dealer: handleSkipRoom,
  skillMaster: handleSkipRoom,
};

export function getRoomHandler(roomType) {
  if (roomType in handlers) {
    return handlers[roomType] || handleSkipRoom;
  }
  return handleUnknownRoom;
}

export function registerHandler(roomType, handler) {
  handlers[roomType] = handler;
}
```

- [ ] **Step 7: Commit**

```bash
git add simulator/engine/rooms/
git commit -m "feat(simulator): add all room handlers (NPC, discovery, speed review, whack-a-mole)"
```

---

### Task 10: Main Simulation Runner

**Files:**
- Create: `simulator/engine/runner.js`

- [ ] **Step 1: Implement the main simulation loop**

```javascript
// simulator/engine/runner.js
import { createSimCaller } from './sim-call.js';
import { createTestUser, seedStartingVocab, advanceTime } from './auth.js';
import { getRoomHandler } from './rooms/index.js';

const PROFILE_DEFAULTS = {
  durationDays: 30,
  runsPerDay: 2,
  speedReviewAccuracy: 0.7,
  wordDiscoveryAccuracy: 0.9,
  combatSkill: 0.5,
  dailyPlayMinutes: 60,
  startingVocab: [],
  aiDialogueMode: 'skip',
  aiModel: null,
};

const ESTIMATED_MINUTES_PER_RUN = 20;

export async function runSimulation(profile, store, simId, gameServerUrl, adminSecret, { onDayComplete, onPause } = {}) {
  const config = { ...PROFILE_DEFAULTS, ...profile };

  // Get or resume simulation state
  const sim = store.getSimulation(simId);
  let { test_user_id: userId, jwt_token: jwtToken } = sim;
  let startDay = (sim.current_day || 0) + 1;

  // Create test user if new simulation
  if (!userId) {
    const user = await createTestUser(gameServerUrl, config.name, adminSecret);
    userId = user.userId;
    jwtToken = user.token;
    store.updateSimulation(simId, {
      test_user_id: userId,
      jwt_token: jwtToken,
      status: 'running',
      started_at: new Date().toISOString(),
    });

    if (config.startingVocab.length > 0) {
      await seedStartingVocab(gameServerUrl, adminSecret, userId, config.startingVocab);
    }
  } else {
    store.updateSimulation(simId, { status: 'running' });
  }

  const logEvent = (type, data) => {
    store.logEvent(simId, currentDay, currentRun, currentRoom, type, data);
  };

  let currentDay = 0, currentRun = 0, currentRoom = 0;
  const simCall = createSimCaller(gameServerUrl, jwtToken, logEvent);

  try {
    for (let day = startDay; day <= config.durationDays; day++) {
      currentDay = day;
      const effectiveRuns = Math.min(config.runsPerDay, Math.floor(config.dailyPlayMinutes / ESTIMATED_MINUTES_PER_RUN));
      const dayMetrics = { wordsExposed: 0, wordsLearned: 0, dialogueLines: 0, roomsExplored: 0, runsCompleted: 0, runsWiped: 0, speedReviews: 0, unknownWords: 0 };

      for (let run = 1; run <= effectiveRuns; run++) {
        currentRun = run;
        currentRoom = 0;

        // Start run
        const startResult = await simCall('POST', '/api/game/start-run', {}, { day, run, room: 0 });
        if (!startResult.ok) {
          logEvent('api_error', { message: 'Failed to start run', ...startResult });
          continue;
        }

        // Log CID dialogue
        if (startResult.data.cidScript) {
          for (const line of startResult.data.cidScript.lines || []) {
            logEvent('dialogue_seen', { source: 'cid', text: line.text, tokens: line.tokens, day, run, room: 0 });
            dayMetrics.dialogueLines++;
          }
        }

        // Select area
        const areaOptions = await simCall('GET', '/api/game/area-options', null, { day, run, room: 0 });
        if (areaOptions.ok && areaOptions.data.length > 0) {
          const area = areaOptions.data[Math.floor(Math.random() * areaOptions.data.length)];
          await simCall('POST', '/api/game/select-area', { areaId: area.id }, { day, run, room: 0 });
        }

        // Room-by-room loop
        let runActive = true;
        for (let roomIdx = 1; roomIdx <= 30 && runActive; roomIdx++) {
          currentRoom = roomIdx;

          const proceedResult = await simCall('POST', '/api/game/proceed', {}, { day, run, room: roomIdx });
          if (!proceedResult.ok) {
            logEvent('api_error', { message: 'Failed to proceed', room: roomIdx });
            break;
          }

          const room = proceedResult.data.room || proceedResult.data;
          const roomType = room.type || room.roomType || 'unknown';
          const handler = getRoomHandler(roomType);

          const roomContext = {
            day, run, roomIndex: roomIdx,
            combatSkill: config.combatSkill,
            speedReviewAccuracy: config.speedReviewAccuracy,
            wordDiscoveryAccuracy: config.wordDiscoveryAccuracy,
          };

          const roomResult = await handler(simCall, room, roomContext, logEvent);
          dayMetrics.roomsExplored++;

          if (roomResult?.outcome === 'wiped') {
            runActive = false;
            dayMetrics.runsWiped++;
          }
        }

        if (runActive) dayMetrics.runsCompleted++;

        logEvent('run_summary', {
          day, run,
          roomsCleared: currentRoom,
          completed: runActive,
        });

        // Save progress
        store.updateSimulation(simId, { current_day: day, current_run: run, current_room: currentRoom });
      }

      // Advance time for next day
      if (day < config.durationDays) {
        await advanceTime(gameServerUrl, adminSecret, userId, 1);
      }

      // Get known words count
      const knownResult = await simCall('GET', '/api/game/known-words', null, { day, run: 0, room: 0 });
      const knownWords = knownResult.ok ? (knownResult.data.words?.length || 0) : 0;

      // Count today's events
      const todayEvents = store.getEvents(simId, { day });
      const wordsExposed = todayEvents.filter(e => e.event_type === 'word_exposure').length;
      const wordsLearned = todayEvents.filter(e => e.event_type === 'word_learned').length;
      const dialogueLines = todayEvents.filter(e => e.event_type === 'dialogue_seen').length;
      const unknownWords = todayEvents.filter(e => {
        if (e.event_type !== 'dialogue_seen') return false;
        const data = JSON.parse(e.data);
        return data.tokens?.some(t => t.unknown);
      }).length;

      store.saveDailySnapshot(simId, day, {
        total_known_words: knownWords,
        new_words_today: wordsLearned,
        words_exposed_today: wordsExposed,
        dialogue_lines_encountered: dialogueLines,
        runs_completed: dayMetrics.runsCompleted,
        runs_wiped: dayMetrics.runsWiped,
        rooms_explored: dayMetrics.roomsExplored,
        speed_reviews_completed: dayMetrics.speedReviews,
        unknown_words_in_dialogue: unknownWords,
      });

      store.updateSimulation(simId, { current_day: day });

      if (onDayComplete) onDayComplete(day, knownWords);

      // Check for pause request
      if (onPause && onPause()) {
        store.updateSimulation(simId, { status: 'paused' });
        return { status: 'paused', day };
      }
    }

    store.updateSimulation(simId, { status: 'complete', completed_at: new Date().toISOString() });
    return { status: 'complete' };

  } catch (err) {
    store.updateSimulation(simId, { status: 'errored', error_message: err.message });
    return { status: 'errored', error: err.message };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add simulator/engine/runner.js
git commit -m "feat(simulator): add main simulation runner (day → run → room loop)"
```

---

## Chunk 3: Simulator API + Server

### Task 11: Simulator Express Server + Profile Routes

**Files:**
- Create: `simulator/server.js`
- Create: `simulator/routes/profiles.js`

- [ ] **Step 1: Implement profile routes**

```javascript
// simulator/routes/profiles.js
import { Router } from 'express';

export default function createProfileRoutes(store) {
  const router = Router();

  router.get('/', (req, res) => {
    const profiles = store.getAllProfiles();
    // Attach latest simulation status to each profile
    const enriched = profiles.map(p => {
      const sims = store.getSimulationsForProfile(p.id);
      const latest = sims[0] || null;
      return { ...p, config: JSON.parse(p.config), latestSim: latest };
    });
    res.json(enriched);
  });

  router.post('/', (req, res) => {
    const { name, config } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const id = store.createProfile(name, config || {});
      res.json({ id, name, config });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Profile name already exists' });
      throw err;
    }
  });

  router.get('/:id', (req, res) => {
    const profile = store.getProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: 'Not found' });
    profile.config = JSON.parse(profile.config);
    res.json(profile);
  });

  router.put('/:id', (req, res) => {
    const { name, config } = req.body;
    store.updateProfile(Number(req.params.id), name, config);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    store.deleteProfile(Number(req.params.id));
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 2: Implement simulation routes**

```javascript
// simulator/routes/simulations.js
import { Router } from 'express';
import { runSimulation } from '../engine/runner.js';

// Track running simulations for pause support
const runningSims = new Map(); // simId → { paused: false }

export default function createSimulationRoutes(store, gameServerUrl, adminSecret) {
  const router = Router();

  router.post('/start', async (req, res) => {
    const { profileId } = req.body;
    const profile = store.getProfile(profileId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const simId = store.createSimulation(profileId);
    const config = JSON.parse(profile.config);

    // Run simulation in background
    const control = { paused: false };
    runningSims.set(simId, control);

    runSimulation(config, store, simId, gameServerUrl, adminSecret, {
      onDayComplete: (day, words) => {
        // Progress is saved to DB by runner
      },
      onPause: () => control.paused,
    }).then(result => {
      runningSims.delete(simId);
    }).catch(err => {
      runningSims.delete(simId);
      store.updateSimulation(simId, { status: 'errored', error_message: err.message });
    });

    res.json({ simId, status: 'running' });
  });

  router.post('/:id/pause', (req, res) => {
    const control = runningSims.get(Number(req.params.id));
    if (control) control.paused = true;
    res.json({ ok: true });
  });

  router.post('/:id/resume', async (req, res) => {
    const simId = Number(req.params.id);
    const sim = store.getSimulation(simId);
    if (!sim) return res.status(404).json({ error: 'Not found' });

    const profile = store.getProfile(sim.profile_id);
    const config = JSON.parse(profile.config);

    const control = { paused: false };
    runningSims.set(simId, control);

    runSimulation(config, store, simId, gameServerUrl, adminSecret, {
      onPause: () => control.paused,
    }).then(() => runningSims.delete(simId))
      .catch(err => {
        runningSims.delete(simId);
        store.updateSimulation(simId, { status: 'errored', error_message: err.message });
      });

    res.json({ simId, status: 'running' });
  });

  router.get('/:id', (req, res) => {
    const sim = store.getSimulation(Number(req.params.id));
    if (!sim) return res.status(404).json({ error: 'Not found' });
    res.json(sim);
  });

  router.delete('/:id', async (req, res) => {
    const simId = Number(req.params.id);
    // Pause if running
    const control = runningSims.get(simId);
    if (control) control.paused = true;
    // TODO: cleanup test user via admin endpoint
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 3: Implement results routes**

```javascript
// simulator/routes/results.js
import { Router } from 'express';

export default function createResultRoutes(store) {
  const router = Router();

  router.get('/:simId/snapshots', (req, res) => {
    const snapshots = store.getDailySnapshots(Number(req.params.simId));
    res.json(snapshots);
  });

  router.get('/:simId/events', (req, res) => {
    const filters = {};
    if (req.query.day) filters.day = Number(req.query.day);
    if (req.query.type) filters.event_type = req.query.type;
    if (req.query.limit) filters.limit = Number(req.query.limit);
    const events = store.getEvents(Number(req.params.simId), filters);
    // Parse JSON data field
    const parsed = events.map(e => ({ ...e, data: JSON.parse(e.data) }));
    res.json(parsed);
  });

  router.get('/:simId/event-counts', (req, res) => {
    const counts = store.getEventCounts(Number(req.params.simId));
    res.json(counts);
  });

  router.post('/compare', (req, res) => {
    const { simIds } = req.body;
    if (!Array.isArray(simIds)) return res.status(400).json({ error: 'simIds array required' });
    const data = store.getComparisonData(simIds);
    res.json(data);
  });

  return router;
}
```

- [ ] **Step 4: Implement simulator server**

```javascript
// simulator/server.js
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createStore } from './db/store.js';
import createProfileRoutes from './routes/profiles.js';
import createSimulationRoutes from './routes/simulations.js';
import createResultRoutes from './routes/results.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.SIM_PORT || 3100;
const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const DB_PATH = process.env.SIM_DB_PATH || join(__dirname, 'data', 'simulator.db');

// Ensure data directory exists
import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, 'data'), { recursive: true });

const store = createStore(DB_PATH);
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API routes
app.use('/api/profiles', createProfileRoutes(store));
app.use('/api/simulations', createSimulationRoutes(store, GAME_SERVER_URL, ADMIN_SECRET));
app.use('/api/results', createResultRoutes(store));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', gameServer: GAME_SERVER_URL });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Simulator dashboard: http://localhost:${PORT}`);
  console.log(`Game server target: ${GAME_SERVER_URL}`);
  if (!ADMIN_SECRET) console.warn('Warning: ADMIN_SECRET not set — time advancement will fail');
});
```

- [ ] **Step 5: Commit**

```bash
git add simulator/server.js simulator/routes/
git commit -m "feat(simulator): add Express server with profile, simulation, and result APIs"
```

---

## Chunk 4: Dashboard UI

### Task 12: Dashboard HTML Shell + CSS

**Files:**
- Create: `simulator/public/index.html`
- Create: `simulator/public/css/dashboard.css`
- Create: `simulator/public/js/api.js`

- [ ] **Step 1: Create HTML shell**

```html
<!-- simulator/public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Koto Learning Simulator</title>
  <link rel="stylesheet" href="/css/dashboard.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
  <header>
    <h1>Koto Learning Simulator</h1>
    <nav>
      <a href="#profiles" class="nav-link active" data-view="profiles">Profiles</a>
      <a href="#compare" class="nav-link" data-view="compare">Compare</a>
    </nav>
  </header>

  <main id="app">
    <!-- Views rendered here by JS -->
  </main>

  <script type="module" src="/js/api.js"></script>
  <script type="module" src="/js/profiles.js"></script>
  <script type="module" src="/js/results.js"></script>
  <script type="module" src="/js/compare.js"></script>
  <script type="module" src="/js/dialogue-viewer.js"></script>
  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create CSS**

```css
/* simulator/public/css/dashboard.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #0a0e17;
  --surface: #131a2b;
  --surface-hover: #1a2340;
  --border: #1e2d4a;
  --text: #e0e6f0;
  --text-dim: #6b7a99;
  --accent: #4a9eff;
  --accent-dim: #2a6abf;
  --success: #4ade80;
  --warning: #fbbf24;
  --error: #f87171;
  --font: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}

body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; }

header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 2rem; border-bottom: 1px solid var(--border);
}
header h1 { font-size: 1.1rem; font-weight: 600; }
nav { display: flex; gap: 1rem; }
.nav-link {
  color: var(--text-dim); text-decoration: none; padding: 0.4rem 0.8rem;
  border-radius: 6px; font-size: 0.85rem; transition: all 0.15s;
}
.nav-link:hover { color: var(--text); background: var(--surface); }
.nav-link.active { color: var(--accent); background: var(--surface); }

main { padding: 2rem; max-width: 1200px; margin: 0 auto; }

/* Cards */
.profile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem; }
.profile-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 1.2rem; cursor: pointer; transition: all 0.15s;
}
.profile-card:hover { border-color: var(--accent-dim); transform: translateY(-1px); }
.profile-card h3 { font-size: 0.95rem; margin-bottom: 0.6rem; }
.profile-card .meta { font-size: 0.8rem; color: var(--text-dim); line-height: 1.6; }
.profile-card .status { font-size: 0.75rem; margin-top: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 4px; display: inline-block; }
.status-running { background: rgba(74, 158, 255, 0.15); color: var(--accent); }
.status-complete { background: rgba(74, 222, 128, 0.15); color: var(--success); }
.status-errored { background: rgba(248, 113, 113, 0.15); color: var(--error); }
.status-paused { background: rgba(251, 191, 36, 0.15); color: var(--warning); }

/* Buttons */
.btn {
  padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--text); font-family: var(--font);
  font-size: 0.8rem; cursor: pointer; transition: all 0.15s;
}
.btn:hover { border-color: var(--accent-dim); background: var(--surface-hover); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-dim); }
.btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }

/* Forms */
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 0.3rem; }
.form-group input, .form-group select {
  width: 100%; padding: 0.5rem; background: var(--bg); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-family: var(--font); font-size: 0.85rem;
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex;
  align-items: center; justify-content: center; z-index: 100;
}
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; width: 480px; max-width: 90vw; }
.modal h2 { font-size: 1rem; margin-bottom: 1rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.2rem; }

/* Chart container */
.chart-container { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.2rem; margin-top: 1rem; }
.chart-container canvas { width: 100% !important; }

/* Tabs */
.tab-bar { display: flex; gap: 0; margin-top: 1rem; border-bottom: 1px solid var(--border); }
.tab { padding: 0.6rem 1.2rem; font-size: 0.8rem; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }

/* Dialogue log */
.dialogue-log { margin-top: 1rem; max-height: 500px; overflow-y: auto; }
.dialogue-entry {
  padding: 0.6rem; border-bottom: 1px solid var(--border); font-size: 0.8rem;
}
.dialogue-entry .source { color: var(--accent); font-size: 0.7rem; text-transform: uppercase; }
.dialogue-entry .jp-text { margin-top: 0.3rem; font-size: 0.9rem; }

/* Error log */
.error-entry { padding: 0.6rem; border-bottom: 1px solid var(--border); font-size: 0.8rem; color: var(--error); }
.error-entry .path { color: var(--warning); }

/* Progress bar */
.progress-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 0.5rem; overflow: hidden; }
.progress-bar .fill { height: 100%; background: var(--accent); transition: width 0.3s; }

/* Comparison table */
.compare-table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.8rem; }
.compare-table th, .compare-table td { padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); text-align: left; }
.compare-table th { color: var(--text-dim); font-weight: 500; }
```

- [ ] **Step 3: Create API client**

```javascript
// simulator/public/js/api.js
const BASE = '';

export async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const profiles = {
  list: () => api('GET', '/api/profiles'),
  get: (id) => api('GET', `/api/profiles/${id}`),
  create: (name, config) => api('POST', '/api/profiles', { name, config }),
  update: (id, name, config) => api('PUT', `/api/profiles/${id}`, { name, config }),
  delete: (id) => api('DELETE', `/api/profiles/${id}`),
};

export const simulations = {
  start: (profileId) => api('POST', '/api/simulations/start', { profileId }),
  get: (id) => api('GET', `/api/simulations/${id}`),
  pause: (id) => api('POST', `/api/simulations/${id}/pause`),
  resume: (id) => api('POST', `/api/simulations/${id}/resume`),
};

export const results = {
  snapshots: (simId) => api('GET', `/api/results/${simId}/snapshots`),
  events: (simId, filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api('GET', `/api/results/${simId}/events${params ? '?' + params : ''}`);
  },
  eventCounts: (simId) => api('GET', `/api/results/${simId}/event-counts`),
  compare: (simIds) => api('POST', '/api/results/compare', { simIds }),
};
```

- [ ] **Step 4: Commit**

```bash
git add simulator/public/
git commit -m "feat(simulator): add dashboard HTML shell, CSS, and API client"
```

---

### Task 13: Dashboard App Router + Profiles View

**Files:**
- Create: `simulator/public/js/app.js`
- Create: `simulator/public/js/profiles.js`

- [ ] **Step 1: Implement client-side router**

```javascript
// simulator/public/js/app.js
import { renderProfiles } from './profiles.js';
import { renderResults } from './results.js';
import { renderCompare } from './compare.js';

const appEl = document.getElementById('app');
const navLinks = document.querySelectorAll('.nav-link');

const routes = {
  profiles: renderProfiles,
  results: renderResults,
  compare: renderCompare,
};

function navigate(view, params = {}) {
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.view === view));
  const renderer = routes[view];
  if (renderer) renderer(appEl, params);
}

// Hash-based routing
function handleHash() {
  const hash = location.hash.slice(1) || 'profiles';
  const [view, ...rest] = hash.split('/');
  const params = {};
  if (view === 'results' && rest[0]) params.simId = Number(rest[0]);
  navigate(view, params);
}

window.addEventListener('hashchange', handleHash);
navLinks.forEach(l => l.addEventListener('click', (e) => {
  e.preventDefault();
  location.hash = l.dataset.view;
}));

// Expose navigate for programmatic use
window.navigate = navigate;

handleHash();
```

- [ ] **Step 2: Implement profiles view**

```javascript
// simulator/public/js/profiles.js
import { profiles, simulations } from './api.js';

const PROFILE_FIELDS = [
  { key: 'durationDays', label: 'Duration (days)', type: 'number', default: 30 },
  { key: 'runsPerDay', label: 'Runs per day', type: 'number', default: 2 },
  { key: 'speedReviewAccuracy', label: 'Speed review accuracy', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: 'wordDiscoveryAccuracy', label: 'Word discovery accuracy', type: 'range', min: 0, max: 1, step: 0.05, default: 0.9 },
  { key: 'combatSkill', label: 'Combat skill', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
  { key: 'dailyPlayMinutes', label: 'Daily play minutes', type: 'number', default: 60 },
  { key: 'aiDialogueMode', label: 'AI dialogue mode', type: 'select', options: ['skip', 'cached', 'real'], default: 'skip' },
];

function createFormHtml(config = {}) {
  return PROFILE_FIELDS.map(f => {
    const val = config[f.key] ?? f.default;
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
      return `<div class="form-group"><label>${f.label}</label><select name="${f.key}">${opts}</select></div>`;
    }
    if (f.type === 'range') {
      return `<div class="form-group"><label>${f.label}: <span id="val-${f.key}">${val}</span></label>
        <input type="range" name="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}"
        oninput="document.getElementById('val-${f.key}').textContent=this.value"></div>`;
    }
    return `<div class="form-group"><label>${f.label}</label><input type="number" name="${f.key}" value="${val}"></div>`;
  }).join('');
}

function parseForm(form) {
  const config = {};
  for (const f of PROFILE_FIELDS) {
    const el = form.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    config[f.key] = f.type === 'number' || f.type === 'range' ? Number(el.value) : el.value;
  }
  return config;
}

function showModal(appEl, title, config, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <form>
        <div class="form-group"><label>Name</label><input type="text" name="name" value="${config?.name || ''}" required></div>
        ${createFormHtml(config)}
        <div class="modal-actions">
          <button type="button" class="btn cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>`;
  overlay.querySelector('.cancel-btn').onclick = () => overlay.remove();
  overlay.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const name = overlay.querySelector('[name="name"]').value;
    const cfg = parseForm(overlay.querySelector('form'));
    await onSave(name, cfg);
    overlay.remove();
  };
  document.body.appendChild(overlay);
}

export async function renderProfiles(appEl) {
  appEl.innerHTML = '<p style="color:var(--text-dim)">Loading...</p>';
  const data = await profiles.list();

  appEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2 style="font-size:1rem">Simulation Profiles</h2>
      <button class="btn btn-primary" id="new-profile-btn">+ New Profile</button>
    </div>
    <div class="profile-grid" id="profile-grid"></div>`;

  const grid = document.getElementById('profile-grid');

  for (const p of data) {
    const sim = p.latestSim;
    const statusClass = sim ? `status-${sim.status}` : '';
    const statusText = sim ? `${sim.status} — Day ${sim.current_day || 0}/${p.config.durationDays || 30}` : 'No runs yet';
    const words = sim?.current_day ? '' : '';

    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <h3>${p.name}</h3>
      <div class="meta">
        ${p.config.runsPerDay || 2} runs/day &middot; ${Math.round((p.config.speedReviewAccuracy || 0.7) * 100)}% accuracy<br>
        ${p.config.durationDays || 30} days &middot; Combat: ${Math.round((p.config.combatSkill || 0.5) * 100)}%
      </div>
      ${sim ? `<div class="progress-bar"><div class="fill" style="width:${((sim.current_day || 0) / (p.config.durationDays || 30)) * 100}%"></div></div>` : ''}
      <div class="status ${statusClass}">${statusText}</div>
      <div style="margin-top:0.8rem;display:flex;gap:0.5rem">
        ${!sim || sim.status === 'complete' || sim.status === 'errored' || !sim.status ? `<button class="btn btn-sm run-btn" data-id="${p.id}">Run</button>` : ''}
        ${sim?.status === 'running' ? `<button class="btn btn-sm pause-btn" data-sim="${sim.id}">Pause</button>` : ''}
        ${sim?.status === 'paused' ? `<button class="btn btn-sm resume-btn" data-sim="${sim.id}">Resume</button>` : ''}
        ${sim ? `<button class="btn btn-sm view-btn" data-sim="${sim.id}">View</button>` : ''}
        <button class="btn btn-sm edit-btn" data-id="${p.id}">Edit</button>
      </div>`;
    grid.appendChild(card);
  }

  // Event handlers
  document.getElementById('new-profile-btn').onclick = () => {
    showModal(appEl, 'New Profile', {}, async (name, config) => {
      await profiles.create(name, config);
      renderProfiles(appEl);
    });
  };

  grid.querySelectorAll('.run-btn').forEach(btn => {
    btn.onclick = async () => {
      const { simId } = await simulations.start(Number(btn.dataset.id));
      location.hash = `results/${simId}`;
    };
  });

  grid.querySelectorAll('.pause-btn').forEach(btn => {
    btn.onclick = async () => {
      await simulations.pause(Number(btn.dataset.sim));
      renderProfiles(appEl);
    };
  });

  grid.querySelectorAll('.resume-btn').forEach(btn => {
    btn.onclick = async () => {
      await simulations.resume(Number(btn.dataset.sim));
      renderProfiles(appEl);
    };
  });

  grid.querySelectorAll('.view-btn').forEach(btn => {
    btn.onclick = () => { location.hash = `results/${btn.dataset.sim}`; };
  });

  grid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const p = await profiles.get(Number(btn.dataset.id));
      showModal(appEl, 'Edit Profile', { name: p.name, ...p.config }, async (name, config) => {
        await profiles.update(p.id, name, config);
        renderProfiles(appEl);
      });
    };
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add simulator/public/js/app.js simulator/public/js/profiles.js
git commit -m "feat(simulator): add dashboard router and profiles view"
```

---

### Task 14: Results View with Charts

**Files:**
- Create: `simulator/public/js/results.js`

- [ ] **Step 1: Implement results view**

```javascript
// simulator/public/js/results.js
import { results, simulations } from './api.js';
import { renderDialogueLog } from './dialogue-viewer.js';

let chart = null;

export async function renderResults(appEl, { simId }) {
  if (!simId) { appEl.innerHTML = '<p>No simulation selected</p>'; return; }

  appEl.innerHTML = '<p style="color:var(--text-dim)">Loading results...</p>';

  const [sim, snapshots, eventCounts] = await Promise.all([
    simulations.get(simId),
    results.snapshots(simId),
    results.eventCounts(simId),
  ]);

  const statusClass = `status-${sim.status}`;
  appEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
      <a href="#profiles" style="color:var(--accent);text-decoration:none">&larr; Back</a>
      <h2 style="font-size:1rem;flex:1">Simulation #${simId}</h2>
      <span class="status ${statusClass}">${sim.status} — Day ${sim.current_day || 0}</span>
    </div>
    <div class="tab-bar">
      <div class="tab active" data-tab="progression">Progression</div>
      <div class="tab" data-tab="daily">Daily Detail</div>
      <div class="tab" data-tab="dialogue">Dialogue</div>
      <div class="tab" data-tab="errors">Errors</div>
    </div>
    <div id="tab-content"></div>`;

  const tabContent = document.getElementById('tab-content');
  const tabs = appEl.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab(tab.dataset.tab, tabContent, simId, snapshots);
    };
  });

  renderTab('progression', tabContent, simId, snapshots);

  // Auto-refresh if running
  if (sim.status === 'running') {
    const interval = setInterval(async () => {
      const updated = await simulations.get(simId);
      if (updated.status !== 'running') clearInterval(interval);
      const newSnapshots = await results.snapshots(simId);
      renderTab('progression', tabContent, simId, newSnapshots);
    }, 5000);
  }
}

async function renderTab(tab, container, simId, snapshots) {
  if (tab === 'progression') renderProgressionChart(container, snapshots);
  else if (tab === 'daily') renderDailyDetail(container, simId, snapshots);
  else if (tab === 'dialogue') renderDialogueTab(container, simId);
  else if (tab === 'errors') renderErrorsTab(container, simId);
}

function renderProgressionChart(container, snapshots) {
  container.innerHTML = '<div class="chart-container"><canvas id="prog-chart"></canvas></div>';
  const ctx = document.getElementById('prog-chart').getContext('2d');

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: snapshots.map(s => `Day ${s.day}`),
      datasets: [{
        label: 'Known Words',
        data: snapshots.map(s => s.total_known_words),
        borderColor: '#4a9eff',
        backgroundColor: 'rgba(74,158,255,0.1)',
        fill: true,
        tension: 0.3,
      }, {
        label: 'New Words / Day',
        data: snapshots.map(s => s.new_words_today),
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.1)',
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e0e6f0' } } },
      scales: {
        x: { ticks: { color: '#6b7a99' }, grid: { color: '#1e2d4a' } },
        y: { ticks: { color: '#6b7a99' }, grid: { color: '#1e2d4a' } },
      }
    }
  });
}

function renderDailyDetail(container, simId, snapshots) {
  container.innerHTML = `
    <div style="margin-top:1rem">
      <select id="day-select" class="btn" style="margin-bottom:1rem">
        ${snapshots.map(s => `<option value="${s.day}">Day ${s.day} — ${s.new_words_today} new words</option>`).join('')}
      </select>
      <div class="chart-container"><canvas id="daily-chart"></canvas></div>
      <div id="day-summary" style="margin-top:1rem;font-size:0.8rem;color:var(--text-dim)"></div>
    </div>`;

  const select = document.getElementById('day-select');
  const renderDay = (day) => {
    const snap = snapshots.find(s => s.day === day);
    if (!snap) return;
    document.getElementById('day-summary').innerHTML = `
      Runs: ${snap.runs_completed} completed, ${snap.runs_wiped} wiped &middot;
      Rooms: ${snap.rooms_explored} &middot;
      Speed reviews: ${snap.speed_reviews_completed} &middot;
      Dialogue: ${snap.dialogue_lines_encountered} lines`;
  };

  select.onchange = () => renderDay(Number(select.value));
  if (snapshots.length > 0) renderDay(snapshots[snapshots.length - 1].day);
}

async function renderDialogueTab(container, simId) {
  container.innerHTML = '<p style="color:var(--text-dim);margin-top:1rem">Loading dialogue...</p>';
  const events = await results.events(simId, { type: 'dialogue_seen', limit: 500 });
  renderDialogueLog(container, events);
}

async function renderErrorsTab(container, simId) {
  container.innerHTML = '<p style="color:var(--text-dim);margin-top:1rem">Loading errors...</p>';
  const events = await results.events(simId, { type: 'api_error', limit: 200 });
  if (events.length === 0) {
    container.innerHTML = '<p style="color:var(--success);margin-top:1rem">No errors recorded.</p>';
    return;
  }
  container.innerHTML = '<div class="dialogue-log">' + events.map(e => `
    <div class="error-entry">
      <span class="path">${e.data.path || 'unknown'}</span>
      ${e.data.status ? `— ${e.data.status}` : ''}<br>
      Day ${e.day}, Run ${e.run}, Room ${e.room || '?'}<br>
      ${e.data.error || e.data.body || ''}
    </div>`).join('') + '</div>';
}
```

- [ ] **Step 2: Commit**

```bash
git add simulator/public/js/results.js
git commit -m "feat(simulator): add results view with progression chart and daily detail"
```

---

### Task 15: Dialogue Viewer + Compare View

**Files:**
- Create: `simulator/public/js/dialogue-viewer.js`
- Create: `simulator/public/js/compare.js`

- [ ] **Step 1: Implement dialogue viewer**

```javascript
// simulator/public/js/dialogue-viewer.js
export function renderDialogueLog(container, events) {
  if (events.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);margin-top:1rem">No dialogue recorded yet.</p>';
    return;
  }

  // Group by day
  const byDay = {};
  for (const e of events) {
    if (!byDay[e.day]) byDay[e.day] = [];
    byDay[e.day].push(e);
  }

  let html = '<div class="dialogue-log">';
  for (const [day, dayEvents] of Object.entries(byDay)) {
    html += `<div style="padding:0.5rem 0;color:var(--accent);font-size:0.75rem;border-top:1px solid var(--border)">Day ${day}</div>`;
    for (const e of dayEvents) {
      const d = e.data;
      html += `<div class="dialogue-entry">
        <div class="source">${d.source || 'unknown'} — Run ${e.run}, Room ${e.room || '?'}</div>
        <div class="jp-text">${d.text || ''}</div>
      </div>`;
    }
  }
  html += '</div>';
  container.innerHTML = html;
}
```

- [ ] **Step 2: Implement compare view**

```javascript
// simulator/public/js/compare.js
import { profiles, results } from './api.js';

let compareChart = null;

export async function renderCompare(appEl) {
  appEl.innerHTML = '<p style="color:var(--text-dim)">Loading profiles...</p>';
  const allProfiles = await profiles.list();

  // Only show profiles with completed or running simulations
  const withSims = allProfiles.filter(p => p.latestSim);

  appEl.innerHTML = `
    <h2 style="font-size:1rem;margin-bottom:1rem">Compare Profiles</h2>
    <div id="compare-select" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem">
      ${withSims.map(p => `
        <label class="btn btn-sm" style="display:flex;align-items:center;gap:0.4rem">
          <input type="checkbox" value="${p.latestSim.id}" data-name="${p.name}">
          ${p.name}
        </label>`).join('')}
    </div>
    <button class="btn btn-primary" id="compare-btn">Compare Selected</button>
    <div class="chart-container" style="margin-top:1rem"><canvas id="compare-chart"></canvas></div>
    <table class="compare-table" id="compare-table" style="display:none"></table>`;

  document.getElementById('compare-btn').onclick = async () => {
    const checked = [...document.querySelectorAll('#compare-select input:checked')];
    const simIds = checked.map(c => Number(c.value));
    const names = checked.map(c => c.dataset.name);
    if (simIds.length < 2) return alert('Select at least 2 profiles');
    await renderComparison(simIds, names);
  };
}

const COLORS = ['#4a9eff', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c'];

async function renderComparison(simIds, names) {
  const data = await results.compare(simIds);

  // Group by simulation
  const bySim = {};
  for (const row of data) {
    if (!bySim[row.simulation_id]) bySim[row.simulation_id] = { name: row.profile_name, points: [] };
    bySim[row.simulation_id].points.push({ day: row.day, words: row.total_known_words });
  }

  // Build chart
  const datasets = Object.entries(bySim).map(([simId, s], i) => ({
    label: s.name,
    data: s.points.map(p => ({ x: p.day, y: p.words })),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: 'transparent',
    tension: 0.3,
  }));

  const maxDay = Math.max(...data.map(d => d.day));
  const labels = Array.from({ length: maxDay }, (_, i) => `Day ${i + 1}`);

  const ctx = document.getElementById('compare-chart').getContext('2d');
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e0e6f0' } } },
      scales: {
        x: { ticks: { color: '#6b7a99' }, grid: { color: '#1e2d4a' } },
        y: { title: { display: true, text: 'Known Words', color: '#6b7a99' }, ticks: { color: '#6b7a99' }, grid: { color: '#1e2d4a' } },
      }
    }
  });

  // Build comparison table
  const table = document.getElementById('compare-table');
  table.style.display = 'table';
  const lastDay = {};
  for (const [simId, s] of Object.entries(bySim)) {
    const last = s.points[s.points.length - 1];
    lastDay[simId] = last;
  }

  table.innerHTML = `
    <thead><tr><th>Profile</th><th>Days</th><th>Words Known</th><th>Avg Words/Day</th></tr></thead>
    <tbody>${Object.entries(bySim).map(([simId, s]) => {
      const last = lastDay[simId];
      const avg = last ? (last.words / last.day).toFixed(1) : '—';
      return `<tr><td>${s.name}</td><td>${last?.day || 0}</td><td>${last?.words || 0}</td><td>${avg}</td></tr>`;
    }).join('')}</tbody>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add simulator/public/js/dialogue-viewer.js simulator/public/js/compare.js
git commit -m "feat(simulator): add dialogue viewer and profile comparison view"
```

---

### Task 16: Integration Test — Full Simulation Smoke Test

**Files:**
- Create: `simulator/tests/integration/simulation.test.js`

- [ ] **Step 1: Write integration test**

This test requires the game server running with `ADMIN_SECRET` set. It's a smoke test, not a CI gate.

```javascript
// simulator/tests/integration/simulation.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createStore } from '../../db/store.js';
import { runSimulation } from '../../engine/runner.js';

const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-secret';

describe('simulation integration (requires game server)', { skip: !process.env.RUN_SIM_INTEGRATION }, () => {
  let tmpDir, store;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sim-int-'));
    store = createStore(join(tmpDir, 'test.db'));
  });

  after(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs a 1-day simulation with 1 run', async () => {
    const profileId = store.createProfile('Integration Test', {
      durationDays: 1,
      runsPerDay: 1,
      speedReviewAccuracy: 0.8,
      wordDiscoveryAccuracy: 1.0,
      combatSkill: 0.8,
      dailyPlayMinutes: 60,
    });
    const simId = store.createSimulation(profileId);
    const config = JSON.parse(store.getProfile(profileId).config);

    const result = await runSimulation(config, store, simId, GAME_SERVER_URL, ADMIN_SECRET);

    assert.ok(['complete', 'errored'].includes(result.status), `Unexpected status: ${result.status}`);

    // Should have logged some events
    const events = store.getEvents(simId, {});
    assert.ok(events.length > 0, 'Should have logged events');

    // Should have a day 1 snapshot
    const snapshots = store.getDailySnapshots(simId);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].day, 1);

    console.log(`Simulation complete: ${events.length} events, ${snapshots[0].total_known_words} words known`);
  });
});
```

- [ ] **Step 2: Run (only when game server is available)**

Run: `cd simulator && RUN_SIM_INTEGRATION=1 ADMIN_SECRET=test-secret node --test tests/integration/simulation.test.js`

- [ ] **Step 3: Commit**

```bash
git add simulator/tests/integration/simulation.test.js
git commit -m "test(simulator): add integration smoke test for full simulation"
```

---

### Task 17: Add simulator to .gitignore + README wiring

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore**

Add to `.gitignore`:

```
# Simulator data
simulator/data/
simulator/node_modules/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add simulator data and node_modules to gitignore"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Run all simulator unit tests**

Run: `cd simulator && node --test tests/unit/**/*.test.js`
Expected: All PASS

- [ ] **Step 2: Verify game server tests still pass**

Run: `npm test` (from project root)
Expected: All PASS

- [ ] **Step 3: Verify simulator starts**

Run: `cd simulator && node server.js`
Expected: Console shows "Simulator dashboard: http://localhost:3100"

- [ ] **Step 4: Open dashboard in browser**

Navigate to `http://localhost:3100` — should show the profiles view with "New Profile" button.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(simulator): address verification issues"
```
