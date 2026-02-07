/**
 * @file actions.js - Bottom Action Area Module
 *
 * PURPOSE:
 * Renders the bottom action area of the game screen. In non-combat phases,
 * displays action buttons (Equip Bots, contextual actions like Infiltrate/Fight).
 * In combat, displays swipeable flash cards for vocabulary review.
 *
 * KEY EXPORTS:
 * - init({ equipBots, contextAction, cardSwipe, cardFlip, dualCardSelect }): Set up callbacks
 * - showButtons(contextLabel, options): Display action buttons
 * - showFlashCard(word, options): Display swipeable vocabulary card (combat or discovery mode)
 * - showDualFlashCards(attackWord, defendWord): Display dual cards for attack/defend selection
 * - triggerEquipBots(): Programmatically trigger equip callback
 * - clear(): Empty the action area
 * - setContent(html): Set custom HTML content
 * - getSelectedActionType(): Get the action type selected from dual cards
 * - clearSelectedActionType(): Clear the selected action type
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references
 * - ../audio.js: Sound effects (button-tap, swipe-left, swipe-right)
 *
 * FLASH CARD BEHAVIOR:
 * - Tap to flip card (shows reading + meaning)
 * - After flip: swipe right = "knew it", swipe left = "didn't know"
 * - Supports both touch and mouse input
 * - SWIPE_THRESHOLD = 80px to register a swipe
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

let onEquipBots = null;
let onContextAction = null;
let onCardSwipe = null; // (direction: 'left'|'right') => void
let onCardFlip = null;  // () => void
let onDualCardSelect = null; // (actionType: 'attack'|'defend', word: object) => void
let selectedActionType = null; // Track which card was selected

// Swipe state
let touchStartX = 0;
let touchStartY = 0;
let currentSwipeX = 0;
let isSwiping = false;
let cardFlipped = false;
let activeCard = null; // Reference to the card currently being interacted with

const SWIPE_THRESHOLD = 80;

/** Initialize action area callbacks */
export function init({ equipBots, contextAction, cardSwipe, cardFlip, dualCardSelect }) {
  onEquipBots = equipBots;
  onContextAction = contextAction;
  onCardSwipe = cardSwipe;
  onCardFlip = cardFlip;
  onDualCardSelect = dualCardSelect;

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
    <button class="action-btn action-btn-primary" id="equip-bots-btn">ボット装備</button>
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
 * Show flash card (combat mode or discovery mode)
 * @param {Object} word - { word, meanings, reading }
 * @param {Object} options - { discoveryMode: boolean }
 */
export function showFlashCard(word, { discoveryMode = false } = {}) {
  cardFlipped = false;
  isSwiping = false;

  const hintText = discoveryMode
    ? '&larr; learn &nbsp; | &nbsp; learn &rarr;'
    : '&larr; didn\'t know &nbsp; | &nbsp; knew it &rarr;';

  dom.actionArea.innerHTML = `
    <div class="flash-card-container" id="flash-card-container">
      <div class="flash-card" id="flash-card">
        <div class="flash-card-front">${escapeHtml(word.word)}</div>
        <div class="flash-card-back">
          <div class="flash-card-word">${word.reading && word.reading !== word.word
            ? `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`
            : escapeHtml(word.word)}</div>
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
      const cardWidth = rect.width;
      const relativeX = clickX / cardWidth;

      // Dead zone: middle 20% (40% to 60%)
      if (relativeX < 0.4) {
        // Left side: grade as failed
        triggerSwipeAnimation(card, 'left');
      } else if (relativeX > 0.6) {
        // Right side: grade as good
        triggerSwipeAnimation(card, 'right');
      }
      // Middle 20%: do nothing (dead zone)
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

/** Trigger the equip bots callback (for use by other modules) */
export function triggerEquipBots() {
  playSFX('button-tap');
  if (onEquipBots) onEquipBots();
}

/** Show empty action area */
export function clear() {
  dom.actionArea.innerHTML = '';
}

/** Show custom content in action area */
export function setContent(html) {
  dom.actionArea.innerHTML = html;
}

/**
 * Get the action type selected from dual cards
 * @returns {'attack'|'defend'|null}
 */
export function getSelectedActionType() {
  return selectedActionType;
}

/**
 * Clear the selected action type
 */
export function clearSelectedActionType() {
  selectedActionType = null;
}

/**
 * Show dual flash cards (combat mode - Attack/Defend selection)
 * @param {Object} attackWord - Word for attack card { word, meanings, reading }
 * @param {Object} defendWord - Word for defend card { word, meanings, reading }
 */
export function showDualFlashCards(attackWord, defendWord) {
  selectedActionType = null;
  cardFlipped = false;
  isSwiping = false;

  const hintText = '&larr; didn\'t know &nbsp; | &nbsp; knew it &rarr;';

  const swordIcon = `<svg class="dual-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>`;
  const shieldIcon = `<svg class="dual-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

  dom.actionArea.innerHTML = `
    <div class="dual-flash-card-container" id="dual-flash-card-container">
      <div class="dual-card-wrapper" id="attack-wrapper">
        <div class="dual-flash-card attack" id="attack-card" data-action="attack">
          <div class="dual-card-front">${swordIcon}<span>${escapeHtml(attackWord.word)}</span></div>
          <div class="dual-card-back">
            <div class="flash-card-word">${attackWord.reading && attackWord.reading !== attackWord.word
              ? `<ruby>${escapeHtml(attackWord.word)}<rt>${escapeHtml(attackWord.reading)}</rt></ruby>`
              : escapeHtml(attackWord.word)}</div>
            <div class="flash-card-meaning">${formatMeanings(attackWord.meanings)}</div>
            <div class="flash-card-hint">${hintText}</div>
          </div>
        </div>
      </div>
      <div class="dual-card-wrapper" id="defend-wrapper">
        <div class="dual-flash-card defend" id="defend-card" data-action="defend">
          <div class="dual-card-front">${shieldIcon}<span>${escapeHtml(defendWord.word)}</span></div>
          <div class="dual-card-back">
            <div class="flash-card-word">${defendWord.reading && defendWord.reading !== defendWord.word
              ? `<ruby>${escapeHtml(defendWord.word)}<rt>${escapeHtml(defendWord.reading)}</rt></ruby>`
              : escapeHtml(defendWord.word)}</div>
            <div class="flash-card-meaning">${formatMeanings(defendWord.meanings)}</div>
            <div class="flash-card-hint">${hintText}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const attackCard = document.getElementById('attack-card');
  const defendCard = document.getElementById('defend-card');
  const attackWrapper = document.getElementById('attack-wrapper');
  const defendWrapper = document.getElementById('defend-wrapper');

  function selectCard(actionType, word, selectedCard, selectedWrapper, otherWrapper) {
    if (cardFlipped) return; // Already selected

    selectedActionType = actionType;
    playSFX('button-tap');

    // Hide the other card
    otherWrapper.classList.add('hidden');

    // Flip and expand the selected card
    selectedCard.classList.add('selected');
    cardFlipped = true;
    activeCard = selectedCard;

    if (onCardFlip) onCardFlip();
    if (onDualCardSelect) onDualCardSelect(actionType, word);

    // Add swipe handlers to the selected card
    selectedCard.addEventListener('touchstart', handleTouchStart, { passive: true });
    selectedCard.addEventListener('touchmove', handleTouchMove, { passive: false });
    selectedCard.addEventListener('touchend', handleTouchEnd, { passive: true });
    selectedCard.addEventListener('mousedown', handleMouseDown);
    selectedCard.addEventListener('mousemove', handleMouseMove);
    selectedCard.addEventListener('mouseup', handleMouseUp);
    selectedCard.addEventListener('mouseleave', handleMouseUp);

    // Click sides to grade (reuse flash card logic)
    selectedCard.addEventListener('click', (e) => {
      if (isSwiping) return;
      const rect = selectedCard.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const relativeX = clickX / rect.width;

      if (relativeX < 0.4) {
        triggerSwipeAnimation(selectedCard, 'left');
      } else if (relativeX > 0.6) {
        triggerSwipeAnimation(selectedCard, 'right');
      }
    });
  }

  attackCard.addEventListener('click', (e) => {
    if (!cardFlipped) {
      e.stopPropagation();
      selectCard('attack', attackWord, attackCard, attackWrapper, defendWrapper);
    }
  });

  defendCard.addEventListener('click', (e) => {
    if (!cardFlipped) {
      e.stopPropagation();
      selectCard('defend', defendWord, defendCard, defendWrapper, attackWrapper);
    }
  });
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
    setTimeout(() => {
      const container = document.getElementById('flash-card-container')
        || document.getElementById('dual-flash-card-container');
      if (container) container.remove();
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
    setTimeout(() => {
      const container = document.getElementById('flash-card-container')
        || document.getElementById('dual-flash-card-container');
      if (container) container.remove();
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
  setTimeout(() => {
    // Remove either flash card or dual flash card container
    const container = document.getElementById('flash-card-container')
      || document.getElementById('dual-flash-card-container');
    if (container) container.remove();
    if (onCardSwipe) onCardSwipe(direction);
  }, 300);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
