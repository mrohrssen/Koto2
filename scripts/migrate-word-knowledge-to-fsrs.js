// scripts/migrate-word-knowledge-to-fsrs.js
/**
 * Migrates word-knowledge known entries into FSRS vocab deck cards.
 * Usage: node scripts/migrate-word-knowledge-to-fsrs.js
 */
import { readdirSync } from 'fs';
import { join } from 'path';
import { loadWordKnowledge } from '../src/game/bootstrap/word-knowledge.js';
import { createCard, getDeckCards, gradeCard } from '../src/game/internal-srs.js';

const DATA_DIR = join(process.cwd(), 'data');

const wkFiles = readdirSync(DATA_DIR)
  .filter(f => f.startsWith('word-knowledge-') && f.endsWith('.json'));

console.log(`Found ${wkFiles.length} word-knowledge files to migrate.\n`);

let totalMigrated = 0;
let totalSkipped = 0;

for (const file of wkFiles) {
  const userId = file.replace('word-knowledge-', '').replace('.json', '');
  console.log(`Migrating user: ${userId}`);

  const wk = loadWordKnowledge(userId);
  if (!wk || !wk.known) {
    console.log(`  No known words, skipping.`);
    continue;
  }

  const knownWords = Object.keys(wk.known);
  const existingCards = getDeckCards(userId, 'vocab');
  const existingIds = new Set(existingCards.map(c => c.id));

  let migrated = 0;
  let skipped = 0;

  for (const word of knownWords) {
    if (existingIds.has(word)) {
      skipped++;
      continue;
    }
    createCard(userId, 'vocab', word, {
      word,
      meaning: wk.known[word].meaning || '',
      reading: word,
    });
    gradeCard(userId, 'vocab', word, 'good');
    migrated++;
  }

  console.log(`  Migrated: ${migrated}, Skipped (already exist): ${skipped}`);
  totalMigrated += migrated;
  totalSkipped += skipped;
}

console.log(`\nDone. Total migrated: ${totalMigrated}, skipped: ${totalSkipped}`);
