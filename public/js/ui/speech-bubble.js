/**
 * @file speech-bubble.js - Creature speech bubble system
 *
 * Listens to combat events and displays short Japanese speech bubbles
 * above creature sprites. Renders with furigana via renderJpFirst().
 * Tracks word exposure for SRS.
 *
 * EXPORTS:
 * - init(opts): Register event listeners on combatEvents bus
 */

import { renderJpFirst, addExposure, flushExposures } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

const TRIGGER_CHANCE = 0.25;
const DISPLAY_MS = 2500;
const FADE_MS = 300;

let _activeBubble = null;
let _randomFn = Math.random;
let _phrases = null;

/** Get phrase data from game state (lazy, loaded after init). */
function getPhrases() {
  if (_phrases) return _phrases;
  _phrases = window.gameState?.creatureSpeech || null;
  return _phrases;
}

/** Pick a random phrase from a trigger pool. Returns null if pool is empty. */
function pickPhrase(triggerType) {
  const phrases = getPhrases();
  if (!phrases) return null;
  const pool = phrases[triggerType];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(_randomFn() * pool.length)];
}

/** Find a random non-KO'd player formation slot. */
function randomPlayerSlot() {
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  const alive = [...slots].filter(s => {
    const sprite = s.querySelector('.formation-sprite');
    return sprite && !sprite.classList.contains('ko');
  });
  if (alive.length === 0) return null;
  return alive[Math.floor(_randomFn() * alive.length)];
}

/**
 * Show a speech bubble anchored to a formation slot.
 * Appended to document.body to avoid CSS contain:layout clipping.
 */
function showBubble(slotEl, phrase) {
  if (!slotEl || !phrase) return;
  if (_activeBubble) return; // one at a time

  const rect = slotEl.getBoundingClientRect();

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.innerHTML = renderJpFirst(phrase.jp, phrase.reading, phrase.en);

  // Position above the creature sprite
  bubble.style.position = 'fixed';
  bubble.style.left = `${rect.left + rect.width / 2}px`;
  bubble.style.top = `${rect.top - 8}px`;

  document.body.appendChild(bubble);
  _activeBubble = bubble;

  // Track exposure
  addExposure(phrase.jp, phrase.en);
  flushExposures();

  // Auto-dismiss
  setTimeout(() => {
    bubble.classList.add('speech-bubble-exit');
    setTimeout(() => {
      bubble.remove();
      if (_activeBubble === bubble) _activeBubble = null;
    }, FADE_MS);
  }, DISPLAY_MS);
}

/** Dismiss active bubble immediately (e.g. on phase change). */
export function dismissBubble() {
  if (_activeBubble) {
    _activeBubble.remove();
    _activeBubble = null;
  }
}

/**
 * Initialize speech bubble system.
 * Phrase data is read lazily from window.gameState.creatureSpeech.
 * @param {object} [opts]
 * @param {Function} [opts.randomFn] - Override Math.random for testing
 */
export function init(opts = {}) {
  if (opts.randomFn) _randomFn = opts.randomFn;

  combatEvents.on('creatureHit', (detail) => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const phrase = pickPhrase('onHit');
    showBubble(detail?.slotEl, phrase);
  });

  combatEvents.on('victory', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const phrase = pickPhrase('onVictory');
    const slot = randomPlayerSlot();
    showBubble(slot, phrase);
  });

  combatEvents.on('explore', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const phrase = pickPhrase('onExplore');
    const slot = randomPlayerSlot();
    showBubble(slot, phrase);
  });
}
