# Japanese Display Mode Consolidation Design

## Problem

Koto has a vague split between hiragana mode and kanji mode. The current implementation spreads that concept across `kanaMode`, `useKanji`, direct `toRomaji()` calls, hardcoded hiragana labels, lookup popups, combat labels, dialogue grids, and the shared token renderer.

Production is effectively hiragana-first today. `useKanji: true` appears in tests but not in production call sites, `isKanjiModeEnabled()` is not wired into current rendering, `meta.kanjiMode` is not part of the state factory, and `kanaMode` has no user-facing Settings toggle because Settings save currently forces it off. The actual current fragmentation is narrower than "screens disagree about kanji mode": several UI paths inject romaji independently, several token shapes reach lookup/rendering code, and a few raw Japanese labels can bypass the shared token renderer entirely.

The product rule should be simple:

- In hiragana mode, learner-facing Japanese displays without kanji. Words use hiragana readings, while katakana words remain katakana for now. Pronunciation guides use romaji.
- In natural Japanese mode, words display in the most natural written form. This may be kanji or kana. The game must not force kanji for words normally written in kana. Pronunciation guides use hiragana.

## Goals

- Split the work into a shippable cleanup phase and a separate natural-mode feature phase.
- Replace scattered romaji/kana decisions with one shared display-mode resolver while preserving today's effective hiragana behavior.
- Treat JMdict-derived form metadata as authoritative for dictionary-backed vocabulary when natural mode is added.
- Preserve multiple visual layouts while sharing one display contract.
- Make hiragana mode a strict no-kanji learner-facing mode.
- Make natural Japanese mode display the preferred Japanese surface, including conjugated forms such as `見た` rather than lemma-only `見る`.
- Keep `toRomaji()` as a low-level utility, not a UI display API.

## Non-Goals

- Do not redesign dialogue, combat, lookup, or review visuals.
- Do not remove romaji support; hiragana mode still needs romaji pronunciation guides.
- Do not make runtime rendering query JMdict directly.
- Do not preserve the old area-based `useKanji` meaning as a product concept.
- Do not add tutorial-time mode selection yet. The setting can remain manual for now.
- Do not re-enable dormant AI narration/dialogue generation as part of display consolidation. The generated-dialogue contract applies when those systems are enabled or when existing cached/generated text is rendered.

## Core Model

The player has one Japanese display preference:

- `hiragana`: main learner-facing Japanese text uses the token reading, with katakana preserved. Pronunciation guides use romaji.
- `natural`: main learner-facing Japanese text uses the preferred natural Japanese written form. Pronunciation guides use hiragana.

This replaces the current ambiguous "kanji mode" language. In the code and UI, prefer names like `japaneseDisplayMode`, `hiragana`, and `natural`.

## Sequencing Model

This project has two distinct bodies of work:

1. **Display resolver consolidation.** Introduce the resolver, route current hiragana-default displays through it, remove dead `useKanji`/`kanjiMode` policy paths, and prevent UI modules from making their own romaji/kana decisions. This phase should preserve current player-visible behavior and can ship independently.
2. **Natural mode.** Add JMdict display enrichment, token-level natural surfaces, inflected-surface derivation, display validation, cache migration, and the Settings opt-in. This is a new product feature and should be gated until the data contract is validated.

The cleanup phase should not wait for natural mode. The natural-mode phase depends on the cleanup resolver so it has one place to consume the new data.

## JMdict-Derived Display Metadata

JMdict should be used offline to enrich Koto dictionary entries with preferred display metadata. The renderer should consume enriched dictionary data, not call JMdict at runtime.

The integration must respect the current dictionary ownership model:

- `data/live-dictionary.json` is the runtime dictionary snapshot for local dev and CI, and the seed for Railway.
- `/app/persist/live-dictionary.json` is authoritative on Railway after first boot.
- `data/latest-jm-dict.json` is a frozen JMdict reference used by admin tooling, not by game runtime.
- overlay data such as creatures, moves, items, NPCs, and areas is committed repo data merged into the game dictionary.

Display enrichment should merge JMdict-derived form metadata into the live dictionary and overlays without overwriting curated definitions. Definitions remain curated Koto content; JMdict supplies written-form metadata and provenance. Production volume dictionaries need a migration/sync path, because changing only the committed seed will not update an existing Railway volume.

