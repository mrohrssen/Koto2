import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../public/js/audio.js', {
  namedExports: {
    getVolume: () => 0.7,
    setVolume: () => {},
    isMuted: () => false,
    mute: () => {},
    unmute: () => {},
    playSFX: () => {},
  },
});

await mock.module('../../../public/js/tts.js', {
  namedExports: {
    getVolume: () => 1,
    setVolume: () => {},
    setEnabled: () => {},
  },
});

await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: {
    setLang: () => {},
  },
});

let displayModeCalls = [];

await mock.module('../../../public/js/api.js', {
  namedExports: {
    getAuthHeaders: () => ({}),
    apiUrl: path => path,
    setJapaneseDisplayMode: async (mode) => {
      displayModeCalls.push(mode);
      return {
        ok: true,
        state: {
          meta: {
            japaneseDisplayMode: mode,
            kanaMode: mode === 'hiragana',
          },
        },
      };
    },
  },
});

await mock.module('../../../public/js/settings.js', {
  namedExports: {
    loadServerSettings: async () => ({
      jlptLevel: 'N5',
      voiceGender: 'boy',
      dailyWordLimit: 10,
    }),
    saveServerSettings: async () => true,
  },
});

const { init, openSettings } = await import('../../../public/js/ui/modals.js');

function installSettingsDocument() {
  const elements = new Map();
  globalThis.document = {
    getElementById: id => {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          checked: false,
          value: '',
          disabled: false,
          textContent: '',
          addEventListener(type, handler) {
            this[`on${type}`] = handler;
          },
          async click() {
            if (this.onclick) await this.onclick({ target: this });
          },
        });
      }
      return elements.get(id);
    },
  };
  return elements;
}

describe('settings modal', () => {
  it('does not render voice gender controls', async () => {
    const content = { innerHTML: '' };
    globalThis.document = {
      getElementById: () => null,
    };

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5' }),
      },
      getGameState: () => ({ meta: {} }),
    });

    await openSettings();

    assert.doesNotMatch(content.innerHTML, /Voice Gender/);
    assert.doesNotMatch(content.innerHTML, /name="voice-gender"/);
  });

  it('renders Enable Kanji mode from player meta', async () => {
    const content = { innerHTML: '' };
    installSettingsDocument();

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5' }),
        saveApiKeysToServer: async () => true,
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'natural' } }),
      updateGameState: () => {},
      updateUI: () => {},
    });

    await openSettings();

    assert.match(content.innerHTML, /settings-kanji-mode/);
    assert.match(content.innerHTML, /Enable Kanji mode/);
    assert.match(
      content.innerHTML,
      /<input type="checkbox" id="settings-kanji-mode"\s+checked>/
    );
  });

  it('hides Personalized Dialogue when the server does not expose the setting', async () => {
    const content = { innerHTML: '' };
    installSettingsDocument();

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5', aiDataSharingConsent: true }),
        saveApiKeysToServer: async () => true,
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'hiragana' } }),
      updateGameState: () => {},
      updateUI: () => {},
    });

    await openSettings();

    assert.doesNotMatch(content.innerHTML, /settings-ai-conversations/);
    assert.doesNotMatch(content.innerHTML, /Personalized Dialogue/);
  });

  it('renders Personalized Dialogue copy when the server exposes the setting', async () => {
    const content = { innerHTML: '' };
    installSettingsDocument();

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({
          jlptLevel: 'N5',
          aiDataSharingConsent: true,
          aiConversationsEnabled: false,
        }),
        saveApiKeysToServer: async () => true,
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'hiragana' } }),
      updateGameState: () => {},
      updateUI: () => {},
    });

    await openSettings();

    assert.match(content.innerHTML, /settings-ai-conversations/);
    assert.match(content.innerHTML, /Personalized Dialogue/);
    assert.match(
      content.innerHTML,
      /Use known vocabulary to generate personalized dialogue with NPCs/
    );
    assert.match(
      content.innerHTML,
      /<input type="checkbox" id="settings-ai-conversations"\s+/
    );
    assert.doesNotMatch(
      content.innerHTML,
      /<input type="checkbox" id="settings-ai-conversations"[\s\S]*?checked/
    );
  });

  it('does not save hidden Personalized Dialogue settings', async () => {
    const content = { innerHTML: '' };
    const elements = installSettingsDocument();
    let savedKeys = null;

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5', aiDataSharingConsent: true }),
        saveApiKeysToServer: async (keys) => {
          savedKeys = keys;
          return true;
        },
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'hiragana' } }),
      updateGameState: () => {},
      updateUI: () => {},
    });

    await openSettings();
    document.getElementById('settings-jlpt').value = 'N5';
    await elements.get('settings-save-btn').click();

    assert.deepEqual(savedKeys, { jlptLevel: 'N5' });
  });

  it('saves Enable Kanji mode through the per-player game endpoint', async () => {
    const content = { innerHTML: '' };
    const elements = installSettingsDocument();
    let updatedState = null;
    displayModeCalls = [];

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5', aiConversationsEnabled: true, aiDataSharingConsent: true }),
        saveApiKeysToServer: async () => true,
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'hiragana' } }),
      updateGameState: state => { updatedState = state; },
      updateUI: () => {},
    });

    await openSettings();

    elements.get('settings-kanji-mode').checked = true;
    await elements.get('settings-save-btn').click();

    assert.deepEqual(displayModeCalls, ['natural']);
    assert.equal(updatedState.meta.japaneseDisplayMode, 'natural');
  });
});
