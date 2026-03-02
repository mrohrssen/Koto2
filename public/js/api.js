/**
 * API Client Module
 *
 * Centralized server communication for the JRPG frontend.
 * All API calls go through this module to ensure consistent
 * handling of auth tokens, loading states, and error handling.
 */

import { logger } from './logger.js';

// ============ CORE API WRAPPER ============

// Module-level loading state
let isLoading = false;

/**
 * Get auth headers with JWT token
 * @returns {object} Headers object with Content-Type and Authorization
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

/**
 * Generic API call wrapper
 * Includes JWT Authorization header from localStorage in every request
 *
 * @param {string} endpoint - API endpoint (relative to /api/game)
 * @param {string} method - HTTP method (default: POST)
 * @param {object|null} body - Request body
 * @param {function} onError - Error handler callback (receives error message)
 * @returns {Promise<object|null>} Response data or null on error
 */
async function apiCall(endpoint, method = 'POST', body = null, onError = null) {
  logger.debug('[API] Request:', { endpoint, method });
  if (isLoading) {
    logger.warn('[API] Request blocked - loading:', { endpoint });
    return null;
  }
  isLoading = true;
  const startedAt = performance.now();

  try {
    const options = {
      method,
      headers: getAuthHeaders()
    };
    if (method !== 'GET' && body) options.body = JSON.stringify(body);

    const response = await fetch(`/api/game${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API call failed');
    }

    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log(`[API Timing] ${method} /api/game${endpoint} -> ${response.status} in ${elapsedMs}ms`);

    return data;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log(`[API Timing] ${method} /api/game${endpoint} -> error in ${elapsedMs}ms`);
    logger.error('[API] Request failed:', { endpoint, error: error.message });
    if (onError) {
      onError(error.message);
    }
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Check if an API call is currently in progress
 */
function isApiLoading() {
  return isLoading;
}

// ============ GAME STATE ENDPOINTS ============

/**
 * Get current game state from server
 * @returns {Promise<object>} Game state with player, run, combat, phase
 */
async function getGameState() {
  try {
    const response = await fetch('/api/game/state', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch game state:', error.message);
    return { phase: 'no_save' };
  }
}


/**
 * Get level definitions and player progress
 * @returns {Promise<object>} { levels, progress }
 */
async function getLevels() {
  try {
    const response = await fetch('/api/game/levels', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch levels:', error.message);
    return { levels: [], progress: { highestUnlocked: 1, completed: [], current: null } };
  }
}

/**
 * Select a level and start a run
 * @param {number} levelId - Level to start
 * @returns {Promise<object>} Result with state and narration
 */
async function selectLevel(levelId, starterIds = null) {
  const body = { levelId };
  if (starterIds) body.starterIds = Array.isArray(starterIds) ? starterIds : [starterIds];
  return apiCall('/levels/select', 'POST', body);
}

/**
 * Get server settings
 * @returns {Promise<object>} Settings object
 */
async function getSettings() {
  try {
    const response = await fetch('/api/settings', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch settings:', error.message);
    return {};
  }
}

// ============ PLAYER MANAGEMENT ENDPOINTS ============

/**
 * Create a new player character
 * @param {string} name - Character name
 * @param {object} stats - Initial stat allocation {str, agi, vit, int, dex, luk}
 * @param {number} statPoints - Remaining stat points
 * @returns {Promise<object>} Result with state and narration
 */
async function createPlayer(name, stats, statPoints) {
  return apiCall('/create-player', 'POST', { name, stats, statPoints });
}


// ============ RUN MANAGEMENT ENDPOINTS ============

/**
 * Start a new dungeon run
 * @returns {Promise<object>} Result with state and narration
 */
async function startRun(body = null) {
  return apiCall('/start-run', 'POST', body);
}

/**
 * Forfeit the current run
 * @returns {Promise<object>} Result
 */
async function forfeitRun() {
  return apiCall('/forfeit', 'POST');
}

/**
 * Get area options for selection
 * @returns {Promise<Array>} Array of area options
 */
async function getAreaOptions() {
  try {
    const response = await fetch('/api/game/area-options', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch area options:', error.message);
    return [];
  }
}

/**
 * Select an area
 * @param {string} areaId - Area identifier
 * @returns {Promise<object>} Result with state
 */
async function selectArea(areaId) {
  try {
    const response = await fetch('/api/game/select-area', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ areaId, forceRoomType: getForceRoomType() })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to select area:', error.message);
    return { error: 'Network error' };
  }
}


function getForceRoomType() {
  return localStorage.getItem('jrpg_forceRoomType') || null;
}

// ============ ROOM EXPLORATION ENDPOINTS ============

/** Proceed to next room */
async function proceed() {
  return apiCall('/proceed', 'POST', { forceRoomType: getForceRoomType() });
}

/** Start room encounter */
async function roomEncounter() {
  return apiCall('/room-encounter', 'POST');
}

/** Select a branch door at a branching room
 * @param {string} door - Door identifier ('left' or 'right')
 */
async function selectBranch(door) {
  return apiCall('/select-branch', 'POST', { door, forceRoomType: getForceRoomType() });
}

/** Fetch Chippy's door hints for current branch point */
async function doorHints() {
  return apiCall('/door-hints', 'POST');
}

/** Upgrade creature at shrine */
async function shrineUpgrade(creatureId) {
  return apiCall('/shrine-upgrade', 'POST', { creatureId });
}

/** Claim quiz reward */
async function quizReward(rewardType, creatureId = null) {
  return apiCall('/quiz-reward', 'POST', { rewardType, creatureId });
}

/** Get a quiz question (may be from Bunpro or static) */
async function getQuizQuestion() {
  try {
    const response = await fetch('/api/game/quiz-question', {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const data = await response.json();

    // Store Bunpro metadata for answer submission
    if (data._bunpro) {
      data._bunproMeta = data._bunpro;
      delete data._bunpro; // Don't expose to UI
    }

    console.log('[API] Quiz question:', { id: data.id, type: data.type, hasBunpro: !!data._bunproMeta });
    return data;
  } catch (error) {
    logger.error('[API] Failed to get quiz question:', error.message);
    return { error: 'Network error' };
  }
}

/** Submit quiz answer for validation */
async function submitQuizAnswer(questionId, selectedIndex, bunproMeta = null) {
  try {
    const response = await fetch('/api/game/quiz-answer', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        questionId,
        selectedIndex,
        ...(bunproMeta ? { _bunpro: bunproMeta } : {})
      })
    });
    const data = await response.json();
    console.log('[API] Quiz answer result:', { correct: data.correct });
    return data;
  } catch (error) {
    logger.error('[API] Failed to submit quiz answer:', error.message);
    return { error: 'Network error' };
  }
}

// ============ COMBAT ENDPOINTS ============

/** Start a regular enemy encounter */
async function startEncounter() {
  return apiCall('/start-encounter', 'POST');
}

// ============ SHOP/ECONOMY ENDPOINTS ============

/** Skip the current shop */
async function shopSkip() {
  return apiCall('/shop-skip', 'POST');
}

/** Get dealer room state (inventory with sell prices, offered creature) */
async function getDealerState() {
  return apiCall('/dealer-state', 'GET');
}

/** Sell a creature to the dealer */
async function dealerSell(creatureId) {
  return apiCall('/dealer-sell', 'POST', { creatureId });
}

/** Buy a creature from the dealer */
async function dealerBuy(creatureId) {
  return apiCall('/dealer-buy', 'POST', { creatureId });
}

/** Leave the dealer room */
async function dealerLeave() {
  return apiCall('/dealer-leave', 'POST');
}

// ============ WHACK-A-MOLE ENDPOINTS ============

/** Get the vocab pool for whack-a-mole mini-game */
async function getWhackAMolePool() {
  return apiCall('/whack-a-mole-pool', 'GET');
}

/** Submit whack-a-mole completion with score */
async function completeWhackAMole(score) {
  return apiCall('/whack-a-mole-complete', 'POST', { score });
}

// ============ VOCAB/JPDB ENDPOINTS ============

/** Send JPDB review
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 * @param {number} grade - Review grade (1-5)
 * @param {boolean} isDiscovery - Whether this is a discovery room review
 */
async function sendJpdbReview(vid, sid, grade, isDiscovery = false) {
  console.log('[JPDB Review API] sendJpdbReview called:', { vid, sid, grade, isDiscovery });
  try {
    const response = await fetch('/api/jpdb/review', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vid, sid, grade, isDiscovery })
    });
    const result = await response.json();
    console.log('[JPDB Review API] Response:', result);
    return result;
  } catch (error) {
    logger.error('[API] Failed to send JPDB review:', error.message);
    return { error: 'Network error' };
  }
}

/** Parse text for clickable words
 * @param {string} text - Text to parse
 */
async function parseJpdbText(text) {
  try {
    const response = await fetch('/api/jpdb/parse', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to parse JPDB text:', error.message);
    return { error: 'Network error' };
  }
}

/** Lookup word meaning
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 */
async function lookupJpdbWord(vid, sid) {
  try {
    const response = await fetch('/api/jpdb/lookup', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vid, sid })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to lookup JPDB word:', error.message);
    return { error: 'Network error' };
  }
}

/** Batch lookup word meanings (for prefetching)
 * @param {Array<[number, number]>} vocabList - Array of [vid, sid] pairs
 * @returns {Promise<Object>} Map of "vid:sid" -> definition
 */
async function lookupJpdbBatch(vocabList) {
  try {
    const response = await fetch('/api/jpdb/lookup-batch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vocabList })
    });
    const data = await response.json();
    return data.definitions || {};
  } catch (error) {
    logger.error('[API] Failed to batch lookup JPDB words:', error.message);
    return {};
  }
}

/** Get discovery words for the word discovery room
 * @param {number} limit - Number of words to fetch (default: 2)
 * @returns {Promise<Object>} Discovery words data
 */
async function getDiscoveryWords(limit = 2) {
  try {
    const response = await fetch(`/api/game/discovery-words?limit=${limit}`, {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to get discovery words:', error.message);
    return { words: [] };
  }
}

/** Get discovery status (daily limit tracking)
 * @returns {Promise<Object>} { todayCount, dailyLimit, atLimit }
 */
async function getDiscoveryStatus() {
  try {
    const response = await fetch('/api/game/discovery-status', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to get discovery status:', error.message);
    return { todayCount: 0, dailyLimit: 10, atLimit: false };
  }
}

/**
 * Get due words for speed review
 * @param {Array} reviewedWords - Array of { vid, sid } objects for words just reviewed
 * @returns {Promise<Object>} { words: Array, error?: string }
 */
export async function getDueWords(reviewedWords = []) {
  try {
    const response = await fetch('/api/vocab/due-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ reviewedWords })
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get due words:', error);
    return { words: [], error: error.message };
  }
}

/** Mark word discovery room as complete
 * @returns {Promise<Object>} Result with updated state
 */
async function completeDiscovery() {
  return apiCall('/complete-discovery', 'POST');
}

// ============ CREATURE COMBAT ============

async function startCreatureEncounter() {
  return apiCall('/start-creature-encounter', 'POST');
}

async function creatureCombatCycle(actionType, moveChoices = []) {
  return apiCall('/creature-combat-cycle', 'POST', { actionType, moveChoices });
}

async function getCreatureCollection() {
  return apiCall('/creature-collection', 'GET');
}

async function rollPostCombatShop() {
  return apiCall('/creature-shop-roll', 'POST');
}

async function selectShopItem(itemIndex) {
  return apiCall('/creature-shop-select', 'POST', { itemIndex });
}

async function swapCreature(activeIndex, reserveIndex) {
  return apiCall('/swap-creature', 'POST', { activeIndex, reserveIndex });
}

async function rearrangeCreatures(indexA, indexB) {
  return apiCall('/rearrange-creatures', 'POST', { indexA, indexB });
}

async function learnMove(creatureIndex, newMoveId, replaceIndex) {
  return apiCall('/learn-move', 'POST', { creatureIndex, newMoveId, replaceIndex });
}

async function swapCreatureEquip(activeIndex, reserveIndex) {
  return apiCall('/swap-creature-equip', 'POST', { activeIndex, reserveIndex });
}

async function befriendReplace(releaseCreatureId) {
  return apiCall('/befriend-replace', 'POST', { releaseCreatureId });
}

async function getBefriendConversation(enemyIndex) {
  return apiCall('/befriend-conversation', 'POST',
    typeof enemyIndex === 'number' ? { enemyIndex } : {});
}

async function submitBefriendAnswer(roundIndex, selectedIndex) {
  return apiCall('/befriend-answer', 'POST', { roundIndex, selectedIndex });
}

// ============ NPC DIALOGUE ENDPOINTS ============

async function startNpcDialogue() {
  return apiCall('/npc-dialogue-start', 'POST');
}

async function respondNpcDialogue(roundIndex, selectedIndex) {
  return apiCall('/npc-dialogue-respond', 'POST', { roundIndex, selectedIndex });
}

export {
  apiCall,
  isApiLoading,
  // Game state endpoints
  getGameState,
  getLevels,
  selectLevel,
  getSettings,
  // Player management endpoints
  createPlayer,
  // Run management endpoints
  startRun,
  forfeitRun,
  getAreaOptions,
  selectArea,
  // Room exploration endpoints
  proceed,
  roomEncounter,
  selectBranch,
  doorHints,
  shrineUpgrade,
  quizReward,
  getQuizQuestion,
  submitQuizAnswer,
  // Combat endpoints
  startEncounter,
  startCreatureEncounter,
  creatureCombatCycle,
  getCreatureCollection,
  rollPostCombatShop,
  selectShopItem,
  swapCreature,
  rearrangeCreatures,
  learnMove,
  swapCreatureEquip,
  befriendReplace,
  getBefriendConversation,
  submitBefriendAnswer,
  // NPC dialogue endpoints
  startNpcDialogue,
  respondNpcDialogue,
  // Shop/economy endpoints
  shopSkip,
  getDealerState,
  dealerSell,
  dealerBuy,
  dealerLeave,
  // Whack-a-mole endpoints
  getWhackAMolePool,
  completeWhackAMole,
  // Vocab/JPDB endpoints
  sendJpdbReview,
  parseJpdbText,
  lookupJpdbWord,
  lookupJpdbBatch,
  getDiscoveryWords,
  getDiscoveryStatus,
  completeDiscovery
  // Note: getDueWords is exported inline
};
