#!/usr/bin/env node
/**
 * Clean up animals.json:
 * 1. Remove entries that don't belong in "animals" category
 * 2. Remove duplicates (tail section has many)
 * 3. Append misplaced entries to their correct category files
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dirname, '..', 'data', 'vocab-categories');

function readCategory(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf8'));
}

function writeCategory(name, data) {
  writeFileSync(join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}

// Entries to move OUT of animals, keyed by destination category
const moves = {
  'foods': new Set(['鶏肉', '牛肉', '焼き肉', '豚肉', '焼き鳥', '焼き魚', 'チキン']),
  'objects': new Set(['鈴', '駒', 'お宝']),
  'combat': new Set(['銃口']),
  'body-parts': new Set(['毛', '鳥肌が立つ', '鳥肌', '髯']),
  'emotions': new Set(['亡くす', '親近感', '心配事', '大満足']),
  'descriptors': new Set(['優', '何の変哲もない', '名だたる', '苦虫を噛み潰したよう']),
  'numbers-time': new Set(['二十五', '一間']),
  'nature': new Set(['実る', '銀河', 'ひょう']),
  'locations': new Set(['署', '裏山']),
  'movement': new Set(['つかつか', '飛び']),
  'social': new Set(['魔女', '負け犬', '馬の骨', '無法者']),
  'abstract': new Set(['コンコン', '大の字', '殆どない', '仕方なしに', '喚起']),
  'actions': new Set(['舐め取る']),
};

// Build a flat set of all words to move + their destination
const allMoveWords = new Map(); // word -> destination
for (const [dest, words] of Object.entries(moves)) {
  for (const w of words) {
    allMoveWords.set(w, dest);
  }
}

// Special cases: entries where the word exists but the MEANING is wrong for animals
// 尾 with meaning "Chinese Tail constellation" and 申 with meaning "the Monkey zodiac"
const meaningMismatches = new Set([
  '尾',   // meaning is constellation, not tail
  '申',   // meaning is zodiac sign, not monkey
]);

const meaningMismatchDest = {
  '尾': 'nature',
  '申': 'numbers-time',
};

// Load animals
const animals = readCategory('animals');
console.log(`Original animals.json: ${animals.length} entries`);

// Track what we've seen for dedup
const seen = new Set();
const movedEntries = {}; // dest -> [entries]
const cleaned = [];
let dupeCount = 0;
let moveCount = 0;
let meaningMismatchCount = 0;

for (const entry of animals) {
  const key = `${entry.word}|${entry.reading}|${entry.rank}`;

  // Skip duplicates
  if (seen.has(key)) {
    dupeCount++;
    console.log(`  DUP: ${entry.word} (${entry.reading}) rank ${entry.rank}`);
    continue;
  }
  seen.add(key);

  // Also dedup 牙を剝く vs 牙を剥く (unicode variant)
  const normalizedWord = entry.word.normalize('NFC');
  const normKey = `${normalizedWord}|${entry.reading}`;
  if (normalizedWord !== entry.word) {
    // Check if we already have the NFC version
    const hasNfc = cleaned.some(e => e.word.normalize('NFC') === normalizedWord && e.reading === entry.reading);
    if (hasNfc) {
      dupeCount++;
      console.log(`  DUP (unicode): ${entry.word} (${entry.reading}) rank ${entry.rank}`);
      continue;
    }
  }

  // Check meaning mismatches (word exists in animals but with wrong meaning)
  if (meaningMismatches.has(entry.word)) {
    const dest = meaningMismatchDest[entry.word];
    if (!movedEntries[dest]) movedEntries[dest] = [];
    movedEntries[dest].push(entry);
    meaningMismatchCount++;
    console.log(`  MEANING: ${entry.word} "${entry.meaning}" → ${dest}`);
    continue;
  }

  // Check if word should be moved
  const dest = allMoveWords.get(entry.word);
  if (dest) {
    if (!movedEntries[dest]) movedEntries[dest] = [];
    movedEntries[dest].push(entry);
    moveCount++;
    console.log(`  MOVE: ${entry.word} (${entry.reading}) → ${dest}`);
    continue;
  }

  cleaned.push(entry);
}

// Sort by rank
cleaned.sort((a, b) => a.rank - b.rank);

console.log(`\nRemoved ${dupeCount} duplicates, ${moveCount} misplaced, ${meaningMismatchCount} meaning mismatches`);
console.log(`Cleaned animals.json: ${cleaned.length} entries`);

// Write cleaned animals
writeCategory('animals', cleaned);

// Append moved entries to destination categories
for (const [dest, entries] of Object.entries(movedEntries)) {
  const existing = readCategory(dest);
  const existingKeys = new Set(existing.map(e => `${e.word}|${e.reading}`));

  let added = 0;
  for (const entry of entries) {
    const key = `${entry.word}|${entry.reading}`;
    if (!existingKeys.has(key)) {
      existing.push(entry);
      added++;
    } else {
      console.log(`  SKIP (already exists): ${entry.word} in ${dest}`);
    }
  }

  existing.sort((a, b) => a.rank - b.rank);
  writeCategory(dest, existing);
  console.log(`  ${dest}.json: added ${added} entries (total: ${existing.length})`);
}

console.log('\nDone!');
