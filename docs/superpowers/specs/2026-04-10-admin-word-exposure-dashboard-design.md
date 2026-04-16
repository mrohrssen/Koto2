# Admin Word Exposure Dashboard — Design Spec

**Date:** 2026-04-10
**Purpose:** Admin dashboard to track all words exposed to all users, with JPDB tokenization comparison to catch where our Sudachi tokenization diverges from JPDB's.

## Motivation

JPDB's tokenization is considered the gold standard. Our Sudachi-based tokenizer sometimes disagrees — different base forms, different word boundaries, different definitions. This dashboard surfaces those discrepancies so we can fix our dictionary and tokenization pipeline. It also gives visibility into which words players actually see most.

## Architecture: Two-Phase Load

**Phase 1 (instant):** API aggregates all `data/word-knowledge-*.json` files, merges exposure counts across users, enriches with dictionary definitions. Returns immediately.

**Phase 2 (progressive):** Frontend sends words in batches to a JPDB comparison endpoint. JPDB parse + vocabulary lookup results are cached in `data/jpdb-tokenization-cache.json`. Subsequent page loads are instant.

## API Endpoints

All endpoints require `X-Admin-Secret` header (same as existing admin routes in `src/routes/admin.js`). JPDB calls use `process.env.JPDB_API_KEY` from `.env`.

### GET /api/admin/word-exposures

Reads all `data/word-knowledge-*.json` files, aggregates exposure counts across users. Enriches each word with reading and definition from `data/dictionary.json`.

**Response:**
```json
{
  "words": [
    {
      "word": "火",
      "reading": "ひ",
      "definition": "fire",
      "totalExposures": 47,
      "userCount": 3
    }
  ],
  "totalUniqueWords": 812,
  "totalUsers": 5
}
```

- `word` = Sudachi base form (kanji where applicable)
- `totalExposures` = sum of `seen[word].exposures` across all user files (total times all users saw this word)
- `userCount` = number of distinct users who have this word in their `seen` object
- `reading` and `definition` from `data/dictionary.json`. If a word is not in the dictionary, these are `null`.
- Only aggregates from `seen`, not `known` (exposure count, not mastery status)
- Sorted descending by `totalExposures`

### POST /api/admin/word-exposures/jpdb-compare

Takes a batch of words, parses each through JPDB, looks up definitions. Returns JPDB's tokenization and definition for comparison. Results are cached server-side.

**Request:**
```json
{ "words": ["火", "すみません", "いらっしゃいませ"] }
```

**Response:**
```json
{
  "results": {
    "火": {
      "jpdbSpelling": "火",
      "jpdbReading": "ひ",
      "jpdbDefinition": "fire",
      "isDifferent": false
    },
    "いらっしゃいませ": {
      "jpdbSpelling": "いらっしゃる",
      "jpdbReading": "いらっしゃる",
      "jpdbDefinition": "to come; to go; to be (somewhere)",
      "isDifferent": true
    }
  },
  "cached": 1,
  "fetched": 2
}
```

**How comparison works:**
1. Send each word to JPDB `/api/v1/parse` as text
2. JPDB returns vocabulary entries with `spelling` (the dictionary headword/base form). Compare JPDB's `spelling` against our Sudachi base form.
3. If JPDB returns a single token whose `spelling` matches our word → `isDifferent: false`
4. If JPDB's `spelling` differs (e.g. いらっしゃいませ → いらっしゃる), returns multiple tokens, or no result → `isDifferent: true`
5. Use `vid`/`sid` from parse to batch-call `/api/v1/lookup-vocabulary` with `["spelling", "reading", "meanings"]` fields
6. Cache results in `data/jpdb-tokenization-cache.json` (keyed by word string)

**Note on conjugated forms:** Many words in our exposure data are Sudachi base forms that are already dictionary forms (e.g. 食べる, 見る). But some entries like いらっしゃいませ are stored as-is by Sudachi rather than normalized to the dictionary form. When JPDB parses these, it returns the true dictionary headword (いらっしゃる), which is the discrepancy we want to catch.

**Rate limiting:** JPDB has a 500ms minimum interval. Each word requires one parse call, so a batch of 50 uncached words takes ~25 seconds server-side. For a cold cache with ~800 unique words, the full comparison takes ~7-8 minutes — this is a one-time cost. The frontend shows progressive results as batches complete. Subsequent loads are instant from cache.

**Error handling:** If `JPDB_API_KEY` is missing, return 503 `{ error: "JPDB API key not configured" }`. If JPDB is rate-limited or circuit-broken, return partial results for cached words plus `{ error: "JPDB rate limited, showing cached results only" }` with a 207 status. If the `words` array is empty, return 400.

### POST /api/admin/word-exposures/frame-compare

Takes a batch of frame IDs, parses their raw text through JPDB at the sentence level, compares token boundaries against our Sudachi tokenization in `frames.json`.

**Request:**
```json
{ "frameIds": ["buy_polite", "greet_welcome_browse"] }
```

