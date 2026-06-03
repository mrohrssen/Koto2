import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  GenSeedStrategyWithCardId,
  Rating,
  State,
  StrategyMode,
} from 'ts-fsrs';
import { HIRAGANA_DECK, getRowCards } from './hiragana-deck.js';

const SRS_SEED_FIELDS = ['id', 'char', 'word', 'prompt'];

function getSrsSeed(card) {
  for (const field of SRS_SEED_FIELDS) {
    const value = card[field];
    if (value !== undefined && value !== null && value !== '') {
      return `${field}:${value}`;
    }
  }
  return 'fallback';
}

// Module-level FSRS scheduler singleton
const scheduler = fsrs(generatorParameters({ enable_fuzz: true }))
  .useStrategy(StrategyMode.SEED, GenSeedStrategyWithCardId('srsSeed'));

// Configurable data directory (default: data/)
let dataDir = 'data/';

// In-memory cache keyed by userId
const cache = new Map();

// Grade string → FSRS Rating mapping
const GRADE_MAP = {
  again: Rating.Again,
  good: Rating.Good,
  easy: Rating.Easy,
};

/**
 * Configure the SRS service data directory.
 * @param {{ dataDir: string }} options
 */
export function configureSrs({ dataDir: dir }) {
  dataDir = dir.endsWith('/') ? dir : dir + '/';
}

/**
 * Get the file path for a user's SRS data.
 * @param {string} userId
 * @returns {string}
 */
function getFilePath(userId) {
  return `${dataDir}srs-${userId}.json`;
}

/**
 * Serialize card dates to ISO strings for JSON storage.
 * @param {Object} card
 * @returns {Object}
 */
function serializeCard(card) {
  return {
    ...card,
    due: card.due instanceof Date ? card.due.toISOString() : card.due,
    last_review: card.last_review instanceof Date ? card.last_review.toISOString() : card.last_review,
  };
}

/**
 * Deserialize card dates from ISO strings back to Date objects.
 * @param {Object} card
 * @returns {Object}
 */
function deserializeCard(card) {
  return {
    ...card,
    due: card.due ? new Date(card.due) : new Date(),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

/**
 * Load SRS data for a user from disk (or cache).
 * Creates empty structure if file doesn't exist.
 * @param {string} userId
 * @returns {{ kana: { cards: Array } }}
 */
export function loadSrsData(userId) {
  // Check in-memory cache first
  if (cache.has(userId)) {
    return cache.get(userId);
  }

  const filePath = getFilePath(userId);
  let data = { kana: { cards: [] } };

  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      // Deserialize card dates for all decks
      for (const key of Object.keys(raw)) {
        if (raw[key] && Array.isArray(raw[key].cards)) {
          raw[key].cards = raw[key].cards.map(deserializeCard);
        }
      }
      data = raw;
    } catch (e) {
      console.warn(`[SRS] Failed to load data for ${userId}:`, e.message);
    }
  }

  cache.set(userId, data);
  return data;
}

/**
 * Save SRS data for a user to disk and update cache.
 * @param {string} userId
 * @param {{ kana: { cards: Array } }} data
 */
export function saveSrsData(userId, data) {
  cache.set(userId, data);

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const filePath = getFilePath(userId);
  // Serialize dates before writing
  const serialized = { ...data };
  for (const key of Object.keys(serialized)) {
    if (serialized[key] && Array.isArray(serialized[key].cards)) {
      serialized[key] = {
        ...serialized[key],
        cards: serialized[key].cards.map(serializeCard),
      };
    }
  }

  try {
    writeFileSync(filePath, JSON.stringify(serialized, null, 2));
  } catch (e) {
    console.warn(`[SRS] Failed to save data for ${userId}:`, e.message);
  }
}

/**
 * Delete SRS data file for a user (for testing).
 * Also clears the in-memory cache for that user.
 * @param {string} userId
 */
export function clearSrsData(userId) {
  cache.delete(userId);
  const filePath = getFilePath(userId);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch (e) {
      console.warn(`[SRS] Failed to delete data for ${userId}:`, e.message);
    }
  }
}

/**
 * Clear only the in-memory cache for a user (for testing persistence).
 * @param {string} userId
 */
export function clearSrsCache(userId) {
  cache.delete(userId);
}

/**
 * Initialize the kana deck for a user.
 * Seeds all 71 hiragana cards with FSRS empty-card fields.
 * If cards already exist, does not overwrite.
 * @param {string} userId
 */