For each dictionary-backed word, enrichment should determine:

- `preferredSurface`: the natural written form for display in `natural` mode.
- `preferredReading`: the canonical reading used for pronunciation guides and hiragana display.
- `usuallyKana`: true when JMdict marks the word as usually written using kana alone, such as `uk`.
- `usuallyKanji`: true when JMdict marks the word as usually written using kanji alone, such as `uK`.
- priority metadata from `ke_pri` and `re_pri`, such as `news1`, `ichi1`, `spec1`, `gai1`, and `nfxx`.
- excluded or downgraded form metadata for rare, outdated, irregular, or search-only forms.
- `displaySource` and `displayConfidence`, so validation can distinguish confident automated decisions from curated exceptions.

JMdict ranking should follow this shape:

1. Prefer kana when the entry is marked usually-kana or has no suitable kanji form.
2. Prefer kanji when the entry is usually-kanji or the best kanji/reading pair has stronger priority.
3. Exclude rare, outdated, obsolete, irregular, or search-only written forms from normal display.
4. Use `ke_pri` and `re_pri` to rank multiple valid kanji/reading pairs.
5. Require an explicit curated exception when the metadata is ambiguous but the word is learner-facing.

Because Koto entity names are ultimately real vocabulary words, moves, items, creatures, NPC roles, speakers, and similar entity labels should use the same preferred display decision when a dictionary match exists. When an overlay word has no JMdict match or has a game-specific coined form, the overlay must provide an explicit curated display exception such as `preferredSurface`, `preferredReading`, and `displaySource: "curated"`. Natural mode should not guess from invented or ambiguous entity names.

Multi-sense and restricted-reading cases should be deterministic. If JMdict metadata differs by sense or reading restriction, the enrichment script should choose the highest-confidence written-form pair for the Koto dictionary headword, record the source tags used, and require a curated exception when a single entry-level display decision would be misleading.

## Token Display Data

Tokenization and enrichment should produce display-ready token fields rather than leaving each renderer to infer script behavior.

Recommended token fields:

- `base`: dictionary-backed lemma or entity word.
- `reading`: token reading in hiragana or katakana as appropriate.
- `hiraganaSurface`: kanji-free learner-facing token surface for hiragana mode.
- `naturalSurface`: preferred natural written surface for this exact token.
- `preferredSurface`: preferred dictionary headword surface for lookup/headword contexts.
- `displayConfidence`: confidence for the token-level display derivation.
- `displaySource`: source such as `jmdict`, `curated`, `surface`, or `derived-inflection`.

Glossary:

- dictionary-level fields describe the headword: `preferredSurface`, `preferredReading`, `usuallyKana`, `usuallyKanji`, and form priority metadata.
- token-level fields describe the exact text being rendered: `hiraganaSurface`, `naturalSurface`, `displayConfidence`, and `displaySource`.
- renderer-level fields describe layout-ready cells: `mainText`, `guideText`, `lookupHeadword`, lookup attrs, and CSS classes.

## Server and Client Responsibilities

Server/build-time enrichment owns linguistic derivation:

- dictionary display metadata from JMdict and curated exceptions.
- static frame token enrichment in `scripts/tokenize-static.js`.
- runtime token enrichment for any generated or parsed text.
- inflected-surface span derivation.
- validation diagnostics.

Client rendering owns display selection and layout:

- normalize the active mode.
- choose between precomputed `hiraganaSurface` and `naturalSurface`.
- produce romaji guide text from `reading` in hiragana mode.
- render inline ruby, dialogue grids, popups, compact labels, and other layouts.

The client resolver must not reconstruct conjugations. It can only consume token fields produced by server/build-time enrichment and apply the current mode.

## Static and Runtime Tokenizer Parity

The static and runtime token paths must converge before natural mode is exposed. Static frames currently go through `scripts/tokenize-static.js`, including dictionary-based token merging. Runtime parsing/generation uses `tokenize-and-annotate.js` and can produce a different token shape. The display contract should not be layered on top of divergent token producers.

Required parity work:

