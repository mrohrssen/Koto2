import { Router } from 'express';
import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from '../voicevox.js';
import { requireAuth } from '../auth/middleware.js';

export default function createTTSRoutes({ getSettings, ttsCache, ttsDialogueCache, ttsWordCache }) {
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

  // Synthesize one clicked dialogue word into the global word-audio cache.
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
    if (!ttsWordCache) {
      return res.status(404).json({ ok: false, error: 'Word TTS not available' });
    }

    const settings = getSettings?.() || {};
    const resolvedSpeed = settings.gameTtsSpeed ?? 0.9;
    let audio = null;
    try {
      audio = await ttsWordCache.synthesizeWord(
        word,
        resolvedSpeakerId,
        resolvedSpeed,
        async (text, resolvedSpeakerId, speedScale) => synthesize(text, resolvedSpeakerId, {
          speedScale
        })
      );
    } catch {
      audio = null;
    }

    if (!audio) {
      return res.status(500).json({ ok: false, error: 'Dialogue word TTS failed' });
    }
    res.json({
      ok: true,
      audio: {
        key: audio.filename,
        url: `/api/tts/word/${audio.filename}`,
        cacheHit: audio.cacheHit
      }
    });
  });

  // Synthesize one full dialogue line into the per-user dialogue cache.
  router.post('/dialogue-line', requireAuth, async (req, res) => {
    const { text, speakerId } = req.body || {};
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text is required' });
    }
    if (String(text).length > 220) {
      return res.status(400).json({ ok: false, error: 'text is too long' });
    }
    const resolvedSpeakerId = Number(speakerId);
    if (!Number.isFinite(resolvedSpeakerId)) {
      return res.status(400).json({ ok: false, error: 'speakerId is required' });
    }
    if (!ttsDialogueCache) {
      return res.status(404).json({ ok: false, error: 'Dialogue TTS not available' });
    }

    const settings = getSettings?.() || {};
    const resolvedSpeed = settings.gameTtsSpeed ?? 0.9;
    let key = null;
    try {
      key = await ttsDialogueCache.synthesizeLine(
        req.user.id,
        text,
        resolvedSpeakerId,
        async (lineText, lineSpeakerId) => synthesize(lineText, lineSpeakerId, {
          speedScale: resolvedSpeed
        })
      );
    } catch {
      key = null;
    }

    if (!key) {
      return res.status(500).json({ ok: false, error: 'Dialogue line TTS failed' });
    }
    res.json({
      ok: true,
      audio: {
        userId: req.user.id,
        key,
        url: `/api/tts/dialogue/${req.user.id}/${key}`,
        speakerId: resolvedSpeakerId
      }
    });
  });

  // Serve cached clicked-word audio. These URLs are content-addressed by text/speaker/speed.
  router.get('/word/:filename', (req, res) => {
    const { filename } = req.params;

    if (!filename.match(/^[a-f0-9]{12}\.wav$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!ttsWordCache) {
      return res.status(404).json({ error: 'Word TTS not available' });
    }

    const wav = ttsWordCache.lookup(filename);
    if (!wav) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(wav);
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
