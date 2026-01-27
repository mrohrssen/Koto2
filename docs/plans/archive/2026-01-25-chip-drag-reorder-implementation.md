# Chip Drag-and-Drop Reorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable long-press drag-and-drop reordering of equipped chips with visual feedback and backend persistence.

**Architecture:** New `chip-drag.js` module handles all touch/mouse events, manages drag state, and coordinates with `chip-row.js` for rendering. Backend gets a new `/api/game/reorder-chips` endpoint that updates `player.equipment.weapon.equippedChips` array order.

**Tech Stack:** Vanilla JS touch/mouse events, CSS transforms for animations, Express.js endpoint

---

### Task 1: Add `chip-lift` SFX to Audio System

**Files:**
- Modify: `public/js/audio.js:11-16`

**Step 1: Add chip-lift to SFX_FILES array**

In `public/js/audio.js`, add `'chip-lift'` to the SFX_FILES array:

```javascript
const SFX_FILES = [
  'attack', 'player-hit', 'enemy-defeat', 'heal',
  'swipe-right', 'swipe-left', 'chip-equip', 'chip-skill',
  'button-tap', 'takeover-open', 'takeover-close',
  'victory', 'defeat', 'chip-lift'
];
```

**Step 2: Create placeholder audio file**

Run: `touch public/assets/audio/sfx/chip-lift.mp3`

Note: Replace with actual click/pop sound later. For now, copy an existing short SFX:
```bash
cp public/assets/audio/sfx/button-tap.mp3 public/assets/audio/sfx/chip-lift.mp3
```

**Step 3: Verify audio loads**

Manual test: Open browser console, run `window.playSFX('chip-lift')` after game loads.

**Step 4: Commit**

```bash
git add public/js/audio.js public/assets/audio/sfx/chip-lift.mp3
git commit -m "feat: add chip-lift SFX for drag feedback

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Create Backend Reorder Endpoint

**Files:**
- Modify: `src/routes/game/run.js:152` (after unequip-chip endpoint)
- Modify: `src/game/items/chips.js` (add reorderChips function)

**Step 1: Add reorderChips function to chips.js**

Add at end of `src/game/items/chips.js`:

```javascript
/**
 * Reorder equipped chips in weapon slot
 * @param {Object} player - Player object
 * @param {Array<string|null>} chipIds - New order of chip IDs (5 elements, null for empty)
 * @returns {{success: boolean, error?: string}}
 */
