/**
 * JPDB API Integration Module
 *
 * Interfaces with jpdb.io (Japanese Dictionary Database) to:
 * - Fetch user's known vocabulary from their decks
 * - Parse Japanese text into component words
 * - Look up word learning states (new, learning, known, due, etc.)
 * - Submit vocabulary reviews
 *
 * @module @jchat/shared/jpdb
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { logger } from './logger.js';

const JPDB_API_BASE = 'https://jpdb.io/api/v1';

// Configuration - set by the consuming app
let config = {
  vocabCacheFile: null,
  vocabSuggestionsFile: null
};

/**
 * Configure the JPDB module with file paths
 * @param {object} options
 * @param {string} options.vocabCacheFile - Path to vocab cache JSON file
 * @param {string} options.vocabSuggestionsFile - Path to vocab suggestions JSON file
 */
export function configure(options) {
  if (options.vocabCacheFile) {
    config.vocabCacheFile = options.vocabCacheFile;
  }
  if (options.vocabSuggestionsFile) {
    config.vocabSuggestionsFile = options.vocabSuggestionsFile;
  }
}

// Rate limiting - prevent getting IP blocked
let lastJpdbCall = 0;
const MIN_CALL_INTERVAL_MS = 500;

// Circuit breaker state - stops all calls after rate limit errors
let circuitBreaker = {
  isOpen: false,
  cooldownUntil: 0,
  consecutiveFailures: 0
};

const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes
const CIRCUIT_BREAKER_EXTENDED_COOLDOWN_MS = 15 * 60 * 1000;  // 15 minutes

/**
 * Get circuit breaker state for monitoring
 */
export function getCircuitBreakerState() {
  return {
    isOpen: circuitBreaker.isOpen,
    cooldownUntil: circuitBreaker.cooldownUntil,
    consecutiveFailures: circuitBreaker.consecutiveFailures
  };
}

/**
 * Reset circuit breaker (for testing)
 */
export function resetCircuitBreaker() {
  circuitBreaker = {
    isOpen: false,
    cooldownUntil: 0,
    consecutiveFailures: 0
  };
}

/**
 * Trip the circuit breaker after a rate limit or server error
 * @param {number} statusCode - HTTP status code that caused the trip
 */
export function tripCircuitBreaker(statusCode) {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.isOpen = true;

  // Extended cooldown after multiple failures
  const cooldownMs = circuitBreaker.consecutiveFailures > 1
    ? CIRCUIT_BREAKER_EXTENDED_COOLDOWN_MS
    : CIRCUIT_BREAKER_COOLDOWN_MS;

  circuitBreaker.cooldownUntil = Date.now() + cooldownMs;

  logger.warn('[JPDB] Circuit breaker tripped:', { statusCode, cooldownMs: cooldownMs / 1000, failures: circuitBreaker.consecutiveFailures });
}

/**
 * Check if circuit breaker allows requests
 */
function isCircuitBreakerClosed() {
  if (!circuitBreaker.isOpen) return true;

  if (Date.now() >= circuitBreaker.cooldownUntil) {
    logger.debug('[JPDB] Circuit breaker cooldown expired, testing');
    return true;  // Allow one test request
  }

  return false;
}

/**
 * Reset circuit breaker on successful request
 */
function onSuccessfulRequest() {
  if (circuitBreaker.isOpen) {
    logger.debug('[JPDB] Circuit breaker reset on success');
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    circuitBreaker.cooldownUntil = 0;
  }
}

/**
 * Rate-limited fetch for JPDB API calls with circuit breaker
 */
async function jpdbFetch(url, options) {
  // Check circuit breaker first
  if (!isCircuitBreakerClosed()) {
    const waitMs = circuitBreaker.cooldownUntil - Date.now();
    throw new Error(`JPDB circuit breaker open, ${Math.ceil(waitMs / 1000)}s remaining`);
  }

  const now = Date.now();
  const timeSinceLastCall = now - lastJpdbCall;

  if (timeSinceLastCall < MIN_CALL_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL_MS - timeSinceLastCall));
  }

  lastJpdbCall = Date.now();

  const response = await fetch(url, options);

  // Trip circuit breaker on rate limit or server errors
  if (response.status === 429 || response.status >= 500) {
    tripCircuitBreaker(response.status);
  } else if (response.ok) {
    onSuccessfulRequest();
  }

  return response;
}

