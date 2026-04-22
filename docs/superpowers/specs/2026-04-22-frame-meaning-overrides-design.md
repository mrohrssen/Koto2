# Frame Meaning Overrides — Design

**Date:** 2026-04-22
**Status:** Design approved, ready for implementation plan

## Problem

Static dialogue tokens in `data/dialogue/frames.json` carry a `meaning` field baked at build time by `scripts/tokenize-static.js`. After admin dictionary editing became a live feature (custom live dictionary, merged 2026-04-22), baked meanings go stale as soon as the live dict is edited. The meaning stored in `frames.json` never regenerates until someone manually reruns `tokenize-static.js`.

Concrete bug observed: admin changed `どの` from "Mr. / Mrs. / Miss / Ms." to "which / what (way)" in the live dict. The game popup still showed both definitions because the dialogue popup handler (`public/js/ui/dialogue-word-lookup.js`) concatenates the stale baked meaning (`data-meaning`) with fresh live-dict definitions.

## Goal

- Make the **live dictionary the single source of truth** for meanings in static dialogue.
- Reserve a **per-frame override hook** for context-specific glosses that intentionally differ from the dict (e.g., a word that normally glosses "dog" but means "pup" in a specific bark line).
- No existing frame needs an override today. This is a forward-looking capability.

## Non-goals

- Global (non-frame-scoped) overrides. The live dict already serves that purpose — edit the dict directly.
- Overriding reading, part-of-speech, or the Japanese surface form. Overrides apply to the English gloss only. Reading and POS still come from the tokenizer + live dict.
- Changing AI-generated dialogue (NPC greetings, `npcLine`, option text). Those render via `renderEnFirst(taggedText)` and do not touch the token pipeline.

## Schema

### `data/dialogue/frame-sources.json`

New optional field `overrides` on frame entries. Flat string map keyed by Sudachi base form.

```json
{
  "id": "skill_select_prompt",
  "category": "skill_select",
  "raw": "どの能力？",
  "slots": [],
  "overrides": { "どの": "which / what (way)" }
}
```

Rules:
- Key is the Sudachi base form, same key space as the live dictionary.
- Value is a non-empty trimmed English gloss string.
- Absent field or empty object `{}` = no overrides (the common case).

### `data/dialogue/frames.json`

Two changes to the generated output:

1. **Drop `meaning` from every token.** Token shape becomes `{surface, base, reading, pos}`. Tokens without a `base` (punctuation, demoted grammar) keep today's shape (`{surface}` only).
2. **Pass `overrides` through** from `frame-sources.json` when present.

```json
{
  "id": "skill_select_prompt",
  "category": "skill_select",
  "raw": "どの能力？",
  "tokens": [
    { "surface": "どの", "base": "どの", "reading": "どの", "pos": "Pre-noun" },
    { "surface": "能力", "base": "能力", "reading": "のうりょく", "pos": "Noun" },
    { "surface": "？" }
  ],
  "words": ["どの", "能力"],
  "overrides": { "どの": "which / what (way)" }
}
```

Frames without overrides simply omit the field.

## Display semantics

### Inline rendering (the stacked English under hiragana for unknown words)

`public/js/shared/exposure-extractor.js:resolveExposureMeaning` priority becomes:

```
overrides[baseForm] → dictEntry primary → dictEntry first → ''
```

The baked `token.meaning` path is removed entirely. No frame-level drift is possible because `meaning` no longer exists on tokens.

### Popup (`public/js/ui/dialogue-word-lookup.js`)

When the user taps a word span, build the meanings list as follows:

- If `span.dataset.override === "1"`: push the override gloss first as a visually distinguished bullet labeled "In this context:". Then push all live-dict definitions in order.
- Otherwise: push live-dict definitions only (today's behavior minus the stale merge bug).

Visual treatment: one `<li class="contextual-meaning">` with an inline `<em>In this context:</em>` prefix. CSS lives alongside existing popup styles.

## Render-path wiring

`renderJpSentence(tokens, knownWords, wordDict, overrides, useKanji)` already accepts an `overrides` parameter; it is currently always called with `{}`. Changes:

1. Every frame-rendering call site passes `frame.overrides || {}` (or `line.overrides || {}` where the line carries them through).
2. `renderJpSentence` body: when setting `data-meaning` on a `.jp-word` span, if `overrides[baseForm]` exists, also set `data-override="1"`. The span's `data-meaning` holds the override value in that case; otherwise it holds the dict primary.

Call sites to update (grep for `renderJpSentence`):

- `public/js/ui/dialogue-display.js:29`
- `public/js/ui/npc-dialogue-ui.js:56` (defeat line, sourced from frames)
- `public/js/ui/exploration.js:989, 1419` (whack-a-mole intro, friendly NPC greeting)
- `public/js/ui/whack-a-mole.js:361`
- `public/js/ui/room-transition.js:155`
- `src/routes/game/run.js:689, 704` (GameMaster frames)

All these already thread a per-line/per-frame object; passing `.overrides` alongside `.tokens` is a one-line change per site.

## Build + validation changes

### `scripts/tokenize-static.js`

1. Remove the `lookupMeaning(st.baseForm, wordDict)` call in `toUniversalToken`; drop `meaning` from the emitted token.
2. Preserve `overrides` from each source entry in the output frame when present.
3. Dead code: the `lookupMeaning` helper becomes unused and can be removed.

### `scripts/validate-dialogue.js`

New checks:

1. For every frame with `overrides`, each key must appear as a `base` in that frame's tokens. Orphan keys (typo, or override left behind after a raw-text edit) fail the build with a message identifying the frame id and the bad key.
2. Every override value must be a non-empty trimmed string.
3. No dictionary-membership requirement. Overrides may target words not in the live dict (rare, but legitimate — e.g., a nonce word the author wants to gloss locally).

## Tests

- **`tests/unit/exposure-extractor.test.js`** — update the existing priority test to reflect the new order (override beats dict). Add a case where overrides is empty and dict has the word.
- **`tests/unit/tokenize-static.test.js`** (new if missing) — generated frames drop `meaning` from tokens; `overrides` field passes through verbatim; empty `overrides` does not emit the field.
- **`tests/unit/validate-dialogue.test.js`** — new cases: orphan override key fails; empty override value fails; valid override passes.
- **`tests/unit/ui/dialogue-word-lookup.test.js`** (or popup-behavior test) — with `data-override="1"`, popup renders the context bullet first + dict bullets; without the flag, popup renders dict bullets only; no merging of stale baked meanings anywhere.
- Existing integration tests that snapshot dialogue rendering may need updating once `token.meaning` is removed.

## Migration

After the code changes land, run once:

```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
npm test
```

Commit the regenerated `frames.json` (tokens lose `meaning`; no frame gains `overrides` because none are authored yet). Admin dict edits already on prod (including the `どの` fix from today) immediately take effect in the UI — no further action needed.

## Risks and rejected alternatives

**Rejected: keep baked `meaning` as a fallback behind overrides.**
Safer on paper, but the whole drift class survives. If anything ever writes a bad baked meaning, we ship stale data again. Dropping the field entirely means the bug cannot recur.

**Rejected: global override file (`frame-overrides.json`).**
Overrides are inherently contextual to how a word is used in a specific frame. A global file collapses that distinction and makes it impossible to gloss the same word differently in two frames.

**Rejected: inline markup in `raw` (e.g. `{{どの|which}}能力？`).**
Conflicts with existing `{slot}` markers. Requires parser changes. Harder to author and review than a separate `overrides` object.

**Residual risk: authors add an override without realizing the live-dict definition is also wrong.**
The override works in one dialogue but the word stays wrong everywhere else. Mitigation: the admin dictionary edit flow (already live) is the primary tool; overrides are for genuinely contextual cases only. Consider a dev-mode linter pass later that flags words with overrides in ≥50% of their frame occurrences (suggests the dict itself needs updating).
