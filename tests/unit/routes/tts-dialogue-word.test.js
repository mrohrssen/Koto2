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

  it('synthesizes a clicked word through the dialogue audio cache and ignores body userId', async () => {
    synthCalls.length = 0;
    const cacheCalls = [];
    const ttsDialogueCache = {
      async synthesizeLine(userId, text, speakerId, synthesizeFn) {
        cacheCalls.push({ userId, text, speakerId });
        await synthesizeFn(text, speakerId);
        return 'abc123def456.wav';
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
      .post('/api/tts/dialogue-word')
      .send({ userId: '../other-user', word: '森', speakerId: 46 })
      .expect(200);

    assert.deepEqual(res.body, {
      ok: true,
      audio: { userId: 'test-user', key: 'abc123def456.wav' }
    });
    assert.deepEqual(cacheCalls, [{ userId: 'test-user', text: '森', speakerId: 46 }]);
    assert.deepEqual(synthCalls, [{
      text: '森',
      speakerId: 46,
      options: { speedScale: 0.8 }
    }]);
  });
});
