import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const originalLocalStorage = globalThis.localStorage;

function installAuthStorage() {
  globalThis.localStorage = {
    getItem: key => key === 'authToken' ? 'jwt-token' : 'false',
    setItem: () => {},
  };
}

describe('dialogue word audio', () => {
  beforeEach(() => {
    installAuthStorage();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.Audio = originalAudio;
    globalThis.localStorage = originalLocalStorage;
  });

  it('requests cached dialogue word audio and plays the returned file', async () => {
    const fetchCalls = [];
    const audioUrls = [];
    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({
        url,
        headers: options.headers,
        body: JSON.parse(options.body)
      });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          audio: { key: 'abc123def456.wav', url: '/api/tts/word/abc123def456.wav' }
        })
      };
    };
    globalThis.Audio = class {
      constructor(url) {
        this.url = url;
        audioUrls.push(url);
      }

      play() {
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }

      pause() {}
    };

    const { playDialogueWordAudio } = await import('../../../public/js/tts.js');
    await playDialogueWordAudio({ word: '森', speakerId: 46 });

    assert.deepEqual(fetchCalls, [{
      url: '/api/tts/dialogue-word',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-token'
      },
      body: { word: '森', speakerId: 46 }
    }]);
    assert.deepEqual(audioUrls, ['/api/tts/word/abc123def456.wav']);
  });

  it('requests neutral cached line audio for Learn replay', async () => {
    const fetchCalls = [];
    const audioUrls = [];
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes('/api/tts/dialogue-line')) {
        fetchCalls.push({
          url,
          headers: options.headers,
          body: JSON.parse(options.body)
        });
        return {
          ok: true,
          json: async () => ({
            ok: true,
            audio: {
              userId: 'user-1',
              key: 'line12345678.wav',
              url: '/api/tts/dialogue/user-1/line12345678.wav',
              speakerId: 11
            }
          })
        };
      }
      fetchCalls.push({ url });
      return { ok: true, blob: async () => ({ fakeWav: true }) };
    };
    globalThis.Audio = class {
      constructor(url) {
        this.url = url;
        audioUrls.push(url);
      }

      play() {
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }

      pause() {}
    };
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:learn-line-audio';
    URL.revokeObjectURL = () => {};

    try {
      const {
        NEUTRAL_PRONUNCIATION_SPEAKER_ID,
        playNeutralLearnAudio
      } = await import(`../../../public/js/tts.js?test=${Date.now()}-${Math.random()}`);

      assert.equal(NEUTRAL_PRONUNCIATION_SPEAKER_ID, 11);
      const audio = await playNeutralLearnAudio('森で');

      assert.deepEqual(fetchCalls, [
        {
          url: '/api/tts/dialogue-line',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer jwt-token'
          },
          body: { text: '森で', speakerId: 11 }
        },
        { url: '/api/tts/dialogue/user-1/line12345678.wav' }
      ]);
      assert.deepEqual(audioUrls, ['blob:learn-line-audio']);
      assert.deepEqual(audio, {
        userId: 'user-1',
        key: 'line12345678.wav',
        url: '/api/tts/dialogue/user-1/line12345678.wav',
        speakerId: 11
      });
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
