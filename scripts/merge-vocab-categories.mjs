#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const CATEGORIES = [
  'animals', 'foods', 'locations', 'occupations', 'body-parts',
  'nature', 'objects', 'clothing', 'emotions', 'actions',
  'movement', 'descriptors', 'colors', 'numbers-time',
  'combat', 'social', 'abstract'
];

const BATCH_COUNT = 27;
const RESULT_DIR = '/tmp';
const SOURCE_CSV = '/Users/michia/Documents/jrpg/data/jpdb-wordlist.csv';
const OUTPUT_DIR = '/Users/michia/Documents/jrpg/data/vocab-categories';

// Parse the source CSV into a rank -> {word, reading, meaning} lookup
async function loadSourceData() {
  const lookup = new Map();
  const rl = createInterface({ input: createReadStream(SOURCE_CSV) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; } // skip header
    // CSV format: rank,word,reading,vid,sid,part_of_speech,"meanings"
    // We need rank, word, reading, and a short meaning
    const match = line.match(/^(\d+),([^,]*),([^,]*),/);
    if (!match) continue;
    const rank = parseInt(match[1]);
    const word = match[2];
    const reading = match[3];
    // Extract meaning: everything after the 6th comma (meanings column)
    // Find the meanings column - after rank,word,reading,vid,sid,pos
    const parts = line.split(',');
    // meanings starts at index 6, may be quoted and contain commas
    let meaning = parts.slice(6).join(',').replace(/^"|"$/g, '');
    // Truncate to first meaning (before first semicolon)
    const semi = meaning.indexOf(';');
    if (semi > 0) meaning = meaning.substring(0, semi).trim();
    // Cap length
    if (meaning.length > 60) meaning = meaning.substring(0, 57) + '...';
    lookup.set(rank, { word, reading, meaning });
  }
  return lookup;
}

// Parse compact result format: "rank|cat1,cat2" per line
function parseCompactResult(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const pipe = trimmed.indexOf('|');
    if (pipe < 0) continue;
    const rank = parseInt(trimmed.substring(0, pipe));
    const catsStr = trimmed.substring(pipe + 1).trim();
    const categories = catsStr ? catsStr.split(',').map(c => c.trim()).filter(Boolean) : [];
    if (!isNaN(rank)) entries.push({ rank, categories });
  }
  return entries;
}

async function main() {
  console.log('Loading source CSV...');
  const sourceLookup = await loadSourceData();
  console.log(`Source: ${sourceLookup.size} words loaded\n`);

  // Load all batch results (compact format)
  const allEntries = [];
  for (let i = 1; i <= BATCH_COUNT; i++) {
    const pad = String(i).padStart(2, '0');
    const path = `${RESULT_DIR}/vocab-cat-result-${pad}.txt`;
    const text = await readFile(path, 'utf8');
    const entries = parseCompactResult(text);
    allEntries.push(...entries);
    console.log(`Batch ${pad}: ${entries.length} words`);
  }
  console.log(`\nTotal entries loaded: ${allEntries.length}`);

  // Group by category, joining with source data
  const buckets = {};
  for (const cat of CATEGORIES) buckets[cat] = [];

  let uncategorized = 0;
  let missing = 0;
  for (const entry of allEntries) {
    if (entry.categories.length === 0) {
      uncategorized++;
      continue;
    }
    const source = sourceLookup.get(entry.rank);
    if (!source) {
      missing++;
      continue;
    }
    for (const cat of entry.categories) {
      if (!buckets[cat]) {
        console.warn(`Unknown category "${cat}" for rank ${entry.rank} — skipping`);
        continue;
      }
      buckets[cat].push({
        rank: entry.rank,
        word: source.word,
        reading: source.reading,
        meaning: source.meaning
      });
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const cat of CATEGORIES) {
    buckets[cat].sort((a, b) => a.rank - b.rank);
    const path = `${OUTPUT_DIR}/${cat}.json`;
    await writeFile(path, JSON.stringify(buckets[cat], null, 2) + '\n');
    console.log(`${cat}: ${buckets[cat].length} words`);
  }

  console.log(`\nUncategorized (no categories): ${uncategorized}`);
  if (missing) console.log(`Missing from source CSV: ${missing}`);
  console.log(`Output written to ${OUTPUT_DIR}/`);
}

main().catch(err => { console.error(err); process.exit(1); });