- share the demotion rules for particles, auxiliaries, suffixes, prefixes, and punctuation.
- share dictionary-based token merging where learner vocabulary treats multiple Sudachi tokens as one word.
- share grammar annotation and `rawTokenStart`/`rawTokenEnd` span metadata.
- return the same universal token shape for static frames, generated dialogue, and `/api/game/known-words/parse-text`.
- keep `data/dialogue/frames.json` generated only from `frame-sources.json`; new fields must be produced by the tokenizer, not hand-edited.

## Inflected-Surface Derivation

For inflected sentence tokens, natural mode must display the natural inflected form, not the lemma. For example:

- raw/generated `みた`, base `見る`, reading `みた` -> natural display `見た`
- raw/generated `あそんで`, base `遊ぶ`, reading `あそんで` -> natural display `遊んで`

This cannot be implemented as a naive "lemma + reading" replacement. Sudachi Mode A often splits an inflected word across multiple morphemes, for example a verb stem token plus an auxiliary `た`, `て`, or politeness ending. The unit of natural display derivation should therefore be a raw-token span, not always a single Sudachi token.

The enrichment layer should:

- identify content-token spans that represent one learner-facing inflected word.
- choose the kanji/kana stem from dictionary preferred-form metadata.
- append auxiliary and okurigana surfaces from the span, preserving grammar tokens such as `た`, `て`, `ます`, or punctuation.
- keep `rawTokenStart` and `rawTokenEnd` so grammar annotations and lookup remain aligned.
- emit `naturalSurface` for the full span when derivation is confident.

Fallback must avoid teaching the wrong word form. If a natural-mode inflected span cannot be derived:

- static/curated content fails validation.
- generated content should retry generation or repair when possible.
- if repair fails and the content must still render, degrade that token/span to the original validated surface or hiragana surface, log diagnostics, and do not substitute the lemma as if it were the inflected form.
- if i+1 or display validation fails for an entire generated response, discard it and use an already-validated static fallback when one exists.

## Generated Dialogue Contract

This design applies to all learner-facing Japanese text, not only static `frame-sources.json` dialogue. Future AI-generated narration, NPC dialogue, combat barks, room text, hints, choices, and tutorial prompts must go through the same tokenization, vocabulary validation, grammar annotation, and display enrichment path before rendering.

AI generation may produce raw Japanese text internally, but raw Japanese strings are not a valid UI boundary. Before any generated text reaches `renderJpSentence()`, `showNpcDialogueCard()`, a narration box, a speech bubble, or another Japanese display renderer, the server must convert it into enriched tokens with the display fields described above.

The generated-dialogue pipeline should enforce the same guarantees as static dialogue:

- i+1 vocabulary validation happens before display.
- every dictionary-backed token has JMdict-derived or curated display metadata.
- hiragana mode receives kanji-free token surfaces.
- natural mode receives preferred natural surfaces, including inflected surfaces when derivable.
- uncertain display derivation produces diagnostics and a controlled fallback path rather than bypassing the shared resolver.

This keeps static frames and AI-generated text on one rendering contract. `frame-sources.json` remains an authoring source for static content, not the only safe path into Japanese display.

Existing AI dialogue systems are partly dormant or displaced by static frames. `generateNarration()` is currently stubbed, and combat flows often use frame-backed bootstrap content. This spec does not require re-enabling those systems. It defines the boundary they must satisfy before any generated Japanese is rendered.

AI dialogue caches need an explicit migration story before natural mode can read cached generated text:

- Cache entries that contain only raw strings should be invalidated or lazily re-tokenized through the new enrichment path before display.
- Cache keys should include a display-contract version so future enrichment changes can invalidate old payloads.
- Debug cache endpoints and Settings cache-clearing actions should remain available during migration.
- TTS should continue to synthesize from the intended spoken Japanese, preferably reading/source text, not from a display-only natural surface that may contain kanji.

## Shared Display Resolver

Extend the existing shared token-cell architecture around `public/js/ui/japanese-token-cells.js`. Add a single resolver, conceptually:

```js
resolveJapaneseDisplay(token, { mode })
```

The resolver owns:

- main display text.
- pronunciation guide text.
- lookup headword display.
- mode normalization from legacy `kanaMode`.
- low-level romaji conversion through `toRomaji()`.

