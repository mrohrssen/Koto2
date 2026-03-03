#!/usr/bin/env node

/**
 * forge-discovery.mjs — Shared stage-aware word discovery for all forge skills.
 *
 * Reads semantic category files, filters by stage + POS, excludes already-used
 * words, and returns ranked candidates ready for creature/move/item/area/npc design.
 *
 * Usage (CLI):
 *   node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 5
 *   node scripts/forge-discovery.mjs --gaps creature
 *
 * Usage (library):
 *   import { discoverWords, getStageGaps } from './scripts/forge-discovery.mjs';
 *   const words = await discoverWords({ contentType: 'creature-base', targetStage: 3, limit: 10 });
 *   const gaps = getStageGaps('creature');
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Content type → category file mapping ────────────────────────────

const CATEGORY_MAP = {
  'creature-base':    ['animals.json', 'objects.json', 'nature.json'],
  'creature-modifier': ['descriptors.json', 'emotions.json', 'colors.json'],
  'move':             ['actions.json', 'movement.json', 'combat.json'],
  'item-consumable':  ['foods.json'],
  'item-equipment':   ['objects.json'],
  'item-crafting':    ['nature.json', 'objects.json'],
  'area':             ['locations.json', 'nature.json'],
  'npc':              ['occupations.json', 'social.json'],
};

// POS filters for WK words (only applied to WK words; non-WK words pass through)
const POS_FILTER = {
  'creature-base':    ['noun', 'independent noun', 'proper noun'],
  'creature-modifier': ['adjective', 'い adjective', 'な adjective', 'の adjective'],
  'move':             ['godan verb', 'ichidan verb', 'する verb', 'transitive verb', 'intransitive verb'],
  'item-consumable':  ['noun', 'independent noun'],
  'item-equipment':   ['noun', 'independent noun'],
  'item-crafting':    ['noun', 'independent noun'],
  'area':             ['noun', 'independent noun', 'proper noun'],
  'npc':              ['noun', 'independent noun', 'proper noun'],
};

// Targets per stage for gap analysis
const STAGE_TARGETS = {
  creature: 50,
  move: 100,
  item: 25,
  area: 5,
  npc: 14,
};

// ── Lazy-loaded caches ──────────────────────────────────────────────

let _stageDefs = null;
let _wkWordMap = null;     // Map<word, { level, partsOfSpeech }>
let _usedWords = null;     // Set<word>
let _categoryCache = {};   // filename → array

function loadStageDefs() {
  if (!_stageDefs) {
    _stageDefs = JSON.parse(readFileSync(join(ROOT, 'data', 'stage-definitions.json'), 'utf8'));
  }
  return _stageDefs;
}

function loadWkMap() {
  if (!_wkWordMap) {
    const wkData = JSON.parse(readFileSync(join(ROOT, 'language', 'dictionaries', 'wanikani-vocab.json'), 'utf8'));
    _wkWordMap = new Map();
    for (const v of wkData.vocabulary) {
      _wkWordMap.set(v.characters, {
        level: v.level,
        partsOfSpeech: v.partsOfSpeech || [],
      });
    }
  }
  return _wkWordMap;
}

function loadCategoryFile(filename) {
  if (!_categoryCache[filename]) {
    const path = join(ROOT, 'language', 'categories', filename);
    try {
      _categoryCache[filename] = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      _categoryCache[filename] = [];
    }
  }
  return _categoryCache[filename];
}

function loadJsonSafe(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) return Object.values(data);
    return [];
  } catch {
    return [];
  }
}

/**
 * Collect all words already used across game data files.
 * Returns a Set of Japanese word strings.
 */
