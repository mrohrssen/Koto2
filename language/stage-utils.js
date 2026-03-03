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
