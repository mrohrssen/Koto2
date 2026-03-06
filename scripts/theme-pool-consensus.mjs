#!/usr/bin/env node
/**
 * theme-pool-consensus.mjs — Consensus enrichment script for theme pool generation.
 *
 * Takes 5 raw JSON word lists (one per generation method), merges them,
 * enriches via JPDB, and generates master output files (JSON + CSV).
 *
 * Usage:
 *   node scripts/theme-pool-consensus.mjs \
 *     --theme school \
 *     --area-word 学校 \
 *     --area-reading がっこう \
 *     --area-meaning school \
 *     --input tmp/theme-school-1-brainstorm.json \
 *     --input tmp/theme-school-2-jisho.json \
 *     --input tmp/theme-school-3-textbook.json \
 *     --input tmp/theme-school-4-scene.json \
 *     --input tmp/theme-school-5-web.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { parseBatch, lookupVocab, tierFromRank, sleep } from './lib/jpdb-helpers.mjs';

const PROJECT_ROOT = process.cwd();

// The 5 canonical method names
const METHOD_NAMES = ['brainstorm', 'jisho', 'textbook', 'scene', 'web'];

// ── CLI parsing ──────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { theme: null, areaWord: null, areaReading: null, areaMeaning: null, inputs: [] };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--theme':
        result.theme = args[++i];
        break;
      case '--area-word':
        result.areaWord = args[++i];
        break;
      case '--area-reading':
        result.areaReading = args[++i];
        break;
      case '--area-meaning':
        result.areaMeaning = args[++i];
        break;
      case '--input':
        result.inputs.push(args[++i]);
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  // Validate required args
  const missing = [];
  if (!result.theme) missing.push('--theme');
  if (!result.areaWord) missing.push('--area-word');
  if (!result.areaReading) missing.push('--area-reading');
  if (!result.areaMeaning) missing.push('--area-meaning');
  if (result.inputs.length === 0) missing.push('--input (at least one)');

  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.join(', ')}`);
    printUsage();
    process.exit(1);
  }

  return result;
}

function printUsage() {
  console.log(`Usage:
  node scripts/theme-pool-consensus.mjs \\
    --theme <id> \\
    --area-word <word> --area-reading <reading> --area-meaning <meaning> \\
    --input <file1.json> --input <file2.json> ...

Options:
  --theme <id>           Theme identifier (e.g. "school")
  --area-word <word>     Japanese area word (e.g. "学校")
  --area-reading <rdg>   Area word reading in hiragana (e.g. "がっこう")
  --area-meaning <eng>   Area word English meaning (e.g. "school")
  --input <file>         Input JSON file (repeatable, one per method)
  --help                 Show this help message`);
}

// ── API key loading ──────────────────────────────────────────────────

function loadApiKey() {
  const keyPath = join(PROJECT_ROOT, 'data', '.creature-forge-jpdb-key');
  try {
    return readFileSync(keyPath, 'utf8').trim();
  } catch {
    if (process.env.JPDB_API_KEY) return process.env.JPDB_API_KEY.trim();
    throw new Error('No JPDB API key found. Place key in data/.creature-forge-jpdb-key or set JPDB_API_KEY env var.');
  }
}

// ── Extract method name from filename ────────────────────────────────

/**
 * Extract method name from filename pattern: *-N-name.json
 * e.g. "theme-school-1-brainstorm.json" -> "brainstorm"
 *      "tmp/theme-school-3-textbook.json" -> "textbook"
 */
function extractMethodName(filepath) {
  const name = basename(filepath);
  const match = name.match(/-(\d+)-(\w+)\.json$/);
  if (!match) {
    console.warn(`  Warning: Could not extract method name from "${name}", using filename as method`);
    return name.replace(/\.json$/, '');
  }
  return match[2];
}

// ── Step 1 & 2: Read, merge, deduplicate ─────────────────────────────

function readAndMerge(inputPaths) {
  // Map<word, { reading, meaning, methods: Set<string> }>
  const merged = new Map();
  const methodCounts = {};

  for (const filepath of inputPaths) {
    const method = extractMethodName(filepath);
    console.log(`  Reading ${basename(filepath)} (method: ${method})...`);

    let entries;
    try {
      entries = JSON.parse(readFileSync(filepath, 'utf8'));
    } catch (err) {
      console.error(`  ERROR: Failed to read ${filepath}: ${err.message}`);
      continue;
    }

    methodCounts[method] = entries.length;
    console.log(`    ${entries.length} words`);

    for (const entry of entries) {
      const { word, reading, meaning } = entry;
      if (!word) continue;

      if (merged.has(word)) {
        const existing = merged.get(word);
        existing.methods.add(method);
        // Keep first non-empty reading/meaning
        if (!existing.reading && reading) existing.reading = reading;
        if (!existing.meaning && meaning) existing.meaning = meaning;
      } else {
        merged.set(word, {
          reading: reading || '',
          meaning: meaning || '',
          methods: new Set([method]),
        });
      }
    }
  }

  console.log(`\n  Merged: ${merged.size} unique words from ${inputPaths.length} files`);
  return { merged, methodCounts };
}

