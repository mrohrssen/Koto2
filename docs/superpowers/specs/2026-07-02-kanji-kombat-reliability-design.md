# Kanji Kombat Reliability & Multi-User Stability — Design

**Date:** 2026-07-02
**Status:** Approved
**Scope target:** 100+ concurrent players (public launch)

## Problem

Kanji Kombat's gameplay protocol (optimistic actions, session epochs, offline `/sync`
replay) works well. The server underneath it does not survive sustained play:

- **Hang:** playing KK heavily freezes the whole server for seconds at a time;
  Railway health checks fail and the process gets restarted ("hangs and crashes").
- **Single-user ceiling:** with two players active, requests queue behind the frozen
  event loop and time out. Confirmed symptom: slow/timeouts when both play, not
  data corruption.

### Root causes (verified in code)

1. **SRS deck rebuild/rewrite storm** — the script deck has 4,142 cards (~1.6–2.4MB
   JSON per user). `ensureScriptDeckSeeded()` (`src/game/script-srs.js:76`) rebuilds
   every card object AND synchronously rewrites the whole file on **every**
   `getScriptCards()` call, even read-only ones. One answer triggers it ~6–10×
   (grade, due lookup, answer pool, buffer refill via `chooseNextScriptWork`).
   A 50-entry offline `/sync` batch (client hard cap, `public/js/ui/kanji-kombat-session.js`)
   triggers hundreds of full rebuild+write cycles in a single request — tens of
   seconds of blocked event loop. Node is single-threaded: everyone freezes.
2. **Action ledger stores full game states** — optimistic routes persist up to 100
   replay entries in `meta.actionLedger`, each containing a complete enriched game
   state (60-prompt buffer, party, combat, rooms) via `withOptimisticActionStatus`
   (`src/routes/game/optimistic-action-response.js:66`). The ledger is persisted in
   the save file, `structuredClone`d on every optimistic request
   (`snapshotGameManager`), and re-serialized pretty-printed on every `saveGame()`.
   Saves balloon to multiple MB; every request pays the cost forever.
3. **Users file parsed twice per request** — the game middleware
   (`src/routes/game/index.js:42-47`) runs `findUserById` + `getUserKeys`, each a
   full read+parse of `.jrpg-users.json`. Leaderboard writes
   (`recordKanjiKombatRun`, `addReview`) are unguarded read-modify-write of the
   whole file: concurrent writers silently lose each other's data.
4. **No crash guards** — no `uncaughtException`/`unhandledRejection` handlers; any
   stray rejection kills the process. `loadUsers()` (`src/auth/users.js:18`)
   swallows parse errors by returning `{ users: [] }` — a crash mid-`writeFileSync`
   that truncates the users file causes the next save to persist an **empty user
   list** (total account wipe landmine).
5. **Unbounded memory** — the GameManager registry (`src/game/manager-registry.js`)
   and the SRS cache (`src/game/internal-srs.js`) never evict; memory grows with
   every user who ever logs in since boot.

## Goals

- One player can never hang the server, no matter how fast or long they play.
- 100 concurrent players feel snappy; offline batches absorb without visible stalls.
- No data-loss landmines (file truncation, concurrent write races).
- Stability is **measured** by a load harness, not assumed.

## Non-goals (out of scope)

- No changes to the optimistic action protocol, session epochs, client sync queue,
  KK game rules/scheduling, PvE/PvP combat semantics.
- No migration of per-user game saves or SRS decks into SQLite (Option C — deferred).
- No horizontal scaling; single Node process on one Railway replica stays.
- No changes to server-wide settings storage beyond atomic writes.

## Approach

**Option B — foundation fixes + SQLite for shared data.** Options considered:

- **A (JSON everywhere, cached):** fastest, but keeps whole-file rewrites for shared
  data and requires hand-rolled hardening to close the corruption landmine. Creaky
  at 100+.
- **B (chosen):** algorithmic hot-path fixes everywhere; `better-sqlite3` exactly
  where concurrent writes collide (users, invites, reviews, leaderboard runs).
  Per-user files are single-writer by nature and stay JSON.
- **C (SQLite for everything):** most durable, but touches every persistence path
  for marginal benefit over B at this scale; slowest to ship safely.

