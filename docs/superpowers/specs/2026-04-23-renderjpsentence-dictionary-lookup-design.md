# renderJpSentence Dictionary Lookup — Design

**Date:** 2026-04-23
**Status:** Design approved, ready for implementation plan

## Context

Prior work (`2026-04-22-frame-meaning-overrides-design.md`) removed baked `meaning` from tokens in `frames.json` and made the live dictionary the source of truth for static-dialogue glosses. In the running game today, that source-of-truth lookup fails for almost everything that isn't a game entity. Three compounding problems:

1. **Main narration box sends an empty dict.** `public/js/ui/dialogue-display.js:4` declares `let _wordDict = new Map()` and exports a `setWordDictionary` at line 10 that **nothing ever calls**. Every dialogue rendered through `showDialogueLines` — which covers most of the game's hand-written frame dialogue — passes that empty Map to `renderJpSentence`. `resolveExposureMeaning` finds no dict entry for any token, returns `''`, and the only glosses that survive are entity tokens (creature / move / NPC names) via the `token.entity ? token.meaning` fallback at `bootstrap-client.js:100-101`. This is what shows up in the game as "only game entities render with English; hand-written frame dialogue does not."

2. **Other call sites pass a filtered dict.** `public/js/ui/exploration.js`, `public/game.js:858` (prologue `jpDemo`), and others construct `new Map(Object.entries(window.gameState?.wordDictionary || {}))` from the bootstrap fetch. The endpoint that populates it at `src/routes/game/known-words.js:119-133` **filters the dict to exactly the words appearing in `frames.json`**. Frame-vocab words resolve there (inline render and popup work). Words that exist only in the live dict — AI-generated DM narration, NPC dialogue, free-text prompts, any Sudachi-tokenized runtime text — have no client-side entry and render blank.

3. **Priority order is wrong.** `public/js/shared/exposure-extractor.js:27-36` runs `override → dict → (entity fallback only if dict was empty)`. Entity data reaches the client correctly only because `src/game/word-dictionary.js:71-74` overlays game entities into the dict as `primary: true` — an accidental path, not a guaranteed one. Under the intended order, a token flagged `token.entity === true` should win over any dict entry for the same base form, unconditionally.

The net user-visible state: entities render glosses everywhere; frame-dialogue words render glosses nowhere; other paths render glosses only for frame-vocab words. Popups behave similarly — `dialogue-word-lookup.js` is the one place that *is* initialized with the filtered dict (via `dialogueLookup.init` at `game.js:2113`), so frame-vocab words get a working popup; non-frame words get an empty popup.

## Goal

- One priority function, called once per content token wherever tokens are produced.
- Every token reaches the client with `.meaning` already resolved through that function, against the current live dictionary.
- Live-dictionary edits reach users on the next request. No build step, no client cache invalidation.
- No duplicate resolution logic scattered across call sites.

## Priority order

```
override → entity → dict primary → ''
```

1. **Override** — `frame.overrides[baseForm]` string. Contextual gloss authored per frame (see `2026-04-22-frame-meaning-overrides-design.md`).
2. **Entity** — `token.meaning` on a token flagged `token.entity === true`. Carries the canonical English name of a game object (creature, move, item, NPC, NPC skill, area) spliced into a frame slot or built client-side by `entityToToken`.
3. **Dict primary** — `wordDict.get(baseForm).definitions.find(d => d.primary).en`. Covers live-dict entries plus curriculum-word overlays (glue-words, grammar-words).

Entity-before-dict is an explicit guarantee under this spec: a creature named `茶` shows its entity name, not the live-dict gloss for 茶 ("tea"), regardless of how the server dict merges the two.

Note: the live-dict + game-entity + curriculum overlays that exist in `src/game/word-dictionary.js` still happen. The resolver just uses `token.entity` as a stronger signal than a dict hit — the dict overlay becomes incidental, not load-bearing.

## Architecture

### Shared priority function

`public/js/shared/exposure-extractor.js` gains a small dict-primary helper and `resolveExposureMeaning` delegates to it:

```js
export function lookupDictPrimary(wordDict, baseForm) {
  const entry = getDictEntry(wordDict, baseForm);
  return entry?.definitions?.find(d => d.primary)?.en || '';
}

export function resolveExposureMeaning(token, wordDict, overrides = {}) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return '';
  if (overrides?.[baseForm]) return overrides[baseForm];
  if (token?.entity && token?.meaning) return token.meaning;
  if (token?.meaning) return token.meaning;
  return lookupDictPrimary(wordDict, baseForm);
}
```

`resolveExposureMeaning` is the single point of truth for **render-path** meaning resolution. `lookupDictPrimary` is the single point of truth for the dict tier itself (override and entity tiers don't apply when you're looking up by a bare base form). Nothing else in the codebase runs the `primary || definitions[0]` pattern — all such sites import one of these two functions.

