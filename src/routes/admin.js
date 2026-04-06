/**
 * @fileoverview Admin API routes for the learning simulator.
 *
 * Provides endpoints to advance time (shift FSRS timestamps), seed vocab,
 * and clean up simulator test users. All endpoints require ADMIN_SECRET.
 *
 * API ENDPOINTS:
 *   POST /advance-time       - Shift FSRS due/last_review timestamps backward
 *   POST /seed-vocab          - Bulk seed vocab cards for a user
 *   POST /cleanup-sim-user    - Delete all data files for a simulator user
 */

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { clearSrsCache, createCard, gradeCard } from '../game/internal-srs.js';

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
function adminAuth(req, res, next) {
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
export default function createAdminRoutes({ dataDir }) {
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
        return res.status(404).json({ error: `No SRS file for user ${userId}` });
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
        createCard(userId, 'vocab', word, { word, meaning: '', reading: word });
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
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      // Safety: only allow simulator user IDs (prefixed with s-)
      if (!userId.startsWith('s-')) {
        return res.status(403).json({ error: 'Only simulator users (s-*) can be cleaned up' });
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

  return router;
}
