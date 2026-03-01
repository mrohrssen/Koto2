/**
 * @fileoverview Bootstrap language system routes
 *
 * Handles /api/game/bootstrap/*
 * Auth is applied by the parent game router middleware.
 */

import { Router } from 'express';
import {
  handleGetBootstrapState,
  handleGetBootstrapNarration,
  handleRecordExposures
} from '../../game/bootstrap-api.js';

export default function createBootstrapRoutes() {
  const router = Router();

  router.get('/state', (req, res) => {
    handleGetBootstrapState(req, res);
  });

  router.get('/narration', (req, res) => {
    handleGetBootstrapNarration(req, res);
  });

  router.post('/record-exposures', (req, res) => {
    handleRecordExposures(req, res);
  });

  return router;
}
