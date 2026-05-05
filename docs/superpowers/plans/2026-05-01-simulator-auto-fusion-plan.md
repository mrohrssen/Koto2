# Simulator Auto-Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simulator-only auto-fusion after hub speed reviews and record a daily `fusions_performed` stat.

**Architecture:** Keep live game behavior untouched. Add a simulator helper that drives existing game fusion API routes, integrate it into the simulator runner after the hub review step, and persist/display a first-class daily snapshot counter. Use the server fusion routes as the source of truth so simulator logic does not duplicate recipe or inventory rules.

**Tech Stack:** Node.js ES modules, `node:test`, SQLite via `better-sqlite3`, simulator browser dashboard JavaScript.

---

## File Structure

- Create `simulator/engine/auto-fusion.js`: simulator-only helper that chooses and starts available fusions through `simCall`.
- Create `simulator/tests/unit/auto-fusion.test.js`: unit tests for recipe priority, repeat behavior, counting, and graceful failures.
- Modify `simulator/engine/runner.js`: call the helper after each hub review step and aggregate `fusionsPerformedToday`.
- Modify `simulator/db/schema.sql`: add `daily_snapshots.fusions_performed` for new databases.
- Modify `simulator/db/store.js`: migrate existing databases, save `fusions_performed`, and return it with snapshots.
- Modify `simulator/tests/unit/store.test.js`: verify the new stat is persisted and defaults safely.
- Modify `simulator/public/js/results.js`: show total and per-day fusions performed.

Do not modify `src/`, `public/game.js`, `public/js/ui/fusion-lab.js`, game routes, or any player-facing UI.

## Task 0: Isolate The Work

**Files:**
- No source files modified.

- [ ] **Step 1: Check current repo and worktree state**

Run:

```bash
/usr/bin/git rev-parse --show-toplevel
/usr/bin/git status --short
/usr/bin/git worktree list
```

Expected: repo root is `/Users/michiarohrssen/Documents/Claude/koto-dev`. There may be unrelated dirty files; do not revert them.

- [ ] **Step 2: Create an isolated implementation worktree**

Run from `/Users/michiarohrssen/Documents/Claude/koto-dev`:

```bash
/usr/bin/git worktree add ../koto-wt-simulator-auto-fusion -b feature/simulator-auto-fusion
```

Expected: new worktree exists at `/Users/michiarohrssen/Documents/Claude/koto-wt-simulator-auto-fusion`.

- [ ] **Step 3: Copy the approved spec and plan into the feature worktree**

Run:

```bash
cp docs/superpowers/specs/2026-05-01-simulator-auto-fusion-design.md ../koto-wt-simulator-auto-fusion/docs/superpowers/specs/2026-05-01-simulator-auto-fusion-design.md
cp docs/superpowers/plans/2026-05-01-simulator-auto-fusion-plan.md ../koto-wt-simulator-auto-fusion/docs/superpowers/plans/2026-05-01-simulator-auto-fusion-plan.md
```

Expected: both docs are present in the feature worktree.

## Task 1: Auto-Fusion Helper Tests

**Files:**
- Create: `simulator/tests/unit/auto-fusion.test.js`
- Create in Task 2: `simulator/engine/auto-fusion.js`

- [ ] **Step 1: Write failing helper tests**

