---
name: jpdb-frequency-lookup
description: Use when enriching Japanese word lists or CSV files with JPDB frequency rank data, or when needing to look up word frequency from the JPDB API. Triggers on "JPDB frequency", "word frequency rank", "enrich with frequency".
---

# JPDB Frequency Lookup

Look up frequency ranks for Japanese words via the JPDB API and enrich data files with the results.

## IMPORTANT: API Key Required

**Always ask the user for their JPDB API key before running.** Never reuse a key from a previous session or from project files. Pass via environment variable: `JPDB_API_KEY=xxx`.

## JPDB API Reference

**Base URL:** `https://jpdb.io/api/v1`

**Step 1 — Parse words to get vid/sid:**
```
POST /parse
{ "text": "words joined by spaces",
  "token_fields": ["vocabulary_index"],
  "vocabulary_fields": ["spelling", "reading", "vid", "sid"] }
```
Response: `{ "vocabulary": [["spelling", "reading", vid, sid], ...] }`

**Step 2 — Lookup frequency rank:**
```
POST /lookup-vocabulary
{ "list": [[vid, sid], ...],
  "fields": ["spelling", "frequency_rank"] }
```
Response: `{ "vocabulary_info": [["spelling", rank], ...] }`

`frequency_rank` is a numeric rank (lower = more common). Example: 先生 = 500.

## Key Patterns

**Rate limiting:** 500ms minimum between API calls. Back off 60s on HTTP 429.

**Batch sizes:** ~200 words per `/parse` call, ~500 per `/lookup-vocabulary` call.

**Compound verb retry:** JPDB tokenizes `Xする` compounds as two tokens, so `料理する` won't match as one word. Strip する and re-parse the root:

```
料理する → parse "料理" → found (vid=1554310)
勉強する → parse "勉強" → found (vid=1512670)
```

Also handles: `Xにする`, multi-word expressions. Some words like `バス停の標識` may not resolve.

## Script

A ready-to-run enrichment script lives at `scripts/enrich-jpdb-freq.mjs` in the jrpg project. For other projects, adapt the script — core logic:

1. Read CSV, identify Japanese word columns and empty frequency columns
2. Collect unique words, batch-parse via `/parse` to get vid/sid
3. Retry failures with する-stripping
4. Batch `/lookup-vocabulary` with `frequency_rank` field
5. Map frequencies back to original words (including compounds mapped to roots)
6. Write enriched CSV

```bash
JPDB_API_KEY=xxx node scripts/enrich-jpdb-freq.mjs
```

## Common Issues

| Issue | Fix |
|-------|-----|
| `vocabulary_info: [null]` | Wrong vid/sid — parse the word first to get correct IDs |
| `unknown field name` | Use `frequency_rank` (not `frequency` or `rank`) |
| Compound verbs missing | Strip する suffix, re-parse root word |
| Rate limited (429) | Back off 60s, reduce batch size |
| Word truly missing | Some loanwords/compounds aren't in JPDB corpus — leave empty |
