import { createCard, getDeckCards } from './internal-srs.js';

/**
 * The five question words removed from the grammar allowlist on 2026-07-07
 * (they are top-300 vocabulary, not grammar). Cards are created at
 * prologue-complete so every account tracks them; they enter the review
 * flow as ordinary New cards. なぜ/どれ/どの remain free for now.
 */
export const QUESTION_WORDS = ['何', 'どこ', 'どう', '誰', 'いつ'];

/**
 * Create vocab cards for any question words the user does not have yet.
 * Returns the newly created card ids (empty when all exist).
 */
export function ensureQuestionWordCards(userId) {
  const existing = new Set(getDeckCards(userId, 'vocab').map(c => c.id));
  const created = [];
  for (const word of QUESTION_WORDS) {
    if (existing.has(word)) continue;
    createCard(userId, 'vocab', word, { word });
    created.push(word);
  }
  return created;
}