/**
 * Parse a batch of words to get their vid/sid and card states
 * Uses /parse endpoint which is more efficient than lookup for bulk operations
 *
 * @param {string} apiKey - JPDB API key
 * @param {string[]} words - Array of word spellings to parse
 * @returns {Promise<Object>} Map of spelling -> { vid, sid, states, dueAt }
 */
export async function parseWordBatch(apiKey, words) {
  if (!apiKey) {
    console.warn('[JPDB Batch Parse] No API key provided');
    return {};
  }
  if (!words || words.length === 0) {
    return {};
  }

  // Join words with spaces for parsing
  const text = words.join(' ');

  try {
    const parseResponse = await jpdbFetch(`${JPDB_API_BASE}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        text,
        token_fields: ['vocabulary_index'],
        vocabulary_fields: ['spelling', 'reading', 'vid', 'sid']
      })
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text().catch(() => 'unknown');
      console.warn(`[JPDB Batch Parse] Parse failed: ${parseResponse.status} - ${errorText}`);
      return {};
    }

    const parseData = await parseResponse.json();
    const vocabulary = parseData.vocabulary || [];

    if (vocabulary.length === 0) return {};

    // Build vocab ID list for state lookup
    const vocabIds = vocabulary.map(v => [v[2], v[3]]); // [vid, sid]
    const spellingMap = {};
    vocabulary.forEach(v => {
      spellingMap[v[0]] = { vid: v[2], sid: v[3], reading: v[1] };
    });

    // Lookup card states for all parsed words
    const lookupResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        list: vocabIds,
        fields: ['spelling', 'card_state', 'due_at']
      })
    });

    if (!lookupResponse.ok) {
      // Return just vid/sid without states
      return spellingMap;
    }

    const lookupData = await lookupResponse.json();
    const vocabInfo = lookupData.vocabulary_info || [];

    // Merge states into spelling map
    for (let i = 0; i < vocabInfo.length; i++) {
      const info = vocabInfo[i];
      if (!info) continue;
      const [spelling, cardStates, dueAt] = info;
      if (spellingMap[spelling]) {
        spellingMap[spelling].states = cardStates || [];
        spellingMap[spelling].dueAt = dueAt ?? null;
      }
    }

    return spellingMap;

  } catch (error) {
    console.warn('[JPDB Batch Parse] Error:', error.message);
    return {};
  }
}

/**
 * Parse multiple batches of words with delay between batches
 *
 * @param {string} apiKey - JPDB API key
 * @param {string[]} words - All words to parse
 * @param {number} batchSize - Words per batch (default 2000)
 * @param {number} delayMs - Delay between batches in ms (default 3000)
 * @returns {Promise<Object>} Combined map of spelling -> { vid, sid, states, dueAt }
 */
export async function parseWordBatches(apiKey, words, batchSize = 2000, delayMs = 3000) {
  const results = {};
  const totalBatches = Math.ceil(words.length / batchSize);

  console.log(`[JPDB Batch Parse] Starting ${totalBatches} batches of ${batchSize} words`);

  for (let i = 0; i < words.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = words.slice(i, i + batchSize);

    console.log(`[JPDB Batch Parse] Batch ${batchNum}/${totalBatches} (${batch.length} words)`);

    const batchResults = await parseWordBatch(apiKey, batch);
    Object.assign(results, batchResults);

    // Delay between batches (except after last batch)
    if (i + batchSize < words.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  logger.info('[JPDB] Batch parse completed:', { wordCount: Object.keys(results).length });
  return results;
}

// Cache for vocabulary
let vocabCache = null;

// Manual vocabulary storage
let manualVocabulary = [];

/**
 * Load vocabulary from disk cache
 */
function loadVocabFromFile() {
  if (!config.vocabCacheFile) return null;

  if (existsSync(config.vocabCacheFile)) {
    try {
      const data = JSON.parse(readFileSync(config.vocabCacheFile, 'utf-8'));
      console.log(`Loaded ${data.count} words from vocab cache file`);
      return data;
    } catch (e) {
      console.warn('Failed to load vocab cache file:', e.message);
    }
  }
  return null;
}

/**
 * Save vocabulary to disk cache
 */
function saveVocabToFile(data) {
  if (!config.vocabCacheFile) return;

  try {
    writeFileSync(config.vocabCacheFile, JSON.stringify(data, null, 2));
    console.log(`Saved ${data.count} words to vocab cache file`);
  } catch (e) {
    console.warn('Failed to save vocab cache:', e.message);
  }
}

/**
 * Initialize the module - load cache from file
 */
export function initialize() {
  vocabCache = loadVocabFromFile();
}

/**
 * Get cached or manual vocabulary
 */
export function getVocabulary() {
  // Return cached vocabulary if available
  if (vocabCache) {
    return vocabCache;
  }

  // Try loading from file if memory cache is empty
  const fileCache = loadVocabFromFile();
  if (fileCache) {
    vocabCache = fileCache;
    return vocabCache;
  }

  if (manualVocabulary.length > 0) {
    return { words: manualVocabulary, count: manualVocabulary.length };
  }

  return { words: [], count: 0 };
}

/**
 * Set manual vocabulary
 */
export function setManualVocabulary(vocabText) {
  if (!vocabText || !vocabText.trim()) {
    manualVocabulary = [];
    return { words: [], count: 0 };
  }

  const words = vocabText
    .split(/[\n,\s]+/)
    .map(w => w.trim())
    .filter(w => w.length > 0);

  manualVocabulary = [...new Set(words)];
  vocabCache = { words: manualVocabulary, count: manualVocabulary.length, source: 'manual' };
  saveVocabToFile(vocabCache);

  return { words: manualVocabulary, count: manualVocabulary.length };
}

/**
 * Clear vocabulary cache (memory only, keeps file for persistence)
 */
export function clearVocabCache() {
  vocabCache = null;
}

/**
 * Parse Japanese text into vocabulary words using JPDB
 */
export async function parseText(apiKey, text) {
  if (!apiKey || !text) {
    return [];
  }

  try {
    const response = await jpdbFetch(`${JPDB_API_BASE}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        text,
        token_fields: ['vocabulary_index', 'position', 'length'],
        vocabulary_fields: ['spelling', 'reading', 'vid', 'sid']
      })
    });

    if (!response.ok) {
      console.warn('JPDB parse failed:', response.status);
      return [];
    }

    const data = await response.json();
    const vocabulary = data.vocabulary || [];
    const tokens = data.tokens || [];

    // Build vocabulary lookup by index
    const vocabLookup = vocabulary.map(v => ({
      spelling: v[0],
      reading: v[1],
      vid: v[2],
      sid: v[3]
    }));

    // JPDB returns positions in BYTES, not characters.
    // We need to convert byte positions to character positions.
    const textBytes = Buffer.from(text, 'utf-8');

    // Build a byte-to-char index map
    const byteToChar = [];
    let charIndex = 0;
    for (let byteIndex = 0; byteIndex < textBytes.length; charIndex++) {
      const char = text[charIndex];
      const charBytes = Buffer.byteLength(char, 'utf-8');
      for (let i = 0; i < charBytes; i++) {
        byteToChar[byteIndex + i] = charIndex;
      }
      byteIndex += charBytes;
    }
    // Add end position
    byteToChar[textBytes.length] = text.length;

    // Build result array preserving text order using tokens
    const result = [];
    let lastCharEnd = 0;

    for (const token of tokens) {
      const [vocabIndex, bytePos, byteLen] = token;

      // Convert byte positions to character positions
      const charPos = byteToChar[bytePos] ?? 0;
      const charEnd = byteToChar[bytePos + byteLen] ?? text.length;

      // Add any text between tokens (punctuation, spaces, etc.)
      if (charPos > lastCharEnd) {
        const betweenText = text.slice(lastCharEnd, charPos);
        result.push({
          spelling: betweenText,
          reading: null,
          vid: null,
          sid: null,
          isWord: false
        });
      }

      // Add the token - use actual text from source, but vid/sid from vocabulary
      const actualSpelling = text.slice(charPos, charEnd);
      if (vocabIndex !== null && vocabLookup[vocabIndex]) {
        result.push({
          spelling: actualSpelling,  // Use actual conjugated form from text
          reading: vocabLookup[vocabIndex].reading,
          vid: vocabLookup[vocabIndex].vid,
          sid: vocabLookup[vocabIndex].sid,
          isWord: true
        });
      } else {
        result.push({
          spelling: actualSpelling,
          reading: null,
          vid: null,
          sid: null,
          isWord: false
        });
      }

      lastCharEnd = charEnd;
    }

    // Add any remaining text after the last token
    if (lastCharEnd < text.length) {
      result.push({
        spelling: text.slice(lastCharEnd),
        reading: null,
        vid: null,
        sid: null,
        isWord: false
      });
    }

    return result;
  } catch (error) {
    console.warn('JPDB parse error:', error);
    return [];
  }
}

