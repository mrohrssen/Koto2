# Speed Review Undo Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an undo button to speed review that lets users correct mistaken swipes within 5 seconds.

**Architecture:** Queue reviews with a 5-second delay before sending to JPDB. Swiping a new card flushes the pending review immediately. Undo cancels the pending review and restores the card to its slot.

**Tech Stack:** Vanilla JS, anime.js for animations, SVG for progress ring

---

### Task 1: Add Undo Button HTML

**Files:**
- Modify: `public/game.html:183-186`

**Step 1: Add undo button before close button**

In `.speed-review-header`, add the undo button with SVG icon and progress ring:

```html
<div class="speed-review-header">
  <span class="speed-review-counter" id="speed-review-counter">Cards Reviewed: 0 / 0</span>
  <button class="speed-review-undo inactive" id="speed-review-undo" title="Undo (5s)">
    <svg class="speed-review-undo-ring" viewBox="0 0 36 36">
      <circle class="ring-bg" cx="18" cy="18" r="16" fill="none" stroke="#333" stroke-width="2"/>
      <circle class="ring-progress" cx="18" cy="18" r="16" fill="none" stroke="#0ff" stroke-width="2"
        stroke-dasharray="100.53" stroke-dashoffset="0" transform="rotate(-90 18 18)"/>
    </svg>
    <span class="undo-icon">&#9194;</span>
  </button>
  <button class="takeover-close" id="speed-review-close">&times;</button>
</div>
```

**Step 2: Verify HTML renders**

Run: `npm start &` then open http://localhost:3000, start speed review
Expected: Undo button visible (unstyled) next to close button

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(speed-review): add undo button HTML structure"
```

---

### Task 2: Add Undo Button CSS

**Files:**
- Modify: `public/game.css` (find `.speed-review-header` section, around line 2800+)

**Step 1: Add undo button styles**

Add after existing `.speed-review-header` styles:

```css
/* Undo button */
.speed-review-undo {
  position: relative;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
}

.speed-review-undo.inactive {
  opacity: 0.3;
  pointer-events: none;
}

.speed-review-undo-ring {
  position: absolute;
  width: 36px;
  height: 36px;
  top: 0;
  left: 0;
}

.speed-review-undo-ring .ring-bg {
  stroke: #333;
}

