import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

const synthCalls = [];

await mock.module('../../../src/voicevox.js', {
  namedExports: {
    isVoicevoxRunning: async () => true,
    getSpeakers: async () => [],
    getVersion: async () => 'test',
    synthesize: async (text, speakerId, options = {}) => {
      synthCalls.push({ text, speakerId, options });
      return Buffer.from(`WAV:${speakerId}:${text}`);
    }
  }
});

const { createApp } = await import('../../../src/app.js');

describe('dialogue word TTS route', () => {
  it('does not bake playback volume into synthesized TTS audio', async () => {
    synthCalls.length = 0;
    const app = createApp({
      routeOverrides: {
        getSettings: () => ({ gameTtsSpeed: 0.8, gameTtsVolume: 0.2 })
      }
    });

    await request(app)
      .post('/api/tts/synthesize')
      .send({ text: '森', speakerId: 46 })
      .expect(200);

    assert.deepEqual(synthCalls, [{
      text: '森',
      speakerId: 46,
      options: { speedScale: 0.8 }
    }]);
  });

  it('requires authentication', async () => {
    const app = createApp({
      routeOverrides: {
        ttsDialogueCache: {
          async synthesizeLine() {
            throw new Error('should not synthesize without auth');
          }
        },
        getSettings: () => ({})
      }
    });

    await request(app)
      .post('/api/tts/dialogue-word')
      .send({ word: '森', speakerId: 46 })
      .expect(401);
  });

  it('rejects missing speaker id before synthesis', async () => {
    let synthesized = false;
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        ttsDialogueCache: {
          async synthesizeLine() {
            synthesized = true;
            return 'abc123def456.wav';
          }
        },
        getSettings: () => ({})
      }
    });

    await request(app)
      .post('/api/tts/dialogue-word')
      .send({ word: '森' })
      .expect(400);

    assert.equal(synthesized, false);
  });

  it('synthesizes a clicked word through the global word audio cache and ignores body userId', async () => {
    synthCalls.length = 0;
    const cacheCalls = [];
    const ttsWordCache = {
      async synthesizeWord(text, speakerId, speedScale, synthesizeFn) {
        cacheCalls.push({ text, speakerId, speedScale });
        await synthesizeFn(text, speakerId, speedScale);
        return { filename: 'abc123def456.wav', cacheHit: false };
      }
    };
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        ttsWordCache,
        getSettings: () => ({ gameTtsSpeed: 0.8, gameTtsVolume: 0.7 })
      }
    });

    const res = await request(app)
      .post('/api/tts/dialogue-word')
      .send({ userId: '../other-user', word: '森', speakerId: 46 })
      .expect(200);

    assert.deepEqual(res.body, {
      ok: true,
      audio: {
        key: 'abc123def456.wav',
        url: '/api/tts/word/abc123def456.wav',
        cacheHit: false
      }
    });
    assert.deepEqual(cacheCalls, [{ text: '森', speakerId: 46, speedScale: 0.8 }]);
    assert.deepEqual(synthCalls, [{
      text: '森',
      speakerId: 46,
      options: { speedScale: 0.8 }
    }]);
  });

  it('synthesizes a clicked dialogue line through the shared dialogue cache', async () => {
    synthCalls.length = 0;
    const cacheCalls = [];
    const ttsDialogueCache = {
      async synthesizeLine(userId, text, speakerId, synthesizeFn) {
        cacheCalls.push({ userId, text, speakerId });
        await synthesizeFn(text, speakerId);
        return 'line12345678.wav';
      }
    };
    const app = createApp({
      authBypass: true,
      routeOverrides: {
        ttsDialogueCache,
        getSettings: () => ({ gameTtsSpeed: 0.8, gameTtsVolume: 0.7 })
      }
    });

    const res = await request(app)
      .post('/api/tts/dialogue-line')
      .send({ userId: '../other-user', text: '待って！', speakerId: 113 })
      .expect(200);

    assert.deepEqual(res.body, {
      ok: true,
      audio: {
        userId: 'test-user',
        key: 'line12345678.wav',
        url: '/api/tts/dialogue/test-user/line12345678.wav',
        speakerId: 113
      }
    });
    assert.deepEqual(cacheCalls, [{ userId: 'test-user', text: '待って！', speakerId: 113 }]);
    assert.deepEqual(synthCalls, [{
      text: '待って！',
      speakerId: 113,
      options: { speedScale: 0.8 }
    }]);
  });

  it('serves global clicked word audio without a user id', async () => {
    const ttsWordCache = {
      lookup(filename) {
        return filename === 'abc123def456.wav' ? Buffer.from('WAV:word') : null;
      }
    };
    const app = createApp({
      routeOverrides: {
        ttsWordCache,
        getSettings: () => ({})
      }
    });

    const res = await request(app)
      .get('/api/tts/word/abc123def456.wav')
      .expect(200);

    assert.equal(res.headers['content-type'], 'audio/wav');
    assert.equal(res.body.toString(), 'WAV:word');
  });
});
