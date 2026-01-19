/**
 * @fileoverview Main router aggregator
 *
 * Collects all route modules and exports a single router
 * that server.js mounts at /api
 */

import { Router } from 'express';

const router = Router();

// Route modules will be added here as we extract them:
// import settingsRoutes from './settings.js';
// import ttsRoutes from './tts.js';
// import vocabRoutes from './vocab.js';
// import gameRoutes from './game/index.js';

// router.use('/settings', settingsRoutes);
// router.use('/tts', ttsRoutes);
// router.use('/vocab', vocabRoutes);
// router.use('/game', gameRoutes);

export default router;