Create `simulator/tests/unit/auto-fusion.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoFuseAvailableCreatures,
  selectAutoFusionRecipe
} from '../../engine/auto-fusion.js';

function makeSimCall(handlers, calls = []) {
  return async (method, path, body, context) => {
    calls.push({ method, path, body, context });
    const key = `${method} ${path}`;
    const handler = handlers[key];
    if (!handler) return { ok: false, error: `No handler for ${key}` };
    return handler({ method, path, body, context, calls });
  };
}

describe('simulator auto-fusion', () => {
  it('selects an unowned result before an already-owned result', () => {
    const recipe = selectAutoFusionRecipe([
      { id: 'owned-first', canFuse: true, resultOwned: 2 },
      { id: 'unowned-second', canFuse: true, resultOwned: 0 },
      { id: 'locked', canFuse: false, resultOwned: 0 }
    ]);

    assert.equal(recipe.id, 'unowned-second');
  });

  it('falls back to response recipe order when all fuseable results are owned', () => {
    const recipe = selectAutoFusionRecipe([
      { id: 'first-owned', canFuse: true, resultOwned: 1 },
      { id: 'second-owned', canFuse: true, resultOwned: 4 }
    ]);

    assert.equal(recipe.id, 'first-owned');
  });

  it('treats missing resultOwned as unowned', () => {
    const recipe = selectAutoFusionRecipe([
      { id: 'owned-first', canFuse: true, resultOwned: 1 },
      { id: 'missing-owned-count', canFuse: true }
    ]);

    assert.equal(recipe.id, 'missing-owned-count');
  });

  it('repeats fusion until no recipe can fuse', async () => {
    const calls = [];
    const states = [
      { recipes: [{ id: 'fire-cat', canFuse: true, resultOwned: 0 }] },
      { recipes: [{ id: 'stone-giant', canFuse: true, resultOwned: 0 }] },
      { recipes: [{ id: 'fire-cat', canFuse: false, resultOwned: 1 }] }
    ];
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({ ok: true, data: states.shift() }),
      'POST /api/game/fusion/start': () => ({ ok: true, data: { success: true } })
    }, calls);

    const result = await autoFuseAvailableCreatures(simCall);

    assert.deepEqual(result, {
      fusionsPerformed: 2,
      stoppedReason: 'no_available_recipe'
    });
    const startCalls = calls.filter(call => call.method === 'POST');
    assert.deepEqual(startCalls.map(call => call.body), [
      { recipeId: 'fire-cat' },
      { recipeId: 'stone-giant' }
    ]);
  });

  it('increments the counter only after successful fusion starts', async () => {
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({
        ok: true,
        data: { recipes: [{ id: 'fire-cat', canFuse: true, resultOwned: 0 }] }
      }),
      'POST /api/game/fusion/start': () => ({ ok: false, error: 'Not enough fusion cores' })
    });

    const result = await autoFuseAvailableCreatures(simCall);

    assert.deepEqual(result, {
      fusionsPerformed: 0,
      stoppedReason: 'start_failed'
    });
  });

  it('stops cleanly when fusion state cannot be fetched', async () => {
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({ ok: false, error: 'server unavailable' })
    });

    const result = await autoFuseAvailableCreatures(simCall);

    assert.deepEqual(result, {
      fusionsPerformed: 0,
      stoppedReason: 'state_failed'
    });
  });

  it('stops at the max fusion cap', async () => {
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({
        ok: true,
        data: { recipes: [{ id: 'repeatable', canFuse: true, resultOwned: 1 }] }
      }),
      'POST /api/game/fusion/start': () => ({ ok: true, data: { success: true } })
    });

    const result = await autoFuseAvailableCreatures(simCall, { maxFusions: 3 });

    assert.deepEqual(result, {
      fusionsPerformed: 3,
      stoppedReason: 'max_fusions_reached'
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test simulator/tests/unit/auto-fusion.test.js
```

Expected: FAIL with `Cannot find module ... simulator/engine/auto-fusion.js`.

- [ ] **Step 3: Commit failing tests**

Run:

```bash
/usr/bin/git add simulator/tests/unit/auto-fusion.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add simulator auto-fusion helper tests

EOF
)"
```

Expected: commit succeeds.

## Task 2: Auto-Fusion Helper Implementation

**Files:**
- Create: `simulator/engine/auto-fusion.js`
- Test: `simulator/tests/unit/auto-fusion.test.js`

- [ ] **Step 1: Implement the simulator-only helper**

Create `simulator/engine/auto-fusion.js`:

