/**
 * Vocabulary Suggestion Manager
 *
 * Manages word suggestions for narration to improve vocabulary variety
 * and prioritize "due" words for spaced repetition learning.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { lookupWordStates, parseWordBatches } from '../jpdb.js';

// Cache file path - configured via configureVocabManager()
let cacheFile = null;

// Configuration
const CONFIG = {
  recentWordsLimit: 50,           // Track last 50 words used
  suggestionCount: 12,            // Target number of suggestions
  cacheExpiryMs: 30 * 60 * 1000,  // Cache expires after 30 minutes
  dueWordRatio: 0.6,              // 60% of suggestions should be due words
  learningWordRatio: 0.25,        // 25% should be learning words
  knownWordRatio: 0.15            // 15% can be known words for variety
};

// Full parse configuration
export const FULL_PARSE_CONFIG = {
  batchSize: 2000,
  maxWords: 10000,
  batchDelayMs: 3000,
  cacheExpiryMs: 60 * 60 * 1000  // 1 hour
};

// In-memory state
let state = {
  recentlyUsedWords: [],          // Ring buffer of last N words
  wordStateCache: {},             // { word: { states: [], vid, sid, dueAt, rank } }
  lastRefresh: null,              // Timestamp of last incremental refresh
  lastFullParse: null,            // Timestamp of last full batch parse
  initialized: false,
  checkedThisSession: false       // Only check/refresh once per session
};

// Lock to prevent simultaneous JPDB fetches
let refreshPromise = null;

/**
 * Configure the vocab manager with file path
 * @param {object} options - Configuration options
 * @param {string} options.cacheFile - Path to the cache file
 */
export function configureVocabManager({ cacheFile: file }) {
  cacheFile = file;
}

/**
 * Initialize the vocabulary manager - load cache from file
 */
export function initVocabManager() {
  if (state.initialized) return;

  if (!cacheFile) {
    console.warn('Vocab manager not configured - call configureVocabManager first');
    state.initialized = true;
    return;
  }

  try {
    if (existsSync(cacheFile)) {
      const data = JSON.parse(readFileSync(cacheFile, 'utf-8'));
      state.recentlyUsedWords = data.recentlyUsedWords || [];
      state.wordStateCache = data.wordStateCache || {};
      state.lastRefresh = data.lastRefresh || null;
      state.lastFullParse = data.lastFullParse || null;
      console.log(`Loaded vocab suggestion cache: ${Object.keys(state.wordStateCache).length} word states, ${state.recentlyUsedWords.length} recent words`);
    }
  } catch (e) {
    console.warn('Failed to load vocab suggestion cache:', e.message);
  }

  state.initialized = true;
}

/**
 * Save cache to file
 */
function saveCache() {
  if (!cacheFile) return;

  try {
    writeFileSync(cacheFile, JSON.stringify({
      recentlyUsedWords: state.recentlyUsedWords,
      wordStateCache: state.wordStateCache,
      lastRefresh: state.lastRefresh,
      lastFullParse: state.lastFullParse
    }, null, 2));
  } catch (e) {
    console.warn('Failed to save vocab suggestion cache:', e.message);
  }
}

/**
 * Add words to the recently-used ring buffer
 * @param {string[]} words - Words used in narration
 */
export function addUsedWords(words) {
  if (!words || words.length === 0) return;

  initVocabManager();

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

  saveCache();
}

/**
 * Get recently used words
 * @returns {string[]} Last N words used
 */
export function getRecentlyUsedWords() {
  initVocabManager();
  return [...state.recentlyUsedWords];
}

/**
 * Refresh word state cache from JPDB
 * Called ONCE per session (on first narration after page/server load)
 * Only fetches if cache is stale (>30 min) OR incomplete
 * Subsequent calls always return cached data
 *
 * @param {string} apiKey - JPDB API key
 * @param {string[]} vocabulary - Full vocabulary list
 * @returns {Object} Word state mapping
 */