export function initKanaDeck(userId) {
  const data = loadSrsData(userId);

  // If cards already exist, don't overwrite
  if (data.kana.cards.length > 0) {
    return;
  }

  // Seed all 71 cards
  data.kana.cards = HIRAGANA_DECK.map((entry) => {
    const emptyCard = createEmptyCard();
    return {
      char: entry.char,
      romaji: entry.romaji,
      row: entry.row,
      ...emptyCard,
    };
  });

  saveSrsData(userId, data);
}

/**
 * Determine which rows are unlocked based on review progress.
 * Row 0 is always unlocked. Row N unlocked if all cards in row N-1 have reps >= 1.
 * @param {Array} cards - All kana cards
 * @returns {Set<number>} Set of unlocked row numbers
 */
function getUnlockedRows(cards) {
  const unlocked = new Set([0]);

  // Find the maximum row number
  const maxRow = Math.max(...cards.map((c) => c.row));

  for (let row = 1; row <= maxRow; row++) {
    const prevRowCards = cards.filter((c) => c.row === row - 1);
    const allReviewed = prevRowCards.every((c) => c.reps >= 1);
    if (allReviewed) {
      unlocked.add(row);
    } else {
      break; // Stop unlocking once a row isn't complete
    }
  }

  return unlocked;
}

/**
 * Get the next kana card to review.
 * Filters to unlocked rows, finds the most overdue card (earliest due date).
 * Always returns a card.
 * @param {string} userId
 * @returns {Object} The next card to review
 */
export function getNextKanaCard(userId) {
  const data = loadSrsData(userId);
  const cards = data.kana.cards;
  const unlockedRows = getUnlockedRows(cards);

  // Filter to unlocked cards only
  const available = cards.filter((c) => unlockedRows.has(c.row));

  if (available.length === 0) {
    // Fallback: return first card (should never happen if deck is initialized)
    return cards[0];
  }

  // Sort by due date ascending — earliest due = most overdue
  available.sort((a, b) => {
    const dateA = a.due instanceof Date ? a.due : new Date(a.due);
    const dateB = b.due instanceof Date ? b.due : new Date(b.due);
    return dateA.getTime() - dateB.getTime();
  });

  return available[0];
}

/**
 * Review a kana card with a grade.
 * @param {string} userId
 * @param {string} char - The hiragana character
 * @param {string} grade - 'again', 'good', or 'easy'
 * @returns {Object} The updated card
 */
export function reviewKanaCard(userId, char, grade) {
  const data = loadSrsData(userId);
  const cardIndex = data.kana.cards.findIndex((c) => c.char === char);

  if (cardIndex === -1) {
    throw new Error(`Card not found for character: ${char}`);
  }

  const card = data.kana.cards[cardIndex];

  const fsrsCard = buildFsrsCard(card);
  const now = new Date();
  const rating = GRADE_MAP[grade];

  if (rating === undefined) {
    throw new Error(`Invalid grade: ${grade}. Must be 'again', 'good', or 'easy'.`);
  }

  const result = scheduler.repeat(fsrsCard, now);
  const updatedCard = result[rating].card;

  // Merge updated FSRS fields back into our card (preserving char/romaji/row)
  data.kana.cards[cardIndex] = {
    char: card.char,
    romaji: card.romaji,
    row: card.row,
    due: updatedCard.due,
    stability: updatedCard.stability,
    difficulty: updatedCard.difficulty,
    elapsed_days: updatedCard.elapsed_days,
    scheduled_days: updatedCard.scheduled_days,
    reps: updatedCard.reps,
    lapses: updatedCard.lapses,
    learning_steps: updatedCard.learning_steps,
    state: updatedCard.state,
    last_review: updatedCard.last_review,
  };

  saveSrsData(userId, data);

  return data.kana.cards[cardIndex];
}

/**
 * Get statistics about a user's kana deck.
 * @param {string} userId
 * @returns {{ total: number, unlocked: number, learning: number, mastered: number, dueNow: number, graduated: boolean }}
 */
