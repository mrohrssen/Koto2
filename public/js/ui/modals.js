/**
 * Modals UI Module (Mobile) - Settings takeover only
 *
 * Strips upgrades, stats, and liberation tracker (future work).
 */

import * as audio from '../audio.js';

let takeover = null;
let sceneModule = null;
let settingsModule = null;

export function init(callbacks) {
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
  settingsModule = callbacks.settings;
}

/** Open settings takeover */
export function openSettings() {
  takeover.open('settings');
  const content = takeover.getContent('settings');

  const apiKeys = settingsModule.getApiKeys();

  content.innerHTML = `
    <h3 style="margin:16px">Settings</h3>
    <div style="padding:0 16px">
      <label class="settings-label">
        JPDB API Key
        <input type="password" id="settings-jpdb-key" class="settings-input"
          value="${apiKeys.jpdbApiKey || ''}" placeholder="Enter JPDB API key">
      </label>
      <label class="settings-label" style="margin-top:12px">
        <input type="checkbox" id="settings-tts-enabled"
          ${settingsModule.isTtsEnabled?.() ? 'checked' : ''}>
        Enable TTS
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
        <input type="checkbox" id="settings-audio-muted"
          ${audio.isMuted() ? 'checked' : ''}>
        Mute All Audio
      </label>

      <button class="action-btn action-btn-primary" id="settings-save-btn"
        style="margin-top:20px;width:100%">Save</button>
    </div>
  `;

  document.getElementById('settings-save-btn')?.addEventListener('click', () => {
    const jpdbKey = document.getElementById('settings-jpdb-key')?.value?.trim();
    const ttsEnabled = document.getElementById('settings-tts-enabled')?.checked;
    const bgmVol = parseInt(document.getElementById('settings-bgm-volume')?.value || '70') / 100;
    const sfxVol = parseInt(document.getElementById('settings-sfx-volume')?.value || '80') / 100;
    const audioMuted = document.getElementById('settings-audio-muted')?.checked;

    settingsModule.saveApiKey('jpdbApiKey', jpdbKey);
    if (settingsModule.setTtsEnabled) {
      settingsModule.setTtsEnabled(ttsEnabled);
    }

    audio.setVolume('bgm', bgmVol);
    audio.setVolume('sfx', sfxVol);
    if (audioMuted) { audio.mute(); } else { audio.unmute(); }

    sceneModule.showToast('Settings saved', 2000);
    takeover.close('settings');
  });
}

/** Close settings */
export function closeSettings() {
  takeover.close('settings');
}
