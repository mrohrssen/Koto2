#!/usr/bin/env node
// Batch lookup JPDB frequency ranks for potential creature words.
// For each word, finds ALL spelling forms and reports the most common one.
//
// Usage: JPDB_API_KEY=$(cat data/.creature-forge-jpdb-key) node scripts/creature-freq-lookup.mjs

import { readFileSync } from 'fs';

const API = 'https://jpdb.io/api/v1';
const KEY = process.env.JPDB_API_KEY;
if (!KEY) {
  console.error('Set JPDB_API_KEY env var');
  process.exit(1);
}

async function jpdb(endpoint, body) {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    console.error('Rate limited, waiting 60s...');
    await new Promise(r => setTimeout(r, 60000));
    return jpdb(endpoint, body);
  }
  if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Each entry: [english concept, unambiguous japanese form for identification]
// Use kanji or katakana that UNIQUELY identifies the intended word.
// Hiragana is too ambiguous (かめ could parse as a verb, さい as 際, etc.)
// After identification, the script discovers all alt spellings and picks the
// most common form automatically.
const WORDS = [
  // Objects
  ['Pillow', '枕'],
  ['Speaker', 'スピーカー'],
  ['Book', '本'],
  ['Plant', '植物'],
  ['Cup', 'コップ'],
  ['Pan/Pot', '鍋'],
  ['Plate', '皿'],
  ['Camera', 'カメラ'],
  ['Lamp', 'ランプ'],
  ['Pencil', '鉛筆'],
  ['Pen', 'ペン'],
  ['Backpack', 'リュック'],
  ['Candle', '蝋燭'],
  ['Scissors', '鋏'],
  ['Bomb', '爆弾'],
  ['Toaster', 'トースター'],
  ['Calculator', '電卓'],
  ['Spoon', 'スプーン'],
  ['Teapot', '急須'],
  ['Blanket', '毛布'],
  ['Toothbrush', '歯ブラシ'],
  ['Hairbrush', 'ヘアブラシ'],
  ['Eraser', '消しゴム'],
  ['Snowflake', '雪'],
  ['Sunflower', '向日葵'],
  ['Rose', '薔薇'],
  ['Cactus', 'サボテン'],
  // Animals
  ['Turtle', '亀'],
  ['Horse', '馬'],
  ['Caterpillar', '毛虫'],
  ['Gecko', 'ヤモリ'],
  ['Butterfly', '蝶'],
  ['Sparrow', '雀'],
  ['Rat', '鼠'],
  ['Snake', '蛇'],
  ['Bat', '蝙蝠'],
  ['Cat', '猫'],
  ['Lion', 'ライオン'],
  ['Leopard', '豹'],
  ['Monkey', '猿'],
  ['Tadpole', 'おたまじゃくし'],
  ['Octopus', 'タコ'],
  ['Seal', 'アザラシ'],
  ['Ghost', '幽霊'],
  ['Seahorse', 'タツノオトシゴ'],
  ['Starfish', 'ヒトデ'],
  ['Bull', '雄牛'],
  ['Dragon', '龍'],
  ['Raccoon Dog', '狸'],
  ['Owl', '梟'],
  ['Beetle', 'カブトムシ'],
  ['Bear', '熊'],
  ['Fox', '狐'],
  ['Wolf', '狼'],
  ['Cow', '牛'],
  ['Chicken', '鶏'],
  ['Whale', '鯨'],
  ['Squirrel', 'リス'],
  ['Teddy Bear', 'ぬいぐるみ'],
  ['Deer', '鹿'],
  ['Elephant', '象'],
  ['Seagull', 'カモメ'],
  ['Pelican', 'ペリカン'],
  ['Camel', 'ラクダ'],
  ['Penguin', 'ペンギン'],
  ['Dinosaur', '恐竜'],
  ['Chipmunk', 'シマリス'],
  ['Gorilla', 'ゴリラ'],
  ['Bonsai', '盆栽'],
  ['Frog', '蛙'],
  ['Toad', 'ヒキガエル'],
  ['Dragonfly', 'トンボ'],
  ['Ferret', 'フェレット'],
  ['Pigeon/Dove', '鳩'],
  ['Crocodile', 'ワニ'],
  ['Crab', '蟹'],
  ['Duck', 'アヒル'],
  ['Polar Bear', 'シロクマ'],
  ['Buffalo', '水牛'],
  ['Rhino', '犀'],
  ['Cheetah', 'チーター'],
  ['Panda', 'パンダ'],
  ['Toucan', 'オオハシ'],
  ['Pig', '豚'],
  ['Dolphin', 'イルカ'],
];

