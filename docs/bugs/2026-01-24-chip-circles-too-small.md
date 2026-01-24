# Bug: Chip circles too small, should fill 80% of screen width

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Low (cosmetic/UX polish)

## Symptoms

- The equipped chip circles (shown during gameplay) are too small
- They should collectively fill about 80% of the viewport width

## Fix

Increase the chip circle container width to `80vw` or `80%` of parent, and scale individual circle sizes accordingly. With 5 chip slots at 80% width, each circle should be roughly `calc(80vw / 5 - gap)`.

## Files to Modify

- `public/game.css` — chip row container width + individual chip circle size
- `public/js/ui/chip-row.js` — check if sizes are set inline or via classes
