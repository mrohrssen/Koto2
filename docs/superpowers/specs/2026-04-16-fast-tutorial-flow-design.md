# Fast Tutorial Flow Design

**Date:** 2026-04-16
**Status:** Approved

## Problem

New players go through 6 steps before gameplay: New Game button → 13 Cid dialogue lines → starter selection (3 choices) → hub → area selection → team selection → skill master. Too many screens before action.

## Solution

After the prologue dialogue, auto-start the player into Starting Meadow with the fire creature. Skip hub, area selection, and team selection entirely for the first run.

### New Player Flow

1. Account registration auto-creates character (existing behavior)
2. Prologue plays — 12 existing Cid lines + 2 new closing lines (replacing starter selection choice)
3. After prologue ends, frontend chains API calls to auto-start first run
4. Player lands at skill master room in Starting Meadow with fire creature

### Prologue Changes

Replace the `prologue-starter-selection` entry in `data/prologue.json` with:

```json
{
  "id": "prologue-starter-gift",
  "speaker": "Cid",
  "narration": "Every adventurer needs a companion. Here, take this Fire creature."
},
{
  "id": "prologue-lets-go",
  "speaker": "Cid",
  "narration": "Now let's head to the Starting Meadow for your first exploration!"
}
```

### Frontend Auto-Start Chain

After prologue dialogue loop ends in `playPrologue()` (`public/game.js`):

1. `POST /select-starter` with `{ starterId: 'starter-fire' }`
2. `POST /prologue-complete`
3. `POST /start-run` (bare, no creatures)
4. `POST /select-area` with `{ areaId: 'hajimari-no-hiroba' }`
5. `POST /confirm-creatures` with `{ starterIds: ['hi'] }`
6. Update game state from response → UI renders skill master

### Remove New Game Button

Delete the button rendering in the `no_save` case of `updateGameContent()`. The auto-`createCharacter()` at init already handles fresh registrations. The button is dead code in the normal flow.

### Edge Cases

- **Reset Prologue (settings):** Only auto-start into Starting Meadow if this is the player's first run ever (no run history). If replaying the prologue for fun, mark complete and return to hub.
- **Reset Tutorial (settings):** No changes needed — works independently of prologue.
- **Hub / area selection / team selection:** Unchanged for run 2+.

### No Server Changes

All existing API endpoints are reused. The only data change is `prologue.json`. The frontend chains the same calls the player would have made manually.
