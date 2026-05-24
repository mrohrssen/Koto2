# Grammar Tracking System Design

## Goal

Build a deterministic grammar tracking system for Japanese text rendered in Koto. The system should use Sudachi tokenization and Koto-owned grammar data to detect grammar points in any Japanese sentence, annotate matched text, and show short player-facing grammar hints in the existing word lookup flow.

The first rollout covers all N5 grammar points from the Bunpro grammar catalog. The data model, matcher engine, tests, and authoring workflow must be repeatable for N4 through N1 without changing the architecture.

## Non-Goals

- Do not use AI, LLMs, or remote services for runtime grammar detection or identification.
- Do not hardcode grammar annotations into `data/dialogue/frame-sources.json`.
- Do not make particles, auxiliaries, or grammar-only forms count as vocabulary exposure unless they are also intentionally modeled as vocab elsewhere.
- Do not preserve Bunpro-specific player-facing labels such as numbered senses (`①`, `②`) in Koto titles.
- Do not copy Bunpro explanation text. Koto explanations are original, short, and written for the game UI.
- Do not keep grammar hints in the live word dictionary. Grammar content belongs in the new grammar catalog, not `data/grammar-words.json`.

AI may be used during development to help draft the one-time Koto-owned explanations, but the shipped data is static and never regenerated at runtime.

## Current Context

The current tokenizer wrapper in `src/tokenizer.js` shells out to `scripts/sudachi-tokenize.py`, which returns only `surface`, `baseForm`, top-level `pos`, and `reading`. It uses Sudachi Mode A, and grammar matchers should be authored and tested against Mode A output. Static frame tokenization in `scripts/tokenize-static.js` then demotes particles, auxiliaries, suffixes, prefixes, punctuation, and common auxiliary verbs to surface-only tokens so they do not count as vocabulary.

That behavior is correct for i+1 vocabulary exposure, but grammar detection needs the richer raw Sudachi stream before demotion. Sudachi exposes enough detail for this: full POS tuple, conjugation type, conjugation form, dictionary form, normalized form, readings, and token order. The grammar system should keep vocabulary exposure and grammar annotation as separate layers over the same source tokens.

There is also an existing `data/grammar-words.json` file loaded by `src/game/word-dictionary.js` as a curriculum overlay. It contains particles and grammar-like entries such as `は`, `が`, `を`, `です`, and `ます` as if they were vocabulary definitions. This conflicts with the new grammar direction. The grammar system should deprecate this file for grammar content and migrate particle/auxiliary hints into `data/grammar-catalog.json`. Any true vocabulary entries that happen to live in `grammar-words.json` today, such as greetings, should move to a non-grammar curriculum file before `grammar-words.json` is removed from the word dictionary overlay list.

## Architecture

The pipeline should become:

```text
Japanese text
  -> Sudachi rich tokens
  -> deterministic grammar annotation on the unmerged Mode A stream
  -> dictionary merge / vocabulary token normalization
  -> project grammar annotations onto render tokens
  -> enriched render tokens
  -> renderJpSentence()
  -> word/grammar popup
```

Grammar matching runs against the unmerged Sudachi Mode A stream. Dictionary merging remains a vocabulary/rendering concern, and grammar hits are projected onto the merged render tokens by token span. This avoids losing patterns such as verb stem + `て` + `いる` when a dictionary merge collapses a phrase for vocabulary display.

Grammar annotation attaches grammar metadata to tokens but does not change the `words` list used for i+1 eligibility.

### Core Modules

- `src/tokenizer.js` and `scripts/sudachi-tokenize.py`: extend token output with rich Sudachi metadata.
- `src/game/grammar/grammar-loader.js`: loads grammar catalog and matcher definitions.
- `src/game/grammar/grammar-matcher.js`: applies deterministic matchers to rich token streams.
- `src/game/grammar/annotate-tokens.js`: maps grammar matches onto renderable tokens.
- `src/game/grammar/tokenize-and-annotate.js`: single shared helper for token-producing code paths so annotation is the default.
- `data/grammar-catalog.json`: Koto grammar point metadata, starting with N5.
- `data/grammar-matchers.json`: deterministic matcher definitions for implemented points.
- `public/js/ui/bootstrap-client.js`: renders grammar-aware clickable spans.
- `public/js/ui/dialogue-word-lookup.js`: displays `Grammar Hint` sections.

