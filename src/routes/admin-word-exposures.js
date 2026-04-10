/**
 * @fileoverview Admin word-exposure dashboard logic.
 *
 * Provides:
 *   - aggregateWordExposures() — sum exposures across all users, enrich with dictionary
 *   - buildJpdbComparison()    — compare our Sudachi base form against JPDB parse
 *   - buildFrameComparison()   — compare a dialogue frame's tokens against JPDB sentence parse
 *   - loadJpdbCache / saveJpdbCache — simple JSON cache persistence
 */

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

/**
 * Compare our Sudachi base form against a JPDB parse response for a single word.
 *
 * @param {string} ourWord - Our Sudachi-derived base form
 * @param {{ tokens: Array, vocabulary: Array }} jpdbResponse - Raw JPDB parse response
 * @returns {{ jpdbSpelling: string|null, jpdbReading: string|null, jpdbDefinition: string|null, isDifferent: boolean }}
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
    const isDifferent = spelling !== ourWord;
    return { jpdbSpelling: spelling, jpdbReading: reading, jpdbDefinition: null, isDifferent };
  }

  // Multiple tokens — join spellings with +
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
 * Uses greedy alignment with lookahead to detect merge/split/spelling diffs.
 *
 * @param {{ raw: string, tokens: Array }} frame - Dialogue frame with Sudachi tokens
 * @param {{ tokens: Array, vocabulary: Array }} jpdbResponse - Raw JPDB parse response
 * @returns {{ raw: string, sudachiTokens: Array, jpdbTokens: Array, isDifferent: boolean, diffs: Array }}
 */
export function buildFrameComparison(frame, jpdbResponse) {
  // Extract Sudachi content tokens (have a base form and are not slots)
  const sudachiTokens = frame.tokens
    .filter(t => t.base && !t.slot)
    .map(t => ({ base: t.base, surface: t.surface }));

  // Extract JPDB content tokens from the response
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

    // Match: base forms are the same (comparing Sudachi base to JPDB spelling)
    if (sToken.base === jToken.spelling) {
      si++;
      ji++;
      continue;
    }

    // Mismatch — look ahead up to 3 positions in both lists
    let foundInJpdb = -1;
    let foundInSudachi = -1;

    // Look ahead in JPDB for a match to current Sudachi token
    for (let look = 1; look <= 3 && ji + look < jpdbTokens.length; look++) {
      if (sudachiTokens[si].base === jpdbTokens[ji + look].spelling) {
        foundInJpdb = ji + look;
        break;
      }
    }

    // Look ahead in Sudachi for a match to current JPDB token
    for (let look = 1; look <= 3 && si + look < sudachiTokens.length; look++) {
      if (sudachiTokens[si + look].base === jpdbTokens[ji].spelling) {
        foundInSudachi = si + look;
        break;
      }
    }

    if (foundInJpdb >= 0 && (foundInSudachi < 0 || (foundInJpdb - ji) <= (foundInSudachi - si))) {
      // Extra JPDB tokens before the match → split diff
      const extraJpdb = jpdbTokens.slice(ji, foundInJpdb);
      diffs.push({
        type: 'split',
        sudachi: sToken.base,
        jpdb: extraJpdb.map(t => t.spelling),
      });
      ji = foundInJpdb;
      // Don't advance si — it will match on the next iteration
    } else if (foundInSudachi >= 0) {
      // Extra Sudachi tokens before the match → merge diff
      const extraSudachi = sudachiTokens.slice(si, foundInSudachi);
      diffs.push({
        type: 'merge',
        sudachi: extraSudachi.map(t => t.base),
        jpdb: jToken.spelling,
      });
      si = foundInSudachi;
      // Don't advance ji — it will match on the next iteration
    } else {
      // No lookahead match — spelling diff, advance both
      diffs.push({
        type: 'spelling',
        sudachi: sToken.base,
        jpdb: jToken.spelling,
      });
      si++;
      ji++;
    }
  }

  // Remaining Sudachi tokens → merge diffs
  if (si < sudachiTokens.length) {
    diffs.push({
      type: 'merge',
      sudachi: sudachiTokens.slice(si).map(t => t.base),
      jpdb: null,
    });
  }

  // Remaining JPDB tokens → split diffs
  if (ji < jpdbTokens.length) {
    diffs.push({
      type: 'split',
      sudachi: null,
      jpdb: jpdbTokens.slice(ji).map(t => t.spelling),
    });
  }

  return {
    raw: frame.raw,
    sudachiTokens,
    jpdbTokens,
    isDifferent: diffs.length > 0,
    diffs,
  };
}

/**
 * Load JPDB comparison cache from disk.
 *
 * @param {string} cachePath - Path to cache JSON file
 * @returns {Object} Cached data or empty object
 */
