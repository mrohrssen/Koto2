# Bug: Chip equip modal has tight spacing between chip selectors

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Low (cosmetic/UX polish)

## Symptoms

- In the chip equip modal, chip selector items are too close together vertically
- Makes it hard to tap the correct chip on mobile

## Fix

Add vertical padding/margin to each chip selector item. Something like `margin: 8px 0` or `padding: 8px 0` on each chip row element.

## Files to Modify

- `public/game.css` — find the chip selector/list item styles (likely `.chip-slot` or similar class used in the equip modal)
- `public/js/ui/chip-row.js` — check what classes/elements are used for chip items in the modal
