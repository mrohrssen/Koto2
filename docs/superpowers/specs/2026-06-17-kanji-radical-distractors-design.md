# Kanji Radical Distractors Design

## Purpose

Kanji Kombat quiz choices should become more visually meaningful. Instead of choosing kanji wrong answers randomly from the full active script deck, kanji quizzes should prefer wrong answers whose kanji share the prompt kanji's KANJIDIC2 classical radical. This makes answer sets harder in the useful way: the player must distinguish similar-looking or structurally related kanji while still choosing from meanings that are mostly already in their review history.

This work must preserve Koto's hand-curated kanji definitions. `data/kanji/koto-kanji-dictionary.json` is the source of truth for player-facing meanings, readings, examples, mnemonics, and notes. KANJIDIC2 is used only to add structural radical metadata.

## Current Findings

`data/kanji/koto-kanji-dictionary.json` is schema v2, maintained by Koto, marked `hand-curated`, and contains 4000 entries. It does not currently store structured radical metadata.

`data/kanji/sources/kanjidic2.xml` contains radical metadata. Local verification found 13,108 KANJIDIC2 character entries, each with exactly one `<rad_value rad_type="classical">`. Some entries also have a `nelson_c` radical classification, but that is not needed for this feature.

Kanji Kombat currently converts curated kanji entries into script cards in `src/game/script-decks.js`. `buildQuizForCard()` in `src/game/services/kanji-kombat-service.js` chooses three wrong answers by shuffling the active answer pool, excluding the correct card and duplicate answer labels, and taking the first three.

The script deck is seeded into each user's SRS data. `ensureScriptDeckSeeded()` already refreshes static card metadata while preserving FSRS progress fields. This allows new non-FSRS metadata to propagate to existing users without losing review history.

## Data Model

Add a singular classical radical metadata field to each curated kanji dictionary entry:

```json
{
  "kanji": "海",
  "primaryMeaning": "sea",
  "radicals": {
    "classical": 85
  }
}
```

The field is named `radicals` rather than `radical` so the schema can later hold other explicitly named radical systems or component metadata, but this feature stores only one number:

- `radicals.classical`: required positive integer from 1 to 214 for every kanji entry.

Do not store `nelson_c` in the runtime dictionary for this feature. Do not store KANJIDIC2 source metadata in the dictionary top level. KANJIDIC2 remains a reference input, not the meaning source of truth.

`KANJI_SCRIPT_CARDS` should copy `radicals` from the curated dictionary into each kanji script card. Hiragana and katakana cards should remain unchanged.

## Radical Enrichment

Create a dedicated enrichment script for radical metadata. It should not reuse or revive the archived legacy dictionary builder.

The script should:

1. Read `data/kanji/koto-kanji-dictionary.json`.
2. Read `data/kanji/sources/kanjidic2.xml`.
3. Parse each KANJIDIC2 entry's literal and single classical radical number.
4. Produce dictionary entries with all existing fields preserved and only `radicals.classical` added or refreshed.
5. Fail if any Koto dictionary kanji is missing from KANJIDIC2 or lacks exactly one classical radical.
6. Write only when an explicit `--write` flag is supplied.

The script must not modify:

- `primaryMeaning`
- `secondaryMeanings`
- `primaryReading`
- `secondaryReadings`
- `examples`
- `mnemonic`
- `notes`
- `frequencyRank`
- `kind`
- entry ordering

Tests should compare representative entries before and after enrichment and assert those curated fields remain unchanged.

## Quiz Algorithm

Kanji quizzes should use a three-tier wrong-answer pool. The selected wrong answers must still have distinct answer labels and must not include the correct card.

For a kanji prompt card:

1. **Introduced same-radical kanji first.**
   Use cards from the user's active kanji deck where `reps > 0` and `radicals.classical` matches the prompt card.
2. **Introduced other kanji second.**
   If fewer than three valid wrong answers were selected, fill from other active kanji cards where `reps > 0`.
3. **Unintroduced kanji last.**
   If there are still fewer than three wrong answers, fill from active kanji cards where `reps === 0`.

Each tier should be shuffled before selection so common radicals can draw from hundreds of possible same-radical cards instead of always picking the earliest entries. The final four choices should then be shuffled as they are today.

For hiragana and katakana prompt cards, keep the current random distractor behavior.

If the active pool still cannot provide three valid wrong answers after all tiers, keep the existing failure behavior and throw a clear "not enough distinct answers" error. This should be practically unreachable for the 4000-card kanji deck.

## Data Flow

1. Dictionary enrichment adds `radicals.classical` to curated dictionary entries.
2. `src/game/koto-kanji-dictionary.js` validates the new metadata.
3. `src/game/script-decks.js` copies radical metadata onto kanji script cards.
4. `ensureScriptDeckSeeded()` refreshes users' persisted script cards while preserving FSRS fields.
5. Kanji Kombat passes the user's active script cards into `buildQuizForCard()`.
6. `buildQuizForCard()` detects kanji cards and applies the radical-aware tiered distractor selection.

## Error Handling

Dictionary validation should fail fast if any kanji entry is missing `radicals.classical`, if the value is not an integer, or if it is outside 1-214.

The enrichment script should run as a dry run by default and summarize the number of entries that would receive or change radical metadata. With `--write`, it should update the JSON atomically.

Quiz generation should tolerate older persisted user cards by relying on `ensureScriptDeckSeeded()` to refresh metadata before use. If a prompt card somehow lacks radical metadata, the kanji quiz builder may skip tier 1 and fall back to introduced other kanji, but dictionary validation should make that state impossible in normal runtime.

## Testing

Unit tests should cover:

- Koto dictionary validation accepts `radicals.classical` and rejects missing or invalid values.
- KANJIDIC2 radical parsing returns exactly one classical radical per tested sample entry.
- The radical enrichment helper preserves curated meaning, reading, example, mnemonic, notes, frequency, kind, and order fields.
- `KANJI_SCRIPT_CARDS` include radical metadata for kanji cards.
- Existing persisted script cards gain radical metadata while preserving FSRS progress.
- Kanji quiz distractors prefer introduced same-radical cards when enough exist.
- Kanji quiz distractors fall back to introduced other kanji when same-radical introduced cards are insufficient.
- Kanji quiz distractors fall back to unintroduced kanji only when introduced cards cannot fill three wrong answers.
- Hiragana and katakana quiz behavior remains unchanged.

Run focused verification first:

```bash
node --check src/game/koto-kanji-dictionary.js
node --check src/game/script-decks.js
node --check src/game/services/kanji-kombat-service.js
node --test tests/unit/game/koto-kanji-dictionary.test.js tests/unit/game/script-decks.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-deck.test.js
```

Then run the broader test gate before merge:

```bash
npm test
```

## Out Of Scope

This design does not add full visual component decomposition. It uses only KANJIDIC2's classical radical number. It does not change kanji introduction order, FSRS scheduling, daily limits, combat damage, streak rewards, or the player-facing wording of quiz choices.

This design also does not display radical names or explanations in the UI. The radical metadata is used only to choose better distractors.
