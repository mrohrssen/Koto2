/**
 * theme-utils.mjs — Theme pool file I/O and validation.
 *
 * Theme pool files live at `language/themes/<themeId>.json`.
 * This module provides CRUD operations and filtering for theme word pools.
 *
 * Usage (library):
 *   import { loadTheme, saveTheme, validateTheme, listThemes, getThemeWords, markAssigned } from './scripts/lib/theme-utils.mjs';
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const THEMES_DIR = join(process.cwd(), 'language', 'themes');

// ── Validation ──────────────────────────────────────────────────────

const REQUIRED_TOP_LEVEL = ['themeId', 'areaWord', 'areaReading', 'areaMeaning'];
const REQUIRED_WORD_STRINGS = ['word', 'reading', 'meaning'];

/**
 * Validate a theme object. Returns array of error strings (empty = valid).
 *
 * Checks:
 * - themeId, areaWord, areaReading, areaMeaning required
 * - words must be an array
 * - Each word entry needs: word, reading, meaning, rank (number), roles (array)
 *
 * @param {Object} theme - Theme object to validate
 * @returns {string[]} Array of error strings (empty means valid)
 */
export function validateTheme(theme) {
  const errors = [];

  // Check required top-level fields
  for (const field of REQUIRED_TOP_LEVEL) {
    if (!theme[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check words array
  if (!Array.isArray(theme.words)) {
    errors.push('Missing or invalid field: words must be an array');
    return errors; // Can't validate individual words if not an array
  }

  // Validate each word entry
  for (let i = 0; i < theme.words.length; i++) {
    const w = theme.words[i];

    for (const field of REQUIRED_WORD_STRINGS) {
      if (typeof w[field] !== 'string') {
        errors.push(`words[${i}]: missing or invalid ${field} (must be string)`);
      }
    }

    if (typeof w.rank !== 'number') {
      errors.push(`words[${i}]: missing or invalid rank (must be number)`);
    }

    if (!Array.isArray(w.roles)) {
      errors.push(`words[${i}]: missing or invalid roles (must be array)`);
    }
  }

  return errors;
}

// ── File I/O ────────────────────────────────────────────────────────

/**
 * Load a theme by ID from language/themes/<themeId>.json.
 * Returns null if not found.
 *
 * @param {string} themeId - Theme identifier (filename without .json)
 * @returns {Object|null} Theme object or null if not found
 */
export function loadTheme(themeId) {
  const filePath = join(THEMES_DIR, `${themeId}.json`);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Save a theme to disk. Creates language/themes/ directory if needed.
 * Returns the file path written.
 *
 * @param {Object} theme - Theme object (must have themeId)
 * @returns {string} Absolute file path written
 */
export function saveTheme(theme) {
  if (!existsSync(THEMES_DIR)) {
    mkdirSync(THEMES_DIR, { recursive: true });
  }

  const filePath = join(THEMES_DIR, `${theme.themeId}.json`);
  writeFileSync(filePath, JSON.stringify(theme, null, 2) + '\n', 'utf8');
  return filePath;
}

/**
 * List all theme IDs (filenames without .json).
 *
 * @returns {string[]} Array of theme ID strings
 */
export function listThemes() {
  if (!existsSync(THEMES_DIR)) return [];

  return readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''));
}

// ── Query helpers ───────────────────────────────────────────────────

/**
 * Get words from a theme, optionally filtered by role and/or unassigned status.
 * Returns empty array if theme not found.
 *
 * @param {string} themeId - Theme identifier
 * @param {Object} opts - Filter options
 * @param {string} [opts.role] - Only include words that have this role
 * @param {boolean} [opts.unassignedOnly] - Only include words where assigned is null/undefined
 * @returns {Array} Filtered word entries
 */
export function getThemeWords(themeId, { role, unassignedOnly } = {}) {
  const theme = loadTheme(themeId);
  if (!theme) return [];

  let words = theme.words;

  if (role) {
    words = words.filter(w => Array.isArray(w.roles) && w.roles.includes(role));
  }

  if (unassignedOnly) {
    words = words.filter(w => !w.assigned);
  }

  return words;
}

/**
 * Mark a word as assigned in a theme file and persist.
 * Throws if theme or word not found.
 *
 * @param {string} themeId - Theme identifier
 * @param {string} word - The Japanese word to mark
 * @param {string} assignment - Assignment identifier (e.g. 'creature:sensei-owl')
 * @throws {Error} If theme or word not found
 */
export function markAssigned(themeId, word, assignment) {
  const theme = loadTheme(themeId);
  if (!theme) {
    throw new Error(`Theme not found: ${themeId}`);
  }

  const entry = theme.words.find(w => w.word === word);
  if (!entry) {
    throw new Error(`Word not found in theme ${themeId}: ${word}`);
  }

  entry.assigned = assignment;

  // Add to existingUses if not already present
  if (!Array.isArray(entry.existingUses)) {
    entry.existingUses = [];
  }
  if (!entry.existingUses.includes(assignment)) {
    entry.existingUses.push(assignment);
  }

  saveTheme(theme);
}
