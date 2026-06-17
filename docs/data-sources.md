# Data Sources

## Koto Kanji Dictionary

`data/kanji/koto-kanji-dictionary.json` is Koto's hand-curated proprietary kanji dictionary for Kanji Kombat.

- Koto owns the shipped primary keyword choices.
- The dictionary is not generated from a single upstream dictionary.
- JPDB and WaniKani are used only as temporary curation evidence in ignored review CSVs and caches.
- KANJIDIC2, JMdict, and the old JPDB frequency snapshot remain historical/reference inputs.
- API tokens and source-fetch caches must not be committed.

The runtime dictionary intentionally stores only compact gameplay fields: `primaryMeaning`, `secondaryMeanings`, `primaryReading`, `secondaryReadings`, `examples`, `mnemonic`, `notes`, and `radicals.classical`. KANJIDIC2 supplies only the structural `radicals.classical` number; known source variants such as `髙` are resolved through explicit enrichment aliases; Koto's curated dictionary remains the source of truth for player-facing meanings.