`buildJapaneseTokenCells()` should consume this resolver and expose display-ready cell fields, for example:

- `mainText`
- `guideText`
- `lookupHeadword`
- `reading`
- `base`
- `meaning`
- `kind`
- `lookupClass`
- shared lookup attributes
- grammar hints

UI modules may choose layout, but they must not choose script. Inline narration can render ruby, NPC dialogue can render rows, lookup can render a popup headword, and combat can render compact labels. All of them should use the same resolved cell fields.

`buildHeadwordRuby()` should either be folded into this resolver or treated as a small renderer for already-resolved headword cells. It should not remain a third place that independently decides hiragana/kanji/romaji policy.

`renderEnFirst()` is a legacy tagged-text renderer and should be migrated to the token contract or explicitly deprecated for learner-facing Japanese. It should not become a parallel script-mode implementation.

## Consolidation Rule

No player-facing UI module may directly decide between kanji, hiragana, kana, or romaji for Japanese vocabulary display.

Allowed:

- UI modules choose layout and CSS.
- The shared resolver calls `toRomaji()` to produce romaji guide text in hiragana mode.
- Low-level romanization tests call `toRomaji()` directly.

Not allowed:

- UI modules call `toRomaji(reading)` to decide what the player sees.
- UI modules pass ad hoc `useKanji: false` or `useKanji: true` as a display policy.
- UI modules inspect `kanaMode` and choose text themselves.
- Lookup popups independently decide whether the headword is kanji or kana.

During migration, compatibility wrappers can exist briefly, but the final state should route all learner-facing Japanese display through the shared resolver/cells.

Enforcement should be mechanical, not just conventional. Add a CI grep test or lint rule that bans player-facing imports/calls of `toRomaji()` outside an allowlist such as the shared resolver, `romaji.js`, and low-level tests. Add similar audits for direct `kanaMode`, `kanjiMode`, and `useKanji` decisions after compatibility wrappers are removed.

## Migration Scope

Audit and migrate these display paths:

- `renderJpSentence()`
- `renderDialogueTokenRows()`
- `renderTranslationSourceRows()`
- `dialogue-word-lookup.js`
- `lookup.js`
- `buildHeadwordRuby()`
- `renderEnFirst()`
- `/api/game/known-words/parse-text`
- combat move labels
- attack cards
- formation names
- creature rows
- PvP lobby labels
- campfire and item labels
- befriend labels
- whack-a-mole labels
- speech bubbles
- narration speaker labels
- move-learn headers and other move labels
- hardcoded Japanese UI labels such as `アイテム` / `はなす`
- creature popup titles and other raw entity-name DOM concatenation
- admin frame-audit display toggles, renamed to `hiragana` / `natural` if kept
- orphaned or dead helpers such as `combat-dom.js` `creatureNameRuby`, dead `toRomaji` imports, and `isKanjiModeEnabled()`
- AI-generated narration and NPC dialogue payloads
- generated room hints, choices, tutorial prompts, and other dynamic Japanese text
- any remaining direct `useKanji`, `kanaMode`, `showRomaji`, or player-facing `toRomaji()` display code

The migration should preserve different visual layouts while removing duplicate script-selection logic.

## Settings

Replace the conceptual meaning of `meta.kanaMode` with `meta.japaneseDisplayMode`.

Recommended values:

- `hiragana`
- `natural`

The conservative migration default is `hiragana` for all existing saves, including saves where `kanaMode` is false or absent. Existing `kanaMode: false` mostly means "the hidden experimental mode is off," not "the player opted into natural Japanese mode." Natural mode should be opt-in through Settings after validation. Future tutorial prompts can update the same field.

During the cleanup phase, Settings can write `japaneseDisplayMode: "hiragana"` while reading legacy `kanaMode` only for compatibility. During the natural-mode phase, Settings can expose a manual selector for `hiragana` and `natural`.

## Validation

Add validation so display metadata becomes a content contract:

