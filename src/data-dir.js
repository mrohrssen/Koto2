import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Railway volume mount point - use if exists, otherwise project root
const RAILWAY_DATA_DIR = '/app/persist';

export const DATA_DIR = existsSync(RAILWAY_DATA_DIR) ? RAILWAY_DATA_DIR : PROJECT_ROOT;

// Ensure directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Get full path for a data file
 * @param {string} filename
 * @returns {string}
 */
export function dataPath(filename) {
  return join(DATA_DIR, filename);
}
