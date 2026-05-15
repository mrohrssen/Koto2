import { apiUrl } from '../api.js';
import { dom } from '../dom.js';
import { playSFX, playBGMRandomStart, playBGM } from '../audio.js';
import * as takeover from './takeover.js';
import { animate as anime } from 'animejs';
import { setKnownWords } from './bootstrap-client.js';
import { escapeHtml } from './html-utils.js';
import { buildHeadwordRuby } from './romaji.js';
import { showWordLevelUp } from './word-level-up.js';

// Module state
let state = {
  queue: [],           // Words to review
  initialQueueSize: 0, // Fixed Y value for counter
  reviewedCount: 0,    // X value for counter
  reviewedBatch: [],   // Batch for refresh trigger
  activeCards: [null, null, null], // Current card in each slot
  callbacks: null,     // API callbacks
  pendingReview: null, // { word, slotIndex, grade, direction, timerId }
  reviewPromises: [],  // Track in-flight review HTTP requests
  inactivityTimer: null, // 30-second inactivity timer
  session: {
    mode: 'hub',
    maxCards: null,
    onCommittedReview: null,
    onComplete: null,
    onExit: null,
    canCloseEarly: true,
    committedReviews: 0,
    completionTriggered: false,
    commitDeliveryChain: Promise.resolve(),
    completionPromise: null,
    completing: false,
    showRomaji: false
  }
};

// Swipe handling per slot
const slotState = [{}, {}, {}];

const SWIPE_THRESHOLD = 80;
const PREFETCH_AHEAD = 5; // How many words to prefetch beyond visible cards
const UNDO_WINDOW_MS = 5000; // 5 seconds to undo
const RING_CIRCUMFERENCE = 100.53; // 2 * PI * 16 (radius)
const BATCH_REFRESH_SIZE = 10; // Refresh queue after this many reviews
const INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds of no activity triggers sync

function resolveSessionOptions(options = {}) {
  const mode = options.mode === 'room' ? 'room' : 'hub';
  return {
    mode,
    maxCards: Number.isInteger(options.maxCards) && options.maxCards > 0
      ? options.maxCards
      : (mode === 'room' ? 10 : null),
    onCommittedReview: typeof options.onCommittedReview === 'function' ? options.onCommittedReview : null,
    onComplete: typeof options.onComplete === 'function' ? options.onComplete : null,
    onExit: typeof options.onExit === 'function' ? options.onExit : null,
    canCloseEarly: typeof options.canCloseEarly === 'boolean' ? options.canCloseEarly : mode === 'hub',
    committedReviews: 0,
    completionTriggered: false,
    commitDeliveryChain: Promise.resolve(),
    completionPromise: null,
    exitNotified: false,
    completing: false,
    showRomaji: options.showRomaji === true
  };
}

function canCloseNow() {
  if (state.session.canCloseEarly) return true;
  return state.session.completionTriggered;
}

function updateCloseButtonAvailability() {
  const closeBtn = dom.speedReviewClose;
  if (!closeBtn) return;
  const enabled = canCloseNow();
  const closeRequiresCompletion = state.session.canCloseEarly === false;
  closeBtn.disabled = false;
  closeBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  closeBtn.classList.toggle('speed-review-close-locked', closeRequiresCompletion && !enabled);
  closeBtn.classList.toggle('speed-review-close-ready', closeRequiresCompletion && enabled);
}

function showCloseBlockedHint() {
  showWordLevelUp(dom.speedReviewView || document.body, '', { message: 'Not yet!' });
}

function clearRoomCompletionError() {
  const existing = document.getElementById('speed-review-room-error');
  if (existing) existing.remove();
}

function showRoomCompletionError(errorMessage) {
  if (state.session.mode !== 'room') return;
  const container = dom.speedReviewEmpty;
  if (!container) return;

  clearRoomCompletionError();

  const panel = document.createElement('div');
  panel.id = 'speed-review-room-error';
  panel.style.marginTop = '12px';
  panel.style.padding = '10px';
  panel.style.border = '1px solid rgba(255,80,80,0.7)';
  panel.style.borderRadius = '8px';
  panel.style.background = 'rgba(60, 0, 0, 0.35)';
  panel.style.textAlign = 'center';
  panel.innerHTML = `
    <div style="font-size:12px;margin-bottom:8px;color:#ffb7b7;">
      ${escapeHtml(errorMessage || 'Review sync failed. Please retry.')}
    </div>
    <button id="speed-review-room-retry-btn" class="ui-btn ui-btn--primary">Retry Sync</button>
  `;
  container.appendChild(panel);

  document.getElementById('speed-review-room-retry-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    clearRoomCompletionError();
    void handleCompletion();
  });
}

