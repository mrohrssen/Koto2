# Custom Live Dictionary with Admin Authoring

**Date:** 2026-04-21
**Status:** Ready for implementation plan

## Problem

The word dictionary (`data/dictionary.json`) is a direct export of JMdict. Many glosses are wrong for a language-learning game — transitivity flipped, overly clinical wording, missing common senses, or tone that doesn't fit. We want to diverge from JMdict and curate our own dictionary going forward, without a heavy authoring pipeline.

Curation needs to happen in the live game, against real exposure data, with edits taking effect for players immediately. Today there is no authoring surface at all — every correction requires a hand-edit of a 5.5MB JSON file, a deploy, and a prayer.

Separately, per-user FSRS vocab cards bake the dictionary meaning into each card at creation time. A meaningful edit workflow must not require a migration or cleanup script every time a definition changes.

## Goal

1. Fork `data/dictionary.json` into a curated **live dictionary** that we own and edit going forward. The JMdict baseline is retained only as a frozen reference snapshot for the admin UI.
2. Add an **admin editing surface** on the word-exposure dashboard that lets a curator rewrite any entry (reading + full definitions array) and have it take effect for players immediately.
3. Remove the baked `meaning` / `reading` fields from FSRS card storage. Resolve them lazily from the live dictionary on every card read, so dictionary edits are always reflected without migration.
4. Make the "repo snapshot stays in sync with the live production dictionary" story robust enough to survive 5+ deploys per day without manual ritual.

## Non-Goals

- **Per-context / per-line gloss overrides.** Covered by the separate `2026-04-21-dictionary-override-design.md`. That system is complementary: overrides change the gloss shown in a specific tokenized line; the live dictionary changes the canonical entry. Both exist; neither replaces the other.
- **Dictionary Browser for unexposed words.** V1 edits only words that have appeared in-game (i.e. rows on the admin word-exposure page).
- **Overlay precedence flip.** Game data overlays (`creatures.json`, `moves.json`, `items.json`, `npcs.json`, `npc-skills.json`, `areas.json`, `glue-words.json`, `grammar-words.json`) still overwrite live dictionary entries at load time, same as today. The admin UI warns the curator when editing an overlay-owned word.
- **Editing from non-production environments.** Local dev and dev Railway are explicitly read-only for dictionary edits. Prod is the single writer.
- **Automated prod→master branch merge.** Merging the `dictionary` branch into `master` is a manual (or weekly-cron) action — not part of V1.
- **Audit log / edit history UI.** Git history of the `dictionary` branch serves as the audit trail.

## File Layout and Sources of Truth

| File | Location | Role |
|---|---|---|
| `data/live-dictionary.json` | in-repo, committed | canonical snapshot used by local dev, CI, and prod **first-boot only** |
| `/app/persist/live-dictionary.json` | Railway volume | authoritative on prod at runtime after first write; survives deploys |
| `data/latest-jm-dict.json` | in-repo, committed, **frozen** | one-shot baseline copy of today's JMdict; read only by the admin-word-exposures route for the "JMDict Definition" reference column |
| `data/dictionary.json` | *deleted* | the bootstrap copies this into both live + baseline files, then removes it |

The committed `data/live-dictionary.json` is not authoritative on prod after the first boot — once the volume file exists, the volume wins. The committed file exists so:

- local dev, dev Railway, and CI have a bootable snapshot without network access
- a fresh prod deploy (volume empty) boots with sensible defaults
- the repo tracks a history of the dictionary via the `dictionary` branch

JMdict is never consulted by game runtime code. The only reader of `latest-jm-dict.json` is the admin route that populates the reference column.

### Bootstrap (one-time, at implementation)