The rich token fields are additive. Existing fields keep their current meaning for compatibility:

```json
{
  "surface": "読ん",
  "baseForm": "読む",
  "pos": "動詞",
  "reading": "よん",
  "normalizedForm": "読む",
  "pos0": "動詞",
  "pos1": "一般",
  "pos2": "*",
  "pos3": "*",
  "pos4": "五段-マ行",
  "pos5": "連用形-撥音便",
  "conjugationType": "五段-マ行",
  "conjugationForm": "連用形-撥音便",
  "index": 0
}
```

Matcher authors should use full-string equality for `conjugationType` and either full-string equality or an explicit `conjugationFormPrefix` field for forms such as `連用形-*`. Prefix matching is allowed only through the named `conjugationFormPrefix` matcher property so matcher data stays consistent.

## Data Model

Each grammar point is a stable Koto-owned entry. Bunpro provides ordering and an initial source reference only.

```json
{
  "id": "n5-te-iru-progressive",
  "level": "N5",
  "lesson": 5,
  "lessonIndex": 10,
  "title": "～ている",
  "sense": "progressive",
  "meaning": "is/am/are doing",
  "shortExplanation": "Shows an action happening right now.",
  "displayPattern": "Verbて + いる",
  "readingOverride": "",
  "tempSourceDeleteTagLater": "https://bunpro.jp/grammar_points/%E3%81%A6%E3%81%84%E3%82%8B1"
}
```

`tempSourceDeleteTagLater` is intentionally ugly and searchable. It is temporary internal provenance for the initial catalog build and must never appear in player-facing UI. Once Koto's grammar system is stable, a cleanup pass should remove or replace this field.

Duplicate-looking grammar forms should be distinguished by Koto IDs and `sense`, not by Bunpro numbering. For example, a later result-state use of `ている` should become something like `n4-te-iru-result-state`, while the player-facing title can remain `～ている`.

## Matcher Model

The matcher engine is generic. Grammar points are detected by structured matcher data, not by one-off hardcoded conditionals per sentence.

Matchers should support:

- Exact token surface/base matches.
- Token sequence matches.
- POS tuple constraints.
- Conjugation type and form constraints.
- Optional tokens and alternatives.
- Negative constraints to avoid false positives.
- Match span selection for display.
- Attachment rules for whether the hint belongs to one token, a phrase, or a particle.

Example matcher shape:

```json
{
  "grammarId": "n5-te-iru-progressive",
  "type": "token-sequence",
  "tokens": [
    { "pos0": "動詞", "conjugationFormPrefix": "連用形" },
    { "surface": "て", "pos0": "助詞", "pos1": "接続助詞" },
    { "baseForm": "いる", "pos0": "動詞" }
  ],
  "display": {
    "attachTo": "span",
    "startTokenOffset": 0,
    "endTokenOffset": 2
  }
}
```

Field names may be refined during implementation, but the matcher format must preserve these capabilities and remain declarative data consumed by one deterministic engine.

Overlapping matches are resolved deterministically:

1. Higher explicit matcher `priority` wins.
2. Longer token span wins.
3. More specific matcher type wins over generic particle fallback.
4. Stable `grammarId` sort order breaks remaining ties.

Multiple non-conflicting grammar hints can remain on the same token. Nested generic hints should be suppressed when a more specific phrase-level match covers the same tokens.

## N5 Matcher Coverage

N5 should be implemented end-to-end first, using the same workflow that later levels will follow.

Coverage includes:

- Particles: `は`, `も`, `の`, `か`, `が`, `よ`, `ね`, `を`, `で`, `に`, `と`, `へ`, and common alternate uses such as `か` as "or" versus question marker.
- Basic copula/polite forms: `だ`, `です`, `ます`, `でしょう`, `だろう`.
- Demonstratives and location words where Bunpro treats them as grammar/curriculum items: `これ`, `それ`, `あれ`, `ここ`, `そこ`, `あそこ`, `この`, `その`, `あの`.
- Verb classes and conjugations: dictionary form, non-past, past, negative, negative-past, `て` conjunction, polite endings.
- Common joined patterns: `がある`, `がいる`, `のは`, `のが`, `へ行く`, `に行く`, `のが好き`.
- Adjective patterns: i-adjective, na-adjective, noun modification, predicate forms, negative and past forms.
- Explanatory/question forms such as `んです`, `のです`, and explanatory `の`.

Some grammar points are concept categories rather than simple surface patterns. Those still receive catalog entries and deterministic matchers, but they may need matcher subtypes based on POS/conjugation metadata rather than exact text.

Ambiguous particles should not get an unconditional "any `に`" or "any `で`" fallback. A generic particle hint may ship only when its matcher has explicit POS, neighbor, or sentence-position constraints that identify the intended N5 sense well enough. Otherwise the grammar point remains cataloged but undetected until a reliable matcher is available. Missing a hint is better than teaching the wrong one.

Phase 2 should treat N5 as roughly 80 to 100 catalog entries. Not all of those will necessarily be safely detectable on the first pass. Completion means every N5 entry is cataloged and every enabled matcher is tested; entries without reliable matchers must be explicitly marked as cataloged-but-not-detectable with a reason.

## UI Behavior

For vocabulary words, the current lookup popup remains the primary surface. If the clicked word or phrase has grammar annotations, the popup adds a `Grammar Hint` section below the definition list.

For grammar-only particles, the renderer should make annotated particles clickable and show romaji above them. Clicking a particle opens the same popup shell, but it focuses on grammar:

- Show the particle or matched phrase as the headword.
- Show the grammar title and short explanation.
- Hide or disable vocab SRS actions when there is no vocabulary base form.
- Do not create exposure records for grammar-only tokens.

Clickable grammar-only tokens must preserve Sudachi's reading when it is correct and allow grammar catalog entries to override it when pronunciation is grammar-specific. This matters for particles such as topic `は` (`わ`) and directional `へ` (`え`), where Sudachi's reading is not enough for player-facing romaji.

If a sentence has no matched grammar points, rendering stays unchanged.

If a token has both vocabulary and grammar, the popup should show both:

1. vocabulary definition, as today;
2. `Grammar Hint`, with one or more matched grammar points.

Annotation output should include the matched surface text so phrase-level hints have a clear headword even when the clicked token is only part of the phrase:

```json
{
  "grammarId": "n5-te-iru-progressive",
  "matchedText": "読んでいる",
  "tokenStart": 0,
  "tokenEnd": 2
}
```

Clicking any token inside `読んでいる` can then show `Grammar: ～ている` with `読んでいる` as the matched phrase.

## Runtime Surfaces

The grammar annotation layer should run anywhere Koto tokenizes Japanese:

- Static frames generated from `data/dialogue/frame-sources.json`.
- `/api/game/known-words/parse-text`.
- Admin frame audit previews.
- Future AI-generated dialogue before it is rendered.
- Any server-side route that returns `tokens` for `renderJpSentence()`.

This is what keeps the system future-proof: unknown future sentences are parsed and annotated by the same deterministic tokenizer/matcher pipeline.

Static frames should bake grammar annotations into `data/dialogue/frames.json` at build time via `scripts/tokenize-static.js`. They should not run Sudachi at render time. Future AI-generated dialogue should tokenize and annotate once when the text is produced, then cache or persist the annotated token output for rendering.

## Phased Implementation

### Phase 1: Token and Annotation Infrastructure

Extend Sudachi output with full token metadata while preserving existing render token behavior. Add a grammar matcher engine and a tiny fixture catalog with a few representative N5 points: one particle, one token sequence, one conjugation, and one mixed auxiliary pattern.