export function reorderChips(player, chipIds) {
  if (!player?.equipment?.weapon) {
    return { success: false, error: 'No weapon equipped' };
  }

  if (!Array.isArray(chipIds) || chipIds.length !== 5) {
    return { success: false, error: 'chipIds must be array of 5 elements' };
  }

  const weapon = player.equipment.weapon;
  const currentChips = weapon.equippedChips || [];

  // Validate all provided chipIds exist in current loadout
  const currentIds = currentChips.map(c => c?.id || null);
  for (const id of chipIds) {
    if (id !== null && !currentIds.includes(id)) {
      return { success: false, error: `Chip ${id} not in current loadout` };
    }
  }

  // Build new order by finding each chip object
  const newOrder = chipIds.map(id => {
    if (id === null) return null;
    return currentChips.find(c => c?.id === id) || null;
  });

  weapon.equippedChips = newOrder;
  return { success: true };
}
```

**Step 2: Add export to chips.js**

The function is already exported inline with `export function`. Verify the import in routes file.

**Step 3: Add route in run.js**

In `src/routes/game/run.js`, add import at top (around line 8):

```javascript
import { getChipLoadout, equipChip, unequipChip, reorderChips } from '../../game/items/chips.js';
```

Then add endpoint after the unequip-chip route (after line 152):

```javascript
  router.post('/reorder-chips', (req, res) => {
    const gameManager = req.gameManager;
    try {
      const { chipIds } = req.body;
      const player = gameManager.run?.player || gameManager.player;
      const result = reorderChips(player, chipIds);
      if (result.success) req.saveGame();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 4: Test endpoint manually**

Start server and test with curl:
```bash
curl -X POST http://localhost:3000/api/game/reorder-chips \
  -H "Content-Type: application/json" \
  -d '{"chipIds":["chip1","chip2","chip3","chip4","chip5"]}'
```

Expected: `{"success":true}` or `{"error":"..."}` if no active game.

**Step 5: Commit**

```bash
git add src/game/items/chips.js src/routes/game/run.js
git commit -m "feat: add /api/game/reorder-chips endpoint

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Add API Function for Reorder

**Files:**
- Modify: `public/js/api.js` (after unequipChip function, around line 371)

**Step 1: Add reorderChips function**

Add after the `unequipChip` function:

```javascript
/** Reorder equipped chips
 * @param {Array<string|null>} chipIds - New order of chip IDs (5 elements)
 */
async function reorderChips(chipIds) {
  try {
    const response = await fetch('/api/game/reorder-chips', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chipIds })
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to reorder chips:', error);
    return { error: 'Network error' };
  }
}
```

**Step 2: Add to exports**

Find the export object at the end of `api.js` and add `reorderChips`:

```javascript
export {
  // ... existing exports
  reorderChips,
};
```

**Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add reorderChips API function

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Create chip-drag.js Module

**Files:**
- Create: `public/js/ui/chip-drag.js`

**Step 1: Create the module file**

Create `public/js/ui/chip-drag.js`:

```javascript
/**
 * Chip Drag Module - Long-press drag-and-drop reordering for chip slots
 *
 * Usage:
 *   import * as chipDrag from './chip-drag.js';
 *   chipDrag.init({ onReorder, isBlocked, getChipIds });
 *   // Call chipDrag.attach(chipRowElement) after each render
 */

import { playSFX } from '../audio.js';

// ============ CONFIGURATION ============
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD_PX = 10;
const LIFT_SCALE = 1.15;
const ANIMATION_MS = 150;

// ============ STATE ============
let enabled = true;
let onReorder = null;      // (chipIds: string[]) => void
let isBlocked = null;      // () => boolean
let getChipIds = null;     // () => (string|null)[]

// Drag state
let dragState = null;
// {
//   slotIndex: number,
//   chipId: string,
//   startX: number,
//   startY: number,
//   currentX: number,
//   currentY: number,
//   pressTimer: number|null,
//   isDragging: boolean,
//   draggedEl: HTMLElement|null,
//   placeholderIndex: number
// }

let chipRowEl = null;
let slotEls = [];

// ============ INITIALIZATION ============

/**
 * Initialize chip drag module
 * @param {Object} callbacks
 * @param {Function} callbacks.onReorder - Called with new chipIds array after drop
 * @param {Function} callbacks.isBlocked - Returns true if dragging should be blocked
 * @param {Function} callbacks.getChipIds - Returns current array of chip IDs
 */
export function init(callbacks) {
  onReorder = callbacks.onReorder;
  isBlocked = callbacks.isBlocked;
  getChipIds = callbacks.getChipIds;

  // Global listeners for drag continuation/end
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  document.addEventListener('touchcancel', handleCancel);
}

/**
 * Attach drag handlers to chip row (call after each render)
 * @param {HTMLElement} chipRow - The chip-row container element
 */
export function attach(chipRow) {
  chipRowEl = chipRow;
  slotEls = Array.from(chipRow.querySelectorAll('.chip-slot'));

  slotEls.forEach((slot, index) => {
    // Remove old listeners to prevent duplicates
    slot.removeEventListener('mousedown', handleStart);
    slot.removeEventListener('touchstart', handleStart);

    // Only attach if slot has a chip (not empty)
    if (!slot.querySelector('.chip-icon.empty')) {
      slot.addEventListener('mousedown', handleStart);
      slot.addEventListener('touchstart', handleStart, { passive: false });
    }
  });
}

/**
 * Enable or disable dragging globally
 * @param {boolean} isEnabled
 */
export function setEnabled(isEnabled) {
  enabled = isEnabled;
  if (!isEnabled && dragState) {
    cancelDrag();
  }
}

// ============ EVENT HANDLERS ============

function handleStart(e) {
  if (!enabled || (isBlocked && isBlocked())) return;

  const slot = e.currentTarget;
  const index = parseInt(slot.dataset.index, 10);
  const chipIds = getChipIds ? getChipIds() : [];
  const chipId = chipIds[index];

  if (!chipId) return; // Empty slot

  const point = getEventPoint(e);

  dragState = {
    slotIndex: index,
    chipId,
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y,
    pressTimer: null,
    isDragging: false,
    draggedEl: null,
    placeholderIndex: index
  };

  // Start long-press timer
  dragState.pressTimer = setTimeout(() => {
    if (dragState) {
      startDrag();
    }
  }, LONG_PRESS_MS);
}

function handleMove(e) {
  if (!dragState) return;

  const point = getEventPoint(e);
  dragState.currentX = point.x;
  dragState.currentY = point.y;

  if (!dragState.isDragging) {
    // Check if moved too much before long-press completed
    const dx = point.x - dragState.startX;
    const dy = point.y - dragState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > MOVE_THRESHOLD_PX) {
      cancelDrag();
    }
  } else {
    // Prevent scrolling while dragging
    e.preventDefault();
    updateDragPosition();
    updatePlaceholder();
  }
}

function handleEnd(e) {
  if (!dragState) return;

  if (dragState.isDragging) {
    completeDrop();
  } else {
    // Long-press didn't complete - let click handler work
    cancelDrag();
  }
}

function handleCancel() {
  if (dragState) {
    cancelDrag();
  }
}

// ============ DRAG OPERATIONS ============

function startDrag() {
  if (!dragState || dragState.isDragging) return;

  dragState.isDragging = true;
  dragState.pressTimer = null;

  // Play lift sound
  playSFX('chip-lift');

  // Create dragged element (clone of chip icon)
  const slot = slotEls[dragState.slotIndex];
  const icon = slot.querySelector('.chip-icon');

  dragState.draggedEl = icon.cloneNode(true);
  dragState.draggedEl.classList.add('chip-dragging');

  // Position absolutely
  const rect = icon.getBoundingClientRect();
  dragState.draggedEl.style.position = 'fixed';
  dragState.draggedEl.style.left = `${rect.left}px`;
  dragState.draggedEl.style.top = `${rect.top}px`;
  dragState.draggedEl.style.width = `${rect.width}px`;
  dragState.draggedEl.style.height = `${rect.height}px`;
  dragState.draggedEl.style.zIndex = '1000';
  dragState.draggedEl.style.pointerEvents = 'none';
  dragState.draggedEl.style.transition = `transform ${ANIMATION_MS}ms ease-out, box-shadow ${ANIMATION_MS}ms ease-out`;

  document.body.appendChild(dragState.draggedEl);

  // Apply lift effect
  requestAnimationFrame(() => {
    if (dragState?.draggedEl) {
      dragState.draggedEl.style.transform = `scale(${LIFT_SCALE})`;
      dragState.draggedEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    }
  });

  // Hide original
  icon.style.opacity = '0';

  // Mark slot as source
  slot.classList.add('chip-slot-source');
}

function updateDragPosition() {
  if (!dragState?.draggedEl) return;

  const slot = slotEls[dragState.slotIndex];
  const icon = slot.querySelector('.chip-icon');
  const rect = icon.getBoundingClientRect();

  // Calculate offset from start position
  const dx = dragState.currentX - dragState.startX;
  const dy = dragState.currentY - dragState.startY;

  dragState.draggedEl.style.left = `${rect.left + dx}px`;
  dragState.draggedEl.style.top = `${rect.top + dy}px`;
}

function updatePlaceholder() {
  if (!dragState?.isDragging) return;

  // Find which slot we're over
  const targetIndex = getSlotIndexAtPoint(dragState.currentX, dragState.currentY);

  if (targetIndex !== -1 && targetIndex !== dragState.placeholderIndex) {
    dragState.placeholderIndex = targetIndex;
    animateSlotPreview();
  }
}

function getSlotIndexAtPoint(x, y) {
  for (let i = 0; i < slotEls.length; i++) {
    const rect = slotEls[i].getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return i;
    }
  }

  // If not directly over a slot, find closest by X
  let closest = -1;
  let closestDist = Infinity;
  for (let i = 0; i < slotEls.length; i++) {
    const rect = slotEls[i].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const dist = Math.abs(x - centerX);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest;
}

function animateSlotPreview() {
  // Reset all slot transforms
  slotEls.forEach((slot, i) => {
    const icon = slot.querySelector('.chip-icon');
    if (icon && i !== dragState.slotIndex) {
      icon.style.transition = `transform ${ANIMATION_MS}ms ease-out`;
      icon.style.transform = '';
    }
  });

  // Calculate preview positions (simulate the reorder)
  const fromIndex = dragState.slotIndex;
  const toIndex = dragState.placeholderIndex;

  if (fromIndex === toIndex) return;

  // Chips between from and to shift to fill the gap
  const direction = toIndex > fromIndex ? -1 : 1;
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);

  for (let i = start; i <= end; i++) {
    if (i === fromIndex) continue;
    const slot = slotEls[i];
    const icon = slot.querySelector('.chip-icon');
    if (icon) {
      // Calculate shift amount (one slot width)
      const slotWidth = slot.getBoundingClientRect().width + 8; // include gap
      const shiftDir = i < fromIndex ? 1 : -1;
      icon.style.transform = `translateX(${shiftDir * slotWidth * direction}px)`;
    }
  }
}