// ── Step 3: JPDB enrichment ──────────────────────────────────────────

async function enrichViaJpdb(merged, apiKey) {
  const words = [...merged.keys()];
  console.log(`\n  Parsing ${words.length} words via JPDB (batches of 30)...`);

  // Step 3a: Parse all words
  let parseResult;
  try {
    parseResult = await parseBatch(words, apiKey, {
      vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
      batchSize: 30,
      interBatchDelayMs: 1000,
    });
  } catch (err) {
    console.warn(`  WARNING: Parse failed: ${err.message}`);
    console.warn('  Continuing with no JPDB data.');
    return new Map();
  }

  // Build parse map: word -> { spelling, reading, vid, sid, meanings }
  const parseMap = new Map();
  for (const entry of parseResult.vocabulary) {
    const spelling = entry[0];
    if (!parseMap.has(spelling)) {
      parseMap.set(spelling, {
        spelling: entry[0],
        reading: entry[1],
        vid: entry[2],
        sid: entry[3],
        meanings: entry[4] || [],
      });
    }
  }

  // Match words to parsed entries
  const wordParseMap = new Map(); // word -> parsed entry
  for (const word of words) {
    const parsed = parseMap.get(word);
    if (parsed) {
      wordParseMap.set(word, parsed);
    }
  }

  const parsedCount = wordParseMap.size;
  console.log(`  Parsed: ${parsedCount}/${words.length} words matched`);

  // Step 3b: Lookup vid/sid pairs for rank, POS, meanings
  const wordsWithVid = words.filter(w => wordParseMap.has(w) && wordParseMap.get(w).vid != null);
  const vidSidPairs = wordsWithVid.map(w => {
    const p = wordParseMap.get(w);
    return [p.vid, p.sid];
  });

  if (vidSidPairs.length === 0) {
    console.warn('  WARNING: No words parsed with valid vid/sid. Returning parse-only data.');
    return wordParseMap;
  }

  console.log(`  Looking up ${vidSidPairs.length} words via JPDB (batches of 500)...`);

  let lookupResult;
  try {
    lookupResult = await lookupVocab(vidSidPairs, apiKey,
      ['spelling', 'reading', 'frequency_rank', 'meanings', 'part_of_speech'],
      { batchSize: 500, interBatchDelayMs: 1000 }
    );
  } catch (err) {
    console.warn(`  WARNING: Lookup failed: ${err.message}`);
    console.warn('  Continuing with parse-only data.');
    return wordParseMap;
  }

  // Build enrichment map: word -> { spelling, reading, vid, sid, rank, meanings, pos }
  const enriched = new Map();
  for (let i = 0; i < wordsWithVid.length; i++) {
    const word = wordsWithVid[i];
    const parsed = wordParseMap.get(word);
    const info = lookupResult.vocabulary_info[i];
    // Fields: [spelling, reading, frequency_rank, meanings, part_of_speech]
    enriched.set(word, {
      spelling: info[0],
      reading: info[1],
      vid: parsed.vid,
      sid: parsed.sid,
      rank: info[2],
      meanings: info[3] || [],
      pos: info[4] || [],
    });
  }

  console.log(`  Enriched: ${enriched.size} words with full JPDB data`);
  return enriched;
}

// ── Step 6: Look up area word rank ───────────────────────────────────

async function lookupAreaWordRank(areaWord, apiKey) {
  console.log(`\n  Looking up area word rank: ${areaWord}...`);
  try {
    const parseResult = await parseBatch([areaWord], apiKey, {
      vocabularyFields: ['spelling', 'reading', 'vid', 'sid'],
      batchSize: 1,
      interBatchDelayMs: 0,
    });

    if (parseResult.vocabulary.length === 0) {
      console.warn('  WARNING: Area word not found in JPDB parse.');
      return null;
    }

    const vid = parseResult.vocabulary[0][2];
    const sid = parseResult.vocabulary[0][3];
    if (vid == null) {
      console.warn('  WARNING: Area word has no vid.');
      return null;
    }

    await sleep(1000);

    const lookupResult = await lookupVocab([[vid, sid]], apiKey,
      ['frequency_rank'],
      { batchSize: 1, interBatchDelayMs: 0 }
    );

    const rank = lookupResult.vocabulary_info[0][0];
    console.log(`  Area word rank: ${rank ?? 'null'}`);
    return rank;
  } catch (err) {
    console.warn(`  WARNING: Area word lookup failed: ${err.message}`);
    return null;
  }
}

// ── Step 4 & 5: Filter, deduplicate by vid, build master list ────────

