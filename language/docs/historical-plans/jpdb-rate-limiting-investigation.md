# JPDB Rate Limiting Investigation

## Problem

Our server IP got blocked by jpdb.io due to excessive API calls. The app becomes unusable when blocked.

## Root Causes Found

### 1. Vocab repair on every narration (FIXED)

`enforceVocabLimit` in `vocab-repair.js` was called on every AI-generated narration via `applyVocabRepair` in `server.js:459`. It called `/parse` once per sentence (4-6 calls per narration). Since we only use hardcoded narrations (no AI), this was pure waste.

**Fix applied:** Commented out the call in `server.js:459`.

### 2. Deck scanning brute-forces IDs 1-50 (NOT YET FIXED)

`fetchAllDecksVocabulary` blindly scans deck IDs 1-50 = 51 API calls. The user actually has 48 decks with IDs up to 82, so it also **misses** 24 decks with IDs above 50.

`fetchDueWordsDirectly` falls back to this same scan when no cache exists.

### 3. No backoff on errors

When jpdb returns 500s, `jpdbFetch` keeps firing at 500ms intervals with no circuit breaker.

## API Findings

### jpdb endpoints used
- `/parse` - Parse text, returns vocab with card states. Accepts `text: string[]` (array).
- `/lookup-vocabulary` - Look up vid/sid pairs, returns requested fields. Chunks of 1000.
- `/deck/list-vocabulary` - Get vid/sid pairs from a deck.
- `/list-user-decks` - Get all user decks with metadata (1 call).
- `/review` - Submit review grade.

### Key discovery: `/parse` accepts batched text arrays

The anki-jpdb.reader extension sends multiple strings in a single `/parse` call. This means we can send many words at once and get `card_state` back for each, avoiding the need for separate `/lookup-vocabulary` calls.

### `/parse` batch size limits (tested)

| Batch size | Payload bytes | Result |
|-----------|---------------|--------|
| 10,000 | - | Failed: "too many elements" |
| 5,000 | - | Failed: "text is too long" |
| 2,500 | - | Failed: "text is too long" |
| 2,000 | ~11KB | Success (1952 vocab, 263 due) |
| 1,500 | ~8KB | Success (1461 vocab, 202 due) |
| 1,000 | - | Success (975 vocab, 135 due) |

The limit appears to be ~16KB payload size (consistent with the anki-jpdb extension's 16384 byte batch limit).

### `list-user-decks` works (tested)

Returns all 48 decks with IDs, names, vocab counts, and built-in status in 1 API call. User's deck IDs range from 2 to 82.

### `deck/list-vocabulary` with `id: "global"` does NOT work

Returns `{"error_message":"no such deck","error":"bad_deck"}`. The "All Vocabulary" view is website-only.

### No server-side card state filtering

`deck/list-vocabulary` does not support filtering by card state. You must fetch all vid/sid pairs and filter client-side.

## Proposed Solution: Static word list + `/parse` batches

User created deck 82 with ~27k top vocabulary words. Instead of scanning decks or fetching deck contents from the API, we:

1. Ship a static JSON file with the ~27k word spellings (from `top_30k_words.csv`)
2. To find due words: send words to `/parse` in batches of 2000, requesting `card_state`
3. Filter for `due`/`failed` states client-side
4. Cache the results

### Call count comparison

| Approach | API calls | Notes |
|----------|-----------|-------|
| Old: scan decks 1-50 + lookup | 51 + 27 = **78** | Misses decks >50 |
| list-user-decks + fetch each + lookup | 1 + 48 + 27 = **76** | Correct but heavy |
| Single deck (82) + lookup chunks | 1 + 27 = **28** | Requires deck to exist |
| Static word list + /parse batches | **14** | 27k / 2000 per batch |

### Important: must parse at least 10k words

Due words are scattered throughout the frequency list, not concentrated at the top. Parsing only the most common words won't find the most overdue cards. Minimum 10k words = 5 `/parse` calls.

## How the anki-jpdb extension avoids blocks

From reading the source code of [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader):

1. **Batches text into single parse calls** — collects paragraphs into 16KB chunks
2. **Sequential queue with delays** — `WorkerQueue` processes one call at a time with 200ms pause after each
3. **Never scans decks** — only parses text on screen, never bulk fetches
4. **No rate limiting wrapper needed** — low call volume by design

## Test Scripts

- [scripts/test-jpdb-deck.mjs](../scripts/test-jpdb-deck.mjs) — Tests `deck/list-vocabulary` and `list-user-decks` calls
- [scripts/test-jpdb-parse-batch.mjs](../scripts/test-jpdb-parse-batch.mjs) — Tests `/parse` batch size limits with the top 30k word list

Run with: `JPDB_API_KEY=your_key node scripts/test-jpdb-parse-batch.mjs`

## Still TODO

- [ ] Build static JSON from `top_30k_words.csv`
- [ ] Replace `fetchAllDecksVocabulary` and `fetchDueWordsDirectly` with `/parse`-based approach
- [ ] Add exponential backoff / circuit breaker to `jpdbFetch`
- [ ] Decide batch size (2000 works, could test higher)
- [ ] Decide minimum word coverage (at least 10k, ideally all 27k = 14 calls)
- [ ] Add spacing between batch calls (1-2 seconds recommended)
