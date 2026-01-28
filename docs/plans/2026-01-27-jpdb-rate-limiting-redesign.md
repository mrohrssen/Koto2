# JPDB Rate Limiting Redesign

## Problem

The server IP gets blocked by jpdb.io due to excessive API calls. Current implementation makes 6+ API calls per combat (1 at combat start + 1 per word replacement), leading to 30+ calls/hour during active play. The 500ms rate limiting in `jpdbFetch` isn't sufficient.

## Solution Overview

Replace deck-scanning and per-word fetches with a static word list + batched `/parse` calls. All combat word requests are served from a local cache refreshed every hour.

## Architecture

### Static Word List

Ship a JSON file (`data/jpdb-wordlist.json`) generated from `top_30k_words.csv` containing ~27k word spellings as a simple array:

```json
["食べる", "行く", "見る", ...]
```

### Cache Structure

Store in `.jrpg-vocab-suggestions.json`:

```json
{
  "lastFullParse": 1706380800000,
  "wordStates": {
    "食べる": { "vid": 123, "sid": 456, "states": ["due"], "dueAt": 1706380800000 },
    "行く": { "vid": 789, "sid": 101, "states": ["known"], "dueAt": null }
  },
  "recentlyUsedWords": ["食べる", "行く"]
}
```

### Initial Parse (Session Start)

When cache is missing or older than 1 hour:

1. Load static word list from `data/jpdb-wordlist.json`
2. Send 5 `/parse` batches of 2000 words each (covering 10k most frequent words)
3. Space batches 3 seconds apart (15 seconds total)
4. Store results with `lastFullParse` timestamp
5. All subsequent requests served from cache

If cache exists and is <1 hour old, skip parsing and serve from cache immediately.

### Combat Word Flow

**Combat start:**
- Read due words from local cache (no JPDB call)
- Filter for `due`, `failed`, `learning` states
- Sort by dueAt, return requested limit

**Word review:**
- Send review to JPDB via existing `/api/jpdb/review` endpoint (1 call)
- Update local cache: remove `due` state, set future dueAt
- Replacement word comes from local cache (no JPDB call)

**Post-combat re-check:**
- Collect all vids reviewed during combat
- Send single `/parse` call with those words' spellings
- Update local cache with fresh states and dueAt values
- Ensures newly-due words are available for next combat

### Cache Refresh (Stale Cache)

When cache is older than 1 hour and due words are requested:

1. Start background re-parse of all 5 batches
2. Serve words from stale cache while parsing (don't block gameplay)
3. Space batches 3 seconds apart
4. Swap in new cache when complete

### Circuit Breaker

Add to `jpdbFetch`:

- On 429 or 500 error: stop all calls for 5 minutes
- After 5 minutes: retry with single test call
- If test succeeds: resume normal operation
- If test fails: extend cooldown to 15 minutes
- During cooldown: serve from stale cache (any age)

## API Call Comparison

| Scenario | Current Calls | New Calls |
|----------|--------------|-----------|
| Session start (cold) | 51+ (deck scan) | 5 |
| Session start (warm) | 0 | 0 |
| Per combat | 6+ | 0 |
| Per word review | 0 | 0 |
| Post-combat | 0 | 1 |
| Cache refresh | 51+ | 5 |

**Estimated calls/hour:** 10 (worst case) vs 30+ (current)

## Files to Modify

### New Files

- `data/jpdb-wordlist.json` — Static word list generated from CSV

### Modified Files

1. **`src/jpdb.js`**
   - Add `parseWordBatch(apiKey, words)` — single batch parse call
   - Add `parseWordBatches(apiKey, words, batchSize, delayMs)` — orchestrates multiple batches
   - Add circuit breaker logic to `jpdbFetch`
   - Modify `fetchDueWordsDirectly` to read from local cache instead of scanning decks

2. **`src/game/vocab-manager.js`**
   - New cache format with `lastFullParse` timestamp
   - Add `performFullParse(apiKey)` — runs 5 batches at session start
   - Add `performIncrementalParse(apiKey, words)` — single batch for post-combat
   - Modify `refreshWordStateCache` to use new parsing logic

3. **`src/routes/game/misc.js`**
   - Add `POST /api/game/post-combat-refresh` endpoint
   - Accepts array of reviewed word spellings, returns updated states

4. **`public/js/word-practice.js`**
   - Remove `bypassCache: true` from all `fetchJpdbDueWords` calls
   - Track reviewed words during combat
   - Call post-combat refresh endpoint on combat end

5. **`public/js/ui/combat-loop.js`**
   - Trigger post-combat refresh after victory/defeat

## Implementation Phases

### Phase 1: Static Word List + Batch Parse

1. Generate `data/jpdb-wordlist.json` from CSV
2. Implement `parseWordBatch` and `parseWordBatches` in jpdb.js
3. Add full-parse logic to vocab-manager.js
4. Test: verify 5 batches complete successfully with 3s spacing

### Phase 2: Cache-Only Combat

1. Modify `fetchDueWordsDirectly` to read from local cache
2. Remove `bypassCache: true` from frontend calls
3. Test: verify zero JPDB calls during combat

### Phase 3: Post-Combat Refresh

1. Add tracking of reviewed words in word-practice.js
2. Implement `/api/game/post-combat-refresh` endpoint
3. Call endpoint on combat end
4. Test: verify single API call after combat with all reviewed words

### Phase 4: Circuit Breaker

1. Add circuit breaker state to jpdb.js
2. Implement cooldown logic on 429/500 errors
3. Test: verify graceful degradation when rate limited

## Testing

- Unit test: batch parsing with mock API
- Integration test: full session flow (cold start → combat → review → combat)
- E2E test: verify word replacement works from cache
- Rate limit test: verify circuit breaker activates on errors

## Rollback Plan

Keep existing `fetchAllDecksVocabulary` and deck-scanning code paths. Add feature flag to switch between old and new implementations during testing.
