# Kanji Kombat Reliability & Multi-User Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Koto server survive sustained Kanji Kombat play and 100+ concurrent users by eliminating the SRS rewrite storm, save bloat, users-file races, and crash landmines.

**Architecture:** Phase 1 fixes the hot path in place (sparse SRS storage with pure reads, slimmed action ledger, write-behind atomic saves, crash guards, idle eviction). Phase 2 moves shared mutable data (users, invites, reviews, KK leaderboard runs) to better-sqlite3. Phase 3 adds a bot load harness as the launch gate.

**Tech Stack:** Node 20+ ESM, Express 4, `node --test` + c8, better-sqlite3 (new dep, Phase 2 only).

**Spec:** `docs/superpowers/specs/2026-07-02-kanji-kombat-reliability-design.md`

## Global Constraints

- Route contracts unchanged: `/sync` keeps HTTP 200 `status:'corrected'` vs 409; optimistic routes keep snapshot/restore semantics. No client (`public/js`) changes.
- ES modules throughout; use `/usr/bin/git` for all git commands; run `node --check <file>` after editing any JS file.
- `npm test` (unit + integration) must pass at the end of every task. Run targeted tests during steps; the full suite before each commit.
- Sparse SRS storage rule: persist script-deck cards only when `(card.reps || 0) > 0`.
- Write-behind flush interval: 5000ms. Idle-manager eviction: 30 minutes. Action ledger cap stays 100 entries.
- Game saves serialize compact in production, pretty (2-space) when `NODE_ENV !== 'production'`.
- All new/changed persistence writes go through the atomic write helper (tmp + rename).
- Phase 3 pass criteria (launch gate): 100 bots × 30 min vs dev environment — p95 < 300ms, zero restarts, flat memory, 50-entry batches < 2s.
- Multiple Claude sessions share this repo: implement in a feature worktree branched off `dev` (see `CLAUDE.md`), e.g. `git worktree add ../koto-wt-kk-reliability -b feature/kk-reliability`.

---

## Phase 1 — Stop the hang

### Task 1: Atomic write helper

**Files:**
- Create: `src/atomic-write.js`
- Test: `tests/unit/atomic-write.test.js`

**Interfaces:**
- Produces: `writeFileAtomicSync(filePath: string, contents: string): void` — writes `${filePath}.tmp` then renames over `filePath`. Used by Tasks 2, 4, 5.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/atomic-write.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileAtomicSync } from '../../src/atomic-write.js';

describe('writeFileAtomicSync', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'atomic-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes new file content', () => {
    const file = join(dir, 'out.json');
    writeFileAtomicSync(file, '{"a":1}');
    assert.equal(readFileSync(file, 'utf-8'), '{"a":1}');
  });

  it('replaces existing content and leaves no tmp file', () => {
    const file = join(dir, 'out.json');
    writeFileSync(file, 'old');
    writeFileAtomicSync(file, 'new');
    assert.equal(readFileSync(file, 'utf-8'), 'new');
    assert.equal(existsSync(`${file}.tmp`), false);
  });

  it('cleans up tmp file when rename target dir vanishes mid-write', () => {
    const file = join(dir, 'sub', 'out.json');
    assert.throws(() => writeFileAtomicSync(file, 'x')); // sub/ does not exist
    assert.equal(existsSync(`${file}.tmp`), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/atomic-write.test.js`
Expected: FAIL — `Cannot find module '.../src/atomic-write.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/atomic-write.js
import { renameSync, unlinkSync, writeFileSync } from 'fs';

/**
 * Write a file atomically: write `${filePath}.tmp`, then rename over the
 * target. A crash mid-write can never leave a truncated target file.
 * Throws on failure (caller decides whether that is fatal); the tmp file
 * is cleaned up best-effort.
 */
export function writeFileAtomicSync(filePath, contents) {
  const tmpPath = `${filePath}.tmp`;
  try {
    writeFileSync(tmpPath, contents);
    renameSync(tmpPath, filePath);
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
    throw error;
  }
}
```

Note: `writeFileSync` to a missing parent dir throws before creating the tmp file — the third test passes because `unlinkSync` failure is swallowed.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-test-module-mocks --test tests/unit/atomic-write.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Route existing sync writes through the helper**

In `src/game/internal-srs.js`: add `import { writeFileAtomicSync } from '../atomic-write.js';`, and in `saveSrsData` replace

```js
    writeFileSync(filePath, JSON.stringify(serialized, null, 2));
```
with
```js
    writeFileAtomicSync(filePath, JSON.stringify(serialized, null, 2));
```

In `src/auth/users.js`: add `import { writeFileAtomicSync } from '../atomic-write.js';`, and in `saveUsers` replace `writeFileSync(filePath, JSON.stringify(data, null, 2));` with `writeFileAtomicSync(filePath, JSON.stringify(data, null, 2));` (this file is replaced in Phase 2, but the landmine gets closed now).

In `server.js`: add `import { writeFileAtomicSync } from './src/atomic-write.js';`, and in `saveSettings` replace `writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));` with `writeFileAtomicSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));`.

(Leave `src/game/manager-registry.js` alone — Task 4 rewrites its save path entirely.)

- [ ] **Step 6: Syntax-check and run the full suite**

Run: `node --check src/atomic-write.js && node --check src/game/internal-srs.js && node --check src/auth/users.js && node --check server.js && npm test`
Expected: all checks OK, suite PASS

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/atomic-write.js tests/unit/atomic-write.test.js src/game/internal-srs.js src/auth/users.js server.js
/usr/bin/git commit -m "feat: atomic tmp+rename writes for srs/users/settings"
```

---

### Task 2: Sparse SRS storage with pure reads

**Files:**
- Modify: `src/game/script-srs.js` (seeding, reads, grading)
- Test: `tests/unit/game/script-srs-sparse.test.js` (new), `tests/unit/game/script-srs.test.js` (existing — update any assertion on persisted-file shape)

**Interfaces:**
- Consumes: `loadSrsData/saveSrsData/gradeCard/getDeckCards` from `src/game/internal-srs.js` (unchanged); `getStaticScriptCards(type)`, `SCRIPT_CARD_TYPES` from `src/game/script-decks.js` (unchanged).
- Produces: all existing `script-srs.js` exports keep their exact signatures and return shapes (merged 4,142-card views). New export: `clearScriptDeckMemo(userId: string): void` (consumed by Task 4 eviction).

**Design:** the persisted `data.script.cards` array becomes *sparse* (only cards with `reps > 0`). A module-level memo caches the merged view (static deck + sparse overlay) per user. Reads never write. `gradeScriptCard` inserts the static card into sparse storage on first grade.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/game/script-srs-sparse.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  configureSrs, clearSrsCache, clearSrsData, loadSrsData, saveSrsData,
} from '../../../src/game/internal-srs.js';
import {
  ensureScriptDeckSeeded, getScriptCards, getDueScriptCardsForTypes,
  gradeScriptCard, clearScriptDeckMemo, SCRIPT_DECK,
} from '../../../src/game/script-srs.js';

const USER = 'sparse-test-user';