1. `cp data/dictionary.json data/latest-jm-dict.json` — commit as the frozen baseline.
2. `cp data/dictionary.json data/live-dictionary.json` — commit as the initial live dictionary.
3. `git rm data/dictionary.json`.
4. Seed the prod volume: on first post-deploy admin boot, if `/app/persist/live-dictionary.json` is missing, the loader copies the committed `data/live-dictionary.json` into the volume path before returning. This only happens once; subsequent boots find the volume file and use it directly.

## Dictionary Loading

Two paths are now distinct:

- **Base dictionary path** (live-dictionary.json): resolves from the Railway volume on prod, from the repo elsewhere.
- **Overlay data path** (creatures.json, moves.json, etc.): always `process.cwd()/data` — these are committed repo files and never live on the volume.

`src/game/word-dictionary.js` changes:

- `loadWordDictionary(dataDir)` gains a second parameter (or a module-level resolver) for the base dictionary path. Proposed signature: `loadWordDictionary({ overlayDir, liveDictPath })`. Callers pass both explicitly.
- Base load reads `liveDictPath` (the resolved live-dictionary file path), not `join(overlayDir, 'dictionary.json')`.
- Overlay merging (creatures/moves/items/npcs/areas/glue/grammar) continues to read from `overlayDir` unchanged.
- Nothing in game runtime reads `latest-jm-dict.json` or the removed `dictionary.json`.

The resolver lives in a new small helper (e.g. `src/game/live-dict-path.js`):

```js
export function resolveLiveDictPath() {
  const volumePath = '/app/persist/live-dictionary.json';
  const repoPath = path.join(process.cwd(), 'data', 'live-dictionary.json');
  if (existsSync(volumePath)) return volumePath;
  if (existsSync(repoPath)) {
    // First-boot seeding: if we are in a prod-like env (volume dir exists) copy the repo file into it.
    if (existsSync('/app/persist')) {
      copyFileSync(repoPath, volumePath);
      return volumePath;
    }
    return repoPath;
  }
  throw new Error('No live-dictionary.json found at volume or repo path');
}
```

### Cache invalidation

The module-level dictionary cache today lives in `src/game/bootstrap/word-knowledge.js`:

```js
let _wordDict = null;
function getWordDict() {
  if (!_wordDict) _wordDict = loadWordDictionary(DICT_DIR);
  return _wordDict;
}
```

Add an exported invalidator in the same module:

```js
export function invalidateWordDict() { _wordDict = null; }
```

Called by the admin save route after a successful write. Next `getWordDict()` call reloads from disk.

## Admin Editing Surface

File: `public/admin-word-exposures.html` + `src/routes/admin-word-exposures.js` backend.

### New backend fields on each row

- `jmdictDefinition` — primary English gloss from `latest-jm-dict.json`, or `null` if the word isn't in JMdict. Populated by loading `latest-jm-dict.json` once at route initialization.
- `overlayOwner` — filename of the overlay that defines this word (e.g. `"creatures.json"`), or `null`. Populated by tracking overlay sources during dictionary load, or recomputing per row.

### New UI

- New table column: **JMDict Definition** — shows `jmdictDefinition`. Read-only.
- New per-row button: **Edit live definition** — opens the edit modal described below.
- Row visual treatment: when `overlayOwner` is set, the row has a subtle badge (e.g. `[creatures.json]`) to flag overlay ownership at a glance.

### Edit modal

Fields:

- **Word** (readonly): Japanese base form.
- **Reading** (editable text input): pre-filled from live dict.
- **Definitions** (editable list):
  - Each row: `en` text input, `primary` radio (exactly one primary across all rows), reorder buttons (↑ ↓), delete button.
  - "Add definition" button at the bottom.
- **JMDict baseline** (readonly reference panel on the side): shows `latest-jm-dict.json` reading + full definitions for comparison.
- **Overlay warning banner** (shown only when `overlayOwner` is set): red callout — *"This word is also defined in `${overlayOwner}`. Your edit will save to the live dictionary but will be overridden by the overlay on next boot. To change the player-facing gloss, edit `${overlayOwner}` instead."* Save button remains enabled so the curator can still update the baseline in case the overlay is removed in the future.
- **Save** / **Cancel**.

