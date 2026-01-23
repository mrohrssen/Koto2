/**
 * @fileoverview TTS audio caching system
 * @module src/game/prefetch
 *
 * Pre-generates TTS voiceovers for narration text to reduce latency.
 * Cache entries are use-once (deleted after retrieval).
 *
 * KEY EXPORTS:
 * - setTTSSynthesizer(fn, config) - Set the TTS synthesis function
 * - updateTTSConfig(config) - Update TTS settings
 * - getCachedAudio(text) - Retrieve cached TTS audio (use-once)
 * - clearCache() - Clear all cached audio
 * - cancelPendingPrefetches() - Cancel queued TTS jobs
 * - getStats() - Get cache hit/miss statistics
 * - resetStats() - Reset statistics
 * - getCacheContents() - Get cache contents for debugging
 */

// ============ CONFIGURATION ============

const CONFIG = {
  maxAudioCacheSize: 30,
  cacheTTL: 5 * 60 * 1000,    // 5 minute TTL per entry
  maxConcurrentTTS: 1
};

// ============ STATS TRACKING ============

const stats = {
  audioHits: 0,
  audioMisses: 0,
  audioPrefetchesQueued: 0,
  audioPrefetchesCompleted: 0,
  audioPrefetchesFailed: 0,
  lastReset: Date.now()
};

// ============ AUDIO CACHE ============

const audioCache = new Map();
const ttsQueue = [];
let activeTTS = 0;
let ttsSynthesize = null;
let ttsConfig = null;

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

function generateAudioKey(text) {
  return simpleHash(text);
}

/**
 * Set the TTS synthesizer function and config
 */
export function setTTSSynthesizer(synthesizerFn, config = {}) {
  ttsSynthesize = synthesizerFn;
  ttsConfig = config;
  console.log('[Prefetch] TTS synthesizer registered');
}

/**
 * Update TTS config (called when settings change)
 */
export function updateTTSConfig(config) {
  ttsConfig = { ...ttsConfig, ...config };
}

/**
 * Get cached audio for a narration text (use-once)
 * @returns {Buffer|null} The cached audio buffer or null
 */
export function getCachedAudio(text) {
  if (!text) return null;

  const key = generateAudioKey(text);
  const entry = audioCache.get(key);

  if (!entry) {
    stats.audioMisses++;
    return null;
  }

  if (Date.now() - entry.createdAt > CONFIG.cacheTTL) {
    audioCache.delete(key);
    stats.audioMisses++;
    return null;
  }

  audioCache.delete(key);
  stats.audioHits++;
  return entry.audio;
}

function isAudioCached(text) {
  if (!text) return false;
  const key = generateAudioKey(text);
  const entry = audioCache.get(key);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > CONFIG.cacheTTL) {
    audioCache.delete(key);
    return false;
  }
  return true;
}

function setCachedAudio(text, audioBuffer) {
  const key = generateAudioKey(text);

  if (audioCache.size >= CONFIG.maxAudioCacheSize) {
    const oldestKey = audioCache.keys().next().value;
    audioCache.delete(oldestKey);
  }

  audioCache.set(key, {
    audio: audioBuffer,
    createdAt: Date.now(),
    text
  });
}

/**
 * Queue TTS prefetch for a narration text
 */
export function queueTTSPrefetch(text, priority = 1) {
  if (!text || !ttsSynthesize || !ttsConfig?.enabled) return;
  if (isAudioCached(text)) return;

  const key = generateAudioKey(text);
  if (ttsQueue.some(job => generateAudioKey(job.text) === key)) return;

  ttsQueue.push({ text, priority, key });
  stats.audioPrefetchesQueued++;
  ttsQueue.sort((a, b) => b.priority - a.priority);
  processTTSQueue();
}

async function processTTSQueue() {
  if (!ttsSynthesize) return;

  while (ttsQueue.length > 0 && activeTTS < CONFIG.maxConcurrentTTS) {
    const job = ttsQueue.shift();
    if (isAudioCached(job.text)) continue;

    activeTTS++;
    executeTTSPrefetch(job).finally(() => {
      activeTTS--;
      if (ttsQueue.length > 0) processTTSQueue();
    });
  }
}

async function executeTTSPrefetch(job) {
  try {
    const audioBuffer = await ttsSynthesize(job.text, ttsConfig);
    if (audioBuffer) {
      setCachedAudio(job.text, audioBuffer);
      stats.audioPrefetchesCompleted++;
    } else {
      stats.audioPrefetchesFailed++;
    }
  } catch (error) {
    console.error(`[Prefetch] TTS failed:`, error.message);
    stats.audioPrefetchesFailed++;
  }
}

// ============ CACHE MANAGEMENT ============

/**
 * Clear all cached audio
 */
export function clearCache() {
  const size = audioCache.size;
  audioCache.clear();
  ttsQueue.length = 0;
  if (size > 0) {
    console.log(`[Prefetch] Cache cleared (${size} audio files removed)`);
  }
}

/**
 * Cancel pending TTS prefetches
 */
export function cancelPendingPrefetches() {
  const count = ttsQueue.length;
  ttsQueue.length = 0;
  if (count > 0) {
    console.log(`[Prefetch] Cancelled ${count} pending TTS prefetches`);
  }
}

// ============ STATS API ============

export function getStats() {
  const audioTotal = stats.audioHits + stats.audioMisses;
  const audioHitRate = audioTotal > 0 ? (stats.audioHits / audioTotal * 100).toFixed(1) : '0.0';

  return {
    audioCacheSize: audioCache.size,
    ttsQueueSize: ttsQueue.length,
    activeTTS,
    audioHits: stats.audioHits,
    audioMisses: stats.audioMisses,
    audioPrefetchesQueued: stats.audioPrefetchesQueued,
    audioPrefetchesCompleted: stats.audioPrefetchesCompleted,
    audioPrefetchesFailed: stats.audioPrefetchesFailed,
    audioHitRate: `${audioHitRate}%`,
    uptime: Math.floor((Date.now() - stats.lastReset) / 1000)
  };
}

export function resetStats() {
  stats.audioHits = 0;
  stats.audioMisses = 0;
  stats.audioPrefetchesQueued = 0;
  stats.audioPrefetchesCompleted = 0;
  stats.audioPrefetchesFailed = 0;
  stats.lastReset = Date.now();
  console.log('[Prefetch] Stats reset');
}

export function getCacheContents() {
  const audio = [];
  for (const [key, entry] of audioCache) {
    audio.push({
      key,
      age: Math.floor((Date.now() - entry.createdAt) / 1000),
      size: entry.audio?.length || 0,
      preview: entry.text.substring(0, 30) + '...'
    });
  }
  return { audio };
}

export default {
  getCachedAudio,
  clearCache,
  setTTSSynthesizer,
  updateTTSConfig,
  cancelPendingPrefetches,
  getStats,
  resetStats,
  getCacheContents,
  queueTTSPrefetch
};