describe('sparse script SRS storage', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'srs-sparse-'));
    configureSrs({ dataDir: dir });
    clearSrsData(USER);
    clearScriptDeckMemo(USER);
  });
  afterEach(() => {
    clearSrsData(USER);
    clearScriptDeckMemo(USER);
    configureSrs({ dataDir: 'data/' });
    rmSync(dir, { recursive: true, force: true });
  });

  const srsFile = () => join(dir, `srs-${USER}.json`);

  it('reads never write to disk', () => {
    ensureScriptDeckSeeded(USER); // may write once (seed structures)
    const before = statSync(srsFile()).mtimeMs;
    for (let i = 0; i < 20; i++) {
      getScriptCards(USER);
      getDueScriptCardsForTypes(USER);
    }
    assert.equal(statSync(srsFile()).mtimeMs, before);
  });

  it('merged view exposes the full static deck', () => {
    const cards = getScriptCards(USER);
    assert.ok(cards.length >= 4000, `expected full deck, got ${cards.length}`);
  });

  it('persists only graded cards', () => {
    const first = getScriptCards(USER, 'hiragana')[0];
    gradeScriptCard(USER, first.id, 'good');
    const stored = JSON.parse(readFileSync(srsFile(), 'utf-8'));
    assert.equal(stored[SCRIPT_DECK].cards.length, 1);
    assert.equal(stored[SCRIPT_DECK].cards[0].id, first.id);
    assert.ok(stored[SCRIPT_DECK].cards[0].reps > 0);
  });

  it('graded progress survives cache clear via merge', () => {
    const first = getScriptCards(USER, 'hiragana')[0];
    gradeScriptCard(USER, first.id, 'good');
    clearSrsCache(USER);
    clearScriptDeckMemo(USER);
    const reloaded = getScriptCards(USER).find(c => c.id === first.id);
    assert.ok(reloaded.reps > 0);
    assert.equal(getScriptCards(USER).length >= 4000, true);
  });

  it('compacts legacy fat files on first load', () => {
    // Simulate the old format: every static card persisted, one with progress
    clearSrsCache(USER);
    clearScriptDeckMemo(USER);
    const data = loadSrsData(USER);
    const fatCards = getScriptCards(USER).map(c => ({ ...c }));
    fatCards[0] = { ...fatCards[0], reps: 3, state: 2 };
    data[SCRIPT_DECK] = { cards: fatCards };
    saveSrsData(USER, data);
    clearSrsCache(USER);
    clearScriptDeckMemo(USER);

    ensureScriptDeckSeeded(USER); // triggers compaction
    const stored = JSON.parse(readFileSync(srsFile(), 'utf-8'));
    assert.equal(stored[SCRIPT_DECK].cards.length, 1);
    assert.equal(stored[SCRIPT_DECK].cards[0].id, fatCards[0].id);
    // merged view still full and carries the progress
    const merged = getScriptCards(USER).find(c => c.id === fatCards[0].id);
    assert.equal(merged.reps, 3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-test-module-mocks --test tests/unit/game/script-srs-sparse.test.js`
Expected: FAIL — `clearScriptDeckMemo` is not exported (and "reads never write" fails against current code).

- [ ] **Step 3: Rewrite the storage/merge core of `src/game/script-srs.js`**

Replace the `mergeStaticCard` / `ensureScriptDeckSeeded` / `migrateLegacyKanaData` / `getScriptCards` / `gradeScriptCard` block (keep every other function — they already route through `getScriptCards` and stay pure automatically):

```js
// --- Sparse storage + merged-view memo -------------------------------------
// Persisted form (data[SCRIPT_DECK].cards): ONLY cards with reps > 0.
// Read form: full static deck with per-user FSRS progress overlaid, memoized
// per user and invalidated on grade/insert or via clearScriptDeckMemo.

const mergedDeckMemo = new Map(); // userId -> { dataRef, cards }

export function clearScriptDeckMemo(userId) {
  mergedDeckMemo.delete(userId);
}

function mergeStaticCard(existing, staticCard) {
  const card = {
    ...staticCard,
    ...createEmptyCard(),
    ...fsrsFieldsFrom(existing),
  };
  if (card.radicals) card.radicals = { ...card.radicals };
  return card;
}

function buildMergedDeck(data) {
  const byId = new Map((data[SCRIPT_DECK]?.cards || []).map(card => [card.id, card]));
  const merged = [];
  for (const type of SCRIPT_CARD_TYPES) {
    for (const staticCard of getStaticScriptCards(type)) {
      merged.push(mergeStaticCard(byId.get(staticCard.id), staticCard));
    }
  }
  return merged;
}

function getMergedDeck(userId) {
  const data = loadSrsData(userId);
  const memo = mergedDeckMemo.get(userId);
  if (memo && memo.dataRef === data) return memo.cards;
  const cards = buildMergedDeck(data);
  mergedDeckMemo.set(userId, { dataRef: data, cards });
  return cards;
}

const STATIC_IDS = new Set(
  SCRIPT_CARD_TYPES.flatMap(type => getStaticScriptCards(type).map(card => card.id))
);

/**
 * Ensure sparse structures exist, run one-time migrations, and compact
 * legacy fat files (drop reps===0 cards and unknown ids). Writes to disk
 * ONLY when something actually changed. Returns the merged deck.
 */
export function ensureScriptDeckSeeded(userId) {
  const data = loadSrsData(userId);
  let dirty = false;

  if (!data[SCRIPT_DECK]) {
    data[SCRIPT_DECK] = { cards: [] };
    dirty = true;
  }

  dirty = migrateLegacyKanaData(data) || dirty;

  const compacted = data[SCRIPT_DECK].cards.filter(
    card => (card.reps || 0) > 0 && STATIC_IDS.has(card.id)
  );
  if (compacted.length !== data[SCRIPT_DECK].cards.length) {
    data[SCRIPT_DECK].cards = compacted;
    dirty = true;
  }

  if (dirty) {
    saveSrsData(userId, data);
    clearScriptDeckMemo(userId);
  }
  return getMergedDeck(userId);
}

function migrateLegacyKanaData(data) {
  if (data.scriptMigration?.kanaToScript) return false;
  const legacyCards = data.kana?.cards || [];
  if (legacyCards.length) {
    const legacyByChar = new Map(legacyCards.map(card => [card.char, card]));
    const migrated = [];
    for (const staticCard of getStaticScriptCards('hiragana')) {
      const legacy = legacyByChar.get(staticCard.prompt);
      if (legacy && (legacy.reps || 0) > 0) {
        migrated.push({ id: staticCard.id, type: 'hiragana', ...fsrsFieldsFrom(legacy) });
      }
    }
    const existingIds = new Set(data[SCRIPT_DECK].cards.map(card => card.id));
    for (const card of migrated) {
      if (!existingIds.has(card.id)) data[SCRIPT_DECK].cards.push(card);
    }
  }
  data.scriptMigration = { ...(data.scriptMigration || {}), kanaToScript: true };
  return true;
}

export function getScriptCards(userId, type = null) {
  ensureScriptDeckSeeded(userId); // no-op (no write) after first call
  const cards = getMergedDeck(userId);
  return type ? cards.filter(card => card.type === type) : cards;
}

export function gradeScriptCard(userId, cardId, grade) {
  const data = loadSrsData(userId);
  if (!data[SCRIPT_DECK]) ensureScriptDeckSeeded(userId);
  const stored = data[SCRIPT_DECK].cards.find(card => card.id === cardId);
  if (!stored) {
    const merged = getMergedDeck(userId).find(card => card.id === cardId);
    if (!merged) throw new Error(`Card ${cardId} not found in deck '${SCRIPT_DECK}'`);
    data[SCRIPT_DECK].cards.push({ ...merged });
  }
  const result = gradeCard(userId, SCRIPT_DECK, cardId, grade);
  clearScriptDeckMemo(userId);
  return result;
}
```

Notes for the implementer:
- **Intentional deviation from the spec:** the spec proposed a persisted `deckVersion` content-hash stamp to re-trigger seeding when the static deck changes. Read-time merging makes that unnecessary — the merged view is always built from the *current* static deck plus the sparse overlay, so static-deck changes propagate automatically with no stamp and no re-seed pass. Same goal, less machinery.
- Keep the existing imports; `createEmptyCard` comes from `ts-fsrs`, `fsrsFieldsFrom` already exists in this file.
- `migrateLegacyKanaData` changes shape: it now returns a boolean and pushes only progressed hiragana cards into sparse storage (id + type + FSRS fields — the static merge supplies the rest at read time). It marks itself done exactly once, so `ensureScriptDeckSeeded` writes at most once per user lifetime plus once per compaction.
- The pushed sparse card in `gradeScriptCard` includes static metadata (harmless — compaction keeps it because reps>0 after grading; storage stays small because only graded cards are stored).
- Do NOT change `isScriptTypeGraduated` semantics: unreviewed merged cards have `state: 0` (New), so a type only graduates when every card was reviewed to `State.Review` — same as before.

- [ ] **Step 4: Run the new + existing SRS tests**

Run: `node --experimental-test-module-mocks --test tests/unit/game/script-srs-sparse.test.js tests/unit/game/script-srs.test.js`
Expected: sparse tests PASS. If `script-srs.test.js` asserts the *persisted file* contains all cards, update those assertions to check the merged view (`getScriptCards`) instead — behavior assertions (due ordering, graduation, daily limits) must pass unmodified.

- [ ] **Step 5: Run KK service + routes unit tests (heaviest consumers)**

Run: `node --experimental-test-module-mocks --test tests/unit/game/kanji-kombat-*.test.js tests/unit/routes/kanji-kombat-*.test.js tests/unit/combat/kanji-kombat-*.test.js`
Expected: PASS. Any failure here means merged-view semantics drifted — fix before proceeding.

- [ ] **Step 6: Full suite + syntax check**

Run: `node --check src/game/script-srs.js && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/game/script-srs.js tests/unit/game/script-srs-sparse.test.js tests/unit/game/script-srs.test.js
/usr/bin/git commit -m "perf: sparse script SRS storage with pure reads"
```

---

### Task 3: Slim the action ledger

**Files:**
- Modify: `src/game/services/action-ledger-service.js`
- Test: `tests/unit/game/action-ledger-slim.test.js` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `rememberActionLedgerResult` strips `state` and `authoritativeState` from stored responses; `normalizeActionLedger` strips them from previously persisted entries. Signatures unchanged. All callers (`optimistic-action-response.js`, `kanji-kombat-service.js`, `explore-session-sync-service.js`) keep working unmodified — the replay path in `runOptimisticAction` already refreshes state (`state: enrichedState(req) || existing.response.state || null`).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/game/action-ledger-slim.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActionLedgerEntry,
  normalizeActionLedger,
  rememberActionLedgerResult,
} from '../../../src/game/services/action-ledger-service.js';

const ACTION_ID = 'act_0123456789abcdef0123456789abcdef';

describe('action ledger slimming', () => {
  it('strips state fields when remembering', () => {
    const owner = {};
    rememberActionLedgerResult(owner, {
      actionId: ACTION_ID,
      actionType: 'kanjiKombat.intro',
      response: { status: 'accepted', next: 'quiz', state: { huge: true }, authoritativeState: { huge: true } },
    });
    const entry = getActionLedgerEntry(owner, ACTION_ID);
    assert.equal(entry.response.status, 'accepted');
    assert.equal(entry.response.next, 'quiz');
    assert.equal('state' in entry.response, false);
    assert.equal('authoritativeState' in entry.response, false);
  });

  it('strips state fields from previously persisted entries on normalize', () => {
    const owner = {
      actionLedger: {
        entries: {
          [ACTION_ID]: {
            actionId: ACTION_ID,
            actionType: 'kanjiKombat.intro',
            response: { status: 'accepted', state: { legacy: 'blob' }, authoritativeState: null },
            recordedAt: 1,
          },
        },
        order: [ACTION_ID],
      },
    };
    normalizeActionLedger(owner);
    assert.equal('state' in owner.actionLedger.entries[ACTION_ID].response, false);
    assert.equal('authoritativeState' in owner.actionLedger.entries[ACTION_ID].response, false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-test-module-mocks --test tests/unit/game/action-ledger-slim.test.js`
Expected: FAIL — `'state' in entry.response` is `true`.

- [ ] **Step 3: Implement in `src/game/services/action-ledger-service.js`**

Add after `createEntriesMap()`:

```js
const STRIPPED_RESPONSE_FIELDS = ['state', 'authoritativeState'];

function slimResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const slim = { ...response };
  for (const field of STRIPPED_RESPONSE_FIELDS) delete slim[field];
  return slim;
}
```

In `rememberActionLedgerResult`, change `response: cloneValue(response),` to `response: cloneValue(slimResponse(response)),`.

In `normalizeActionLedger`, after `pruneLedger(ledger); syncEntriesToOrder(ledger);` insert (before `return ledger;`):

```js
  for (const actionId of ledger.order) {
    const entry = ledger.entries[actionId];
    if (entry && entry.response) entry.response = slimResponse(entry.response);
  }
```

- [ ] **Step 4: Run new test + replay consumers**

Run: `node --experimental-test-module-mocks --test tests/unit/game/action-ledger-slim.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-session-sync.test.js`
Expected: PASS — replays still return `status`/action fields, with state refreshed by the route layer.

- [ ] **Step 5: Full suite + syntax check**

Run: `node --check src/game/services/action-ledger-service.js && npm test`
Expected: PASS. If an integration test asserts a replayed response's `state` matches the *stored* state, update it to assert state is present-and-fresh (it comes from `enrichedState(req)` now).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/game/services/action-ledger-service.js tests/unit/game/action-ledger-slim.test.js
/usr/bin/git commit -m "perf: stop persisting game-state snapshots in action ledger"
```

---

### Task 4: Write-behind saves + idle eviction in manager-registry

**Files:**
- Modify: `src/game/manager-registry.js`
- Modify: `src/auth/routes.js` (flush on logout — see note in Step 3; only if a logout route exists, otherwise skip)
- Test: `tests/unit/game/manager-registry.test.js` (extend), `tests/unit/game/manager-write-behind.test.js` (new)

**Interfaces:**
- Consumes: `writeFileAtomicSync` (Task 1), `clearSrsCache` from `internal-srs.js`, `clearScriptDeckMemo` (Task 2).
- Produces (new exports from `manager-registry.js`):
  - `flushManager(userId: string): void` — immediate atomic write (the old `saveManager` body).
  - `flushAllDirty(): void` — flush every dirty manager (used by Task 5 shutdown/crash paths).
  - `evictIdleManagers({ now = Date.now(), idleMs = 30*60*1000 } = {}): number` — flush-if-dirty then evict managers idle past `idleMs`; clears the user's SRS cache + deck memo; returns eviction count.
  - `startMaintenanceLoop({ flushIntervalMs = 5000, evictionIntervalMs = 60000 } = {})` / `stopMaintenanceLoop()` — unref'd timers; started only by `server.js` (Task 5), never by tests or `createApp`.
  - `saveManager(userId)` KEEPS its name/signature but now marks dirty (all ~10 existing call sites unchanged).
  - `removeManager(userId)` now flushes-if-dirty before deleting (preserves current immediate-persist expectation of `ranked-bot-seeder.js` and `user-data-reset.js`).
  - `clearManagersForTest()` additionally clears dirty set and stops timers WITHOUT writing.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/game/manager-write-behind.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import {
  getManager, saveManager, flushManager, flushAllDirty,
  evictIdleManagers, removeManager, clearManagersForTest, getSaveFilePath,
} from '../../../src/game/manager-registry.js';

const USER = 'wb-user';

describe('write-behind manager saves', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wb-'));
    setDataDirForTest(dir);
    clearManagersForTest();
  });
  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saveManager marks dirty without writing; flushManager writes', () => {
    getManager(USER);
    saveManager(USER);
    assert.equal(existsSync(getSaveFilePath(USER)), false);
    flushManager(USER);
    assert.equal(existsSync(getSaveFilePath(USER)), true);
  });

  it('flushAllDirty persists every dirty manager once', () => {
    getManager('wb-a'); saveManager('wb-a');
    getManager('wb-b'); saveManager('wb-b');
    flushAllDirty();
    assert.equal(existsSync(getSaveFilePath('wb-a')), true);
    assert.equal(existsSync(getSaveFilePath('wb-b')), true);
  });

  it('removeManager flushes dirty state before deleting', () => {
    const gm = getManager(USER);
    gm.meta.crystals = 42;
    saveManager(USER);
    removeManager(USER);
    const stored = JSON.parse(readFileSync(getSaveFilePath(USER), 'utf-8'));
    assert.equal(stored.meta.crystals, 42);
  });

  it('evictIdleManagers flushes and evicts only idle managers', () => {
    const gm = getManager(USER);
    gm.meta.crystals = 7;
    saveManager(USER);
    const evicted = evictIdleManagers({ now: Date.now() + 31 * 60 * 1000 });
    assert.equal(evicted, 1);
    const stored = JSON.parse(readFileSync(getSaveFilePath(USER), 'utf-8'));
    assert.equal(stored.meta.crystals, 7);
    // fresh access reloads from disk
    const reloaded = getManager(USER);
    assert.equal(reloaded.meta.crystals, 7);
  });

  it('recent activity prevents eviction', () => {
    getManager(USER);
    const evicted = evictIdleManagers({ now: Date.now() + 60 * 1000 });
    assert.equal(evicted, 0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-test-module-mocks --test tests/unit/game/manager-write-behind.test.js`
Expected: FAIL — `flushManager` not exported; first test fails because `saveManager` writes immediately.

- [ ] **Step 3: Implement in `src/game/manager-registry.js`**

Add imports:
```js
import { writeFileAtomicSync } from '../atomic-write.js';
import { clearSrsCache } from './internal-srs.js';
import { clearScriptDeckMemo } from './script-srs.js';
```

Add module state next to `const managers = new Map();`:
```js
const dirtyUsers = new Set();
const lastAccess = new Map(); // userId -> epoch ms
let flushTimer = null;
let evictionTimer = null;

const FLUSH_INTERVAL_MS = 5000;
const EVICTION_INTERVAL_MS = 60 * 1000;
const IDLE_EVICTION_MS = 30 * 60 * 1000;
```

In `getManager(userId)`: add `lastAccess.set(userId, Date.now());` as the first line (touch on every access, including the early-return cached path — put it before the `if (managers.has(userId))` check). At the end, replace `if (needsSave) saveManager(userId);` with `if (needsSave) flushManager(userId);` (migrations persist immediately, as today).

Replace `saveManager` and add the new functions:

```js
/**
 * Mark a user's state dirty. Persisted by the maintenance loop (~5s),
 * by flushManager/flushAllDirty, on removeManager, and at shutdown.
 * Keeps the historical name because ~10 call sites treat "saveManager"
 * as "persist this user's state".
 */
export function saveManager(userId) {
  if (!managers.has(userId)) return;
  lastAccess.set(userId, Date.now());
  dirtyUsers.add(userId);
}

/** Immediately serialize and atomically persist one user's state. */
export function flushManager(userId) {
  const manager = managers.get(userId);
  if (!manager) return;

  const saveFile = join(getDataDir(), `.jrpg-save-${userId}.json`);
  const state = {
    version: SAVE_VERSION,
    player: manager.player,
    meta: manager.getMeta(),
    run: manager.run || null,
    combat: manager.combat || null,
    savedAt: new Date().toISOString()
  };
  const json = process.env.NODE_ENV === 'production'
    ? JSON.stringify(state)
    : JSON.stringify(state, null, 2);
  writeFileAtomicSync(saveFile, json);
  dirtyUsers.delete(userId);
}

/** Flush every dirty manager. Never throws (logs and continues). */
export function flushAllDirty() {
  for (const userId of [...dirtyUsers]) {
    try {
      flushManager(userId);
    } catch (e) {
      console.warn(`[Registry] Flush failed for ${userId}:`, e.message);
    }
  }
}

/** Flush-if-dirty then drop managers idle longer than idleMs. */
export function evictIdleManagers({ now = Date.now(), idleMs = IDLE_EVICTION_MS } = {}) {
  let evicted = 0;
  for (const [userId] of managers) {
    const last = lastAccess.get(userId) || 0;
    if (now - last < idleMs) continue;
    try {
      if (dirtyUsers.has(userId)) flushManager(userId);
      managers.delete(userId);
      lastAccess.delete(userId);
      clearSrsCache(userId);
      clearScriptDeckMemo(userId);
      evicted += 1;
    } catch (e) {
      console.warn(`[Registry] Eviction failed for ${userId}:`, e.message);
    }
  }
  return evicted;
}

/** Started by server.js only. Timers are unref'd so they never hold the process open. */
export function startMaintenanceLoop({ flushIntervalMs = FLUSH_INTERVAL_MS, evictionIntervalMs = EVICTION_INTERVAL_MS } = {}) {
  stopMaintenanceLoop();
  flushTimer = setInterval(flushAllDirty, flushIntervalMs);
  flushTimer.unref?.();
  evictionTimer = setInterval(() => evictIdleManagers(), evictionIntervalMs);
  evictionTimer.unref?.();
}

export function stopMaintenanceLoop() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (evictionTimer) { clearInterval(evictionTimer); evictionTimer = null; }
}
```

Update `removeManager` and `clearManagersForTest`:

```js
export function removeManager(userId) {
  if (dirtyUsers.has(userId)) {
    try { flushManager(userId); } catch (e) {
      console.warn(`[Registry] Flush-on-remove failed for ${userId}:`, e.message);
    }
  }
  managers.delete(userId);
  lastAccess.delete(userId);
  dirtyUsers.delete(userId);
}

export function clearManagersForTest() {
  stopMaintenanceLoop();
  managers.clear();
  dirtyUsers.clear();
  lastAccess.clear();
}
```

Logout note: `src/auth/routes.js` registers `register`/`login`/`me`/`generate-invite`/`admin/users`/`delete-me` — there is **no logout endpoint** (JWTs just expire client-side), so there is no logout flush to add. The 5s loop + shutdown flush are the guarantees. `deleteMe` already routes through `user-data-reset.js` → `removeManager` → flush-then-delete.

**Intentional deviation from the spec:** the spec listed "run end" as an immediate-flush point. Run-end happens inside service code with no single route-level chokepoint; the ≤5s flush bound (the spec's own stated guarantee) covers it, so no per-route immediate flushes are added beyond `removeManager`/shutdown. Adding them later is a two-line change per route if the load test ever shows a reason.

- [ ] **Step 4: Run new + existing registry tests**

Run: `node --experimental-test-module-mocks --test tests/unit/game/manager-write-behind.test.js tests/unit/game/manager-registry.test.js tests/unit/game/user-data-reset.test.js`
Expected: new tests PASS. If `manager-registry.test.js` asserts `saveManager` writes immediately, update those assertions to call `flushManager` (grep it for `saveManager` first).

- [ ] **Step 5: Full suite**

Run: `node --check src/game/manager-registry.js && npm test`
Expected: PASS. Integration tests read state through the API (same in-memory manager), so write-behind is invisible to them; any test that reads a `.jrpg-save-*.json` file right after an API call must call `flushManager(userId)`/`flushAllDirty()` first — fix those call sites, not the registry.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/game/manager-registry.js tests/unit/game/manager-write-behind.test.js tests/unit/game/manager-registry.test.js
/usr/bin/git commit -m "perf: write-behind atomic saves and idle manager eviction"
```

---

### Task 5: Crash guards, SIGTERM flush, maintenance loop startup

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `flushAllDirty`, `startMaintenanceLoop`, `stopMaintenanceLoop` from `manager-registry.js` (Task 4).
- Produces: process-level guards; no new exports.

- [ ] **Step 1: Wire the maintenance loop and guards into `server.js`**

Extend the existing import at the top:

```js
import {
  getManager, saveManager, removeManager,
  flushAllDirty, startMaintenanceLoop, stopMaintenanceLoop
} from './src/game/manager-registry.js';
```

After `httpServer.listen(...)` add:

```js
startMaintenanceLoop();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('[Server] Shutdown:', { signal });
  stopMaintenanceLoop();
  try { flushAllDirty(); } catch (e) { console.error('[Server] Flush on shutdown failed:', e); }
  httpServer.close(() => process.exit(0));
  // Railway gives ~10s after SIGTERM; don't wait on stuck sockets forever.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  try { flushAllDirty(); } catch { /* best effort */ }
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
  try { flushAllDirty(); } catch { /* best effort */ }
  process.exit(1);
});
```

- [ ] **Step 2: Syntax check and boot smoke**

Run: `node --check server.js`
Expected: OK.

Run (boot + clean SIGTERM):
```bash
PORT=3999 node server.js & SERVER_PID=$!
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3999/   # expect 200
kill -TERM $SERVER_PID
wait $SERVER_PID; echo "exit=$?"                                   # expect exit=0, shutdown log line
```

- [ ] **Step 3: Full suite (server.js is not under test, but guards must not break imports)**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add server.js
/usr/bin/git commit -m "feat: crash guards, SIGTERM flush, save maintenance loop"
```

---

## Phase 2 — SQLite for shared data

### Task 6: db.js — schema, connection, JSON boot migration

**Files:**
- Create: `src/db.js`
- Test: `tests/unit/db.test.js`
- Modify: `package.json` (add dependency)

**Interfaces:**
- Consumes: `dataPath` from `src/data-dir.js`.
- Produces:
  - `getDb(): Database` — singleton keyed to `dataPath('koto.db')`; auto-reopens when the data dir changes (test isolation via `setDataDirForTest` works with no extra hooks).
  - `resetDbForTest(): void` — close + drop the singleton.
  - `migrateUsersJsonIfNeeded(jsonPath: string): { migrated: boolean, users: number }` — one-time import when the `users` table is empty and the JSON file exists.

- [ ] **Step 1: Install the dependency**

Run: `npm install better-sqlite3@^12`
Expected: installs with a prebuilt binary (no gyp build output). Verify: `node -e "import('better-sqlite3').then(m => console.log('ok', typeof m.default))"` → `ok function`.

- [ ] **Step 2: Write the failing tests**

```js
// tests/unit/db.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDataDirForTest, resetDataDirForTest } from '../../src/data-dir.js';
import { getDb, resetDbForTest, migrateUsersJsonIfNeeded } from '../../src/db.js';

describe('db.js', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'db-'));
    setDataDirForTest(dir);
    resetDbForTest();
  });
  afterEach(() => {
    resetDbForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates schema and enables WAL', () => {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    for (const t of ['users', 'invite_codes', 'reviews', 'kanji_kombat_runs']) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  });

  it('imports legacy users JSON exactly once', () => {
    const jsonPath = join(dir, '.jrpg-users.json');
    writeFileSync(jsonPath, JSON.stringify({
      users: [{
        id: 'u_1', username: 'alice', passwordHash: 'h', createdAt: '2026-01-01T00:00:00.000Z',
        encryptedApiKeys: { iv: 'x', data: 'y' },
        reviews: [{ ts: 1000 }],
        kanjiKombatRuns: [{ ts: 2000, wave: 5, wavesCleared: 4 }],
      }],
      inviteCodes: [{ code: 'NEO-TOKYO-abc', usedBy: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    }));

    const first = migrateUsersJsonIfNeeded(jsonPath);
    assert.deepEqual(first, { migrated: true, users: 1 });

    const db = getDb();
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM invite_codes').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM reviews').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM kanji_kombat_runs').get().c, 1);
    assert.equal(JSON.parse(db.prepare('SELECT encrypted_api_keys k FROM users').get().k).iv, 'x');

    const second = migrateUsersJsonIfNeeded(jsonPath);
    assert.equal(second.migrated, false);
  });

  it('no-ops when JSON file is absent', () => {
    assert.deepEqual(migrateUsersJsonIfNeeded(join(dir, 'nope.json')), { migrated: false, users: 0 });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --experimental-test-module-mocks --test tests/unit/db.test.js`
Expected: FAIL — `Cannot find module '.../src/db.js'`

- [ ] **Step 4: Implement `src/db.js`**

```js
import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { dataPath } from './data-dir.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  encrypted_api_keys TEXT,
  created_at TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_profile TEXT
);
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  used_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_user_ts ON reviews(user_id, ts);
CREATE TABLE IF NOT EXISTS kanji_kombat_runs (
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  waves_cleared INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kk_runs_ts ON kanji_kombat_runs(ts);
`;

let db = null;
let dbPath = null;

/** Singleton keyed to the current data dir (test overrides reopen automatically). */
export function getDb() {
  const wanted = dataPath('koto.db');
  if (db && dbPath === wanted) return db;
  if (db) { try { db.close(); } catch { /* already closed */ } }
  db = new Database(wanted);
  dbPath = wanted;
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

export function resetDbForTest() {
  if (db) { try { db.close(); } catch { /* already closed */ } }
  db = null;
  dbPath = null;
}

/**
 * One-time import of the legacy users JSON. Runs only when the users table
 * is empty and the file exists. The JSON file is never modified or deleted —
 * it remains a frozen pre-migration backup.
 */
export function migrateUsersJsonIfNeeded(jsonPath) {
  const database = getDb();
  const count = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0 || !jsonPath || !existsSync(jsonPath)) {
    return { migrated: false, users: 0 };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error('[DB] Legacy users JSON unreadable, skipping import:', e.message);
    return { migrated: false, users: 0 };
  }

  const users = Array.isArray(data.users) ? data.users : [];
  const invites = Array.isArray(data.inviteCodes) ? data.inviteCodes : [];

  const insertUser = database.prepare(`
    INSERT INTO users (id, username, password_hash, encrypted_api_keys, created_at, is_bot, bot_profile)
    VALUES (@id, @username, @passwordHash, @encryptedApiKeys, @createdAt, @isBot, @botProfile)
  `);
  const insertInvite = database.prepare(
    'INSERT INTO invite_codes (code, used_by, created_at) VALUES (@code, @usedBy, @createdAt)'
  );
  const insertReview = database.prepare('INSERT INTO reviews (user_id, ts) VALUES (?, ?)');
  const insertRun = database.prepare(
    'INSERT INTO kanji_kombat_runs (user_id, ts, wave, waves_cleared) VALUES (?, ?, ?, ?)'
  );

  const importAll = database.transaction(() => {
    for (const user of users) {
      insertUser.run({
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
        encryptedApiKeys: user.encryptedApiKeys ? JSON.stringify(user.encryptedApiKeys) : null,
        createdAt: user.createdAt || new Date().toISOString(),
        isBot: user.isBot ? 1 : 0,
        botProfile: user.botProfile ? JSON.stringify(user.botProfile) : null,
      });
      for (const review of user.reviews || []) {
        if (Number.isFinite(review?.ts)) insertReview.run(user.id, review.ts);
      }
      for (const run of user.kanjiKombatRuns || []) {
        if (Number.isFinite(run?.ts)) insertRun.run(user.id, run.ts, run.wave || 1, run.wavesCleared || 0);
      }
    }
    for (const invite of invites) {
      insertInvite.run({
        code: invite.code,
        usedBy: invite.usedBy || null,
        createdAt: invite.createdAt || new Date().toISOString(),
      });
    }
  });
  importAll();

  console.log(`[DB] Imported legacy users JSON: ${users.length} users, ${invites.length} invite codes (${jsonPath})`);
  return { migrated: true, users: users.length };
}
```

- [ ] **Step 5: Run tests**

Run: `node --check src/db.js && node --experimental-test-module-mocks --test tests/unit/db.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/db.js tests/unit/db.test.js package.json package-lock.json
/usr/bin/git commit -m "feat: sqlite db module with schema and legacy users import"
```

---

### Task 7: users.js on SQLite (same public API)

**Files:**
- Modify: `src/auth/users.js` (rewrite bodies), `src/auth/routes.js` (3 raw `loadUsers`+`saveUsers` call sites), `src/dev/dev-test-user.js` (1 call site), `src/app.js` (run migration), `tests/integration/helpers/test-app.js` (db reset in cleanup)
- Test: rewrite `tests/unit/auth/users.test.js` fixtures; new `tests/unit/auth/users-db.test.js` for leaderboards

**Interfaces:**
- Consumes: `getDb`, `migrateUsersJsonIfNeeded`, `resetDbForTest` (Task 6).
- Produces — unchanged signatures, DB-backed bodies (all `filePath` params remain accepted and are ignored): `loadUsers` (read-only dump `{users, inviteCodes}` — users WITHOUT `reviews`/`kanjiKombatRuns` arrays; verified callers only need identity/bot/invite fields), `createUserRecord`, `createUser`, `findUserByUsername`, `findUserById`, `createInviteCode`, `useInviteCode`, `updateUserKeys`, `migrateAiConsentForExistingUsers`, `addReview`, `recordKanjiKombatRun`, `getKanjiKombatLeaderboard`, `getLeaderboard`, `getUserKeys` (now cached), `isPersonalizedDialogueDebugUser` (unchanged).
- New exports: `setUserEncryptedApiKeys(userId, encryptedBlobOrNull)`, `setUserPasswordHash(userId, passwordHash)`, `deleteUserById(userId)`.
- **Removed export:** `saveUsers` (its 3 remaining callers are rewritten in this task).

- [ ] **Step 1: Write the failing leaderboard/DB tests**

```js
// tests/unit/auth/users-db.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';
import {
  createUserRecord, findUserById, findUserByUsername, deleteUserById,
  setUserPasswordHash, setUserEncryptedApiKeys, createInviteCode, useInviteCode,
  recordKanjiKombatRun, getKanjiKombatLeaderboard, addReview, getLeaderboard, loadUsers,
} from '../../../src/auth/users.js';

describe('users.js on sqlite', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'users-db-'));
    setDataDirForTest(dir);
    resetDbForTest();
  });
  afterEach(() => {
    resetDbForTest();
    resetDataDirForTest();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and finds users; duplicate username rejected', async () => {
    const user = await createUserRecord({ username: 'alice', password: 'secret123' });
    assert.equal(findUserById(user.id).username, 'alice');
    assert.equal(findUserByUsername('alice').id, user.id);
    await assert.rejects(
      () => createUserRecord({ username: 'alice', password: 'other1234' }),
      /Username already taken/
    );
  });

  it('invite codes are single-use', async () => {
    const code = createInviteCode(process.env.ADMIN_SECRET || 'x');
    const user = await createUserRecord({ username: 'bob', password: 'secret123' });
    assert.equal(useInviteCode(code, user.id), true);
    assert.equal(useInviteCode(code, user.id), false);
  });

  it('KK leaderboard ranks best wave per user, ties by earliest ts', async () => {
    const a = await createUserRecord({ username: 'aya', password: 'secret123' });
    const b = await createUserRecord({ username: 'ben', password: 'secret123' });
    const now = Date.now();
    recordKanjiKombatRun(a.id, { wave: 5, wavesCleared: 4, completedAt: now - 1000 });
    recordKanjiKombatRun(a.id, { wave: 3, wavesCleared: 2, completedAt: now - 500 });
    recordKanjiKombatRun(b.id, { wave: 5, wavesCleared: 4, completedAt: now - 2000 });
    const board = getKanjiKombatLeaderboard('24h', a.id);
    assert.equal(board.entries.length, 2);
    assert.equal(board.entries[0].username, 'ben'); // same wave, earlier ts
    assert.equal(board.entries[1].username, 'aya');
    assert.deepEqual(board.currentUser, { rank: 2, wave: 5 });
  });

  it('review leaderboard counts reviews in window', async () => {
    const a = await createUserRecord({ username: 'cara', password: 'secret123' });
    addReview(a.id);
    addReview(a.id);
    const board = getLeaderboard('daily', a.id);
    assert.equal(board.entries[0].username, 'cara');
    assert.equal(board.entries[0].count, 2);
    assert.deepEqual(board.currentUser, { rank: 1, count: 2 });
  });

  it('targeted mutations work and loadUsers dumps compat shape', async () => {
    const a = await createUserRecord({ username: 'dee', password: 'secret123' });
    setUserPasswordHash(a.id, 'newhash');
    setUserEncryptedApiKeys(a.id, { iv: 'i', data: 'd' });
    const dump = loadUsers();
    const row = dump.users.find(u => u.id === a.id);
    assert.equal(row.passwordHash, 'newhash');
    assert.deepEqual(row.encryptedApiKeys, { iv: 'i', data: 'd' });
    assert.ok(Array.isArray(dump.inviteCodes));
    deleteUserById(a.id);
    assert.equal(findUserById(a.id), null);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-test-module-mocks --test tests/unit/auth/users-db.test.js`
Expected: FAIL — `deleteUserById` not exported; users still file-backed.

- [ ] **Step 3: Rewrite `src/auth/users.js` bodies**

Keep the header exports `DEFAULT_FILE` (still exported? it is module-internal — keep the constant for `migrate` default arg compatibility) and `isPersonalizedDialogueDebugUser` unchanged. Replace file I/O with:

```js
import { randomBytes } from 'crypto';
import { hashPassword, encryptKeys, decryptKeys } from './crypto.js';
import { dataPath } from '../data-dir.js';
import { getDb } from '../db.js';

const DEFAULT_FILE = dataPath('.jrpg-users.json'); // legacy import source only
const PERSONALIZED_DIALOGUE_DEBUG_USERNAME = 'michia';

export function isPersonalizedDialogueDebugUser(user) {
  return (user?.username || '').toLowerCase() === PERSONALIZED_DIALOGUE_DEBUG_USERNAME;
}

function rowToUser(row) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    encryptedApiKeys: row.encrypted_api_keys ? JSON.parse(row.encrypted_api_keys) : null,
    createdAt: row.created_at,
  };
  if (row.is_bot) {
    user.isBot = true;
    user.botProfile = row.bot_profile ? JSON.parse(row.bot_profile) : {};
  }
  return user;
}

