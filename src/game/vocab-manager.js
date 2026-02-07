/**
 * Vocabulary Suggestion Manager
 *
 * Manages word suggestions for narration to improve vocabulary variety
 * and prioritize "due" words for spaced repetition learning.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { lookupWordStates, parseWordBatches } from '../jpdb.js';

// Cache directory path - configured via configureVocabManager()
let cacheDir = null;

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
  batchSize: 1000,
  maxWords: 10000,
  batchDelayMs: 1000,
  cacheExpiryMs: 60 * 60 * 1000  // 1 hour
};

// Per-user in-memory state
const userStates = new Map();

// Lock to prevent simultaneous JPDB fetches (per user)
const refreshPromises = new Map();

/**
 * Get cache file path for a specific user
 * @param {string} userId - User ID
 * @returns {string|null} Cache file path or null if not configured
 */
function getUserCacheFile(userId) {
  if (!cacheDir) return null;
  if (!userId) throw new Error('userId is required for cache operations');
  return `${cacheDir}vocab-cache-${userId}.json`;
}

/**
 * Get or create user state
 * @param {string} userId - User ID
 * @returns {Object} User's state object
 */
function getOrCreateUserState(userId) {
  if (!userId) throw new Error('userId is required for cache operations');
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      recentlyUsedWords: [],          // Ring buffer of last N words
      wordStateCache: {},             // { word: { states: [], vid, sid, dueAt, rank } }
      lastRefresh: null,              // Timestamp of last incremental refresh
      lastFullParse: null,            // Timestamp of last full batch parse
      initialized: false,
      checkedThisSession: false       // Only check/refresh once per session
    });
  }
  return userStates.get(userId);
}

/**
 * Configure the vocab manager with directory path
 * @param {object} options - Configuration options
 * @param {string} options.cacheDir - Path to the cache directory
 * @param {string} options.cacheFile - Legacy: Path to the cache file (deprecated)
 */
export function configureVocabManager({ cacheDir: dir, cacheFile: file }) {
  if (dir) {
    cacheDir = dir.endsWith('/') ? dir : dir + '/';
  } else if (file) {
    // Legacy support: extract directory from file path
    const lastSlash = file.lastIndexOf('/');
    cacheDir = lastSlash > 0 ? file.substring(0, lastSlash + 1) : './';
    console.warn('[VocabManager] Using legacy cacheFile config - migrate to cacheDir');
  }
}

/**
 * Initialize the vocabulary manager for a user - load cache from file
 * @param {string} userId - User ID
 */
export function initVocabManager(userId) {
  const state = getOrCreateUserState(userId);
  if (state.initialized) return;

  const userCacheFile = getUserCacheFile(userId);
  if (!userCacheFile) {
    console.warn(`[VocabManager] Not configured for user ${userId} - call configureVocabManager first`);
    state.initialized = true;
    return;
  }

  try {
    if (existsSync(userCacheFile)) {
      const data = JSON.parse(readFileSync(userCacheFile, 'utf-8'));
      state.recentlyUsedWords = data.recentlyUsedWords || [];
      state.wordStateCache = data.wordStateCache || {};
      state.lastRefresh = data.lastRefresh || null;
      state.lastFullParse = data.lastFullParse || null;
      console.log(`[VocabManager] Loaded cache for user ${userId}: ${Object.keys(state.wordStateCache).length} word states, ${state.recentlyUsedWords.length} recent words`);
    }
  } catch (e) {
    console.warn(`[VocabManager] Failed to load cache for user ${userId}:`, e.message);
  }

  state.initialized = true;
}

/**
 * Save cache to file for a specific user
 * @param {string} userId - User ID
 */
