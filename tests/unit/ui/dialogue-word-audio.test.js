import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const originalLocalStorage = globalThis.localStorage;

globalThis.localStorage = {
  getItem: key => key === 'authToken' ? 'jwt-token' : 'false',
  setItem: () => {},
};

describe('dialogue word audio', () => {
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
});