export function loadJpdbCache(cachePath) {
  try {
    if (!existsSync(cachePath)) return {};
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save JPDB comparison cache to disk.
 *
 * @param {string} cachePath - Path to cache JSON file
 * @param {Object} cache - Data to persist
 */
export function saveJpdbCache(cachePath, cache) {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

// ---------------------------------------------------------------------------
// JPDB API helpers
// ---------------------------------------------------------------------------

const JPDB_API_BASE = 'https://jpdb.io/api/v1';

async function jpdbParse(apiKey, text) {
  const response = await fetch(`${JPDB_API_BASE}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      text,
      token_fields: ['vocabulary_index', 'position', 'length'],
      vocabulary_fields: ['spelling', 'reading', 'vid', 'sid'],
    }),
  });
  if (!response.ok) throw new Error(`JPDB parse failed: ${response.status}`);
  return response.json();
}

async function jpdbLookupDefinitions(apiKey, vidSidPairs) {
  if (vidSidPairs.length === 0) return {};
  const response = await fetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ list: vidSidPairs, fields: ['spelling', 'reading', 'meanings'] }),
  });
  if (!response.ok) return {};
  const data = await response.json();
  const defMap = {};
  for (let i = 0; i < (data.vocabulary_info || []).length; i++) {
    const info = data.vocabulary_info[i];
    if (!info) continue;
    const [, , meanings] = info;
    let defStr;
    if (Array.isArray(meanings) && meanings.length > 0) {
      defStr = typeof meanings[0] === 'string'
        ? meanings.join('; ')
        : meanings.map(m => (m.glosses || []).join(', ')).join('; ');
    }
    const [vid, sid] = vidSidPairs[i];
    defMap[`${vid}:${sid}`] = defStr || null;
  }
  return defMap;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripSlots(text) { return text.replace(/\{[^}]+\}/g, ''); }

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create admin word exposure routes.
 * @param {{ dataDir: string, framesPath: string }} options
 * @returns {Router}
 */
export default function createWordExposureRoutes({ dataDir, framesPath }) {
  const router = Router();
  router.use(adminAuth);

  let dictionary = null;
  function getDictionary() {
    if (!dictionary) dictionary = loadWordDictionary(dataDir);
    return dictionary;
  }

  const jpdbCachePath = join(dataDir, 'jpdb-tokenization-cache.json');
  const frameCachePath = join(dataDir, 'jpdb-frame-compare-cache.json');

  // GET /word-exposures
  router.get('/word-exposures', (req, res) => {
    try {
      res.json(aggregateWordExposures(dataDir, getDictionary()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /word-exposures/jpdb-compare
  router.post('/word-exposures/jpdb-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'JPDB API key not configured' });
    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words (string[]) required' });
    }
    try {
      const cache = loadJpdbCache(jpdbCachePath);
      const results = {};
      let cached = 0, fetched = 0;

      for (const word of words) {
        if (cache[word]) { results[word] = cache[word]; cached++; continue; }
        try {
          const jpdbResp = await jpdbParse(apiKey, word);
          const comparison = buildJpdbComparison(word, jpdbResp);

          // Fetch definition for single-token results
          if (comparison.jpdbSpelling && !comparison.jpdbSpelling.includes('+')) {
            const wordTokens = jpdbResp.tokens.filter(t => t[0] !== null && jpdbResp.vocabulary[t[0]]);
            if (wordTokens.length === 1) {
              const vocab = jpdbResp.vocabulary[wordTokens[0][0]];
              await sleep(500);
              const defMap = await jpdbLookupDefinitions(apiKey, [[vocab[2], vocab[3]]]);
              comparison.jpdbDefinition = defMap[`${vocab[2]}:${vocab[3]}`] || null;
            }
          }

          cache[word] = comparison;
          results[word] = comparison;
          fetched++;
          await sleep(500);
        } catch (err) {
          results[word] = { jpdbSpelling: null, jpdbReading: null, jpdbDefinition: null, isDifferent: true, error: err.message };
        }
      }

      if (fetched > 0) saveJpdbCache(jpdbCachePath, cache);
      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /frames
  router.get('/frames', (req, res) => {
    try {
      const frames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      res.json({ frames: frames.map(f => ({ id: f.id, category: f.category, raw: f.raw })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /word-exposures/frame-compare
  router.post('/word-exposures/frame-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'JPDB API key not configured' });
    const { frameIds } = req.body;
    if (!Array.isArray(frameIds) || frameIds.length === 0) {
      return res.status(400).json({ error: 'frameIds (string[]) required' });
    }
    try {
      const allFrames = JSON.parse(readFileSync(framesPath, 'utf-8'));
      const frameMap = new Map(allFrames.map(f => [f.id, f]));
      const cache = loadJpdbCache(frameCachePath);
      const results = {};
      let cached = 0, fetched = 0;

      for (const frameId of frameIds) {
        const frame = frameMap.get(frameId);
        if (!frame) continue;
        if (cache[frameId]) { results[frameId] = cache[frameId]; cached++; continue; }

        try {
          const textForJpdb = stripSlots(frame.raw);
          if (!textForJpdb.trim()) continue;
          const jpdbResp = await jpdbParse(apiKey, textForJpdb);
          const comparison = buildFrameComparison(frame, jpdbResp);

          // Fetch definitions for JPDB tokens
          const wordTokens = (jpdbResp.tokens || []).filter(t => t[0] !== null && jpdbResp.vocabulary[t[0]]);
          const vidSidPairs = wordTokens.map(t => {
            const v = jpdbResp.vocabulary[t[0]];
            return [v[2], v[3]];
          });
          if (vidSidPairs.length > 0) {
            await sleep(500);
            const defMap = await jpdbLookupDefinitions(apiKey, vidSidPairs);
            for (const jt of comparison.jpdbTokens) {
              const matchingToken = wordTokens.find(t => jpdbResp.vocabulary[t[0]][0] === jt.spelling);
              if (matchingToken) {
                const v = jpdbResp.vocabulary[matchingToken[0]];
                jt.definition = defMap[`${v[2]}:${v[3]}`] || null;
              }
            }
          }

          cache[frameId] = comparison;
          results[frameId] = comparison;
          fetched++;
          await sleep(500);
        } catch (err) {
          results[frameId] = { raw: frame.raw, isDifferent: true, diffs: [], error: err.message };
        }
      }

      if (fetched > 0) saveJpdbCache(frameCachePath, cache);
      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
