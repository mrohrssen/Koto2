# Admin JPDB Comparison Restore — Design Spec

**Date:** 2026-04-17
**Goal:** Restore the JPDB-vs-Sudachi comparison UI and backend on the admin word exposure dashboard. The comparison was built in April 2026 and ripped out during the JPDB runtime removal (chunks 2 and 4, commits `b505f74` + `3b38eb6`). The dashboard is an internal developer tool for catching tokenization and dictionary errors — it is not runtime gameplay code, and should not have been in scope for the JPDB runtime removal.

## Background

The JPDB runtime removal (spec `2026-04-16-jpdb-removal-design.md`) successfully removed JPDB as the game's SRS backend in favor of FSRS. However, the cleanup also removed the admin dashboard's JPDB comparison view, which is a developer-only diagnostic tool:

- **Word Exposures tab**: compares each word's Sudachi base form + our dictionary definition against JPDB's parse result, surfacing dictionary mistakes and tokenization divergences
- **Frame Comparison tab**: compares each dialogue frame's Sudachi tokenization against JPDB's sentence-level parse, catching merge/split/spelling errors in `frame-sources.json` output

Both tabs were valuable for QA of the tokenization pipeline and should be restored.

## What Remains After the Removal

- `scripts/lib/jpdb-helpers.mjs` — dev-side JPDB helper with `parseBatch`, `lookupVocab`, `tierFromRank`, 429 retry logic. Intentionally preserved by the removal spec as an "out of scope — dev tools stay" item.
- `JPDB_API_KEY` in local `.env` (still accepted; removed from `.env.example` in chunk 2)
- `src/routes/admin-word-exposures.js` — skeleton route file. Aggregation endpoint works; JPDB endpoints and helpers gutted.
- `.gitignore` entries for the two cache files (from commit `aceee60`)

## What Was Deleted and Must Be Restored

From `public/admin-word-exposures.html` (commit `3b38eb6` diff, 173 lines removed):
- Four new table columns on Words tab: JPDB Spelling, JPDB Reading, JPDB Definition, Different?
- Two new columns on Frames tab: JPDB Tokens, Diffs
- "Show only differences" checkbox
- Progress indicator (`wordProgress`, `frameProgress` spans)
- Row-level styling for diffs (`tr.different`, `.diff-yes`, `.diff-badge`, `.diff-merge`, `.diff-split`, `.diff-spelling`)
- `jpdbWordResults` and `jpdbFrameResults` state maps
- Progressive Phase 2 batch-loading loop
- `formatDiffPart()` helper

From `src/routes/admin-word-exposures.js` (commit `b505f74` diff, ~238 lines removed):
- `buildJpdbComparison(word, jpdbResponse)` — word-level comparison logic
- `buildFrameComparison(frame, jpdbResponse)` — frame-level alignment logic with lookahead
- `POST /api/admin/word-exposures/jpdb-compare` — batch word comparison endpoint
- `POST /api/admin/frames/jpdb-compare` — batch frame comparison endpoint
- Disk cache read/write helpers for the two cache files

From `tests/unit/admin-word-exposures.test.js` (commit `3b38eb6`, 253 lines removed):
- Unit tests for `aggregateWordExposures`, `buildJpdbComparison`, `buildFrameComparison`

## Approach: Rebuild on Dev Helper, Don't Revive Runtime Client

The original admin endpoints imported `parseText` and `lookupVocabularyMeaning` from `src/jpdb.js`. That file was 1,522 lines — a full SRS-aware runtime client — and has been deleted. Reviving it would drag runtime coupling back into the codebase for two endpoints that only need the `parse` and `lookup-vocabulary` JPDB API calls.

The surviving `scripts/lib/jpdb-helpers.mjs` already wraps both calls (`parseBatch` and `lookupVocab`), with 429 retry logic and batch-awareness. The admin route file will import from there directly, with a small adapter for single-text semantics.

### Adapter

Small glue inside `src/routes/admin-word-exposures.js` — not a new module:

```js
import { parseBatch } from '../../scripts/lib/jpdb-helpers.mjs';

async function parseOne(text, apiKey) {
  const result = await parseBatch([text], apiKey, {
    vocabularyFields: ['spelling', 'reading', 'meanings'],
    batchSize: 1,
  });
  // parseBatch returns { vocabulary, tokens } where tokens is an array of
  // sentence-token-arrays. For a single input we want the first sentence.
  // Also normalize to array-tuple form — jpdb-helpers returns bare numbers
  // when tokenFields has one entry (the default), but the comparison logic
  // expects tokens[i][0] access.
  const rawTokens = result.tokens[0] || [];
  const tokens = rawTokens.map(t => Array.isArray(t) ? t : [t]);
  return { tokens, vocabulary: result.vocabulary };
}
```