/**
 * Flush any pending review (send to internal FSRS)
 */
function flushPendingReview() {
  if (!state.pendingReview) return null;

  const { word, grade, timerId } = state.pendingReview;
  const direction = state.pendingReview.direction;

  // Clear the timer
  if (timerId) clearTimeout(timerId);

  const tasks = [];
  if (word.word) {
    tasks.push(Promise.resolve(state.callbacks?.sendReview(undefined, undefined, grade, word.word)));
    if (state.session.onCommittedReview) {
      const enqueueCommit = async () => {
        const commitIndex = state.session.committedReviews;
        const result = await state.session.onCommittedReview({
          word,
          grade,
          direction,
          commitIndex
        });
        if (result?.error) {
          throw new Error(result.error);
        }
        // Increment commit index only after successful server commit.
        state.session.committedReviews += 1;
        return result;
      };
      const commitPromise = state.session.commitDeliveryChain.then(enqueueCommit);
      // Keep the chain strict; if a commit fails, subsequent commits remain blocked
      // to avoid accidental commit-index desync.
      state.session.commitDeliveryChain = commitPromise;
      tasks.push(commitPromise);
    }
  }

  // Clear pending state
  state.pendingReview = null;
  updateUndoButton(false);
  updateCloseButtonAvailability();

  if (tasks.length === 0) {
    return null;
  }

  const reviewPromise = state.session.mode === 'room'
    ? Promise.all(tasks)
    : Promise.allSettled(tasks).then((results) => {
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected) {
        console.warn('[SpeedReview] Pending review callback failed:', rejected.reason);
      }
      return results;
    });
  state.reviewPromises.push(reviewPromise);
  reviewPromise.finally(() => {
    const idx = state.reviewPromises.indexOf(reviewPromise);
    if (idx !== -1) state.reviewPromises.splice(idx, 1);
  });
  return reviewPromise;
}

/**
 * Reset the inactivity timer
 */
function resetInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
  }
  state.inactivityTimer = setTimeout(handleInactivityTimeout, INACTIVITY_TIMEOUT_MS);
}

/**
 * Clear the inactivity timer
 */
function clearInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    state.inactivityTimer = null;
  }
}

/**
 * Handle 30 seconds of inactivity - sync reviews and refresh queue
 */
async function handleInactivityTimeout() {
  console.log('[SpeedReview] Inactivity timeout - syncing reviews...');

  // Flush any pending undo review
  flushPendingReview();

  // Wait for all in-flight reviews to complete
  if (state.reviewPromises.length > 0) {
    console.log(`[SpeedReview] Waiting for ${state.reviewPromises.length} pending reviews...`);
    try {
      await Promise.all(state.reviewPromises);
    } catch (error) {
      if (state.session.mode === 'room') {
        showRoomCompletionError(error?.message || 'Review sync failed. Please retry.');
      } else {
        console.warn('[SpeedReview] Inactivity sync failed:', error);
      }
    }
  }

  // Refresh the queue if there are pending batch reviews
  if (state.session.mode === 'hub' && state.reviewedBatch.length > 0) {
    await triggerBatchRefresh();
  }

  // Restart the timer if still active
  if (isActive()) {
    resetInactivityTimer();
  }
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
    // Reset ring to start position for next use
    const ring = btn.querySelector('.ring-progress');
    if (ring) {
      ring.style.animation = 'none';
      ring.style.strokeDashoffset = '0';
    }
  }
}

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
      <div class="flash-card-front">${displayWordHtml(word)}</div>
      <div class="flash-card-back">
        <div class="flash-card-word">${displayWordHtml(word)}</div>
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

/**
 * Initialize Speed Review with callbacks
 */
