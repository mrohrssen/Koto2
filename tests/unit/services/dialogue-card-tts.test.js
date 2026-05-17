import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDialogueCardWordTtsResolver,
  createDialogueCardTtsResolver,
  getDialogueLineText
} from '../../../src/services/dialogue-card-tts.js';

describe('dialogue-card TTS service', () => {
  it('uses raw frame text before token surfaces', () => {
    const line = {
      raw: '待って！',
      tokens: [
        { surface: '待っ', reading: 'まっ' },
        { surface: 'て' },
        { surface: '！', pos: 'punctuation' }
      ]
    };

    assert.equal(getDialogueLineText(line), '待って！');
  });

  it('derives text from token surfaces when raw is absent', () => {
    const line = {
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな' },
        { surface: 'は' },
        { surface: '森', baseForm: '森', reading: 'もり' },
        { surface: 'で' },
        { surface: '光', baseForm: '光', reading: 'ひかり' },
        { surface: 'を' },
        { surface: '見た', baseForm: '見る', reading: 'みた' },
        { surface: '。', pos: 'punctuation' }
      ]
    };

    assert.equal(getDialogueLineText(line), '花は森で光を見た。');
  });

  it('uses substituted token text instead of template raw with slots', () => {
    const line = {
      raw: '{randomPlayerCreature}、強い！',
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな', entity: true },
        { surface: '、' },
        { surface: '強い', baseForm: '強い', reading: 'つよい' },
        { surface: '！', pos: 'punctuation' }
      ]
    };

    assert.equal(getDialogueLineText(line), '花、強い！');
  });

  it('returns null when required TTS dependencies are missing', async () => {
    const resolveAudio = createDialogueCardTtsResolver({
      ttsDialogueCache: null,
      synthesizeFn: async () => Buffer.from('wav'),
      getSpeakerId: () => 13
    });

    assert.equal(
      await resolveAudio({ userId: 'u1', speakerKey: 'cid', line: { raw: '待って！' } }),
      null
    );
  });

  it('synthesizes line audio with resolved speaker id', async () => {
    const synthCalls = [];
    const cacheCalls = [];
    const ttsDialogueCache = {
      async synthesizeLine(userId, text, speakerId, synthesizeFn) {
        cacheCalls.push({ userId, text, speakerId });
        await synthesizeFn(text, speakerId);
        return 'abc123def456.wav';
      }
    };

    const resolveAudio = createDialogueCardTtsResolver({
      ttsDialogueCache,
      synthesizeFn: async (text, speakerId) => {
        synthCalls.push({ text, speakerId });
        return Buffer.from(`WAV:${speakerId}:${text}`);
      },
      getSpeakerId: ({ speakerKey }) => speakerKey === 'shrine_fox' ? 46 : 13
    });

    const audio = await resolveAudio({
      userId: 'u1',
      speakerKey: 'shrine_fox',
      line: { raw: 'こんにちは！' }
    });

    assert.deepEqual(audio, { userId: 'u1', key: 'abc123def456.wav', speakerId: 46 });
    assert.deepEqual(cacheCalls, [{ userId: 'u1', text: 'こんにちは！', speakerId: 46 }]);
    assert.deepEqual(synthCalls, [{ text: 'こんにちは！', speakerId: 46 }]);
  });

  it('falls back to null when synthesis fails', async () => {
    const warnings = [];
    const resolveAudio = createDialogueCardTtsResolver({
      ttsDialogueCache: {
        async synthesizeLine() {
          throw new Error('VOICEVOX down');
        }
      },
      synthesizeFn: async () => Buffer.from('wav'),
      getSpeakerId: () => 13,
      logger: { warn: message => warnings.push(message) }
    });

    const audio = await resolveAudio({
      userId: 'u1',
      speakerKey: 'cid',
      line: { raw: 'どの能力？' }
    });

    assert.equal(audio, null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Dialogue card TTS failed/);
  });

  it('synthesizes clicked word audio with the dialogue speaker id', async () => {
    const synthCalls = [];
    const cacheCalls = [];
    const ttsDialogueCache = {
      async synthesizeLine(userId, text, speakerId, synthesizeFn) {
        cacheCalls.push({ userId, text, speakerId });
        await synthesizeFn(text, speakerId);
        return 'word12345678.wav';
      }
    };

    const resolveWordAudio = createDialogueCardWordTtsResolver({
      ttsDialogueCache,
      synthesizeFn: async (text, speakerId) => {
        synthCalls.push({ text, speakerId });
        return Buffer.from(`WAV:${speakerId}:${text}`);
      },
      logger: { warn: () => {} }
    });

    const audio = await resolveWordAudio({
      userId: 'u1',
      word: '森',
      speakerId: 46
    });

    assert.deepEqual(audio, { userId: 'u1', key: 'word12345678.wav' });
    assert.deepEqual(cacheCalls, [{ userId: 'u1', text: '森', speakerId: 46 }]);
    assert.deepEqual(synthCalls, [{ text: '森', speakerId: 46 }]);
  });
});