function completeDrop() {
  if (!dragState?.isDragging) return;

  const fromIndex = dragState.slotIndex;
  const toIndex = dragState.placeholderIndex;

  // Animate dragged element to target position
  if (dragState.draggedEl) {
    const targetSlot = slotEls[toIndex];
    const targetRect = targetSlot.getBoundingClientRect();

    dragState.draggedEl.style.transition = `all ${ANIMATION_MS}ms ease-out`;
    dragState.draggedEl.style.left = `${targetRect.left}px`;
    dragState.draggedEl.style.top = `${targetRect.top}px`;
    dragState.draggedEl.style.transform = 'scale(1)';
    dragState.draggedEl.style.boxShadow = 'none';
  }

  // Calculate new chip order
  const chipIds = getChipIds ? getChipIds() : [];
  const newOrder = reorderArray(chipIds, fromIndex, toIndex);

  // Clean up after animation
  setTimeout(() => {
    cleanup();

    // Notify parent to update state
    if (onReorder && fromIndex !== toIndex) {
      onReorder(newOrder);
    }
  }, ANIMATION_MS);
}

function cancelDrag() {
  if (dragState?.pressTimer) {
    clearTimeout(dragState.pressTimer);
  }

  if (dragState?.isDragging && dragState.draggedEl) {
    // Animate back to original position
    const slot = slotEls[dragState.slotIndex];
    const rect = slot.querySelector('.chip-icon').getBoundingClientRect();

    dragState.draggedEl.style.transition = `all ${ANIMATION_MS}ms ease-out`;
    dragState.draggedEl.style.left = `${rect.left}px`;
    dragState.draggedEl.style.top = `${rect.top}px`;
    dragState.draggedEl.style.transform = 'scale(1)';
    dragState.draggedEl.style.boxShadow = 'none';

    setTimeout(cleanup, ANIMATION_MS);
  } else {
    cleanup();
  }
}

