# Chip Swap Mode Design

**Branch:** `feature/chip-drag-reorder`
**Status:** Design complete, ready for implementation
**Replaces:** Drag-and-drop reordering system (broken)

## Problem

The current drag-and-drop chip reordering system is buggy and complex:
- 361 lines of code handling long-press detection, touch/mouse events, cloned elements, placeholder animations
- State corruption when drag fails mid-operation
- Hard to test, hard to debug, prone to breaking

## Solution

Replace drag-and-drop with a simple click-to-swap interaction:
1. Tap chip → popup shows "Swap" button
2. Tap "Swap" → popup closes, other chips glow
3. Tap another chip → swap complete

## Interaction Flow

### Entering Swap Mode
1. Player taps a chip → existing popup appears
2. Popup shows "Swap" button (alongside "Use Skill" in combat)
3. Player taps "Swap" → popup closes → other 4 chips display a subtle glow/pulse
4. Source chip remains normal (no special styling)

### Completing the Swap
- Player taps any other chip → positions swap instantly → glow removed
- Sound effect plays on successful swap

### Cancelling
- Tap anywhere outside the chip row → swap mode exits, no change
- Tap the original chip again → swap mode exits, no change

### Blocking
- "Swap" button disabled when `isBlocked()` returns true (combat animations active)
- If combat animation starts while in swap mode, exit swap mode automatically

## Cleanup Scope

### Delete Entirely
- `public/js/ui/chip-drag.js` (361 lines)

### Remove from `public/js/ui/chip-row.js`
- Line 10: `import * as chipDrag from './chip-drag.js';`
- Lines 20-24: `chipDrag.init({...})` call
- Line 96: `chipDrag.attach(row);`

### Remove from `public/game.css` (lines 330-345)
```css
/* Chip drag states */
.chip-dragging { ... }
.chip-slot-source .chip-icon { ... }
.chip-slot-source .chip-charge-bar,
.chip-slot-source .chip-level-badge { ... }
```

### Rename in `public/game.js`
- `isChipDragBlocked()` → `isChipActionBlocked()`

### Keep in `public/game.js`
- `getChipIds()` - still needed
- `handleChipReorder()` - API call logic unchanged

## New Implementation

### State in `chip-row.js`
```javascript
let swapModeSourceIndex = -1; // -1 = not in swap mode
```

### Popup Changes
- Add "Swap" button below "Use Skill" button
- Visible when chip exists
- Disabled when `isBlocked()` returns true
- Click handler: close popup, set `swapModeSourceIndex`, apply glow to other chips

### Event Handling
- In swap mode + tap another chip: call `onReorder` with swapped positions, exit swap mode
- In swap mode + tap source chip: exit swap mode (cancel)
- In swap mode + tap outside chips: exit swap mode (cancel)
- Extend existing outside-click handler to also exit swap mode

### Auto-cancel on Block
- When entering swap mode, set up interval check
- If `isBlocked()` becomes true, exit swap mode automatically
- Clear interval when swap completes or cancels

## CSS Additions

```css
/* Swap mode - highlight selectable chips */
.chip-slot.swap-target .chip-icon {
  animation: swap-glow 1s ease-in-out infinite;
}

@keyframes swap-glow {
  0%, 100% { box-shadow: 0 0 8px 2px var(--accent-cyan); }
  50% { box-shadow: 0 0 16px 4px var(--accent-cyan); }
}

/* Swap button in popup */
.chip-popup-swap {
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  border: 1px solid var(--accent-cyan);
  background: transparent;
  color: var(--accent-cyan);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.chip-popup-swap:disabled {
  border-color: var(--text-secondary);
  color: var(--text-secondary);
  cursor: not-allowed;
}
```

## DOM Changes

Add to `public/game.html` (in chip-popup):
```html
<button class="chip-popup-swap">Swap</button>
```

Add to `public/js/dom.js`:
```javascript
chipPopupSwap: document.querySelector('.chip-popup-swap'),
```

## Test Updates

Rewrite `tests/e2e/specs/chip-reorder.spec.ts`:
- Test: Tap chip, tap Swap, tap another chip → order changes
- Test: Tap chip, tap Swap, tap outside → no change
- Test: Tap chip, tap Swap, tap same chip → no change
- Test: Swap button disabled during combat animation
- Keep existing API endpoint tests

## Benefits

- ~50 lines of code vs 361 lines
- No touch/mouse event complexity
- No cloned elements or placeholder animations
- No global document event listeners
- Easy to test with simple click actions
- Clear visual feedback via CSS animation
- Impossible to get stuck in corrupted state