Save validation (client-side and server-side):

- `reading` is non-empty
- at least one definition
- exactly one definition has `primary: true`
- every `en` is non-empty after trim

Writes are disabled when `DICTIONARY_READONLY=true` (see Workflow section). Client reflects this by disabling the Edit button globally with a tooltip: *"Dictionary editing is disabled in this environment. Use production."*

### Endpoints

- `GET /api/admin/dictionary/:word` — returns the current live entry for that word plus `jmdictDefinition` and `overlayOwner`. Used to populate the edit modal.
- `PUT /api/admin/dictionary/:word` — body `{ reading, definitions }`. Validates, writes atomically, invalidates dict cache, triggers async git sync. Responds `{ ok: true, overlayOverridden: boolean, gitCommitStatus: 'queued' | 'skipped-readonly' }`.
- `GET /api/admin/dictionary/export` — returns the live dictionary as a `Content-Disposition: attachment` JSON download. Break-glass / manual backup.

All endpoints require admin auth (existing `adminAuth` middleware).

## FSRS Card Lazy Resolution

### Today

`src/game/bootstrap/word-knowledge.js:75-77`:

```js
createCard(userId, 'vocab', word, {
  word, meaning: dictMeaning || meaning, reading
});
```

Each card on disk has baked `meaning` and `reading` strings. Roughly six modules read these fields when surfacing cards to the player.

### Change

1. **Stop baking.** `createCard(userId, 'vocab', word, { word })` — drop `meaning` and `reading` from the metadata written at card creation.
2. **New helper** in `src/game/bootstrap/word-knowledge.js`:
   ```js
   export function hydrateCard(card, dict = getWordDict()) {
     if (!card) return card;
     return {
       ...card,
       meaning: lookupMeaningFrom(dict, card.id),
       reading: lookupReadingFrom(dict, card.id),
     };
   }
   export function hydrateCards(cards, dict = getWordDict()) {
     return cards.map(c => hydrateCard(c, dict));
   }
   ```
3. **Audit and update read sites.** Any route or service that surfaces a vocab card to the player calls `hydrateCard()` (or `hydrateCards()`) before returning. Initial audit list (from grep for `card.meaning` / `c.meaning` / `vocab.*meaning`):
   - `src/routes/game/known-words.js`
   - `src/game/services/exploration-service.js`
   - `src/routes/admin.js`
   - `src/routes/admin-word-exposures.js`
   - `src/game/vocab-manager.js`
   - `src/auth/routes.js`
   - any other consumer of `getDeckCards(userId, 'vocab')` that forwards cards to the client
4. **No migration.** Existing cards on disk still carry stale `meaning` / `reading` fields; the grade flow preserves all non-FSRS metadata so those stale fields persist indefinitely. That is fine — hydration always overrides them on read. The fields become harmless ballast.
5. **FSRS fields untouched.** `due`, `stability`, `state`, `reps`, etc. are never touched by this change. Learning progress is preserved.

### Why this removes the cleanup script

The original proposal included a cleanup job that rewrites every `srs-u_*.json` on every dictionary edit to keep the baked `meaning` in sync. Lazy resolution makes that job unnecessary — the source of truth is the live dictionary at read time, and the baked field becomes advisory and ignored.

## Robustness: Prod-only Writes + Auto-Commit

### Rule

- **Prod is the only writer.** The save endpoint honors a `DICTIONARY_READONLY` env var. On local and dev Railway, `DICTIONARY_READONLY=true` — save returns `403 read-only`. On prod, unset (or `false`).
- **Every successful prod save auto-commits** the new `live-dictionary.json` to a dedicated `dictionary` branch in the repo.

### Why prod-only

With multiple environments editable, the volume file on each diverges silently, and there is no sync story between them. Locking writes to prod means there is exactly one authoritative source, and the repo snapshot converges on it automatically via auto-commit.