Rationale for B: the hang is algorithmic (no storage engine fixes it), and the only
truly shared mutable file is the users file. `better-sqlite3` is synchronous
(matches existing code style, no async refactor), WAL mode trivially handles this
write load, and it removes the truncation/race classes outright.

## Phase 1 — Stop the hang (foundation, no storage migration)

### 1a. SRS read/write discipline (`src/game/internal-srs.js`, `src/game/script-srs.js`)

- **Seed once:** deck seeding runs once per user per process (in-memory guard) and
  re-runs only when a persisted `deckVersion` stamp differs from the static deck's
  version. The version is a content hash of the static deck computed once at boot —
  no manual bump to forget.
- **Pure reads:** `getScriptCards`, due/new lookups, and answer pools become pure
  lookups against a cached merged view. Zero writes on read paths.
- **Write on change only:** disk writes happen on grade, intro, and daily-state
  changes only.
- **Sparse storage:** the per-user file persists only cards with FSRS progress
  (reps > 0); untouched cards merge from the static deck at load. Existing fat
  files (4,142 cards) compact automatically on first load.
- Net effect per answer: ~10 full-deck rebuilds + ~10 × 2.4MB sync writes →
  ~1 write of ~80KB. Escape hatch if the load test still shows write pressure:
  debounce SRS writes per user (not expected to be needed).

### 1b. Action ledger slimming (`src/game/services/action-ledger-service.js`, `src/routes/game/optimistic-action-response.js`)

- Ledger entries stop storing `state`/`authoritativeState` — only the small
  action-specific response fields.
- Replay path already prefers fresh state
  (`state: enrichedState(req) || existing.response.state`), so replay semantics are
  unchanged.
- `normalizeActionLedger` strips the fat fields from previously persisted entries
  on load — existing bloated saves shrink on first touch.
- The 100-entry cap stays.

### 1c. Write-behind saves + eviction (`src/game/manager-registry.js`)

- `saveManager(userId)` becomes "mark dirty". A flusher writes dirty managers every
  ~5s and immediately at critical points: run end, logout, PvP snapshot, shutdown.
- **All** JSON writes (saves, SRS, settings, users until Phase 2) go through an
  atomic write helper: write `${file}.tmp`, then rename. Closes the truncation
  class everywhere.
- Save serialization is compact JSON in production (pretty in dev) — halves file
  size and stringify time.
- **Eviction:** managers idle 30+ minutes (no requests; PvP socket activity counts
  as activity) are flushed and removed along with the user's SRS cache entry.
  Re-login reloads from disk transparently.
- **Accepted trade-off:** a hard crash can lose up to ~5s of progress. For KK the
  client's unconfirmed-entry replay log refills the window on reconnect. The
  persisted manager state is internally consistent because the whole manager
  serializes at flush time (ledger + game state can never diverge on disk).

### 1d. Crash guards & graceful shutdown (`server.js`)

- `uncaughtException` / `unhandledRejection`: log with stack, best-effort flush of
  all dirty state (managers; SRS only if the debounce escape hatch is in use),
  exit(1). Railway restarts the process.
- `SIGTERM`/`SIGINT` (Railway sends SIGTERM on every deploy — mandatory once
  write-behind exists): flush everything, close the HTTP server, exit 0.

## Phase 2 — SQLite for shared data

