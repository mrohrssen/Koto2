/**
 * @fileoverview Prefetch routes
 *
 * Handles /api/prefetch/* endpoints for narration/audio prefetch management
 */

import { Router } from 'express';
import {
  getStats as getPrefetchStats,
  resetStats as resetPrefetchStats,
  getCacheContents,
  clearCache as clearPrefetchCache,
  cancelPendingPrefetches
} from '../game/prefetch.js';

/**
 * Create prefetch router
 * @returns {Router}
 */
export default function createPrefetchRoutes() {
  const router = Router();

  // Get prefetch stats
  router.get('/stats', (req, res) => {
    res.json(getPrefetchStats());
  });

  // Reset prefetch stats
  router.post('/reset', (req, res) => {
    resetPrefetchStats();
    res.json({ success: true });
  });

  // Get cache contents
  router.get('/cache', (req, res) => {
    res.json(getCacheContents());
  });

  // Clear cache
  router.post('/clear', (req, res) => {
    clearPrefetchCache();
    cancelPendingPrefetches();
    res.json({ success: true });
  });

  return router;
}