export async function refreshWordStateCache(apiKey, vocabulary, force = false) {
  initVocabManager();

  // If already refreshing, wait for that to complete (prevents race condition)
  if (refreshPromise) {
    await refreshPromise;
    return state.wordStateCache;
  }

  // Already checked this session - always use cache (unless forced)
  if (!force && state.checkedThisSession) {
    return state.wordStateCache;
  }

  // Mark as checked for this session
  state.checkedThisSession = true;

  if (!apiKey || !vocabulary || vocabulary.length === 0) {
    return state.wordStateCache;
  }

  const now = Date.now();
  const cacheIsStale = force || !state.lastRefresh || (now - state.lastRefresh) >= CONFIG.cacheExpiryMs;

  // Check if we have all vocabulary cached
  const uncachedWords = vocabulary.filter(w => !state.wordStateCache[w]);
  const cacheIsComplete = uncachedWords.length === 0;

  // Only fetch if cache is stale OR incomplete (force makes cache "stale")
  if (!cacheIsStale && cacheIsComplete) {
    console.log(`Using cached word states (${Object.keys(state.wordStateCache).length} words, ${Math.round((now - state.lastRefresh) / 60000)} min old)`);
    return state.wordStateCache;
  }

  // Use a promise lock to prevent simultaneous fetches
  refreshPromise = (async () => {
    try {
      // Determine what to fetch:
      // - If force or cache stale: refresh ALL words (due status may have changed)
      // - If cache incomplete: fetch uncached words only
      const wordsToFetch = cacheIsStale ? vocabulary : uncachedWords;
      const reason = force ? 'forced refresh' : (cacheIsStale ? 'cache stale' : 'incomplete cache');

      console.log(`[VocabManager] Fetching word states for ${wordsToFetch.length} words (${reason})...`);
      const newStates = await lookupWordStates(apiKey, wordsToFetch);
      Object.assign(state.wordStateCache, newStates);
      console.log(`[VocabManager] Cached ${Object.keys(state.wordStateCache).length} word states total`);

      state.lastRefresh = now;
      saveCache();

    } catch (e) {
      console.warn('[VocabManager] Failed to refresh word state cache:', e.message);
    }
  })();

  await refreshPromise;
  refreshPromise = null;

  return state.wordStateCache;
}

/**
 * Calculate priority score for a word based on its state
 * Higher score = more important to suggest
 * @param {Object} wordState - { states: [], vid, sid }
 * @returns {number} Priority score 0-1
 */
function calculatePriority(wordState) {
  if (!wordState || !wordState.states) return 0;

  const states = wordState.states;

  // Priority order: due > failed > learning > known > never-forget
  if (states.includes('due')) return 1.0;
  if (states.includes('failed')) return 0.9;
  if (states.includes('learning')) return 0.7;
  if (states.includes('known')) return 0.3;
  if (states.includes('never-forget')) return 0.2;

  // Skip new, blacklisted, suspended, not-in-deck
  return 0;
}

/**
 * Get the primary state of a word
 * @param {Object} wordState - { states: [], vid, sid }
 * @returns {string} Primary state
 */
function getPrimaryState(wordState) {
  if (!wordState || !wordState.states || wordState.states.length === 0) {
    return 'unknown';
  }

  const states = wordState.states;

  // Return highest priority state
  if (states.includes('due')) return 'due';
  if (states.includes('failed')) return 'failed';
  if (states.includes('learning')) return 'learning';
  if (states.includes('known')) return 'known';
  if (states.includes('never-forget')) return 'never-forget';

  return states[0];
}

/**
 * Select suggested words for narration
 * @param {string[]} vocabulary - Full vocabulary list
 * @param {Object} wordStates - Word state mapping
 * @param {string[]} recentWords - Recently used words to avoid
 * @param {number} count - Number of suggestions to return
 * @returns {Object[]} Array of { word, state, priority }
 */
