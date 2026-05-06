import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { clearSrsCache, createCard, gradeCard } from '../game/internal-srs.js';
import { loadWordDictionary } from '../game/word-dictionary.js';
import { resolveLiveDictPath } from '../game/live-dict-path.js';
import { getKnownWordsFromFsrs } from '../game/bootstrap/word-knowledge.js';
import { loadUsers, saveUsers } from '../auth/users.js';
import { lookupDictPrimary } from '../../public/js/shared/exposure-extractor.js';
import { createBalanceSimulationManager } from '../game/balance-simulator.js';

const defaultBalanceManager = createBalanceSimulationManager();

/**
 * Shift all FSRS card timestamps backward by a number of days.
 * Exported for unit testing.
 *
 * @param {string} filePath - Path to the SRS JSON file
 * @param {number} days - Number of days to shift backward
 * @returns {{ shifted: number }} Count of cards shifted
 */
export function shiftFsrsTimestamps(filePath, days) {
  const shiftMs = days * 86400000;
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  let shifted = 0;

  for (const deckName of Object.keys(raw)) {
    const deck = raw[deckName];
    if (!deck || !Array.isArray(deck.cards)) continue;

    for (const card of deck.cards) {
      let changed = false;

      if (card.due) {
        const d = new Date(card.due);
        card.due = new Date(d.getTime() - shiftMs).toISOString();
        changed = true;
      }

      if (card.last_review) {
        const d = new Date(card.last_review);
        card.last_review = new Date(d.getTime() - shiftMs).toISOString();
        changed = true;
      }

      if (changed) shifted++;
    }
  }

  writeFileSync(filePath, JSON.stringify(raw, null, 2));
  return { shifted };
}

/**
 * Admin secret middleware.
 * Returns 404 if ADMIN_SECRET is not configured (hides endpoint existence).
 * Returns 403 if X-Admin-Secret header does not match.
 */
export function adminAuth(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/**
 * Create admin routes for the learning simulator.
 *
 * @param {{ dataDir: string }} options
 * @returns {Router}
 */
export default function createAdminRoutes({ dataDir, balanceManager = defaultBalanceManager }) {
  const router = Router();
  router.use(adminAuth);

  // POST /advance-time — shift FSRS timestamps backward
  router.post('/advance-time', (req, res) => {
    try {
      const { userId, days } = req.body;
      if (!userId || typeof days !== 'number') {
        return res.status(400).json({ error: 'userId (string) and days (number) required' });
      }

      const filePath = join(dataDir, `srs-${userId}.json`);
      if (!existsSync(filePath)) {
        // No SRS data yet — nothing to shift, which is fine
        return res.json({ shifted: 0 });
      }

      const result = shiftFsrsTimestamps(filePath, days);
      clearSrsCache(userId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /seed-vocab — bulk seed vocab cards
  router.post('/seed-vocab', (req, res) => {
    try {
      const { userId, words } = req.body;
      if (!userId || !Array.isArray(words)) {
        return res.status(400).json({ error: 'userId (string) and words (string[]) required' });
      }

      let seeded = 0;
      for (const word of words) {
        createCard(userId, 'vocab', word, { word });
        gradeCard(userId, 'vocab', word, 'good');
        seeded++;
      }

      res.json({ seeded });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /cleanup-sim-user — delete all data for a simulator user
  router.post('/cleanup-sim-user', (req, res) => {
    try {
      const { userId, username } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      // Safety: require simulator username (s- prefix) to prevent accidental real user deletion.
      // User IDs are UUIDs (u_hex), so we check the username which the simulator controls.
      if (!username || !username.startsWith('s-')) {
        return res.status(403).json({ error: 'username starting with s- required for cleanup' });
      }

      const deleted = [];
      const files = readdirSync(dataDir);
      for (const file of files) {
        if (file.includes(userId)) {
          try {
            unlinkSync(join(dataDir, file));
            deleted.push(file);
          } catch (e) {
            // Skip files that can't be deleted
          }
        }
      }

      clearSrsCache(userId);
      res.json({ deleted });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /list-users — list all users (id + username + createdAt)
  router.get('/list-users', (req, res) => {
    try {
      const usersFile = join(dataDir, '.jrpg-users.json');
      const data = loadUsers(usersFile);
      const users = data.users.map(u => ({
        id: u.id, username: u.username, createdAt: u.createdAt
      }));
      res.json({ count: users.length, users });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /delete-user — delete a real user and all their data
  router.post('/delete-user', (req, res) => {
    try {
      const { username } = req.body;
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'username (string) required' });
      }

      // Find user in the users file
      const usersFile = join(dataDir, '.jrpg-users.json');
      const data = loadUsers(usersFile);
      const userIndex = data.users.findIndex(u => u.username === username);
      if (userIndex === -1) {
        return res.status(404).json({ error: `User "${username}" not found` });
      }

      const user = data.users[userIndex];
      const userId = user.id;

      // Delete all data files containing the userId
      const deleted = [];
      // Check root data dir (save files, npc-memory)
      for (const file of readdirSync(dataDir)) {
        if (file.includes(userId)) {
          try { unlinkSync(join(dataDir, file)); deleted.push(file); } catch (e) { /* skip */ }
        }
      }
      // Remove user from users file
      data.users.splice(userIndex, 1);
      saveUsers(data, usersFile);

      clearSrsCache(userId);

      res.json({ deleted, userId, username, message: `User "${username}" and all data removed` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /word-knowledge/:userId — return word exposure data + definitions
  router.get('/word-knowledge/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const wkPath = join(dataDir, `word-knowledge-${userId}.json`);

      if (!existsSync(wkPath)) {
        return res.json({ words: [] });
      }

      const wk = JSON.parse(readFileSync(wkPath, 'utf-8'));
      const dict = loadWordDictionary({
        overlayDir: join(process.cwd(), 'data'),
        liveDictPath: resolveLiveDictPath(),
      });
      const knownSet = new Set(getKnownWordsFromFsrs(userId));

      const words = [];
      for (const [word, info] of Object.entries(wk.seen || {})) {
        const entry = dict.get(word);
        const meaning = lookupDictPrimary(dict, word);
        words.push({
          word,
          reading: entry?.reading || word,
          meaning,
          exposures: info.exposures || 0,
          known: knownSet.has(word),
        });
      }

      // Sort by exposures descending
      words.sort((a, b) => b.exposures - a.exposures);
      res.json({ words });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });


  router.post('/balance-simulations/start', (req, res) => {
    try {
      const battleCount = Number(req.body?.battleCount);
      const creatureLevel = Number(req.body?.creatureLevel);
      if (!Number.isInteger(battleCount) || battleCount <= 0) {
        return res.status(400).json({ error: 'battleCount must be a positive integer' });
      }
      if (!Number.isInteger(creatureLevel) || creatureLevel <= 0) {
        return res.status(400).json({ error: 'creatureLevel must be a positive integer' });
      }
      const job = balanceManager.start({ battleCount, creatureLevel });
      res.status(201).json(job);
    } catch (err) {
      const status = err.message?.includes('already running') ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  router.get('/balance-simulations/current', (req, res) => {
    try {
      const job = balanceManager.current();
      if (!job) return res.json({ status: 'idle', jobId: null, results: [] });
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/balance-simulations/cancel', (req, res) => {
    try {
      res.json(balanceManager.cancel());
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  return router;
}