function cleanup() {
  if (dragState?.draggedEl) {
    dragState.draggedEl.remove();
  }

  // Reset all slot visuals
  slotEls.forEach((slot, i) => {
    const icon = slot.querySelector('.chip-icon');
    if (icon) {
      icon.style.opacity = '';
      icon.style.transform = '';
      icon.style.transition = '';
    }
    slot.classList.remove('chip-slot-source');
  });

  dragState = null;
}

// ============ UTILITIES ============

function getEventPoint(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

/**
 * Reorder array by moving element from one index to another
 * Elements between shift to fill the gap (standard list reorder)
 */
function reorderArray(arr, fromIndex, toIndex) {
  const result = [...arr];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}
```

**Step 2: Commit**

```bash
git add public/js/ui/chip-drag.js
git commit -m "feat: add chip-drag.js module for drag-and-drop reordering

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Add CSS for Drag States

**Files:**
- Modify: `public/game.css` (after chip-level-badge styles, around line 328)

**Step 1: Add drag state styles**

Add after the chip-level-badge styles:

```css
/* Chip drag states */
.chip-dragging {
  border-radius: var(--radius-circle);
  background-size: cover;
  background-position: center;
}

.chip-slot-source .chip-icon {
  border-style: dashed;
  background-color: rgba(255,255,255,0.1);
}

.chip-slot-source .chip-charge-bar,
.chip-slot-source .chip-level-badge {
  opacity: 0.3;
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "style: add CSS for chip drag states

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Integrate chip-drag with chip-row

**Files:**
- Modify: `public/js/ui/chip-row.js`

**Step 1: Import chip-drag module**

Add import at top of `chip-row.js`:

```javascript
import * as chipDrag from './chip-drag.js';
```

**Step 2: Add drag initialization to init function**

Update the `init` function to accept and wire up drag callbacks:

```javascript
/** Initialize chip row with skill callback and drag support */
export function init({ useSkillCallback, onReorder, isBlocked, getChipIds }) {
  onUseSkill = useSkillCallback;

  // Initialize drag module
  chipDrag.init({
    onReorder,
    isBlocked,
    getChipIds
  });

  // Dismiss popup on outside tap
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip-slot') && !e.target.closest('.chip-popup')) {
      hidePopup();
    }
  });
}
```

**Step 3: Call chipDrag.attach after render**

At the end of the `render` function, add:

```javascript
  // Attach drag handlers to the freshly rendered slots
  chipDrag.attach(row);