```js
export const DEFAULT_MAX_AUTO_FUSIONS = 20;

function isUnownedResult(recipe) {
  return !Number.isFinite(recipe?.resultOwned) || recipe.resultOwned <= 0;
}

export function selectAutoFusionRecipe(recipes = []) {
  const fuseable = recipes.filter(recipe => recipe?.canFuse === true);
  return fuseable.find(isUnownedResult) || fuseable[0] || null;
}

export async function autoFuseAvailableCreatures(simCall, options = {}) {
  const maxFusions = Number.isInteger(options.maxFusions) && options.maxFusions >= 0
    ? options.maxFusions
    : DEFAULT_MAX_AUTO_FUSIONS;
  let fusionsPerformed = 0;

  for (let attempt = 0; attempt < maxFusions; attempt++) {
    const stateResult = await simCall(
      'GET',
      '/api/game/fusion',
      null,
      `auto fusion state ${attempt}`
    );
    if (!stateResult.ok) {
      return { fusionsPerformed, stoppedReason: 'state_failed' };
    }

    const recipe = selectAutoFusionRecipe(stateResult.data?.recipes || []);
    if (!recipe) {
      return { fusionsPerformed, stoppedReason: 'no_available_recipe' };
    }

    const startResult = await simCall(
      'POST',
      '/api/game/fusion/start',
      { recipeId: recipe.id },
      `auto fusion start ${recipe.id}`
    );
    if (!startResult.ok || startResult.data?.error) {
      return { fusionsPerformed, stoppedReason: 'start_failed' };
    }

    fusionsPerformed++;
  }

  return { fusionsPerformed, stoppedReason: 'max_fusions_reached' };
}
```

- [ ] **Step 2: Run helper tests**

Run:

```bash
node --test simulator/tests/unit/auto-fusion.test.js
```

Expected: PASS.

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check simulator/engine/auto-fusion.js
```

Expected: no syntax errors.

- [ ] **Step 4: Commit helper implementation**

Run:

```bash
/usr/bin/git add simulator/engine/auto-fusion.js simulator/tests/unit/auto-fusion.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Add simulator auto-fusion helper

EOF
)"
```

Expected: commit succeeds.

## Task 3: Runner Integration

**Files:**
- Modify: `simulator/engine/runner.js`
- Test: `simulator/tests/unit/auto-fusion.test.js`

- [ ] **Step 1: Import the helper**

In `simulator/engine/runner.js`, add the import after the existing simulator engine imports:

```js
import { createSimCaller } from './sim-call.js';
import { createTestUser, seedStartingVocab, advanceTime } from './auth.js';
import { getRoomHandler } from './rooms/index.js';
import { runCrestCycle } from './crest-cycle.js';
import { autoFuseAvailableCreatures } from './auto-fusion.js';
```

- [ ] **Step 2: Add the daily counter**

In `runSimulation()`, near the existing daily counters, add `fusionsPerformedToday`:

```js
      let runsCompleted = 0;
      let runsWiped = 0;
      let wordsImmersedToday = 0;
      let hubReviewsToday = 0;
      let fusionsPerformedToday = 0;
      const crestDaily = {
        chestsOpenedTotal: 0,
        equipChangesTotal: 0,
        dropsSpentTotal: 0,
        runsWithCrestCycle: 0
      };
```

- [ ] **Step 3: Run auto-fusion after the hub review step**

In `simulator/engine/runner.js`, replace the block after hub review and before crest cycle with this shape:

```js
        // Hub speed review — complete all due reviews between runs
        const dueResult = await simCall('GET', '/api/game/known-words/due-words', null, `day ${day} run ${run} due words`);
        if (dueResult.ok) {
          const dueWords = dueResult.data?.words ?? [];
          for (const entry of dueWords) {
            const word = entry.word ?? entry;
            if (!word) continue;
            const grade = Math.random() < config.speedReviewAccuracy ? 'good' : 'again';
            await simCall('POST', '/api/game/known-words/review', { word, grade }, `hub review ${word}`);
            hubReviewsToday++;
          }
        }

        // Simulator-only auto-fusion. This models an optimizing player after hub reviews
        // without changing live game behavior or UI.
        const autoFusionResult = await autoFuseAvailableCreatures(simCall);
        fusionsPerformedToday += autoFusionResult.fusionsPerformed;

        // Crest meta progression — open all affordable chests and auto-equip best per element.
        pos.room = 0;