export function init(callbacks) {
  state.callbacks = callbacks;

  dom.speedReviewClose.addEventListener('click', (event) => {
    if (canCloseNow()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showCloseBlockedHint();
  }, true);

  // Close button handler is set up in takeover.js init
  // But we need to handle exit logic
  dom.speedReviewClose.addEventListener('click', handleExit);

  // Undo button handler
  dom.speedReviewUndo.addEventListener('click', handleUndo);
}

/**
 * Prefetch TTS audio for words in the queue
 * @param {number} count - How many words to prefetch from queue start
 */
function prefetchQueueAudio(count) {
  if (!state.callbacks?.prefetchTTS) return;

  const toPrefetch = state.queue.slice(0, count);
  for (const word of toPrefetch) {
    if (word.word) {
      state.callbacks.prefetchTTS(word.word);
    }
  }
}

/**
 * Start Speed Review mode
 * @param {Array} words - Array of word objects { word, reading, meanings }
 */
export function start(words, options = {}) {
  if (!words || words.length === 0) {
    console.log('[SpeedReview] No words to review');
    return false;
  }

  const session = resolveSessionOptions(options);
  const initialWords = session.mode === 'room' && session.maxCards
    ? words.slice(0, session.maxCards)
    : [...words];

  // Initialize state
  state.queue = initialWords;
  state.initialQueueSize = initialWords.length;
  state.reviewedCount = 0;
  state.reviewedBatch = [];
  state.activeCards = [null, null, null];
  state.pendingReview = null;
  state.reviewPromises = [];
  state.session = session;
  updateUndoButton(false);
  clearRoomCompletionError();
  updateCloseButtonAvailability();

  // Start inactivity timer
  resetInactivityTimer();

  // Prefetch TTS for initial cards (3) plus look-ahead
  prefetchQueueAudio(3 + PREFETCH_AHEAD);

  // Update counter
  updateCounter();

  // Show takeover
  takeover.open('speedReview');

  // Start speed review music from random position
  playBGMRandomStart('speed_review');

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

  // Prefetch TTS for upcoming words (look-ahead)
  prefetchQueueAudio(PREFETCH_AHEAD);

  // Render flash card (reusing existing structure)
  const hintText = '&larr; didn\'t know &nbsp; | &nbsp; knew it &rarr;';

  slot.innerHTML = `
    <div class="flash-card pop-in" data-slot="${slotIndex}">
      <div class="flash-card-front">${displayWordHtml(word)}</div>
      <div class="flash-card-back">
        <div class="flash-card-word">${displayWordHtml(word)}</div>
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

  // Spawn sparks effect
  const sparkColor = direction === 'right' ? '#0f0' : '#f44';
  spawnSparks(card, sparkColor, direction === 'right' ? 8 : 5);

  // "Word leveled up!" animation on successful recall
  if (direction === 'right') {
    showWordLevelUp(card, displayWord(word));
  }

  // Queue review (will send after 5s unless undone or new review)
  queueReview(slotIndex, word, grade, direction);

  // Reset inactivity timer on any card activity
  resetInactivityTimer();

  // Play TTS
  if (word.word) {
    state.callbacks?.playTTS(word.word);
  }

  // Update counters
  state.reviewedCount++;
  state.reviewedBatch.push(word);
  updateCounter();
  popCounter();

  // Check for batch refresh (every 10 cards instead of 50)
  if (state.session.mode === 'hub' && state.reviewedBatch.length >= BATCH_REFRESH_SIZE) {
    await triggerBatchRefresh();
  }

  // Replace card after animation
  setTimeout(() => {
    fillSlot(slotIndex);
  }, 100);
}

/**
 * Trigger batch refresh - fetch fresh due words from FSRS
 */
async function triggerBatchRefresh() {
  if (state.session.mode !== 'hub') return;
  if (!state.callbacks?.refreshQueue) return;

  console.log('[SpeedReview] Triggering batch refresh...');
  state.reviewedBatch = [];

  try {
    const freshWords = await state.callbacks.refreshQueue();
    if (freshWords && freshWords.length > 0) {
      // Filter out words currently displayed
      const displayedWords = new Set(
        state.activeCards.filter(c => c).map(c => c.word)
      );
      const newWords = freshWords.filter(w => !displayedWords.has(w.word));

      // Replace queue with fresh words
      state.queue = newWords;
      console.log(`[SpeedReview] Refreshed queue: ${newWords.length} words`);

      // Prefetch TTS for the new words
      prefetchQueueAudio(PREFETCH_AHEAD);
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
    // Celebrate!
    setTimeout(celebrateCompletion, 100);
    void handleCompletion();
  }
}

async function handleCompletion() {
  if (state.session.completing) return state.session.completionPromise;
  if (state.session.completionTriggered) return state.session.completionPromise;
  state.session.completing = true;

  state.session.completionPromise = (async () => {
    try {
      flushPendingReview();
      if (state.reviewPromises.length > 0) {
        await Promise.all(state.reviewPromises);
      }

      if (state.session.onComplete) {
        if (state.session.mode === 'room' && state.session.committedReviews < state.reviewedCount) {
          throw new Error('Review sync incomplete. Some cards are not committed yet.');
        }
        await state.session.onComplete({
          committedReviews: state.session.committedReviews
        });
      }

      state.session.completionTriggered = true;
      clearRoomCompletionError();
      updateCloseButtonAvailability();

      if (state.session.mode === 'room') {
        await handleExit();
        takeover.close('speedReview');
      }
    } catch (error) {
      state.session.completionTriggered = false;
      updateCloseButtonAvailability();
      if (state.session.mode === 'room') {
        showRoomCompletionError(error?.message || 'Review completion failed. Please retry.');
        return;
      }
      console.warn('[SpeedReview] Completion callback failed:', error);
    } finally {
      state.session.completing = false;
    }
  })();

  return state.session.completionPromise;
}

/**
 * Handle exit from Speed Review
 */
async function handleExit() {
  if (!canCloseNow()) return;

  // Clear inactivity timer
  clearInactivityTimer();

  // Send any pending review before closing
  flushPendingReview();

  // Wait for all in-flight reviews to complete before refreshing queue
  if (state.reviewPromises.length > 0) {
    console.log(`[SpeedReview] Exit: waiting for ${state.reviewPromises.length} pending reviews...`);
    await Promise.all(state.reviewPromises);
  }

  // Trigger final batch refresh if any pending
  if (state.session.mode === 'hub' && state.reviewedBatch.length > 0) {
    await triggerBatchRefresh();
  }

  if (state.session.mode === 'hub' && state.session.completionPromise) {
    await state.session.completionPromise;
  }

  if (state.session.mode === 'hub') {
    // Restore hub music
    playBGM('main');
  }

  // Reset UI
  dom.speedReviewContent.style.display = 'flex';
  dom.speedReviewEmpty.style.display = 'none';

  for (const slot of dom.speedReviewSlots) {
    slot.innerHTML = '';
  }

  // Refresh known words so bootstrap rendering reflects newly learned words
  try {
    const token = localStorage.getItem('authToken');
    const resp = await fetch(apiUrl('/api/game/known-words'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      setKnownWords(data.words);
    }
  } catch (e) {
    // Non-fatal
  }

  if (!state.session.exitNotified && state.session.onExit) {
    state.session.exitNotified = true;
    await state.session.onExit({
      committedReviews: state.session.committedReviews,
      completed: state.session.completionTriggered
    });
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

function formatMeanings(meanings) {
  const text = Array.isArray(meanings) ? meanings.join(', ') : (meanings || '');
  const parts = text.split(', ');
  if (parts.length <= 4) return escapeHtml(text);
  return escapeHtml(parts.slice(0, 4).join(', ')) + ', ...';
}

/**
 * Get the display text for a word.
 * Shows hiragana reading by default (matching the game's dialogue renderer).
 */
function displayWord(word) {
  return word.reading || word.word;
}

/**
 * Get card word HTML for both front and back.
 * Shows plain hiragana by default, and hiragana with romaji ruby in hiragana learning mode.
 */
function displayWordHtml(word) {
  if (state.session.showRomaji) {
    return buildHeadwordRuby(word.word, word.reading, false);
  }
  return escapeHtml(word.reading || word.word);
}

// ============ FUN EFFECTS ============

/**
 * Spawn sparks bursting from an element
 * @param {Element} sourceEl - Element to burst from
 * @param {string} color - Spark color
 * @param {number} count - Number of sparks
 */
function spawnSparks(sourceEl, color, count = 6) {
  if (!sourceEl) return;

  const rect = sourceEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'speed-review-spark';
    spark.style.left = `${centerX}px`;
    spark.style.top = `${centerY}px`;
    spark.style.backgroundColor = color;
    spark.style.boxShadow = `0 0 4px ${color}`;
    document.body.appendChild(spark);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const distance = 30 + Math.random() * 40;

    anime(spark, {
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      scale: [1.2, 0],
      opacity: [1, 0],
    }, {
      duration: 250 + Math.random() * 100,
      ease: 'outQuad',
      onComplete: () => spark.remove()
    });
  }
}

/**
 * Pop animation on the counter
 */
function popCounter() {
  anime(dom.speedReviewCounter, {
    scale: [1, 1.15, 1],
  }, {
    duration: 200,
    ease: 'outBack'
  });
}

/**
 * Celebrate completion with confetti burst
 */
function celebrateCompletion() {
  const container = dom.speedReviewEmpty;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const colors = ['#0ff', '#f0f', '#ff0', '#0f0', '#f60', '#6cf'];
  const count = 30;

  for (let i = 0; i < count; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'speed-review-confetti';
    confetti.style.left = `${centerX}px`;
    confetti.style.top = `${centerY}px`;
    confetti.style.backgroundColor = colors[i % colors.length];
    document.body.appendChild(confetti);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 80 + Math.random() * 120;
    const rotation = Math.random() * 720 - 360;

    anime(confetti, {
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance - 50 + Math.random() * 100,
      rotate: rotation,
      scale: [1, 0],
      opacity: [1, 0],
    }, {
      duration: 600 + Math.random() * 400,
      ease: 'outQuad',
      delay: Math.random() * 100,
      onComplete: () => confetti.remove()
    });
  }
}
