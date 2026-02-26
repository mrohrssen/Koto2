#!/usr/bin/env node
/**
 * Fetches WaniKani vocabulary data via their official API v2.
 * Stores rich data (meanings, readings, parts of speech, mnemonics, context sentences)
 * to data/wanikani-vocab.json for use as a reference dictionary.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'dictionaries', 'wanikani-vocab.json');

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/fetch-wanikani-vocab.mjs <api_token>');
  process.exit(1);
}

const BASE = 'https://api.wanikani.com/v2';
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Wanikani-Revision': '20170710',
};

/** Sleep for a random duration to look like a normal client */
function sleep(min = 2000, max = 5000) {
  const ms = min + Math.random() * (max - min);
  return new Promise(r => setTimeout(r, ms));
}

/** Fetch a single page, with retry on 429 */
async function fetchPage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '30', 10);
      console.log(`  Rate limited — waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000, retryAfter * 1000 + 2000);
      continue;
    }

    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }
  throw new Error('Failed after 3 retries');
}

/** Extract the fields we care about from a vocabulary subject */
function extractVocab(subject) {
  const d = subject.data;
  return {
    id: subject.id,
    characters: d.characters,
    level: d.level,
    meanings: d.meanings, // [{meaning, primary, accepted_answer}]
    auxiliaryMeanings: d.auxiliary_meanings || [], // [{meaning, type}]
    readings: d.readings, // [{reading, primary, accepted_answer}]
    partsOfSpeech: d.parts_of_speech || [],
    meaningMnemonic: d.meaning_mnemonic || null,
    readingMnemonic: d.reading_mnemonic || null,
    contextSentences: d.context_sentences || [], // [{en, ja}]
    componentSubjectIds: d.component_subject_ids || [],
    slug: d.slug,
    documentUrl: d.document_url,
  };
}

async function main() {
  console.log('Fetching WaniKani vocabulary...');

  let url = `${BASE}/subjects?types=vocabulary,kana_vocabulary`;
  const allVocab = [];
  let page = 1;

  while (url) {
    console.log(`  Page ${page} (${allVocab.length} items so far)...`);
    const data = await fetchPage(url);

    for (const subject of data.data) {
      allVocab.push(extractVocab(subject));
    }

    url = data.pages?.next_url || null;
    page++;

    if (url) {
      await sleep(3000, 6000);
    }
  }

  // Sort by level then characters for easy browsing
  allVocab.sort((a, b) => a.level - b.level || a.characters.localeCompare(b.characters, 'ja'));

  const output = {
    source: 'WaniKani API v2',
    fetchedAt: new Date().toISOString(),
    totalItems: allVocab.length,
    vocabulary: allVocab,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nDone! ${allVocab.length} vocabulary items saved to ${OUTPUT}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
