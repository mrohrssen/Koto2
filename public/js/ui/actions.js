/**
 * Action Area Module - Bottom section buttons and flash cards
 *
 * Non-combat: Shows [Equip Bots] + [Contextual Action] buttons
 * Combat: Shows swipeable flash card stack
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

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

const SWIPE_THRESHOLD = 80;

/** Initialize action area callbacks */
export function init({ equipBots, contextAction, cardSwipe, cardFlip }) {
  onEquipBots = equipBots;
  onContextAction = contextAction;
  onCardSwipe = cardSwipe;
  onCardFlip = cardFlip;

  // Test hook: allows E2E tests to trigger swipe without mouse/touch gestures
  document.addEventListener('test-swipe', (e) => {
    if (onCardSwipe) onCardSwipe(e.detail);
  });
}

/**
 * Show action buttons (non-combat mode)
 * @param {string} contextLabel - Text for the contextual button ("Infiltrate", "Fight", etc.)
 * @param {Object} options - { contextDisabled: bool }
 */
export function showButtons(contextLabel, { contextDisabled = false } = {}) {
  dom.actionArea.innerHTML = `
    <button class="action-btn action-btn-primary" id="equip-bots-btn">Equip Bots</button>
    <button class="action-btn action-btn-secondary" id="context-action-btn"
      ${contextDisabled ? 'disabled' : ''}>${contextLabel}</button>
  `;

  document.getElementById('equip-bots-btn').addEventListener('click', () => {
    playSFX('button-tap');
    if (onEquipBots) onEquipBots();
  });

  const ctxBtn = document.getElementById('context-action-btn');
  if (!contextDisabled) {
    ctxBtn.addEventListener('click', () => {
      playSFX('button-tap');
      if (onContextAction) onContextAction();
    });
  }
}

/**
 * Show flash card (combat mode)
 * @param {Object} word - { word, meanings, reading }
 */
export function showFlashCard(word) {
  cardFlipped = false;
  isSwiping = false;

  dom.actionArea.innerHTML = `
    <div class="flash-card-container" id="flash-card-container">
      <div class="flash-card" id="flash-card">
        <div class="flash-card-front">${escapeHtml(word.word)}</div>
        <div class="flash-card-back">
          <div class="flash-card-word">${word.reading && word.reading !== word.word
            ? `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`
            : escapeHtml(word.word)}</div>
          <div class="flash-card-meaning">${formatMeanings(word.meanings)}</div>
          <div class="flash-card-hint">&larr; didn't know &nbsp; | &nbsp; knew it &rarr;</div>
        </div>
      </div>
    </div>
  `;

  const card = document.getElementById('flash-card');

  // Tap to flip
  card.addEventListener('click', () => {
    if (!isSwiping && !cardFlipped) {
      cardFlipped = true;
      card.classList.add('flipped');
      if (onCardFlip) onCardFlip();
    }
  });

  // Swipe handling (only after flip)
  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: false });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Mouse swipe handling (for desktop)
  card.addEventListener('mousedown', handleMouseDown);
  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseup', handleMouseUp);
  card.addEventListener('mouseleave', handleMouseUp);
}

/** Show empty action area */
export function clear() {
  dom.actionArea.innerHTML = '';
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

    const card = document.getElementById('flash-card');
    if (card) {
      const rotate = dx * 0.05;
      card.style.setProperty('--swipe-x', `${dx}px`);
      card.style.setProperty('--swipe-rotate', `${rotate}deg`);
      card.classList.toggle('swiping-right', dx > 0);
      card.classList.toggle('swiping-left', dx < 0);
    }
  }
}

function handleTouchEnd() {
  if (!cardFlipped || !isSwiping) return;

  const card = document.getElementById('flash-card');
  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? 'right' : 'left';
    // Animate off screen
    if (card) {
      card.style.transition = 'transform 0.3s ease, opacity 0.25s ease';
      card.style.transform = `translateX(${currentSwipeX > 0 ? 500 : -500}px) rotate(${currentSwipeX * 0.1}deg)`;
      card.style.opacity = '0';
    }
    playSFX(direction === 'right' ? 'swipe-right' : 'swipe-left');
    setTimeout(() => {
      const container = document.getElementById('flash-card-container');
      if (container) container.remove();
      if (onCardSwipe) onCardSwipe(direction);
    }, 300);
  } else {
    // Snap back
    if (card) {
      card.style.setProperty('--swipe-x', '0px');
      card.style.setProperty('--swipe-rotate', '0deg');
      card.classList.remove('swiping-right', 'swiping-left');
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

    const card = document.getElementById('flash-card');
    if (card) {
      const rotate = dx * 0.05;
      card.style.setProperty('--swipe-x', `${dx}px`);
      card.style.setProperty('--swipe-rotate', `${rotate}deg`);
      card.classList.toggle('swiping-right', dx > 0);
      card.classList.toggle('swiping-left', dx < 0);
    }
  }
}

function handleMouseUp() {
  if (!mouseIsDown) return;
  mouseIsDown = false;
  if (!cardFlipped || !isSwiping) return;

  const card = document.getElementById('flash-card');
  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? 'right' : 'left';
    if (card) {
      card.style.transition = 'transform 0.3s ease, opacity 0.25s ease';
      card.style.transform = `translateX(${currentSwipeX > 0 ? 500 : -500}px) rotate(${currentSwipeX * 0.1}deg)`;
      card.style.opacity = '0';
    }
    playSFX(direction === 'right' ? 'swipe-right' : 'swipe-left');
    setTimeout(() => {
      const container = document.getElementById('flash-card-container');
      if (container) container.remove();
      if (onCardSwipe) onCardSwipe(direction);
    }, 300);
  } else {
    if (card) {
      card.style.setProperty('--swipe-x', '0px');
      card.style.setProperty('--swipe-rotate', '0deg');
      card.classList.remove('swiping-right', 'swiping-left');
    }
  }
  isSwiping = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format meanings for flash card display.
 * Truncates to first 3 meanings if too long, adds "..."
 */
function formatMeanings(meanings) {
  const text = Array.isArray(meanings) ? meanings.join(', ') : (meanings || '');
  // Split on comma-space and take first 3 meanings
  const parts = text.split(', ');
  if (parts.length <= 3) return escapeHtml(text);
  return escapeHtml(parts.slice(0, 3).join(', ')) + ', ...';
}
