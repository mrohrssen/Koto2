import * as audio from '../audio.js';
import * as tts from '../tts.js';
import { setLang } from './i18n.js';
import { getAuthHeaders, apiUrl } from '../api.js';
import { loadServerSettings, saveServerSettings } from '../settings.js';

let takeover = null;
let sceneModule = null;
let settingsModule = null;
let getGameState = null;
let updateGameState = null;

export function init(callbacks) {
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
  settingsModule = callbacks.settings;
  getGameState = callbacks.getGameState || null;
  updateGameState = callbacks.updateGameState || null;
}

/** Open settings takeover */
export async function openSettings() {
  takeover.open('settings');
  const content = takeover.getContent('settings');

  // Show loading state
  content.innerHTML = '<div style="padding:20px;text-align:center">Loading...</div>';

  // Load current key info and server settings in parallel
  const [keyInfo, serverSettings] = await Promise.all([
    settingsModule.loadApiKeysFromServer(),
    loadServerSettings()
  ]);
  const voiceGender = serverSettings.voiceGender || 'boy';
  const dailyWordLimitSetting = serverSettings.dailyWordLimit ?? 10;
  const kanaMode = getGameState?.()?.meta?.kanaMode ?? false;

  content.innerHTML = `
    <h3 style="margin:16px">Settings</h3>
    <div style="padding:0 16px">
      <label class="settings-label">
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
          min="0" max="50" value="${dailyWordLimitSetting}">
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
      <label class="settings-label" style="margin-top:8px">
        <input type="checkbox" id="settings-japanify-ui"
          ${settingsModule.isJapanifyUIEnabled?.() ? 'checked' : ''}>
        日本語 UI
      </label>
      <label class="settings-label" style="margin-top:8px">
        <input type="checkbox" id="settings-kana-mode"
          ${kanaMode ? 'checked' : ''}>
        Hiragana Learning Mode
        <small style="color:#888;font-size:0.85em;display:block;margin-top:2px">Practice hiragana in combat — cards are auto-answered and kana questions appear instead</small>
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
      <div class="settings-label" style="margin-top:8px">
        Voice Gender
        <div style="display:flex;gap:12px;margin-top:4px">
          <label><input type="radio" name="voice-gender" value="boy" ${voiceGender === 'boy' ? 'checked' : ''}> Boy</label>
          <label><input type="radio" name="voice-gender" value="girl" ${voiceGender === 'girl' ? 'checked' : ''}> Girl</label>
        </div>
      </div>
      <label class="settings-label">
        <input type="checkbox" id="settings-audio-muted"
          ${audio.isMuted() ? 'checked' : ''}>
        Mute All Audio
      </label>

      <h4 style="margin:20px 0 8px;color:var(--accent)">Data</h4>
      <button class="ui-btn" id="settings-clear-dialogue-cache-btn"
        style="width:100%;background:var(--surface-2);color:var(--text)">Clear Dialogue Cache</button>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">Regenerates all NPC and creature dialogue on next exploration.</small>

      <button class="ui-btn" id="settings-reset-prologue-btn"
        style="width:100%;background:var(--surface-2);color:var(--text);margin-top:10px">Reset Prologue</button>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">Replay the intro prologue on next page load.</small>

      <button class="ui-btn" id="settings-reset-tutorial-btn"
        style="width:100%;background:var(--surface-2);color:var(--text);margin-top:10px">Reset Tutorial</button>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">Replay the tutorial on next run.</small>

      <button class="ui-btn" id="settings-reset-user-data-btn"
        style="width:100%;background:#b42318;color:white;margin-top:10px">Reset User Data</button>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">Erase this account's game and learning progress. Login and settings are kept.</small>

      <button class="ui-btn" id="settings-delete-account-btn"
        style="width:100%;background:#7a1f17;color:white;margin-top:18px">Delete Account</button>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">Permanently delete your login, game progress, learning data, settings, and bug reports.</small>

      <h4 style="margin:20px 0 8px;color:var(--accent)">Legal</h4>
      <a href="/privacy.html" style="display:block;color:var(--accent);margin-bottom:8px">Privacy Policy</a>

      <button class="ui-btn ui-btn--primary" id="settings-save-btn"
        style="margin-top:20px;width:100%">Save</button>
    </div>
  `;

  // Auto-unmute when any volume slider is adjusted
  function autoUnmute() {
    const muteCheckbox = document.getElementById('settings-audio-muted');
    if (muteCheckbox?.checked) {
      muteCheckbox.checked = false;
      audio.unmute();
      tts.setMuted(false);
    }
  }

  // Real-time volume slider feedback
  document.getElementById('settings-bgm-volume')?.addEventListener('input', (e) => {
    autoUnmute();
    audio.setVolume('bgm', parseInt(e.target.value) / 100);
  });
  let sfxTestTimeout;
  document.getElementById('settings-sfx-volume')?.addEventListener('input', (e) => {
    autoUnmute();
    audio.setVolume('sfx', parseInt(e.target.value) / 100);
    clearTimeout(sfxTestTimeout);
    sfxTestTimeout = setTimeout(() => audio.playSFX('button-tap'), 300);
  });
  document.getElementById('settings-tts-volume')?.addEventListener('input', (e) => {
    autoUnmute();
    tts.setVolume(parseInt(e.target.value) / 100);
  });

  document.getElementById('settings-clear-dialogue-cache-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Clearing...';
    try {
      const [npcResp, creatureResp] = await Promise.all([
        fetch(apiUrl('/api/game/clear-npc-dialogue-cache'), { method: 'POST', headers: getAuthHeaders() }),
        fetch(apiUrl('/api/game/clear-creature-dialogue-cache'), { method: 'POST', headers: getAuthHeaders() })
      ]);
      if (npcResp.ok && creatureResp.ok) {
        btn.textContent = 'Cleared!';
        setTimeout(() => { btn.textContent = 'Clear Dialogue Cache'; btn.disabled = false; }, 2000);
      } else {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Clear Dialogue Cache'; btn.disabled = false; }, 2000);
      }
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Clear Dialogue Cache'; btn.disabled = false; }, 2000);
    }
  });

  document.getElementById('settings-reset-prologue-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    try {
      const resp = await fetch(apiUrl('/api/game/prologue-reset'), { method: 'POST', headers: getAuthHeaders() });
      if (resp.ok) {
        btn.textContent = 'Done — reload to replay';
        setTimeout(() => { btn.textContent = 'Reset Prologue'; btn.disabled = false; }, 3000);
      } else {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Reset Prologue'; btn.disabled = false; }, 2000);
      }
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Reset Prologue'; btn.disabled = false; }, 2000);
    }
  });

  document.getElementById('settings-reset-tutorial-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    try {
      const resp = await fetch(apiUrl('/api/game/tutorial-reset'), { method: 'POST', headers: getAuthHeaders() });
      if (resp.ok) {
        btn.textContent = 'Done — start a new run to replay';
        setTimeout(() => { btn.textContent = 'Reset Tutorial'; btn.disabled = false; }, 3000);
      } else {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Reset Tutorial'; btn.disabled = false; }, 2000);
      }
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Reset Tutorial'; btn.disabled = false; }, 2000);
    }
  });

  document.getElementById('settings-reset-user-data-btn')?.addEventListener('click', async (e) => {
    const confirmed = confirm(
      'Reset all progress for this user?\n\nThis erases tutorial and prologue status, creatures befriended, exposed words, flash cards, and current run progress. Your login and settings will be kept.'
    );
    if (!confirmed) return;

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    try {
      const resp = await fetch(apiUrl('/api/game/reset-user-data'), {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (resp.ok) {
        btn.textContent = 'Reset complete';
        sceneModule.showToast?.('User progress reset', 1600);
        setTimeout(() => window.location.reload(), 600);
      } else {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Reset User Data'; btn.disabled = false; }, 2000);
      }
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Reset User Data'; btn.disabled = false; }, 2000);
    }
  });

  document.getElementById('settings-delete-account-btn')?.addEventListener('click', async (e) => {
    const password = prompt(
      'Delete your Koto account permanently?\n\nEnter your password to delete your login, progress, learning data, settings, and bug reports.'
    );
    if (!password) return;

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    try {
      const resp = await fetch(apiUrl('/api/auth/me'), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password })
      });
      if (resp.ok) {
        localStorage.removeItem('authToken');
        sceneModule.showToast?.('Account deleted', 1600);
        setTimeout(() => window.location.reload(), 600);
      } else {
        let message = 'Delete failed';
        try {
          const data = await resp.json();
          message = data?.error || message;
        } catch {}
        btn.textContent = message;
        setTimeout(() => { btn.textContent = 'Delete Account'; btn.disabled = false; }, 2500);
      }
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Delete Account'; btn.disabled = false; }, 2000);
    }
  });

  document.getElementById('settings-save-btn')?.addEventListener('click', async () => {
    const jlptLevel = document.getElementById('settings-jlpt')?.value;
    const dailyWordLimit = parseInt(document.getElementById('settings-daily-limit')?.value || '10');
    const ttsEnabled = document.getElementById('settings-tts-enabled')?.checked;
    const bgmVol = parseInt(document.getElementById('settings-bgm-volume')?.value || '70') / 100;
    const sfxVol = parseInt(document.getElementById('settings-sfx-volume')?.value || '80') / 100;
    const ttsVol = parseInt(document.getElementById('settings-tts-volume')?.value || '100') / 100;
    const audioMuted = document.getElementById('settings-audio-muted')?.checked;
    const selectedVoiceGender = document.querySelector('input[name="voice-gender"]:checked')?.value || 'boy';

    // Apply local-only settings immediately (never blocked by server calls)
    const aiNarration = document.getElementById('settings-ai-narration')?.checked;
    if (settingsModule.setAiNarrationEnabled) {
      settingsModule.setAiNarrationEnabled(aiNarration);
    }
    if (settingsModule.setTtsEnabled) {
      settingsModule.setTtsEnabled(ttsEnabled);
    }
    tts.setEnabled(ttsEnabled);

    const japanifyUI = document.getElementById('settings-japanify-ui')?.checked;
    if (settingsModule.setJapanifyUIEnabled) {
      settingsModule.setJapanifyUIEnabled(japanifyUI);
    }
    setLang(japanifyUI ? 'ja' : 'en');

    audio.setVolume('bgm', bgmVol);
    audio.setVolume('sfx', sfxVol);
    tts.setVolume(ttsVol);
    tts.setMuted(audioMuted);
    localStorage.setItem('jrpg_ttsVolume', String(ttsVol));
    if (audioMuted) { audio.mute(); } else { audio.unmute(); }

    // Save learning settings to server.
    const keysToSave = {};
    if (jlptLevel) keysToSave.jlptLevel = jlptLevel;

    if (Object.keys(keysToSave).length > 0) {
      const saved = await settingsModule.saveApiKeysToServer(keysToSave);
      if (!saved) {
        sceneModule.showToast('Failed to save server settings', 2000);
        return;
      }
    }

    // Save global server-backed settings.
    const serverSettingsToSave = {};
    if (selectedVoiceGender !== voiceGender) {
      serverSettingsToSave.voiceGender = selectedVoiceGender;
    }
    if (!isNaN(dailyWordLimit) && dailyWordLimit !== dailyWordLimitSetting) {
      serverSettingsToSave.dailyWordLimit = dailyWordLimit;
    }
    if (Object.keys(serverSettingsToSave).length > 0) {
      await saveServerSettings(serverSettingsToSave);
    }

    // Save kana mode to server (updates meta.kanaMode)
    const kanaModeEnabled = document.getElementById('settings-kana-mode')?.checked ?? false;
    if (kanaModeEnabled !== kanaMode) {
      try {
        const resp = await fetch(apiUrl('/api/game/kana-mode'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: kanaModeEnabled }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (updateGameState && getGameState) {
            const current = getGameState();
            updateGameState({ ...current, meta: { ...current.meta, kanaMode: data.kanaMode } });
          }
        }
      } catch {
        sceneModule.showToast('Failed to save kana mode', 2000);
        return;
      }
    }

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
