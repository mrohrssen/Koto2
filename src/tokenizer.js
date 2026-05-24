import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELPER_PATH = join(__dirname, '..', 'scripts', 'sudachi-tokenize.py');

/**
 * Tokenize Japanese text into normalized token objects.
 * @param {string} text - Japanese text to tokenize
 * @returns {Array<{
 *   surface: string,
 *   baseForm: string,
 *   pos: string,
 *   reading: string,
 *   normalizedForm?: string,
 *   pos0?: string,
 *   pos1?: string,
 *   pos2?: string,
 *   pos3?: string,
 *   pos4?: string,
 *   pos5?: string,
 *   conjugationType?: string,
 *   conjugationForm?: string,
 *   index?: number
 * }>}
 */
export function tokenize(text) {
  if (!text || text.trim().length === 0) return [];

  const result = execFileSync('python3', [HELPER_PATH], {
    input: JSON.stringify([text]),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(result)[0];
}

/**
 * Tokenize multiple texts in a single Sudachi call.
 * @param {string[]} texts - Array of Japanese text strings
 * @returns {Array<Array<{
 *   surface: string,
 *   baseForm: string,
 *   pos: string,
 *   reading: string,
 *   normalizedForm?: string,
 *   pos0?: string,
 *   pos1?: string,
 *   pos2?: string,
 *   pos3?: string,
 *   pos4?: string,
 *   pos5?: string,
 *   conjugationType?: string,
 *   conjugationForm?: string,
 *   index?: number
 * }>>}
 */
export function tokenizeBatch(texts) {
  if (!texts || texts.length === 0) return [];

  const result = execFileSync('python3', [HELPER_PATH], {
    input: JSON.stringify(texts),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(result);
}
