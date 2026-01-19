/**
 * @fileoverview Vocab and JPDB routes
 *
 * Handles /api/vocab/* and /api/jpdb/* endpoints for vocabulary integration
 */

import { Router } from 'express';
import {
  testConnection,
  getVocabulary,
  fetchDeckVocabulary,
  fetchAllDecksVocabulary,
  parseText,
  reviewVocabulary,
  invalidateWordStateCache,
  lookupVocabularyMeaning
} from '../jpdb.js';

/**
 * Create vocab router
 * @param {object} deps - Dependencies
 * @param {function} deps.getSettings - Get current settings object
 * @returns {Router}
 */
export default function createVocabRoutes({ getSettings }) {
  const router = Router();

  // Vocab status - test JPDB connection
  router.post('/vocab/status', async (req, res) => {
    const { jpdbApiKey } = req.body;
    if (!jpdbApiKey) {
      return res.json({ connected: false, error: 'No API key configured' });
    }

    const result = await testConnection(jpdbApiKey);
    res.json(result);
  });

  // Get cached vocabulary words
  router.get('/vocab/words', async (req, res) => {
    const vocabResult = getVocabulary();
    res.json({
      words: vocabResult.words,
      count: vocabResult.words.length,
      source: vocabResult.source
    });
  });

  // Fetch vocabulary from JPDB deck
  router.post('/vocab/fetch', async (req, res) => {
    const { jpdbApiKey } = req.body;
    const settings = getSettings();

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      let result;
      if (settings.jpdbDeckId === 'all') {
        result = await fetchAllDecksVocabulary(jpdbApiKey);
      } else {
        result = await fetchDeckVocabulary(jpdbApiKey, settings.jpdbDeckId);
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Parse text with JPDB
  router.post('/jpdb/parse', async (req, res) => {
    const { text, jpdbApiKey } = req.body;

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
  router.post('/jpdb/review', async (req, res) => {
    const { vid, sid, grade, jpdbApiKey } = req.body;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const result = await reviewVocabulary(jpdbApiKey, vid, sid, grade);

      // Invalidate local cache so this word won't reappear as "due" immediately
      invalidateWordStateCache(parseInt(vid, 10));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Lookup vocabulary meaning
  router.post('/jpdb/lookup', async (req, res) => {
    const { vid, sid, jpdbApiKey } = req.body;

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

  return router;
}
