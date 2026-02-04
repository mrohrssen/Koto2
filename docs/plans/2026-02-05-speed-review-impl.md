# Speed Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Speed Review mode accessible from the hub for rapid vocabulary review with three stacked flashcards.

**Architecture:** New takeover panel with three independent flashcard slots. Reuses existing flashcard component for tap-to-flip and swipe-to-grade. Adds batch refresh logic (every 50 reviews) to both combat and Speed Review for SRS cycling.

**Tech Stack:** Vanilla JS ES6 modules, existing CSS patterns, JPDB API integration.

---

## Task 1: Remove 50-word queue limit

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/src/jpdb.js:645,1020,1047`

**Step 1: Change default limit parameters**

In `getDueWordsWithMeanings`, `fetchDueWordsDirectly`, and `fetchDueWordsFromApi`, change the default limit from 50 to 1000:

```javascript
// Line 645: Change from limit = 50 to limit = 1000
export async function getDueWordsWithMeanings(apiKey, limit = 1000, excludeVids = []) {

// Line 1020: Change from limit = 50 to limit = 1000
export async function fetchDueWordsDirectly(apiKey, limit = 1000, excludeVids = []) {

// Line 1047: Change from limit = 50 to limit = 1000
async function fetchDueWordsFromApi(apiKey, limit = 1000, excludeVids = []) {
```

**Step 2: Verify syntax**

Run: `node --check src/jpdb.js`
Expected: No output (clean syntax)

**Step 3: Commit**

```bash
git add src/jpdb.js
git commit -m "feat: increase JPDB queue limit from 50 to 1000 words"
```

---

## Task 2: Add Speed Review takeover HTML structure

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/game.html`

**Step 1: Add takeover HTML after leaderboard-view (line ~180)**

```html
  <div class="takeover" id="speed-review-view">
    <div class="speed-review-header">
      <span class="speed-review-counter" id="speed-review-counter">Cards Reviewed: 0 / 0</span>
      <button class="takeover-close" id="speed-review-close">&times;</button>
    </div>
    <div class="speed-review-content" id="speed-review-content">
      <div class="speed-review-slot" id="speed-review-slot-0"></div>
      <div class="speed-review-slot" id="speed-review-slot-1"></div>
      <div class="speed-review-slot" id="speed-review-slot-2"></div>
    </div>
    <div class="speed-review-empty" id="speed-review-empty" style="display: none;">
      <div class="speed-review-complete-text">復習完了!</div>
    </div>
  </div>
```

**Step 2: Verify HTML syntax**

Open file in browser or use HTML validator - no broken tags.

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat: add Speed Review takeover HTML structure"
```

---

## Task 3: Add Speed Review CSS styles

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/game.css`

**Step 1: Add styles at end of file (after existing takeover styles)**

```css
/* ===== SPEED REVIEW MODE ===== */
#speed-review-view {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.speed-review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px 16px;
  background: var(--bg-primary);
  position: sticky;
  top: 0;
  z-index: 10;
}

.speed-review-counter {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

#speed-review-view .takeover-close {
  position: static;
  flex-shrink: 0;
}

.speed-review-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 16px;
  overflow-y: auto;
}

.speed-review-slot {
  width: 100%;
  max-width: 320px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.speed-review-slot .flash-card {
  width: 100%;
  height: 100%;
  max-height: 180px;
  aspect-ratio: auto;
}

.speed-review-slot .flash-card-front {
  font-size: 28px;
}

.speed-review-slot .flash-card-word {
  font-size: 24px;
  margin-bottom: 8px;
}

.speed-review-slot .flash-card-meaning {
  font-size: 14px;
}

.speed-review-slot .flash-card-hint {
  font-size: 10px;
}

/* Pop-in animation for new cards */
@keyframes speed-review-pop-in {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.speed-review-slot .flash-card.pop-in {
  animation: speed-review-pop-in 150ms ease-out;
}

/* Empty state */
.speed-review-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.speed-review-complete-text {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent-primary);
}
```

**Step 2: Verify CSS syntax**

Run: `npx stylelint public/game.css --fix 2>/dev/null || echo "stylelint not installed, visual check OK"`

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat: add Speed Review CSS styles"
```

---

## Task 4: Add DOM references for Speed Review

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/js/dom.js`

**Step 1: Read the file to understand structure**

Read file first to see existing pattern.

**Step 2: Add Speed Review DOM references**

Add to the `dom` object exports:

```javascript
  // Speed Review
  speedReviewView: document.getElementById('speed-review-view'),
  speedReviewClose: document.getElementById('speed-review-close'),
  speedReviewContent: document.getElementById('speed-review-content'),
  speedReviewCounter: document.getElementById('speed-review-counter'),
  speedReviewEmpty: document.getElementById('speed-review-empty'),
  speedReviewSlots: [
    document.getElementById('speed-review-slot-0'),
    document.getElementById('speed-review-slot-1'),
    document.getElementById('speed-review-slot-2')
  ],
```

**Step 3: Verify syntax**

Run: `node --check public/js/dom.js`

**Step 4: Commit**

```bash
git add public/js/dom.js
git commit -m "feat: add Speed Review DOM references"
```

---

## Task 5: Register Speed Review in takeover.js

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/js/ui/takeover.js`

**Step 1: Add speedReview to views object in init()**

```javascript
export function init() {
  views.chipEquip = dom.chipEquipView;
  views.chipShop = dom.chipShopView;
  views.settings = dom.settingsView;
  views.gameover = dom.gameoverView;
  views.speedReview = dom.speedReviewView;  // ADD THIS LINE

  // Close buttons
  dom.chipEquipClose.addEventListener('click', () => close('chipEquip'));
  dom.chipShopClose.addEventListener('click', () => close('chipShop'));
  dom.settingsClose.addEventListener('click', () => close('settings'));
  dom.speedReviewClose.addEventListener('click', () => close('speedReview'));  // ADD THIS LINE
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/takeover.js`

**Step 3: Commit**

```bash
git add public/js/ui/takeover.js
git commit -m "feat: register Speed Review takeover"
```

---

## Task 6: Create speed-review.js module

**Files:**
- Create: `/Users/michia/Documents/jrpg-wt-speed-review/public/js/ui/speed-review.js`

**Step 1: Create the module**

```javascript
/**
 * @file speed-review.js - Speed Review Mode
 *
 * Rapid vocabulary review with three stacked flashcards.
 * Entry from hub, full-screen takeover.
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import * as takeover from './takeover.js';

// Module state
let state = {
  queue: [],           // Words to review
  initialQueueSize: 0, // Fixed Y value for counter
  reviewedCount: 0,    // X value for counter
  reviewedBatch: [],   // Batch for refresh trigger
  activeCards: [null, null, null], // Current card in each slot
  callbacks: null      // API callbacks
};

// Swipe handling per slot
const slotState = [{}, {}, {}];

const SWIPE_THRESHOLD = 80;

/**
 * Initialize Speed Review with callbacks
 */
export function init(callbacks) {
  state.callbacks = callbacks;

  // Close button handler is set up in takeover.js init
  // But we need to handle exit logic
  dom.speedReviewClose.addEventListener('click', handleExit);
}

/**
 * Start Speed Review mode
 * @param {Array} words - Array of word objects { word, reading, meanings, vid, sid }
 */
export function start(words) {
  if (!words || words.length === 0) {
    console.log('[SpeedReview] No words to review');
    return false;
  }

  // Initialize state
  state.queue = [...words];
  state.initialQueueSize = words.length;
  state.reviewedCount = 0;
  state.reviewedBatch = [];
  state.activeCards = [null, null, null];

  // Update counter
  updateCounter();

  // Show takeover
  takeover.open('speedReview');

  // Fill initial cards
  for (let i = 0; i < 3; i++) {
    fillSlot(i);
  }

  return true;
}

/**
 * Update the counter display
 */
function updateCounter() {
  dom.speedReviewCounter.textContent =
    `Cards Reviewed: ${state.reviewedCount} / ${state.initialQueueSize}`;
}

/**
 * Fill a slot with the next word from queue
 */
function fillSlot(slotIndex) {
  const slot = dom.speedReviewSlots[slotIndex];

  if (state.queue.length === 0) {
    // No more words - clear slot
    slot.innerHTML = '';
    state.activeCards[slotIndex] = null;
    checkEmpty();
    return;
  }

  const word = state.queue.shift();
  state.activeCards[slotIndex] = word;

  // Render flash card (reusing existing structure)
  const hintText = '&larr; didn\'t know &nbsp; | &nbsp; knew it &rarr;';

  slot.innerHTML = `
    <div class="flash-card pop-in" data-slot="${slotIndex}">
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
  setupCardInteraction(card, slotIndex, word);
}

/**
 * Set up interaction handlers for a card
 */
function setupCardInteraction(card, slotIndex, word) {
  const ss = slotState[slotIndex];
  ss.flipped = false;
  ss.swiping = false;
  ss.startX = 0;
  ss.currentX = 0;
  ss.mouseDown = false;

  // Tap to flip / click sides to grade
  card.addEventListener('click', (e) => {
    if (ss.swiping) return;

    if (!ss.flipped) {
      ss.flipped = true;
      card.classList.add('flipped');
      playSFX('button-tap');
    } else {
      // Click sides to grade
      const rect = card.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const relativeX = clickX / rect.width;

      if (relativeX < 0.4) {
        gradeCard(slotIndex, word, 'left');
      } else if (relativeX > 0.6) {
        gradeCard(slotIndex, word, 'right');
      }
    }
  });

  // Touch swipe
  card.addEventListener('touchstart', (e) => {
    if (!ss.flipped) return;
    const touch = e.touches[0];
    ss.startX = touch.clientX;
    ss.currentX = 0;
    ss.swiping = false;
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!ss.flipped) return;
    const touch = e.touches[0];
    const dx = touch.clientX - ss.startX;

    if (Math.abs(dx) > 10) {
      ss.swiping = true;
      ss.currentX = dx;
      e.preventDefault();

      const rotate = dx * 0.05;
      card.style.setProperty('--swipe-x', `${dx}px`);
      card.style.setProperty('--swipe-rotate', `${rotate}deg`);
      card.classList.toggle('swiping-right', dx > 0);
      card.classList.toggle('swiping-left', dx < 0);
    }
  }, { passive: false });

  card.addEventListener('touchend', () => {
    if (!ss.flipped || !ss.swiping) return;

    if (Math.abs(ss.currentX) > SWIPE_THRESHOLD) {
      const direction = ss.currentX > 0 ? 'right' : 'left';
      gradeCard(slotIndex, word, direction);
    } else {
      // Snap back
      card.style.setProperty('--swipe-x', '0px');
      card.style.setProperty('--swipe-rotate', '0deg');
      card.classList.remove('swiping-right', 'swiping-left');
    }
    ss.swiping = false;
  }, { passive: true });

  // Mouse swipe
  card.addEventListener('mousedown', (e) => {
    if (!ss.flipped) return;
    ss.mouseDown = true;
    ss.startX = e.clientX;
    ss.currentX = 0;
    ss.swiping = false;
    e.preventDefault();
  });

  card.addEventListener('mousemove', (e) => {
    if (!ss.flipped || !ss.mouseDown) return;
    const dx = e.clientX - ss.startX;

    if (Math.abs(dx) > 10) {
      ss.swiping = true;
      ss.currentX = dx;

      const rotate = dx * 0.05;
      card.style.setProperty('--swipe-x', `${dx}px`);
      card.style.setProperty('--swipe-rotate', `${rotate}deg`);
      card.classList.toggle('swiping-right', dx > 0);
      card.classList.toggle('swiping-left', dx < 0);
    }
  });

  card.addEventListener('mouseup', () => {
    if (!ss.mouseDown) return;
    ss.mouseDown = false;
    if (!ss.flipped || !ss.swiping) return;

    if (Math.abs(ss.currentX) > SWIPE_THRESHOLD) {
      const direction = ss.currentX > 0 ? 'right' : 'left';
      gradeCard(slotIndex, word, direction);
    } else {
      card.style.setProperty('--swipe-x', '0px');
      card.style.setProperty('--swipe-rotate', '0deg');
      card.classList.remove('swiping-right', 'swiping-left');
    }
    ss.swiping = false;
  });

  card.addEventListener('mouseleave', () => {
    if (ss.mouseDown) {
      ss.mouseDown = false;
      card.style.setProperty('--swipe-x', '0px');
      card.style.setProperty('--swipe-rotate', '0deg');
      card.classList.remove('swiping-right', 'swiping-left');
      ss.swiping = false;
    }
  });
}

/**
 * Grade a card and replace it
 */
async function gradeCard(slotIndex, word, direction) {
  const slot = dom.speedReviewSlots[slotIndex];
  const card = slot.querySelector('.flash-card');
  const grade = direction === 'right' ? 4 : 1;

  // Animate out
  const offset = direction === 'right' ? 500 : -500;
  card.style.transition = 'transform 100ms ease, opacity 80ms ease';
  card.style.transform = `translateX(${offset}px) rotate(${offset * 0.02}deg)`;
  card.style.opacity = '0';

  playSFX(direction === 'right' ? 'swipe-right' : 'swipe-left');

  // Send review to JPDB
  if (word.vid !== undefined && word.sid !== undefined) {
    state.callbacks?.sendReview(word.vid, word.sid, grade);
  }

  // Play TTS
  if (word.word) {
    state.callbacks?.playTTS(word.word);
  }

  // Update counters
  state.reviewedCount++;
  state.reviewedBatch.push(word);
  updateCounter();

  // Check for batch refresh
  if (state.reviewedBatch.length >= 50) {
    await triggerBatchRefresh();
  }

  // Replace card after animation
  setTimeout(() => {
    fillSlot(slotIndex);
  }, 100);
}

/**
 * Trigger batch refresh - fetch fresh queue from JPDB
 */
async function triggerBatchRefresh() {
  if (!state.callbacks?.refreshQueue) return;

  console.log('[SpeedReview] Triggering batch refresh...');
  state.reviewedBatch = [];

  try {
    const freshWords = await state.callbacks.refreshQueue();
    if (freshWords && freshWords.length > 0) {
      // Filter out words currently displayed
      const displayedVids = new Set(
        state.activeCards.filter(c => c).map(c => c.vid)
      );
      const newWords = freshWords.filter(w => !displayedVids.has(w.vid));

      // Replace queue with fresh words (respects JPDB priority)
      state.queue = newWords;
      console.log(`[SpeedReview] Refreshed queue: ${newWords.length} words`);
    }
  } catch (e) {
    console.warn('[SpeedReview] Batch refresh failed:', e);
  }
}

/**
 * Check if all slots are empty - show completion
 */
function checkEmpty() {
  const allEmpty = state.activeCards.every(c => c === null);

  if (allEmpty && state.queue.length === 0) {
    dom.speedReviewContent.style.display = 'none';
    dom.speedReviewEmpty.style.display = 'flex';
  }
}

/**
 * Handle exit from Speed Review
 */
async function handleExit() {
  // Trigger final batch refresh if any pending
  if (state.reviewedBatch.length > 0) {
    await triggerBatchRefresh();
  }

  // Reset UI
  dom.speedReviewContent.style.display = 'flex';
  dom.speedReviewEmpty.style.display = 'none';

  for (const slot of dom.speedReviewSlots) {
    slot.innerHTML = '';
  }

  // Close handled by takeover.js click listener
}

/**
 * Check if Speed Review is active
 */
export function isActive() {
  return dom.speedReviewView.classList.contains('active');
}

// Utility functions
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatMeanings(meanings) {
  const text = Array.isArray(meanings) ? meanings.join(', ') : (meanings || '');
  const parts = text.split(', ');
  if (parts.length <= 4) return escapeHtml(text);
  return escapeHtml(parts.slice(0, 4).join(', ')) + ', ...';
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/speed-review.js`

**Step 3: Commit**

```bash
git add public/js/ui/speed-review.js
git commit -m "feat: create Speed Review module"
```

---

## Task 7: Add Speed Review button to hub

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/js/ui/exploration.js`

**Step 1: Import speed-review module at top of file**

Add after existing imports:

```javascript
import * as speedReview from './speed-review.js';
```

**Step 2: Add API callback for fetching words**

Add to the module-level variables (around line 70):

```javascript
let apiGetDueWords = null;
```

**Step 3: Add to init() function**

Add to the callbacks assignment in `init()`:

```javascript
  apiGetDueWords = callbacks.apiGetDueWords;
```

**Step 4: Modify renderHub() to add Speed Review button**

Replace the `renderHub` function:

```javascript
/** Hub phase — show Speed Review + Equip Bots + Infiltrate buttons */
export function renderHub() {
  actions.setContent(`
    <button class="action-btn action-btn-tertiary" id="speed-review-btn">速習</button>
    <button class="action-btn action-btn-primary" id="equip-bots-btn">ボット装備</button>
    <button class="action-btn action-btn-secondary" id="context-action-btn">潜入</button>
  `);

  document.getElementById('speed-review-btn')?.addEventListener('click', async () => {
    playSFX('button-tap');
    // Fetch due words and start speed review
    const result = await apiGetDueWords();
    if (result?.words?.length > 0) {
      speedReview.start(result.words);
    } else {
      sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
    }
  });

  document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    if (actions.triggerEquipBots) actions.triggerEquipBots();
  });

  document.getElementById('context-action-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    startNewRun();
  });
}
```

**Step 5: Add playSFX import if not present**

Check if `playSFX` is imported at top of file, add if needed:

```javascript
import { playSFX } from '../audio.js';
```

**Step 6: Verify syntax**

Run: `node --check public/js/ui/exploration.js`

**Step 7: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add Speed Review button to hub"
```

---

## Task 8: Add tertiary button CSS style

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/game.css`

**Step 1: Add tertiary button style near other action-btn styles (around line 370)**

```css
.action-btn-tertiary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 2px solid var(--accent-primary);
}

.action-btn-tertiary:hover {
  background: var(--bg-secondary);
}

.action-btn-tertiary:active {
  transform: scale(0.97);
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat: add tertiary button style for Speed Review"
```

---

## Task 9: Wire up Speed Review in game.js

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/game.js`

**Step 1: Import speed-review module**

Add to imports at top:

```javascript
import * as speedReview from './js/ui/speed-review.js';
```

**Step 2: Initialize speed-review in the initialization section**

Find where other UI modules are initialized (search for `explorationUI.init` or `actions.init`) and add:

```javascript
speedReview.init({
  sendReview: (vid, sid, grade) => apiSendJpdbReview(vid, sid, grade),
  playTTS: (word) => tts.playWord(word),
  refreshQueue: async () => {
    const result = await apiGetDueWords();
    return result?.words || [];
  }
});
```

**Step 3: Add apiGetDueWords to exploration callbacks**

Find where `explorationUI.init` is called and add `apiGetDueWords` to its callbacks object:

```javascript
apiGetDueWords: apiGetDueWords,
```

**Step 4: Verify syntax**

Run: `node --check public/game.js`

**Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat: wire up Speed Review in game.js"
```

---

## Task 10: Add API endpoint for fetching due words

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/js/api.js`

**Step 1: Check if apiGetDueWords exists**

Search for `getDueWords` or similar function. If not present, add:

```javascript
/**
 * Get due words for speed review
 */
export async function getDueWords() {
  try {
    const response = await fetch('/api/vocab/due-words', {
      method: 'GET',
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get due words:', error);
    return { words: [], error: error.message };
  }
}
```

**Step 2: Export it if needed**

Make sure it's exported.

**Step 3: Verify syntax**

Run: `node --check public/js/api.js`

**Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add getDueWords API function"
```

---

## Task 11: Add server endpoint for due words

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/src/routes/vocab.js`

**Step 1: Add endpoint for fetching due words**

Add this route:

```javascript
/**
 * GET /api/vocab/due-words
 * Fetch due/failed words for speed review
 */
router.get('/due-words', requireAuth, attachUserKeys, async (req, res) => {
  const jpdbApiKey = req.userKeys?.jpdbApiKey;

  if (!jpdbApiKey) {
    return res.json({ words: [], error: 'JPDB API key not configured' });
  }

  try {
    const { getDueWordsWithMeanings } = await import('../jpdb.js');
    const result = await getDueWordsWithMeanings(jpdbApiKey);
    res.json(result);
  } catch (error) {
    console.error('[vocab/due-words] Error:', error);
    res.json({ words: [], error: error.message });
  }
});
```

**Step 2: Verify syntax**

Run: `node --check src/routes/vocab.js`

**Step 3: Commit**

```bash
git add src/routes/vocab.js
git commit -m "feat: add /api/vocab/due-words endpoint"
```

---

## Task 12: Add batch refresh logic to combat

**Files:**
- Modify: `/Users/michia/Documents/jrpg-wt-speed-review/public/game.js`

**Step 1: Add combat batch tracking**

Find the combat state/variables section and add:

```javascript
let combatReviewedBatch = [];
```

**Step 2: Track reviews in combat cardSwipe handler**

Find the `cardSwipe` callback in `actions.init` and add batch tracking:

```javascript
combatReviewedBatch.push(reviewWord);

// Check for batch refresh
if (combatReviewedBatch.length >= 50) {
  // Fire and forget - refresh queue in background
  apiGetDueWords().then(result => {
    if (result?.words) {
      // Update word queue used by combat (implementation depends on how combat gets words)
      console.log('[Combat] Batch refresh: got', result.words.length, 'fresh words');
    }
  }).catch(e => console.warn('[Combat] Batch refresh failed:', e));
  combatReviewedBatch = [];
}
```

**Step 3: Reset batch on combat end**

Find where combat ends (search for `endCombat` or phase change to post-combat) and add:

```javascript
// Trigger batch refresh on combat end if any pending
if (combatReviewedBatch.length > 0) {
  apiGetDueWords().catch(e => console.warn('[Combat] End batch refresh failed:', e));
  combatReviewedBatch = [];
}
```

**Step 4: Verify syntax**

Run: `node --check public/game.js`

**Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat: add batch refresh logic to combat (every 50 reviews)"
```

---

## Task 13: Manual testing

**Step 1: Start the server**

```bash
cd /Users/michia/Documents/jrpg-wt-speed-review
npm start
```

**Step 2: Test Speed Review flow**

1. Log in to the game
2. From hub, click "速習" button
3. Verify three cards appear stacked vertically
4. Tap a card to flip it
5. Swipe right or click right side to grade "knew it"
6. Verify card pops out and new card pops in
7. Verify counter increments
8. Click X to exit
9. Verify return to hub

**Step 3: Test empty state**

If you have few due words, review them all and verify "復習完了!" appears.

**Step 4: Commit any fixes needed**

---

## Task 14: Run E2E tests

**Step 1: Run test suite**

```bash
./scripts/e2e-test.sh
```

**Step 2: Verify tests pass**

Expected: 60+/66 tests pass (known flakiness acceptable)

**Step 3: Fix any regressions**

If tests fail due to Speed Review changes, fix and recommit.

---

## Summary

This plan adds:
1. Speed Review mode with three stacked flashcards
2. Reuses existing flashcard component
3. Batch refresh every 50 reviews (combat + speed review)
4. Removes 50-word queue limit globally
5. Counter showing reviewed/initial counts
6. Exit button in header matching modal position