function saveCache(userId) {
  const userCacheFile = getUserCacheFile(userId);
  if (!userCacheFile) {
    console.log(`[VocabManager] saveCache: No cacheDir configured for user ${userId}`);
    return;
  }

  const state = getOrCreateUserState(userId);

  try {
    const cacheSize = Object.keys(state.wordStateCache).length;
    console.log(`[VocabManager] saveCache: Writing ${cacheSize} words to ${userCacheFile}`);
    writeFileSync(userCacheFile, JSON.stringify({
      recentlyUsedWords: state.recentlyUsedWords,
      wordStateCache: state.wordStateCache,
      lastRefresh: state.lastRefresh,
      lastFullParse: state.lastFullParse
    }, null, 2));
    console.log('[VocabManager] saveCache: Write successful');
  } catch (e) {
    console.warn('[VocabManager] saveCache: Failed -', e.message);
  }
}

/**
 * Add words to the recently-used ring buffer
 * @param {string[]} words - Words used in narration
 * @param {string} userId - User ID
 */
export function addUsedWords(words, userId) {
  if (!words || words.length === 0) return;

  initVocabManager(userId);
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

  saveCache(userId);
}

/**
 * Get recently used words
 * @param {string} userId - User ID
 * @returns {string[]} Last N words used
 */
export function getRecentlyUsedWords(userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);
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
 * @param {boolean} force - Force refresh even if cache is fresh
 * @param {string} userId - User ID
 * @returns {Object} Word state mapping
 */
export async function refreshWordStateCache(apiKey, vocabulary, force = false, userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);

  // If already refreshing for this user, wait for that to complete (prevents race condition)
  if (refreshPromises.has(userId)) {
    await refreshPromises.get(userId);
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
    console.log(`[VocabManager] Using cached word states for user ${userId} (${Object.keys(state.wordStateCache).length} words, ${Math.round((now - state.lastRefresh) / 60000)} min old)`);
    return state.wordStateCache;
  }

  // Use a promise lock to prevent simultaneous fetches for this user
  const refreshPromise = (async () => {
    try {
      // Determine what to fetch:
      // - If force or cache stale: refresh ALL words (due status may have changed)
      // - If cache incomplete: fetch uncached words only
      const wordsToFetch = cacheIsStale ? vocabulary : uncachedWords;
      const reason = force ? 'forced refresh' : (cacheIsStale ? 'cache stale' : 'incomplete cache');

      console.log(`[VocabManager] Fetching word states for user ${userId}: ${wordsToFetch.length} words (${reason})...`);
      const newStates = await lookupWordStates(apiKey, wordsToFetch);
      Object.assign(state.wordStateCache, newStates);
      console.log(`[VocabManager] Cached ${Object.keys(state.wordStateCache).length} word states total for user ${userId}`);

      state.lastRefresh = now;
      saveCache(userId);

    } catch (e) {
      console.warn(`[VocabManager] Failed to refresh word state cache for user ${userId}:`, e.message);
    }
  })();

  refreshPromises.set(userId, refreshPromise);
  await refreshPromise;
  refreshPromises.delete(userId);

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
 * @param {string} userId - User ID
 * @returns {Object[]} Array of { word, state, priority }
 */
export async function getSuggestionsForNarration(apiKey, vocabulary, userId) {
  initVocabManager(userId);

  if (!vocabulary || vocabulary.length === 0) {
    return [];
  }

  // Refresh word states (throttled)
  const wordStates = await refreshWordStateCache(apiKey, vocabulary, false, userId);

  // Get recently used words
  const recentWords = getRecentlyUsedWords(userId);

  // Select suggestions
  const suggestions = selectSuggestedWords(vocabulary, wordStates, recentWords);

  return suggestions;
}

/**
 * Get a narration-safe vocabulary list for a specific user.
 * Prefers per-user JPDB state cache and falls back to provided vocabulary.
 *
 * Included states:
 * - due / failed / learning / known / never-forget
 *
 * Excluded states:
 * - new / blacklisted / suspended / not-in-deck / locked / redundant
 *
 * @param {string} userId - User ID
 * @param {string[]} fallbackVocabulary - Fallback list when user cache is empty
 * @returns {{ words: string[], vidSet: Set<number> }} Vocabulary words and their JPDB vid set
 */