function buildMasterList(merged, enriched) {
  const entries = [];
  const seenVids = new Set();

  for (const [word, mergeInfo] of merged) {
    const jpdb = enriched.get(word);

    // Get rank — skip words with no rank or rank > 30000
    const rank = jpdb?.rank ?? null;
    if (rank === null || rank > 30000) continue;

    // Deduplicate by vid — keep first occurrence
    if (jpdb?.vid != null) {
      if (seenVids.has(jpdb.vid)) continue;
      seenVids.add(jpdb.vid);
    }

    // Build meaning string from JPDB data or fallback to input
    let meaning;
    if (jpdb?.meanings && jpdb.meanings.length > 0) {
      // JPDB meanings come as nested arrays: [["meaning1", "meaning2"], ["meaning3"]]
      meaning = Array.isArray(jpdb.meanings)
        ? jpdb.meanings.flat().join('; ')
        : String(jpdb.meanings);
    } else {
      meaning = mergeInfo.meaning;
    }

    // Build POS string
    const pos = jpdb?.pos
      ? (Array.isArray(jpdb.pos) ? jpdb.pos.join(', ') : String(jpdb.pos))
      : '';

    // Build method booleans
    const methodBools = {};
    for (const m of METHOD_NAMES) {
      methodBools[m] = mergeInfo.methods.has(m);
    }

    entries.push({
      word: jpdb?.spelling || word,
      reading: jpdb?.reading || mergeInfo.reading,
      meaning,
      rank,
      tier: tierFromRank(rank),
      pos,
      ...methodBools,
      consensus: mergeInfo.methods.size,
    });
  }

  // Sort: consensus desc, then rank asc
  entries.sort((a, b) => {
    if (b.consensus !== a.consensus) return b.consensus - a.consensus;
    return a.rank - b.rank;
  });

  return entries;
}

// ── CSV output ───────────────────────────────────────────────────────

function escapeCSV(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCSV(entries, filepath) {
  const header = ['word', 'reading', 'meaning', 'rank', 'tier',
    'Brainstorm', 'Jisho', 'Textbook', 'Scene', 'Web', 'consensus'];
  const lines = [header.join(',')];

  for (const e of entries) {
    lines.push([
      escapeCSV(e.word),
      escapeCSV(e.reading),
      escapeCSV(e.meaning),
      e.rank ?? '',
      escapeCSV(e.tier),
      e.brainstorm ? 1 : 0,
      e.jisho ? 1 : 0,
      e.textbook ? 1 : 0,
      e.scene ? 1 : 0,
      e.web ? 1 : 0,
      e.consensus,
    ].join(','));
  }

  writeFileSync(filepath, lines.join('\n') + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const apiKey = loadApiKey();

  console.log(`\n=== Theme Pool Consensus: ${config.theme} ===`);
  console.log(`  Area: ${config.areaWord} (${config.areaReading}) — ${config.areaMeaning}`);
  console.log(`  Input files: ${config.inputs.length}\n`);

  // Step 1 & 2: Read and merge
  console.log('--- Step 1: Read and merge ---');
  const { merged, methodCounts } = readAndMerge(config.inputs);

  // Step 3: JPDB enrichment
  console.log('\n--- Step 2: JPDB enrichment ---');
  const enriched = await enrichViaJpdb(merged, apiKey);

  // Step 6: Area word rank (do this while we have the API key loaded)
  console.log('\n--- Step 3: Area word lookup ---');
  const areaRank = await lookupAreaWordRank(config.areaWord, apiKey);

  // Step 4 & 5: Filter and build master list
  console.log('\n--- Step 4: Build master list ---');
  const masterList = buildMasterList(merged, enriched);

  // Stats
  const tierCounts = {};
  const consensusCounts = {};
  for (const e of masterList) {
    tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;
    consensusCounts[e.consensus] = (consensusCounts[e.consensus] || 0) + 1;
  }

  console.log(`  Master list: ${masterList.length} words (after filtering rank > 30000 and dedup by vid)`);
  console.log(`  Tier breakdown: ${JSON.stringify(tierCounts)}`);
  console.log(`  Consensus breakdown: ${JSON.stringify(consensusCounts)}`);

  // Step 7: Write outputs
  console.log('\n--- Step 5: Write outputs ---');

  const jsonPath = join(PROJECT_ROOT, 'tmp', `theme-${config.theme}-master.json`);
  const csvPath = join(PROJECT_ROOT, 'tmp', `theme-${config.theme}-master.csv`);

  const masterJson = {
    themeId: config.theme,
    areaWord: config.areaWord,
    areaReading: config.areaReading,
    areaMeaning: config.areaMeaning,
    areaRank,
    generatedAt: new Date().toISOString(),
    methodCounts,
    words: masterList,
  };

  writeFileSync(jsonPath, JSON.stringify(masterJson, null, 2) + '\n');
  console.log(`  JSON: ${jsonPath} (${masterList.length} words)`);

  writeCSV(masterList, csvPath);
  console.log(`  CSV:  ${csvPath}`);

  // Summary
  console.log(`\n=== Done ===`);
  console.log(`  Theme: ${config.theme}`);
  console.log(`  Area word: ${config.areaWord} (rank ${areaRank ?? 'unknown'})`);
  console.log(`  Total words: ${masterList.length}`);
  console.log(`  Methods: ${Object.entries(methodCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`  Consensus 5: ${consensusCounts[5] || 0}, 4: ${consensusCounts[4] || 0}, 3: ${consensusCounts[3] || 0}, 2: ${consensusCounts[2] || 0}, 1: ${consensusCounts[1] || 0}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
