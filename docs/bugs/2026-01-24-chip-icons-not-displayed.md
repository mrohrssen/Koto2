# Bug: Chip icons not displayed in chip circles or chip shop

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Medium (visual issue, gameplay unaffected)

## Symptoms

- Equipped chip circles don't show the chip's icon image
- Chip shop doesn't display chip icons either
- The icon PNG files exist at `public/assets/icons/chips/<chipId>.png` (verified during integration)

## Likely Cause

The mobile-ui frontend renders chips as circles but doesn't reference the icon images. The chip-row and economy UI modules may use text/emoji or colored circles instead of loading the actual PNG icons from `/assets/icons/chips/`.

## Files to Investigate

- `public/js/ui/chip-row.js` — renders equipped chip circles
- `public/js/ui/economy.js` — renders chip shop items
- `public/game.css` — chip circle styling (may need `background-image` support)
- `data/chips.json` — check if icon path is specified per chip or derived from `id`