function loadUsedWords() {
  if (_usedWords) return _usedWords;

  _usedWords = new Set();

  // Creatures: baseWord + modifier.word
  const creatures = loadJsonSafe(join(ROOT, 'data', 'creatures.json'));
  for (const c of creatures) {
    if (c.baseWord) _usedWords.add(c.baseWord);
    if (c.modifier?.word) _usedWords.add(c.modifier.word);
  }

  // Moves: name (Japanese word)
  const moves = loadJsonSafe(join(ROOT, 'data', 'moves.json'));
  for (const m of moves) {
    if (m.name) _usedWords.add(m.name);
  }

  // Items: component words
  const items = loadJsonSafe(join(ROOT, 'data', 'items.json'));
  for (const item of items) {
    for (const comp of (item.components || [])) {
      if (comp.word) _usedWords.add(comp.word);
    }
  }

  // Areas: sub-area modifier and location words
  const areas = loadJsonSafe(join(ROOT, 'data', 'new-areas-staging.json'));
  for (const area of areas) {
    for (const sa of (area.subAreas || [])) {
      if (sa.modifier?.word) _usedWords.add(sa.modifier.word);
      if (sa.location?.word) _usedWords.add(sa.location.word);
    }
  }

  // NPCs: baseWord + modifier.word
  const npcsStaging = loadJsonSafe(join(ROOT, 'data', 'new-npcs-staging.json'));
  for (const npc of npcsStaging) {
    if (npc.baseWord) _usedWords.add(npc.baseWord);
    if (npc.modifier?.word) _usedWords.add(npc.modifier.word);
  }

  // NPCs (live): check npcs.json too (object keyed by id)
  const npcsLive = loadJsonSafe(join(ROOT, 'data', 'npcs.json'));
  for (const npc of npcsLive) {
    if (npc.baseWord) _usedWords.add(npc.baseWord);
    if (npc.modifier?.word) _usedWords.add(npc.modifier.word);
  }

  return _usedWords;
}

// ── Stage computation ───────────────────────────────────────────────

/**
 * Get the stage for a word based on WK level or JPDB rank.
 * WK words: stage = Math.ceil(wkLevel / 6)
 * Non-WK words: lowest stage where jpdbKanaCap >= rank
 */
function getWordStage(word, rank) {
  const wkMap = loadWkMap();
  const wkEntry = wkMap.get(word);
  if (wkEntry) {
    return { stage: Math.ceil(wkEntry.level / 6), wkLevel: wkEntry.level };
  }

  if (rank == null) return { stage: null, wkLevel: null };

  const stages = loadStageDefs().stages;
  for (const s of stages) {
    if (s.jpdbKanaCap === null) return { stage: s.stage, wkLevel: null };
    if (rank <= s.jpdbKanaCap) return { stage: s.stage, wkLevel: null };
  }
  return { stage: 10, wkLevel: null };
}

/**
 * Check if a WK word matches the POS filter for a content type.
 * Non-WK words always pass (category files already provide semantic filtering).
 */
function matchesPosFilter(word, contentType) {
  const wkMap = loadWkMap();
  const wkEntry = wkMap.get(word);
  if (!wkEntry) return true; // not in WK → pass through

  const allowedPos = POS_FILTER[contentType];
  if (!allowedPos) return true; // no filter defined → pass through

  // Check if any of the word's POS tags are in the allowed list
  return wkEntry.partsOfSpeech.some(pos => allowedPos.includes(pos));
}

// ── Main discovery function ─────────────────────────────────────────

/**
 * Discover candidate words for a given content type and stage.
 *
 * @param {Object} opts
 * @param {string} opts.contentType - One of the CATEGORY_MAP keys
 * @param {number} opts.targetStage - Max stage to include (1-10)
 * @param {number} opts.limit - Max results to return
 * @returns {Promise<Array<{word, reading, meaning, rank, stage, source, wkLevel}>>}
 */
export async function discoverWords({ contentType, targetStage, limit = 20 }) {
  const categoryFiles = CATEGORY_MAP[contentType];
  if (!categoryFiles) return [];

  const usedWords = loadUsedWords();
  const seen = new Set(); // dedup across multiple category files
  const candidates = [];

  for (const filename of categoryFiles) {
    const words = loadCategoryFile(filename);
    for (const entry of words) {
      // Skip duplicates across categories
      if (seen.has(entry.word)) continue;
      seen.add(entry.word);

      // Skip already-used words
      if (usedWords.has(entry.word)) continue;

      // Compute stage
      const { stage, wkLevel } = getWordStage(entry.word, entry.rank);
      if (stage === null) continue;
      if (stage > targetStage) continue;

      // POS filter (only for WK words)
      if (!matchesPosFilter(entry.word, contentType)) continue;

      candidates.push({
        word: entry.word,
        reading: entry.reading,
        meaning: entry.meaning,
        rank: entry.rank,
        stage,
        source: filename.replace('.json', ''),
        wkLevel,
      });
    }
  }

  // Sort by rank (most common first) and limit
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.slice(0, limit);
}

// ── Stage gaps analysis ─────────────────────────────────────────────

/**
 * Get per-stage content counts and deficit vs targets.
 *
 * @param {string} type - 'creature' | 'move' | 'item' | 'area' | 'npc'
 * @returns {Array<{stage: number, count: number, target: number, deficit: number}>}
 */
