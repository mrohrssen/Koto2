/**
 * @fileoverview Settings routes
 *
 * Handles /api/config and /api/settings endpoints
 */

import { Router } from 'express';
import { getProviders, getJLPTLevels } from '../ai-providers.js';
import { clearVocabCache } from '../jpdb.js';
import { updateTTSConfig } from '../game/prefetch.js';

/**
 * Create settings router
 * @param {object} deps - Dependencies
 * @param {function} deps.getSettings - Get current settings object
 * @param {function} deps.saveSettings - Save settings to file
 * @returns {Router}
 */
export default function createSettingsRoutes({ getSettings, saveSettings }) {
  const router = Router();

  // Config - static configuration info
  router.get('/config', (req, res) => {
    res.json({
      providers: getProviders(),
      jlptLevels: getJLPTLevels()
    });
  });

  // Settings - GET current settings
  router.get('/settings', (req, res) => {
    const settings = getSettings();
    updateTTSConfig({
      enabled: settings.gameTtsEnabled ?? true,
      speakerId: settings.gameTtsSpeakerId || 13,
      speed: settings.gameTtsSpeed || 0.9,
      volume: settings.gameTtsVolume || 1.0
    });

    res.json({
      jpdbDeckId: settings.jpdbDeckId || '',
      jlptLevel: settings.jlptLevel || 'N4',
      gameTtsEnabled: settings.gameTtsEnabled ?? true,
      gameTtsSpeakerId: settings.gameTtsSpeakerId || 13,
      gameTtsSpeed: settings.gameTtsSpeed || 0.9,
      gameTtsVolume: settings.gameTtsVolume || 1.0,
      voiceGender: settings.voiceGender || 'boy',
      reviewType: settings.reviewType || 'dialog',
      dailyWordLimit: settings.dailyWordLimit ?? 10
    });
  });

  // Settings - POST update settings
  router.post('/settings', (req, res) => {
    const settings = getSettings();
    const { jpdbDeckId, jlptLevel,
            gameTtsEnabled, gameTtsSpeakerId, gameTtsSpeed, gameTtsVolume,
            reviewType, dailyWordLimit } = req.body;

    if (jpdbDeckId !== undefined) {
      settings.jpdbDeckId = jpdbDeckId;
      clearVocabCache();
    }
    if (jlptLevel) settings.jlptLevel = jlptLevel;

    if (gameTtsEnabled !== undefined) settings.gameTtsEnabled = gameTtsEnabled;
    if (gameTtsSpeakerId !== undefined) settings.gameTtsSpeakerId = gameTtsSpeakerId;
    if (gameTtsSpeed !== undefined) settings.gameTtsSpeed = gameTtsSpeed;
    if (gameTtsVolume !== undefined) settings.gameTtsVolume = gameTtsVolume;

    if (req.body.voiceGender !== undefined) {
      const vg = req.body.voiceGender;
      if (vg === 'boy' || vg === 'girl') {
        settings.voiceGender = vg;
      }
    }

    if (reviewType !== undefined) settings.reviewType = reviewType;

    if (dailyWordLimit !== undefined) {
      const limit = parseInt(dailyWordLimit, 10);
      if (!isNaN(limit) && limit >= 0 && limit <= 50) {
        settings.dailyWordLimit = limit;
      }
    }

    if (gameTtsEnabled !== undefined || gameTtsSpeakerId !== undefined ||
        gameTtsSpeed !== undefined || gameTtsVolume !== undefined) {
      updateTTSConfig({
        enabled: settings.gameTtsEnabled,
        speakerId: settings.gameTtsSpeakerId,
        speed: settings.gameTtsSpeed,
        volume: settings.gameTtsVolume
      });
    }

    saveSettings(settings);
    res.json({ success: true });
  });

  return router;
}
