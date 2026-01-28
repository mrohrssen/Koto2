// scripts/generate-wordlist.mjs
import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync('top_30k_words.csv', 'utf-8');
const lines = csv.trim().split('\n');

// Extract spelling with frequency rank (1 = most frequent)
const words = lines.map((line, index) => {
  const parts = line.split(',');
  const spelling = parts[0].trim();
  if (!spelling) return null;
  return { word: spelling, rank: index + 1 };
}).filter(w => w !== null);

console.log(`Extracted ${words.length} words from CSV`);

writeFileSync('data/jpdb-wordlist.json', JSON.stringify(words));
console.log('Wrote data/jpdb-wordlist.json');
