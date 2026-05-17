import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

async function importAudio() {
  return import(`../../../public/js/audio.js?test=${Date.now()}-${Math.random()}`);
}

async function importTts() {
  return import(`../../../public/js/tts.js?test=${Date.now()}-${Math.random()}`);
}

describe('audio settings persistence', () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage();
  });

  it('treats a missing mute preference as unmuted on a fresh load', async () => {
    const audio = await importAudio();

    assert.equal(audio.isMuted(), false);
  });

  it('restores an explicit mute preference on a fresh load', async () => {
    globalThis.localStorage = createStorage({ jrpg_audioMuted: 'true' });

    const audio = await importAudio();

    assert.equal(audio.isMuted(), true);
  });

  it('preserves a zero TTS volume from server settings', async () => {
    const tts = await importTts();

    tts.initSettings({ gameTtsEnabled: true, gameTtsVolume: 0 });

    assert.equal(tts.getVolume(), 0);
  });
});