### Auto-commit flow

On successful `PUT /api/admin/dictionary/:word`:

1. Synchronous: atomic write to `/app/persist/live-dictionary.json`, invalidate dict cache, respond to the client.
2. Async (fire-and-forget, but tracked): enqueue a git sync job. The job:
   - `cd` into a bare checkout of the repo on the volume (`/app/persist/.dictionary-repo/`), or re-clone shallow if missing.
   - `git fetch origin dictionary`
   - `git checkout dictionary` (or create it from `master` if missing)
   - Overwrite `data/live-dictionary.json` with the current volume file.
   - `git add data/live-dictionary.json && git commit -m "dict: edit ${word}" && git push origin dictionary`.
   - If push fails (network, conflict): retry with exponential backoff (up to 3 attempts), then surface as an error banner on the admin dashboard via a new `GET /api/admin/dictionary/sync-status` endpoint.
3. Credentials: `DICTIONARY_BOT_GITHUB_TOKEN` env var on prod Railway, scoped to push-access on this repo for the `dictionary` branch only. Commits attributed to a `koto-dictionary-bot` user.

### Why a separate `dictionary` branch

Railway auto-deploys on `master`. Pushing every dictionary edit directly to `master` would trigger a deploy per edit. Using a sibling `dictionary` branch avoids that. Periodically (weekly cadence, or a GitHub Action on demand) the `dictionary` branch is merged into `master` so new deploys ship with a current snapshot.

### Nightly reconciliation (belt-and-suspenders)

A GitHub Action runs nightly:

- Hits `GET /api/admin/dictionary/export` on prod (authenticated via an action-scoped admin token stored as a GitHub Action secret).
- Diffs against `data/live-dictionary.json` on the `dictionary` branch.
- If different, commits the fresh export as `dict: nightly sync`.

This catches edge cases where the in-process auto-commit failed and the error banner was missed.

### Failure semantics

The volume write is the authoritative success signal. If it succeeds, the admin edit is effective and the player sees the new gloss immediately. Git sync is best-effort catch-up. A git failure never rolls back the volume write; it only surfaces as a "last N edits haven't been committed to git" banner with a retry button.

## Response Shape

`PUT /api/admin/dictionary/:word` returns:

```json
{
  "ok": true,
  "word": "切る",
  "overlayOverridden": false,
  "gitCommitStatus": "queued"
}
```

- `overlayOverridden: true` means the word has an overlay owner and the edit will be shadowed on next boot. Client displays a post-save toast reminding the curator.
- `gitCommitStatus` is one of `"queued"` (auto-commit enqueued) or `"skipped-readonly"` (save blocked by `DICTIONARY_READONLY`). The actual success of the git commit is fetched separately via `GET /api/admin/dictionary/sync-status`, which returns the last N commit attempts with success/failure and timestamps.

## File-Level Changes

### Required

- `data/live-dictionary.json` — new, initial copy of `dictionary.json`.
- `data/latest-jm-dict.json` — new, frozen copy of `dictionary.json`.
- `data/dictionary.json` — deleted.
- `src/game/word-dictionary.js` — switch base load to `live-dictionary.json`; accept `{ overlayDir, liveDictPath }` so callers supply the resolved base path; overlays still read from `overlayDir`.
- `src/game/live-dict-path.js` — **new**, `resolveLiveDictPath()` helper (volume → repo fallback, first-boot seed).
- `src/game/bootstrap/word-knowledge.js` — drop `meaning`/`reading` from `createCard()` call; add `hydrateCard()` / `hydrateCards()` and `invalidateWordDict()` exports; pass resolved paths into `loadWordDictionary()`.
- `src/routes/game/known-words.js` — hydrate cards before returning.
- `src/game/services/exploration-service.js` — hydrate any cards forwarded to the client.
- `src/routes/admin.js` — hydrate when listing vocab cards.
- `src/game/vocab-manager.js` — hydrate when serving next card.
- `src/auth/routes.js` — hydrate in any card-surfacing paths (audit needed).
- `src/routes/admin-word-exposures.js` — add `jmdictDefinition` and `overlayOwner` fields; add `GET /api/admin/dictionary/:word`, `PUT /api/admin/dictionary/:word`, `GET /api/admin/dictionary/export`, `GET /api/admin/dictionary/sync-status`.
- `src/routes/admin-dictionary-sync.js` — **new**, background git sync worker.
- `public/admin-word-exposures.html` — new column, new button, edit modal, sync-status banner, read-only UX.

