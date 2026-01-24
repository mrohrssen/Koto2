/**
 * @fileoverview Game state routes
 *
 * Handles /api/game/state, /meta, /achievements, /lifetime-stats, /liberation-tracker
 */

import { Router } from 'express';
import { ACHIEVEMENTS } from '../../game/state.js';
import { getLiberationTrackerData } from '../../game/enemies.js';

/**
 * Create game state router
 * gameManager, getEnrichedGameState come from req (set by game/index.js middleware)
 * @returns {Router}
 */
export default function createGameStateRoutes() {
  const router = Router();

  // Get current game state
  router.get('/state', (req, res) => {
    res.json(req.getEnrichedGameState());
  });

  // Get meta-progression data
  router.get('/meta', (req, res) => {
    res.json({
      meta: req.gameManager.meta,
      state: req.getEnrichedGameState()
    });
  });

  // Get achievements
  router.get('/achievements', (req, res) => {
    res.json({
      achievements: ACHIEVEMENTS,
      unlocked: req.gameManager.meta?.achievements || [],
      progress: req.gameManager.meta?.achievementProgress || {}
    });
  });

  // Get lifetime stats
  router.get('/lifetime-stats', (req, res) => {
    res.json({
      stats: req.gameManager.meta?.lifetimeStats || {}
    });
  });

  // Get liberation tracker
  router.get('/liberation-tracker', (req, res) => {
    const tracker = req.gameManager.meta?.lifetimeStats?.liberationTracker || {};
    res.json(getLiberationTrackerData(tracker));
  });

  return router;
}
