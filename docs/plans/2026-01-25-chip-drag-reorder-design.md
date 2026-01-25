# Chip Drag-and-Drop Reordering Design

## Overview

Allow players to reorder their equipped chips via drag-and-drop at any time (combat, exploration, hub), except when narration or combat animations are active. Chip order affects gameplay since chips fire in slot order during combat.

## Interaction Model

### States

1. **Idle** - Default. Chips display normally.
2. **Pressing** - Finger down, 400ms timer running. Movement >10px or lift cancels.
3. **Dragging** - Timer complete. Chip lifted, follows finger, other chips preview positions.
4. **Dropping** - Finger lifted. Chip animates to new slot, state persists to backend.

### Gestures

- **Tap** (<400ms, minimal movement): Show chip popup (existing behavior)
- **Long-press** (400ms hold): Initiate drag
- **Drag**: Move chip between slots
- **Release**: Drop chip at current position

### Reorder Behavior

Standard list reorder - chips slide toward the gap left by the dragged chip.

Example: `[A, B, C, D, E]`, drag A to position 3 → `[B, C, A, D, E]`

## Visual Feedback

### On Lift (400ms reached)
- Chip scales 1.0 → 1.15 (150ms ease-out)
- Drop shadow fades in: `0 8px 24px rgba(0,0,0,0.4)`
- Click sound plays (if SFX enabled)
- Original slot shows empty state (dashed border)

### While Dragging
- Chip follows finger, elevated z-index
- Other chips animate (150ms ease-out) to preview drop position

### On Drop
- Chip animates to target slot (150ms ease-out)
- Scale returns to 1.0, shadow fades out
- All chips settle simultaneously

## Blocking Conditions

Dragging blocked when:
- `enemyDialogueActive` is true (narration showing)
- `combatAnimationActive` is true (attack sequence in progress)

If block occurs mid-drag: cancel drag, animate chip back to original position.

## Backend Integration

### New Endpoint

```
POST /api/game/reorder-chips
Body: { chipIds: ["id1", "id2", "id3", "id4", "id5"] }
```

### Flow
1. User completes drag-drop
2. Optimistic update: local cache updated immediately
3. API call in background
4. On failure: revert order, show error toast

### Mid-Combat
Reordering allowed. New order takes effect on next attack.

## Implementation Structure

### New File
`public/js/ui/chip-drag.js`
- `init({ onReorder, isBlocked })` - Initialize with callbacks
- `setEnabled(boolean)` - Global enable/disable

### Modified Files

**`public/js/ui/chip-row.js`**
- Initialize chip-drag module
- Add data attributes for drag system

**`public/game.js`**
- Add `combatAnimationActive` flag
- Pass callbacks to chip-drag
- Handle `onReorder` → API call

**`server.js`**
- Add reorder endpoint

**`src/game/state.js`**
- Add `reorderChips()` function

### Events Used
- `touchstart` / `mousedown` - Start timer
- `touchmove` / `mousemove` - Track/update position
- `touchend` / `mouseup` - Complete drop
- `touchcancel` - Cancel and revert
