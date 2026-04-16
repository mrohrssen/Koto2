# Design: Always-Clickable Dialogue Words

**Date:** 2026-04-10
**Status:** Approved

## Problem

Players see Japanese words in dialogue boxes but can't interact with them. The existing word lookup requires activating a toggle mode via a toolbar button, which uses JPDB API parsing on-the-fly. Our dialogue already has pre-tokenized data with readings, meanings, and dictionary entries — all the information needed for instant word lookup without any API calls.

## Design

### Click Behavior Change

The narration box becomes a "safe zone" for word exploration:

- **Clicking anywhere inside the narration box** does nothing (no dismiss). This includes word spans, punctuation, empty space — all of it.
- **Clicking outside the narration box** (on the game scene above/below) dismisses and advances dialogue.
- **Clicking a word span** inside the narration box opens the definition popup.
- The `▼` indicator stays to signal "tap outside to continue."

Implementation: Change `handleClick` in `narration-box.js` from "click anywhere to continue" to "capture clicks for word lookup only." Add a click listener on the scene/game area behind the narration box for continuation.

### Word Rendering Changes

`renderJpSentence` in `bootstrap-client.js` gets enhanced. Every `.jp-word` span (both `.jp-known` and `.jp-unknown`) gains `data-*` attributes:

- `data-base` — base form (dictionary lookup key)
- `data-reading` — hiragana reading
- `data-meaning` — English definition
- `data-pos` — POS in English (e.g., "Noun", "Verb")

All word spans get `cursor: pointer` and a click handler that opens the definition popup.

### POS in Token Pipeline

`tokenize-static.js` adds a `pos` field to the universal token format, mapped from Sudachi's Japanese POS to English:

| Sudachi | English |
|---|---|
| 名詞 | Noun |
| 動詞 | Verb |
| 形容詞 | Adjective |
| 副詞 | Adverb |
| 連体詞 | Pre-noun |
| 接続詞 | Conjunction |
| 感動詞 | Interjection |
| 形状詞 | Na-adjective |
| 代名詞 | Pronoun |
| 助詞 | Particle |
| 助動詞 | Auxiliary |
| 接尾辞 | Suffix |
| 接頭辞 | Prefix |

After the code change, `frames.json` gets regenerated via `node scripts/tokenize-static.js`.

### Definition Popup

Reuse the existing `#lookup-popup` HTML element and CSS from `lookup.js`. Modify it to work with local token data instead of JPDB API responses.

**Contents:**
- **Word** (surface/kanji) + **Reading** (hiragana) — header row
- **POS** — English label from token data
- **Meaning(s)** — primary from token `data-meaning`, additional definitions from `window.gameState.wordDictionary`
- **SRS state** — "New" or "Known" (derived from existing `getKnownWords()` set, no bootstrap changes needed)
- **Two buttons:** "I forgot" / "I knew it"

**Positioning:** Extract `positionPopup(wordRect)` from `lookup.js:466` into a shared utility (it's currently not exported). Center on tapped word, prefer above, flip below if no space.

**Dismissal:** Tap outside the popup (but still inside the narration box) closes it. Tap outside the narration box closes the popup AND advances dialogue.

**Known word meanings:** `renderJpSentence` currently skips meaning lookup for known words. The `data-meaning` attribute must be populated for all words by looking up `wordDict.get(baseForm)` for known words too (falling back to `token.meaning`).

### SRS Review Buttons

Two buttons at the bottom of the popup: "I forgot" and "I knew it."

**Uses existing `POST /api/game/known-words/review`** with the existing client function `reviewVocabWord(word, grade)` from `api.js:537`. Grade is `"again"` for "I forgot" and `"good"` for "I knew it."

**One small server change:** If no vocab SRS card exists for the word, create one before grading (bypasses the 5-exposure threshold). This lets players fast-track words they already know. The endpoint looks up the word in the server-side word dictionary (`loadWordDictionary`) to get `meaning` and `reading` for the `createCard(userId, 'vocab', word, { word, meaning, reading })` call.

After review, the popup's state indicator updates immediately from the response. The local `knownWords` set is updated client-side via `addKnownWord()`.

Tapping a word to view the popup is purely informational — no SRS side effect. Only the explicit buttons interact with SRS.

## What We Reuse

| Need | Already Exists | File |
|---|---|---|
| Review API | `POST /api/game/known-words/review` | `src/routes/game/known-words.js:34` |
| Client review function | `reviewVocabWord(word, grade)` | `public/js/api.js:537` |
| Known words set | `getKnownWords()` / `addKnownWord()` | `public/js/ui/bootstrap-client.js` |
| Word dictionary | `window.gameState.wordDictionary` | `bootstrap-client.js` |
| Popup HTML/CSS | `#lookup-popup` element + styles | `index.html:123`, `game.css:1584` |
| Popup positioning | `positionPopup(wordRect)` logic | `public/js/ui/lookup.js:466` (not exported — extract) |
| Toast feedback | `showToast(message, duration)` | `public/js/ui/scene.js:479` |
| Rendering | `renderJpSentence(tokens, knownWords, ...)` | `bootstrap-client.js:79` |

## What's New (6 changes)

1. **Add `pos` field to token pipeline** — POS map in `tokenize-static.js`, regenerate `frames.json`
2. **Add `data-*` attributes to word spans** — modify `renderJpSentence` in `bootstrap-client.js`
3. **Change narration box click behavior** — inside = no dismiss, outside = dismiss (`narration-box.js`)
4. **Word click → populate existing popup** — click handler on `.jp-word` reads `data-*` attrs + `wordDictionary`, fills `#lookup-popup`
5. **Add two buttons to popup HTML** — "I forgot" / "I knew it" calling existing `reviewVocabWord()`
6. **Auto-create card on review** — small change to existing endpoint in `known-words.js`

## Scope & Edge Cases

**In scope:** Dialogue rendered via `renderJpSentence` (produces `.jp-word` spans). This covers NPC dialogue, narration, shop lines, and all pre-tokenized frame content.

**Out of scope:** Dialogue rendered via `renderEnFirst` (produces `.bs-word` spans — bootstrap/teaching format). These are a different rendering path and can be addressed in a follow-up.

**Auto-dismiss narrations** (`autoDismiss` option): These self-dismiss via timeout and already hide the `▼` indicator. Word click handlers still apply — if a player taps a word before the auto-dismiss fires, the popup opens and the auto-dismiss should be paused/cancelled. If the popup is closed, the auto-dismiss resumes or the narration dismisses.

**Garbled text** (`garbled` option): Word click handlers should NOT apply to garbled narrations — the text is intentionally unreadable.

**Persistent narrations** (`persistent` option): These stay until `forceHide()` — word clicks work normally, no dismiss behavior needed.

## What We Don't Touch

- The existing `lookup.js` toggle mode and toolbar button — left as-is for later cleanup
- JPDB API integration — untouched
- Bootstrap payload — no changes needed (New/Known derived from existing `knownWords` set)
- No new API endpoints
- No new popup elements
- No new client API functions