export function getNarrationVocabularyForUser(userId, fallbackVocabulary = []) {
  if (!userId) {
    const words = [...new Set((fallbackVocabulary || []).filter(w => typeof w === 'string' && w.length > 0))];
    return { words, vidSet: new Set() };
  }

  initVocabManager(userId);
  const state = getOrCreateUserState(userId);
  const allowedStates = new Set(['due', 'failed', 'learning', 'known', 'never-forget']);

  const rankedWords = [];
  const vids = [];
  for (const [word, info] of Object.entries(state.wordStateCache || {})) {
    if (!word || typeof word !== 'string') continue;
    const states = Array.isArray(info?.states) ? info.states : [];
    if (!states.some(s => allowedStates.has(s))) continue;

    rankedWords.push({
      word,
      rank: Number.isFinite(info?.rank) ? info.rank : Number.MAX_SAFE_INTEGER
    });
    if (Number.isFinite(info?.vid)) {
      vids.push(info.vid);
    }
  }

  rankedWords.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.word.localeCompare(b.word, 'ja');
  });

  if (rankedWords.length > 0) {
    return { words: rankedWords.map(entry => entry.word), vidSet: new Set(vids) };
  }

  const words = [...new Set((fallbackVocabulary || []).filter(w => typeof w === 'string' && w.length > 0))];
  return { words, vidSet: new Set() };
}

/**
 * Clear the cache for a user (for testing or reset)
 * @param {string} userId - User ID
 */
export function clearVocabManagerCache(userId) {
  userStates.set(userId, {
    recentlyUsedWords: [],
    wordStateCache: {},
    lastRefresh: null,
    lastFullParse: null,
    initialized: true,
    checkedThisSession: false
  });
  saveCache(userId);
}

/**
 * Force a refresh on next narration (e.g., after user reviews words in JPDB)
 * @param {string} userId - User ID
 */
export function invalidateWordStateCache(userId) {
  const state = getOrCreateUserState(userId);
  state.checkedThisSession = false;
}

/**
 * Invalidate a specific word's cache entry by vid
 * Removes 'due' state and sets dueAt far in future to prevent re-selection
 *
 * @param {number} vid - Vocabulary ID to invalidate
 * @param {string} userId - User ID
 * @returns {boolean} True if word was found and invalidated
 */
export function invalidateWordByVid(vid, userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);

  for (const [word, stateInfo] of Object.entries(state.wordStateCache)) {
    if (stateInfo.vid === vid) {
      const states = stateInfo.states || [];
      const dueIndex = states.indexOf('due');
      if (dueIndex !== -1) {
        states.splice(dueIndex, 1);
        stateInfo.states = states;
        // Set dueAt far in the future so it won't be prioritized
        stateInfo.dueAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now
        console.log(`[VocabManager] Invalidated word "${word}" (vid=${vid}) for user ${userId} - removed 'due' state from in-memory cache`);
        // Note: Don't call saveCache() here - let the caller decide
        return true;
      }
      return false; // Word found but didn't have 'due' state
    }
  }
  return false; // Word not found
}

/**
 * Perform a full parse of the static word list
 * Called on session start when cache is missing or older than 1 hour
 *
 * @param {string} apiKey - JPDB API key
 * @param {Object[]} wordList - Static word list [{word, rank}, ...]
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Word state cache
 */
export async function performFullParse(apiKey, wordList, userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);

  if (!apiKey || !wordList || wordList.length === 0) {
    return state.wordStateCache;
  }

  const now = Date.now();
  const cacheAge = state.lastFullParse ? now - state.lastFullParse : Infinity;

  // Skip if cache is fresh (less than 1 hour old) AND has content
  const cacheHasContent = Object.keys(state.wordStateCache).length > 0;
  if (cacheAge < FULL_PARSE_CONFIG.cacheExpiryMs && cacheHasContent) {
    console.log(`[VocabManager] Cache for user ${userId} is fresh (${Math.round(cacheAge / 60000)} min old, ${Object.keys(state.wordStateCache).length} words), skipping full parse`);
    return state.wordStateCache;
  }

  console.log(`[VocabManager] Starting full parse for user ${userId}: ${Math.min(wordList.length, FULL_PARSE_CONFIG.maxWords)} words...`);

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

    saveCache(userId);

    console.log(`[VocabManager] Full parse complete for user ${userId}: ${Object.keys(state.wordStateCache).length} words cached`);

    return state.wordStateCache;

  } catch (error) {
    console.error(`[VocabManager] Full parse failed for user ${userId}:`, error.message);
    return state.wordStateCache;
  }
}

