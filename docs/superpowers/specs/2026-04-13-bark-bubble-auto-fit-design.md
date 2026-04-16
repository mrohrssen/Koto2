# Bark Bubble Auto-Fit Design

**Date:** 2026-04-13
**Status:** Approved

## Problem

Creature bark bubbles use a fixed `max-width: min(180px, 45vw)` container. English definitions for unknown/teaching words (`.jp-stack-en`) are absolutely positioned below their parent Japanese word, hanging outside the bubble's background. The bubble doesn't visually contain the full bark display.

## Constraints

- No CSS changes to `.jp-word`, `.jp-unknown`, `.jp-entity`, `.jp-stack-en`, or any token rendering styles — these were carefully tuned to prevent English definitions from bumping Japanese text upward.
- No changes to `renderJpSentence()` or server-side bark selection.
- Bubble-only changes: JS measurement + bubble container CSS.

## Solution

Post-render JS measurement in `showBubble()` (`public/js/ui/speech-bubble.js`).

After appending the bubble to the DOM:

1. Query all `.jp-stack-en` elements inside the bubble.
2. Get the bubble's `getBoundingClientRect()` and each gloss element's rect.
3. Calculate how far glosses extend beyond the bubble's bottom, left, and right edges.
4. Add `paddingBottom` to cover vertical overflow.
5. Add `paddingLeft`/`paddingRight` and override `maxWidth` to cover horizontal overflow.

Base padding values (from CSS): 6px vertical, 10px horizontal. The JS adds overflow deltas on top.

## CSS Change (bubble only)

In `public/game.css`, `.speech-bubble`:

```css
/* Before */
max-width: min(180px, 45vw);

/* After — raise ceiling so JS can grow the bubble */
max-width: min(300px, 75vw);
```

Bubbles without glosses still shrink-wrap naturally. The wider cap only matters when JS detects overflow.

## Files Changed

| File | Change |
|------|--------|
| `public/js/ui/speech-bubble.js` | Add ~15 lines to `showBubble()` after DOM append |
| `public/game.css` | Raise `.speech-bubble` max-width from 180px/45vw to 300px/75vw |

## Edge Cases

- **All-known barks:** No `.jp-stack-en` elements → no adjustment → bubble stays compact.
- **Short definitions that fit:** Overflow deltas are 0 → no change.
- **Multiple glosses (entity + unknown):** Loop measures all, takes max overflow in each direction.
- **Bubble positioning:** Uses `transform: translate(-50%, -100%)` — growing taller pushes the bubble upward, keeping its bottom anchored near the creature sprite. Correct behavior.
