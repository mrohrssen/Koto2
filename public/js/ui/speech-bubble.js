/**
 * @file speech-bubble.js - Creature speech bubble system
 *
 * Listens to combat events and displays short Japanese speech bubbles
 * above creature sprites. Renders server-provided barks from the combat
 * cycle response (stored in combat-loop.js). Falls back to legacy
 * creatureSpeech phrases from window.gameState if no server barks.
 *
 * EXPORTS:
 * - init(opts): Register event listeners on combatEvents bus
 * - resetCombatBarks(): No-op (kept for API compatibility)
 * - dismissBubble(): Remove active bubble immediately
 */

import { renderJpFirst, renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';
import { getCurrentBarks } from './combat-loop.js';

const TRIGGER_CHANCE = 0.25;
const DISPLAY_MS = 2500;
const FADE_MS = 300;

let _activeBubble = null;
let _randomFn = Math.random;
let _phrases = null;

/** Get legacy phrase data from game state (lazy). */
function getLegacyPhrases() {
  if (_phrases) return _phrases;
  _phrases = window.gameState?.creatureSpeech || null;
  return _phrases;
}

/** Pick a random phrase from legacy trigger pool. Returns null if pool is empty. */
function pickLegacyPhrase(triggerType) {
  const phrases = getLegacyPhrases();
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
 * Uses renderJpSentence for tokenized barks, renderJpFirst for legacy.
 */
function showBubble(slotEl, phrase) {
  if (!slotEl || !phrase) return;
  if (_activeBubble) return; // one at a time

  const rect = slotEl.getBoundingClientRect();

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';

  if (phrase.isTokenized) {
    // Server-provided tokenized bark — render with renderJpSentence
    const knownWords = getKnownWords();
    const dict = window.gameState?.wordDictionary || {};
    const dictMap = dict instanceof Map ? dict : new Map(Object.entries(dict));
    bubble.innerHTML = renderJpSentence(
      phrase._tokens || [],
      knownWords,
      dictMap,
      phrase.overrides || {},
      false // useKanji = false for early areas
    );
  } else {
    // Legacy format
    bubble.innerHTML = renderJpFirst(phrase.jp, phrase.reading, phrase.en);
  }

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
 * Returns { text, _tokens, _contentWords, isTokenized: true } or null.
 */
function findServerBark(triggerType) {
  const barks = getCurrentBarks();
  const bark = barks.find(b => b.trigger === triggerType);
  if (!bark) return null;
  return { ...bark, isTokenized: true };
}

/**
 * Initialize speech bubble system.
 * Tries server-provided barks first, falls back to legacy creatureSpeech.
 * @param {object} [opts]
 * @param {Function} [opts.randomFn] - Override Math.random for testing
 */
export function init(opts = {}) {
  if (opts.randomFn) _randomFn = opts.randomFn;

  combatEvents.on('creatureHit', (detail) => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = findServerBark('onHit') || pickLegacyPhrase('onHit');
    showBubble(detail?.slotEl, bark);
  });

  combatEvents.on('victory', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = findServerBark('onVictory') || pickLegacyPhrase('onVictory');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });

  combatEvents.on('explore', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = findServerBark('onExplore') || pickLegacyPhrase('onExplore');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });
}
