import { Router } from 'express';
import { getProviders, getJLPTLevels } from '../ai-providers.js';
import { updateTTSConfig } from '../game/prefetch.js';
import { optionalAuth } from '../auth/middleware.js';
import {
  canUseDebugSuperAttack,
  getDebugForceBefriendForUser,
  getDebugSuperAttackForUser,
  setDebugForceBefriendForUser,
  setDebugSuperAttackForUser
} from '../game/debug-super-attack-access.js';

/**
 * Create settings router
 * @param {object} deps - Dependencies
 * @param {function} deps.getSettings - Get current settings object
 * @param {function} deps.saveSettings - Save settings to file
 * @returns {Router}
 */
export default function createSettingsRoutes({ getSettings, saveSettings }) {
  const router = Router();

  router.use(optionalAuth);

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
      speakerId: settings.gameTtsSpeakerId ?? 13,
      speed: settings.gameTtsSpeed ?? 0.9
    });

    const response = {
      jlptLevel: settings.jlptLevel || 'N4',
      gameTtsEnabled: settings.gameTtsEnabled ?? true,
      gameTtsSpeakerId: settings.gameTtsSpeakerId ?? 13,
      gameTtsSpeed: settings.gameTtsSpeed ?? 0.9,
      voiceGender: settings.voiceGender || 'boy',
      reviewType: settings.reviewType || 'dialog',
      dailyWordLimit: settings.dailyWordLimit ?? 10
    };

    if (canUseDebugSuperAttack(req.user)) {
      response.debugSuperAttack = getDebugSuperAttackForUser(settings, req.user);
      response.debugForceBefriend = getDebugForceBefriendForUser(settings, req.user);
    }

    res.json(response);
  });

  // Settings - POST update settings
  router.post('/settings', (req, res) => {
    const settings = getSettings();
    const { jlptLevel,
            gameTtsEnabled, gameTtsSpeakerId, gameTtsSpeed,
            reviewType, dailyWordLimit } = req.body;

    if (jlptLevel) settings.jlptLevel = jlptLevel;

    if (gameTtsEnabled !== undefined) settings.gameTtsEnabled = gameTtsEnabled;
    if (gameTtsSpeakerId !== undefined) settings.gameTtsSpeakerId = gameTtsSpeakerId;
    if (gameTtsSpeed !== undefined) settings.gameTtsSpeed = gameTtsSpeed;

    if (reviewType !== undefined) settings.reviewType = reviewType;

    if (dailyWordLimit !== undefined) {
      const limit = parseInt(dailyWordLimit, 10);
      if (!isNaN(limit) && limit >= 0 && limit <= 50) {
        settings.dailyWordLimit = limit;
      }
    }

    if (req.body.debugSuperAttack !== undefined) {
      setDebugSuperAttackForUser(settings, req.user, req.body.debugSuperAttack);
    }
    if (req.body.debugForceBefriend !== undefined) {
      setDebugForceBefriendForUser(settings, req.user, req.body.debugForceBefriend);
    }

    if (gameTtsEnabled !== undefined || gameTtsSpeakerId !== undefined ||
        gameTtsSpeed !== undefined) {
      updateTTSConfig({
        enabled: settings.gameTtsEnabled,
        speakerId: settings.gameTtsSpeakerId,
        speed: settings.gameTtsSpeed
      });
    }

    saveSettings(settings);
    res.json({ success: true });
  });

  return router;
}