```

This intentionally runs even when `dueResult` fails or has zero due words.

- [ ] **Step 4: Save the daily snapshot stat**

In the `store.saveDailySnapshot()` call in `simulator/engine/runner.js`, add `fusions_performed`:

```js
      store.saveDailySnapshot(simId, day, {
        total_known_words: totalKnownWords,
        new_words_today: Math.max(0, totalKnownWords - dayStartCount),
        words_exposed_today: wordsImmersedToday,
        dialogue_lines_encountered: 0,
        runs_completed: runsCompleted,
        runs_wiped: runsWiped,
        rooms_explored: roomsExplored,
        speed_reviews_completed: hubReviewsToday,
        fusions_performed: fusionsPerformedToday,
        unknown_words_in_dialogue: 0,
        snapshot_data: {
          crestCycle: crestDaily
        }
      });
```

If the existing `snapshot_data` object already contains more fields, keep them and only add `fusions_performed` at the top level.

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check simulator/engine/runner.js
node --check simulator/engine/auto-fusion.js
```

Expected: no syntax errors.

- [ ] **Step 6: Run helper tests**

Run:

```bash
node --test simulator/tests/unit/auto-fusion.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit runner integration**

Run:

```bash
/usr/bin/git add simulator/engine/runner.js
/usr/bin/git commit -m "$(cat <<'EOF'
Run simulator auto-fusion after hub reviews

EOF
)"
```

Expected: commit succeeds.

## Task 4: Snapshot Schema And Store

**Files:**
- Modify: `simulator/db/schema.sql`
- Modify: `simulator/db/store.js`
- Test: `simulator/tests/unit/store.test.js`

- [ ] **Step 1: Update schema for new databases**

In `simulator/db/schema.sql`, add `fusions_performed` after `speed_reviews_completed`:

```sql
  rooms_explored INTEGER DEFAULT 0,
  speed_reviews_completed INTEGER DEFAULT 0,
  fusions_performed INTEGER DEFAULT 0,
  unknown_words_in_dialogue INTEGER DEFAULT 0,
  snapshot_data TEXT,
```

- [ ] **Step 2: Add additive migration for existing databases**

In `simulator/db/store.js`, after `db.exec(schema);`, add this helper and call:

```js
  function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some(column => column.name === columnName)) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
    }
  }

  ensureColumn('daily_snapshots', 'fusions_performed', 'INTEGER DEFAULT 0');
```

The top of `createStore()` should now include:

```js
export function createStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some(column => column.name === columnName)) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
    }
  }

  ensureColumn('daily_snapshots', 'fusions_performed', 'INTEGER DEFAULT 0');

  // --- Profiles ---
