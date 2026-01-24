# Bug: Chip circles don't refresh immediately after purchase/auto-equip

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Medium (confusing UX — user doesn't know chip was equipped)

## Symptoms

- Buy a chip from the shop → chip is auto-equipped on the backend
- The chip circles on screen don't update to show the newly equipped chip
- Only updates when entering the next fight

## Expected Behavior

- As soon as a chip is purchased and auto-equipped, the chip circles should immediately reflect the new chip (show its icon/color in the row)

## Fix

After the chip purchase API call succeeds, re-render the chip row. Either:
- Call the chip-row render function after a successful purchase
- Have the purchase response include the updated equipped chips array and pass it to chip-row

## Files to Investigate

- `public/js/ui/economy.js` — chip shop purchase handler (needs to trigger chip-row refresh after buy)
- `public/js/ui/chip-row.js` — the render function to call (e.g., `renderChipRow()` or `updateChips()`)
- API response from chip purchase — check if it returns updated equip state
