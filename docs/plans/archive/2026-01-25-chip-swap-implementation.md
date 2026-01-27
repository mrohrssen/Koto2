# Chip Swap Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace broken drag-and-drop chip reordering with a simple click-to-swap interaction.

**Architecture:** User taps chip, popup shows "Swap" button, user taps it, other chips glow, user taps target chip to complete swap. All state managed in chip-row.js. Reuses existing `handleChipReorder()` API integration.

**Tech Stack:** Vanilla JS, CSS animations, Playwright e2e tests

---

## Task 1: Delete Drag Module and Clean Up Imports

**Files:**
- Delete: `public/js/ui/chip-drag.js`
- Modify: `public/js/ui/chip-row.js:10,20-24,96`
- Modify: `public/game.css:330-345`
- Modify: `public/game.js:475-478`

**Step 1: Delete the drag module file**

```bash
rm public/js/ui/chip-drag.js
```

**Step 2: Remove import and usage from chip-row.js**

In `public/js/ui/chip-row.js`, remove line 10:
```javascript
import * as chipDrag from './chip-drag.js';
```

Remove lines 20-24 (inside init function):
```javascript
  // Initialize drag module
  chipDrag.init({
    onReorder,
    isBlocked,
    getChipIds
  });
```

Remove line 96 (inside render function):
```javascript
  chipDrag.attach(row);
```

**Step 3: Remove drag CSS from game.css**

Remove lines 330-345:
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

**Step 4: Rename helper function in game.js**

In `public/game.js`, rename `isChipDragBlocked` to `isChipActionBlocked` at lines 476 and 551:

```javascript
// Line 476
function isChipActionBlocked() {
  return enemyDialogueActive || combatAnimationActive;
}

// Line 551
    isBlocked: isChipActionBlocked,
```

**Step 5: Verify syntax is valid**

Run: `node --check public/js/ui/chip-row.js && node --check public/game.js && echo "Syntax OK"`

Expected: `Syntax OK`

**Step 6: Commit cleanup**

```bash
git add -A && git commit -m "refactor: remove drag-and-drop chip system

Delete chip-drag.js module and all references.
Prepare for simpler click-to-swap implementation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Swap Button to DOM and CSS

**Files:**
- Modify: `public/game.html:126-127`
- Modify: `public/js/dom.js:69`
- Modify: `public/game.css` (after line 662)

**Step 1: Add Swap button to HTML**

In `public/game.html`, after line 126 (the Use Skill button), add:

```html
    <button class="chip-popup-swap" id="chip-popup-swap">Swap</button>
```

The chip-popup section should now look like:
```html
  <!-- Chip Skill Popup -->
  <div class="chip-popup" id="chip-popup">
    <div class="chip-popup-name" id="chip-popup-name"></div>
    <div class="chip-popup-desc" id="chip-popup-desc"></div>
    <div class="chip-popup-charge" id="chip-popup-charge"></div>
    <button class="chip-popup-use" id="chip-popup-use">Use Skill</button>
    <button class="chip-popup-swap" id="chip-popup-swap">Swap</button>
  </div>
```

**Step 2: Add DOM reference**

In `public/js/dom.js`, after line 69 (chipPopupUse), add:

```javascript
  get chipPopupSwap() { return el('chip-popup-swap'); },
```

**Step 3: Add CSS for swap button and swap mode glow**

In `public/game.css`, after the `.chip-popup-use:disabled` rule (around line 662), add:

```css
/* Swap button in popup */
.chip-popup-swap {
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  border: 1px solid var(--accent-cyan);
  background: transparent;
  color: var(--accent-cyan);
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
}

.chip-popup-swap:disabled {
  border-color: var(--text-secondary);
  color: var(--text-secondary);
  cursor: not-allowed;
}

/* Swap mode - highlight selectable chips */
.chip-slot.swap-target .chip-icon {
  animation: swap-glow 1s ease-in-out infinite;
}

