import { Router } from 'express';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { adminAuth } from './admin.js';
import { loadWordDictionary } from '../game/word-dictionary.js';
import { resolveLiveDictPath } from '../game/live-dict-path.js';
import { parseBatch } from '../../scripts/lib/jpdb-helpers.mjs';
import createDictEditRoutes from './admin-dictionary-edit.js';
import { enqueueDictionarySync } from './admin-dictionary-sync.js';

/**
 * Aggregate word exposures across all user word-knowledge files.
 *
 * @param {string} dataDir - Directory containing word-knowledge-*.json files
 * @param {Map} dictionary - Word dictionary Map<baseForm, { reading, definitions }>
 * @param {Object} opts - Optional enrichment options
 * @param {string} opts.jmdictPath - Path to frozen JMdict JSON file
 * @param {Map} opts.overlayOwners - Map<word, overlayFilename> for overlay ownership
 * @returns {{ words: Array, totalUniqueWords: number, totalUsers: number }}
 */
export function aggregateWordExposures(dataDir, dictionary, opts = {}) {
  const { jmdictPath = null, overlayOwners = new Map() } = opts;

  // Load frozen JMdict baseline once, if provided
  let jmdict = null;
  if (jmdictPath && existsSync(jmdictPath)) {
    try {
      jmdict = JSON.parse(readFileSync(jmdictPath, 'utf-8'));
    } catch { jmdict = null; }
  }

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
    const jmEntry = jmdict ? jmdict[word] : null;
    const jmPrimary = jmEntry?.definitions?.find(d => d.primary) || jmEntry?.definitions?.[0];
    words.push({
      word,
      reading: entry?.reading || null,
      definition: primaryDef?.en || null,
      jmdictDefinition: jmPrimary?.en || null,
      overlayOwner: overlayOwners.get(word) || null,
      totalExposures: data.totalExposures,
      userCount: data.users.size,
    });
  }
  words.sort((a, b) => b.totalExposures - a.totalExposures);

  return { words, totalUniqueWords: words.length, totalUsers };
}

/**
 * Scan overlay JSON files and return Map<word, filename> of which overlay
 * defines each word. Used to warn the admin that edits will be shadowed.
 */
export function buildOverlayOwners(overlayDir) {
  const owners = new Map();

  const gameOverlays = [
    'creatures.json',
    'moves.json',
    'items.json',
    'npcs.json',
    'npc-skills.json',
    'areas.json',
  ];
  for (const file of gameOverlays) {
    const p = join(overlayDir, file);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      const entries = Array.isArray(raw) ? raw : Object.values(raw);
      for (const entry of entries) {
        if (entry?.baseWord) owners.set(entry.baseWord, file);
      }
    } catch { /* skip malformed */ }
  }

  for (const file of ['glue-words.json', 'grammar-words.json']) {
    const p = join(overlayDir, file);
    if (!existsSync(p)) continue;
    try {
      const entries = JSON.parse(readFileSync(p, 'utf-8'));
      for (const entry of entries) {
        if (entry?.word) owners.set(entry.word, file);
      }
    } catch { /* skip malformed */ }
  }

  return owners;
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
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

async function parseOne(text, apiKey) {
  const result = await parseBatch([text], apiKey, {
    vocabularyFields: ['spelling', 'reading', 'meanings'],
    batchSize: 1,
  });
  // Normalize bare numbers to [idx] arrays — parseBatch emits bare numbers
  // when tokenFields has one entry (the default).
  const rawTokens = result.tokens[0] || [];
  const tokens = rawTokens.map(t => Array.isArray(t) ? t : [t]);
  return { tokens, vocabulary: result.vocabulary };
}

function stripSlots(text) {
  return text.replace(/\{[^}]+\}/g, '');
}

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

  const overlayDir = join(process.cwd(), 'data');
  const jmdictPath = join(overlayDir, 'latest-jm-dict.json');

  let dictionary = null;
  let overlayOwners = null;

  function getDictionary() {
    if (!dictionary) {
      dictionary = loadWordDictionary({
        overlayDir,
        liveDictPath: resolveLiveDictPath(),
      });
    }
    return dictionary;
  }

  function getOverlayOwners() {
    if (!overlayOwners) {
      overlayOwners = buildOverlayOwners(overlayDir);
    }
    return overlayOwners;
  }

  function invalidate() {
    dictionary = null;
    // overlayOwners derives only from static overlay files; don't invalidate.
  }

  // Expose invalidation so future edit endpoint can reset after writes.
  router.invalidateDictionary = invalidate;

  const jpdbCachePath = join(dataDir, 'jpdb-tokenization-cache.json');
  const frameCachePath = join(dataDir, 'jpdb-frame-compare-cache.json');

  // GET /word-exposures
  router.get('/word-exposures', (req, res) => {
    try {
      res.json(aggregateWordExposures(dataDir, getDictionary(), {
        jmdictPath,
        overlayOwners: getOverlayOwners(),
      }));
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

  // POST /word-exposures/jpdb-compare
  router.post('/word-exposures/jpdb-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'JPDB_API_KEY not configured' });

    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words (string[]) required' });
    }

    try {
      const cache = loadJpdbCache(jpdbCachePath);
      const results = {};
      let cached = 0, fetched = 0;

      for (const word of words) {
        if (cache[word]) {
          results[word] = cache[word];
          cached++;
          continue;
        }
        try {
          const jpdbResp = await parseOne(word, apiKey);
          const comparison = buildJpdbComparison(word, jpdbResp);
          cache[word] = comparison;
          results[word] = comparison;
          fetched++;
        } catch (err) {
          results[word] = {
            jpdbSpelling: null,
            jpdbReading: null,
            jpdbDefinition: null,
            isDifferent: true,
            error: err.message,
          };
        }
      }

      if (fetched > 0) saveJpdbCache(jpdbCachePath, cache);
      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /word-exposures/frame-compare
  router.post('/word-exposures/frame-compare', async (req, res) => {
    const apiKey = process.env.JPDB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'JPDB_API_KEY not configured' });

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
        if (!frame) {
          results[frameId] = { error: 'frame not found' };
          continue;
        }
        if (cache[frameId]) {
          results[frameId] = cache[frameId];
          cached++;
          continue;
        }
        try {
          const textForJpdb = stripSlots(frame.raw);
          if (!textForJpdb.trim()) {
            results[frameId] = { raw: frame.raw, sudachiTokens: [], jpdbTokens: [], isDifferent: false, diffs: [] };
            continue;
          }
          const jpdbResp = await parseOne(textForJpdb, apiKey);
          const comparison = buildFrameComparison(frame, jpdbResp);
          cache[frameId] = comparison;
          results[frameId] = comparison;
          fetched++;
        } catch (err) {
          results[frameId] = {
            raw: frame.raw,
            sudachiTokens: [],
            jpdbTokens: [],
            isDifferent: true,
            diffs: [],
            error: err.message,
          };
        }
      }

      if (fetched > 0) saveJpdbCache(frameCachePath, cache);
      res.json({ results, cached, fetched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mount dictionary edit sub-router. `/api/admin/dictionary/-export` is used
  // rather than `/export` so it does not collide with the `:word` route.
  router.use('/dictionary', createDictEditRoutes({
    liveDictPath: resolveLiveDictPath(),
    jmdictPath,
    overlayOwners: getOverlayOwners(),
    onChange: () => invalidate(),
    enqueueSync: (word) => enqueueDictionarySync(word),
  }));

  return router;
}
