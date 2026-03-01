/**
 * @fileoverview Per-player word exposure tracker for bootstrap language system
 * @module src/game/word-tracker
 *
 * Tracks how many times a player has seen each Japanese word and determines
 * scaffolding stage (furigana + romaji + English → furigana + English → furigana only).
 */

// Scaffolding stage thresholds (exposure counts)
const STAGE_THRESHOLDS = {
  NO_ROMAJI: 4,   // Drop romaji at 4+ exposures
  FURIGANA: 10    // Drop English at 10+ exposures
};

const STAGES = { FULL: 1, NO_ROMAJI: 2, FURIGANA: 3, BARE: 4 };

const PHASE_THRESHOLDS = {
  TRANSITION_MIN_WORDS: 100,
  FULL_JAPANESE_MIN_WORDS: 250
};

/**
 * Create a fresh word tracker for a player
 */
export function createWordTracker(userId) {
  return {
    userId,
    words: {},
    totalWordsIntroduced: 0,
    phase: 'bootstrap'
  };
}

/**
 * Compute stage from exposure count
 */
function computeStage(exposures) {
  if (exposures >= STAGE_THRESHOLDS.FURIGANA) return STAGES.FURIGANA;
  if (exposures >= STAGE_THRESHOLDS.NO_ROMAJI) return STAGES.NO_ROMAJI;
  return STAGES.FULL;
}

/**
 * Record a single word exposure. Multiplier allows combat (2x) or TTS (1x) weighting.
 */
export function recordExposure(tracker, word, multiplier = 1) {
  const now = new Date().toISOString().slice(0, 10);
  if (!tracker.words[word]) {
    tracker.words[word] = {
      exposures: 0,
      stage: STAGES.FULL,
      firstSeen: now,
      lastSeen: now
    };
    tracker.totalWordsIntroduced++;
  }

  const entry = tracker.words[word];
  entry.exposures += multiplier;
  entry.lastSeen = now;
  entry.stage = computeStage(entry.exposures);

  // Auto-update phase
  tracker.phase = computePhase(tracker);
}

/**
 * Record exposures for multiple words (e.g., all tagged words in a narration)
 */
export function recordExposures(tracker, words, multiplier = 1) {
  for (const word of words) {
    recordExposure(tracker, word, multiplier);
  }
}

/**
 * Get the scaffolding stage for a word (null if never seen)
 */
export function getWordStage(tracker, word) {
  return tracker.words[word]?.stage ?? null;
}

/**
 * Compute the player's language phase based on word mastery
 */
function computePhase(tracker) {
  const stage2Plus = Object.values(tracker.words)
    .filter(w => w.stage >= STAGES.NO_ROMAJI).length;

  if (stage2Plus >= PHASE_THRESHOLDS.FULL_JAPANESE_MIN_WORDS) return 'full-japanese';
  if (stage2Plus >= PHASE_THRESHOLDS.TRANSITION_MIN_WORDS) return 'transition';
  return 'bootstrap';
}

/**
 * Get the current language phase
 */
export function getPhase(tracker) {
  return computePhase(tracker);
}

/**
 * Get array of all tracked words
 */
export function getKnownWords(tracker) {
  return Object.keys(tracker.words);
}

/**
 * Get words filtered to a specific stage
 */
export function getWordsAtStage(tracker, stage) {
  return Object.entries(tracker.words)
    .filter(([, data]) => data.stage === stage)
    .map(([word]) => word);
}
