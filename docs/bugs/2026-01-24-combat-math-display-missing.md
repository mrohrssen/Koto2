# Feature: Restore combat math display + chip activation effects

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Priority:** High (core gameplay feedback missing)

## What's Missing

1. **Combat math breakdown** — the old game showed how damage was calculated (base ATK, stat modifiers, chip effects, final damage). This should display in the flash card area while the combat cycle runs.
2. **Chip activation visuals** — each chip should visually activate and show its effect (e.g., "Battery Bot: +5 damage", "Speaker Bot: x1.3!") as the pipeline processes.

## Desired Behavior

- During combat cycle (after vocab card is answered):
  - Replace the flash card area with a combat math breakdown
  - Show each chip firing in sequence with its effect value
  - Show the final damage calculation
- When the next vocab card is ready, replace the math display with the new flash card

## Reference Implementation

The old game (main repo, master branch) had bare-bones combat math display. Check:
- `public/game.js` on master — look for damage calculation display logic
- `src/game/combat.js` — the combat resolution that returns breakdown data
- The API response from `/api/game/attack` likely already includes pipeline/chip data

## Files to Investigate/Modify

- `public/js/ui/combat-loop.js` — combat cycle UI, where to insert math display
- `public/js/ui/actions.js` — handles attack result rendering
- `src/game/combat.js` — verify attack response includes chip pipeline breakdown
- `public/game.css` — styling for math display and chip activation animations
- `public/js/ui/chip-row.js` — chip activation visual feedback (glow, bounce, etc.)
