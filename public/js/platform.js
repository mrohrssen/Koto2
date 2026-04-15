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
