import { Router } from 'express';
import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from '../voicevox.js';
import { requireAuth } from '../auth/middleware.js';
import { createDialogueCardWordTtsResolver } from '../services/dialogue-card-tts.js';

export default function createTTSRoutes({ getSettings, ttsCache, ttsDialogueCache }) {
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
    const { text, speakerId, speed, speedScale } = req.body;
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
        speedScale: resolvedSpeed
      });

      res.set('Content-Type', 'audio/wav');
      res.set('X-TTS-Cache', 'miss');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Synthesize one clicked dialogue word into the same per-user dialogue cache.
  router.post('/dialogue-word', requireAuth, async (req, res) => {
    const { word, speakerId } = req.body || {};
    if (!word) {
      return res.status(400).json({ ok: false, error: 'word is required' });
    }
    if (String(word).length > 40) {
      return res.status(400).json({ ok: false, error: 'word is too long' });
    }
    const resolvedSpeakerId = Number(speakerId);
    if (!Number.isFinite(resolvedSpeakerId)) {
      return res.status(400).json({ ok: false, error: 'speakerId is required' });
    }
    if (!ttsDialogueCache) {
      return res.status(404).json({ ok: false, error: 'Dialogue TTS not available' });
    }

    const settings = getSettings?.() || {};
    const resolveWordAudio = createDialogueCardWordTtsResolver({
      ttsDialogueCache,
      synthesizeFn: async (text, resolvedSpeakerId) => synthesize(text, resolvedSpeakerId, {
        speedScale: settings.gameTtsSpeed ?? 0.9
      })
    });
    const audio = await resolveWordAudio({ userId: req.user.id, word, speakerId: resolvedSpeakerId });

    if (!audio) {
      return res.status(500).json({ ok: false, error: 'Dialogue word TTS failed' });
    }
    res.json({ ok: true, audio });
  });

  // Serve cached dialogue audio
  router.get('/dialogue/:userId/:filename', (req, res) => {
    const { userId, filename } = req.params;

    if (!filename.match(/^[a-f0-9]{12}\.wav$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!ttsDialogueCache) {
      return res.status(404).json({ error: 'Dialogue TTS not available' });
    }

    const wav = ttsDialogueCache.lookup(userId, filename);
    if (!wav) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'no-cache');
    res.send(wav);
  });

  return router;
}
