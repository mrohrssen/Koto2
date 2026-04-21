# Render is Exposure

**Date:** 2026-04-21
**Status:** Draft

## Problem

Word exposure recording is decoupled from rendering, and the decoupling is fragile. `renderJpSentence()` in `public/js/ui/bootstrap-client.js` displays Japanese tokens to the player from 25+ call sites across 16 UI files. Exposure is recorded separately by `GameManager.exposeWords()` at seven manually-chosen content-generation points on the server.

Every new render site is a new opportunity to forget an exposure call. Verified current gaps:

| Render site | What renders | Server exposure? |
|---|---|---|
| `public/js/ui/creature-row.js:226-229` | Creature `modifier` word + `baseWord` (popup) | Only `creature.name` exposed at encounter start — modifier word missed |
| `public/js/ui/pvp-lobby.js:47-50` | Creature modifier + baseWord (PvP lobby) | None — no encounter yet |
| `public/js/ui/exploration-dom.js:125` | NPC role word | None |
| `public/js/ui/exploration-dom.js:156` | NPC skill pill words | None |
| `public/js/ui/move-learn.js:22, 93` | New + existing move names during learn | None — move only exposed when used in an attack |
| `public/js/ui/move-select.js:55` | Move names during selection | Only fires after the attack resolves |
| `public/js/ui/target-select.js:64` | Target creature names | Already exposed at encounter start — re-display unrecorded |
| `public/js/ui/narration-box.js:196` | Speaker entity | None |

The symmetric gap also exists: server-generated content that fails to render (bug, race, navigation away, client error) still records as exposed. Exposure drifts from what the player actually saw in both directions.

The only invariant that holds is **render = exposure**: if a token was passed through `renderJpSentence`, the player saw it. Everything else is indirection.

## Principle

In the real game, `renderJpSentence` is the single source of exposure events. Every content token passed to it produces exactly one exposure. No game-logic code (server services, routes, or client UI modules) records exposure outside this path.

- A content token = any non-punctuation token with a `base` field (same qualifying rules `renderJpSentence` already uses to decide how to display it).
- Every render is a single event. Duplicate renders are bugs and fixed as part of this change.
- Server-side `GameManager.exposeWords()` stays as an unused utility. The `/api/game/known-words/expose` endpoint stays as the shared sync channel used by both the browser client and the simulator.
- The simulator is a headless stand-in for the browser: it has no DOM, so it extracts from API responses instead of from `renderJpSentence` calls. It still posts to the same `/expose` endpoint. This is the only system component that records exposure without going through `renderJpSentence`, and it does so precisely because it is modeling what a browser client would render.

## Architecture

### Modules

```
public/js/shared/exposure-extractor.js          (new, isomorphic — no DOM)
  extract(tokens, wordDict?, overrides?) → Array<{ word, meaning }>
    pure function; same content-token rules as the renderer
    meaning resolves from: token.meaning → overrides[base] → dict primary → dict first
  entityToToken(entity) → token
    moved here from bootstrap-client.js; re-exported there for backward compat
    used by both client render sites and simulator entity walks

public/js/ui/bootstrap-client.js
  renderJpSentence(tokens, knownWords, wordDict, overrides, useKanji)
    → HTML string; internally calls exposure-buffer.record(tokens, wordDict, overrides)
  entityToToken — re-exported from ../shared/exposure-extractor.js

public/js/ui/exposure-buffer.js                 (new, browser-only)
  record(tokens, wordDict, overrides)
    → walks tokens via extract(); appends to pending buffer; schedules flush
  flushNow()
    → fire-and-forget POST /api/game/known-words/expose; clears buffer
  init({ debounceMs = 500 })
    → wires debounce timer, visibilitychange listener, pagehide beacon flush
```

The shared module lives under `public/js/shared/` because Vite's root is `public/`. Node (simulator, tests) imports from there via relative path — already the pattern used by `tests/unit/ui/*` test files. Keep the module free of `window`, `document`, `fetch`, `setTimeout` so Node imports stay clean.

`extract()` is the single source of truth for "which tokens count as content exposures and how do we name their meaning." Both the browser buffer and the simulator import it.

### Data flow — browser

```
user action (popup tap, combat tick, bark trigger, narration advance, ...)
  ↓
UI module: renderJpSentence(tokens, knownWords, dict, overrides, useKanji)
  ↓
renderJpSentence internally: exposureBuffer.record(tokens, dict, overrides)
  → extract(tokens, dict, overrides) → [{word, meaning}, ...]
  → append to pending array (no dedup)
  → scheduleFlush() (debounced 500ms)
  ↓
renderJpSentence returns HTML → UI renders to DOM

500ms later:
  exposureBuffer.flushNow()
    → POST /api/game/known-words/expose { words: pending }
    → server: exposeWords(userId, words)
      → registerExposure per entry (seen[w].exposures++)
      → createCard(...) when crossing threshold 5
    → clear pending

page hide / unload:
  navigator.sendBeacon('/api/game/known-words/expose', body)
```

