# Chip Drag-and-Drop Bugs

**Branch:** `feature/chip-drag-reorder`
**Status:** RESOLVED - Replaced with click-to-swap system

## Resolution

The drag-and-drop system was replaced with a simpler click-to-swap interaction.
See `docs/plans/2026-01-25-chip-swap-design.md` for the new design.

---

## Original Issues (Historical)

### Observed Issues

### Bug 1: Drag behavior is broken
- Unable to successfully drag chips to reorder them
- Behavior described as "quite strange"

### Bug 2: Chips get stuck in invalid state
- After attempting drag, chips became stuck
- Screenshot shows: first 2 chips visible (Onigiri Bot, pink bot), remaining 3 slots showing as empty (dashed circles)
- This appears to be a visual/state corruption issue

## Likely Causes to Investigate

1. **Event handler conflicts** - The long-press detection may be conflicting with existing tap-to-show-popup behavior

2. **State not updating correctly** - The `handleChipReorder` optimistic update may be corrupting `chipLoadoutCache`

3. **Cleanup not running** - The `cleanup()` function may not be restoring chip visibility (`opacity: ''`) properly

4. **Touch event issues on mobile** - May need to test touch vs mouse event handling

## Files to Debug

- `public/js/ui/chip-drag.js` - Core drag logic
- `public/js/ui/chip-row.js` - Integration point
- `public/game.js` - `handleChipReorder()` function

## Next Steps

1. Add console.log statements to trace drag lifecycle
2. Test on desktop with mouse first (easier to debug)
3. Check if the stuck state persists after page refresh
4. Verify `cleanup()` is being called and resetting all styles
