# Dictionary Override

**Date:** 2026-04-21
**Status:** Ready for implementation

## Problem

Some Japanese words need a different English gloss in context than the word dictionary's primary definition.

Example: `切る` may default to `to cut`, but in `電気を切る` the correct gloss is `to turn off`.

The game already has a renderer-level override hook: `renderJpSentence(tokens, knownWords, wordDict, overrides, useKanji)`. The missing pieces are upstream and downstream:

- frame-authored dialogue does not preserve override metadata through the tokenization pipeline
- generated frame data does not validate override metadata
- meaning resolution currently prefers baked `token.meaning` over `overrides`, so an override can be ignored for tokenized dialogue
- legacy content uses multiple field names (`overrides`, `shopOverrides`) for the same concept

This feature should solve those problems without turning into a dictionary rewrite or an SRS behavior change.

## Goal

Add a single, standardized, display-time dictionary override system for any content rendered through `renderJpSentence()`.

The system should let authored dialogue pick a different existing dictionary gloss for a word in a specific line, preserve that choice through the frame pipeline, and render it consistently on the client.

## Out of Scope

- `renderEnFirst()` and tagged English-first bootstrap/prologue rendering
- changing `data/dictionary.json`
- changing the canonical meaning used by FSRS cards or word review
- adding sense IDs or any new structured sense storage
- changing lookup popups to hide alternate meanings
- simulator-specific work

## V1 Decisions

This spec makes the following deliberate simplifications:

1. **Overrides are display-only.** They change the gloss shown by `renderJpSentence()`. They do not change the underlying dictionary entry and do not change the meaning stored in review cards.
2. **Overrides use exact existing gloss strings.** V1 does not add sense IDs. An override value must exactly match one of the target word's existing dictionary glosses.
3. **One field name everywhere:** `overrides`.
4. **Only `renderJpSentence()` paths are in scope.**

## Data Model

Any tokenized line or frame may carry an optional `overrides` object:

```json
{
  "overrides": {
    "切る": "to turn off"
  }
}
```

Rules:

- Keys are **base forms**, not surface forms
- Values are exact `definitions[].en` strings already present in the dictionary for that word
- Missing `overrides` means "use normal meaning resolution"
- Empty override objects are allowed but not required
- Frame-source overrides apply to static words already present in that frame, not slot-inserted entity tokens

## Meaning Resolution

For `renderJpSentence()` and any shared helper that resolves the displayed English gloss, use this precedence:

1. `overrides[baseForm]`
2. `token.meaning`
3. dictionary primary definition
4. dictionary first definition
5. `''`

This order is the key behavioral fix for the feature.

Today, many tokenized lines already carry `token.meaning`. That is fine to keep in V1, but authored overrides must win over that baked default meaning or they will not take effect.

## Architecture

### 1. Authoring

`data/dialogue/frame-sources.json` may include an optional `overrides` field on any frame source:

```json
{
  "id": "shop_turn_off_lights",
  "category": "shopGreeting",
  "raw": "電気を切る",
  "slots": [],
  "overrides": {
    "切る": "to turn off"
  }
}
```

No other authoring format is introduced in V1.

### 2. Tokenization Pipeline

`scripts/tokenize-static.js` must preserve `source.overrides` into generated frame output unchanged.

The tokenizer still produces the normal token array and `words` array. V1 does **not** bake override values into tokens. The override remains separate metadata on the frame.

Generated `data/dialogue/frames.json` entries therefore become:

```json
{
  "id": "shop_turn_off_lights",
  "category": "shopGreeting",
  "raw": "電気を切る",
  "tokens": [
    { "surface": "電気", "base": "電気", "reading": "でんき", "meaning": "electricity", "pos": "Noun" },
    { "surface": "を" },
    { "surface": "切る", "base": "切る", "reading": "きる", "meaning": "to cut", "pos": "Verb" }
  ],
  "words": ["電気", "切る"],
  "overrides": {
    "切る": "to turn off"
  }
}
```

### 3. Dialogue Loading

`src/game/dialogue-loader.js` continues loading frames as plain JSON objects. No special transform layer is needed. The important requirement is that frame objects keep their `overrides` field intact.

### 4. Frame Assembly

`assembleFrame(frame, entities)` in `src/game/token-format.js` should return:

- `tokens`
- `words`
- `overrides`

The returned `overrides` should default to a shallow copy of `frame.overrides || {}`.