### Data flow — simulator

The simulator is a separate Node process that drives the game server over HTTP (`GAME_SERVER_URL`, see `simulator/server.js`). It has no in-process access to the server's word-knowledge state, so it uses the same `/api/game/known-words/expose` endpoint the browser does — but locally extracts the words from API responses via `extract()` / `entityToToken()`, since there is no render step.

```
simCall API response
  ↓
for each pre-tokenized field (barks, dialogue lines, befriend prompts, greetings, ...):
  words += extract(field.tokens)

for each entity field (creatures, modifiers, moves, items, NPC roles, skill pills, speakers, ...):
  words += extract([entityToToken(entity)])

simCall('POST', '/api/game/known-words/expose', { words })
```

Same endpoint and payload shape as the browser — only the source of the words differs (extracted from API responses instead of from `renderJpSentence` calls).

## Changes

### 1. `public/js/ui/bootstrap-client.js`

Import `record` from `exposure-buffer.js`. Call it at the top of `renderJpSentence` (after the empty-tokens guard) with `(tokens, wordDict, overrides)`. No other change to the return value or rendering logic.

### 2. `public/js/ui/exposure-buffer.js` (new)

- `_pending: Array<{word, meaning}>` — flat list, no dedup
- `_flushTimer: number | null`
- `record(tokens, wordDict, overrides)` → extract → push entries → `scheduleFlush()`
- `scheduleFlush()` → `clearTimeout(_flushTimer); _flushTimer = setTimeout(flushNow, 500)`
- `flushNow()` → if empty return; snapshot buffer; clear; POST to `/api/game/known-words/expose`. On failure log warn and drop.
- `init()` — called from `game.js` on boot — registers:
  - `document.addEventListener('visibilitychange', ...)` — flush on hidden
  - `window.addEventListener('pagehide', ...)` — flush via `navigator.sendBeacon` (synchronous-survivable)

### 3. `public/js/shared/exposure-extractor.js` (new, isomorphic)

Two exports. No DOM/browser dependencies — safe for Node import by simulator and tests.

**`extract(tokens, wordDict, overrides) → Array<{word, meaning}>`** — pure function containing the same punctuation-skip and content-detection rules the renderer uses:

- Skip tokens with no `base`/`baseForm`
- Skip if `pos` is in the punctuation POS set or surface matches `/^[\p{P}\p{S}\s]+$/u`
- Compute meaning: `token.meaning → overrides[base] → dictEntry.definitions.find(primary).en → dictEntry.definitions[0].en → ''`
- Emit `{word: base, meaning}` per qualifying token

**`entityToToken(entity) → token`** — moved here from `bootstrap-client.js` so it can be shared with the simulator. `bootstrap-client.js` re-exports it so existing call sites (`import { entityToToken } from './bootstrap-client.js'`) keep working.

### 4. Remove server-side `exposeWords()` call sites

Delete these calls. `GameManager.exposeWords()` itself stays as an unused utility (kept because future server-authoritative features may need it).

| File | Line | What it exposed |
|---|---|---|
| `src/game/services/combat-cycle-service.js` | 121 | Enemy creature names at encounter start |
| `src/game/services/combat-cycle-service.js` | 320 | Combat attack words (base + skill) |
| `src/game/services/combat-cycle-service.js` | 353 | Bark words per combat round |
| `src/game/services/combat-cycle-service.js` | 410 | Befriend prompt words |
| `src/routes/game/combat.js` | 99 | NPC battle dialogue (fightStart, defeatLine) |
| `src/routes/game/run.js` | 764 | Friendly NPC shop item + greeting words |
| `src/routes/game/run.js` | 819 | Friendly NPC chosen item words |

Delete the exposure-collection blocks that build these arrays too (not only the call), since they become dead code.

### 5. Simulator rewrite

The simulator is a separate Node process that drives the game server over HTTP. It has no DOM and never calls `renderJpSentence`. It mirrors the client's exposure behavior by extracting the same words the client would render from every API response and POSTing them back to `/api/game/known-words/expose` — the same endpoint the browser uses.

**Rule**: for every `renderJpSentence` call site in the client, the simulator must have a matching extraction step that consumes the same input. Two input shapes to handle, matching what the client call sites produce:

