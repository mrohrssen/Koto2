#!/usr/bin/env node
// Usage: echo '[{"id":"salmon-sushi","compound":"鮭寿司","components":["鮭","寿司"]}]' | \
//   JPDB_API_KEY=xxx node scripts/item-forge-lookup.mjs

import { parseBatch, lookupVocab, sleep } from './lib/jpdb-helpers.mjs';

const apiKey = process.env.JPDB_API_KEY;
if (!apiKey) {
  console.error('JPDB_API_KEY env var required');
  process.exit(1);
}

const input = await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => resolve(JSON.parse(data)));
});

// Collect all unique words (components + compounds)
const allWords = new Set();
for (const item of input) {
  for (const comp of item.components) allWords.add(comp);
  if (item.compound) allWords.add(item.compound);
}

const wordList = [...allWords];

// Step 1: Parse all words to get vid/sid
const parseResult = await parseBatch(wordList, apiKey, {
  vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
  batchSize: 30,
  interBatchDelayMs: 1000
});

// Build word -> parsed entry map
const wordMap = new Map();
for (const entry of parseResult.vocabulary) {
  // entry: [spelling, reading, vid, sid, meanings]
  wordMap.set(entry[0], {
    spelling: entry[0],
    reading: entry[1],
    vid: entry[2],
    sid: entry[3],
    meanings: entry[4] || []
  });
}

// Step 2: Lookup frequency for all parsed words with valid vid/sid
const validEntries = [...wordMap.values()].filter(e => e.vid != null);
if (validEntries.length > 0) {
  await sleep(1000);
  const vidSidPairs = validEntries.map(e => [e.vid, e.sid]);
  const lookupResult = await lookupVocab(vidSidPairs, apiKey,
    ['spelling', 'reading', 'frequency_rank', 'meanings'],
    { batchSize: 500, interBatchDelayMs: 1000 }
  );
  for (let i = 0; i < validEntries.length; i++) {
    const info = lookupResult.vocabulary_info[i];
    // info: [spelling, reading, frequency_rank, meanings]
    const entry = validEntries[i];
    entry.rank = info[2];
    entry.meanings = info[3] || entry.meanings;
  }
}

// Step 3: Enrich each input item with lookup results
const results = input.map(item => {
  const enrichedComponents = item.components.map(comp => {
    const entry = wordMap.get(comp);
    if (!entry) return { word: comp, reading: null, meanings: [], rank: null };
    return {
      word: entry.spelling,
      reading: entry.reading,
      meanings: entry.meanings,
      rank: entry.rank ?? null
    };
  });

  const compoundEntry = item.compound ? wordMap.get(item.compound) : null;
  const compoundRank = compoundEntry?.rank ?? null;

  // Tier rank = max rank among components (rarest component)
  const componentRanks = enrichedComponents.map(c => c.rank).filter(r => r != null);
  const tierRank = componentRanks.length > 0 ? Math.max(...componentRanks) : null;

  return {
    ...item,
    components: enrichedComponents,
    compoundRank,
    tierRank
  };
});

console.log(JSON.stringify(results, null, 2));
