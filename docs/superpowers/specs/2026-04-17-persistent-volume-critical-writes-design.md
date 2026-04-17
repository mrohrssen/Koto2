# Migrate Critical Ephemeral Writes to Persistent Volume

**Date:** 2026-04-17
**Status:** Design approved, awaiting implementation plan

## Problem

On Railway production, user progress data is being wiped on every deploy.

The container has a persistent volume mounted at `/app/persist/` (see `src/data-dir.js:9`), but several critical writers target `/app/data/` (the container's ephemeral filesystem, via `process.cwd()/data` or `join(__dirname, 'data')`). Every Railway deploy spins up a fresh container, so anything in `/app/data/` vanishes.

The files affected include:

- `data/srs-u_*.json` — every user's FSRS vocab deck state (the core of spaced-repetition progression).
- `data/word-knowledge-u_*.json` — which words each user has seen and how often (powers the i+1 comprehensible-input system and the admin word-exposure dashboard).

The admin dashboard at `/admin-word-exposures.html` shows 0 users / 0 words immediately after a deploy because of this.

## Scope

**In scope (🔴 critical):**

- SRS vocab deck writes → move to `/app/persist/`.
- Word-knowledge writes → move to `/app/persist/`.
- Update the admin word-exposure reader to look at `/app/persist/`.
- Remove a latent bug in `admin.js` delete-user code that looked for data in the wrong subdirectory.

**Out of scope (explicitly deferred):**

- TTS caches (`data/tts-cache/`, `data/tts-dialogue/`) — regeneratable via VOICEVOX.
- JPDB caches (`data/jpdb-*-cache.json`) — regeneratable via JPDB API.
- Forge queue + results (`data/forge-queue.json`, `data/forge-results.json`) — admin content pipeline, interactive use.
- Sprite review queue, sprite-staging, sprite-feedback — admin tooling.
- Collapsing `dataPath()` / `getDataDir()` / `process.cwd()/data` / `__dirname/data` into a single helper — a worthwhile cleanup but a separate refactor.

`word-tracker-*.json` appears in `.gitignore` as a runtime-generated pattern but no current source code writes it; dropped from scope.

## Approach

Files move from the ephemeral container path (`/app/data/`) to the persistent volume (`/app/persist/`), flat at the volume root — matching the existing convention used by `.jrpg-save-u_*.json`, `.jrpg-users.json`, `npc-memory-u_*.json`, `.pvp-match-*.json`, etc.

Alternative considered: write to `/app/persist/data/` (subdirectory). Rejected because it would create two classes of per-user files on the volume (some flat, some under `data/`) — inconsistent and confusing.

Alternative considered: full refactor introducing a `dataSubPath()` helper and collapsing all path constructions through it. Rejected as scope creep — this fix targets three files; a broader cleanup can happen later without blocking the data-loss fix.

### No migration

On every previous Railway deploy, the ephemeral `/app/data/*.json` files have already been wiped. The fix-deploy behaves identically to every past deploy for these files. Users will rebuild their SRS state and word-knowledge from the fix-deploy onward; from then on, data accumulates persistently.

## Changes

### Writer 1: `src/game/internal-srs.js`

The module already supports configurable `dataDir` via `configureSrs({ dataDir })`. The default is `'data/'` (relative), and nothing in production calls `configureSrs()` — so writes land in `./data/` (ephemeral). Tests already call `configureSrs()` with a tempdir, so this change is invisible to tests.

**Fix:** add a `configureSrs({ dataDir: getDataDir() })` call to `server.js` at startup.

### Writer 2: `src/game/bootstrap/word-knowledge.js`

Line 7:
```js
const DATA_DIR = path.join(process.cwd(), 'data');
```

This constant is used for two different purposes, which need to split:

1. **Write path** for per-user word-knowledge JSON files (line 131, 140) → move to `getDataDir()`.
2. **Read path** for the committed dictionary (line 11: `loadWordDictionary(DATA_DIR)`) → stays at `process.cwd()/data` because `data/dictionary.json` lives in the repo, not on the volume.

**Fix:** introduce two constants:
```js
const WRITE_DIR = getDataDir();                    // user data → persistent volume
const DICT_DIR  = path.join(process.cwd(), 'data'); // committed repo data → container FS
```

Update `loadWordKnowledge()` and `saveWordKnowledge()` to use `WRITE_DIR`. Update `getWordDict()` to use `DICT_DIR`.

### Reader 1: `server.js:440-443`

```js
// before
app.use('/api/admin', createWordExposureRoutes({
  dataDir: join(__dirname, 'data'),
  framesPath: join(__dirname, 'data', 'dialogue', 'frames.json'),
}));

// after
app.use('/api/admin', createWordExposureRoutes({
  dataDir: getDataDir(),                                             // word-knowledge files live here now
  framesPath: join(__dirname, 'data', 'dialogue', 'frames.json'),    // committed repo file — unchanged
}));
```

### Reader 2: `src/routes/admin.js:187-201` (delete-user flow)

Current code loops over `dataDir` root, then also tries `join(dataDir, 'data')` as a subdirectory. With `server.js:439` passing `dataDir: dataPath('')`, the `data/` subdir path resolves to `/app/persist/data/` — which has never existed on the volume.

Simultaneously, the comment next to the subdir loop claims it covers "srs, word-knowledge, dialogue caches, creature memory" — but dialogue caches and creature memory actually live flat at `/app/persist/` root, not under a `data/` subdir. So the subdir branch was silently missing them.

**Fix:** once SRS and word-knowledge writes move to `/app/persist/` flat, the root loop picks everything up. Delete the unused `dataSub` block (lines ~193-201).

### Startup wiring: `server.js`

Add near the top of the file (after existing data-dir imports):

```js
import { configureSrs } from './src/game/internal-srs.js';

// Point SRS writes at the persistent volume (critical for Railway)
configureSrs({ dataDir: getDataDir() });
```

Place this before any `createCard` / `gradeCard` call — early app setup is fine.

## Behavior post-deploy

1. Fresh container → `/app/data/*.json` is empty (wiped as always).
2. First user to play writes to `/app/persist/srs-u_*.json`, `/app/persist/word-knowledge-u_*.json`.
3. Next deploy: container filesystem wipes; the volume persists. Users' SRS + word-knowledge survives.
4. Admin dashboard at `/admin-word-exposures.html` shows real data once any user plays after this deploy.

## Verification

### Unit tests

All existing tests pass unchanged:
- `tests/unit/game/vocab-srs.test.js` and other SRS tests override `configureSrs({ dataDir: tmp.path })` — unaffected by server.js wiring.
- `tests/unit/word-knowledge.test.js` uses in-memory operations only (no disk writes) — unaffected.
- `tests/unit/admin-word-exposures.test.js` passes its own `tempDir` to `aggregateWordExposures()` — unaffected.

### Local integration

With `/app/persist/` not present locally, `getDataDir()` resolves to the project root. Verify by running the server locally, registering a test user, encountering a word, and confirming `word-knowledge-<userId>.json` appears at the repo root (not in `./data/`).

### Railway smoke test

After deploy:
1. Register a throwaway account on prod.
2. Play one encounter that exposes a word.
3. Hit `/admin-word-exposures.html` — expect `totalUsers=1` and at least one row.
4. Trigger a redeploy (e.g., push a no-op commit).
5. After redeploy, hit the dashboard again — user count and word row must persist.

## Risks and rollback

**Risk: existing `/app/data/` data lost on this deploy.**
Accepted — consistent with every prior deploy. No migration.

**Risk: `getDataDir()` returns project root locally, cluttering the repo.**
Locally (no `/app/persist/` mount), files land at project root. The repo already has this pattern — `npc-memory-u_*.json`, `.jrpg-save-u_*.json`, etc. write to the root — but `.gitignore` only covers the `.jrpg-*` prefix today; SRS and word-knowledge root-level writes would show as untracked.

Add to `.gitignore`:

```
# Per-user data written to project root locally (dataPath fallback)
/srs-u_*.json
/word-knowledge-u_*.json
/npc-memory-u_*.json
/creature-memory-u_*.json
/npc-dialogue-cache-u_*.json
/creature-dialogue-cache-u_*.json
```

The last four are pre-existing untracked files (see current `git status`) — adding them here fixes a latent papercut at the same time.

**Risk: split of write vs. dict directory in `word-knowledge.js` introduces a regression in dictionary loading.**
Mitigated by keeping `DICT_DIR = process.cwd()/data` for dictionary reads — identical behavior to before.

**Rollback:** revert the four changed files. Since no migration is performed, the only side effect of a rollback is that whatever SRS / word-knowledge data accumulated on the volume during the brief post-fix window becomes inaccessible to the reverted code (which looks at `./data/` instead). Users would rebuild on next play.

## Files changed

- `src/game/bootstrap/word-knowledge.js` — split `DATA_DIR` into `WRITE_DIR` (user data, on the volume) and `DICT_DIR` (committed repo data, unchanged).
- `server.js` — add `configureSrs({ dataDir: getDataDir() })` startup call; change `createWordExposureRoutes` to pass `getDataDir()` instead of `join(__dirname, 'data')`.
- `src/routes/admin.js` — delete the unused `dataSub` subdirectory branch in the delete-user flow.
- `.gitignore` — add repo-root patterns for per-user files now that `getDataDir()` writes there in dev.

`src/game/internal-srs.js` requires no code change — the module already supports external configuration via `configureSrs()`, which production was simply never calling.

## Future work (not in this spec)

- Migrate 🟡 moderate tier (forge, sprite pipeline) if admin tools become unusable after deploys.
- Migrate 🟢 caches if post-deploy latency becomes a user-visible issue.
- Collapse path helpers (`dataPath`, `getDataDir`, `process.cwd()/data`, `__dirname/data`) into a single canonical module.