- **Pre-tokenized fields** — response fields that already carry `tokens: [...]` arrays (barks, dialogue lines, befriend prompts, shop greetings, etc.). Pass straight to `extract(tokens)`.
- **Entity fields** — response objects with `word`/`baseWord`/`name` fields that the client converts via `entityToToken(entity)` inline (creature names and modifiers, move names, item names, NPC roles, NPC skill pills, target selections, speakers). Simulator calls `entityToToken(entity)` → wraps in a single-element array → `extract([token])`.

Per-response, accumulate everything into one `words` array, then fire a single `simCall('POST', '/api/game/known-words/expose', { words })`. The simulator's existing "trust the server" shadow tracking is deleted. Every room handler that makes an API call grows a post-response extraction pass. The implementation plan enumerates the specific response fields per endpoint; the acceptance criterion is **every field the client would render through `renderJpSentence` (or `entityToToken` then `renderJpSentence`) has a matching simulator extraction**.

Simulator imports:
- `entityToToken`, `extract` from `public/js/shared/exposure-extractor.js` (Node can import from there — see existing `tests/unit/ui/*` pattern)

When simulator results drift from expected learning rates, the first debugging question is: "which client render site has no simulator mirror?"

### 6. Duplicate-render audit

Before merging, audit every `renderJpSentence` call site. Each must fire at most once per user-visible event. Fix any that don't:

- `creature-row.js` popup — only fires on `showPopup()`; verified. Must stay that way.
- `combat-loop.js:337` attack cards — once per attack resolution.
- `exploration.js` greeting/dialogue paths (lines 960, 965, 966, 1015, 1373, 1392, 1404, 1409) — once per line shown.
- `exploration-dom.js:125, 156` NPC trainer + skill pills — once per reveal.
- `narration-box.js:196` speaker entity — once per narration show.
- `move-select.js`, `move-learn.js`, `target-select.js`, `post-combat-shop.js`, `pvp-lobby.js`, `befriend.js`, `dialogue-display.js`, `attack-card.js`, `speech-bubble.js`, `room-transition.js` — once per list rebuild / action / animation.
- `public/game.js:119` — verify the import is only passed through to consumers, not called directly in `updateUI()`.

Any call that fires on state-change cascade (updateUI → renders creature row → rebuilds popup HTML every tick) is a pre-existing bug to fix in this change, because it would inflate mastery under the new model.

### 7. Testing

- `tests/unit/sentence-renderer.test.js` — extend with spy on `exposure-buffer.record` to assert it's called with content tokens and skipped for punctuation.
- `tests/unit/exposure-buffer.test.js` (new) — debounce semantics, flush clears buffer, beacon path fires on pagehide, empty-buffer no-op.
- `tests/unit/exposure-extractor.test.js` (new) — pure-function tests: punctuation skip, missing-base skip, meaning resolution order (token → override → dict primary → dict first → '').
- `tests/integration/exposure-flow.test.js` (new) — drive a render through a fake `fetch`; assert `/api/game/known-words/expose` received the expected payload; assert server-side FSRS card created at threshold 5.
- Delete tests that assert the server-side `exposeWords()` call sites (combat-cycle-service exposure tests for bark/combat words, run.js exposure tests for shop items). These become irrelevant.
- Simulator test (`simulator/tests/integration/simulation.test.js`) — add baseline assertion that a profile-driven 30-day simulation produces at least a known-words count that matches or exceeds the current pre-change baseline, to catch regressions from missed token-carrying fields in the rewrite.

### 8. Rollout and migration

- No data migration needed. `word-knowledge-*.json` files stay identical; the change is purely about *when* `exposeWords()` fires, not *how* it records.
- Existing FSRS cards and exposure counts are unaffected.
- Deploy client and server together. Brief window during rollout where an old client might still hit the removed server-side paths is harmless — server still accepts the expose endpoint and both paths are additive when they coincide.

## Edge cases

| Case | Behavior |
|---|---|
| Token missing `base` field | Skipped by extractor (matches renderer) |
| Punctuation token | Skipped by extractor |
| `wordDict` missing the base form | Meaning resolves to `token.meaning` or override or `''` |
| Buffer flush fails (network) | Fire-and-forget; log at `warn`; drop the batch |
| Tab close mid-batch | `pagehide` listener fires `navigator.sendBeacon` with current buffer |
| Multiple `renderJpSentence` calls within 500ms | All tokens accumulate; single POST at flush |
| User not logged in | Server returns 401; client logs warn; no retry |
| Empty tokens array | Early return in `renderJpSentence`; nothing buffered |
| Server `exposeWords()` called anyway (e.g. from a future feature) | Still works — increments `seen` count normally |

## Out of scope

- Changing the 5-exposure mastery threshold
- Adding new token-carrying content sources
- Mobile / alternative client integrations (they reuse `/api/game/known-words/expose`)
- Any changes to FSRS scheduling, card review, or speed review logic
- Local-storage fallback for offline play
