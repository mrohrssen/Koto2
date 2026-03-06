#!/usr/bin/env node
/**
 * generate-theme-pool.mjs — JPDB enrichment pipeline for theme pool generation.
 *
 * Two modes:
 *
 *   --process <candidates.json> --theme <id> --area-word <word>
 *       --area-reading <reading> --area-meaning <meaning>
 *     Reads candidate words from JSON, enriches via JPDB, filters, assigns roles,
 *     cross-references existing game data, and writes language/themes/<themeId>.json.
 *
 *   --validate <themeId>
 *     Validates an existing theme file and prints results.
 *
 * Called by the generate-theme-pool Claude Code skill after subagent category
 * scanning produces a candidate list. CLI-only — not imported as a library.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBatch, lookupVocab } from './lib/jpdb-helpers.mjs';
import { loadTheme, saveTheme, validateTheme } from './lib/theme-utils.mjs';
import {
  crossReferenceExisting,
  filterCandidates,
  assignRoles,
  computeThemeStats,
} from './lib/theme-pool-helpers.mjs';

// ── CLI parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(flag) {
  return args.includes(flag);
}

function printUsage() {
  console.log(`Usage:
  node scripts/generate-theme-pool.mjs --process <candidates.json> \\
    --theme <id> --area-word <word> --area-reading <reading> --area-meaning <meaning>

  node scripts/generate-theme-pool.mjs --validate <themeId>

Options:
  --process <file>       Path to candidates JSON file (array of {word, source} objects)
  --theme <id>           Theme identifier (e.g. "school")
  --area-word <word>     Japanese area word (e.g. "学校")
  --area-reading <rdg>   Area word reading in hiragana (e.g. "がっこう")
  --area-meaning <eng>   Area word English meaning (e.g. "school")
  --validate <themeId>   Validate an existing theme file
  --help                 Show this help message`);
}

// ── API key loading ──────────────────────────────────────────────────

function loadApiKey() {
  const keyPath = join(process.cwd(), 'data', '.creature-forge-jpdb-key');
  try {
    return readFileSync(keyPath, 'utf8').trim();
  } catch {
    throw new Error(
      `JPDB API key not found at ${keyPath}\n` +
      'Create the file with your JPDB API key, or set JPDB_API_KEY env var.'
    );
  }
}

function getApiKey() {
  if (process.env.JPDB_API_KEY) return process.env.JPDB_API_KEY.trim();
  return loadApiKey();
}

// ── JPDB enrichment ──────────────────────────────────────────────────

/**
 * Enrich candidate words with JPDB data: vid/sid, frequency_rank, reading,
 * meanings, and part_of_speech.
 *
 * @param {Array<{word: string, source?: string}>} candidates
 * @param {string} apiKey
 * @returns {Promise<Array>} Enriched candidates (some may lack rank if JPDB fails)
 */
