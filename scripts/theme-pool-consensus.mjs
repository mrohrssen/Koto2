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

// ── Review HTML generation ────────────────────────────────────────────

function generateReviewHTML(masterJson, config) {
  const { themeId, areaWord, areaReading, areaMeaning, areaRank, words } = masterJson;
  const wordCount = words.length;

  // Truncate meanings for the embedded data to keep file size reasonable
  const trimmedWords = words.map(w => ({
    word: w.word,
    reading: w.reading,
    meaning: w.meaning.length > 120 ? w.meaning.slice(0, 117) + '...' : w.meaning,
    rank: w.rank,
    tier: w.tier,
    pos: w.pos,
    brainstorm: w.brainstorm,
    jisho: w.jisho,
    textbook: w.textbook,
    scene: w.scene,
    web: w.web,
    consensus: w.consensus,
  }));

  const dataJson = JSON.stringify({
    themeId,
    areaWord,
    areaReading,
    areaMeaning,
    areaRank,
    words: trimmedWords,
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${themeId} Theme Review</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, system-ui, sans-serif;
    background: #0a0a0f; color: #e0e0e0;
    padding-bottom: 64px; /* space for sticky footer */
  }

  /* ── Sticky header ── */
  .header {
    position: sticky; top: 0; z-index: 10;
    background: #12121a; padding: 10px 14px 8px;
    border-bottom: 1px solid #2a2a3a;
  }
  .header h1 { font-size: 17px; margin-bottom: 6px; color: #fff; }
  .header h1 .count { color: #888; font-weight: 400; font-size: 14px; }

  .search-row { display: flex; gap: 8px; margin-bottom: 6px; }
  .search-row input {
    flex: 1; padding: 6px 10px; border-radius: 8px; border: 1px solid #3a3a4a;
    background: #1a1a2a; color: #e0e0e0; font-size: 14px; outline: none;
  }
  .search-row input:focus { border-color: #4a8aca; }

  .filter-row { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px; align-items: center; }
  .filter-label { font-size: 11px; color: #666; margin-right: 2px; }
  .filter-btn {
    padding: 3px 9px; border-radius: 12px; border: 1px solid #3a3a4a;
    background: #1a1a2a; color: #aaa; font-size: 12px; cursor: pointer;
  }
  .filter-btn.active { background: #2a4a6a; border-color: #4a8aca; color: #fff; }

  .controls-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin-bottom: 4px; }
  .sort-btn {
    padding: 2px 7px; border-radius: 10px; border: 1px solid #2a2a3a;
    background: transparent; color: #888; font-size: 11px; cursor: pointer;
  }
  .sort-btn.active { color: #4a8aca; border-color: #4a8aca; }

  .bulk-btn {
    padding: 2px 8px; border-radius: 10px; border: 1px solid #3a5a3a;
    background: transparent; color: #6a9a6a; font-size: 11px; cursor: pointer;
    margin-left: auto;
  }
  .bulk-btn:active { background: #1a2a1a; }
  .bulk-btn.uncheck { border-color: #5a3a3a; color: #9a6a6a; }
  .bulk-btn.uncheck:active { background: #2a1a1a; }

  .stats { font-size: 11px; color: #666; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; }
  thead { position: sticky; top: 0; z-index: 5; }
  th {
    background: #16161f; padding: 5px 4px; font-size: 10px; color: #666;
    border-bottom: 1px solid #2a2a3a; text-align: left; white-space: nowrap;
  }
  td { padding: 5px 4px; font-size: 13px; border-bottom: 1px solid #151520; }
  tr { transition: background 0.1s; }
  tr:hover { background: #1a1a2a; }
  tr.checked { background: #141e14; }
  tr.checked:hover { background: #1a2a1a; }

  /* Checkbox column */
  .cb-cell { width: 32px; min-width: 32px; text-align: center; }
  .cb-cell input[type="checkbox"] {
    width: 18px; height: 18px; cursor: pointer;
    accent-color: #4ade80;
  }

  .word { font-size: 15px; font-weight: 600; }
  .reading { font-size: 10px; color: #888; }
  .meaning { font-size: 11px; color: #aaa; max-width: 200px; }
  .rank { font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }

  .tier-common { color: #4ade80; }
  .tier-uncommon { color: #60a5fa; }
  .tier-rare { color: #c084fc; }
  .tier-epic { color: #fb923c; }
  .tier-legendary { color: #f472b6; }

  .method-cell { text-align: center; width: 24px; min-width: 24px; }
  .yes { color: #4ade80; font-weight: bold; }
  .no { color: #2a2a3a; }

  .consensus {
    text-align: center; font-weight: bold; font-size: 14px;
    width: 28px; min-width: 28px;
  }
  .c5 { color: #fbbf24; }
  .c4 { color: #4ade80; }
  .c3 { color: #60a5fa; }
  .c2 { color: #888; }
  .c1 { color: #555; }

  .method-header { writing-mode: vertical-rl; text-orientation: mixed; font-size: 9px; }

  /* ── Sticky footer ── */
  .footer {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 10;
    background: #12121a; border-top: 1px solid #2a2a3a;
    padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;
  }
  .footer .selected-count { font-size: 14px; color: #aaa; }
  .footer .selected-count .num { color: #4ade80; font-weight: 600; }
  .submit-btn {
    padding: 8px 20px; border-radius: 8px; border: none;
    background: #2563eb; color: #fff; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background 0.15s, opacity 0.15s;
  }
  .submit-btn:hover { background: #3b82f6; }
  .submit-btn:active { background: #1d4ed8; }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Toast notification */
  .toast {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    padding: 16px 24px; border-radius: 12px; font-size: 15px; font-weight: 600;
    z-index: 100; opacity: 0; transition: opacity 0.3s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
  .toast.success { background: #166534; color: #4ade80; border: 1px solid #22c55e; }
  .toast.error { background: #7f1d1d; color: #fca5a5; border: 1px solid #ef4444; }

  @media (max-width: 600px) {
    .meaning { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td, th { padding: 4px 2px; }
    .header { padding: 8px 10px 6px; }
    .footer { padding: 8px 10px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>${escapeHTML(themeId)} Theme Review <span class="count">(${wordCount} words)</span></h1>
  <div class="search-row">
    <input type="text" id="search" placeholder="Search word, reading, or meaning...">
  </div>
  <div class="filter-row">
    <span class="filter-label">Consensus:</span>
    <button class="filter-btn consensus-filter active" data-filter="all">All</button>
    <button class="filter-btn consensus-filter" data-filter="5">5/5</button>
    <button class="filter-btn consensus-filter" data-filter="4">4+</button>
    <button class="filter-btn consensus-filter" data-filter="3">3+</button>
    <button class="filter-btn consensus-filter" data-filter="2">2+</button>
  </div>
  <div class="filter-row">
    <span class="filter-label">Tier:</span>
    <button class="filter-btn tier-filter active" data-tier="all">All</button>
    <button class="filter-btn tier-filter" data-tier="common" style="color:#4ade80">Common</button>
    <button class="filter-btn tier-filter" data-tier="uncommon" style="color:#60a5fa">Uncommon</button>
    <button class="filter-btn tier-filter" data-tier="rare" style="color:#c084fc">Rare</button>
    <button class="filter-btn tier-filter" data-tier="epic" style="color:#fb923c">Epic</button>
    <button class="filter-btn tier-filter" data-tier="legendary" style="color:#f472b6">Legendary</button>
  </div>
  <div class="controls-row">
    <span class="filter-label">Sort:</span>
    <button class="sort-btn active" data-sort="consensus">Consensus</button>
    <button class="sort-btn" data-sort="rank">Rank</button>
    <button class="sort-btn" data-sort="word">Word</button>
    <button class="bulk-btn" id="checkAll">Check visible</button>
    <button class="bulk-btn uncheck" id="uncheckAll">Uncheck visible</button>
  </div>
  <div class="stats" id="stats"></div>
</div>

<table>
  <thead>
    <tr>
      <th class="cb-cell"><input type="checkbox" id="headerCb" title="Toggle visible"></th>
      <th>Word</th>
      <th>Meaning</th>
      <th class="rank">Rank</th>
      <th class="method-cell"><span class="method-header">Brain</span></th>
      <th class="method-cell"><span class="method-header">Jisho</span></th>
      <th class="method-cell"><span class="method-header">Text</span></th>
      <th class="method-cell"><span class="method-header">Scene</span></th>
      <th class="method-cell"><span class="method-header">Web</span></th>
      <th class="consensus">#</th>
    </tr>
  </thead>
  <tbody id="tbody"></tbody>
</table>

<div class="footer">
  <div class="selected-count"><span class="num" id="selectedNum">0</span> of <span id="totalNum">${wordCount}</span> selected</div>
  <button class="submit-btn" id="submitBtn" disabled>Submit</button>
</div>

<div class="toast" id="toast"></div>

<script>
const DATA = ${dataJson};

// State: checked words tracked by word string (unique key)
const checkedWords = new Set();
let currentFilter = 'all';
let currentTier = 'all';
let currentSort = 'consensus';
let searchQuery = '';
let submitting = false;

function getVisibleRows() {
  let rows = DATA.words;
  if (currentFilter !== 'all') {
    const min = parseInt(currentFilter);
    rows = rows.filter(r => r.consensus >= min);
  }
  if (currentTier !== 'all') {
    rows = rows.filter(r => r.tier === currentTier);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter(r =>
      r.word.includes(q) || r.reading.includes(q) || r.meaning.toLowerCase().includes(q)
    );
  }
  if (currentSort === 'rank') {
    rows = [...rows].sort((a, b) => {
      if (a.rank == null && b.rank == null) return 0;
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    });
  } else if (currentSort === 'word') {
    rows = [...rows].sort((a, b) => a.word.localeCompare(b.word, 'ja'));
  }
  // default: consensus desc, rank asc (already sorted in data)
  return rows;
}

function updateSelectedCount() {
  document.getElementById('selectedNum').textContent = checkedWords.size;
  const btn = document.getElementById('submitBtn');
  btn.disabled = checkedWords.size === 0 || submitting;
}

function render() {
  const rows = getVisibleRows();
  document.getElementById('stats').textContent = 'Showing ' + rows.length + ' words';

  const tbody = document.getElementById('tbody');
  const m = (v) => v ? '<span class="yes">Y</span>' : '<span class="no">\\u00b7</span>';
  const html = rows.map(r => {
    const tierClass = r.tier ? 'tier-' + r.tier : '';
    const cClass = 'c' + r.consensus;
    const isChecked = checkedWords.has(r.word);
    const checkedClass = isChecked ? ' checked' : '';
    const checkedAttr = isChecked ? ' checked' : '';
    return '<tr class="' + checkedClass + '" data-word="' + escapeAttr(r.word) + '">' +
      '<td class="cb-cell"><input type="checkbox"' + checkedAttr + '></td>' +
      '<td><div class="word">' + esc(r.word) + '</div><div class="reading">' + esc(r.reading) + '</div></td>' +
      '<td class="meaning">' + esc(r.meaning) + '</td>' +
      '<td class="rank ' + tierClass + '">' + (r.rank != null ? r.rank : '\\u2014') + '</td>' +
      '<td class="method-cell">' + m(r.brainstorm) + '</td>' +
      '<td class="method-cell">' + m(r.jisho) + '</td>' +
      '<td class="method-cell">' + m(r.textbook) + '</td>' +
      '<td class="method-cell">' + m(r.scene) + '</td>' +
      '<td class="method-cell">' + m(r.web) + '</td>' +
      '<td class="consensus ' + cClass + '">' + r.consensus + '</td>' +
      '</tr>';
  }).join('');
  tbody.innerHTML = html;

  // Update header checkbox state
  const visibleWords = rows.map(r => r.word);
  const allVisibleChecked = visibleWords.length > 0 && visibleWords.every(w => checkedWords.has(w));
  document.getElementById('headerCb').checked = allVisibleChecked;

  updateSelectedCount();
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ── Event: row checkbox clicks (delegated) ──
document.getElementById('tbody').addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;
  const tr = e.target.closest('tr');
  const word = tr.dataset.word;
  if (e.target.checked) {
    checkedWords.add(word);
    tr.classList.add('checked');
  } else {
    checkedWords.delete(word);
    tr.classList.remove('checked');
  }
  updateSelectedCount();
  // Sync header checkbox
  const visibleRows = getVisibleRows();
  const allChecked = visibleRows.length > 0 && visibleRows.every(r => checkedWords.has(r.word));
  document.getElementById('headerCb').checked = allChecked;
});

// ── Event: clicking row toggles checkbox ──
document.getElementById('tbody').addEventListener('click', (e) => {
  if (e.target.type === 'checkbox' || e.target.closest('input')) return;
  const tr = e.target.closest('tr');
  if (!tr) return;
  const cb = tr.querySelector('input[type="checkbox"]');
  if (cb) {
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }
});

// ── Event: header checkbox toggles all visible ──
document.getElementById('headerCb').addEventListener('change', (e) => {
  const visibleRows = getVisibleRows();
  if (e.target.checked) {
    visibleRows.forEach(r => checkedWords.add(r.word));
  } else {
    visibleRows.forEach(r => checkedWords.delete(r.word));
  }
  render();
});

// ── Bulk actions ──
document.getElementById('checkAll').addEventListener('click', () => {
  const visibleRows = getVisibleRows();
  visibleRows.forEach(r => checkedWords.add(r.word));
  render();
});

document.getElementById('uncheckAll').addEventListener('click', () => {
  const visibleRows = getVisibleRows();
  visibleRows.forEach(r => checkedWords.delete(r.word));
  render();
});

// ── Filter buttons ──
document.querySelectorAll('.consensus-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.consensus-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.querySelectorAll('.tier-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tier-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTier = btn.dataset.tier;
    render();
  });
});

// ── Sort buttons ──
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    render();
  });
});

// ── Search ──
document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  render();
});

// ── Submit ──
document.getElementById('submitBtn').addEventListener('click', async () => {
  if (submitting || checkedWords.size === 0) return;
  submitting = true;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  // Build POST body: only include words that are checked
  const wordMap = new Map(DATA.words.map(w => [w.word, w]));
  const selectedWords = [];
  for (const w of checkedWords) {
    const entry = wordMap.get(w);
    if (entry) {
      selectedWords.push({
        word: entry.word,
        reading: entry.reading,
        meaning: entry.meaning,
        rank: entry.rank,
        tier: entry.tier,
        pos: entry.pos,
        consensus: entry.consensus,
      });
    }
  }

  const body = {
    themeId: DATA.themeId,
    areaWord: DATA.areaWord,
    areaReading: DATA.areaReading,
    areaMeaning: DATA.areaMeaning,
    areaRank: DATA.areaRank,
    words: selectedWords,
  };

  try {
    const res = await fetch('http://76.13.220.142:3000/api/theme-pool/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + text);
    }
    const result = await res.json();
    showToast('Submitted ' + selectedWords.length + ' words!', 'success');
    btn.textContent = 'Submitted!';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    btn.textContent = 'Submit';
    btn.disabled = false;
    submitting = false;
  }
});

// Initial render
render();
</script>
</body>
</html>`;

  const htmlPath = join(PROJECT_ROOT, 'tmp', `theme-${config.theme}-review.html`);
  writeFileSync(htmlPath, html);
  return htmlPath;
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  // Step 8: Generate review HTML
  const htmlPath = generateReviewHTML(masterJson, config);
  console.log(`  HTML: ${htmlPath}`);

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