Slot-inserted entity tokens do **not** require a new override mechanism in V1. They already carry entity-specific `token.meaning` via `entityToToken()`, which remains the correct fallback when no authored override is present.

### 5. Route / Response Shape

Any server response that sends tokenized lines to the client for `renderJpSentence()` should use the same shape:

```json
{
  "tokens": [...],
  "words": [...],
  "overrides": {}
}
```

This applies to:

- frame-backed narration/dialogue lines
- shop greeting / purchase-line content
- any other route-level token payload that currently uses `renderJpSentence()`

V1 standardizes on `overrides` and does not introduce any new override field names.

## Legacy Field Cleanup

`shopOverrides` is renamed to `overrides`.

The migration rule is:

- newly generated server data writes only `overrides`
- client read paths may temporarily accept `item.overrides || item.shopOverrides || {}` for compatibility with in-progress saved runs

No save-file migration is required.

## Validation

`scripts/validate-dialogue.js` must validate override metadata in generated frames.

For each frame with `overrides`:

1. every override key must exist in `frame.words`
2. the dictionary must contain that word
3. the override value must exactly match one of `dict.get(word).definitions[].en`
4. empty-string override values are invalid

Validation failure is a hard error. This is language-learning content; silent fallback is not acceptable.

## Runtime Behavior

At render time:

- unknown words still render as Japanese plus English gloss
- the gloss comes from `overrides` first, then normal fallback resolution
- lookup popups still show the full dictionary entry, not just the overridden gloss
- known words remain visually unchanged except for the `data-meaning` attribute used by word lookup / related UI

Because the same helper is used for rendering and exposure metadata, the override should also be reflected in any display-time `meaning` derived from that helper.

## Word Knowledge / FSRS

`src/game/bootstrap/word-knowledge.js` is intentionally unchanged in V1.

Review card creation continues to use the canonical dictionary meaning. This feature does **not** redefine what the player is considered to have learned. It only improves the contextual gloss shown at render time.

If we later decide that contextual overrides should affect review cards, that should be a separate design with its own explicit trade-offs.

## File-Level Changes

### Required

- `docs/superpowers/specs/2026-04-21-dictionary-override-design.md`
  - rewritten spec
- `data/dialogue/frame-sources.json`
  - allow optional `overrides`
- `scripts/tokenize-static.js`
  - preserve `overrides` into generated frames
- `scripts/validate-dialogue.js`
  - validate override keys and values
- `src/game/token-format.js`
  - return `overrides` from `assembleFrame()`
- `public/js/shared/exposure-extractor.js`
  - change meaning precedence so `overrides` win
- `public/js/ui/bootstrap-client.js`
  - no signature change; continue passing `overrides`
- `src/game/dialogue-loader.js`
  - keep `overrides` intact when loading frames

### Compatibility / Cleanup

- `src/routes/game/run.js`
  - standardize shop-related payloads on `overrides`
- `public/js/ui/exploration.js`
  - use `item.overrides` and keep one temporary legacy fallback for `item.shopOverrides`
- any other route/UI pair currently using `shopOverrides`
  - rename to `overrides`

## Testing

### Unit

- `tests/unit/sentence-renderer.test.js`
  - override wins over dictionary primary definition
  - override wins over baked `token.meaning`
  - no override still uses current fallback behavior
- `tests/unit/tokenize-static.test.js`
  - frame-source overrides are preserved into generated frames
- `tests/unit/word-dictionary.test.js` or a new dialogue-validation test
  - validator rejects unknown override target words
  - validator rejects override values not present in dictionary definitions

### Integration

- frame-backed dialogue line with `overrides` renders the overridden gloss on screen
- standardized `overrides` field works for current shop/narration flows
- legacy `shopOverrides` fallback continues to read old in-progress room state during migration

## Acceptance Criteria

This feature is done when all of the following are true:

1. A frame source can declare `overrides`
2. `tokenize-static.js` preserves that metadata into `frames.json`
3. `validate-dialogue.js` rejects invalid overrides
4. `assembleFrame()` returns `overrides`
5. `renderJpSentence()` displays the override gloss because meaning resolution uses `override -> token.meaning -> dictionary`
6. Shop/dialogue payloads use `overrides` as the canonical field name
7. `word-knowledge.js` and review-card meaning behavior are unchanged

## Explicit Non-Decisions

These ideas are intentionally deferred:

- sense IDs
- editing or enriching dictionary entries as part of override authoring
- changing `renderEnFirst()`
- making overrides affect FSRS card meaning
- adding a general authoring UI for override selection
