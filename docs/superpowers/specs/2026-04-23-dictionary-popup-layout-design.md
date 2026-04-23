# Dictionary Popup Headword Layout

## Problem

The dictionary lookup popup renders its headword as `"hiraganaromaji hiragana"` — a concatenated mash. The click handler does `dom.word.textContent = span.textContent` on a `.jp-word` that wraps `<ruby>hiragana<rt>romaji</rt></ruby>`; `textContent` flattens the ruby into `"hiraganaromaji"`, then `.lookup-popup-reading` appends the hiragana next to it.

This violates Koto's universal JP typography rule: the pronunciation aid always renders above the main word, not alongside it.

## Goal

Replace the popup's two-span header with a single ruby element that follows the pronunciation-above-headword rule, sourced from the clicked span's `data-base` + `data-reading` (no new data attributes, no reliance on `span.textContent`).

## Rendering rules

The popup reads the player's `useKanji` flag from game state and renders the headword via a shared helper:

Rules are checked in order; first match wins.

| # | Condition | Headword |
|---|---|---|
| 1 | `reading` is empty | bare `{base}` (no ruby) |
| 2 | `useKanji === false` (beginner mode) | `<ruby>{reading}<rt>{toRomaji(reading)}</rt></ruby>` |
| 3 | `base === reading` (kanji mode, kana-only word) | bare `{reading}` (no ruby) |
| 4 | otherwise (kanji mode, kanji word) | `<ruby>{base}<rt>{reading}</rt></ruby>` |

A kanji-mode player has graduated past romaji; bare hiragana is correct for kana-only words in that mode.

`lookup.js`'s non-dialogue entry point passes `result.spelling` as `base` and `result.reading` as `reading` — same helper, same rules.

## Components changed

### `public/js/ui/romaji.js` (or a sibling module)

Add `buildHeadwordRuby(base, reading, useKanji) → string` returning the HTML per the rules above. Uses `toRomaji` from this module. Escapes its inputs.

### `public/js/ui/dialogue-word-lookup.js`

In `handleWordClick`, replace:

```js
dom.word.textContent = span.textContent;
dom.reading.textContent = reading !== span.textContent ? reading : '';
```

with:

```js
dom.word.innerHTML = buildHeadwordRuby(span.dataset.base, span.dataset.reading, useKanji);
```

Remove the `dom.reading` assignment entirely. Remove `dom.reading` from the module's dom cache (`dom.reading = document.getElementById('lookup-popup-reading')`).

### `public/js/ui/lookup.js`

This path renders its own spans without ruby (line 318: `<span class="lookup-word" data-word="...">{plain text}</span>`), so `span.textContent` is safe. The reading isn't known until the API responds.

Two writes change:

- Loading flash (line 357–358): drop the `dom.lookupPopupReading` assignment; keep `dom.lookupPopupWord.textContent = span.textContent` (a plain word is fine during the loading flicker).
- `populatePopup` (line 378–380): replace with

  ```js
  dom.lookupPopupWord.innerHTML = buildHeadwordRuby(
    result.spelling || fallbackText,
    result.reading || '',
    useKanji
  );
  ```

  When `result.reading` is empty, `buildHeadwordRuby` collapses to the bare-text case — correct for words with no separate reading.

### `public/index.html`

Remove the `<span class="lookup-popup-reading">`:

```html
<!-- before -->
<div>
  <span class="lookup-popup-word" id="lookup-popup-word"></span>
  <span class="lookup-popup-reading" id="lookup-popup-reading"></span>
</div>

<!-- after -->
<div>
  <span class="lookup-popup-word" id="lookup-popup-word"></span>
</div>
```

### `public/js/dom.js`

Remove the `lookupPopupReading` getter.

### `public/game.css`

Remove the `.lookup-popup-reading` rule. Restyle `.lookup-popup-word` so the contained `<ruby>` renders the base at 20px/bold and the `<rt>` at ~12px/secondary color. Ruby-base and `<rt>` both inherit left alignment from the header.

## useKanji source

Read the player's current mode via the established game-state accessor (to be confirmed while implementing; this project already has a single source of truth for the flag used by `renderJpSentence`). Not a design decision — a one-line lookup.

## Out of scope

- `.jp-word` rendering in dialogue, bootstrap client, combat cards (already follows the rule).
- POS line, meanings list, state dot, action buttons in the popup.
- Any change to `renderJpSentence` or its inputs.

## Verification

- Beginner mode, pure-hiragana word (e.g. click "たべる" in Area 1): popup shows `taberu` small on top, `たべる` large below. No duplicate text, no concatenation artifact.
- Kanji mode, kanji word (e.g. click "食べる" in Area 4+): popup shows `たべる` small on top, `食べる` large below.
- Kanji mode, kana-only word (e.g. click "かわいい"): popup shows `かわいい` large, nothing above.
- Non-dialogue lookup path (triggered from `lookup.js`) in both modes: same output as dialogue path.
- Manual Playwright check at each case, screenshot for the dialogue path in both modes.
