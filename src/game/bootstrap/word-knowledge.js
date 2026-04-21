import fs from 'fs';
import path from 'path';
import { getDeckCards, createCard } from '../internal-srs.js';
import { State } from 'ts-fsrs';
import { loadWordDictionary } from '../word-dictionary.js';
import { resolveLiveDictPath } from '../live-dict-path.js';
import { getDataDir } from '../../data-dir.js';

// Overlay data (creatures.json, moves.json, ...) lives in the repo.
const OVERLAY_DIR = path.join(process.cwd(), 'data');

let _wordDict = null;
function getWordDict() {
  if (!_wordDict) {
    _wordDict = loadWordDictionary({
      overlayDir: OVERLAY_DIR,
      liveDictPath: resolveLiveDictPath(),
    });
  }
  return _wordDict;
}

/** Clear the in-memory dictionary cache so the next read reloads from disk. */
export function invalidateWordDict() {
  _wordDict = null;
}

/**
 * Look up the primary English meaning for a Japanese word.
 * @param {string} baseForm
 * @returns {string} English meaning or empty string
 */
export function lookupMeaning(baseForm) {
  const dict = getWordDict();
  const entry = dict.get(baseForm);
  if (!entry?.definitions?.length) return '';
  const primary = entry.definitions.find(d => d.primary);
  return primary?.en || entry.definitions[0]?.en || '';
}

/**
 * Look up the hiragana reading for a Japanese word.
 * @param {string} baseForm
 * @returns {string} Hiragana reading, or the word itself if not found
 */
export function lookupReading(baseForm) {
  const dict = getWordDict();
  const entry = dict.get(baseForm);
  return entry?.reading || baseForm;
}

const EXPOSURE_THRESHOLD = 5;

/**
 * Expose words to the FSRS SRS system.
 * Registers exposure for each word. Creates a vocab SRS card after
 * EXPOSURE_THRESHOLD exposures (matching the route handler logic).
 *
 * @param {string} userId
 * @param {Array<{word: string, meaning?: string}>} words
 * @returns {Array<{word: string, meaning: string, exposures: number}>} Newly mastered words (crossed threshold this call)
 */
export function exposeWords(userId, words) {
  if (!Array.isArray(words) || words.length === 0) return [];

  const wk = loadWordKnowledge(userId) || createWordKnowledge(userId);
  const newlyMastered = [];

  for (const entry of words) {
    const word = typeof entry === 'string' ? entry : entry?.word;
    const meaning = typeof entry === 'string' ? '' : (entry?.meaning || '');
    if (typeof word !== 'string' || word.length === 0) continue;

    const wasBelowThreshold = !wk.seen[word] || wk.seen[word].exposures < EXPOSURE_THRESHOLD;

    registerExposure(wk, word);

    if (wk.seen[word].exposures >= EXPOSURE_THRESHOLD) {
      const reading = lookupReading(word);
      if (wasBelowThreshold) {
        newlyMastered.push({ word, reading, meaning, exposures: wk.seen[word].exposures });
      }
      const existingCards = getDeckCards(userId, 'vocab');
      if (!existingCards.find(c => c.id === word)) {
        const dictMeaning = lookupMeaning(word);
        createCard(userId, 'vocab', word, {
          word, meaning: dictMeaning || meaning, reading
        });
      }
    }
  }

  saveWordKnowledge(wk);
  return newlyMastered;
}

export function createWordKnowledge(userId) {
  return {
    userId,
    seen: {},    // { wordId: { exposures: number, firstSeen: ISO } }
    known: {}    // { wordId: { knownSince: ISO } }
  };
}

export function registerExposure(wk, wordId) {
  if (!wk.seen[wordId]) {
    wk.seen[wordId] = { exposures: 0, firstSeen: new Date().toISOString() };
  }
  wk.seen[wordId].exposures++;
}

export function markKnown(wk, wordId) {
  if (!wk.known[wordId]) {
    wk.known[wordId] = { knownSince: new Date().toISOString() };
  }
}

export function unmarkKnown(wk, wordId) {
  delete wk.known[wordId];
}

export function isWordKnown(wk, wordId) {
  return !!wk.known[wordId];
}

export function getKnownWords(wk) {
  return new Set(Object.keys(wk.known));
}

export function getSeenWords(wk) {
  return new Set(Object.keys(wk.seen));
}

export function seedKnownWords(wk, words) {
  const now = new Date().toISOString();
  for (const word of words) {
    if (!wk.known[word]) {
      wk.known[word] = { knownSince: now };
    }
  }
}

export function loadWordKnowledge(userId) {
  const filePath = path.join(getDataDir(), `word-knowledge-${userId}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveWordKnowledge(wk) {
  const filePath = path.join(getDataDir(), `word-knowledge-${wk.userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wk, null, 2));
}

/**
 * Get known words from FSRS vocab deck.
 * A word is "known" when its FSRS card is in Learning or Review state
 * (i.e. any card that has been reviewed at least once).
 * @param {string} userId
 * @returns {string[]}
 */
export function getKnownWordsFromFsrs(userId) {
  const cards = getDeckCards(userId, 'vocab');
  return cards
    .filter(c => c.state === State.Learning || c.state === State.Review || c.state === State.Relearning)
    .map(c => c.id);
}