/**
 * Read-only compatibility dump in the legacy `{ users, inviteCodes }` shape.
 * users do NOT include reviews/kanjiKombatRuns arrays (no caller needs them).
 * All filePath parameters below are accepted and ignored (legacy signature).
 */
export function loadUsers(_filePath = DEFAULT_FILE) {
  const db = getDb();
  return {
    users: db.prepare('SELECT * FROM users').all().map(rowToUser),
    inviteCodes: db.prepare('SELECT code, used_by AS usedBy, created_at AS createdAt FROM invite_codes').all(),
  };
}

export async function createUserRecord(fields, _filePath = DEFAULT_FILE) {
  const db = getDb();
  const user = {
    id: fields.id || `u_${randomBytes(8).toString('hex')}`,
    username: fields.username,
    passwordHash: fields.passwordHash || await hashPassword(fields.password),
    encryptedApiKeys: fields.encryptedApiKeys ?? null,
    createdAt: fields.createdAt || new Date().toISOString(),
    ...(fields.isBot ? { isBot: true, botProfile: fields.botProfile || {} } : {})
  };
  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, encrypted_api_keys, created_at, is_bot, bot_profile)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, user.username, user.passwordHash,
      user.encryptedApiKeys ? JSON.stringify(user.encryptedApiKeys) : null,
      user.createdAt, user.isBot ? 1 : 0,
      user.botProfile ? JSON.stringify(user.botProfile) : null
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed: users.username')) {
      throw new Error('Username already taken');
    }
    throw e;
  }
  return user;
}