**Response:**
```json
{
  "results": {
    "greet_welcome_browse": {
      "raw": "いらっしゃいませ、ゆっくり見てください！",
      "sudachiTokens": [
        { "base": "いらっしゃいませ", "surface": "いらっしゃいませ" },
        { "base": "ゆっくり", "surface": "ゆっくり" },
        { "base": "見る", "surface": "見" },
        { "base": "くださる", "surface": "ください" }
      ],
      "jpdbTokens": [
        { "spelling": "いらっしゃる", "reading": "いらっしゃる", "definition": "to come; to go; to be" },
        { "spelling": "ゆっくり", "reading": "ゆっくり", "definition": "slowly; unhurriedly" },
        { "spelling": "見る", "reading": "みる", "definition": "to see; to look" },
        { "spelling": "ください", "reading": "ください", "definition": "please (give me)" }
      ],
      "isDifferent": true,
      "diffs": [
        { "type": "spelling", "sudachi": "いらっしゃいませ", "jpdb": "いらっしゃる" },
        { "type": "spelling", "sudachi": "くださる", "jpdb": "ください" }
      ]
    }
  }
}
```

**Diff types:**
- `merge` — JPDB has one token where Sudachi has multiple (catches over-splitting)
- `split` — JPDB has multiple tokens where Sudachi has one (catches over-merging)
- `spelling` — same boundaries but different base form

**Slot handling:** Frames with `{item}`, `{creature}` etc. — strip slot markers before sending to JPDB. Only compare non-slot token segments.

**When `isDifferent` is false:** `diffs` is an empty array `[]`.

**Error handling:** If a frame ID doesn't exist in `frames.json`, skip it (don't include in results). Same JPDB error handling as the word-compare endpoint.

**Cache:** `data/jpdb-frame-compare-cache.json`, keyed by frame ID.

## Frontend

### Page: `/admin/word-exposures`

Standalone HTML page. Minimal styling — dark background, monospace, internal admin tool aesthetic. No framework.

**Auth:** Text field at top of page for admin secret. Stored in `sessionStorage` so it persists across tab refreshes within a session.

### Tab 1: Word Exposures

Table columns:

| # | Word (kanji) | Reading | Our Definition | Exposures | Users | JPDB Spelling | JPDB Reading | JPDB Definition | Different? |
|---|-------------|---------|---------------|-----------|-------|---------------|--------------|-----------------|------------|

**Behavior:**
- On load: fetches `/api/admin/word-exposures`, renders table immediately (columns 1-6)
- Then: sends words in batches of 50 to `/api/admin/word-exposures/jpdb-compare`
- JPDB columns fill in progressively with a progress indicator ("Comparing 150/812 words...")
- Rows where `isDifferent` is true are highlighted

**Filters:**
- "Show only differences" checkbox — hides rows where JPDB matches
- Text search across word/reading/definition columns

### GET /api/admin/frames

Returns all frame IDs, categories, and raw text from `data/dialogue/frames.json`. Used by the Frame Comparison tab to enumerate frames before submitting batches.

**Response:**
```json
{
  "frames": [
    { "id": "buy_polite", "category": "shop", "raw": "{item}をください" }
  ]
}
```

### Tab 2: Frame Comparison

Table columns:

| Frame ID | Category | Raw Text | Sudachi Tokens | JPDB Tokens | Diff Type |
|----------|----------|----------|----------------|-------------|-----------|

**Behavior:**
- Loads frame list from `GET /api/admin/frames`
- Sends frame IDs in batches to `/api/admin/word-exposures/frame-compare`
- Progressive loading with progress indicator
- Rows with diffs highlighted, diff type shown

**Filters:**
- "Show only differences" checkbox
- Category filter dropdown (shop, greeting, bark_*, befriend_*, etc.)

## Caching Strategy

Two cache files, both gitignored:
- `data/jpdb-tokenization-cache.json` — per-word JPDB results, keyed by word string
- `data/jpdb-frame-compare-cache.json` — per-frame JPDB results, keyed by frame ID

Cache is persistent across server restarts. No TTL — tokenization results don't change. If you want to re-compare (e.g. after JPDB updates), delete the cache files.

## Files to Create/Modify

**New files:**
- `src/routes/admin-word-exposures.js` — API route handlers
- `public/admin-word-exposures.html` — Dashboard page

**Modified files:**
- `server.js` — Mount the new admin routes
- `.gitignore` — Add `data/jpdb-tokenization-cache.json` and `data/jpdb-frame-compare-cache.json` (the existing pattern `!data/*.json` would un-ignore them without explicit entries)

**Shared middleware:**
- Export the admin auth check from `src/routes/admin.js` (or a shared helper) rather than duplicating it in the new route file.

## Validated JPDB Comparison Examples

From manual testing during design:

| Our Word | Our Definition | JPDB Spelling | JPDB Definition | Issue |
|----------|---------------|---------------|-----------------|-------|
| いらっしゃいませ | welcome | いらっしゃる | to come; to go; to be | Sudachi doesn't normalize to dictionary form |
| くださる (from ください) | to give / to confer | ください | please (give me) | JPDB treats ください as separate vocab entry, not a conjugation of くださる |

Frame-level example (`greet_welcome_browse`):

| Sudachi | JPDB | Type |
|---------|------|------|
| いらっしゃいませ | いらっしゃる | spelling |
| くださる | ください | spelling |
| ゆっくり | ゆっくり | match |
| 見る | 見る | match |