async function enrichWithJpdb(candidates, apiKey) {
  const words = candidates.map(c => c.word);

  // Step 1: Parse all words to get vid/sid
  console.log(`  Parsing ${words.length} words via JPDB...`);
  let parseResult;
  try {
    parseResult = await parseBatch(words, apiKey, {
      vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
      batchSize: 30,
      interBatchDelayMs: 1000,
    });
  } catch (err) {
    console.warn(`  Warning: JPDB parse failed: ${err.message}`);
    console.warn('  Returning candidates without enrichment.');
    return candidates;
  }

  // Build a map from spelling to parsed entry for matching
  // vocabulary entries are arrays: [spelling, reading, vid, sid, meanings]
  const parsedMap = new Map();
  for (const entry of parseResult.vocabulary) {
    const spelling = entry[0];
    // Keep only the first match per spelling (dedup)
    if (!parsedMap.has(spelling)) {
      parsedMap.set(spelling, {
        spelling: entry[0],
        reading: entry[1],
        vid: entry[2],
        sid: entry[3],
        meanings: entry[4] || [],
      });
    }
  }

  // Match each candidate to its parsed entry
  const enriched = candidates.map(c => ({
    ...c,
    _parsed: parsedMap.get(c.word) || null,
  }));

  // Collect valid vid/sid pairs for frequency + POS lookup
  const validEntries = enriched.filter(c => c._parsed?.vid != null);
  if (validEntries.length === 0) {
    console.warn('  Warning: No words parsed successfully. Returning unenriched candidates.');
    return candidates.map(c => ({
      ...c,
      reading: '',
      meaning: '',
      rank: null,
      posTag: null,
    }));
  }

  const vidSidPairs = validEntries.map(c => [c._parsed.vid, c._parsed.sid]);

  // Step 2: Lookup frequency_rank + part_of_speech for valid entries
  console.log(`  Looking up frequency data for ${vidSidPairs.length} parsed words...`);
  let lookupResult;
  try {
    lookupResult = await lookupVocab(vidSidPairs, apiKey,
      ['spelling', 'reading', 'frequency_rank', 'meanings', 'part_of_speech'],
      { batchSize: 500, interBatchDelayMs: 1000 }
    );
  } catch (err) {
    console.warn(`  Warning: JPDB lookup failed: ${err.message}`);
    console.warn('  Returning candidates with partial enrichment (parse only).');
    return enriched.map(c => {
      const p = c._parsed;
      return {
        word: c.word,
        source: c.source,
        reading: p?.reading || '',
        meaning: p?.meanings?.length ? p.meanings.flat().join('; ') : '',
        rank: null,
        posTag: null,
      };
    });
  }

  // Build lookup result map indexed by valid entry position
  const lookupMap = new Map();
  for (let i = 0; i < validEntries.length; i++) {
    const info = lookupResult.vocabulary_info[i];
    // Fields: [spelling, reading, frequency_rank, meanings, part_of_speech]
    lookupMap.set(validEntries[i].word, {
      spelling: info[0],
      reading: info[1],
      rank: info[2],
      meanings: info[3] || [],
      posTag: Array.isArray(info[4]) ? info[4][0] : info[4],
    });
  }

  // Merge enrichment data back onto candidates
  return enriched.map(c => {
    const lookup = lookupMap.get(c.word);
    const parsed = c._parsed;

    if (lookup) {
      return {
        word: c.word,
        source: c.source,
        reading: lookup.reading || parsed?.reading || '',
        meaning: lookup.meanings?.length
          ? lookup.meanings.flat().join('; ')
          : (parsed?.meanings?.length ? parsed.meanings.flat().join('; ') : ''),
        rank: lookup.rank,
        posTag: lookup.posTag || null,
      };
    }

    // Parsed but no lookup data
    if (parsed) {
      return {
        word: c.word,
        source: c.source,
        reading: parsed.reading || '',
        meaning: parsed.meanings?.length ? parsed.meanings.flat().join('; ') : '',
        rank: null,
        posTag: null,
      };
    }

    // No JPDB data at all
    return {
      word: c.word,
      source: c.source,
      reading: '',
      meaning: '',
      rank: null,
      posTag: null,
    };
  });
}

/**
 * Look up a single word's frequency rank via JPDB.
 * Returns null if the word cannot be parsed or looked up.
 */
async function lookupAreaWordRank(areaWord, apiKey) {
  try {
    const parseResult = await parseBatch([areaWord], apiKey, {
      vocabularyFields: ['spelling', 'reading', 'vid', 'sid'],
      batchSize: 1,
      interBatchDelayMs: 0,
    });

    // Find matching entry
    const entry = parseResult.vocabulary.find(v => v[0] === areaWord);
    if (!entry || entry[2] == null) return null;

    const lookupResult = await lookupVocab([[entry[2], entry[3]]], apiKey,
      ['frequency_rank'],
      { batchSize: 1, interBatchDelayMs: 0 }
    );

    return lookupResult.vocabulary_info[0]?.[0] ?? null;
  } catch (err) {
    console.warn(`  Warning: Could not look up area word rank: ${err.message}`);
    return null;
  }
}

// ── Process mode ─────────────────────────────────────────────────────

