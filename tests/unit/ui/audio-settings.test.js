import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const originalAudio = globalThis.Audio;
const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;
const originalWindow = globalThis.window;
const originalCreateObjectURL = globalThis.URL?.createObjectURL;
const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

function installTtsPlaybackMocks() {
  const audioElements = [];
  globalThis.fetch = async () => ({
    ok: true,
    blob: async () => new Blob(['wav'])
  });
  globalThis.URL.createObjectURL = () => 'blob:tts-audio';
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Audio = class {
    constructor(url) {
      this.url = url;
      this.volume = 1;
      audioElements.push(this);
    }

    play() {
      return Promise.resolve();
    }

    pause() {}
  };
  return audioElements;
}

function installTtsWebAudioMocks() {
  const audioElements = installTtsPlaybackMocks();
  const gainNodes = [];
  globalThis.window = {
    AudioContext: class {
      constructor() {
        this.state = 'running';
        this.destination = {};
      }

      resume() {
        return Promise.resolve();
      }

      createMediaElementSource() {
        return { connect: () => {} };
      }

      createGain() {
        const gainNode = { gain: { value: 1 }, connect: () => {} };
        gainNodes.push(gainNode);
        return gainNode;
      }
    }
  };
  return { audioElements, gainNodes };
}

async function importAudio() {
  const settings = await import('../../../public/js/audio-settings.js');
  settings.reloadAudioSettings();
  return import(`../../../public/js/audio.js?test=${Date.now()}-${Math.random()}`);
}

async function importTts() {
  const settings = await import('../../../public/js/audio-settings.js');
  settings.reloadAudioSettings();
  return import(`../../../public/js/tts.js?test=${Date.now()}-${Math.random()}`);
}

async function importAudioSettings() {
  const settings = await import('../../../public/js/audio-settings.js');
  settings.reloadAudioSettings();
  return settings;
}

function installGeneratedAudioContextMock(gainNodes = []) {
  globalThis.window = {
    AudioContext: class {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.destination = {};
      }

      resume() {
        return Promise.resolve();
      }

      createBuffer() {
        return { getChannelData: () => new Float32Array(1) };
      }

      createBufferSource() {
        return { connect: () => {}, start: () => {}, stop: () => {} };
      }

      createBiquadFilter() {
        const param = {
          value: 0,
          setValueAtTime(value) { this.value = value; },
          exponentialRampToValueAtTime(value) { this.value = value; }
        };
        return { type: '', frequency: param, Q: { value: 0 }, connect: () => {} };
      }

      createOscillator() {
        const param = {
          value: 0,
          setValueAtTime(value) { this.value = value; },
          exponentialRampToValueAtTime(value) { this.value = value; }
        };
        return { type: '', frequency: param, connect: () => {}, start: () => {}, stop: () => {} };
      }

      createGain() {
        const gain = {
          value: 1,
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; },
          exponentialRampToValueAtTime(value) { this.value = value; }
        };
        const gainNode = { gain, connect: () => {} };
        gainNodes.push(gainNode);
        return gainNode;
      }
    }
  };
}