/**
 * Update specific word states in the cache
 * Called after combat to refresh reviewed word states
 *
 * @param {Object} wordStates - Map of word -> { vid, sid, states, dueAt, reading }
 * @param {string} userId - User ID
 * @returns {number} Number of words updated
 */
export function updateWordStates(wordStates, userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);

  if (!wordStates || Object.keys(wordStates).length === 0) {
    return 0;
  }

  let updated = 0;
  for (const [word, info] of Object.entries(wordStates)) {
    // Preserve existing rank if present
    const existingRank = state.wordStateCache[word]?.rank;
    state.wordStateCache[word] = {
      ...info,
      rank: existingRank || info.rank || null
    };
    updated++;
  }

  state.lastRefresh = Date.now();
  saveCache(userId);

  console.log(`[VocabManager] Updated ${updated} word states for user ${userId}`);
  return updated;
}

/**
 * Get cache stats (for debugging)
 * @param {string} userId - User ID
 */
export function getVocabManagerStats(userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);
  return {
    recentWordsCount: state.recentlyUsedWords.length,
    cachedWordStates: Object.keys(state.wordStateCache).length,
    lastRefresh: state.lastRefresh,
    lastFullParse: state.lastFullParse,
    cacheExpiryMs: CONFIG.cacheExpiryMs
  };
}

/**
 * Get new words for discovery room, sorted by frequency rank
 * @param {number} limit - Maximum words to return
 * @param {string} userId - User ID
 * @returns {Object} { words: Array<{word, reading, meanings, vid, sid, rank}>, available: boolean }
 */
export function getNewWordsForDiscovery(limit = 2, userId) {
  initVocabManager(userId);
  const state = getOrCreateUserState(userId);

  const cacheSize = Object.keys(state.wordStateCache).length;
  if (cacheSize === 0) {
    console.log(`[Discovery] Word state cache is empty for user ${userId} - no words available`);
    return { words: [], available: false };
  }

  const newWords = [];

  // States that disqualify a word from discovery (even if also 'new')
  const EXCLUDED_STATES = ['locked', 'blacklisted', 'suspended', 'redundant'];

  for (const [word, info] of Object.entries(state.wordStateCache)) {
    const states = info.states || [];
    const isNew = states.includes('new');
    const hasExcludedState = states.some(s => EXCLUDED_STATES.includes(s));

    if (isNew && !hasExcludedState) {
      newWords.push({
        word,
        reading: info.reading || word,
        meanings: info.meanings || [],
        vid: info.vid,
        sid: info.sid,
        rank: info.rank || Infinity
      });
    }
  }

  // Sort by rank (lower = higher frequency = prioritized)
  newWords.sort((a, b) => a.rank - b.rank);

  const words = newWords.slice(0, limit);

  console.log(`[Discovery] Cache for user ${userId} has ${cacheSize} words, found ${newWords.length} with 'new' state (no excluded states), returning ${words.length}`);
  if (words.length > 0) {
    console.log(`[Discovery] Selected words for user ${userId}: ${words.map(w => `${w.word} (states: ${state.wordStateCache[w.word]?.states?.join(',') || 'none'})`).join(', ')}`);
  }

  return {
    words,
    available: words.length > 0
  };
}

/**
 * Set test cache (for unit testing only)
 * @param {Object} cache - Word state cache to inject
 * @param {string} userId - User ID
 */
export function setTestCache(cache, userId) {
  const state = getOrCreateUserState(userId);
  state.wordStateCache = cache;
  state.initialized = true;
}
