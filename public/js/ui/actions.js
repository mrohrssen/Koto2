import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import { t } from './i18n.js';
import { hapticMedium } from '../native/index.js';
import { escapeHtml } from './html-utils.js';

let onEquipBots = null;
let onContextAction = null;
let onCardSwipe = null; // (direction: 'left'|'right') => void
let onCardFlip = null;  // () => void

// Swipe state
let touchStartX = 0;
let touchStartY = 0;
let currentSwipeX = 0;
let isSwiping = false;
let cardFlipped = false;
let activeCard = null; // Reference to the card currently being interacted with

const SWIPE_THRESHOLD = 80;

/** Initialize action area callbacks */
export function init({ equipBots, contextAction, cardSwipe, cardFlip }) {
  onEquipBots = equipBots;
  onContextAction = contextAction;
  onCardSwipe = cardSwipe;
  onCardFlip = cardFlip;

  document.addEventListener('test-swipe', (e) => {
    if (onCardSwipe) onCardSwipe(e.detail);
  });
}

/** Render ruby reading for a word */
function renderRuby(word) {
  return word.reading && word.reading !== word.word
    ? `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`
    : escapeHtml(word.word);
}

/**
 * Show a single swipeable flash card for word discovery
 * @param {Object[]} words - Array of word objects { word, meanings, reading } (only first word used)
 * @param {Object} options - { discoveryMode: boolean }
 */
export function showFlashCards(words, { discoveryMode = false } = {}) {
  cardFlipped = false;
  isSwiping = false;

  const word = words[0];
  const hintText = discoveryMode ? t('hintDiscovery') : t('hintCombat');

  dom.actionArea.innerHTML = `
    <div class="flash-card-container" id="flash-card-container">
      <div class="flash-card" id="flash-card">
        <div class="flash-card-front">${escapeHtml(word.word)}</div>
        <div class="flash-card-back">
          <div class="flash-card-word">${renderRuby(word)}</div>
          <div class="flash-card-meaning">${formatMeanings(word.meanings)}</div>
          <div class="flash-card-hint">${hintText}</div>
        </div>
      </div>
    </div>
  `;

  const card = document.getElementById('flash-card');
  activeCard = card;

  // Tap to flip, or tap sides to grade after flip
  card.addEventListener('click', (e) => {
    if (isSwiping) return;

    if (!cardFlipped) {
      // First tap: flip the card
      cardFlipped = true;
      card.classList.add('flipped');
      if (onCardFlip) onCardFlip();
    } else {
      // Card is flipped: check click position for grading
      const rect = card.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const relativeX = clickX / rect.width;

      // Dead zone: middle 20% (40% to 60%)
      if (relativeX < 0.4) {
        triggerSwipeAnimation(card, 'left');
      } else if (relativeX > 0.6) {
        triggerSwipeAnimation(card, 'right');
      }
    }
  });

  // Swipe handling (only after flip)
  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: false });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });
  card.addEventListener('mousedown', handleMouseDown);
  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseup', handleMouseUp);
  card.addEventListener('mouseleave', handleMouseUp);
}

/** Trigger the equip bots callback (for use by other modules) */
export function triggerEquipBots() {
  playSFX('button-tap');
  if (onEquipBots) onEquipBots();
}

/** Show empty action area */
export function clear() {
  dom.actionArea.innerHTML = '';
}

/** Show the prologue-only cue that teaches players where to tap to advance dialogue. */
export function showPrologueContinueHint() {
  dom.actionArea.innerHTML = '<div class="prologue-continue-hint">Tap here to continue!</div>';
}

/** Show custom content in action area */
export function setContent(html) {
  dom.actionArea.innerHTML = html;
}

// --- Touch handlers ---

function handleTouchStart(e) {
  if (!cardFlipped) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  currentSwipeX = 0;
  isSwiping = false;
}

function handleTouchMove(e) {
  if (!cardFlipped) return;
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Only swipe if more horizontal than vertical
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
    isSwiping = true;
    currentSwipeX = dx;
    e.preventDefault();

    if (activeCard) {
      const rotate = dx * 0.05;
      activeCard.style.setProperty('--swipe-x', `${dx}px`);
      activeCard.style.setProperty('--swipe-rotate', `${rotate}deg`);
      activeCard.classList.toggle('swiping-right', dx > 0);
      activeCard.classList.toggle('swiping-left', dx < 0);
    }
  }
}

