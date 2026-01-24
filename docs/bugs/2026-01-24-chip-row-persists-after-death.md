# Bug: Chip row still shows equipped chips after death (chips are lost)

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Medium (misleading state display)

## Symptoms

- Player dies (game over)
- Chip row still shows the previously equipped chips
- In reality, the run has ended and chips are lost

## Expected Behavior

- On death/game-over, chip row should clear (show empty slots)
- Or hide the chip row entirely until a new run starts

## Fix

When the game-over state is triggered, clear/re-render the chip row. Either:
- Call chip-row clear/reset function when showing game-over modal
- Re-render chip row from game state after `loadGameState()` is called (state should show no equipped chips outside a run)

## Files to Investigate

- `public/game.js` — `showGameOverModal()` function, needs to trigger chip-row reset
- `public/js/ui/chip-row.js` — needs a `clear()` or `reset()` method, or re-render from empty state
- `public/js/ui/combat-loop.js` — if death is detected here, should also trigger cleanup
