/**
 * Platform detection and configuration.
 * Returns the correct API base URL for web vs Capacitor native.
 *
 * IMPORTANT: This module must have zero dependencies (no imports from other
 * game modules) so it can be safely imported in any context, including
 * Node.js test environments.
 */

const isNative = typeof window !== 'undefined' && window.Capacitor !== undefined;

const apiBase = isNative
  ? 'https://jrpg-production.up.railway.app'
  : '';

export const PLATFORM = {
  isNative,
  apiBase
};

/**
 * Build a full API URL, prepending the platform base for Capacitor native apps.
 * @param {string} path - Absolute path starting with / (e.g. '/api/game/state')
 * @returns {string} Full URL
 */
export function apiUrl(path) {
  return `${apiBase}${path}`;
}
