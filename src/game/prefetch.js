/**
 * @fileoverview Prefetch system for AI narration and TTS audio caching
 * @module src/game/prefetch
 *
 * PURPOSE:
 * Pre-generates AI narrations and TTS voiceovers for likely next game events
 * to reduce latency. Implements predictive caching based on game state to
 * achieve high hit rates. Cache entries are use-once (deleted after retrieval).
 * NOTE: Currently disabled in per-user API key mode (no server-side keys).
 *
 * KEY EXPORTS:
 * - setPrefetchGenerator(fn) - Set the narration generator function
 * - setTTSSynthesizer(fn) - Set the TTS synthesis function
 * - triggerPrefetch(event, context) - Queue prefetch for likely next events
 * - getCachedNarration(event, context) - Retrieve cached narration (use-once)
 * - getCachedAudio(text) - Retrieve cached TTS audio
 * - cancelPendingPrefetches() - Cancel all queued prefetches
 * - clearPrefetchCache() - Clear all cached data
 * - getPrefetchStats() - Get cache hit/miss statistics
 *
 * ARCHITECTURE:
 * - Narration cache: Map<cacheKey, { narration, createdAt, event, context }>
 * - Audio cache: Map<text, { blob, url, createdAt }>
 * - Priority queue for prefetch ordering
 * - Concurrent limits for AI (6) and TTS (1) calls
 *
 * PREFETCH STRATEGY:
 * After each event, predicts likely next events based on game phase:
 * - Combat: attack results, defend, enemy turn, victory, defeat
 * - Exploration: room entry, trap, treasure, encounter
 * - Between floors: next floor entry, ward selection
 *
 * CONFIGURATION:
 * - maxCacheSize: 100 narrations
 * - maxAudioCacheSize: 30 audio clips
 * - cacheTTL: 5 minutes per entry
 * - maxConcurrentPrefetch: 6 parallel AI calls
 *
 * DEPENDENCIES:
 * - None (receives generator functions via setters)
 *
 * CLAUDE HINTS:
 * - prefetchGeneratorFn in server.js returns null (disabled)
 * - Cache keys generated from event + context hash
 * - Stats tracking for hit rate optimization
 * - Audio prefetch follows narration prefetch with 200ms delay
 */

// ============ CONFIGURATION ============

const CONFIG = {
  maxCacheSize: 100,          // Maximum cached narrations (increased for 3-step lookahead)
  maxAudioCacheSize: 30,      // Maximum cached audio files (larger memory footprint)
  cacheTTL: 5 * 60 * 1000,    // 5 minute TTL per entry
  maxConcurrentPrefetch: 6,   // Max parallel AI calls for prefetch (increased for 95% hit rate)
  maxConcurrentTTS: 1,        // Max parallel TTS calls (VOICEVOX can be slow)
  prefetchDelay: 0,           // No delay - prefetch starts immediately (runs parallel to current narration)
  ttsDelay: 200,              // ms delay before starting TTS prefetch (after narration cached)
  conservativeMode: false     // Prefetch more events to increase hit rate
};

// ============ STATS TRACKING ============

const stats = {
  hits: 0,
  misses: 0,
  prefetchesQueued: 0,
  prefetchesCompleted: 0,
  prefetchesFailed: 0,
  prefetchesCancelled: 0,
  cacheEvictions: 0,
  // Audio stats
  audioHits: 0,
  audioMisses: 0,
  audioPrefetchesQueued: 0,
  audioPrefetchesCompleted: 0,
  audioPrefetchesFailed: 0,
  lastReset: Date.now()
};

// ============ NARRATION CACHE ============

// Cache structure: Map<cacheKey, { narration, createdAt, event, context }>
const narrationCache = new Map();

// ============ AUDIO CACHE ============

// Audio cache: Map<textHash, { audio: Buffer, createdAt, text }>
const audioCache = new Map();

// TTS queue for background synthesis
const ttsQueue = [];
let activeTTS = 0;
let ttsSynthesize = null; // Will be set via setTTSSynthesizer
let ttsConfig = null;     // TTS settings (speakerId, speed, volume)

/**
 * Generate a cache key from event type and context
 * Keys are designed to be specific enough to avoid wrong narrations
 * but general enough to get cache hits
 */
