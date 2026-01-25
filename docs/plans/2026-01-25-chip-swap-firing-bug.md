# Chip Swap Firing Bug

**Branch:** `feature/chip-drag-reorder`
**Status:** Bug discovered during manual testing

## Problem

After swapping two chips, the visual positions swap correctly but the **wrong chip fires** in combat.

### Example
- Eraser bot in slot 0, Feather bot in slot 1
- User swaps them via the new click-to-swap UI
- Visually: Feather bot now appears in slot 0, Eraser bot in slot 1
- In combat: When slot 0 fires, it still uses Feather bot's behavior (the OLD occupant)

## What Works

- Visual swap updates correctly (chips appear in new positions)
- E2E tests pass (API reports correct order after swap)
- The `/api/game/reorder-chips` endpoint returns success

## What's Broken

- Combat firing logic uses stale chip data
- The chip that actually fires doesn't match the visual position

## Relevant Code Paths

### Frontend (swap initiation)
1. `public/js/ui/chip-row.js` - `completeSwap()` reads chip IDs from DOM, calls `onReorder(chipIds)`
2. `public/game.js` - `handleChipReorder()` does optimistic update to `chipLoadoutCache`, then calls backend

### Backend (persistence)
3. `src/game/items/chips.js` - `reorderChips()` updates the player's equipped chips

### Combat (firing)
4. Where does combat logic read which chip is in which slot?
5. Is it reading from `chipLoadoutCache`? From `gameState`? From the backend directly?

## Questions to Answer

1. Where does the combat firing logic get chip data from?
2. Is there a separate cache that isn't being updated?
3. Is the optimistic update in `handleChipReorder()` correct?
4. Does the backend actually persist the new order?
5. After page refresh, does the swap persist and fire correctly?

## Test to Try

1. Swap two chips
2. Refresh the page
3. Check if the visual order persists
4. Go into combat and see if the correct chip fires now

This will tell us if it's a frontend cache issue or a backend persistence issue.
