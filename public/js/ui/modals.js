/**
 * @file modals.js - Settings Panel UI
 *
 * PURPOSE:
 * Renders the settings takeover panel with API key configuration, audio
 * controls, and user preferences. Handles saving settings to server and
 * local storage.
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with takeover, scene, and settings module refs
 * - openSettings(): Open settings takeover and render content
 * - closeSettings(): Close settings takeover
 *
 * DEPENDENCIES:
 * - ../audio.js: BGM/SFX volume control, mute toggle
 * - ../tts.js: TTS volume control
 * - Callbacks: takeover (panel management), scene (toast), settings (API keys)
 *
 * SETTINGS AVAILABLE:
 * - JPDB API Key (server-stored)
 * - AI API Key + Provider + Model (server-stored)
 * - JLPT Level (server-stored)
 * - TTS enabled toggle (local)
 * - BGM/SFX/TTS volume sliders (local)
 * - Mute all audio toggle (local)
 */

import * as audio from '../audio.js';
import * as tts from '../tts.js';

let takeover = null;
let sceneModule = null;
let settingsModule = null;

export function init(callbacks) {
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
  settingsModule = callbacks.settings;
}

/** Open settings takeover */
export async function openSettings() {
  takeover.open('settings');
  const content = takeover.getContent('settings');

  // Show loading state
  content.innerHTML = '<div style="padding:20px;text-align:center">Loading...</div>';

  // Load current key info from server
  const keyInfo = await settingsModule.loadApiKeysFromServer();

  content.innerHTML = `
    <h3 style="margin:16px">Settings</h3>
    <div style="padding:0 16px">
      <label class="settings-label">
        JPDB API Key
        <input type="password" id="settings-jpdb-key" class="settings-input"
          placeholder="${keyInfo.hasJpdbKey ? '••••••••' : 'Enter JPDB API key'}">
      </label>
      <label class="settings-label" style="margin-top:12px">
        Bunpro Token
        <input type="password" id="settings-bunpro-token" class="settings-input"
          placeholder="${keyInfo.hasBunproToken ? '••••••••' : 'Enter Bunpro token'}">
        <small style="color:#888;font-size:0.85em">For grammar reviews. Find at bunpro.jp → Settings → API</small>
      </label>
      <label class="settings-label" style="margin-top:12px">
        AI API Key
        <input type="password" id="settings-ai-key" class="settings-input"
          placeholder="${keyInfo.hasAiKey ? '••••••••' : 'Enter AI API key'}">
      </label>
      <label class="settings-label" style="margin-top:12px">
        AI Provider
        <select id="settings-ai-provider" class="settings-input">
          <option value="openai" ${keyInfo.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="anthropic" ${keyInfo.aiProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          <option value="google" ${keyInfo.aiProvider === 'google' ? 'selected' : ''}>Google</option>
          <option value="openrouter" ${keyInfo.aiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
        </select>
      </label>
      <label class="settings-label" style="margin-top:12px">
        Model
        <input type="text" id="settings-model" class="settings-input"
          value="${keyInfo.openaiModel || 'gpt-4o-mini'}" placeholder="e.g. gpt-4o-mini">
      </label>
      <label class="settings-label" style="margin-top:12px">
        JLPT Level
        <select id="settings-jlpt" class="settings-input">
          <option value="N5" ${keyInfo.jlptLevel === 'N5' ? 'selected' : ''}>N5</option>
          <option value="N4" ${(keyInfo.jlptLevel || 'N4') === 'N4' ? 'selected' : ''}>N4</option>
          <option value="N3" ${keyInfo.jlptLevel === 'N3' ? 'selected' : ''}>N3</option>
          <option value="N2" ${keyInfo.jlptLevel === 'N2' ? 'selected' : ''}>N2</option>
          <option value="N1" ${keyInfo.jlptLevel === 'N1' ? 'selected' : ''}>N1</option>
        </select>
      </label>
      <label class="settings-label" style="margin-top:12px">
        Daily Word Limit
        <input type="number" id="settings-daily-limit" class="settings-input"
          min="0" max="50" value="${keyInfo.dailyWordLimit ?? 10}">
        <small style="color:#888;font-size:0.85em">0 = skip discovery rooms, max 50</small>
      </label>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e0e0e0">
      <label class="settings-label">
        <input type="checkbox" id="settings-tts-enabled"
          ${settingsModule.isTtsEnabled?.() ? 'checked' : ''}>
        Enable TTS
      </label>
      <label class="settings-label" style="margin-top:8px">
        <input type="checkbox" id="settings-ai-narration"
          ${settingsModule.isAiNarrationEnabled?.() !== false ? 'checked' : ''}>
        Enable AI Narration
      </label>

      <h4 style="margin:20px 0 8px;color:var(--accent)">Audio</h4>
      <label class="settings-label">
        BGM Volume
        <input type="range" id="settings-bgm-volume" min="0" max="100"
          value="${Math.round(audio.getVolume('bgm') * 100)}" class="settings-range">
      </label>
      <label class="settings-label">
        SFX Volume
        <input type="range" id="settings-sfx-volume" min="0" max="100"
          value="${Math.round(audio.getVolume('sfx') * 100)}" class="settings-range">
      </label>
      <label class="settings-label">
        TTS Volume
        <input type="range" id="settings-tts-volume" min="0" max="100"
          value="${Math.round(tts.getVolume() * 100)}" class="settings-range">
      </label>
      <label class="settings-label">
        <input type="checkbox" id="settings-audio-muted"
          ${audio.isMuted() ? 'checked' : ''}>
        Mute All Audio
      </label>

      <button class="action-btn action-btn-primary" id="settings-save-btn"
        style="margin-top:20px;width:100%">Save</button>
    </div>
  `;

  document.getElementById('settings-save-btn')?.addEventListener('click', async () => {
    const jpdbKey = document.getElementById('settings-jpdb-key')?.value?.trim();
    const bunproToken = document.getElementById('settings-bunpro-token')?.value?.trim();
    const aiKey = document.getElementById('settings-ai-key')?.value?.trim();
    const aiProvider = document.getElementById('settings-ai-provider')?.value;
    const model = document.getElementById('settings-model')?.value?.trim();
    const jlptLevel = document.getElementById('settings-jlpt')?.value;
    const dailyWordLimit = parseInt(document.getElementById('settings-daily-limit')?.value || '10');
    const ttsEnabled = document.getElementById('settings-tts-enabled')?.checked;
    const bgmVol = parseInt(document.getElementById('settings-bgm-volume')?.value || '70') / 100;
    const sfxVol = parseInt(document.getElementById('settings-sfx-volume')?.value || '80') / 100;
    const ttsVol = parseInt(document.getElementById('settings-tts-volume')?.value || '100') / 100;
    const audioMuted = document.getElementById('settings-audio-muted')?.checked;

    // Save API keys to server (only send non-empty values)
    const keysToSave = {};
    if (jpdbKey) keysToSave.jpdbApiKey = jpdbKey;
    if (bunproToken) keysToSave.bunproToken = bunproToken;
    if (aiKey) keysToSave.aiApiKey = aiKey;
    if (aiProvider) keysToSave.aiProvider = aiProvider;
    if (model) keysToSave.openaiModel = model;
    if (jlptLevel) keysToSave.jlptLevel = jlptLevel;
    if (!isNaN(dailyWordLimit)) {
      keysToSave.dailyWordLimit = dailyWordLimit;
    }

    if (Object.keys(keysToSave).length > 0) {
      const saved = await settingsModule.saveApiKeysToServer(keysToSave);
      if (!saved) {
        sceneModule.showToast('Failed to save API keys', 2000);
        return;
      }
    }

    // Save local-only settings
    const aiNarration = document.getElementById('settings-ai-narration')?.checked;
    if (settingsModule.setAiNarrationEnabled) {
      settingsModule.setAiNarrationEnabled(aiNarration);
    }
    if (settingsModule.setTtsEnabled) {
      settingsModule.setTtsEnabled(ttsEnabled);
    }
    tts.setEnabled(ttsEnabled);

    audio.setVolume('bgm', bgmVol);
    audio.setVolume('sfx', sfxVol);
    tts.setVolume(ttsVol);
    tts.setMuted(audioMuted);
    localStorage.setItem('jrpg_ttsVolume', String(ttsVol));
    if (audioMuted) { audio.mute(); } else { audio.unmute(); }

    sceneModule.showToast('Settings saved', 2000);
    takeover.close('settings');
  });
}

/** Close settings */
export function closeSettings() {
  takeover.close('settings');
}

// ============ MENU SHEET ============

let menuSheet = null;
let menuBackdrop = null;

export function initMenu() {
  menuSheet = document.getElementById('menu-sheet');
  menuBackdrop = document.getElementById('menu-backdrop');
  menuBackdrop?.addEventListener('click', closeMenu);
  // Close menu when any menu item is clicked
  menuSheet?.addEventListener('click', (e) => {
    if (e.target.closest('.menu-item')) closeMenu();
  });
}

export function toggleMenu() {
  if (menuSheet?.classList.contains('visible')) {
    closeMenu();
  } else {
    openMenu();
  }
}

export function openMenu() {
  menuSheet?.classList.add('visible');
  menuBackdrop?.classList.add('visible');
}

export function closeMenu() {
  menuSheet?.classList.remove('visible');
  menuBackdrop?.classList.remove('visible');
}