function generateCacheKey(event, context) {
  const parts = [event];

  switch (event) {
    case 'combatStart':
    case 'bossAppear':
    case 'finalBossAppear':
      if (context?.id) parts.push(context.id);
      else if (context?.name) parts.push(context.name);
      break;

    case 'playerAttack_action':
      // Part 1: Attack initiation - only needs enemy name
      // This is prefetchable BEFORE the attack happens
      if (context?.enemyName) parts.push(context.enemyName);
      break;

    case 'playerAttack_result':
      // Part 2: Damage result - uses actual damage after combat calc
      // Damage is known at this point, so we can use exact ranges
      if (context?.enemyName) parts.push(context.enemyName);
      if (context?.critical) parts.push('crit');
      if (context?.defeated) parts.push('defeat');
      else if (context?.totalDamage) {
        const dmg = context.totalDamage;
        if (dmg >= 30) parts.push('high');
        else if (dmg >= 15) parts.push('med');
        else parts.push('low');
      }
      break;

    case 'playerAttack':
      // Legacy support - just use enemy name
      if (context?.enemyName) parts.push(context.enemyName);
      if (context?.critical) parts.push('crit');
      break;

    case 'playerMagic':
      if (context?.skillId) parts.push(context.skillId);
      if (context?.enemyName) parts.push(context.enemyName);
      break;

    case 'enemyAttack_action':
      // Part 1: Enemy attack initiation - only needs enemy name and intent
      // This is prefetchable BEFORE the enemy acts
      if (context?.enemyName) parts.push(context.enemyName);
      if (context?.intent) parts.push(context.intent);
      break;

    case 'enemyAttack_result':
      // Part 2: Damage result - uses actual outcome after combat calc
      if (context?.enemyName) parts.push(context.enemyName);
      if (context?.dodge || context?.perfectDodge) parts.push('dodge');
      else if (context?.critical) parts.push('crit');
      else if (context?.damage) {
        const dmg = context.damage;
        if (dmg >= 20) parts.push('heavy');
        else if (dmg >= 10) parts.push('med');
        else if (dmg > 0) parts.push('light');
        else parts.push('miss');
      }
      break;

    case 'enemyAttack':
      // Legacy support
      if (context?.enemyName) parts.push(context.enemyName);
      if (context?.intent) parts.push(context.intent);
      if (context?.dodge || context?.perfectDodge) parts.push('dodge');
      else if (context?.critical) parts.push('crit');
      break;

    case 'victory':
    case 'bossVictory':
      if (context?.enemy?.id) parts.push(context.enemy.id);
      else if (context?.enemy?.name) parts.push(context.enemy.name);
      break;

    case 'defeat':
      if (context?.enemy?.id) parts.push(context.enemy.id);
      break;

    case 'enterFloor':
      parts.push(String(context)); // context is just the floor number
      break;

    case 'roomEnter':
      if (context?.type) parts.push(context.type);
      if (context?.floor) parts.push(`f${context.floor}`);
      break;

    case 'trapDisarmSuccess':
    case 'trapDisarmFail':
    case 'trapAvoidSuccess':
    case 'trapAvoidFail':
      if (context?.trap?.id) parts.push(context.trap.id);
      break;

    case 'treasureOpen':
    case 'treasureTrapped':
      if (context?.chest?.type) parts.push(context.chest.type);
      break;

    case 'lootBody':
      // Generic - no specific context needed
      break;

    case 'shrineUse':
      // Use heal range
      if (context?.healed) {
        const h = context.healed;
        if (h >= 50) parts.push('major');
        else if (h >= 25) parts.push('minor');
        else parts.push('small');
      }
      break;

    case 'shopPurchase':
      if (context?.item?.id) parts.push(context.item.id);
      break;

    case 'runStart':
    case 'levelUp':
    case 'rankUp':
    case 'floorClear':
    case 'gameVictory':
    case 'fleeSuccess':
    case 'fleeFail':
      // These are generic enough without extra context
      break;

    default:
      // For unknown events, include stringified context hash
      if (context) {
        const hash = simpleHash(JSON.stringify(context));
        parts.push(hash);
      }
  }

  return parts.join(':');
}

/**
 * Simple string hash for context objects
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * Get a cached narration (use-once: deletes after retrieval)
 * @returns {string|null} The cached narration or null if not found
 */
