import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load data at module init ────────────────────────────────────────

const stageDefsPath = join(__dirname, '..', 'data', 'stage-definitions.json');
const stageDefs = JSON.parse(readFileSync(stageDefsPath, 'utf8'));

const wkVocabPath = join(__dirname, 'dictionaries', 'wanikani-vocab.json');
const wkData = JSON.parse(readFileSync(wkVocabPath, 'utf8'));

// Build WK word → level lookup map
const wkWordToLevel = new Map();
for (const v of wkData.vocabulary) {
  wkWordToLevel.set(v.characters, v.level);
}

// ── getWordStrictStage ──────────────────────────────────────────────

/**
 * Get the strict stage for a word based on WK level or JPDB rank.
 * WK words: stage = Math.ceil(wkLevel / 6)
 * Non-WK words: find the lowest stage whose jpdbKanaCap >= rank
 * @param {string} word - Japanese word (kanji, hiragana, or katakana)
 * @param {number|null} jpdbRank - JPDB frequency rank (lower = more common)
 * @returns {number|null} Stage 1-10, or null if unassignable
 */
export function getWordStrictStage(word, jpdbRank) {
  // Check WK first
  const wkLevel = wkWordToLevel.get(word);
  if (wkLevel != null) {
    return Math.ceil(wkLevel / 6);
  }

  // Fall back to JPDB rank
  if (jpdbRank == null) return null;

  for (const s of stageDefs.stages) {
    if (s.jpdbKanaCap === null) return s.stage; // Stage 10: no cap
    if (jpdbRank <= s.jpdbKanaCap) return s.stage;
  }
  return 10;
}

// ── getContentWords ─────────────────────────────────────────────────

/**
 * Extract all vocabulary words from a game content object.
 * @param {Object} obj - The game object (creature, move, item, area)
 * @param {string} type - 'creature' | 'move' | 'item' | 'area'
 * @returns {Array<{word: string, rank: number, source: string}>}
 */
export function getContentWords(obj, type) {
  const words = [];

  switch (type) {
    case 'creature':
      words.push({ word: obj.baseWord, rank: obj.baseRank, source: 'baseWord' });
      if (obj.modifier) {
        words.push({ word: obj.modifier.word, rank: obj.modifier.rank, source: 'modifier' });
      }
      break;
    case 'move':
      words.push({ word: obj.name, rank: obj.rank, source: 'name' });
      break;
    case 'item':
      for (const comp of (obj.components || [])) {
        words.push({ word: comp.word, rank: comp.rank, source: 'component' });
      }
      break;
    case 'area':
      for (const vw of (obj.vocabWords || [])) {
        words.push({ word: vw.word, rank: vw.rank, source: 'areaVocab' });
      }
      break;
  }

  return words;
}

// ── suggestStage ────────────────────────────────────────────────────

/**
 * Suggest the best stage for a content object based on its vocabulary.
 * Finds the lowest stage where the outlier percentage stays within budget.
 * @param {Object} obj - The game object (creature, move, item, area)
 * @param {string} type - 'creature' | 'move' | 'item' | 'area'
 * @returns {{ stage: number, outlierPercent: number, medianRank: number, wordStages: Array }}
 */
export function suggestStage(obj, type) {
  const words = getContentWords(obj, type);

  // Score each word
  const wordStages = words.map(w => ({
    word: w.word,
    rank: w.rank,
    source: w.source,
    strictStage: getWordStrictStage(w.word, w.rank),
  }));

  // Only count words with a non-null strict stage
  const scorable = wordStages.filter(ws => ws.strictStage != null);

  if (scorable.length === 0) {
    return { stage: 1, outlierPercent: 0, medianRank: 0, wordStages: [] };
  }

  const maxOutlier = stageDefs.maxOutlierPercent;

  // Find the lowest stage where outlier % <= budget
  for (const s of stageDefs.stages) {
    const outliers = scorable.filter(ws => ws.strictStage > s.stage).length;
    const pct = Math.round((outliers / scorable.length) * 100);
    if (pct <= maxOutlier) {
      return {
        stage: s.stage,
        outlierPercent: pct,
        medianRank: calcMedianRank(wordStages),
        wordStages,
      };
    }
  }

  // Fallback: no stage fit within budget (should not happen since stage 10
  // captures everything, but defensive)
  return { stage: 10, outlierPercent: 0, medianRank: calcMedianRank(wordStages), wordStages };
}

/**
 * Calculate the median of all word ranks, excluding rank 0 or null.
 * @param {Array<{rank: number}>} wordStages
 * @returns {number}
 */
function calcMedianRank(wordStages) {
  const ranks = wordStages
    .map(ws => ws.rank)
    .filter(r => r != null && r > 0)
    .sort((a, b) => a - b);

  if (ranks.length === 0) return 0;
  const mid = Math.floor(ranks.length / 2);
  if (ranks.length % 2 === 1) return ranks[mid];
  return (ranks[mid - 1] + ranks[mid]) / 2;
}
