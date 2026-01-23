/**
 * Modals UI Module (Mobile) - Settings takeover only
 *
 * Strips upgrades, stats, and liberation tracker (future work).
 */

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
      <button class="action-btn action-btn-primary" id="settings-save-btn"
        style="margin-top:20px;width:100%">Save</button>
    </div>
  `;

  document.getElementById('settings-save-btn')?.addEventListener('click', () => {
    const jpdbKey = document.getElementById('settings-jpdb-key')?.value?.trim();
    const ttsEnabled = document.getElementById('settings-tts-enabled')?.checked;

    settingsModule.saveApiKey('jpdbApiKey', jpdbKey);
    if (settingsModule.setTtsEnabled) {
      settingsModule.setTtsEnabled(ttsEnabled);
    }

    sceneModule.showToast('Settings saved', 2000);
    takeover.close('settings');
  });
}

/** Close settings */
export function closeSettings() {
  takeover.close('settings');
}