export function getCachedNarration(event, context) {
  const key = generateCacheKey(event, context);
  const entry = narrationCache.get(key);

  // Debug: Log lookup attempts
  console.log(`[Prefetch] LOOKUP key="${key}" | found=${!!entry} | cacheKeys=[${[...narrationCache.keys()].join(', ')}]`);

  if (!entry) {
    stats.misses++;
    return null;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > CONFIG.cacheTTL) {
    narrationCache.delete(key);
    stats.misses++;
    return null;
  }

  // Use-once: delete after retrieval
  narrationCache.delete(key);
  stats.hits++;

  console.log(`[Prefetch] Cache HIT for ${key}`);
  return entry.narration;
}

/**
 * Store a narration in cache
 */
function setCachedNarration(event, context, narration) {
  const key = generateCacheKey(event, context);

  // Enforce max cache size with LRU-style eviction
  if (narrationCache.size >= CONFIG.maxCacheSize) {
    // Delete oldest entry
    const oldestKey = narrationCache.keys().next().value;
    narrationCache.delete(oldestKey);
    stats.cacheEvictions++;
  }

  narrationCache.set(key, {
    narration,
    createdAt: Date.now(),
    event,
    context
  });

  console.log(`[Prefetch] Cached narration for ${key}`);
}

/**
 * Check if a narration is already cached
 */
function isCached(event, context) {
  const key = generateCacheKey(event, context);
  const entry = narrationCache.get(key);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > CONFIG.cacheTTL) {
    narrationCache.delete(key);
    return false;
  }
  return true;
}

/**
 * Clear all cached narrations (called on game reset)
 */
export function clearCache() {
  const size = narrationCache.size;
  const audioSize = audioCache.size;
  narrationCache.clear();
  audioCache.clear();
  ttsQueue.length = 0;
  console.log(`[Prefetch] Cache cleared (${size} narrations, ${audioSize} audio files removed)`);
}

// ============ AUDIO CACHE FUNCTIONS ============

/**
 * Generate a hash key for audio cache based on text
 */
function generateAudioKey(text) {
  return simpleHash(text);
}

/**
 * Set the TTS synthesizer function and config
 * This should be called during server initialization
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
 * @returns {Buffer|null} The cached audio buffer or null if not found
 */
export function getCachedAudio(text) {
  if (!text) return null;

  const key = generateAudioKey(text);
  const entry = audioCache.get(key);

  if (!entry) {
    stats.audioMisses++;
    return null;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > CONFIG.cacheTTL) {
    audioCache.delete(key);
    stats.audioMisses++;
    return null;
  }

  // Use-once: delete after retrieval
  audioCache.delete(key);
  stats.audioHits++;

  console.log(`[Prefetch] Audio cache HIT for text: ${text.substring(0, 30)}...`);
  return entry.audio;
}

/**
 * Check if audio is cached for a text
 */
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

/**
 * Store audio in cache
 */
function setCachedAudio(text, audioBuffer) {
  const key = generateAudioKey(text);

  // Enforce max cache size with LRU-style eviction
  if (audioCache.size >= CONFIG.maxAudioCacheSize) {
    const oldestKey = audioCache.keys().next().value;
    audioCache.delete(oldestKey);
    stats.cacheEvictions++;
  }

  audioCache.set(key, {
    audio: audioBuffer,
    createdAt: Date.now(),
    text
  });

  console.log(`[Prefetch] Cached audio for: ${text.substring(0, 30)}...`);
}

/**
 * Queue TTS prefetch for a narration text
 */
function queueTTSPrefetch(text, priority = 1) {
  if (!text || !ttsSynthesize || !ttsConfig?.enabled) return;

  // Skip if already cached
  if (isAudioCached(text)) return;

  // Skip if already queued
  const key = generateAudioKey(text);
  if (ttsQueue.some(job => generateAudioKey(job.text) === key)) return;

  ttsQueue.push({ text, priority, key });
  stats.audioPrefetchesQueued++;

  // Sort by priority
  ttsQueue.sort((a, b) => b.priority - a.priority);

  console.log(`[Prefetch] TTS queued: ${text.substring(0, 30)}...`);

  // Process queue
  processTTSQueue();
}

/**
 * Process the TTS prefetch queue
 */
