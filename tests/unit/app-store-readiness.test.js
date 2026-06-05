import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf-8');
}

describe('App Store readiness static checks', () => {
  it('does not expose invite-code registration UI', () => {
    const html = read('public/index.html');
    const authJs = read('public/js/ui/auth.js');

    assert.equal(html.includes('auth-invite'), false);
    assert.equal(authJs.includes('Invite code required'), false);
  });

  it('does not expose known-words upload during registration', () => {
    const html = read('public/index.html');
    const authJs = read('public/js/ui/auth.js');

    assert.equal(html.includes('word-list-upload'), false);
    assert.equal(html.includes('wordListField'), false);
    assert.equal(html.includes('Known Words'), false);
    assert.equal(authJs.includes('word-list-upload'), false);
  });

  it('does not expose broad playtest controls in settings', () => {
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(settingsUi.includes('Force Room Type'), false);
    assert.equal(settingsUi.includes('100 ATK (Debug)'), false);
    assert.equal(settingsUi.includes('Add Fusion Core'), false);
  });

  it('does not expose lookup or experimental language modes in game menus', () => {
    const html = read('public/index.html');
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(html.includes('lookup-menu-btn'), false);
    assert.equal(html.includes('> Lookup<'), false);
    assert.equal(settingsUi.includes('settings-kana-mode'), false);
    assert.equal(settingsUi.includes('Hiragana Learning Mode'), false);
    assert.equal(settingsUi.includes('settings-japanify-ui'), false);
    assert.equal(settingsUi.includes('\u65e5\u672c\u8a9e UI'), false);
    assert.equal(settingsUi.includes('settings-tts-enabled'), false);
    assert.equal(settingsUi.includes('Enable TTS'), false);
    assert.equal(settingsUi.includes('settings-ai-narration'), false);
    assert.equal(settingsUi.includes('Enable AI Narration'), false);
  });

  it('gates Personalized Dialogue as a debug-only user setting while keeping consent in registration', () => {
    const html = read('public/index.html');
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(html.includes('third-party AI providers'), true);
    assert.equal(settingsUi.includes('settings-ai-conversations'), true);
    assert.equal(settingsUi.includes('Personalized Dialogue'), true);
    assert.equal(settingsUi.includes("Object.hasOwn(keyInfo, 'aiConversationsEnabled')"), true);
    assert.equal(settingsUi.includes('settings-ai-consent'), false);
  });

  it('keeps legacy AI narration localStorage from disabling server AI conversations', async () => {
    const store = new Map([
      ['jrpg_aiNarrationEnabled', 'false'],
    ]);
    const previousLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
    };

    try {
      const settingsUrl = pathToFileURL(join(root, 'public/js/settings.js')).href;
      const settings = await import(`${settingsUrl}?aiConversations=${Date.now()}`);

      assert.equal(settings.isAiNarrationEnabled(), true);

      settings.setAiNarrationEnabled(false);

      assert.equal(settings.isAiNarrationEnabled(), true);
    } finally {
      globalThis.localStorage = previousLocalStorage;
    }
  });

  it('guards debug super attack behind the server-provided allowlisted setting', () => {
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(settingsUi.includes("Object.hasOwn(serverSettings, 'debugSuperAttack')"), true);
    assert.equal(settingsUi.includes('settings-debug-super-attack'), true);
  });

  it('guards debug force befriend behind the server-provided allowlisted setting', () => {
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(settingsUi.includes("Object.hasOwn(serverSettings, 'debugForceBefriend')"), true);
    assert.equal(settingsUi.includes('settings-debug-force-befriend'), true);
  });

  it('guards debug crystal grants behind the server-provided allowlisted setting', () => {
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(settingsUi.includes("Object.hasOwn(serverSettings, 'debugSuperAttack')"), true);
    assert.equal(settingsUi.includes('settings-debug-add-crystals-btn'), true);
  });

  it('guards debug fusion core grants behind the server-provided allowlisted setting', () => {
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(settingsUi.includes("Object.hasOwn(serverSettings, 'debugSuperAttack')"), true);
    assert.equal(settingsUi.includes('settings-debug-add-fusion-core-btn'), true);
  });

  it('ships an in-app privacy policy link and page', () => {
    const html = read('public/index.html');

    assert.equal(html.includes('Privacy Policy'), true);
    assert.equal(html.includes('/privacy.html'), true);
    assert.equal(existsSync(join(root, 'public/privacy.html')), true);
  });

  it('discloses third-party AI data sharing during registration, not settings', () => {
    const html = read('public/index.html');
    const authJs = read('public/js/ui/auth.js');
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(html.includes('third-party AI providers'), true);
    assert.equal(authJs.includes('auth-ai-consent'), true);
    assert.equal(settingsUi.includes('settings-ai-consent'), false);
  });

  it('offers self-service account deletion in settings', () => {
    const settingsUi = read('public/js/ui/modals.js');

    assert.equal(settingsUi.includes('Delete Account'), true);
    assert.equal(settingsUi.includes('/api/auth/me'), true);
  });

  it('keeps TTS volume local instead of server-backed', () => {
    const settingsUi = read('public/js/ui/modals.js');
    const gameJs = read('public/game.js');

    assert.equal(settingsUi.includes('const ttsVolumeSetting = tts.getVolume()'), true);
    assert.equal(settingsUi.includes('serverSettingsToSave.gameTtsEnabled = true'), true);
    assert.equal(settingsUi.includes('serverSettingsToSave.gameTtsVolume = ttsVol'), false);
    assert.equal(gameJs.includes("localStorage.getItem('jrpg_ttsVolume')"), false);
  });

  it('has the app icon files referenced by the manifest and Apple touch icon', () => {
    for (const icon of ['app-180.webp', 'app-192.webp', 'app-512.webp']) {
      assert.equal(existsSync(join(root, 'public/assets/icons', icon)), true, `${icon} should exist`);
    }
  });

  it('does not ship localhost debug beacons in the frontend API client', () => {
    const apiJs = read('public/js/api.js');
    const gameJs = read('public/game.js');

    assert.equal(apiJs.includes('127.0.0.1:7503'), false);
    assert.equal(apiJs.includes('debug-add-core'), false);
    assert.equal(apiJs.includes('jrpg_forceRoomType'), false);
    assert.equal(gameJs.includes('devBattlefieldPreview'), false);
    assert.equal(gameJs.includes('__inspector'), false);
    assert.equal(gameJs.includes('__intentLog'), false);
    assert.equal(gameJs.includes('window.gameState ='), false);
  });
});
