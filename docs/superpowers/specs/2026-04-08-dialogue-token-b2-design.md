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

### Modify `renderJpSentence` in-place

Rewrite the HTML output of `renderJpSentence` in `bootstrap-client.js`. Same function, same signature, same callers. No new function needed.

Token classification logic (known/unknown/entity/punct) stays identical. Only the HTML output changes — drops `<ruby>` tags, uses 3-row flex column structure with `jp-dlg-*` classes.

Entity detection: `token.entity === true` (already set by `entityToToken()` on the server).

### CSS: Base `jp-dlg-*` styles (no scoping)

Replace old `jp-word`/`jp-unknown` CSS block in `game.css` with `jp-dlg-*` base styles. No scoping to `.narration-text` — same styles apply everywhere (narration, speech bubbles, item cards). Future context-specific overrides can be added later.

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
| `public/game.css` | Replace `jp-word`/`jp-unknown` CSS with `jp-dlg-*` base styles |
| `tests/unit/sentence-renderer.test.js` | Update assertions for new HTML structure |

## Testing

- Syntax check: `node --check public/js/ui/bootstrap-client.js`
- Existing unit tests for `renderJpSentence` must still pass (function unchanged)
- Visual verification: Playwright screenshot of NPC shop dialogue with the most complex greeting (`greet_welcome_browse`: 4 content words)
- Verify speech bubbles still render correctly (unchanged path)
