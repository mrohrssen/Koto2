# Persistent Volume — Critical Writes Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move user SRS decks and word-knowledge writes from the ephemeral Railway container filesystem (`/app/data/`) to the persistent volume (`/app/persist/`), so user progress survives deploys.

**Architecture:** Switch the handful of writers/readers that point at `process.cwd()/data` or `join(__dirname, 'data')` to use `getDataDir()` / `dataPath()` from `src/data-dir.js`. Keep the committed repo data (dictionary, etc.) on the container filesystem — only per-user writes move.

**Tech Stack:** Node.js, ES modules, `node:test`, ts-fsrs, Express.

**Spec:** `docs/superpowers/specs/2026-04-17-persistent-volume-critical-writes-design.md`

---

## File Structure

**Modified files:**
- `src/game/bootstrap/word-knowledge.js` — split `DATA_DIR` into `DICT_DIR` (repo, stays) and per-call `getDataDir()` (volume, new).
- `server.js` — add `configureSrs({ dataDir: getDataDir() })` startup call; swap the `dataDir` passed to `createWordExposureRoutes`.
- `src/routes/admin.js` — delete an unused `dataSub` subdirectory branch.
- `.gitignore` — add repo-root patterns for per-user files that now land at the project root locally.

**New test files:**
- `tests/unit/word-knowledge-paths.test.js` — verifies save/load uses the test-overridable data directory.

---

## Task 1: Add failing test for word-knowledge save path

**Rationale:** `word-knowledge.js` currently hard-codes `process.cwd() + '/data'` for both writes and reads. Tests can't override this, and production writes to the ephemeral container filesystem. The test below pins the expected behavior: saves must land in the directory returned by `getDataDir()` (which tests can override via `setDataDirForTest`).

**Files:**
- Create: `tests/unit/word-knowledge-paths.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/word-knowledge-paths.test.js`:

```js
// tests/unit/word-knowledge-paths.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from '../helpers/tmp.js';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';

describe('word-knowledge save/load honors configured data dir', () => {
  let tmp, wk;

  before(async () => {
    tmp = await createTestTmpDir('word-knowledge-paths-');
    setDataDirForTest(tmp.path);
    wk = await import('../../src/game/bootstrap/word-knowledge.js');
  });

  after(async () => {
    resetDataDirForTest();
    await tmp.cleanup();
  });

  it('saveWordKnowledge writes into the configured data dir', () => {
    const knowledge = wk.createWordKnowledge('path-test-user');
    wk.registerExposure(knowledge, '森');
    wk.saveWordKnowledge(knowledge);

    const expected = join(tmp.path, 'word-knowledge-path-test-user.json');
    assert.ok(existsSync(expected), `expected file at ${expected}`);

    const parsed = JSON.parse(readFileSync(expected, 'utf-8'));
    assert.equal(parsed.userId, 'path-test-user');
    assert.equal(parsed.seen['森'].exposures, 1);
  });

  it('loadWordKnowledge reads from the configured data dir', () => {
    const loaded = wk.loadWordKnowledge('path-test-user');
    assert.ok(loaded);
    assert.equal(loaded.seen['森'].exposures, 1);
  });

  it('loadWordKnowledge returns null for missing users', () => {
    assert.equal(wk.loadWordKnowledge('nobody-here'), null);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/word-knowledge-paths.test.js`

Expected: FAIL. The first `it` block fails because `saveWordKnowledge` writes to `process.cwd()/data/...` (not `tmp.path`), so `existsSync(expected)` returns false.

---

## Task 2: Fix word-knowledge.js write path

**Files:**
- Modify: `src/game/bootstrap/word-knowledge.js`

- [ ] **Step 1: Split DATA_DIR into DICT_DIR + runtime getDataDir()**

Open `src/game/bootstrap/word-knowledge.js` and make these edits:

**Replace line 1-7** (imports + DATA_DIR constant):

```js
import fs from 'fs';
import path from 'path';
import { getDeckCards, createCard } from '../internal-srs.js';
import { State } from 'ts-fsrs';
import { loadWordDictionary } from '../word-dictionary.js';
import { getDataDir } from '../../data-dir.js';

// Dictionary lives in the repo (committed) — stays on the container FS.
const DICT_DIR = path.join(process.cwd(), 'data');
```

