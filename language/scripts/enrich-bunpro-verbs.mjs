#!/usr/bin/env node
/**
 * Enrich bunpro-verbs-500.json with JPDB frequency ranks.
 *
 * Usage:
 *   JPDB_API_KEY=$(cat data/.creature-forge-jpdb-key) node language/scripts/enrich-bunpro-verbs.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JPDB_API_BASE = 'https://jpdb.io/api/v1';
const MIN_DELAY_MS = 500;
const JSON_PATH = join(__dirname, '..', 'dictionaries', 'bunpro-verbs-500.json');

const API_KEY = process.env.JPDB_API_KEY;
if (!API_KEY) {
  console.error('Set JPDB_API_KEY environment variable');
  process.exit(1);
}

let lastCall = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    if (!map[spelling]) {
      map[spelling] = { vid, sid, reading };
    }
  }
  return map;
}

async function main() {
  console.log('Reading verbs JSON...');
  const verbs = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
  console.log(`${verbs.length} verbs loaded`);

  // Discover frequency field
  console.log('\nDiscovering frequency field...');
  const parseRes = await jpdbFetch('/parse', {
    text: '先生',
    token_fields: ['vocabulary_index'],
    vocabulary_fields: ['spelling', 'vid', 'sid'],
  });
  const parseData = await parseRes.json();
  const [, testVid, testSid] = parseData.vocabulary[0];

  let freqField = null;
  for (const candidate of ['frequency_rank', 'frequency', 'rank']) {
    const res = await jpdbFetch('/lookup-vocabulary', {
      list: [[testVid, testSid]],
      fields: ['spelling', candidate],
    });
    if (res.ok) {
      const data = await res.json();
      if (data.vocabulary_info?.[0]?.[1] != null) {
        freqField = candidate;
        console.log(`Using field: "${freqField}" (先生 = ${data.vocabulary_info[0][1]})`);
        break;
      }
    }
  }
  if (!freqField) {
    console.error('Could not find frequency field');
    process.exit(1);
  }

  // Collect unique words — use kanji form, fall back to reading for kana-only
  const wordToVerbs = {}; // word → [indices]
  for (let i = 0; i < verbs.length; i++) {
    const v = verbs[i];
    const word = v.kanji || v.reading;
    if (!wordToVerbs[word]) wordToVerbs[word] = [];
    wordToVerbs[word].push(i);
  }

  const uniqueWords = Object.keys(wordToVerbs);
  console.log(`\n${uniqueWords.length} unique words to look up`);

  // Parse in batches to get vid/sid
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

  console.log(`Parsed ${Object.keys(wordToVidSid).length}/${uniqueWords.length} words`);

  // Retry not-found words with する-stripping and individual parse
  const notFound = uniqueWords.filter((w) => !wordToVidSid[w]);
  if (notFound.length > 0) {
    console.log(`\n${notFound.length} not found — retrying with root extraction...`);
    for (const word of notFound) {
      let root = word;
      if (word.endsWith('する')) root = word.slice(0, -2);
      else if (word.endsWith('にする')) root = word.slice(0, -3);

      const result = await parseWordBatch([root]);
      if (result[root]) {
        wordToVidSid[word] = result[root];
        console.log(`  + ${word} → ${root} (vid=${result[root].vid})`);
      } else {
        console.log(`  - ${word} — not found`);
      }
    }
  }

  const stillMissing = uniqueWords.filter((w) => !wordToVidSid[w]);
  if (stillMissing.length > 0) {
    console.log(`\n${stillMissing.length} words truly missing:`);
    for (const w of stillMissing) console.log(`  ${w}`);
  }

  // Lookup frequencies in batches
  const vidSidToWords = {};
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
    console.log(`\nLookup batch ${batchNum}/${lookupBatches} (${batchIds.length} entries)...`);

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
      if (!info || info[1] == null) continue;
      for (const originalWord of batchEntries[j].words) {
        wordToFreq[originalWord] = info[1];
      }
    }
  }

  console.log(`\nGot frequency for ${Object.keys(wordToFreq).length} words`);

  // Enrich verbs with frequency + vid/sid
  let enriched = 0;
  for (const [word, indices] of Object.entries(wordToVerbs)) {
    for (const idx of indices) {
      const v = wordToVidSid[word];
      if (v) {
        verbs[idx].vid = v.vid;
        verbs[idx].sid = v.sid;
      }
      if (wordToFreq[word] !== undefined) {
        verbs[idx].frequencyRank = wordToFreq[word];
        enriched++;
      }
    }
  }

  console.log(`\nEnriched ${enriched}/${verbs.length} verbs with frequency ranks`);

  // Sort by frequency rank (lower = more common first), unranked at end
  verbs.sort((a, b) => {
    const fa = a.frequencyRank ?? Infinity;
    const fb = b.frequencyRank ?? Infinity;
    return fa - fb;
  });

  writeFileSync(JSON_PATH, JSON.stringify(verbs, null, 2) + '\n', 'utf-8');
  console.log(`Written to: ${JSON_PATH}`);

  // Summary stats
  const ranks = verbs.filter(v => v.frequencyRank != null).map(v => v.frequencyRank);
  console.log(`\nFrequency stats:`);
  console.log(`  Min rank: ${Math.min(...ranks)}`);
  console.log(`  Max rank: ${Math.max(...ranks)}`);
  console.log(`  Median rank: ${ranks.sort((a,b) => a-b)[Math.floor(ranks.length/2)]}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