.speed-review-undo-ring .ring-progress {
  stroke: #0ff;
  filter: drop-shadow(0 0 4px #0ff);
  transition: stroke-dashoffset 0.1s linear;
}

.speed-review-undo .undo-icon {
  font-size: 16px;
  color: #0ff;
  z-index: 1;
  filter: drop-shadow(0 0 2px #0ff);
}

.speed-review-undo.inactive .undo-icon {
  color: #666;
  filter: none;
}

/* Ring depletion animation */
@keyframes ring-deplete {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: 100.53; }
}

.speed-review-undo.active .ring-progress {
  animation: ring-deplete 5s linear forwards;
}
```

**Step 2: Verify styling**

Refresh browser, check:
- Undo button is greyed out
- Positioned nicely next to close button
- Ring SVG visible but dim

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(speed-review): add undo button CSS with progress ring"
```

---

### Task 3: Add DOM Reference

**Files:**
- Modify: `public/js/dom.js:96`

**Step 1: Add speedReviewUndo getter**

Find the speed review section (around line 96) and add:

```js
get speedReviewUndo() { return el('speed-review-undo'); },
```

**Step 2: Verify**

No runtime verification needed - syntax check:
```bash
node --check public/js/dom.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/dom.js
git commit -m "feat(speed-review): add undo button DOM reference"
```

---

### Task 4: Add Pending Review State

**Files:**
- Modify: `public/js/ui/speed-review.js:13-21`

**Step 1: Add pendingReview to state**

Update the state object:

```js
// Module state
let state = {
  queue: [],           // Words to review
  initialQueueSize: 0, // Fixed Y value for counter
  reviewedCount: 0,    // X value for counter
  reviewedBatch: [],   // Batch for refresh trigger
  activeCards: [null, null, null], // Current card in each slot
  callbacks: null,     // API callbacks
  pendingReview: null  // { word, slotIndex, grade, direction, timerId }
};
```

**Step 2: Syntax check**

```bash
node --check public/js/ui/speed-review.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat(speed-review): add pendingReview to state"
```

---

### Task 5: Implement Queue Review Logic

**Files:**
- Modify: `public/js/ui/speed-review.js`

**Step 1: Add constants and helper functions after line 28**

```js
const UNDO_WINDOW_MS = 5000; // 5 seconds to undo
const RING_CIRCUMFERENCE = 100.53; // 2 * PI * 16 (radius)

/**
 * Flush any pending review (send to JPDB immediately)
 */
function flushPendingReview() {
  if (!state.pendingReview) return;

  const { word, grade, timerId } = state.pendingReview;

  // Clear the timer
  if (timerId) clearTimeout(timerId);

  // Send the review
  if (word.vid !== undefined && word.sid !== undefined) {
    state.callbacks?.sendReview(word.vid, word.sid, grade);
  }

  // Clear pending state
  state.pendingReview = null;
  updateUndoButton(false);
}

/**
 * Queue a review with undo window
 */
function queueReview(slotIndex, word, grade, direction) {
  // Flush any existing pending review first
  flushPendingReview();

  // Start the undo timer
  const timerId = setTimeout(() => {
    // Time's up - send the review
    if (state.pendingReview?.word === word) {
      flushPendingReview();
    }
  }, UNDO_WINDOW_MS);

  // Store pending review
  state.pendingReview = { word, slotIndex, grade, direction, timerId };

  // Activate undo button with animation
  updateUndoButton(true);
}

/**
 * Update undo button state
 */
function updateUndoButton(active) {
  const btn = dom.speedReviewUndo;
  if (!btn) return;

  if (active) {
    btn.classList.remove('inactive');
    btn.classList.add('active');
    // Reset and restart animation
    const ring = btn.querySelector('.ring-progress');
    if (ring) {
      ring.style.animation = 'none';
      ring.offsetHeight; // Trigger reflow
      ring.style.animation = 'ring-deplete 5s linear forwards';
    }
  } else {
    btn.classList.add('inactive');
    btn.classList.remove('active');
  }
}
```

**Step 2: Syntax check**

```bash
node --check public/js/ui/speed-review.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat(speed-review): add queueReview and flushPendingReview"
```

---

### Task 6: Implement Undo Handler

**Files:**
- Modify: `public/js/ui/speed-review.js`

**Step 1: Add handleUndo and restoreCard functions**

Add after the updateUndoButton function:

```js
/**
 * Handle undo button click - cancel pending review and restore card
 */
function handleUndo() {
  if (!state.pendingReview) return;

  const { word, slotIndex, direction, timerId } = state.pendingReview;

  // Clear the timer
  if (timerId) clearTimeout(timerId);

  // Clear pending state BEFORE restoring (so card doesn't re-queue)
  state.pendingReview = null;
  updateUndoButton(false);

  // Restore the card
  restoreCard(slotIndex, word, direction);

  // Decrement counter
  state.reviewedCount--;
  state.reviewedBatch.pop();
  updateCounter();

  playSFX('button-tap');
}

/**
 * Restore a card to its slot after undo
 */
function restoreCard(slotIndex, word, direction) {
  const slot = dom.speedReviewSlots[slotIndex];
  state.activeCards[slotIndex] = word;

  // Render the card (same as fillSlot but already flipped)
  const hintText = '&larr; didn\'t know &nbsp; | &nbsp; knew it &rarr;';

  slot.innerHTML = `
    <div class="flash-card flipped" data-slot="${slotIndex}">
      <div class="flash-card-front">${escapeHtml(word.word)}</div>
      <div class="flash-card-back">
        <div class="flash-card-word">${word.reading && word.reading !== word.word
          ? `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`
          : escapeHtml(word.word)}</div>
        <div class="flash-card-meaning">${formatMeanings(word.meanings)}</div>
        <div class="flash-card-hint">${hintText}</div>
      </div>
    </div>
  `;

  const card = slot.querySelector('.flash-card');

  // Animate card sliding back in from where it left
  const startX = direction === 'right' ? 300 : -300;
  card.style.transform = `translateX(${startX}px)`;
  card.style.opacity = '0';

  anime(card, {
    translateX: 0,
    opacity: 1,
  }, {
    duration: 200,
    ease: 'outBack'
  });

  // Re-setup interaction (card is already flipped)
  setupCardInteraction(card, slotIndex, word);
  slotState[slotIndex].flipped = true;
}
```

**Step 2: Syntax check**

```bash
node --check public/js/ui/speed-review.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat(speed-review): add handleUndo and restoreCard"
```

---

### Task 7: Wire Up Event Listeners and Modify gradeCard

**Files:**
- Modify: `public/js/ui/speed-review.js`

**Step 1: Add undo button listener in init()**

Update the `init` function (around line 32-38):

```js
export function init(callbacks) {
  state.callbacks = callbacks;

  // Close button handler is set up in takeover.js init
  // But we need to handle exit logic
  dom.speedReviewClose.addEventListener('click', handleExit);

  // Undo button handler
  dom.speedReviewUndo.addEventListener('click', handleUndo);
}
```

**Step 2: Modify gradeCard to use queueReview**

Find the `gradeCard` function (around line 271) and replace the JPDB review section:

Change this (lines 288-291):
```js
  // Send review to JPDB
  if (word.vid !== undefined && word.sid !== undefined) {
    state.callbacks?.sendReview(word.vid, word.sid, grade);
  }
```

To this:
```js
  // Queue review (will send after 5s unless undone or new review)
  queueReview(slotIndex, word, grade, direction);
```

**Step 3: Modify handleExit to flush pending**

Find `handleExit` function (around line 362) and add flush at the start:

```js
async function handleExit() {
  // Send any pending review before closing
  flushPendingReview();

  // Trigger final batch refresh if any pending
  if (state.reviewedBatch.length > 0) {
    await triggerBatchRefresh();
  }
  // ... rest unchanged
```

**Step 4: Reset pending state in start()**

Find the `start` function (around line 59) and add reset after line 70:

```js
  state.pendingReview = null;
  updateUndoButton(false);
```

**Step 5: Syntax check**

```bash
node --check public/js/ui/speed-review.js && echo "OK"
```

**Step 6: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat(speed-review): wire up undo button and modify gradeCard"
```

---

### Task 8: Manual Testing

**Step 1: Start the server**

```bash
pkill -f "node server.js" 2>/dev/null; npm start &
sleep 3
```

**Step 2: Test in browser**

Open http://localhost:3000 and test:

1. **Undo button appears greyed out** - Check header shows undo button, inactive
2. **Swipe activates undo** - Swipe a card, undo button lights up with ring animation
3. **Undo restores card** - Click undo within 5s, card slides back in (flipped)
4. **Counter decrements on undo** - Counter goes back down
5. **5-second timeout** - Wait 5s, undo button goes inactive
6. **Rapid swipe flushes previous** - Swipe two cards quickly, only last is undoable
7. **Exit flushes pending** - Swipe card, immediately close, review should send

**Step 3: Commit any fixes if needed**

---

### Task 9: Run E2E Tests

**Step 1: Run the test suite**

```bash
pkill -f "node server.js" 2>/dev/null
./scripts/e2e-test.sh
```

**Step 2: Verify results**

Expected: 60+/66 tests pass (known flakiness acceptable)

**Step 3: Final commit if all good**

```bash
git add -A
git commit -m "feat(speed-review): complete undo button implementation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add undo button HTML | game.html |
| 2 | Add undo button CSS | game.css |
| 3 | Add DOM reference | dom.js |
| 4 | Add pending review state | speed-review.js |
| 5 | Implement queue/flush logic | speed-review.js |
| 6 | Implement undo/restore | speed-review.js |
| 7 | Wire up listeners | speed-review.js |
| 8 | Manual testing | - |
| 9 | E2E tests | - |