@keyframes swap-glow {
  0%, 100% { box-shadow: 0 0 8px 2px var(--accent-cyan); }
  50% { box-shadow: 0 0 16px 4px var(--accent-cyan); }
}
```

**Step 4: Verify syntax**

Run: `node --check public/js/dom.js && echo "Syntax OK"`

Expected: `Syntax OK`

**Step 5: Commit**

```bash
git add public/game.html public/js/dom.js public/game.css && git commit -m "feat: add swap button UI and CSS

Add Swap button to chip popup.
Add cyan glow animation for swap target chips.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Write Failing E2E Test for Swap Flow

**Files:**
- Modify: `tests/e2e/specs/chip-reorder.spec.ts`

**Step 1: Add test for swap UI flow**

Replace the contents of `tests/e2e/specs/chip-reorder.spec.ts` with:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chip Reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.chip-row');
  });

  test('swap button appears in chip popup', async ({ page }) => {
    // Click first non-empty chip slot
    const chipSlot = page.locator('.chip-slot').first();
    await chipSlot.click();

    // Wait for popup to appear
    await expect(page.locator('.chip-popup.visible')).toBeVisible();

    // Verify swap button exists
    await expect(page.locator('.chip-popup-swap')).toBeVisible();
  });

  test('clicking swap enters swap mode with glowing targets', async ({ page }) => {
    // Click first chip slot
    await page.locator('.chip-slot').first().click();
    await expect(page.locator('.chip-popup.visible')).toBeVisible();

    // Click swap button
    await page.locator('.chip-popup-swap').click();

    // Popup should close
    await expect(page.locator('.chip-popup.visible')).not.toBeVisible();

    // Other chips should have swap-target class
    const swapTargets = page.locator('.chip-slot.swap-target');
    await expect(swapTargets).toHaveCount(4);
  });

  test('clicking another chip completes swap', async ({ page }) => {
    // Get initial chip order via API
    const initialOrder = await page.evaluate(async () => {
      const res = await fetch('/api/game/chip-loadout');
      const data = await res.json();
      return data.equipment?.weapon?.equippedChips?.map(c => c?.id) || [];
    });

    if (initialOrder.filter(Boolean).length < 2) {
      test.skip();
      return;
    }

    // Click first chip, then swap, then second chip
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();
    await page.locator('.chip-slot').nth(1).click();

    // Swap mode should exit (no more swap-target classes)
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);

    // Verify order changed via API
    const newOrder = await page.evaluate(async () => {
      const res = await fetch('/api/game/chip-loadout');
      const data = await res.json();
      return data.equipment?.weapon?.equippedChips?.map(c => c?.id) || [];
    });

    // First two chips should be swapped
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test('clicking outside cancels swap mode', async ({ page }) => {
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();

    // Should be in swap mode
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(4);

    // Click outside chip row
    await page.locator('.scene-area').click();

    // Swap mode should exit
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);
  });

  test('clicking same chip cancels swap mode', async ({ page }) => {
    await page.locator('.chip-slot').first().click();
    await page.locator('.chip-popup-swap').click();

    // Should be in swap mode
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(4);

    // Click the source chip again
    await page.locator('.chip-slot').first().click();

    // Swap mode should exit
    await expect(page.locator('.chip-slot.swap-target')).toHaveCount(0);
  });

  test('chip slots have correct data-index attributes', async ({ page }) => {
    const slots = await page.$$eval('.chip-slot', els =>
      els.map(el => el.dataset.index)
    );
    expect(slots).toEqual(['0', '1', '2', '3', '4']);
  });

  test('reorder endpoint accepts valid chip order', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon?.equippedChips?.length) {
        return { skipped: true, reason: 'No chips equipped' };
      }

      const chipIds = loadout.equipment.weapon.equippedChips.map(c => c?.id || null);
      const reversed = [...chipIds].reverse();

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

  test('reorder endpoint rejects invalid chip count', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const loadoutRes = await fetch('/api/game/chip-loadout');
      const loadout = await loadoutRes.json();

      if (!loadout.equipment?.weapon) {
        return { skipped: true, reason: 'No weapon equipped' };
      }

      const res = await fetch('/api/game/reorder-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIds: ['chip1', 'chip2'] })
      });
      return await res.json();
    });

    if (response.skipped) {
      test.skip();
    } else {
      expect(response.error).toContain('5 elements');
    }
  });
});
```

**Step 2: Run tests to confirm they fail**

Run: `./scripts/e2e-test.sh specs/chip-reorder.spec.ts`

Expected: Tests fail because swap functionality not implemented yet. The "swap button appears" test should pass (we added the button), but "clicking swap enters swap mode" should fail.

**Step 3: Commit failing tests**

```bash
git add tests/e2e/specs/chip-reorder.spec.ts && git commit -m "test: add e2e tests for chip swap mode