```

- [ ] **Step 3: Save the new snapshot field**

In `simulator/db/store.js`, update the `insertSnapshot` SQL:

```js
  const insertSnapshot = db.prepare(`
    INSERT OR REPLACE INTO daily_snapshots
      (simulation_id, day, total_known_words, new_words_today, words_exposed_today,
       dialogue_lines_encountered, runs_completed, runs_wiped, rooms_explored,
       speed_reviews_completed, fusions_performed, unknown_words_in_dialogue, snapshot_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
```

Then update `saveDailySnapshot()`:

```js
    saveDailySnapshot(simId, day, metrics) {
      insertSnapshot.run(
        simId, day,
        metrics.total_known_words ?? 0,
        metrics.new_words_today ?? 0,
        metrics.words_exposed_today ?? 0,
        metrics.dialogue_lines_encountered ?? 0,
        metrics.runs_completed ?? 0,
        metrics.runs_wiped ?? 0,
        metrics.rooms_explored ?? 0,
        metrics.speed_reviews_completed ?? 0,
        metrics.fusions_performed ?? 0,
        metrics.unknown_words_in_dialogue ?? 0,
        metrics.snapshot_data ? JSON.stringify(metrics.snapshot_data) : null
      );
    },
```

- [ ] **Step 4: Update store test expectations**

In `simulator/tests/unit/store.test.js`, update the first snapshot test to save and assert `fusions_performed`:

```js
      store.saveDailySnapshot(simId, 1, {
        total_known_words: 10,
        new_words_today: 5,
        words_exposed_today: 8,
        runs_completed: 2,
        fusions_performed: 3,
        snapshot_data: { details: 'extra info' }
      });
```

Add this assertion after the existing `new_words_today` assertion:

```js
      assert.equal(snapshots[0].fusions_performed, 3);
```

Add this assertion for the second snapshot:

```js
      assert.equal(snapshots[1].fusions_performed, 0);
```

- [ ] **Step 5: Add a migration-focused store test**

Add this import at the top of `simulator/tests/unit/store.test.js`:

```js
import Database from 'better-sqlite3';
```

Then append this complete test inside `describe('snapshots', () => { ... })`:

```js
    it('adds fusions_performed to existing snapshot tables', () => {
      const dbPath = join(tmpDir, 'legacy-snapshot.db');
      const legacyDb = new Database(dbPath);
      legacyDb.exec(`
        CREATE TABLE profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          config TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE simulations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL REFERENCES profiles(id),
          status TEXT NOT NULL DEFAULT 'pending',
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
        CREATE TABLE daily_snapshots (
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
          snapshot_data TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(simulation_id, day)
        );
        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          simulation_id INTEGER NOT NULL REFERENCES simulations(id),
          day INTEGER NOT NULL,
          run INTEGER NOT NULL,
          room INTEGER,
          event_type TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      legacyDb.close();

      const migratedStore = createStore(dbPath);
      migratedStore.close();

      const inspectionDb = new Database(dbPath);
      const columns = inspectionDb.prepare('PRAGMA table_info(daily_snapshots)').all();
      inspectionDb.close();

      assert.ok(columns.some(column => column.name === 'fusions_performed'));
    });
```

- [ ] **Step 6: Run store tests**

Run:

```bash
node --test simulator/tests/unit/store.test.js
```

Expected: PASS.

- [ ] **Step 7: Run syntax checks**

Run:

```bash
node --check simulator/db/store.js
```

Expected: no syntax errors.

- [ ] **Step 8: Commit schema and store changes**

Run:

```bash
/usr/bin/git add simulator/db/schema.sql simulator/db/store.js simulator/tests/unit/store.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Persist simulator fusions performed stat

EOF
)"
```

Expected: commit succeeds.

## Task 5: Dashboard Display

**Files:**
- Modify: `simulator/public/js/results.js`

- [ ] **Step 1: Add total fusions to summary calculations**

In `simulator/public/js/results.js`, inside `renderOverview()`, add `totalFusions` after `totalSpeedReviews`:

```js
  const totalSpeedReviews = snapshots.reduce((s, d) => s + (d.speed_reviews_completed || 0), 0);
  const totalFusions = snapshots.reduce((s, d) => s + (d.fusions_performed || 0), 0);
  const latest = snapshots[snapshots.length - 1];
```

- [ ] **Step 2: Display total fusions in Collection summary**

In the Collection summary cards in `renderOverview()`, add a card after Creatures Befriended:

```js
        <div class="stat-card">
          <div class="stat-value">${creaturesBefriended}</div>
          <div class="stat-label">Creatures Befriended</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalFusions}</div>
          <div class="stat-label">Fusions Performed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${itemsAcquired}</div>
          <div class="stat-label">Items Acquired</div>
        </div>