export async function createUser(username, password, filePath = DEFAULT_FILE) {
  return createUserRecord({ username, password }, filePath);
}

export function findUserByUsername(username, _filePath = DEFAULT_FILE) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE username = ?').get(username));
}

export function findUserById(id, _filePath = DEFAULT_FILE) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function createInviteCode(_adminSecret, _filePath = DEFAULT_FILE) {
  const code = `NEO-TOKYO-${randomBytes(6).toString('hex')}`;
  getDb().prepare('INSERT INTO invite_codes (code, used_by, created_at) VALUES (?, NULL, ?)')
    .run(code, new Date().toISOString());
  return code;
}

export function useInviteCode(code, userId, _filePath = DEFAULT_FILE) {
  const result = getDb().prepare(
    'UPDATE invite_codes SET used_by = ? WHERE code = ? AND used_by IS NULL'
  ).run(userId, code);
  return result.changes === 1;
}

const userKeysCache = new Map(); // userId -> decrypted keys object

function invalidateUserKeysCache(userId) {
  userKeysCache.delete(userId);
}

export function updateUserKeys(userId, keys, encryptionKey, _filePath = DEFAULT_FILE) {
  const user = findUserById(userId);
  if (!user) throw new Error('User not found');
  setUserEncryptedApiKeys(userId, encryptKeys(keys, encryptionKey));
}

