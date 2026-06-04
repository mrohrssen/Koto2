# Koto Kanji Keyword Curation Design

## Purpose

Koto needs its own proprietary kanji dictionary for Kanji Kombat. The current `data/kanji/koto-kanji-dictionary.json` is Koto-shaped, but most `primaryMeaning` values were seeded mechanically from KANJIDIC2 through `scripts/build-koto-kanji-dictionary.mjs`. Many are unnatural as player-facing kanji keywords.

This project promotes `data/kanji/koto-kanji-dictionary.json` into the hand-curated source of truth and retires the generator as an authoring path. JPDB, WaniKani, KANJIDIC2, and JMdict become reference evidence only. The final Koto keyword for each kanji must be dictionary-accurate, natural, and fit for language learning.

## Decisions

1. `data/kanji/koto-kanji-dictionary.json` is the authoritative Koto kanji dictionary after this migration.
2. `scripts/build-koto-kanji-dictionary.mjs` must no longer overwrite curated dictionary choices.
3. `data/kanji/manual-overrides.json` is moved to `data/kanji/sources/manual-overrides-legacy-2026-06-04.json` as a historical reference and is no longer read by runtime or build tooling.
4. Review output is a CSV for human editing, not a final automatic mutation.
5. The user-reviewed CSV is imported back into `data/kanji/koto-kanji-dictionary.json` only after validation.
6. Reference keywords from JPDB and WaniKani must not be copied blindly. They are candidates for human and agent judgment.
7. The WaniKani API token is runtime-only through `WANIKANI_API_TOKEN`; it must never be committed or written to config.
8. JPDB API usage must be conservative. If no documented batch kanji-keyword API exists, use cached/resumable public page fetching instead of trying to force vocabulary endpoints.

## Current Data Shape

`data/kanji/koto-kanji-dictionary.json` currently has:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-01T11:27:20.843Z",
  "sources": [
    { "id": "kanjidic2", "name": "KANJIDIC2" },
    { "id": "jmdict", "name": "JMdict / Koto dictionary-derived examples" }
  ],
  "entries": [
    {
      "kanji": "人",
      "frequencyRank": 1,
      "kind": "Kyōiku (1st grade)",
      "primaryMeaning": "person",
      "secondaryMeanings": ["human being", "people"],
      "primaryReading": "ひと",
      "secondaryReadings": ["ジン", "ニン"],
      "examples": [
        { "word": "人", "reading": "ひと", "meaning": "person", "source": "jmdict" }
      ],
      "mnemonic": null,
      "notes": null
    }
  ]
}
```

The promoted dictionary should keep the compact runtime entry shape. `generatedAt` should be replaced with curation metadata so the file no longer presents itself as build output.

Recommended top-level metadata:

```json
{
  "schemaVersion": 2,
  "curationVersion": "2026-06-04",
  "maintainer": "Koto",
  "status": "hand-curated",
  "referenceSources": [
    { "id": "kanjidic2", "role": "initial meaning and reading seed" },
    { "id": "jmdict", "role": "example vocabulary evidence" },
    { "id": "jpdb", "role": "frequency ordering and keyword reference" },
    { "id": "wanikani", "role": "keyword reference" }
  ],
  "entries": []
}
```

Runtime code should continue to expose `getKotoKanjiEntries()`, `getKotoKanjiEntry(kanji)`, and source/reference metadata through `src/game/koto-kanji-dictionary.js`.

## Review CSV

The review CSV is the main handoff artifact for the user. It must contain one row for each of the 4000 kanji, in current `frequencyRank` order.

Columns:

```csv
rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus
```

Column meanings:

- `rank`: current `frequencyRank`.
- `kanji`: one kanji character.
- `kind`: current kind label.
- `currentPrimaryKeyword`: current `primaryMeaning`.
- `jpdbPrimaryKeyword`: JPDB kanji keyword when available.
- `wanikaniPrimaryDefinition`: WaniKani primary kanji meaning when available.
- `proposedFinalKeyword`: either `NO CHANGE` or a proposed Koto replacement.
- `proposalSource`: `no_change`, `jpdb`, `wanikani`, or `koto_curated`.
- `proposalNotes`: short rationale or caution.
- `jpdbStatus`: `matched`, `missing`, `rate_limited`, `parse_failed`, or `not_checked`.
- `wanikaniStatus`: `matched`, `missing_from_wanikani`, `no_primary_meaning`, `api_failed`, or `not_checked`.

The user can edit `proposedFinalKeyword` directly. During import, `NO CHANGE`, blank, or exact current value means leave the dictionary entry unchanged.

## Reference Acquisition

### JPDB

The first implementation should verify whether a documented or locally known JPDB kanji keyword endpoint exists. Existing project helpers `parseBatch()` and `lookupVocab()` are vocabulary-focused and should not be assumed to return kanji keywords.

If a batch endpoint exists:

- Query in batches of 250 kanji.
- Wait at least 1 second between API calls.
- Honor `429` with `Retry-After` when present, otherwise wait 60 seconds.
- Cache every response before the next batch.

If no batch endpoint exists:

- Fetch public kanji pages such as `https://jpdb.io/kanji/<encoded-kanji>`.
- Use concurrency 1.
- Wait about 1 second between requests.
- Treat groups of 250 as checkpoint batches.
- Cache positive and negative results so interruption can resume.

JPDB output cache belongs under `output/kanji-keyword-review/` or `tmp/`, not the repo root.

### WaniKani