Tests will fail until swap logic is implemented.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Implement Swap Mode Logic in chip-row.js

**Files:**
- Modify: `public/js/ui/chip-row.js`

**Step 1: Add swap mode state and callbacks**

At the top of `public/js/ui/chip-row.js`, after line 12 (`let currentPopupIndex = -1;`), add:

```javascript
let swapModeSourceIndex = -1;
let swapBlockCheckInterval = null;
let onReorder = null;
let isBlocked = null;
```

**Step 2: Update init function to store callbacks**

Modify the `init` function to store `onReorder` and `isBlocked`:

```javascript
/** Initialize chip row with skill callback and swap support */
export function init({ useSkillCallback, onReorder: reorderCallback, isBlocked: blockedCallback, getChipIds }) {
  onUseSkill = useSkillCallback;
  onReorder = reorderCallback;
  isBlocked = blockedCallback;

  // Dismiss popup and cancel swap on outside tap
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip-slot') && !e.target.closest('.chip-popup')) {
      hidePopup();
      exitSwapMode();
    }
  });
}
```

**Step 3: Add swap mode helper functions**

After the `hidePopup()` function, add:

```javascript
/** Enter swap mode for the given chip index */
function enterSwapMode(sourceIndex) {
  swapModeSourceIndex = sourceIndex;

  // Add glow to all other chip slots
  const slots = dom.chipRow.querySelectorAll('.chip-slot');
  slots.forEach((slot, i) => {
    if (i !== sourceIndex && !slot.querySelector('.chip-icon.empty')) {
      slot.classList.add('swap-target');
    }
  });

  // Check for blocking during swap mode
  swapBlockCheckInterval = setInterval(() => {
    if (isBlocked && isBlocked()) {
      exitSwapMode();
    }
  }, 100);
}

/** Exit swap mode without making changes */
function exitSwapMode() {
  if (swapModeSourceIndex === -1) return;

  swapModeSourceIndex = -1;

  if (swapBlockCheckInterval) {
    clearInterval(swapBlockCheckInterval);
    swapBlockCheckInterval = null;
  }

  // Remove glow from all slots
  const slots = dom.chipRow.querySelectorAll('.chip-slot');
  slots.forEach(slot => slot.classList.remove('swap-target'));
}

/** Complete swap between source and target */
function completeSwap(targetIndex) {
  if (swapModeSourceIndex === -1 || swapModeSourceIndex === targetIndex) {
    exitSwapMode();
    return;
  }

  const sourceIndex = swapModeSourceIndex;
  exitSwapMode();

  // Get current chip IDs and swap them
  const slots = dom.chipRow.querySelectorAll('.chip-slot');
  const chipIds = Array.from(slots).map(slot => {
    const icon = slot.querySelector('.chip-icon:not(.empty)');
    return icon ? slot.dataset.chipId : null;
  });

  // Swap the two positions
  const temp = chipIds[sourceIndex];
  chipIds[sourceIndex] = chipIds[targetIndex];
  chipIds[targetIndex] = temp;

  playSFX('chip-lift');

  if (onReorder) {
    onReorder(chipIds);
  }
}

/** Check if currently in swap mode */
export function isInSwapMode() {
  return swapModeSourceIndex !== -1;
}
```