export function getKanaStats(userId) {
  const data = loadSrsData(userId);
  const cards = data.kana.cards;
  const unlockedRows = getUnlockedRows(cards);
  const now = new Date();

  const unlocked = cards.filter((c) => unlockedRows.has(c.row)).length;
  const learning = cards.filter((c) => c.state === State.Learning || c.state === State.Relearning).length;
  const mastered = cards.filter((c) => c.state === State.Review).length;
  const dueNow = cards.filter((c) => {
    if (!unlockedRows.has(c.row)) return false;
    const dueDate = c.due instanceof Date ? c.due : new Date(c.due);
    return dueDate <= now;
  }).length;

  return {
    total: cards.length,
    unlocked,
    learning,
    mastered,
    dueNow,
    graduated: isKanaGraduated(userId),
  };
}

/**
 * Check if a user has graduated from the kana deck.
 * Graduated = ALL 71 cards have state === State.Review.
 * @param {string} userId
 * @returns {boolean}
 */
export function isKanaGraduated(userId) {
  const data = loadSrsData(userId);
  const cards = data.kana.cards;

  if (cards.length !== 71) return false;

  return cards.every((c) => c.state === State.Review);
}

// ─── Generic deck operations ────────────────────────────────────────

const FSRS_FIELDS = new Set([
  'due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
  'reps', 'lapses', 'learning_steps', 'state', 'last_review',
]);

function buildFsrsCard(card) {
  const seedFields = {};
  for (const field of SRS_SEED_FIELDS) {
    if (card[field] !== undefined && card[field] !== null) {
      seedFields[field] = card[field];
    }
  }
  const fsrsCard = {
    srsSeed: getSrsSeed(card),
    ...seedFields,
    due: card.due instanceof Date ? card.due : new Date(card.due || Date.now()),
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    elapsed_days: card.elapsed_days || 0,
    scheduled_days: card.scheduled_days || 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    learning_steps: card.learning_steps || 0,
    state: card.state || 0,
  };
  if (card.last_review) {
    fsrsCard.last_review = card.last_review instanceof Date
      ? card.last_review
      : new Date(card.last_review);
  }
  return fsrsCard;
}

export function getDeckCards(userId, deckName) {
  const data = loadSrsData(userId);
  if (!data[deckName]) {
    data[deckName] = { cards: [] };
  }
  return data[deckName].cards;
}

export function createCard(userId, deckName, cardId, metadata) {
  const data = loadSrsData(userId);
  if (!data[deckName]) {
    data[deckName] = { cards: [] };
  }
  const existing = data[deckName].cards.find((c) => c.id === cardId);
  if (existing) return existing;
  const emptyCard = createEmptyCard();
  data[deckName].cards.push({
    id: cardId,
    ...metadata,
    ...emptyCard,
  });
  saveSrsData(userId, data);
}

export function gradeCard(userId, deckName, cardId, grade) {
  const data = loadSrsData(userId);
  if (!data[deckName]) {
    throw new Error(`Card ${cardId} not found in deck '${deckName}'`);
  }
  const cardIndex = data[deckName].cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in deck '${deckName}'`);
  }
  const card = data[deckName].cards[cardIndex];
  const fsrsCard = buildFsrsCard(card);
  const now = new Date();
  const rating = GRADE_MAP[grade];
  if (rating === undefined) {
    throw new Error(`Invalid grade: ${grade}. Must be 'again', 'good', or 'easy'.`);
  }
  const result = scheduler.repeat(fsrsCard, now);
  const updatedFsrs = result[rating].card;
  const { id, ...restCard } = card;
  const metadataKeys = {};
  for (const [k, v] of Object.entries(restCard)) {
    if (!FSRS_FIELDS.has(k)) {
      metadataKeys[k] = v;
    }
  }
  data[deckName].cards[cardIndex] = {
    id,
    ...metadataKeys,
    due: updatedFsrs.due,
    stability: updatedFsrs.stability,
    difficulty: updatedFsrs.difficulty,
    elapsed_days: updatedFsrs.elapsed_days,
    scheduled_days: updatedFsrs.scheduled_days,
    reps: updatedFsrs.reps,
    lapses: updatedFsrs.lapses,
    learning_steps: updatedFsrs.learning_steps,
    state: updatedFsrs.state,
    last_review: updatedFsrs.last_review,
  };
  saveSrsData(userId, data);
  return data[deckName].cards[cardIndex];
}

export function getDueCards(userId, deckName) {
  const cards = getDeckCards(userId, deckName);
  const now = new Date();
  return cards.filter((c) => {
    const dueDate = c.due instanceof Date ? c.due : new Date(c.due);
    return dueDate <= now;
  });
}

export function getDueCount(userId, deckName) {
  return getDueCards(userId, deckName).length;
}