```

- [ ] **Step 3: Display per-day fusions**

In the daily detail card list in `showDay(day)`, add a stat card after Speed Reviews:

```js
        <div class="stat-card">
          <div class="stat-value">${snap.speed_reviews_completed || 0}</div>
          <div class="stat-label">Speed Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.fusions_performed || 0}</div>
          <div class="stat-label">Fusions Performed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.dialogue_lines_encountered || 0}</div>
          <div class="stat-label">Dialogue Lines</div>
        </div>
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
node --check simulator/public/js/results.js
```

Expected: no syntax errors.

- [ ] **Step 5: Commit dashboard changes**

Run:

```bash
/usr/bin/git add simulator/public/js/results.js
/usr/bin/git commit -m "$(cat <<'EOF'
Show simulator fusions performed stat

EOF
)"
```

Expected: commit succeeds.

## Task 6: Verification

**Files:**
- No intentional source edits except fixes found by verification.

- [ ] **Step 1: Run focused simulator tests**

Run:

```bash
node --test simulator/tests/unit/auto-fusion.test.js simulator/tests/unit/store.test.js
```

Expected: PASS.

- [ ] **Step 2: Run all simulator unit tests**

Run:

```bash
node --test 'simulator/tests/unit/**/*.test.js'
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks for edited simulator files**

Run:

```bash
node --check simulator/engine/auto-fusion.js
node --check simulator/engine/runner.js
node --check simulator/db/store.js
node --check simulator/public/js/results.js
```

Expected: all pass.

- [ ] **Step 4: Run the broader unit suite if time permits**

Run:

```bash
npm run test:unit
```

Expected: PASS. If unrelated dirty-branch failures appear, capture the failing test names and errors before deciding whether to fix or report.

- [ ] **Step 5: Read lints for edited files**

Use Cursor `ReadLints` for:

```text
simulator/engine/auto-fusion.js
simulator/engine/runner.js
simulator/db/store.js
simulator/public/js/results.js
```

Expected: no new linter errors in edited files.

- [ ] **Step 6: Verify no live game behavior was touched**

Run:

```bash
/usr/bin/git diff --name-only HEAD~4..HEAD
```

Expected: only simulator files plus the spec/plan docs:

```text
docs/superpowers/plans/2026-05-01-simulator-auto-fusion-plan.md
docs/superpowers/specs/2026-05-01-simulator-auto-fusion-design.md
simulator/db/schema.sql
simulator/db/store.js
simulator/engine/auto-fusion.js
simulator/engine/runner.js
simulator/public/js/results.js
simulator/tests/unit/auto-fusion.test.js
simulator/tests/unit/store.test.js
```

If the commit count differs, use `/usr/bin/git diff --name-only origin/dev...HEAD` instead and apply the same file-boundary check.

## Self-Review

- Spec coverage:
  - Simulator-only auto-fusion after hub review step: Tasks 2 and 3.
  - Uses existing fusion API routes, not live UI or direct state mutation: Task 2.
  - Unowned-result priority, then recipe response order: Task 1 and Task 2.
  - Repeat until no recipe can fuse or safety cap: Task 1 and Task 2.
  - First-class `fusions_performed` daily stat: Task 4.
  - Dashboard total and per-day display: Task 5.
  - No recipe-level analytics: plan does not add event logging.
- Placeholder scan: no TBD/TODO/fill-in instructions remain. The only conditional instruction is preserving existing `snapshot_data` fields if the branch has more fields than were visible during planning.
- Type consistency:
  - Helper returns `{ fusionsPerformed, stoppedReason }` in tests and implementation.
  - Snapshot field is consistently snake_case `fusions_performed`.
  - Runner local counter is consistently camelCase `fusionsPerformedToday`.
