// src/tokenizer.js
/**
 * Wraps SudachiPy for Japanese tokenization.
 * Returns: [{ surface, baseForm, pos, reading }]
 *
 * Uses dictionary_form (not normalized_form) for baseForm.
 * Calls Python helper via child_process.
 */
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELPER_PATH = join(__dirname, '..', 'scripts', 'sudachi-tokenize.py');

/**
 * Tokenize Japanese text into normalized token objects.
 * @param {string} text - Japanese text to tokenize
 * @returns {Array<{surface: string, baseForm: string, pos: string, reading: string}>}
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