**Replace line 11** (dictionary loader):

```js
  if (!_wordDict) _wordDict = loadWordDictionary(DICT_DIR);
```

**Replace lines 130-142** (loadWordKnowledge + saveWordKnowledge):

```js
export function loadWordKnowledge(userId) {
  const filePath = path.join(getDataDir(), `word-knowledge-${userId}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveWordKnowledge(wk) {
  const filePath = path.join(getDataDir(), `word-knowledge-${wk.userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wk, null, 2));
}
```

- [ ] **Step 2: Run the new test and confirm it passes**

Run: `node --test tests/unit/word-knowledge-paths.test.js`

Expected: PASS (all 3 `it` blocks green).

- [ ] **Step 3: Run the full word-knowledge test suite to verify no regression**

Run: `node --test tests/unit/word-knowledge.test.js tests/unit/game/vocab-srs.test.js tests/integration/bootstrap-integration.test.js tests/integration/dialogue-bootstrap.test.js`

Expected: All tests pass.

- [ ] **Step 4: Syntax check**

Run: `node --check src/game/bootstrap/word-knowledge.js && echo OK`

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/game/bootstrap/word-knowledge.js tests/unit/word-knowledge-paths.test.js
git commit -m "fix: word-knowledge writes to persistent data dir

Split DATA_DIR into two: DICT_DIR (committed repo data, stays on
container FS) and per-call getDataDir() (volume-backed on Railway).
Fixes user word-knowledge being wiped on every Railway deploy.

Adds a path-behavior test that pins this via setDataDirForTest."
```

---

## Task 3: Wire SRS writes to the persistent volume at startup

**Rationale:** `internal-srs.js` already supports configurable `dataDir` via `configureSrs({ dataDir })`. Tests override it; production never calls it, so SRS decks default to `./data/`. Add a single startup call in `server.js`.

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Inspect current imports near the top of server.js**

Run: `grep -n "import.*internal-srs\|import.*data-dir" server.js`

Expected output includes: `import { dataPath } from './src/data-dir.js';` (line ~57). `internal-srs.js` is not yet imported at the top of `server.js`.

- [ ] **Step 2: Add the imports and startup call**

Open `server.js`. Find the line:

```js
import { dataPath } from './src/data-dir.js';
```

Change it to:

```js
import { dataPath, getDataDir } from './src/data-dir.js';
import { configureSrs } from './src/game/internal-srs.js';
```

Then find the line near the top-level module body where `loadSettings()` is first called (currently line ~131: `let settings = loadSettings();`). **Before** that line, insert:

```js
// Route FSRS deck writes to the persistent data dir (Railway volume in prod).
configureSrs({ dataDir: getDataDir() });
```

- [ ] **Step 3: Syntax check**

Run: `node --check server.js && echo OK`

Expected: `OK`.

- [ ] **Step 4: Verify the existing SRS tests still pass**

Run: `node --test tests/unit/game/vocab-srs.test.js`

Expected: all tests pass. (These tests call `configureSrs` themselves with a tempdir, so the new server.js wiring does not affect them.)

- [ ] **Step 5: Smoke-verify startup locally**

Run:

```bash
node server.js &
SERVER_PID=$!
sleep 3
kill $SERVER_PID 2>/dev/null
wait 2>/dev/null
echo "exit=$?"
```

Expected: the server prints its startup banner and stays alive until killed (no immediate crash, no `ReferenceError` / `TypeError` during module init). If `configureSrs` was wired incorrectly (e.g. misspelled import), node would exit non-zero within milliseconds — the `sleep 3` would finish and `kill` would have nothing to kill.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "fix: configure SRS data dir to persistent volume at startup

SRS deck writes defaulted to ./data/ (ephemeral on Railway). Wire
configureSrs to getDataDir() so decks land on /app/persist/ in prod.

Tests remain unaffected — they already call configureSrs with a
tempdir override."
```

---

## Task 4: Point admin word-exposure reader at the persistent volume

**Rationale:** `server.js:440-443` hard-codes `join(__dirname, 'data')` as the reader's `dataDir`. After Task 2 + 3, user word-knowledge and SRS files live on the volume; the reader needs to look there too. The `framesPath` stays unchanged because `data/dialogue/frames.json` is a committed repo file.

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update the route registration**

Open `server.js`. Find the block starting around line 440:

```js
app.use('/api/admin', createWordExposureRoutes({
  dataDir: join(__dirname, 'data'),
  framesPath: join(__dirname, 'data', 'dialogue', 'frames.json'),
}));
```

Replace with:

```js
app.use('/api/admin', createWordExposureRoutes({
  dataDir: getDataDir(),
  framesPath: join(__dirname, 'data', 'dialogue', 'frames.json'),
}));
```

Note: `getDataDir` was imported in Task 3, step 2 — no new import needed.

- [ ] **Step 2: Syntax check**

Run: `node --check server.js && echo OK`

Expected: `OK`.

- [ ] **Step 3: Run the admin-word-exposures unit tests**

Run: `node --test tests/unit/admin-word-exposures.test.js`

Expected: all tests pass. (The tests pass their own `tempDir` as the `dataDir` argument to `aggregateWordExposures`, so the server.js wiring change does not affect them.)

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "fix: admin word-exposures reads from persistent volume

The dashboard aggregator was pointed at ./data/ (ephemeral) while
writes now land on /app/persist/. Point the reader at getDataDir()
so the dashboard actually sees the accumulated data on Railway."
```

---

## Task 5: Remove unused dataSub branch in admin.js delete-user flow

**Rationale:** `src/routes/admin.js:193-201` has a `const dataSub = join(dataDir, 'data')` branch intended to delete per-user files from a `/data/` subdirectory. On Railway that resolves to `/app/persist/data/`, which has never existed — SRS and word-knowledge were being written to `/app/data/` (ephemeral), and npc-memory + dialogue caches have always been at `/app/persist/` root (the `dataDir` passed in). With the fix, all per-user files are flat at `dataDir`, so the subdir loop is pure dead code.

**Files:**
- Modify: `src/routes/admin.js`

- [ ] **Step 1: Read the current delete-user flow**

Run: `sed -n '185,205p' src/routes/admin.js`

Expected output (approximate):

```js
      // Delete all data files containing the userId
      const deleted = [];
      // Check root data dir (save files, npc-memory)
      for (const file of readdirSync(dataDir)) {
        if (file.includes(userId)) {
          try { unlinkSync(join(dataDir, file)); deleted.push(file); } catch (e) { /* skip */ }
        }
      }
      // Check data/ subdirectory (srs, word-knowledge, dialogue caches, creature memory)
      const dataSub = join(dataDir, 'data');
      if (existsSync(dataSub)) {
        for (const file of readdirSync(dataSub)) {
          if (file.includes(userId)) {
            try { unlinkSync(join(dataSub, file)); deleted.push(`data/${file}`); } catch (e) { /* skip */ }
          }
        }
      }

      // Remove user from users file
```

- [ ] **Step 2: Remove the dataSub branch**

Open `src/routes/admin.js`. Delete lines 193-201 (the `// Check data/ subdirectory` comment through the closing `}` of the `if (existsSync(dataSub))` block). The root-directory loop stays.

The block to delete is exactly:

```js
      // Check data/ subdirectory (srs, word-knowledge, dialogue caches, creature memory)
      const dataSub = join(dataDir, 'data');
      if (existsSync(dataSub)) {
        for (const file of readdirSync(dataSub)) {
          if (file.includes(userId)) {
            try { unlinkSync(join(dataSub, file)); deleted.push(`data/${file}`); } catch (e) { /* skip */ }
          }
        }
      }

```

(Including the trailing blank line that follows it.)

- [ ] **Step 3: Check if `existsSync` is still used in this file**

Run: `grep -n "existsSync" src/routes/admin.js`

If no other lines reference `existsSync`, also remove it from the fs import at the top of the file. If it is still used, leave the import alone.

- [ ] **Step 4: Syntax check**

Run: `node --check src/routes/admin.js && echo OK`

Expected: `OK`.

- [ ] **Step 5: Run admin route tests**

Run: `node --test tests/unit/admin-routes.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin.js
git commit -m "cleanup: remove dead dataSub branch in admin delete-user

The branch checked for per-user files in {dataDir}/data/ but nothing
was ever written there — per-user files live flat at dataDir root.
With SRS + word-knowledge now also flat on the volume, the root-dir
loop picks up every file type."
```

---

## Task 6: Update .gitignore for repo-root per-user files

**Rationale:** Locally, `getDataDir()` falls back to the project root (since `/app/persist/` doesn't exist). SRS and word-knowledge files will now land at the repo root instead of `./data/`. Existing `.gitignore` patterns don't cover these at the root, so `git status` would show them as untracked — same latent papercut that already exists for `npc-memory-u_*.json` and friends.

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add repo-root patterns**

Open `.gitignore`. Find the block near the top with the existing root-level patterns (right after the `.jrpg-*` entries, around line 3-7). Add this block immediately below them:

```
# Per-user runtime data (written to repo root when /app/persist/ is absent)
/srs-u_*.json
/word-knowledge-u_*.json
/npc-memory-u_*.json
/creature-memory-u_*.json
/npc-dialogue-cache-u_*.json
/creature-dialogue-cache-u_*.json
```

- [ ] **Step 2: Verify the patterns take effect**

Run: `git status --short | grep -E '^(\?\?|\s+M) (npc-memory-u|creature-memory-u|srs-u|word-knowledge-u)' || echo "clean"`

Expected: `clean`. (No previously-untracked per-user root files should be showing as untracked anymore.)

If any entries still appear, inspect them — they may be files that were `git add`ed in the past. Those need a separate cleanup (not part of this plan).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore per-user runtime files at repo root

getDataDir() falls back to the project root locally, so SRS and
word-knowledge files now land there in dev. Also covers the existing
npc-memory / dialogue-cache root-level files that were already
showing up as untracked."
```

---

## Task 7: Full verification

**Rationale:** The Task 1 unit test already pins the local path behavior. This task runs the full suite, confirms the server still boots, deploys, and verifies persistence across a Railway redeploy — which is the real test of whether this fix works.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass (unit + integration tiers).

- [ ] **Step 2: Confirm the server boots cleanly**

Run:

```bash
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
kill $DEV_PID 2>/dev/null
wait 2>/dev/null
```

Expected: HTTP `200` (Vite dev server up, backend proxying fine).

- [ ] **Step 3: Push dev and master**

Run:

```bash
git push origin dev
git push origin dev:master
```

Monitor the Railway production deploy via the dashboard until it finishes.

- [ ] **Step 4: Production smoke — register and play**

After Railway finishes deploying, open `https://jrpg-production.up.railway.app/` in a browser and register a throwaway account (e.g. username `volume-smoke`). Play far enough to expose at least one Japanese word (reach the first room transition after naming your creature — that's when `exposeWords` gets called).

- [ ] **Step 5: Confirm the dashboard reflects real data**

Open `https://jrpg-production.up.railway.app/admin-word-exposures.html` (authenticated with the admin secret from your env).

Expected: `totalUsers >= 1` and at least one row in the word table.

If `totalUsers` is still `0`: either the frontend hasn't hit an exposure API yet (play more), or the reader is still pointed at the wrong path — double-check Task 4.

- [ ] **Step 6: Verify persistence across a redeploy**

Trigger a no-op redeploy by pushing an empty commit to master:

```bash
git commit --allow-empty -m "chore: trigger redeploy to verify volume persistence"
git push origin master
```

Wait for Railway to finish the new deploy. Then reload `/admin-word-exposures.html`. The `totalUsers` count and word row from Step 5 **must still be present**.

If they disappeared, the volume wiring is broken — follow the Rollback Plan at the bottom of this document before deploying anything else.

- [ ] **Step 7: Clean up the smoke-test user**

Log into the admin UI (or use the delete-user API) and remove the `volume-smoke` account to keep production clean.

---

## Rollback Plan

If production verification (Task 7 Step 9) fails — i.e. user data disappears across a redeploy — revert the commits in reverse order:

```bash
git revert <task-7-commits> --no-edit
git revert <task-6-commit>  --no-edit
git revert <task-5-commit>  --no-edit
git revert <task-4-commit>  --no-edit
git revert <task-3-commit>  --no-edit
git revert <task-2-commit>  --no-edit
git push origin master
```

Since no migration was performed, whatever data accumulated on the volume during the broken window becomes unreadable by the reverted code (which will look at `./data/` instead). Users rebuild on next play — same outcome as any other deploy.