### Environment / deploy

- `.env.example` — document `DICTIONARY_READONLY`, `DICTIONARY_BOT_GITHUB_TOKEN`.
- Railway prod: unset `DICTIONARY_READONLY` (or `false`), set `DICTIONARY_BOT_GITHUB_TOKEN`.
- Railway dev + local: `DICTIONARY_READONLY=true`.
- New GitHub Action: `.github/workflows/dictionary-nightly-sync.yml`.

### Tests

- `tests/unit/word-dictionary.test.js` — base load is `live-dictionary.json`; overlays still apply; `invalidateWordDict()` clears cache.
- `tests/unit/hydrate-card.test.js` — **new** — `hydrateCard()` returns current dict meaning/reading regardless of baked fields.
- `tests/unit/admin-dictionary-edit.test.js` — **new** — route validates payload, writes atomically, invalidates cache, respects `DICTIONARY_READONLY`.
- `tests/unit/admin-word-exposures.test.js` — extend — rows include `jmdictDefinition` and `overlayOwner`.
- Integration: register user, expose word to threshold, read card → meaning from live dict; edit definition via route; next card read reflects the edit without any rewrite of the SRS file.
- Integration: edit an overlay-owned word; response includes `overlayOverridden: true`; next dictionary load still shows the overlay value (because overlays still win).

## Acceptance Criteria

1. `data/live-dictionary.json` is the sole dictionary source at runtime; `data/dictionary.json` is removed.
2. `data/latest-jm-dict.json` is a frozen snapshot, read only by the admin-word-exposures route.
3. On Railway prod, the live dictionary is stored at `/app/persist/live-dictionary.json` and survives deploys; first boot seeds it from the committed copy.
4. Admin curator can edit reading + full definitions array for any exposed word, including overlay-shadowed ones (with an explicit warning that the overlay will continue to override).
5. `createCard()` no longer writes `meaning` or `reading` to disk; player-facing card display resolves both fields from the live dictionary on every read via `hydrateCard()`.
6. Dictionary edits take effect for prod players on the next card read, without any migration or cleanup of per-user files.
7. Local dev, dev Railway, and CI boot from the committed `data/live-dictionary.json` without network access. Their admin save button is disabled via `DICTIONARY_READONLY=true`.
8. Every successful prod admin save triggers an async git commit to the `dictionary` branch. Failures surface as a visible banner on the admin page; they never roll back the volume write.
9. A nightly GitHub Action reconciles the `dictionary` branch with prod's export endpoint.
10. JMdict is never loaded by game runtime code.

## Explicit Non-Decisions (Deferred)

- Automated merge from `dictionary` branch into `master`. Today: manual or weekly.
- A Dictionary Browser admin view for unexposed words.
- An audit log UI (git history of `dictionary` branch is the audit trail).
- A server-side `Import` endpoint that overwrites the prod volume from an uploaded file. Useful for disaster recovery; punt to a follow-up.
- Rate limiting on the edit endpoint. The endpoint is admin-only behind existing auth; we'll add rate limits if abuse becomes a concern.
- Detection / merging of concurrent edits (two admins editing the same word). Last-write-wins on the volume; git auto-commit may produce a trivial conflict that the retry loop resolves. Not a realistic problem at current scale.
