import { getDeckCards, getDueCards } from './internal-srs.js';
import { State } from 'ts-fsrs';
import { hydrateCards } from './bootstrap/word-knowledge.js';

// Configuration
const CONFIG = {
  recentWordsLimit: 50,           // Track last 50 words used
  suggestionCount: 12,            // Target number of suggestions
  dueWordRatio: 0.6,              // 60% of suggestions should be due words
  learningWordRatio: 0.25,        // 25% should be learning words
  knownWordRatio: 0.15            // 15% can be known words for variety
};

// Per-user in-memory state (only tracks recentlyUsedWords now)
const userStates = new Map();

/**
 * Get or create user state
 * @param {string} userId - User ID
 * @returns {Object} User's state object
 */
function getOrCreateUserState(userId) {
  if (!userId) throw new Error('userId is required for cache operations');
  if (!userStates.has(userId)) {
    userStates.set(userId, { recentlyUsedWords: [] });
  }
  return userStates.get(userId);
}

/**
 * Configure the vocab manager (kept for backward compatibility but no-op now)
 * @param {object} options - Configuration options
 */
export function configureVocabManager(options = {}) {
  // No-op: FSRS handles its own persistence via internal-srs.js
}

/**
 * Initialize the vocabulary manager for a user (no-op with FSRS)
 * @param {string} userId - User ID
 */
export function initVocabManager(userId) {
  // No-op: FSRS data is loaded on demand by internal-srs.js
  getOrCreateUserState(userId);
}

/**
 * Add words to the recently-used ring buffer
 * @param {string[]} words - Words used in narration
 * @param {string} userId - User ID
 */
export function addUsedWords(words, userId) {
  if (!words || words.length === 0) return;

  const state = getOrCreateUserState(userId);

  // Add new words to the buffer
  for (const word of words) {
    if (word && typeof word === 'string' && word.length > 0) {
      // Remove if already in buffer (to re-add at end)
      const existingIndex = state.recentlyUsedWords.indexOf(word);
      if (existingIndex !== -1) {
        state.recentlyUsedWords.splice(existingIndex, 1);
      }
      state.recentlyUsedWords.push(word);
    }
  }

  // Trim to max size
  if (state.recentlyUsedWords.length > CONFIG.recentWordsLimit) {
    state.recentlyUsedWords = state.recentlyUsedWords.slice(-CONFIG.recentWordsLimit);
  }
}

/**
 * Get recently used words
 * @param {string} userId - User ID
 * @returns {string[]} Last N words used
 */
export function getRecentlyUsedWords(userId) {
  const state = getOrCreateUserState(userId);
  return [...state.recentlyUsedWords];
}

/**
 * Check if a card is overdue (due date is in the past)
 * @param {Object} card - FSRS card
 * @returns {boolean}
 */
function isOverdue(card) {
  const dueDate = card.due instanceof Date ? card.due : new Date(card.due);
  return dueDate <= new Date();
}

/**
 * Calculate priority score for a card based on its FSRS state
 * Higher score = more important to suggest
 * @param {Object} card - FSRS card
 * @returns {number} Priority score 0-1
 */
function calculatePriority(card) {
  if (!card) return 0;

  const state = card.state;

  // Relearning = failed, highest priority
  if (state === State.Relearning) return 1.0;

  // Learning + overdue
  if (state === State.Learning && isOverdue(card)) return 0.9;

  // Review + overdue
  if (state === State.Review && isOverdue(card)) return 0.8;

  // Learning (not due yet)
  if (state === State.Learning) return 0.7;

  // Review (not due)
  if (state === State.Review) return 0.3;

  // New or anything else
  return 0;
}

/**
 * Get the primary state label of a card
 * @param {Object} card - FSRS card
 * @returns {string} Primary state label
 */
function getPrimaryState(card) {
  if (!card) return 'new';

  const state = card.state;

  if (state === State.Relearning) return 'due';
  if (state === State.Learning && isOverdue(card)) return 'due';
  if (state === State.Review && isOverdue(card)) return 'due';
  if (state === State.Learning) return 'learning';
  if (state === State.Review) return 'known';

  return 'new';
}

/**
 * Select suggested words for narration from FSRS cards
 * @param {Object[]} cards - FSRS cards from getDeckCards
 * @param {string[]} recentWords - Recently used words to avoid
 * @param {number} count - Number of suggestions to return
 * @returns {Object[]} Array of { word, state, priority }
 */