function handleTouchEnd() {
  if (!cardFlipped || !isSwiping) return;

  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? 'right' : 'left';
    // Animate off screen
    if (activeCard) {
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.25s ease';
      activeCard.style.transform = `translateX(${currentSwipeX > 0 ? 500 : -500}px) rotate(${currentSwipeX * 0.1}deg)`;
      activeCard.style.opacity = '0';
    }
    playSFX(direction === 'right' ? 'swipe-right' : 'swipe-left');
    hapticMedium();
    setTimeout(() => {
      document.getElementById('flash-card-container')?.remove();
      if (onCardSwipe) onCardSwipe(direction);
    }, 300);
  } else {
    // Snap back
    if (activeCard) {
      activeCard.style.setProperty('--swipe-x', '0px');
      activeCard.style.setProperty('--swipe-rotate', '0deg');
      activeCard.classList.remove('swiping-right', 'swiping-left');
    }
  }
  isSwiping = false;
}

// --- Mouse handlers (desktop swipe) ---

let mouseIsDown = false;

function handleMouseDown(e) {
  if (!cardFlipped) return;
  mouseIsDown = true;
  touchStartX = e.clientX;
  touchStartY = e.clientY;
  currentSwipeX = 0;
  isSwiping = false;
  e.preventDefault();
}

function handleMouseMove(e) {
  if (!cardFlipped || !mouseIsDown) return;
  const dx = e.clientX - touchStartX;
  const dy = e.clientY - touchStartY;

  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
    isSwiping = true;
    currentSwipeX = dx;

    if (activeCard) {
      const rotate = dx * 0.05;
      activeCard.style.setProperty('--swipe-x', `${dx}px`);
      activeCard.style.setProperty('--swipe-rotate', `${rotate}deg`);
      activeCard.classList.toggle('swiping-right', dx > 0);
      activeCard.classList.toggle('swiping-left', dx < 0);
    }
  }
}

function handleMouseUp() {
  if (!mouseIsDown) return;
  mouseIsDown = false;
  if (!cardFlipped || !isSwiping) return;

  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? 'right' : 'left';
    if (activeCard) {
      activeCard.style.transition = 'transform 0.3s ease, opacity 0.25s ease';
      activeCard.style.transform = `translateX(${currentSwipeX > 0 ? 500 : -500}px) rotate(${currentSwipeX * 0.1}deg)`;
      activeCard.style.opacity = '0';
    }
    playSFX(direction === 'right' ? 'swipe-right' : 'swipe-left');
    hapticMedium();
    setTimeout(() => {
      document.getElementById('flash-card-container')?.remove();
      if (onCardSwipe) onCardSwipe(direction);
    }, 300);
  } else {
    if (activeCard) {
      activeCard.style.setProperty('--swipe-x', '0px');
      activeCard.style.setProperty('--swipe-rotate', '0deg');
      activeCard.classList.remove('swiping-right', 'swiping-left');
    }
  }
  isSwiping = false;
}

/**
 * Trigger swipe animation and callback (used for click-to-grade)
 */
function triggerSwipeAnimation(card, direction) {
  const offset = direction === 'right' ? 500 : -500;
  card.style.transition = 'transform 0.3s ease, opacity 0.25s ease';
  card.style.transform = `translateX(${offset}px) rotate(${offset * 0.02}deg)`;
  card.style.opacity = '0';
  playSFX(direction === 'right' ? 'swipe-right' : 'swipe-left');
  hapticMedium();
  setTimeout(() => {
    document.getElementById('flash-card-container')?.remove();
    if (onCardSwipe) onCardSwipe(direction);
  }, 300);
}


/**
 * Format meanings for flash card display.
 * Truncates to first 6 meanings if too long, adds "..."
 */
function formatMeanings(meanings) {
  const text = Array.isArray(meanings) ? meanings.join(', ') : (meanings || '');
  const parts = text.split(', ');
  if (parts.length <= 6) return escapeHtml(text);
  return escapeHtml(parts.slice(0, 6).join(', ')) + ', ...';
}