**Improvement over the deleted code:** the original backend needed two JPDB calls per word — `parseText` then `lookupVocabularyMeaning` — because `parseText` only returned spelling+reading. By asking `parseBatch` for `meanings` in `vocabularyFields`, we get the definition back in the same parse response and halve admin-dashboard latency. `buildJpdbComparison` reads `vocab[2]?.[0]` for the definition instead of null.

No `lookupVocab` wrapper needed — this is the entire adapter surface.

## Endpoints

Both admin-auth'd via existing `adminAuth` middleware in `src/routes/admin.js`.

### `POST /api/admin/word-exposures/jpdb-compare`

**Request:**
```json
{ "words": ["火", "すみません", "いらっしゃいませ"] }
```

**Behavior:**
1. Load `data/jpdb-tokenization-cache.json` if not already in memory.
2. For each word in the batch:
   - Cache hit → push cached result.
   - Cache miss → call `parseOne(word, apiKey)`; build comparison via `buildJpdbComparison` (which reads spelling, reading, and definition from the same vocabulary entry); cache the result.
3. Write cache to disk once per batch (not per word) to reduce fsync churn.
4. Return the results map with `cached` and `fetched` counts.

**Response:**
```json
{
  "results": {
    "火": { "jpdbSpelling": "火", "jpdbReading": "ひ", "jpdbDefinition": "fire", "isDifferent": false },
    "いらっしゃいませ": { "jpdbSpelling": "いらっしゃる", "jpdbReading": "いらっしゃる", "jpdbDefinition": "to come; to go", "isDifferent": true }
  },
  "cached": 1,
  "fetched": 2
}
```

**Error conditions:**
- Missing `JPDB_API_KEY` → `503 { error: "JPDB_API_KEY not configured" }`
- Per-word JPDB failure → item in results is `{ error: true }`; batch continues
- JPDB 429 — `jpdb-helpers` auto-retries once after 60s; subsequent failure is logged and returned as per-item error

### `POST /api/admin/frames/jpdb-compare`

**Request:**
```json
{ "frameIds": ["bark_onHit_001", "greeting_001"] }
```

**Behavior:**
1. Load `data/jpdb-frame-compare-cache.json` and `data/dialogue/frames.json` if not in memory.
2. For each frame ID:
   - Cache hit → push cached result.
   - Cache miss → find the frame in `frames.json`; call `parseOne(frame.raw, apiKey)`; build comparison via `buildFrameComparison(frame, jpdbResponse)`; cache.
3. Write cache once per batch.

**Response:**
```json
{
  "results": {
    "bark_onHit_001": {
      "raw": "やめて！",
      "sudachiTokens": [{"base":"やめる","surface":"やめ"}],
      "jpdbTokens": [{"spelling":"やめる","reading":"やめる"}],
      "isDifferent": false,
      "diffs": []
    }
  },
  "cached": 0,
  "fetched": 1
}
```

**Error conditions:** same as word endpoint. Frame not found in `frames.json` → item is `{ error: "frame not found" }`.

## Comparison Logic

### `buildJpdbComparison(ourWord, jpdbResponse)`

Ported directly from the pre-deletion code (see commit `b505f74^` for reference).

- `tokens.length === 0` → JPDB failed to parse. Return `{ jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true }`.
- `tokens.length === 1` → single-token match. Read `vocab = vocabulary[token[0]]`, pull `spelling = vocab[0]`, `reading = vocab[1]`, `definition = vocab[2]?.[0] ?? null` (meanings array, first entry). Return `{ jpdbSpelling, jpdbReading, jpdbDefinition, isDifferent: spelling !== ourWord }`.
- `tokens.length > 1` → JPDB split our "single word" into multiple pieces (signals we may be over-merging). Return joined spellings/readings with `+` separator, `isDifferent: true`, `jpdbDefinition: null`.

### `buildFrameComparison(frame, jpdbResponse)`

Ported directly. Greedy alignment with lookahead classifying diffs as `merge`, `split`, or `spelling`:

1. Extract Sudachi content tokens from `frame.tokens`: has `base`, not a `{slot}` marker.
2. Extract JPDB tokens from `jpdbResponse.tokens` + `jpdbResponse.vocabulary`.
3. Walk both sequences:
   - If `sToken.base === jToken.spelling` → match, advance both pointers.
   - If concatenating next N Sudachi bases equals `jToken.spelling` → **merge** diff (Sudachi over-split).
   - If `sToken.base` equals concatenated next N JPDB spellings → **split** diff (Sudachi over-merged).
   - Otherwise → **spelling** diff at current position.
