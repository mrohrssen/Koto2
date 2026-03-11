/**
 * @fileoverview Vocab and JPDB routes
 *
 * Handles /api/vocab/* and /api/jpdb/* endpoints for vocabulary integration
 */

import { Router } from 'express';
import {
  parseText,
  reviewVocabulary,
  invalidateWordStateCache,
  lookupVocabularyMeaning,
  lookupVocabularyBatch
} from '../jpdb.js';
import { addReview } from '../auth/users.js';
import { requireAuth, optionalAuth, attachUserKeys } from '../auth/middleware.js';
import { incrementDiscoveryCount, getDiscoveryStatus } from '../word-tracking.js';
import { loadWordKnowledge, createWordKnowledge, markKnown, registerExposure, saveWordKnowledge } from '../game/bootstrap/word-knowledge.js';

/**
 * Create vocab router
 * @param {object} deps - Dependencies
 * @param {function} deps.getSettings - Get current settings object
 * @returns {Router}
 */
export default function createVocabRoutes({ getSettings }) {
  const router = Router();

  /**
   * POST /api/vocab/due-words
   * Fetch due/failed words for speed review
   * Body: { reviewedWords: [{ vid, sid }, ...] }
   */
  router.post('/vocab/due-words', requireAuth, attachUserKeys, async (req, res) => {
    const jpdbApiKey = req.userKeys?.jpdbApiKey;
    const { reviewedWords = [] } = req.body || {};

    if (!jpdbApiKey) {
      return res.json({ words: [], error: 'JPDB API key not configured' });
    }

    try {
      const { getDueWordsWithMeanings } = await import('../jpdb.js');
      const result = await getDueWordsWithMeanings(jpdbApiKey, 1000, [], req.user.id, reviewedWords);

      // Register word exposures in bootstrap system
      if (result.words && result.words.length > 0) {
        try {
          const wk = loadWordKnowledge(req.user.id) || createWordKnowledge(req.user.id);
          for (const w of result.words) {
            if (w.word) registerExposure(wk, w.word);
          }
          saveWordKnowledge(wk);
        } catch (e) {
          console.warn('[vocab/due-words] Failed to record exposures:', e.message);
        }
      }

      res.json(result);
    } catch (error) {
      console.error('[vocab/due-words] Error:', error);
      res.json({ words: [], error: error.message });
    }
  });

  // Parse text with JPDB
  router.post('/jpdb/parse', optionalAuth, attachUserKeys, async (req, res) => {
    const { text } = req.body;
    const jpdbApiKey = req.userKeys?.jpdbApiKey;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const tokens = await parseText(jpdbApiKey, text);
      res.json({ tokens });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Review vocabulary in JPDB
  router.post('/jpdb/review', requireAuth, attachUserKeys, async (req, res) => {
    const { vid, sid, grade, isDiscovery, wordText } = req.body;
    const jpdbApiKey = req.userKeys?.jpdbApiKey;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    const userId = req.user?.id || 'default';
    const settings = req.getSettings?.() || {};
    const dailyLimit = settings.dailyWordLimit ?? 10;

    // If discovery mode, check limit before processing
    if (isDiscovery) {
      const status = getDiscoveryStatus(userId, dailyLimit);
      if (status.atLimit) {
        return res.json({
          success: false,
          atLimit: true,
          todayCount: status.todayCount
        });
      }
    }

    try {
      const result = await reviewVocabulary(jpdbApiKey, vid, sid, grade);

      // Invalidate local cache so this word won't reappear as "due" immediately
      invalidateWordStateCache(parseInt(vid, 10), req.user.id);

      // Track review for leaderboard
      addReview(req.user.id);

      // Mark word as known in bootstrap system on successful recall (grade >= 3)
      if (grade >= 3 && wordText) {
        try {
          const wk = loadWordKnowledge(userId) || createWordKnowledge(userId);
          markKnown(wk, wordText);
          saveWordKnowledge(wk);
        } catch (e) {
          console.warn('[jpdb/review] Failed to mark word as known:', e.message);
        }
      }

      // If discovery mode, increment counter
      if (isDiscovery) {
        const counts = incrementDiscoveryCount(userId, dailyLimit);
        return res.json({
          ...result,
          success: true,
          todayCount: counts.todayCount,
          atLimit: counts.atLimit
        });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Lookup vocabulary meaning
  router.post('/jpdb/lookup', optionalAuth, attachUserKeys, async (req, res) => {
    const { vid, sid } = req.body;
    const jpdbApiKey = req.userKeys?.jpdbApiKey;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    if (!vid || !sid) {
      return res.status(400).json({ error: 'vid and sid are required' });
    }

    try {
      const result = await lookupVocabularyMeaning(
        jpdbApiKey,
        parseInt(vid, 10),
        parseInt(sid, 10)
      );

      if (!result) {
        return res.status(404).json({ error: 'Vocabulary not found' });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Batch lookup vocabulary meanings (for prefetching)
  router.post('/jpdb/lookup-batch', optionalAuth, attachUserKeys, async (req, res) => {
    const { vocabList } = req.body;
    const jpdbApiKey = req.userKeys?.jpdbApiKey;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    if (!vocabList || !Array.isArray(vocabList) || vocabList.length === 0) {
      return res.status(400).json({ error: 'vocabList array is required' });
    }

    try {
      const results = await lookupVocabularyBatch(jpdbApiKey, vocabList);
      res.json({ definitions: results });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
