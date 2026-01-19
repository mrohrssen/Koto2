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
 * @param {object} deps - Dependencies
 * @param {object} deps.gameManager - GameManager instance
 * @param {function} deps.getEnrichedGameState - Get enriched game state
 * @returns {Router}
 */
export default function createGameStateRoutes({ gameManager, getEnrichedGameState }) {
  const router = Router();

  // Get current game state
  router.get('/state', (req, res) => {
    res.json(getEnrichedGameState());
  });

  // Get meta-progression data
  router.get('/meta', (req, res) => {
    res.json({
      meta: gameManager.meta,
      state: getEnrichedGameState()
    });
  });

  // Get achievements
  router.get('/achievements', (req, res) => {
    res.json({
      achievements: ACHIEVEMENTS,
      unlocked: gameManager.meta?.achievements || [],
      progress: gameManager.meta?.achievementProgress || {}
    });
  });

  // Get lifetime stats
  router.get('/lifetime-stats', (req, res) => {
    res.json({
      stats: gameManager.meta?.lifetimeStats || {}
    });
  });

  // Get liberation tracker
  router.get('/liberation-tracker', (req, res) => {
    const tracker = gameManager.meta?.lifetimeStats?.liberationTracker || {};
    res.json(getLiberationTrackerData(tracker));
  });

  return router;
}
