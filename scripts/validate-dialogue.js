import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadWordDictionary } from '../src/game/word-dictionary.js';
import { resolveLiveDictPath } from '../src/game/live-dict-path.js';

/**
 * Validate a single frame against the dictionary and override schema.
 * Returns an array of error strings (empty = valid).
 */
export function validateFrame(frame, dict) {
  const errors = [];
  const ctx = `frames[${frame.id}]`;

  if (Array.isArray(frame.words) && frame.words.length > 0) {
    for (const word of frame.words) {
      if (!dict.has(word)) {
        errors.push(`${ctx} — word "${word}" not in dictionary`);
      }
    }
    if (typeof frame.category === 'string' && frame.category.startsWith('bark_') && frame.words.length > 3) {
      errors.push(`${ctx} — bark has ${frame.words.length} content words (max 3)`);
    }
  }

  if (frame.overrides !== undefined) {
    if (frame.overrides === null || typeof frame.overrides !== 'object' || Array.isArray(frame.overrides)) {
      errors.push(`${ctx} — overrides must be a plain object`);
    } else {
      const tokenBases = new Set((frame.tokens || []).filter(t => t.base).map(t => t.base));
      for (const [key, value] of Object.entries(frame.overrides)) {
        if (!tokenBases.has(key)) {
          errors.push(`${ctx} — override key "${key}" is not a base form in this frame`);
        } else if (!dict.has(key)) {
          errors.push(`${ctx} — word "${key}" not in dictionary`);
        }
        if (typeof value !== 'string' || value.trim().length === 0) {
          errors.push(`${ctx} — override value for "${key}" must be a non-empty string`);
        }
      }
    }
  }

  return errors;
}

function main() {
  const DATA_DIR = join(process.cwd(), 'data');
  const DIALOGUE_DIR = join(DATA_DIR, 'dialogue');

  const dict = loadWordDictionary({
    overlayDir: DATA_DIR,
    liveDictPath: resolveLiveDictPath(),
  });
  const frames = JSON.parse(readFileSync(join(DIALOGUE_DIR, 'frames.json'), 'utf-8'));

  console.log(`Dictionary loaded: ${dict.size} entries`);
  console.log(`Validating frames.json (${frames.length} frames)...\n`);

  let errorCount = 0;
  for (const frame of frames) {
    const errs = validateFrame(frame, dict);
    for (const e of errs) {
      console.error(`  ERROR: ${e}`);
      errorCount++;
    }
  }

  const byCategory = {};
  for (const frame of frames) {
    byCategory[frame.category] = (byCategory[frame.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat}: ${count} frames`);
  }

  console.log(`\n${errorCount} errors`);
  if (errorCount > 0) {
    console.error('\nValidation FAILED.');
    process.exit(1);
  }
  console.log('Validation PASSED.');
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