export function selectSuggestedWords(vocabulary, wordStates, recentWords, count = CONFIG.suggestionCount) {
  const recentSet = new Set(recentWords);
  const candidates = [];

  // Categorize all words by state
  for (const word of vocabulary) {
    // Skip recently used words
    if (recentSet.has(word)) continue;

    // Skip very short words (usually particles)
    if (word.length < 2) continue;

    const wordState = wordStates[word];
    const priority = calculatePriority(wordState);

    // Only include words with positive priority
    if (priority > 0) {
      candidates.push({
        word,
        state: getPrimaryState(wordState),
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
  selectByState(candidates, selected, 'failed', Math.ceil(targetDue / 2)); // Fill with failed if not enough due
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
 * @param {string} apiKey - JPDB API key
 * @param {string[]} vocabulary - Full vocabulary list
 * @returns {Object[]} Array of { word, state, priority }
 */
export async function getSuggestionsForNarration(apiKey, vocabulary) {
  initVocabManager();

  if (!vocabulary || vocabulary.length === 0) {
    return [];
  }

  // Refresh word states (throttled)
  const wordStates = await refreshWordStateCache(apiKey, vocabulary);

  // Get recently used words
  const recentWords = getRecentlyUsedWords();

  // Select suggestions
  const suggestions = selectSuggestedWords(vocabulary, wordStates, recentWords);

  return suggestions;
}

/**
 * Clear the cache (for testing or reset)
 */
export function clearVocabManagerCache() {
  state = {
    recentlyUsedWords: [],
    wordStateCache: {},
    lastRefresh: null,
    lastFullParse: null,
    initialized: true,
    checkedThisSession: false
  };
  saveCache();
}

/**
 * Force a refresh on next narration (e.g., after user reviews words in JPDB)
 */
export function invalidateWordStateCache() {
  state.checkedThisSession = false;
}

/**
 * Perform a full parse of the static word list
 * Called on session start when cache is missing or older than 1 hour
 *
 * @param {string} apiKey - JPDB API key
 * @param {Object[]} wordList - Static word list [{word, rank}, ...]
 * @returns {Promise<Object>} Word state cache
 */
export async function performFullParse(apiKey, wordList) {
  initVocabManager();

  if (!apiKey || !wordList || wordList.length === 0) {
    return state.wordStateCache;
  }

  const now = Date.now();
  const cacheAge = state.lastFullParse ? now - state.lastFullParse : Infinity;

  // Skip if cache is fresh (less than 1 hour old)
  if (cacheAge < FULL_PARSE_CONFIG.cacheExpiryMs) {
    console.log(`[VocabManager] Cache is fresh (${Math.round(cacheAge / 60000)} min old), skipping full parse`);
    return state.wordStateCache;
  }

  console.log(`[VocabManager] Starting full parse of ${Math.min(wordList.length, FULL_PARSE_CONFIG.maxWords)} words...`);

  // Only parse top N most frequent words
  const wordsToparse = wordList.slice(0, FULL_PARSE_CONFIG.maxWords);

  // Build a map of word -> rank for merging
  const rankMap = {};
  for (const item of wordsToparse) {
    rankMap[item.word] = item.rank;
  }

  // Extract word strings for parsing
  const wordStrings = wordsToparse.map(w => w.word);

  try {
    const results = await parseWordBatches(
      apiKey,
      wordStrings,
      FULL_PARSE_CONFIG.batchSize,
      FULL_PARSE_CONFIG.batchDelayMs
    );

    // Merge results into cache, adding rank
    for (const [word, info] of Object.entries(results)) {
      state.wordStateCache[word] = {
        ...info,
        rank: rankMap[word] || null
      };
    }

    state.lastFullParse = now;
    state.lastRefresh = now;

    saveCache();

    console.log(`[VocabManager] Full parse complete: ${Object.keys(state.wordStateCache).length} words cached`);

    return state.wordStateCache;

  } catch (error) {
    console.error('[VocabManager] Full parse failed:', error.message);
    return state.wordStateCache;
  }
}

/**
 * Get cache stats (for debugging)
 */
export function getVocabManagerStats() {
  initVocabManager();
  return {
    recentWordsCount: state.recentlyUsedWords.length,
    cachedWordStates: Object.keys(state.wordStateCache).length,
    lastRefresh: state.lastRefresh,
    lastFullParse: state.lastFullParse,
    cacheExpiryMs: CONFIG.cacheExpiryMs
  };
}
