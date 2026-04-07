# Tokenized Shop Dialogue Design

**Date:** 2026-04-07
**Scope:** Wire the tokenizer → renderer → exposure pipeline for the single shop phrase `{item.word}、ください`. Apply learnings to other content later.

## Problem

The friendly NPC shop dialogue where the player says `{item.word}、ください` is a plain text string. No tokenization, no known/unknown word styling, no romaji, no exposure logging. The building blocks exist (SudachiPy tokenizer, `renderJpSentence`, `exposeWords`) but they aren't connected for this content.

## Existing state

- `POST /friendly-npc-offers` (`src/routes/game/run.js:616`) generates offers and already exposes item words as `{word, meaning}` objects (line 628-633).
- `POST /friendly-npc-choose` (`src/routes/game/run.js:642`) applies the chosen item and has a hardcoded `exposeWords([{ word: 'ください', meaning: 'please (when requesting)' }])` (line 679).
- The client constructs and displays the phrase as plain text at `public/js/ui/exploration.js:1224`.

## Design

Three changes wire the existing pieces together.

### 1. Renderer: Add romaji to `renderJpSentence`

`renderJpSentence` in `public/js/ui/bootstrap-client.js` currently renders known words as bare inline text. Change it so every non-punctuation token gets a `<ruby>` romaji annotation:

- **Known word:** `<ruby>hiragana-or-kanji<rt>romaji</rt></ruby>` — no English
- **Unknown word:** same ruby + `<span class="jp-stack-en">English</span>` underneath
- **Punctuation:** as-is (no change)

Display text follows the existing `useKanji` flag:
- `useKanji = false` (Areas 1-3): `display = reading` (hiragana)
- `useKanji = true` (Area 4+): `display = surface` (kanji)

Romaji is always derived from `reading` via `toRomaji()`.

**Note:** This changes all existing `renderJpSentence` call sites (room transitions, speech bubbles, dialogue display). Known words that previously rendered as compact inline text will now show romaji above. This is the intended behavior — romaji reinforcement on every word shown.

### 2. Server tokenization: Tokenize at offer time

In the `POST /friendly-npc-offers` handler (`src/routes/game/run.js:616`), after rolling offers, tokenize each item's shop phrase:

1. Construct the phrase string: `${item.word}、ください`
2. Call `tokenize(phrase)` — real SudachiPy, one batch call for all offered items
3. Attach to each offered item:
   - `shopTokens`: the token array from the tokenizer
   - `shopOverrides`: `{ [item.word]: item.nameEn }` — so the item's game name (e.g., "Apple") takes precedence over the JMdict dictionary definition (e.g., "apple (fruit)") for that word only
4. Also compute `shopContentWords`: token `baseForm` values paired with English meanings as `{word, meaning}` objects, punctuation POS filtered out (reuse existing `PUNCT_POS` set: 記号, 補助記号, 空白). For the item word, meaning comes from `item.nameEn`. For other words (e.g., ください), meaning comes from the server-side word dictionary.

`ください` and other non-item words get their English from the word dictionary on the client for rendering. The `{word, meaning}` format in `shopContentWords` is for exposure logging only, so SRS cards have proper definitions when created.

### 3. Exposure logging: Replace hardcoded exposure with tokenized content words

In the `POST /friendly-npc-choose` handler (`src/routes/game/run.js:642`), replace the hardcoded `exposeWords([{ word: 'ください', meaning: 'please (when requesting)' }])` at line 679:

1. Read `shopContentWords` from the chosen item (computed at offer time in step 2)
2. Call `req.gameManager.exposeWords(shopContentWords)`

This replaces the existing hardcoded ください-only exposure. The item word exposure at offer time (lines 628-633) remains — that fires when the player sees the item cards. The phrase exposure fires when the player speaks the phrase.

### Client wiring

`public/js/ui/exploration.js` needs new imports and a replacement for the plain-text narration at line 1224.

**New imports:** `renderJpSentence`, `getKnownWords` from `bootstrap-client.js`. Access `wordDict` via `new Map(Object.entries(window.gameState?.wordDictionary || {}))` (same pattern used in `room-transition.js:68` and `speech-bubble.js:71`).

**Before:**
```js
await sceneModule.showNarration(`${item.word}、ください`, { speaker: 'You' });
```

**After:**
```js
const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
const html = renderJpSentence(item.shopTokens, getKnownWords(), wordDict, item.shopOverrides, useKanji);
await sceneModule.showNarration(html, { html: true, speaker: 'You' });
```

## Visual result

For `りんご、ください` where りんご is known and ください is unknown (after the Section 1 romaji change):

```
  ringo             kudasai
  りんご     、     ください
                     please
```

Both words get romaji above. Only ください (unknown) gets English below in a blue-bordered stack. Punctuation renders inline.

## Architecture rationale

- **No runtime tokenization endpoint needed.** Tokenization happens at offer-roll time, not per-request. The Python subprocess runs once when the NPC room generates offers.
- **No client-side token construction.** Tokens always come from the real tokenizer. No fake POS tags or hardcoded structures.
- **Single pipe for rendering and exposure.** Tokenizer output serves both: client renders the tokens, server extracts content words for exposure logging.
- **Overrides are scoped and intentional.** Only the item word gets an override (game name vs dictionary definition). Grammar words like ください use the word dictionary.
- **Meanings preserved in exposure.** `shopContentWords` uses `{word, meaning}` objects (not bare strings) so SRS cards created at the 5-exposure threshold have proper English definitions.

## Files to modify

| File | Change |
|------|--------|
| `public/js/ui/bootstrap-client.js` | Add `<ruby>` romaji to all words in `renderJpSentence` |
| `public/js/ui/exploration.js` | Import `renderJpSentence`/`getKnownWords`, replace plain-text narration with tokenized render |
| `src/routes/game/run.js` | In `/friendly-npc-offers`: tokenize phrases, attach tokens + overrides + content words to each item |
| `src/routes/game/run.js` | In `/friendly-npc-choose`: replace hardcoded ください exposure with `shopContentWords` from the chosen item |

## Out of scope

- NPC greeting tokenization (same pattern, separate PR)
- AI-generated content pipeline (tokenize at cache time — same `tokenize()` call)
- Fixing items.json `baseWord` vs `word` field mismatch in word-dictionary overlay
- Combat barks / CID scripts (already pre-tokenized)