```

**Step 4: Commit**

```bash
git add public/js/ui/chip-row.js
git commit -m "feat: integrate chip-drag with chip-row module

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire Up Drag System in game.js

**Files:**
- Modify: `public/game.js`

**Step 1: Import reorderChips from api.js**

Find the api imports (search for `import {` and `from './js/api.js'`) and add `reorderChips`:

```javascript
import { ..., reorderChips } from './js/api.js';
```

**Step 2: Add combatAnimationActive flag**

Add near the other state variables (around line 75, near `enemyDialogueActive`):

```javascript
let combatAnimationActive = false;
```

**Step 3: Add getter/setter for combatAnimationActive**

Add near the `enemyDialogueActive` getters (around line 527):

```javascript
getCombatAnimationActive: () => combatAnimationActive,
setCombatAnimationActive: (active) => { combatAnimationActive = active; },
```

Also export as needed if accessed from other modules. Add to the window assignments or exports.

**Step 4: Create isChipDragBlocked function**

Add helper function:

```javascript
function isChipDragBlocked() {
  return enemyDialogueActive || combatAnimationActive;
}
```

**Step 5: Create getChipIds helper**

Add helper function that returns current chip IDs from cache:

```javascript
function getChipIds() {
  const chips = chipLoadoutCache?.equipment?.weapon?.equippedChips || [];
  return chips.map(c => c?.id || null);
}
```

**Step 6: Create handleChipReorder function**

Add the reorder handler:

```javascript
async function handleChipReorder(newChipIds) {
  // Optimistic update
  const oldChips = chipLoadoutCache?.equipment?.weapon?.equippedChips || [];
  const reorderedChips = newChipIds.map(id => {
    if (id === null) return null;
    return oldChips.find(c => c?.id === id) || null;
  });

  if (chipLoadoutCache?.equipment?.weapon) {
    chipLoadoutCache.equipment.weapon.equippedChips = reorderedChips;
  }
  updateChipRow();

  // Persist to backend
  const result = await reorderChips(newChipIds);
  if (result.error) {
    // Revert on error
    console.error('Chip reorder failed:', result.error);
    if (chipLoadoutCache?.equipment?.weapon) {
      chipLoadoutCache.equipment.weapon.equippedChips = oldChips;
    }
    updateChipRow();
    // Could show error toast here
  }
}
```

**Step 7: Update chipRow.init call**

Find where `chipRow.init` is called and update it to pass the new callbacks:

```javascript
chipRow.init({
  useSkillCallback: handleUseChipSkill,
  onReorder: handleChipReorder,
  isBlocked: isChipDragBlocked,
  getChipIds: getChipIds
});
```

**Step 8: Commit**

```bash
git add public/game.js
git commit -m "feat: wire chip drag system into game.js

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Set combatAnimationActive During Attacks

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add setCombatAnimationActive to init callbacks**

In the `init` function parameter destructuring, add:

```javascript
let setCombatAnimationActive = null;
```

And in the init function body:

```javascript
setCombatAnimationActive = callbacks.setCombatAnimationActive;
```

**Step 2: Set flag true at start of player attack**

In `executePlayerAttack` function, after the guard clause, add:

```javascript
if (setCombatAnimationActive) setCombatAnimationActive(true);
```

**Step 3: Set flag false when player attack completes**

In `executePlayerAttack`, in all the places where `playerAttackPending = false` is set, also add:

```javascript
if (setCombatAnimationActive) setCombatAnimationActive(false);
```

This includes:
- After successful attack animation completes
- In error handlers
- In finally blocks

**Step 4: Set flag true at start of enemy attack**

In `executeEnemyAttack` and `executeEnemyAttackThenPause` functions, after guard clauses:

```javascript
if (setCombatAnimationActive) setCombatAnimationActive(true);
```

**Step 5: Set flag false when enemy attack completes**

In all places where `enemyAttackPending = false` is set:

```javascript
if (setCombatAnimationActive) setCombatAnimationActive(false);
```

**Step 6: Update combat-loop init call in game.js**

Find where combat-loop init is called and add the new callback:

```javascript
combatLoop.init({
  // ... existing callbacks
  setCombatAnimationActive: (active) => { combatAnimationActive = active; }
});
```

**Step 7: Commit**

```bash
git add public/js/ui/combat-loop.js public/game.js
git commit -m "feat: set combatAnimationActive flag during attack sequences

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 9: Handle Edge Case - Block During Mid-Drag