async function main() {
  // Step 1: Parse all initial forms to get vid/sid
  console.error('Step 1: Parsing initial forms...');
  const initialParsed = new Map(); // english -> { vid, sid, spelling, reading }

  // Parse in batches of ~30
  for (let i = 0; i < WORDS.length; i += 30) {
    const batch = WORDS.slice(i, i + 30);
    const text = batch.map(w => w[1]).join(' ');
    await sleep(500);
    const res = await jpdb('parse', {
      text,
      token_fields: ['vocabulary_index'],
      vocabulary_fields: ['spelling', 'reading', 'vid', 'sid'],
    });

    // Map tokens back to words. Parse may produce more tokens than input words
    // (e.g. 歯ブラシ might split). We need to match by checking the vocabulary list.
    // Actually, the vocabulary array is deduplicated. Let's map by index from tokens.
    const vocabByIdx = new Map();
    for (let vi = 0; vi < res.vocabulary.length; vi++) {
      const [spelling, reading, vid, sid] = res.vocabulary[vi];
      vocabByIdx.set(vi, { spelling, reading, vid, sid });
    }

    // tokens is array of arrays, one per token. Each inner array has one element: vocabulary_index
    // We need to figure out which tokens correspond to which input words.
    // Since we joined with spaces, and some words contain multiple tokens...
    // Simplest: just collect all unique vid/sid from this batch parse.
    // Then we match them to our input by reading.

    const batchResults = new Map(); // reading -> {vid, sid, spelling}
    for (const [idx, v] of vocabByIdx) {
      batchResults.set(v.reading, v);
    }

    for (const [eng, jp] of batch) {
      // Find by trying the input text directly
      // Check if any vocabulary entry's spelling or reading matches our input
      let match = null;
      for (const [idx, v] of vocabByIdx) {
        if (v.spelling === jp || v.reading === jp) {
          match = v;
          break;
        }
      }
      if (!match) {
        // Try partial match for compound words
        for (const [idx, v] of vocabByIdx) {
          if (jp.includes(v.reading) || v.reading.includes(jp)) {
            match = v;
            break;
          }
        }
      }
      if (match) {
        initialParsed.set(eng, match);
      } else {
        console.error(`  Warning: no parse match for ${eng} (${jp})`);
      }
    }
  }

  console.error(`  Parsed ${initialParsed.size}/${WORDS.length} words`);

  // Step 2: Lookup alt_spellings for all parsed words
  console.error('Step 2: Looking up alt_spellings...');
  const vidSidList = [...initialParsed.values()].map(v => [v.vid, v.sid]);
  await sleep(500);
  const altRes = await jpdb('lookup-vocabulary', {
    list: vidSidList,
    fields: ['spelling', 'reading', 'frequency_rank', 'alt_spellings'],
  });

  // Build a map: vid -> { initialSpelling, initialRank, altSpellings[] }
  const entries = [...initialParsed.entries()];
  const vidInfo = new Map(); // vid -> { english, spellings: [{spelling, sid, rank}] }

  for (let i = 0; i < entries.length; i++) {
    const [eng, parsed] = entries[i];
    const [spelling, reading, rank, altSpellings] = altRes.vocabulary_info[i];

    vidInfo.set(eng, {
      vid: parsed.vid,
      initialSpelling: spelling,
      initialReading: reading,
      initialRank: rank,
      altSpellings: altSpellings || [],
    });
  }

  // Step 3: Parse all alt spellings to get their sids
  // IMPORTANT: Verify vid matches! Short/ambiguous spellings (か, じゃ, たつ)
  // often parse as different words (particles, common verbs). Only keep matches
  // where the vid is the same as the original word.
  console.error('Step 3: Parsing alt spellings...');
  const altsToParse = []; // [{english, altSpelling, expectedVid}]
  for (const [eng, info] of vidInfo) {
    for (const alt of info.altSpellings) {
      altsToParse.push({ english: eng, altSpelling: alt, expectedVid: info.vid });
    }
  }

  // Parse alt spellings in batches
  const altParsed = new Map(); // "eng|altSpelling" -> {vid, sid}
  for (let i = 0; i < altsToParse.length; i += 50) {
    const batch = altsToParse.slice(i, i + 50);
    const text = batch.map(a => a.altSpelling).join(' ');
    await sleep(500);
    const res = await jpdb('parse', {
      text,
      token_fields: ['vocabulary_index'],
      vocabulary_fields: ['spelling', 'reading', 'vid', 'sid'],
    });

    const vocabBySpelling = new Map();
    for (const [spelling, reading, vid, sid] of res.vocabulary) {
      vocabBySpelling.set(spelling, { vid, sid, reading });
    }

    for (const { english, altSpelling, expectedVid } of batch) {
      const match = vocabBySpelling.get(altSpelling);
      if (match) {
        if (match.vid === expectedVid) {
          altParsed.set(`${english}|${altSpelling}`, match);
        } else {
          console.error(`  Skipping ${altSpelling} for ${english}: vid mismatch (got ${match.vid}, expected ${expectedVid})`);
        }
      }
    }
  }

  // Step 4: Lookup frequency for all alt sids
  console.error('Step 4: Looking up alt spelling frequencies...');
  const altLookups = [...altParsed.entries()];
  if (altLookups.length > 0) {
    const altVidSids = altLookups.map(([, v]) => [v.vid, v.sid]);
    await sleep(500);
    const altFreqRes = await jpdb('lookup-vocabulary', {
      list: altVidSids,
      fields: ['spelling', 'reading', 'frequency_rank'],
    });

    for (let i = 0; i < altLookups.length; i++) {
      const [key] = altLookups[i];
      const [spelling, reading, rank] = altFreqRes.vocabulary_info[i];
      const eng = key.split('|')[0];
      const info = vidInfo.get(eng);
      if (!info.allForms) info.allForms = [];
      info.allForms.push({ spelling, reading, rank });
    }
  }

  // Step 5: For each word, pick the form with the lowest rank
  console.error('Step 5: Selecting best forms...\n');

  const tiers = [
    { name: 'Common', min: 1, max: 3000 },
    { name: 'Uncommon', min: 3001, max: 6000 },
    { name: 'Rare', min: 6001, max: 12000 },
    { name: 'Epic', min: 12001, max: 20000 },
    { name: 'Legendary', min: 20001, max: 30000 },
    { name: 'REJECTED', min: 30001, max: Infinity },
  ];

  function getTier(rank) {
    if (rank === null) return 'N/A';
    return tiers.find(t => rank >= t.min && rank <= t.max)?.name || 'N/A';
  }

  const results = [];
  for (const [eng, info] of vidInfo) {
    const allForms = [
      { spelling: info.initialSpelling, reading: info.initialReading, rank: info.initialRank },
      ...(info.allForms || []),
    ];

    // Pick the form with the lowest rank (most common)
    allForms.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const best = allForms[0];

    results.push({
      english: eng,
      spelling: best.spelling,
      reading: best.reading,
      rank: best.rank,
      tier: getTier(best.rank),
      allForms: allForms.map(f => `${f.spelling}(${f.rank})`).join(', '),
    });
  }

  // Sort by rank
  results.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  // Output as table
  console.log('| Concept | Best Form | Reading | JPDB Rank | Tier | All Forms |');
  console.log('|---------|-----------|---------|-----------|------|-----------|');
  for (const r of results) {
    console.log(`| ${r.english} | ${r.spelling} | ${r.reading} | ${r.rank?.toLocaleString() ?? 'N/A'} | ${r.tier} | ${r.allForms} |`);
  }

  // Summary
  const tierCounts = {};
  for (const r of results) {
    tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
  }
  console.log('\n## Tier Distribution');
  for (const t of tiers) {
    console.log(`- **${t.name}**: ${tierCounts[t.name] || 0}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
