/**
 * @fileoverview Settings Module for user preferences and API key management
 * @module public/js/settings
 *
 * PURPOSE:
 * Centralizes user settings and API key management. Handles localStorage
 * persistence and provides a unified interface for the application.
 *
 * KEY EXPORTS:
 * - API Keys: getApiKeys(), saveApiKeys(), hasRequiredApiKeys(), hasJpdbApiKey()
 * - Debug Mode: isDebugMode(), setDebugMode()
 * - Server Settings: loadServerSettings(), saveServerSettings()
 */

// ============ LOCAL STORAGE KEYS ============

const STORAGE_KEYS = {
  jpdbApiKey: 'jrpg_jpdbApiKey',
  aiApiKey: 'jrpg_aiApiKey',
  aiProvider: 'jrpg_aiProvider',
  openaiModel: 'jrpg_openaiModel',
  openrouterModel: 'jrpg_openrouterModel',
  jlptLevel: 'jrpg_jlptLevel',
  bunproToken: 'bunproToken',
  debugMode: 'debugMode',
  bgmVolume: 'jrpg_bgmVolume',
  sfxVolume: 'jrpg_sfxVolume',
  audioMuted: 'jrpg_audioMuted'
};

// ============ API KEY DEFAULTS ============

const API_KEY_DEFAULTS = {
  jpdbApiKey: '',
  aiApiKey: '',
  aiProvider: '',
  openaiModel: '',
  openrouterModel: '',
  jlptLevel: 'N4'
};

// ============ API KEY MANAGEMENT ============

/**
 * Get stored API keys from localStorage
 * @returns {object} Object containing all API keys and related settings
 */
export function getApiKeys() {
  return {
    jpdbApiKey: localStorage.getItem(STORAGE_KEYS.jpdbApiKey) || API_KEY_DEFAULTS.jpdbApiKey,
    aiApiKey: localStorage.getItem(STORAGE_KEYS.aiApiKey) || API_KEY_DEFAULTS.aiApiKey,
    aiProvider: localStorage.getItem(STORAGE_KEYS.aiProvider) || API_KEY_DEFAULTS.aiProvider,
    openaiModel: localStorage.getItem(STORAGE_KEYS.openaiModel) || API_KEY_DEFAULTS.openaiModel,
    openrouterModel: localStorage.getItem(STORAGE_KEYS.openrouterModel) || API_KEY_DEFAULTS.openrouterModel,
    jlptLevel: localStorage.getItem(STORAGE_KEYS.jlptLevel) || API_KEY_DEFAULTS.jlptLevel
  };
}

/**
 * Save a single API key to localStorage
 * @param {string} key - Key name (e.g., 'jpdbApiKey', 'aiApiKey')
 * @param {string} value - Value to save
 */
export function saveApiKey(key, value) {
  if (STORAGE_KEYS[key]) {
    localStorage.setItem(STORAGE_KEYS[key], value || '');
  }
}

/**
 * Save API keys to localStorage
 * @param {object} keys - Object with API key values to save
 */
export function saveApiKeys(keys) {
  if (keys.jpdbApiKey !== undefined) localStorage.setItem(STORAGE_KEYS.jpdbApiKey, keys.jpdbApiKey);
  if (keys.aiApiKey !== undefined) localStorage.setItem(STORAGE_KEYS.aiApiKey, keys.aiApiKey);
  if (keys.aiProvider !== undefined) localStorage.setItem(STORAGE_KEYS.aiProvider, keys.aiProvider);
  if (keys.openaiModel !== undefined) localStorage.setItem(STORAGE_KEYS.openaiModel, keys.openaiModel);
  if (keys.openrouterModel !== undefined) localStorage.setItem(STORAGE_KEYS.openrouterModel, keys.openrouterModel);
  if (keys.jlptLevel !== undefined) localStorage.setItem(STORAGE_KEYS.jlptLevel, keys.jlptLevel);
}

/**
 * Check if user has configured required API keys (AI provider key)
 * @returns {boolean} True if AI API key is configured
 */
export function hasRequiredApiKeys() {
  const keys = getApiKeys();
  return keys.aiApiKey && keys.aiApiKey.length > 0;
}

/**
 * Check if JPDB key is configured
 * @returns {boolean} True if JPDB API key is configured
 */
export function hasJpdbApiKey() {
  const keys = getApiKeys();
  return keys.jpdbApiKey && keys.jpdbApiKey.length > 0;
}

// ============ BUNPRO TOKEN ============

/**
 * Get Bunpro API token
 * @returns {string} Bunpro token or empty string
 */
export function getBunproToken() {
  return localStorage.getItem(STORAGE_KEYS.bunproToken) || '';
}

/**
 * Check if Bunpro token is configured
 * @returns {boolean} True if Bunpro token is set
 */
export function hasBunproToken() {
  const token = getBunproToken();
  return token && token.length > 0;
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

// ============ SERVER-SIDE API KEY MANAGEMENT ============

/**
 * Save API keys to server (authenticated)
 * @param {object} keys - API key values to save
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
 * @returns {Promise<object>} API key info (hasJpdbKey, hasAiKey, aiProvider, etc.)
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