4. Result: `{ raw, sudachiTokens, jpdbTokens, isDifferent: diffs.length > 0, diffs: [{type, sudachi, jpdb}, ...] }`.

## Cache Files

- `data/jpdb-tokenization-cache.json` — `{ [word]: WordComparison }`
- `data/jpdb-frame-compare-cache.json` — `{ [frameId]: FrameComparison }`
- Both lazy-loaded on first request, batch-flushed to disk.
- Both already in `.gitignore` (commit `aceee60`); initialize as `{}` if file missing.
- **Invalidation policy:** none automatic. Operator deletes the file to force re-fetch. Acceptable for an internal admin tool — matches prior policy.

## Frontend (`public/admin-word-exposures.html`)

Revert the removed UI from commit `3b38eb6` diff, adapted only where the backend API has changed (shouldn't have changed — endpoints restored with same shape):

- Add back four Words-tab columns (`JPDB Spelling`, `JPDB Reading`, `JPDB Definition`, `Different?`) and two Frames-tab columns (`JPDB Tokens`, `Diffs`).
- Add back "Show only differences" checkbox; wire `diffOnly` filter in both `renderWords()` and `renderFrames()`.
- Add back progress indicator (`#wordProgress`, `#frameProgress` spans).
- Add back styles: `tr.different`, `.diff-yes`, `.diff-badge`, `.diff-merge`, `.diff-split`, `.diff-spelling`, `.checkbox-wrap`, `.progress`.
- Add back state maps `jpdbWordResults`, `jpdbFrameResults`.
- Add back `formatDiffPart()` helper.
- Add back Phase 2 progressive load: after Phase 1 completes, batch both words (20 per call) and frames (20 per call) to the respective `/jpdb-compare` endpoints. After each batch, merge results into state maps and call `renderAll()`. Update progress span with "N/M processed".
- Progress span hides when Phase 2 finishes.

Graceful degradation: if Phase 2 gets a `503` (no API key), render "JPDB unavailable" in the progress span and leave the JPDB columns empty (show `—` rather than `...`).

## Testing

Port back `tests/unit/admin-word-exposures.test.js`. Coverage:

- **`aggregateWordExposures`**: multi-user merge, dictionary enrichment (primary definition preference), missing dictionary entry (null reading/definition), malformed file tolerance, empty data dir.
- **`buildJpdbComparison`**:
  - single-token exact match (`isDifferent: false`)
  - single-token spelling diff (`isDifferent: true`)
  - multi-token split (JPDB broke our word apart — `isDifferent: true`, `+`-joined)
  - empty tokens (`isDifferent: true`, nulls)
- **`buildFrameComparison`**:
  - identical tokenization (no diffs)
  - merge diff (Sudachi splits `申し訳ございません` into pieces; JPDB keeps whole)
  - split diff (Sudachi merges two words that JPDB splits)
  - spelling diff at matched position
  - slot filtering (`{slot}` markers excluded from Sudachi side)

No integration tests against live JPDB. Mock `parseBatch` and `lookupVocab` from `jpdb-helpers`.

## File Summary

| File | Change | Approx lines |
|------|--------|--------------|
| `src/routes/admin-word-exposures.js` | Add back helpers + 2 endpoints + cache I/O + adapter | +~260 |
| `public/admin-word-exposures.html` | Revert UI pieces from commit `3b38eb6` | +173 |
| `tests/unit/admin-word-exposures.test.js` | Restore test file | +253 |
| `data/jpdb-tokenization-cache.json` | Recreate empty (gitignored) | `{}` |
| `data/jpdb-frame-compare-cache.json` | Recreate empty (gitignored) | `{}` |

## Non-Goals

- No changes to FSRS or the runtime vocab pipeline.
- No new JPDB runtime client (`src/jpdb.js` stays deleted).
- No auto-invalidation of cache files.
- No live-JPDB integration tests.
- No changes to `scripts/lib/jpdb-helpers.mjs` (treat as stable dev helper).

## Risks

- **API key drift:** Over time the dev's `JPDB_API_KEY` may expire or rotate. The 503 graceful-degrade path keeps the rest of the dashboard usable.
- **Rate limits on full-dashboard runs:** First-time load with empty cache across hundreds of words will hit JPDB repeatedly. The 429 retry in `jpdb-helpers` handles this, and subsequent loads are cache-fast. Acceptable.
- **Cache-file staleness:** If `frames.json` regenerates with changed raw text, frame-level cache won't auto-invalidate. Operator deletes the cache. Documented above.
