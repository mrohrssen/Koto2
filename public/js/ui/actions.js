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
 * - showFlashCards(words, options): Display 1-3 swipeable vocabulary cards
 * - triggerEquipBots(): Programmatically trigger equip callback
 * - clear(): Empty the action area
 * - setContent(html): Set custom HTML content
 * - getSelectedActionType(): Get the action type selected from multi-card modes
 * - clearSelectedActionType(): Clear the selected action type
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references
 * - ../audio.js: Sound effects (button-tap, swipe-left, swipe-right)
 *
 * FLASH CARD BEHAVIOR:
 * - Single card: tap to flip, then swipe right = "knew it", left = "didn't know"
 * - Dual/Triple cards: tap to select action, then swipe to grade
 * - Supports both touch and mouse input
 * - SWIPE_THRESHOLD = 80px to register a swipe
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import { t } from './i18n.js';

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

// --- Card config for multi-card modes ---

const CARD_ICONS = {
  attack: `<svg class="dual-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>`,
  defend: `<svg class="dual-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  befriend: `<svg class="dual-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
};

const CARD_ACTIONS = ['attack', 'defend', 'befriend'];

/** Render ruby reading for a word */
function renderRuby(word) {
  return word.reading && word.reading !== word.word
    ? `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`
    : escapeHtml(word.word);
}

/** Attach swipe + click-to-grade handlers to a card element */
function attachGradeHandlers(card) {
  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: false });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });
  card.addEventListener('mousedown', handleMouseDown);
  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseup', handleMouseUp);
  card.addEventListener('mouseleave', handleMouseUp);

  card.addEventListener('click', (e) => {
    if (isSwiping) return;
    const rect = card.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const relativeX = clickX / rect.width;
    if (relativeX < 0.4) {
      triggerSwipeAnimation(card, 'left');
    } else if (relativeX > 0.6) {
      triggerSwipeAnimation(card, 'right');
    }
  });
}

/**
 * Show flash cards (1 = single, 2 = dual attack/defend, 3 = triple attack/defend/befriend)
 * @param {Object[]} words - Array of word objects { word, meanings, reading }
 * @param {Object} options - { discoveryMode: boolean } (only used for single card mode)
 */
export function showFlashCards(words, { discoveryMode = false } = {}) {
  selectedActionType = null;
  cardFlipped = false;
  isSwiping = false;

  const count = words.length;
  const hintText = (count === 1 && discoveryMode) ? t('hintDiscovery') : t('hintCombat');

  if (count === 1) {
    // === SINGLE CARD MODE ===
    const word = words[0];
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
  } else {
    // === MULTI-CARD MODE (2 or 3 cards) ===
    const containerClass = count === 3
      ? 'dual-flash-card-container triple'
      : 'dual-flash-card-container';

    const cardsHtml = words.map((word, i) => {
      const action = CARD_ACTIONS[i];
      return `
        <div class="dual-card-wrapper" id="${action}-wrapper">
          <div class="dual-flash-card ${action}" id="${action}-card" data-action="${action}">
            <div class="dual-card-front">${CARD_ICONS[action]}<span>${escapeHtml(word.word)}</span></div>
            <div class="dual-card-back">
              <div class="flash-card-word">${renderRuby(word)}</div>
              <div class="flash-card-meaning">${formatMeanings(word.meanings)}</div>
              <div class="flash-card-hint">${hintText}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    dom.actionArea.innerHTML = `
      <div class="${containerClass}" id="dual-flash-card-container">
        ${cardsHtml}
      </div>
    `;

    // Gather card/wrapper references
    const cards = words.map((_, i) => document.getElementById(`${CARD_ACTIONS[i]}-card`));
    const wrappers = words.map((_, i) => document.getElementById(`${CARD_ACTIONS[i]}-wrapper`));

    function selectCard(index) {
      if (cardFlipped) return;

      const action = CARD_ACTIONS[index];
      const word = words[index];
      const selectedCard = cards[index];

      selectedActionType = action;
      playSFX('button-tap');

      // Hide all other cards
      wrappers.forEach((w, j) => { if (j !== index) w.classList.add('hidden'); });

      // Flip and expand the selected card
      selectedCard.classList.add('selected');
      cardFlipped = true;
      activeCard = selectedCard;

      if (onCardFlip) onCardFlip();
      if (onDualCardSelect) onDualCardSelect(action, word);

      // Add swipe/click-to-grade handlers
      attachGradeHandlers(selectedCard);
    }

    // Wire up click-to-select on each card
    cards.forEach((card, i) => {
      card.addEventListener('click', (e) => {
        if (!cardFlipped) {
          e.stopPropagation();
          selectCard(i);
        }
      });
    });
  }
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
