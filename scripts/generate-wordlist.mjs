// scripts/generate-wordlist.mjs
import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync('top_30k_words.csv', 'utf-8');
const lines = csv.trim().split('\n');

// Extract first column (spelling) from each line
const words = lines.map(line => {
  const parts = line.split(',');
  return parts[0].trim();
}).filter(w => w.length > 0);

console.log(`Extracted ${words.length} words from CSV`);

writeFileSync('data/jpdb-wordlist.json', JSON.stringify(words, null, 0));
console.log('Wrote data/jpdb-wordlist.json');
