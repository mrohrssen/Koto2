import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAttackExposures,
  collectEntityExposure,
  collectTokenExposures,
  syncExposureBatch
} from '../../engine/exposure-sync.js';

describe('simulator exposure sync', () => {
  it('collects exposures from token arrays and entities', () => {
    const words = [];

    collectTokenExposures(words, [
      { surface: '遊ぶ', base: '遊ぶ', pos: '動詞', meaning: 'to play' },
      { surface: '！', base: '！', pos: '記号', meaning: '' }
    ]);
    collectEntityExposure(words, { word: '犬', reading: 'いぬ', nameEn: 'dog' });

    assert.deepEqual(words, [
      { word: '遊ぶ', meaning: 'to play' },
      { word: '犬', meaning: 'dog' }
    ]);
  });

  it('collects attacker words and distinct skill names', () => {
    const words = [];

    collectAttackExposures(words, [
      {
        attackerWord: '迷う',
        attackerReading: 'まよう',
        attackerMeaning: 'get lost / hesitate',
        attackerSkillName: '炎',
        attackerSkillReading: 'ほのお',
        attackerSkillEn: 'flame'
      },
      {
        attackerWord: '水',
        attackerReading: 'みず',
        attackerMeaning: 'water',
        attackerSkillName: '水',
        attackerSkillReading: 'みず',
        attackerSkillEn: 'water'
      }
    ]);

    assert.deepEqual(words, [
      { word: '迷う', meaning: 'get lost / hesitate' },
      { word: '炎', meaning: 'flame' },
      { word: '水', meaning: 'water' }
    ]);
  });

  it('posts one batched exposure payload and skips empty batches', async () => {
    const calls = [];
    const simCall = async (...args) => {
      calls.push(args);
      return { ok: true };
    };

    const first = await syncExposureBatch(simCall, [], 'empty batch');
    const second = await syncExposureBatch(simCall, [{ word: '遊ぶ', meaning: 'to play' }], 'attack exposure');

    assert.deepEqual(first, { ok: true, skipped: true });
    assert.deepEqual(second, { ok: true });
    assert.deepEqual(calls, [[
      'POST',
      '/api/game/known-words/expose',
      { words: [{ word: '遊ぶ', meaning: 'to play' }] },
      'attack exposure'
    ]]);
  });
});