describe('audio settings persistence', () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage();
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
    globalThis.fetch = originalFetch;
    globalThis.location = originalLocation;
    globalThis.window = originalWindow;
    if (originalCreateObjectURL) globalThis.URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL) globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
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

  it('restores saved BGM and SFX volume before audio context initialization', async () => {
    globalThis.localStorage = createStorage({
      jrpg_bgmVolume: '0.25',
      jrpg_sfxVolume: '0.15'
    });

    const audio = await importAudio();

    assert.equal(audio.getVolume('bgm'), 0.25);
    assert.equal(audio.getVolume('sfx'), 0.15);
  });

  it('applies output gains without changing stored slider values', async () => {
    const settings = await importAudioSettings();

    assert.equal(settings.getVolume('bgm'), 0.7);
    assert.equal(settings.getEffectiveVolume('bgm'), 0.35);
    assert.equal(settings.getVolume('tts'), 1);
    assert.equal(settings.getEffectiveVolume('tts'), 3);
  });

  it('controls active BGM through a gain node after audio initialization', async () => {
    const gainNodes = [];
    globalThis.fetch = async () => ({ ok: false });
    globalThis.Audio = class {
      constructor() {
        this.loop = false;
        this.volume = 1;
        this.muted = false;
      }

      play() {
        return Promise.resolve();
      }

      pause() {}
    };
    globalThis.window = {
      AudioContext: class {
        constructor() {
          this.state = 'running';
          this.destination = {};
        }

        resume() {
          return Promise.resolve();
        }

        createMediaElementSource() {
          return { connect: () => {} };
        }

        createGain() {
          const gainNode = { gain: { value: 1 }, connect: () => {} };
          gainNodes.push(gainNode);
          return gainNode;
        }
      }
    };

    const audio = await importAudio();
    await audio.initAudio();

    audio.setVolume('bgm', 0.2);

    assert.equal(gainNodes.at(-1)?.gain.value, 0.1);
  });

  it('retries BGM playback when unmuting after a muted load', async () => {
    let playCount = 0;
    globalThis.localStorage = createStorage({ jrpg_audioMuted: 'true' });
    globalThis.location = { href: 'http://localhost/game' };
    globalThis.fetch = async () => ({ ok: false });
    globalThis.Audio = class {
      constructor() {
        this.loop = false;
        this.volume = 1;
        this.muted = false;
        this.src = '';
      }

      play() {
        playCount++;
        return Promise.reject(new Error('autoplay blocked'));
      }

      pause() {}
    };
    globalThis.window = {
      AudioContext: class {
        constructor() {
          this.state = 'running';
          this.destination = {};
        }

        resume() {
          return Promise.resolve();
        }

        createMediaElementSource() {
          return { connect: () => {} };
        }

        createGain() {
          return { gain: { value: 1 }, connect: () => {} };
        }
      }
    };

    const audio = await importAudio();
    audio.playBGM('main');
    await audio.initAudio();

    audio.unmute();

    assert.equal(playCount, 2);
  });

  it('uses saved local TTS volume instead of shared server settings', async () => {
    globalThis.localStorage = createStorage({ jrpg_ttsVolume: '0.35' });
    const tts = await importTts();

    tts.initSettings({ gameTtsEnabled: true, gameTtsVolume: 0.8 });

    assert.equal(tts.getVolume(), 0.35);
  });

  it('updates currently playing TTS with the output gain when volume changes', async () => {
    const audioElements = installTtsPlaybackMocks();

    const tts = await importTts();
    tts.setVolume(1);
    await tts.speakNarration('テスト');

    tts.setVolume(0.2);

    assert.equal(Math.round(audioElements[0].volume * 100), 60);
  });

  it('routes TTS through a gain node so the base output can exceed element volume', async () => {
    const { audioElements, gainNodes } = installTtsWebAudioMocks();

    const tts = await importTts();
    tts.setVolume(1);
    await tts.speakNarration('テスト');

    assert.equal(audioElements[0].volume, 1);
    assert.equal(gainNodes[0].gain.value, 3);
  });

  it('mutes currently playing TTS when shared audio mute changes', async () => {
    const audioElements = installTtsPlaybackMocks();

    const tts = await importTts();
    const audio = await importAudio();
    tts.setVolume(0.7);
    await tts.speakNarration('テスト');

    audio.mute();

    assert.equal(audioElements[0].volume, 0);
  });

  it('plays generated combat audio through the shared SFX volume', async () => {
    const gainNodes = [];
    installGeneratedAudioContextMock(gainNodes);
    const settings = await importAudioSettings();
    settings.setMuted(false);
    settings.setVolume('sfx', 0.4);

    const combatAudio = await import(`../../../public/js/ui/combat-audio.js?test=${Date.now()}-${Math.random()}`);
    combatAudio.playAttackSound('fire');

    assert.equal(gainNodes[0].gain.value, 0.1);
  });

  it('does not create generated combat audio while muted', async () => {
    const gainNodes = [];
    installGeneratedAudioContextMock(gainNodes);
    const settings = await importAudioSettings();
    settings.setMuted(true);

    const combatAudio = await import(`../../../public/js/ui/combat-audio.js?test=${Date.now()}-${Math.random()}`);
    combatAudio.playAttackSound('fire');

    assert.equal(gainNodes.length, 0);
  });

  it('plays raw narration buffers through the shared TTS volume', async () => {
    const audioElements = installTtsPlaybackMocks();
    const tts = await importTts();

    tts.setVolume(0.3);
    const playback = tts.playAudioBuffer(new Uint8Array([1, 2, 3]));

    assert.equal(Math.round(audioElements[0].volume * 100), 90);
    audioElements[0].onended();
    await playback;
  });

  it('does not prefetch word audio while muted', async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return { ok: false };
    };
    const settings = await importAudioSettings();
    settings.setMuted(true);
    const tts = await importTts();

    await tts.prefetchWord('森');

    assert.equal(fetchCount, 0);
  });
});