export function setUserEncryptedApiKeys(userId, encryptedBlobOrNull) {
  getDb().prepare('UPDATE users SET encrypted_api_keys = ? WHERE id = ?')
    .run(encryptedBlobOrNull ? JSON.stringify(encryptedBlobOrNull) : null, userId);
  invalidateUserKeysCache(userId);
}

export function setUserPasswordHash(userId, passwordHash) {
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

export function deleteUserById(userId) {
  const db = getDb();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM reviews WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM kanji_kombat_runs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  remove();
  invalidateUserKeysCache(userId);
}
```

`migrateAiConsentForExistingUsers`: keep the loop logic verbatim, but iterate `loadUsers().users` and persist per-user via `setUserEncryptedApiKeys(user.id, encryptKeys(keys, encryptionKey))` instead of mutating `data` + `saveUsers`. Return shape unchanged.

`addReview` / `recordKanjiKombatRun` / `getKanjiKombatLeaderboard` / `getLeaderboard` — keep `getKanjiKombatCutoff` and `coerceTimestamp` helpers verbatim, replace bodies:

```js
export function addReview(userId, _filePath = DEFAULT_FILE) {
  const db = getDb();
  if (!findUserById(userId)) return;
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO reviews (user_id, ts) VALUES (?, ?)').run(userId, now);
  db.prepare('DELETE FROM reviews WHERE user_id = ? AND ts <= ?').run(userId, sevenDaysAgo);
}

export function recordKanjiKombatRun(userId, run = {}, _filePath = DEFAULT_FILE) {
  const db = getDb();
  if (!findUserById(userId)) return null;
  const completedAt = coerceTimestamp(run.completedAt);
  const wavesCleared = Math.max(0, Math.floor(Number(run.wavesCleared) || 0));
  const wave = Math.max(1, Math.floor(Number(run.wave) || wavesCleared + 1));
  const weeklyCutoff = getKanjiKombatCutoff('weekly');
  const record = db.transaction(() => {
    db.prepare('INSERT INTO kanji_kombat_runs (user_id, ts, wave, waves_cleared) VALUES (?, ?, ?, ?)')
      .run(userId, completedAt, wave, wavesCleared);
    db.prepare('DELETE FROM kanji_kombat_runs WHERE user_id = ? AND ts < ?').run(userId, weeklyCutoff);
  });
  record();
  return { wave, wavesCleared, ts: completedAt };
}

export function getKanjiKombatLeaderboard(period, currentUserId, _filePath = DEFAULT_FILE, opts = {}) {
  const normalizedPeriod = period === 'weekly' ? 'weekly' : '24h';
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const cutoff = getKanjiKombatCutoff(normalizedPeriod, now);
  const rows = getDb().prepare(`
    SELECT u.id AS userId, u.username AS username, r.wave AS wave, MIN(r.ts) AS ts
    FROM kanji_kombat_runs r
    JOIN users u ON u.id = r.user_id
    WHERE r.ts >= @cutoff AND r.wave > 0
      AND r.wave = (
        SELECT MAX(r2.wave) FROM kanji_kombat_runs r2
        WHERE r2.user_id = r.user_id AND r2.ts >= @cutoff
      )
    GROUP BY r.user_id
    ORDER BY wave DESC, ts ASC, username ASC
  `).all({ cutoff });

  const currentIndex = rows.findIndex(entry => entry.userId === currentUserId);
  const currentUser = currentIndex !== -1
    ? { rank: currentIndex + 1, wave: rows[currentIndex].wave }
    : { rank: null, wave: 0 };
  const entries = rows.map((entry, index) => ({
    rank: index + 1, username: entry.username, wave: entry.wave,
  }));
  return { period: normalizedPeriod, entries, currentUser };
}

export function getLeaderboard(period, currentUserId, _filePath = DEFAULT_FILE) {
  // Tokyo-time cutoff math copied verbatim from the previous implementation
  const now = Date.now();
  const tokyoOffset = 9 * 60 * 60 * 1000;
  const nowTokyo = new Date(now + tokyoOffset);
  let cutoff;
  if (period === 'weekly') {
    const day = nowTokyo.getUTCDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const mondayTokyo = new Date(nowTokyo);
    mondayTokyo.setUTCDate(nowTokyo.getUTCDate() - daysSinceMonday);
    mondayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = mondayTokyo.getTime() - tokyoOffset;
  } else {
    const todayTokyo = new Date(nowTokyo);
    todayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = todayTokyo.getTime() - tokyoOffset;
  }

  const rows = getDb().prepare(`
    SELECT u.username AS username, u.id AS userId, COUNT(*) AS count
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.ts >= ?
    GROUP BY r.user_id
    HAVING COUNT(*) > 0
    ORDER BY count DESC
  `).all(cutoff);

  const currentIndex = rows.findIndex(entry => entry.userId === currentUserId);
  const currentUser = currentIndex !== -1
    ? { rank: currentIndex + 1, count: rows[currentIndex].count }
    : { rank: null, count: 0 };
  const entries = rows.map((entry, index) => ({ rank: index + 1, username: entry.username, count: entry.count }));
  return { period, entries, currentUser };
}

export function getUserKeys(userId) {
  if (userKeysCache.has(userId)) return { ...userKeysCache.get(userId), userId };
  const user = findUserById(userId);
  let result = { userId, aiConversationsEnabled: false };
  if (user?.encryptedApiKeys) {
    try {
      const keys = decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
      result = {
        ...keys,
        aiConversationsEnabled: isPersonalizedDialogueDebugUser(user) && keys.aiConversationsEnabled === true,
        userId,
      };
    } catch { /* fall through to default */ }
  }
  const { userId: _ignored, ...cacheable } = result;
  userKeysCache.set(userId, cacheable);
  return result;
}
```

Delete `saveUsers` and the old file-based bodies entirely.

- [ ] **Step 4: Rewrite the raw call sites**

`src/auth/routes.js` (drop `saveUsers` from the import — keep `loadUsers`; add `setUserEncryptedApiKeys, deleteUserById`):
- Register invite check (~line 117): **no change needed** — `loadUsers(usersFile).inviteCodes.find(...)` still works because `loadUsers` is now a read-only DB dump in the same shape.
- Update-keys handler (~lines 237-241): replace
  ```js
      const data = loadUsers(usersFile);
      const u = data.users.find(u => u.id === req.user.id);
      if (u) { u.encryptedApiKeys = encrypted; saveUsers(data, usersFile); }
  ```
  with
  ```js
      setUserEncryptedApiKeys(req.user.id, encrypted);
  ```
- `deleteMe` (~lines 291-311): keep password verification via `findUserById(req.user.id)` + `verifyPassword`, then replace the splice/save with:
  ```js
      const { deletedFiles, deletedBugReports } = deleteAssociatedData(user.id);
      deleteUserById(user.id);
  ```
- `adminUsers` keeps `loadUsers(usersFile)` (read-only dump works).

`src/dev/dev-test-user.js`: replace the password-reset block
```js
    const data = loadUsers(usersFile);
    const existing = data.users.find(candidate => candidate.id === user.id);
    existing.passwordHash = await hashPassword(DEV_TEST_PASSWORD);
    saveUsers(data, usersFile);
    user = existing;
```
with
```js
    setUserPasswordHash(user.id, await hashPassword(DEV_TEST_PASSWORD));
    user = findUserById(user.id, usersFile);
```
(and swap `loadUsers, saveUsers` for `setUserPasswordHash` in its import).

`src/pvp/bot-account-service.js` and `src/pvp/ranked-bot-seeder.js`: no changes — they only read via `loadUsers(...).users` (bot fields included in the dump).

`src/app.js`: after `app.locals.usersFile = ...`, insert the migration before the consent migration:
```js
import { migrateUsersJsonIfNeeded } from './db.js';
// ...
const usersImport = migrateUsersJsonIfNeeded(app.locals.usersFile);
if (usersImport.migrated) {
  console.log(`[Auth] Imported ${usersImport.users} users from legacy JSON.`);
}
```
(`app.locals.usersFile` is kept: it is now the *legacy import source path*, which also preserves test seeding — a test that writes a users JSON before `createApp` gets it imported.)

`tests/integration/helpers/test-app.js`: add `import { resetDbForTest } from '../../../src/db.js';` and call `resetDbForTest();` inside `cleanup()` before `resetDataDirForTest();`.

- [ ] **Step 5: Rewrite legacy unit test fixtures**

`tests/unit/auth/users.test.js`: replace file-path fixtures with `setDataDirForTest(tmpdir)` + `resetDbForTest()` in beforeEach/afterEach (same pattern as `users-db.test.js` above). Keep every behavioral assertion (duplicate usernames, invite reuse, key round-trips, consent migration) — only the setup/teardown changes. Delete assertions that inspect raw JSON file contents; assert through the public API instead.

- [ ] **Step 6: Run auth + integration suites**

Run: `node --experimental-test-module-mocks --test tests/unit/auth/*.test.js && npm run test:integration`
Expected: PASS — register/login/me flows, KK leaderboard recording, PvP bot seeding all work on the DB.

- [ ] **Step 7: Full suite + syntax checks**

Run: `node --check src/auth/users.js && node --check src/auth/routes.js && node --check src/dev/dev-test-user.js && node --check src/app.js && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add src/auth/users.js src/auth/routes.js src/dev/dev-test-user.js src/app.js src/db.js tests/unit/auth/ tests/integration/helpers/test-app.js
/usr/bin/git commit -m "feat: move users, invites, reviews, kk leaderboard to sqlite"
```

---

## Phase 3 — Prove it

### Task 8: 50-entry sync-batch hang regression test

**Files:**
- Create: `tests/integration/flows/kanji-kombat-sync-batch-perf.test.js`

**Interfaces:**
- Consumes: `createTestApp`, `createApiClient` helpers; envelope/seed machinery exactly as used in `tests/integration/flows/kanji-kombat-sync.test.js` (read that file first and reuse its `seedSaveFile`, envelope-building, and state-mirroring patterns verbatim — including `configureSrs` isolation in beforeEach/afterEach).

- [ ] **Step 1: Write the test (fails against pre-Task-2 code, passes now — it is a ratchet)**

Structure (follow `kanji-kombat-sync.test.js` for all setup boilerplate):

```js
// tests/integration/flows/kanji-kombat-sync-batch-perf.test.js
// Regression guard: a full 50-entry /sync batch must complete quickly.
// Before the sparse-SRS fix this took tens of seconds (hundreds of full
// 2.4MB deck rewrites); the generous 2s bound only catches reintroducing
// an O(entries × full-deck-write) hot path, not normal variance.

// ...same imports/seed/setup as kanji-kombat-sync.test.js...

it('applies a 50-entry quiz batch in under 2 seconds', async () => {
  // 1. register + login user, seed save file, start KK run (reuse helpers)
  // 2. read state; mirror combat/run; build 50 sequential quiz entries:
  //    for each: take prompt head from the mirrored buffer, pick the correct
  //    choice, resolve locally with the mirrored seed to compute predictedHash,
  //    advance the local mirror (exactly the loop kanji-kombat-sync.test.js
  //    uses for its 2-entry batch, extended to 50 — extract that loop into a
  //    buildQuizEntries(state, count) helper inside this file).
  //    NOTE: intro prompts pause the quiz chain — when the mirrored head is an
  //    intro, submit it via POST /kanji-kombat/intro (legacy route) and re-read
  //    state, then continue building quiz entries from the fresh buffer.
  const started = performance.now();
  const response = await api.post('/api/game/kanji-kombat/sync', { sessionEpoch, entries });
  const elapsed = performance.now() - started;
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.confirmedThroughSeq, entries.at(-1).seq);
  assert.ok(elapsed < 2000, `50-entry sync took ${Math.round(elapsed)}ms`);
});
```

The implementer writes the real body by extending the existing 2-entry batch test — every technique needed (session epoch retrieval, envelope fields, transcript hashing with `resolveKanjiKombatAnswerTurn` + `hashTranscript`, seed advancement) already exists in that file.

- [ ] **Step 2: Add the two-user interleave test (same file)**

```js
it('two users interleave answers with no cross-user bleed', async () => {
  // 1. Register TWO users (userA, userB) via /api/auth/register; seed both
  //    save files; both start KK runs.
  // 2. Alternate 10 times: userA answers their prompt head via POST
  //    /kanji-kombat/answer (legacy promptRef body), then userB answers theirs.
  //    Track each user's expected cardsReviewed count locally.
  // 3. Assert per-user state isolation after the interleave:
  //    - each response's state.run.kanjiKombat.report.cardsReviewed matches
  //      that user's own count (not the sum),
  //    - userA's promptBuffer head differs from userB's (independent buffers),
  //    - both users' /kanji-kombat/leaderboard responses include BOTH users
  //      after each records a finished run via their own flow — record runs by
  //      driving each user's run to a wave clear or by calling the same code
  //      path the sync test uses, then assert entries.length === 2 (the
  //      concurrent-write lost-update bug made one vanish).
});
```

- [ ] **Step 3: Run it**

Run: `node --test tests/integration/flows/kanji-kombat-sync-batch-perf.test.js`
Expected: both tests PASS; the batch test in well under 2s. (Optional sanity: `git stash` the Task 2 changes and watch it fail by an order of magnitude — do not commit that state.)

- [ ] **Step 4: Full suite + commit**

```bash
npm test
/usr/bin/git add tests/integration/flows/kanji-kombat-sync-batch-perf.test.js
/usr/bin/git commit -m "test: kk sync batch perf guard and two-user interleave"
```

---

### Task 9: Bot load harness

**Files:**
- Create: `tests/load/kk-load.mjs`
- Create: `tests/load/README.md`

**Interfaces:**
- Consumes: HTTP API only (register/login → JWT Bearer; `/api/game/kanji-kombat/start|intro|answer|completion-choice|availability`; `/api/game/state` via start response). Imports `resolveKanjiKombatAnswerTurn`, `hashTranscript` from `src/shared/` for subway-mode envelope batches (same recipe as Task 8).
- Produces: CLI: `node tests/load/kk-load.mjs --url http://localhost:3000 --bots 10 --minutes 2 --subway 2`. Prints per-endpoint p50/p95/p99, request count, error count; exits non-zero if error rate > 1%.

- [ ] **Step 1: Write the harness**

```js
// tests/load/kk-load.mjs
// Bot load harness for Kanji Kombat. Registers throwaway users and plays
// through the REAL API. Regular bots answer via the legacy /answer route on
// a 2-4s cadence; "subway" bots accumulate 50 offline entries and dump them
// through /sync (mirroring seeds/hashes like the integration tests do).
//
// Usage: node tests/load/kk-load.mjs --url http://localhost:3000 --bots 10 --minutes 2 --subway 2
import { resolveKanjiKombatAnswerTurn } from '../../src/shared/combat/pve-turn-resolver.js';
import { hashTranscript } from '../../src/shared/action-protocol.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : null).filter(Boolean)
);
const BASE = args.url || 'http://localhost:3000';
const BOTS = Number(args.bots || 10);
const MINUTES = Number(args.minutes || 2);
const SUBWAY = Number(args.subway || Math.max(1, Math.floor(BOTS / 10)));
const DEADLINE = Date.now() + MINUTES * 60 * 1000;

const latencies = new Map(); // label -> number[]
let errors = 0, requests = 0;

async function call(label, path, options = {}) {
  const started = performance.now();
  requests += 1;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!latencies.has(label)) latencies.set(label, []);
    latencies.get(label).push(performance.now() - started);
    if (res.status >= 500) errors += 1;
    return { status: res.status, body };
  } catch (e) {
    errors += 1;
    if (!latencies.has(label)) latencies.set(label, []);
    latencies.get(label).push(performance.now() - started);
    return { status: 0, body: { error: e.message } };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(min, max) { return min + Math.random() * (max - min); }

function pickAnswer(prompt) {
  const choices = prompt.quiz?.choices || [];
  // 85% correct to mimic a real player
  const correct = choices.find(c => c.correct);
  const wrong = choices.filter(c => !c.correct);
  const pick = (Math.random() < 0.85 && correct) ? correct : (wrong[0] || correct);
  return pick?.id;
}

async function registerBot(i) {
  const username = `kkbot_${Date.now().toString(36)}_${i}`;
  const reg = await call('auth', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'loadtest1', aiDataSharingConsent: true }),
  });
  if (!reg.body.token) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
  return { username, headers: { authorization: `Bearer ${reg.body.token}` } };
}

async function startRun(bot) {
  const avail = await call('availability', '/api/game/kanji-kombat/availability', { headers: bot.headers });
  const state = await call('start', '/api/game/kanji-kombat/start', {
    method: 'POST', headers: bot.headers,
    body: JSON.stringify({ creatureId: avail.body?.starterIds?.[0] || 'hi' }),
  });
  if (state.status !== 200) {
    // onboarding path
    await call('onboarding', '/api/game/kanji-kombat/onboarding', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({ knowsHiragana: false, knowsKatakana: false }),
    });
  }
  return state.body.state;
}

function head(state) {
  return state?.run?.kanjiKombat?.promptBuffer?.[0] || null;
}

async function actOnHead(bot, state) {
  const prompt = head(state);
  if (!prompt) return startRun(bot);
  if (prompt.kind === 'intro') {
    const res = await call('intro', '/api/game/kanji-kombat/intro', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({
        cardId: prompt.cardId, choice: Math.random() < 0.5 ? 'known' : 'unknown',
        promptRef: { promptId: prompt.promptId, sequence: prompt.sequence, cardId: prompt.cardId },
      }),
    });
    return res.body.state || state;
  }
  if (prompt.kind === 'quiz') {
    const res = await call('answer', '/api/game/kanji-kombat/answer', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({
        answerId: pickAnswer(prompt),
        promptRef: { promptId: prompt.promptId, sequence: prompt.sequence, cardId: prompt.cardId },
      }),
    });
    return res.body.state || state;
  }
  // dailyCompletePrompt → keep going (endless mode)
  const res = await call('completion', '/api/game/kanji-kombat/completion-choice', {
    method: 'POST', headers: bot.headers,
    body: JSON.stringify({
      keepGoing: true,
      promptRef: { promptId: prompt.promptId, sequence: prompt.sequence },
    }),
  });
  return res.body.state || state;
}

async function runRegularBot(i) {
  const bot = await registerBot(i);
  let state = await startRun(bot);
  while (Date.now() < DEADLINE) {
    state = await actOnHead(bot, state);
    await sleep(jitter(2000, 4000));
  }
}

async function runSubwayBot(i) {
  // Mirrors seeds/hashes locally, accumulates 50 quiz entries, dumps via /sync.
  const bot = await registerBot(i);
  let state = await startRun(bot);
  while (Date.now() < DEADLINE) {
    const built = buildOfflineBatch(state, 50); // see helper below
    if (!built) { state = await actOnHead(bot, state); continue; }
    await sleep(jitter(5000, 15000)); // "underground"
    const res = await call('sync', '/api/game/kanji-kombat/sync', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({ sessionEpoch: built.sessionEpoch, entries: built.entries }),
    });
    state = res.body.state || res.body.authoritativeState || state;
    if (res.body.status !== 'ok') state = await actOnHead(bot, state); // resync via live action
  }
}

/**
 * Build up to `count` quiz entries against a local mirror of the state,
 * resolving each turn with the mirrored seed to compute predictedHash —
 * the same recipe as tests/integration/flows/kanji-kombat-sync.test.js.
 * Returns null when the head isn't a quiz (intro/daily boundaries are
 * handled live by actOnHead).
 */
function buildOfflineBatch(state, count) {
  const kk = state?.run?.kanjiKombat;
  const optimistic = state?.combat?.optimistic;
  if (!kk?.sessionEpoch || !optimistic?.turnSeeds?.length) return null;
  const combat = structuredClone(state.combat);
  const run = structuredClone(state.run);
  const seeds = [...optimistic.turnSeeds];
  const entries = [];
  let seq = 1;
  for (const prompt of run.kanjiKombat.promptBuffer) {
    if (entries.length >= count || !seeds.length) break;
    if (prompt.kind !== 'quiz') break; // stop at intro/daily boundary
    const answerId = pickAnswer(prompt);
    const correct = prompt.quiz.choices.find(c => c.id === answerId)?.correct === true;
    const seed = seeds.shift();
    const resolved = resolveKanjiKombatAnswerTurn({ combat, run, answerCorrect: correct }, { seed });
    entries.push({
      kind: 'quiz', seq: seq++, promptId: prompt.promptId, sequence: prompt.sequence,
      cardId: prompt.cardId, answerId, predictedHash: hashTranscript(resolved.transcript),
    });
  }
  return entries.length ? { sessionEpoch: kk.sessionEpoch, entries } : null;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const bots = [];
for (let i = 0; i < BOTS; i++) {
  bots.push((i < SUBWAY ? runSubwayBot(i) : runRegularBot(i)).catch(e => {
    errors += 1;
    console.error(`bot ${i} died:`, e.message);
  }));
  await sleep(150); // stagger ramp-up
}
await Promise.all(bots);

console.log(`\n=== kk-load: ${BOTS} bots (${SUBWAY} subway) × ${MINUTES}min vs ${BASE} ===`);
for (const [label, values] of latencies) {
  const sorted = [...values].sort((a, b) => a - b);
  console.log(
    `${label.padEnd(12)} n=${String(sorted.length).padEnd(6)} ` +
    `p50=${Math.round(pct(sorted, 50))}ms p95=${Math.round(pct(sorted, 95))}ms p99=${Math.round(pct(sorted, 99))}ms`
  );
}
const errorRate = requests ? errors / requests : 0;
console.log(`requests=${requests} errors=${errors} (${(errorRate * 100).toFixed(2)}%)`);
process.exit(errorRate > 0.01 ? 1 : 0);
```

Implementer notes:
- `resolveKanjiKombatAnswerTurn` mutates its inputs — the mirror clones once per batch and resolves sequentially, matching server-side replay order. If the exported signature differs from `({ combat, run, answerCorrect }, { seed })`, copy the exact call shape from `kanji-kombat-sync.test.js`.
- `startRun` starter fallback: if `/availability` doesn't expose starter ids, read the dev-seeded default collection (`'hi'` is in `DEFAULT_COLLECTION`); registration-fresh users own the default collection.
- Wrong-hash batches surface as `status:'corrected'` — the harness treats that as normal flow (client snaps to authoritative), not an error.

- [ ] **Step 2: Write `tests/load/README.md`**

```markdown
# Kanji Kombat Load Harness

Drives real bots through the KK API. Not part of `npm test`.

## Smoke (local)
    npm run dev   # or: node server.js
    node tests/load/kk-load.mjs --url http://localhost:3000 --bots 10 --minutes 2 --subway 2

## Launch gate (dev environment)
    node tests/load/kk-load.mjs --url https://jrpg-dev.up.railway.app --bots 100 --minutes 30 --subway 10

Pass criteria (spec): p95 < 300ms on every endpoint, error rate ≤ 1%, zero
process restarts (check Railway deploy logs), memory plateaus (Railway
metrics), subway /sync batches p95 < 2s. Registration is open (invite codes
optional), so bots self-register as kkbot_* throwaway users. Clean up dev
volume afterwards if desired: the bots' save/SRS files are small (~80KB each).
```

- [ ] **Step 3: Smoke it locally**

Run:
```bash
node --check tests/load/kk-load.mjs
node server.js & SRV=$!
sleep 6
node tests/load/kk-load.mjs --url http://localhost:3000 --bots 5 --minutes 1 --subway 1
kill -TERM $SRV
```
Expected: latency table prints; error rate ≤ 1%; exit 0. Fix harness/API mismatches now (this is where any drift between the plan's request shapes and the real API surfaces).

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add tests/load/
/usr/bin/git commit -m "test: kanji kombat bot load harness"
```

---

### Task 10: Verification & rollout

**Files:** none (verification only)

- [ ] **Step 1: Full local gate**

Run: `npm test`
Expected: unit + integration PASS (coverage ratchet included).

- [ ] **Step 2: Local load smoke**

Run: `node server.js & sleep 6 && node tests/load/kk-load.mjs --url http://localhost:3000 --bots 10 --minutes 3 --subway 2; kill -TERM %1`
Expected: p95 < 300ms locally, error rate ≤ 1%, memory (Activity Monitor / `ps -o rss=`) flat across the run.

- [ ] **Step 3: Merge to dev and deploy**

Follow the CLAUDE.md finish flow (commit in worktree → merge into `dev` → `git push origin dev`). Do **NOT** advance master yet. Watch the Railway dev deploy: better-sqlite3 must install its prebuilt binary (a deploy-time failure here means pinning/adjusting the dependency version — fix forward before proceeding). Confirm boot log prints the legacy users import line exactly once, and that login with an existing account works on `https://jrpg-dev.up.railway.app`.

- [ ] **Step 4: Launch-gate load run against dev**

Run: `node tests/load/kk-load.mjs --url https://jrpg-dev.up.railway.app --bots 100 --minutes 30 --subway 10`
Pass criteria (all required): p95 < 300ms per endpoint; error rate ≤ 1%; zero restarts in Railway logs; memory plateaus in Railway metrics; subway sync p95 < 2s.

- [ ] **Step 5: Advance master**

Only after Step 4 passes: `git push origin dev:master`. Then remove the feature worktree per CLAUDE.md.

- [ ] **Step 6: Report**

Post the load-run numbers (per-endpoint table + Railway memory/restart observations) in the final summary to the user.