/**
 * Test JPDB API connection
 */
export async function testConnection(apiKey) {
  try {
    const response = await jpdbFetch(`${JPDB_API_BASE}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        text: 'テスト',
        token_fields: [],
        vocabulary_fields: ['spelling']
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * All possible JPDB card states
 */
export const CARD_STATES = [
  'new',
  'learning',
  'known',
  'never-forget',
  'due',
  'failed',
  'suspended',
  'blacklisted',
  'not-in-deck'
];

/**
 * Lookup card states for a list of words
 */
export async function lookupWordStates(apiKey, words) {
  if (!apiKey || !words || words.length === 0) {
    return {};
  }

  const wordStates = {};
  const chunkSize = 1000;

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize);
    const text = chunk.join(' ');

    try {
      const parseResponse = await jpdbFetch(`${JPDB_API_BASE}/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          text,
          token_fields: ['vocabulary_index'],
          vocabulary_fields: ['spelling', 'reading', 'vid', 'sid']
        })
      });

      if (parseResponse.status === 429) {
        console.warn('Rate limited during word state lookup');
        break;
      }

      if (!parseResponse.ok) {
        continue;
      }

      const parseData = await parseResponse.json();
      const vocabulary = parseData.vocabulary || [];

      if (vocabulary.length === 0) continue;

      const vocabIds = [];
      const vocabIdMap = {};
      for (const v of vocabulary) {
        const spelling = v[0];
        const vid = v[2];
        const sid = v[3];
        vocabIds.push([vid, sid]);
        vocabIdMap[spelling] = { vid, sid };
      }

      const lookupResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          list: vocabIds,
          fields: ['spelling', 'card_state', 'due_at']
        })
      });

      if (lookupResponse.status === 429) {
        console.warn('Rate limited during card state lookup');
        break;
      }

      if (lookupResponse.ok) {
        const lookupData = await lookupResponse.json();
        const vocabInfo = lookupData.vocabulary_info || [];

        for (let j = 0; j < vocabInfo.length; j++) {
          const info = vocabInfo[j];
          if (!info) continue;
          const spelling = info[0];
          const cardStates = info[1] || [];
          const dueAt = info[2];
          const ids = vocabIdMap[spelling] || { vid: vocabIds[j][0], sid: vocabIds[j][1] };

          wordStates[spelling] = {
            states: cardStates.length === 0 ? ['new'] : cardStates,
            vid: ids.vid,
            sid: ids.sid,
            dueAt: dueAt ?? null
          };
        }
      }
    } catch (e) {
      console.warn('Word state lookup error:', e);
    }
  }

  return wordStates;
}

