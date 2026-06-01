# Data Sources

## Koto Kanji Dictionary

`data/kanji/koto-kanji-dictionary.json` is Koto's maintained kanji dictionary for Kanji Kombat.

- Ordering input: a dated static top-4000 snapshot from JPDB Kanji by Frequency. JPDB is not listed in dictionary source metadata because it is only an ordering input.
- Dictionary enrichment: KANJIDIC2 and JMdict-derived data under EDRDG license terms.
- Mnemonics: Koto-authored only.
- WaniKani: not used for the shipping Kanji Kombat dictionary.

The generated dictionary intentionally stores only the fields Kanji Kombat needs now: `primaryMeaning`, `secondaryMeanings`, `primaryReading`, `secondaryReadings`, `examples`, `mnemonic`, and `notes`.
