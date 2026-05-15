const isNative = typeof window !== 'undefined' && window.Capacitor !== undefined;

const RAILWAY_ORIGINS = new Set([
  'https://jrpg-dev.up.railway.app',
  'https://jrpg-production.up.railway.app',
]);

function getApiBase() {
  if (!isNative) return '';

  const origin = window.location?.origin || '';
  if (RAILWAY_ORIGINS.has(origin)) return '';

  // Legacy bundled Capacitor builds run from capacitor://localhost.
  return 'https://jrpg-production.up.railway.app';
}

const apiBase = getApiBase();

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
