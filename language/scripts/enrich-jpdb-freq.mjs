#!/usr/bin/env node
/**
 * Enrich Translation Only Words.csv with JPDB frequency ranks.
 *
 * Usage:
 *   JPDB_API_KEY=xxx node scripts/enrich-jpdb-freq.mjs
 *
 * Reads the CSV, looks up each Japanese word via JPDB API,
 * fills in the ITEM JPDB FREQUENCY and ACTION JPDB FREQUENCY columns,
 * and writes the result back.
 */

import { readFileSync, writeFileSync } from 'fs';

const JPDB_API_BASE = 'https://jpdb.io/api/v1';
const MIN_DELAY_MS = 500;
const CSV_PATH = new URL('../JAPANESE NAMES/Translation Only Words.csv', import.meta.url);
const CSV_FILE = decodeURIComponent(CSV_PATH.pathname);

const API_KEY = process.env.JPDB_API_KEY;
if (!API_KEY) {
  console.error('Set JPDB_API_KEY environment variable');
  process.exit(1);
}

// --- Rate-limited fetch ---
let lastCall = 0;

async function jpdbFetch(endpoint, body) {
  const now = Date.now();
  const wait = MIN_DELAY_MS - (now - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const res = await fetch(`${JPDB_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    console.warn('Rate limited — backing off 60s...');
    await sleep(60_000);
    lastCall = Date.now();
    return jpdbFetch(endpoint, body);
  }

  return res;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Discover which field name JPDB uses for frequency ---
async function discoverFreqField() {
  // First parse a known word to get valid vid/sid
  const parseRes = await jpdbFetch('/parse', {
    text: '先生',
    token_fields: ['vocabulary_index'],
    vocabulary_fields: ['spelling', 'vid', 'sid'],
  });
  if (!parseRes.ok) {
    console.error('Could not parse test word');
    return null;
  }
  const parseData = await parseRes.json();
  const [, vid, sid] = parseData.vocabulary[0]; // [spelling, vid, sid]

  const candidates = ['frequency_rank', 'frequency', 'rank'];
  for (const field of candidates) {
    console.log(`Testing field name: "${field}"...`);
    const res = await jpdbFetch('/lookup-vocabulary', {
      list: [[vid, sid]],
      fields: ['spelling', field],
    });
    if (res.ok) {
      const data = await res.json();
      const info = data.vocabulary_info?.[0];
      if (info && info.length >= 2 && info[1] != null) {
        console.log(`Field "${field}" works. Test value for 先生: ${info[1]}`);
        return field;
      }
    }
    const errText = await res.text().catch(() => '');
    console.log(`  Field "${field}" failed: ${res.status} ${errText.slice(0, 100)}`);
  }
  return null;
}

// --- Parse words to get vid/sid ---
async function parseWordBatch(words) {
  const text = words.join(' ');
  const res = await jpdbFetch('/parse', {
    text,
    token_fields: ['vocabulary_index'],
    vocabulary_fields: ['spelling', 'reading', 'vid', 'sid'],
  });

  if (!res.ok) {
    console.warn(`Parse failed: ${res.status}`);
    return {};
  }

  const data = await res.json();
  const vocabulary = data.vocabulary || [];
  const map = {};
  for (const v of vocabulary) {
    const [spelling, reading, vid, sid] = v;
    // Keep first match per spelling (most common sense)
    if (!map[spelling]) {
      map[spelling] = { vid, sid, reading };
    }
  }
  return map;
}


// --- CSV helpers ---
function parseCSV(text) {
  const lines = text.split('\n');
  return lines.map((line) => line.split(','));
}

function toCSV(rows) {
  return rows.map((row) => row.join(',')).join('\n');
}

// --- Main ---
async function main() {
  console.log('Reading CSV...');
  const csvText = readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCSV(csvText);
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.length >= 11);

  console.log(`${dataRows.length} data rows`);

  // Column indices
  const ITEM_WORD_COL = 2;      // Japanese Word (item)
  const ITEM_FREQ_COL = 4;      // ITEM JPDB FREQUENCY
  const ACTION_WORD_COL = 8;    // Japanese Word (action)
  const ACTION_FREQ_COL = 10;   // ACTION JPDB FREQUENCY

  // Step 1: Discover frequency field name
  const freqField = await discoverFreqField();
  if (!freqField) {
    console.error('Could not find a working frequency field in JPDB API.');
    console.error('Tried: frequency_rank, frequency, rank');
    process.exit(1);
  }
  console.log(`Using frequency field: "${freqField}"\n`);

  // Step 2: Collect all unique Japanese words
  const allWords = new Set();
  for (const row of dataRows) {
    const itemWord = row[ITEM_WORD_COL]?.trim();
    const actionWord = row[ACTION_WORD_COL]?.trim();
    if (itemWord) allWords.add(itemWord);
    if (actionWord) allWords.add(actionWord);
  }
  const uniqueWords = [...allWords];
  console.log(`${uniqueWords.length} unique words to look up\n`);

  // Step 3: Parse in batches to get vid/sid
  const BATCH_SIZE = 200;
  const wordToVidSid = {};
  const totalBatches = Math.ceil(uniqueWords.length / BATCH_SIZE);

  for (let i = 0; i < uniqueWords.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = uniqueWords.slice(i, i + BATCH_SIZE);
    console.log(`Parsing batch ${batchNum}/${totalBatches} (${batch.length} words)...`);
    const result = await parseWordBatch(batch);
    Object.assign(wordToVidSid, result);
  }

  const foundCount = Object.keys(wordToVidSid).length;
  console.log(`\nParsed ${foundCount}/${uniqueWords.length} words successfully`);

  // Retry not-found words: strip する, parse individually, etc.
  const notFound = uniqueWords.filter((w) => !wordToVidSid[w]);
  if (notFound.length > 0) {
    console.log(`\n${notFound.length} words not found in batch parse. Retrying with root extraction...`);

    for (const word of notFound) {
      // Try stripping する suffix first
      let root = word;
      if (word.endsWith('する')) {
        root = word.slice(0, -2);
      }

      // Parse the root word individually
      const result = await parseWordBatch([root]);
      if (result[root]) {
        wordToVidSid[word] = result[root]; // map original compound → root's vid/sid
        console.log(`  ✓ ${word} → ${root} (vid=${result[root].vid})`);
      } else {
        console.log(`  ✗ ${word} — still not found`);
      }
    }

    const stillMissing = notFound.filter((w) => !wordToVidSid[w]);
    console.log(`\nAfter retry: ${stillMissing.length} words still missing`);
    if (stillMissing.length > 0) {
      for (const w of stillMissing) console.log(`  - ${w}`);
    }
  }

  // Step 4: Lookup frequencies in batches
  // Build deduplicated list by vid:sid to avoid redundant lookups
  const vidSidToWords = {}; // "vid:sid" → [originalWord1, originalWord2, ...]
  for (const [word, v] of Object.entries(wordToVidSid)) {
    const key = `${v.vid}:${v.sid}`;
    if (!vidSidToWords[key]) vidSidToWords[key] = { vid: v.vid, sid: v.sid, words: [] };
    vidSidToWords[key].words.push(word);
  }

  const dedupEntries = Object.values(vidSidToWords);
  const vocabIds = dedupEntries.map((e) => [e.vid, e.sid]);

  const wordToFreq = {};
  const LOOKUP_BATCH = 500;
  const lookupBatches = Math.ceil(vocabIds.length / LOOKUP_BATCH);

  for (let i = 0; i < vocabIds.length; i += LOOKUP_BATCH) {
    const batchNum = Math.floor(i / LOOKUP_BATCH) + 1;
    const batchIds = vocabIds.slice(i, i + LOOKUP_BATCH);
    const batchEntries = dedupEntries.slice(i, i + LOOKUP_BATCH);
    console.log(`\nLooking up frequencies batch ${batchNum}/${lookupBatches} (${batchIds.length} entries)...`);

    const res = await jpdbFetch('/lookup-vocabulary', {
      list: batchIds,
      fields: ['spelling', freqField],
    });

    if (!res.ok) {
      console.warn(`Lookup failed: ${res.status}`);
      continue;
    }

    const data = await res.json();
    const vocabInfo = data.vocabulary_info || [];

    for (let j = 0; j < vocabInfo.length; j++) {
      const info = vocabInfo[j];
      if (!info) continue;
      const [, freq] = info;
      if (freq == null) continue;
      // Map frequency to all original words that resolved to this vid:sid
      for (const originalWord of batchEntries[j].words) {
        wordToFreq[originalWord] = freq;
      }
    }
  }

  const freqCount = Object.keys(wordToFreq).length;
  const totalFound = Object.keys(wordToVidSid).length;
  console.log(`\nGot frequency for ${freqCount}/${totalFound} words`);

  // Step 5: Write frequencies back into CSV rows
  let itemFilled = 0;
  let actionFilled = 0;

  for (const row of dataRows) {
    const itemWord = row[ITEM_WORD_COL]?.trim();
    const actionWord = row[ACTION_WORD_COL]?.trim();

    if (itemWord && wordToFreq[itemWord] !== undefined) {
      row[ITEM_FREQ_COL] = String(wordToFreq[itemWord]);
      itemFilled++;
    }

    if (actionWord && wordToFreq[actionWord] !== undefined) {
      row[ACTION_FREQ_COL] = String(wordToFreq[actionWord]);
      actionFilled++;
    }
  }

  console.log(`\nFilled ${itemFilled} item frequencies, ${actionFilled} action frequencies`);

  // Step 6: Write updated CSV
  const outputRows = [header, ...dataRows];
  const outputCSV = toCSV(outputRows);
  writeFileSync(CSV_FILE, outputCSV, 'utf-8');
  console.log(`\nWritten to: ${CSV_FILE}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
