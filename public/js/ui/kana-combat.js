/**
 * Kana mode combat — extracted from combat-loop.js (Strangler Fig).
 * Handles kana flash card review during combat with swipe-based input.
 */

import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';

const API_BASE = PLATFORM.apiBase;

// Kana mode state
let kanaSwipeResolve = null;
let kanaSwipeDirection = null;

// Coordinator deps (set via init)
let ctx = null;

/**
 * Initialize with coordinator callbacks.
 * @param {Object} deps - { getGameState, showFlashCards, executeCreatureMovesTurn }
 */
export function init(deps) {
  ctx = deps;
}

export function handleSwipe(direction) {
  kanaSwipeDirection = direction;
  if (kanaSwipeResolve) {
    kanaSwipeResolve(direction);
    kanaSwipeResolve = null;
  }
}

export function isRoundInProgress() {
  return kanaSwipeResolve !== null;
}

export async function startRound() {
  const state = ctx.getGameState();
  const party = state.run?.creatureParty?.active || [];
  const enemies = state.combat?.enemies || [];
  const choices = [];

  for (let i = 0; i < party.length; i++) {
    const creature = party[i];
    if (!creature || creature.hp <= 0) continue;

    // Find first living enemy
    const targetIndex = enemies.findIndex(e => e && e.hp > 0);
    if (targetIndex === -1) break;

    // Fetch kana card from server
    const kanaCard = await fetchKanaCard();
    if (!kanaCard) break;

    // Show kana card using existing single-card flash card UI
    const kanaWord = {
      word: kanaCard.char,
      reading: kanaCard.romaji,
      meanings: [kanaCard.romaji]
    };

    // Wait for swipe via Promise resolved by handleSwipe()
    const direction = await new Promise(resolve => {
      kanaSwipeResolve = resolve;
      ctx.showFlashCards([kanaWord]);
    });

    // Map swipe direction to FSRS grade
    const grade = (direction === 'right') ? 'good' : 'again';
    submitKanaReview(kanaCard.char, grade);

    // Auto-pick cheapest single-target move
    const move = pickCheapestMove(creature);
    if (move) {
      choices.push({ creatureIndex: i, moveId: move.id, targetIndex });
    }
  }

  if (choices.length > 0) {
    await ctx.executeCreatureMovesTurn(choices);
  }
}

async function fetchKanaCard() {
  try {
    const response = await fetch(`${API_BASE}/api/game/kana-card`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[KanaMode] Failed to fetch kana card:', e);
    return null;
  }
}

async function submitKanaReview(char, grade) {
  try {
    await fetch(`${API_BASE}/api/game/kana-review`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ char, grade })
    });
  } catch (e) {
    console.error('[KanaMode] Failed to submit kana review:', e);
  }
}

export function pickCheapestMove(creature) {
  if (!creature.moves?.length) return null;
  return creature.moves
    .filter(m => m.target === 'single_enemy' && creature.mp >= m.mpCost)
    .sort((a, b) => a.mpCost - b.mpCost)[0] || null;
}