### Schema (new `src/db.js`; better-sqlite3, WAL mode, `busy_timeout`; file at `dataPath('koto.db')`)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  encrypted_api_keys TEXT,          -- JSON blob, unchanged format
  created_at TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_profile TEXT                  -- JSON
);
CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  used_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE reviews (
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX idx_reviews_user_ts ON reviews(user_id, ts);
CREATE TABLE kanji_kombat_runs (
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  waves_cleared INTEGER NOT NULL
);
CREATE INDEX idx_kk_runs_ts ON kanji_kombat_runs(ts);
```

### Call sites

- `src/auth/users.js` **keeps its exported function signatures**; bodies become
  point queries/transactions. Callers (auth routes, game middleware, PvP bot
  seeder) are untouched except for deleting the now-unused `usersFile` plumbing
  (`app.locals.usersFile`, route params).
- Leaderboards (`getKanjiKombatLeaderboard`, `getLeaderboard`) become single SQL
  queries instead of map/sort over all users.
- `recordKanjiKombatRun` / `addReview` / `useInviteCode` become transactions —
  the lost-write race disappears structurally.
- `getUserKeys` gains an in-memory decrypted-keys cache, invalidated on
  `updateUserKeys` — removes the per-request decrypt.
- Middleware existence check becomes a point SELECT (microseconds).

### Migration

- At boot: if the `users` table is empty and `.jrpg-users.json` exists, import
  users → invite codes → reviews → KK runs in one transaction; log loudly.
- The JSON users file is never written or deleted afterwards — it remains a frozen
  pre-migration backup.
- No dual-write mode, no rollback flag: problems are fixed forward on the dev
  environment before master advances (dev and prod run the same SHA by workflow).

### Native dependency note

`better-sqlite3` ships prebuilt binaries for Railway's Linux x64 + current Node.
Risk surfaces at deploy time (build failure), never silently at runtime. Pin the
version; verify on dev environment first.

## Phase 3 — Load harness & measured success criteria

- `tests/load/` — plain Node script(s), no new runtime deps: N scripted bots that
  login, start a KK run, and answer on a realistic 2–4s cadence through the real
  optimistic + `/sync` endpoints. A subset simulate subway riders: accumulate 50
  entries offline, then dump the batch mid-storm.
- Reports per-endpoint p50/p95/p99 latency, error rate, and server RSS.
- Stages: 10 bots locally (smoke) → 100 bots against the dev Railway environment
  for 30 minutes.
- **Pass criteria:** p95 < 300ms; zero process restarts; memory plateaus (no
  monotonic growth); 50-entry subway batches complete < 2s.
- Master does not advance until the dev run passes.

## Error handling

- Route contracts unchanged: `/sync` keeps HTTP 200 `status:'corrected'` vs 409
  semantics; optimistic routes keep snapshot/restore.
- DB constraint violations map to today's user-facing errors (e.g. "Username
  already taken").
- Failed background flushes log and retry on the next flush tick; they never throw
  into the void.
- `restoreGameManager` + write-behind interact safely: flush serializes the whole
  manager at flush time, so on-disk state is always internally consistent.
- Crash guards are last-resort: flush, log, exit non-zero, Railway restarts.

## Testing

1. **Existing suites pass unchanged** — KK integration tests
   (`tests/integration/flows/kanji-kombat.test.js`, `kanji-kombat-sync.test.js`)
   are the behavioral contract that Phase 1 preserves game semantics.
2. **New unit tests:** sparse SRS merge, fat-file compaction, `deckVersion`
   re-seed; ledger stripping on load + replay-returns-fresh-state; dirty/flush/
   evict lifecycle; atomic write helper; DB users module CRUD + leaderboards +
   boot migration. Existing `tests/unit/auth/users.test.js` is rewritten against
   the same public API with a temp DB.
3. **Hang regression guard:** integration test applying a full 50-entry sync batch
   with a generous time-bound assertion (< 2s) — cheap insurance against
   reintroducing an O(entries × full-deck-write) path.
4. **Multi-user integration test:** two users interleaving KK answers and run
   completions; both leaderboard runs recorded; no cross-user state bleed.
5. **Load harness** (Phase 3 above) as the final gate.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| SRS seeding/sparse-storage bug corrupts learning data | Compaction is load-time + idempotent; unit tests cover fat→sparse round-trip; original file replaced only via atomic rename; dev-environment soak before master |
| Ledger slimming breaks a replay consumer that needed stored state | Replay already prefers fresh state; grep + tests for `response.state` consumers; integration suites cover replay paths |
| Write-behind loses progress on crash | ≤5s window; KK client replay log refills it; immediate flush at critical points |
| better-sqlite3 build issue on Railway | Prebuilt binaries; pinned version; deploy-time failure mode; verified on dev first |
| Migration mapping bug | Single transaction; JSON kept as frozen backup; loud logging; dev soak |
| Eviction evicts an active PvP session | Activity tracking includes socket events; 30-min idle threshold |

## Implementation order

1. Phase 1a (SRS) — biggest win, immediately fixes the hang for one user.
2. Phase 1b (ledger) + 1c (write-behind + eviction + atomic writes) + 1d (guards).
3. Phase 3 harness (local smoke against Phase 1) — proves the hang is dead.
4. Phase 2 (SQLite) — multi-user scale.
5. Phase 3 full run (100 bots vs dev) — launch gate.