The file is already shared between server and client. Two render-path callers:

- **Server** calls `resolveExposureMeaning` with the full in-memory dict during enrichment (step 4 falls through to dict).
- **Client** calls `resolveExposureMeaning` during render; tokens already carry `.meaning`, so step 3 fires. `wordDict` argument may be `undefined`.

Outside the render path, one non-render caller consolidates onto `lookupDictPrimary`:

- `src/game/bootstrap/word-knowledge.js:33-58` today defines `lookupMeaning(baseForm)` and `lookupMeaningFrom(dict, baseForm)` that both run `primary?.en || definitions[0]?.en || ''` inline (SRS card hydration). Rewrite each to a one-liner that calls `lookupDictPrimary(dict, baseForm)`. No behavior change — `definitions[0]?.en` fallback was always equivalent to `primary` (see data audit note below).

**Data audit note.** All 37,961 live-dict entries have `primary: true` stamped on `definitions[0]`, so `primary || definitions[0]` is currently a no-op second tier. The fallback stays in `lookupDictPrimary` as belt-and-suspenders in case that invariant breaks, but only in one place — callers never write the fallback themselves.

### Server-side enrichment

New helper in `src/game/enrich-tokens.js`:

```js
export function enrichTokens(tokens, overrides, dict) {
  if (!Array.isArray(tokens)) return tokens;
  return tokens.map(token => {
    if (!isContentExposureToken(token)) return token;
    const meaning = resolveExposureMeaning(token, dict, overrides);
    const dictEntry = getDictEntry(dict, getTokenBaseForm(token));
    const meanings = dictEntry?.definitions || null;
    return { ...token, meaning, ...(meanings ? { meanings } : {}) };
  });
}
```

Two stamped fields per content token:

- `token.meaning` — single string, the priority-resolved gloss, used for inline render (stacked English under hiragana) and `data-meaning` on the span.
- `token.meanings` — `Array<{en, primary}>` from the dict entry when one exists. Used by the popup to show all definitions. Omitted when the dict has no entry (pure entity tokens, nonce words).

Call `enrichTokens` from every server path that produces tokens for client rendering. Enumerate exhaustively during the plan — starting points:

- `src/game/dialogue-loader.js` (static frame resolver)
- `src/routes/game/run.js` (GameMaster frames at lines 689, 704)
- `src/routes/game/known-words.js` (`parse-text` endpoint at line 141)
- Any DM / NPC / bark assembly path that calls `tokenize()` before returning to the client

Preferred placement: wrap `tokenize()` (or the single function every path goes through) so the stamp is automatic and no endpoint can forget. Frame resolver and slot splicer still call `enrichTokens` explicitly because they produce tokens without going through `tokenize()` for the full sentence.

### Client-side

`public/js/ui/bootstrap-client.js:renderJpSentence` simplifies:

- Delete the inline entity fallback at lines 100-101 — `resolveExposureMeaning` now handles it.
- `wordDict` parameter stays in the signature (19 call sites) to avoid a breaking API change, but is only used by the shared resolver's final fallback step. In the enriched flow it is effectively unused.
- Stamp `data-meanings` on the span (JSON-encoded `token.meanings`) when the token carries one, so the popup can render the full definitions list without another round trip.

`public/js/ui/dialogue-display.js` cleanup:

- Remove the orphaned `_wordDict` module state (line 4), the unused `setWordDictionary` export (line 10), and the `_wordDict` argument at the `renderJpSentence` call (line 31). Pass `null` (or the same empty Map — renderer tolerates both) in its place; tokens now carry their own meanings.

`public/js/ui/dialogue-word-lookup.js` popup:

- Reads `data-override` and `data-meaning` from the clicked span (unchanged).
- For the full definitions list, read from `data-meanings` (new) on the span instead of `_wordDict.get(base)` at line 153. Remove the `_wordDict` module state and the `wordDictionary` parameter of `init()`.
- `buildPopupMeanings` already takes `dictEntry` as an argument — change the caller to parse `data-meanings` JSON into `{definitions: [...]}` and pass that, so `buildPopupMeanings` itself is unchanged and its existing unit tests still apply.
- Visual behavior unchanged: context-specific gloss first when `data-override="1"`, then every dict definition.

### Client dictionary endpoint and bootstrap

`GET /api/game/known-words/word-dictionary` at `src/routes/game/known-words.js:119-133` becomes unused for the render path. Remove the route, the client fetch at `public/game.js:775-786`, the `window.gameState.wordDictionary` field, and the `wordDictionary` argument at `game.js:2113` `dialogueLookup.init(...)`.

If a future debug tool needs per-word lookup, add a narrow `GET /api/dict/:word` endpoint returning one entry. Not required for this fix.

## Data flow