/**
 * Review grades for JPDB
 */
export const REVIEW_GRADES = {
  1: 'nothing',
  2: 'something',
  3: 'hard',
  4: 'okay',
  5: 'easy'
};

/**
 * Get due words with their English meanings for word practice
 */
export async function getDueWordsWithMeanings(apiKey, limit = 50, excludeVids = []) {
  console.log('[getDueWordsWithMeanings] Called with limit:', limit);
  if (!apiKey) {
    console.log('[getDueWordsWithMeanings] No API key');
    return { words: [], source: 'none' };
  }

  let wordStateCache = {};

  // Read from configured vocab suggestions file
  console.log('[getDueWordsWithMeanings] vocabSuggestionsFile:', config.vocabSuggestionsFile || 'NOT SET');
  if (config.vocabSuggestionsFile) {
    try {
      const fileExists = existsSync(config.vocabSuggestionsFile);
      console.log('[getDueWordsWithMeanings] File exists:', fileExists);
      if (fileExists) {
        const data = JSON.parse(readFileSync(config.vocabSuggestionsFile, 'utf-8'));
        wordStateCache = data.wordStateCache || {};
        console.log('[getDueWordsWithMeanings] Loaded cache with', Object.keys(wordStateCache).length, 'words');
      }
    } catch (e) {
      console.warn('Failed to load vocab suggestions cache:', e.message);
    }
  }

  if (Object.keys(wordStateCache).length === 0) {
    console.log('[getDueWordsWithMeanings] Cache is empty, returning no words');
    return { words: [], source: 'none' };
  }

  const excludeSet = new Set(excludeVids);
  // Only include words that actually need review - not "known" words
  const priorityOrder = ['due', 'failed', 'learning'];
  const candidatesByPriority = {
    due: [],
    failed: [],
    learning: []
  };

  for (const [word, stateInfo] of Object.entries(wordStateCache)) {
    if (!word || !stateInfo.vid || !stateInfo.sid) continue;

    const states = stateInfo.states || [];

    if (excludeSet.has(stateInfo.vid)) continue;
    // Skip words with states that shouldn't be reviewed
    if (states.some(s => ['blacklisted', 'suspended', 'new', 'redundant'].includes(s))) continue;

    for (const priority of priorityOrder) {
      if (states.includes(priority)) {
        candidatesByPriority[priority].push({
          word: word,
          vid: stateInfo.vid,
          sid: stateInfo.sid,
          dueAt: stateInfo.dueAt ?? null
        });
        break;
      }
    }
  }

  const selected = [];
  for (const priority of priorityOrder) {
    const candidates = candidatesByPriority[priority];
    candidates.sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      selected.push(candidate);
    }
    if (selected.length >= limit) break;
  }

  if (selected.length === 0) {
    return { words: [], source: 'none' };
  }

  const vocabIds = selected.map(s => [s.vid, s.sid]);

  try {
    const lookupResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        list: vocabIds,
        fields: ['spelling', 'reading', 'meanings_chunks', 'meanings_part_of_speech']
      })
    });

    if (!lookupResponse.ok) {
      if (lookupResponse.status === 429) {
        console.warn('Rate limited fetching word meanings');
      }
      return { words: [], source: 'error' };
    }

    const lookupData = await lookupResponse.json();
    const vocabInfo = lookupData.vocabulary_info || [];

    const results = [];
    for (let i = 0; i < vocabInfo.length; i++) {
      const info = vocabInfo[i];
      if (!info) continue;

      const [spelling, reading, meaningsChunks] = info;

      const meanings = [];
      if (meaningsChunks && Array.isArray(meaningsChunks)) {
        for (const chunk of meaningsChunks) {
          if (Array.isArray(chunk)) {
            for (const meaning of chunk) {
              if (meaning && typeof meaning === 'string') {
                meanings.push(meaning);
              }
            }
          }
        }
      }

      if (meanings.length > 0) {
        results.push({
          word: spelling,
          reading: reading,
          meanings: meanings,
          vid: selected[i].vid,
          sid: selected[i].sid
        });
      }
    }

    const dueCount = candidatesByPriority.due.length;
    const source = dueCount > 0 ? 'due' : 'learning';

    return { words: results, source };

  } catch (e) {
    console.warn('Failed to fetch word meanings:', e.message);
    return { words: [], source: 'error' };
  }
}

