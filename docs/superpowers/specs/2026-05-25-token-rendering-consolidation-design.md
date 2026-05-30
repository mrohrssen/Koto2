# Token Rendering Consolidation Design

## Problem

Japanese dialogue tokens are interpreted in more than one client renderer. `renderJpSentence()` understands grammar annotations and renders tokens with `grammarHints` as clickable, romaji-bearing grammar spans. `renderDialogueTokenRows()` in the NPC dialogue card uses a separate grid renderer and currently treats non-content tokens as punctuation, so annotated grammar such as particles, copulas, endings, and larger matched patterns lose romaji and click behavior there.

This is not just a bug for `です`. The grammar tracking system can annotate any matched grammar point from `data/grammar-matchers.json`. Every token carrying `grammarHints` must be rendered consistently, regardless of which grammar point produced it.

## Goals

- Make token semantics single-source on the client: word, grammar, punctuation, entity, reading, display text, clickability, lookup data, and punctuation attachment.
- Preserve different visual layouts where they are justified:
  - inline ruby narration for narration boxes and compact labels;
  - row/grid dialogue for NPC dialogue cards and translation source displays.
- Ensure every token with `grammarHints` is grammar-interactive in all Japanese dialogue displays, including current and future matcher output.
- Keep exposure tracking tied only to content vocabulary words, not grammar-only tokens.
- Add tests that fail if a renderer silently drops grammar annotations again.

## Non-Goals

- Do not redesign the visual appearance of dialogue cards.
- Do not change grammar matching, `frames.json` generation, or `data/grammar-matchers.json` semantics.
- Do not add grammar tokens to vocabulary exposure or SRS review.
- Do not merge every renderer into one large HTML-producing function.
- Do not migrate `renderEnFirst()`. It renders `{english|kanji|reading}` tagged text, not universal token arrays.
- Do not silently make secondary translation-source rows clickable in this refactor. They can consume shared token cells for consistent pronunciation, but lookup interactivity there should be a deliberate UX change with its own test.

## Recommended Architecture

Create a shared client module, tentatively `public/js/ui/japanese-token-cells.js`, that converts raw universal tokens into render-ready cells. Renderers may choose different HTML layouts, but they must consume this shared model rather than reimplement token classification.

The cell builder should be pure. It must not record exposures, play audio, mutate known words, attach event handlers, or touch the DOM. Exposure recording stays in renderers/call sites, where policy already exists through `renderJpSentence(..., { recordExposure })`. This avoids double-recording preview/translation displays and avoids losing exposures from primary narration renders.

The factory should accept the inputs needed to resolve the current display contract:

- `tokens`
- `knownWords`
- `wordDict`
- `overrides`
- `useKanji`
- optional layout policy flags, such as `mergeSmallTsuContinuation`

Each cell should expose:

- `kind`: `word`, `grammar`, or `punctuation`.
- `surface`: the original Japanese surface text.
- `reading`: hiragana/kana reading after catalog `readingOverride` is applied.
- `display`: what should appear in the Japanese row or inline body for the current kanji mode.
- `romaji`: `toRomaji(reading)` for word and grammar cells.
- `base`, `meaning`, `meanings`, `pos`, and `isKnown` for vocabulary cells.
- `grammarHints` for grammar-bearing cells.
- `clickable`: true for vocabulary cells and grammar cells, false for punctuation.
- `attrs`: escaped shared `data-*` attributes needed by `dialogue-word-lookup.js`.
- attached `trailingPunct` and continuation text such as `待っ` + `て`.

The central rule is:

> Any token with a non-empty `grammarHints` array is grammar-displayable and grammar-clickable, even when it has no vocabulary `base`.

Catalog-level details such as `は` reading as `わ` or `へ` reading as `え` stay in grammar metadata through `readingOverride`; renderers should not hardcode specific particles or endings.

## Classification Matrix

The shared builder should classify every token with this matrix:

| Token state | Cell kind | Lookup class | Exposure behavior |
| --- | --- | --- | --- |
| Content token + `grammarHints` | `word` with `grammarHints` | `.jp-word` | Content word exposure remains eligible |
| Content token + no `grammarHints` | `word` | `.jp-word` | Content word exposure remains eligible |
| Non-content token + `grammarHints` | `grammar` | `.jp-grammar` | No vocabulary exposure |
| Non-content token + no `grammarHints` | `punctuation` | `.jp-punct` | No vocabulary exposure |

This matrix is the unit-test target. It prevents future renderers from treating annotated non-content grammar as punctuation.

## Renderer Responsibilities

`bootstrap-client.js` should keep `renderJpSentence()` as the inline renderer, but delegate token interpretation to the shared view model. It should map cells to inline spans/ruby:

