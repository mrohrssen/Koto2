/**
 * @file speech-bubble.js - Creature speech bubble system
 *
 * Listens to combat events and displays short Japanese speech bubbles
 * above creature sprites. Supports two formats:
 * 1. New: pre-tokenized bark pool (window.gameState.barkPool) with i+1 filtering
 * 2. Legacy: creature speech phrases (window.gameState.creatureSpeech)
 *
 * Renders tokenized barks with renderJpSentence(), legacy with renderJpFirst().
 * Tracks word exposure for SRS. Tracks used barks per combat to avoid repeats.
 *
 * EXPORTS:
 * - init(opts): Register event listeners on combatEvents bus
 * - resetCombatBarks(): Clear per-combat used bark tracking
 * - dismissBubble(): Remove active bubble immediately
 */

import { renderJpFirst, renderJpSentence } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

const TRIGGER_CHANCE = 0.25;
const DISPLAY_MS = 2500;
const FADE_MS = 300;
const PUNCT_POS = new Set(['記号', '補助記号', '空白']);

let _activeBubble = null;
let _randomFn = Math.random;
let _phrases = null;

// New bark pool state
let _barkPool = null;
let _wordDict = null;
let _usedThisCombat = new Set();

/** Get legacy phrase data from game state (lazy). */
function getLegacyPhrases() {
  if (_phrases) return _phrases;
  _phrases = window.gameState?.creatureSpeech || null;
  return _phrases;
}

/** Get bark pool from game state (lazy). */
function getBarkPool() {
  if (_barkPool) return _barkPool;
  _barkPool = window.gameState?.barkPool || null;
  return _barkPool;
}

/** Get word dictionary from game state (lazy). */
function getWordDict() {
  if (_wordDict) return _wordDict;
  _wordDict = window.gameState?.wordDictionary || null;
  return _wordDict;
}

/** Check if a token is punctuation. */
function isPunctuation(token) {
  return PUNCT_POS.has(token.pos) || /^[\p{P}\p{S}\s]+$/u.test(token.surface);
}

/** Check i+1 eligibility: each sentence has at most 1 unknown content word. */
function isLineEligible(line, knownWords) {
  const tokens = line._tokens || [];
  const unknowns = tokens
    .filter(t => !isPunctuation(t))
    .filter(t => !knownWords.has(t.baseForm));
  return unknowns.length <= 1;
}

/**
 * Pick a bark from the new tokenized bark pool with i+1 filtering.
 * 80/20 split: 80% reinforcement (all known), 20% teaching (1 unknown).
 * Returns { text, _tokens, overrides, isTokenized: true } or null.
 */
function pickBark(triggerType) {
  const pool = getBarkPool();
  if (!pool) return null;

  const triggerPool = pool[triggerType];
  if (!triggerPool || triggerPool.length === 0) return null;

  const knownWords = getKnownWords();

  // Filter to i+1 eligible lines
  const eligible = triggerPool.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;

  // Split into reinforcement (all known) and teaching (has 1 unknown)
  const reinforcement = eligible.filter(line =>
    (line._tokens || []).filter(t => !isPunctuation(t)).every(t => knownWords.has(t.baseForm))
  );
  const teaching = eligible.filter(line =>
    (line._tokens || []).filter(t => !isPunctuation(t)).some(t => !knownWords.has(t.baseForm))
  );

  // 80/20 split: prefer reinforcement, occasionally teach
  const useTeaching = teaching.length > 0 && _randomFn() < 0.2;
  const selectedPool = useTeaching ? teaching : (reinforcement.length > 0 ? reinforcement : eligible);

  // Avoid repeats within this combat
  const nonRepeat = selectedPool.filter(l => !_usedThisCombat.has(l.text));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;

  const chosen = finalPool[Math.floor(_randomFn() * finalPool.length)];
  if (chosen) {
    _usedThisCombat.add(chosen.text);
    return { ...chosen, isTokenized: true };
  }
  return null;
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
    // New tokenized bark format — render with renderJpSentence
    const knownWords = getKnownWords();
    const dict = getWordDict();
    const dictMap = dict instanceof Map ? dict : new Map(Object.entries(dict || {}));
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

/** Reset per-combat bark tracking. Call at start of each combat. */
export function resetCombatBarks() {
  _usedThisCombat = new Set();
  // Reset lazy caches so fresh data is picked up
  _barkPool = null;
  _wordDict = null;
}

/**
 * Initialize speech bubble system.
 * Tries new bark pool format first, falls back to legacy creatureSpeech.
 * @param {object} [opts]
 * @param {Function} [opts.randomFn] - Override Math.random for testing
 */
export function init(opts = {}) {
  if (opts.randomFn) _randomFn = opts.randomFn;

  combatEvents.on('creatureHit', (detail) => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = pickBark('onHit') || pickLegacyPhrase('onHit');
    showBubble(detail?.slotEl, bark);
  });

  combatEvents.on('victory', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = pickBark('onVictory') || pickLegacyPhrase('onVictory');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });

  combatEvents.on('explore', () => {
    if (_randomFn() >= TRIGGER_CHANCE) return;
    const bark = pickBark('onExplore') || pickLegacyPhrase('onExplore');
    const slot = randomPlayerSlot();
    showBubble(slot, bark);
  });
}
