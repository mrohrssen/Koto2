import { Router } from 'express';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { adminAuth } from './admin.js';
import { loadWordDictionary } from '../game/word-dictionary.js';

/**
 * Aggregate word exposures across all user word-knowledge files.
 *
 * @param {string} dataDir - Directory containing word-knowledge-*.json files
 * @param {Map} dictionary - Word dictionary Map<baseForm, { reading, definitions }>
 * @returns {{ words: Array, totalUniqueWords: number, totalUsers: number }}
 */
export function aggregateWordExposures(dataDir, dictionary) {
  const wordMap = new Map();
  let totalUsers = 0;

  let files;
  try {
    files = readdirSync(dataDir).filter(f => f.startsWith('word-knowledge-') && f.endsWith('.json'));
  } catch {
    files = [];
  }

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
      if (!raw.seen) continue;
      totalUsers++;
      for (const [word, data] of Object.entries(raw.seen)) {
        const existing = wordMap.get(word);
        if (existing) {
          existing.totalExposures += data.exposures || 0;
          existing.users.add(raw.userId || file);
        } else {
          wordMap.set(word, {
            totalExposures: data.exposures || 0,
            users: new Set([raw.userId || file]),
          });
        }
      }
    } catch {
      /* skip malformed files */
    }
  }

  const words = [];
  for (const [word, data] of wordMap) {
    const entry = dictionary.get(word);
    const primaryDef = entry?.definitions?.find(d => d.primary) || entry?.definitions?.[0];
    words.push({
      word,
      reading: entry?.reading || null,
      definition: primaryDef?.en || null,
      totalExposures: data.totalExposures,
      userCount: data.users.size,
    });
  }
  words.sort((a, b) => b.totalExposures - a.totalExposures);

  return { words, totalUniqueWords: words.length, totalUsers };
}

// ---------------------------------------------------------------------------
// JPDB comparison helpers
// ---------------------------------------------------------------------------

/**
 * Compare our Sudachi base form against a JPDB parse response for a single word.
 *
 * Reads definition from vocabulary[2][0] (the `meanings` field, first entry)
 * when we requested vocabularyFields: ['spelling', 'reading', 'meanings'].
 */
export function buildJpdbComparison(ourWord, jpdbResponse) {
  const { tokens, vocabulary } = jpdbResponse;

  if (!tokens || tokens.length === 0) {
    return { jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true };
  }

  if (tokens.length === 1) {
    const vocabIdx = tokens[0][0];
    const vocab = vocabulary[vocabIdx];
    const spelling = vocab[0];
    const reading = vocab[1];
    const meanings = vocab[2];
    const definition = Array.isArray(meanings) && meanings.length > 0
      ? (typeof meanings[0] === 'string' ? meanings[0] : (meanings[0].glosses || []).join(', '))
      : null;
    const isDifferent = spelling !== ourWord;
    return { jpdbSpelling: spelling, jpdbReading: reading, jpdbDefinition: definition, isDifferent };
  }

  const spellings = tokens.map(t => vocabulary[t[0]][0]);
  const readings = tokens.map(t => vocabulary[t[0]][1]);
  return {
    jpdbSpelling: spellings.join('+'),
    jpdbReading: readings.join('+'),
    jpdbDefinition: null,
    isDifferent: true,
  };
}

/**
 * Compare a dialogue frame's Sudachi tokens against JPDB's sentence-level parse.
 * Greedy alignment with 3-token lookahead classifies diffs as merge, split, or spelling.
 */
export function buildFrameComparison(frame, jpdbResponse) {
  const sudachiTokens = frame.tokens
    .filter(t => t.base && !t.slot)
    .map(t => ({ base: t.base, surface: t.surface }));

  const jpdbTokens = (jpdbResponse.tokens || []).map(t => {
    const vocab = jpdbResponse.vocabulary[t[0]];
    return { spelling: vocab[0], reading: vocab[1] };
  });

  const diffs = [];
  let si = 0;
  let ji = 0;

  while (si < sudachiTokens.length && ji < jpdbTokens.length) {
    const sToken = sudachiTokens[si];
    const jToken = jpdbTokens[ji];

    if (sToken.base === jToken.spelling) {
      si++;
      ji++;
      continue;
    }

    let foundInJpdb = -1;
    let foundInSudachi = -1;

    for (let look = 1; look <= 3 && ji + look < jpdbTokens.length; look++) {
      if (sudachiTokens[si].base === jpdbTokens[ji + look].spelling) {
        foundInJpdb = ji + look;
        break;
      }
    }

    for (let look = 1; look <= 3 && si + look < sudachiTokens.length; look++) {
      if (sudachiTokens[si + look].base === jpdbTokens[ji].spelling) {
        foundInSudachi = si + look;
        break;
      }
    }

    // Ties (equal lookahead distance) resolve to split — JPDB compounding over Sudachi splitting is the more common real-world divergence, so this labelling tends to match operator intuition.
    if (foundInJpdb >= 0 && (foundInSudachi < 0 || (foundInJpdb - ji) <= (foundInSudachi - si))) {
      const extraJpdb = jpdbTokens.slice(ji, foundInJpdb);
      diffs.push({
        type: 'split',
        sudachi: sToken.base,
        jpdb: extraJpdb.map(t => t.spelling),
      });
      ji = foundInJpdb;
    } else if (foundInSudachi >= 0) {
      const extraSudachi = sudachiTokens.slice(si, foundInSudachi);
      diffs.push({
        type: 'merge',
        sudachi: extraSudachi.map(t => t.base),
        jpdb: jToken.spelling,
      });
      si = foundInSudachi;
    } else {
      diffs.push({
        type: 'spelling',
        sudachi: sToken.base,
        jpdb: jToken.spelling,
      });
      si++;
      ji++;
    }
  }

  if (si < sudachiTokens.length) {
    diffs.push({ type: 'merge', sudachi: sudachiTokens.slice(si).map(t => t.base), jpdb: null });
  }
  if (ji < jpdbTokens.length) {
    diffs.push({ type: 'split', sudachi: null, jpdb: jpdbTokens.slice(ji).map(t => t.spelling) });
  }

  return {
    raw: frame.raw,
    sudachiTokens,
    jpdbTokens,
    isDifferent: diffs.length > 0,
    diffs,
  };
}

export function loadJpdbCache(cachePath) {
  try {
    if (!existsSync(cachePath)) return {};
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveJpdbCache(cachePath, cache) {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create admin word exposure routes.
 * @param {{ dataDir: string }} options
 * @returns {Router}
 */
export default function createWordExposureRoutes({ dataDir }) {
  const router = Router();
  router.use(adminAuth);

  let dictionary = null;
  function getDictionary() {
    if (!dictionary) dictionary = loadWordDictionary(dataDir);
    return dictionary;
  }

  // GET /word-exposures
  router.get('/word-exposures', (req, res) => {
    try {
      res.json(aggregateWordExposures(dataDir, getDictionary()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
