#!/usr/bin/env node
/**
 * Apply outbox merges: take words from .outbox-*.json files and merge
 * them into their correct target category files. Then clean up outbox
 * and .agent-* intermediate files.
 */
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

const CATEGORIES_DIR = join(import.meta.dirname, '..', 'data', 'vocab-categories');

// Read all outbox files
const outboxFiles = readdirSync(CATEGORIES_DIR).filter(f => f.startsWith('.outbox-'));
const agentFiles = readdirSync(CATEGORIES_DIR).filter(f => f.startsWith('.agent-'));

console.log(`Found ${outboxFiles.length} outbox files: ${outboxFiles.join(', ')}`);
console.log(`Found ${agentFiles.length} agent files: ${agentFiles.join(', ')}`);

// Collect all words by target category
const pendingMerges = {}; // { categoryName: [word objects...] }

for (const file of outboxFiles) {
  const path = join(CATEGORIES_DIR, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));

  if (Array.isArray(data)) {
    // Flat array format (.outbox-foods.json) — each entry has targetCategory
    for (const entry of data) {
      const target = entry.targetCategory;
      if (!target) {
        console.warn(`  SKIP entry without targetCategory: ${entry.word}`);
        continue;
      }
      const { targetCategory, ...wordObj } = entry;
      if (!pendingMerges[target]) pendingMerges[target] = [];
      pendingMerges[target].push(wordObj);
    }
  } else {
    // Object format — keys are category names, values are arrays of word objects
    for (const [target, words] of Object.entries(data)) {
      if (!pendingMerges[target]) pendingMerges[target] = [];
      pendingMerges[target].push(...words);
    }
  }
  console.log(`  Parsed ${file}`);
}

// Now merge into each target category file
const targets = Object.keys(pendingMerges).sort();
console.log(`\nMerging into ${targets.length} categories: ${targets.join(', ')}`);

let totalAdded = 0;
let totalSkipped = 0;

for (const category of targets) {
  const filePath = join(CATEGORIES_DIR, `${category}.json`);
  let existing;
  try {
    existing = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`  WARNING: ${category}.json not found, creating new file`);
    existing = [];
  }

  // Build a set of existing words for dedup
  const existingWords = new Set(existing.map(e => e.word));

  const toAdd = pendingMerges[category];
  let added = 0;
  let skipped = 0;

  for (const entry of toAdd) {
    if (existingWords.has(entry.word)) {
      skipped++;
      continue;
    }
    existing.push(entry);
    existingWords.add(entry.word);
    added++;
  }

  // Sort by rank
  existing.sort((a, b) => a.rank - b.rank);

  // Write back
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`  ${category}.json: +${added} words (${skipped} duplicates skipped), total ${existing.length}`);
  totalAdded += added;
  totalSkipped += skipped;
}

console.log(`\nTotal: ${totalAdded} words added, ${totalSkipped} duplicates skipped`);

// Clean up outbox and agent files
console.log('\nCleaning up...');
for (const file of [...outboxFiles, ...agentFiles]) {
  const path = join(CATEGORIES_DIR, file);
  unlinkSync(path);
  console.log(`  Deleted ${file}`);
}

console.log('\nDone!');