- `word` -> `.jp-word`
- `grammar` -> `.jp-grammar`
- `punctuation` -> `.jp-punct`

`npc-dialogue-card.js` should keep its grid layout, pagination, Translate, and Learn behavior, but consume the same cells. It should render grammar cells with romaji row text and a `.jp-grammar` Japanese-row cell carrying the same shared lookup data attributes as inline narration.

`renderTranslationSourceRows()` should also use the shared cells, with meanings hidden and grammar pronunciation retained. It should remain a read-only mirror in this refactor: no lookup handlers should be attached there unless we intentionally add translation-sheet lookup as a separate UX change.

`dialogue-word-lookup.js` can remain mostly unchanged because it already attaches handlers to both `.jp-word` and `.jp-grammar`. The main requirement is that all renderers emit those classes and data attributes consistently.

Renderer-specific attributes stay renderer-specific. In particular, `data-audio-text` is owned by the NPC dialogue card because it is tied to clicked-word audio and small-tsu continuation playback. The shared cell can expose `audioText` as data, but the inline renderer should not emit `data-audio-text` unless it intentionally supports word-audio playback.

## Data Flow

1. Server/static pipeline produces universal tokens, including `grammarHints` from grammar matchers.
2. Client receives tokens unchanged.
3. Shared view-model builder classifies and normalizes tokens once.
4. Layout renderers map cells to their own HTML structure.
5. `dialogue-word-lookup.js` binds click handlers to emitted `.jp-word` and `.jp-grammar` spans.

## Edge Cases

- Multi-token grammar matches may annotate both content and non-content tokens. Content tokens remain vocabulary cells with attached grammar hints; non-content annotated tokens become grammar cells.
- Grammar cells can have attached punctuation, such as `です！` or `ね。`, without losing romaji or click behavior.
- Small-tsu continuations like `待っ` + `て` should continue to render as one vocabulary cell in the NPC dialogue card, where that behavior already exists for row layout and clicked-word audio. Inline narration should preserve its current behavior unless we explicitly choose to change it; the shared builder should support this through a layout policy flag rather than imposing one global behavior.
- Pure punctuation without grammar hints remains non-clickable punctuation.
- Kanji mode changes display text but not the reading/romaji/lookup contract.
- Dialogue card line-width estimation should use shared cell classification (`cell.kind`) rather than re-checking `isContentExposureToken(token)`, so grammar cells contribute pronunciation/display width correctly without being measured as bare punctuation.

## Testing Plan

- Unit-test the shared view model with generated-style tokens:
  - `友達` + annotated `です` + `！`
  - annotated `は` with `readingOverride: "わ"`
  - annotated `ね` with trailing punctuation
  - a multi-token grammar match such as `がある`
  - pure punctuation with no grammar hints
- Update `renderJpSentence()` tests to assert grammar cells still emit `.jp-grammar`, romaji, and `data-grammar-hints`.
- Update `renderDialogueTokenRows()` tests to assert grammar cells render romaji and are not emitted as `.jp-punct`.
- Add a cross-renderer parity test that feeds the same annotated tokens to `renderJpSentence()` and `renderDialogueTokenRows()` and asserts both emit `.jp-grammar`, the same `data-reading`, and the same `data-grammar-hints` JSON.
- Add a regression test that every token with `grammarHints` in a grid renderer has either `.jp-word` or `.jp-grammar` plus lookup data.
- Add tests confirming translation-source rows keep grammar pronunciation but do not attach lookup data/clickability unless that UX change is explicitly requested.
- Run `node --check` on edited JS files and the relevant unit tests.

## Risks

- Exposure regressions if recording moves into the shared cell builder or is accidentally removed from `renderJpSentence()`.
- Dialogue card layout regressions if the weight estimator keeps using raw-token checks instead of shared cell kinds.
- Hidden UX changes if translation-source rows become clickable without an explicit product decision.
- Inline narration output changes if small-tsu continuation merging is applied globally instead of remaining an NPC dialogue-card policy.
- Audio behavior changes if `data-audio-text` leaks into inline narration without corresponding playback design.

## Rollout

Implement in a narrow sequence:

1. Add the shared view-model module and tests.
2. Migrate `renderJpSentence()` to use the shared model while preserving current snapshots/expectations.
3. Migrate `npc-dialogue-card.js` grid renderers and weight estimation to use the same model.
4. Migrate `renderTranslationSourceRows()` only for shared pronunciation/classification, while preserving read-only behavior.
5. Verify the grammar-token regression in NPC dialogue with unit tests and, if UI behavior changes visually, a screenshot playtest.

This keeps the fix focused: one source of truth for token semantics, multiple renderers only for genuinely different layouts.
