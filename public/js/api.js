/**
 * API Client Module
 *
 * Centralized server communication for the JRPG frontend.
 * All API calls go through this module to ensure consistent
 * handling of API keys, loading states, and error handling.
 */

// ============ API KEY MANAGEMENT ============

/**
 * Get stored API keys from localStorage
 * Each user stores their own keys in their browser
 */
function getStoredApiKeys() {
  return {
    jpdbApiKey: localStorage.getItem('jrpg_jpdbApiKey') || '',
    aiApiKey: localStorage.getItem('jrpg_aiApiKey') || '',
    aiProvider: localStorage.getItem('jrpg_aiProvider') || 'openai',
    openaiModel: localStorage.getItem('jrpg_openaiModel') || 'gpt-4o-mini',
    openrouterModel: localStorage.getItem('jrpg_openrouterModel') || '',
    jlptLevel: localStorage.getItem('jrpg_jlptLevel') || 'N4'
  };
}

/**
 * Save API keys to localStorage
 */
function saveStoredApiKeys(keys) {
  if (keys.jpdbApiKey !== undefined) localStorage.setItem('jrpg_jpdbApiKey', keys.jpdbApiKey);
  if (keys.aiApiKey !== undefined) localStorage.setItem('jrpg_aiApiKey', keys.aiApiKey);
  if (keys.aiProvider !== undefined) localStorage.setItem('jrpg_aiProvider', keys.aiProvider);
  if (keys.openaiModel !== undefined) localStorage.setItem('jrpg_openaiModel', keys.openaiModel);
  if (keys.openrouterModel !== undefined) localStorage.setItem('jrpg_openrouterModel', keys.openrouterModel);
  if (keys.jlptLevel !== undefined) localStorage.setItem('jrpg_jlptLevel', keys.jlptLevel);
}

// ============ CORE API WRAPPER ============

// Module-level loading state
let isLoading = false;

/**
 * Generic API call wrapper
 * Automatically includes API keys from localStorage in every request
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
  console.log('apiCall starting:', endpoint);

  try {
    // Include per-user API keys from localStorage in every request
    const apiKeys = getStoredApiKeys();
    const payload = body ? { ...body, ...apiKeys } : apiKeys;

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (method !== 'GET') options.body = JSON.stringify(payload);

    console.log('apiCall fetching:', endpoint);
    const response = await fetch(`/api/game${endpoint}`, options);
    console.log('apiCall got response:', endpoint, response.status);
    const data = await response.json();
    console.log('apiCall parsed JSON:', endpoint);

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
    const response = await fetch('/api/game/state');
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
    const response = await fetch('/api/game/upgrades');
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
    const response = await fetch('/api/settings');
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
 * Allocate a stat point
 * @param {string} stat - Stat key (str, agi, vit, int, dex, luk)
 * @returns {Promise<object>} Result with success and state
 */
async function allocateStat(stat) {
  return apiCall('/allocate-stat', 'POST', { stat });
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeId })
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to purchase upgrade:', error);
    return { success: false, error: 'Network error' };
  }
}

export {
  apiCall,
  getStoredApiKeys,
  saveStoredApiKeys,
  isApiLoading,
  // Game state endpoints
  getGameState,
  getMetaProgression,
  getSettings,
  // Player management endpoints
  createPlayer,
  allocateStat,
  purchaseUpgrade
};
