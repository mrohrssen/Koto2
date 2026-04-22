import { readFileSync } from 'fs';
import { join } from 'path';
import { loadWordDictionary } from '../src/game/word-dictionary.js';
import { resolveLiveDictPath } from '../src/game/live-dict-path.js';

const DATA_DIR = join(process.cwd(), 'data');
const DIALOGUE_DIR = join(DATA_DIR, 'dialogue');

const dict = loadWordDictionary({
  overlayDir: DATA_DIR,
  liveDictPath: resolveLiveDictPath(),
});
let errors = 0;
let warnings = 0;

function checkFrame(frame) {
  const ctx = `frames[${frame.id}]`;
  if (!frame.words || frame.words.length === 0) {
    // Frames with no words (punctuation-only, slot-only, etc.) are fine
    return;
  }
  for (const word of frame.words) {
    if (!dict.has(word)) {
      console.error(`  ERROR: ${ctx} — word "${word}" not in dictionary`);
      errors++;
    }
  }
  // Bark frames must have ≤ 3 content words
  if (frame.category.startsWith('bark_') && frame.words.length > 3) {
    console.error(`  ERROR: ${ctx} — bark has ${frame.words.length} content words (max 3)`);
    errors++;
  }
}

const frames = JSON.parse(readFileSync(join(DIALOGUE_DIR, 'frames.json'), 'utf-8'));

console.log(`Dictionary loaded: ${dict.size} entries`);
console.log(`Validating frames.json (${frames.length} frames)...\n`);

for (const frame of frames) {
  checkFrame(frame);
}

// Report category breakdown
const byCategory = {};
for (const frame of frames) {
  byCategory[frame.category] = (byCategory[frame.category] || 0) + 1;
}
for (const [cat, count] of Object.entries(byCategory).sort()) {
  console.log(`  ${cat}: ${count} frames`);
}

console.log(`\n${errors} errors, ${warnings} warnings`);
if (errors > 0) {
  console.error('\nValidation FAILED — fix missing dictionary entries before proceeding.');
  process.exit(1);
}
console.log('Validation PASSED.');