1. **Server boot** — `loadWordDictionary` builds the in-memory dict (live + game overlay + curriculum). Unchanged.
2. **Request** — endpoint assembles tokens (Sudachi `tokenize` and/or frame slot splice) → `enrichTokens(tokens, overrides, dict)` → response JSON includes `{tokens, overrides}` where each content token has `meaning` (and usually `meanings`).
3. **Client receives tokens** — passes them through `renderJpSentence(tokens, known, wordDict, overrides)`. `wordDict` is effectively unused.
4. **Inline render** — `resolveExposureMeaning` hits the override or the pre-stamped `token.meaning` and emits `data-meaning` + the stacked-English span.
5. **Popup on tap** — reads `data-override`, `data-meaning`, `data-meanings` from the span; renders the definition list.
6. **Live-dict edit** — admin edits the dict; existing reload mechanism refreshes the server's in-memory dict; next request serves freshly enriched tokens with updated meanings.

## Tests

- **Unit `tests/unit/exposure-extractor.test.js`** — priority order:
  - Override wins over entity wins over dict wins over empty.
  - Entity flag without `token.meaning` falls through to dict.
  - `token.meaning` without the entity flag is still honored (server-enriched dict meaning).
  - Empty baseForm / punctuation returns `''`.
- **Unit `tests/unit/enrich-tokens.test.js`** (new) — `enrichTokens` stamps `.meaning` on content tokens; skips punctuation; entity tokens keep their existing `token.meaning`; overrides win when present; `.meanings` array is the full dict entry definitions when available, omitted otherwise; non-array input is returned unchanged.
- **Integration** — request a dialogue containing a live-dict-only word (not in any static frame), assert the rendered span's `data-meaning` matches the live dict.
- **Manual** — edit a live-dict entry (e.g., `雨` → "precipitation"), reload a DM narration that uses the word, observe the new meaning inline and in the popup without redeploying.

## Migration

1. Add `lookupDictPrimary` + update `resolveExposureMeaning` priority + unit tests.
2. Rewrite `src/game/bootstrap/word-knowledge.js:lookupMeaning` and `:lookupMeaningFrom` as one-liners over `lookupDictPrimary`. Remove the inlined `primary || definitions[0]` pattern.
3. Add `enrichTokens` + unit tests.
4. Wire `enrichTokens` into server token-producing paths (enumerate in plan).
5. Simplify `renderJpSentence` (drop the entity inline fallback; stamp `data-meanings`).
6. Clean up `dialogue-display.js`: remove orphaned `_wordDict` and `setWordDictionary`.
7. Update `dialogue-word-lookup.js` to read from `data-meanings`; drop its `_wordDict`.
8. Remove `/api/game/known-words/word-dictionary` route, the client fetch in `public/game.js`, `window.gameState.wordDictionary`, and the `wordDictionary` argument at the `dialogueLookup.init(...)` call.
9. Run `npm test` + manual playtest: load a dialogue known to contain a live-dict-only word in the main narration box, verify the stacked English appears inline and the popup shows all definitions; edit a live-dict entry and verify the next render reflects the edit without redeploying.

`frames.json` schema is unchanged by this spec — no regeneration required.

## Non-goals

- Retroactively updating prior SRS exposure records when the dict changes. Existing exposures remain as an audit of what the player saw at that moment; new exposures use the current meaning.
- Offline / client-cached dictionary for debug tooling. Popup definitions travel inline on tokens.
- Changing the admin live-dictionary edit flow (a separate system).
- Changing reading or part-of-speech resolution. Both still come from Sudachi.

## Risks and rejected alternatives

**Rejected: ship the full dict to the client (Option B).** ~1.5 MB gzipped on bootstrap plus a persistent ~5 MB in-memory Map. Doesn't scale as the dict grows and doesn't add value — `token.meanings` on rendered tokens covers the popup without touching untyped words.

**Rejected: build-time enrichment (Option A2).** Bakes dict state into `frames.json` at build time. Admin dict edits would not reach users until the pipeline reruns and deploys. Directly contradicts the stated requirement.

**Residual risk: a server token-producing endpoint misses `enrichTokens`.** Tokens reach the client without `.meaning` stamped; inline render shows no gloss. Mitigations:
- Centralize the stamp by wrapping `tokenize()` (or the narrow helper every path uses).
- Add an integration test per endpoint category asserting every content token has `.meaning` before the response is sent.
- In dev mode only, log a warning when `renderJpSentence` encounters a content token without `.meaning` and without a dict hit — catches misses in developer playtest.

**Residual risk: payload inflation from `.meanings`.** Typical dialogue frame of ~10 content tokens × ~3 definitions × ~20 chars ≈ 600 bytes — well below the noise floor versus the rest of a game-state response. If a specific payload becomes hot, omit `.meanings` for already-known words since the popup still has `.meaning` + dict on the server for on-demand lookup.
