// Test script: find max /parse batch size and count due words
// Usage: JPDB_API_KEY=your_key node scripts/test-jpdb-parse-batch.mjs
import { readFileSync } from 'fs';

const API_KEY = process.env.JPDB_API_KEY;
if (!API_KEY) { console.error('Set JPDB_API_KEY env var'); process.exit(1); }
const BASE = 'https://jpdb.io/api/v1';

const csv = readFileSync('top_30k_words.csv', 'utf-8');
const words = csv.trim().split('\n').map(line => line.split(',')[0]);

for (const size of [2000, 1500]) {
  console.log(`\nTrying ${size} words...`);
  const batch = words.slice(0, size);
  const bodySize = JSON.stringify({ text: batch }).length;
  console.log(`  Payload size: ${bodySize} bytes`);

  const res = await fetch(`${BASE}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      text: batch,
      position_length_encoding: 'utf16',
      token_fields: ['vocabulary_index'],
      vocabulary_fields: ['vid', 'sid', 'spelling', 'reading', 'card_state']
    })
  });

  if (!res.ok) {
    console.log(`  Failed: ${res.status} - ${(await res.json()).error_message}`);
  } else {
    const data = await res.json();
    const vocabs = data.vocabulary || [];
    let dueCount = 0;
    for (const v of vocabs) {
      if (v[4]?.includes('due') || v[4]?.includes('failed')) dueCount++;
    }
    console.log(`  Success! ${vocabs.length} vocab entries, ${dueCount} due/failed`);
  }

  await new Promise(r => setTimeout(r, 1000));
}
