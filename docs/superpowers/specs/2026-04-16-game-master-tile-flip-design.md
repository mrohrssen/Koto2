# Game Master Tile Tap → Flip

**Date:** 2026-04-16
**Status:** Approved

## Problem

In the Game Master mini-game (whack-a-mole), after tapping a tile (correct or incorrect), the tile stays face-up. The board stagnates — tiles just sit there after being tapped, and the game can re-select tapped creatures as the next target word since they're still visible.

## Solution

After tapping a tile, stamp a checkmark (correct) or X (incorrect) icon and immediately flip the tile face-down. The tile becomes immediately eligible for the flip scheduler to bring back with a new creature.

## Current Behavior

1. Player taps a correct tile → +1 float-up, scale+rotate animation, tile stays face-up
2. Player taps an incorrect tile → shake animation, -3s penalty, tile stays face-up
3. Tile remains visible and can become the next target word

## New Behavior

1. Player taps a correct tile → checkmark icon scales in (0→1, ~150ms), tile flips face-down simultaneously, +1 floats up, `correct` SFX, advance to next word
2. Player taps an incorrect tile → X icon scales in (0→1, ~150ms), tile flips face-down simultaneously, `wrong` SFX, -3s penalty
3. Tile is immediately face-down and eligible for the flip scheduler to reuse with a new creature

## Animation Details

- Icons (green ✓, red ✗) are CSS pseudo-elements or lightweight DOM overlays — no image assets
- Icon fades out (opacity 1→0) as the tile flips, ~150-200ms total
- No pause or hold — icon appearance and tile flip are one simultaneous motion
- The +1 float-up on correct hits is preserved (fires as tile flips)
- The shake on incorrect hits plays during the flip-down

## Board Mechanics

- `_advanceToNextWord()` picks from remaining face-up tiles — works naturally since the tapped tile is now down
- `_ensureCorrectTileVisible()` still guarantees the correct answer is always on the board after advancing
- Flip scheduler (1-2s random interval) continues unchanged — the newly-downed tile is immediately eligible to be flipped back up with a new creature
- Board target density (4-5 face-up) maintained organically by existing scheduler bias logic

## What Doesn't Change

- Score/timer HUD layout
- Time penalty on incorrect (-3s)
- Flip scheduler timing (1-2s random)
- Board density targeting (4-5 face-up)
- Word timer per target (5s)
- End game / results screen
- Pool selection / server integration

## Files to Modify

| File | Change |
|------|--------|
| `public/js/ui/whack-a-mole.js` | `_handleTileTap()`: add icon overlay, call `_setTileFaceDown()` after animation; remove old stay-face-up animations |
| `public/game.css` | Add `.wam-result-icon` styles for checkmark/X overlay with scale-in + fade-out |