Success criteria:

- Existing i+1 token tests still pass.
- Grammar annotations can be attached without changing `words`.
- Annotation output returns stable grammar IDs, matched text, and spans for the representative fixtures.
- Deprecated `grammar-words.json` behavior is documented in tests or migration notes so grammar hints no longer depend on word dictionary entries.

### Phase 2: Full N5 Catalog and Matchers

Build the full N5 catalog in Bunpro lesson order. Write Koto-owned explanations once and store them in `data/grammar-catalog.json`. Add deterministic matchers for every N5 point.

Success criteria:

- Every N5 catalog entry has an explanation, display pattern, and source tag.
- Every implemented N5 matcher has positive, negative, and ambiguous fixture tests.
- Ambiguous particles do not match the wrong sense in common sentences.

### Phase 3: Production Wiring

Wire annotation into the static frame tokenizer, parse-text endpoint, admin frame audit, and all token-producing game routes. Update the lookup popup and renderer to display grammar hints.

Success criteria:

- Existing word lookup behavior is preserved.
- Grammar hints appear for matched N5 points in static dialogue.
- Grammar-only particles are clickable with romaji but do not affect vocab SRS.
- Particle-only grammar hints render and click without creating vocab exposure.
- Future non-frame text can be tokenized and annotated through the same API.

### Phase 4: Level Expansion

Repeat the same process for N4, then N3, N2, and N1.

For each level:

1. Add catalog entries in lesson order.
2. Write Koto-owned short explanations.
3. Add matcher definitions.
4. Add real Sudachi fixture tests.
5. Enable the level only when the tests pass.

## Testing Strategy

Testing must use real Sudachi tokenization for grammar behavior. Hand-built token tests are useful for matcher unit edges, but they are not enough.

Each grammar point should have:

- Positive fixture sentences.
- Negative fixture sentences.
- Ambiguous fixture sentences where the grammar point must not match.
- Snapshot-style checks for matched span and grammar ID.
- Renderer tests for clickable words, phrases, and particles.
- Popup tests for `Grammar Hint` content.
- Exposure tests proving grammar annotations do not count as unknown vocab.

The matcher test harness should accept Japanese fixture text, tokenize it with the real Sudachi helper, run annotation, and assert grammar IDs and spans. This prevents the tests from merely hardcoding the parser result we wish Sudachi produced.

Fixture tests should batch sentences through `tokenizeBatch` and cache tokenized results by sentence text within the test process. N5 coverage will require hundreds of fixture sentences, and the test gate should stay fast enough to run routinely.

## Risks and Mitigations

Particle ambiguity is the largest risk. Mitigate it with sense-specific matchers and negative examples, and prefer no hint over a misleading hint.

Conjugation coverage can become brittle if matchers depend only on surface text. Mitigate it by preserving Sudachi conjugation type/form and testing against real inflected sentences.

Some Bunpro points are broad concepts rather than local text patterns. Mitigate this by cataloging them normally but enabling only deterministic matchers whose constraints are reliable. The N5 rollout should document any grammar point that is cataloged but intentionally not yet detectable.

The temporary Bunpro source tag may linger. Mitigate it with the deliberately searchable `tempSourceDeleteTagLater` field and a future cleanup task.

## Resolved Implementation Choices

- Keep `data/grammar-catalog.json` and `data/grammar-matchers.json` separate. Catalog data is player-facing curriculum content; matcher data is implementation logic. Separating them makes explanation review and matcher testing easier.
- Attach phrase-level grammar hints to each render token in the matched span instead of wrapping nested clickable spans. Clicking any token in the phrase can show the same `matchedText` and grammar hint while preserving existing word popup behavior.
- Render grammar-only particles as their own clickable token class, separate from `.jp-word`, so lookup handlers can hide vocab SRS actions when no vocabulary base form exists.
- Grammar SRS is out of scope for this system. Grammar hints are informational only until a later design explicitly adds grammar review.
