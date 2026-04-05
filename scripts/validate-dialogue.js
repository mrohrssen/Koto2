// scripts/validate-dialogue.js
/**
 * Validates dialogue files against the word dictionary and authoring constraints.
 * Usage: node scripts/validate-dialogue.js
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadWordDictionary } from '../src/game/word-dictionary.js';

const DATA_DIR = join(process.cwd(), 'data');
const DIALOGUE_DIR = join(DATA_DIR, 'dialogue');

const dict = loadWordDictionary(DATA_DIR);
let errors = 0;
let warnings = 0;

function checkLine(line, context) {
  if (!line._contentWords) {
    console.warn(`  WARN: ${context} — no _contentWords (run pre-tokenize first)`);
    warnings++;
    return;
  }
  for (const word of line._contentWords) {
    if (!dict.has(word)) {
      console.error(`  ERROR: ${context} — word "${word}" not in dictionary`);
      errors++;
    }
  }
  if (line.overrides) {
    for (const word of Object.keys(line.overrides)) {
      if (!dict.has(word)) {
        console.error(`  ERROR: ${context} — override word "${word}" not in dictionary`);
        errors++;
      }
    }
  }
}

function validateBarks(data) {
  for (const [trigger, lines] of Object.entries(data)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ctx = `barks.${trigger}[${i}]`;
      checkLine(line, ctx);
      if (line._contentWords && line._contentWords.length > 3) {
        console.error(`  ERROR: ${ctx} — bark has ${line._contentWords.length} content words (max 3)`);
        errors++;
      }
    }
  }
}

function validateCidScripts(data) {
  for (const script of data) {
    for (let i = 0; i < script.lines.length; i++) {
      checkLine(script.lines[i], `cid:${script.id}[${i}]`);
    }
  }
}

function validateNpcLines(data) {
  for (const [npcId, slots] of Object.entries(data)) {
    for (const [slot, lines] of Object.entries(slots)) {
      for (let i = 0; i < lines.length; i++) {
        checkLine(lines[i], `npc:${npcId}.${slot}[${i}]`);
      }
    }
  }
}

console.log(`Dictionary loaded: ${dict.size} entries\n`);

console.log('Validating barks.json...');
validateBarks(JSON.parse(readFileSync(join(DIALOGUE_DIR, 'barks.json'), 'utf-8')));
console.log('Validating cid-scripts.json...');
validateCidScripts(JSON.parse(readFileSync(join(DIALOGUE_DIR, 'cid-scripts.json'), 'utf-8')));
console.log('Validating npc-lines.json...');
validateNpcLines(JSON.parse(readFileSync(join(DIALOGUE_DIR, 'npc-lines.json'), 'utf-8')));

console.log(`\n${errors} errors, ${warnings} warnings`);
if (errors > 0) {
  console.error('\nValidation FAILED — fix missing dictionary entries before proceeding.');
  process.exit(1);
}
console.log('Validation PASSED.');