async function processTTSQueue() {
  if (!ttsSynthesize) return;

  while (ttsQueue.length > 0 && activeTTS < CONFIG.maxConcurrentTTS) {
    const job = ttsQueue.shift();

    // Double-check not already cached
    if (isAudioCached(job.text)) continue;

    activeTTS++;

    executeTTSPrefetch(job).finally(() => {
      activeTTS--;
      if (ttsQueue.length > 0) {
        processTTSQueue();
      }
    });
  }
}

/**
 * Execute a single TTS prefetch job
 */
async function executeTTSPrefetch(job) {
  try {
    console.log(`[Prefetch] TTS generating: ${job.text.substring(0, 30)}...`);

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

/**
 * Clear combat-related cache entries
 */
export function clearCombatCache() {
  const combatEvents = [
    'combatStart', 'playerAttack', 'playerMagic', 'enemyAttack',
    'victory', 'bossVictory', 'defeat', 'bossAppear', 'finalBossAppear'
  ];

  let cleared = 0;
  for (const [key] of narrationCache) {
    if (combatEvents.some(e => key.startsWith(e))) {
      narrationCache.delete(key);
      cleared++;
    }
  }

  if (cleared > 0) {
    console.log(`[Prefetch] Cleared ${cleared} combat cache entries`);
  }
}

// ============ PREFETCH QUEUE ============

// Queue of pending prefetch jobs
const prefetchQueue = [];
let activePrefetches = 0;
let prefetchGenerate = null; // Will be set via setPrefetchGenerator

/**
 * Set the narration generator function
 * This should be called during server initialization
 */
export function setPrefetchGenerator(generatorFn) {
  prefetchGenerate = generatorFn;
  console.log('[Prefetch] Generator function registered');
}

/**
 * Queue a prefetch job
 */
function queuePrefetch(event, context, priority = 1) {
  // Skip if already cached
  if (isCached(event, context)) {
    return;
  }

  // Skip if already queued
  const key = generateCacheKey(event, context);
  if (prefetchQueue.some(job => generateCacheKey(job.event, job.context) === key)) {
    return;
  }

  prefetchQueue.push({ event, context, priority, key });
  stats.prefetchesQueued++;

  // Sort by priority (higher priority first)
  prefetchQueue.sort((a, b) => b.priority - a.priority);

  console.log(`[Prefetch] Queued: ${key} (priority: ${priority})`);

  // Process queue
  processQueue();
}

/**
 * Process the prefetch queue
 */
async function processQueue() {
  if (!prefetchGenerate) {
    console.warn('[Prefetch] No generator function set');
    return;
  }

  while (prefetchQueue.length > 0 && activePrefetches < CONFIG.maxConcurrentPrefetch) {
    const job = prefetchQueue.shift();

    // Double-check not already cached
    if (isCached(job.event, job.context)) {
      continue;
    }

    activePrefetches++;

    // Don't await - let it run in background
    executePrefetch(job).finally(() => {
      activePrefetches--;
      // Continue processing queue
      if (prefetchQueue.length > 0) {
        processQueue();
      }
    });
  }
}

/**
 * Execute a single prefetch job
 */
async function executePrefetch(job) {
  try {
    console.log(`[Prefetch] Generating: ${job.key}`);
    const narration = await prefetchGenerate(job.event, job.context);

    if (narration) {
      setCachedNarration(job.event, job.context, narration);
      stats.prefetchesCompleted++;

      // Also queue TTS prefetch for this narration (after small delay)
      setTimeout(() => {
        queueTTSPrefetch(narration, job.priority);
      }, CONFIG.ttsDelay);
    } else {
      stats.prefetchesFailed++;
    }
  } catch (error) {
    console.error(`[Prefetch] Failed for ${job.key}:`, error.message);
    stats.prefetchesFailed++;
  }
}

/**
 * Cancel all pending prefetches
 */
export function cancelPendingPrefetches() {
  const count = prefetchQueue.length;
  prefetchQueue.length = 0;
  stats.prefetchesCancelled += count;

  if (count > 0) {
    console.log(`[Prefetch] Cancelled ${count} pending prefetches`);
  }
}

// ============ PREDICTOR ============

/**
 * Predict and prefetch likely next narrations based on current game state
 * Conservative mode: only prefetch 1-2 most likely events
 */
export function predictAndPrefetch(gameState, currentEvent, currentContext) {
  // Delay prefetch to let the response send first
  setTimeout(() => {
    const predictions = getPredictions(gameState, currentEvent, currentContext);

    // In conservative mode, only take top 1-2 predictions
    const limit = CONFIG.conservativeMode ? 2 : predictions.length;
    const topPredictions = predictions.slice(0, limit);

    for (const pred of topPredictions) {
      queuePrefetch(pred.event, pred.context, pred.priority);
    }
  }, CONFIG.prefetchDelay);
}

/**
 * Get predictions based on game state and current event
 * Returns array of { event, context, priority }
 */
function getPredictions(gameState, currentEvent, currentContext) {
  const predictions = [];

  const { player, combat, run, floor } = gameState;

  // ============ COMBAT PREDICTIONS ============
  if (combat?.active && combat?.enemy) {
    const enemy = combat.enemy;
    const playerHp = player?.hp || 0;
    const playerMaxHp = player?.maxHp || 100;
    const enemyHp = enemy.hp || 0;
    const enemyMaxHp = enemy.maxHp || 100;

    // After player action, predict enemy attack or victory
    // Include both legacy events and new _result events from two-tier system
    if (['playerAttack', 'playerAttack_result', 'playerMagic', 'playerItem'].includes(currentEvent)) {
      // Enemy is still alive - predict their attack
      if (enemyHp > 0) {
        // Prefetch ALL common enemy intents since intent can change unpredictably
        // This ensures cache hit regardless of which intent enemy chooses
        const commonIntents = ['attack', 'heavy', 'special', 'defend', 'rage'];

        for (const intent of commonIntents) {
          predictions.push({
            event: 'enemyAttack_action',
            context: {
              enemyName: enemy.name,
              intent: intent
            },
            priority: intent === 'attack' ? 10 : 7 // Prioritize basic attack
          });
        }

        // If enemy is low HP, also prefetch victory (player might kill them)
        if (enemyHp < enemyMaxHp * 0.5) {
          predictions.push({
            event: enemy.isBoss ? 'bossVictory' : 'victory',
            context: { enemy: { id: enemy.id, name: enemy.name } },
            priority: 8
          });
        }

        // If player is low HP, also prefetch defeat
        if (playerHp < playerMaxHp * 0.3) {
          predictions.push({
            event: 'defeat',
            context: { enemy: { id: enemy.id, name: enemy.name } },
            priority: 5
          });
        }
      }
    }

    // After enemy turn, predict next player attack ACTION (Part 1)
    if (currentEvent === 'enemyAttack_result' || currentEvent === 'enemyAttack') {
      // Player still alive - predict victory if enemy is low
      if (enemyHp < enemyMaxHp * 0.4) {
        predictions.push({
          event: enemy.isBoss ? 'bossVictory' : 'victory',
          context: { enemy: { id: enemy.id, name: enemy.name } },
          priority: 8
        });
      }

      // Prefetch player attack ACTION - can be done before player acts
      predictions.push({
        event: 'playerAttack_action',
        context: {
          enemyName: enemy.name
        },
        priority: 6
      });
    }

    // Combat just started - prefetch first player attack ACTION and all enemy intents
    if (currentEvent === 'combatStart' || currentEvent === 'bossAppear') {
      predictions.push({
        event: 'playerAttack_action',
        context: {
          enemyName: enemy.name
        },
        priority: 10
      });

      // Also prefetch all enemy attack intents for faster combat
      const commonIntents = ['attack', 'heavy', 'special', 'defend', 'rage'];
      for (const intent of commonIntents) {
        predictions.push({
          event: 'enemyAttack_action',
          context: { enemyName: enemy.name, intent },
          priority: 8
        });
      }
    }
  }

  // ============ EXPLORATION PREDICTIONS ============

  // After entering a room, predict what might happen AND prefetch next room
  if (currentEvent === 'roomEnter' && currentContext?.type) {
    const roomType = currentContext.type;

    switch (roomType) {
      case 'encounter':
        // Combat will start - but we don't know the enemy yet
        // This will be handled when combat actually starts
        break;

      case 'trap':
        // Could be disarm success or fail, or trigger
        predictions.push({
          event: 'trapDisarmSuccess',
          context: { trap: currentContext.trap || { id: 'unknown' } },
          priority: 6
        });
        predictions.push({
          event: 'trapDisarmFail',
          context: { trap: currentContext.trap || { id: 'unknown' } },
          priority: 5
        });
        break;

      case 'treasure':
        predictions.push({
          event: 'treasureOpen',
          context: { chest: currentContext.chest || { type: 'normal' } },
          priority: 7
        });
        break;

      case 'body':
        predictions.push({
          event: 'lootBody',
          context: {},
          priority: 7
        });
        break;

      case 'shrine':
        predictions.push({
          event: 'shrineUse',
          context: { healed: 30 }, // Estimate medium heal
          priority: 7
        });
        break;

      case 'merchant':
        // Merchant rooms don't need specific event predictions
        // Player will browse shop and proceed when done
        break;
    }

    // Prefetch next 2-3 rooms (player will proceed after this room)
    if (run?.rooms && run?.roomIndex !== undefined) {
      for (let i = 1; i <= 3; i++) {
        const nextRoomIndex = run.roomIndex + i;
        if (nextRoomIndex < run.rooms.length) {
          const nextRoom = run.rooms[nextRoomIndex];
          predictions.push({
            event: 'roomEnter',
            context: { type: nextRoom.type, floor: run.floor },
            priority: 6 - i // Decreasing priority for further rooms
          });
        }
      }
    }
  }

  // After room interaction, predict next 2-3 rooms
  if (['trapDisarmSuccess', 'trapDisarmFail', 'trapAvoidSuccess', 'trapAvoidFail',
       'treasureOpen', 'treasureTrapped', 'lootBody', 'shrineUse'].includes(currentEvent)) {
    if (run?.rooms && run?.roomIndex !== undefined) {
      for (let i = 1; i <= 3; i++) {
        const nextRoomIndex = run.roomIndex + i;
        if (nextRoomIndex < run.rooms.length) {
          const nextRoom = run.rooms[nextRoomIndex];
          predictions.push({
            event: 'roomEnter',
            context: { type: nextRoom.type, floor: run.floor },
            priority: 8 - i
          });
        }
      }
    }
  }

  // ============ FLOOR PREDICTIONS ============

  // After victory, predict next 2-3 rooms
  if (currentEvent === 'victory') {
    if (run?.rooms && run?.roomIndex !== undefined) {
      for (let i = 1; i <= 3; i++) {
        const nextRoomIndex = run.roomIndex + i;
        if (nextRoomIndex < run.rooms.length) {
          const nextRoom = run.rooms[nextRoomIndex];
          predictions.push({
            event: 'roomEnter',
            context: { type: nextRoom.type, floor: run.floor },
            priority: 8 - i
          });
        }
      }
    }
  }

  // After boss victory, predict next floor
  if (currentEvent === 'bossVictory') {
    const nextFloor = (floor || 1) + 1;
    if (nextFloor <= 7) {
      predictions.push({
        event: 'enterFloor',
        context: nextFloor,
        priority: 9
      });
    }
  }

  // After entering floor, player is already in room 0
  // Predict rooms 1, 2, 3 (look 3 steps ahead for 95%+ hit rate)
  if (currentEvent === 'enterFloor') {
    const currentRoomIdx = run?.roomIndex || 0;
    const floorNum = floor || currentContext;

    // Prefetch next 3 rooms
    for (let i = 1; i <= 3; i++) {
      const nextRoom = run?.rooms?.[currentRoomIdx + i];
      if (nextRoom) {
        predictions.push({
          event: 'roomEnter',
          context: { type: nextRoom.type, floor: floorNum },
          priority: 10 - i
        });
      }
    }
  }

  // After runStart, predict enterFloor AND first few rooms (look 2-3 steps ahead)
  if (currentEvent === 'runStart') {
    predictions.push({
      event: 'enterFloor',
      context: 1, // First floor
      priority: 10
    });

    // Also prefetch first 2 rooms if we know them
    if (run?.rooms) {
      for (let i = 1; i <= 2 && i < run.rooms.length; i++) {
        const room = run.rooms[i];
        if (room) {
          predictions.push({
            event: 'roomEnter',
            context: { type: room.type, floor: 1 },
            priority: 9 - i
          });
        }
      }
    }
  }

  return predictions;
}

/**
 * Estimate enemy damage based on intent
 */
function estimateDamage(enemy, intent, level = 'med') {
  const base = enemy.attack || enemy.atk || 10;

  const intentMultipliers = {
    attack: 1.0,
    heavy: 2.0,
    rage: 1.5,
    defend: 0,
    special: 1.0
  };

  const multiplier = intentMultipliers[intent] || 1.0;
  const damage = Math.floor(base * multiplier);

  // Return damage range level
  if (level === 'high') return Math.floor(damage * 1.3);
  if (level === 'low') return Math.floor(damage * 0.7);
  return damage;
}

/**
 * Estimate player damage output
 */
function estimatePlayerDamage(player, level = 'med') {
  const base = player?.attack || player?.atk || 15;

  if (level === 'high') return Math.floor(base * 1.5);
  if (level === 'low') return Math.floor(base * 0.7);
  return base;
}

// ============ STATS API ============

/**
 * Get prefetch statistics
 */
export function getStats() {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? (stats.hits / total * 100).toFixed(1) : '0.0';

  const audioTotal = stats.audioHits + stats.audioMisses;
  const audioHitRate = audioTotal > 0 ? (stats.audioHits / audioTotal * 100).toFixed(1) : '0.0';

  return {
    ...stats,
    // Narration cache stats
    cacheSize: narrationCache.size,
    queueSize: prefetchQueue.length,
    activePrefetches,
    hitRate: `${hitRate}%`,
    // Audio cache stats
    audioCacheSize: audioCache.size,
    ttsQueueSize: ttsQueue.length,
    activeTTS,
    audioHitRate: `${audioHitRate}%`,
    // General
    uptime: Math.floor((Date.now() - stats.lastReset) / 1000)
  };
}

/**
 * Reset statistics
 */
export function resetStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.prefetchesQueued = 0;
  stats.prefetchesCompleted = 0;
  stats.prefetchesFailed = 0;
  stats.prefetchesCancelled = 0;
  stats.cacheEvictions = 0;
  // Audio stats
  stats.audioHits = 0;
  stats.audioMisses = 0;
  stats.audioPrefetchesQueued = 0;
  stats.audioPrefetchesCompleted = 0;
  stats.audioPrefetchesFailed = 0;
  stats.lastReset = Date.now();

  console.log('[Prefetch] Stats reset');
}

/**
 * Get detailed cache contents (for debugging)
 */
export function getCacheContents() {
  const narrations = [];
  for (const [key, entry] of narrationCache) {
    narrations.push({
      key,
      event: entry.event,
      age: Math.floor((Date.now() - entry.createdAt) / 1000),
      preview: entry.narration.substring(0, 50) + '...'
    });
  }

  const audio = [];
  for (const [key, entry] of audioCache) {
    audio.push({
      key,
      age: Math.floor((Date.now() - entry.createdAt) / 1000),
      size: entry.audio?.length || 0,
      preview: entry.text.substring(0, 30) + '...'
    });
  }

  return { narrations, audio };
}

// ============ EAGER PREFETCH ============

/**
 * Eagerly prefetch common events when game loads or run starts
 * This ensures first few actions are instant
 */
export function eagerPrefetchForRun(gameState) {
  const { run, floor } = gameState;

  console.log('[Prefetch] Eager prefetch starting for run...');

  // Prefetch enterFloor
  queuePrefetch('enterFloor', floor || 1, 10);

  // Prefetch first 3-4 rooms if we know them
  if (run?.rooms) {
    for (let i = 1; i <= 4 && i < run.rooms.length; i++) {
      const room = run.rooms[i];
      if (room) {
        queuePrefetch('roomEnter', { type: room.type, floor: run.floor || 1 }, 9 - i);
      }
    }
  }

  // Prefetch common room events
  queuePrefetch('treasureOpen', { chest: { type: 'normal' } }, 5);
  queuePrefetch('lootBody', {}, 5);
  queuePrefetch('shrineUse', { healed: 30 }, 5);
  queuePrefetch('trapDisarmSuccess', { trap: { id: 'unknown' } }, 4);
  queuePrefetch('trapDisarmFail', { trap: { id: 'unknown' } }, 4);
}

// ============ EXPORTS ============

// Export queuePrefetch for direct prefetch requests (e.g., runStart on hub)
export { queuePrefetch };

export default {
  getCachedNarration,
  getCachedAudio,
  clearCache,
  clearCombatCache,
  setPrefetchGenerator,
  setTTSSynthesizer,
  updateTTSConfig,
  predictAndPrefetch,
  cancelPendingPrefetches,
  getStats,
  resetStats,
  getCacheContents,
  eagerPrefetchForRun,
  queuePrefetch
};
