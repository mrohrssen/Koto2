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

    return data;
  } catch (error) {
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
 * Get meta-progression data (upgrades, essence, achievements)
 * @returns {Promise<object>} Upgrades data with essence count
 */
async function getMetaProgression() {
  try {
    const response = await fetch('/api/game/upgrades', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch meta-progression:', error.message);
    return { essence: 0, upgrades: [] };
  }
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

/**
 * Purchase a meta-progression upgrade
 * @param {string} upgradeId - Upgrade identifier
 * @returns {Promise<object>} Result with success and upgrade info
 */
async function purchaseUpgrade(upgradeId) {
  try {
    const response = await fetch('/api/game/purchase-upgrade', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ upgradeId })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to purchase upgrade:', error.message);
    return { success: false, error: 'Network error' };
  }
}

// ============ RUN MANAGEMENT ENDPOINTS ============

/**
 * Start a new dungeon run
 * @returns {Promise<object>} Result with state and narration
 */
async function startRun() {
  return apiCall('/start-run', 'POST');
}

/**
 * Forfeit the current run
 * @returns {Promise<object>} Result
 */
async function forfeitRun() {
  return apiCall('/forfeit', 'POST');
}

/**
 * Get starting ward options for a new run
 * @returns {Promise<Array>} Array of ward options
 */
async function getStartingWards() {
  try {
    const response = await fetch('/api/game/starting-wards', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch starting wards:', error.message);
    return [];
  }
}

/**
 * Select a starting ward
 * @param {string} wardId - Ward identifier
 * @returns {Promise<object>} Result with state
 */
async function selectStartingWard(wardId) {
  try {
    const response = await fetch('/api/game/select-starting-ward', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ wardId })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to select starting ward:', error.message);
    return { error: 'Network error' };
  }
}

/**
 * Get next ward options after completing a floor
 * @returns {Promise<Array>} Array of ward options
 */
async function getNextWardOptions() {
  try {
    const response = await fetch('/api/game/next-ward-options', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch next ward options:', error.message);
    return [];
  }
}

/**
 * Select the next ward
 * @param {string} wardId - Ward identifier
 * @returns {Promise<object>} Result with state
 */
async function selectNextWard(wardId) {
  try {
    const response = await fetch('/api/game/select-next-ward', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ wardId })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to select next ward:', error.message);
    return { error: 'Network error' };
  }
}

// ============ ROOM EXPLORATION ENDPOINTS ============

/** Proceed to next room */
async function proceed() {
  return apiCall('/proceed', 'POST');
}

/** Start room encounter */
async function roomEncounter() {
  return apiCall('/room-encounter', 'POST');
}

/** Select a branch door at a branching room
 * @param {string} door - Door identifier ('left' or 'right')
 */
async function selectBranch(door) {
  return apiCall('/select-branch', 'POST', { door });
}

/** Fetch Chippy's door hints for current branch point */
async function doorHints() {
  return apiCall('/door-hints', 'POST');
}

/** Upgrade chip at shrine */
async function shrineUpgrade(chipId) {
  return apiCall('/shrine-upgrade', 'POST', { chipId });
}

/** Claim quiz reward */
async function quizReward(rewardType) {
  return apiCall('/quiz-reward', 'POST', { rewardType });
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

/** Start a boss encounter */
async function startBoss() {
  return apiCall('/start-boss', 'POST');
}

// ============ SHOP/ECONOMY ENDPOINTS ============

/** Claim a free starting chip
 * @param {number} itemIndex - Index of the chip to claim
 */
async function claimStartingChip(itemIndex) {
  return apiCall('/claim-starting-chip', 'POST', { itemIndex });
}

/** Refresh the starting chip shop */
async function startingChipRefresh() {
  return apiCall('/starting-chip-refresh', 'POST');
}

/** Buy an item from the regular shop
 * @param {string} itemId - Item identifier
 */
/** Buy an item from the post-combat shop
 * @param {number} itemIndex - Index of the item to buy
 */
async function postCombatShopBuy(itemIndex) {
  return apiCall('/post-combat-shop-buy', 'POST', { itemIndex });
}

/** Skip the current shop */
async function shopSkip() {
  return apiCall('/shop-skip', 'POST');
}

/** Refresh the post-combat shop */
async function postCombatShopRefresh() {
  return apiCall('/post-combat-shop-refresh', 'POST');
}

/** Equip a chip to an equipment slot
 * @param {string} equipmentSlot - Equipment slot name ('weapon', 'body', 'shield', 'accessory')
 * @param {string} chipId - Chip identifier
 */
async function equipChip(equipmentSlot, chipId) {
  try {
    const response = await fetch('/api/game/equip-chip', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ equipmentSlot, chipId })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to equip chip:', error.message);
    return { error: 'Network error' };
  }
}

/** Unequip a chip from an equipment slot
 * @param {string} chipId - ID of chip to unequip
 * @param {string} equipmentSlot - Equipment slot name ('weapon', 'body', 'shield', 'accessory')
 */
async function unequipChip(chipId, equipmentSlot) {
  try {
    const response = await fetch('/api/game/unequip-chip', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chipId, equipmentSlot })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to unequip chip:', error.message);
    return { error: 'Network error' };
  }
}

/** Reorder equipped chips
 * @param {Array<string|null>} chipIds - New order of chip IDs (5 elements)
 */
async function reorderChips(chipIds) {
  try {
    const response = await fetch('/api/game/reorder-chips', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chipIds })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to reorder chips:', error.message);
    return { error: 'Network error' };
  }
}

/** Advance to the next floor */
async function nextFloor() {
  return apiCall('/next-floor', 'POST');
}

/** Get chip loadout for all equipment slots */
async function getChipLoadout() {
  try {
    const response = await fetch('/api/game/chip-loadout', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to get chip loadout:', error.message);
    return { error: 'Network error' };
  }
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

export {
  apiCall,
  isApiLoading,
  // Game state endpoints
  getGameState,
  getMetaProgression,
  getSettings,
  // Player management endpoints
  createPlayer,
  purchaseUpgrade,
  // Run management endpoints
  startRun,
  forfeitRun,
  getStartingWards,
  selectStartingWard,
  getNextWardOptions,
  selectNextWard,
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
  startBoss,
  // Shop/economy endpoints
  claimStartingChip,
  startingChipRefresh,
  postCombatShopBuy,
  shopSkip,
  postCombatShopRefresh,
  equipChip,
  unequipChip,
  reorderChips,
  nextFloor,
  getChipLoadout,
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
