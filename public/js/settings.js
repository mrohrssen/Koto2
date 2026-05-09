// ============ LOCAL STORAGE KEYS ============

const STORAGE_KEYS = {
  jlptLevel: 'jrpg_jlptLevel',
  debugMode: 'debugMode',
  bgmVolume: 'jrpg_bgmVolume',
  sfxVolume: 'jrpg_sfxVolume',
  audioMuted: 'jrpg_audioMuted'
};

// ============ API KEY DEFAULTS ============

const API_KEY_DEFAULTS = {
  jlptLevel: 'N4'
};

// ============ API KEY MANAGEMENT ============

/**
 * Get stored learning settings from localStorage
 * @returns {object} Object containing learning settings
 */
export function getApiKeys() {
  return {
    jlptLevel: localStorage.getItem(STORAGE_KEYS.jlptLevel) || API_KEY_DEFAULTS.jlptLevel
  };
}

/**
 * Save a single learning setting to localStorage
 * @param {string} key - Key name (e.g., 'jlptLevel')
 * @param {string} value - Value to save
 */
export function saveApiKey(key, value) {
  if (STORAGE_KEYS[key]) {
    localStorage.setItem(STORAGE_KEYS[key], value || '');
  }
}

/**
 * Save learning settings to localStorage
 * @param {object} keys - Object with setting values to save
 */
export function saveApiKeys(keys) {
  if (keys.jlptLevel !== undefined) localStorage.setItem(STORAGE_KEYS.jlptLevel, keys.jlptLevel);
}

// ============ DEBUG MODE ============

/**
 * Check if debug mode is enabled
 * @returns {boolean} True if debug mode is active
 */
export function isDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.debugMode) === 'true';
}

/**
 * Set debug mode state
 * @param {boolean} enabled - Whether to enable debug mode
 */
export function setDebugMode(enabled) {
  if (enabled) {
    localStorage.setItem(STORAGE_KEYS.debugMode, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEYS.debugMode);
  }
}

// ============ SERVER SETTINGS ============

import { apiUrl } from './api.js';

/**
 * Load settings from server
 * @returns {Promise<object>} Server settings object
 */
export async function loadServerSettings() {
  try {
    const response = await fetch(apiUrl('/api/settings'));
    return await response.json();
  } catch (error) {
    console.error('Failed to load server settings:', error);
    return {};
  }
}

/**
 * Save settings to server
 * @param {object} settings - Settings object to save
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveServerSettings(settings) {
  try {
    const response = await fetch(apiUrl('/api/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to save server settings:', error);
    return false;
  }
}

// ============ AI NARRATION SETTINGS ============

const AI_NARRATION_STORAGE_KEY = 'jrpg_aiNarrationEnabled';

/**
 * Check if AI narration rewrite is enabled
 * @returns {boolean} True if AI narration is enabled (default: true)
 */
export function isAiNarrationEnabled() {
  return localStorage.getItem(AI_NARRATION_STORAGE_KEY) !== 'false';
}

/**
 * Set AI narration rewrite enabled state
 * @param {boolean} enabled - Whether to enable AI narration
 */
export function setAiNarrationEnabled(enabled) {
  if (enabled) {
    localStorage.removeItem(AI_NARRATION_STORAGE_KEY);
  } else {
    localStorage.setItem(AI_NARRATION_STORAGE_KEY, 'false');
  }
}

// ============ TTS SETTINGS ============

const TTS_STORAGE_KEY = 'jrpg_ttsEnabled';

/**
 * Check if TTS is enabled
 * @returns {boolean} True if TTS is enabled
 */
export function isTtsEnabled() {
  return localStorage.getItem(TTS_STORAGE_KEY) === 'true';
}

/**
 * Set TTS enabled state
 * @param {boolean} enabled - Whether to enable TTS
 */
export function setTtsEnabled(enabled) {
  if (enabled) {
    localStorage.setItem(TTS_STORAGE_KEY, 'true');
  } else {
    localStorage.removeItem(TTS_STORAGE_KEY);
  }
}

// ============ JAPANIFY UI ============

const JAPANIFY_STORAGE_KEY = 'jrpg_japanifyUI';

/**
 * Check if Japanify UI is enabled
 * @returns {boolean} True if Japanese UI mode is enabled (default: false)
 */
export function isJapanifyUIEnabled() {
  return localStorage.getItem(JAPANIFY_STORAGE_KEY) === 'true';
}

/**
 * Set Japanify UI enabled state
 * @param {boolean} enabled - Whether to enable Japanese UI
 */
export function setJapanifyUIEnabled(enabled) {
  if (enabled) {
    localStorage.setItem(JAPANIFY_STORAGE_KEY, 'true');
  } else {
    localStorage.removeItem(JAPANIFY_STORAGE_KEY);
  }
}

// ============ AUDIO SETTINGS ============

/**
 * Get SFX volume (0-1)
 * @returns {number}
 */
export function getSfxVolume() {
  const val = localStorage.getItem('jrpg_sfxVolume');
  return val !== null ? parseFloat(val) : 0.8;
}

// ============ SERVER-SIDE LEARNING SETTINGS MANAGEMENT ============

/**
 * Save learning settings to server (authenticated)
 * @param {object} keys - Setting values to save
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveApiKeysToServer(keys) {
  const token = localStorage.getItem('authToken');
  if (!token) return false;
  try {
    const res = await fetch(apiUrl('/api/auth/api-keys'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(keys)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Load API key info from server (for settings display)
 * @returns {Promise<object>} Learning settings and consent info
 */
export async function loadApiKeysFromServer() {
  const token = localStorage.getItem('authToken');
  if (!token) return {};
  try {
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.apiKeys || {};
  } catch {
    return {};
  }
}
