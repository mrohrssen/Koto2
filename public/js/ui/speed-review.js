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
