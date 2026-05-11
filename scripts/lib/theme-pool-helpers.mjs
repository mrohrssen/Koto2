/**
 * theme-pool-helpers.mjs — Pure functions for processing theme pool candidates.
 *
 * Cross-references existing game data, filters/deduplicates, assigns roles by
 * POS tag, and computes aggregate stats. No JPDB API calls.
 *
 * Usage:
 *   import { crossReferenceExisting, filterCandidates, assignRoles, computeThemeStats }
 *     from './scripts/lib/theme-pool-helpers.mjs';
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { computeStageFromAvgRank } from '../../language/stage-utils.js';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Safely load and parse a JSON file. Returns [] for arrays, {} for objects
 * on any error (file not found, parse error, etc.).
 * @param {string} filePath - Absolute path to JSON file
 * @param {*} fallback - Fallback value on error (default: [])
 * @returns {*} Parsed JSON or fallback
 */
function loadJsonSafe(filePath, fallback = []) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Convert an NPC data structure (object keyed by id, or array) to a flat array.
 * @param {Object|Array} data - Raw parsed JSON from npcs.json or new-npcs-staging.json
 * @returns {Array} Array of NPC objects
 */
function normalizeNpcData(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data);
  return [];
}

// ── POS classification ──────────────────────────────────────────────

const NOUN_TAGS = new Set(['noun', 'independent noun', 'proper noun']);
const ADJ_TAGS = new Set(['adjective', 'い adjective', 'な adjective', 'の adjective']);
const VERB_TAGS = new Set([
  'godan verb', 'ichidan verb', 'する verb',
  'transitive verb', 'intransitive verb', 'verb',
]);

function classifyPos(posTag) {
  if (!posTag) return 'unknown';
  const lower = posTag.toLowerCase();
  if (NOUN_TAGS.has(lower)) return 'noun';
  if (ADJ_TAGS.has(lower)) return 'adjective';
  if (VERB_TAGS.has(lower)) return 'verb';
  return 'unknown';
}

// ── Data loading (lazy, cached) ─────────────────────────────────────

let _existingIndex = null;

/**
 * Build an index of all words currently used in game data.
 * Returns a Map<word, string[]> where each value is an array of usage tags
 * like 'creature:kamedor', 'move:hashiru', etc.
 */
function buildExistingIndex() {
  if (_existingIndex) return _existingIndex;

  const cwd = process.cwd();
  const index = new Map();

  function add(word, usage) {
    if (!word) return;
    if (!index.has(word)) index.set(word, []);
    index.get(word).push(usage);
  }

  // Creatures: name and modifier.word
  const creatures = loadJsonSafe(join(cwd, 'data', 'creatures.json'));
  for (const c of creatures) {
    add(c.name, `creature:${c.id}`);
    if (c.modifier?.word) {
      add(c.modifier.word, `creature-mod:${c.id}`);
    }
  }

  // Moves: name
  const moves = loadJsonSafe(join(cwd, 'data', 'moves.json'));
  for (const m of moves) {
    add(m.name, `move:${m.id}`);
  }

  // Items: components[].word
  const items = loadJsonSafe(join(cwd, 'data', 'items.json'));
  for (const item of items) {
    for (const comp of (item.components || [])) {
      add(comp.word, `item:${item.id}`);
    }
  }

  // Areas + staging: subAreas modifier.word and location.word
  const areas = [
    ...loadJsonSafe(join(cwd, 'data', 'areas.json')),
    ...loadJsonSafe(join(cwd, 'data', 'new-areas-staging.json')),
  ];
  for (const area of areas) {
    for (const sa of (area.subAreas || [])) {
      if (sa.modifier?.word) {
        add(sa.modifier.word, `area-mod:${sa.id}`);
      }
      if (sa.location?.word) {
        add(sa.location.word, `area-loc:${sa.id}`);
      }
    }
  }

  // NPCs: npcs.json (object) + new-npcs-staging.json (array)
  const npcsRaw = loadJsonSafe(join(cwd, 'data', 'npcs.json'), {});
  const npcsStaging = loadJsonSafe(join(cwd, 'data', 'new-npcs-staging.json'));
  const allNpcs = [
    ...normalizeNpcData(npcsRaw),
    ...normalizeNpcData(npcsStaging),
  ];
  for (const npc of allNpcs) {
    if (npc.name) {
      add(npc.name, `npc:${npc.id}`);
    }
  }

  _existingIndex = index;
  return index;
}

// ── Exported functions ──────────────────────────────────────────────

/**
 * Annotate each candidate with an `existingUses` array showing where the
 * word is already used in game data. Does NOT filter — only annotates.
 *
 * @param {Array<{word: string, ...}>} candidates - Word candidates to annotate
 * @returns {Array} Same candidates with `existingUses` added
 */
export function crossReferenceExisting(candidates) {
  const index = buildExistingIndex();

  return candidates.map(c => ({
    ...c,
    existingUses: index.get(c.word) ? [...index.get(c.word)] : [],
  }));
}

/**
 * Filter and deduplicate candidates:
 * - Remove rank > 30000
 * - Remove null/undefined rank
 * - Deduplicate by word (keep lowest rank)
 * - Sort by rank ascending
 *
 * @param {Array<{word: string, rank: number, ...}>} candidates
 * @returns {Array} Filtered, deduplicated, sorted candidates
 */
export function filterCandidates(candidates) {
  // First filter by rank
  const valid = candidates.filter(c => c.rank != null && c.rank <= 30000);

  // Deduplicate by word — keep the entry with the lowest rank
  const seen = new Map();
  for (const c of valid) {
    const existing = seen.get(c.word);
    if (!existing || c.rank < existing.rank) {
      seen.set(c.word, c);
    }
  }

  // Sort by rank ascending
  return [...seen.values()].sort((a, b) => a.rank - b.rank);
}

/**
 * Assign suggested roles based on POS tags.
 *
 * - Nouns   -> creature, item, npc, sub-area
 * - Adjectives -> modifier
 * - Verbs   -> move, creature
 * - Unknown -> creature, item (safe defaults)
 *
 * Each candidate gets a `roles` array with unique values.
 *
 * @param {Array<{word: string, posTag?: string, ...}>} candidates
 * @returns {Array} Candidates with `roles` array added
 */
export function assignRoles(candidates) {
  return candidates.map(c => {
    const classification = classifyPos(c.posTag);
    let roles;

    switch (classification) {
      case 'noun':
        roles = ['creature', 'item', 'npc', 'sub-area'];
        break;
      case 'adjective':
        roles = ['modifier'];
        break;
      case 'verb':
        roles = ['move', 'creature'];
        break;
      default: // unknown
        roles = ['creature', 'item'];
        break;
    }

    return {
      ...c,
      roles: [...new Set(roles)],
    };
  });
}

/**
 * Compute aggregate stats for a set of theme words.
 *
 * @param {Array<{rank: number, roles?: string[]}>} words
 * @returns {{ avgRank: number, computedStage: number|null, roleCounts: Object }}
 */
export function computeThemeStats(words) {
  // avgRank
  const ranks = words.map(w => w.rank).filter(r => r != null);
  const avgRank = ranks.length > 0
    ? Math.round(ranks.reduce((sum, r) => sum + r, 0) / ranks.length)
    : 0;

  // computedStage
  const computedStage = ranks.length > 0 ? computeStageFromAvgRank(avgRank) : null;

  // roleCounts
  const roleCounts = {};
  for (const w of words) {
    if (!Array.isArray(w.roles)) continue;
    for (const role of w.roles) {
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    }
  }

  return { avgRank, computedStage, roleCounts };
}
