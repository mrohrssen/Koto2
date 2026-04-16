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
<span class="jp-word jp-known">
  <span class="jp-romaji">kudasai</span>
  <span class="jp-text">ください</span>
  <span class="jp-en"></span>
</span>

<!-- Unknown/teaching word -->
<span class="jp-word jp-unknown">
  <span class="jp-romaji">yukkuri</span>
  <span class="jp-text">ゆっくり</span>
  <span class="jp-en">slowly</span>
</span>

<!-- Entity word (item/creature name) -->
<span class="jp-word jp-entity">
  <span class="jp-romaji">yakusou</span>
  <span class="jp-text">やくそう</span>
  <span class="jp-en">Medicinal Herb</span>
</span>

<!-- Punctuation/particle -->
<span class="jp-word jp-punct">
  <span class="jp-romaji"></span>
  <span class="jp-text">、</span>
  <span class="jp-en"></span>
</span>
```

Reuses existing parent classes (`jp-word`, `jp-known`, `jp-unknown`, `jp-punct`), adds `jp-entity`. Child spans (`jp-romaji`, `jp-text`, `jp-en`) replace `<ruby>` and `jp-stack-en`.

## Approach

### Modify `renderJpSentence` in-place

Rewrite the HTML output of `renderJpSentence` in `bootstrap-client.js`. Same function, same signature, same callers. No new function needed.

Token classification logic (known/unknown/entity/punct) stays identical. Only the HTML output changes — drops `<ruby>` tags, uses 3-row flex column structure with existing class names + new child spans.

Entity detection: `token.entity === true` (already set by `entityToToken()` on the server).

### CSS: Rewrite existing class styles (no scoping)

Rewrite the `jp-word`/`jp-unknown`/`jp-punct` CSS block in `game.css` for the new 3-row structure. Same class names, new layout. Add `jp-entity`, `jp-romaji`, `jp-text`, `jp-en`. No scoping — same styles apply everywhere. Future context-specific overrides can be added later.

- Uniform font-size/weight per row, only color varies by word type
- Consistent height slots: romaji row 12px, en-below row 16px
- Unknown words: amber color accent + underline glow
- Entity words: blue color accent + underline glow

### No caller changes

All existing callers of `renderJpSentence` get the new output automatically:
- `exploration.js` — NPC greeting, item names, purchase dialogue
- `dialogue-display.js` — DM/AI dialogue lines
- `speech-bubble.js` — creature barks
- `room-transition.js` — room transition narration
- `game.js` — combat barks

### What stays the same

- Function signature — identical
- Token data format — untouched
- Server-side code — untouched
- Narration box panel styling — untouched (light glass theme)
- All callers — untouched (no import changes needed)

## Files Changed

| File | Change |
|------|--------|
| `public/js/ui/bootstrap-client.js` | Rewrite `renderJpSentence` HTML output (same function, new structure) |
| `public/game.css` | Rewrite `jp-word`/`jp-unknown`/`jp-punct` CSS for new structure |
| `tests/unit/sentence-renderer.test.js` | Update assertions for new HTML structure |

## Testing

- Syntax check: `node --check public/js/ui/bootstrap-client.js`
- Existing unit tests for `renderJpSentence` must still pass (function unchanged)
- Visual verification: Playwright screenshot of NPC shop dialogue with the most complex greeting (`greet_welcome_browse`: 4 content words)
- Verify speech bubbles still render correctly (unchanged path)
