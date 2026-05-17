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

await mock.module('../../../public/js/api.js', {
  namedExports: {
    getAuthHeaders: () => ({}),
    apiUrl: path => path,
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
});
