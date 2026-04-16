import { Router } from 'express';
import { addReview } from '../auth/users.js';
import { requireAuth, optionalAuth, attachUserKeys } from '../auth/middleware.js';
import { incrementDiscoveryCount, getDiscoveryStatus } from '../word-tracking.js';


/**
 * Create vocab router
 * @param {object} deps - Dependencies
 * @param {function} deps.getSettings - Get current settings object
 * @returns {Router}
 */
export default function createVocabRoutes({ getSettings }) {
  const router = Router();

  return router;
}