Use the official WaniKani API instead of scraping public pages when a token is available.

- Read token from `WANIKANI_API_TOKEN`.
- Fetch `GET /v2/subjects?types=kanji&hidden=false`.
- Page through `pages.next_url`.
- Extract `data.characters` and `data.meanings.find(meaning => meaning.primary)?.meaning`.
- Cache raw subject records locally.
- Mark missing rows explicitly because WaniKani covers fewer than 4000 kanji.

The user provided a WaniKani API key in chat. The implementation must not echo, log, commit, or persist it.

## Curation Rules

Subagents propose final keywords in batches of 50-100 rows. Their instructions must prioritize:

1. Dictionary accuracy over mnemonic flavor.
2. Natural English over literal-but-weird wording.
3. The most common kanji sense over obscure historical senses.
4. A single concise keyword when possible.
5. Slash-separated alternatives only when one English word would mislead.
6. `NO CHANGE` when the current value is already accurate and natural.
7. `koto_curated` when both JPDB and WaniKani are awkward but evidence points to a better keyword.

Subagents must not invent game-flavored meanings. They may use JPDB/WaniKani/KANJIDIC2/JMdict evidence, but the final value is a Koto decision.

Examples of bad final values:

- Transitivity flips, such as using a causative gloss for an intransitive meaning.
- Mnemonic phrases that are not natural dictionary glosses.
- Overly clever game terms.
- Rare meanings when the common kanji meaning is clear.

## Import Rules

After the user returns the edited CSV, the importer updates `data/kanji/koto-kanji-dictionary.json` directly.

Validation must reject:

- Unknown kanji.
- Duplicate kanji rows.
- Rows whose `rank` does not match the dictionary's `frequencyRank`.
- Empty proposed final values other than blank-as-no-change.
- Placeholder values such as `TODO`, `?`, `unknown`, or `same`.
- Japanese text or kana in an English keyword field.
- Slash-separated glosses with empty segments.
- Changes to fields outside `primaryMeaning` unless explicitly requested.

The importer must preserve:

- Entry order.
- `frequencyRank`.
- `kind`.
- readings.
- examples.
- mnemonics.
- notes.
- unrelated dictionary fields.

## Retiring The Generator

The implementation should make it impossible to accidentally overwrite the curated dictionary through the old generator.

Required treatment:

1. Move `scripts/build-koto-kanji-dictionary.mjs` to an archival script name, or change it to write only to an explicit output path under `output/`.
2. Remove default behavior that writes to `data/kanji/koto-kanji-dictionary.json`.
3. Update tests so `koto-kanji-dictionary.json` is validated as curated data, not generated output.
4. Update docs/data-sources.md to say the dictionary is Koto-owned and reference sources are audit evidence.
5. Keep `data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv`, KANJIDIC2, and JMdict files only as historical/reference inputs unless future tooling explicitly needs them.

## Subagent Workflow

### Planning / Implementation Subagents

- **Dictionary promotion agent:** update schema metadata, loader validation, tests, and docs so the JSON is treated as curated source.
- **JPDB acquisition agent:** build the cached JPDB keyword fetcher/probe and parser.
- **WaniKani acquisition agent:** build the cached WaniKani kanji subject fetcher.
- **CSV assembly agent:** combine current dictionary, JPDB cache, WaniKani cache, and curation proposals into the review CSV.
- **Curation batch agents:** review 50-100 rows each and fill `proposedFinalKeyword`, `proposalSource`, and `proposalNotes`.
- **Import agent:** after user review, import the edited CSV into the curated dictionary.
- **Validation agent:** run schema, CSV, and kanji dictionary tests; audit that no secret or runtime cache was committed.

### Batch Curation Prompt Contract

Each curation agent receives:

- A bounded CSV slice.
- The curation rules above.
- The instruction to return only structured rows for its assigned kanji.
- The instruction to use `NO CHANGE` when unsure.
- The instruction to flag uncertain rows in `proposalNotes`.

No curation agent should edit files directly during the proposal pass. The coordinator assembles their output.

## Testing

Focused tests should cover:

- Loading schema version 2 curated dictionaries.
- Rejecting generated-only metadata if it conflicts with curated status.
- Preserving 4000 entries, unique kanji, and contiguous ranks.
- Fetcher cache read/write without network.
- JPDB parser fixture for keyword extraction.
- WaniKani API fixture for primary meaning extraction.
- CSV escaping and row ordering.
- Importing `NO CHANGE` without mutation.
- Importing a changed keyword into only `primaryMeaning`.
- Rejecting malformed reviewed CSV rows.

Commands:

```bash
node --check src/game/koto-kanji-dictionary.js
node --test tests/unit/game/koto-kanji-dictionary.test.js
node --test tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
node --test tests/unit/scripts/kanji-keyword-review.test.js
npm test
```

## Non-Goals

- Do not alter `data/dictionary.json`.
- Do not change Kanji Kombat mechanics.
- Do not change kanji ordering.
- Do not add JPDB or WaniKani as runtime dependencies.
- Do not store API tokens.
- Do not auto-apply subagent proposals without user review.

## Open Risks

- JPDB kanji keywords may require public-page fetching if no batch API exists.
- JPDB and WaniKani curated keywords may have licensing or terms limits; the final Koto keyword must be a human/agent judgment informed by evidence, not a blind copy operation.
- WaniKani will not cover all 4000 kanji.
- Some KANJIDIC2 seeded readings and examples may also be awkward, but this project changes primary keywords only.