- Every dictionary word used in learner-facing content has a JMdict-derived preferred display decision or an explicit curated exception.
- Hiragana mode surfaces contain no kanji.
- Katakana words remain katakana in hiragana mode unless a future product decision changes that.
- Natural mode surfaces use preferred written forms, not forced kanji.
- Conjugated token natural surfaces are confidently derived or rejected for static/curated content.
- AI-generated Japanese cannot be rendered from raw strings; it must be tokenized, validated, and display-enriched first.
- Renderer tests prove no UI path bypasses the shared resolver for Japanese vocabulary display.
- The static and runtime tokenizers produce compatible universal token shapes.
- Cached generated dialogue is either display-contract-versioned or re-enriched before rendering.

## Testing Plan

Dictionary enrichment tests:

- `uk` entries prefer kana.
- `uK` entries prefer kanji.
- priority tags rank multiple written forms.
- rare/outdated/irregular forms are excluded from normal display.
- no-kanji entries remain kana/katakana.

Token display resolver tests:

- hiragana mode uses kanji-free main text and romaji guide text.
- natural mode uses natural main text and hiragana guide text.
- katakana words are preserved in hiragana mode.
- known and unknown words share the same script policy.
- grammar and punctuation cells do not introduce kanji in hiragana mode.
- inflected tokens display natural inflected surfaces when metadata is present.

Renderer parity tests:

- inline narration, NPC dialogue grids, translation source rows, lookup popups, combat labels, and entity labels consume the same resolved cell fields.
- direct UI use of `toRomaji()` for player-facing vocabulary display is removed or covered by an allowlist.
- legacy `useKanji` and `kanaMode` paths normalize to the new mode rather than making independent choices.
- `/api/game/known-words/parse-text` returns display-compatible tokens or is adapted before lookup rendering.
- a CI audit fails on new player-facing `toRomaji`, `useKanji`, `kanaMode`, or `kanjiMode` policy decisions outside approved modules.

## Risks

- Inflected display derivation can be wrong if it is implemented as a naive string replacement. It should be isolated, tested, and validated before broad rollout.
- JMdict metadata can be ambiguous. The enrichment pipeline needs curated exceptions instead of guessing silently.
- Runtime generated Japanese may expose gaps before static validation catches them. Diagnostics should make those gaps visible.
- A partial migration could leave inconsistent surfaces. Renderer parity tests and a direct-use audit for `toRomaji`, `useKanji`, and `kanaMode` are required.
- Existing Railway volume dictionaries will not pick up committed seed changes automatically. Display metadata migration must handle the live volume path.
- Existing generated dialogue caches may contain raw strings. Natural mode must not treat those caches as display-enriched payloads.

## Rollout

Phase 1: resolver consolidation with no intended player-visible behavior change.

1. Add the shared display resolver in the client token-cell layer, initially resolving the current hiragana-first behavior.
2. Route existing token-cell consumers through resolved `mainText` and `guideText`.
3. Migrate direct `toRomaji()` UI call sites or mark them dead/allowlisted.
4. Delete or retire dead policy paths such as `isKanjiModeEnabled()`, unused `useKanji` production parameters, and references to nonexistent `meta.kanjiMode`.
5. Normalize state/settings around `japaneseDisplayMode`, defaulting existing users to `hiragana`.
6. Add CI audits so new UI code cannot reintroduce script-selection logic.

Phase 2: dictionary and token infrastructure for natural mode, still hidden from users.

1. Add JMdict form-metadata enrichment against `live-dictionary.json` and overlays without overwriting curated definitions.
2. Add curated display exceptions and a validator for ambiguous or missing metadata.
3. Resolve static/runtime tokenizer divergence so both produce the same universal token/display shape.
4. Extend `enrichTokens()` or a new server-side display-enrichment module to stamp `hiraganaSurface`, `naturalSurface`, `preferredSurface`, and display provenance.
5. Implement inflected-surface span derivation with focused tests.
6. Version or invalidate generated dialogue caches that contain raw strings.

Phase 3: expose natural mode.

1. Validate static frames and representative runtime/generated payloads.
2. Enable natural mode behind a feature flag or developer setting.
3. Migrate lookup, review, combat, and entity-label flows to verified natural-mode snapshots.
4. Expose the manual Settings selector once validation and renderer parity tests pass.

This makes Japanese display mode a single data/display contract across the game: one linguistic resolver, many presentation layouts.