async function processMode() {
  const candidatesFile = getArg('--process');
  const themeId = getArg('--theme');
  const areaWord = getArg('--area-word');
  const areaReading = getArg('--area-reading');
  const areaMeaning = getArg('--area-meaning');

  // Validate required args
  const missing = [];
  if (!candidatesFile) missing.push('--process <file>');
  if (!themeId) missing.push('--theme');
  if (!areaWord) missing.push('--area-word');
  if (!areaReading) missing.push('--area-reading');
  if (!areaMeaning) missing.push('--area-meaning');

  if (missing.length > 0) {
    console.error(`Error: Missing required arguments: ${missing.join(', ')}`);
    console.error('');
    printUsage();
    process.exit(1);
  }

  // Load candidates
  let candidates;
  try {
    const raw = readFileSync(candidatesFile, 'utf8');
    candidates = JSON.parse(raw);
  } catch (err) {
    console.error(`Error: Cannot read candidates file: ${candidatesFile}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    console.error('Error: Candidates file must contain a non-empty JSON array.');
    process.exit(1);
  }

  console.log(`\nProcessing theme: ${themeId} (${areaWord})`);
  console.log(`Input: ${candidates.length} candidate words`);

  // Step 1: Get API key
  let apiKey;
  try {
    apiKey = getApiKey();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Step 2: JPDB enrichment
  console.log('\nStep 1/6: JPDB enrichment...');
  const enriched = await enrichWithJpdb(candidates, apiKey);
  const enrichedCount = enriched.filter(c => c.rank != null).length;
  console.log(`  Enriched ${enrichedCount}/${enriched.length} words with frequency data`);

  // Step 3: Filter (rank > 30000, null rank, dedup)
  console.log('\nStep 2/6: Filtering...');
  const filtered = filterCandidates(enriched);
  console.log(`  ${enriched.length} → ${filtered.length} words after filtering`);

  // Step 4: Assign roles based on POS
  console.log('\nStep 3/6: Assigning roles...');
  const withRoles = assignRoles(filtered);

  // Step 5: Cross-reference existing game data
  console.log('\nStep 4/6: Cross-referencing existing data...');
  const crossReffed = crossReferenceExisting(withRoles);
  const usedCount = crossReffed.filter(c => c.existingUses.length > 0).length;
  console.log(`  ${usedCount} words already used in game data`);

  // Step 6: Look up area word rank
  console.log('\nStep 5/6: Looking up area word rank...');
  const areaRank = await lookupAreaWordRank(areaWord, apiKey);
  console.log(`  Area word "${areaWord}" rank: ${areaRank ?? 'unknown'}`);

  // Step 7: Compute stats
  console.log('\nStep 6/6: Computing theme stats...');
  const { avgRank, computedStage, roleCounts } = computeThemeStats(crossReffed);

  // Step 8: Build theme object
  const theme = {
    themeId,
    areaWord,
    areaReading,
    areaMeaning,
    areaRank,
    avgRank,
    computedStage,
    generatedAt: new Date().toISOString().slice(0, 10),
    words: crossReffed.map(c => ({
      word: c.word,
      reading: c.reading || '',
      meaning: c.meaning || '',
      rank: c.rank,
      roles: c.roles || [],
      source: c.source || 'unknown',
      assigned: null,
      existingUses: c.existingUses || [],
    })),
  };

  // Step 9: Validate
  const errors = validateTheme(theme);
  if (errors.length > 0) {
    console.error('\nValidation errors:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // Step 10: Save
  const filePath = saveTheme(theme);
  console.log(`\nSaved: ${filePath}`);

  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Theme: ${themeId} (${areaWord} — ${areaMeaning})`);
  console.log(`Pool: ${theme.words.length} words`);
  console.log(`Avg rank: ${avgRank.toLocaleString()} → Stage ${computedStage ?? '?'}`);
  console.log(`Area word rank: ${areaRank?.toLocaleString() ?? 'unknown'}`);

  const roleStr = Object.entries(roleCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([role, count]) => `${count} ${role}`)
    .join(', ');
  console.log(`Roles: ${roleStr}`);

  if (usedCount > 0) {
    console.log(`Already used: ${usedCount} words have existing assignments`);
  }
  console.log(`${'='.repeat(50)}`);
}

// ── Validate mode ────────────────────────────────────────────────────

function validateMode() {
  const themeId = getArg('--validate');
  if (!themeId) {
    console.error('Error: --validate requires a theme ID');
    console.error('');
    printUsage();
    process.exit(1);
  }

  const theme = loadTheme(themeId);
  if (!theme) {
    console.error(`Error: Theme not found: ${themeId}`);
    console.error(`  Expected at: language/themes/${themeId}.json`);
    process.exit(1);
  }

  const errors = validateTheme(theme);
  if (errors.length > 0) {
    console.error(`Validation FAILED for theme "${themeId}":`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`Theme "${themeId}" is valid.`);
  console.log(`  Words: ${theme.words?.length ?? 0}`);
  console.log(`  Avg rank: ${theme.avgRank ?? 'N/A'}`);
  console.log(`  Stage: ${theme.computedStage ?? 'N/A'}`);

  if (theme.words?.length > 0) {
    const { roleCounts } = computeThemeStats(theme.words);
    const roleStr = Object.entries(roleCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([role, count]) => `${count} ${role}`)
      .join(', ');
    console.log(`  Roles: ${roleStr}`);

    const assigned = theme.words.filter(w => w.assigned != null).length;
    console.log(`  Assigned: ${assigned}/${theme.words.length}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

if (hasFlag('--help') || args.length === 0) {
  printUsage();
  process.exit(args.length === 0 ? 1 : 0);
}

if (hasFlag('--validate')) {
  validateMode();
} else if (hasFlag('--process')) {
  processMode().catch(err => {
    console.error(`\nFatal error: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error('Error: Must specify --process or --validate mode.');
  console.error('');
  printUsage();
  process.exit(1);
}