**Files:**
- Modify: `public/js/ui/chip-drag.js`

**Step 1: Add polling check during drag**

In the `startDrag` function, add a polling interval to check if blocking occurred:

```javascript
function startDrag() {
  if (!dragState || dragState.isDragging) return;

  dragState.isDragging = true;
  dragState.pressTimer = null;

  // Check for blocking during drag
  dragState.blockCheckInterval = setInterval(() => {
    if (isBlocked && isBlocked()) {
      cancelDrag();
    }
  }, 100);

  // ... rest of existing startDrag code
}
```

**Step 2: Clear interval in cleanup**

Update the `cleanup` function:

```javascript
function cleanup() {
  if (dragState?.draggedEl) {
    dragState.draggedEl.remove();
  }

  if (dragState?.blockCheckInterval) {
    clearInterval(dragState.blockCheckInterval);
  }

  // ... rest of cleanup
}
```

**Step 3: Commit**

```bash
git add public/js/ui/chip-drag.js
git commit -m "fix: cancel drag if blocking occurs mid-drag

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E Test for Chip Reorder

**Files:**
- Create: `tests/e2e/specs/chip-reorder.spec.ts`

**Step 1: Write the test file**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chip Reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for game to load
    await page.waitForSelector('.chip-row');
  });

  test('reorder endpoint accepts valid chip order', async ({ page }) => {
    // This tests the API directly since simulating long-press drag is complex
    const response = await page.evaluate(async () => {
      // Get current chip loadout
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon?.equippedChips?.length) {
        return { skipped: true, reason: 'No chips equipped' };
      }

      const chipIds = loadout.equipment.weapon.equippedChips.map(c => c?.id || null);

      // Reverse the order
      const reversed = [...chipIds].reverse();

      // Call reorder
      const reorderRes = await fetch('/api/game/reorder-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIds: reversed })
      });

      return await reorderRes.json();
    });

    if (response.skipped) {
      test.skip();
    } else {
      expect(response.success).toBe(true);
    }
  });

  test('chip slots have correct data-index attributes', async ({ page }) => {
    const slots = await page.$$eval('.chip-slot', els =>
      els.map(el => el.dataset.index)
    );

    expect(slots).toEqual(['0', '1', '2', '3', '4']);
  });

  test('reorder endpoint rejects invalid chip count', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/game/reorder-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIds: ['chip1', 'chip2'] }) // Only 2, need 5
      });
      return await res.json();
    });

    expect(response.error).toContain('5 elements');
  });
});
```

**Step 2: Run the test**

```bash
./scripts/e2e-test.sh specs/chip-reorder
```

Expected: Tests pass (some may skip if no chips equipped in test save).

**Step 3: Commit**

```bash
git add tests/e2e/specs/chip-reorder.spec.ts
git commit -m "test: add e2e tests for chip reorder feature

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 11: Manual Testing Checklist

**No code changes - verification only**

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test on desktop (mouse)**

- [ ] Long-press (400ms) on a chip starts drag
- [ ] Chip scales up and gets shadow
- [ ] Moving chip shows preview of new positions
- [ ] Releasing drops chip in new position
- [ ] Moving before 400ms cancels (no drag starts)
- [ ] Tapping (quick click) still shows popup

**Step 3: Test on mobile (touch via DevTools)**

- [ ] Long-press works with touch
- [ ] Drag follows finger
- [ ] No page scrolling during drag
- [ ] Release completes drop

**Step 4: Test blocking**

- [ ] Cannot start drag during narration
- [ ] Cannot start drag during attack animation
- [ ] Drag cancels if narration triggers mid-drag

**Step 5: Test persistence**

- [ ] After reorder, refresh page - order persists
- [ ] Reorder affects chip fire order in combat

**Step 6: Final commit if any fixes needed**

If manual testing reveals issues, fix and commit with descriptive message.

---

## Summary

10 implementation tasks plus 1 manual verification task:

1. **Audio** - Add chip-lift SFX
2. **Backend** - Add reorder endpoint + function
3. **API** - Add frontend API function
4. **Core** - Create chip-drag.js module
5. **CSS** - Add drag state styles
6. **Integration** - Connect chip-drag to chip-row
7. **Wiring** - Connect to game.js
8. **Combat** - Set animation blocking flag
9. **Edge case** - Cancel drag on mid-drag block
10. **Testing** - E2E tests
11. **Verification** - Manual testing checklist