export function getStageGaps(type) {
  const target = STAGE_TARGETS[type] || 0;

  // Count existing content per stage
  const counts = new Array(10).fill(0);

  switch (type) {
    case 'creature': {
      const creatures = loadJsonSafe(join(ROOT, 'data', 'creatures.json'));
      for (const c of creatures) {
        if (c.stage >= 1 && c.stage <= 10) counts[c.stage - 1]++;
      }
      break;
    }
    case 'move': {
      const moves = loadJsonSafe(join(ROOT, 'data', 'moves.json'));
      for (const m of moves) {
        if (m.stage >= 1 && m.stage <= 10) counts[m.stage - 1]++;
      }
      break;
    }
    case 'item': {
      const items = loadJsonSafe(join(ROOT, 'data', 'items.json'));
      for (const i of items) {
        if (i.stage >= 1 && i.stage <= 10) counts[i.stage - 1]++;
      }
      break;
    }
    case 'area': {
      const areas = loadJsonSafe(join(ROOT, 'data', 'new-areas-staging.json'));
      for (const a of areas) {
        if (a.stage >= 1 && a.stage <= 10) counts[a.stage - 1]++;
      }
      break;
    }
    case 'npc': {
      const npcs = loadJsonSafe(join(ROOT, 'data', 'new-npcs-staging.json'));
      for (const n of npcs) {
        if (n.stage >= 1 && n.stage <= 10) counts[n.stage - 1]++;
      }
      break;
    }
  }

  return Array.from({ length: 10 }, (_, i) => ({
    stage: i + 1,
    count: counts[i],
    target,
    deficit: target - counts[i],
  }));
}

// ── CLI mode ────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      type:  { type: 'string', short: 't' },
      stage: { type: 'string', short: 's' },
      limit: { type: 'string', short: 'l' },
      gaps:  { type: 'string', short: 'g' },
    },
    strict: false,
  });

  // Gap analysis mode
  if (values.gaps) {
    const gaps = getStageGaps(values.gaps);
    console.log(`\nStage gaps for: ${values.gaps}`);
    console.log('─'.repeat(45));
    console.log('Stage  Count  Target  Deficit');
    console.log('─'.repeat(45));
    for (const g of gaps) {
      const deficit = g.deficit > 0 ? `+${g.deficit}` : `${g.deficit}`;
      console.log(
        `  ${String(g.stage).padStart(2)}    ${String(g.count).padStart(4)}    ${String(g.target).padStart(4)}    ${deficit.padStart(5)}`
      );
    }
    console.log('─'.repeat(45));
    const totalCount = gaps.reduce((s, g) => s + g.count, 0);
    const totalTarget = gaps.reduce((s, g) => s + g.target, 0);
    const totalDeficit = totalTarget - totalCount;
    console.log(
      `  All   ${String(totalCount).padStart(4)}    ${String(totalTarget).padStart(4)}    ${(totalDeficit > 0 ? '+' : '') + totalDeficit}`
    );
    return;
  }

  // Word discovery mode
  const contentType = values.type;
  const targetStage = parseInt(values.stage || '5', 10);
  const limit = parseInt(values.limit || '20', 10);

  if (!contentType) {
    console.error('Usage:');
    console.error('  node scripts/forge-discovery.mjs --type creature-base --stage 3 --limit 5');
    console.error('  node scripts/forge-discovery.mjs --gaps creature');
    console.error('');
    console.error('Content types:', Object.keys(CATEGORY_MAP).join(', '));
    console.error('Gap types:', Object.keys(STAGE_TARGETS).join(', '));
    process.exit(1);
  }

  const results = await discoverWords({ contentType, targetStage, limit });

  console.log(`\nDiscovery: ${contentType} (stage <= ${targetStage}, limit ${limit})`);
  console.log('─'.repeat(70));
  console.log('Rank   Stage  WK   Word        Reading       Meaning');
  console.log('─'.repeat(70));

  for (const r of results) {
    const wk = r.wkLevel ? `L${String(r.wkLevel).padStart(2)}` : '  -';
    console.log(
      `${String(r.rank).padStart(5)}   S${r.stage}    ${wk}  ${r.word.padEnd(10)}  ${r.reading.padEnd(12)}  ${r.meaning}`
    );
  }

  console.log('─'.repeat(70));
  console.log(`${results.length} candidates found`);
}

// Run CLI if invoked directly (compare resolved paths to avoid triggering on import)
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && (
  join(process.argv[1]) === __filename ||
  join(process.cwd(), process.argv[1]) === __filename
);

if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
