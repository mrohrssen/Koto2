# Dialogue Token Display Redesign (B2 — English Below)

**Date:** 2026-04-08
**Status:** Approved
**Mockup:** `~/.gstack/projects/mrohrssen-Koto2/designs/npc-dialogue-tokens-20260408/variant-B2.html`

## Problem

The current `renderJpSentence` output for tokenized NPC dialogue looks like a developer prototype — blue-bordered boxes for unknown words, tiny English text, no visual hierarchy. It needs to look like a proper language learning app inside a JRPG.

## Approved Design: B2 "Floating Label — English Below"

Inspired by miHoYo / Genshin Impact UI. Natural sentence flow with clean typography. Teaching words get an amber underline glow with English meaning below. Entity words (items, creatures) get a blue accent. Known words are clean text with dim romaji above. All Japanese text stays on one baseline.

### Visual Treatment Per Word Type

| Type | Romaji color | JP Text color | English Below color | Underline |
|------|-------------|--------------|--------------------| --------- |
| Known | dim gray | slightly muted | transparent (height reserved) | none |
| Unknown (teaching) | amber | dark | amber/gold | amber glow |
| Entity | blue | blue | blue | blue glow |
| Particle/Punct | (empty) | dim gray | transparent (height reserved) | none |

**Font size and weight are uniform per row** — romaji is always 8px/400, JP text is always clamp(15-17px)/500, English is always 9.5px/500. Only color changes by word type.

### HTML Structure (new function output)

Every word gets a consistent 3-row flex column:

```html
<!-- Known word -->
<span class="jp-dlg jp-dlg-known">
  <span class="jp-dlg-romaji">kudasai</span>
  <span class="jp-dlg-text">ください</span>
  <span class="jp-dlg-en"></span>
</span>

<!-- Unknown/teaching word -->
<span class="jp-dlg jp-dlg-unknown">
  <span class="jp-dlg-romaji">yukkuri</span>
  <span class="jp-dlg-text">ゆっくり</span>
  <span class="jp-dlg-en">slowly</span>
</span>

<!-- Entity word (item/creature name) -->
<span class="jp-dlg jp-dlg-entity">
  <span class="jp-dlg-romaji">yakusou</span>
  <span class="jp-dlg-text">やくそう</span>
  <span class="jp-dlg-en">Medicinal Herb</span>
</span>

<!-- Punctuation/particle -->
<span class="jp-dlg jp-dlg-punct">
  <span class="jp-dlg-romaji"></span>
  <span class="jp-dlg-text">、</span>
  <span class="jp-dlg-en"></span>
</span>
```

Uses `jp-dlg-*` prefix to avoid collision with existing `jp-word`/`jp-unknown` classes.

## Approach

### New function: `renderJpSentenceDialogue`

Add to `bootstrap-client.js` alongside existing `renderJpSentence`. Same signature:

```js
export function renderJpSentenceDialogue(tokens, knownWords, wordDict, overrides = {}, useKanji = false)
```

Logic is identical to `renderJpSentence` for token classification (known/unknown/entity/punct). Only the HTML output differs — uses the 3-row flex column structure above.

Entity detection: `token.entity === true` (already set by `entityToToken()` on the server).

### CSS: B2 styling scoped to `.narration-text`

New CSS block in `game.css` using `.narration-text .jp-dlg-*` selectors. Adapted for the existing **light** narration box theme (not the dark panel from the mockup):

- Known romaji: `color: rgba(47,58,69,0.35)` (muted against light bg)
- Teaching word text: `font-weight: 600; color: #2f3a45`
- Teaching word underline: amber gradient `rgba(200,160,60,0.5)`
- Teaching english: `color: rgba(180,140,50,0.8)`
- Entity text: `color: var(--accent-blue)`
- Consistent height slots: romaji row 12px, en-below row 16px

### Callers to update

Switch from `renderJpSentence` to `renderJpSentenceDialogue`:

1. **`exploration.js:1209`** — NPC greeting tokens
2. **`exploration.js:1228`** — item name tokens on shop cards
3. **`exploration.js:1241`** — item purchase dialogue tokens
4. **`exploration.js:1246`** — shop dialogue tokens
5. **`dialogue-display.js:32`** — DM/AI dialogue lines

### What stays the same

- `renderJpSentence` — completely untouched
- Speech bubbles (`speech-bubble.js`) — keep `renderJpSentence`
- Room transitions (`room-transition.js`) — keep `renderJpSentence`
- Combat barks (`game.js`) — keep `renderJpSentence`
- Narration box panel styling — untouched (light glass theme)
- Server-side code — untouched
- Token data format — untouched

## Files Changed

| File | Change |
|------|--------|
| `public/js/ui/bootstrap-client.js` | Add `renderJpSentenceDialogue()`, export it |
| `public/game.css` | Add `.narration-text .jp-dlg-*` style block |
| `public/js/ui/exploration.js` | Import + use `renderJpSentenceDialogue` for NPC dialogue |
| `public/js/ui/dialogue-display.js` | Import + use `renderJpSentenceDialogue` |

## Testing

- Syntax check: `node --check public/js/ui/bootstrap-client.js`
- Existing unit tests for `renderJpSentence` must still pass (function unchanged)
- Visual verification: Playwright screenshot of NPC shop dialogue with the most complex greeting (`greet_welcome_browse`: 4 content words)
- Verify speech bubbles still render correctly (unchanged path)