export function selectSuggestedWords(cards, recentWords, count = CONFIG.suggestionCount) {
  const recentSet = new Set(recentWords);
  const candidates = [];

  for (const card of cards) {
    const word = card.id;

    // Skip recently used words
    if (recentSet.has(word)) continue;

    // Skip very short words (usually particles)
    if (!word || word.length < 2) continue;

    const priority = calculatePriority(card);

    // Only include cards with positive priority
    if (priority > 0) {
      candidates.push({
        word,
        state: getPrimaryState(card),
        priority
      });
    }
  }

  // Shuffle candidates to add variety within same priority
  shuffleArray(candidates);

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  // Select with diversity: mix of states
  const selected = [];
  const targetDue = Math.floor(count * CONFIG.dueWordRatio);
  const targetLearning = Math.floor(count * CONFIG.learningWordRatio);
  const targetKnown = count - targetDue - targetLearning;

  // Pick due words first
  selectByState(candidates, selected, 'due', targetDue);
  selectByState(candidates, selected, 'learning', targetLearning);
  selectByState(candidates, selected, 'known', targetKnown);

  // If not enough, fill with any remaining high-priority candidates
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    if (!selected.find(s => s.word === candidate.word)) {
      selected.push(candidate);
    }
  }

  return selected.slice(0, count);
}

/**
 * Helper: Select words by state
 */
function selectByState(candidates, selected, targetState, maxCount) {
  let added = 0;
  for (const candidate of candidates) {
    if (added >= maxCount) break;
    if (candidate.state === targetState && !selected.find(s => s.word === candidate.word)) {
      selected.push(candidate);
      added++;
    }
  }
}

/**
 * Helper: Shuffle array in place (Fisher-Yates)
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Main entry point: Get word suggestions for narration
 * @param {string} userId - User ID
 * @returns {Object[]} Array of { word, state, priority }
 */
export function getSuggestionsForNarration(userId) {
  const cards = getDeckCards(userId, 'vocab');

  if (!cards || cards.length === 0) {
    return [];
  }

  // Get recently used words
  const recentWords = getRecentlyUsedWords(userId);

  // Select suggestions
  return selectSuggestedWords(cards, recentWords);
}

/**
 * Get a narration-safe vocabulary list for a specific user.
 * Returns words the user knows (Learning, Review, or Relearning state in FSRS).
 *
 * @param {string} userId - User ID
 * @param {string[]} fallbackVocabulary - Fallback list when user has no FSRS data
 * @returns {{ words: string[] }} Vocabulary words
 */
export function getNarrationVocabularyForUser(userId, fallbackVocabulary = []) {
  if (!userId) {
    const words = [...new Set((fallbackVocabulary || []).filter(w => typeof w === 'string' && w.length > 0))];
    return { words };
  }

  const cards = getDeckCards(userId, 'vocab');

  // Include cards that are Learning, Review, or Relearning (i.e., not New)
  const knownWords = [];
  for (const card of cards) {
    if (!card.id || typeof card.id !== 'string') continue;
    const s = card.state;
    if (s === State.Learning || s === State.Review || s === State.Relearning) {
      knownWords.push(card.id);
    }
  }

  if (knownWords.length > 0) {
    return { words: knownWords };
  }

  const words = [...new Set((fallbackVocabulary || []).filter(w => typeof w === 'string' && w.length > 0))];
  return { words };
}

/**
 * Clear the in-memory state for a user (for testing or reset)
 * @param {string} userId - User ID
 */
export function clearVocabManagerCache(userId) {
  userStates.set(userId, { recentlyUsedWords: [] });
}

/**
 * Get cache stats (for debugging)
 * @param {string} userId - User ID
 */
export function getVocabManagerStats(userId) {
  const cards = getDeckCards(userId, 'vocab');
  return {
    recentWordsCount: getOrCreateUserState(userId).recentlyUsedWords.length,
    totalCards: cards.length,
    dueCards: getDueCards(userId, 'vocab').length
  };
}

/**
 * Get new words for discovery room from FSRS deck
 * @param {number} limit - Maximum words to return
 * @param {string} userId - User ID
 * @returns {Object} { words: Array<{word, reading, meaning}>, available: boolean }
 */
export function getNewWordsForDiscovery(limit = 2, userId) {
  const cards = getDeckCards(userId, 'vocab');

  if (cards.length === 0) {
    console.log(`[Discovery] No FSRS vocab cards for user ${userId}`);
    return { words: [], available: false };
  }

  const newWords = [];
  const hydrated = hydrateCards(cards);

  for (const card of hydrated) {
    if (card.state === State.New) {
      newWords.push({
        word: card.id,
        reading: card.reading,
        meanings: card.meaning ? [card.meaning] : (card.meanings || []),
        rank: card.rank || Infinity,
      });
    }
  }

  // Sort by rank (lower = higher frequency = prioritized)
  newWords.sort((a, b) => a.rank - b.rank);

  const words = newWords.slice(0, limit);

  console.log(`[Discovery] User ${userId} has ${cards.length} vocab cards, ${newWords.length} new, returning ${words.length}`);

  return {
    words,
    available: words.length > 0
  };
}
