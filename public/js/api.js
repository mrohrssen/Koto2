/**
 * API Client Module
 *
 * Centralized server communication for the JRPG frontend.
 * All API calls go through this module to ensure consistent
 * handling of auth tokens, loading states, and error handling.
 */

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
  if (isLoading) {
    console.warn('apiCall blocked - isLoading is true for:', endpoint);
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
    console.error('API Error:', error);
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
    console.error('Failed to fetch game state:', error);
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
    console.error('Failed to fetch meta-progression:', error);
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
    console.error('Failed to fetch settings:', error);
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
    console.error('Failed to purchase upgrade:', error);
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
    console.error('Failed to fetch starting wards:', error);
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
    console.error('Failed to select starting ward:', error);
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
    console.error('Failed to fetch next ward options:', error);
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
    console.error('Failed to select next ward:', error);
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

/** Use a shrine */
async function useShrine() {
  return apiCall('/use-shrine', 'POST');
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
    console.error('Failed to equip chip:', error);
    return { error: 'Network error' };
  }
}

/** Unequip a chip from an equipment slot
 * @param {string} equipmentSlot - Equipment slot name ('weapon', 'body', 'shield', 'accessory')
 */
async function unequipChip(equipmentSlot) {
  try {
    const response = await fetch('/api/game/unequip-chip', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ equipmentSlot })
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to unequip chip:', error);
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
    console.error('Failed to get chip loadout:', error);
    return { error: 'Network error' };
  }
}

// ============ VOCAB/JPDB ENDPOINTS ============

/** Warm the vocabulary cache
 * @param {boolean} force - Force refresh even if cached
 */
async function warmVocabCache(force = false) {
  try {
    const response = await fetch('/api/game/vocab-cache/warm', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ force })
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to warm vocab cache:', error);
    return { error: 'Network error' };
  }
}

/** Fetch vocabulary from JPDB decks */
async function fetchJpdbVocab() {
  try {
    const response = await fetch('/api/vocab/fetch', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch JPDB vocab:', error);
    return { error: 'Network error' };
  }
}

/** Send JPDB review
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 * @param {number} grade - Review grade (1-5)
 */
async function sendJpdbReview(vid, sid, grade) {
  try {
    const response = await fetch('/api/jpdb/review', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vid, sid, grade })
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to send JPDB review:', error);
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
    console.error('Failed to parse JPDB text:', error);
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
    console.error('Failed to lookup JPDB word:', error);
    return { error: 'Network error' };
  }
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
  useShrine,
  // Combat endpoints
  startEncounter,
  startBoss,
  // Shop/economy endpoints
  claimStartingChip,
  postCombatShopBuy,
  shopSkip,
  postCombatShopRefresh,
  equipChip,
  unequipChip,
  nextFloor,
  getChipLoadout,
  // Vocab/JPDB endpoints
  warmVocabCache,
  fetchJpdbVocab,
  sendJpdbReview,
  parseJpdbText,
  lookupJpdbWord
};
