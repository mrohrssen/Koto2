import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';
import { getCurrentBarks } from './combat-loop.js';

const TRIGGER_CHANCE = 0.25;
const DISPLAY_MS = 2500;
const FADE_MS = 300;

let _activeBubble = null;
let _randomFn = Math.random;

/**
 * Compute how far gloss elements overflow a bubble's bounding rect.
 * Returns { bottom, left, right } — extra pixels needed in each direction.
 * Pure function: takes DOMRect-like objects, no DOM access.
 */
export function calcBubbleOverflow(bubbleRect, glossRects) {
  let bottom = 0, left = 0, right = 0;
  for (const g of glossRects) {
    bottom = Math.max(bottom, g.bottom - bubbleRect.bottom);
    left = Math.max(left, bubbleRect.left - g.left);
    right = Math.max(right, g.right - bubbleRect.right);
  }
  return { bottom: Math.max(0, bottom), left: Math.max(0, left), right: Math.max(0, right) };
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

  // Auto-fit: grow bubble to contain absolute-positioned glosses
  const glossEls = bubble.querySelectorAll('.jp-stack-en');
  if (glossEls.length > 0) {
    const bRect = bubble.getBoundingClientRect();
    const glossRects = [...glossEls].map(g => g.getBoundingClientRect());
    const overflow = calcBubbleOverflow(bRect, glossRects);
    if (overflow.bottom > 0) {
      bubble.style.paddingBottom = (6 + overflow.bottom) + 'px';
    }
    if (overflow.left > 0 || overflow.right > 0) {
      bubble.style.paddingLeft = (10 + overflow.left) + 'px';
      bubble.style.paddingRight = (10 + overflow.right) + 'px';
      bubble.style.maxWidth = 'none';
    }
  }

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
