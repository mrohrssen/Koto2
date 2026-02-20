/**
 * @fileoverview TTS routes
 *
 * Handles /api/tts/* endpoints for VOICEVOX text-to-speech
 */

import { Router } from 'express';
import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from '../voicevox.js';
/**
 * Create TTS router
 * @param {object} deps - Dependencies
 * @param {function} deps.getSettings - Get current settings object
 * @returns {Router}
 */
export default function createTTSRoutes({ getSettings }) {
  const router = Router();

  // TTS status
  router.get('/status', async (req, res) => {
    const running = await isVoicevoxRunning();
    let version = null;
    let speakers = [];

    if (running) {
      try {
        version = await getVoicevoxVersion();
        speakers = await getSpeakers();
      } catch (e) {}
    }

    res.json({ running, version, speakers });
  });

  // Get speakers
  router.get('/speakers', async (req, res) => {
    try {
      const speakers = await getSpeakers();
      res.json(speakers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Synthesize speech
  router.post('/synthesize', async (req, res) => {
    const { text, speakerId, speed, speedScale, volumeScale } = req.body;
    const settings = getSettings();

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    try {
      const audioBuffer = await synthesize(text, speakerId || 13, {
        speedScale: speed ?? speedScale ?? settings.gameTtsSpeed ?? 0.9,
        volumeScale: volumeScale ?? settings.gameTtsVolume ?? 1.0
      });

      res.set('Content-Type', 'audio/wav');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
