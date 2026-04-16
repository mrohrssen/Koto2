import { Router } from 'express';
import { readdirSync, readFileSync } from 'fs';
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