/**
 * Send a review for a vocabulary item
 */
export async function reviewVocabulary(apiKey, vid, sid, grade) {
  if (!apiKey) {
    throw new Error('JPDB API key required');
  }

  const gradeString = typeof grade === 'string' ? grade : REVIEW_GRADES[grade];

  if (!gradeString) {
    throw new Error(`Invalid grade: ${grade}`);
  }

  const body = {
    vid: parseInt(vid, 10),
    sid: parseInt(sid, 10),
    grade: gradeString
  };

  console.log('Sending review to JPDB:', body);

  const response = await jpdbFetch(`${JPDB_API_BASE}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.log('JPDB review error:', responseData);
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment.');
    }
    throw new Error(responseData.error_message || `Review failed: ${response.status}`);
  }

  return true;
}

/**
 * Invalidate a word in the local state cache after it has been reviewed.
 * This removes the 'due' state so the word won't appear in due words list
 * until the cache is refreshed from JPDB.
 * @param {number} vid - Vocabulary ID
 */
export function invalidateWordStateCache(vid) {
  if (!config.vocabSuggestionsFile) {
    return false;
  }

  try {
    if (!existsSync(config.vocabSuggestionsFile)) {
      return false;
    }

    const data = JSON.parse(readFileSync(config.vocabSuggestionsFile, 'utf-8'));
    const wordStateCache = data.wordStateCache || {};

    // Find the entry with matching vid and remove 'due' from states
    for (const [word, stateInfo] of Object.entries(wordStateCache)) {
      if (stateInfo.vid === vid) {
        const states = stateInfo.states || [];
        const dueIndex = states.indexOf('due');
        if (dueIndex !== -1) {
          states.splice(dueIndex, 1);
          stateInfo.states = states;
          // Set dueAt far in the future so it won't be prioritized
          stateInfo.dueAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now
          console.log(`[JPDB Cache] Invalidated word "${word}" (vid=${vid}) - removed 'due' state`);
        }
        break;
      }
    }

    // Write back the updated cache
    writeFileSync(config.vocabSuggestionsFile, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.warn('[JPDB Cache] Failed to invalidate word state:', e.message);
    return false;
  }
}

/**
 * Get the updated state for a single word from JPDB
 */
export async function getWordState(apiKey, vid, sid) {
  if (!apiKey) {
    throw new Error('JPDB API key required');
  }

  const response = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      list: [[vid, sid]],
      fields: ['spelling', 'card_state', 'due_at']
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited');
    }
    throw new Error(`Failed to get word state: ${response.status}`);
  }

  const data = await response.json();
  const vocabInfo = data.vocabulary_info?.[0];

  if (!vocabInfo) {
    return null;
  }

  return {
    spelling: vocabInfo[0],
    states: vocabInfo[1] || [],
    dueAt: vocabInfo[2] ?? null
  };
}

/**
 * Get due words from local cache without API call
 * @param {number} limit - Max words to return
 * @param {number[]} excludeVids - Vocabulary IDs to exclude
 * @returns {{words: Array, source: string, needsMeanings?: boolean}}
 */
function getDueWordsFromCache(limit, excludeVids) {
  if (!config.vocabSuggestionsFile) {
    return { words: [], source: 'none' };
  }

  try {
    if (!existsSync(config.vocabSuggestionsFile)) {
      return { words: [], source: 'none' };
    }

    const data = JSON.parse(readFileSync(config.vocabSuggestionsFile, 'utf-8'));
    const wordStateCache = data.wordStateCache || {};

    const excludeSet = new Set(excludeVids.map(v => parseInt(v, 10)));
    const priorityOrder = ['due', 'failed', 'learning'];
    const candidates = [];

    for (const [word, stateInfo] of Object.entries(wordStateCache)) {
      if (!word || !stateInfo.vid || !stateInfo.sid) continue;
      if (excludeSet.has(stateInfo.vid)) continue;

      const states = stateInfo.states || [];
      if (states.some(s => ['blacklisted', 'suspended', 'new', 'redundant'].includes(s))) continue;

      // Check if word is reviewable
      for (const priority of priorityOrder) {
        if (states.includes(priority)) {
          candidates.push({
            word,
            reading: stateInfo.reading || null,
            vid: stateInfo.vid,
            sid: stateInfo.sid,
            dueAt: stateInfo.dueAt ?? null,
            priority: priorityOrder.indexOf(priority)
          });
          break;
        }
      }
    }

    if (candidates.length === 0) {
      return { words: [], source: 'none' };
    }

    // Sort by priority, then by dueAt
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });

    const selected = candidates.slice(0, limit);

    // Format for word practice (needs meanings, which we'll fetch)
    return {
      words: selected.map(w => ({
        word: w.word,
        reading: w.reading,
        meanings: [],  // Will be populated by lookup
        vid: w.vid,
        sid: w.sid
      })),
      source: 'cache',
      needsMeanings: true
    };

  } catch (e) {
    console.warn('[JPDB] Failed to read cache:', e.message);
    return { words: [], source: 'none' };
  }
}

/**
 * Fetch due/failed words - uses local cache first, falls back to API only if needed
 *
 * @param {string} apiKey - JPDB API key
 * @param {number} limit - Max words to return (default 50)
 * @param {number[]} excludeVids - Vocabulary IDs to exclude
 * @returns {Promise<{words: Array, source: string}>}
 */
export async function fetchDueWordsDirectly(apiKey, limit = 50, excludeVids = []) {
  if (!apiKey) {
    return { words: [], source: 'none' };
  }

  // First try to serve from local cache (fast path)
  const cacheResult = getDueWordsFromCache(limit, excludeVids);
  if (cacheResult.words.length > 0) {
    console.log(`[JPDB] Served ${cacheResult.words.length} due words from cache`);
    return cacheResult;
  }

  console.log('[JPDB] Cache empty, fetching from API...');
  return fetchDueWordsFromApi(apiKey, limit, excludeVids);
}

/**
 * Fetch due/failed words directly from JPDB API (fallback when cache is empty)
 *
 * Uses cached vocab IDs from the suggestions file for speed,
 * falling back to full deck scanning only if no cache exists.
 *
 * @param {string} apiKey - JPDB API key
 * @param {number} limit - Max words to return (default 50)
 * @param {number[]} excludeVids - Vocabulary IDs to exclude
 * @returns {Promise<{words: Array, source: string}>}
 */
async function fetchDueWordsFromApi(apiKey, limit = 50, excludeVids = []) {
  console.log('[JPDB Direct] Fetching due words directly from JPDB...');

  // Step 1: Try to get vocab IDs from local cache first (much faster)
  let uniqueVocabIds = [];

  // Read vocab IDs from cached word states if available
  if (config.vocabSuggestionsFile) {
    try {
      if (existsSync(config.vocabSuggestionsFile)) {
        const data = JSON.parse(readFileSync(config.vocabSuggestionsFile, 'utf-8'));
        const wordStateCache = data.wordStateCache || {};

        // Extract all [vid, sid] pairs from the cache
        const seen = new Set();
        for (const [word, stateInfo] of Object.entries(wordStateCache)) {
          if (stateInfo.vid && stateInfo.sid) {
            const key = `${stateInfo.vid}-${stateInfo.sid}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueVocabIds.push([stateInfo.vid, stateInfo.sid]);
            }
          }
        }
        console.log(`[JPDB Direct] Using ${uniqueVocabIds.length} vocab IDs from local cache`);
      }
    } catch (e) {
      console.warn('[JPDB Direct] Failed to read vocab cache:', e.message);
    }
  }

  // Fall back to deck scanning if no cached vocab IDs
  if (uniqueVocabIds.length === 0) {
    console.log('[JPDB Direct] No cached vocab IDs, scanning decks...');
    const allVocabIds = [];

    // Scan decks 1-50
    for (let deckId = 1; deckId <= 50; deckId++) {
      try {
        const response = await jpdbFetch(`${JPDB_API_BASE}/deck/list-vocabulary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ id: deckId })
        });

        if (response.status === 429) {
          console.warn('[JPDB Direct] Rate limited while scanning decks');
          break;
        }

        if (response.ok) {
          const data = await response.json();
          if (data.vocabulary && data.vocabulary.length > 0) {
            allVocabIds.push(...data.vocabulary);
          }
        }
      } catch (e) {
        // Ignore errors for individual decks
      }
    }

    // Also check never-forget deck
    try {
      const response = await jpdbFetch(`${JPDB_API_BASE}/deck/list-vocabulary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ id: 'never-forget' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.vocabulary && data.vocabulary.length > 0) {
          allVocabIds.push(...data.vocabulary);
        }
      }
    } catch (e) {
      // Ignore
    }

    if (allVocabIds.length === 0) {
      console.log('[JPDB Direct] No vocabulary found in decks');
      return { words: [], source: 'none' };
    }

    // Deduplicate vocab IDs
    const seen = new Set();
    for (const [vid, sid] of allVocabIds) {
      const key = `${vid}-${sid}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueVocabIds.push([vid, sid]);
      }
    }
  }

  console.log(`[JPDB Direct] Looking up fresh card states for ${uniqueVocabIds.length} vocab entries`);

  // Step 2: Lookup card states and filter for due/failed
  const excludeSet = new Set(excludeVids.map(v => parseInt(v, 10)));
  const dueWords = [];
  const chunkSize = 1000;

  for (let i = 0; i < uniqueVocabIds.length; i += chunkSize) {
    const chunk = uniqueVocabIds.slice(i, i + chunkSize);

    try {
      const lookupResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          list: chunk,
          fields: ['spelling', 'reading', 'card_state', 'due_at']
        })
      });

      if (lookupResponse.status === 429) {
        console.warn('[JPDB Direct] Rate limited during lookup');
        break;
      }

      if (lookupResponse.ok) {
        const lookupData = await lookupResponse.json();
        const vocabInfo = lookupData.vocabulary_info || [];

        for (let j = 0; j < vocabInfo.length; j++) {
          const info = vocabInfo[j];
          if (!info) continue;

          const [spelling, reading, cardStates, dueAt] = info;
          const [vid, sid] = chunk[j];

          // Skip excluded words
          if (excludeSet.has(vid)) continue;

          // Only include words that are due or failed
          const isDue = cardStates && cardStates.some(s => ['due', 'failed'].includes(s));
          if (isDue && spelling) {
            dueWords.push({
              spelling,
              reading,
              vid,
              sid,
              dueAt: dueAt ?? null,
              states: cardStates
            });
          }
        }
      }
    } catch (e) {
      console.warn('[JPDB Direct] Lookup chunk failed:', e);
    }
  }

  console.log(`[JPDB Direct] Found ${dueWords.length} due/failed words`);

  if (dueWords.length === 0) {
    return { words: [], source: 'none' };
  }

  // Sort by due date (oldest first) and take top N
  dueWords.sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });

  const selected = dueWords.slice(0, limit);

  // Step 3: Fetch meanings for selected words
  const vocabIds = selected.map(w => [w.vid, w.sid]);

  try {
    const meaningResponse = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        list: vocabIds,
        fields: ['spelling', 'reading', 'meanings_chunks', 'meanings_part_of_speech']
      })
    });

    if (!meaningResponse.ok) {
      if (meaningResponse.status === 429) {
        console.warn('[JPDB Direct] Rate limited fetching meanings');
      }
      // Return words without meanings
      return {
        words: selected.map(w => ({
          word: w.spelling,
          reading: w.reading,
          meanings: [],
          vid: w.vid,
          sid: w.sid
        })),
        source: 'due'
      };
    }

    const meaningData = await meaningResponse.json();
    const vocabInfo = meaningData.vocabulary_info || [];

    const results = [];
    for (let i = 0; i < vocabInfo.length; i++) {
      const info = vocabInfo[i];
      if (!info) continue;

      const [spelling, reading, meaningsChunks] = info;

      const meanings = [];
      if (meaningsChunks && Array.isArray(meaningsChunks)) {
        for (const chunk of meaningsChunks) {
          if (Array.isArray(chunk)) {
            for (const meaning of chunk) {
              if (meaning && typeof meaning === 'string') {
                meanings.push(meaning);
              }
            }
          }
        }
      }

      if (meanings.length > 0) {
        results.push({
          word: spelling,
          reading: reading,
          meanings: meanings,
          vid: selected[i].vid,
          sid: selected[i].sid
        });
      }
    }

    console.log(`[JPDB Direct] Returning ${results.length} due words with meanings`);
    return { words: results, source: 'due' };

  } catch (e) {
    console.warn('[JPDB Direct] Failed to fetch meanings:', e.message);
    return { words: [], source: 'error' };
  }
}

/**
 * Look up vocabulary meaning for popup dictionary
 * @param {string} apiKey - JPDB API key
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 * @returns {Promise<{spelling, reading, meanings, partOfSpeech}>}
 */
export async function lookupVocabularyMeaning(apiKey, vid, sid) {
  if (!apiKey) {
    throw new Error('JPDB API key required');
  }

  const response = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      list: [[vid, sid]],
      fields: ['spelling', 'reading', 'meanings_chunks', 'meanings_part_of_speech', 'card_state']
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited');
    }
    throw new Error(`Failed to lookup vocabulary: ${response.status}`);
  }

  const data = await response.json();
  const vocabInfo = data.vocabulary_info?.[0];

  if (!vocabInfo) {
    return null;
  }

  const [spelling, reading, meaningsChunks, partOfSpeech, cardState] = vocabInfo;

  // Flatten meanings chunks into array of strings
  const meanings = [];
  if (meaningsChunks && Array.isArray(meaningsChunks)) {
    for (const chunk of meaningsChunks) {
      if (Array.isArray(chunk)) {
        for (const meaning of chunk) {
          if (meaning && typeof meaning === 'string') {
            meanings.push(meaning);
          }
        }
      }
    }
  }

  return {
    spelling,
    reading,
    meanings,
    partOfSpeech: partOfSpeech || [],
    cardState: cardState || []
  };
}

/**
 * Batch lookup vocabulary meanings for multiple words
 * @param {string} apiKey - JPDB API key
 * @param {Array<[number, number]>} vocabList - Array of [vid, sid] pairs
 * @returns {Promise<Object>} Map of "vid:sid" -> definition object
 */
export async function lookupVocabularyBatch(apiKey, vocabList) {
  if (!apiKey) {
    throw new Error('JPDB API key required');
  }

  if (!vocabList || vocabList.length === 0) {
    return {};
  }

  const response = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      list: vocabList,
      fields: ['spelling', 'reading', 'meanings_chunks', 'meanings_part_of_speech', 'card_state']
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited');
    }
    throw new Error(`Failed to batch lookup vocabulary: ${response.status}`);
  }

  const data = await response.json();
  const vocabInfo = data.vocabulary_info || [];
  const results = {};

  for (let i = 0; i < vocabInfo.length; i++) {
    const info = vocabInfo[i];
    if (!info) continue;

    const [vid, sid] = vocabList[i];
    const [spelling, reading, meaningsChunks, partOfSpeech, cardState] = info;

    // Flatten meanings chunks
    const meanings = [];
    if (meaningsChunks && Array.isArray(meaningsChunks)) {
      for (const chunk of meaningsChunks) {
        if (Array.isArray(chunk)) {
          for (const meaning of chunk) {
            if (meaning && typeof meaning === 'string') {
              meanings.push(meaning);
            }
          }
        }
      }
    }

    results[`${vid}:${sid}`] = {
      spelling,
      reading,
      meanings,
      partOfSpeech: partOfSpeech || [],
      cardState: cardState || []
    };
  }

  return results;
}
