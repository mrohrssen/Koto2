// src/routes/tts.js — TTS routes with disk cache support
import { Router } from 'express';
import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from '../voicevox.js';

export default function createTTSRoutes({ getSettings, ttsCache }) {
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

    const cacheStats = ttsCache ? ttsCache.getStats() : { loaded: false, wordCount: 0 };
    res.json({ running, version, speakers, cache: cacheStats });
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

    const resolvedSpeakerId = speakerId || 13;
    const resolvedSpeed = speed ?? speedScale ?? settings.gameTtsSpeed ?? 0.9;

    // Check disk cache first
    if (ttsCache) {
      const cached = ttsCache.lookup(text, resolvedSpeakerId, resolvedSpeed);
      if (cached) {
        res.set('Content-Type', 'audio/wav');
        res.set('X-TTS-Cache', 'hit');
        return res.send(cached);
      }
    }

    try {
      const audioBuffer = await synthesize(text, resolvedSpeakerId, {
        speedScale: resolvedSpeed,
        volumeScale: volumeScale ?? settings.gameTtsVolume ?? 1.0
      });

      res.set('Content-Type', 'audio/wav');
      res.set('X-TTS-Cache', 'miss');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
