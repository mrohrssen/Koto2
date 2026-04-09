/**
 * @file speech-bubble.js - Creature speech bubble system
 *
 * Listens to combat events and displays short Japanese speech bubbles
 * above creature sprites. Renders server-provided barks (universal token
 * format) from the combat cycle response (stored in combat-loop.js).
 *
 * EXPORTS:
 * - init(opts): Register event listeners on combatEvents bus
 * - resetCombatBarks(): No-op (kept for API compatibility)
 * - dismissBubble(): Remove active bubble immediately
 */

import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';
import { getCurrentBarks } from './combat-loop.js';

const TRIGGER_CHANCE = 0.25;
const DISPLAY_MS = 2500;
const FADE_MS = 300;

let _activeBubble = null;
let _randomFn = Math.random;

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
 * Uses renderJpSentence for all barks.
 */
function showBubble(slotEl, phrase) {
  if (!slotEl || !phrase) return;
  if (_activeBubble) return; // one at a time

  const rect = slotEl.getBoundingClientRect();

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';

  const knownWords = getKnownWords();
  const dict = window.gameState?.wordDictionary || {};
  const dictMap = dict instanceof Map ? dict : new Map(Object.entries(dict));
  bubble.innerHTML = renderJpSentence(
    phrase.tokens || [],
    knownWords,
    dictMap,
    {},
    false
  );

  // Position above the creature sprite
  bubble.style.position = 'fixed';
  bubble.style.left = `${rect.left + rect.width / 2}px`;
  bubble.style.top = `${rect.top - 8}px`;

  document.body.appendChild(bubble);
  _activeBubble = bubble;

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

/** No-op — server handles bark selection and deduplication now. Kept for API compat. */
export function resetCombatBarks() {
  // Intentionally empty. Server picks barks per round; client just renders them.
}

/**
 * Find a server bark matching the trigger type from current round barks.
 * Returns a bark object { trigger, raw, tokens, words, ... } or null.
 */
function findServerBark(triggerType) {
  const barks = getCurrentBarks();
  const bark = barks.find(b => b.trigger === triggerType);
  if (!bark) return null;
  return bark;
}

/**
 * Initialize speech bubble system.
 * Renders server-provided barks via universal tokens.
 * @param {object} [opts]
 * @param {Function} [opts.randomFn] - Override Math.random for testing
 */
export function init(opts = {}) {
  if (opts.randomFn) _randomFn = opts.randomFn;

  combatEvents.on('creatureHit', (detail) => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = findServerBark('onHit');
    showBubble(detail?.slotEl, bark);
  });

  combatEvents.on('victory', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = findServerBark('onVictory');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });

  combatEvents.on('explore', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = findServerBark('onExplore');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });
}
