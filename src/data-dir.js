import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Railway volume mount point - use if exists, otherwise project root
const RAILWAY_DATA_DIR = '/app/persist';

const DEFAULT_DATA_DIR = existsSync(RAILWAY_DATA_DIR) ? RAILWAY_DATA_DIR : PROJECT_ROOT;
let testDataDir = null;

/** Get current data directory (respects test overrides). */
export function getDataDir() {
  return testDataDir || DEFAULT_DATA_DIR;
}

/** Test-only: override the data directory. */
export function setDataDirForTest(dir) {
  testDataDir = dir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Clear any test override after each test/app cleanup. */
export function resetDataDirForTest() {
  testDataDir = null;
}

/**
 * Get full path for a data file
 * @param {string} filename
 * @returns {string}
 */
export function dataPath(filename) {
  return join(getDataDir(), filename);
}