**Step 4: Modify showPopup to add swap button handler**

Update the `showPopup` function to configure the swap button. Add after the Use Skill button setup (around line 130):

```javascript
  // Swap button - always visible when chip exists
  dom.chipPopupSwap.style.display = '';
  dom.chipPopupSwap.disabled = isBlocked && isBlocked();
  dom.chipPopupSwap.onclick = () => {
    hidePopup();
    enterSwapMode(index);
  };
```

**Step 5: Modify render to store chip IDs and handle swap clicks**

In the `render` function, update the slot creation to store chip ID and handle swap mode clicks:

After `slot.dataset.index = i;` add:
```javascript
    if (chip) {
      slot.dataset.chipId = chip.id;
    }
```

Replace the existing click handler (the `if (chip)` block with the click listener) with:

```javascript
    // Tap handler
    if (chip) {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();

        // If in swap mode, handle swap logic
        if (swapModeSourceIndex !== -1) {
          if (i === swapModeSourceIndex) {
            // Clicking source chip cancels swap
            exitSwapMode();
          } else {
            // Clicking another chip completes swap
            completeSwap(i);
          }
          return;
        }

        // Normal click - show popup
        showPopup(i, { ...chip, _level: level }, charge, maxCharges, inCombat);
      });
    } else {
      // Empty slot - if in swap mode, clicking cancels
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (swapModeSourceIndex !== -1) {
          exitSwapMode();
        }
      });
    }
```

**Step 6: Verify syntax**

Run: `node --check public/js/ui/chip-row.js && echo "Syntax OK"`

Expected: `Syntax OK`

**Step 7: Commit implementation**

```bash
git add public/js/ui/chip-row.js && git commit -m "feat: implement chip swap mode logic

- Add swap button handler in popup
- Enter swap mode shows glowing targets
- Click target chip to complete swap
- Click source chip or outside to cancel
- Auto-cancel if combat animation starts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Run E2E Tests and Fix Issues

**Step 1: Run the full test suite for chip reorder**

Run: `./scripts/e2e-test.sh specs/chip-reorder.spec.ts`

Expected: All tests pass. If any fail, debug and fix.

**Step 2: Run full e2e suite to check for regressions**

Run: `./scripts/e2e-test.sh`

Expected: 80+/87 tests pass (known flakiness threshold)

**Step 3: Commit any fixes**

If fixes were needed:
```bash
git add -A && git commit -m "fix: address test failures in chip swap

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Manual Testing Checklist

Test each scenario manually in browser:

1. [ ] Tap chip - popup appears with Swap button
2. [ ] Tap Swap - popup closes, other 4 chips glow cyan
3. [ ] Tap another chip - chips swap positions, glow disappears
4. [ ] Tap Swap then tap same chip - swap cancels, no change
5. [ ] Tap Swap then tap outside - swap cancels, no change
6. [ ] During combat animation - Swap button is disabled
7. [ ] Sound plays on successful swap

If issues found, fix and commit before proceeding.

---

## Task 7: Final Commit and Cleanup

**Step 1: Verify all changes**

Run: `git status && git log --oneline -5`

**Step 2: Update the bug report doc**

Update `docs/plans/2026-01-25-chip-drag-bugs.md` to mark as resolved:

```markdown
# Chip Drag-and-Drop Bugs

**Branch:** `feature/chip-drag-reorder`
**Status:** RESOLVED - Replaced with click-to-swap system

## Resolution

The drag-and-drop system was replaced with a simpler click-to-swap interaction.
See `docs/plans/2026-01-25-chip-swap-design.md` for the new design.

## Original Issues (Historical)

[keep existing content below for reference]
```

**Step 3: Commit doc update**

```bash
git add docs/plans/2026-01-25-chip-drag-bugs.md && git commit -m "docs: mark chip drag bugs as resolved

Replaced with click-to-swap system.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```
