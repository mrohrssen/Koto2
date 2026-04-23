# renderJpSentence Dictionary Lookup — Design

**Date:** 2026-04-23
**Status:** Design approved, ready for implementation plan

## Context

Prior work (`2026-04-22-frame-meaning-overrides-design.md`) removed baked `meaning` from tokens in `frames.json` and made the live dictionary the source of truth for static-dialogue glosses. That shift works for words present in `frames.json`, but the client-side dictionary endpoint at `src/routes/game/known-words.js:119-133` filters the dict to exactly the words referenced by static frames. Any word outside that set — AI-generated DM narration, NPC dialogue, free-text prompts, prologue `jpDemo` scenes — has no entry on the client, so `resolveExposureMeaning` returns `''`.

Observed symptom: game entities (creature names, moves, NPCs) and frame-dialogue words render with correct English glosses; words that exist only in the live dictionary render with no gloss at all.

Separately, the resolution priority in `public/js/shared/exposure-extractor.js:27-36` does **not** match the intended order. Today it runs `override → dict → (entity fallback only if dict was empty)`. Entity data reaches the client correctly only because game entities are overlaid into the dict as `primary: true` and happen to win the dict step — an accident, not a guarantee.

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

`public/js/shared/exposure-extractor.js:resolveExposureMeaning` changes to:

```js
export function resolveExposureMeaning(token, wordDict, overrides = {}) {
  const baseForm = getTokenBaseForm(token);
  if (!baseForm) return '';
  if (overrides?.[baseForm]) return overrides[baseForm];
  if (token?.entity && token?.meaning) return token.meaning;
  if (token?.meaning) return token.meaning;
  const dictEntry = getDictEntry(wordDict, baseForm);
  return dictEntry?.definitions?.find(d => d.primary)?.en || '';
}
```

The file is already shared between server and client. Same function, two callers:

- **Server** calls it with the full in-memory dict during enrichment (step 4 of the priority falls through to dict).
- **Client** calls it during render; tokens already carry `.meaning`, so step 3 fires. `wordDict` argument may be `undefined`.

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
- Pass `wordDict` through as-is for the rare fallback path; do not change the 19 call-site signatures.
- Stamp `data-meanings` on the span (JSON-encoded `token.meanings`) when the token carries one, so the popup can render the full definitions list without another round trip.

`public/js/ui/dialogue-word-lookup.js` popup:

- Reads `data-override` and `data-meaning` from the clicked span (unchanged).
- For the full definitions list, read from `data-meanings` (new) on the span instead of looking up `window.gameState.wordDictionary[base]`.
- Visual behavior unchanged: context-specific gloss first when `data-override="1"`, then every dict definition.

### Client dictionary endpoint and bootstrap

`GET /api/game/known-words/word-dictionary` at `src/routes/game/known-words.js:119-133` becomes unused for the render path. Remove the route, the client fetch at `public/game.js:780-786`, and the `window.gameState.wordDictionary` field.

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

1. Add `enrichTokens` + unit tests.
2. Update `resolveExposureMeaning` priority + unit tests.
3. Wire `enrichTokens` into server token-producing paths (enumerate in plan).
4. Simplify `renderJpSentence` (drop the entity inline fallback; stamp `data-meanings`).
5. Update `dialogue-word-lookup.js` to read from `data-meanings`.
6. Remove `/api/game/known-words/word-dictionary` route, the client fetch in `public/game.js`, and `window.gameState.wordDictionary`.
7. Run `npm test` + manual playtest against the bug scenario (a live-dict-only word in DM narration).

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
